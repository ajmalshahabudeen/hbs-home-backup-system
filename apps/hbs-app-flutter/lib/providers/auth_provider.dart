import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/user_model.dart';
import '../services/auth_service.dart';
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
    restoreSession();
  }

  Future<void> restoreSession() async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    final serverUrl = ref.read(serverProvider).url;
    final user = await AuthService().restoreSession(serverUrl: serverUrl);

    if (user != null) {
      state = state.copyWith(
        isLoading: false,
        isAuthenticated: true,
        user: user,
      );
    } else {
      state = state.copyWith(
        isLoading: false,
        isAuthenticated: false,
        user: null,
      );
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
      return true;
    } else {
      state = state.copyWith(
        isLoading: false,
        isAuthenticated: false,
        errorMessage: result.error ?? 'Sign in failed',
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
      return true;
    } else {
      state = state.copyWith(
        isLoading: false,
        isAuthenticated: false,
        errorMessage: result.error ?? 'Sign up failed',
      );
      return false;
    }
  }

  Future<void> signOut() async {
    final serverUrl = ref.read(serverProvider).url;
    await AuthService().signOut(serverUrl: serverUrl);
    state = const AuthState(
      isLoading: false,
      isAuthenticated: false,
      user: null,
    );
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref);
});
