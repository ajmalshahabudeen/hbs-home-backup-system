import 'package:flutter_local_notifications/flutter_local_notifications.dart';

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

    await _plugin.show(
      syncNotificationId,
      'Backing up to HBS Server ($progress%)',
      '$current / $total: $fileName',
      details,
    );
  }

  Future<void> finishSyncNotification({
    required int totalSynced,
    required int failedCount,
  }) async {
    await init();
    // Cancel ongoing notification
    await _plugin.cancel(syncNotificationId);

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

    await _plugin.show(
      syncNotificationId + 1,
      title,
      body,
      details,
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
    await _plugin.cancel(syncNotificationId);
  }
}
