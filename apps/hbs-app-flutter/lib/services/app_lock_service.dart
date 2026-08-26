import 'package:local_auth/local_auth.dart';
import '../core/utils/pin_validator.dart';
import 'storage_service.dart';

class AppLockService {
  static final AppLockService _instance = AppLockService._internal();
  factory AppLockService() => _instance;
  AppLockService._internal();

  final LocalAuthentication _auth = LocalAuthentication();
  bool _isUnlockedForSession = false;

  bool get isUnlockedForSession => _isUnlockedForSession;
  void markUnlocked() => _isUnlockedForSession = true;
  void lockApp() => _isUnlockedForSession = false;

  bool isLockEnabled() {
    return StorageService().getBool('hbs_app_lock_enabled', defaultValue: false);
  }

  Future<void> setLockEnabled(bool enabled) async {
    await StorageService().setBool('hbs_app_lock_enabled', enabled);
    if (!enabled) {
      lockApp();
    }
  }

  bool isDeviceLockEnabled() {
    return StorageService().getBool('hbs_app_lock_device', defaultValue: false);
  }

  Future<void> setDeviceLockEnabled(bool enabled) async {
    await StorageService().setBool('hbs_app_lock_device', enabled);
  }

  bool isBiometricsEnabled() {
    return StorageService().getBool('hbs_app_lock_biometrics', defaultValue: true);
  }

  Future<void> setBiometricsEnabled(bool enabled) async {
    await StorageService().setBool('hbs_app_lock_biometrics', enabled);
  }

  String? getPin() {
    final pin = StorageService().getString('hbs_app_lock_pin');
    return PinValidator.isValid(pin) ? pin : null;
  }

  Future<bool> setPin(String pin) async {
    final clean = PinValidator.sanitize(pin);
    if (clean == null) return false;
    await StorageService().setString('hbs_app_lock_pin', clean);
    return true;
  }

  Future<void> clearPin() async {
    await StorageService().remove('hbs_app_lock_pin');
  }

  Future<bool> isDeviceAuthAvailable() async {
    try {
      return await _auth.isDeviceSupported();
    } catch (_) {
      return false;
    }
  }

  Future<bool> hasBiometrics() async {
    try {
      final canCheck = await _auth.canCheckBiometrics;
      final isSupported = await _auth.isDeviceSupported();
      if (!canCheck || !isSupported) return false;
      final types = await _auth.getAvailableBiometrics();
      return types.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  /// Uses the OS lock screen (fingerprint / face / device PIN or pattern).
  Future<bool> authenticateWithDevice({bool biometricOnly = false}) async {
    try {
      final supported = await _auth.isDeviceSupported();
      if (!supported) return false;

      return await _auth.authenticate(
        localizedReason: 'Unlock HBS Cloud',
        options: AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: biometricOnly,
          useErrorDialogs: true,
          sensitiveTransaction: true,
        ),
      );
    } catch (_) {
      return false;
    }
  }

  Future<bool> authenticatePreferred() async {
    if (isBiometricsEnabled() && await hasBiometrics()) {
      final bio = await authenticateWithDevice(biometricOnly: true);
      if (bio) return true;
    }
    return authenticateWithDevice(biometricOnly: false);
  }

  bool verifyPin(String enteredPin) {
    final stored = getPin();
    if (stored == null) return false;
    final clean = PinValidator.sanitize(enteredPin);
    if (clean == null) return false;
    return stored == clean;
  }
}
