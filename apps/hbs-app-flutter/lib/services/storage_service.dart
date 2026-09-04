import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/saved_account.dart';
import '../models/user_model.dart';

class StorageService {
  static final StorageService _instance = StorageService._internal();
  factory StorageService() => _instance;
  StorageService._internal();

  final _secureStorage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );
  SharedPreferences? _prefs;

  Future<void> init() async {
    _prefs ??= await SharedPreferences.getInstance();
  }

  // ==================== Session Token Storage ====================

  Future<void> saveSessionToken(String token) async {
    try {
      await _secureStorage.write(key: 'hbs_auth_session_token', value: token);
    } catch (_) {}
    await _prefs?.remove('hbs_auth_session_token');
  }

  Future<String?> getSessionToken() async {
    try {
      final token = await _secureStorage.read(key: 'hbs_auth_session_token');
      if (token != null && token.isNotEmpty) return token;
    } catch (_) {}
    final legacy = _prefs?.getString('hbs_auth_session_token');
    if (legacy != null && legacy.isNotEmpty) {
      await saveSessionToken(legacy);
      return legacy;
    }
    return null;
  }

  Future<void> clearSessionToken() async {
    try {
      await _secureStorage.delete(key: 'hbs_auth_session_token');
    } catch (_) {}
    await _prefs?.remove('hbs_auth_session_token');
  }

  Future<void> setVaultPassphrase(String passphrase) async {
    try {
      await _secureStorage.write(key: 'hbs_vault_passphrase', value: passphrase);
    } catch (_) {}
  }

  Future<String?> getVaultPassphrase() async {
    try {
      return await _secureStorage.read(key: 'hbs_vault_passphrase');
    } catch (_) {
      return null;
    }
  }

  Future<void> clearVaultPassphrase() async {
    try {
      await _secureStorage.delete(key: 'hbs_vault_passphrase');
    } catch (_) {}
  }

  // ==================== Auth Credentials Storage ====================

  Future<void> saveAuthCredentials(String email, String password) async {
    final raw = jsonEncode({'email': email.trim(), 'password': password});
    try {
      await _secureStorage.write(key: 'hbs_auth_credentials', value: raw);
    } catch (_) {}
    await _prefs?.remove('hbs_auth_credentials');
  }

  Future<Map<String, String>?> getAuthCredentials() async {
    String? raw;
    try {
      raw = await _secureStorage.read(key: 'hbs_auth_credentials');
    } catch (_) {}
    raw ??= _prefs?.getString('hbs_auth_credentials');
    if (raw != null && _prefs?.containsKey('hbs_auth_credentials') == true) {
      await _prefs?.remove('hbs_auth_credentials');
      try {
        await _secureStorage.write(key: 'hbs_auth_credentials', value: raw);
      } catch (_) {}
    }

    if (raw == null || raw.isEmpty) return null;
    try {
      final map = jsonDecode(raw);
      if (map is Map && map['email'] != null && map['password'] != null) {
        return {
          'email': map['email'].toString(),
          'password': map['password'].toString(),
        };
      }
    } catch (_) {}
    return null;
  }

  Future<void> clearAuthCredentials() async {
    try {
      await _secureStorage.delete(key: 'hbs_auth_credentials');
    } catch (_) {}
    await _prefs?.remove('hbs_auth_credentials');
  }

  // ==================== Saved Login Accounts ====================

  static const _savedAccountsKey = 'hbs_saved_accounts';

  Future<List<SavedAccount>> getSavedAccounts() async {
    String? raw;
    try {
      raw = await _secureStorage.read(key: _savedAccountsKey);
    } catch (_) {}
    raw ??= _prefs?.getString(_savedAccountsKey);
    if (raw != null && _prefs?.containsKey(_savedAccountsKey) == true) {
      await _prefs?.remove(_savedAccountsKey);
      try {
        await _secureStorage.write(key: _savedAccountsKey, value: raw);
      } catch (_) {}
    }

    final accounts = <SavedAccount>[];
    if (raw != null && raw.isNotEmpty) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is List) {
          for (final item in decoded) {
            if (item is Map<String, dynamic>) {
              final account = SavedAccount.fromJson(item);
              if (account.email.isNotEmpty && account.password.isNotEmpty) {
                accounts.add(account);
              }
            } else if (item is Map) {
              final account = SavedAccount.fromJson(Map<String, dynamic>.from(item));
              if (account.email.isNotEmpty && account.password.isNotEmpty) {
                accounts.add(account);
              }
            }
          }
        }
      } catch (_) {}
    }

    if (accounts.isEmpty) {
      final legacy = await getAuthCredentials();
      if (legacy != null) {
        accounts.add(SavedAccount(
          email: legacy['email'] ?? '',
          password: legacy['password'] ?? '',
          name: getCurrentUser()?.name ?? '',
        ));
      }
    }

    return accounts;
  }

  Future<void> upsertSavedAccount(SavedAccount account) async {
    if (account.email.isEmpty || account.password.isEmpty) return;
    final existing = await getSavedAccounts();
    final next = <SavedAccount>[
      account,
      ...existing.where((e) => e.email.toLowerCase() != account.email.toLowerCase()),
    ];
    await _writeSavedAccounts(next);
  }

  Future<void> removeSavedAccount(String email) async {
    final existing = await getSavedAccounts();
    final next = existing.where((e) => e.email.toLowerCase() != email.toLowerCase()).toList();
    await _writeSavedAccounts(next);
  }

  Future<void> _writeSavedAccounts(List<SavedAccount> accounts) async {
    final raw = jsonEncode(accounts.map((e) => e.toJson()).toList());
    try {
      await _secureStorage.write(key: _savedAccountsKey, value: raw);
    } catch (_) {}
    await _prefs?.remove(_savedAccountsKey);
  }

  // ==================== User Profile Caching ====================

  Future<void> saveCurrentUser(UserModel user) async {
    final raw = jsonEncode(user.toJson());
    await _prefs?.setString('hbs_auth_user', raw);
  }

  UserModel? getCurrentUser() {
    final raw = _prefs?.getString('hbs_auth_user');
    if (raw == null || raw.isEmpty) return null;
    try {
      final map = jsonDecode(raw);
      if (map is Map<String, dynamic>) {
        return UserModel.fromJson(map);
      }
    } catch (_) {}
    return null;
  }

  Future<void> clearCurrentUser() async {
    await _prefs?.remove('hbs_auth_user');
  }

  // ==================== Logout State Tracking ====================

  bool isUserLoggedOut() {
    return _prefs?.getBool('hbs_user_logged_out') ?? false;
  }

  Future<void> setUserLoggedOut(bool loggedOut) async {
    await _prefs?.setBool('hbs_user_logged_out', loggedOut);
  }

  // ==================== Clear All Auth Data ====================

  Future<void> clearAllAuthData() async {
    await clearSessionToken();
    await clearAuthCredentials();
    await clearCurrentUser();
    await setUserLoggedOut(true);
  }

  Future<void> clearSession() => clearAllAuthData();

  // ==================== General Preferences ====================

  String getString(String key, {String defaultValue = ''}) {
    return _prefs?.getString(key) ?? defaultValue;
  }

  Future<bool> setString(String key, String value) async {
    return await _prefs?.setString(key, value) ?? false;
  }

  bool getBool(String key, {bool defaultValue = false}) {
    return _prefs?.getBool(key) ?? defaultValue;
  }

  Future<bool> setBool(String key, bool value) async {
    return await _prefs?.setBool(key, value) ?? false;
  }

  int getInt(String key, {int defaultValue = 0}) {
    return _prefs?.getInt(key) ?? defaultValue;
  }

  Future<bool> setInt(String key, int value) async {
    return await _prefs?.setInt(key, value) ?? false;
  }

  List<String> getStringList(String key) {
    return _prefs?.getStringList(key) ?? [];
  }

  Future<bool> setStringList(String key, List<String> value) async {
    return await _prefs?.setStringList(key, value) ?? false;
  }

  Future<bool> remove(String key) async {
    return await _prefs?.remove(key) ?? false;
  }

  Future<void> clearAll() async {
    try {
      await _secureStorage.deleteAll();
    } catch (_) {}
    await _prefs?.clear();
  }
}
