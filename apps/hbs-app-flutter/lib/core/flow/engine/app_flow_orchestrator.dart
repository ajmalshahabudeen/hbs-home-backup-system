import 'dart:async';
import '../../backup_engine/backup_engine.dart';
import '../../../services/drive_websocket_service.dart';
import '../../../services/media_discovery_service.dart';
import '../../../services/storage_service.dart';
import '../../../services/watch_folder_service.dart';
import '../models/app_flow_state.dart';
import '../models/flow_event.dart';
import 'active_session_manager.dart';
import 'self_healing_monitor.dart';
import 'session_teardown_manager.dart';
import 'startup_flow_coordinator.dart';

/// Central singleton orchestrator that manages the application lifecycle,
/// startup pipelines, operational flow rules, middle-stage services, and auto-healing.
class AppFlowOrchestrator {
  static final AppFlowOrchestrator _instance = AppFlowOrchestrator._internal();
  factory AppFlowOrchestrator() => _instance;
  AppFlowOrchestrator._internal();

  final StartupFlowCoordinator startupCoordinator = StartupFlowCoordinator();
  final ActiveSessionManager activeSessionManager = ActiveSessionManager();
  final SessionTeardownManager teardownManager = SessionTeardownManager();
  final SelfHealingMonitor selfHealingMonitor = SelfHealingMonitor();

  AppFlowState _currentState = AppFlowState.initial();
  AppFlowState get currentState => _currentState;

  final StreamController<AppFlowState> _stateController = StreamController<AppFlowState>.broadcast();
  Stream<AppFlowState> get stateStream => _stateController.stream;

  final StreamController<FlowEvent> _eventController = StreamController<FlowEvent>.broadcast();
  Stream<FlowEvent> get eventStream => _eventController.stream;

  /// Main cold-boot entry point called by [main()] or startup widgets.
  Future<StartupFlowResult> boot() async {
    _updateState(
      stage: FlowStage.uninitialized,
      statusMessage: 'Starting HBS Cloud bootstrap...',
    );

    final result = await startupCoordinator.runFullStartup(
      onProgress: (stage, message) {
        _updateState(stage: stage, statusMessage: message);
      },
    );

    final finalStage = result.isAuthenticated
        ? (result.isServerConnected ? FlowStage.activeSession : FlowStage.degraded)
        : FlowStage.loggedOut;

    _updateState(
      stage: finalStage,
      statusMessage: result.isAuthenticated
          ? (result.isServerConnected ? 'Ready & Connected' : 'Running in Offline Mode')
          : 'Awaiting Sign In',
      isServerConnected: result.isServerConnected,
      activeServerUrl: result.serverUrl,
      isAuthenticated: result.isAuthenticated,
      hasPermissions: result.hasMediaPermission,
    );

    // Start self-healing watchdog
    selfHealingMonitor.startMonitoring(
      onServerRecovered: (newUrl) async {
        _updateState(
          isServerConnected: true,
          activeServerUrl: newUrl,
          statusMessage: 'Server re-connected at $newUrl',
        );
        _eventController.add(ServerConnectionChangedEvent(
          isConnected: true,
          serverUrl: newUrl,
        ));
      },
    );

    return result;
  }

  /// Transitions flow into active middle-stage session upon successful login.
  Future<void> onUserLogin({
    required String serverUrl,
    required String? sessionToken,
    required bool autoBackupEnabled,
    required bool hasMediaPermission,
    required Future<void> Function({bool force}) onTriggerAutoBackup,
  }) async {
    _updateState(
      stage: FlowStage.activeSession,
      statusMessage: 'Session active',
      isAuthenticated: true,
      activeServerUrl: serverUrl,
      isServerConnected: true,
    );

    _eventController.add(AuthTransitionEvent(isAuthenticated: true));

    await activeSessionManager.startActiveSession(
      serverUrl: serverUrl,
      sessionToken: sessionToken,
      autoBackupEnabled: autoBackupEnabled,
      hasMediaPermission: hasMediaPermission,
      onTriggerAutoBackup: onTriggerAutoBackup,
    );
  }

  /// Transitions flow into atomic teardown and logged out state upon logout.
  Future<void> onUserLogout({
    required Future<void> Function() onBackendSignOut,
  }) async {
    _updateState(
      stage: FlowStage.loggingOut,
      statusMessage: 'Executing logout teardown checklist...',
    );

    _eventController.add(LogoutInitiatedEvent(reason: 'User sign-out'));

    await teardownManager.executeLogoutTeardown(onBackendSignOut: onBackendSignOut);

    _updateState(
      stage: FlowStage.loggedOut,
      statusMessage: 'Signed out',
      isAuthenticated: false,
    );

    _eventController.add(LogoutCompletedEvent());
  }

  /// Called when the application returns to the foreground.
  Future<void> onAppForegrounded({
    required Future<void> Function() onRefreshMedia,
    required Future<void> Function() onRefreshAlbums,
    required Future<void> Function() onTriggerAutoBackup,
  }) async {
    if (_currentState.stage == FlowStage.loggedOut) return;

    await activeSessionManager.handleAppResumed(
      onRefreshMedia: onRefreshMedia,
      onRefreshAlbums: onRefreshAlbums,
      onTriggerAutoBackup: onTriggerAutoBackup,
    );
  }

  /// Collects a comprehensive diagnostic health report of all systems.
  Future<FlowHealthReport> getHealthReport() async {
    final serverUrl = _currentState.activeServerUrl ?? StorageService().getString('hbs_server_url');
    final hasMedia = await MediaDiscoveryService().isPermissionGranted();
    final isIgnored = await BatteryOptimizer().isBatteryOptimizationIgnored();
    final indexed = await BackupIndexDb().getIndexedCount();
    final pending = await BackupIndexDb().getPendingCount();

    return FlowHealthReport(
      currentStage: _currentState.stage,
      isServerConnected: _currentState.isServerConnected,
      serverUrl: serverUrl,
      isAuthenticated: _currentState.isAuthenticated,
      userId: StorageService().getCurrentUser()?.id,
      hasMediaPermission: hasMedia,
      hasNotificationPermission: BackupNotificationManager().isNotificationsEnabled,
      isBatteryOptimizationIgnored: isIgnored,
      isBackupEngineHealthy: true,
      pendingUploadQueueCount: pending,
      indexedMediaCount: indexed,
      isWebSocketConnected: DriveWebSocketService().isConnected.value,
      isMediaListenerActive: MediaListenerService().isListening,
      isWakeupServerRunning: DeviceWakeupServer().isRunning,
      isNetworkPresenceActive: NetworkPresenceWatcher().isRunning,
      isWatchFolderActive: WatchFolderService().supported,
      recentHealingActions: selfHealingMonitor.recentHealingActions,
      timestamp: DateTime.now(),
    );
  }

  void _updateState({
    FlowStage? stage,
    String? statusMessage,
    bool? isServerConnected,
    String? activeServerUrl,
    bool? isAuthenticated,
    bool? hasPermissions,
    bool? isAutoHealing,
    String? errorMessage,
  }) {
    _currentState = _currentState.copyWith(
      stage: stage,
      statusMessage: statusMessage,
      isServerConnected: isServerConnected,
      activeServerUrl: activeServerUrl,
      isAuthenticated: isAuthenticated,
      hasPermissions: hasPermissions,
      isAutoHealing: isAutoHealing,
      errorMessage: errorMessage,
    );
    _stateController.add(_currentState);
  }

  void dispose() {
    selfHealingMonitor.stopMonitoring();
    _stateController.close();
    _eventController.close();
  }
}
