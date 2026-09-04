import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/utils/formatters.dart';
import '../core/widgets/filter_sort_bar.dart';
import '../models/backup_file_item.dart';
import '../services/api_service.dart';
import '../services/drive_websocket_service.dart';

enum DriveTypeFilter { all, folders, photos, videos, documents, audio, archives }

enum DriveDateFilter { all, today, last7Days, last30Days, thisYear }

enum DriveSizeFilter { all, small, medium, large }

enum DriveGroupBy { none, type, date, size }

class DriveState {
  final bool isLoading;
  final bool isLoadingMore;
  final bool hasMore;
  final int currentOffset;
  final int totalFiles;
  final int pageSize;
  final bool isRealtimeConnected;
  final String currentPath;
  final List<BackupFileItem> files;
  final String searchQuery;
  final SortByField sortBy;
  final SortOrder sortOrder;
  final bool isGridView;
  final Set<String> selectedFileIds;
  final DriveTypeFilter filterType;
  final DriveDateFilter filterDate;
  final DriveSizeFilter filterSize;
  final DriveGroupBy groupBy;
  final String? errorMessage;

  const DriveState({
    this.isLoading = false,
    this.isLoadingMore = false,
    this.hasMore = true,
    this.currentOffset = 0,
    this.totalFiles = 0,
    this.pageSize = 60,
    this.isRealtimeConnected = false,
    this.currentPath = '',
    this.files = const [],
    this.searchQuery = '',
    this.sortBy = SortByField.date,
    this.sortOrder = SortOrder.desc,
    this.isGridView = false,
    this.selectedFileIds = const {},
    this.filterType = DriveTypeFilter.all,
    this.filterDate = DriveDateFilter.all,
    this.filterSize = DriveSizeFilter.all,
    this.groupBy = DriveGroupBy.none,
    this.errorMessage,
  });

  bool get isSelectionMode => selectedFileIds.isNotEmpty;
  int get selectedCount => selectedFileIds.length;
  bool isSelected(String fileId) => selectedFileIds.contains(fileId);

  bool get hasActiveFilters =>
      filterType != DriveTypeFilter.all ||
      filterDate != DriveDateFilter.all ||
      filterSize != DriveSizeFilter.all ||
      groupBy != DriveGroupBy.none;

  List<BackupFileItem> get sortedAndFilteredFiles {
    var list = files;

    // Search query filter
    if (searchQuery.isNotEmpty) {
      final q = searchQuery.toLowerCase();
      list = list.where((f) => f.name.toLowerCase().contains(q)).toList();
    }

    // Type filter
    if (filterType != DriveTypeFilter.all) {
      list = list.where((f) {
        if (filterType == DriveTypeFilter.folders) return f.isDir;
        if (f.isDir) return false;
        final cat = Formatters.getMimeTypeCategory(f.mimeType, f.name);
        switch (filterType) {
          case DriveTypeFilter.photos:
            return cat == 'photo';
          case DriveTypeFilter.videos:
            return cat == 'video';
          case DriveTypeFilter.documents:
            return cat == 'document';
          case DriveTypeFilter.audio:
            return cat == 'audio';
          case DriveTypeFilter.archives:
            return cat == 'archive';
          default:
            return true;
        }
      }).toList();
    }

    // Date filter
    if (filterDate != DriveDateFilter.all) {
      final now = DateTime.now();
      list = list.where((f) {
        final d = f.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        switch (filterDate) {
          case DriveDateFilter.today:
            return d.year == now.year && d.month == now.month && d.day == now.day;
          case DriveDateFilter.last7Days:
            return now.difference(d).inDays <= 7;
          case DriveDateFilter.last30Days:
            return now.difference(d).inDays <= 30;
          case DriveDateFilter.thisYear:
            return d.year == now.year;
          default:
            return true;
        }
      }).toList();
    }

    // Size filter
    if (filterSize != DriveSizeFilter.all) {
      list = list.where((f) {
        if (f.isDir) return true;
        switch (filterSize) {
          case DriveSizeFilter.small:
            return f.size < 10 * 1024 * 1024;
          case DriveSizeFilter.medium:
            return f.size >= 10 * 1024 * 1024 && f.size <= 100 * 1024 * 1024;
          case DriveSizeFilter.large:
            return f.size > 100 * 1024 * 1024;
          default:
            return true;
        }
      }).toList();
    }

    list = List<BackupFileItem>.from(list);

    // Sort order
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

  Map<String, List<BackupFileItem>> get groupedFiles {
    final list = sortedAndFilteredFiles;
    if (groupBy == DriveGroupBy.none) {
      return {'': list};
    }

    final groups = <String, List<BackupFileItem>>{};

    if (groupBy == DriveGroupBy.type) {
      for (final f in list) {
        String groupName;
        if (f.isDir) {
          groupName = 'Folders';
        } else {
          final cat = Formatters.getMimeTypeCategory(f.mimeType, f.name);
          switch (cat) {
            case 'photo':
              groupName = 'Photos';
              break;
            case 'video':
              groupName = 'Videos';
              break;
            case 'audio':
              groupName = 'Audio';
              break;
            case 'document':
            case 'doc':
              groupName = 'Documents';
              break;
            case 'archive':
              groupName = 'Archives';
              break;
            default:
              groupName = 'Other Files';
              break;
          }
        }
        groups.putIfAbsent(groupName, () => []).add(f);
      }
    } else if (groupBy == DriveGroupBy.date) {
      final now = DateTime.now();
      for (final f in list) {
        final d = f.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        String groupName;
        final diffDays = now.difference(d).inDays;
        if (d.year == now.year && d.month == now.month && d.day == now.day) {
          groupName = 'Today';
        } else if (diffDays <= 1 && d.day == now.day - 1) {
          groupName = 'Yesterday';
        } else if (diffDays <= 7) {
          groupName = 'This Week';
        } else if (d.year == now.year && d.month == now.month) {
          groupName = 'This Month';
        } else if (d.year == now.year) {
          groupName = 'Earlier This Year';
        } else {
          groupName = '${d.year}';
        }
        groups.putIfAbsent(groupName, () => []).add(f);
      }
    } else if (groupBy == DriveGroupBy.size) {
      for (final f in list) {
        String groupName;
        if (f.isDir) {
          groupName = 'Folders';
        } else if (f.size > 100 * 1024 * 1024) {
          groupName = 'Large (> 100 MB)';
        } else if (f.size >= 10 * 1024 * 1024) {
          groupName = 'Medium (10 - 100 MB)';
        } else {
          groupName = 'Small (< 10 MB)';
        }
        groups.putIfAbsent(groupName, () => []).add(f);
      }
    }

    return groups;
  }

  DriveState copyWith({
    bool? isLoading,
    bool? isLoadingMore,
    bool? hasMore,
    int? currentOffset,
    int? totalFiles,
    int? pageSize,
    bool? isRealtimeConnected,
    String? currentPath,
    List<BackupFileItem>? files,
    String? searchQuery,
    SortByField? sortBy,
    SortOrder? sortOrder,
    bool? isGridView,
    Set<String>? selectedFileIds,
    DriveTypeFilter? filterType,
    DriveDateFilter? filterDate,
    DriveSizeFilter? filterSize,
    DriveGroupBy? groupBy,
    String? errorMessage,
  }) {
    return DriveState(
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      hasMore: hasMore ?? this.hasMore,
      currentOffset: currentOffset ?? this.currentOffset,
      totalFiles: totalFiles ?? this.totalFiles,
      pageSize: pageSize ?? this.pageSize,
      isRealtimeConnected: isRealtimeConnected ?? this.isRealtimeConnected,
      currentPath: currentPath ?? this.currentPath,
      files: files ?? this.files,
      searchQuery: searchQuery ?? this.searchQuery,
      sortBy: sortBy ?? this.sortBy,
      sortOrder: sortOrder ?? this.sortOrder,
      isGridView: isGridView ?? this.isGridView,
      selectedFileIds: selectedFileIds ?? this.selectedFileIds,
      filterType: filterType ?? this.filterType,
      filterDate: filterDate ?? this.filterDate,
      filterSize: filterSize ?? this.filterSize,
      groupBy: groupBy ?? this.groupBy,
      errorMessage: errorMessage,
    );
  }
}

class DriveNotifier extends StateNotifier<DriveState> {
  StreamSubscription<DriveChangeEvent>? _wsSubscription;
  Timer? _fallbackPollTimer;

  DriveNotifier() : super(const DriveState()) {
    loadFiles();
    _subscribeWebSocket();
  }

  void _subscribeWebSocket() {
    _wsSubscription?.cancel();
    _wsSubscription = DriveWebSocketService().changeStream.listen((event) {
      _handleWsDriveChange(event);
    });

    DriveWebSocketService().isConnected.removeListener(_onWsConnectionChanged);
    DriveWebSocketService().isConnected.addListener(_onWsConnectionChanged);
    _onWsConnectionChanged();
  }

  void _onWsConnectionChanged() {
    final connected = DriveWebSocketService().isConnected.value;
    state = state.copyWith(isRealtimeConnected: connected);
    if (connected) {
      _stopFallbackPolling();
    } else {
      _startFallbackPolling();
    }
  }

  void _startFallbackPolling() {
    _fallbackPollTimer?.cancel();
    _fallbackPollTimer = Timer.periodic(const Duration(seconds: 15), (timer) {
      if (!state.isLoading && !state.isLoadingMore) {
        loadFiles(state.currentPath, true);
      }
    });
  }

  void _stopFallbackPolling() {
    _fallbackPollTimer?.cancel();
    _fallbackPollTimer = null;
  }

  void _handleWsDriveChange(DriveChangeEvent event) {
    final current = state.currentPath.trim().replaceAll(RegExp(r'^/+|/+$'), '');
    final eventFolder = event.path.trim().replaceAll(RegExp(r'^/+|/+$'), '');

    if (current == eventFolder || (current.isEmpty && eventFolder.isEmpty)) {
      // Refresh current folder without blanking out UI
      loadFiles(state.currentPath, true);
    }
  }

  @override
  void dispose() {
    _wsSubscription?.cancel();
    _stopFallbackPolling();
    DriveWebSocketService().isConnected.removeListener(_onWsConnectionChanged);
    super.dispose();
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

  Future<void> loadFiles([String path = '', bool refreshSilently = false]) async {
    if (!refreshSilently) {
      state = state.copyWith(
        isLoading: true,
        currentPath: path,
        errorMessage: null,
        selectedFileIds: {},
        currentOffset: 0,
        hasMore: true,
        isLoadingMore: false,
      );
    }
    try {
      final res = await ApiService().getFiles(
        path: path,
        limit: state.pageSize,
        offset: 0,
      );
      final rawList = (res['files'] as List<BackupFileItem>?) ?? [];
      final total = res['total'] is int ? res['total'] as int : rawList.length;
      final hasMore = res['hasMore'] is bool ? res['hasMore'] as bool : (rawList.length < total);

      state = state.copyWith(
        isLoading: false,
        currentPath: res['currentPath']?.toString() ?? path,
        files: rawList,
        totalFiles: total,
        currentOffset: rawList.length,
        hasMore: hasMore,
        isLoadingMore: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        isLoadingMore: false,
        errorMessage: _parseError(e),
      );
    }
  }

  Future<void> loadMoreFiles() async {
    if (state.isLoading || state.isLoadingMore || !state.hasMore) return;

    state = state.copyWith(isLoadingMore: true);
    try {
      final res = await ApiService().getFiles(
        path: state.currentPath,
        limit: state.pageSize,
        offset: state.currentOffset,
      );
      final newItems = (res['files'] as List<BackupFileItem>?) ?? [];
      final total = res['total'] is int ? res['total'] as int : state.totalFiles;

      if (newItems.isEmpty) {
        state = state.copyWith(
          isLoadingMore: false,
          hasMore: false,
        );
        return;
      }

      // Deduplicate new items by id against existing files
      final existingIds = state.files.map((f) => f.id).toSet();
      final deduplicatedNew = newItems.where((f) => !existingIds.contains(f.id)).toList();

      final combinedFiles = [...state.files, ...deduplicatedNew];
      final newOffset = state.currentOffset + newItems.length;
      final hasMore = res['hasMore'] is bool
          ? res['hasMore'] as bool
          : (newOffset < total);

      state = state.copyWith(
        isLoadingMore: false,
        files: combinedFiles,
        totalFiles: total,
        currentOffset: newOffset,
        hasMore: hasMore,
      );
    } catch (e) {
      state = state.copyWith(
        isLoadingMore: false,
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
    final path = state.currentPath.trim().replaceAll(RegExp(r'^/+|/+$'), '');
    if (path.isEmpty) return;
    final parts = path.split('/');
    if (parts.length <= 1) {
      await loadFiles('');
    } else {
      parts.removeLast();
      await loadFiles(parts.join('/'));
    }
  }

  // Selection methods
  void toggleSelection(String fileId) {
    final newSet = Set<String>.from(state.selectedFileIds);
    if (newSet.contains(fileId)) {
      newSet.remove(fileId);
    } else {
      newSet.add(fileId);
    }
    state = state.copyWith(selectedFileIds: newSet);
  }

  void selectItem(String fileId) {
    if (!state.selectedFileIds.contains(fileId)) {
      state = state.copyWith(selectedFileIds: {...state.selectedFileIds, fileId});
    }
  }

  void selectAll() {
    final allIds = state.sortedAndFilteredFiles.map((f) => f.id).toSet();
    state = state.copyWith(selectedFileIds: allIds);
  }

  void clearSelection() {
    if (state.selectedFileIds.isNotEmpty) {
      state = state.copyWith(selectedFileIds: {});
    }
  }

  // Filter and Grouping Setters
  void setFilterType(DriveTypeFilter filter) {
    state = state.copyWith(filterType: filter);
  }

  void setFilterDate(DriveDateFilter filter) {
    state = state.copyWith(filterDate: filter);
  }

  void setFilterSize(DriveSizeFilter filter) {
    state = state.copyWith(filterSize: filter);
  }

  void setGroupBy(DriveGroupBy group) {
    state = state.copyWith(groupBy: group);
  }

  void resetFilters() {
    state = state.copyWith(
      filterType: DriveTypeFilter.all,
      filterDate: DriveDateFilter.all,
      filterSize: DriveSizeFilter.all,
      groupBy: DriveGroupBy.none,
    );
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

  // Batch operations
  Future<bool> batchMove(List<String> fileIds, String destinationPath) async {
    try {
      state = state.copyWith(isLoading: true, errorMessage: null);
      await ApiService().batchFileAction(
        action: 'move',
        fileIds: fileIds,
        destinationPath: destinationPath,
      );
      await loadFiles(state.currentPath);
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, errorMessage: _parseError(e));
      return false;
    }
  }

  Future<bool> batchCopy(List<String> fileIds, String destinationPath) async {
    try {
      state = state.copyWith(isLoading: true, errorMessage: null);
      await ApiService().batchFileAction(
        action: 'copy',
        fileIds: fileIds,
        destinationPath: destinationPath,
      );
      await loadFiles(state.currentPath);
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, errorMessage: _parseError(e));
      return false;
    }
  }

  Future<bool> batchDelete(List<String> fileIds, {bool permanent = false}) async {
    try {
      state = state.copyWith(isLoading: true, errorMessage: null);
      await ApiService().batchFileAction(
        action: 'delete',
        fileIds: fileIds,
        permanent: permanent,
      );
      await loadFiles(state.currentPath);
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, errorMessage: _parseError(e));
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
