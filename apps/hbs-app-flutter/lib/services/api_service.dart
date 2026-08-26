import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:http_parser/http_parser.dart';
import 'package:mime/mime.dart';
import '../core/utils/session_token_cleaner.dart';
import '../core/utils/vault_crypto.dart';
import '../models/backup_file_item.dart';
import '../models/photo_media_item.dart';
import '../models/user_stats.dart';
import 'storage_service.dart';

class DuplicateCheckResult {
  final bool isDuplicate;
  final BackupFileItem? existingFile;

  const DuplicateCheckResult({required this.isDuplicate, this.existingFile});
}

class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      sendTimeout: const Duration(minutes: 10), // Generous for large uploads
      headers: {
        'Accept': 'application/json',
      },
    ),
  );

  String _serverUrl = 'http://192.168.1.100:38480';
  String? _sessionToken;

  void updateConfig({required String serverUrl, String? sessionToken}) {
    _serverUrl = serverUrl.endsWith('/') ? serverUrl.substring(0, serverUrl.length - 1) : serverUrl;
    if (sessionToken != null) {
      _sessionToken = SessionTokenCleaner.cleanSessionToken(sessionToken);
    }
  }

  Future<String?> _getToken() async {
    if (_sessionToken != null) return _sessionToken;
    final token = await StorageService().getSessionToken();
    _sessionToken = SessionTokenCleaner.cleanSessionToken(token);
    return _sessionToken;
  }

  Options _buildOptions(String? token, {Map<String, dynamic>? extraHeaders}) {
    final headers = <String, dynamic>{
      'Accept': 'application/json',
    };
    if (token != null && token.isNotEmpty) {
      headers.addAll(SessionTokenCleaner.authHeaders(token));
    }
    if (extraHeaders != null) {
      headers.addAll(extraHeaders);
    }
    return Options(headers: headers);
  }

  Future<bool> checkHealth(String url) async {
    try {
      final cleanUrl = url.endsWith('/') ? url.substring(0, url.length - 1) : url;
      final res = await _dio.get(
        '$cleanUrl/api/health',
        options: Options(
          connectTimeout: const Duration(milliseconds: 3500),
          receiveTimeout: const Duration(milliseconds: 3500),
        ),
      );
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<Map<String, dynamic>> getFiles({
    String path = '',
    String category = 'all',
  }) async {
    final token = await _getToken();
    final res = await _dio.get(
      '$_serverUrl/api/user/files',
      queryParameters: {
        if (path.isNotEmpty) 'path': path,
        if (category.isNotEmpty && category != 'all') 'category': category,
      },
      options: _buildOptions(token),
    );

    final data = res.data;
    final List rawFiles = data['files'] is List ? data['files'] : [];
    final files = rawFiles.map((e) => BackupFileItem.fromJson(e)).toList();
    final currentPath = data['currentPath']?.toString() ?? path;

    return {
      'files': files,
      'currentPath': currentPath,
    };
  }

  Future<List<PhotoMediaItem>> getPhotos({String category = 'all', int offset = 0, int limit = 80}) async {
    final token = await _getToken();
    final res = await _dio.get(
      '$_serverUrl/api/user/photos',
      queryParameters: {
        if (category.isNotEmpty && category != 'all') 'filter': category,
        'offset': offset,
        'limit': limit,
      },
      options: _buildOptions(token),
    );

    final data = res.data;
    final List rawMedia = data['media'] is List ? data['media'] : [];
    return rawMedia.map((e) {
      final item = PhotoMediaItem.fromJson(e);
      String finalUrl = item.url;
      if (finalUrl.startsWith('/')) {
        finalUrl = '$_serverUrl$finalUrl';
      }
      String? finalThumb = item.thumbUrl;
      if (finalThumb != null && finalThumb.startsWith('/')) {
        finalThumb = '$_serverUrl$finalThumb';
      }
      return item.copyWith(url: finalUrl, thumbUrl: finalThumb);
    }).toList();
  }

  Future<List<BackupFileItem>> searchFiles(String query) async {
    final token = await _getToken();
    final res = await _dio.get(
      '$_serverUrl/api/user/files',
      queryParameters: {'search': query},
      options: _buildOptions(token),
    );
    final data = res.data;
    final List rawFiles = data['files'] is List ? data['files'] : [];
    return rawFiles.map((e) => BackupFileItem.fromJson(e)).toList();
  }

  Future<DuplicateCheckResult> checkDuplicate({
    required String fileName,
    int? fileSize,
    String? hash,
    String? targetFilePath,
  }) async {
    final token = await _getToken();
    final res = await _dio.post(
      '$_serverUrl/api/user/upload/check',
      data: {
        'name': fileName,
        'fileName': fileName,
        'size': fileSize,
        'fileSize': fileSize,
        'checksum': hash,
        'hash': hash,
        'path': targetFilePath,
        'targetFilePath': targetFilePath,
      },
      options: _buildOptions(token),
    );

    final data = res.data;
    final isDup = (data['isDuplicate'] ?? data['duplicate']) == true;
    final existingData = data['existingFile'] ?? data['file'];
    final existingFile = existingData != null ? BackupFileItem.fromJson(existingData) : null;

    return DuplicateCheckResult(
      isDuplicate: isDup,
      existingFile: existingFile,
    );
  }

  Future<dynamic> uploadFile({
    required String filePath,
    required String fileName,
    String? mimeType,
    String parentPath = '',
    ProgressCallback? onSendProgress,
    CancelToken? cancelToken,
    String? uploadId,
    String? onConflict,
  }) async {
    var path = filePath;
    var name = fileName;
    var resolvedMime = mimeType ?? lookupMimeType(filePath) ?? 'application/octet-stream';
    if (VaultCrypto.enabled) {
      final encrypted = await VaultCrypto.encryptFile(File(path));
      path = encrypted.path;
      name = '$fileName.hbsenc';
      resolvedMime = 'application/x-hbs-encrypted';
    }
    final size = await File(path).length();
    if (size > 8 * 1024 * 1024) {
      return uploadChunked(
        filePath: path,
        fileName: name,
        mimeType: resolvedMime,
        parentPath: parentPath,
        onSendProgress: onSendProgress,
        cancelToken: cancelToken,
        uploadId: uploadId,
      );
    }
    final token = await _getToken();
    final mimeParts = resolvedMime.split('/');
    final mediaType = MediaType(mimeParts[0], mimeParts.length > 1 ? mimeParts[1] : 'octet-stream');

    final formData = FormData.fromMap({
      'parentPath': parentPath,
      'path': parentPath,
      'fileName': name,
      'name': name,
      'originalName': fileName,
      'searchName': fileName,
      if (onConflict != null) 'onConflict': onConflict,
      'file': await MultipartFile.fromFile(
        path,
        filename: name,
        contentType: mediaType,
      ),
    });

    final res = await _dio.post(
      '$_serverUrl/api/user/upload',
      data: formData,
      options: _buildOptions(token).copyWith(
        validateStatus: (s) => s != null && s < 500,
      ),
      onSendProgress: onSendProgress,
      cancelToken: cancelToken,
    );
    if (res.statusCode == 409 && res.data is Map) {
      return {'conflict': true, ...Map<String, dynamic>.from(res.data as Map)};
    }
    if (res.statusCode != null && res.statusCode! >= 400) {
      throw DioException(requestOptions: res.requestOptions, response: res);
    }

    return res.data;
  }

  Future<dynamic> uploadChunked({
    required String filePath,
    required String fileName,
    String? mimeType,
    String parentPath = '',
    ProgressCallback? onSendProgress,
    CancelToken? cancelToken,
    String? uploadId,
  }) async {
    final token = await _getToken();
    const chunkSize = 4 * 1024 * 1024;
    final file = File(filePath);
    final totalBytes = await file.length();
    final totalChunks = (totalBytes / chunkSize).ceil();
    final id = (uploadId != null && uploadId.isNotEmpty)
        ? uploadId
        : 'hbs_${fileName.replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '_')}_$totalBytes';
    final received = <int>{};
    try {
      final existing = await _dio.get(
        '$_serverUrl/api/user/upload/chunk',
        queryParameters: {'uploadId': id},
        options: _buildOptions(token),
      );
      final list = existing.data['received'];
      if (list is List) {
        for (final n in list) {
          if (n is num) received.add(n.toInt());
        }
      }
    } catch (_) {}
    final raf = await file.open();
    try {
      for (var i = 0; i < totalChunks; i++) {
        if (received.contains(i)) {
          onSendProgress?.call(((i + 1) * chunkSize).clamp(0, totalBytes), totalBytes);
          continue;
        }
        final start = i * chunkSize;
        final end = (start + chunkSize > totalBytes) ? totalBytes : start + chunkSize;
        Object? lastErr;
        for (var attempt = 0; attempt < 3; attempt++) {
          try {
            await raf.setPosition(start);
            final bytes = await raf.read(end - start);
            final form = FormData.fromMap({
              'uploadId': id,
              'index': i,
              'total': totalChunks,
              'fileName': fileName,
              'parentPath': parentPath,
              'mimeType': mimeType ?? 'application/octet-stream',
              'checksum': sha256.convert(bytes).toString(),
              'chunk': MultipartFile.fromBytes(bytes, filename: 'chunk_$i'),
            });
            await _dio.post(
              '$_serverUrl/api/user/upload/chunk',
              data: form,
              options: _buildOptions(token),
              cancelToken: cancelToken,
            );
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
          }
        }
        if (lastErr != null) throw lastErr;
        onSendProgress?.call(end, totalBytes);
      }
    } finally {
      await raf.close();
    }
    return {'complete': true, 'uploadId': id};
  }

  Future<dynamic> createFolder({
    required String folderName,
    String parentPath = '',
  }) async {
    final token = await _getToken();
    final res = await _dio.post(
      '$_serverUrl/api/user/files',
      data: {
        'name': folderName,
        'folderName': folderName,
        'path': parentPath,
        'parentPath': parentPath,
        'isDir': true,
      },
      options: _buildOptions(token),
    );
    return res.data;
  }

  Future<dynamic> renameFile({
    required String path,
    required String newName,
  }) async {
    final token = await _getToken();
    final res = await _dio.patch(
      '$_serverUrl/api/user/files',
      data: {
        'path': path,
        'newName': newName,
      },
      options: _buildOptions(token),
    );
    return res.data;
  }

  Future<dynamic> deleteFile({required String fileId, bool permanent = false}) async {
    final token = await _getToken();
    final res = await _dio.delete(
      '$_serverUrl/api/user/files',
      queryParameters: {
        'id': fileId,
        if (permanent) 'permanent': '1',
      },
      options: _buildOptions(token),
    );
    return res.data;
  }

  Future<void> pingDevice({required String deviceId, String? localIp}) async {
    final token = await _getToken();
    await _dio.post(
      '$_serverUrl/api/user/device/ping',
      data: {'deviceId': deviceId, if (localIp != null) 'localIp': localIp},
      options: _buildOptions(token),
    );
  }

  Future<String> downloadFile({
    required String fileId,
    required String destPath,
    ProgressCallback? onReceiveProgress,
  }) async {
    final token = await _getToken();
    await _dio.download(
      '$_serverUrl/api/user/files',
      destPath,
      queryParameters: {'download': '1', 'id': fileId},
      options: _buildOptions(token),
      onReceiveProgress: onReceiveProgress,
    );
    return destPath;
  }

  Future<void> restoreFile(String fileId) async {
    final token = await _getToken();
    await _dio.patch(
      '$_serverUrl/api/user/files',
      data: {'id': fileId, 'restore': true},
      options: _buildOptions(token),
    );
  }

  Future<void> emptyTrash() async {
    final token = await _getToken();
    await _dio.delete(
      '$_serverUrl/api/user/files',
      queryParameters: {'emptyTrash': '1'},
      options: _buildOptions(token),
    );
  }

  Future<List<Map<String, dynamic>>> listDevices() async {
    final token = await _getToken();
    final res = await _dio.get('$_serverUrl/api/user/device', options: _buildOptions(token));
    final list = res.data['devices'];
    if (list is List) {
      return list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    }
    return [];
  }

  Future<Map<String, dynamic>> listShares() async {
    final token = await _getToken();
    final res = await _dio.get('$_serverUrl/api/user/shares', options: _buildOptions(token));
    return res.data is Map ? Map<String, dynamic>.from(res.data as Map) : {};
  }

  Future<void> createShare({required String email, String path = '', bool canWrite = false}) async {
    final token = await _getToken();
    await _dio.post(
      '$_serverUrl/api/user/shares',
      data: {'email': email, 'path': path, 'canWrite': canWrite},
      options: _buildOptions(token),
    );
  }

  Future<void> deleteShare(String id) async {
    final token = await _getToken();
    await _dio.delete(
      '$_serverUrl/api/user/shares',
      queryParameters: {'id': id},
      options: _buildOptions(token),
    );
  }

  Future<Map<String, dynamic>> createPublicLink({required String fileId, int hours = 24}) async {
    final token = await _getToken();
    final res = await _dio.post(
      '$_serverUrl/api/user/links',
      data: {'fileId': fileId, 'hours': hours},
      options: _buildOptions(token),
    );
    return res.data is Map ? Map<String, dynamic>.from(res.data as Map) : {};
  }

  Future<List<Map<String, dynamic>>> listPublicLinks() async {
    final token = await _getToken();
    final res = await _dio.get('$_serverUrl/api/user/links', options: _buildOptions(token));
    final list = res.data['links'];
    if (list is List) {
      return list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    }
    return [];
  }

  Future<void> deletePublicLink(String id) async {
    final token = await _getToken();
    await _dio.delete(
      '$_serverUrl/api/user/links',
      queryParameters: {'id': id},
      options: _buildOptions(token),
    );
  }

  Future<List<Map<String, dynamic>>> listAlbums() async {
    final token = await _getToken();
    final res = await _dio.get('$_serverUrl/api/user/albums', options: _buildOptions(token));
    final list = res.data['albums'];
    if (list is List) {
      return list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    }
    return [];
  }

  Future<Map<String, dynamic>> verifyChecksum(String fileId) async {
    final token = await _getToken();
    final res = await _dio.post(
      '$_serverUrl/api/user/files/verify',
      data: {'id': fileId},
      options: _buildOptions(token),
    );
    return res.data is Map ? Map<String, dynamic>.from(res.data as Map) : {};
  }

  Future<List<Map<String, dynamic>>> unreadInbox() async {
    final token = await _getToken();
    final res = await _dio.get(
      '$_serverUrl/api/user/inbox',
      queryParameters: {'unread': '1'},
      options: _buildOptions(token),
    );
    final list = res.data['events'];
    if (list is List) {
      return list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    }
    return [];
  }

  Future<void> markInboxRead() async {
    final token = await _getToken();
    await _dio.patch('$_serverUrl/api/user/inbox', options: _buildOptions(token));
  }

  Future<void> listenInbox({
    required void Function(List<Map<String, dynamic>> events) onEvents,
    CancelToken? cancelToken,
  }) async {
    final token = await _getToken();
    final res = await _dio.get<ResponseBody>(
      '$_serverUrl/api/user/inbox/stream',
      options: _buildOptions(token).copyWith(
        responseType: ResponseType.stream,
        receiveTimeout: const Duration(hours: 6),
      ),
      cancelToken: cancelToken,
    );
    final stream = res.data?.stream;
    if (stream == null) return;
    var buffer = '';
    await for (final chunk in stream) {
      buffer += utf8.decode(chunk, allowMalformed: true);
      while (buffer.contains('\n\n')) {
        final idx = buffer.indexOf('\n\n');
        final block = buffer.substring(0, idx);
        buffer = buffer.substring(idx + 2);
        for (final line in block.split('\n')) {
          if (!line.startsWith('data:')) continue;
          final json = jsonDecode(line.substring(5).trim());
          if (json is Map && json['events'] is List) {
            onEvents(
              (json['events'] as List).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList(),
            );
          }
        }
      }
    }
  }

  Future<List<Map<String, dynamic>>> listPeople() async {
    final token = await _getToken();
    final res = await _dio.get('$_serverUrl/api/user/people', options: _buildOptions(token));
    final list = res.data['albums'];
    if (list is List) return list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    return [];
  }

  Future<void> createPerson(String name) async {
    final token = await _getToken();
    await _dio.post('$_serverUrl/api/user/people', data: {'name': name}, options: _buildOptions(token));
  }

  Future<void> assignPerson({required String albumId, required String fileId, bool remove = false}) async {
    final token = await _getToken();
    await _dio.patch(
      '$_serverUrl/api/user/people',
      data: {'id': albumId, 'fileId': fileId, 'remove': remove},
      options: _buildOptions(token),
    );
  }

  Future<List<Map<String, dynamic>>> personFiles(String albumId) async {
    final token = await _getToken();
    final res = await _dio.get(
      '$_serverUrl/api/user/people/items',
      queryParameters: {'id': albumId},
      options: _buildOptions(token),
    );
    final list = res.data['files'];
    if (list is List) return list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    return [];
  }

  Future<List<Map<String, dynamic>>> fileVersions(String fileId) async {
    final token = await _getToken();
    final res = await _dio.get(
      '$_serverUrl/api/user/files/versions',
      queryParameters: {'id': fileId},
      options: _buildOptions(token),
    );
    final list = res.data['versions'];
    if (list is List) return list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    return [];
  }

  Future<void> restoreVersion({required String fileId, required int version}) async {
    final token = await _getToken();
    await _dio.post(
      '$_serverUrl/api/user/files/versions',
      data: {'fileId': fileId, 'version': version},
      options: _buildOptions(token),
    );
  }

  Future<UserStats> getUserStats() async {
    final token = await _getToken();
    final res = await _dio.get(
      '$_serverUrl/api/user/stats',
      options: _buildOptions(token),
    );
    return UserStats.fromJson(res.data);
  }

  Future<dynamic> registerDevice(Map<String, dynamic> data) async {
    final token = await _getToken();
    final res = await _dio.post(
      '$_serverUrl/api/user/device/register',
      data: data,
      options: _buildOptions(token),
    );
    return res.data;
  }

  String getMediaUrl(String path) {
    return '$_serverUrl/api/user/media/${Uri.encodeComponent(path)}';
  }

  Future<Map<String, String>> mediaHeaders() async {
    final token = await _getToken();
    return SessionTokenCleaner.authHeaders(token);
  }

  String get serverUrl => _serverUrl;
}
