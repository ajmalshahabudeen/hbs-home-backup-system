import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/server_info.dart';
import '../services/api_service.dart';
import '../services/lan_scanner_service.dart';
import '../services/storage_service.dart';

class ServerNotifier extends StateNotifier<ServerInfo> {
  ServerNotifier() : super(const ServerInfo(url: 'http://192.168.1.100:38480')) {
    _init();
  }

  Future<void> _init() async {
    final savedUrl = StorageService().getString('hbs_server_url', defaultValue: 'http://192.168.1.100:38480');
    state = state.copyWith(url: savedUrl);
    ApiService().updateConfig(serverUrl: savedUrl);

    // Initial Health Check
    final isHealthy = await checkHealth(savedUrl);
    if (!isHealthy) {
      // Auto-scan LAN for reachable server
      autoDiscoverAndConnect();
    }
  }

  Future<bool> checkHealth(String url) async {
    final sw = Stopwatch()..start();
    final ok = await ApiService().checkHealth(url);
    sw.stop();

    if (ok) {
      state = state.copyWith(
        url: url,
        isConnected: true,
        pingMs: sw.elapsedMilliseconds,
      );
      ApiService().updateConfig(serverUrl: url);
      await StorageService().setString('hbs_server_url', url);
      return true;
    } else {
      state = state.copyWith(isConnected: false);
      return false;
    }
  }

  Future<void> setServerUrl(String url) async {
    final clean = url.endsWith('/') ? url.substring(0, url.length - 1) : url;
    state = state.copyWith(url: clean);
    await StorageService().setString('hbs_server_url', clean);
    ApiService().updateConfig(serverUrl: clean);
    await checkHealth(clean);
  }

  void autoDiscoverAndConnect() {
    LanScannerService().scanSubnet(
      autoStopOnFirst: true,
    ).listen((discovered) {
      setServerUrl(discovered.url);
    });
  }
}

final serverProvider = StateNotifierProvider<ServerNotifier, ServerInfo>((ref) {
  return ServerNotifier();
});
