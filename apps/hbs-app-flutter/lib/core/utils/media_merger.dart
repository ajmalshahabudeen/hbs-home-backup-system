import '../../models/photo_media_item.dart';

class MediaMerger {
  static const Set<String> _photoExtensions = {
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
    'heic',
    'heif',
    'dng',
    'raw',
    'cr2',
    'nef',
    'arw',
    'raf',
    'orf',
    'rw2',
    'bmp',
    'tif',
    'tiff',
    'ico',
  };

  static const Set<String> _videoExtensions = {
    'mp4',
    'mov',
    'mkv',
    'avi',
    'webm',
    '3gp',
    'm4v',
    'ts',
    'flv',
    'wmv',
  };

  static const Set<String> _nonMediaExtensions = {
    'db',
    'tmp',
    'part',
    'crdownload',
    'txt',
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'zip',
    'tar',
    'gz',
    '7z',
    'rar',
    'json',
    'xml',
    'exe',
    'apk',
    'bin',
    'iso',
    'nomedia',
    'bak',
    'log',
  };

  static String cleanName(String name) => name.trim().toLowerCase();

  static String nameKey(PhotoMediaItem item) => cleanName(item.name);

  static String nameSizeKey(PhotoMediaItem item) => '${nameKey(item)}|${item.size}';

  static String stem(String name) {
    final clean = cleanName(name);
    final lastDot = clean.lastIndexOf('.');
    return (lastDot > 0) ? clean.substring(0, lastDot) : clean;
  }

  static String cleanPath(String p) =>
      p.replaceAll('\\', '/').replaceAll(RegExp(r'^/+'), '').trim();

  static bool isMobileBackupPath(String path, String parentPath) {
    final p = cleanPath(path).toLowerCase();
    final parent = cleanPath(parentPath).toLowerCase();
    return p.startsWith('mobilebackups') || parent.startsWith('mobilebackups');
  }

  static bool isMediaFile(
    String name, {
    bool isVideo = false,
    String? mimeType,
  }) {
    final clean = cleanName(name);
    final ext = clean.contains('.') ? clean.split('.').last : '';

    if (ext.isNotEmpty && _nonMediaExtensions.contains(ext)) return false;
    if (_photoExtensions.contains(ext) || _videoExtensions.contains(ext)) return true;

    final mime = mimeType?.toLowerCase() ?? '';
    if (mime.startsWith('image/') || mime.startsWith('video/')) {
      return true;
    }

    if (isVideo) return true;

    // If name has no extension (common in Android MediaStore AssetEntity titles like "IMG_20260904_120000"),
    // allow it as valid media.
    return !clean.contains('.');
  }

  /// Merge device library + server library into one list.
  /// - Local items that match a server file or local backup index stay as a
  ///   single entity marked [isBackedUp] with the cloud icon.
  /// - Server-only files (uploaded earlier or from another device) are added once.
  /// - Non-media files and Drive files (outside MobileBackups) are strictly excluded.
  static List<PhotoMediaItem> merge({
    required List<PhotoMediaItem> local,
    required List<PhotoMediaItem> server,
    Set<String> uploadedNameSizeKeys = const {},
    Set<String> uploadedNames = const {},
    Set<String> uploadedIds = const {},
    Set<String> uploadedStems = const {},
  }) {
    final serverByNameSize = <String, PhotoMediaItem>{};
    final serverByName = <String, PhotoMediaItem>{};
    final serverByStemSize = <String, PhotoMediaItem>{};
    final serverByStem = <String, PhotoMediaItem>{};
    final serverItemsByStem = <String, List<PhotoMediaItem>>{};

    for (final item in server) {
      if (!isMobileBackupPath(item.path, item.parentPath)) {
        continue;
      }
      if (!isMediaFile(item.name, isVideo: item.isVideo, mimeType: item.mimeType)) {
        continue;
      }

      final nKey = nameKey(item);
      final sKey = stem(item.name);

      serverByNameSize.putIfAbsent(nameSizeKey(item), () => item);
      serverByName.putIfAbsent(nKey, () => item);
      if (item.size > 0) {
        serverByStemSize.putIfAbsent('$sKey|${item.size}', () => item);
      }
      serverByStem.putIfAbsent(sKey, () => item);
      serverItemsByStem.putIfAbsent(sKey, () => []).add(item);
    }

    final usedServerIds = <String>{};
    final merged = <PhotoMediaItem>[];

    for (final localItem in local) {
      if (!isMediaFile(localItem.name, isVideo: localItem.isVideo, mimeType: localItem.mimeType)) {
        continue;
      }

      final lName = cleanName(localItem.name);
      final lStem = stem(localItem.name);

      PhotoMediaItem? match;
      if (localItem.size > 0) {
        match = serverByNameSize[nameSizeKey(localItem)];
      }
      match ??= serverByName[lName];
      if (match == null && localItem.size > 0) {
        match = serverByStemSize['$lStem|${localItem.size}'];
      }
      match ??= serverByStem[lStem];

      final indexed = (localItem.id.isNotEmpty && uploadedIds.contains(localItem.id)) ||
          (localItem.assetId != null && uploadedIds.contains(localItem.assetId)) ||
          (localItem.size > 0 && uploadedNameSizeKeys.contains(nameSizeKey(localItem))) ||
          uploadedNames.contains(lName) ||
          uploadedStems.contains(lStem);

      if (match != null) {
        usedServerIds.add(match.id);
        final siblings = serverItemsByStem[lStem];
        if (siblings != null) {
          for (final s in siblings) {
            usedServerIds.add(s.id);
          }
        }

        merged.add(
          localItem.copyWith(
            isBackedUp: true,
            isLocalOnly: false,
            thumbUrl: localItem.thumbUrl ?? match.thumbUrl,
            url: localItem.url.isNotEmpty ? localItem.url : match.url,
          ),
        );
      } else if (indexed) {
        final stemMatch = serverByStem[lStem] ?? serverByName[lName];
        if (stemMatch != null) {
          usedServerIds.add(stemMatch.id);
          final siblings = serverItemsByStem[lStem];
          if (siblings != null) {
            for (final s in siblings) {
              usedServerIds.add(s.id);
            }
          }
        }
        merged.add(
          localItem.copyWith(
            isBackedUp: true,
            isLocalOnly: false,
            thumbUrl: localItem.thumbUrl ?? stemMatch?.thumbUrl,
            url: localItem.url.isNotEmpty ? localItem.url : stemMatch?.url,
          ),
        );
      } else {
        merged.add(localItem);
      }
    }

    for (final remote in server) {
      if (usedServerIds.contains(remote.id)) continue;
      if (!isMobileBackupPath(remote.path, remote.parentPath)) continue;
      if (!isMediaFile(remote.name, isVideo: remote.isVideo, mimeType: remote.mimeType)) {
        continue;
      }
      merged.add(remote.copyWith(isBackedUp: true, isLocalOnly: false));
    }

    merged.sort((a, b) {
      final aDate = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      final bDate = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      return bDate.compareTo(aDate);
    });

    return merged;
  }
}
