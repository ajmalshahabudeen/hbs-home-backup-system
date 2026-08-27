# HBS Cloud release signing

All GitHub Release APKs must be signed with **one** upload keystore. A new debug keystore on each CI runner is why Android reported a package conflict between two GitHub builds.

## Files (never commit)

| File | Purpose |
|------|---------|
| `keystore/hbs-release.jks` | The persistent PKCS12 keystore |
| `key.properties` | Passwords + alias for local `flutter build apk --release` |

A backup copy also lives at `%LOCALAPPDATA%/hbs-cloud/` on the machine that created the key. **If this file is lost, every phone must uninstall HBS Cloud before it can install a new APK.**

## GitHub Actions secrets

| Secret | Value |
|--------|--------|
| `ANDROID_KEYSTORE_BASE64` | `base64` of `hbs-release.jks` (no wrapping newlines) |
| `ANDROID_KEYSTORE_PASSWORD` | store password |
| `ANDROID_KEY_ALIAS` | `hbscloud` |
| `ANDROID_KEY_PASSWORD` | key password (same as store password) |

After creating the keystore, run `tool/upload-android-signing-secrets.sh` from `apps/hbs-app-flutter` (needs `gh auth login`).

## Google Sign-In

Add **this keystore's SHA-1** (not only the debug SHA-1) to the Android OAuth client `com.hbs.hbs_app_flutter`:

```bash
keytool -list -v -keystore android/keystore/hbs-release.jks -alias hbscloud
```
