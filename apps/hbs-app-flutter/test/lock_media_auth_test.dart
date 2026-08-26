import 'package:flutter_test/flutter_test.dart';
import 'package:hbs_app_flutter/core/utils/formatters.dart';
import 'package:hbs_app_flutter/core/utils/media_merger.dart';
import 'package:hbs_app_flutter/core/utils/media_path_filter.dart';
import 'package:hbs_app_flutter/core/utils/pin_validator.dart';
import 'package:hbs_app_flutter/core/utils/vault_crypto.dart';
import 'package:hbs_app_flutter/models/photo_media_item.dart';
import 'package:hbs_app_flutter/models/saved_account.dart';
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
}
