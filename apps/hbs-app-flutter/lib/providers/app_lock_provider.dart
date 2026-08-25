import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/app_lock_service.dart';

class AppLockState {
  final bool isLocked;
  final bool isLockEnabled;
  final bool isBiometricsEnabled;
  final bool hasPin;

  const AppLockState({
    this.isLocked = false,
    this.isLockEnabled = false,
    this.isBiometricsEnabled = true,
    this.hasPin = false,
  });

  AppLockState copyWith({
    bool? isLocked,
    bool? isLockEnabled,
    bool? isBiometricsEnabled,
    bool? hasPin,
  }) {
    return AppLockState(
      isLocked: isLocked ?? this.isLocked,
      isLockEnabled: isLockEnabled ?? this.isLockEnabled,
      isBiometricsEnabled: isBiometricsEnabled ?? this.isBiometricsEnabled,
      hasPin: hasPin ?? this.hasPin,
    );
  }
}

class AppLockNotifier extends StateNotifier<AppLockState> {
  AppLockNotifier() : super(const AppLockState()) {
    _init();
  }

  void _init() {
    final lockService = AppLockService();
    final enabled = lockService.isLockEnabled();
    final bio = lockService.isBiometricsEnabled();
    final pin = lockService.getPin();

    state = AppLockState(
      isLocked: enabled && !lockService.isUnlockedForSession,
      isLockEnabled: enabled,
      isBiometricsEnabled: bio,
      hasPin: pin != null && pin.isNotEmpty,
    );
  }

  Future<bool> authenticateBiometrics() async {
    final ok = await AppLockService().authenticateWithBiometrics();
    if (ok) {
      AppLockService().markUnlocked();
      state = state.copyWith(isLocked: false);
      return true;
    }
    return false;
  }

  bool unlockWithPin(String pin) {
    final ok = AppLockService().verifyPin(pin);
    if (ok) {
      AppLockService().markUnlocked();
      state = state.copyWith(isLocked: false);
      return true;
    }
    return false;
  }

  Future<void> setLockEnabled(bool enabled) async {
    await AppLockService().setLockEnabled(enabled);
    state = state.copyWith(isLockEnabled: enabled);
  }

  Future<void> setBiometricsEnabled(bool enabled) async {
    await AppLockService().setBiometricsEnabled(enabled);
    state = state.copyWith(isBiometricsEnabled: enabled);
  }

  Future<void> setPin(String pin) async {
    await AppLockService().setPin(pin);
    state = state.copyWith(hasPin: pin.isNotEmpty);
  }

  void lockNow() {
    AppLockService().lockApp();
    state = state.copyWith(isLocked: true);
  }
}

final appLockProvider = StateNotifierProvider<AppLockNotifier, AppLockState>((ref) {
  return AppLockNotifier();
});
