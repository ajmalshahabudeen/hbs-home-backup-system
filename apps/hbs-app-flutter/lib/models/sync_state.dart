class SyncState {
  final bool isSyncing;
  final int totalToSync;
  final int syncedCount;
  final int failedCount;
  final int skippedCount;
  final String? currentFileName;
  final String? syncStepMessage;
  final double currentFileProgress;
  final DateTime? lastSyncTime;

  const SyncState({
    this.isSyncing = false,
    this.totalToSync = 0,
    this.syncedCount = 0,
    this.failedCount = 0,
    this.skippedCount = 0,
    this.currentFileName,
    this.syncStepMessage,
    this.currentFileProgress = 0.0,
    this.lastSyncTime,
  });

  double get overallProgress {
    if (totalToSync <= 0) return 0.0;
    return (syncedCount + skippedCount) / totalToSync;
  }

  SyncState copyWith({
    bool? isSyncing,
    int? totalToSync,
    int? syncedCount,
    int? failedCount,
    int? skippedCount,
    String? currentFileName,
    String? syncStepMessage,
    double? currentFileProgress,
    DateTime? lastSyncTime,
  }) {
    return SyncState(
      isSyncing: isSyncing ?? this.isSyncing,
      totalToSync: totalToSync ?? this.totalToSync,
      syncedCount: syncedCount ?? this.syncedCount,
      failedCount: failedCount ?? this.failedCount,
      skippedCount: skippedCount ?? this.skippedCount,
      currentFileName: currentFileName ?? this.currentFileName,
      syncStepMessage: syncStepMessage ?? this.syncStepMessage,
      currentFileProgress: currentFileProgress ?? this.currentFileProgress,
      lastSyncTime: lastSyncTime ?? this.lastSyncTime,
    );
  }
}
