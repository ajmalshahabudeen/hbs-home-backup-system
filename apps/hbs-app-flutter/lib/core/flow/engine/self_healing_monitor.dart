import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import '../../backup_engine/backup_engine.dart';
import '../../../services/api_service.dart';
import '../../../services/drive_websocket_service.dart';
import '../../../services/lan_scanner_service.dart';
import '../../../services/storage_service.dart';
import '../models/flow_event.dart';
import '../rules/flow_rules.dart';

/// Active watchdog and auto-healing engine that monitors subsystem failures,
/// network disruptions, hung queues, or severed sockets, applying non-destructive
/// auto-recovery strategies.
class SelfHealingMonitor {
  static final SelfHealingMonitor _instance = SelfHealingMonitor._internal();
  factory SelfHealingMonitor() => _instance;
  SelfHealingMonitor._internal();

  StreamSubscription? _connectivitySub;
  StreamSubscription? _lanDiscoverySub;
  Timer? _watchdogTimer;

  bool _isHealingServer = false;
  bool _isHealingQueue = false;

  final List<String> _recentHealingActions = [];
  List<String> get recentHealingActions => List.unmodifiable(_recentHealingActions);

  final StreamController<SelfHealingTriggeredEvent> _healingEventController =
      StreamController<SelfHealingTriggeredEvent>.broadcast();
  Stream<SelfHealingTriggeredEvent> get healingEvents => _healingEventController.stream;

  /// Starts the continuous watchdog monitor.
  void startMonitoring({
    required Future<void> Function(String serverUrl) onServerRecovered,
  }) {
    stopMonitoring();

    // 1. Observe network connectivity changes
    _connectivitySub = Connectivity().onConnectivityChanged.listen((results) async {
      final isConnected = results.isNotEmpty && !results.contains(ConnectivityResult.none);
      if (isConnected) {
        debugPrint('[SelfHealing] Network change detected. Checking server health...');
        await healServerConnection(onServerRecovered: onServerRecovered);
      }
    });

    // 2. Run periodic watchdog check every 60 seconds
    _watchdogTimer = Timer.periodic(const Duration(seconds: 60), (_) async {
      await _runWatchdogCycle(onServerRecovered);
    });
  }

  Future<void> _runWatchdogCycle(Future<void> Function(String) onServerRecovered) async {
    if (StorageService().isUserLoggedOut()) return;

    // A. Check Backup Queue stalls
    await healStalledBackupQueue();

    // B. Check WebSocket connectivity
    healWebSocketIfDisconnected();

    // C. Check Server connectivity
    final currentUrl = StorageService().getString('hbs_server_url');
    if (currentUrl.isNotEmpty) {
      final health = await ApiService().fetchHealth(currentUrl);
      if (health == null) {
        await healServerConnection(onServerRecovered: onServerRecovered);
      }
    }
  }

  /// Self-healing routine for severed server connections:
  /// Tests candidate URLs, sweeps LAN subnet, and re-attaches API config.
  Future<bool> healServerConnection({
    required Future<void> Function(String serverUrl) onServerRecovered,
  }) async {
    if (_isHealingServer) return false;
    _isHealingServer = true;

    try {
      final savedUrl = StorageService().getString('hbs_server_url');
      debugPrint('[SelfHealing] Attempting server recovery for: $savedUrl');

      // 1. Fast probe saved URL
      var health = await ApiService().fetchHealth(savedUrl);
      if (health != null) {
        _recordAction('Server reachable at $savedUrl');
        _isHealingServer = false;
        return true;
      }

      // 2. Fast sweep LAN subnet
      final completer = Completer<bool>();
      _lanDiscoverySub?.cancel();

      final timer = Timer(const Duration(seconds: 6), () {
        if (!completer.isCompleted) {
          _lanDiscoverySub?.cancel();
          completer.complete(false);
        }
      });

      _lanDiscoverySub = LanScannerService().scanSubnet(autoStopOnFirst: true).listen((discovered) async {
        timer.cancel();
        await _lanDiscoverySub?.cancel();
        if (!completer.isCompleted) {
          _recordAction('Server healed: Auto-discovered at ${discovered.url}');
          await StorageService().setString('hbs_server_url', discovered.url);
          ApiService().updateConfig(serverUrl: discovered.url);
          await onServerRecovered(discovered.url);
          completer.complete(true);
        }
      });

      final success = await completer.future;
      _healingEventController.add(SelfHealingTriggeredEvent(
        component: 'ServerConnection',
        actionTaken: success ? 'Auto-discovered active LAN server' : 'Subnet scan timed out',
        success: success,
      ));
      return success;
    } catch (e) {
      debugPrint('[SelfHealing] Error during server healing: $e');
      return false;
    } finally {
      _isHealingServer = false;
    }
  }

  /// Self-healing routine for stalled or deadlocked upload queues:
  /// Resets items that were left in 'uploading' state without an active worker.
  Future<void> healStalledBackupQueue() async {
    if (_isHealingQueue) return;
    _isHealingQueue = true;

    try {
      final isSyncing = UploadQueueEngine().currentState.isSyncing;
      if (!isSyncing) {
        final db = await BackupIndexDb().database;
        final count = await db.rawUpdate("UPDATE upload_queue SET status = 'pending' WHERE status = 'uploading'");
        if (count > 0) {
          _recordAction('Reset $count stalled uploading queue items to pending');
          _healingEventController.add(SelfHealingTriggeredEvent(
            component: 'BackupQueue',
            actionTaken: 'Reset $count stuck items in SQLite queue',
            success: true,
          ));
        }
      }
    } catch (e) {
      debugPrint('[SelfHealing] Error healing queue: $e');
    } finally {
      _isHealingQueue = false;
    }
  }

  /// Self-healing routine for dropped WebSockets when server is online.
  void healWebSocketIfDisconnected() {
    final isWsConnected = DriveWebSocketService().isConnected.value;
    final token = StorageService().getString('hbs_session_token');
    final serverUrl = StorageService().getString('hbs_server_url');

    if (!isWsConnected && FlowRules.canConnectWebSocket(
      isServerConnected: true,
      isAuthenticated: !StorageService().isUserLoggedOut(),
      sessionToken: token,
    )) {
      _recordAction('Reconnecting disconnected Drive WebSocket');
      DriveWebSocketService().updateConfig(serverUrl: serverUrl, sessionToken: token);
      DriveWebSocketService().reconnect();
    }
  }

  void _recordAction(String action) {
    debugPrint('[SelfHealing] $action');
    _recentHealingActions.insert(0, '${DateTime.now().toIso8601String()}: $action');
    if (_recentHealingActions.length > 20) {
      _recentHealingActions.removeLast();
    }
  }

  void stopMonitoring() {
    _connectivitySub?.cancel();
    _lanDiscoverySub?.cancel();
    _watchdogTimer?.cancel();
  }
}
