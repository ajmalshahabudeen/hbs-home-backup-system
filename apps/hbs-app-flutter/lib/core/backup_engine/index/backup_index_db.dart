import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import '../models/backup_item.dart';

export '../models/backup_item.dart';

class BackupIndexDb {
  static final BackupIndexDb _instance = BackupIndexDb._internal();
  factory BackupIndexDb() => _instance;
  BackupIndexDb._internal();

  Database? _db;

  Future<Database> get database async {
    if (_db != null) return _db!;
    _db = await _initDatabase();
    return _db!;
  }

  Future<Database> _initDatabase() async {
    final databasesPath = await getDatabasesPath();
    final path = join(databasesPath, 'hbs_backup_index.db');

    return await openDatabase(
      path,
      version: 3,
      onCreate: (db, version) async {
        await _createV1(db);
        await _createQueue(db);
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) await _createQueue(db);
        if (oldVersion < 3) await _addUploadId(db);
      },
    );
  }

  Future<void> _createV1(Database db) async {
    await db.execute('''
          CREATE TABLE IF NOT EXISTS backup_index (
            id TEXT PRIMARY KEY,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            checksum TEXT NOT NULL,
            mime_type TEXT,
            uploaded_at TEXT NOT NULL
          )
        ''');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_checksum ON backup_index (checksum)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_file_name_size ON backup_index (file_name, file_size)');
  }

  Future<void> _createQueue(Database db) async {
    await db.execute('''
          CREATE TABLE IF NOT EXISTS upload_queue (
            id TEXT PRIMARY KEY,
            asset_id TEXT,
            file_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            mime_type TEXT,
            parent_path TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            upload_id TEXT
          )
        ''');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_queue_status ON upload_queue (status)');
  }

  Future<void> _addUploadId(Database db) async {
    try {
      await db.execute('ALTER TABLE upload_queue ADD COLUMN upload_id TEXT');
    } catch (_) {}
  }

  Future<void> recordUploaded({
    required String id,
    required String fileName,
    required String filePath,
    required int fileSize,
    required String checksum,
    String? mimeType,
  }) async {
    final db = await database;
    await db.insert(
      'backup_index',
      {
        'id': id,
        'file_name': fileName,
        'file_path': filePath,
        'file_size': fileSize,
        'checksum': checksum,
        'mime_type': mimeType,
        'uploaded_at': DateTime.now().toIso8601String(),
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<bool> isLocallyUploaded({
    required String checksum,
    String? fileName,
    int? fileSize,
  }) async {
    final db = await database;
    if (checksum.isNotEmpty) {
      final res = await db.query(
        'backup_index',
        where: 'checksum = ?',
        whereArgs: [checksum],
        limit: 1,
      );
      if (res.isNotEmpty) return true;
    }

    if (fileName != null && fileSize != null && fileSize > 0) {
      final res = await db.query(
        'backup_index',
        where: 'file_name = ? AND file_size = ?',
        whereArgs: [fileName, fileSize],
        limit: 1,
      );
      if (res.isNotEmpty) return true;
    }

    return false;
  }

  Future<int> getIndexedCount() async {
    final db = await database;
    final res = await db.rawQuery('SELECT COUNT(*) as count FROM backup_index');
    return Sqflite.firstIntValue(res) ?? 0;
  }

  Future<({Set<String> nameSizeKeys, Set<String> names})> getUploadedKeys() async {
    final db = await database;
    final rows = await db.query('backup_index', columns: ['file_name', 'file_size']);
    final nameSize = <String>{};
    final names = <String>{};
    for (final row in rows) {
      final name = (row['file_name']?.toString() ?? '').trim().toLowerCase();
      final size = (row['file_size'] as num?)?.toInt() ?? 0;
      if (name.isEmpty) continue;
      names.add(name);
      nameSize.add('$name|$size');
    }
    return (nameSizeKeys: nameSize, names: names);
  }

  Future<void> clearAll() async {
    final db = await database;
    await db.delete('backup_index');
  }

  /// Bulk hydrate local SQLite index from server records (e.g., on reinstall or initial device link)
  Future<int> hydrateFromServer(List<Map<String, dynamic>> items) async {
    if (items.isEmpty) return 0;
    final db = await database;
    final batch = db.batch();
    int count = 0;

    for (final item in items) {
      final name = item['fileName'] ?? item['file_name'] ?? item['name'] ?? '';
      final path = item['filePath'] ?? item['file_path'] ?? item['path'] ?? name;
      final size = (item['fileSize'] ?? item['file_size'] ?? item['size'] as num?)?.toInt() ?? 0;
      final checksum = item['checksum']?.toString() ?? '';
      final mime = item['mimeType'] ?? item['mime_type'];
      final uploadedAt = item['uploadedAt'] ?? item['uploaded_at'] ?? DateTime.now().toIso8601String();
      final id = item['id']?.toString() ?? (checksum.isNotEmpty ? checksum : '$name|$size');

      if (name.toString().isEmpty) continue;

      batch.insert(
        'backup_index',
        {
          'id': id,
          'file_name': name,
          'file_path': path,
          'file_size': size,
          'checksum': checksum,
          'mime_type': mime,
          'uploaded_at': uploadedAt,
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
      count++;
    }

    await batch.commit(noResult: true);
    return count;
  }

  Future<List<IndexedBackupItem>> getAllIndexed() async {
    final db = await database;
    final rows = await db.query('backup_index');
    return rows.map((r) => IndexedBackupItem.fromMap(r)).toList();
  }

  Future<void> enqueueUpload({
    required String id,
    required String filePath,
    required String fileName,
    required int fileSize,
    String? assetId,
    String? mimeType,
    String parentPath = 'MobileBackups',
  }) async {
    final db = await database;
    await db.insert(
      'upload_queue',
      {
        'id': id,
        'asset_id': assetId,
        'file_path': filePath,
        'file_name': fileName,
        'file_size': fileSize,
        'mime_type': mimeType,
        'parent_path': parentPath,
        'status': 'pending',
        'created_at': DateTime.now().toIso8601String(),
      },
      conflictAlgorithm: ConflictAlgorithm.ignore,
    );
  }

  /// High-throughput batch insertion inside a single SQLite transaction
  Future<void> enqueueBatchUpload(List<Map<String, dynamic>> items) async {
    if (items.isEmpty) return;
    final db = await database;
    final batch = db.batch();
    final now = DateTime.now().toIso8601String();
    for (final item in items) {
      batch.insert(
        'upload_queue',
        {
          'id': item['id'],
          'asset_id': item['asset_id'],
          'file_path': item['file_path'] ?? '',
          'file_name': item['file_name'] ?? '',
          'file_size': item['file_size'] ?? 0,
          'mime_type': item['mime_type'],
          'parent_path': item['parent_path'] ?? 'MobileBackups',
          'status': 'pending',
          'created_at': now,
        },
        conflictAlgorithm: ConflictAlgorithm.ignore,
      );
    }
    await batch.commit(noResult: true);
  }

  Future<List<Map<String, dynamic>>> pendingUploads() async {
    final db = await database;
    return db.query('upload_queue', where: 'status = ?', whereArgs: ['pending'], orderBy: 'created_at ASC');
  }

  Future<void> saveUploadId(String id, String uploadId) async {
    final db = await database;
    await db.update('upload_queue', {'upload_id': uploadId}, where: 'id = ?', whereArgs: [id]);
  }

  Future<void> markQueueStatus(String id, String status) async {
    final db = await database;
    await db.update('upload_queue', {'status': status}, where: 'id = ?', whereArgs: [id]);
  }

  Future<void> updateQueueFileInfo({
    required String id,
    required String filePath,
    required int fileSize,
  }) async {
    final db = await database;
    await db.update(
      'upload_queue',
      {
        'file_path': filePath,
        'file_size': fileSize,
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> clearFinishedQueue() async {
    final db = await database;
    await db.delete('upload_queue', where: 'status IN (?, ?)', whereArgs: ['done', 'skipped']);
  }

  /// Completely empties the upload queue table (used on user logout or manual cancel)
  Future<void> clearQueue() async {
    final db = await database;
    await db.delete('upload_queue');
  }

  /// Deletes a specific item from the queue
  Future<void> deleteQueueItem(String id) async {
    final db = await database;
    await db.delete('upload_queue', where: 'id = ?', whereArgs: [id]);
  }

  /// Prunes pending queue items that do not belong to the allowed items list
  Future<void> prunePendingQueueNotIn(Set<String> validIds) async {
    final db = await database;
    if (validIds.isEmpty) {
      await db.delete('upload_queue', where: 'status = ?', whereArgs: ['pending']);
      return;
    }

    final placeholders = List.filled(validIds.length, '?').join(', ');
    await db.delete(
      'upload_queue',
      where: 'status = ? AND id NOT IN ($placeholders)',
      whereArgs: ['pending', ...validIds],
    );
  }

  Future<List<List<IndexedBackupItem>>> duplicateGroups() async {
    final db = await database;
    final rows = await db.query('backup_index', orderBy: 'checksum ASC, file_name ASC');
    final byHash = <String, List<IndexedBackupItem>>{};
    for (final row in rows) {
      final item = IndexedBackupItem.fromMap(row);
      if (item.checksum.isEmpty) continue;
      byHash.putIfAbsent(item.checksum, () => []).add(item);
    }
    return byHash.values.where((g) => g.length > 1).toList();
  }
}
