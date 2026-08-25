import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

class SkeletonPhotoGrid extends StatelessWidget {
  final int columns;

  const SkeletonPhotoGrid({super.key, this.columns = 3});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final baseColor = isDark ? const Color(0xFF1E1E1E) : const Color(0xFFE5E7EB);
    final highlightColor = isDark ? const Color(0xFF2A2A2A) : const Color(0xFFF3F4F6);

    return Shimmer.fromColors(
      baseColor: baseColor,
      highlightColor: highlightColor,
      child: GridView.builder(
        padding: EdgeInsets.zero,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: columns,
          crossAxisSpacing: 1.5,
          mainAxisSpacing: 1.5,
        ),
        itemCount: columns * 8,
        itemBuilder: (context, index) {
          return Container(
            color: Colors.white,
          );
        },
      ),
    );
  }
}

class SkeletonFileList extends StatelessWidget {
  const SkeletonFileList({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final baseColor = isDark ? const Color(0xFF1E1E1E) : const Color(0xFFE5E7EB);
    final highlightColor = isDark ? const Color(0xFF2A2A2A) : const Color(0xFFF3F4F6);

    return Shimmer.fromColors(
      baseColor: baseColor,
      highlightColor: highlightColor,
      child: ListView.separated(
        padding: const EdgeInsets.all(16.0),
        physics: const NeverScrollableScrollPhysics(),
        itemCount: 8,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          return Container(
            height: 64,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
            ),
          );
        },
      ),
    );
  }
}
