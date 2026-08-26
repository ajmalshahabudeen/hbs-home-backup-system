import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:network_info_plus/network_info_plus.dart';
import 'api_service.dart';
import 'storage_service.dart';

class DeviceService {
  static final DeviceService _instance = DeviceService._internal();
  factory DeviceService() => _instance;
  DeviceService._internal();

  Future<void> registerAndPing() async {
    try {
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
      final ntfy = StorageService().getString('hbs_ntfy_topic').trim();
      await ApiService().registerDevice({
        'deviceId': deviceId,
        'deviceName': deviceName,
        'platform': platform,
        'localIp': ip,
        if (ntfy.isNotEmpty) 'pushToken': ntfy.startsWith('ntfy:') ? ntfy : 'ntfy:$ntfy',
      });
      await ApiService().pingDevice(deviceId: deviceId, localIp: ip);
    } catch (_) {}
  }
}
