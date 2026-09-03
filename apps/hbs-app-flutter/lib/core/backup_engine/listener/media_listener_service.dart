import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/services.dart';
import 'package:photo_manager/photo_manager.dart';
import '../../../services/media_discovery_service.dart';
import '../../../services/storage_service.dart';
import '../index/backup_index_db.dart';
import '../queue/upload_queue_engine.dart';

/// Real-time media change listener that monitors camera and device storage changes.
/// Automatically detects newly captured photos/videos from user-allowed backup folders
/// and enqueues them for background/foreground auto-upload.
class MediaListenerService {
  static final MediaListenerService _instance = MediaListenerService._internal();
  factory MediaListenerService() => _instance;
  MediaListenerService._internal();

  bool _isListening = false;
  bool get isListening => _isListening;

  Timer? _debounceTimer;
  bool _isProcessing = false;

  final StreamController<int> _newMediaDetectedController = StreamController<int>.broadcast();
  Stream<int> get onNewMediaDetected => _newMediaDetectedController.stream;

  void startListening() {
    if (_isListening) return;
    _isListening = true;
    try {
      PhotoManager.addChangeCallback(_onMediaChange);
      PhotoManager.startChangeNotify().catchError((_) {});
    } catch (_) {}
  }

  void stopListening() {
    if (!_isListening) return;
    _isListening = false;
    _debounceTimer?.cancel();
    try {
      PhotoManager.removeChangeCallback(_onMediaChange);
      PhotoManager.stopChangeNotify().catchError((_) {});
    } catch (_) {}
  }

  void _onMediaChange(MethodCall _) {
    if (!_isListening) return;
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 1500), () {
      processNewMediaChanges();
    });
  }

  /// Scans for newly added media files and automatically enqueues/uploads if from allowed folders
  Future<int> processNewMediaChanges() async {
    if (_isProcessing) return 0;
    _isProcessing = true;

    try {
      // 1. Verify Auto-Backup preference
      final autoBackup = StorageService().getBool('hbs_auto_backup', defaultValue: false);
      if (!autoBackup) return 0;

      // 2. Verify Session Auth
      final token = await StorageService().getSessionToken();
      if (token == null || token.isEmpty) return 0;

      // 3. Verify Permission
      final hasPerm = await MediaDiscoveryService().isPermissionGranted();
      if (!hasPerm) return 0;

      // 4. Verify Wi-Fi network constraints
      final wifiOnly = StorageService().getBool('hbs_wifi_only', defaultValue: true);
      if (wifiOnly) {
        final connectivity = await Connectivity().checkConnectivity();
        if (!connectivity.contains(ConnectivityResult.wifi)) {
          return 0;
        }
      }

      // 5. Query user allowed folders
      final savedAlbumIds = StorageService().getStringList('hbs_backup_selected_albums');
      final allAlbums = await MediaDiscoveryService().getAlbums();

      // If user selected specific folders, only scan those. If none selected, scan all permitted folders.
      final targetAlbums = savedAlbumIds.isEmpty
          ? allAlbums
          : allAlbums.where((a) => savedAlbumIds.contains(a.id)).toList();

      if (savedAlbumIds.isNotEmpty && targetAlbums.isEmpty) {
        return 0;
      }

      // 6. Discover local media
      final items = await MediaDiscoveryService().getLocalMediaForAlbums(
        targetAlbums,
        allowFallbackToAll: savedAlbumIds.isEmpty && allAlbums.isNotEmpty,
      );

      // 7. Filter media preferences
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

      // 8. Filter against SQLite uploaded index
      final indexKeys = await BackupIndexDb().getUploadedKeys();
      final delta = eligible.where((item) {
        final key = '${item.name.toLowerCase()}|${item.size}';
        if (item.size > 0 && indexKeys.nameSizeKeys.contains(key)) return false;
        if (item.size == 0 && indexKeys.names.contains(item.name.toLowerCase())) return false;
        return true;
      }).toList();

      if (delta.isEmpty) return 0;

      // 9. Enqueue newly discovered delta items
      await UploadQueueEngine().enqueueItems(delta, filterIndexed: true);
      _newMediaDetectedController.add(delta.length);

      // 10. Trigger queue processing
      final batterySaver = StorageService().getBool('hbs_battery_saver', defaultValue: true);
      UploadQueueEngine().resumePending(concurrency: batterySaver ? 2 : 4);

      return delta.length;
    } catch (_) {
      return 0;
    } finally {
      _isProcessing = false;
    }
  }
}
