/// Core business rules and guardrails governing the application flow.
/// Developers and services query these rules to prevent illegal states,
/// redundant network calls, and battery drain.
class FlowRules {
  /// Evaluates whether an automated background or foreground photo backup can start.
  static bool canRunAutoBackup({
    required bool isAuthenticated,
    required bool isServerConnected,
    required bool hasMediaPermission,
    required bool autoBackupEnabled,
    required bool wifiOnly,
    required bool isWifi,
    required bool batterySaverEnabled,
    required bool isBatteryLow,
    required bool isCharging,
    required bool isSyncing,
  }) {
    if (!isAuthenticated) return false;
    if (!isServerConnected) return false;
    if (!hasMediaPermission) return false;
    if (!autoBackupEnabled) return false;
    if (isSyncing) return false;

    // Network constraint: If Wi-Fi only is enforced, we must be connected to Wi-Fi.
    if (wifiOnly && !isWifi) {
      return false;
    }

    // Battery constraint: If battery saver is active and battery is low and not charging, hold off.
    if (batterySaverEnabled && isBatteryLow && !isCharging) {
      return false;
    }

    return true;
  }

  /// Evaluates whether manual photo backup can be triggered by user.
  static bool canRunManualBackup({
    required bool isAuthenticated,
    required bool isServerConnected,
    required bool hasMediaPermission,
    required bool isSyncing,
  }) {
    if (!isAuthenticated) return false;
    if (!isServerConnected) return false;
    if (!hasMediaPermission) return false;
    if (isSyncing) return false;
    return true;
  }

  /// Evaluates whether the realtime Drive WebSocket should attempt connection.
  static bool canConnectWebSocket({
    required bool isServerConnected,
    required bool isAuthenticated,
    required String? sessionToken,
  }) {
    if (!isServerConnected) return false;
    if (!isAuthenticated) return false;
    if (sessionToken == null || sessionToken.trim().isEmpty) return false;
    return true;
  }

  /// Evaluates whether headless background workmanager tasks should be scheduled/executed.
  static bool canRunBackgroundTasks({
    required bool isAuthenticated,
    required bool autoBackupEnabled,
    required bool isLoggedOut,
  }) {
    if (isLoggedOut) return false;
    if (!isAuthenticated) return false;
    if (!autoBackupEnabled) return false;
    return true;
  }

  /// Evaluates whether LAN inbox alerts and notifications should be polled.
  static bool canPollInbox({
    required bool isServerConnected,
    required bool isAuthenticated,
    required bool isLoggedOut,
  }) {
    if (isLoggedOut) return false;
    if (!isAuthenticated) return false;
    if (!isServerConnected) return false;
    return true;
  }

  /// Evaluates whether media listener service should observe camera roll changes.
  static bool canStartMediaListener({
    required bool isAuthenticated,
    required bool hasMediaPermission,
    required bool autoBackupEnabled,
    required bool isLoggedOut,
  }) {
    if (isLoggedOut) return false;
    if (!isAuthenticated) return false;
    if (!hasMediaPermission) return false;
    if (!autoBackupEnabled) return false;
    return true;
  }

  /// Evaluates whether device presence announcement / UDP listener can run.
  static bool canAnnounceNetworkPresence({
    required bool isServerConnected,
    required bool isAuthenticated,
    required bool isLoggedOut,
  }) {
    if (isLoggedOut) return false;
    if (!isAuthenticated) return false;
    if (!isServerConnected) return false;
    return true;
  }

  /// Evaluates whether watch folder background service can run on this host.
  static bool canRunWatchFolder({
    required bool isDesktopPlatform,
    required bool isServerConnected,
    required bool isAuthenticated,
    required String watchPath,
  }) {
    if (!isDesktopPlatform) return false;
    if (!isAuthenticated) return false;
    if (!isServerConnected) return false;
    if (watchPath.trim().isEmpty) return false;
    return true;
  }

  /// Evaluates whether self-healing should trigger automatic LAN subnet discovery.
  static bool shouldAutoDiscoverServer({
    required bool isServerConnected,
    required bool isAlreadyScanning,
    required bool isExplicitlyCancelled,
  }) {
    if (isServerConnected) return false;
    if (isAlreadyScanning) return false;
    if (isExplicitlyCancelled) return false;
    return true;
  }
}
