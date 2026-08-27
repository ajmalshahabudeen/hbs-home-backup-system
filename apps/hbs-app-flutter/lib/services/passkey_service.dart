import 'package:dio/dio.dart';
import 'package:passkeys/authenticator.dart';
import 'package:passkeys/types.dart';
import '../core/utils/session_token_cleaner.dart';
import '../models/saved_account.dart';
import '../models/user_model.dart';
import 'api_service.dart';
import 'auth_service.dart';
import 'storage_service.dart';

/// Native OS passkey sheet (no in-app WebView) against Better Auth REST.
class PasskeyService {
  static final PasskeyService _instance = PasskeyService._internal();
  factory PasskeyService() => _instance;
  PasskeyService._internal();

  final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(seconds: 20),
    ),
  );

  String _origin(String serverUrl) {
    final clean = serverUrl.endsWith('/') ? serverUrl.substring(0, serverUrl.length - 1) : serverUrl;
    return clean;
  }

  bool _hostIsRawIp(String serverUrl) {
    final host = Uri.tryParse(_origin(serverUrl))?.host ?? '';
    return RegExp(r'^\d{1,3}(\.\d{1,3}){3}$').hasMatch(host);
  }

  Map<String, String> _headers(String serverUrl, {String? token, String? cookie}) {
    final origin = _origin(serverUrl);
    final headers = <String, String>{
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Origin': origin,
      'Referer': '$origin/',
    };
    if (token != null && token.isNotEmpty) {
      headers.addAll(SessionTokenCleaner.authHeaders(token));
    }
    if (cookie != null && cookie.isNotEmpty) {
      final existing = headers['Cookie'];
      headers['Cookie'] = (existing == null || existing.isEmpty) ? cookie : '$existing; $cookie';
    }
    return headers;
  }

  String _cookieHeader(Response res) {
    final setCookies = res.headers['set-cookie'] ?? const <String>[];
    return setCookies.map((c) => c.split(';').first.trim()).where((c) => c.contains('=')).join('; ');
  }

  Future<AuthResult> signIn({required String serverUrl}) async {
    try {
      final origin = _origin(serverUrl);
      if (_hostIsRawIp(serverUrl)) {
        return const AuthResult(
          success: false,
          error:
              'Passkeys cannot use a raw IP (WebAuthn RP ID must be a hostname). '
              'Connect via this PC\'s name, e.g. http://<pc-name>.local:38480, or sign in with Google / email.',
        );
      }

      final optionsRes = await _dio.get<dynamic>(
        '$origin/api/auth/passkey/generate-authenticate-options',
        options: Options(
          headers: _headers(serverUrl),
          validateStatus: (status) => status != null && status < 500,
        ),
      );
      if (optionsRes.statusCode != 200 || optionsRes.data is! Map) {
        return const AuthResult(success: false, error: 'Could not start passkey sign-in');
      }
      final options = Map<String, dynamic>.from(optionsRes.data as Map);
      final host = Uri.parse(origin).host;
      options['rpId'] = options['rpId'] ?? host;

      final authenticator = PasskeyAuthenticator();
      final assertion = await authenticator.authenticate(
        AuthenticateRequestType.fromJson(
          options,
          mediation: MediationType.Optional,
          preferImmediatelyAvailableCredentials: false,
        ),
      );

      final verifyRes = await _dio.post<dynamic>(
        '$origin/api/auth/passkey/verify-authentication',
        data: {'response': assertion.toJson()},
        options: Options(
          headers: _headers(serverUrl, cookie: _cookieHeader(optionsRes)),
          validateStatus: (status) => status != null && status < 500,
        ),
      );
      return await _finish(serverUrl: serverUrl, res: verifyRes, fallbackError: 'Passkey sign-in failed');
    } on PasskeyAuthCancelledException {
      return const AuthResult(success: false, error: 'Passkey cancelled');
    } on MissingGoogleSignInException {
      return const AuthResult(
        success: false,
        error: 'Sign in to a Google account on this phone first. Android passkeys sync through Google Password Manager.',
      );
    } on NoCredentialsAvailableException {
      return const AuthResult(
        success: false,
        error: 'No passkey is saved for HBS Cloud on this phone. Sign in with email, then register a passkey in Settings.',
      );
    } on DomainNotAssociatedException catch (e) {
      return AuthResult(
        success: false,
        error:
            'This app is not linked to the server hostname for passkeys. '
            'Use a hostname (not a raw IP) and HTTPS, or sign in with Google / email. ${e.message ?? ''}',
      );
    } on AuthenticatorException catch (e) {
      return AuthResult(success: false, error: e.toString());
    } catch (e) {
      return AuthResult(success: false, error: e.toString());
    }
  }

  Future<AuthResult> register({required String serverUrl}) async {
    try {
      final origin = _origin(serverUrl);
      final token = await StorageService().getSessionToken();
      if (token == null || token.isEmpty) {
        return const AuthResult(success: false, error: 'Sign in before registering a passkey');
      }
      if (_hostIsRawIp(serverUrl)) {
        return const AuthResult(
          success: false,
          error:
              'Passkeys cannot use a raw IP. Connect via this PC\'s hostname '
              '(e.g. http://<pc-name>.local:38480), then try again.',
        );
      }

      final optionsRes = await _dio.get<dynamic>(
        '$origin/api/auth/passkey/generate-register-options',
        options: Options(
          headers: _headers(serverUrl, token: token),
          validateStatus: (status) => status != null && status < 500,
        ),
      );
      if (optionsRes.statusCode == 401) {
        return const AuthResult(
          success: false,
          error: 'Session expired. Sign in again, then register a passkey.',
        );
      }
      if (optionsRes.statusCode != 200 || optionsRes.data is! Map) {
        final err = optionsRes.data is Map
            ? (optionsRes.data['message'] ?? optionsRes.data['error'] ?? 'Could not start passkey registration')
            : 'Could not start passkey registration';
        return AuthResult(success: false, error: err.toString());
      }
      final options = Map<String, dynamic>.from(optionsRes.data as Map);
      final host = Uri.parse(origin).host;
      if (options['rp'] is Map) {
        final rp = Map<String, dynamic>.from(options['rp'] as Map);
        rp['id'] = rp['id'] ?? host;
        rp['name'] = rp['name'] ?? 'HBS Cloud';
        options['rp'] = rp;
      }

      final authenticator = PasskeyAuthenticator();
      final attestation = await authenticator.register(RegisterRequestType.fromJson(options));

      final verifyRes = await _dio.post<dynamic>(
        '$origin/api/auth/passkey/verify-registration',
        data: {'response': attestation.toJson(), 'name': 'HBS Cloud phone'},
        options: Options(
          headers: _headers(serverUrl, token: token, cookie: _cookieHeader(optionsRes)),
          validateStatus: (status) => status != null && status < 500,
        ),
      );
      if (verifyRes.statusCode == 200 || verifyRes.statusCode == 201) {
        return const AuthResult(success: true);
      }
      final err = verifyRes.data is Map
          ? (verifyRes.data['message'] ?? verifyRes.data['error'] ?? 'Could not register passkey')
          : 'Could not register passkey';
      return AuthResult(success: false, error: err.toString());
    } on PasskeyAuthCancelledException {
      return const AuthResult(success: false, error: 'Passkey registration cancelled');
    } on MissingGoogleSignInException {
      return const AuthResult(
        success: false,
        error: 'Sign in to a Google account on this phone first. Android passkeys sync through Google Password Manager.',
      );
    } on DomainNotAssociatedException catch (e) {
      return AuthResult(
        success: false,
        error:
            'This app is not linked to the server hostname for passkeys. '
            'Use a hostname (not a raw IP) and HTTPS. ${e.message ?? ''}',
      );
    } on AuthenticatorException catch (e) {
      return AuthResult(success: false, error: e.toString());
    } catch (e) {
      return AuthResult(success: false, error: e.toString());
    }
  }

  Future<AuthResult> _finish({
    required String serverUrl,
    required Response res,
    required String fallbackError,
  }) async {
    if (res.statusCode != 200 && res.statusCode != 201) {
      final err = res.data is Map ? (res.data['message'] ?? res.data['error'] ?? fallbackError) : fallbackError;
      return AuthResult(success: false, error: err.toString());
    }
    final data = res.data is Map ? res.data as Map : <String, dynamic>{};
    String token = '';
    if (data['session'] is Map && data['session']['token'] != null) {
      token = data['session']['token'].toString();
    }
    if (token.isEmpty && data['token'] != null) {
      token = data['token'].toString();
    }
    final setCookies = res.headers['set-cookie'] ?? const <String>[];
    for (final cookie in setCookies) {
      final cleaned = SessionTokenCleaner.cleanSessionToken(cookie);
      if (cleaned != null && cleaned.isNotEmpty) {
        token = cleaned;
        break;
      }
    }
    final cleanToken = SessionTokenCleaner.cleanSessionToken(token) ?? token;
    if (cleanToken.isEmpty) {
      return const AuthResult(success: false, error: 'Passkey succeeded but no session was returned');
    }
    UserModel? user;
    if (data['user'] is Map) {
      user = UserModel.fromJson(Map<String, dynamic>.from(data['user'] as Map));
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
    user ??= await AuthService().restoreSession(serverUrl: serverUrl);
    return AuthResult(success: true, user: user, token: cleanToken);
  }
}
