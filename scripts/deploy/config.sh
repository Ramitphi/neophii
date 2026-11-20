# shellcheck shell=bash
# shellcheck disable=SC2034  # the variables are used by the scripts that source this file
# Single place for the deployment names. Every value can be overridden from the environment, e.g.
#   PROJECT=my-other-project REGION=europe-west1 scripts/deploy/30-deploy.sh
# Nothing in this file is a secret. Secret VALUES live only in Secret Manager.

PROJECT="${PROJECT:-neophi-515314}"
REGION="${REGION:-asia-south1}"
BUCKET="${BUCKET:-neophi-515314-neophi-media}"            # name only, no gs://
SA_NAME="${SA_NAME:-neophi-app}"
SA_EMAIL="${SA_EMAIL:-${SA_NAME}@${PROJECT}.iam.gserviceaccount.com}"
SERVICE="${SERVICE:-neophi}"                              # public Cloud Run service
AR_REPO="${AR_REPO:-neophi}"                              # Artifact Registry Docker repository
IMAGE_NAME="${IMAGE_NAME:-neophi}"
SMOKE_JOB="${SMOKE_JOB:-neophi-vertex-smoke}"            # Cloud Run Job for the Vertex smoke test

# Secret Manager secret NAMES (values are entered in the console by the owner).
SECRET_APP="${SECRET_APP:-neophi-meta-app-secret}"
SECRET_VERIFY="${SECRET_VERIFY:-neophi-meta-verify-token}"
SECRET_VERSION="${SECRET_VERSION:-latest}"

# Runtime settings for the service.
VERTEX_LOCATION="${VERTEX_LOCATION:-global}"              # GOOGLE_CLOUD_LOCATION for Gemini on Vertex
ANALYSIS_MODEL="${ANALYSIS_MODEL:-gemini-3.8-flash}"
EMBEDDING_MODEL="${EMBEDDING_MODEL:-gemini-embedding-2}"
POLL_MS="${POLL_MS:-5000}"                                # INSTAGRAM_WORKER_POLL_MS (in-process worker)
MIN_INSTANCES="${MIN_INSTANCES:-1}"
MAX_INSTANCES="${MAX_INSTANCES:-3}"

# Local, gitignored file with the four public Firebase web values (VITE_FIREBASE_*).
ENV_PRODUCTION_FILE="${ENV_PRODUCTION_FILE:-$REPO_ROOT/.env.production}"

AR_HOST="${REGION}-docker.pkg.dev"
IMAGE_BASE="${AR_HOST}/${PROJECT}/${AR_REPO}/${IMAGE_NAME}"
# Local, gitignored record of the last image 20-build.sh pushed (used by 30-deploy.sh / 50-vertex-smoke.sh).
STATE_DIR="${STATE_DIR:-$REPO_ROOT/.deploy}"
LAST_IMAGE_FILE="$STATE_DIR/last-image"

VITE_KEYS="VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_APP_ID"
REQUIRED_APIS="run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com storage.googleapis.com secretmanager.googleapis.com identitytoolkit.googleapis.com aiplatform.googleapis.com"
