import 'dart:async';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:network_info_plus/network_info_plus.dart';
import '../core/utils/lan_host.dart';

class DiscoveredServer {
  final String ip;
  final int port;
  final int responseTimeMs;
  final String url;
  final String? hostname;
  final bool viaHostname;

  const DiscoveredServer({
    required this.ip,
    this.port = LanHost.defaultPort,
    required this.responseTimeMs,
    required this.url,
    this.hostname,
    this.viaHostname = false,
  });
}

class LanScannerService {
  static final LanScannerService _instance = LanScannerService._internal();
  factory LanScannerService() => _instance;
  LanScannerService._internal();

  final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(milliseconds: 900),
      receiveTimeout: const Duration(milliseconds: 900),
    ),
  );

  bool _isScanning = false;
  bool get isScanning => _isScanning;

  Future<String?> getLocalIp() async {
    try {
      final info = NetworkInfo();
      final ip = await info.getWifiIP();
      if (ip != null && ip.isNotEmpty && ip != '0.0.0.0') return ip;

      final interfaces = await NetworkInterface.list(
        type: InternetAddressType.IPv4,
        includeLoopback: false,
      );
      for (final interface in interfaces) {
        for (final addr in interface.addresses) {
          if (!addr.isLoopback && addr.address.startsWith('192.168.')) {
            return addr.address;
          }
        }
      }
      if (interfaces.isNotEmpty && interfaces.first.addresses.isNotEmpty) {
        return interfaces.first.addresses.first.address;
      }
    } catch (_) {}
    return null;
  }

  Future<DiscoveredServer?> checkCandidate(String host, {int port = LanHost.defaultPort}) async {
    final sw = Stopwatch()..start();
    final url = host.contains('://') ? LanHost.stripUrl(host) : LanHost.urlFor(host, port: port);
    try {
      final res = await _dio.get('$url/api/health');
      sw.stop();
      if (res.statusCode != 200) return null;
      final advertised = LanHost.advertisedUrlFromHealth(res.data);
      var chosen = url;
      var hostname = LanHost.hostOf(url);
      var viaHostname = LanHost.isHostnameUrl(url);
      if (advertised != null && advertised != url) {
        final promoted = await _probeUrl(advertised);
        if (promoted) {
          chosen = advertised;
          hostname = LanHost.hostOf(advertised);
          viaHostname = LanHost.isHostnameUrl(advertised);
        }
      }
      return DiscoveredServer(
        ip: viaHostname ? hostname : LanHost.hostOf(url),
        port: port,
        responseTimeMs: sw.elapsedMilliseconds,
        url: chosen,
        hostname: hostname,
        viaHostname: viaHostname,
      );
    } catch (_) {}
    return null;
  }

  Future<bool> _probeUrl(String url) async {
    try {
      final res = await _dio.get('${LanHost.stripUrl(url)}/api/health');
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Stream<DiscoveredServer> scanSubnet({
    int port = LanHost.defaultPort,
    Function(double progress)? onProgress,
    bool autoStopOnFirst = true,
  }) async* {
    if (_isScanning) return;
    _isScanning = true;

    try {
      final hostnames = <String>{
        LanHost.defaultHost,
      };

      for (final host in hostnames) {
        if (!_isScanning) return;
        final result = await checkCandidate(host, port: port);
        if (result != null) {
          yield result;
          if (autoStopOnFirst) {
            _isScanning = false;
            return;
          }
        }
      }

      final localIp = await getLocalIp() ?? '192.168.1.50';
      final subnetParts = localIp.split('.');
      final prefix = '${subnetParts[0]}.${subnetParts[1]}.${subnetParts[2]}';

      final fastCandidates = <String>{
        '192.168.1.100',
        '$prefix.100',
        '$prefix.101',
        '$prefix.50',
        '$prefix.1',
        localIp,
      }.toList();

      for (final ip in fastCandidates) {
        if (!_isScanning) return;
        final result = await checkCandidate(ip, port: port);
        if (result != null) {
          yield result;
          if (autoStopOnFirst) {
            _isScanning = false;
            return;
          }
        }
      }

      final allIps = List.generate(254, (index) => '$prefix.${index + 1}')
          .where((ip) => !fastCandidates.contains(ip))
          .toList();

      var completed = 0;
      final total = allIps.length;
      const chunkSize = 25;
      for (var i = 0; i < allIps.length; i += chunkSize) {
        if (!_isScanning) break;

        final chunk = allIps.sublist(
          i,
          (i + chunkSize > allIps.length) ? allIps.length : i + chunkSize,
        );

        final results = await Future.wait(
          chunk.map((ip) async {
            final res = await checkCandidate(ip, port: port);
            completed++;
            onProgress?.call(completed / total);
            return res;
          }),
        );

        for (final server in results) {
          if (server != null) {
            yield server;
            if (autoStopOnFirst) {
              _isScanning = false;
              return;
            }
          }
        }
      }
    } finally {
      _isScanning = false;
    }
  }

  void stopScan() {
    _isScanning = false;
  }
}
