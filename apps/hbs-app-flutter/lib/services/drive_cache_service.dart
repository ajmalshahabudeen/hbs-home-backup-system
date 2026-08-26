import 'dart:io';
import 'package:path_provider/path_provider.dart';

class DriveCacheService {
  static final DriveCacheService _instance = DriveCacheService._internal();
  factory DriveCacheService() => _instance;
  DriveCacheService._internal();

  Future<Directory> _dir() async {
    final root = await getApplicationSupportDirectory();
    final dir = Directory('${root.path}/offline_drive');
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  Future<File> fileFor(String fileId, String name) async {
    final dir = await _dir();
    final safe = name.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
    return File('${dir.path}/${fileId}_$safe');
  }

  Future<File?> cached(String fileId, String name) async {
    final f = await fileFor(fileId, name);
    if (await f.exists()) return f;
    return null;
  }

  Future<File> put(String fileId, String name, String sourcePath) async {
    final dest = await fileFor(fileId, name);
    return File(sourcePath).copy(dest.path);
  }
}
