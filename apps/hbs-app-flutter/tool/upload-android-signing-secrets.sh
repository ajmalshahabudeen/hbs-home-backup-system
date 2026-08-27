#!/usr/bin/env bash
# Upload the local release keystore to GitHub Actions secrets.
# Requires: gh (authenticated), key.properties, keystore/hbs-release.jks
#
# Safe to run from PowerShell:  bash tool/upload-android-signing-secrets.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROPS="$ROOT/android/key.properties"
STORE="$ROOT/android/keystore/hbs-release.jks"

to_win() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$p"
    return
  fi
  # Git Bash: /c/foo/bar -> C:/foo/bar (Windows Python cannot read /c/...)
  if [[ "$p" =~ ^/([a-zA-Z])/(.*)$ ]]; then
    local drive="${BASH_REMATCH[1]}"
    local rest="${BASH_REMATCH[2]}"
    echo "$(echo "$drive" | tr '[:lower:]' '[:upper:]'):/$rest"
    return
  fi
  echo "$p"
}

file_b64() {
  local f="$1"
  # Encode from the file's directory so native openssl/python see a simple name.
  (
    cd "$(dirname "$f")"
    local name
    name="$(basename "$f")"
    if command -v openssl >/dev/null 2>&1; then
      openssl base64 -A -in "$name"
      return
    fi
    python -c "import base64,pathlib,sys; sys.stdout.write(base64.b64encode(pathlib.Path(sys.argv[1]).read_bytes()).decode())" "$name"
  )
}

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI (gh) and run: gh auth login" >&2
  exit 1
fi
if [[ ! -f "$PROPS" || ! -f "$STORE" ]]; then
  echo "Missing $PROPS or $STORE. Generate the keystore first." >&2
  exit 1
fi

storePassword="$(grep -E '^storePassword=' "$PROPS" | cut -d= -f2-)"
keyPassword="$(grep -E '^keyPassword=' "$PROPS" | cut -d= -f2-)"
keyAlias="$(grep -E '^keyAlias=' "$PROPS" | cut -d= -f2-)"

if [[ -z "$storePassword" || -z "$keyPassword" || -z "$keyAlias" ]]; then
  echo "key.properties is incomplete." >&2
  exit 1
fi

b64="$(file_b64 "$STORE")"
if [[ -z "$b64" ]]; then
  echo "Failed to base64-encode the keystore." >&2
  exit 1
fi

printf '%s' "$b64" | gh secret set ANDROID_KEYSTORE_BASE64
printf '%s' "$storePassword" | gh secret set ANDROID_KEYSTORE_PASSWORD
printf '%s' "$keyAlias" | gh secret set ANDROID_KEY_ALIAS
printf '%s' "$keyPassword" | gh secret set ANDROID_KEY_PASSWORD

echo "Uploaded ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD."
echo "Next GitHub tag v* will sign the APK with this key."
