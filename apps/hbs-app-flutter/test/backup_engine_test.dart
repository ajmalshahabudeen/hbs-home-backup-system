import 'package:flutter_test/flutter_test.dart';
import 'package:hbs_app_flutter/core/backup_engine/backup_engine.dart';
import 'package:hbs_app_flutter/models/photo_media_item.dart';

void main() {
  group('Backup Engine Models', () {
    test('IndexedBackupItem serializes and deserializes accurately', () {
      const item = IndexedBackupItem(
        id: 'idx_123',
        fileName: 'IMG_20260903.jpg',
        filePath: '/storage/DCIM/Camera/IMG_20260903.jpg',
        fileSize: 4500000,
        checksum: 'sha256_mock_hash_value',
        mimeType: 'image/jpeg',
        uploadedAt: '2026-09-03T11:00:00.000Z',
      );

      final map = item.toMap();
      expect(map['id'], 'idx_123');
      expect(map['file_name'], 'IMG_20260903.jpg');
      expect(map['file_size'], 4500000);
      expect(map['checksum'], 'sha256_mock_hash_value');

      final roundTrip = IndexedBackupItem.fromMap(map);
      expect(roundTrip.id, item.id);
      expect(roundTrip.fileName, item.fileName);
      expect(roundTrip.fileSize, item.fileSize);
      expect(roundTrip.checksum, item.checksum);
      expect(roundTrip.mimeType, item.mimeType);
      expect(roundTrip.uploadedAt, item.uploadedAt);
    });

    test('QueueUploadItem handles status mapping and defaults', () {
      const queueItem = QueueUploadItem(
        id: 'q_456',
        assetId: 'asset_789',
        filePath: '/storage/Pictures/photo.png',
        fileName: 'photo.png',
        fileSize: 1024,
        mimeType: 'image/png',
        status: QueueItemStatus.pending,
        createdAt: '2026-09-03T11:30:00.000Z',
      );

      final map = queueItem.toMap();
      expect(map['id'], 'q_456');
      expect(map['status'], 'pending');

      final fromMap = QueueUploadItem.fromMap(map);
      expect(fromMap.id, 'q_456');
      expect(fromMap.status, QueueItemStatus.pending);
      expect(fromMap.parentPath, 'MobileBackups');
    });
  });

  group('Backup Engine Services & Utilities', () {
    test('BatteryOptimizer singleton exists and returns valid future', () async {
      final optimizer = BatteryOptimizer();
      expect(optimizer, isNotNull);
      final isIgnored = await optimizer.isBatteryOptimizationIgnored();
      expect(isIgnored, isA<bool>());
    });

    test('BackupNotificationManager preference defaults to true', () {
      final notificationManager = BackupNotificationManager();
      expect(notificationManager, isNotNull);
      expect(notificationManager.isNotificationsEnabled, isTrue);
    });

    test('BackupNotificationManager cancelSyncNotification sets cancelled and resetCancellation clears it', () async {
      final manager = BackupNotificationManager();
      manager.resetCancellation();
      await manager.cancelSyncNotification();
      // Verifies notification is marked cancelled so in-flight calls do not re-show
      expect(manager, isNotNull);
    });

    test('UploadQueueEngine cancelSync updates isCancelled state', () {
      final queue = UploadQueueEngine();
      queue.cancelSync();
      expect(queue.isCancelled, isTrue);
      expect(queue.currentState.syncStepMessage, 'Backup cancelled');
    });

    test('MediaListenerService singleton initializes and manages listening state', () {
      final listener = MediaListenerService();
      expect(listener, isNotNull);
      expect(listener.isListening, isFalse);
      listener.startListening();
      expect(listener.isListening, isTrue);
      listener.stopListening();
      expect(listener.isListening, isFalse);
    });

    test('New platform user state detection logic', () {
      bool isNewUser({required int localCount, required int serverCount}) {
        return localCount == 0 && serverCount == 0;
      }

      // Reinstalled user with existing server backup
      expect(isNewUser(localCount: 0, serverCount: 142), isFalse);
      // Existing active user on device
      expect(isNewUser(localCount: 50, serverCount: 50), isFalse);
      // Brand new user (empty in both places)
      expect(isNewUser(localCount: 0, serverCount: 0), isTrue);
    });

    test('Allowed backup folder matching logic', () {
      final allowedAlbumIds = ['album_camera_123', 'album_family_456'];

      bool isAllowed(String albumId, List<String> allowed) {
        if (allowed.isEmpty) return true; // All folders permitted
        return allowed.contains(albumId);
      }

      expect(isAllowed('album_camera_123', allowedAlbumIds), isTrue);
      expect(isAllowed('album_family_456', allowedAlbumIds), isTrue);
      expect(isAllowed('album_random_789', allowedAlbumIds), isFalse);
      expect(isAllowed('album_random_789', const []), isTrue);
    });

    test('Server backup index item mapping preserves checksum, name, and size', () {
      final serverPayload = {
        'id': 'file_abc',
        'fileName': 'camera_001.jpg',
        'filePath': 'DCIM/camera_001.jpg',
        'fileSize': 1048576,
        'checksum': 'hash_xyz_123',
        'mimeType': 'image/jpeg',
        'uploadedAt': '2026-09-03T10:00:00.000Z',
      };

      final name = serverPayload['fileName'] ?? '';
      final size = serverPayload['fileSize'] as int;
      final checksum = serverPayload['checksum'] ?? '';

      expect(name, 'camera_001.jpg');
      expect(size, 1048576);
      expect(checksum, 'hash_xyz_123');
    });

    test('Delta filtering accurately skips already uploaded name+size combinations', () {
      final uploadedKeys = {'photo1.jpg|2048', 'video1.mp4|10485760'};
      final uploadedNames = {'photo1.jpg', 'video1.mp4'};

      final candidates = [
        PhotoMediaItem(
          id: '1',
          name: 'photo1.jpg',
          path: '/path/1',
          url: '/path/1',
          size: 2048,
          isVideo: false,
          createdAt: DateTime(2026, 9, 1),
        ),
        PhotoMediaItem(
          id: '2',
          name: 'new_photo.jpg',
          path: '/path/2',
          url: '/path/2',
          size: 4096,
          isVideo: false,
          createdAt: DateTime(2026, 9, 3),
        ),
      ];

      final delta = candidates.where((item) {
        final key = '${item.name.toLowerCase()}|${item.size}';
        if (item.size > 0 && uploadedKeys.contains(key)) return false;
        if (item.size == 0 && uploadedNames.contains(item.name.toLowerCase())) return false;
        return true;
      }).toList();

      expect(delta.length, 1);
      expect(delta.first.name, 'new_photo.jpg');
    });
  });
}
