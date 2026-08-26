import 'package:flutter/material.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/glass_card.dart';
import '../../services/backup_index_db.dart';

class DuplicatesScreen extends StatefulWidget {
  const DuplicatesScreen({super.key});

  @override
  State<DuplicatesScreen> createState() => _DuplicatesScreenState();
}

class _DuplicatesScreenState extends State<DuplicatesScreen> {
  List<List<IndexedBackupItem>> _groups = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final groups = await BackupIndexDb().duplicateGroups();
    if (mounted) {
      setState(() {
        _groups = groups;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Duplicate files')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _groups.isEmpty
              ? const Center(child: Text('No duplicate checksums in the backup index'))
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _groups.length,
                  itemBuilder: (context, i) {
                    final group = _groups[i];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: GlassCard(
                        padding: const EdgeInsets.all(14),
                        borderRadius: 16,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${group.length} copies · ${Formatters.formatBytes(group.first.fileSize)}',
                              style: const TextStyle(fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 8),
                            ...group.map((item) => Padding(
                                  padding: const EdgeInsets.only(bottom: 4),
                                  child: Text(item.fileName, maxLines: 1, overflow: TextOverflow.ellipsis),
                                )),
                          ],
                        ),
                      ),
                    );
                  },
                ),
    );
  }
}
