import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';

class IndexedBackupItem {
  final String id;
  final String fileName;
  final String filePath;
  final int fileSize;
  final String checksum;
  final String? mimeType;
  final String uploadedAt;

  const IndexedBackupItem({
    required this.id,
    required this.fileName,
    required this.filePath,
    required this.fileSize,
    required this.checksum,
    this.mimeType,
    required this.uploadedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'file_name': fileName,
      'file_path': filePath,
      'file_size': fileSize,
      'checksum': checksum,
      'mime_type': mimeType,
      'uploaded_at': uploadedAt,
    };
  }

  factory IndexedBackupItem.fromMap(Map<String, dynamic> map) {
    return IndexedBackupItem(
      id: map['id']?.toString() ?? '',
      fileName: map['file_name']?.toString() ?? '',
      filePath: map['file_path']?.toString() ?? '',
      fileSize: (map['file_size'] as num?)?.toInt() ?? 0,
      checksum: map['checksum']?.toString() ?? '',
      mimeType: map['mime_type']?.toString(),
      uploadedAt: map['uploaded_at']?.toString() ?? '',
    );
  }
}

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
      version: 1,
      onCreate: (db, version) async {
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
      },
    );
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

  Future<void> clearAll() async {
    final db = await database;
    await db.delete('backup_index');
  }
}
