#!/usr/bin/env bash
#/ Usage: scripts/deploy/30-deploy.sh [--image URI] [--env-only] [--help]
#/
#/ Deploys (or redeploys) the public Cloud Run service SERVICE (default "neophi") as the neophi-app service
#/ account, then prints the service URL and the Meta callback URL.
#/
#/   --image URI   image to deploy. Default: IMAGE env, else the last image 20-build.sh pushed, else the tag
#/                 for the current commit.
#/   --env-only    do not change the image: only update the Instagram variables given below on the running
#/                 service (new revision). Used for tester pairing.
#/
#/ Service shape: one public service, --allow-unauthenticated (app APIs still require Firebase Auth), secrets
#/ from Secret Manager (META_APP_SECRET, META_VERIFY_TOKEN via --update-secrets; optional
#/ INSTAGRAM_ACCESS_TOKEN when SECRET_IG_TOKEN names its secret), and the Instagram worker as the
#/ in-process poller (INSTAGRAM_WORKER_POLL_MS=5000, --min-instances 1, --no-cpu-throttling). No worker auth
#/ variable is set, so /internal/* is not mounted on this public service.
#/
#/ Optional Instagram variables, applied only when set in your shell (existing values on the service are kept
#/ otherwise, because the script uses --update-env-vars):
#/   META_IG_RECIPIENT_ID          numeric ID of the connected professional account
#/   INSTAGRAM_SENDER_UID_MAP      IGSID=FirebaseUID[,IGSID2=UID2]
#/   INSTAGRAM_LOG_DENIED_SENDERS  1 while pairing a tester, then 0
#/   META_GRAPH_HOST, META_GRAPH_VERSION, INSTAGRAM_MEDIA_HOSTS, INSTAGRAM_MAX_EVENT_AGE_HOURS
#/
#/ Env: DRY_RUN=1 prints the commands instead of running them. Names/defaults: scripts/deploy/config.sh.
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"
handle_help "$0" "$@"

ENV_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --image) [ $# -ge 2 ] || die "--image needs a value"; IMAGE=$2; shift 2 ;;
    --env-only) ENV_ONLY=1; shift ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done
require_gcloud

# ---- Validate the optional Instagram variables (none of them is a secret) ----
pairs=""
add_var() { pairs="${pairs:+$pairs@}$1=$2"; }

if [ -n "${META_IG_RECIPIENT_ID:-}" ]; then
  printf '%s' "$META_IG_RECIPIENT_ID" | grep -Eq '^[0-9]{1,32}$' || die "META_IG_RECIPIENT_ID must be the numeric account ID"
  add_var META_IG_RECIPIENT_ID "$META_IG_RECIPIENT_ID"
fi
if [ -n "${INSTAGRAM_SENDER_UID_MAP:-}" ]; then
  # Same rules as server/instagram/config.ts parseSenderUidMap (which silently drops malformed pairs).
  printf '%s' "$INSTAGRAM_SENDER_UID_MAP" | grep -Eq '^[0-9A-Za-z_-]{1,64}=[A-Za-z0-9_-]{1,128}(,[0-9A-Za-z_-]{1,64}=[A-Za-z0-9_-]{1,128})*$' ||
    die "INSTAGRAM_SENDER_UID_MAP must look like IGSID=FirebaseUID[,IGSID2=UID2] (no spaces)"
  add_var INSTAGRAM_SENDER_UID_MAP "$INSTAGRAM_SENDER_UID_MAP"
fi
if [ -n "${INSTAGRAM_LOG_DENIED_SENDERS:-}" ]; then
  case "$INSTAGRAM_LOG_DENIED_SENDERS" in 0|1) ;; *) die "INSTAGRAM_LOG_DENIED_SENDERS must be 0 or 1" ;; esac
  add_var INSTAGRAM_LOG_DENIED_SENDERS "$INSTAGRAM_LOG_DENIED_SENDERS"
fi
for name in META_GRAPH_HOST META_GRAPH_VERSION INSTAGRAM_MEDIA_HOSTS INSTAGRAM_MAX_EVENT_AGE_HOURS; do
  value=${!name:-}
  [ -n "$value" ] || continue
  printf '%s' "$value" | grep -Eq '^[A-Za-z0-9.,_-]+$' || die "$name has unexpected characters"
  add_var "$name" "$value"
done
for name in INSTAGRAM_WORKER_SECRET INSTAGRAM_WORKER_OIDC_AUDIENCE INSTAGRAM_WORKER_SERVICE_ACCOUNT; do
  [ -z "${!name:-}" ] || die "$name is set in your shell; this design uses the in-process poller. Unset it."
done

if [ "$ENV_ONLY" = "1" ]; then
  [ -n "$pairs" ] || die "--env-only needs at least one of META_IG_RECIPIENT_ID, INSTAGRAM_SENDER_UID_MAP, INSTAGRAM_LOG_DENIED_SENDERS, ..."
  step "Update Instagram variables on $SERVICE"
  say "Setting: $(printf '%s' "$pairs" | tr '@' '\n' | sed 's/=.*//' | tr '\n' ' ')"
  run gcloud run services update "$SERVICE" --project "$PROJECT" --region "$REGION" \
    --update-env-vars "^@^$pairs"
else
  image=$(resolve_image)
  step "Deploy $SERVICE ($REGION) with $image"
  base="GOOGLE_CLOUD_PROJECT=$PROJECT@GOOGLE_CLOUD_LOCATION=$VERTEX_LOCATION@CLOUD_RUN_REGION=$REGION@MEDIA_BUCKET=$BUCKET"
  base="$base@NODE_ENV=production@ANALYSIS_MODEL=$ANALYSIS_MODEL@EMBEDDING_MODEL=$EMBEDDING_MODEL@INSTAGRAM_WORKER_POLL_MS=$POLL_MS"
  all="$base${pairs:+@$pairs}"
  secrets="META_APP_SECRET=$SECRET_APP:$SECRET_VERSION,META_VERIFY_TOKEN=$SECRET_VERIFY:$SECRET_VERSION"
  if [ -n "${SECRET_IG_TOKEN:-}" ]; then
    secrets="$secrets,INSTAGRAM_ACCESS_TOKEN=$SECRET_IG_TOKEN:$SECRET_VERSION"
  fi
  run gcloud run deploy "$SERVICE" --project "$PROJECT" --region "$REGION" \
    --image "$image" \
    --service-account "$SA_EMAIL" \
    --allow-unauthenticated \
    --port 8080 --cpu 1 --memory 1Gi --concurrency 40 --timeout 300 \
    --min-instances "$MIN_INSTANCES" --max-instances "$MAX_INSTANCES" --no-cpu-throttling --cpu-boost \
    --update-env-vars "^@^$all" \
    --update-secrets "$secrets" \
    --labels app=neophi \
    --quiet
fi

url=$(capture "https://$SERVICE-PROJECT_HASH.a.run.app" gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')
[ -n "$url" ] || die "could not read the service URL"
if ! is_dry; then
  mkdir -p "$STATE_DIR"
  printf '%s\n' "$url" > "$STATE_DIR/service-url"
fi

step "Done"
printf 'Service URL:        %s\n' "$url"
printf 'Meta callback URL:  %s/webhooks/instagram\n' "$url"
printf 'Next:               scripts/deploy/40-smoke.sh %s\n' "$url"
