import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/widgets/glass_card.dart';
import '../../providers/server_provider.dart';
import '../../services/lan_scanner_service.dart';
import 'qr_pair_screen.dart';

class LanScannerModal extends ConsumerStatefulWidget {
  const LanScannerModal({super.key});

  @override
  ConsumerState<LanScannerModal> createState() => _LanScannerModalState();
}

class _LanScannerModalState extends ConsumerState<LanScannerModal> {
  final List<DiscoveredServer> _discoveredServers = [];
  bool _isScanning = false;
  double _progress = 0.0;
  late TextEditingController _manualController;

  @override
  void initState() {
    super.initState();
    _manualController = TextEditingController(text: ref.read(serverProvider).url);
    _startScan();
  }

  @override
  void dispose() {
    LanScannerService().stopScan();
    _manualController.dispose();
    super.dispose();
  }

  void _startScan() {
    setState(() {
      _discoveredServers.clear();
      _isScanning = true;
      _progress = 0.0;
    });

    LanScannerService().scanSubnet(
      autoStopOnFirst: false,
      onProgress: (p) {
        if (mounted) setState(() => _progress = p);
      },
    ).listen(
      (server) {
        if (mounted) {
          setState(() {
            if (!_discoveredServers.any((s) => s.url == server.url)) {
              _discoveredServers.add(server);
            }
          });
        }
      },
      onDone: () {
        if (mounted) setState(() => _isScanning = false);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final primary = theme.primaryColor;
    final serverInfo = ref.watch(serverProvider);

    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
      child: Container(
        height: MediaQuery.of(context).size.height * 0.75,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
        decoration: BoxDecoration(
          color: (isDark ? theme.cardColor : Colors.white).withValues(alpha: 0.95),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          border: Border(
            top: BorderSide(
              color: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.08),
            ),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'HBS LAN Server Scanner',
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                ),
                IconButton(
                  icon: Icon(_isScanning ? Icons.stop_rounded : Icons.refresh_rounded, color: primary),
                  onPressed: _isScanning ? () => LanScannerService().stopScan() : _startScan,
                  tooltip: _isScanning ? 'Stop Scan' : 'Scan Again',
                ),
              ],
            ),
            Text(
              'Searching local network for HBS backup servers on port 38480',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
              ),
            ),

            if (_isScanning) ...[
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: _progress > 0 ? _progress : null,
                  backgroundColor: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05),
                  valueColor: AlwaysStoppedAnimation<Color>(primary),
                  minHeight: 4,
                ),
              ),
            ],

            const SizedBox(height: 16),

            // Discovered Servers List
            Expanded(
              child: _discoveredServers.isEmpty
                  ? Center(
                      child: Text(
                        _isScanning ? 'Scanning LAN subnet...' : 'No servers found on LAN. Try manual entry below.',
                        style: TextStyle(color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6)),
                      ),
                    )
                  : ListView.separated(
                      itemCount: _discoveredServers.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final server = _discoveredServers[index];
                        final isCurrent = server.url == serverInfo.url;

                        return GlassCard(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          borderRadius: 16,
                          child: Row(
                            children: [
                              Container(
                                width: 8,
                                height: 8,
                                decoration: const BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: Color(0xFF10B981),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      server.url,
                                      style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
                                    ),
                                    Text(
                                      'Ping: ${server.responseTimeMs}ms',
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              ElevatedButton(
                                onPressed: isCurrent
                                    ? null
                                    : () async {
                                        await ref.read(serverProvider.notifier).setServerUrl(server.url);
                                        if (context.mounted) Navigator.of(context).pop();
                                      },
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: isCurrent ? Colors.grey : primary,
                                  foregroundColor: Colors.white,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                ),
                                child: Text(isCurrent ? 'Active' : 'Connect'),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),

            const SizedBox(height: 12),
            const Divider(),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              icon: const Icon(Icons.qr_code_scanner_rounded),
              label: const Text('Scan pairing QR'),
              onPressed: () async {
                final url = await Navigator.of(context).push<String>(
                  MaterialPageRoute(builder: (_) => const QrPairScreen()),
                );
                if (url != null && context.mounted) Navigator.of(context).pop();
              },
            ),
            const SizedBox(height: 8),

            // Manual IP Entry Row
            Text(
              'Manual Server IP / Hostname',
              style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _manualController,
                    decoration: InputDecoration(
                      hintText: 'http://192.168.1.100:38480',
                      filled: true,
                      fillColor: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.03),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: primary)),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: () async {
                    final url = _manualController.text.trim();
                    if (url.isNotEmpty) {
                      await ref.read(serverProvider.notifier).setServerUrl(url);
                      if (context.mounted) Navigator.of(context).pop();
                    }
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  ),
                  child: const Text('Save'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
