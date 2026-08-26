import 'package:flutter/material.dart';
import '../../core/widgets/glass_card.dart';
import '../../core/widgets/media_thumb.dart';
import '../../models/photo_media_item.dart';
import '../../providers/media_provider.dart';
import '../../services/api_service.dart';
import '../../services/media_discovery_service.dart';
import 'media_viewer_modal.dart';
import 'people_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class AlbumsScreen extends ConsumerStatefulWidget {
  const AlbumsScreen({super.key});

  @override
  ConsumerState<AlbumsScreen> createState() => _AlbumsScreenState();
}

class _AlbumsScreenState extends ConsumerState<AlbumsScreen> {
  List<LocalAlbum> _local = [];
  List<Map<String, dynamic>> _cloud = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final local = await MediaDiscoveryService().getAlbums();
      List<Map<String, dynamic>> cloud = [];
      try {
        cloud = await ApiService().listAlbums();
      } catch (_) {}
      if (mounted) {
        setState(() {
          _local = local;
          _cloud = cloud;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = ref.watch(mediaProvider).items;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Albums & people'),
        actions: [
          IconButton(
            tooltip: 'People',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const PeopleScreen()),
            ),
            icon: const Icon(Icons.people_alt_rounded),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text('On this device', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                ..._local.map((album) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: GlassCard(
                      padding: const EdgeInsets.all(14),
                      borderRadius: 14,
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => _AlbumGrid(title: album.name, album: album)),
                        );
                      },
                      child: Row(
                        children: [
                          const Icon(Icons.photo_album_rounded),
                          const SizedBox(width: 12),
                          Expanded(child: Text(album.name, style: const TextStyle(fontWeight: FontWeight.w700))),
                          Text('${album.assetCount}'),
                        ],
                      ),
                    ),
                  );
                }),
                const SizedBox(height: 16),
                Text('On HBS Cloud', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                if (_cloud.isEmpty) const Text('No cloud albums yet'),
                ..._cloud.map((row) {
                  final path = row['path']?.toString() ?? '';
                  final name = row['name']?.toString() ?? path;
                  final count = ((row['photoCount'] as num?)?.toInt() ?? 0) + ((row['videoCount'] as num?)?.toInt() ?? 0);
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: GlassCard(
                      padding: const EdgeInsets.all(14),
                      borderRadius: 14,
                      onTap: () {
                        final filtered = items.where((e) => e.parentPath == path || e.path.startsWith(path.isEmpty ? '' : '$path/')).toList();
                        Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => _AlbumGrid(title: name, items: filtered)),
                        );
                      },
                      child: Row(
                        children: [
                          const Icon(Icons.cloud_rounded),
                          const SizedBox(width: 12),
                          Expanded(child: Text(name, style: const TextStyle(fontWeight: FontWeight.w700))),
                          Text('$count'),
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

class _AlbumGrid extends StatefulWidget {
  final String title;
  final LocalAlbum? album;
  final List<PhotoMediaItem>? items;
  const _AlbumGrid({required this.title, this.album, this.items});

  @override
  State<_AlbumGrid> createState() => _AlbumGridState();
}

class _AlbumGridState extends State<_AlbumGrid> {
  List<PhotoMediaItem> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    if (widget.items != null) {
      _items = widget.items!;
      _loading = false;
    } else if (widget.album != null) {
      MediaDiscoveryService().getLocalMedia(album: widget.album!.entity).then((rows) {
        if (mounted) {
          setState(() {
            _items = rows;
            _loading = false;
          });
        }
      });
    } else {
      _loading = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : GridView.builder(
              padding: const EdgeInsets.all(4),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: 2,
                mainAxisSpacing: 2,
              ),
              itemCount: _items.length,
              itemBuilder: (context, i) {
                final item = _items[i];
                return GestureDetector(
                  onTap: () async {
                    var resolved = item;
                    if (item.assetId != null && item.assetId!.isNotEmpty) {
                      resolved = await MediaDiscoveryService().resolveFile(item);
                    }
                    if (!context.mounted) return;
                    MediaViewerModal.show(context, resolved);
                  },
                  child: MediaThumb(item: item),
                );
              },
            ),
    );
  }
}
