import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { GlassCard } from './ui/GlassCard';

export type SortField = 'date' | 'name' | 'size' | 'type';
export type SortOrder = 'asc' | 'desc';
export type GroupByOption = 'none' | 'day' | 'month' | 'year' | 'category';

export interface CategoryItem {
  label: string;
  value: string;
  key?: string;
  icon: string;
}

interface FilterSortBarProps {
  searchQuery: string;
  onSearchChange: (text: string) => void;
  selectedCategory: string;
  onCategoryChange?: (category: string) => void;
  onCategorySelect?: (category: string) => void;
  categories?: CategoryItem[];
  sortField: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField, order: SortOrder) => void;
  groupBy?: GroupByOption;
  onGroupByChange?: (groupBy: GroupByOption) => void;
  columns?: number;
  onColumnsChange?: (cols: number) => void;
  viewMode?: 'list' | 'grid';
  onViewModeChange?: (mode: 'list' | 'grid') => void;
  onImport?: () => void;
  totalCount?: number;
}

const DEFAULT_CATEGORIES: CategoryItem[] = [
  { label: 'All', value: 'all', key: 'all', icon: 'grid-outline' },
  { label: 'Photos', value: 'photos', key: 'image', icon: 'image-outline' },
  { label: 'Videos', value: 'videos', key: 'video', icon: 'videocam-outline' },
  { label: 'Documents', value: 'docs', key: 'document', icon: 'document-text-outline' },
  { label: 'Audio', value: 'audio', key: 'audio', icon: 'musical-notes-outline' },
];

export const FilterSortBar: React.FC<FilterSortBarProps> = ({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  onCategorySelect,
  categories = DEFAULT_CATEGORIES,
  sortField,
  sortOrder,
  onSortChange,
  groupBy = 'none',
  onGroupByChange,
  columns,
  onColumnsChange,
  viewMode,
  onViewModeChange,
  onImport,
  totalCount,
}) => {
  const { colors, isDark } = useAppTheme();
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);

  const handleSelectCategory = (val: string) => {
    if (onCategoryChange) onCategoryChange(val);
    if (onCategorySelect) onCategorySelect(val);
    setCategoryModalVisible(false);
  };

  const toggleSortOrder = () => {
    onSortChange(sortField, sortOrder === 'asc' ? 'desc' : 'asc');
  };

  const currentCategoryObj =
    categories.find((c) => (c.value || c.key) === selectedCategory) || categories[0];

  return (
    <View style={styles.container}>
      {/* Compact Single-Row Header Bar */}
      <View style={styles.barRow}>
        {/* Search Input Box */}
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={15} color={colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={totalCount !== undefined ? `Search ${totalCount} items...` : "Search..."}
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={onSearchChange}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => onSearchChange('')} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Category Dropdown Pill */}
        <TouchableOpacity
          style={[
            styles.actionPill,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.surfaceVariant,
              borderColor: isDark ? 'rgba(255,255,255,0.12)' : colors.border,
            },
          ]}
          onPress={() => setCategoryModalVisible(true)}
          activeOpacity={0.75}
        >
          <Ionicons name={(currentCategoryObj?.icon as any) || 'funnel-outline'} size={14} color={colors.primary} />
          <Text style={[styles.actionPillText, { color: colors.text }]} numberOfLines={1}>
            {currentCategoryObj?.label || 'All'}
          </Text>
          <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Grid Column Toggle Button (for PhotoGrid) */}
        {columns !== undefined && onColumnsChange && (
          <TouchableOpacity
            style={[
              styles.iconPill,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.surfaceVariant,
                borderColor: isDark ? 'rgba(255,255,255,0.12)' : colors.border,
              },
            ]}
            onPress={() => {
              const next = columns === 2 ? 3 : columns === 3 ? 4 : 2;
              onColumnsChange(next);
            }}
            activeOpacity={0.75}
          >
            <Text style={[styles.columnPillText, { color: colors.primary }]}>{columns}x</Text>
          </TouchableOpacity>
        )}

        {/* View Mode Toggle (for DriveFileList) */}
        {viewMode !== undefined && onViewModeChange && (
          <TouchableOpacity
            style={[
              styles.iconPill,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.surfaceVariant,
                borderColor: isDark ? 'rgba(255,255,255,0.12)' : colors.border,
              },
            ]}
            onPress={() => onViewModeChange(viewMode === 'list' ? 'grid' : 'list')}
            activeOpacity={0.75}
          >
            <Ionicons
              name={viewMode === 'list' ? 'grid-outline' : 'list-outline'}
              size={16}
              color={colors.primary}
            />
          </TouchableOpacity>
        )}

        {/* Sort & Options Button */}
        <TouchableOpacity
          style={[
            styles.iconPill,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.surfaceVariant,
              borderColor: isDark ? 'rgba(255,255,255,0.12)' : colors.border,
            },
          ]}
          onPress={() => setSortModalVisible(true)}
          activeOpacity={0.75}
        >
          <Ionicons name="options-outline" size={16} color={colors.primary} />
        </TouchableOpacity>

        {/* Import Action Button */}
        {onImport && (
          <TouchableOpacity
            style={[
              styles.iconPill,
              {
                backgroundColor: colors.primaryContainer || colors.primary + '20',
                borderColor: colors.primary + '40',
              },
            ]}
            onPress={onImport}
            activeOpacity={0.75}
          >
            <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Category Dropdown Selection Modal */}
      <Modal
        visible={categoryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCategoryModalVisible(false)}>
          <Pressable style={styles.modalContainer} onPress={(e) => e.stopPropagation()}>
            <GlassCard variant="gradient" style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Select Filter</Text>
                <TouchableOpacity onPress={() => setCategoryModalVisible(false)}>
                  <Ionicons name="close" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.categoryList}>
                {categories.map((cat) => {
                  const val = cat.value || cat.key || '';
                  const isActive = selectedCategory === val;
                  return (
                    <TouchableOpacity
                      key={val}
                      style={[
                        styles.categoryRowItem,
                        {
                          backgroundColor: isActive
                            ? isDark
                              ? 'rgba(99, 102, 241, 0.2)'
                              : '#EEF2FF'
                            : 'transparent',
                          borderColor: isActive ? colors.primary : 'transparent',
                        },
                      ]}
                      onPress={() => handleSelectCategory(val)}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name={(cat.icon as any) || 'ellipse'}
                        size={18}
                        color={isActive ? colors.primary : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.categoryRowText,
                          {
                            color: isActive ? colors.primary : colors.text,
                            fontWeight: isActive ? '700' : '500',
                          },
                        ]}
                      >
                        {cat.label}
                      </Text>
                      {isActive && (
                        <Ionicons name="checkmark" size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </GlassCard>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Sort & Group Options Modal */}
      <Modal
        visible={sortModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSortModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSortModalVisible(false)}>
          <Pressable style={styles.modalContainer} onPress={(e) => e.stopPropagation()}>
            <GlassCard variant="gradient" style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Sort & Group Options</Text>
                <TouchableOpacity onPress={() => setSortModalVisible(false)}>
                  <Ionicons name="close" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Sort By</Text>
              <View style={styles.optionsGrid}>
                {[
                  { label: 'Date Modified', field: 'date' as SortField, icon: 'time-outline' },
                  { label: 'Name', field: 'name' as SortField, icon: 'text-outline' },
                  { label: 'File Size', field: 'size' as SortField, icon: 'analytics-outline' },
                  { label: 'Category', field: 'type' as SortField, icon: 'folder-outline' },
                ].map((opt) => {
                  const isSelected = sortField === opt.field;
                  return (
                    <TouchableOpacity
                      key={opt.field}
                      style={[
                        styles.optionCard,
                        {
                          backgroundColor: isSelected
                            ? isDark
                              ? 'rgba(59,130,246,0.2)'
                              : '#EFF6FF'
                            : isDark
                            ? 'rgba(255,255,255,0.05)'
                            : '#F8FAFC',
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => onSortChange(opt.field, sortOrder)}
                    >
                      <Ionicons
                        name={opt.icon as any}
                        size={18}
                        color={isSelected ? colors.primary : colors.textSecondary}
                      />
                      <Text style={[styles.optionText, { color: isSelected ? colors.primary : colors.text }]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity style={styles.orderRow} onPress={toggleSortOrder}>
                <Text style={[styles.orderLabel, { color: colors.text }]}>Sort Order:</Text>
                <View style={[styles.orderBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.orderText}>
                    {sortOrder === 'desc' ? 'Newest / Z-A / Highest' : 'Oldest / A-Z / Lowest'}
                  </Text>
                  <Ionicons
                    name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'}
                    size={14}
                    color="#FFF"
                  />
                </View>
              </TouchableOpacity>

              {onGroupByChange && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 16 }]}>
                    Group Items By
                  </Text>
                  <View style={styles.optionsGrid}>
                    {[
                      { label: 'None (Flat)', value: 'none' as GroupByOption },
                      { label: 'Day', value: 'day' as GroupByOption },
                      { label: 'Month', value: 'month' as GroupByOption },
                      { label: 'Year', value: 'year' as GroupByOption },
                    ].map((gOpt) => {
                      const isSelected = groupBy === gOpt.value;
                      return (
                        <TouchableOpacity
                          key={gOpt.value}
                          style={[
                            styles.optionCard,
                            {
                              backgroundColor: isSelected
                                ? isDark
                                  ? 'rgba(59,130,246,0.2)'
                                  : '#EFF6FF'
                                : isDark
                                ? 'rgba(255,255,255,0.05)'
                                : '#F8FAFC',
                              borderColor: isSelected ? colors.primary : colors.border,
                            },
                          ]}
                          onPress={() => onGroupByChange(gOpt.value)}
                        >
                          <Text style={[styles.optionText, { color: isSelected ? colors.primary : colors.text }]}>
                            {gOpt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
            </GlassCard>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    marginVertical: 6,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 38,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 2,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  actionPillText: {
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 90,
  },
  iconPill: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  columnPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
  },
  modalCard: {
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  categoryList: {
    gap: 6,
  },
  categoryRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  categoryRowText: {
    fontSize: 14,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  optionCard: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  optionText: {
    fontSize: 13,
    fontWeight: '500',
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  orderLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  orderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 4,
  },
  orderText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
  },
});

