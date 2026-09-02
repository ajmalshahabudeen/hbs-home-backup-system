import 'dart:async';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:photo_manager/photo_manager.dart';
import '../core/utils/media_merger.dart';
import '../core/widgets/filter_sort_bar.dart';
import '../models/photo_media_item.dart';
import '../services/api_service.dart';
import '../services/backup_index_db.dart';
import '../services/media_discovery_service.dart';

class MediaState {
  final bool isLoading;
  final bool hasPermission;
  final List<PhotoMediaItem> items;
  final MediaCategoryFilter category;
  final int density;
  final String searchQuery;
  final String? errorMessage;

  const MediaState({
    this.isLoading = false,
    this.hasPermission = true,
    this.items = const [],
    this.category = MediaCategoryFilter.all,
    this.density = 3,
    this.searchQuery = '',
    this.errorMessage,
  });

  List<PhotoMediaItem> get filteredItems {
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

  MediaState copyWith({
    bool? isLoading,
    bool? hasPermission,
    List<PhotoMediaItem>? items,
    MediaCategoryFilter? category,
    int? density,
    String? searchQuery,
    String? errorMessage,
  }) {
    return MediaState(
      isLoading: isLoading ?? this.isLoading,
      hasPermission: hasPermission ?? this.hasPermission,
      items: items ?? this.items,
      category: category ?? this.category,
      density: density ?? this.density,
      searchQuery: searchQuery ?? this.searchQuery,
      errorMessage: errorMessage,
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
    _initPermissionCheck();
  }

  Future<void> _initPermissionCheck() async {
    final granted = await MediaDiscoveryService().isPermissionGranted();
    if (!granted) {
      state = state.copyWith(isLoading: false, hasPermission: false);
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
      state = state.copyWith(isLoading: false, hasPermission: false);
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
      // Phase 1: Local Device Media Discovery (Instant)
      final localItems = await MediaDiscoveryService().getLocalMedia(
        onPage: (soFar) {
          final sorted = List<PhotoMediaItem>.from(soFar)..sort((a, b) {
            final aDate = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
            final bDate = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
            return bDate.compareTo(aDate);
          });
          if (state.items.isEmpty || sorted.length > state.items.length) {
            state = state.copyWith(isLoading: false, items: sorted);
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

      final merged = MediaMerger.merge(
        local: localItems,
        server: serverPhotos,
        uploadedNameSizeKeys: uploadedNameSizeKeys,
        uploadedNames: uploadedNames,
      );

      state = state.copyWith(
        isLoading: false,
        items: merged,
      );
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
