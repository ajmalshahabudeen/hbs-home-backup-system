import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/utils/lan_host.dart';
import '../models/server_info.dart';
import '../services/api_service.dart';
import '../services/lan_scanner_service.dart';
import '../services/storage_service.dart';

class ServerNotifier extends StateNotifier<ServerInfo> {
  ServerNotifier()
      : super(ServerInfo(
          url: StorageService().getString('hbs_server_url', defaultValue: LanHost.defaultUrl),
        )) {
    _init();
  }

  Future<void> _init() async {
    final savedUrl = StorageService().getString('hbs_server_url', defaultValue: LanHost.defaultUrl);
    state = state.copyWith(url: savedUrl);
    ApiService().updateConfig(serverUrl: savedUrl);

    final isHealthy = await checkHealth(savedUrl);
    if (isHealthy) return;

    if (savedUrl != LanHost.defaultUrl) {
      final hostOk = await checkHealth(LanHost.defaultUrl);
      if (hostOk) return;
    }
    autoDiscoverAndConnect();
  }

  Future<bool> checkHealth(String url) async {
    final sw = Stopwatch()..start();
    final data = await ApiService().fetchHealth(url);
    sw.stop();

    if (data == null) {
      state = state.copyWith(isConnected: false);
      return false;
    }

    var chosen = LanHost.stripUrl(url);
    final advertised = LanHost.advertisedUrlFromHealth(data);
    if (advertised != null && advertised != chosen && LanHost.isHostnameUrl(advertised)) {
      final hostOk = await ApiService().fetchHealth(advertised);
      if (hostOk != null) chosen = advertised;
    }

    state = state.copyWith(
      url: chosen,
      isConnected: true,
      pingMs: sw.elapsedMilliseconds,
    );
    ApiService().updateConfig(serverUrl: chosen);
    await StorageService().setString('hbs_server_url', chosen);
    return true;
  }

  Future<void> setServerUrl(String url) async {
    final clean = LanHost.stripUrl(url);
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
