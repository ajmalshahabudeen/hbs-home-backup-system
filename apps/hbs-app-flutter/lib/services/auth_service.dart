import 'package:dio/dio.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../core/utils/session_token_cleaner.dart';
import '../models/saved_account.dart';
import '../models/user_model.dart';
import 'api_service.dart';
import 'storage_service.dart';

class AuthResult {
  final bool success;
  final UserModel? user;
  final String? token;
  final String? error;
  final bool needsTwoFactor;

  const AuthResult({
    required this.success,
    this.user,
    this.token,
    this.error,
    this.needsTwoFactor = false,
  });
}

class AuthService {
  static final AuthService _instance = AuthService._internal();
  factory AuthService() => _instance;
  AuthService._internal();

  final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
    ),
  );

  String _extractTokenFromResponse(Response res) {
    // 1. Check body token/session
    final data = res.data;
    if (data is Map) {
      if (data['token'] != null) {
        final cleaned = SessionTokenCleaner.cleanSessionToken(data['token'].toString());
        if (cleaned != null) return cleaned;
      }
      if (data['session'] is Map && data['session']['token'] != null) {
        final cleaned = SessionTokenCleaner.cleanSessionToken(data['session']['token'].toString());
        if (cleaned != null) return cleaned;
      }
      if (data['sessionToken'] != null) {
        final cleaned = SessionTokenCleaner.cleanSessionToken(data['sessionToken'].toString());
        if (cleaned != null) return cleaned;
      }
    }

    // 2. Check Set-Cookie headers
    final cookies = res.headers['set-cookie'] ?? [];
    for (final cookie in cookies) {
      final cleaned = SessionTokenCleaner.cleanSessionToken(cookie);
      if (cleaned != null) return cleaned;
    }

    return '';
  }

  Future<AuthResult> signIn({
    required String serverUrl,
    required String email,
    required String password,
  }) async {
    try {
      final cleanUrl = serverUrl.endsWith('/') ? serverUrl.substring(0, serverUrl.length - 1) : serverUrl;
      final res = await _dio.post(
        '$cleanUrl/api/auth/sign-in/email',
        data: {
          'email': email.trim(),
          'password': password,
        },
        options: Options(
          headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
          validateStatus: (status) => status != null && status < 500,
        ),
      );

      if (res.statusCode != 200 && res.statusCode != 201) {
        final err = res.data is Map ? (res.data['message'] ?? res.data['error'] ?? 'Sign in failed') : 'Sign in failed';
        return AuthResult(success: false, error: err.toString());
      }

      final data = res.data is Map ? res.data as Map<String, dynamic> : <String, dynamic>{};
      if (data['twoFactorRedirect'] == true) {
        return const AuthResult(success: false, needsTwoFactor: true);
      }
      final token = _extractTokenFromResponse(res);
      UserModel? user;

      if (data['user'] is Map) {
        user = UserModel.fromJson(data['user'] as Map<String, dynamic>);
      } else {
        user = UserModel(id: '', email: email.trim(), name: email.split('@')[0]);
      }

      final cleanToken = SessionTokenCleaner.cleanSessionToken(token) ?? token;

      if (cleanToken.isNotEmpty) {
        await StorageService().saveSessionToken(cleanToken);
        await StorageService().saveAuthCredentials(email, password);
        await StorageService().saveCurrentUser(user);
        await StorageService().setUserLoggedOut(false);
        await StorageService().upsertSavedAccount(SavedAccount(
          email: email.trim(),
          password: password,
          name: user.name,
          serverUrl: serverUrl,
        ));
        ApiService().updateConfig(serverUrl: serverUrl, sessionToken: cleanToken);
      }

      return AuthResult(success: true, user: user, token: cleanToken);
    } catch (e) {
      return AuthResult(success: false, error: e.toString());
    }
  }

  Future<AuthResult> signInWithGoogle({required String serverUrl}) async {
    try {
      final cleanUrl = serverUrl.endsWith('/') ? serverUrl.substring(0, serverUrl.length - 1) : serverUrl;
      String? webClientId;
      try {
        final health = await _dio.get('$cleanUrl/api/health');
        final google = health.data is Map ? health.data['google'] : null;
        if (google is Map) webClientId = google['webClientId']?.toString();
      } catch (_) {}
      if (webClientId == null || webClientId.isEmpty) {
        return const AuthResult(
          success: false,
          error: 'Google is not configured on the HBS server. Set GOOGLE_CLIENT_ID (Web client) and GOOGLE_CLIENT_SECRET.',
        );
      }

      await GoogleSignIn.instance.initialize(serverClientId: webClientId);
      final account = await GoogleSignIn.instance.authenticate();
      final idToken = account.authentication.idToken;
      if (idToken == null || idToken.isEmpty) {
        return const AuthResult(
          success: false,
          error: 'Google did not return an ID token. Add an Android OAuth client with this app SHA-1 in Google Cloud Console.',
        );
      }

      final res = await _dio.post(
        '$cleanUrl/api/auth/sign-in/social',
        data: {
          'provider': 'google',
          'idToken': {'token': idToken},
        },
        options: Options(
          headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
          validateStatus: (status) => status != null && status < 500,
        ),
      );
      if (res.statusCode != 200 && res.statusCode != 201) {
        final err = res.data is Map ? (res.data['message'] ?? res.data['error'] ?? 'Google sign-in failed') : 'Google sign-in failed';
        return AuthResult(success: false, error: err.toString());
      }
      final token = _extractTokenFromResponse(res);
      final cleanToken = SessionTokenCleaner.cleanSessionToken(token) ?? token;
      if (cleanToken.isEmpty) {
        return const AuthResult(success: false, error: 'Server accepted Google but did not return a session token.');
      }
      UserModel? user;
      if (res.data is Map && res.data['user'] is Map) {
        user = UserModel.fromJson(Map<String, dynamic>.from(res.data['user'] as Map));
      }
      await StorageService().saveSessionToken(cleanToken);
      await StorageService().setUserLoggedOut(false);
      if (user != null) {
        await StorageService().saveCurrentUser(user);
        await StorageService().upsertSavedAccount(SavedAccount(
          email: user.email,
          password: '',
          name: user.name,
          serverUrl: serverUrl,
        ));
      }
      ApiService().updateConfig(serverUrl: serverUrl, sessionToken: cleanToken);
      user ??= await restoreSession(serverUrl: serverUrl);
      return AuthResult(success: true, user: user, token: cleanToken);
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) {
        return const AuthResult(success: false, error: 'Google sign-in cancelled');
      }
      return AuthResult(success: false, error: e.toString());
    } catch (e) {
      return AuthResult(success: false, error: e.toString());
    }
  }

  String passkeySignInUrl(String serverUrl) {
    final cleanUrl = serverUrl.endsWith('/') ? serverUrl.substring(0, serverUrl.length - 1) : serverUrl;
    return '$cleanUrl/auth/passkey';
  }

  Future<String> passkeyRegisterUrl(String serverUrl) async {
    final cleanUrl = serverUrl.endsWith('/') ? serverUrl.substring(0, serverUrl.length - 1) : serverUrl;
    final token = await StorageService().getSessionToken() ?? '';
    return '$cleanUrl/auth/passkey-register?token=${Uri.encodeComponent(token)}';
  }

  Future<AuthResult> finishOAuthRedirect({required String serverUrl, required Uri uri}) async {
    try {
      final rawToken = uri.queryParameters['token'] ?? '';
      final cleanToken = SessionTokenCleaner.cleanSessionToken(rawToken) ?? rawToken;
      if (cleanToken.isEmpty) {
        return const AuthResult(success: false, error: 'Sign-in did not return a session');
      }
      await StorageService().saveSessionToken(cleanToken);
      await StorageService().setUserLoggedOut(false);
      ApiService().updateConfig(serverUrl: serverUrl, sessionToken: cleanToken);
      final user = await restoreSession(serverUrl: serverUrl);
      return AuthResult(success: true, user: user, token: cleanToken);
    } catch (e) {
      return AuthResult(success: false, error: e.toString());
    }
  }

  Future<AuthResult> signUp({
    required String serverUrl,
    required String name,
    required String email,
    required String password,
  }) async {
    try {
      final cleanUrl = serverUrl.endsWith('/') ? serverUrl.substring(0, serverUrl.length - 1) : serverUrl;
      final res = await _dio.post(
        '$cleanUrl/api/auth/sign-up/email',
        data: {
          'name': name.trim(),
          'email': email.trim(),
          'password': password,
        },
        options: Options(
          headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
          validateStatus: (status) => status != null && status < 500,
        ),
      );

      if (res.statusCode != 200 && res.statusCode != 201) {
        final err = res.data is Map ? (res.data['message'] ?? res.data['error'] ?? 'Registration failed') : 'Registration failed';
        return AuthResult(success: false, error: err.toString());
      }

      final data = res.data is Map ? res.data as Map<String, dynamic> : <String, dynamic>{};
      final token = _extractTokenFromResponse(res);
      UserModel? user;

      if (data['user'] is Map) {
        user = UserModel.fromJson(data['user'] as Map<String, dynamic>);
      } else {
        user = UserModel(id: '', email: email.trim(), name: name.trim());
      }

      final cleanToken = SessionTokenCleaner.cleanSessionToken(token) ?? token;

      if (cleanToken.isNotEmpty) {
        await StorageService().saveSessionToken(cleanToken);
        await StorageService().saveAuthCredentials(email, password);
        await StorageService().saveCurrentUser(user);
        await StorageService().setUserLoggedOut(false);
        await StorageService().upsertSavedAccount(SavedAccount(
          email: email.trim(),
          password: password,
          name: user.name,
          serverUrl: serverUrl,
        ));
        ApiService().updateConfig(serverUrl: serverUrl, sessionToken: cleanToken);
      }

      return AuthResult(success: true, user: user, token: cleanToken);
    } catch (e) {
      return AuthResult(success: false, error: e.toString());
    }
  }

  Future<UserModel?> restoreSession({required String serverUrl}) async {
    // 1. If user explicitly logged out, do not restore
    if (StorageService().isUserLoggedOut()) {
      return null;
    }

    final cachedToken = await StorageService().getSessionToken();
    final cachedUser = StorageService().getCurrentUser();

    // 2. If no token, check for saved credentials to auto-login
    if (cachedToken == null || cachedToken.isEmpty) {
      final creds = await StorageService().getAuthCredentials();
      if (creds != null && creds['email'] != null && creds['password'] != null) {
        final res = await signIn(
          serverUrl: serverUrl,
          email: creds['email']!,
          password: creds['password']!,
        );
        if (res.success && res.user != null) {
          return res.user;
        }
      }
      return null;
    }

    // 3. Immediately configure ApiService with cached token
    ApiService().updateConfig(serverUrl: serverUrl, sessionToken: cachedToken);

    try {
      final cleanUrl = serverUrl.endsWith('/') ? serverUrl.substring(0, serverUrl.length - 1) : serverUrl;
      final headers = SessionTokenCleaner.authHeaders(cachedToken);

      final res = await _dio.get(
        '$cleanUrl/api/auth/get-session',
        options: Options(
          headers: headers,
          connectTimeout: const Duration(seconds: 4),
          receiveTimeout: const Duration(seconds: 4),
          validateStatus: (status) => status != null && status < 500,
        ),
      );

      if (res.statusCode == 200) {
        final data = res.data;
        if (data is Map && data['user'] is Map) {
          final user = UserModel.fromJson(data['user'] as Map<String, dynamic>);
          final newToken = _extractTokenFromResponse(res);
          final effectiveToken = newToken.isNotEmpty ? (SessionTokenCleaner.cleanSessionToken(newToken) ?? newToken) : cachedToken;
          await StorageService().saveSessionToken(effectiveToken);
          await StorageService().saveCurrentUser(user);
          await StorageService().setUserLoggedOut(false);
          ApiService().updateConfig(serverUrl: serverUrl, sessionToken: effectiveToken);
          return user;
        }
      } else if (res.statusCode == 401 || res.statusCode == 403) {
        // Token expired/invalidated on server: attempt auto re-login with stored credentials
        final creds = await StorageService().getAuthCredentials();
        if (creds != null && creds['email'] != null && creds['password'] != null) {
          final reAuth = await signIn(
            serverUrl: serverUrl,
            email: creds['email']!,
            password: creds['password']!,
          );
          if (reAuth.success && reAuth.user != null) {
            return reAuth.user;
          }
        }
        // Credentials invalid
        await StorageService().clearAllAuthData();
        return null;
      }
    } catch (_) {
      // Network timeout / offline / connection refused:
      // Return cached user so user remains authenticated offline without forced logout
      if (cachedUser != null) {
        return cachedUser;
      }
    }

    return cachedUser;
  }

  Future<AuthResult> autoAuthenticateUser(String targetServerUrl) async {
    if (StorageService().isUserLoggedOut()) {
      return const AuthResult(success: false, error: 'User is logged out');
    }
    final user = await restoreSession(serverUrl: targetServerUrl);
    if (user != null) {
      final token = await StorageService().getSessionToken();
      return AuthResult(success: true, user: user, token: token);
    }
    return const AuthResult(success: false, error: 'Auto-authentication failed');
  }

  Future<AuthResult> verifyTotp({required String serverUrl, required String code}) async {
    try {
      final cleanUrl = serverUrl.endsWith('/') ? serverUrl.substring(0, serverUrl.length - 1) : serverUrl;
      final res = await _dio.post(
        '$cleanUrl/api/auth/two-factor/verify-totp',
        data: {'code': code.trim()},
        options: Options(
          headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
          validateStatus: (status) => status != null && status < 500,
        ),
      );
      if (res.statusCode != 200 && res.statusCode != 201) {
        return const AuthResult(success: false, error: 'Invalid authenticator code');
      }
      final token = _extractTokenFromResponse(res);
      final cleanToken = SessionTokenCleaner.cleanSessionToken(token) ?? token;
      if (cleanToken.isNotEmpty) {
        await StorageService().saveSessionToken(cleanToken);
        await StorageService().setUserLoggedOut(false);
        ApiService().updateConfig(serverUrl: serverUrl, sessionToken: cleanToken);
      }
      final user = await restoreSession(serverUrl: serverUrl);
      return AuthResult(success: true, user: user, token: cleanToken);
    } catch (e) {
      return AuthResult(success: false, error: e.toString());
    }
  }

  Future<Map<String, dynamic>?> enableTwoFactor({
    required String serverUrl,
    required String password,
  }) async {
    final token = await StorageService().getSessionToken();
    final cleanUrl = serverUrl.endsWith('/') ? serverUrl.substring(0, serverUrl.length - 1) : serverUrl;
    final res = await _dio.post(
      '$cleanUrl/api/auth/two-factor/enable',
      data: {'password': password},
      options: Options(
        headers: {
          ...SessionTokenCleaner.authHeaders(token),
          'Content-Type': 'application/json',
        },
        validateStatus: (status) => status != null && status < 500,
      ),
    );
    if (res.data is Map) return Map<String, dynamic>.from(res.data as Map);
    return null;
  }

  Future<bool> disableTwoFactor({required String serverUrl, required String password}) async {
    final token = await StorageService().getSessionToken();
    final cleanUrl = serverUrl.endsWith('/') ? serverUrl.substring(0, serverUrl.length - 1) : serverUrl;
    final res = await _dio.post(
      '$cleanUrl/api/auth/two-factor/disable',
      data: {'password': password},
      options: Options(
        headers: {...SessionTokenCleaner.authHeaders(token), 'Content-Type': 'application/json'},
        validateStatus: (status) => status != null && status < 500,
      ),
    );
    return res.statusCode == 200;
  }

  Future<List<String>> generateBackupCodes({required String serverUrl, required String password}) async {
    final token = await StorageService().getSessionToken();
    final cleanUrl = serverUrl.endsWith('/') ? serverUrl.substring(0, serverUrl.length - 1) : serverUrl;
    final res = await _dio.post(
      '$cleanUrl/api/auth/two-factor/generate-backup-codes',
      data: {'password': password},
      options: Options(
        headers: {...SessionTokenCleaner.authHeaders(token), 'Content-Type': 'application/json'},
        validateStatus: (status) => status != null && status < 500,
      ),
    );
    final data = res.data;
    if (data is Map && data['backupCodes'] is List) {
      return (data['backupCodes'] as List).map((e) => e.toString()).toList();
    }
    return [];
  }

  Future<void> signOut({required String serverUrl}) async {
    try {
      final token = await StorageService().getSessionToken();
      if (token != null && token.isNotEmpty) {
        final cleanUrl = serverUrl.endsWith('/') ? serverUrl.substring(0, serverUrl.length - 1) : serverUrl;
        final headers = SessionTokenCleaner.authHeaders(token);
        await _dio.post(
          '$cleanUrl/api/auth/sign-out',
          options: Options(headers: headers),
        ).catchError((_) => Response(requestOptions: RequestOptions()));
      }
    } finally {
      await StorageService().clearAllAuthData();
      ApiService().updateConfig(serverUrl: serverUrl, sessionToken: null);
    }
  }
}
