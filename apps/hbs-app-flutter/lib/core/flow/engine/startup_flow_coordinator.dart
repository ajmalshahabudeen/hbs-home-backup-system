import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../backup_engine/backup_engine.dart';
import '../../utils/high_refresh_rate.dart';
import '../../utils/lan_host.dart';
import '../../../services/api_service.dart';
import '../../../services/app_update_service.dart';
import '../../../services/auth_service.dart';
import '../../../services/lan_scanner_service.dart';
import '../../../services/media_discovery_service.dart';
import '../../../services/notification_service.dart';
import '../../../services/storage_service.dart';
import '../models/app_flow_state.dart';

/// Result summary of the startup bootstrap pipeline.
class StartupFlowResult {
  final bool isServerConnected;
  final String serverUrl;
  final int? pingMs;
  final bool isAuthenticated;
  final bool hasMediaPermission;
  final bool hasNotificationPermission;
  final AppRelease? availableUpdate;
  final int backupIndexCount;
  final int unworkedQueueCount;
  final String? errorMessage;

  const StartupFlowResult({
    required this.isServerConnected,
    required this.serverUrl,
    this.pingMs,
    required this.isAuthenticated,
    required this.hasMediaPermission,
    required this.hasNotificationPermission,
    this.availableUpdate,
    required this.backupIndexCount,
    required this.unworkedQueueCount,
    this.errorMessage,
  });
}

/// Orchestrates the deterministic startup sequence across the application.
class StartupFlowCoordinator {
  static final StartupFlowCoordinator _instance = StartupFlowCoordinator._internal();
  factory StartupFlowCoordinator() => _instance;
  StartupFlowCoordinator._internal();

  /// Step 1: Low-level platform & storage initialization
  Future<void> initCorePlatform() async {
    try {
      await enableHighestRefreshRate();
    } catch (_) {}

    // Configure image cache for 120 FPS high-density gallery scrolling
    PaintingBinding.instance.imageCache.maximumSize = 2500;
    PaintingBinding.instance.imageCache.maximumSizeBytes = 250 * 1024 * 1024; // 250MB

    await StorageService().init();
    await NotificationService().init();
    await BackupIndexDb().database;
  }

  /// Step 2: Server connectivity verification & fast LAN auto-discovery
  Future<({bool isConnected, String url, int? pingMs})> connectServer({
    Duration timeout = const Duration(seconds: 4),
  }) async {
    final savedUrl = StorageService().getString('hbs_server_url', defaultValue: LanHost.defaultUrl);
    ApiService().updateConfig(serverUrl: savedUrl);

    // 1. Try saved URL first
    final sw = Stopwatch()..start();
    var health = await ApiService().fetchHealth(savedUrl);
    sw.stop();

    if (health != null) {
      final chosen = _resolveServerUrl(savedUrl, health);
      await StorageService().setString('hbs_server_url', chosen);
      ApiService().updateConfig(serverUrl: chosen);
      return (isConnected: true, url: chosen, pingMs: sw.elapsedMilliseconds);
    }

    // 2. Try default LAN URL if saved URL differed
    if (savedUrl != LanHost.defaultUrl) {
      sw.reset();
      sw.start();
      health = await ApiService().fetchHealth(LanHost.defaultUrl);
      sw.stop();
      if (health != null) {
        final chosen = _resolveServerUrl(LanHost.defaultUrl, health);
        await StorageService().setString('hbs_server_url', chosen);
        ApiService().updateConfig(serverUrl: chosen);
        return (isConnected: true, url: chosen, pingMs: sw.elapsedMilliseconds);
      }
    }

    // 3. Fast LAN auto-discovery sweep
    final completer = Completer<({bool isConnected, String url, int? pingMs})>();
    StreamSubscription? scanSub;

    final timer = Timer(timeout, () {
      if (!completer.isCompleted) {
        scanSub?.cancel();
        completer.complete((isConnected: false, url: savedUrl, pingMs: null));
      }
    });

    scanSub = LanScannerService().scanSubnet(autoStopOnFirst: true).listen((discovered) async {
      timer.cancel();
      await scanSub?.cancel();
      if (!completer.isCompleted) {
        await StorageService().setString('hbs_server_url', discovered.url);
        ApiService().updateConfig(serverUrl: discovered.url);
        completer.complete((isConnected: true, url: discovered.url, pingMs: discovered.responseTimeMs));
      }
    });

    return completer.future;
  }

  String _resolveServerUrl(String base, Map<String, dynamic> data) {
    var chosen = LanHost.stripUrl(base);
    final advertised = LanHost.advertisedUrlFromHealth(data);
    if (advertised != null && advertised != chosen && LanHost.isHostnameUrl(advertised)) {
      chosen = advertised;
    }
    return chosen;
  }

  /// Step 3: Check for app updates (non-blocking)
  Future<AppRelease?> checkUpdates() async {
    if (!Platform.isAndroid) return null;
    try {
      return await AppUpdateService().check().timeout(const Duration(seconds: 4));
    } catch (_) {
      return null;
    }
  }

  /// Step 4: Auth session restoration
  Future<bool> hydrateAuthSession(String serverUrl) async {
    if (StorageService().isUserLoggedOut()) return false;

    final cachedToken = await StorageService().getSessionToken();
    final cachedUser = StorageService().getCurrentUser();

    final hasLocalSession = (cachedToken != null && cachedToken.isNotEmpty) || cachedUser != null;
    if (!hasLocalSession) return false;

    // Verify with server in background if possible
    try {
      final user = await AuthService().restoreSession(serverUrl: serverUrl).timeout(const Duration(seconds: 4));
      return user != null || hasLocalSession;
    } catch (_) {
      // Retain offline session
      return hasLocalSession;
    }
  }

  /// Step 5: Evaluate system permissions
  Future<({bool mediaGranted, bool notificationGranted})> evaluatePermissions() async {
    final mediaGranted = await MediaDiscoveryService().isPermissionGranted();
    bool notifGranted = true;
    if (Platform.isAndroid || Platform.isIOS) {
      notifGranted = await Permission.notification.isGranted;
    }
    return (mediaGranted: mediaGranted, notificationGranted: notifGranted);
  }

  /// Step 6: Backup Engine integrity check & queue healing
  Future<({int indexedCount, int queueCount, bool isHealthy})> checkBackupEngineHealth() async {
    try {
      final db = await BackupIndexDb().database;
      // Auto-heal any stale 'uploading' items left behind from crash or termination
      await db.rawUpdate("UPDATE upload_queue SET status = 'pending' WHERE status = 'uploading'");

      final indexedCount = await BackupIndexDb().getIndexedCount();
      final pendingCount = await BackupIndexDb().getPendingCount();

      return (indexedCount: indexedCount, queueCount: pendingCount, isHealthy: true);
    } catch (e) {
      debugPrint('[StartupFlow] BackupEngine health check failed: $e');
      return (indexedCount: 0, queueCount: 0, isHealthy: false);
    }
  }

  /// Executes the full coordinated startup sequence.
  Future<StartupFlowResult> runFullStartup({
    required void Function(FlowStage stage, String message) onProgress,
  }) async {
    onProgress(FlowStage.uninitialized, 'Initializing local runtime and storage...');
    await initCorePlatform();

    onProgress(FlowStage.discoveringServer, 'Connecting to HBS Cloud Server...');
    final server = await connectServer();

    onProgress(FlowStage.checkingUpdates, 'Checking for software updates...');
    final update = await checkUpdates();

    onProgress(FlowStage.hydratingAuth, 'Restoring user session...');
    final isAuth = await hydrateAuthSession(server.url);

    onProgress(FlowStage.checkingPermissions, 'Verifying system permissions...');
    final permissions = await evaluatePermissions();

    onProgress(FlowStage.evaluatingBackupEngine, 'Verifying backup database & queues...');
    final backup = await checkBackupEngineHealth();

    return StartupFlowResult(
      isServerConnected: server.isConnected,
      serverUrl: server.url,
      pingMs: server.pingMs,
      isAuthenticated: isAuth,
      hasMediaPermission: permissions.mediaGranted,
      hasNotificationPermission: permissions.notificationGranted,
      availableUpdate: update,
      backupIndexCount: backup.indexedCount,
      unworkedQueueCount: backup.queueCount,
    );
  }
}
