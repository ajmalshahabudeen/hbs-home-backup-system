import 'dart:async';
import 'dart:io';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:network_info_plus/network_info_plus.dart';
import '../../../services/api_service.dart';
import '../../../services/storage_service.dart';
import 'device_wakeup_server.dart';

typedef BackupTriggerCallback = Future<void> Function(String reason);

/// Monitors device network transitions with zero battery drain.
/// When the device rejoins the home Wi-Fi network:
/// 1. Ensures the local LAN wakeup server (port 38482) is active.
/// 2. Announces device presence to the HBS server with fresh local IP.
/// 3. If server signals a wake-up, triggers the backup engine.
class NetworkPresenceWatcher {
  static final NetworkPresenceWatcher _instance = NetworkPresenceWatcher._internal();
  factory NetworkPresenceWatcher() => _instance;
  NetworkPresenceWatcher._internal();

  StreamSubscription<List<ConnectivityResult>>? _subscription;
  bool _isWatching = false;
  bool _wasWifi = false;
  Timer? _debounceTimer;
  BackupTriggerCallback? _onBackupTrigger;

  bool get isWatching => _isWatching;
  bool get isRunning => _isWatching;

  void start({BackupTriggerCallback? onBackupTrigger}) {
    if (_isWatching) return;
    _isWatching = true;
    _onBackupTrigger = onBackupTrigger;

    // Start local embedded wakeup server immediately
    DeviceWakeupServer().start();

    // Listen to network transitions
    _subscription = Connectivity().onConnectivityChanged.listen(
      _handleConnectivityChanged,
      onError: (err) {
        debugPrint('[NetworkPresenceWatcher] Connectivity stream error: $err');
      },
    );

    // Initial check
    _checkCurrentConnectivity();
  }

  Future<void> _checkCurrentConnectivity() async {
    try {
      final results = await Connectivity().checkConnectivity();
      _handleConnectivityChanged(results);
    } catch (_) {}
  }

  void _handleConnectivityChanged(List<ConnectivityResult> results) {
    final hasWifi = results.contains(ConnectivityResult.wifi);

    // If transitioned from disconnected/mobile to Wi-Fi
    if (hasWifi && !_wasWifi) {
      debugPrint('[NetworkPresenceWatcher] Wi-Fi connection detected');
      _debounceTimer?.cancel();
      _debounceTimer = Timer(const Duration(milliseconds: 1500), () {
        announcePresenceNow(reason: 'wifi_reconnect');
      });
    }

    _wasWifi = hasWifi;
  }

  /// Announces device presence to the HBS server with current local IP.
  Future<void> announcePresenceNow({String reason = 'presence_heartbeat'}) async {
    try {
      final token = await StorageService().getSessionToken();
      if (token == null || token.isEmpty) return;

      // Ensure local server is running on LAN
      if (!DeviceWakeupServer().isRunning) {
        await DeviceWakeupServer().start();
      }

      String deviceId = 'unknown';
      final plugin = DeviceInfoPlugin();
      if (Platform.isAndroid) {
        final info = await plugin.androidInfo;
        deviceId = info.id;
      } else if (Platform.isIOS) {
        final info = await plugin.iosInfo;
        deviceId = info.identifierForVendor ?? info.name;
      } else if (Platform.isWindows) {
        final info = await plugin.windowsInfo;
        deviceId = info.deviceId;
      }

      final wifiIp = await NetworkInfo().getWifiIP();
      debugPrint('[NetworkPresenceWatcher] Pinging server from $wifiIp (reason: $reason)');

      final res = await ApiService().pingDevice(
        deviceId: deviceId,
        localIp: wifiIp,
      );

      // If server signaled wake: true in ping reply, trigger autonomous backup
      if (res != null && (res['wake'] == true || res['action'] == 'start_backup')) {
        debugPrint('[NetworkPresenceWatcher] Server triggered backup via heartbeat response');
        if (_onBackupTrigger != null) {
          unawaited(_onBackupTrigger!(reason));
        }
      }
    } catch (e) {
      debugPrint('[NetworkPresenceWatcher] Announce presence failed: $e');
    }
  }

  void stop() {
    _subscription?.cancel();
    _subscription = null;
    _debounceTimer?.cancel();
    _debounceTimer = null;
    _isWatching = false;
    DeviceWakeupServer().stop();
  }
}
