import 'package:flutter/material.dart';
import '../../providers/drive_provider.dart';

class DriveFilterSheet extends StatefulWidget {
  final DriveTypeFilter currentType;
  final DriveDateFilter currentDate;
  final DriveSizeFilter currentSize;
  final DriveGroupBy currentGroup;
  final Function({
    required DriveTypeFilter type,
    required DriveDateFilter date,
    required DriveSizeFilter size,
    required DriveGroupBy group,
  }) onApply;

  const DriveFilterSheet({
    super.key,
    required this.currentType,
    required this.currentDate,
    required this.currentSize,
    required this.currentGroup,
    required this.onApply,
  });

  static void show(
    BuildContext context, {
    required DriveTypeFilter currentType,
    required DriveDateFilter currentDate,
    required DriveSizeFilter currentSize,
    required DriveGroupBy currentGroup,
    required Function({
      required DriveTypeFilter type,
      required DriveDateFilter date,
      required DriveSizeFilter size,
      required DriveGroupBy group,
    }) onApply,
  }) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => DriveFilterSheet(
        currentType: currentType,
        currentDate: currentDate,
        currentSize: currentSize,
        currentGroup: currentGroup,
        onApply: onApply,
      ),
    );
  }

  @override
  State<DriveFilterSheet> createState() => _DriveFilterSheetState();
}

class _DriveFilterSheetState extends State<DriveFilterSheet> {
  late DriveTypeFilter _selectedType;
  late DriveDateFilter _selectedDate;
  late DriveSizeFilter _selectedSize;
  late DriveGroupBy _selectedGroup;

  @override
  void initState() {
    super.initState();
    _selectedType = widget.currentType;
    _selectedDate = widget.currentDate;
    _selectedSize = widget.currentSize;
    _selectedGroup = widget.currentGroup;
  }

  void _reset() {
    setState(() {
      _selectedType = DriveTypeFilter.all;
      _selectedDate = DriveDateFilter.all;
      _selectedSize = DriveSizeFilter.all;
      _selectedGroup = DriveGroupBy.none;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.primaryColor;
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF161616) : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Handle Bar
            Center(
              child: Container(
                margin: const EdgeInsets.only(top: 12, bottom: 8),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: isDark ? Colors.white24 : Colors.black12,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),

            // Header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Row(
                children: [
                  Text(
                    'Filter & Group',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      fontSize: 18,
                    ),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: _reset,
                    child: const Text('Reset'),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),

            const Divider(height: 1),

            // Options List
            Expanded(
              child: SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // GROUP BY SECTION
                    _buildSectionHeader('Group By', Icons.grid_goldenratio_rounded, primary),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _buildChoiceChip('None', DriveGroupBy.none, _selectedGroup, (v) => setState(() => _selectedGroup = v)),
                        _buildChoiceChip('Type', DriveGroupBy.type, _selectedGroup, (v) => setState(() => _selectedGroup = v)),
                        _buildChoiceChip('Date', DriveGroupBy.date, _selectedGroup, (v) => setState(() => _selectedGroup = v)),
                        _buildChoiceChip('Size', DriveGroupBy.size, _selectedGroup, (v) => setState(() => _selectedGroup = v)),
                      ],
                    ),

                    const SizedBox(height: 24),
                    const Divider(height: 1),
                    const SizedBox(height: 20),

                    // FILTER BY TYPE
                    _buildSectionHeader('Filter by Type', Icons.category_rounded, primary),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _buildChoiceChip('All', DriveTypeFilter.all, _selectedType, (v) => setState(() => _selectedType = v)),
                        _buildChoiceChip('📁 Folders', DriveTypeFilter.folders, _selectedType, (v) => setState(() => _selectedType = v)),
                        _buildChoiceChip('🖼️ Photos', DriveTypeFilter.photos, _selectedType, (v) => setState(() => _selectedType = v)),
                        _buildChoiceChip('🎬 Videos', DriveTypeFilter.videos, _selectedType, (v) => setState(() => _selectedType = v)),
                        _buildChoiceChip('📄 Documents', DriveTypeFilter.documents, _selectedType, (v) => setState(() => _selectedType = v)),
                        _buildChoiceChip('🎵 Audio', DriveTypeFilter.audio, _selectedType, (v) => setState(() => _selectedType = v)),
                        _buildChoiceChip('📦 Archives', DriveTypeFilter.archives, _selectedType, (v) => setState(() => _selectedType = v)),
                      ],
                    ),

                    const SizedBox(height: 24),
                    const Divider(height: 1),
                    const SizedBox(height: 20),

                    // FILTER BY DATE
                    _buildSectionHeader('Filter by Date', Icons.calendar_today_rounded, primary),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _buildChoiceChip('All Time', DriveDateFilter.all, _selectedDate, (v) => setState(() => _selectedDate = v)),
                        _buildChoiceChip('Today', DriveDateFilter.today, _selectedDate, (v) => setState(() => _selectedDate = v)),
                        _buildChoiceChip('Last 7 Days', DriveDateFilter.last7Days, _selectedDate, (v) => setState(() => _selectedDate = v)),
                        _buildChoiceChip('Last 30 Days', DriveDateFilter.last30Days, _selectedDate, (v) => setState(() => _selectedDate = v)),
                        _buildChoiceChip('This Year', DriveDateFilter.thisYear, _selectedDate, (v) => setState(() => _selectedDate = v)),
                      ],
                    ),

                    const SizedBox(height: 24),
                    const Divider(height: 1),
                    const SizedBox(height: 20),

                    // FILTER BY SIZE
                    _buildSectionHeader('Filter by Size', Icons.storage_rounded, primary),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _buildChoiceChip('All Sizes', DriveSizeFilter.all, _selectedSize, (v) => setState(() => _selectedSize = v)),
                        _buildChoiceChip('Small (< 10 MB)', DriveSizeFilter.small, _selectedSize, (v) => setState(() => _selectedSize = v)),
                        _buildChoiceChip('Medium (10 - 100 MB)', DriveSizeFilter.medium, _selectedSize, (v) => setState(() => _selectedSize = v)),
                        _buildChoiceChip('Large (> 100 MB)', DriveSizeFilter.large, _selectedSize, (v) => setState(() => _selectedSize = v)),
                      ],
                    ),
                  ],
                ),
              ),
            ),

            // Bottom Apply Button
            Padding(
              padding: const EdgeInsets.all(16),
              child: FilledButton(
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                onPressed: () {
                  widget.onApply(
                    type: _selectedType,
                    date: _selectedDate,
                    size: _selectedSize,
                    group: _selectedGroup,
                  );
                  Navigator.of(context).pop();
                },
                child: const Text('Apply Changes', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title, IconData icon, Color primary) {
    return Row(
      children: [
        Icon(icon, size: 18, color: primary),
        const SizedBox(width: 8),
        Text(
          title,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
        ),
      ],
    );
  }

  Widget _buildChoiceChip<T>(String label, T value, T selectedValue, ValueChanged<T> onSelected) {
    final isSelected = value == selectedValue;
    final theme = Theme.of(context);
    final primary = theme.primaryColor;
    final isDark = theme.brightness == Brightness.dark;

    return FilterChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (_) => onSelected(value),
      selectedColor: primary.withValues(alpha: 0.2),
      checkmarkColor: primary,
      labelStyle: TextStyle(
        fontSize: 12,
        fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
        color: isSelected ? primary : theme.textTheme.bodyMedium?.color,
      ),
      backgroundColor: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.04),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: isSelected ? primary : Colors.transparent,
          width: 1,
        ),
      ),
    );
  }
}
