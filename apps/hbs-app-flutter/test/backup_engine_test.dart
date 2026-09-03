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
