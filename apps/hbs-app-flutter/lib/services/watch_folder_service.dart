import 'dart:io';
import 'package:watcher/watcher.dart';
import 'api_service.dart';
import 'storage_service.dart';

class WatchFolderService {
  static final WatchFolderService _instance = WatchFolderService._internal();
  factory WatchFolderService() => _instance;
  WatchFolderService._internal();

  DirectoryWatcher? _watcher;

  bool get supported => Platform.isWindows || Platform.isMacOS || Platform.isLinux;

  static bool shouldIgnore(String filePath, {String? ignoreCsv, String? extCsv}) {
    final name = filePath.replaceAll('\\', '/').split('/').last;
    if (name.startsWith('.')) return true;
    final ignore = (ignoreCsv ?? StorageService().getString('hbs_watch_ignore'))
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .where((e) => e.isNotEmpty);
    final lower = name.toLowerCase();
    for (final rule in ignore) {
      if (rule.startsWith('*.') && lower.endsWith(rule.substring(1))) return true;
      if (lower.contains(rule.replaceAll('*', ''))) return true;
    }
    final allowed = (extCsv ?? StorageService().getString('hbs_watch_exts'))
        .split(',')
        .map((e) => e.trim().toLowerCase().replaceAll('.', ''))
        .where((e) => e.isNotEmpty)
        .toSet();
    if (allowed.isEmpty) return false;
    final ext = lower.contains('.') ? lower.split('.').last : '';
    return !allowed.contains(ext);
  }

  Future<void> start() async {
    await stop();
    if (!supported) return;
    final path = StorageService().getString('hbs_watch_folder');
    if (path.isEmpty) return;
    final dir = Directory(path);
    if (!await dir.exists()) return;
    _watcher = DirectoryWatcher(path);
    _watcher!.events.listen((event) async {
      if (event.type == ChangeType.REMOVE) return;
      final file = File(event.path);
      if (!await file.exists()) return;
      if (shouldIgnore(event.path)) return;
      final name = file.uri.pathSegments.last;
      try {
        await ApiService().uploadFile(
          filePath: event.path,
          fileName: name,
          parentPath: 'Watched',
        );
      } catch (_) {}
    });
  }

  Future<void> stop() async {
    _watcher = null;
  }
}
