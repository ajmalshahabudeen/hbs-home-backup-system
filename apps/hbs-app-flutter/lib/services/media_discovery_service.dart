import 'dart:io';
import 'package:photo_manager/photo_manager.dart';
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
    return state.isAuth || state.hasAccess;
  }

  Future<List<LocalAlbum>> getAlbums() async {
    final hasPerm = await requestPermissions();
    if (!hasPerm) return [];

    final List<AssetPathEntity> paths = await PhotoManager.getAssetPathList(
      type: RequestType.common,
      filterOption: _allMediaFilter,
    );

    final List<LocalAlbum> albums = [];
    for (final path in paths) {
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
      final albums = await PhotoManager.getAssetPathList(
        type: RequestType.common,
        onlyAll: true,
        filterOption: _allMediaFilter,
      );
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
        items.add(itemFromEntity(entity));
      }
      onPage?.call(List<PhotoMediaItem>.from(items));

      if (entities.length < pageSize) break;
      currentPage++;
    }

    return items;
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
