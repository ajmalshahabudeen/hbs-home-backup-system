class SessionTokenCleaner {
  /// Clean session tokens/cookies into a sanitized raw session token.
  /// Strips cookie prefixes, nested headers, URL encoding, signed cookie suffixes, and quotes.
  static String? cleanSessionToken(String? raw) {
    if (raw == null) return null;
    String s = raw.trim();
    if (s.isEmpty) return null;

    // Strip wrapping quotes
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.substring(1, s.length - 1).trim();
    }

    // If full cookie string (e.g. better-auth.session_token=xyz; Path=/...)
    final cookieMatch = RegExp(
      r'(?:^|;\s*)(?:__Secure-)?(?:better-auth\.session_token|session_token|token)=([^;]+)',
      caseSensitive: false,
    ).firstMatch(s);

    if (cookieMatch != null && cookieMatch.group(1) != null) {
      s = cookieMatch.group(1)!.trim();
    }

    // URL decode if percent-encoded
    try {
      s = Uri.decodeComponent(s);
    } catch (_) {
      // ignore
    }

    // Strip repeated prefixes
    s = s.replaceAll(
      RegExp(r'^(?:__Secure-)?(?:better-auth\.session_token=|session_token=|token=)+', caseSensitive: false),
      '',
    ).trim();

    // Strip signed cookie 's:' or 's%3A' prefix
    s = s.replaceAll(RegExp(r'^s%3A|^s:', caseSensitive: false), '').trim();

    // If signed token with dot (raw_token.signature), extract raw token
    if (s.contains('.')) {
      final dotParts = s.split('.');
      if (dotParts.isNotEmpty && dotParts[0].length >= 5) {
        s = dotParts[0].trim();
      }
    }

    return s.length >= 5 ? s : null;
  }

  static Map<String, String> authHeaders(String? token) {
    final cleaned = cleanSessionToken(token);
    if (cleaned == null) return {};
    return {
      'Authorization': 'Bearer $cleaned',
      'Cookie': 'better-auth.session_token=$cleaned',
      'x-session-token': cleaned,
    };
  }
}
