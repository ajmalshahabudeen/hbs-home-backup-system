import 'package:flutter/foundation.dart';
import 'app_flow_state.dart';

/// Base class for all lifecycle and flow events in the system.
@immutable
abstract class FlowEvent {
  final DateTime timestamp;
  FlowEvent() : timestamp = DateTime.now();
}

/// Dispatched when the server connection state changes.
class ServerConnectionChangedEvent extends FlowEvent {
  final bool isConnected;
  final String serverUrl;
  final int? pingMs;

  ServerConnectionChangedEvent({
    required this.isConnected,
    required this.serverUrl,
    this.pingMs,
  });
}

/// Dispatched when an app update is discovered.
class AppUpdateDetectedEvent extends FlowEvent {
  final String version;
  final String tag;
  final String apkUrl;
  final String notes;

  AppUpdateDetectedEvent({
    required this.version,
    required this.tag,
    required this.apkUrl,
    required this.notes,
  });
}

/// Dispatched when system permissions change or are requested.
class PermissionsEvaluatedEvent extends FlowEvent {
  final bool mediaGranted;
  final bool notificationGranted;

  PermissionsEvaluatedEvent({
    required this.mediaGranted,
    required this.notificationGranted,
  });
}

/// Dispatched when auth state transitions.
class AuthTransitionEvent extends FlowEvent {
  final bool isAuthenticated;
  final String? userId;
  final String? email;

  AuthTransitionEvent({
    required this.isAuthenticated,
    this.userId,
    this.email,
  });
}

/// Dispatched when the backup engine health or queue state changes.
class BackupEngineHealthEvent extends FlowEvent {
  final bool isHealthy;
  final int pendingQueueCount;
  final int indexedCount;
  final String? alertMessage;

  BackupEngineHealthEvent({
    required this.isHealthy,
    required this.pendingQueueCount,
    required this.indexedCount,
    this.alertMessage,
  });
}

/// Dispatched when an auto-healing routine is executed.
class SelfHealingTriggeredEvent extends FlowEvent {
  final String component;
  final String actionTaken;
  final bool success;

  SelfHealingTriggeredEvent({
    required this.component,
    required this.actionTaken,
    required this.success,
  });
}

/// Dispatched when user logs out and teardown begins.
class LogoutInitiatedEvent extends FlowEvent {
  final String? reason;

  LogoutInitiatedEvent({this.reason});
}

/// Dispatched when user logout teardown finishes.
class LogoutCompletedEvent extends FlowEvent {}

/// Dispatched on lifecycle stage transition.
class StageTransitionEvent extends FlowEvent {
  final FlowStage fromStage;
  final FlowStage toStage;
  final String reason;

  StageTransitionEvent({
    required this.fromStage,
    required this.toStage,
    required this.reason,
  });
}
