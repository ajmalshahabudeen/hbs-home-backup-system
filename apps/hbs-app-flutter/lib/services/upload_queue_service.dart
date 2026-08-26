import 'dart:async';
import 'dart:io';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import '../models/photo_media_item.dart';
import '../models/sync_state.dart';
import 'backup_index_db.dart';
import 'dedupe_service.dart';
import 'media_discovery_service.dart';
import 'notification_service.dart';
import 'storage_service.dart';
import 'api_service.dart';

class UploadQueueService {
  static final UploadQueueService _instance = UploadQueueService._internal();
  factory UploadQueueService() => _instance;
  UploadQueueService._internal();

  bool _isRunning = false;
  bool get isRunning => _isRunning;

  CancelToken? _currentCancelToken;
  SyncState _currentState = const SyncState();
  SyncState get currentState => _currentState;

  final StreamController<SyncState> _stateController = StreamController<SyncState>.broadcast();
  Stream<SyncState> get stateStream => _stateController.stream;

  void _updateState(SyncState newState) {
    _currentState = newState;
    _stateController.add(newState);
  }

  Future<bool> _wifiOk() async {
    final wifiOnly = StorageService().getBool('hbs_wifi_only', defaultValue: true);
    if (!wifiOnly) return true;
    final results = await Connectivity().checkConnectivity();
    return results.contains(ConnectivityResult.wifi);
  }

  Future<void> enqueueItems(List<PhotoMediaItem> items, {String parentPath = 'MobileBackups'}) async {
    for (final item in items) {
      await BackupIndexDb().enqueueUpload(
        id: item.id,
        assetId: item.assetId,
        filePath: item.path,
        fileName: item.name,
        fileSize: item.size,
        mimeType: item.mimeType,
        parentPath: parentPath,
      );
    }
  }

  Future<void> startSync({
    List<PhotoMediaItem>? items,
    int concurrency = 4,
    bool showNotifications = true,
  }) async {
    if (_isRunning) return;
    if (!await _wifiOk()) {
      _updateState(_currentState.copyWith(
        isSyncing: false,
        syncStepMessage: 'Waiting for Wi-Fi…',
      ));
      return;
    }

    if (items != null && items.isNotEmpty) {
      await enqueueItems(items);
    }

    _isRunning = true;
    _currentCancelToken = CancelToken();

    var pending = await BackupIndexDb().pendingUploads();
    _updateState(SyncState(
      isSyncing: true,
      totalToSync: pending.length,
      syncedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      syncStepMessage: 'Starting backup...',
    ));

    int synced = 0;
    int failed = 0;
    int skipped = 0;

    try {
      final queue = List<Map<String, dynamic>>.from(pending);
      final workers = <Future<void>>[];
      final lock = queue;

      for (int i = 0; i < concurrency; i++) {
        workers.add(Future(() async {
          while (lock.isNotEmpty && _isRunning) {
            final row = lock.removeAt(0);
            final id = row['id']?.toString() ?? '';
            final name = row['file_name']?.toString() ?? 'file';
            var path = row['file_path']?.toString() ?? '';
            final assetId = row['asset_id']?.toString();
            final mime = row['mime_type']?.toString();
            final parent = row['parent_path']?.toString() ?? 'MobileBackups';
            var size = (row['file_size'] as num?)?.toInt() ?? 0;
            var uploadId = row['upload_id']?.toString() ?? '';
            if (uploadId.isEmpty) {
              uploadId = 'q_$id';
              await BackupIndexDb().saveUploadId(id, uploadId);
            }

            _updateState(_currentState.copyWith(
              currentFileName: name,
              syncStepMessage: 'Uploading $name...',
              syncedCount: synced,
              failedCount: failed,
              skippedCount: skipped,
            ));

            if (showNotifications) {
              NotificationService().showSyncProgress(
                current: synced + skipped + failed + 1,
                total: pending.length,
                fileName: name,
              );
            }

            try {
              if (path.isEmpty || !await File(path).exists()) {
                if (assetId != null && assetId.isNotEmpty) {
                  final resolved = await MediaDiscoveryService().resolveFile(
                    PhotoMediaItem(
                      id: id,
                      path: path,
                      name: name,
                      size: size,
                      isVideo: (mime ?? '').startsWith('video/'),
                      url: path,
                      assetId: assetId,
                      mimeType: mime,
                    ),
                  );
                  path = resolved.path;
                  size = resolved.size;
                }
              }
              final file = File(path);
              if (path.isEmpty || !await file.exists()) {
                failed++;
                await BackupIndexDb().markQueueStatus(id, 'failed');
                continue;
              }

              final isDup = await DedupeService().isDuplicate(
                filePath: path,
                fileName: name,
                fileSize: size > 0 ? size : await file.length(),
                parentPath: parent,
              );

              if (isDup) {
                skipped++;
                await BackupIndexDb().markQueueStatus(id, 'skipped');
                continue;
              }

              await ApiService().uploadFile(
                filePath: path,
                fileName: name,
                mimeType: mime,
                parentPath: parent,
                uploadId: uploadId,
                cancelToken: _currentCancelToken,
                onSendProgress: (sent, total) {
                  if (total > 0) {
                    _updateState(_currentState.copyWith(currentFileProgress: sent / total));
                  }
                },
              );

              final hash = await DedupeService().calculateFileChecksum(path);
              await BackupIndexDb().recordUploaded(
                id: id,
                fileName: name,
                filePath: path,
                fileSize: size > 0 ? size : await file.length(),
                checksum: hash,
                mimeType: mime,
              );
              await BackupIndexDb().markQueueStatus(id, 'done');
              synced++;
            } catch (e) {
              if (_currentCancelToken?.isCancelled == true) break;
              failed++;
              await BackupIndexDb().markQueueStatus(id, 'failed');
            }
          }
        }));
      }

      await Future.wait(workers);
      await BackupIndexDb().clearFinishedQueue();

      _updateState(_currentState.copyWith(
        isSyncing: false,
        syncedCount: synced,
        failedCount: failed,
        skippedCount: skipped,
        syncStepMessage: 'Backup completed',
        lastSyncTime: DateTime.now(),
      ));

      if (showNotifications) {
        NotificationService().finishSyncNotification(
          totalSynced: synced + skipped,
          failedCount: failed,
        );
      }
    } finally {
      _isRunning = false;
      _currentCancelToken = null;
    }
  }

  Future<void> resumePending({int concurrency = 2}) async {
    final pending = await BackupIndexDb().pendingUploads();
    if (pending.isEmpty) return;
    await startSync(concurrency: concurrency);
  }

  void cancelSync() {
    _isRunning = false;
    _currentCancelToken?.cancel('User cancelled');
    NotificationService().cancelSyncNotification();
    _updateState(_currentState.copyWith(
      isSyncing: false,
      syncStepMessage: 'Backup paused',
    ));
  }
}
