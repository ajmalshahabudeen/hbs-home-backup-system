import 'package:flutter_test/flutter_test.dart';
import 'package:hbs_app_flutter/core/flow/flow.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('FlowRules Tests', () {
    test('canRunAutoBackup rejects unauthenticated or unpermitted state', () {
      final unauthResult = FlowRules.canRunAutoBackup(
        isAuthenticated: false,
        isServerConnected: true,
        hasMediaPermission: true,
        autoBackupEnabled: true,
        wifiOnly: false,
        isWifi: true,
        batterySaverEnabled: false,
        isBatteryLow: false,
        isCharging: false,
        isSyncing: false,
      );
      expect(unauthResult, isFalse);

      final noPermResult = FlowRules.canRunAutoBackup(
        isAuthenticated: true,
        isServerConnected: true,
        hasMediaPermission: false,
        autoBackupEnabled: true,
        wifiOnly: false,
        isWifi: true,
        batterySaverEnabled: false,
        isBatteryLow: false,
        isCharging: false,
        isSyncing: false,
      );
      expect(noPermResult, isFalse);
    });

    test('canRunAutoBackup enforces Wi-Fi and Battery constraints', () {
      // Wi-Fi only constraint
      final cellularOnWifiOnly = FlowRules.canRunAutoBackup(
        isAuthenticated: true,
        isServerConnected: true,
        hasMediaPermission: true,
        autoBackupEnabled: true,
        wifiOnly: true,
        isWifi: false, // On cellular
        batterySaverEnabled: false,
        isBatteryLow: false,
        isCharging: false,
        isSyncing: false,
      );
      expect(cellularOnWifiOnly, isFalse);

      // Low battery without charger
      final lowBatteryNoCharge = FlowRules.canRunAutoBackup(
        isAuthenticated: true,
        isServerConnected: true,
        hasMediaPermission: true,
        autoBackupEnabled: true,
        wifiOnly: true,
        isWifi: true,
        batterySaverEnabled: true,
        isBatteryLow: true,
        isCharging: false,
        isSyncing: false,
      );
      expect(lowBatteryNoCharge, isFalse);

      // Low battery WITH charger plugged in -> should allow!
      final lowBatteryWithCharge = FlowRules.canRunAutoBackup(
        isAuthenticated: true,
        isServerConnected: true,
        hasMediaPermission: true,
        autoBackupEnabled: true,
        wifiOnly: true,
        isWifi: true,
        batterySaverEnabled: true,
        isBatteryLow: true,
        isCharging: true,
        isSyncing: false,
      );
      expect(lowBatteryWithCharge, isTrue);
    });

    test('canConnectWebSocket requires server, auth, and non-empty token', () {
      expect(
        FlowRules.canConnectWebSocket(
          isServerConnected: false,
          isAuthenticated: true,
          sessionToken: 'valid_token',
        ),
        isFalse,
      );

      expect(
        FlowRules.canConnectWebSocket(
          isServerConnected: true,
          isAuthenticated: false,
          sessionToken: 'valid_token',
        ),
        isFalse,
      );

      expect(
        FlowRules.canConnectWebSocket(
          isServerConnected: true,
          isAuthenticated: true,
          sessionToken: '',
        ),
        isFalse,
      );

      expect(
        FlowRules.canConnectWebSocket(
          isServerConnected: true,
          isAuthenticated: true,
          sessionToken: '  ',
        ),
        isFalse,
      );

      expect(
        FlowRules.canConnectWebSocket(
          isServerConnected: true,
          isAuthenticated: true,
          sessionToken: 'token_123',
        ),
        isTrue,
      );
    });

    test('canRunBackgroundTasks strictly bars logged-out users', () {
      expect(
        FlowRules.canRunBackgroundTasks(
          isAuthenticated: true,
          autoBackupEnabled: true,
          isLoggedOut: true,
        ),
        isFalse,
      );

      expect(
        FlowRules.canRunBackgroundTasks(
          isAuthenticated: true,
          autoBackupEnabled: true,
          isLoggedOut: false,
        ),
        isTrue,
      );
    });
  });

  group('LogoutRules Tests', () {
    test('prohibitedOperations list contains mandatory safety constraints', () {
      expect(LogoutRules.prohibitedOperations.length, greaterThanOrEqualTo(8));
      expect(
        LogoutRules.prohibitedOperations.any((op) => op.contains('uploads')),
        isTrue,
      );
      expect(
        LogoutRules.prohibitedOperations.any((op) => op.contains('WorkManager')),
        isTrue,
      );
      expect(
        LogoutRules.prohibitedOperations.any((op) => op.contains('WebSocket')),
        isTrue,
      );
    });

    test('teardownSequence details the complete 10-step protocol', () {
      expect(LogoutRules.teardownSequence.length, equals(10));
      expect(LogoutRules.teardownSequence.first, contains('UploadQueueEngine.cancelSync'));
      expect(LogoutRules.teardownSequence.last, contains('Clear session tokens'));
    });

    test('isOperationAllowed prevents operations when logged out', () {
      expect(
        LogoutRules.isOperationAllowed(
          operationName: 'upload',
          isAuthenticated: false,
          isLoggedOut: true,
        ),
        isFalse,
      );

      expect(
        LogoutRules.isOperationAllowed(
          operationName: 'upload',
          isAuthenticated: true,
          isLoggedOut: false,
        ),
        isTrue,
      );
    });
  });

  group('AppFlowState and HealthReport Tests', () {
    test('AppFlowState initial state is uninitialized', () {
      final initial = AppFlowState.initial();
      expect(initial.stage, equals(FlowStage.uninitialized));
      expect(initial.isServerConnected, isFalse);
      expect(initial.isAuthenticated, isFalse);
      expect(initial.isAutoHealing, isFalse);
    });

    test('AppFlowState copyWith updates immutably', () {
      final state = AppFlowState.initial();
      final updated = state.copyWith(
        stage: FlowStage.activeSession,
        isServerConnected: true,
        activeServerUrl: 'http://192.168.1.100:38480',
        isAuthenticated: true,
        hasPermissions: true,
      );

      expect(updated.stage, equals(FlowStage.activeSession));
      expect(updated.isServerConnected, isTrue);
      expect(updated.activeServerUrl, equals('http://192.168.1.100:38480'));
      expect(updated.isAuthenticated, isTrue);
      expect(updated.hasPermissions, isTrue);
      expect(state.stage, equals(FlowStage.uninitialized)); // original remains untouched
    });

    test('FlowHealthReport generates clean map for diagnostics', () {
      final report = FlowHealthReport(
        currentStage: FlowStage.activeSession,
        isServerConnected: true,
        serverUrl: 'http://192.168.1.100:38480',
        pingMs: 42,
        isAuthenticated: true,
        userId: 'user_123',
        hasMediaPermission: true,
        hasNotificationPermission: true,
        isBatteryOptimizationIgnored: true,
        isBackupEngineHealthy: true,
        pendingUploadQueueCount: 0,
        indexedMediaCount: 450,
        isWebSocketConnected: true,
        isMediaListenerActive: true,
        isWakeupServerRunning: true,
        isNetworkPresenceActive: true,
        isWatchFolderActive: false,
        recentHealingActions: ['Reset stalled queue items'],
        activeWarnings: [],
        timestamp: DateTime(2026, 9, 4, 12, 0),
      );

      final map = report.toMap();
      expect(map['currentStage'], equals('activeSession'));
      expect(map['isServerConnected'], isTrue);
      expect(map['pingMs'], equals(42));
      expect(map['indexedMediaCount'], equals(450));
      expect(map['recentHealingActions'], contains('Reset stalled queue items'));
    });
  });

  group('Flow Events and Orchestrator Singletons', () {
    test('FlowEvent subclasses hold timestamps and data', () {
      final event = ServerConnectionChangedEvent(
        isConnected: true,
        serverUrl: 'http://ajmal.local:38480',
        pingMs: 15,
      );

      expect(event.isConnected, isTrue);
      expect(event.serverUrl, equals('http://ajmal.local:38480'));
      expect(event.pingMs, equals(15));
      expect(event.timestamp, isNotNull);
    });

    test('AppFlowOrchestrator exposes singleton instance and initial state', () {
      final orchestrator = AppFlowOrchestrator();
      expect(orchestrator, equals(AppFlowOrchestrator()));
      expect(orchestrator.currentState, isNotNull);
      expect(orchestrator.stateStream, isNotNull);
      expect(orchestrator.eventStream, isNotNull);
    });
  });
}
