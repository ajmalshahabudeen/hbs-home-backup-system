/// Maps Google Sign-In exception codes to an actionable message.
///
/// Android Credential Manager reports many config failures as `canceled`
/// after the account sheet — not a real user cancel.
class GoogleSignInErrors {
  static const canceledHint =
      'Google sign-in did not finish after picking an account. '
      'That usually means Google Cloud config, not a cancel: add an Android '
      'OAuth client for package com.hbs.hbs_app_flutter with this app\'s '
      'SHA-1 (from android/ ./gradlew signingReport), and keep GOOGLE_CLIENT_ID '
      'on the server as the Web client ID.';

  static String message({required String code, String? description}) {
    final normalized = code.split('.').last.toLowerCase();
    final extra = (description ?? '').trim();
    if (normalized == 'canceled' || normalized == 'cancelled') {
      if (extra.isEmpty) return canceledHint;
      return '$canceledHint ($extra)';
    }
    if (normalized == 'clientconfigurationerror') {
      return extra.isEmpty
          ? 'Google Sign-In is misconfigured. Check GOOGLE_CLIENT_ID (Web) on the server.'
          : extra;
    }
    if (extra.isNotEmpty) return extra;
    return 'Google sign-in failed ($code)';
  }
}
