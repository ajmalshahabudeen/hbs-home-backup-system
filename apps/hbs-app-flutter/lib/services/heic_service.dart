import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:heif_converter/heif_converter.dart';
import 'package:path_provider/path_provider.dart';
import '../core/utils/formatters.dart';
import '../models/photo_media_item.dart';
import 'media_discovery_service.dart';

class HeicService {
  static final HeicService _instance = HeicService._internal();
  factory HeicService() => _instance;
  HeicService._internal();

  Directory? _cacheDir;

  Future<Directory> _getCacheDir() async {
    if (_cacheDir != null && await _cacheDir!.exists()) {
      return _cacheDir!;
    }
    final temp = await getTemporaryDirectory();
    final dir = Directory('${temp.path}/heic_previews');
    if (!await dir.exists()) {
      await dir.create(recursive: true);
    }
    _cacheDir = dir;
    return dir;
  }

  String _hashKey(String input) {
    return md5.convert(utf8.encode(input)).toString();
  }

  bool isHeicFile(String? mimeType, String? pathOrName) {
    return Formatters.isHeic(mimeType, pathOrName);
  }

  /// Converts a local HEIC/HEIF file to a cached JPEG File.
  /// Returns the cached JPEG file, or null if conversion failed.
  Future<File?> convertLocalHeicToJpg(String localFilePath) async {
    final file = File(localFilePath);
    if (!await file.exists()) return null;

    try {
      final cacheDir = await _getCacheDir();
      final stat = await file.stat();
      final key = '${file.path}_${stat.size}_${stat.modified.millisecondsSinceEpoch}';
      final hash = _hashKey(key);
      final targetPath = '${cacheDir.path}/$hash.jpg';

      final cachedFile = File(targetPath);
      if (await cachedFile.exists() && await cachedFile.length() > 0) {
        return cachedFile;
      }

      final converted = await HeifConverter.convert(
        file.path,
        output: targetPath,
        format: 'jpg',
      );

      if (converted != null) {
        final resultFile = File(converted);
        if (await resultFile.exists() && await resultFile.length() > 0) {
          return resultFile;
        }
      }
    } catch (_) {}

    return null;
  }

  /// Converts a remote HEIC/HEIF URL to a cached JPEG File.
  Future<File?> convertRemoteHeicToJpg(String url, {Map<String, String>? headers}) async {
    try {
      final cacheDir = await _getCacheDir();
      final hash = _hashKey(url);
      final targetJpg = '${cacheDir.path}/$hash.jpg';

      final cachedFile = File(targetJpg);
      if (await cachedFile.exists() && await cachedFile.length() > 0) {
        return cachedFile;
      }

      // Download temporary HEIC file
      final tempHeic = '${cacheDir.path}/${hash}_temp.heic';
      final dio = Dio();
      await dio.download(
        url,
        tempHeic,
        options: Options(headers: headers),
      );

      final downloaded = File(tempHeic);
      if (!await downloaded.exists() || await downloaded.length() == 0) {
        return null;
      }

      final converted = await HeifConverter.convert(
        tempHeic,
        output: targetJpg,
        format: 'jpg',
      );

      // Clean up temporary downloaded HEIC
      try {
        await downloaded.delete();
      } catch (_) {}

      if (converted != null) {
        final result = File(converted);
        if (await result.exists() && await result.length() > 0) {
          return result;
        }
      }
    } catch (_) {}

    return null;
  }

  /// Resolves any PhotoMediaItem into a displayable JPEG File if it is HEIC/HEIF.
  /// If it is not HEIC, returns null (caller can use standard FileImage or CachedNetworkImage).
  Future<File?> resolveHeicImage(PhotoMediaItem item, {Map<String, String>? headers}) async {
    if (!isHeicFile(item.mimeType, item.name) && !isHeicFile(item.mimeType, item.path)) {
      return null;
    }

    // 1. If it has a local file path
    if (item.url.isNotEmpty && !item.url.startsWith('http')) {
      final converted = await convertLocalHeicToJpg(item.url);
      if (converted != null) return converted;
    }

    if (item.path.isNotEmpty && !item.path.startsWith('http')) {
      final converted = await convertLocalHeicToJpg(item.path);
      if (converted != null) return converted;
    }

    // 2. If it has an assetId, resolve the asset file
    if (item.assetId != null && item.assetId!.isNotEmpty) {
      final file = await MediaDiscoveryService().fileForAssetId(item.assetId!);
      if (file != null && await file.exists()) {
        final converted = await convertLocalHeicToJpg(file.path);
        if (converted != null) return converted;
      }
    }

    // 3. If it's a remote URL
    if (item.url.startsWith('http://') || item.url.startsWith('https://')) {
      return await convertRemoteHeicToJpg(item.url, headers: headers);
    }

    return null;
  }
}
