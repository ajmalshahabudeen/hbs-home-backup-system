import 'package:flutter/foundation.dart';

/// Represents the discrete, sequential stages in the app lifecycle.
enum FlowStage {
  /// App is starting up; basic platform bindings and storage are being initialized.
  uninitialized,

  /// Discovering or verifying server connectivity over LAN / remote URL.
  discoveringServer,

  /// Checking for new app version updates.
  checkingUpdates,

  /// Validating system permissions (media, storage, notifications).
  checkingPermissions,

  /// Hydrating user session tokens and validating session with server.
  hydratingAuth,

  /// Checking SQLite database integrity, queue state, and backup engine health.
  evaluatingBackupEngine,

  /// Normal operational stage: authenticated, server reachable, all active services running.
  activeSession,

  /// Degraded operational stage: offline, server down, or missing permissions, but safe to browse cached media/drive.
  degraded,

  /// Auto-healing is active: resolving broken connections, re-scanning LAN, or resuming stalled queues.
  recovering,

  /// Executing atomic teardown of services, sessions, and background workers.
  loggingOut,

  /// Successfully logged out, clean state awaiting user login.
  loggedOut,
}

/// A comprehensive health report across all subsystem components.
class FlowHealthReport {
  final FlowStage currentStage;
  final bool isServerConnected;
  final String serverUrl;
  final int? pingMs;
  final bool isAuthenticated;
  final String? userId;
  final bool hasMediaPermission;
  final bool hasNotificationPermission;
  final bool isBatteryOptimizationIgnored;
  final bool isBackupEngineHealthy;
  final int pendingUploadQueueCount;
  final int indexedMediaCount;
  final bool isWebSocketConnected;
  final bool isMediaListenerActive;
  final bool isWakeupServerRunning;
  final bool isNetworkPresenceActive;
  final bool isWatchFolderActive;
  final List<String> recentHealingActions;
  final List<String> activeWarnings;
  final DateTime timestamp;

  const FlowHealthReport({
    required this.currentStage,
    required this.isServerConnected,
    required this.serverUrl,
    this.pingMs,
    required this.isAuthenticated,
    this.userId,
    required this.hasMediaPermission,
    required this.hasNotificationPermission,
    required this.isBatteryOptimizationIgnored,
    required this.isBackupEngineHealthy,
    required this.pendingUploadQueueCount,
    required this.indexedMediaCount,
    required this.isWebSocketConnected,
    required this.isMediaListenerActive,
    required this.isWakeupServerRunning,
    required this.isNetworkPresenceActive,
    required this.isWatchFolderActive,
    this.recentHealingActions = const [],
    this.activeWarnings = const [],
    required this.timestamp,
  });

  Map<String, dynamic> toMap() {
    return {
      'currentStage': currentStage.name,
      'isServerConnected': isServerConnected,
      'serverUrl': serverUrl,
      'pingMs': pingMs,
      'isAuthenticated': isAuthenticated,
      'userId': userId,
      'hasMediaPermission': hasMediaPermission,
      'hasNotificationPermission': hasNotificationPermission,
      'isBatteryOptimizationIgnored': isBatteryOptimizationIgnored,
      'isBackupEngineHealthy': isBackupEngineHealthy,
      'pendingUploadQueueCount': pendingUploadQueueCount,
      'indexedMediaCount': indexedMediaCount,
      'isWebSocketConnected': isWebSocketConnected,
      'isMediaListenerActive': isMediaListenerActive,
      'isWakeupServerRunning': isWakeupServerRunning,
      'isNetworkPresenceActive': isNetworkPresenceActive,
      'isWatchFolderActive': isWatchFolderActive,
      'recentHealingActions': recentHealingActions,
      'activeWarnings': activeWarnings,
      'timestamp': timestamp.toIso8601String(),
    };
  }

  @override
  String toString() => 'FlowHealthReport(${toMap()})';
}

/// The state snapshot emitted by [AppFlowOrchestrator].
@immutable
class AppFlowState {
  final FlowStage stage;
  final String statusMessage;
  final bool isServerConnected;
  final String? activeServerUrl;
  final bool isAuthenticated;
  final bool hasPermissions;
  final bool isAutoHealing;
  final String? errorMessage;
  final DateTime lastStateChange;

  const AppFlowState({
    this.stage = FlowStage.uninitialized,
    this.statusMessage = 'Initializing...',
    this.isServerConnected = false,
    this.activeServerUrl,
    this.isAuthenticated = false,
    this.hasPermissions = false,
    this.isAutoHealing = false,
    this.errorMessage,
    required this.lastStateChange,
  });

  factory AppFlowState.initial() => AppFlowState(
        stage: FlowStage.uninitialized,
        statusMessage: 'App bootstrapping',
        lastStateChange: DateTime.now(),
      );

  AppFlowState copyWith({
    FlowStage? stage,
    String? statusMessage,
    bool? isServerConnected,
    String? activeServerUrl,
    bool? isAuthenticated,
    bool? hasPermissions,
    bool? isAutoHealing,
    String? errorMessage,
  }) {
    return AppFlowState(
      stage: stage ?? this.stage,
      statusMessage: statusMessage ?? this.statusMessage,
      isServerConnected: isServerConnected ?? this.isServerConnected,
      activeServerUrl: activeServerUrl ?? this.activeServerUrl,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      hasPermissions: hasPermissions ?? this.hasPermissions,
      isAutoHealing: isAutoHealing ?? this.isAutoHealing,
      errorMessage: errorMessage,
      lastStateChange: DateTime.now(),
    );
  }

  @override
  String toString() =>
      'AppFlowState(stage: ${stage.name}, status: $statusMessage, connected: $isServerConnected, auth: $isAuthenticated, healing: $isAutoHealing)';
}
