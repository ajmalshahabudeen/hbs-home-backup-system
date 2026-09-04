import 'package:flutter/widgets.dart';
import '../engine/app_flow_orchestrator.dart';

/// Global observer that routes Flutter lifecycle state changes directly into [AppFlowOrchestrator].
class AppLifecycleObserver with WidgetsBindingObserver {
  static final AppLifecycleObserver _instance = AppLifecycleObserver._internal();
  factory AppLifecycleObserver() => _instance;
  AppLifecycleObserver._internal();

  Future<void> Function()? _onRefreshMedia;
  Future<void> Function()? _onRefreshAlbums;
  Future<void> Function()? _onTriggerAutoBackup;

  bool _isAttached = false;

  /// Attaches the observer to Flutter's [WidgetsBinding].
  void attach({
    required Future<void> Function() onRefreshMedia,
    required Future<void> Function() onRefreshAlbums,
    required Future<void> Function() onTriggerAutoBackup,
  }) {
    _onRefreshMedia = onRefreshMedia;
    _onRefreshAlbums = onRefreshAlbums;
    _onTriggerAutoBackup = onTriggerAutoBackup;

    if (!_isAttached) {
      WidgetsBinding.instance.addObserver(this);
      _isAttached = true;
    }
  }

  /// Detaches the observer from [WidgetsBinding].
  void detach() {
    if (_isAttached) {
      WidgetsBinding.instance.removeObserver(this);
      _isAttached = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      if (_onRefreshMedia != null && _onRefreshAlbums != null && _onTriggerAutoBackup != null) {
        AppFlowOrchestrator().onAppForegrounded(
          onRefreshMedia: _onRefreshMedia!,
          onRefreshAlbums: _onRefreshAlbums!,
          onTriggerAutoBackup: _onTriggerAutoBackup!,
        );
      }
    }
  }
}
