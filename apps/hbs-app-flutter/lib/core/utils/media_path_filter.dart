class MediaPathFilter {
  /// App-private trees only. `Android/media` (WhatsApp, Telegram, etc.) is kept.
  static final _hiddenAndroidTree = RegExp(
    r'(^|/)android/(data|obb)(/|$)',
    caseSensitive: false,
  );

  /// True for `Android/data` and `Android/obb` (other apps' private files).
  /// False for Camera/DCIM/Pictures and for `Android/media` chat photos.
  static bool isAndroidAppFolder({
    String? relativePath,
    String? filePath,
    String? albumName,
  }) {
    for (final raw in [relativePath, filePath, albumName]) {
      if (raw == null) continue;
      final normalized = raw.replaceAll('\\', '/').trim();
      if (normalized.isEmpty) continue;
      if (_hiddenAndroidTree.hasMatch(normalized)) return true;
    }
    return false;
  }
}
