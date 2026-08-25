import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

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

  // Secure Token Storage
  Future<void> saveSessionToken(String token) async {
    await _secureStorage.write(key: 'hbs_auth_session_token', value: token);
  }

  Future<String?> getSessionToken() async {
    return await _secureStorage.read(key: 'hbs_auth_session_token');
  }

  Future<void> clearSessionToken() async {
    await _secureStorage.delete(key: 'hbs_auth_session_token');
  }

  // General Preferences
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
    await _secureStorage.deleteAll();
    await _prefs?.clear();
  }
}
