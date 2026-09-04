import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../../backup_engine/backup_engine.dart';
import '../../../services/api_service.dart';
import '../../../services/drive_websocket_service.dart';
import '../../../services/notification_service.dart';
import '../../../services/storage_service.dart';
import '../../../services/watch_folder_service.dart';
import '../rules/flow_rules.dart';

/// Manages all continuous and background services that must run during the active middle stage
/// ("what needs to run in middle") when the user is authenticated.
class ActiveSessionManager {
  static final ActiveSessionManager _instance = ActiveSessionManager._internal();
  factory ActiveSessionManager() => _instance;
  ActiveSessionManager._internal();

  Timer? _inboxTimer;
  CancelToken? _inboxCancelToken;
  bool _isRunning = false;

  bool get isRunning => _isRunning;

  /// Starts all active middle-stage services according to [FlowRules].
  Future<void> startActiveSession({
    required String serverUrl,
    required String? sessionToken,
    required bool autoBackupEnabled,
    required bool hasMediaPermission,
    required Future<void> Function({bool force}) onTriggerAutoBackup,
  }) async {
    final isLoggedOut = StorageService().isUserLoggedOut();
    if (isLoggedOut) {
      debugPrint('[ActiveSessionManager] Blocked starting middle-tier services: user is logged out.');
      return;
    }

    _isRunning = true;
    debugPrint('[ActiveSessionManager] Starting active middle-session services...');

    // 1. Realtime Drive WebSocket
    if (FlowRules.canConnectWebSocket(
      isServerConnected: true,
      isAuthenticated: true,
      sessionToken: sessionToken,
    )) {
      DriveWebSocketService().updateConfig(
        serverUrl: serverUrl,
        sessionToken: sessionToken,
      );
    }

    // 2. Camera roll live change listener
    if (FlowRules.canStartMediaListener(
      isAuthenticated: true,
      hasMediaPermission: hasMediaPermission,
      autoBackupEnabled: autoBackupEnabled,
      isLoggedOut: false,
    )) {
      MediaListenerService().startListening();
    }

    // 3. Headless background worker registration
    if (FlowRules.canRunBackgroundTasks(
      isAuthenticated: true,
      autoBackupEnabled: autoBackupEnabled,
      isLoggedOut: false,
    )) {
      await initBackgroundBackup();
    }

    // 4. LAN Network Presence & Device Wakeup server
    if (FlowRules.canAnnounceNetworkPresence(
      isServerConnected: true,
      isAuthenticated: true,
      isLoggedOut: false,
    )) {
      DeviceWakeupServer().setWakeCallback((payload) async {
        debugPrint('[ActiveSessionManager] Server wake trigger received: $payload');
        await onTriggerAutoBackup(force: true);
      });

      NetworkPresenceWatcher().start(onBackupTrigger: (reason) async {
        debugPrint('[ActiveSessionManager] Network presence trigger: $reason');
        await onTriggerAutoBackup(force: false);
      });

      NetworkPresenceWatcher().announcePresenceNow(reason: 'session_active');
    }

    // 5. Desktop Watch Folder Service
    WatchFolderService().start();

    // 6. LAN Inbox Polling & Alerts
    _startInboxPolling();
  }

  /// Refreshes and triggers necessary updates when the app returns to the foreground.
  Future<void> handleAppResumed({
    required Future<void> Function() onRefreshMedia,
    required Future<void> Function() onRefreshAlbums,
    required Future<void> Function() onTriggerAutoBackup,
  }) async {
    if (!_isRunning || StorageService().isUserLoggedOut()) return;

    debugPrint('[ActiveSessionManager] Handling app foreground resume...');

    // 1. Re-announce presence on local network
    NetworkPresenceWatcher().announcePresenceNow(reason: 'app_resumed');

    // 2. Refresh local photo state
    await onRefreshMedia();
    await onRefreshAlbums();

    // 3. Process new media changes
    MediaListenerService().processNewMediaChanges();

    // 4. Trigger auto-backup if conditions met
    await onTriggerAutoBackup();

    // 5. Poll inbox
    await pollInboxOnce();
  }

  void _startInboxPolling() {
    _inboxCancelToken?.cancel();
    _inboxCancelToken = CancelToken();

    pollInboxOnce();
    _inboxTimer?.cancel();
    _inboxTimer = Timer.periodic(const Duration(seconds: 90), (_) => pollInboxOnce());

    ApiService().listenInbox(
      cancelToken: _inboxCancelToken,
      onEvents: (events) async {
        for (final e in events) {
          await NotificationService().showInboxAlert(
            e['title']?.toString() ?? 'HBS Cloud',
            e['body']?.toString() ?? '',
          );
        }
        if (events.isNotEmpty) await ApiService().markInboxRead();
      },
    ).catchError((_) {});
  }

  Future<void> pollInboxOnce() async {
    try {
      final events = await ApiService().unreadInbox();
      for (final e in events) {
        await NotificationService().showInboxAlert(
          e['title']?.toString() ?? 'HBS Cloud',
          e['body']?.toString() ?? '',
        );
      }
      if (events.isNotEmpty) await ApiService().markInboxRead();
    } catch (_) {}
  }

  /// Halts all running middle-stage services without wiping user credentials.
  Future<void> pauseMiddleServices() async {
    _inboxTimer?.cancel();
    _inboxCancelToken?.cancel();
    DriveWebSocketService().disconnect();
    MediaListenerService().stopListening();
    NetworkPresenceWatcher().stop();
    DeviceWakeupServer().stop();
    WatchFolderService().stop();
    _isRunning = false;
  }
}
