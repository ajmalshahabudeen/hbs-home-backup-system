import 'package:flutter/foundation.dart';
import '../../backup_engine/backup_engine.dart';
import '../../../services/drive_websocket_service.dart';
import '../../../services/storage_service.dart';
import '../../../services/watch_folder_service.dart';
import '../rules/logout_rules.dart';
import 'active_session_manager.dart';

/// Enforces the [LogoutRules] atomic teardown sequence when a user logs out
/// or a session becomes invalid.
class SessionTeardownManager {
  static final SessionTeardownManager _instance = SessionTeardownManager._internal();
  factory SessionTeardownManager() => _instance;
  SessionTeardownManager._internal();

  /// Executes the 10-step atomic logout sequence.
  Future<List<String>> executeLogoutTeardown({
    required Future<void> Function() onBackendSignOut,
  }) async {
    final executedSteps = <String>[];
    debugPrint('[SessionTeardownManager] Starting atomic logout teardown protocol...');

    // 1. Halt active upload workers
    try {
      UploadQueueEngine().cancelSync();
      executedSteps.add('UploadQueueEngine.cancelSync()');
    } catch (e) {
      debugPrint('[Teardown] Error in step 1: $e');
    }

    // 2. Dismiss active sync notifications
    try {
      await BackupNotificationManager().cancelSyncNotification();
      executedSteps.add('BackupNotificationManager.cancelSyncNotification()');
    } catch (e) {
      debugPrint('[Teardown] Error in step 2: $e');
    }

    // 3. Stop camera roll media listener
    try {
      MediaListenerService().stopListening();
      executedSteps.add('MediaListenerService.stopListening()');
    } catch (e) {
      debugPrint('[Teardown] Error in step 3: $e');
    }

    // 4. Cancel background WorkManager backup task
    try {
      await cancelBackgroundBackup();
      executedSteps.add('cancelBackgroundBackup()');
    } catch (e) {
      debugPrint('[Teardown] Error in step 4: $e');
    }

    // 5. Clear unworked queue items from SQLite
    try {
      await BackupIndexDb().clearQueue();
      executedSteps.add('BackupIndexDb.clearQueue()');
    } catch (e) {
      debugPrint('[Teardown] Error in step 5: $e');
    }

    // 6. Disconnect Drive WebSocket
    try {
      DriveWebSocketService().disconnect();
      executedSteps.add('DriveWebSocketService.disconnect()');
    } catch (e) {
      debugPrint('[Teardown] Error in step 6: $e');
    }

    // 7. Stop LAN presence announcer and wakeup server
    try {
      NetworkPresenceWatcher().stop();
      DeviceWakeupServer().stop();
      executedSteps.add('Presence and Wakeup listeners stopped');
    } catch (e) {
      debugPrint('[Teardown] Error in step 7: $e');
    }

    // 8. Stop desktop watch folder service
    try {
      await WatchFolderService().stop();
      executedSteps.add('WatchFolderService.stop()');
    } catch (e) {
      debugPrint('[Teardown] Error in step 8: $e');
    }

    // 9. Halt middle-tier timers and inbox streams
    try {
      await ActiveSessionManager().pauseMiddleServices();
      executedSteps.add('ActiveSessionManager.pauseMiddleServices()');
    } catch (e) {
      debugPrint('[Teardown] Error in step 9: $e');
    }

    // 10. Perform backend signout and clear local storage session
    try {
      await onBackendSignOut();
      await StorageService().clearSession();
      executedSteps.add('StorageService.clearSession()');
    } catch (e) {
      debugPrint('[Teardown] Error in step 10: $e');
    }

    debugPrint('[SessionTeardownManager] Teardown complete. ${executedSteps.length} steps executed.');
    return executedSteps;
  }
}
