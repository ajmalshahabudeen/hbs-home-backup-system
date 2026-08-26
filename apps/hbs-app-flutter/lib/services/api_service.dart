import 'package:dio/dio.dart';
import 'package:http_parser/http_parser.dart';
import 'package:mime/mime.dart';
import '../core/utils/session_token_cleaner.dart';
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
  }) async {
    final token = await _getToken();
    final resolvedMime = mimeType ?? lookupMimeType(filePath) ?? 'application/octet-stream';
    final mimeParts = resolvedMime.split('/');
    final mediaType = MediaType(mimeParts[0], mimeParts.length > 1 ? mimeParts[1] : 'octet-stream');

    final formData = FormData.fromMap({
      'parentPath': parentPath,
      'path': parentPath,
      'fileName': fileName,
      'name': fileName,
      'file': await MultipartFile.fromFile(
        filePath,
        filename: fileName,
        contentType: mediaType,
      ),
    });

    final res = await _dio.post(
      '$_serverUrl/api/user/upload',
      data: formData,
      options: _buildOptions(token),
      onSendProgress: onSendProgress,
      cancelToken: cancelToken,
    );

    return res.data;
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
