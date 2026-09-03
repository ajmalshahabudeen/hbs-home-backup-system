import 'dart:async';
import 'dart:io';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import '../../../models/photo_media_item.dart';
import '../../../models/sync_state.dart';
import '../../../services/media_discovery_service.dart';
import '../../../services/storage_service.dart';
import '../../utils/media_path_filter.dart';
import '../client/backup_api_client.dart';
import '../dedupe/dedupe_engine.dart';
import '../index/backup_index_db.dart';
import '../notifications/backup_notifications.dart';

class UploadQueueEngine {
  static final UploadQueueEngine _instance = UploadQueueEngine._internal();
  factory UploadQueueEngine() => _instance;
  UploadQueueEngine._internal();

  bool _isRunning = false;
  bool get isRunning => _isRunning;
  bool _isCancelled = false;
  CancelToken? _currentCancelToken;
  SyncState _currentState = const SyncState();

  bool get isSyncing => _currentState.isSyncing;
  bool get isCancelled => _isCancelled;
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

  /// High-throughput enqueueing with delta pre-filtering against local SQLite index
  Future<int> enqueueItems(
    List<PhotoMediaItem> items, {
    String parentPath = 'MobileBackups',
    bool filterIndexed = true,
  }) async {
    if (items.isEmpty) return 0;

    Set<String>? uploadedKeys;
    Set<String>? uploadedNames;
    if (filterIndexed) {
      final keys = await BackupIndexDb().getUploadedKeys();
      uploadedKeys = keys.nameSizeKeys;
      uploadedNames = keys.names;
    }

    final toEnqueue = <Map<String, dynamic>>[];
    for (final item in items) {
      final nameLower = item.name.trim().toLowerCase();
      // Delta check: if both name and size match or exact name was uploaded, skip
      if (filterIndexed && uploadedKeys != null && uploadedNames != null) {
        if (item.size > 0 && uploadedKeys.contains('$nameLower|${item.size}')) {
          continue;
        }
        if (item.size == 0 && uploadedNames.contains(nameLower)) {
          continue;
        }
      }

      toEnqueue.add({
        'id': item.id,
        'asset_id': item.assetId,
        'file_path': item.path,
        'file_name': item.name,
        'file_size': item.size,
        'mime_type': item.mimeType,
        'parent_path': parentPath,
      });
    }

    if (toEnqueue.isNotEmpty) {
      await BackupIndexDb().enqueueBatchUpload(toEnqueue);
    }
    return toEnqueue.length;
  }

  Future<void> startSync({
    List<PhotoMediaItem>? items,
    int concurrency = 4,
    bool showNotifications = true,
  }) async {
    if (_isRunning) return;
    if (StorageService().isUserLoggedOut()) return;
    final token = await StorageService().getSessionToken();
    if (token == null || token.isEmpty) return;

    if (!await _wifiOk()) {
      _updateState(_currentState.copyWith(
        isSyncing: false,
        syncStepMessage: 'Waiting for Wi-Fi…',
      ));
      return;
    }

    if (items != null && items.isNotEmpty) {
      final validIds = items.map((e) => e.id).toSet();
      await BackupIndexDb().prunePendingQueueNotIn(validIds);
      await enqueueItems(items);
    }

    _isRunning = true;
    _isCancelled = false;
    BackupNotificationManager().resetCancellation();
    _currentCancelToken = CancelToken();

    var pending = await BackupIndexDb().pendingUploads();
    if (pending.isEmpty) {
      _isRunning = false;
      _updateState(_currentState.copyWith(
        isSyncing: false,
        syncStepMessage: 'All media is backed up',
      ));
      return;
    }

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
            if (_isCancelled || _currentCancelToken?.isCancelled == true) break;
            if (StorageService().isUserLoggedOut()) {
              cancelSync();
              break;
            }

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

            if (showNotifications && !_isCancelled && _isRunning) {
              BackupNotificationManager().showSyncProgress(
                current: synced + skipped + failed + 1,
                total: pending.length,
                fileName: name,
              );
            }

            try {
              // Resolve device asset if path does not exist
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
                  if (path.isNotEmpty) {
                    await BackupIndexDb().updateQueueFileInfo(
                      id: id,
                      filePath: path,
                      fileSize: size,
                    );
                  }
                }
              }

              final file = File(path);
              if (path.isEmpty || !await file.exists()) {
                failed++;
                await BackupIndexDb().markQueueStatus(id, 'failed');
                continue;
              }

              // Verify file is not in hidden app-private directories
              if (MediaPathFilter.isAndroidAppFolder(filePath: path)) {
                skipped++;
                await BackupIndexDb().deleteQueueItem(id);
                continue;
              }

              // Strict allowed folders guard: verify file path is in user-allowed albums
              final savedAlbumIds = StorageService().getStringList('hbs_backup_selected_albums');
              final allAlbums = await MediaDiscoveryService().getAlbums();
              final allowedNames = (savedAlbumIds.isNotEmpty
                      ? allAlbums.where((a) => savedAlbumIds.contains(a.id) || savedAlbumIds.contains(a.name.toLowerCase()))
                      : allAlbums.where(MediaDiscoveryService.isCameraRollAlbum))
                  .map((a) => a.name.toLowerCase())
                  .toList();

              if (allowedNames.isNotEmpty && !MediaDiscoveryService.isFileInAllowedAlbums(
                filePath: path,
                allowedFolderNames: allowedNames,
              )) {
                skipped++;
                await BackupIndexDb().deleteQueueItem(id);
                continue;
              }

              final effectiveSize = size > 0 ? size : await file.length();

              // Deduplication preflight
              final isDup = await DedupeEngine().isDuplicate(
                filePath: path,
                fileName: name,
                fileSize: effectiveSize,
                parentPath: parent,
              );

              if (isDup) {
                skipped++;
                await BackupIndexDb().markQueueStatus(id, 'skipped');
                continue;
              }

              await BackupApiClient().uploadFile(
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

              final hash = await DedupeEngine().calculateFileChecksum(path);
              await BackupIndexDb().recordUploaded(
                id: id,
                fileName: name,
                filePath: path,
                fileSize: effectiveSize,
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

      if (_isCancelled || _currentCancelToken?.isCancelled == true) {
        await BackupNotificationManager().cancelSyncNotification();
        _updateState(_currentState.copyWith(
          isSyncing: false,
          syncedCount: synced,
          failedCount: failed,
          skippedCount: skipped,
          syncStepMessage: 'Backup cancelled',
        ));
        return;
      }

      _updateState(_currentState.copyWith(
        isSyncing: false,
        syncedCount: synced,
        failedCount: failed,
        skippedCount: skipped,
        syncStepMessage: 'Backup completed',
        lastSyncTime: DateTime.now(),
      ));

      if (showNotifications) {
        BackupNotificationManager().finishSyncNotification(
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
    if (StorageService().isUserLoggedOut()) return;
    final token = await StorageService().getSessionToken();
    if (token == null || token.isEmpty) return;
    final pending = await BackupIndexDb().pendingUploads();
    if (pending.isEmpty) return;
    await startSync(concurrency: concurrency);
  }

  void cancelSync() {
    _isRunning = false;
    _isCancelled = true;
    _currentCancelToken?.cancel('User cancelled');
    _currentCancelToken = null;
    BackupNotificationManager().cancelSyncNotification();
    _updateState(_currentState.copyWith(
      isSyncing: false,
      syncStepMessage: 'Backup cancelled',
    ));
  }
}
