import 'package:flutter/material.dart';
import '../../core/widgets/glass_card.dart';
import '../../core/widgets/input_dialog.dart';
import '../../services/api_service.dart';

class FamilyShareScreen extends StatefulWidget {
  const FamilyShareScreen({super.key});

  @override
  State<FamilyShareScreen> createState() => _FamilyShareScreenState();
}

class _FamilyShareScreenState extends State<FamilyShareScreen> {
  Map<String, dynamic> _data = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    try {
      final data = await ApiService().listShares();
      if (mounted) {
        setState(() {
          _data = data;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _invite() async {
    final email = await InputDialog.show(
      context,
      title: 'Share a folder',
      placeholder: 'family@email.com',
      confirmText: 'Share',
    );
    if (email == null || email.isEmpty) return;
    await ApiService().createShare(email: email);
    await _reload();
  }

  @override
  Widget build(BuildContext context) {
    final owned = (_data['owned'] as List?) ?? [];
    final received = (_data['sharedWithMe'] as List?) ?? [];
    return Scaffold(
      appBar: AppBar(
        title: const Text('Family folders'),
        actions: [IconButton(onPressed: _invite, icon: const Icon(Icons.person_add_alt_1_rounded))],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text('Shared by you', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                if (owned.isEmpty) const Text('No outgoing shares yet'),
                ...owned.map((raw) {
                  final row = Map<String, dynamic>.from(raw as Map);
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: GlassCard(
                      padding: const EdgeInsets.all(12),
                      borderRadius: 14,
                      child: Row(
                        children: [
                          Expanded(child: Text('${row['sharedWithEmail']} · ${row['path'] == '' ? 'All files' : row['path']}')),
                          IconButton(
                            icon: const Icon(Icons.delete_outline, color: Colors.red),
                            onPressed: () async {
                              await ApiService().deleteShare(row['id'].toString());
                              await _reload();
                            },
                          ),
                        ],
                      ),
                    ),
                  );
                }),
                const SizedBox(height: 20),
                Text('Shared with you', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                if (received.isEmpty) const Text('Nothing shared with you yet'),
                ...received.map((raw) {
                  final row = Map<String, dynamic>.from(raw as Map);
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: GlassCard(
                      padding: const EdgeInsets.all(12),
                      borderRadius: 14,
                      child: Text('${row['ownerEmail']} · ${row['path'] == '' ? 'All files' : row['path']}'),
                    ),
                  );
                }),
              ],
            ),
    );
  }
}
