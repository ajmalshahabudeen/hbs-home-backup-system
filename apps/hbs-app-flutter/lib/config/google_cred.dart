/// Google Sign-In IDs for the Flutter app.
///
/// Paste the **Android** OAuth client ID from Google Cloud Console
/// (APIs & Services → Credentials → type Android, package
/// `com.hbs.hbs_app_flutter`). It looks like
/// `123456789-xxxx.apps.googleusercontent.com`.
///
/// This is **not** the same value as `apps/server/.env` `GOOGLE_CLIENT_ID`.
/// That one must stay the **Web** client ID (plus `GOOGLE_CLIENT_SECRET`).
class GoogleCred {
  static const androidClientId = '246350176283-o60fipcgbs0r8v3r565istkriumocimn.apps.googleusercontent.com';

  static String? get androidClientIdOrNull {
    final id = androidClientId.trim();
    return id.isEmpty ? null : id;
  }
}
