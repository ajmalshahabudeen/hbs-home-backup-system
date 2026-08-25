import 'dart:ui';
import 'package:flutter/material.dart';

class InputDialog extends StatefulWidget {
  final String title;
  final String? message;
  final String initialValue;
  final String placeholder;
  final String confirmText;
  final String cancelText;

  const InputDialog({
    super.key,
    required this.title,
    this.message,
    this.initialValue = '',
    this.placeholder = '',
    this.confirmText = 'Confirm',
    this.cancelText = 'Cancel',
  });

  static Future<String?> show(
    BuildContext context, {
    required String title,
    String? message,
    String initialValue = '',
    String placeholder = '',
    String confirmText = 'Confirm',
    String cancelText = 'Cancel',
  }) {
    return showDialog<String>(
      context: context,
      barrierDismissible: true,
      builder: (context) => InputDialog(
        title: title,
        message: message,
        initialValue: initialValue,
        placeholder: placeholder,
        confirmText: confirmText,
        cancelText: cancelText,
      ),
    );
  }

  @override
  State<InputDialog> createState() => _InputDialogState();
}

class _InputDialogState extends State<InputDialog> {
  late TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialValue);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final primary = theme.primaryColor;

    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
      child: AlertDialog(
        backgroundColor: (isDark ? theme.cardColor : Colors.white).withValues(alpha: 0.9),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24.0),
          side: BorderSide(
            color: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.08),
          ),
        ),
        title: Text(
          widget.title,
          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (widget.message != null) ...[
              Text(
                widget.message!,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.textTheme.bodyMedium?.color?.withValues(alpha: 0.7),
                ),
              ),
              const SizedBox(height: 12),
            ],
            TextField(
              controller: _controller,
              autofocus: true,
              decoration: InputDecoration(
                hintText: widget.placeholder,
                filled: true,
                fillColor: isDark ? Colors.white.withValues(alpha: 0.06) : Colors.black.withValues(alpha: 0.04),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide.none,
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide(color: primary, width: 1.5),
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(
              widget.cancelText,
              style: TextStyle(color: theme.textTheme.bodyMedium?.color?.withValues(alpha: 0.7)),
            ),
          ),
          ElevatedButton(
            onPressed: () {
              final text = _controller.text.trim();
              if (text.isNotEmpty) {
                Navigator.of(context).pop(text);
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: primary,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: Text(widget.confirmText),
          ),
        ],
      ),
    );
  }
}
