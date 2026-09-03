import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/user_model.dart';
import '../services/auth_service.dart';
import '../services/device_service.dart';
import '../services/storage_service.dart';
import 'backup_provider.dart';
import 'server_provider.dart';

class AuthState {
  final bool isLoading;
  final bool isAuthenticated;
  final UserModel? user;
  final String? token;
  final String? errorMessage;

  const AuthState({
    this.isLoading = false,
    this.isAuthenticated = false,
    this.user,
    this.token,
    this.errorMessage,
  });

  AuthState copyWith({
    bool? isLoading,
    bool? isAuthenticated,
    UserModel? user,
    String? token,
    String? errorMessage,
  }) {
    return AuthState(
      isLoading: isLoading ?? this.isLoading,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      user: user ?? this.user,
      token: token ?? this.token,
      errorMessage: errorMessage,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  final Ref ref;

  AuthNotifier(this.ref) : super(const AuthState(isLoading: true)) {
    _initSession();
  }

  Future<void> _initSession() async {
    final isLoggedOut = StorageService().isUserLoggedOut();
    final cachedUser = StorageService().getCurrentUser();
    final cachedToken = await StorageService().getSessionToken();

    // Instant warm hydration from local disk
    if (!isLoggedOut && (cachedUser != null || (cachedToken != null && cachedToken.isNotEmpty))) {
      state = state.copyWith(
        isLoading: false,
        isAuthenticated: true,
        user: cachedUser,
        token: cachedToken,
      );
    }

    // Asynchronously validate / refresh with server in background
    await restoreSession();
  }

  Future<void> restoreSession() async {
    if (StorageService().isUserLoggedOut()) {
      state = const AuthState(isLoading: false, isAuthenticated: false);
      return;
    }

    final serverUrl = ref.read(serverProvider).url;
    final user = await AuthService().restoreSession(serverUrl: serverUrl);

    if (user != null) {
      final token = await StorageService().getSessionToken();
      state = state.copyWith(
        isLoading: false,
        isAuthenticated: true,
        user: user,
        token: token,
      );
      DeviceService().registerAndPing();
    } else {
      if (StorageService().isUserLoggedOut()) {
        state = const AuthState(
          isLoading: false,
          isAuthenticated: false,
          user: null,
          token: null,
        );
      } else {
        // Retain cached session if server is offline or unreachable
        final cachedUser = StorageService().getCurrentUser();
        final cachedToken = await StorageService().getSessionToken();
        if (cachedUser != null || cachedToken != null) {
          state = state.copyWith(
            isLoading: false,
            isAuthenticated: true,
            user: cachedUser,
            token: cachedToken,
          );
        } else {
          state = const AuthState(
            isLoading: false,
            isAuthenticated: false,
            user: null,
            token: null,
          );
        }
      }
    }
  }

  Future<bool> signIn(String email, String password) async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    final serverUrl = ref.read(serverProvider).url;
    final result = await AuthService().signIn(
      serverUrl: serverUrl,
      email: email,
      password: password,
    );

    if (result.success) {
      state = state.copyWith(
        isLoading: false,
        isAuthenticated: true,
        user: result.user,
        token: result.token,
      );
      DeviceService().registerAndPing();
      return true;
    } else {
      state = state.copyWith(
        isLoading: false,
        errorMessage: result.needsTwoFactor ? '2FA_REQUIRED' : (result.error ?? 'Sign in failed'),
      );
      return false;
    }
  }

  Future<bool> signUp(String name, String email, String password) async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    final serverUrl = ref.read(serverProvider).url;
    final result = await AuthService().signUp(
      serverUrl: serverUrl,
      name: name,
      email: email,
      password: password,
    );

    if (result.success) {
      state = state.copyWith(
        isLoading: false,
        isAuthenticated: true,
        user: result.user,
        token: result.token,
      );
      DeviceService().registerAndPing();
      return true;
    } else {
      state = state.copyWith(
        isLoading: false,
        errorMessage: result.error ?? 'Sign up failed',
      );
      return false;
    }
  }

  Future<bool> signInWithGoogle() async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    final serverUrl = ref.read(serverProvider).url;
    final result = await AuthService().signInWithGoogle(serverUrl: serverUrl);
    if (result.success) {
      state = state.copyWith(
        isLoading: false,
        isAuthenticated: true,
        user: result.user,
        token: result.token,
      );
      DeviceService().registerAndPing();
      return true;
    }
    state = state.copyWith(
      isLoading: false,
      errorMessage: result.error ?? 'Google sign in failed',
    );
    return false;
  }

  Future<bool> signInWithPasskey() async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    final serverUrl = ref.read(serverProvider).url;
    final result = await AuthService().signInWithPasskey(serverUrl: serverUrl);
    if (result.success) {
      state = state.copyWith(
        isLoading: false,
        isAuthenticated: true,
        user: result.user,
        token: result.token,
      );
      DeviceService().registerAndPing();
      return true;
    }
    state = state.copyWith(isLoading: false, errorMessage: result.error ?? 'Passkey failed');
    return false;
  }

  Future<bool> verifyTotp(String code) async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    final serverUrl = ref.read(serverProvider).url;
    final result = await AuthService().verifyTotp(serverUrl: serverUrl, code: code);
    if (result.success) {
      state = state.copyWith(
        isLoading: false,
        isAuthenticated: true,
        user: result.user,
        token: result.token,
      );
      DeviceService().registerAndPing();
      return true;
    }
    state = state.copyWith(isLoading: false, errorMessage: result.error ?? 'Invalid code');
    return false;
  }

  Future<void> signOut() async {
    state = state.copyWith(isLoading: true);
    await ref.read(backupProvider.notifier).stopAndCancelBackup();
    final serverUrl = ref.read(serverProvider).url;
    await AuthService().signOut(serverUrl: serverUrl);
    state = const AuthState(
      isLoading: false,
      isAuthenticated: false,
      user: null,
      token: null,
    );
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref);
});
