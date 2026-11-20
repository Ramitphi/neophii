#!/usr/bin/env bash
#/ Usage: scripts/deploy/10-firebase.sh [--add-domain HOST] [--help]
#/
#/ Sets up Firebase Authentication for the existing Google Cloud project, using only gcloud credentials
#/ (no firebase CLI needed). Idempotent; safe to rerun.
#/
#/   1. enables firebase.googleapis.com and identitytoolkit.googleapis.com
#/   2. adds Firebase to the project if it is not a Firebase project yet
#/   3. registers a web app (FIREBASE_WEB_APP, default "neophi-web") if none exists
#/   4. writes the four public VITE_FIREBASE_* values into .env.production (gitignored; names printed, never
#/      values). An existing complete .env.production is kept unless FORCE=1.
#/   5. turns on Anonymous sign-in if Authentication is initialised; otherwise prints the console clicks
#/
#/   --add-domain HOST   only add HOST (e.g. neophi-xxxx.a.run.app) to Authentication > Authorized domains
#/
#/ Anything the API refuses is reported with the exact console steps instead. DRY_RUN=1 prints the calls.
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"
handle_help "$0" "$@"

FIREBASE_WEB_APP="${FIREBASE_WEB_APP:-neophi-web}"
FB_API="https://firebase.googleapis.com/v1beta1"
IDT_API="https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJECT/config"
CONSOLE="https://console.firebase.google.com/project/$PROJECT"
ADD_DOMAIN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --add-domain) [ $# -ge 2 ] || die "--add-domain needs a host"; ADD_DOMAIN=$2; shift 2 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done
require_gcloud
make_tmpdir

# wait_operation NAME: polls a Firebase long-running operation until done (about 2 minutes at most).
wait_operation() {
  local name=$1 i out done_flag err
  is_dry && { say "  (dry run: would poll $FB_API/$name until done)"; return 0; }
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
    out=$(google_api GET "$FB_API/$name") || return 1
    split_status "$out"
    done_flag=$(printf '%s' "$HTTP_BODY" | json_eval 'String(Boolean(j && j.done))' 2>/dev/null || echo false)
    if [ "$done_flag" = "true" ]; then
      err=$(printf '%s' "$HTTP_BODY" | json_eval 'j.error ? j.error.message : ""' 2>/dev/null || true)
      [ -z "$err" ] && return 0
      say "  operation failed: $err"
      return 1
    fi
    say "  waiting for $name ($i)"
    sleep 4
  done
  say "  operation still running after 2 minutes; rerun this script later"
  return 1
}

if [ -n "$ADD_DOMAIN" ]; then
  step "Authorized domain $ADD_DOMAIN"
  out=$(google_api GET "$IDT_API") || die "could not read the Authentication config"
  split_status "$out"
  [ "$HTTP_CODE" = "200" ] || die "Authentication config not readable (HTTP $HTTP_CODE). Add it in $CONSOLE/authentication/settings"
  printf '%s' "$HTTP_BODY" | json_eval 'JSON.stringify({authorizedDomains: [...new Set([...(j.authorizedDomains || []), a[0]])]})' "$ADD_DOMAIN" > "$TMP_DIR/domains.json"
  out=$(google_api PATCH "$IDT_API?updateMask=authorizedDomains" "$TMP_DIR/domains.json") || die "update failed"
  split_status "$out"
  if [ "$HTTP_CODE" = "200" ]; then
    say "OK: $ADD_DOMAIN is an authorized domain"
  else
    die "update refused (HTTP $HTTP_CODE). Add it by hand: $CONSOLE/authentication/settings > Authorized domains > Add domain"
  fi
  exit 0
fi

step "Enable APIs"
run gcloud services enable firebase.googleapis.com identitytoolkit.googleapis.com --project "$PROJECT"

step "Firebase project"
out=$(google_api GET "$FB_API/projects/$PROJECT") || die "could not reach the Firebase Management API"
split_status "$out"
if [ "$HTTP_CODE" = "200" ]; then
  say "OK: $PROJECT is already a Firebase project"
else
  say "Adding Firebase to $PROJECT"
  printf '{}' > "$TMP_DIR/empty.json"
  out=$(google_api POST "$FB_API/projects/$PROJECT:addFirebase" "$TMP_DIR/empty.json") || die "addFirebase call failed"
  split_status "$out"
  if [ "$HTTP_CODE" != "200" ]; then
    say "The API refused addFirebase (HTTP $HTTP_CODE). Do it in the console instead:"
    say "  https://console.firebase.google.com/ > Create a project > 'Add Firebase to a Google Cloud project'"
    say "  > pick $PROJECT > continue (Analytics not needed). Then rerun this script."
    exit 1
  fi
  op=$(printf '%s' "$HTTP_BODY" | json_eval 'j.name' || true)
  [ -n "$op" ] && { wait_operation "$op" || die "adding Firebase did not finish; rerun this script"; }
  say "OK: Firebase added"
fi

step "Web app"
list_web_apps() {
  local out
  out=$(google_api GET "$FB_API/projects/$PROJECT/webApps") || return 1
  split_status "$out"
  [ "$HTTP_CODE" = "200" ] || return 1
  printf '%s' "$HTTP_BODY" | json_eval '(((j && j.apps) || []).find((x) => x.displayName === a[0] && x.state !== "DELETED") || ((j && j.apps) || []).find((x) => x.state !== "DELETED") || {}).appId' "$FIREBASE_WEB_APP"
}
app_id=$(list_web_apps) || die "could not list Firebase web apps"
if [ -z "$app_id" ]; then
  say "Registering web app $FIREBASE_WEB_APP"
  printf '{"displayName":"%s"}' "$FIREBASE_WEB_APP" > "$TMP_DIR/webapp.json"
  out=$(google_api POST "$FB_API/projects/$PROJECT/webApps" "$TMP_DIR/webapp.json") || die "web app creation failed"
  split_status "$out"
  [ "$HTTP_CODE" = "200" ] || die "web app creation refused (HTTP $HTTP_CODE). Console: $CONSOLE/settings/general > Your apps > Web (</>)"
  op=$(printf '%s' "$HTTP_BODY" | json_eval 'j.name' || true)
  [ -n "$op" ] && { wait_operation "$op" || die "web app creation did not finish; rerun this script"; }
  app_id=$(list_web_apps) || true
  if is_dry; then app_id=${app_id:-DRY_RUN_APP_ID}; fi
  [ -n "$app_id" ] || die "web app not visible yet; rerun this script in a minute"
fi
say "OK: web app registered"

step ".env.production"
complete=0
if [ -f "$ENV_PRODUCTION_FILE" ]; then
  ( load_vite_env "$ENV_PRODUCTION_FILE"; [ -z "$(missing_vite_keys)" ] ) && complete=1
fi
if [ "$complete" = "1" ] && [ "${FORCE:-0}" != "1" ]; then
  say "OK: $ENV_PRODUCTION_FILE already has all four keys (FORCE=1 to rewrite it)"
else
  out=$(google_api GET "$FB_API/projects/$PROJECT/webApps/$app_id/config") || die "could not read the web app config"
  split_status "$out"
  [ "$HTTP_CODE" = "200" ] || die "web app config not readable (HTTP $HTTP_CODE). Copy it from $CONSOLE/settings/general"
  if is_dry; then
    say "  (dry run: would write VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID to $ENV_PRODUCTION_FILE)"
  else
    env_file_untracked "$ENV_PRODUCTION_FILE" || die "$ENV_PRODUCTION_FILE is not gitignored; refusing to write it"
    [ -f "$ENV_PRODUCTION_FILE" ] && cp "$ENV_PRODUCTION_FILE" "$ENV_PRODUCTION_FILE.bak"
    printf '%s' "$HTTP_BODY" | json_eval '["# Public Firebase web config for the production build (not secrets). Gitignored; do not commit.",
        "VITE_FIREBASE_API_KEY=" + (j.apiKey || ""),
        "VITE_FIREBASE_AUTH_DOMAIN=" + (j.authDomain || ""),
        "VITE_FIREBASE_PROJECT_ID=" + (j.projectId || ""),
        "VITE_FIREBASE_APP_ID=" + (j.appId || ""), ""].join("\n")' > "$ENV_PRODUCTION_FILE.tmp"
    mv "$ENV_PRODUCTION_FILE.tmp" "$ENV_PRODUCTION_FILE"
    chmod 600 "$ENV_PRODUCTION_FILE"
    ( load_vite_env "$ENV_PRODUCTION_FILE"; m=$(missing_vite_keys); [ -z "$m" ] || die "config lacks: $m" )
    say "OK: wrote VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID"
  fi
fi

step "Anonymous sign-in"
manual_anon() {
  say "Do this in the console, then rerun scripts/deploy/00-preflight.sh:"
  say "  $CONSOLE/authentication > Get started (first time only)"
  say "  > Sign-in method > Add new provider > Anonymous > Enable > Save"
}
out=$(google_api GET "$IDT_API") || { manual_anon; exit 1; }
split_status "$out"
if [ "$HTTP_CODE" != "200" ]; then
  say "Authentication is not initialised yet (HTTP $HTTP_CODE)."
  manual_anon
  exit 1
fi
anon=$(printf '%s' "$HTTP_BODY" | json_eval 'String(Boolean(j && j.signIn && j.signIn.anonymous && j.signIn.anonymous.enabled))' || echo false)
if [ "$anon" = "true" ]; then
  say "OK: Anonymous sign-in already enabled"
else
  printf '{"signIn":{"anonymous":{"enabled":true}}}' > "$TMP_DIR/anon.json"
  out=$(google_api PATCH "$IDT_API?updateMask=signIn.anonymous.enabled" "$TMP_DIR/anon.json") || { manual_anon; exit 1; }
  split_status "$out"
  if [ "$HTTP_CODE" = "200" ]; then say "OK: Anonymous sign-in enabled"; else say "API refused (HTTP $HTTP_CODE)."; manual_anon; exit 1; fi
fi

say ""
say "Firebase is ready. Next: scripts/deploy/00-preflight.sh, then scripts/deploy/20-build.sh"
