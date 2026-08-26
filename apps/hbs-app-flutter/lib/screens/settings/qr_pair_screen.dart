import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../providers/server_provider.dart';

class QrPairScreen extends ConsumerStatefulWidget {
  const QrPairScreen({super.key});

  @override
  ConsumerState<QrPairScreen> createState() => _QrPairScreenState();
}

class _QrPairScreenState extends ConsumerState<QrPairScreen> {
  bool _handled = false;

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_handled) return;
    final raw = capture.barcodes.isEmpty ? null : capture.barcodes.first.rawValue;
    if (raw == null || raw.isEmpty) return;
    final uri = Uri.tryParse(raw);
    var url = raw;
    if (uri != null && uri.scheme == 'hbscloud' && uri.host == 'pair') {
      url = uri.queryParameters['url'] ?? raw;
    } else if (uri != null && (uri.scheme == 'http' || uri.scheme == 'https')) {
      url = raw;
    } else {
      return;
    }
    _handled = true;
    await ref.read(serverProvider.notifier).setServerUrl(url);
    if (mounted) Navigator.of(context).pop(url);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan server QR')),
      body: MobileScanner(onDetect: _onDetect),
    );
  }
}
