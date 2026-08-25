import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/widgets/filter_sort_bar.dart';
import '../models/photo_media_item.dart';
import '../services/api_service.dart';
import '../services/backup_index_db.dart';
import '../services/media_discovery_service.dart';

class MediaState {
  final bool isLoading;
  final List<PhotoMediaItem> items;
  final MediaCategoryFilter category;
  final int density;
  final String searchQuery;
  final String? errorMessage;

  const MediaState({
    this.isLoading = false,
    this.items = const [],
    this.category = MediaCategoryFilter.all,
    this.density = 3,
    this.searchQuery = '',
    this.errorMessage,
  });

  List<PhotoMediaItem> get filteredItems {
    var list = items;

    // Filter by Category
    if (category == MediaCategoryFilter.photos) {
      list = list.where((e) => !e.isVideo).toList();
    } else if (category == MediaCategoryFilter.videos) {
      list = list.where((e) => e.isVideo).toList();
    }

    // Filter by Search Query
    if (searchQuery.isNotEmpty) {
      final q = searchQuery.toLowerCase();
      list = list.where((e) => e.name.toLowerCase().contains(q)).toList();
    }

    return list;
  }

  MediaState copyWith({
    bool? isLoading,
    List<PhotoMediaItem>? items,
    MediaCategoryFilter? category,
    int? density,
    String? searchQuery,
    String? errorMessage,
  }) {
    return MediaState(
      isLoading: isLoading ?? this.isLoading,
      items: items ?? this.items,
      category: category ?? this.category,
      density: density ?? this.density,
      searchQuery: searchQuery ?? this.searchQuery,
      errorMessage: errorMessage,
    );
  }
}

class MediaNotifier extends StateNotifier<MediaState> {
  MediaNotifier() : super(const MediaState()) {
    loadMedia();
  }

  Future<void> loadMedia() async {
    state = state.copyWith(isLoading: true, errorMessage: null);

    try {
      // 1. Instant Local Assets Batch
      final localItems = await MediaDiscoveryService().getLocalMedia(pageSize: 150);
      if (localItems.isNotEmpty) {
        state = state.copyWith(
          isLoading: false,
          items: localItems,
        );
      }

      // 2. Fetch Remote Server Photos in background
      final serverPhotos = await ApiService().getPhotos().catchError((_) => <PhotoMediaItem>[]);

      // 3. Mark Backup Statuses
      final merged = List<PhotoMediaItem>.from(localItems);
      final serverMap = {for (var item in serverPhotos) item.name: item};

      for (int i = 0; i < merged.length; i++) {
        final local = merged[i];
        if (serverMap.containsKey(local.name)) {
          merged[i] = local.copyWith(isBackedUp: true);
        } else {
          // Check local SQLite index
          final isIndex = await BackupIndexDb().isLocallyUploaded(
            checksum: '',
            fileName: local.name,
            fileSize: local.size,
          );
          if (isIndex) {
            merged[i] = local.copyWith(isBackedUp: true);
          }
        }
      }

      // Add server-only photos
      final localNames = {for (var item in localItems) item.name};
      for (final s in serverPhotos) {
        if (!localNames.contains(s.name)) {
          merged.add(s);
        }
      }

      // Sort by creation date descending
      merged.sort((a, b) {
        final aDate = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        final bDate = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        return bDate.compareTo(aDate);
      });

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
