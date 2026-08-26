import 'dart:io';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import '../../models/photo_media_item.dart';
import '../../services/media_discovery_service.dart';

class LiveMotionOverlay {
  static Future<void> play(BuildContext context, PhotoMediaItem item) async {
    final assetId = item.liveVideoAssetId;
    if (!item.isLive || assetId == null || assetId.isEmpty) return;
    final file = await MediaDiscoveryService().fileForAssetId(assetId);
    if (file == null || !context.mounted) return;
    await showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Live Photo',
      barrierColor: Colors.black87,
      pageBuilder: (ctx, _, __) => _LivePlayer(file: file, name: item.name),
    );
  }
}

class _LivePlayer extends StatefulWidget {
  final File file;
  final String name;
  const _LivePlayer({required this.file, required this.name});

  @override
  State<_LivePlayer> createState() => _LivePlayerState();
}

class _LivePlayerState extends State<_LivePlayer> {
  VideoPlayerController? _player;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    final player = VideoPlayerController.file(widget.file);
    await player.initialize();
    await player.setLooping(true);
    await player.play();
    if (!mounted) {
      await player.dispose();
      return;
    }
    setState(() => _player = player);
  }

  @override
  void dispose() {
    _player?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final player = _player;
    return GestureDetector(
      onTap: () => Navigator.of(context).pop(),
      onLongPressEnd: (_) => Navigator.of(context).pop(),
      child: Material(
        color: Colors.transparent,
        child: Center(
          child: player == null || !player.value.isInitialized
              ? const CircularProgressIndicator(color: Colors.white)
              : AspectRatio(
                  aspectRatio: player.value.aspectRatio == 0 ? 9 / 16 : player.value.aspectRatio,
                  child: VideoPlayer(player),
                ),
        ),
      ),
    );
  }
}
