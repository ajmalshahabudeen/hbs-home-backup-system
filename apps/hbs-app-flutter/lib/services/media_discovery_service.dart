import 'dart:io';
import 'package:photo_manager/photo_manager.dart';
import '../core/utils/media_path_filter.dart';
import '../models/photo_media_item.dart';

class LocalAlbum {
  final String id;
  final String name;
  final int assetCount;
  final AssetPathEntity entity;

  const LocalAlbum({
    required this.id,
    required this.name,
    required this.assetCount,
    required this.entity,
  });
}

class MediaDiscoveryService {
  static final MediaDiscoveryService _instance = MediaDiscoveryService._internal();
  factory MediaDiscoveryService() => _instance;
  MediaDiscoveryService._internal();

  static final FilterOptionGroup _allMediaFilter = FilterOptionGroup(
    imageOption: const FilterOption(
      sizeConstraint: SizeConstraint(ignoreSize: true),
    ),
    videoOption: const FilterOption(
      sizeConstraint: SizeConstraint(ignoreSize: true),
    ),
  );

  Future<bool> requestPermissions() async {
    final PermissionState state = await PhotoManager.requestPermissionExtend();
    final ok = state.isAuth || state.hasAccess;
    if (ok) {
      // First grant: MediaStore is often empty until cache is dropped.
      await PhotoManager.clearFileCache();
    }
    return ok;
  }

  Future<List<AssetPathEntity>> _assetPaths({required bool onlyAll}) async {
    Future<List<AssetPathEntity>> fetch() {
      return PhotoManager.getAssetPathList(
        type: RequestType.common,
        onlyAll: onlyAll,
        filterOption: _allMediaFilter,
      );
    }

    var paths = await fetch();
    if (paths.isEmpty) {
      await PhotoManager.clearFileCache();
      await Future<void>.delayed(const Duration(milliseconds: 400));
      paths = await fetch();
    }
    return paths;
  }

  Future<List<LocalAlbum>> getAlbums() async {
    final hasPerm = await requestPermissions();
    if (!hasPerm) return [];

    final List<AssetPathEntity> paths = await _assetPaths(onlyAll: false);

    final List<LocalAlbum> albums = [];
    for (final path in paths) {
      if (MediaPathFilter.isAndroidAppFolder(albumName: path.name)) continue;
      final count = await path.assetCountAsync;
      if (count > 0) {
        albums.add(LocalAlbum(
          id: path.id,
          name: path.name,
          assetCount: count,
          entity: path,
        ));
      }
    }

    return albums;
  }

  PhotoMediaItem itemFromEntity(AssetEntity entity) {
    final isVideo = entity.type == AssetType.video;
    final title = entity.title ?? 'media_${entity.id}';
    return PhotoMediaItem(
      id: entity.id,
      path: '',
      name: title,
      size: 0,
      createdAt: entity.createDateTime,
      updatedAt: entity.modifiedDateTime,
      isVideo: isVideo,
      url: '',
      thumbUrl: null,
      isLocalOnly: true,
      isBackedUp: false,
      localUri: entity.id,
      duration: isVideo ? entity.duration : null,
      assetId: entity.id,
    );
  }

  Future<List<PhotoMediaItem>> getLocalMedia({
    int page = 0,
    int pageSize = 80,
    AssetPathEntity? album,
    void Function(List<PhotoMediaItem> soFar)? onPage,
  }) async {
    final hasPerm = await requestPermissions();
    if (!hasPerm) return [];

    AssetPathEntity? targetAlbum = album;
    if (targetAlbum == null) {
      final albums = await _assetPaths(onlyAll: true);
      if (albums.isNotEmpty) {
        targetAlbum = albums.first;
      }
    }

    if (targetAlbum == null) return [];

    final List<PhotoMediaItem> items = [];
    var currentPage = page;
    while (true) {
      final List<AssetEntity> entities = await targetAlbum.getAssetListPaged(
        page: currentPage,
        size: pageSize,
      );
      if (entities.isEmpty) break;

      for (final entity in entities) {
        if (MediaPathFilter.isAndroidAppFolder(
          relativePath: entity.relativePath,
          albumName: targetAlbum.name,
        )) {
          continue;
        }
        items.add(itemFromEntity(entity));
      }
      onPage?.call(List<PhotoMediaItem>.from(items));

      if (entities.length < pageSize) break;
      currentPage++;
    }

    return _markLivePairs(items);
  }

  List<PhotoMediaItem> _markLivePairs(List<PhotoMediaItem> items) {
    String stem(String name) {
      final i = name.lastIndexOf('.');
      return (i <= 0 ? name : name.substring(0, i)).toLowerCase();
    }

    final videos = <String, PhotoMediaItem>{};
    for (final item in items.where((e) => e.isVideo)) {
      videos[stem(item.name)] = item;
    }
    return items.map((item) {
      if (item.isVideo) return item;
      final ext = item.name.split('.').last.toLowerCase();
      if (ext != 'heic' && ext != 'heif' && ext != 'jpg' && ext != 'jpeg') return item;
      if (!videos.containsKey(stem(item.name))) return item;
      return item.copyWith(isLive: true, liveVideoAssetId: videos[stem(item.name)]!.assetId);
    }).toList();
  }

  Future<List<PhotoMediaItem>> getLocalMediaForAlbums(List<LocalAlbum> albums) async {
    if (albums.isEmpty) return getLocalMedia();
    final seen = <String>{};
    final out = <PhotoMediaItem>[];
    for (final album in albums) {
      final items = await getLocalMedia(album: album.entity);
      for (final item in items) {
        if (seen.add(item.id)) out.add(item);
      }
    }
    return out;
  }

  Future<PhotoMediaItem> resolveFile(PhotoMediaItem item) async {
    if (item.url.isNotEmpty && !item.url.startsWith('http')) {
      return item;
    }
    final assetId = item.assetId;
    if (assetId == null || assetId.isEmpty) return item;

    final entity = await AssetEntity.fromId(assetId);
    if (entity == null) return item;
    final file = await entity.file;
    if (file == null || !await file.exists()) return item;

    return item.copyWith(
      path: file.path,
      url: file.path,
      size: await file.length(),
      localUri: file.path,
    );
  }

  Future<File?> fileForAssetId(String assetId) async {
    final entity = await AssetEntity.fromId(assetId);
    return entity?.file;
  }
}
