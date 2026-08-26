import 'dart:io';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:chewie/chewie.dart';
import 'package:flutter/material.dart';
import 'package:photo_view/photo_view.dart';
import 'package:video_player/video_player.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/vault_crypto.dart';
import '../../models/backup_file_item.dart';
import '../../services/api_service.dart';
import '../../services/drive_cache_service.dart';

class DrivePreviewScreen extends StatefulWidget {
  final BackupFileItem file;
  final String category;

  const DrivePreviewScreen({
    super.key,
    required this.file,
    required this.category,
  });

  static Future<void> open(BuildContext context, BackupFileItem file) async {
    var category = Formatters.getMimeTypeCategory(file.mimeType, file.name);
    if (file.name.endsWith('.hbsenc') || file.mimeType == 'application/x-hbs-encrypted') {
      final inner = file.name.replaceAll('.hbsenc', '');
      category = Formatters.getMimeTypeCategory(null, inner);
    }
    if (category != 'photo' && category != 'video' && category != 'audio') {
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => DrivePreviewScreen(file: file, category: category),
      ),
    );
  }

  @override
  State<DrivePreviewScreen> createState() => _DrivePreviewScreenState();
}

class _DrivePreviewScreenState extends State<DrivePreviewScreen> {
  VideoPlayerController? _player;
  ChewieController? _chewie;
  Map<String, String> _headers = const {};
  String _mediaUrl = '';
  File? _localFile;
  bool _ready = false;
  String? _error;

  bool get _encrypted =>
      widget.file.name.endsWith('.hbsenc') || widget.file.mimeType == 'application/x-hbs-encrypted';

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final api = ApiService();
    _headers = await api.mediaHeaders();
    try {
      if (_encrypted) {
        final cached = await DriveCacheService().cached(widget.file.id, widget.file.name);
        File source;
        if (cached != null) {
          source = cached;
        } else {
          final tmp = await DriveCacheService().fileFor(widget.file.id, widget.file.name);
          await api.downloadFile(fileId: widget.file.id, destPath: tmp.path);
          source = tmp;
        }
        _localFile = await VaultCrypto.decryptFile(source);
      } else {
        _mediaUrl = api.getMediaUrl(widget.file.path);
        if (widget.file.path.startsWith('__share__/')) {
          final tmp = await DriveCacheService().fileFor(widget.file.id, widget.file.name);
          await api.downloadFile(fileId: widget.file.id, destPath: tmp.path);
          _localFile = tmp;
        }
      }
      if (!mounted) return;

      if (widget.category == 'photo') {
        setState(() => _ready = true);
        return;
      }

      if (_localFile != null) {
        _player = VideoPlayerController.file(_localFile!);
      } else {
        _player = VideoPlayerController.networkUrl(Uri.parse(_mediaUrl), httpHeaders: _headers);
      }
      await _player!.initialize();
      if (!mounted) return;
      if (widget.category == 'video') {
        _chewie = ChewieController(
          videoPlayerController: _player!,
          autoPlay: true,
          looping: false,
          aspectRatio: _player!.value.aspectRatio == 0 ? 16 / 9 : _player!.value.aspectRatio,
          allowFullScreen: true,
          materialProgressColors: ChewieProgressColors(
            playedColor: Theme.of(context).primaryColor,
            handleColor: Theme.of(context).primaryColor,
          ),
        );
      } else {
        await _player!.play();
      }
      setState(() => _ready = true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Unable to preview this file');
    }
  }

  @override
  void dispose() {
    _chewie?.dispose();
    _player?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(widget.file.name, maxLines: 1, overflow: TextOverflow.ellipsis),
      ),
      body: _error != null
          ? Center(child: Text(_error!, style: const TextStyle(color: Colors.white70)))
          : !_ready
              ? const Center(child: CircularProgressIndicator(color: Colors.white))
              : _buildBody(),
    );
  }

  Widget _buildBody() {
    if (widget.category == 'photo') {
      final provider = _localFile != null
          ? FileImage(_localFile!)
          : CachedNetworkImageProvider(_mediaUrl, headers: _headers);
      return PhotoView(
        imageProvider: provider as ImageProvider,
        minScale: PhotoViewComputedScale.contained,
        maxScale: PhotoViewComputedScale.covered * 3.0,
        backgroundDecoration: const BoxDecoration(color: Colors.black),
        errorBuilder: (_, __, ___) => Formatters.isRaw(widget.file.mimeType, widget.file.name)
            ? Formatters.rawFallback()
            : Formatters.heicFallback(),
      );
    }

    if (widget.category == 'video' && _chewie != null) {
      return Chewie(controller: _chewie!);
    }

    final player = _player;
    if (player == null) {
      return const Center(child: CircularProgressIndicator(color: Colors.white));
    }

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.audiotrack_rounded, color: Colors.white, size: 72),
          const SizedBox(height: 16),
          Text(widget.file.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
          ValueListenableBuilder(
            valueListenable: player,
            builder: (context, value, _) {
              final maxMs = value.duration.inMilliseconds <= 0 ? 1.0 : value.duration.inMilliseconds.toDouble();
              return Column(
                children: [
                  Slider(
                    value: value.position.inMilliseconds.clamp(0, maxMs.toInt()).toDouble(),
                    max: maxMs,
                    onChanged: (v) => player.seekTo(Duration(milliseconds: v.toInt())),
                  ),
                  IconButton(
                    iconSize: 56,
                    color: Colors.white,
                    icon: Icon(value.isPlaying ? Icons.pause_circle_filled_rounded : Icons.play_circle_filled_rounded),
                    onPressed: () => value.isPlaying ? player.pause() : player.play(),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
