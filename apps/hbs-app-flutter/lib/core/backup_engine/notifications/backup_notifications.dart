import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../../services/storage_service.dart';

class BackupNotificationManager {
  static final BackupNotificationManager _instance = BackupNotificationManager._internal();
  factory BackupNotificationManager() => _instance;
  BackupNotificationManager._internal();

  final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  bool _isInitialized = false;

  static const int syncNotificationId = 38480;
  static const int completeNotificationId = 38481;
  static const String prefKey = 'hbs_backup_notifications';

  int _lastNotificationTime = 0;

  bool get isNotificationsEnabled {
    return StorageService().getBool(prefKey, defaultValue: true);
  }

  Future<void> setNotificationsEnabled(bool enabled) async {
    await StorageService().setBool(prefKey, enabled);
    if (!enabled) {
      await cancelSyncNotification();
    } else {
      await requestPermission();
    }
  }

  Future<bool> requestPermission() async {
    if (kIsWeb) return false;
    try {
      if (Platform.isAndroid) {
        final status = await Permission.notification.request();
        return status.isGranted;
      } else if (Platform.isIOS || Platform.isMacOS) {
        final result = await _plugin
            .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()
            ?.requestPermissions(alert: true, badge: true, sound: true);
        return result ?? false;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> init() async {
    if (_isInitialized) return;

    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const darwinSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );

    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: darwinSettings,
      macOS: darwinSettings,
    );

    await _plugin.initialize(initSettings);
    _isInitialized = true;
  }

  /// Displays or updates the dynamic progress notification
  /// Automatically throttled to prevent flooding the notification bar
  Future<void> showSyncProgress({
    required int current,
    required int total,
    required String fileName,
    bool force = false,
  }) async {
    if (!isNotificationsEnabled) return;

    final now = DateTime.now().millisecondsSinceEpoch;
    // Throttle updates: max once every 300ms unless it's the very first or final item
    if (!force && (now - _lastNotificationTime < 300) && current < total) {
      return;
    }
    _lastNotificationTime = now;

    await init();
    final progress = total > 0 ? ((current / total) * 100).toInt() : 0;

    final androidDetails = AndroidNotificationDetails(
      'hbs-sync-progress',
      'HBS Backup Progress',
      channelDescription: 'Dynamic progress updates for photo and file backup',
      importance: Importance.low,
      priority: Priority.low,
      showProgress: true,
      maxProgress: total > 0 ? total : 100,
      progress: current,
      ongoing: true,
      autoCancel: false,
      onlyAlertOnce: true,
    );

    final details = NotificationDetails(android: androidDetails);

    try {
      await _plugin.show(
        syncNotificationId,
        'Backing up to HBS Server ($progress%)',
        '$current / $total: $fileName',
        details,
      );
    } catch (_) {}
  }

  /// Displays the completion notification after backup finishes
  Future<void> finishSyncNotification({
    required int totalSynced,
    required int failedCount,
  }) async {
    await init();
    // Cancel ongoing progress notification
    await cancelSyncNotification();

    if (!isNotificationsEnabled) return;

    final androidDetails = AndroidNotificationDetails(
      'hbs-sync-complete',
      'HBS Backup Completed',
      channelDescription: 'Alerts when media backup completes',
      importance: Importance.defaultImportance,
      priority: Priority.defaultPriority,
      autoCancel: true,
    );

    final details = NotificationDetails(android: androidDetails);

    final title = failedCount > 0 ? 'Backup Completed with issues' : 'Backup Completed';
    final body = failedCount > 0
        ? 'Successfully backed up $totalSynced items ($failedCount failed).'
        : 'All $totalSynced items safely backed up to your HBS server.';

    try {
      await _plugin.show(
        completeNotificationId,
        title,
        body,
        details,
      );
    } catch (_) {}
  }

  Future<void> cancelSyncNotification() async {
    try {
      await _plugin.cancel(syncNotificationId);
    } catch (_) {}
  }
}
