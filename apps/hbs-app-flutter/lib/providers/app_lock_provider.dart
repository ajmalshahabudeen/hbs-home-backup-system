import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/utils/pin_validator.dart';
import '../services/app_lock_service.dart';

class AppLockState {
  final bool isLocked;
  final bool isLockEnabled;
  final bool isDeviceLockEnabled;
  final bool isBiometricsEnabled;
  final bool hasPin;
  final bool deviceAuthAvailable;

  const AppLockState({
    this.isLocked = false,
    this.isLockEnabled = false,
    this.isDeviceLockEnabled = false,
    this.isBiometricsEnabled = true,
    this.hasPin = false,
    this.deviceAuthAvailable = false,
  });

  AppLockState copyWith({
    bool? isLocked,
    bool? isLockEnabled,
    bool? isDeviceLockEnabled,
    bool? isBiometricsEnabled,
    bool? hasPin,
    bool? deviceAuthAvailable,
  }) {
    return AppLockState(
      isLocked: isLocked ?? this.isLocked,
      isLockEnabled: isLockEnabled ?? this.isLockEnabled,
      isDeviceLockEnabled: isDeviceLockEnabled ?? this.isDeviceLockEnabled,
      isBiometricsEnabled: isBiometricsEnabled ?? this.isBiometricsEnabled,
      hasPin: hasPin ?? this.hasPin,
      deviceAuthAvailable: deviceAuthAvailable ?? this.deviceAuthAvailable,
    );
  }
}

class AppLockNotifier extends StateNotifier<AppLockState> {
  AppLockNotifier() : super(const AppLockState()) {
    _init();
  }

  Future<void> _init() async {
    final lockService = AppLockService();
    final enabled = lockService.isLockEnabled();
    final device = lockService.isDeviceLockEnabled();
    final bio = lockService.isBiometricsEnabled();
    final pin = lockService.getPin();
    final deviceAvailable = await lockService.isDeviceAuthAvailable();
    final canLock = enabled && (device || pin != null);

    state = AppLockState(
      isLocked: canLock && !lockService.isUnlockedForSession,
      isLockEnabled: canLock,
      isDeviceLockEnabled: device,
      isBiometricsEnabled: bio,
      hasPin: pin != null,
      deviceAuthAvailable: deviceAvailable,
    );
  }

  Future<bool> authenticateDevice() async {
    final ok = await AppLockService().authenticatePreferred();
    if (ok) {
      AppLockService().markUnlocked();
      state = state.copyWith(isLocked: false);
      return true;
    }
    return false;
  }

  Future<bool> authenticateBiometrics() => authenticateDevice();

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
    state = state.copyWith(
      isLockEnabled: enabled,
      isLocked: enabled ? state.isLocked : false,
    );
    if (!enabled) {
      AppLockService().markUnlocked();
    }
  }

  Future<bool> enableDeviceLock() async {
    final available = await AppLockService().isDeviceAuthAvailable();
    if (!available) {
      state = state.copyWith(deviceAuthAvailable: false);
      return false;
    }
    final ok = await AppLockService().authenticatePreferred();
    if (!ok) return false;
    await AppLockService().setDeviceLockEnabled(true);
    await AppLockService().setLockEnabled(true);
    AppLockService().markUnlocked();
    state = state.copyWith(
      isDeviceLockEnabled: true,
      isLockEnabled: true,
      isLocked: false,
      deviceAuthAvailable: true,
    );
    return true;
  }

  Future<void> disableDeviceLock() async {
    await AppLockService().setDeviceLockEnabled(false);
    final stillLocked = state.hasPin;
    if (!stillLocked) {
      await AppLockService().setLockEnabled(false);
      AppLockService().markUnlocked();
    }
    state = state.copyWith(
      isDeviceLockEnabled: false,
      isLockEnabled: stillLocked,
      isLocked: false,
    );
  }

  Future<void> setBiometricsEnabled(bool enabled) async {
    await AppLockService().setBiometricsEnabled(enabled);
    state = state.copyWith(isBiometricsEnabled: enabled);
  }

  Future<bool> setPin(String pin) async {
    final clean = PinValidator.sanitize(pin);
    if (clean == null) return false;
    final saved = await AppLockService().setPin(clean);
    if (!saved) return false;
    await AppLockService().setLockEnabled(true);
    state = state.copyWith(hasPin: true, isLockEnabled: true);
    return true;
  }

  Future<void> clearPin() async {
    await AppLockService().clearPin();
    final stillLocked = state.isDeviceLockEnabled;
    if (!stillLocked) {
      await AppLockService().setLockEnabled(false);
      AppLockService().markUnlocked();
    }
    state = state.copyWith(
      hasPin: false,
      isLockEnabled: stillLocked,
      isLocked: false,
    );
  }

  void lockNow() {
    if (!state.isLockEnabled) return;
    AppLockService().lockApp();
    state = state.copyWith(isLocked: true);
  }
}

final appLockProvider = StateNotifierProvider<AppLockNotifier, AppLockState>((ref) {
  return AppLockNotifier();
});
