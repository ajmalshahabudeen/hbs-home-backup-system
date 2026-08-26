import '../../models/photo_media_item.dart';

class MediaMerger {
  static String nameKey(PhotoMediaItem item) => item.name.trim().toLowerCase();

  static String nameSizeKey(PhotoMediaItem item) => '${nameKey(item)}|${item.size}';

  /// Merge device library + server library into one list.
  /// Local items that match a server file (name+size, then name) stay as a
  /// single tile marked [isBackedUp]. Server-only files are appended once.
  static List<PhotoMediaItem> merge({
    required List<PhotoMediaItem> local,
    required List<PhotoMediaItem> server,
    Set<String> uploadedNameSizeKeys = const {},
    Set<String> uploadedNames = const {},
  }) {
    final serverByNameSize = <String, PhotoMediaItem>{};
    final serverByName = <String, PhotoMediaItem>{};
    for (final item in server) {
      serverByNameSize.putIfAbsent(nameSizeKey(item), () => item);
      serverByName.putIfAbsent(nameKey(item), () => item);
    }

    final usedServerIds = <String>{};
    final merged = <PhotoMediaItem>[];

    for (final localItem in local) {
      PhotoMediaItem? match;
      if (localItem.size > 0) {
        match = serverByNameSize[nameSizeKey(localItem)];
      }
      match ??= serverByName[nameKey(localItem)];

      final indexed = (localItem.size > 0 && uploadedNameSizeKeys.contains(nameSizeKey(localItem))) ||
          uploadedNames.contains(nameKey(localItem));

      if (match != null) {
        usedServerIds.add(match.id);
        merged.add(
          localItem.copyWith(
            isBackedUp: true,
            isLocalOnly: false,
            thumbUrl: localItem.thumbUrl ?? match.thumbUrl,
          ),
        );
      } else if (indexed) {
        merged.add(localItem.copyWith(isBackedUp: true));
      } else {
        merged.add(localItem);
      }
    }

    for (final remote in server) {
      if (usedServerIds.contains(remote.id)) continue;
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
