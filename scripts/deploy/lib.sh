# shellcheck shell=bash
# Shared helpers for scripts/deploy/*.sh. Portable to macOS bash 3.2 and Linux bash (no bash-4-only features,
# no GNU-only flags). Sourced, never run directly.

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$DEPLOY_DIR/../.." && pwd)}"
# shellcheck source=scripts/deploy/config.sh
. "$DEPLOY_DIR/config.sh"

DRY_RUN="${DRY_RUN:-0}"
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

is_dry() { [ "$DRY_RUN" = "1" ]; }

say() { printf '%s\n' "$*" >&2; }
step() { printf '\n== %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

pass() { PASS_COUNT=$((PASS_COUNT + 1)); printf 'PASS  %s\n' "$*"; }
fail() { FAIL_COUNT=$((FAIL_COUNT + 1)); printf 'FAIL  %s\n' "$*"; }
warn() { WARN_COUNT=$((WARN_COUNT + 1)); printf 'WARN  %s\n' "$*"; }
info() { printf 'INFO  %s\n' "$*"; }
skip() { printf 'SKIP  %s\n' "$*"; }

summary() {
  printf '\n%s: %d passed, %d failed, %d warnings\n' "$1" "$PASS_COUNT" "$FAIL_COUNT" "$WARN_COUNT"
  [ "$FAIL_COUNT" -eq 0 ]
}

# Print a command in copy-pasteable form.
quote_cmd() {
  local out="" a
  for a in "$@"; do
    out="$out $(printf '%q' "$a")"
  done
  printf '%s' "${out# }"
}

# run CMD...      prints the command; executes it unless DRY_RUN=1.
run() {
  printf '+ %s\n' "$(quote_cmd "$@")" >&2
  if is_dry; then return 0; fi
  "$@"
}

# capture PLACEHOLDER CMD...   prints stdout of CMD (for $(...)); with DRY_RUN=1 prints the command to stderr
# and returns PLACEHOLDER instead. Never use it on a command whose arguments contain a secret.
capture() {
  local placeholder=$1
  shift
  if is_dry; then
    printf '+ %s\n' "$(quote_cmd "$@")" >&2
    printf '%s' "$placeholder"
    return 0
  fi
  "$@"
}

# usage_from_header FILE: prints the "#/" lines at the top of a script.
usage_from_header() {
  grep '^#/' "$1" | sed 's/^#\/ \{0,1\}//'
}

handle_help() {
  local script=$1
  shift
  local a
  for a in "$@"; do
    case "$a" in
      -h|--help) usage_from_header "$script"; exit 0 ;;
    esac
  done
}

require_gcloud() {
  if is_dry; then return 0; fi
  command -v gcloud >/dev/null 2>&1 || die "gcloud CLI not found. Install it and run: gcloud auth login"
}

# load_vite_env [FILE]: reads ONLY the four VITE_FIREBASE_* keys from FILE without executing it and exports
# them. Missing or empty keys are left unset. Values are never printed.
load_vite_env() {
  local file=${1:-$ENV_PRODUCTION_FILE} line key value
  [ -f "$file" ] || return 1
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    case "$line" in
      ''|'#'*) continue ;;
    esac
    line=${line#export }
    key=${line%%=*}
    [ "$key" = "$line" ] && continue
    value=${line#*=}
    # Strip one pair of surrounding quotes.
    case "$value" in
      \"*\") value=${value#\"}; value=${value%\"} ;;
      \'*\') value=${value#\'}; value=${value%\'} ;;
    esac
    case " $VITE_KEYS " in
      *" $key "*) if [ -n "$value" ]; then export "$key=$value"; fi ;;
    esac
  done < "$file"
  return 0
}

# env_file_untracked FILE: true when FILE is outside the repository or gitignored inside it.
env_file_untracked() {
  case "$1" in
    "$REPO_ROOT"/*) git -C "$REPO_ROOT" check-ignore -q "$1" ;;
    *) return 0 ;;
  esac
}

# missing_vite_keys: prints the names of VITE_FIREBASE_* keys that are unset or empty in the environment.
missing_vite_keys() {
  local k missing=""
  for k in $VITE_KEYS; do
    [ -n "${!k:-}" ] || missing="$missing $k"
  done
  printf '%s' "${missing# }"
}

# resolve_image: IMAGE env, else the last image 20-build.sh pushed, else the tag for the current commit.
resolve_image() {
  if [ -n "${IMAGE:-}" ]; then
    printf '%s' "$IMAGE"
  elif [ -s "$LAST_IMAGE_FILE" ]; then
    head -n 1 "$LAST_IMAGE_FILE"
  else
    printf '%s:%s' "$IMAGE_BASE" "$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD)"
  fi
}

# Temporary directory removed on exit.
make_tmpdir() {
  TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/neophi-deploy.XXXXXX")
  # shellcheck disable=SC2064
  trap "rm -rf '$TMP_DIR'" EXIT
}

# capture_quiet PLACEHOLDER CMD...: like capture, but discards the command's stderr in real mode.
capture_quiet() {
  local placeholder=$1
  shift
  if is_dry; then
    printf '+ %s\n' "$(quote_cmd "$@")" >&2
    printf '%s' "$placeholder"
    return 0
  fi
  "$@" 2>/dev/null
}

# json_eval EXPR [ARGS...]: evaluates a JavaScript expression over JSON read from stdin. `j` is the parsed
# document, `a` the extra arguments. Prints the result ('' for null/undefined). Needs node (the repo needs it).
json_eval() {
  node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      let j = null;
      try { j = JSON.parse(s || "null"); } catch { process.exit(2); }
      const f = new Function("j", "a", "return (" + process.argv[1] + ");");
      const r = f(j, process.argv.slice(2));
      process.stdout.write(r === null || r === undefined ? "" : String(r));
    });' "$@"
}

# policy_has_role ROLE MEMBER: reads an IAM policy (JSON) on stdin; exit 0 when MEMBER has ROLE.
policy_has_role() {
  local r
  r=$(json_eval '((j && j.bindings) || []).some((b) => b.role === a[0] && (b.members || []).includes(a[1])) ? "yes" : "no"' "$1" "$2") || return 1
  [ "$r" = "yes" ]
}

# google_api METHOD URL [JSON_BODY_FILE]: calls a Google REST API with the gcloud user's access token. The
# token reaches curl through stdin (curl -K -), never a command line. Prints the response body, then the
# HTTP status on a final line. With DRY_RUN=1 prints the call and returns "{}" / 200.
google_api() {
  local method=$1 url=$2 body=${3:-} token
  if is_dry; then
    # shellcheck disable=SC2016  # the $(...) is meant literally in the printed command
    printf '+ curl -X %s -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "x-goog-user-project: %s" %s%s\n' \
      "$method" "$PROJECT" "${body:+--data @$body }" "$url" >&2
    printf '{}\n200'
    return 0
  fi
  token=$(gcloud auth print-access-token 2>/dev/null) || return 1
  {
    printf 'header = "Authorization: Bearer %s"\n' "$token"
    printf 'header = "x-goog-user-project: %s"\n' "$PROJECT"
    printf 'header = "Content-Type: application/json"\n'
  } | if [ -n "$body" ]; then
    curl -sS -K - -X "$method" --data-binary "@$body" -w '\n%{http_code}' "$url"
  else
    curl -sS -K - -X "$method" -w '\n%{http_code}' "$url"
  fi
}

# split_status OUTPUT: for the output of google_api, sets HTTP_BODY and HTTP_CODE.
# shellcheck disable=SC2034  # read by the calling script
split_status() {
  HTTP_CODE=$(printf '%s\n' "$1" | tail -n 1)
  HTTP_BODY=$(printf '%s\n' "$1" | sed '$d')
}
