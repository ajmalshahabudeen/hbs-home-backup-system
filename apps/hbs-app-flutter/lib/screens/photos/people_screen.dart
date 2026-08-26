import 'package:flutter/material.dart';
import '../../core/widgets/glass_card.dart';
import '../../core/widgets/input_dialog.dart';
import '../../services/api_service.dart';

class PeopleScreen extends StatefulWidget {
  const PeopleScreen({super.key});

  @override
  State<PeopleScreen> createState() => _PeopleScreenState();
}

class _PeopleScreenState extends State<PeopleScreen> {
  List<Map<String, dynamic>> _albums = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    try {
      final albums = await ApiService().listPeople();
      if (mounted) {
        setState(() {
          _albums = albums;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _create() async {
    final name = await InputDialog.show(
      context,
      title: 'New person',
      placeholder: 'Name',
      confirmText: 'Create',
    );
    if (name == null || name.trim().isEmpty) return;
    await ApiService().createPerson(name.trim());
    await _reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('People'),
        actions: [IconButton(onPressed: _create, icon: const Icon(Icons.person_add_alt_1_rounded))],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Manual albums only — no face scanning or cloud APIs. Assign photos from Drive.',
                  style: TextStyle(fontSize: 13),
                ),
                const SizedBox(height: 12),
                if (_albums.isEmpty) const Text('No people albums yet'),
                ..._albums.map((row) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: GlassCard(
                      padding: const EdgeInsets.all(14),
                      borderRadius: 14,
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => _PersonFiles(id: row['id'].toString(), name: row['name']?.toString() ?? 'Person'),
                          ),
                        );
                      },
                      child: Row(
                        children: [
                          const Icon(Icons.person_rounded),
                          const SizedBox(width: 12),
                          Expanded(child: Text(row['name']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w700))),
                          Text('${row['count'] ?? 0}'),
                        ],
                      ),
                    ),
                  );
                }),
              ],
            ),
    );
  }
}

class _PersonFiles extends StatefulWidget {
  final String id;
  final String name;
  const _PersonFiles({required this.id, required this.name});

  @override
  State<_PersonFiles> createState() => _PersonFilesState();
}

class _PersonFilesState extends State<_PersonFiles> {
  List<Map<String, dynamic>> _files = [];

  @override
  void initState() {
    super.initState();
    ApiService().personFiles(widget.id).then((rows) {
      if (mounted) setState(() => _files = rows);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.name)),
      body: _files.isEmpty
          ? const Center(child: Text('No photos assigned yet'))
          : ListView.builder(
              itemCount: _files.length,
              itemBuilder: (context, i) {
                final f = _files[i];
                return ListTile(
                  leading: const Icon(Icons.image_outlined),
                  title: Text(f['name']?.toString() ?? ''),
                  subtitle: Text(f['path']?.toString() ?? ''),
                );
              },
            ),
    );
  }
}
