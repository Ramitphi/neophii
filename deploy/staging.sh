#!/usr/bin/env bash
# Staging for the Instagram DM pipeline on Cloud Run, following docs/HANDOVER.md gates 2-5.
# Run from the repo root on a machine where gcloud is signed in to the owner's account:
#
#   deploy/staging.sh check          read-only: project, APIs, bucket, indexes, accounts, secrets (format only), models
#   deploy/staging.sh setup          create the worker and scheduler accounts, their roles, build roles, and the image repository
#   deploy/staging.sh build          build the image with Cloud Build (Firebase web config from .env.production)
#   deploy/staging.sh deploy         deploy the public service and the private worker
#   deploy/staging.sh scheduler      create the Scheduler job (OIDC audience = worker URL, no path) and run it once
#   deploy/staging.sh vertex-smoke   synthetic MP4 through Vertex with the worker identity (inline and gs://)
#   deploy/staging.sh accept         tools/staging-acceptance.mjs against the deployed services
#   deploy/staging.sh firebase-check read-only: Firebase and Identity Toolkit APIs on? project added to Firebase?
#   deploy/staging.sh web-app        create the Firebase web app "neophi-web" (if none), then run web-config
#   deploy/staging.sh web-config     read-only: write the Firebase web app config to .env.production (values not printed)
#   deploy/staging.sh auth-check     read-only: Anonymous sign-in on?, public host in authorized domains?
#   deploy/staging.sh auth-setup     turn on Anonymous sign-in and add the public host to authorized domains
#   deploy/staging.sh legal          read-only: /privacy, /terms, /data-deletion on the public host (status and own title)
#   deploy/staging.sh firestore      read-only: composite indexes and TTL policies
#   deploy/staging.sh ttl-linkcodes  turn on TTL for instagramLinkCodes.expireAt
#   deploy/staging.sh journey        tools/cloud-journey.mjs against the public service (whole journey, no Meta)
#   deploy/staging.sh status         counts-only worker status (needs token-creator on the scheduler account)
#   deploy/staging.sh pair-find      gate 5: log ONE denied sender's scoped ID (prints it on this terminal only)
#   deploy/staging.sh pair-set       gate 5: prompt (hidden) for the scoped ID and Firebase UID, set the map, logging back off
#   deploy/staging.sh rollback       remove what setup/deploy/scheduler created (keeps Firestore, bucket, secrets)
#
# Secret values are never printed, written to a file or put on a command line: they go from Secret Manager into
# the environment of one process. Filled env files are written under deploy/ and are gitignored.
set -euo pipefail

PROJECT="${PROJECT:-neophi-515314}"
REGION="${REGION:-asia-south1}"
BUCKET="${BUCKET:-neophi-515314-neophi-media}"
AR_REPO="${AR_REPO:-neophi}"
PUBLIC_SERVICE="${PUBLIC_SERVICE:-neophi}"
WORKER_SERVICE="${WORKER_SERVICE:-neophi-worker}"
SCHED_JOB="${SCHED_JOB:-neophi-instagram-worker}"
SMOKE_JOB="${SMOKE_JOB:-neophi-vertex-smoke}"
# The public service runs as the account created in setup item 1; it has exactly the roles the runbook lists for neophi-web.
WEB_SA="${WEB_SA:-neophi-app@${PROJECT}.iam.gserviceaccount.com}"
WORKER_SA="${WORKER_SA:-neophi-worker@${PROJECT}.iam.gserviceaccount.com}"
SCHED_SA="${SCHED_SA:-neophi-scheduler@${PROJECT}.iam.gserviceaccount.com}"
# Cloud Build runs as the project's default compute account; setup gives it only the three roles a build needs
# (new projects give it none). Set BUILD_SA to use another existing account instead.
BUILD_SA="${BUILD_SA:-}"
BUILD_BUCKET="${BUILD_BUCKET:-${PROJECT}_cloudbuild}"
SECRET_APP="${SECRET_APP:-neophi-meta-app-secret}"
SECRET_VERIFY="${SECRET_VERIFY:-neophi-meta-verify-token}"
ANALYSIS_MODEL="${ANALYSIS_MODEL:-gemini-3.8-flash}"
EMBEDDING_MODEL="${EMBEDDING_MODEL:-gemini-embedding-2}"
GOOGLE_CLOUD_LOCATION="${GOOGLE_CLOUD_LOCATION:-global}"
META_IG_RECIPIENT_ID="${META_IG_RECIPIENT_ID:-17841449458840084}"
INSTAGRAM_HANDLE="${INSTAGRAM_HANDLE:-yuck.pov}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
G=(gcloud --project "$PROJECT" --quiet)
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; FAILED=1; }
warn() { printf 'WARN  %s\n' "$*"; }
FAILED=0

build_sa() {
  [ -n "$BUILD_SA" ] && { echo "$BUILD_SA"; return; }
  echo "$("${G[@]}" projects describe "$PROJECT" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
}
sha() { git rev-parse --short=12 HEAD; }
image() { echo "${REGION}-docker.pkg.dev/${PROJECT}/${AR_REPO}/neophi:$(sha)"; }
service_url() { "${G[@]}" run services describe "$1" --region "$REGION" --format='value(status.url)' 2>/dev/null || true; }
latest_version() { "${G[@]}" secrets versions list "$1" --filter='state:enabled' --sort-by='~createTime' --limit=1 --format='value(name.basename())'; }

read_env_production() {
  # Prints KEY=VALUE for the four public Firebase web settings. Values are public config, not secrets.
  local f="$ROOT/.env.production"
  [ -f "$f" ] || return 1
  grep -E '^VITE_FIREBASE_(API_KEY|AUTH_DOMAIN|PROJECT_ID|APP_ID)=' "$f" | sed 's/\r$//'
}

write_env_files() {
  local worker_url="${1:-https://PENDING_WORKER_URL}"
  cat > deploy/public-env.yaml <<EOF
GOOGLE_CLOUD_PROJECT: "$PROJECT"
GOOGLE_CLOUD_LOCATION: "$GOOGLE_CLOUD_LOCATION"
MEDIA_BUCKET: "$BUCKET"
ANALYSIS_MODEL: "$ANALYSIS_MODEL"
EMBEDDING_MODEL: "$EMBEDDING_MODEL"
META_IG_RECIPIENT_ID: "$META_IG_RECIPIENT_ID"
INSTAGRAM_HANDLE: "$INSTAGRAM_HANDLE"
INSTAGRAM_SENDER_UID_MAP: ""
INSTAGRAM_LOG_DENIED_SENDERS: "0"
EOF
  cat > deploy/worker-env.yaml <<EOF
GOOGLE_CLOUD_PROJECT: "$PROJECT"
GOOGLE_CLOUD_LOCATION: "$GOOGLE_CLOUD_LOCATION"
MEDIA_BUCKET: "$BUCKET"
ANALYSIS_MODEL: "$ANALYSIS_MODEL"
EMBEDDING_MODEL: "$EMBEDDING_MODEL"
INSTAGRAM_WORKER_OIDC_AUDIENCE: "$worker_url"
INSTAGRAM_WORKER_SERVICE_ACCOUNT: "$SCHED_SA"
META_GRAPH_HOST: "graph.instagram.com"
META_GRAPH_VERSION: "v27.0"
INSTAGRAM_MAX_MEDIA_BYTES: "52428800"
EOF
}

cmd_check() {
  local acct; acct="$(gcloud config get-value account 2>/dev/null || true)"
  [ -n "$acct" ] && pass "gcloud is signed in" || fail "gcloud is not signed in: run gcloud auth login"
  "${G[@]}" projects describe "$PROJECT" --format='value(projectId)' >/dev/null 2>&1 && pass "project $PROJECT reachable" || fail "project $PROJECT not reachable"
  [ "$("${G[@]}" billing projects describe "$PROJECT" --format='value(billingEnabled)' 2>/dev/null)" = "True" ] && pass "billing enabled" || fail "billing not enabled (or no permission to read it)"
  local enabled; enabled="$("${G[@]}" services list --enabled --format='value(config.name)' 2>/dev/null)"
  for api in run cloudbuild artifactregistry firestore storage secretmanager aiplatform cloudscheduler iamcredentials; do
    echo "$enabled" | grep -q "^${api}.googleapis.com$" && pass "API $api" || fail "API $api not enabled: gcloud services enable ${api}.googleapis.com --project $PROJECT"
  done
  "${G[@]}" storage buckets describe "gs://$BUCKET" --format='value(name)' >/dev/null 2>&1 && pass "bucket exists" || fail "bucket gs://$BUCKET missing"
  local total ready
  total="$("${G[@]}" firestore indexes composite list --format='value(state)' 2>/dev/null | grep -c . || true)"
  ready="$("${G[@]}" firestore indexes composite list --format='value(state)' 2>/dev/null | grep -c '^READY$' || true)"
  if [ "${total:-0}" -ge 3 ] && [ "$ready" = "$total" ]; then pass "Firestore indexes: $ready of $total READY"; else fail "Firestore indexes: $ready of $total READY (expect 3)"; fi
  for sa in "$WEB_SA" "$WORKER_SA" "$SCHED_SA"; do
    "${G[@]}" iam service-accounts describe "$sa" --format='value(email)' >/dev/null 2>&1 && pass "account ${sa%%@*} exists" || warn "account ${sa%%@*} missing (setup creates it)"
  done
  # Secret format checks: the value is read into a pipe and only PASS/FAIL is printed.
  if "${G[@]}" secrets versions access latest --secret="$SECRET_APP" 2>/dev/null | tr -d '\r\n' | grep -Eq '^[0-9a-f]{32}$'; then
    pass "$SECRET_APP latest (v$(latest_version "$SECRET_APP")) is 32 hex characters"
  else
    fail "$SECRET_APP latest is not 32 hex characters (NeoPhi's App secret, not the test app's, not a token)"
  fi
  local vlen; vlen="$("${G[@]}" secrets versions access latest --secret="$SECRET_VERIFY" 2>/dev/null | tr -d '\r\n' | wc -c | tr -d ' ')"
  [ "${vlen:-0}" -ge 16 ] && pass "$SECRET_VERIFY latest (v$(latest_version "$SECRET_VERIFY")) has ${vlen} characters" || fail "$SECRET_VERIFY missing or shorter than 16 characters"
  if read_env_production >/dev/null 2>&1 && [ "$(read_env_production | grep -c '=.\+')" = "4" ]; then
    pass ".env.production has the four Firebase web settings"
  else
    warn ".env.production missing or incomplete: the site's sign-in (and tester pairing) needs it before build"
  fi
  # Model reachability with the signed-in user's ADC (prints model name, ok/HTTP status only).
  GOOGLE_CLOUD_PROJECT="$PROJECT" GOOGLE_CLOUD_LOCATION="$GOOGLE_CLOUD_LOCATION" ANALYSIS_MODEL="$ANALYSIS_MODEL" EMBEDDING_MODEL="$EMBEDDING_MODEL" \
    node --input-type=module -e '
      import { GoogleGenAI } from "@google/genai";
      const ai = new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: process.env.GOOGLE_CLOUD_LOCATION });
      const say = (ok, what, err) => console.log(`${ok ? "PASS" : "FAIL"}  ${what}${err ? ` (http ${err.status ?? "?"})` : ""}`);
      try { const r = await ai.models.generateContent({ model: process.env.ANALYSIS_MODEL, contents: "Reply with OK." }); say(Boolean(r.text), `analysis model ${process.env.ANALYSIS_MODEL} answers`); }
      catch (e) { say(false, `analysis model ${process.env.ANALYSIS_MODEL} answers`, e); }
      try { const r = await ai.models.embedContent({ model: process.env.EMBEDDING_MODEL, contents: "test", config: { outputDimensionality: 768 } });
            const n = r.embeddings?.[0]?.values?.length ?? 0; say(n === 768, `embedding model ${process.env.EMBEDDING_MODEL} returns 768 values (got ${n})`); }
      catch (e) { say(false, `embedding model ${process.env.EMBEDDING_MODEL} returns 768 values`, e); }
    ' || true
  [ "$FAILED" = 0 ] || { echo "Some checks failed."; exit 1; }
}

cmd_setup() {
  local pn; pn="$("${G[@]}" projects describe "$PROJECT" --format='value(projectNumber)')"
  "${G[@]}" services enable iamcredentials.googleapis.com
  "${G[@]}" iam service-accounts describe "$WORKER_SA" >/dev/null 2>&1 || "${G[@]}" iam service-accounts create neophi-worker --display-name="Neophi worker"
  "${G[@]}" iam service-accounts describe "$SCHED_SA" >/dev/null 2>&1 || "${G[@]}" iam service-accounts create neophi-scheduler --display-name="Neophi scheduler"
  for role in roles/datastore.user roles/aiplatform.user; do
    "${G[@]}" projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$WORKER_SA" --role="$role" --condition=None >/dev/null
  done
  "${G[@]}" storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$WORKER_SA" --role=roles/storage.objectUser >/dev/null
  # Vertex reads gs:// video through its service agent.
  "${G[@]}" beta services identity create --service=aiplatform.googleapis.com >/dev/null 2>&1 || true
  "${G[@]}" storage buckets add-iam-policy-binding "gs://$BUCKET" \
    --member="serviceAccount:service-${pn}@gcp-sa-aiplatform.iam.gserviceaccount.com" --role=roles/storage.objectViewer >/dev/null
  "${G[@]}" artifacts repositories describe "$AR_REPO" --location "$REGION" >/dev/null 2>&1 || \
    "${G[@]}" artifacts repositories create "$AR_REPO" --repository-format=docker --location "$REGION" --description="Neophi images"
  # Build account (existing, not created here): read the uploaded source, push to the image repository, write build logs.
  local bsa; bsa="$(build_sa)"
  "${G[@]}" storage buckets describe "gs://$BUILD_BUCKET" >/dev/null 2>&1 || "${G[@]}" storage buckets create "gs://$BUILD_BUCKET" --location="$REGION" --uniform-bucket-level-access
  "${G[@]}" storage buckets add-iam-policy-binding "gs://$BUILD_BUCKET" --member="serviceAccount:$bsa" --role=roles/storage.objectViewer >/dev/null
  "${G[@]}" artifacts repositories add-iam-policy-binding "$AR_REPO" --location "$REGION" --member="serviceAccount:$bsa" --role=roles/artifactregistry.writer >/dev/null
  "${G[@]}" projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$bsa" --role=roles/logging.logWriter --condition=None >/dev/null
  echo "setup done: accounts, roles, Vertex agent bucket read, image repository, build roles for ${bsa%%@*}"
}

cmd_build() {
  [ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "Commit or stash tracked changes first (the image is tagged with the commit)."; exit 1; }
  local subs line
  subs="_IMAGE=$(image)"
  if read_env_production >/dev/null 2>&1; then
    while IFS= read -r line; do subs="${subs},_${line%%=*}=${line#*=}"; done < <(read_env_production)
  else
    echo "WARN  .env.production missing: building without Firebase web config (sign-in will not work)."
  fi
  "${G[@]}" builds submit --region "$REGION" --config deploy/cloudbuild.yaml --substitutions "$subs" \
    --service-account "projects/${PROJECT}/serviceAccounts/$(build_sa)" --gcs-source-staging-dir "gs://${BUILD_BUCKET}/source" .
  echo "image: $(image)"
}

cmd_deploy() {
  local img="${IMAGE:-$(image)}" va vv
  echo "Serving revisions before this deploy (for rollback with update-traffic):"
  for svc in "$PUBLIC_SERVICE" "$WORKER_SERVICE"; do
    echo "  $svc: $("${G[@]}" run services describe "$svc" --region "$REGION" --format='value(status.traffic[0].revisionName)' 2>/dev/null)"
  done
  va="$(latest_version "$SECRET_APP")"; vv="$(latest_version "$SECRET_VERIFY")"
  write_env_files "$(service_url "$WORKER_SERVICE")"
  "${G[@]}" run deploy "$WORKER_SERVICE" --region "$REGION" --image "$img" --service-account "$WORKER_SA" \
    --no-allow-unauthenticated --timeout 900 --env-vars-file deploy/worker-env.yaml
  local wurl; wurl="$(service_url "$WORKER_SERVICE")"
  write_env_files "$wurl"
  "${G[@]}" run services update "$WORKER_SERVICE" --region "$REGION" --env-vars-file deploy/worker-env.yaml >/dev/null
  "${G[@]}" run deploy "$PUBLIC_SERVICE" --region "$REGION" --image "$img" --service-account "$WEB_SA" \
    --allow-unauthenticated --env-vars-file deploy/public-env.yaml \
    --set-secrets "META_APP_SECRET=${SECRET_APP}:${va},META_VERIFY_TOKEN=${SECRET_VERIFY}:${vv}"
  echo "public: $(service_url "$PUBLIC_SERVICE")"
  echo "worker: $wurl  (OIDC audience set to this URL, no path)"
}

cmd_scheduler() {
  local wurl; wurl="$(service_url "$WORKER_SERVICE")"
  [ -n "$wurl" ] || { echo "Deploy the worker first."; exit 1; }
  "${G[@]}" run services add-iam-policy-binding "$WORKER_SERVICE" --region "$REGION" \
    --member="serviceAccount:$SCHED_SA" --role=roles/run.invoker >/dev/null
  if "${G[@]}" scheduler jobs describe "$SCHED_JOB" --location "$REGION" >/dev/null 2>&1; then
    "${G[@]}" scheduler jobs update http "$SCHED_JOB" --location "$REGION" --schedule='* * * * *' --http-method=POST \
      --uri="$wurl/internal/instagram/worker/run" --oidc-service-account-email="$SCHED_SA" --oidc-token-audience="$wurl" --attempt-deadline=300s
  else
    "${G[@]}" scheduler jobs create http "$SCHED_JOB" --location "$REGION" --schedule='* * * * *' --http-method=POST \
      --uri="$wurl/internal/instagram/worker/run" --oidc-service-account-email="$SCHED_SA" --oidc-token-audience="$wurl" --attempt-deadline=300s
  fi
  "${G[@]}" scheduler jobs run "$SCHED_JOB" --location "$REGION"
  sleep "${SCHED_WAIT:-20}"
  echo "Last worker runs (counts only):"
  "${G[@]}" logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$WORKER_SERVICE AND jsonPayload.event=instagram_worker_run" \
    --freshness=10m --limit=3 --format='value(timestamp,jsonPayload.leased,jsonPayload.done,jsonPayload.retried,jsonPayload.dead)'
  echo "Scheduler request statuses (last 10 min):"
  "${G[@]}" logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$WORKER_SERVICE AND httpRequest.requestUrl:\"/internal/instagram/worker/run\"" \
    --freshness=10m --limit=5 --format='value(timestamp,httpRequest.status)'
}

cmd_vertex_smoke() {
  local img="${IMAGE:-$(image)}" obj="gs://$BUCKET/smoke/neophi-sample.mp4"
  "${G[@]}" storage cp tests/fixtures/neophi-sample.mp4 "$obj"
  write_env_files "$(service_url "$WORKER_SERVICE")"
  "${G[@]}" run jobs deploy "$SMOKE_JOB" --region "$REGION" --image "$img" --service-account "$WORKER_SA" \
    --env-vars-file deploy/worker-env.yaml --command node --args "tools/vertex-video-smoke.mjs,$obj" --max-retries 0 --task-timeout 300
  local since; since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  "${G[@]}" run jobs execute "$SMOKE_JOB" --region "$REGION" --wait || true
  sleep 10
  echo "Vertex smoke results:"
  "${G[@]}" logging read "resource.type=cloud_run_job AND resource.labels.job_name=$SMOKE_JOB AND timestamp>=\"$since\" AND (jsonPayload.provider=vertex OR textPayload:\"vertex\")" \
    --freshness=15m --limit=4 --format='value(jsonPayload.mode,jsonPayload.replied,jsonPayload.mime,jsonPayload.bytes,jsonPayload.http,jsonPayload.reason,textPayload)'
  if [ "${KEEP:-0}" != 1 ]; then
    "${G[@]}" run jobs delete "$SMOKE_JOB" --region "$REGION"
    "${G[@]}" storage rm "$obj"
  fi
}

cmd_accept() {
  local purl wurl; purl="$(service_url "$PUBLIC_SERVICE")"; wurl="$(service_url "$WORKER_SERVICE")"
  META_APP_SECRET="$("${G[@]}" secrets versions access latest --secret="$SECRET_APP")" \
  META_VERIFY_TOKEN="$("${G[@]}" secrets versions access latest --secret="$SECRET_VERIFY")" \
  META_IG_RECIPIENT_ID="$META_IG_RECIPIENT_ID" \
    node tools/staging-acceptance.mjs --public "$purl" --worker "$wurl"
}

token() { gcloud auth print-access-token; }
api_ok() { node -e 'const j=JSON.parse(process.argv[1]||"{}");if(j.error){console.log("FAIL  "+process.argv[2]+": "+j.error.status+" "+(j.error.message||""));process.exit(1)}' "$1" "$2"; }
gapi() {
  # gapi METHOD URL [JSON]: Google API call with the signed-in account, billed to the project.
  local m="$1" u="$2" d="${3:-}"
  if [ -n "$d" ]; then
    curl -sS -X "$m" "$u" -H "Authorization: Bearer $(token)" -H "x-goog-user-project: $PROJECT" -H 'Content-Type: application/json' -d "$d"
  else
    curl -sS -X "$m" "$u" -H "Authorization: Bearer $(token)" -H "x-goog-user-project: $PROJECT"
  fi
}

cmd_web_config() {
  local apps app cfg
  apps="$(gapi GET "https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/webApps")"
  api_ok "$apps" "list Firebase web apps" || exit 1
  app="$(node -e 'const j=JSON.parse(process.argv[1]||"{}");const a=(j.apps||[]).filter(x=>x.state!=="DELETED");console.log(a.length?a[0].appId:"")' "$apps")"
  [ -n "$app" ] || { echo "FAIL  no Firebase web app in $PROJECT (create one: firebase apps:create WEB neophi-web --project $PROJECT)"; exit 1; }
  cfg="$(gapi GET "https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/webApps/${app}/config")"
  node -e '
    const c = JSON.parse(process.argv[1]);
    const v = { VITE_FIREBASE_API_KEY: c.apiKey, VITE_FIREBASE_AUTH_DOMAIN: c.authDomain, VITE_FIREBASE_PROJECT_ID: c.projectId, VITE_FIREBASE_APP_ID: c.appId };
    const missing = Object.entries(v).filter(([, x]) => !x).map(([k]) => k);
    if (missing.length) { console.log("FAIL  config is missing " + missing.join(", ")); process.exit(1); }
    require("fs").writeFileSync(process.argv[2], Object.entries(v).map(([k, x]) => k + "=" + x).join("\n") + "\n");
    console.log("PASS  .env.production written with 4 values (projectId " + c.projectId + ", not printed otherwise)");
  ' "$cfg" "$ROOT/.env.production"
}

cmd_firebase_check() {
  local a p
  for a in firebase.googleapis.com identitytoolkit.googleapis.com; do
    if "${G[@]}" services list --enabled --filter="config.name=$a" --format='value(config.name)' | grep -q .; then pass "API $a on"; else fail "API $a off"; fi
  done
  p="$(gapi GET "https://firebase.googleapis.com/v1beta1/projects/${PROJECT}")"
  if api_ok "$p" "project added to Firebase"; then pass "project $PROJECT is a Firebase project"; fi
}

cmd_web_app() {
  local apps n op name i
  apps="$(gapi GET "https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/webApps")"
  api_ok "$apps" "list Firebase web apps (is ${PROJECT} added to Firebase?)"
  n="$(node -e 'const j=JSON.parse(process.argv[1]);console.log((j.apps||[]).filter(x=>x.state!=="DELETED").length)' "$apps")"
  if [ "$n" = 0 ]; then
    op="$(gapi POST "https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/webApps" '{"displayName":"neophi-web"}')"
    api_ok "$op" "create web app"
    name="$(node -e 'console.log(JSON.parse(process.argv[1]).name||"")' "$op")"
    for i in $(seq 1 30); do
      op="$(gapi GET "https://firebase.googleapis.com/v1beta1/${name}")"
      [ "$(node -e 'console.log(!!JSON.parse(process.argv[1]).done)' "$op")" = true ] && break
      sleep 2
    done
    api_ok "$op" "create web app"
    echo "PASS  Firebase web app neophi-web created"
  else
    echo "INFO  $n Firebase web app(s) already exist; not creating another"
  fi
  cmd_web_config
}

cmd_auth_check() {
  local purl host cfg; purl="$(service_url "$PUBLIC_SERVICE")"; host="${purl#https://}"
  cfg="$(gapi GET "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config")"
  node -e '
    const c = JSON.parse(process.argv[1]); const hosts = process.argv.slice(2).filter(Boolean);
    if (c.error) { console.log("FAIL  auth config: " + c.error.status + " " + (c.error.message || "")); process.exit(1); }
    const anon = !!(c.signIn && c.signIn.anonymous && c.signIn.anonymous.enabled);
    console.log((anon ? "PASS" : "FAIL") + "  Anonymous sign-in " + (anon ? "on" : "off"));
    const d = c.authorizedDomains || [];
    for (const h of hosts) console.log((d.includes(h) ? "PASS" : "FAIL") + "  authorized domain " + h);
    console.log("INFO  authorized domains: " + d.length);
  ' "$cfg" "$host" "${PUBLIC_HOST_ALIAS:-${PUBLIC_SERVICE}-$("${G[@]}" projects describe "$PROJECT" --format='value(projectNumber)').${REGION}.run.app}"
}

cmd_auth_setup() {
  local purl host alias cfg domains; purl="$(service_url "$PUBLIC_SERVICE")"; host="${purl#https://}"
  alias="${PUBLIC_SERVICE}-$("${G[@]}" projects describe "$PROJECT" --format='value(projectNumber)').${REGION}.run.app"
  api_ok "$(gapi PATCH "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config?updateMask=signIn.anonymous.enabled" \
    '{"signIn":{"anonymous":{"enabled":true}}}')" "turn on Anonymous sign-in"
  cfg="$(gapi GET "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config")"
  domains="$(node -e 'const c=JSON.parse(process.argv[1]);const d=new Set(c.authorizedDomains||[]);for(const h of process.argv.slice(2))d.add(h);console.log(JSON.stringify({authorizedDomains:[...d]}))' "$cfg" "$host" "$alias")"
  api_ok "$(gapi PATCH "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config?updateMask=authorizedDomains" "$domains")" "authorized domains"
  cmd_auth_check
}

cmd_legal() {
  local purl; purl="$(service_url "$PUBLIC_SERVICE")"
  node -e '
    const base = process.argv[1]; let bad = 0;
    (async () => {
      for (const p of ["/privacy", "/terms", "/data-deletion"]) {
        const r = await fetch(base + p, { redirect: "manual" });
        const html = await r.text();
        const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || "";
        const ok = r.status === 200 && title && !/Remember why you saved it/.test(title) && html.length > 2000;
        if (!ok) bad++;
        console.log((ok ? "PASS" : "FAIL") + "  " + base + p + "  " + r.status + "  title: " + title + "  bytes: " + html.length);
      }
      const shell = await fetch(base + "/no-such-page-check");
      console.log("INFO  unknown path answers " + shell.status + " (app shell)");
      process.exit(bad ? 1 : 0);
    })();
  ' "$purl"
}

cmd_firestore() {
  echo "Composite and vector indexes:"
  "${G[@]}" firestore indexes composite list --format='value(name.segment(-3),state)'
  echo "TTL policies:"
  "${G[@]}" firestore fields ttls list --format='value(name.segment(-3),name.segment(-1),ttlConfig.state)'
}

cmd_ttl_linkcodes() {
  "${G[@]}" firestore fields ttls update expireAt --collection-group=instagramLinkCodes --enable-ttl
}

cmd_journey() {
  local purl key; purl="$(service_url "$PUBLIC_SERVICE")"
  key="$(read_env_production | sed -n 's/^VITE_FIREBASE_API_KEY=//p')"
  [ -n "$key" ] || { echo "Run deploy/staging.sh web-config first (.env.production has no API key)."; exit 1; }
  META_APP_SECRET="$("${G[@]}" secrets versions access latest --secret="$SECRET_APP")" \
  META_IG_RECIPIENT_ID="$META_IG_RECIPIENT_ID" \
    node tools/cloud-journey.mjs --public "$purl" --api-key "$key" ${WAIT_SECONDS:+--wait-seconds "$WAIT_SECONDS"}
}

cmd_status() {
  local wurl; wurl="$(service_url "$WORKER_SERVICE")"
  WORKER_ID_TOKEN="$(gcloud auth print-identity-token --impersonate-service-account="$SCHED_SA" --audiences="$wurl" --include-email 2>/dev/null)" \
    node -e 'fetch(process.argv[1] + "/internal/instagram/status", { headers: { authorization: "Bearer " + process.env.WORKER_ID_TOKEN } })
      .then(async (r) => console.log(r.status, r.ok ? JSON.stringify(await r.json()) : ""))' "$wurl"
}

cmd_pair_find() {
  "${G[@]}" run services update "$PUBLIC_SERVICE" --region "$REGION" --update-env-vars INSTAGRAM_LOG_DENIED_SENDERS=1 >/dev/null
  echo "Logging of denied senders is ON. Ask the tester to send ONE DM to the connected account, then press Enter."
  read -r _
  sleep 15
  echo "Denied sender scoped IDs seen in the last 15 minutes (keep this off chat, files and PRs):"
  "${G[@]}" logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$PUBLIC_SERVICE AND jsonPayload.event=instagram_sender_not_paired" \
    --freshness=15m --limit=5 --format='value(jsonPayload.senderId)' | sort -u
  "${G[@]}" run services update "$PUBLIC_SERVICE" --region "$REGION" --update-env-vars INSTAGRAM_LOG_DENIED_SENDERS=0 >/dev/null
  echo "Logging of denied senders is OFF again. Next: deploy/staging.sh pair-set"
}

cmd_pair_set() {
  local igsid uid
  read -r -s -p "Tester's Instagram-scoped ID (hidden): " igsid; echo
  read -r -s -p "Tester's Firebase UID from Firebase Console > Authentication (hidden): " uid; echo
  [ -n "$igsid" ] && [ -n "$uid" ] || { echo "Both values are needed."; exit 1; }
  "${G[@]}" run services update "$PUBLIC_SERVICE" --region "$REGION" \
    --update-env-vars "^@^INSTAGRAM_SENDER_UID_MAP=${igsid}=${uid}@INSTAGRAM_LOG_DENIED_SENDERS=0" >/dev/null
  unset igsid uid
  echo "Tester paired (1 mapping set). Values were not printed."
}

cmd_rollback() {
  "${G[@]}" scheduler jobs delete "$SCHED_JOB" --location "$REGION" 2>/dev/null || true
  "${G[@]}" run jobs delete "$SMOKE_JOB" --region "$REGION" 2>/dev/null || true
  "${G[@]}" run services delete "$PUBLIC_SERVICE" --region "$REGION" 2>/dev/null || true
  "${G[@]}" run services delete "$WORKER_SERVICE" --region "$REGION" 2>/dev/null || true
  "${G[@]}" storage rm "gs://$BUCKET/smoke/neophi-sample.mp4" 2>/dev/null || true
  echo "Removed services and jobs. Accounts, roles, the image repository, Firestore, the bucket and secrets are kept;"
  echo "to remove the new accounts: gcloud iam service-accounts delete neophi-worker@... / neophi-scheduler@... --project $PROJECT"
}

case "${1:-}" in
  check) cmd_check ;;
  setup) cmd_setup ;;
  build) cmd_build ;;
  deploy) cmd_deploy ;;
  scheduler) cmd_scheduler ;;
  vertex-smoke) cmd_vertex_smoke ;;
  accept) cmd_accept ;;
  firebase-check) cmd_firebase_check ;;
  web-app) cmd_web_app ;;
  web-config) cmd_web_config ;;
  auth-check) cmd_auth_check ;;
  auth-setup) cmd_auth_setup ;;
  legal) cmd_legal ;;
  firestore) cmd_firestore ;;
  ttl-linkcodes) cmd_ttl_linkcodes ;;
  journey) cmd_journey ;;
  status) cmd_status ;;
  rollback) cmd_rollback ;;
  pair-find) cmd_pair_find ;;
  pair-set) cmd_pair_set ;;
  *) sed -n '2,27p' "$0"; exit 2 ;;
esac
