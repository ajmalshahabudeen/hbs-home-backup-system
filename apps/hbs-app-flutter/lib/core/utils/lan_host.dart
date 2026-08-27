import '../../config/defaults.dart';

export '../../config/defaults.dart';

class LanHost {
  static const defaultHost = kDefaultLanHost;
  static const defaultPort = kDefaultLanPort;
  static const defaultUrl = kDefaultLanUrl;

  static final _ipv4 = RegExp(r'^\d{1,3}(\.\d{1,3}){3}$');

  static bool isIpHost(String host) => _ipv4.hasMatch(host);

  static String stripUrl(String raw) {
    var h = raw.trim();
    if (h.endsWith('/')) h = h.substring(0, h.length - 1);
    return h;
  }

  static String hostOf(String url) {
    try {
      return Uri.parse(stripUrl(url)).host;
    } catch (_) {
      return '';
    }
  }

  static bool isHostnameUrl(String url) {
    final host = hostOf(url);
    return host.isNotEmpty && !isIpHost(host);
  }

  static String urlFor(String host, {int port = defaultPort}) {
    final clean = host.trim().toLowerCase().replaceAll(RegExp(r'^https?://'), '').split('/').first;
    if (clean.contains('://')) return stripUrl(clean);
    final name = clean.contains(':') ? clean.split(':').first : clean;
    final p = clean.contains(':') ? int.tryParse(clean.split(':').last) ?? port : port;
    return 'http://$name:$p';
  }

  static String? advertisedUrlFromHealth(dynamic data) {
    if (data is! Map) return null;
    final lan = data['lan'];
    if (lan is! Map) return null;
    final url = lan['url']?.toString().trim() ?? '';
    if (url.isEmpty) {
      final host = lan['hostname']?.toString().trim() ?? '';
      if (host.isEmpty) return null;
      return urlFor(host);
    }
    return stripUrl(url);
  }
}
