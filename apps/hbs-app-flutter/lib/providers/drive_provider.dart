import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/widgets/filter_sort_bar.dart';
import '../models/backup_file_item.dart';
import '../services/api_service.dart';

class DriveState {
  final bool isLoading;
  final String currentPath;
  final List<BackupFileItem> files;
  final String searchQuery;
  final SortByField sortBy;
  final SortOrder sortOrder;
  final bool isGridView;
  final String? errorMessage;

  const DriveState({
    this.isLoading = false,
    this.currentPath = '',
    this.files = const [],
    this.searchQuery = '',
    this.sortBy = SortByField.date,
    this.sortOrder = SortOrder.desc,
    this.isGridView = false,
    this.errorMessage,
  });

  List<BackupFileItem> get sortedAndFilteredFiles {
    var list = files;

    if (searchQuery.isNotEmpty) {
      final q = searchQuery.toLowerCase();
      list = list.where((f) => f.name.toLowerCase().contains(q)).toList();
    }

    list = List<BackupFileItem>.from(list);

    // Directories first
    list.sort((a, b) {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;

      int comp = 0;
      switch (sortBy) {
        case SortByField.name:
          comp = a.name.toLowerCase().compareTo(b.name.toLowerCase());
          break;
        case SortByField.size:
          comp = a.size.compareTo(b.size);
          break;
        case SortByField.date:
          final aDate = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
          final bDate = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
          comp = aDate.compareTo(bDate);
          break;
      }
      return sortOrder == SortOrder.asc ? comp : -comp;
    });

    return list;
  }

  DriveState copyWith({
    bool? isLoading,
    String? currentPath,
    List<BackupFileItem>? files,
    String? searchQuery,
    SortByField? sortBy,
    SortOrder? sortOrder,
    bool? isGridView,
    String? errorMessage,
  }) {
    return DriveState(
      isLoading: isLoading ?? this.isLoading,
      currentPath: currentPath ?? this.currentPath,
      files: files ?? this.files,
      searchQuery: searchQuery ?? this.searchQuery,
      sortBy: sortBy ?? this.sortBy,
      sortOrder: sortOrder ?? this.sortOrder,
      isGridView: isGridView ?? this.isGridView,
      errorMessage: errorMessage,
    );
  }
}

class DriveNotifier extends StateNotifier<DriveState> {
  DriveNotifier() : super(const DriveState()) {
    loadFiles();
  }

  String _parseError(dynamic e) {
    if (e is DioException) {
      final data = e.response?.data;
      if (data is Map && data['error'] != null) {
        return data['error'].toString();
      }
      if (e.message != null && e.message!.isNotEmpty) {
        return e.message!;
      }
    }
    return e.toString();
  }

  Future<void> loadFiles([String path = '']) async {
    state = state.copyWith(isLoading: true, currentPath: path, errorMessage: null);
    try {
      final res = await ApiService().getFiles(path: path);
      state = state.copyWith(
        isLoading: false,
        currentPath: res['currentPath']?.toString() ?? path,
        files: (res['files'] as List<BackupFileItem>?) ?? [],
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: _parseError(e),
      );
    }
  }

  Future<void> navigateToFolder(String folderNameOrPath) async {
    if (folderNameOrPath.startsWith('__share__/') ||
        (folderNameOrPath.contains('/') && !folderNameOrPath.startsWith('${state.currentPath}/'))) {
      await loadFiles(folderNameOrPath);
      return;
    }
    final nextPath = folderNameOrPath.contains('/')
        ? folderNameOrPath
        : (state.currentPath.isEmpty ? folderNameOrPath : '${state.currentPath}/$folderNameOrPath');
    await loadFiles(nextPath);
  }

  Future<void> navigateUp() async {
    if (state.currentPath.isEmpty) return;
    final parts = state.currentPath.split('/');
    if (parts.length <= 1) {
      await loadFiles('');
    } else {
      parts.removeLast();
      await loadFiles(parts.join('/'));
    }
  }

  Future<bool> createFolder(String folderName) async {
    try {
      await ApiService().createFolder(
        folderName: folderName,
        parentPath: state.currentPath,
      );
      await loadFiles(state.currentPath);
      return true;
    } catch (e) {
      state = state.copyWith(errorMessage: _parseError(e));
      return false;
    }
  }

  Future<bool> renameFile(String path, String newName) async {
    try {
      await ApiService().renameFile(path: path, newName: newName);
      await loadFiles(state.currentPath);
      return true;
    } catch (e) {
      state = state.copyWith(errorMessage: _parseError(e));
      return false;
    }
  }

  Future<bool> deleteFile(String fileId, {bool permanent = false}) async {
    try {
      await ApiService().deleteFile(fileId: fileId, permanent: permanent);
      await loadFiles(state.currentPath);
      return true;
    } catch (e) {
      state = state.copyWith(errorMessage: _parseError(e));
      return false;
    }
  }

  void toggleViewMode() {
    state = state.copyWith(isGridView: !state.isGridView);
  }

  void setSortBy(SortByField sort) {
    if (state.sortBy == sort) {
      state = state.copyWith(
        sortOrder: state.sortOrder == SortOrder.asc ? SortOrder.desc : SortOrder.asc,
      );
    } else {
      state = state.copyWith(sortBy: sort, sortOrder: SortOrder.desc);
    }
  }

  void setSearchQuery(String query) {
    state = state.copyWith(searchQuery: query);
  }
}

final driveProvider = StateNotifierProvider<DriveNotifier, DriveState>((ref) {
  return DriveNotifier();
});
