import 'dart:async';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:network_info_plus/network_info_plus.dart';

class DiscoveredServer {
  final String ip;
  final int port;
  final int responseTimeMs;
  final String url;

  const DiscoveredServer({
    required this.ip,
    this.port = 38480,
    required this.responseTimeMs,
    required this.url,
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

      // Fallback: check network interfaces
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

  Future<DiscoveredServer?> checkCandidate(String ip, {int port = 38480}) async {
    final sw = Stopwatch()..start();
    final url = 'http://$ip:$port';
    try {
      final res = await _dio.get('$url/api/health');
      sw.stop();
      if (res.statusCode == 200) {
        return DiscoveredServer(
          ip: ip,
          port: port,
          responseTimeMs: sw.elapsedMilliseconds,
          url: url,
        );
      }
    } catch (_) {}
    return null;
  }

  Stream<DiscoveredServer> scanSubnet({
    int port = 38480,
    Function(double progress)? onProgress,
    bool autoStopOnFirst = true,
  }) async* {
    if (_isScanning) return;
    _isScanning = true;

    final controller = StreamController<DiscoveredServer>();

    try {
      final localIp = await getLocalIp() ?? '192.168.1.50';
      final subnetParts = localIp.split('.');
      final prefix = '${subnetParts[0]}.${subnetParts[1]}.${subnetParts[2]}';

      // 1. Check Fast Candidates first
      final fastCandidates = <String>{
        '192.168.1.100',
        '$prefix.100',
        '$prefix.101',
        '$prefix.50',
        '$prefix.1',
        localIp,
      }.toList();

      for (final ip in fastCandidates) {
        final result = await checkCandidate(ip, port: port);
        if (result != null) {
          yield result;
          if (autoStopOnFirst) {
            _isScanning = false;
            return;
          }
        }
      }

      // 2. Scan remaining subnet in chunks of 25 parallel requests
      final allIps = List.generate(254, (index) => '$prefix.${index + 1}')
          .where((ip) => !fastCandidates.contains(ip))
          .toList();

      int completed = 0;
      final total = allIps.length;

      const chunkSize = 25;
      for (int i = 0; i < allIps.length; i += chunkSize) {
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
      await controller.close();
    }
  }

  void stopScan() {
    _isScanning = false;
  }
}
