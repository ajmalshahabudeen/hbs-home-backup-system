import 'package:dio/dio.dart';
import '../core/utils/session_token_cleaner.dart';
import '../models/user_model.dart';
import 'api_service.dart';
import 'storage_service.dart';

class AuthResult {
  final bool success;
  final UserModel? user;
  final String? token;
  final String? error;

  const AuthResult({
    required this.success,
    this.user,
    this.token,
    this.error,
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
      if (data['token'] != null) return data['token'].toString();
      if (data['session'] is Map && data['session']['token'] != null) {
        return data['session']['token'].toString();
      }
      if (data['sessionToken'] != null) return data['sessionToken'].toString();
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
      final token = _extractTokenFromResponse(res);
      UserModel? user;

      if (data['user'] is Map) {
        user = UserModel.fromJson(data['user'] as Map<String, dynamic>);
      }

      if (token.isNotEmpty) {
        await StorageService().saveSessionToken(token);
        ApiService().updateConfig(serverUrl: serverUrl, sessionToken: token);
      }

      return AuthResult(success: true, user: user, token: token);
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
      }

      if (token.isNotEmpty) {
        await StorageService().saveSessionToken(token);
        ApiService().updateConfig(serverUrl: serverUrl, sessionToken: token);
      }

      return AuthResult(success: true, user: user, token: token);
    } catch (e) {
      return AuthResult(success: false, error: e.toString());
    }
  }

  Future<UserModel?> restoreSession({required String serverUrl}) async {
    try {
      final token = await StorageService().getSessionToken();
      if (token == null || token.isEmpty) return null;

      final cleanUrl = serverUrl.endsWith('/') ? serverUrl.substring(0, serverUrl.length - 1) : serverUrl;
      final headers = SessionTokenCleaner.authHeaders(token);

      final res = await _dio.get(
        '$cleanUrl/api/auth/get-session',
        options: Options(
          headers: headers,
          connectTimeout: const Duration(seconds: 5),
          receiveTimeout: const Duration(seconds: 5),
          validateStatus: (status) => status == 200,
        ),
      );

      final data = res.data;
      if (data is Map && data['user'] is Map) {
        ApiService().updateConfig(serverUrl: serverUrl, sessionToken: token);
        return UserModel.fromJson(data['user'] as Map<String, dynamic>);
      }
      return null;
    } catch (_) {
      return null;
    }
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
      await StorageService().clearSessionToken();
    }
  }
}
