import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';

class BatteryOptimizer {
  static final BatteryOptimizer _instance = BatteryOptimizer._internal();
  factory BatteryOptimizer() => _instance;
  BatteryOptimizer._internal();

  /// Checks whether this app has unrestricted battery access (battery optimization ignored)
  Future<bool> isBatteryOptimizationIgnored() async {
    if (kIsWeb || !Platform.isAndroid) {
      // Non-Android platforms don't have Android battery optimization
      return true;
    }
    try {
      final status = await Permission.ignoreBatteryOptimizations.status;
      return status.isGranted;
    } catch (_) {
      return false;
    }
  }

  /// Requests exemption from Android battery optimization
  /// On Android, this triggers the system dialog "Let app always run in background?"
  Future<bool> requestIgnoreBatteryOptimization() async {
    if (kIsWeb || !Platform.isAndroid) return true;
    try {
      final status = await Permission.ignoreBatteryOptimizations.request();
      return status.isGranted;
    } catch (_) {
      return false;
    }
  }

  /// Opens the system application settings where the user can adjust battery optimization
  Future<bool> openBatterySettings() async {
    try {
      return await openAppSettings();
    } catch (_) {
      return false;
    }
  }
}
