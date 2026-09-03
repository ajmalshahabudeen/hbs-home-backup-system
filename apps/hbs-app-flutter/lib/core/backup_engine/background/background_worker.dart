import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/widgets.dart';
import 'package:workmanager/workmanager.dart';
import '../../../core/utils/lan_host.dart';
import '../../../services/api_service.dart';
import '../../../services/media_discovery_service.dart';
import '../../../services/storage_service.dart';
import '../index/backup_index_db.dart';
import '../queue/upload_queue_engine.dart';

const hbsBackupTask = 'hbs.autoBackup';

@pragma('vm:entry-point')
void hbsBackgroundDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    WidgetsFlutterBinding.ensureInitialized();
    try {
      await StorageService().init();
      final autoBackup = StorageService().getBool('hbs_auto_backup', defaultValue: false);
      if (!autoBackup) return true;

      final url = StorageService().getString('hbs_server_url', defaultValue: LanHost.defaultUrl);
      final token = await StorageService().getSessionToken();
      if (token == null || token.isEmpty) return true;

      ApiService().updateConfig(serverUrl: url, sessionToken: token);
      await BackupIndexDb().database;

      // Verify network constraints
      final wifiOnly = StorageService().getBool('hbs_wifi_only', defaultValue: true);
      if (wifiOnly) {
        final connectivity = await Connectivity().checkConnectivity();
        if (!connectivity.contains(ConnectivityResult.wifi)) {
          return true;
        }
      }

      // Check if media permission is granted before scanning
      final hasPerm = await MediaDiscoveryService().isPermissionGranted();
      if (hasPerm) {
        final savedAlbumIds = StorageService().getStringList('hbs_backup_selected_albums');
        final allAlbums = await MediaDiscoveryService().getAlbums();
        final targetAlbums = savedAlbumIds.isEmpty
            ? allAlbums
            : allAlbums.where((a) => savedAlbumIds.contains(a.id)).toList();

        final items = await MediaDiscoveryService().getLocalMediaForAlbums(targetAlbums);

        // Filter media preferences (photos, videos, max size, raw)
        final includePhotos = StorageService().getBool('hbs_backup_photos', defaultValue: true);
        final includeVideos = StorageService().getBool('hbs_backup_videos', defaultValue: true);
        final maxMb = int.tryParse(StorageService().getString('hbs_backup_max_mb', defaultValue: '0')) ?? 0;
        final includeRaw = StorageService().getBool('hbs_backup_raw', defaultValue: true);

        final eligible = items.where((item) {
          if (item.isVideo && !includeVideos) return false;
          if (!item.isVideo && !includePhotos) return false;
          if (!includeRaw) {
            const raw = {'dng', 'raw', 'cr2', 'nef', 'arw', 'raf', 'orf', 'rw2'};
            final ext = item.name.split('.').last.toLowerCase();
            if (raw.contains(ext)) return false;
          }
          if (maxMb > 0 && item.size > maxMb * 1024 * 1024) return false;
          return true;
        }).toList();

        // Enqueue only unbacked delta items
        await UploadQueueEngine().enqueueItems(eligible, filterIndexed: true);
      }

      // Resume any pending queue items (concurrency: 1 in background to conserve resources)
      await UploadQueueEngine().resumePending(concurrency: 1);
      return true;
    } catch (_) {
      return false;
    }
  });
}

Future<void> initBackgroundBackup() async {
  try {
    await Workmanager().initialize(hbsBackgroundDispatcher);
    final auto = StorageService().getBool('hbs_auto_backup', defaultValue: false);
    if (auto) {
      await scheduleBackgroundBackup();
    }
  } catch (_) {}
}

Future<void> scheduleBackgroundBackup() async {
  try {
    final minutes = int.tryParse(StorageService().getString('hbs_backup_minutes', defaultValue: '15')) ?? 15;
    final freq = Duration(minutes: minutes < 15 ? 15 : minutes);
    await Workmanager().registerPeriodicTask(
      hbsBackupTask,
      hbsBackupTask,
      frequency: freq,
      constraints: Constraints(networkType: NetworkType.connected),
      existingWorkPolicy: ExistingPeriodicWorkPolicy.update,
    );
  } catch (_) {}
}

Future<void> cancelBackgroundBackup() async {
  try {
    await Workmanager().cancelByUniqueName(hbsBackupTask);
  } catch (_) {}
}
