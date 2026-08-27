import 'package:flutter/widgets.dart';
import 'package:workmanager/workmanager.dart';
import '../../core/utils/lan_host.dart';
import '../../services/api_service.dart';
import '../../services/backup_index_db.dart';
import '../../services/storage_service.dart';
import '../../services/upload_queue_service.dart';

const hbsBackupTask = 'hbs.autoBackup';

@pragma('vm:entry-point')
void hbsBackgroundDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    WidgetsFlutterBinding.ensureInitialized();
    await StorageService().init();
    final url = StorageService().getString('hbs_server_url', defaultValue: LanHost.defaultUrl);
    final token = await StorageService().getSessionToken();
    if (token == null || token.isEmpty) return true;
    ApiService().updateConfig(serverUrl: url, sessionToken: token);
    await BackupIndexDb().database;
    await UploadQueueService().resumePending(concurrency: 1);
    return true;
  });
}

Future<void> initBackgroundBackup() async {
  await Workmanager().initialize(hbsBackgroundDispatcher);
  final auto = StorageService().getBool('hbs_auto_backup', defaultValue: false);
  if (auto) {
    await scheduleBackgroundBackup();
  }
}

Future<void> scheduleBackgroundBackup() async {
  final minutes = int.tryParse(StorageService().getString('hbs_backup_minutes', defaultValue: '15')) ?? 15;
  final freq = Duration(minutes: minutes < 15 ? 15 : minutes);
  await Workmanager().registerPeriodicTask(
    hbsBackupTask,
    hbsBackupTask,
    frequency: freq,
    constraints: Constraints(networkType: NetworkType.unmetered),
    existingWorkPolicy: ExistingPeriodicWorkPolicy.update,
  );
}

Future<void> cancelBackgroundBackup() async {
  await Workmanager().cancelByUniqueName(hbsBackupTask);
}
