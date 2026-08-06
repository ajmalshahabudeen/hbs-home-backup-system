import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { BackupFileItem } from '../services/api';

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
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = [
    { key: 'all', label: 'All Files', icon: 'folder-open' },
    { key: 'image', label: 'Images', icon: 'image' },
    { key: 'video', label: 'Videos', icon: 'film' },
    { key: 'document', label: 'Docs', icon: 'document-text' },
    { key: 'audio', label: 'Audio', icon: 'musical-notes' },
  ];

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

  const filteredFiles = files.filter((f) => {
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'image') return f.mimeType?.startsWith('image/');
    if (selectedCategory === 'video') return f.mimeType?.startsWith('video/');
    if (selectedCategory === 'audio') return f.mimeType?.startsWith('audio/');
    if (selectedCategory === 'document')
      return (
        f.mimeType?.includes('pdf') ||
        f.mimeType?.includes('text') ||
        f.mimeType?.includes('document') ||
        f.mimeType?.includes('json')
      );
    return true;
  });

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

  const promptRename = (file: BackupFileItem) => {
    Alert.prompt(
      'Rename Item',
      `Enter new name for ${file.name}:`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rename',
          onPress: (newName?: string) => {
            if (newName && newName.trim()) {
              onRenameFile(file, newName.trim());
            }
          },
        },
      ],
      'plain-text',
      file.name
    );
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
          <Ionicons name={iconInfo.name as any} size={38} color={iconInfo.color} />
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
        <View
          style={[
            styles.iconWrapper,
            { backgroundColor: iconInfo.color + '15' },
          ]}
        >
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
      {/* Search Input Bar */}
      <View style={[styles.searchBar, { backgroundColor: colors.searchBg }]}>
        <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search Drive files & folders..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Category Pills Slider */}
      <View style={styles.categoryRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={categories}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.categoryChip,
                {
                  backgroundColor:
                    selectedCategory === item.key
                      ? colors.primaryContainer
                      : colors.surfaceVariant,
                },
              ]}
              onPress={() => setSelectedCategory(item.key)}
            >
              <Ionicons
                name={item.icon as any}
                size={14}
                color={selectedCategory === item.key ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.categoryText,
                  {
                    color:
                      selectedCategory === item.key ? colors.primary : colors.textSecondary,
                    fontWeight: selectedCategory === item.key ? '700' : '500',
                  },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Breadcrumb Path & View Mode Toggle */}
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
                      color:
                        index === pathParts.length - 1 ? colors.text : colors.primary,
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
        data={filteredFiles}
        key={viewMode}
        keyExtractor={(item) => item.id}
        numColumns={viewMode === 'grid' ? 2 : 1}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={{ paddingBottom: 100 }}
        renderItem={renderFileItem}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 24,
    marginTop: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  categoryRow: {
    marginVertical: 10,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    gap: 6,
  },
  categoryText: {
    fontSize: 12,
  },
  pathHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
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
    fontSize: 15,
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
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  gridName: {
    fontSize: 13,
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
