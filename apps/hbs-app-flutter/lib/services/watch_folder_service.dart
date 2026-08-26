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
      final name = file.uri.pathSegments.last;
      if (name.startsWith('.')) return;
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
