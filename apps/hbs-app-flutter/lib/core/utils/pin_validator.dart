class PinValidator {
  static final _fourDigits = RegExp(r'^\d{4}$');

  static bool isValid(String pin) => _fourDigits.hasMatch(pin);

  /// Accept only an exact 4-digit PIN (whitespace around it is allowed).
  static String? sanitize(String raw) {
    final trimmed = raw.trim();
    if (!_fourDigits.hasMatch(trimmed)) return null;
    return trimmed;
  }
}
