/// Strict rules defining what is FORBIDDEN after user logout, and the exact
/// 10-step teardown protocol required to cleanly transition the app to [FlowStage.loggedOut].
class LogoutRules {
  /// Things that are STRICTLY PROHIBITED after logout:
  static const List<String> prohibitedOperations = [
    'No file or photo uploads to server',
    'No headless background WorkManager tasks',
    'No camera roll change listening or scanning',
    'No active sync progress notifications in notification tray',
    'No active Drive WebSocket connections or reconnect timers',
    'No LAN UDP presence announcements or device wakeup listening',
    'No desktop watch folder file monitoring',
    'No inbox long-polling or periodic notification checking',
    'No session token retention in active memory or persistent cache',
  ];

  /// The exact sequence of cleanup steps executed during teardown.
  static const List<String> teardownSequence = [
    '1. Halt active upload workers (UploadQueueEngine.cancelSync)',
    '2. Dismiss active sync notification (BackupNotificationManager.cancelSyncNotification)',
    '3. Stop media change listener (MediaListenerService.stopListening)',
    '4. Cancel background WorkManager backup task (cancelBackgroundBackup)',
    '5. Clear unworked queue items from SQLite (BackupIndexDb.clearQueue)',
    '6. Disconnect Drive WebSocket (DriveWebSocketService.disconnect)',
    '7. Stop LAN presence announcer and wakeup server (NetworkPresenceWatcher.stop, DeviceWakeupServer.stop)',
    '8. Stop desktop watch folder service (WatchFolderService.stop)',
    '9. Cancel inbox polling streams and timers',
    '10. Clear session tokens, cached credentials, and reset providers',
  ];

  /// Validates whether a requested action is permitted for the current auth state.
  static bool isOperationAllowed({
    required String operationName,
    required bool isAuthenticated,
    required bool isLoggedOut,
  }) {
    if (isLoggedOut || !isAuthenticated) {
      return false;
    }
    return true;
  }
}
