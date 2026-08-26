import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class InputDialog extends StatefulWidget {
  final String title;
  final String? message;
  final String initialValue;
  final String placeholder;
  final String confirmText;
  final String cancelText;
  final bool obscureText;
  final bool digitsOnly;
  final int? maxLength;
  final TextInputType? keyboardType;

  const InputDialog({
    super.key,
    required this.title,
    this.message,
    this.initialValue = '',
    this.placeholder = '',
    this.confirmText = 'Confirm',
    this.cancelText = 'Cancel',
    this.obscureText = false,
    this.digitsOnly = false,
    this.maxLength,
    this.keyboardType,
  });

  static Future<String?> show(
    BuildContext context, {
    required String title,
    String? message,
    String initialValue = '',
    String placeholder = '',
    String confirmText = 'Confirm',
    String cancelText = 'Cancel',
    bool obscureText = false,
    bool digitsOnly = false,
    int? maxLength,
    TextInputType? keyboardType,
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
        obscureText: obscureText,
        digitsOnly: digitsOnly,
        maxLength: maxLength,
        keyboardType: keyboardType,
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

  bool _canSubmit(String text) {
    final value = text.trim();
    if (value.isEmpty) return false;
    if (widget.maxLength != null && value.length != widget.maxLength) return false;
    if (widget.digitsOnly && value.contains(RegExp(r'\D'))) return false;
    return true;
  }

  void _submit() {
    final text = _controller.text.trim();
    if (_canSubmit(text)) {
      Navigator.of(context).pop(text);
    }
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
              obscureText: widget.obscureText,
              keyboardType: widget.keyboardType ??
                  (widget.digitsOnly ? TextInputType.number : TextInputType.text),
              maxLength: widget.maxLength,
              inputFormatters: [
                if (widget.digitsOnly) FilteringTextInputFormatter.digitsOnly,
                if (widget.maxLength != null) LengthLimitingTextInputFormatter(widget.maxLength),
              ],
              onChanged: (_) => setState(() {}),
              onSubmitted: (_) => _submit(),
              decoration: InputDecoration(
                hintText: widget.placeholder,
                counterText: widget.maxLength != null ? '' : null,
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
            onPressed: _canSubmit(_controller.text) ? _submit : null,
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
