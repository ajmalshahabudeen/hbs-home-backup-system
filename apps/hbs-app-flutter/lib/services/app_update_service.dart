import 'dart:io';
import 'package:dio/dio.dart';
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

class AppRelease {
  final String version;
  final String tag;
  final String apkUrl;
  final String notes;

  const AppRelease({
    required this.version,
    required this.tag,
    required this.apkUrl,
    this.notes = '',
  });
}

class AppUpdateService {
  static const repo = 'ajmalshahabudeen/hbs-home-backup-system';
  static const latestApi = 'https://api.github.com/repos/$repo/releases/latest';

  static String normalize(String raw) {
    return raw.trim().replaceFirst(RegExp(r'^[vV]'), '');
  }

  static int compare(String a, String b) {
    final pa = normalize(a).split(RegExp(r'[^0-9]+')).where((e) => e.isNotEmpty).map(int.parse).toList();
    final pb = normalize(b).split(RegExp(r'[^0-9]+')).where((e) => e.isNotEmpty).map(int.parse).toList();
    final n = pa.length > pb.length ? pa.length : pb.length;
    for (var i = 0; i < n; i++) {
      final x = i < pa.length ? pa[i] : 0;
      final y = i < pb.length ? pb[i] : 0;
      if (x != y) return x.compareTo(y);
    }
    return 0;
  }

  Future<AppRelease?> check() async {
    try {
      final info = await PackageInfo.fromPlatform();
      final res = await Dio().get(
        latestApi,
        options: Options(
          headers: {'Accept': 'application/vnd.github+json', 'User-Agent': 'HBS-Cloud'},
          validateStatus: (s) => s != null && s < 500,
        ),
      );
      if (res.statusCode != 200 || res.data is! Map) return null;
      final data = Map<String, dynamic>.from(res.data as Map);
      final tag = data['tag_name']?.toString() ?? '';
      if (tag.isEmpty) return null;
      if (compare(tag, info.version) <= 0) return null;
      final assets = data['assets'];
      String apk = '';
      if (assets is List) {
        for (final a in assets) {
          if (a is! Map) continue;
          final name = a['name']?.toString().toLowerCase() ?? '';
          final url = a['browser_download_url']?.toString() ?? '';
          if (name.endsWith('.apk') && url.isNotEmpty) {
            apk = url;
            break;
          }
        }
      }
      if (apk.isEmpty) return null;
      return AppRelease(
        version: normalize(tag),
        tag: tag,
        apkUrl: apk,
        notes: data['body']?.toString() ?? '',
      );
    } catch (_) {
      return null;
    }
  }

  Future<File> download(AppRelease release, void Function(int received, int total) onProgress) async {
    final dir = await getTemporaryDirectory();
    final dest = File('${dir.path}/hbs-cloud-${release.tag}.apk');
    await Dio().download(
      release.apkUrl,
      dest.path,
      onReceiveProgress: onProgress,
      options: Options(headers: {'User-Agent': 'HBS-Cloud'}),
    );
    return dest;
  }

  Future<void> install(File apk) async {
    await OpenFilex.open(apk.path, type: 'application/vnd.android.package-archive');
  }
}
