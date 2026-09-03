import 'package:flutter_test/flutter_test.dart';
import 'package:hbs_app_flutter/models/backup_file_item.dart';
import 'package:hbs_app_flutter/providers/drive_provider.dart';
import 'package:hbs_app_flutter/services/drive_websocket_service.dart';

void main() {
  group('Drive Pagination & Realtime Tests', () {
    test('DriveChangeEvent.fromJson parses valid events', () {
      final json = {
        'action': 'upload',
        'path': 'Documents/Work',
        'file': {
          'id': 'file-123',
          'name': 'report.pdf',
          'size': 1024,
          'isDir': false,
        },
        'meta': {'uploader': 'test@example.com'},
        'timestamp': 1717000000000,
      };

      final event = DriveChangeEvent.fromJson(json);
      expect(event.action, equals('upload'));
      expect(event.path, equals('Documents/Work'));
      expect(event.file?['name'], equals('report.pdf'));
      expect(event.meta?['uploader'], equals('test@example.com'));
      expect(event.timestamp.millisecondsSinceEpoch, equals(1717000000000));
    });

    test('DriveChangeEvent.fromJson handles missing and fallback fields gracefully', () {
      final json = <String, dynamic>{};
      final event = DriveChangeEvent.fromJson(json);

      expect(event.action, equals('change'));
      expect(event.path, equals(''));
      expect(event.file, isNull);
      expect(event.meta, isNull);
      expect(event.timestamp, isNotNull);
    });

    test('DriveState initializes with correct pagination and realtime defaults', () {
      const state = DriveState();

      expect(state.isLoading, isFalse);
      expect(state.isLoadingMore, isFalse);
      expect(state.hasMore, isTrue);
      expect(state.currentOffset, equals(0));
      expect(state.totalFiles, equals(0));
      expect(state.pageSize, equals(60));
      expect(state.isRealtimeConnected, isFalse);
    });

    test('DriveState.copyWith updates pagination and realtime state accurately', () {
      const state = DriveState();

      final updated = state.copyWith(
        isLoadingMore: true,
        hasMore: false,
        currentOffset: 60,
        totalFiles: 140,
        isRealtimeConnected: true,
      );

      expect(updated.isLoadingMore, isTrue);
      expect(updated.hasMore, isFalse);
      expect(updated.currentOffset, equals(60));
      expect(updated.totalFiles, equals(140));
      expect(updated.isRealtimeConnected, isTrue);
    });

    test('DriveState deduplication logic prevents duplicate items on paginated append', () {
      final item1 = BackupFileItem(
        id: '1',
        userId: 'u1',
        name: 'file1.txt',
        path: 'file1.txt',
        parentPath: '',
        size: 100,
        isDir: false,
        mimeType: 'text/plain',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );
      final item2 = BackupFileItem(
        id: '2',
        userId: 'u1',
        name: 'file2.txt',
        path: 'file2.txt',
        parentPath: '',
        size: 200,
        isDir: false,
        mimeType: 'text/plain',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );
      final item3 = BackupFileItem(
        id: '3',
        userId: 'u1',
        name: 'file3.txt',
        path: 'file3.txt',
        parentPath: '',
        size: 300,
        isDir: false,
        mimeType: 'text/plain',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      final initialFiles = [item1, item2];
      final incomingPage = [item2, item3]; // item2 is duplicate

      final existingIds = initialFiles.map((f) => f.id).toSet();
      final deduplicated = incomingPage.where((f) => !existingIds.contains(f.id)).toList();
      final combined = [...initialFiles, ...deduplicated];

      expect(combined.length, equals(3));
      expect(combined.map((f) => f.id).toList(), equals(['1', '2', '3']));
    });
  });
}
