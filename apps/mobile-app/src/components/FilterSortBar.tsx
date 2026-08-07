import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
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

interface CategoryItem {
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
}) => {
  const { colors, isDark } = useAppTheme();
  const [modalVisible, setModalVisible] = useState(false);

  const handleSelectCategory = (val: string) => {
    if (onCategoryChange) onCategoryChange(val);
    if (onCategorySelect) onCategorySelect(val);
  };

  const toggleSortOrder = () => {
    onSortChange(sortField, sortOrder === 'asc' ? 'desc' : 'asc');
  };

  return (
    <View style={styles.container}>
      {/* Search Input Box */}
      <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={18} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search items by name..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={onSearchChange}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => onSearchChange('')} style={styles.clearBtn}>
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.sortButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="options-outline" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Categories Horizontal Scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesContainer}
      >
        {categories.map((cat) => {
          const val = cat.value || cat.key || '';
          const isActive = selectedCategory === val;
          return (
            <TouchableOpacity
              key={val}
              style={[
                styles.categoryChip,
                {
                  backgroundColor: isActive
                    ? colors.primary
                    : isDark
                    ? 'rgba(255,255,255,0.06)'
                    : 'rgba(0,0,0,0.04)',
                  borderColor: isActive ? colors.primary : colors.border,
                },
              ]}
              onPress={() => handleSelectCategory(val)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={cat.icon as any}
                size={14}
                color={isActive ? '#FFFFFF' : colors.textSecondary}
              />
              <Text
                style={[
                  styles.categoryText,
                  { color: isActive ? '#FFFFFF' : colors.text, fontWeight: isActive ? '600' : '400' },
                ]}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Sort & GroupBy Options Modal */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.modalContainer} onPress={(e) => e.stopPropagation()}>
            <GlassCard variant="gradient" style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Sort & Group Options</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
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
                  <Text style={styles.orderText}>{sortOrder === 'desc' ? 'Newest / Z-A / Highest' : 'Oldest / A-Z / Lowest'}</Text>
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
    marginVertical: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
  },
  clearBtn: {
    padding: 4,
  },
  sortButton: {
    padding: 8,
    borderRadius: 10,
    marginLeft: 6,
  },
  categoriesContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  categoryText: {
    fontSize: 13,
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
    maxWidth: 420,
  },
  modalCard: {
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  optionCard: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  orderLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  orderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  orderText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
