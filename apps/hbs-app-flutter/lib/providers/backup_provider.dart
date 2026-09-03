import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/backup_engine/backup_engine.dart';
import '../models/sync_state.dart';
import '../services/api_service.dart';
import '../services/media_discovery_service.dart';
import '../services/storage_service.dart';

class BackupState {
  final List<LocalAlbum> albums;
  final List<String> selectedAlbumIds;
  final SyncState syncState;
  final bool batterySaverEnabled;
  final bool wifiOnly;
  final bool autoBackup;
  final bool notificationsEnabled;
  final bool isBatteryOptimizationIgnored;
  final int indexedCount;
  final bool isLoadingAlbums;
  final bool hasPermission;
  final bool isNewPlatformUser;
  final bool isHydratingIndex;
  final String? indexStatusMessage;
  final bool isMediaListening;

  const BackupState({
    this.albums = const [],
    this.selectedAlbumIds = const [],
    this.syncState = const SyncState(),
    this.batterySaverEnabled = true,
    this.wifiOnly = true,
    this.autoBackup = false,
    this.notificationsEnabled = true,
    this.isBatteryOptimizationIgnored = false,
    this.indexedCount = 0,
    this.isLoadingAlbums = false,
    this.hasPermission = true,
    this.isNewPlatformUser = false,
    this.isHydratingIndex = false,
    this.indexStatusMessage,
    this.isMediaListening = false,
  });

  BackupState copyWith({
    List<LocalAlbum>? albums,
    List<String>? selectedAlbumIds,
    SyncState? syncState,
    bool? batterySaverEnabled,
    bool? wifiOnly,
    bool? autoBackup,
    bool? notificationsEnabled,
    bool? isBatteryOptimizationIgnored,
    int? indexedCount,
    bool? isLoadingAlbums,
    bool? hasPermission,
    bool? isNewPlatformUser,
    bool? isHydratingIndex,
    String? indexStatusMessage,
    bool? isMediaListening,
  }) {
    return BackupState(
      albums: albums ?? this.albums,
      selectedAlbumIds: selectedAlbumIds ?? this.selectedAlbumIds,
      syncState: syncState ?? this.syncState,
      batterySaverEnabled: batterySaverEnabled ?? this.batterySaverEnabled,
      wifiOnly: wifiOnly ?? this.wifiOnly,
      autoBackup: autoBackup ?? this.autoBackup,
      notificationsEnabled: notificationsEnabled ?? this.notificationsEnabled,
      isBatteryOptimizationIgnored: isBatteryOptimizationIgnored ?? this.isBatteryOptimizationIgnored,
      indexedCount: indexedCount ?? this.indexedCount,
      isLoadingAlbums: isLoadingAlbums ?? this.isLoadingAlbums,
      hasPermission: hasPermission ?? this.hasPermission,
      isNewPlatformUser: isNewPlatformUser ?? this.isNewPlatformUser,
      isHydratingIndex: isHydratingIndex ?? this.isHydratingIndex,
      indexStatusMessage: indexStatusMessage ?? this.indexStatusMessage,
      isMediaListening: isMediaListening ?? this.isMediaListening,
    );
  }
}

class BackupNotifier extends StateNotifier<BackupState> {
  StreamSubscription<SyncState>? _queueSub;
  StreamSubscription<bool>? _permissionSub;
  StreamSubscription<int>? _mediaListenerSub;

  BackupNotifier() : super(const BackupState()) {
    _init();
  }

  void _init() {
    final storage = StorageService();
    final savedAlbumIds = storage.getStringList('hbs_backup_selected_albums');
    final battery = storage.getBool('hbs_battery_saver', defaultValue: true);
    final wifiOnly = storage.getBool('hbs_wifi_only', defaultValue: true);
    final autoBackup = storage.getBool('hbs_auto_backup', defaultValue: false);
    final notifications = BackupNotificationManager().isNotificationsEnabled;

    state = state.copyWith(
      selectedAlbumIds: savedAlbumIds,
      batterySaverEnabled: battery,
      wifiOnly: wifiOnly,
      autoBackup: autoBackup,
      notificationsEnabled: notifications,
      isMediaListening: autoBackup,
    );

    _queueSub = UploadQueueEngine().stateStream.listen((syncState) {
      state = state.copyWith(syncState: syncState);
    });

    _permissionSub = MediaDiscoveryService().onPermissionGranted.listen((granted) {
      if (granted) {
        state = state.copyWith(hasPermission: true);
        loadAlbums(force: true);
      } else {
        state = state.copyWith(isLoadingAlbums: false, hasPermission: false);
      }
    });

    final isLoggedOut = storage.isUserLoggedOut();
    if (autoBackup && !isLoggedOut) {
      MediaListenerService().startListening();
    }
    _mediaListenerSub = MediaListenerService().onNewMediaDetected.listen((_) {
      refreshIndexCount();
    });

    MediaDiscoveryService().isPermissionGranted().then((granted) {
      if (!granted) {
        state = state.copyWith(isLoadingAlbums: false, hasPermission: false);
      } else {
        loadAlbums();
      }
    });

    refreshIndexCount();
    checkAndHydrateIndex();
    refreshBatteryOptimizationStatus();
    if (!isLoggedOut) {
      UploadQueueEngine().resumePending(concurrency: battery ? 2 : 4);
    }
  }

  @override
  void dispose() {
    _queueSub?.cancel();
    _permissionSub?.cancel();
    _mediaListenerSub?.cancel();
    super.dispose();
  }

  /// Checks local SQLite index; if empty, fetches server backup index to recover from reinstall.
  /// If both are empty, marks user as a new platform user.
  Future<void> checkAndHydrateIndex({bool force = false}) async {
    final localCount = await BackupIndexDb().getIndexedCount();
    if (localCount > 0 && !force) {
      state = state.copyWith(
        indexedCount: localCount,
        isNewPlatformUser: false,
      );
      return;
    }

    state = state.copyWith(
      isHydratingIndex: true,
      indexStatusMessage: 'Checking server backup index...',
    );

    try {
      final serverIndex = await ApiService().fetchServerBackupIndex();
      if (serverIndex.count > 0) {
        final restored = await BackupIndexDb().hydrateFromServer(serverIndex.items);
        final newCount = await BackupIndexDb().getIndexedCount();
        state = state.copyWith(
          indexedCount: newCount,
          isNewPlatformUser: false,
          isHydratingIndex: false,
          indexStatusMessage: 'Restored $restored items from HBS Cloud index',
        );
      } else {
        // Neither local phone nor server has index: user is brand new to this platform!
        state = state.copyWith(
          indexedCount: 0,
          isNewPlatformUser: true,
          isHydratingIndex: false,
          indexStatusMessage: 'New user: Ready for your first backup',
        );
      }
    } catch (_) {
      state = state.copyWith(isHydratingIndex: false);
    }
  }

  Future<void> refreshBatteryOptimizationStatus() async {
    final ignored = await BatteryOptimizer().isBatteryOptimizationIgnored();
    state = state.copyWith(isBatteryOptimizationIgnored: ignored);
  }

  Future<bool> requestIgnoreBatteryOptimization() async {
    final granted = await BatteryOptimizer().requestIgnoreBatteryOptimization();
    state = state.copyWith(isBatteryOptimizationIgnored: granted);
    return granted;
  }

  Future<bool> openBatterySettings() async {
    return await BatteryOptimizer().openBatterySettings();
  }

  Future<void> setNotificationsEnabled(bool enabled) async {
    state = state.copyWith(notificationsEnabled: enabled);
    await BackupNotificationManager().setNotificationsEnabled(enabled);
  }

  Future<void> loadAlbums({bool force = false}) async {
    final hasPerm = await MediaDiscoveryService().isPermissionGranted();
    if (!hasPerm && !force) {
      state = state.copyWith(isLoadingAlbums: false, hasPermission: false);
      return;
    }

    if (force) {
      final granted = await MediaDiscoveryService().requestPermissions(force: true);
      if (!granted) {
        state = state.copyWith(isLoadingAlbums: false, hasPermission: false);
        return;
      }
    }

    state = state.copyWith(isLoadingAlbums: true, hasPermission: true);
    final albums = await MediaDiscoveryService().getAlbums();

    var selectedIds = List<String>.from(state.selectedAlbumIds);
    if (selectedIds.isEmpty) {
      final saved = StorageService().getStringList('hbs_backup_selected_albums');
      if (saved.isNotEmpty) {
        selectedIds = saved;
      } else {
        // Auto-select standard Camera Roll by default so only Camera is uploaded, never random folders
        final cameraAlbum = albums.where(MediaDiscoveryService.isCameraRollAlbum).firstOrNull ??
            albums.where((a) => a.name.toLowerCase().contains('camera') || a.name.toLowerCase().contains('dcim')).firstOrNull;
        if (cameraAlbum != null) {
          selectedIds = [cameraAlbum.id];
          await StorageService().setStringList('hbs_backup_selected_albums', selectedIds);
        }
      }
    }

    state = state.copyWith(
      albums: albums,
      selectedAlbumIds: selectedIds,
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
    // Clear any queue items that do not belong to the new selection
    await BackupIndexDb().clearQueue();
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
    state = state.copyWith(autoBackup: enabled, isMediaListening: enabled);
    await StorageService().setBool('hbs_auto_backup', enabled);
    if (enabled) {
      MediaListenerService().startListening();
      await scheduleBackgroundBackup();
      await autoBackupIfEnabled();
    } else {
      MediaListenerService().stopListening();
      await cancelBackgroundBackup();
    }
  }

  Future<void> startSync() async {
    if (StorageService().isUserLoggedOut()) return;
    final token = await StorageService().getSessionToken();
    if (token == null || token.isEmpty) return;

    // 1. Strict permission verification before scanning or accessing device media
    final hasPerm = await MediaDiscoveryService().isPermissionGranted();
    if (!hasPerm) {
      final granted = await MediaDiscoveryService().requestPermissions(force: true);
      if (!granted) {
        state = state.copyWith(
          hasPermission: false,
          syncState: state.syncState.copyWith(
            isSyncing: false,
            syncStepMessage: 'Media access permission required for backup',
          ),
        );
        return;
      }
    }
    state = state.copyWith(hasPermission: true);

    final selected = state.selectedAlbumIds;
    if (state.albums.isEmpty) {
      await loadAlbums();
    }

    final List<LocalAlbum> targetAlbums;
    if (selected.isNotEmpty) {
      targetAlbums = state.albums
          .where((a) => selected.contains(a.id) || selected.contains(a.name.toLowerCase()))
          .toList();
    } else {
      // If user hasn't explicitly chosen folders, STRICTLY target the Camera Roll album, NEVER all albums
      targetAlbums = state.albums.where(MediaDiscoveryService.isCameraRollAlbum).toList();
    }

    // If target folders not found, do not fallback to entire device library
    if (targetAlbums.isEmpty) {
      state = state.copyWith(
        syncState: state.syncState.copyWith(
          isSyncing: false,
          syncStepMessage: selected.isNotEmpty
              ? 'Selected folders not found on device'
              : 'No camera folder found to back up',
        ),
      );
      return;
    }

    final itemsToSync = (await MediaDiscoveryService().getLocalMediaForAlbums(
      targetAlbums,
      allowFallbackToAll: false,
    )).where((item) {
      final includePhotos = StorageService().getBool('hbs_backup_photos', defaultValue: true);
      final includeVideos = StorageService().getBool('hbs_backup_videos', defaultValue: true);
      final maxMb = int.tryParse(StorageService().getString('hbs_backup_max_mb', defaultValue: '0')) ?? 0;
      if (item.isVideo && !includeVideos) return false;
      if (!item.isVideo && !includePhotos) return false;
      final includeRaw = StorageService().getBool('hbs_backup_raw', defaultValue: true);
      if (!includeRaw) {
        const raw = {'dng', 'raw', 'cr2', 'nef', 'arw', 'raf', 'orf', 'rw2'};
        final ext = item.name.split('.').last.toLowerCase();
        if (raw.contains(ext)) return false;
      }
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

    await UploadQueueEngine().startSync(
      items: itemsToSync,
      concurrency: state.batterySaverEnabled ? 2 : 4,
      showNotifications: state.notificationsEnabled,
    );
    await refreshIndexCount();
  }

  Future<void> autoBackupIfEnabled({bool force = false}) async {
    if (StorageService().isUserLoggedOut()) return;
    final token = await StorageService().getSessionToken();
    if (token == null || token.isEmpty) return;
    if ((!force && !state.autoBackup) || state.syncState.isSyncing) return;
    final hasPerm = await MediaDiscoveryService().isPermissionGranted();
    if (!hasPerm) return;
    await startSync();
  }

  Future<void> cancelSync() async {
    UploadQueueEngine().cancelSync();
    await BackupNotificationManager().cancelSyncNotification();
    await BackupIndexDb().clearQueue();
  }

  Future<void> stopAndCancelBackup() async {
    UploadQueueEngine().cancelSync();
    await BackupNotificationManager().cancelSyncNotification();
    MediaListenerService().stopListening();
    await cancelBackgroundBackup();
    await BackupIndexDb().clearQueue();
    state = state.copyWith(
      syncState: const SyncState(
        isSyncing: false,
        syncStepMessage: 'Backup stopped',
      ),
      isMediaListening: false,
    );
  }

  Future<void> purgeAndRebuildIndex() async {
    await BackupIndexDb().clearAll();
    await refreshIndexCount();
  }
}

final backupProvider = StateNotifierProvider<BackupNotifier, BackupState>((ref) {
  return BackupNotifier();
});
