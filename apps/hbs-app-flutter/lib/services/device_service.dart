import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:network_info_plus/network_info_plus.dart';
import '../core/backup_engine/wakeup/device_wakeup_server.dart';
import 'api_service.dart';

class DeviceService {
  static final DeviceService _instance = DeviceService._internal();
  factory DeviceService() => _instance;
  DeviceService._internal();

  Future<void> registerAndPing() async {
    try {
      // Ensure the LAN wakeup server is active on port 38482
      await DeviceWakeupServer().start();

      final plugin = DeviceInfoPlugin();
      String deviceId = 'unknown';
      String deviceName = 'HBS Cloud';
      var platform = 'android';

      if (Platform.isAndroid) {
        final info = await plugin.androidInfo;
        deviceId = info.id;
        deviceName = '${info.brand} ${info.model}'.trim();
        platform = 'android';
      } else if (Platform.isIOS) {
        final info = await plugin.iosInfo;
        deviceId = info.identifierForVendor ?? info.name;
        deviceName = info.name;
        platform = 'ios';
      } else if (Platform.isWindows) {
        final info = await plugin.windowsInfo;
        deviceId = info.deviceId;
        deviceName = info.computerName;
        platform = 'windows';
      }

      final ip = await NetworkInfo().getWifiIP();
      await ApiService().registerDevice({
        'deviceId': deviceId,
        'deviceName': deviceName,
        'platform': platform,
        'localIp': ip,
        'wakePort': DeviceWakeupServer.defaultPort,
      });
      await ApiService().pingDevice(deviceId: deviceId, localIp: ip);
    } catch (_) {}
  }
}

