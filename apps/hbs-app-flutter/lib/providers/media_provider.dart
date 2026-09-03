import 'dart:async';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:photo_manager/photo_manager.dart';
import '../core/utils/formatters.dart';
import '../core/utils/media_merger.dart';
import '../core/widgets/filter_sort_bar.dart';
import '../models/photo_media_item.dart';
import '../services/api_service.dart';
import '../services/backup_index_db.dart';
import '../services/media_cache_service.dart';
import '../services/media_discovery_service.dart';

class MediaState {
  final bool isLoading;
  final bool hasPermission;
  final List<PhotoMediaItem> items;
  final MediaCategoryFilter category;
  final int density;
  final String searchQuery;
  final String? errorMessage;
  final List<PhotoMediaItem>? _cachedFilteredItems;
  final Map<String, List<PhotoMediaItem>>? _cachedDateGroups;

  const MediaState({
    this.isLoading = false,
    this.hasPermission = true,
    this.items = const [],
    this.category = MediaCategoryFilter.all,
    this.density = 3,
    this.searchQuery = '',
    this.errorMessage,
    List<PhotoMediaItem>? filteredItems,
    Map<String, List<PhotoMediaItem>>? dateGroups,
  })  : _cachedFilteredItems = filteredItems,
        _cachedDateGroups = dateGroups;

  List<PhotoMediaItem> get filteredItems =>
      _cachedFilteredItems ?? _computeFilteredItems(items, category, searchQuery);

  Map<String, List<PhotoMediaItem>> get dateGroups =>
      _cachedDateGroups ?? _computeDateGroups(filteredItems);

  static List<PhotoMediaItem> _computeFilteredItems(
    List<PhotoMediaItem> items,
    MediaCategoryFilter category,
    String searchQuery,
  ) {
    var list = items;

    if (category == MediaCategoryFilter.photos) {
      list = list.where((e) => !e.isVideo).toList();
    } else if (category == MediaCategoryFilter.videos) {
      list = list.where((e) => e.isVideo).toList();
    }

    if (searchQuery.isNotEmpty) {
      final q = searchQuery.toLowerCase();
      list = list.where((e) => e.name.toLowerCase().contains(q)).toList();
    }

    final sorted = List<PhotoMediaItem>.from(list);
    sorted.sort((a, b) {
      final aDate = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      final bDate = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      return bDate.compareTo(aDate);
    });

    return sorted;
  }

  static Map<String, List<PhotoMediaItem>> _computeDateGroups(List<PhotoMediaItem> sorted) {
    final Map<String, List<PhotoMediaItem>> groups = {};
    for (final item in sorted) {
      final key = Formatters.timelineKey(item.createdAt);
      groups.putIfAbsent(key.isEmpty ? 'Unknown' : key, () => []).add(item);
    }
    return groups;
  }

  MediaState copyWith({
    bool? isLoading,
    bool? hasPermission,
    List<PhotoMediaItem>? items,
    MediaCategoryFilter? category,
    int? density,
    String? searchQuery,
    String? errorMessage,
  }) {
    final newItems = items ?? this.items;
    final newCategory = category ?? this.category;
    final newQuery = searchQuery ?? this.searchQuery;

    final bool dataChanged = items != null || category != null || searchQuery != null;
    final newFiltered = dataChanged ? _computeFilteredItems(newItems, newCategory, newQuery) : filteredItems;
    final newGroups = dataChanged ? _computeDateGroups(newFiltered) : dateGroups;

    return MediaState(
      isLoading: isLoading ?? this.isLoading,
      hasPermission: hasPermission ?? this.hasPermission,
      items: newItems,
      category: newCategory,
      density: density ?? this.density,
      searchQuery: newQuery,
      errorMessage: errorMessage,
      filteredItems: newFiltered,
      dateGroups: newGroups,
    );
  }
}

class MediaNotifier extends StateNotifier<MediaState> {
  StreamSubscription<bool>? _permissionSub;
  Timer? _libraryDebounce;

  MediaNotifier() : super(const MediaState()) {
    PhotoManager.addChangeCallback(_onLibraryChange);
    _permissionSub = MediaDiscoveryService().onPermissionGranted.listen((granted) {
      if (granted) {
        state = state.copyWith(hasPermission: true);
        loadMedia(force: true);
      } else {
        state = state.copyWith(isLoading: false, hasPermission: false);
      }
    });
    _initAndHydrate();
  }

  Future<void> _initAndHydrate() async {
    // 1. Instant Warm Hydration from Disk Cache (<15ms)
    final cached = await MediaCacheService().loadCache();
    if (cached != null && cached.isNotEmpty) {
      state = state.copyWith(
        isLoading: false,
        items: cached,
        hasPermission: true,
      );
    }

    // 2. Permission Check & Background Delta Sync
    final granted = await MediaDiscoveryService().isPermissionGranted();
    if (!granted) {
      if (cached == null || cached.isEmpty) {
        state = state.copyWith(isLoading: false, hasPermission: false);
      }
    } else {
      try {
        PhotoManager.startChangeNotify();
      } catch (_) {}
      loadMedia();
    }
  }

  void _onLibraryChange(MethodCall _) {
    _libraryDebounce?.cancel();
    _libraryDebounce = Timer(const Duration(milliseconds: 500), loadMedia);
  }

  @override
  void dispose() {
    _permissionSub?.cancel();
    _libraryDebounce?.cancel();
    PhotoManager.removeChangeCallback(_onLibraryChange);
    PhotoManager.stopChangeNotify();
    super.dispose();
  }

  Future<void> reloadIfEmpty() async {
    if (state.items.isEmpty) {
      await loadMedia(force: true);
    }
  }

  Future<void> loadMedia({bool force = false}) async {
    final hasPerm = await MediaDiscoveryService().isPermissionGranted();
    if (!hasPerm && !force) {
      if (state.items.isEmpty) {
        state = state.copyWith(isLoading: false, hasPermission: false);
      }
      return;
    }

    if (force) {
      final granted = await MediaDiscoveryService().requestPermissions(force: true);
      if (!granted) {
        state = state.copyWith(isLoading: false, hasPermission: false);
        return;
      }
    }

    state = state.copyWith(
      isLoading: state.items.isEmpty,
      hasPermission: true,
      errorMessage: null,
    );

    try {
      // Phase 1: High-Throughput Local Discovery
      final localItems = await MediaDiscoveryService().getLocalMedia(
        onPage: (soFar) {
          // If state was empty (first install / cache cleared), show initial 200 items immediately
          if (state.items.isEmpty) {
            state = state.copyWith(isLoading: false, items: soFar);
          }
        },
      );

      final sortedLocal = List<PhotoMediaItem>.from(localItems)..sort((a, b) {
        final aDate = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        final bDate = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        return bDate.compareTo(aDate);
      });

      // Render local assets immediately if available
      if (sortedLocal.isNotEmpty || state.items.isEmpty) {
        state = state.copyWith(isLoading: false, items: sortedLocal);
      }

      // Phase 2: Asynchronous Cloud / Server Media Sync (Bounded with 4s timeout)
      final serverPhotos = <PhotoMediaItem>[];
      try {
        var offset = 0;
        while (true) {
          final page = await ApiService()
              .getPhotos(offset: offset, limit: 80)
              .timeout(const Duration(seconds: 4), onTimeout: () => <PhotoMediaItem>[]);
          if (page.isEmpty) break;
          serverPhotos.addAll(page);
          if (page.length < 80) break;
          offset += 80;
        }
      } catch (_) {
        // Server offline / LAN timeout - local items remain intact and visible
      }

      Set<String> uploadedNameSizeKeys = {};
      Set<String> uploadedNames = {};
      try {
        final indexKeys = await BackupIndexDb().getUploadedKeys();
        uploadedNameSizeKeys = indexKeys.nameSizeKeys;
        uploadedNames = indexKeys.names;
      } catch (_) {}

      final filteredServerPhotos = serverPhotos.where((p) {
        final path = p.path.replaceAll('\\', '/');
        final parent = p.parentPath.replaceAll('\\', '/');
        return path.startsWith('MobileBackups') || parent.startsWith('MobileBackups');
      }).toList();

      final merged = MediaMerger.merge(
        local: localItems,
        server: filteredServerPhotos,
        uploadedNameSizeKeys: uploadedNameSizeKeys,
        uploadedNames: uploadedNames,
      );

      state = state.copyWith(
        isLoading: false,
        items: merged,
      );

      // Persist latest merged timeline to disk cache asynchronously
      MediaCacheService().saveCache(merged);
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString(),
      );
    }
  }

  void setCategory(MediaCategoryFilter cat) {
    state = state.copyWith(category: cat);
  }

  void setDensity(int density) {
    state = state.copyWith(density: density);
  }

  void setSearchQuery(String query) {
    state = state.copyWith(searchQuery: query);
  }
}

final mediaProvider = StateNotifierProvider<MediaNotifier, MediaState>((ref) {
  return MediaNotifier();
});
