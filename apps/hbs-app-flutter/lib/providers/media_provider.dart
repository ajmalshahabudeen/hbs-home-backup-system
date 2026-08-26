import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/utils/media_merger.dart';
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

    if (category == MediaCategoryFilter.photos) {
      list = list.where((e) => !e.isVideo).toList();
    } else if (category == MediaCategoryFilter.videos) {
      list = list.where((e) => e.isVideo).toList();
    }

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
      final localItems = await MediaDiscoveryService().getLocalMedia(
        onPage: (soFar) {
          if (state.items.isEmpty || soFar.length > state.items.length) {
            state = state.copyWith(isLoading: false, items: soFar);
          }
        },
      );

      final serverPhotos = await ApiService().getPhotos().catchError((_) => <PhotoMediaItem>[]);
      final indexKeys = await BackupIndexDb().getUploadedKeys();

      final merged = MediaMerger.merge(
        local: localItems,
        server: serverPhotos,
        uploadedNameSizeKeys: indexKeys.nameSizeKeys,
        uploadedNames: indexKeys.names,
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
