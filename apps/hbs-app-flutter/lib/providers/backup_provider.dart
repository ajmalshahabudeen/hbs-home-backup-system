import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/sync_state.dart';
import '../services/backup_index_db.dart';
import '../services/media_discovery_service.dart';
import '../services/storage_service.dart';
import '../services/upload_queue_service.dart';

class BackupState {
  final List<LocalAlbum> albums;
  final List<String> selectedAlbumIds;
  final SyncState syncState;
  final bool batterySaverEnabled;
  final int indexedCount;
  final bool isLoadingAlbums;

  const BackupState({
    this.albums = const [],
    this.selectedAlbumIds = const [],
    this.syncState = const SyncState(),
    this.batterySaverEnabled = true,
    this.indexedCount = 0,
    this.isLoadingAlbums = false,
  });

  BackupState copyWith({
    List<LocalAlbum>? albums,
    List<String>? selectedAlbumIds,
    SyncState? syncState,
    bool? batterySaverEnabled,
    int? indexedCount,
    bool? isLoadingAlbums,
  }) {
    return BackupState(
      albums: albums ?? this.albums,
      selectedAlbumIds: selectedAlbumIds ?? this.selectedAlbumIds,
      syncState: syncState ?? this.syncState,
      batterySaverEnabled: batterySaverEnabled ?? this.batterySaverEnabled,
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

    state = state.copyWith(
      selectedAlbumIds: savedAlbumIds,
      batterySaverEnabled: battery,
    );

    // Listen to queue state stream
    UploadQueueService().stateStream.listen((syncState) {
      state = state.copyWith(syncState: syncState);
    });

    loadAlbums();
    refreshIndexCount();
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

  Future<void> startSync() async {
    final selected = state.selectedAlbumIds;
    final List<LocalAlbum> targetAlbums = [];

    if (selected.isEmpty) {
      // If no specific album selected, use all
      targetAlbums.addAll(state.albums);
    } else {
      targetAlbums.addAll(state.albums.where((a) => selected.contains(a.id)));
    }

    // Gather all media items from target albums
    final itemsToSync = await MediaDiscoveryService().getLocalMedia(pageSize: 500);

    UploadQueueService().startSync(
      items: itemsToSync,
      concurrency: state.batterySaverEnabled ? 2 : 4,
    );
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
