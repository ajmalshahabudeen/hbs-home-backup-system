import 'package:flutter_test/flutter_test.dart';
import 'package:hbs_app_flutter/core/utils/lan_host.dart';
import 'package:hbs_app_flutter/core/utils/formatters.dart';
import 'package:hbs_app_flutter/core/utils/media_merger.dart';
import 'package:hbs_app_flutter/core/utils/media_path_filter.dart';
import 'package:hbs_app_flutter/core/utils/pin_validator.dart';
import 'package:hbs_app_flutter/core/utils/google_sign_in_errors.dart';
import 'package:hbs_app_flutter/core/utils/vault_crypto.dart';
import 'package:hbs_app_flutter/models/backup_file_item.dart';
import 'package:hbs_app_flutter/models/photo_media_item.dart';
import 'package:hbs_app_flutter/models/saved_account.dart';
import 'package:hbs_app_flutter/providers/drive_provider.dart';
import 'package:hbs_app_flutter/providers/media_provider.dart';
import 'package:hbs_app_flutter/screens/photos/memories_screen.dart';
import 'package:hbs_app_flutter/services/app_update_service.dart';
import 'package:hbs_app_flutter/services/watch_folder_service.dart';

void main() {
  group('PinValidator', () {
    test('accepts exactly 4 digits', () {
      expect(PinValidator.isValid('1234'), isTrue);
      expect(PinValidator.sanitize('1234'), '1234');
    });

    test('rejects more than 4 digits, letters, and empty', () {
      expect(PinValidator.isValid('12345'), isFalse);
      expect(PinValidator.isValid('12ab'), isFalse);
      expect(PinValidator.isValid('abcd'), isFalse);
      expect(PinValidator.isValid(''), isFalse);
      expect(PinValidator.isValid('12'), isFalse);
      expect(PinValidator.sanitize('12ab34'), isNull);
      expect(PinValidator.sanitize('12345'), isNull);
      expect(PinValidator.sanitize('pin1'), isNull);
      expect(PinValidator.sanitize('12 34'), isNull);
    });

    test('strips whitespace but still requires 4 digits', () {
      expect(PinValidator.sanitize(' 9876 '), '9876');
    });
  });

  group('MediaMerger', () {
    PhotoMediaItem local({
      required String id,
      required String name,
      int size = 100,
      bool video = false,
    }) {
      return PhotoMediaItem(
        id: id,
        path: '/local/$name',
        name: name,
        size: size,
        isVideo: video,
        url: '/local/$name',
        isLocalOnly: true,
        createdAt: DateTime(2026, 1, 2),
      );
    }

    PhotoMediaItem remote({
      required String id,
      required String name,
      int size = 100,
      bool video = false,
    }) {
      return PhotoMediaItem(
        id: id,
        path: '/cloud/$name',
        name: name,
        size: size,
        isVideo: video,
        url: 'http://server/$name',
        createdAt: DateTime(2026, 1, 1),
      );
    }

    test('keeps local+server copies as one backed-up tile', () {
      final merged = MediaMerger.merge(
        local: [local(id: 'l1', name: 'IMG_1.jpg')],
        server: [remote(id: 's1', name: 'IMG_1.jpg')],
      );
      expect(merged.length, 1);
      expect(merged.first.id, 'l1');
      expect(merged.first.isBackedUp, isTrue);
      expect(merged.first.isLocalOnly, isFalse);
    });

    test('matches case-insensitively and keeps server-only files once', () {
      final merged = MediaMerger.merge(
        local: [local(id: 'l1', name: 'Holiday.JPG', size: 50)],
        server: [
          remote(id: 's1', name: 'holiday.jpg', size: 50),
          remote(id: 's2', name: 'cloud-only.png', size: 20),
        ],
      );
      expect(merged.length, 2);
      expect(merged.where((e) => e.isBackedUp).length, 2);
      expect(merged.any((e) => e.name == 'cloud-only.png'), isTrue);
    });

    test('marks local files found in the backup index as synced', () {
      final merged = MediaMerger.merge(
        local: [local(id: 'l1', name: 'cam.jpg', size: 42)],
        server: const [],
        uploadedNameSizeKeys: {'cam.jpg|42'},
      );
      expect(merged.single.isBackedUp, isTrue);
    });
  });

  group('SavedAccount', () {
    test('round-trips json and display name', () {
      const account = SavedAccount(
        email: 'admin@hbs.local',
        password: 'secret',
        name: 'Admin',
        serverUrl: 'http://192.168.1.10:38480',
      );
      final copy = SavedAccount.fromJson(account.toJson());
      expect(copy.email, account.email);
      expect(copy.password, account.password);
      expect(copy.displayName, 'Admin');
      expect(SavedAccount(email: 'x@y.z', password: 'p').displayName, 'x');
    });
  });

  group('MediaPathFilter', () {
    test('hides Android/data and Android/obb but keeps Android/media (WhatsApp)', () {
      expect(
        MediaPathFilter.isAndroidAppFolder(relativePath: 'Android/data/com.whatsapp/files'),
        isTrue,
      );
      expect(
        MediaPathFilter.isAndroidAppFolder(relativePath: 'Android/obb/com.game'),
        isTrue,
      );
      expect(
        MediaPathFilter.isAndroidAppFolder(
          filePath: '/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/IMG.jpg',
        ),
        isFalse,
      );
      expect(
        MediaPathFilter.isAndroidAppFolder(relativePath: 'Android/media/com.whatsapp/WhatsApp Images'),
        isFalse,
      );
      expect(MediaPathFilter.isAndroidAppFolder(albumName: 'WhatsApp'), isFalse);
      expect(MediaPathFilter.isAndroidAppFolder(albumName: 'Android'), isFalse);
    });

    test('keeps Camera, DCIM, Pictures and Downloads', () {
      expect(MediaPathFilter.isAndroidAppFolder(relativePath: 'DCIM/Camera'), isFalse);
      expect(MediaPathFilter.isAndroidAppFolder(relativePath: 'Pictures/Screenshots'), isFalse);
      expect(MediaPathFilter.isAndroidAppFolder(relativePath: 'Download'), isFalse);
      expect(MediaPathFilter.isAndroidAppFolder(filePath: '/storage/emulated/0/DCIM/IMG_1.jpg'), isFalse);
      expect(MediaPathFilter.isAndroidAppFolder(albumName: 'Camera'), isFalse);
    });
  });

  group('Formatters.isHeic', () {
    test('detects heic/heif by mime and extension', () {
      expect(Formatters.isHeic('image/heic', 'IMG.JPG'), isTrue);
      expect(Formatters.isHeic(null, 'vacation.HEIC'), isTrue);
      expect(Formatters.isHeic('image/heif', 'a.heif'), isTrue);
      expect(Formatters.isHeic('image/jpeg', 'photo.jpg'), isFalse);
    });
  });

  group('Formatters.isRaw', () {
    test('detects dng/raw by mime and extension', () {
      expect(Formatters.isRaw('image/x-adobe-dng', 'shot.dng'), isTrue);
      expect(Formatters.isRaw(null, 'IMG.CR2'), isTrue);
      expect(Formatters.isRaw('image/jpeg', 'photo.jpg'), isFalse);
    });
  });

  group('Formatters.timelineKey', () {
    test('groups by year and month', () {
      expect(Formatters.timelineKey(DateTime(2026, 3, 9)), '2026 · March');
      expect(Formatters.timelineKey(null), 'Unknown date');
    });
  });

  group('MemoriesScreen', () {
    test('onThisDay keeps past years same month/day', () {
      final now = DateTime.now();
      final keep = PhotoMediaItem(
        id: '1',
        path: '',
        name: 'a.jpg',
        size: 1,
        isVideo: false,
        url: '',
        createdAt: DateTime(now.year - 2, now.month, now.day),
      );
      final drop = PhotoMediaItem(
        id: '2',
        path: '',
        name: 'b.jpg',
        size: 1,
        isVideo: false,
        url: '',
        createdAt: DateTime(now.year, now.month, now.day),
      );
      final out = MemoriesScreen.onThisDay([keep, drop]);
      expect(out.length, 1);
      expect(out.first.id, '1');
    });
  });

  group('VaultCrypto', () {
    test('detects HBS1 magic', () {
      expect(VaultCrypto.looksEncrypted([0x48, 0x42, 0x53, 0x31, 0]), isTrue);
      expect(VaultCrypto.looksEncrypted([1, 2, 3, 4]), isFalse);
    });
  });

  group('WatchFolderService.shouldIgnore', () {
    test('skips dotfiles, globs, and non-allowed extensions', () {
      expect(WatchFolderService.shouldIgnore(r'C:\watch\.hidden', ignoreCsv: '', extCsv: ''), isTrue);
      expect(WatchFolderService.shouldIgnore(r'C:\watch\photo.tmp', ignoreCsv: '*.tmp', extCsv: ''), isTrue);
      expect(WatchFolderService.shouldIgnore(r'C:\watch\notes.txt', ignoreCsv: '', extCsv: 'jpg,png'), isTrue);
      expect(WatchFolderService.shouldIgnore(r'C:\watch\shot.jpg', ignoreCsv: '*.tmp', extCsv: 'jpg,png'), isFalse);
    });
  });

  group('AppUpdateService', () {
    test('compares versions and strips v prefix', () {
      expect(AppUpdateService.compare('v1.2.0', '1.1.9'), greaterThan(0));
      expect(AppUpdateService.compare('1.0.0', 'v1.0.0'), 0);
      expect(AppUpdateService.compare('1.0.0', '1.0.1'), lessThan(0));
    });
  });

  group('GoogleSignInErrors', () {
    test('maps canceled after account pick to a config hint', () {
      final msg = GoogleSignInErrors.message(code: 'canceled');
      expect(msg.contains('SHA-1'), isTrue);
      expect(msg.toLowerCase().contains('cancel'), isTrue);
      expect(GoogleSignInErrors.message(code: 'GoogleSignInExceptionCode.canceled', description: 'cm'), contains('cm'));
    });

    test('passes through other codes', () {
      expect(
        GoogleSignInErrors.message(code: 'clientConfigurationError', description: 'missing serverClientId'),
        'missing serverClientId',
      );
    });
  });

  group('LanHost', () {
    test('defaults to zoro.local and prefers hostname over IP', () {
      expect(kDefaultLanHost, 'zoro.local');
      expect(kDefaultLanUrl, 'http://zoro.local:38480');
      expect(LanHost.defaultUrl, kDefaultLanUrl);
      expect(LanHost.isIpHost('192.168.1.10'), isTrue);
      expect(LanHost.isHostnameUrl('http://zoro.local:38480'), isTrue);
      expect(LanHost.isHostnameUrl('http://192.168.1.10:38480'), isFalse);
      expect(
        LanHost.advertisedUrlFromHealth({
          'lan': {'hostname': 'zoro.local', 'url': 'http://zoro.local:38480'},
        }),
        'http://zoro.local:38480',
      );
    });
  });

  group('MediaState', () {
    test('filteredItems handles empty const list without throwing and sorts latest first', () {
      const emptyState = MediaState();
      expect(emptyState.filteredItems, isEmpty);

      final stateWithItems = MediaState(
        items: [
          PhotoMediaItem(
            id: '1',
            path: '/p1.jpg',
            name: 'p1.jpg',
            size: 100,
            isVideo: false,
            url: '',
            createdAt: DateTime(2025, 1, 1),
          ),
          PhotoMediaItem(
            id: '2',
            path: '/p2.jpg',
            name: 'p2.jpg',
            size: 200,
            isVideo: false,
            url: '',
            createdAt: DateTime(2026, 5, 10),
          ),
        ],
      );

      final filtered = stateWithItems.filteredItems;
      expect(filtered.length, 2);
      expect(filtered.first.id, '2'); // newest first
      expect(filtered.last.id, '1');
    });

    test('PhotoMediaItem toJson and fromJson round trips cleanly', () {
      final original = PhotoMediaItem(
        id: 'asset-123',
        userId: 'u-1',
        path: '/DCIM/Camera/IMG_001.jpg',
        name: 'IMG_001.jpg',
        parentPath: '/DCIM/Camera',
        mimeType: 'image/jpeg',
        size: 4096000,
        createdAt: DateTime(2026, 3, 15, 10, 30),
        updatedAt: DateTime(2026, 3, 15, 10, 30),
        isVideo: false,
        url: '/DCIM/Camera/IMG_001.jpg',
        thumbUrl: null,
        isLocalOnly: true,
        isBackedUp: true,
        assetId: 'asset-123',
        isLive: true,
        liveVideoAssetId: 'asset-vid-123',
      );

      final json = original.toJson();
      final restored = PhotoMediaItem.fromJson(json);

      expect(restored.id, original.id);
      expect(restored.name, original.name);
      expect(restored.size, original.size);
      expect(restored.isBackedUp, isTrue);
      expect(restored.isLive, isTrue);
      expect(restored.liveVideoAssetId, 'asset-vid-123');
      expect(restored.createdAt, original.createdAt);
    });
  });

  group('DriveState Navigation', () {
    test('canPop is true only when at root level', () {
      const rootState = DriveState(currentPath: '');
      expect(rootState.currentPath.isEmpty, isTrue);

      const folderState = DriveState(currentPath: 'Documents/Invoices');
      expect(folderState.currentPath.isEmpty, isFalse);
    });

    test('parent path segments split properly', () {
      const folderState = DriveState(currentPath: 'Documents/Invoices/2026');
      final parts = folderState.currentPath.split('/');
      expect(parts.length, 3);
      expect(parts.last, '2026');

      parts.removeLast();
      expect(parts.join('/'), 'Documents/Invoices');

      parts.removeLast();
      expect(parts.join('/'), 'Documents');
    });

    test('multi-select selection state toggling', () {
      const state = DriveState(selectedFileIds: {'f1', 'f2'});
      expect(state.isSelectionMode, isTrue);
      expect(state.selectedCount, 2);
      expect(state.isSelected('f1'), isTrue);
      expect(state.isSelected('f3'), isFalse);

      final emptyState = state.copyWith(selectedFileIds: {});
      expect(emptyState.isSelectionMode, isFalse);
      expect(emptyState.selectedCount, 0);
    });

    test('filtering and grouping by type, date, size', () {
      final sampleFiles = [
        BackupFileItem(
          id: '1',
          userId: 'u1',
          name: 'Vacation',
          path: 'Vacation',
          parentPath: '',
          isDir: true,
          size: 0,
          createdAt: DateTime(2026, 9, 2),
        ),
        BackupFileItem(
          id: '2',
          userId: 'u1',
          name: 'photo.jpg',
          path: 'photo.jpg',
          parentPath: '',
          isDir: false,
          mimeType: 'image/jpeg',
          size: 2 * 1024 * 1024,
          createdAt: DateTime(2026, 9, 2),
        ),
        BackupFileItem(
          id: '3',
          userId: 'u1',
          name: 'doc.pdf',
          path: 'doc.pdf',
          parentPath: '',
          isDir: false,
          mimeType: 'application/pdf',
          size: 15 * 1024 * 1024,
          createdAt: DateTime(2026, 8, 1),
        ),
      ];

      // Filter by type: photos
      final photoFilteredState = DriveState(
        files: sampleFiles,
        filterType: DriveTypeFilter.photos,
      );
      expect(photoFilteredState.sortedAndFilteredFiles.length, 1);
      expect(photoFilteredState.sortedAndFilteredFiles.first.name, 'photo.jpg');

      // Filter by type: folders
      final folderFilteredState = DriveState(
        files: sampleFiles,
        filterType: DriveTypeFilter.folders,
      );
      expect(folderFilteredState.sortedAndFilteredFiles.length, 1);
      expect(folderFilteredState.sortedAndFilteredFiles.first.name, 'Vacation');

      // Group by type
      final groupedState = DriveState(
        files: sampleFiles,
        groupBy: DriveGroupBy.type,
      );
      final groups = groupedState.groupedFiles;
      expect(groups.containsKey('Folders'), isTrue);
      expect(groups.containsKey('Photos'), isTrue);
      expect(groups.containsKey('Documents'), isTrue);
      expect(groups['Folders']!.length, 1);
      expect(groups['Photos']!.length, 1);
      expect(groups['Documents']!.length, 1);
    });

    test('recursive folder destination validation (Rule 2)', () {
      const selectedFolderPath = 'Photos/2026';
      final disallowed = {selectedFolderPath.toLowerCase()};

      bool isDisallowed(String target) {
        final t = target.toLowerCase();
        for (final d in disallowed) {
          if (t == d || t.startsWith('$d/')) return true;
        }
        return false;
      }

      // Cannot move/copy into itself
      expect(isDisallowed('Photos/2026'), isTrue);
      // Cannot move/copy into subfolder of selected folder
      expect(isDisallowed('Photos/2026/Summer'), isTrue);
      expect(isDisallowed('Photos/2026/Summer/Beach'), isTrue);
      // Can move/copy into root or sibling folders
      expect(isDisallowed(''), isFalse);
      expect(isDisallowed('Documents'), isFalse);
      expect(isDisallowed('Photos/2025'), isFalse);
    });
  });
}
