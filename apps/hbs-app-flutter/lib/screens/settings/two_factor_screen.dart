import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/widgets/input_dialog.dart';
import '../../providers/server_provider.dart';
import '../../services/auth_service.dart';

class TwoFactorScreen extends ConsumerStatefulWidget {
  const TwoFactorScreen({super.key});

  @override
  ConsumerState<TwoFactorScreen> createState() => _TwoFactorScreenState();
}

class _TwoFactorScreenState extends ConsumerState<TwoFactorScreen> {
  List<String> _codes = [];
  String? _totpUri;

  Future<String?> _password() {
    return InputDialog.show(
      context,
      title: 'Confirm password',
      placeholder: 'Account password',
      confirmText: 'Continue',
      obscureText: true,
    );
  }

  @override
  Widget build(BuildContext context) {
    final url = ref.watch(serverProvider).url;
    return Scaffold(
      appBar: AppBar(title: const Text('Authenticator 2FA')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ListTile(
            leading: const Icon(Icons.qr_code_2_rounded),
            title: const Text('Enable / show TOTP URI'),
            onTap: () async {
              final password = await _password();
              if (password == null) return;
              final data = await AuthService().enableTwoFactor(serverUrl: url, password: password);
              if (!mounted) return;
              setState(() => _totpUri = data?['totpURI']?.toString() ?? data?['totpUri']?.toString());
              final codes = data?['backupCodes'];
              if (codes is List) setState(() => _codes = codes.map((e) => e.toString()).toList());
            },
          ),
          ListTile(
            leading: const Icon(Icons.vpn_key_rounded),
            title: const Text('Generate backup codes'),
            onTap: () async {
              final password = await _password();
              if (password == null) return;
              final codes = await AuthService().generateBackupCodes(serverUrl: url, password: password);
              if (!mounted) return;
              setState(() => _codes = codes);
            },
          ),
          ListTile(
            leading: const Icon(Icons.link_off_rounded, color: Colors.red),
            title: const Text('Disable 2FA', style: TextStyle(color: Colors.red)),
            onTap: () async {
              final password = await _password();
              if (password == null) return;
              final ok = await AuthService().disableTwoFactor(serverUrl: url, password: password);
              if (!context.mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(ok ? '2FA disabled' : 'Could not disable 2FA')),
              );
            },
          ),
          if (_totpUri != null) ...[
            const SizedBox(height: 12),
            SelectableText(_totpUri!, style: const TextStyle(fontSize: 12)),
          ],
          if (_codes.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text('Backup codes (store these offline)', style: TextStyle(fontWeight: FontWeight.w800)),
            ..._codes.map((c) => ListTile(dense: true, title: SelectableText(c))),
          ],
        ],
      ),
    );
  }
}
