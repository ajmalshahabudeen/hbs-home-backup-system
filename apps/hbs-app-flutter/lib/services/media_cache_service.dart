import 'dart:convert';
import 'dart:io';
import 'dart:isolate';
import 'package:path_provider/path_provider.dart';
import '../models/photo_media_item.dart';

class MediaCacheService {
  static final MediaCacheService _instance = MediaCacheService._internal();
  factory MediaCacheService() => _instance;
  MediaCacheService._internal();

  File? _cacheFile;
  List<PhotoMediaItem>? _memoryCache;
  bool _isSaving = false;
  List<PhotoMediaItem>? _pendingSave;

  Future<File> _getFile() async {
    if (_cacheFile != null) return _cacheFile!;
    final dir = await getApplicationDocumentsDirectory();
    _cacheFile = File('${dir.path}/media_timeline_cache.json');
    return _cacheFile!;
  }

  /// Fast warm hydration (<15ms) on app launch using Isolate.run
  Future<List<PhotoMediaItem>?> loadCache() async {
    if (_memoryCache != null && _memoryCache!.isNotEmpty) {
      return _memoryCache;
    }

    try {
      final file = await _getFile();
      if (!await file.exists()) return null;

      final raw = await file.readAsString();
      if (raw.isEmpty) return null;

      // Deserialize in background isolate to keep UI frame budget completely clean
      final items = await Isolate.run(() {
        final List<dynamic> list = jsonDecode(raw) as List<dynamic>;
        return list
            .map((e) => PhotoMediaItem.fromJson(e as Map<String, dynamic>))
            .toList();
      });

      _memoryCache = items;
      return items;
    } catch (_) {
      return null;
    }
  }

  /// Save timeline to disk in background isolate without UI stalls
  Future<void> saveCache(List<PhotoMediaItem> items) async {
    _memoryCache = items;
    _pendingSave = items;

    if (_isSaving) return;
    _isSaving = true;

    try {
      while (_pendingSave != null) {
        final toSave = _pendingSave!;
        _pendingSave = null;

        // Serialize and encode in background isolate
        final raw = await Isolate.run(() {
          final jsonList = toSave.map((e) => e.toJson()).toList();
          return jsonEncode(jsonList);
        });

        final file = await _getFile();
        await file.writeAsString(raw, flush: true);
      }
    } catch (_) {
      // Ignore disk write errors silently
    } finally {
      _isSaving = false;
    }
  }

  Future<void> clearCache() async {
    _memoryCache = null;
    try {
      final file = await _getFile();
      if (await file.exists()) {
        await file.delete();
      }
    } catch (_) {}
  }
}
