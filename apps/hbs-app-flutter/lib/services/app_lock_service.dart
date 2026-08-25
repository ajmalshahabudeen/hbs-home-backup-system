import 'package:local_auth/local_auth.dart';
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
  }

  bool isBiometricsEnabled() {
    return StorageService().getBool('hbs_app_lock_biometrics', defaultValue: true);
  }

  Future<void> setBiometricsEnabled(bool enabled) async {
    await StorageService().setBool('hbs_app_lock_biometrics', enabled);
  }

  String? getPin() {
    final pin = StorageService().getString('hbs_app_lock_pin');
    return pin.isNotEmpty ? pin : null;
  }

  Future<void> setPin(String pin) async {
    await StorageService().setString('hbs_app_lock_pin', pin);
  }

  Future<bool> hasBiometrics() async {
    try {
      final canCheck = await _auth.canCheckBiometrics;
      final isSupported = await _auth.isDeviceSupported();
      return canCheck && isSupported;
    } catch (_) {
      return false;
    }
  }

  Future<bool> authenticateWithBiometrics() async {
    try {
      final available = await hasBiometrics();
      if (!available) return false;

      return await _auth.authenticate(
        localizedReason: 'Authenticate to access HBS Cloud',
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: true,
        ),
      );
    } catch (_) {
      return false;
    }
  }

  bool verifyPin(String enteredPin) {
    final stored = getPin();
    if (stored == null) return true;
    return stored == enteredPin;
  }
}
