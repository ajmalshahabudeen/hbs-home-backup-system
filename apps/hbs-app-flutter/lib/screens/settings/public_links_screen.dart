import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/widgets/glass_card.dart';
import '../../providers/server_provider.dart';
import '../../services/api_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class PublicLinksScreen extends ConsumerStatefulWidget {
  const PublicLinksScreen({super.key});

  @override
  ConsumerState<PublicLinksScreen> createState() => _PublicLinksScreenState();
}

class _PublicLinksScreenState extends ConsumerState<PublicLinksScreen> {
  List<Map<String, dynamic>> _links = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    try {
      final links = await ApiService().listPublicLinks();
      if (mounted) {
        setState(() {
          _links = links;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final base = ref.watch(serverProvider).url;
    return Scaffold(
      appBar: AppBar(title: const Text('Public links')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _links.isEmpty
              ? const Center(child: Text('No public links yet'))
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _links.length,
                  itemBuilder: (context, i) {
                    final row = _links[i];
                    final path = row['path']?.toString() ?? '/s/${row['token']}';
                    final url = '$base$path';
                    final expired = DateTime.tryParse(row['expiresAt']?.toString() ?? '')?.isBefore(DateTime.now()) == true;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: GlassCard(
                        padding: const EdgeInsets.all(12),
                        borderRadius: 14,
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(url, maxLines: 2, overflow: TextOverflow.ellipsis),
                                  Text(
                                    expired ? 'Expired' : 'Expires ${row['expiresAt'] ?? ''}',
                                    style: TextStyle(color: expired ? Colors.red : Colors.grey, fontSize: 12),
                                  ),
                                ],
                              ),
                            ),
                            IconButton(
                              icon: const Icon(Icons.copy_rounded),
                              onPressed: () async {
                                await Clipboard.setData(ClipboardData(text: url));
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Copied')));
                                }
                              },
                            ),
                            IconButton(
                              icon: const Icon(Icons.link_off_rounded, color: Colors.red),
                              onPressed: () async {
                                await ApiService().deletePublicLink(row['id'].toString());
                                await _reload();
                              },
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
    );
  }
}
