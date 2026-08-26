import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/utils/background_backup.dart';
import '../models/sync_state.dart';
import '../services/api_service.dart';
import '../services/backup_index_db.dart';
import '../services/media_discovery_service.dart';
import '../services/storage_service.dart';
import '../services/upload_queue_service.dart';

class BackupState {
  final List<LocalAlbum> albums;
  final List<String> selectedAlbumIds;
  final SyncState syncState;
  final bool batterySaverEnabled;
  final bool wifiOnly;
  final bool autoBackup;
  final int indexedCount;
  final bool isLoadingAlbums;

  const BackupState({
    this.albums = const [],
    this.selectedAlbumIds = const [],
    this.syncState = const SyncState(),
    this.batterySaverEnabled = true,
    this.wifiOnly = true,
    this.autoBackup = false,
    this.indexedCount = 0,
    this.isLoadingAlbums = false,
  });

  BackupState copyWith({
    List<LocalAlbum>? albums,
    List<String>? selectedAlbumIds,
    SyncState? syncState,
    bool? batterySaverEnabled,
    bool? wifiOnly,
    bool? autoBackup,
    int? indexedCount,
    bool? isLoadingAlbums,
  }) {
    return BackupState(
      albums: albums ?? this.albums,
      selectedAlbumIds: selectedAlbumIds ?? this.selectedAlbumIds,
      syncState: syncState ?? this.syncState,
      batterySaverEnabled: batterySaverEnabled ?? this.batterySaverEnabled,
      wifiOnly: wifiOnly ?? this.wifiOnly,
      autoBackup: autoBackup ?? this.autoBackup,
      indexedCount: indexedCount ?? this.indexedCount,
      isLoadingAlbums: isLoadingAlbums ?? this.isLoadingAlbums,
    );
  }
}

class BackupNotifier extends StateNotifier<BackupState> {
  BackupNotifier() : super(const BackupState()) {
    _init();
  }

  void _init() {
    final storage = StorageService();
    final savedAlbumIds = storage.getStringList('hbs_backup_selected_albums');
    final battery = storage.getBool('hbs_battery_saver', defaultValue: true);
    final wifiOnly = storage.getBool('hbs_wifi_only', defaultValue: true);
    final autoBackup = storage.getBool('hbs_auto_backup', defaultValue: false);

    state = state.copyWith(
      selectedAlbumIds: savedAlbumIds,
      batterySaverEnabled: battery,
      wifiOnly: wifiOnly,
      autoBackup: autoBackup,
    );

    UploadQueueService().stateStream.listen((syncState) {
      state = state.copyWith(syncState: syncState);
    });

    loadAlbums();
    refreshIndexCount();
    UploadQueueService().resumePending(concurrency: battery ? 2 : 4);
  }

  Future<void> loadAlbums() async {
    state = state.copyWith(isLoadingAlbums: true);
    final albums = await MediaDiscoveryService().getAlbums();
    state = state.copyWith(
      albums: albums,
      isLoadingAlbums: false,
    );
  }

  Future<void> refreshIndexCount() async {
    final count = await BackupIndexDb().getIndexedCount();
    state = state.copyWith(indexedCount: count);
  }

  Future<void> toggleAlbum(String albumId) async {
    final list = List<String>.from(state.selectedAlbumIds);
    if (list.contains(albumId)) {
      list.remove(albumId);
    } else {
      list.add(albumId);
    }
    state = state.copyWith(selectedAlbumIds: list);
    await StorageService().setStringList('hbs_backup_selected_albums', list);
  }

  Future<void> setBatterySaver(bool enabled) async {
    state = state.copyWith(batterySaverEnabled: enabled);
    await StorageService().setBool('hbs_battery_saver', enabled);
  }

  Future<void> setWifiOnly(bool enabled) async {
    state = state.copyWith(wifiOnly: enabled);
    await StorageService().setBool('hbs_wifi_only', enabled);
  }

  Future<void> setAutoBackup(bool enabled) async {
    state = state.copyWith(autoBackup: enabled);
    await StorageService().setBool('hbs_auto_backup', enabled);
    if (enabled) {
      await scheduleBackgroundBackup();
    } else {
      await cancelBackgroundBackup();
    }
  }

  Future<void> startSync() async {
    final selected = state.selectedAlbumIds;
    final targetAlbums = selected.isEmpty
        ? state.albums
        : state.albums.where((a) => selected.contains(a.id)).toList();

    final itemsToSync = (await MediaDiscoveryService().getLocalMediaForAlbums(targetAlbums)).where((item) {
      final includePhotos = StorageService().getBool('hbs_backup_photos', defaultValue: true);
      final includeVideos = StorageService().getBool('hbs_backup_videos', defaultValue: true);
      final maxMb = int.tryParse(StorageService().getString('hbs_backup_max_mb', defaultValue: '0')) ?? 0;
      if (item.isVideo && !includeVideos) return false;
      if (!item.isVideo && !includePhotos) return false;
      if (maxMb > 0 && item.size > maxMb * 1024 * 1024) return false;
      return true;
    }).toList();
    try {
      final stats = await ApiService().getUserStats();
      final quota = stats.quotaBytes;
      final used = stats.usedBytes ?? stats.totalBytes;
      if (quota != null && quota > 0 && used >= quota) {
        state = state.copyWith(
          syncState: state.syncState.copyWith(
            isSyncing: false,
            syncStepMessage: 'Storage quota is full — backup paused',
          ),
        );
        return;
      }
      if (quota != null && quota > 0 && used > (quota * 0.9)) {
        state = state.copyWith(
          syncState: state.syncState.copyWith(
            syncStepMessage: 'Quota almost full (${((used / quota) * 100).toStringAsFixed(0)}%)',
          ),
        );
      }
    } catch (_) {}
    await UploadQueueService().startSync(
      items: itemsToSync,
      concurrency: state.batterySaverEnabled ? 2 : 4,
    );
    await refreshIndexCount();
  }

  Future<void> autoBackupIfEnabled() async {
    if (!state.autoBackup || state.syncState.isSyncing) return;
    await startSync();
  }

  void cancelSync() {
    UploadQueueService().cancelSync();
  }

  Future<void> purgeAndRebuildIndex() async {
    await BackupIndexDb().clearAll();
    await refreshIndexCount();
  }
}

final backupProvider = StateNotifierProvider<BackupNotifier, BackupState>((ref) {
  return BackupNotifier();
});
