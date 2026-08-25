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

  Future<bool> requestPermissions() async {
    final PermissionState state = await PhotoManager.requestPermissionExtend();
    return state.isAuth || state.hasAccess;
  }

  Future<List<LocalAlbum>> getAlbums() async {
    final hasPerm = await requestPermissions();
    if (!hasPerm) return [];

    final List<AssetPathEntity> paths = await PhotoManager.getAssetPathList(
      type: RequestType.common,
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

  Future<List<PhotoMediaItem>> getLocalMedia({
    int page = 0,
    int pageSize = 100,
    AssetPathEntity? album,
  }) async {
    final hasPerm = await requestPermissions();
    if (!hasPerm) return [];

    AssetPathEntity? targetAlbum = album;
    if (targetAlbum == null) {
      final albums = await PhotoManager.getAssetPathList(
        type: RequestType.common,
        onlyAll: true,
      );
      if (albums.isNotEmpty) {
        targetAlbum = albums.first;
      }
    }

    if (targetAlbum == null) return [];

    final List<AssetEntity> entities = await targetAlbum.getAssetListPaged(
      page: page,
      size: pageSize,
    );

    final List<PhotoMediaItem> items = [];
    for (final entity in entities) {
      final isVideo = entity.type == AssetType.video;
      final file = await entity.file;
      final filePath = file?.path ?? '';
      final title = entity.title ?? (filePath.isNotEmpty ? filePath.split(Platform.pathSeparator).last : 'media_${entity.id}');

      items.add(PhotoMediaItem(
        id: entity.id,
        path: filePath,
        name: title,
        size: (file != null && await file.exists()) ? await file.length() : 0,
        createdAt: entity.createDateTime,
        updatedAt: entity.modifiedDateTime,
        isVideo: isVideo,
        url: filePath,
        thumbUrl: null, // Rendered via PhotoManager thumbnail or File in UI
        isLocalOnly: true,
        isBackedUp: false,
        localUri: filePath,
        duration: isVideo ? entity.duration : null,
      ));
    }

    return items;
  }
}
