import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../core/backup_engine/notifications/backup_notifications.dart';

class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  bool _isInitialized = false;

  static const int syncNotificationId = 38480;

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

  Future<void> showSyncProgress({
    required int current,
    required int total,
    required String fileName,
  }) async {
    await BackupNotificationManager().showSyncProgress(
      current: current,
      total: total,
      fileName: fileName,
    );
  }

  Future<void> finishSyncNotification({
    required int totalSynced,
    required int failedCount,
  }) async {
    await BackupNotificationManager().finishSyncNotification(
      totalSynced: totalSynced,
      failedCount: failedCount,
    );
  }


  Future<void> showInboxAlert(String title, String body) async {
    await init();
    const android = AndroidNotificationDetails(
      'hbs-inbox',
      'HBS Family',
      channelDescription: 'Shared folder activity',
      importance: Importance.defaultImportance,
    );
    await _plugin.show(syncNotificationId + 2, title, body, const NotificationDetails(android: android));
  }

  Future<void> cancelSyncNotification() async {
    await BackupNotificationManager().cancelSyncNotification();
    try {
      await _plugin.cancel(syncNotificationId);
    } catch (_) {}
  }
}
