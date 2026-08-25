import 'dart:async';
import 'dart:io';
import 'package:dio/dio.dart';
import '../models/photo_media_item.dart';
import '../models/sync_state.dart';
import 'api_service.dart';
import 'backup_index_db.dart';
import 'dedupe_service.dart';
import 'notification_service.dart';

typedef SyncProgressCallback = void Function(SyncState state);

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

  Future<void> startSync({
    required List<PhotoMediaItem> items,
    int concurrency = 4,
    bool showNotifications = true,
  }) async {
    if (_isRunning) return;
    _isRunning = true;
    _currentCancelToken = CancelToken();

    _updateState(SyncState(
      isSyncing: true,
      totalToSync: items.length,
      syncedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      syncStepMessage: 'Starting backup...',
    ));

    int synced = 0;
    int failed = 0;
    int skipped = 0;

    try {
      final queue = List<PhotoMediaItem>.from(items);
      final List<Future<void>> workers = [];

      for (int i = 0; i < concurrency; i++) {
        workers.add(Future.microtask(() async {
          while (queue.isNotEmpty && _isRunning) {
            final item = queue.removeAt(0);

            _updateState(_currentState.copyWith(
              currentFileName: item.name,
              syncStepMessage: 'Uploading ${item.name}...',
              syncedCount: synced,
              failedCount: failed,
              skippedCount: skipped,
            ));

            if (showNotifications) {
              NotificationService().showSyncProgress(
                current: synced + skipped + 1,
                total: items.length,
                fileName: item.name,
              );
            }

            try {
              final file = File(item.path);
              if (!await file.exists()) {
                failed++;
                continue;
              }

              // 1. Preflight Deduplication
              final isDup = await DedupeService().isDuplicate(
                filePath: item.path,
                fileName: item.name,
                fileSize: item.size,
                parentPath: 'MobileBackups',
              );

              if (isDup) {
                skipped++;
                continue;
              }

              // 2. Perform Native Upload
              await ApiService().uploadFile(
                filePath: item.path,
                fileName: item.name,
                mimeType: item.mimeType,
                parentPath: 'MobileBackups',
                cancelToken: _currentCancelToken,
                onSendProgress: (sent, total) {
                  if (total > 0) {
                    _updateState(_currentState.copyWith(
                      currentFileProgress: sent / total,
                    ));
                  }
                },
              );

              // 3. Record in SQLite
              final hash = await DedupeService().calculateFileChecksum(item.path);
              await BackupIndexDb().recordUploaded(
                id: item.id,
                fileName: item.name,
                filePath: item.path,
                fileSize: item.size,
                checksum: hash,
                mimeType: item.mimeType,
              );

              synced++;
            } catch (e) {
              if (_currentCancelToken?.isCancelled == true) break;
              failed++;
            }
          }
        }));
      }

      await Future.wait(workers);

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
