import 'package:flutter_test/flutter_test.dart';
import 'package:hbs_app_flutter/core/utils/formatters.dart';
import 'package:hbs_app_flutter/core/utils/session_token_cleaner.dart';

void main() {
  group('SessionTokenCleaner Tests', () {
    test('Cleans cookie string correctly', () {
      const cookie = 'better-auth.session_token=abc123456789; Path=/; HttpOnly';
      expect(SessionTokenCleaner.cleanSessionToken(cookie), 'abc123456789');
    });

    test('Cleans signed token with prefix and signature', () {
      const signed = 's:token_value_long.xyzSignature123';
      expect(SessionTokenCleaner.cleanSessionToken(signed), 'token_value_long');
    });

    test('Generates valid auth headers', () {
      final headers = SessionTokenCleaner.authHeaders('token_12345');
      expect(headers['Authorization'], 'Bearer token_12345');
      expect(headers['Cookie'], 'better-auth.session_token=token_12345');
      expect(headers['x-session-token'], 'token_12345');
    });
  });

  group('Formatters Tests', () {
    test('Formats bytes properly', () {
      expect(Formatters.formatBytes(500), '500.0 B');
      expect(Formatters.formatBytes(1024), '1.0 KB');
      expect(Formatters.formatBytes(1024 * 1024 * 5), '5.0 MB');
      expect(Formatters.formatBytes(1024 * 1024 * 1024 * 2), '2.0 GB');
    });

    test('Determines mime category accurately', () {
      expect(Formatters.getMimeTypeCategory('image/jpeg', 'photo.jpg'), 'photo');
      expect(Formatters.getMimeTypeCategory('video/mp4', 'movie.mp4'), 'video');
      expect(Formatters.getMimeTypeCategory('application/pdf', 'doc.pdf'), 'doc');
    });
  });
}
