#!/usr/bin/env bash
#/ Usage: scripts/deploy/00-preflight.sh [--infra-only] [--help]
#/
#/   --infra-only   skip the Firebase and .env.production checks (use before scripts/deploy/10-firebase.sh)
#/
#/ Read-only checks before building and deploying. Changes nothing. Prints PASS/FAIL/WARN lines and exits
#/ non-zero if any check FAILs.
#/
#/ Checks: local tools; gcloud login and project; billing; required APIs; media bucket; Firestore database,
#/ composite + vector indexes READY and TTL policies; the neophi-app service account and its roles; both Meta
#/ secrets exist, have an enabled version and are readable by the service account; the Cloud Build identity;
#/ Firebase (API, anonymous sign-in); .env.production has the four VITE_FIREBASE_* keys (names only).
#/
#/ Env: DRY_RUN=1 prints the gcloud commands instead of running them. PROJECT, REGION, BUCKET, SA_EMAIL, ...
#/ override the defaults in scripts/deploy/config.sh.
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"
handle_help "$0" "$@"

INFRA_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --infra-only) INFRA_ONLY=1 ;;
    *) die "unknown argument: $arg (see --help)" ;;
  esac
done

DRY="__DRY__"
dry_skip() { if [ "$1" = "$DRY" ]; then skip "$2 (dry run)"; return 0; fi; return 1; }

step "Local tools"
for tool in git node curl openssl; do
  if command -v "$tool" >/dev/null 2>&1; then pass "$tool installed"; else fail "$tool not installed"; fi
done
if is_dry || command -v gcloud >/dev/null 2>&1; then
  pass "gcloud installed"
else
  fail "gcloud not installed (https://cloud.google.com/sdk/docs/install)"
  summary "Preflight" || exit 1
fi

step "gcloud login and project"
account=$(capture_quiet "$DRY" gcloud auth list --filter=status:ACTIVE --format='value(account)' || true)
if ! dry_skip "$account" "gcloud logged in"; then
  if [ -n "$account" ]; then pass "gcloud logged in as $account"; else fail "gcloud not logged in: run gcloud auth login"; fi
fi
current=$(capture_quiet "$DRY" gcloud config get-value project || true)
if ! dry_skip "$current" "gcloud default project"; then
  if [ "$current" = "$PROJECT" ]; then
    pass "gcloud default project is $PROJECT"
  else
    warn "gcloud default project is '${current:-unset}' (scripts pass --project $PROJECT anyway; to align: gcloud config set project $PROJECT)"
  fi
fi
number=$(capture_quiet "$DRY" gcloud projects describe "$PROJECT" --format='value(projectNumber)' || true)
if ! dry_skip "$number" "project $PROJECT reachable"; then
  if [ -n "$number" ]; then pass "project $PROJECT reachable (number $number)"; else fail "cannot describe project $PROJECT (wrong account or no access)"; fi
fi
billing=$(capture_quiet "$DRY" gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)' || true)
if ! dry_skip "$billing" "billing enabled"; then
  case "$billing" in
    True|true) pass "billing enabled" ;;
    '') warn "could not read billing status (needs billing viewer); check Console > Billing" ;;
    *) fail "billing is not enabled on $PROJECT" ;;
  esac
fi

step "APIs"
enabled=$(capture_quiet "$DRY" gcloud services list --enabled --project "$PROJECT" --format='value(config.name)' || true)
if ! dry_skip "$enabled" "required APIs enabled"; then
  for api in $REQUIRED_APIS; do
    if printf '%s\n' "$enabled" | grep -qx "$api"; then pass "API $api"; else fail "API $api not enabled: gcloud services enable $api --project $PROJECT"; fi
  done
  if printf '%s\n' "$enabled" | grep -qx firebase.googleapis.com; then
    pass "API firebase.googleapis.com"
  else
    warn "API firebase.googleapis.com not enabled yet (scripts/deploy/10-firebase.sh enables it)"
  fi
fi

step "Media bucket"
bucket=$(capture_quiet "$DRY" gcloud storage buckets describe "gs://$BUCKET" --project "$PROJECT" --format=json || true)
if ! dry_skip "$bucket" "bucket gs://$BUCKET"; then
  if [ -z "$bucket" ]; then
    fail "bucket gs://$BUCKET not found or not readable"
  else
    pass "bucket gs://$BUCKET exists"
    ubla=$(printf '%s' "$bucket" | json_eval 'String(j.uniform_bucket_level_access)')
    pap=$(printf '%s' "$bucket" | json_eval 'String(j.public_access_prevention)')
    if [ "$ubla" = "true" ]; then pass "bucket uniform bucket-level access"; else warn "bucket uniform bucket-level access is $ubla"; fi
    if [ "$pap" = "enforced" ]; then pass "bucket public access prevention enforced"; else warn "bucket public access prevention is $pap"; fi
  fi
fi

step "Firestore"
db=$(capture_quiet "$DRY" gcloud firestore databases describe --database='(default)' --project "$PROJECT" --format='value(type,locationId)' || true)
if ! dry_skip "$db" "Firestore (default) database"; then
  case "$db" in
    FIRESTORE_NATIVE*) pass "Firestore (default) database is Native ($(printf '%s' "$db" | awk '{print $2}'))" ;;
    '') fail "Firestore (default) database not found" ;;
    *) fail "Firestore (default) database is '$db' (Native mode required)" ;;
  esac
fi
indexes=$(capture_quiet "$DRY" gcloud firestore indexes composite list --project "$PROJECT" --format=json || true)
if ! dry_skip "$indexes" "Firestore indexes READY"; then
  summary_lines=$(printf '%s' "${indexes:-[]}" | json_eval '(j || []).map((i) => {
      const cg = (i.name.split("/collectionGroups/")[1] || "").split("/")[0];
      const v = (i.fields || []).find((f) => f.vectorConfig);
      const shape = v ? "vector" + v.vectorConfig.dimension + ":" + v.fieldPath
        : (i.fields || []).filter((f) => f.fieldPath !== "__name__").map((f) => f.fieldPath).join(",");
      return cg + " " + i.state + " " + shape;
    }).join("\n")' || true)
  check_index() {
    if printf '%s\n' "$summary_lines" | grep -q "^$1 READY $2\$"; then
      pass "index $1 ($2) READY"
    elif printf '%s\n' "$summary_lines" | grep -q "^$1 [A-Z_]* $2\$"; then
      fail "index $1 ($2) exists but is not READY yet (wait, then rerun)"
    else
      fail "index $1 ($2) missing (see docs/INSTAGRAM_PIPELINE.md, Firestore)"
    fi
  }
  check_index instagramJobs 'status,nextRunAt'
  check_index instagramEvents 'kind,recipientId,senderId,timestampMs'
  check_index memories 'vector768:embedding'
fi
ttls=$(capture_quiet "$DRY" gcloud firestore fields ttls list --project "$PROJECT" --format=json || true)
if ! dry_skip "$ttls" "Firestore TTL policies"; then
  for cg in instagramEvents instagramJobs; do
    state=$(printf '%s' "${ttls:-[]}" | json_eval '((j || []).find((f) => f.name.includes("/collectionGroups/" + a[0] + "/fields/expireAt")) || {ttlConfig: {}}).ttlConfig.state' "$cg" || true)
    if [ "$state" = "ACTIVE" ]; then pass "TTL on $cg.expireAt ACTIVE"; else warn "TTL on $cg.expireAt is '${state:-missing}' (cleanup only; not a blocker)"; fi
  done
fi

step "Service account $SA_EMAIL"
sa=$(capture_quiet "$DRY" gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT" --format='value(email)' || true)
if ! dry_skip "$sa" "service account exists"; then
  if [ "$sa" = "$SA_EMAIL" ]; then pass "service account exists"; else fail "service account $SA_EMAIL not found"; fi
fi
member="serviceAccount:$SA_EMAIL"
project_policy=$(capture_quiet "$DRY" gcloud projects get-iam-policy "$PROJECT" --format=json || true)
if ! dry_skip "$project_policy" "project roles for the service account"; then
  for role in roles/datastore.user roles/aiplatform.user; do
    if printf '%s' "$project_policy" | policy_has_role "$role" "$member"; then pass "$role on project"; else
      fail "$role missing: gcloud projects add-iam-policy-binding $PROJECT --member=$member --role=$role --condition=None"; fi
  done
fi
bucket_policy=$(capture_quiet "$DRY" gcloud storage buckets get-iam-policy "gs://$BUCKET" --project "$PROJECT" --format=json || true)
if ! dry_skip "$bucket_policy" "bucket role for the service account"; then
  if printf '%s' "$bucket_policy" | policy_has_role roles/storage.objectUser "$member" ||
     printf '%s' "$bucket_policy" | policy_has_role roles/storage.objectAdmin "$member"; then
    pass "roles/storage.objectUser on gs://$BUCKET"
  else
    fail "roles/storage.objectUser missing on bucket: gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member=$member --role=roles/storage.objectUser"
  fi
fi
sa_policy=$(capture_quiet "$DRY" gcloud iam service-accounts get-iam-policy "$SA_EMAIL" --project "$PROJECT" --format=json || true)
if ! dry_skip "$sa_policy" "token creator on itself"; then
  if printf '%s' "$sa_policy" | policy_has_role roles/iam.serviceAccountTokenCreator "$member"; then
    pass "roles/iam.serviceAccountTokenCreator on itself (signed media URLs)"
  else
    fail "token creator on itself missing: gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL --project $PROJECT --member=$member --role=roles/iam.serviceAccountTokenCreator"
  fi
fi

step "Secrets (names and access only; values are never read)"
for secret in "$SECRET_APP" "$SECRET_VERIFY"; do
  exists=$(capture_quiet "$DRY" gcloud secrets describe "$secret" --project "$PROJECT" --format='value(name)' || true)
  version=$(capture_quiet "$DRY" gcloud secrets versions list "$secret" --project "$PROJECT" --filter='state:ENABLED' --limit=1 --format='value(name)' || true)
  policy=$(capture_quiet "$DRY" gcloud secrets get-iam-policy "$secret" --project "$PROJECT" --format=json || true)
  if dry_skip "$exists" "secret $secret exists, has an enabled version, is readable by the service account"; then continue; fi
  if [ -z "$exists" ]; then fail "secret $secret not found"; continue; fi
  pass "secret $secret exists"
  if [ -n "$version" ]; then pass "secret $secret has an enabled version"; else fail "secret $secret has no enabled version (add one in the console)"; fi
  if printf '%s' "$policy" | policy_has_role roles/secretmanager.secretAccessor "$member" ||
     printf '%s' "$project_policy" | policy_has_role roles/secretmanager.secretAccessor "$member"; then
    pass "service account can access $secret"
  else
    fail "secretAccessor missing: gcloud secrets add-iam-policy-binding $secret --project $PROJECT --member=$member --role=roles/secretmanager.secretAccessor"
  fi
done

step "Cloud Build identity"
build_sa=$(capture_quiet "$DRY" gcloud builds get-default-service-account --project "$PROJECT" --format='value(serviceAccountEmail)' || true)
if ! dry_skip "$build_sa" "Cloud Build service account roles"; then
  build_sa=${build_sa##*/}
  if [ -z "$build_sa" ]; then
    warn "could not read the Cloud Build default service account (20-build.sh checks again)"
  elif printf '%s' "$project_policy" | policy_has_role roles/cloudbuild.builds.builder "serviceAccount:$build_sa" ||
       printf '%s' "$project_policy" | policy_has_role roles/editor "serviceAccount:$build_sa"; then
    pass "Cloud Build runs as $build_sa with build permissions"
  else
    warn "Cloud Build runs as $build_sa without roles/cloudbuild.builds.builder (20-build.sh grants it)"
  fi
fi

if [ "$INFRA_ONLY" = "1" ]; then
  skip "Firebase and .env.production checks (--infra-only)"
else
step "Firebase"
cfg=$(google_api GET "https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJECT/config" || true)
split_status "$cfg"
if is_dry; then
  skip "anonymous sign-in enabled (dry run)"
elif [ "$HTTP_CODE" = "200" ]; then
  anon=$(printf '%s' "$HTTP_BODY" | json_eval 'String(Boolean(j && j.signIn && j.signIn.anonymous && j.signIn.anonymous.enabled))' || true)
  if [ "$anon" = "true" ]; then pass "anonymous sign-in enabled"; else fail "anonymous sign-in is off (docs/DEPLOY.md step 2)"; fi
else
  fail "Firebase Authentication not set up yet (HTTP ${HTTP_CODE:-none}); run scripts/deploy/10-firebase.sh"
fi

step ".env.production (key names only)"
if [ -f "$ENV_PRODUCTION_FILE" ]; then
  pass "$(basename "$ENV_PRODUCTION_FILE") present"
  if env_file_untracked "$ENV_PRODUCTION_FILE"; then pass ".env.production is gitignored"; else fail ".env.production is NOT gitignored"; fi
  unset VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_APP_ID
  load_vite_env "$ENV_PRODUCTION_FILE"
  missing=$(missing_vite_keys)
  for k in $VITE_KEYS; do
    case " $missing " in
      *" $k "*) fail "$k missing or empty" ;;
      *) pass "$k set" ;;
    esac
  done
  if [ -n "${VITE_FIREBASE_PROJECT_ID:-}" ] && [ "$VITE_FIREBASE_PROJECT_ID" != "$PROJECT" ]; then
    fail "VITE_FIREBASE_PROJECT_ID does not match $PROJECT"
  fi
else
  fail "$ENV_PRODUCTION_FILE missing (scripts/deploy/10-firebase.sh writes it, or copy the web config by hand)"
fi
fi

step "Source tree"
sha=$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD 2>/dev/null || true)
if [ -n "$sha" ]; then pass "git commit $sha"; else fail "not a git checkout"; fi
if [ -n "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null)" ]; then
  warn "uncommitted changes: 20-build.sh refuses a dirty tree unless ALLOW_DIRTY=1"
fi

summary "Preflight"
