import 'dart:async';
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

  final StreamController<bool> _permissionStreamController = StreamController<bool>.broadcast();
  Stream<bool> get onPermissionGranted => _permissionStreamController.stream;

  Future<bool>? _inFlightPermissionRequest;

  Future<bool> isPermissionGranted() async {
    try {
      final state = await PhotoManager.getPermissionState(
        requestOption: const PermissionRequestOption(),
      );
      return state.isAuth || state.hasAccess;
    } catch (_) {
      return false;
    }
  }

  Future<bool> requestPermissions({bool force = false}) async {
    final alreadyGranted = await isPermissionGranted();
    if (alreadyGranted) {
      try {
        await PhotoManager.startChangeNotify();
      } catch (_) {}
      return true;
    }

    if (_inFlightPermissionRequest != null) {
      return _inFlightPermissionRequest!;
    }

    _inFlightPermissionRequest = _doRequestPermissions();
    try {
      return await _inFlightPermissionRequest!;
    } finally {
      _inFlightPermissionRequest = null;
    }
  }

  Future<bool> _doRequestPermissions() async {
    try {
      final PermissionState state = await PhotoManager.requestPermissionExtend();
      final ok = state.isAuth || state.hasAccess;
      if (ok) {
        await PhotoManager.clearFileCache();
        try {
          await PhotoManager.startChangeNotify();
        } catch (_) {}
        _permissionStreamController.add(true);
      } else {
        _permissionStreamController.add(false);
      }
      return ok;
    } catch (_) {
      _permissionStreamController.add(false);
      return false;
    }
  }

  Future<bool> openSettings() async {
    try {
      await PhotoManager.openSetting();
      return true;
    } catch (_) {
      return false;
    }
  }

  static final FilterOptionGroup _filterOption = FilterOptionGroup(
    orders: [
      const OrderOption(
        type: OrderOptionType.createDate,
        asc: false,
      ),
    ],
  );

  Future<List<AssetPathEntity>> _assetPaths({required bool onlyAll}) async {
    Future<List<AssetPathEntity>> fetch() {
      return PhotoManager.getAssetPathList(
        type: RequestType.common,
        onlyAll: onlyAll,
        filterOption: _filterOption,
      );
    }

    var paths = await fetch();
    if (paths.isEmpty) {
      await PhotoManager.clearFileCache();
      await Future<void>.delayed(const Duration(milliseconds: 350));
      paths = await fetch();
    }
    return paths;
  }

  Future<List<LocalAlbum>> getAlbums() async {
    final hasPerm = await requestPermissions();
    if (!hasPerm) return [];

    List<AssetPathEntity> paths = [];
    try {
      paths = await PhotoManager.getAssetPathList(
        type: RequestType.common,
        onlyAll: false,
      );
    } catch (_) {}

    if (paths.isEmpty) {
      try {
        await PhotoManager.clearFileCache();
        await Future<void>.delayed(const Duration(milliseconds: 350));
        paths = await PhotoManager.getAssetPathList(
          type: RequestType.common,
          onlyAll: false,
        );
      } catch (_) {}
    }

    final List<LocalAlbum> albums = [];
    for (final path in paths) {
      try {
        // Skip the virtual "Recent" / "All" asset collection which aggregates all folders across the phone
        if (path.isAll) continue;
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
      } catch (_) {
        continue;
      }
    }

    return albums;
  }

  /// Identifies standard camera roll albums (DCIM, Camera, Camera Roll)
  static bool isCameraRollAlbum(LocalAlbum album) {
    final name = album.name.trim().toLowerCase();
    return name == 'camera' ||
        name == 'dcim' ||
        name == 'camera roll' ||
        name == '100media' ||
        name == '100andfp' ||
        (Platform.isIOS && (name == 'recents' || name == 'recent'));
  }

  /// Verifies if a local file path belongs to one of the allowed folder names/paths
  static bool isFileInAllowedAlbums({
    required String filePath,
    required List<String> allowedFolderNames,
  }) {
    if (allowedFolderNames.isEmpty) return false;
    final normalized = filePath.replaceAll('\\', '/').trim().toLowerCase();
    if (normalized.isEmpty) return false;

    final parts = normalized.split('/').where((p) => p.isNotEmpty).toList();
    if (parts.length < 2) return false;
    final parentDir = parts[parts.length - 2];
    final grandParentDir = parts.length >= 3 ? parts[parts.length - 3] : '';

    for (final raw in allowedFolderNames) {
      final target = raw.trim().toLowerCase();
      if (target.isEmpty) continue;
      if (parentDir == target || grandParentDir == target) return true;
      if (target.contains('/') && normalized.contains(target)) return true;
    }
    return false;
  }

  static final Map<String, AssetEntity> entityCache = {};

  PhotoMediaItem itemFromEntity(AssetEntity entity) {
    entityCache[entity.id] = entity;
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
    int pageSize = 1000,
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

    // Fast initial frame: query first 200 items (<15ms)
    final initialEntities = await targetAlbum.getAssetListPaged(
      page: page,
      size: 200,
    );

    for (final entity in initialEntities) {
      if (MediaPathFilter.isAndroidAppFolder(
        relativePath: entity.relativePath,
        albumName: targetAlbum.name,
      )) {
        continue;
      }
      items.add(itemFromEntity(entity));
    }

    if (onPage != null && items.isNotEmpty) {
      onPage(List<PhotoMediaItem>.from(items));
    }

    if (initialEntities.length >= 200) {
      // Query remaining items in high-throughput 1000-item chunks (e.g. 14,000 items in 14 quick calls)
      var offset = 200;
      while (true) {
        final List<AssetEntity> entities = await targetAlbum.getAssetListRange(
          start: offset,
          end: offset + pageSize,
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

        offset += entities.length;
        if (entities.length < pageSize) break;
      }
    }

    items.sort((a, b) {
      final aDate = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      final bDate = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      return bDate.compareTo(aDate);
    });

    final marked = _markLivePairs(items);
    if (onPage != null && marked.length > initialEntities.length) {
      onPage(marked);
    }

    return marked;
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

  Future<List<PhotoMediaItem>> getLocalMediaForAlbums(
    List<LocalAlbum> albums, {
    bool allowFallbackToAll = false,
  }) async {
    if (albums.isEmpty) {
      return allowFallbackToAll ? getLocalMedia() : [];
    }
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
