import 'dart:ui';
import 'package:flutter/material.dart';

enum MediaCategoryFilter { all, photos, videos }

enum SortByField { date, name, size }

enum SortOrder { asc, desc }

class FilterSortBar extends StatelessWidget {
  final MediaCategoryFilter category;
  final int density;
  final int totalCount;
  final SortByField sortBy;
  final SortOrder sortOrder;
  final ValueChanged<MediaCategoryFilter> onCategoryChanged;
  final ValueChanged<int> onDensityChanged;
  final ValueChanged<SortByField>? onSortByChanged;
  final VoidCallback? onToggleSortOrder;

  const FilterSortBar({
    super.key,
    required this.category,
    required this.density,
    required this.totalCount,
    this.sortBy = SortByField.date,
    this.sortOrder = SortOrder.desc,
    required this.onCategoryChanged,
    required this.onDensityChanged,
    this.onSortByChanged,
    this.onToggleSortOrder,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final primary = theme.primaryColor;

    return ClipRRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Container(
          height: 42,
          padding: const EdgeInsets.symmetric(horizontal: 14.0),
          decoration: BoxDecoration(
            color: (isDark ? theme.cardColor : Colors.white).withValues(alpha: 0.8),
            border: Border(
              bottom: BorderSide(
                color: isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black.withValues(alpha: 0.06),
                width: 1,
              ),
            ),
          ),
          child: Row(
            children: [
              // Category Dropdown Pill
              PopupMenuButton<MediaCategoryFilter>(
                initialValue: category,
                onSelected: onCategoryChanged,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        category == MediaCategoryFilter.photos
                            ? Icons.photo_rounded
                            : (category == MediaCategoryFilter.videos ? Icons.videocam_rounded : Icons.perm_media_rounded),
                        size: 14,
                        color: primary,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        category == MediaCategoryFilter.photos
                            ? 'Photos'
                            : (category == MediaCategoryFilter.videos ? 'Videos' : 'All Media'),
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: primary,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Icon(Icons.arrow_drop_down_rounded, size: 16, color: primary),
                    ],
                  ),
                ),
                itemBuilder: (context) => [
                  const PopupMenuItem(
                    value: MediaCategoryFilter.all,
                    child: Text('All Media'),
                  ),
                  const PopupMenuItem(
                    value: MediaCategoryFilter.photos,
                    child: Text('Photos Only'),
                  ),
                  const PopupMenuItem(
                    value: MediaCategoryFilter.videos,
                    child: Text('Videos Only'),
                  ),
                ],
              ),

              const SizedBox(width: 10),

              // Item Count Display
              Text(
                '$totalCount items',
                style: theme.textTheme.bodySmall?.copyWith(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                ),
              ),

              const Spacer(),

              // Sort Toggle (if provided)
              if (onSortByChanged != null)
                PopupMenuButton<SortByField>(
                  initialValue: sortBy,
                  onSelected: onSortByChanged,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                    child: Icon(
                      Icons.sort_rounded,
                      size: 18,
                      color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.7),
                    ),
                  ),
                  itemBuilder: (context) => [
                    const PopupMenuItem(
                      value: SortByField.date,
                      child: Text('Sort by Date'),
                    ),
                    const PopupMenuItem(
                      value: SortByField.name,
                      child: Text('Sort by Name'),
                    ),
                    const PopupMenuItem(
                      value: SortByField.size,
                      child: Text('Sort by Size'),
                    ),
                  ],
                ),

              const SizedBox(width: 6),

              // Grid Density Switcher (2x, 3x, 4x)
              Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  color: isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [2, 3, 4].map((col) {
                    final isSel = density == col;
                    return GestureDetector(
                      onTap: () => onDensityChanged(col),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                        decoration: BoxDecoration(
                          color: isSel ? primary : Colors.transparent,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          '${col}x',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: isSel ? Colors.white : theme.textTheme.bodySmall?.color?.withValues(alpha: 0.6),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
