import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_displaymode/flutter_displaymode.dart';

/// Unlock the panel's peak refresh rate (120/144Hz) so vsync matches the display.
Future<void> enableHighestRefreshRate() async {
  if (kIsWeb || !Platform.isAndroid) return;
  try {
    await FlutterDisplayMode.setHighRefreshRate();
  } catch (_) {
    try {
      final modes = await FlutterDisplayMode.supported;
      if (modes.isEmpty) return;
      var best = modes.first;
      for (final mode in modes) {
        if (mode.refreshRate > best.refreshRate) best = mode;
      }
      await FlutterDisplayMode.setPreferredMode(best);
    } catch (_) {}
  }
}
