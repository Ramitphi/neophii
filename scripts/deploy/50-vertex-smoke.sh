#!/usr/bin/env bash
#/ Usage: scripts/deploy/50-vertex-smoke.sh [--help]
#/
#/ Staging step 1 of docs/INSTAGRAM_PIPELINE.md: proves Vertex video inference works with the DEPLOYED
#/ identity (neophi-app), reading the private bucket the way the pipeline does.
#/
#/   1. uploads tests/fixtures/neophi-sample.mp4 to gs://BUCKET/smoke/neophi-sample.mp4
#/   2. creates/updates the Cloud Run Job SMOKE_JOB (default neophi-vertex-smoke) from the image the service
#/      runs, as neophi-app, running: node tools/vertex-video-smoke.mjs gs://BUCKET/smoke/neophi-sample.mp4
#/   3. executes it, waits, and prints the job's redacted result lines from Cloud Logging
#/   4. deletes the job and the smoke object (KEEP=1 keeps them)
#/
#/ Expected: two lines, mode inline and mode gcs_file_uri, each with replied: true, mime video/mp4,
#/ bytes 251535. Exit code 0 only when both replied.
#/
#/ Env: IMAGE=... overrides the image. DRY_RUN=1 prints the commands instead of running them.
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"
handle_help "$0" "$@"
[ $# -eq 0 ] || die "unknown argument: $1 (see --help)"
require_gcloud

FIXTURE="$REPO_ROOT/tests/fixtures/neophi-sample.mp4"
OBJECT="gs://$BUCKET/smoke/neophi-sample.mp4"
[ -f "$FIXTURE" ] || die "fixture missing: $FIXTURE"

if [ -z "${IMAGE:-}" ]; then
  IMAGE=$(capture_quiet "" gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" \
    --format='value(spec.template.spec.containers[0].image)' || true)
fi
image=$(resolve_image)
say "Image: $image"

step "Upload the synthetic fixture"
run gcloud storage cp "$FIXTURE" "$OBJECT" --project "$PROJECT"

step "Cloud Run Job $SMOKE_JOB"
run gcloud run jobs deploy "$SMOKE_JOB" --project "$PROJECT" --region "$REGION" \
  --image "$image" \
  --service-account "$SA_EMAIL" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT,GOOGLE_CLOUD_LOCATION=$VERTEX_LOCATION,ANALYSIS_MODEL=$ANALYSIS_MODEL" \
  --command node \
  --args "tools/vertex-video-smoke.mjs,$OBJECT" \
  --tasks 1 --max-retries 0 --task-timeout 300s --memory 1Gi \
  --quiet

step "Execute"
status=0
execution=$(capture "neophi-vertex-smoke-dryrun" gcloud run jobs execute "$SMOKE_JOB" --project "$PROJECT" --region "$REGION" \
  --wait --format='value(metadata.name)') || status=$?
if [ -z "$execution" ]; then
  execution=$(capture_quiet "" gcloud run jobs executions list --job "$SMOKE_JOB" --project "$PROJECT" --region "$REGION" \
    --limit 1 --format='value(metadata.name)' || true)
fi
say "Execution: ${execution:-unknown} (exit $status)"

step "Result (redacted lines written by tools/vertex-video-smoke.mjs)"
filter="resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"$SMOKE_JOB\" AND labels.\"run.googleapis.com/execution_name\"=\"$execution\""
lines=""
if is_dry; then
  run gcloud logging read "$filter" --project "$PROJECT" --freshness=1h --order=asc --format=json
else
  # Cloud Logging can lag the job by up to a minute.
  for attempt in 1 2 3 4 5 6 7 8 9; do
    logs=$(gcloud logging read "$filter" --project "$PROJECT" --freshness=1h --order=asc --format=json 2>/dev/null || echo '[]')
    lines=$(printf '%s' "$logs" | json_eval '(j || []).map((e) => e.jsonPayload && (e.jsonPayload.provider || e.jsonPayload.step)
        ? JSON.stringify(e.jsonPayload) : (e.textPayload && /provider|step|GOOGLE_CLOUD_PROJECT/.test(e.textPayload) ? e.textPayload.trim() : null))
      .filter(Boolean).join("\n")' || true)
    if [ -n "$lines" ] && { [ "$(printf '%s\n' "$lines" | grep -c '"mode"')" -ge 2 ] || [ "$status" != "0" ]; }; then break; fi
    say "  waiting for logs ($attempt)"
    sleep 10
  done
  if [ -n "$lines" ]; then printf '%s\n' "$lines"; else say "no result lines found yet; see Console > Cloud Run > Jobs > $SMOKE_JOB > Logs"; fi
fi

step "Cleanup"
if [ "${KEEP:-0}" = "1" ]; then
  say "KEEP=1: leaving $SMOKE_JOB and $OBJECT"
else
  run gcloud run jobs delete "$SMOKE_JOB" --project "$PROJECT" --region "$REGION" --quiet || true
  run gcloud storage rm "$OBJECT" --project "$PROJECT" || true
fi

if is_dry; then
  say "dry run: nothing executed"
  exit 0
fi
inline_ok=$(printf '%s\n' "$lines" | grep '"mode":"inline"' | grep -c '"replied":true' || true)
gcs_ok=$(printf '%s\n' "$lines" | grep '"mode":"gcs_file_uri"' | grep -c '"replied":true' || true)
if [ "$inline_ok" -ge 1 ] && [ "$gcs_ok" -ge 1 ]; then
  printf 'PASS  Vertex replied for inline bytes and for the gs:// file (deployed identity %s)\n' "$SA_EMAIL"
  exit 0
fi
printf 'FAIL  Vertex smoke did not reply for both modes (inline=%s gcs_file_uri=%s)\n' "$inline_ok" "$gcs_ok"
say "Hints: http 403 -> check aiplatform.googleapis.com is enabled, billing, roles/aiplatform.user on $SA_EMAIL."
say "       inline ok but gcs_file_uri 403 -> grant the Vertex AI service agent read access to the bucket:"
say "         n=\$(gcloud projects describe $PROJECT --format='value(projectNumber)')"
say "         gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member=serviceAccount:service-\$n@gcp-sa-aiplatform.iam.gserviceaccount.com --role=roles/storage.objectViewer"
say "       http 404 -> model '$ANALYSIS_MODEL' not available at location '$VERTEX_LOCATION'."
say "       read_fixture failed -> roles/storage.objectUser on gs://$BUCKET for $SA_EMAIL."
exit 1
