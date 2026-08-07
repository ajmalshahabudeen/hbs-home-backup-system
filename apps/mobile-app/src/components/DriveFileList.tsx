import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../context/ThemeContext';
import { BackupFileItem } from '../services/api';
import {
  FilterSortBar,
  SortField,
  SortOrder,
  GroupByOption,
} from './FilterSortBar';
import { InputDialogModal } from './InputDialogModal';

interface DriveFileListProps {
  files: BackupFileItem[];
  currentPath: string;
  onNavigatePath: (path: string) => void;
  onOpenFile: (file: BackupFileItem) => void;
  onRenameFile: (file: BackupFileItem, newName: string) => void;
  onDeleteFile: (file: BackupFileItem) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

interface FileGroup {
  title: string;
  data: BackupFileItem[];
}

export const DriveFileList: React.FC<DriveFileListProps> = ({
  files,
  currentPath,
  onNavigatePath,
  onOpenFile,
  onRenameFile,
  onDeleteFile,
  onRefresh,
  refreshing = false,
}) => {
  const { colors } = useAppTheme();
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Search, Sort, Filter, Group state
  const [search, setSearch] = useState<string>('');
  const [category, setCategory] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [groupBy, setGroupBy] = useState<GroupByOption>('none');

  // Breadcrumbs
  const pathParts = currentPath ? currentPath.split('/') : [];

  const navigateToBreadcrumb = (index: number) => {
    if (index < 0) {
      onNavigatePath('');
    } else {
      const target = pathParts.slice(0, index + 1).join('/');
      onNavigatePath(target);
    }
  };

  // Filter items
  const filteredFiles = files.filter((f) => {
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (category === 'all') return true;
    if (category === 'image') return f.mimeType?.startsWith('image/');
    if (category === 'video') return f.mimeType?.startsWith('video/');
    if (category === 'audio') return f.mimeType?.startsWith('audio/');
    if (category === 'document')
      return (
        f.mimeType?.includes('pdf') ||
        f.mimeType?.includes('text') ||
        f.mimeType?.includes('document') ||
        f.mimeType?.includes('json')
      );
    return true;
  });

  // Sort items (folders first, then sorted by sortField/order)
  const sortedFiles = [...filteredFiles].sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;

    let cmp = 0;
    if (sortField === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else if (sortField === 'date') {
      cmp = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    } else if (sortField === 'size') {
      cmp = b.size - a.size;
    }
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  // Group items
  const groupFiles = (items: BackupFileItem[]): FileGroup[] => {
    if (groupBy === 'none') {
      return [{ title: '', data: items }];
    }

    const groups: Record<string, BackupFileItem[]> = {};

    items.forEach((item) => {
      let groupKey = 'Files';
      if (item.isDir) {
        groupKey = 'Folders';
      } else if (groupBy === 'category') {
        const mime = item.mimeType || '';
        if (mime.startsWith('image/')) groupKey = 'Images';
        else if (mime.startsWith('video/')) groupKey = 'Videos';
        else if (mime.startsWith('audio/')) groupKey = 'Audio';
        else groupKey = 'Documents & Files';
      }

      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(item);
    });

    return Object.keys(groups).map((title) => ({
      title,
      data: groups[title],
    }));
  };

  const fileGroups = groupFiles(sortedFiles);

  const getFileIcon = (file: BackupFileItem) => {
    if (file.isDir) return { name: 'folder', color: '#F9AB00' };
    const mime = file.mimeType || '';
    if (mime.startsWith('image/')) return { name: 'image', color: '#1A73E8' };
    if (mime.startsWith('video/')) return { name: 'film', color: '#D93025' };
    if (mime.startsWith('audio/')) return { name: 'musical-notes', color: '#A142F4' };
    if (mime.includes('pdf') || mime.includes('document'))
      return { name: 'document-text', color: '#188038' };
    return { name: 'document', color: colors.icon };
  };

  const [renameTarget, setRenameTarget] = useState<BackupFileItem | null>(null);

  const promptRename = (file: BackupFileItem) => {
    setRenameTarget(file);
  };

  const promptDelete = (file: BackupFileItem) => {
    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete ${file.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDeleteFile(file),
        },
      ]
    );
  };

  const renderFileItem = ({ item }: { item: BackupFileItem }) => {
    const iconInfo = getFileIcon(item);
    const sizeMb = item.isDir ? '' : (item.size / (1024 * 1024)).toFixed(2) + ' MB';

    if (viewMode === 'grid') {
      return (
        <TouchableOpacity
          style={[
            styles.gridCard,
            { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
          ]}
          onPress={() => (item.isDir ? onNavigatePath(item.path) : onOpenFile(item))}
          onLongPress={() => promptRename(item)}
        >
          <Ionicons name={iconInfo.name as any} size={36} color={iconInfo.color} />
          <Text style={[styles.gridName, { color: colors.text }]} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={[styles.gridMeta, { color: colors.textSecondary }]}>
            {item.isDir ? 'Folder' : sizeMb}
          </Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={[
          styles.listRow,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
        onPress={() => (item.isDir ? onNavigatePath(item.path) : onOpenFile(item))}
        onLongPress={() => promptRename(item)}
      >
        <View style={[styles.iconWrapper, { backgroundColor: iconInfo.color + '15' }]}>
          <Ionicons name={iconInfo.name as any} size={22} color={iconInfo.color} />
        </View>

        <View style={styles.listDetails}>
          <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.fileMeta, { color: colors.textSecondary }]}>
            {item.isDir ? 'Folder' : `${sizeMb} • ${new Date(item.createdAt).toLocaleDateString()}`}
          </Text>
        </View>

        <TouchableOpacity style={styles.actionBtn} onPress={() => promptDelete(item)}>
          <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search, Sort, Filter, Group Control Bar */}
      <FilterSortBar
        searchQuery={search}
        onSearchChange={setSearch}
        selectedCategory={category}
        onCategorySelect={setCategory}
        sortField={sortField}
        sortOrder={sortOrder}
        onSortChange={(f, o) => {
          setSortField(f);
          setSortOrder(o);
        }}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
      />

      {/* Breadcrumb Path & View Mode Toggle Header */}
      <View style={styles.pathHeader}>
        <View style={styles.breadcrumbs}>
          <TouchableOpacity onPress={() => navigateToBreadcrumb(-1)}>
            <Text style={[styles.breadcrumbText, { color: colors.primary }]}>My Drive</Text>
          </TouchableOpacity>

          {pathParts.map((part, index) => (
            <React.Fragment key={index}>
              <Text style={{ color: colors.textSecondary, marginHorizontal: 4 }}>/</Text>
              <TouchableOpacity onPress={() => navigateToBreadcrumb(index)}>
                <Text
                  style={[
                    styles.breadcrumbText,
                    {
                      color: index === pathParts.length - 1 ? colors.text : colors.primary,
                      fontWeight: index === pathParts.length - 1 ? '700' : '400',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {part}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.viewModeBtn, { backgroundColor: colors.surfaceVariant }]}
          onPress={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
        >
          <Ionicons
            name={viewMode === 'list' ? 'grid-outline' : 'list-outline'}
            size={18}
            color={colors.text}
          />
        </TouchableOpacity>
      </View>

      {/* File List / Grid */}
      <FlatList
        data={fileGroups}
        keyExtractor={(item, idx) => item.title || `file_group_${idx}`}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={{ paddingBottom: 100 }}
        renderItem={({ item: group }) => (
          <View style={styles.groupSection}>
            {group.title ? (
              <Text style={[styles.groupTitle, { color: colors.text }]}>
                {group.title}
              </Text>
            ) : null}

            <FlatList
              data={group.data}
              key={viewMode}
              keyExtractor={(item) => item.id}
              numColumns={viewMode === 'grid' ? 2 : 1}
              renderItem={renderFileItem}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={54} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No files found</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              {search
                ? `No results matching "${search}"`
                : 'Upload files or create folders using the + button.'}
            </Text>
          </View>
        }
      />

      <InputDialogModal
        visible={!!renameTarget}
        title="Rename Item"
        placeholder="New name..."
        initialValue={renameTarget?.name || ''}
        confirmLabel="Rename"
        onConfirm={(newName) => {
          if (renameTarget) {
            onRenameFile(renameTarget, newName);
          }
          setRenameTarget(null);
        }}
        onClose={() => setRenameTarget(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pathHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  breadcrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
  },
  breadcrumbText: {
    fontSize: 14,
    fontWeight: '600',
  },
  viewModeBtn: {
    padding: 8,
    borderRadius: 8,
  },
  groupSection: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  listDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
  },
  fileMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  actionBtn: {
    padding: 6,
  },
  gridCard: {
    flex: 1,
    margin: 4,
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 110,
  },
  gridName: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  gridMeta: {
    fontSize: 11,
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
});
