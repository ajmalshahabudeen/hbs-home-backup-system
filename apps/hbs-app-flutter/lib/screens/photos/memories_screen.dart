import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/widgets/media_thumb.dart';
import '../../models/photo_media_item.dart';
import '../../providers/media_provider.dart';
import '../../services/media_discovery_service.dart';
import '../photos/media_viewer_modal.dart';

class MemoriesScreen extends ConsumerWidget {
  const MemoriesScreen({super.key});

  static List<PhotoMediaItem> onThisDay(List<PhotoMediaItem> items) {
    final now = DateTime.now();
    return items.where((e) {
      final d = e.createdAt;
      return d != null && d.month == now.month && d.day == now.day && d.year != now.year;
    }).toList();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = onThisDay(ref.watch(mediaProvider).items);
    return Scaffold(
      appBar: AppBar(title: const Text('On this day')),
      body: items.isEmpty
          ? const Center(child: Text('No photos from this day in past years'))
          : GridView.builder(
              padding: const EdgeInsets.all(8),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: 2,
                mainAxisSpacing: 2,
              ),
              itemCount: items.length,
              itemBuilder: (context, i) {
                final item = items[i];
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
