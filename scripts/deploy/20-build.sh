#!/usr/bin/env bash
#/ Usage: scripts/deploy/20-build.sh [--help]
#/
#/ Builds the app image with Cloud Build and pushes it to Artifact Registry, tagged with the git commit:
#/   REGION-docker.pkg.dev/PROJECT/AR_REPO/neophi:<12-char SHA>
#/
#/ Steps (idempotent): create the Artifact Registry Docker repo if missing; make sure the Cloud Build identity
#/ can build and push (grants roles/cloudbuild.builds.builder if missing; SKIP_BUILD_SA_GRANT=1 to skip);
#/ submit scripts/deploy/cloudbuild.yaml with the four VITE_FIREBASE_* values from .env.production as build
#/ arguments. The source upload honours .gcloudignore (no .env files, node_modules, dist or .git).
#/ The pushed image is recorded in .deploy/last-image (gitignored) for 30-deploy.sh.
#/
#/ Env: ALLOW_DIRTY=1 builds an uncommitted tree (tag gets a -dirty-<UTC time> suffix). TAG=... overrides the
#/ tag. DRY_RUN=1 prints the commands instead of running them.
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"
handle_help "$0" "$@"
[ $# -eq 0 ] || die "unknown argument: $1 (see --help)"
require_gcloud

step "Source"
sha=$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD)
tag="${TAG:-$sha}"
if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
  if [ "${ALLOW_DIRTY:-0}" = "1" ]; then
    [ -n "${TAG:-}" ] || tag="$sha-dirty-$(date -u +%Y%m%d%H%M%S)"
    say "WARNING: building uncommitted changes as $tag"
  else
    die "uncommitted changes in $REPO_ROOT. Commit them, or rerun with ALLOW_DIRTY=1"
  fi
fi
image="$IMAGE_BASE:$tag"
say "Image: $image"

step "Firebase web config (.env.production)"
load_vite_env "$ENV_PRODUCTION_FILE" || die "$ENV_PRODUCTION_FILE not found (run scripts/deploy/10-firebase.sh)"
missing=$(missing_vite_keys)
[ -z "$missing" ] || die "missing in .env.production: $missing"
for k in $VITE_KEYS; do
  v=${!k}
  case "$v" in
    *,*|*\"*|*\'*|*' '*) die "$k contains a comma, quote or space; copy the value again from the Firebase console" ;;
  esac
done
[ "$VITE_FIREBASE_PROJECT_ID" = "$PROJECT" ] || die "VITE_FIREBASE_PROJECT_ID does not match $PROJECT"
say "OK: $VITE_KEYS"

step "Artifact Registry repository $AR_REPO ($REGION)"
existing=$(capture_quiet "" gcloud artifacts repositories describe "$AR_REPO" --project "$PROJECT" --location "$REGION" --format='value(name)' || true)
if [ -n "$existing" ]; then
  say "OK: repository exists"
else
  run gcloud artifacts repositories create "$AR_REPO" --project "$PROJECT" --location "$REGION" \
    --repository-format=docker --description="Neophi app images"
fi

step "Cloud Build identity"
if [ "${SKIP_BUILD_SA_GRANT:-0}" = "1" ]; then
  say "skipped (SKIP_BUILD_SA_GRANT=1)"
else
  build_sa=$(capture_quiet "projects/$PROJECT/serviceAccounts/PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
    gcloud builds get-default-service-account --project "$PROJECT" --format='value(serviceAccountEmail)' || true)
  build_sa=${build_sa##*/}
  if [ -z "$build_sa" ]; then
    say "WARNING: could not read the Cloud Build default service account; continuing"
  else
    policy=$(capture_quiet '{}' gcloud projects get-iam-policy "$PROJECT" --format=json || echo '{}')
    if ! is_dry && { printf '%s' "$policy" | policy_has_role roles/cloudbuild.builds.builder "serviceAccount:$build_sa" ||
         printf '%s' "$policy" | policy_has_role roles/editor "serviceAccount:$build_sa"; }; then
      say "OK: $build_sa can build and push"
    else
      run gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$build_sa" \
        --role=roles/cloudbuild.builds.builder --condition=None --format=none
    fi
  fi
fi

step "Cloud Build"
subs="_IMAGE=$image,_VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY,_VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN,_VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID,_VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID"
# Print the command with the (public, but kept off screen) Firebase values masked.
say "+ gcloud builds submit $REPO_ROOT --project $PROJECT --region $REGION --config $DEPLOY_DIR/cloudbuild.yaml --substitutions=_IMAGE=$image,_VITE_FIREBASE_API_KEY=<.env.production>,_VITE_FIREBASE_AUTH_DOMAIN=<.env.production>,_VITE_FIREBASE_PROJECT_ID=<.env.production>,_VITE_FIREBASE_APP_ID=<.env.production>"
if ! is_dry; then
  gcloud builds submit "$REPO_ROOT" --project "$PROJECT" --region "$REGION" \
    --config "$DEPLOY_DIR/cloudbuild.yaml" --substitutions="$subs"
  mkdir -p "$STATE_DIR"
  printf '%s\n' "$image" > "$LAST_IMAGE_FILE"
fi

step "Done"
if is_dry; then say "dry run: nothing was built"; else say "Built and pushed: $image"; fi
say "Next: scripts/deploy/30-deploy.sh   (uses this image; or IMAGE=$image scripts/deploy/30-deploy.sh)"
