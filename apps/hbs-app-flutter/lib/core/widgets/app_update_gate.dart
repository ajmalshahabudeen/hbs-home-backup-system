import 'dart:io';
import 'package:flutter/material.dart';
import '../../services/app_update_service.dart';

class AppUpdateGate extends StatefulWidget {
  final Widget child;
  const AppUpdateGate({super.key, required this.child});

  @override
  State<AppUpdateGate> createState() => _AppUpdateGateState();
}

class _AppUpdateGateState extends State<AppUpdateGate> {
  var _checked = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _check());
  }

  Future<void> _check() async {
    if (_checked || !Platform.isAndroid) return;
    _checked = true;
    final release = await AppUpdateService().check();
    if (release == null || !mounted) return;
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Update to ${release.tag}'),
        content: Text(
          release.notes.trim().isEmpty
              ? 'A new HBS Cloud APK is available. Download and install it now?'
              : release.notes,
          maxLines: 8,
          overflow: TextOverflow.ellipsis,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Later')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Download')),
        ],
      ),
    );
    if (go != true || !mounted) return;
    await _downloadAndInstall(release);
  }

  Future<void> _downloadAndInstall(AppRelease release) async {
    var received = 0;
    var total = 0;
    final progress = ValueNotifier<double?>(null);
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Downloading update'),
        content: ValueListenableBuilder<double?>(
          valueListenable: progress,
          builder: (_, pct, __) => Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              LinearProgressIndicator(value: pct),
              const SizedBox(height: 12),
              Text(pct == null ? 'Starting…' : '${(pct * 100).toStringAsFixed(0)}%'),
            ],
          ),
        ),
      ),
    );
    try {
      final file = await AppUpdateService().download(release, (r, t) {
        received = r;
        total = t;
        progress.value = t > 0 ? r / t : null;
      });
      if (!mounted) return;
      Navigator.of(context, rootNavigator: true).pop();
      final install = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Install update'),
          content: Text(
            'Downloaded ${release.tag} (${received > 0 && total > 0 ? '${(received / 1024 / 1024).toStringAsFixed(1)} MB' : 'APK'}).\n\n'
            'If Android says the package conflicts with an already installed app, uninstall HBS Cloud first, then install this APK. '
            'That happens when the old build was signed with a different key (debug vs GitHub release).',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Install')),
          ],
        ),
      );
      if (install == true) await AppUpdateService().install(file);
    } catch (e) {
      if (mounted) {
        Navigator.of(context, rootNavigator: true).pop();
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Update failed: $e')));
      }
    } finally {
      progress.dispose();
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
