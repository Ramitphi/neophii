#!/usr/bin/env bash
#/ Usage: scripts/deploy/40-smoke.sh [URL] [--help]
#/
#/ Post-deploy checks using only public behaviour. URL defaults to the one 30-deploy.sh saved in
#/ .deploy/service-url. Prints PASS/FAIL/WARN/INFO lines; exits non-zero if anything FAILs.
#/
#/   health      GET /api/health is ok and contains no secret
#/   site        GET / serves the app HTML, and the JS bundle carries the Firebase web config
#/   auth        /api/memories without a token is 401; with a bogus token is 401 (not 503: Firebase Admin on)
#/   internal    POST /internal/instagram/worker/run is not reachable (404 not mounted, or 401/403)
#/   webhook     GET with a wrong verify token is 403; with the right one echoes the challenge;
#/               POST with a bad signature is 401; a correctly signed synthetic delivery from a NON-paired
#/               sender is 200 (stored nothing: the sender is denied, or the recipient is ignored)
#/   legal       /privacy, /terms, /data-deletion reported only (never fails)
#/
#/ Secrets: by default the verify token and app secret are read from Secret Manager into shell variables
#/ (never printed, never on a command line). For a local server, export META_VERIFY_TOKEN and META_APP_SECRET
#/ in that shell instead and they are used as-is.
#/
#/ Env: SMOKE_RECIPIENT_ID (default: META_IG_RECIPIENT_ID if set, else 0, which the server ignores),
#/ SMOKE_SENDER_ID (default smoke-not-paired). DRY_RUN=1 prints the requests instead of sending them.
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"
handle_help "$0" "$@"

BASE=${1:-}
if [ -z "$BASE" ] && [ -s "$STATE_DIR/service-url" ]; then BASE=$(head -n 1 "$STATE_DIR/service-url"); fi
[ -n "$BASE" ] || die "pass the service URL, e.g. scripts/deploy/40-smoke.sh https://neophi-xxxx.a.run.app"
BASE=${BASE%/}
[ $# -le 1 ] || die "unexpected arguments (see --help)"
command -v curl >/dev/null 2>&1 || die "curl not found"
command -v node >/dev/null 2>&1 || die "node not found (used for HMAC and JSON)"
make_tmpdir
say "Target: $BASE"

# http METHOD PATH [CURL_ARGS...]: sets CODE, CTYPE and writes the body to $TMP_DIR/body.
http() {
  local method=$1 path=$2
  shift 2
  if is_dry; then
    printf '+ %s\n' "$(quote_cmd curl -sS -X "$method" "$@" "$BASE$path")" >&2
    CODE=DRY; CTYPE=""; : > "$TMP_DIR/body"
    return 0
  fi
  local out
  out=$(curl -sS --max-time 30 -o "$TMP_DIR/body" -w '%{http_code} %{content_type}' -X "$method" "$@" "$BASE$path" 2>/dev/null) || out="000 "
  CODE=${out%% *}
  CTYPE=${out#* }
}

# http_secret_url METHOD QUERY: like http, but the URL (which carries a secret) goes to curl through stdin.
http_secret_url() {
  local method=$1 query=$2 out
  if is_dry; then
    printf '+ curl -sS -X %s -K - <<< url = "%s/webhooks/instagram?%s"   (URL via stdin, not argv)\n' "$method" "$BASE" "hub.mode=subscribe&hub.verify_token=<secret>&hub.challenge=..." >&2
    CODE=DRY; CTYPE=""; : > "$TMP_DIR/body"
    return 0
  fi
  out=$(printf 'url = "%s/webhooks/instagram?%s"\n' "$BASE" "$query" |
    curl -sS --max-time 30 -K - -o "$TMP_DIR/body" -w '%{http_code} %{content_type}' -X "$method" 2>/dev/null) || out="000 "
  CODE=${out%% *}
  CTYPE=${out#* }
}

body() { cat "$TMP_DIR/body"; }
dry_check() { if [ "$CODE" = "DRY" ]; then skip "$1 (dry run)"; return 0; fi; return 1; }
urlencode_stdin() { node -e 'const c=[];process.stdin.on("data",(d)=>c.push(d)).on("end",()=>process.stdout.write(encodeURIComponent(Buffer.concat(c).toString("utf8"))))'; }
# hmac_sha256_hex FILE: key on stdin, body from FILE. Prints "sha256=<hex>" like Meta's X-Hub-Signature-256.
hmac_sha256_hex() {
  node -e 'const crypto=require("crypto"),fs=require("fs");const c=[];process.stdin.on("data",(d)=>c.push(d)).on("end",()=>{process.stdout.write("sha256="+crypto.createHmac("sha256",Buffer.concat(c)).update(fs.readFileSync(process.argv[1])).digest("hex"))})' "$1"
}

# ---- Secrets (never printed) ----
VERIFY_TOKEN=""
APP_SECRET=""
if [ -n "${META_VERIFY_TOKEN:-}" ] && [ -n "${META_APP_SECRET:-}" ]; then
  VERIFY_TOKEN=$META_VERIFY_TOKEN
  APP_SECRET=$META_APP_SECRET
  info "webhook secrets: taken from this shell's META_VERIFY_TOKEN / META_APP_SECRET (local mode)"
else
  require_gcloud
  VERIFY_TOKEN=$(capture_quiet "dry-run-verify-token" gcloud secrets versions access "$SECRET_VERSION" --secret="$SECRET_VERIFY" --project "$PROJECT" || true)
  APP_SECRET=$(capture_quiet "dry-run-app-secret" gcloud secrets versions access "$SECRET_VERSION" --secret="$SECRET_APP" --project "$PROJECT" || true)
  if [ -n "$VERIFY_TOKEN" ] && [ -n "$APP_SECRET" ]; then
    info "webhook secrets: read from Secret Manager ($SECRET_VERIFY, $SECRET_APP; values not shown)"
  else
    warn "could not read the Meta secrets from Secret Manager; webhook checks that need them are skipped"
  fi
fi

# contains_secret: true if the last body contains either secret (shell pattern match, no external process).
# Values shorter than 8 characters are not meaningful to search for.
contains_secret() {
  local b
  b=$(body)
  if [ "${#VERIFY_TOKEN}" -ge 8 ]; then case "$b" in *"$VERIFY_TOKEN"*) return 0 ;; esac; fi
  if [ "${#APP_SECRET}" -ge 8 ]; then case "$b" in *"$APP_SECRET"*) return 0 ;; esac; fi
  return 1
}
SERVER_HAS_APP_SECRET=1

step "Health"
http GET /api/health
if ! dry_check "GET /api/health"; then
  if [ "$CODE" = "200" ] && grep -q '"ok":true' "$TMP_DIR/body"; then
    pass "GET /api/health 200 ok"
    info "health: $(body | json_eval '"project=" + j.project + " region=" + j.region + " analysisModel=" + j.models.analysis + " webhookConfigured=" + j.instagram.webhookConfigured' 2>/dev/null || echo unparsed)"
    if contains_secret; then fail "health response contains a secret value"; else pass "health response contains no secret"; fi
    if grep -q '"webhookConfigured":false' "$TMP_DIR/body"; then
      warn "instagram.webhookConfigured is false (expected until META_IG_RECIPIENT_ID is set; see docs/DEPLOY.md pairing)"
    fi
  elif [ "$CODE" = "000" ]; then
    fail "cannot reach $BASE (wrong URL, service not ready, or no network)"
    summary "Smoke"
    exit 1
  else
    fail "GET /api/health returned $CODE (expected 200 with ok:true)"
  fi
fi

step "Site"
http GET /
if ! dry_check "GET / serves HTML"; then
  if [ "$CODE" = "200" ] && printf '%s' "$CTYPE" | grep -qi 'text/html' && grep -q 'id="root"' "$TMP_DIR/body"; then
    pass "GET / 200 text/html (app shell)"
    cp "$TMP_DIR/body" "$TMP_DIR/index.html"
    # Firebase web config must be baked into the client bundle, or sign-in fails in production.
    # With a local .env.production, look for its exact appId; otherwise for any Firebase browser API key.
    [ -n "${VITE_FIREBASE_APP_ID:-}" ] || load_vite_env "$ENV_PRODUCTION_FILE" || true
    found=0
    grep -Eo '(src|href)="/assets/[^"]+\.js"' "$TMP_DIR/index.html" | sed -E 's/^(src|href)="//; s/"$//' | sort -u > "$TMP_DIR/assets" || true
    while IFS= read -r asset; do
      http GET "$asset"
      [ "$CODE" = "200" ] || continue
      if [ -n "${VITE_FIREBASE_APP_ID:-}" ]; then
        grep -qF -- "$VITE_FIREBASE_APP_ID" "$TMP_DIR/body" && found=1
      elif grep -Eq 'AIza[0-9A-Za-z_-]{30,}' "$TMP_DIR/body"; then
        found=1
      fi
    done < "$TMP_DIR/assets"
    if [ "$found" = "1" ]; then
      pass "client bundle contains the Firebase web config"
    else
      fail "client bundle has no Firebase web config: rebuild with .env.production filled (scripts/deploy/20-build.sh)"
    fi
  else
    fail "GET / returned $CODE ${CTYPE:-} (expected 200 text/html with the app shell)"
  fi
fi

step "Auth boundaries"
http GET /api/memories
if ! dry_check "GET /api/memories without token"; then
  if [ "$CODE" = "401" ]; then pass "GET /api/memories without token 401"; else fail "GET /api/memories without token returned $CODE (expected 401)"; fi
fi
http GET /api/memories -H 'Authorization: Bearer not-a-real-firebase-token'
if ! dry_check "GET /api/memories with a bogus token"; then
  case "$CODE" in
    401) pass "GET /api/memories with a bogus token 401 (Firebase ID-token verification is on)" ;;
    503) fail "GET /api/memories with a bogus token 503: Firebase Admin not configured (GOOGLE_CLOUD_PROJECT missing on the service)" ;;
    *) fail "GET /api/memories with a bogus token returned $CODE (expected 401)" ;;
  esac
fi
http POST /internal/instagram/worker/run
if ! dry_check "POST /internal/instagram/worker/run not public"; then
  case "$CODE" in
    404) pass "POST /internal/instagram/worker/run 404 (worker route not mounted on the public service)" ;;
    401|403) pass "POST /internal/instagram/worker/run $CODE (mounted but protected)" ;;
    *) fail "POST /internal/instagram/worker/run returned $CODE (expected 404, 401 or 403)" ;;
  esac
fi

step "Instagram webhook"
http GET "/webhooks/instagram?hub.mode=subscribe&hub.verify_token=wrong-token-$$&hub.challenge=smoke"
if ! dry_check "GET webhook with a wrong verify token"; then
  if [ "$CODE" = "403" ]; then pass "GET /webhooks/instagram with a wrong token 403"; else fail "GET /webhooks/instagram with a wrong token returned $CODE (expected 403)"; fi
fi

if [ -n "$VERIFY_TOKEN" ]; then
  challenge="smoke$(date +%s)$$"
  enc=$(printf '%s' "$VERIFY_TOKEN" | urlencode_stdin)
  http_secret_url GET "hub.mode=subscribe&hub.verify_token=$enc&hub.challenge=$challenge"
  enc=""
  if ! dry_check "GET webhook with the right verify token echoes the challenge"; then
    if [ "$CODE" = "200" ] && [ "$(body)" = "$challenge" ]; then
      pass "GET /webhooks/instagram with the right token echoes the challenge"
    elif [ "$CODE" = "403" ]; then
      fail "GET /webhooks/instagram with the expected token 403: the service's META_VERIFY_TOKEN differs (older secret version: redeploy; or a trailing newline in the secret)"
    else
      fail "GET /webhooks/instagram with the right token returned $CODE (expected 200 + challenge)"
    fi
  fi
else
  skip "GET webhook with the right verify token (no token available)"
fi

ts_ms="$(date +%s)000"
recipient=${SMOKE_RECIPIENT_ID:-${META_IG_RECIPIENT_ID:-0}}
sender=${SMOKE_SENDER_ID:-smoke-not-paired}
printf '{"object":"instagram","entry":[{"id":"%s","time":%s,"messaging":[{"sender":{"id":"%s"},"recipient":{"id":"%s"},"timestamp":%s,"message":{"mid":"smoke-%s-%s","text":"deploy smoke test"}}]}]}' \
  "$recipient" "$ts_ms" "$sender" "$recipient" "$ts_ms" "$ts_ms" "$$" > "$TMP_DIR/delivery.json"

http POST /webhooks/instagram -H 'Content-Type: application/json' \
  -H 'X-Hub-Signature-256: sha256=0000000000000000000000000000000000000000000000000000000000000000' \
  --data-binary "@$TMP_DIR/delivery.json"
if ! dry_check "POST webhook with a bad signature"; then
  case "$CODE" in
    401) pass "POST /webhooks/instagram with a bad signature 401" ;;
    503) SERVER_HAS_APP_SECRET=0; fail "POST /webhooks/instagram 503: META_APP_SECRET is not set on the service" ;;
    *) fail "POST /webhooks/instagram with a bad signature returned $CODE (expected 401)" ;;
  esac
fi

if [ "$SERVER_HAS_APP_SECRET" = "0" ]; then
  skip "POST webhook correctly signed (the service has no META_APP_SECRET; see the FAIL above)"
elif [ -n "$APP_SECRET" ]; then
  if is_dry; then
    say "+ signature=\$(printf %s \"\$APP_SECRET\" | node <HMAC-SHA256 over delivery.json>)   (secret via stdin)"
    sig="sha256=dry-run"
  else
    sig=$(printf '%s' "$APP_SECRET" | hmac_sha256_hex "$TMP_DIR/delivery.json")
  fi
  http POST /webhooks/instagram -H 'Content-Type: application/json' -H "X-Hub-Signature-256: $sig" \
    --data-binary "@$TMP_DIR/delivery.json"
  if ! dry_check "POST webhook correctly signed, non-paired sender"; then
    case "$CODE" in
      200) pass "POST /webhooks/instagram correctly signed, non-paired sender 200 (nothing stored: sender denied or recipient ignored)" ;;
      503)
        if grep -q 'not configured' "$TMP_DIR/body"; then
          warn "signed delivery: 503 not configured (META_IG_RECIPIENT_ID not set yet; expected before pairing)"
        else
          fail "signed delivery: 503 (Firestore intake failed? check logs for instagram_webhook_intake_failed)"
        fi ;;
      401) fail "signed delivery rejected 401: the service's META_APP_SECRET differs (older secret version: redeploy; or a trailing newline in the secret)" ;;
      *) fail "signed delivery returned $CODE (expected 200)" ;;
    esac
  fi
else
  skip "POST webhook correctly signed (no app secret available)"
fi

step "Legal pages (optional, never fail)"
for p in /privacy /terms /data-deletion; do
  http GET "$p"
  if dry_check "GET $p"; then continue; fi
  if [ "$CODE" = "200" ] && [ -f "$TMP_DIR/index.html" ] && cmp -s "$TMP_DIR/body" "$TMP_DIR/index.html"; then
    info "GET $p 200 but it is the app shell (legal page not deployed yet)"
  elif [ "$CODE" = "200" ]; then
    info "GET $p 200 (page served)"
  else
    info "GET $p $CODE"
  fi
done

VERIFY_TOKEN=""
APP_SECRET=""
summary "Smoke"
