import 'dart:io';
import 'dart:math';
import 'dart:typed_data';
import 'package:cryptography/cryptography.dart';
import 'package:path_provider/path_provider.dart';
import '../../services/storage_service.dart';

/// AES-256-GCM file vault. The server never sees the passphrase.
class VaultCrypto {
  static const magic = [0x48, 0x42, 0x53, 0x31]; // HBS1
  static final _pbkdf2 = Pbkdf2(
    macAlgorithm: Hmac.sha256(),
    iterations: 100000,
    bits: 256,
  );
  static final _aes = AesGcm.with256bits();

  static bool get enabled => StorageService().getBool('hbs_e2e_enabled', defaultValue: false);

  static Future<void> setEnabled(bool value) => StorageService().setBool('hbs_e2e_enabled', value);

  static Future<void> setPassphrase(String passphrase) => StorageService().setVaultPassphrase(passphrase);

  static Future<String?> passphrase() => StorageService().getVaultPassphrase();

  static bool looksEncrypted(List<int> bytes) {
    if (bytes.length < 4) return false;
    return bytes[0] == magic[0] && bytes[1] == magic[1] && bytes[2] == magic[2] && bytes[3] == magic[3];
  }

  static Future<SecretKey> _key(String passphrase, List<int> salt) {
    return _pbkdf2.deriveKeyFromPassword(password: passphrase, nonce: salt);
  }

  static Future<File> encryptFile(File input) async {
    final pass = await passphrase();
    if (pass == null || pass.isEmpty) return input;
    final data = await input.readAsBytes();
    final salt = List<int>.generate(16, (_) => Random.secure().nextInt(256));
    final key = await _key(pass, salt);
    final secretBox = await _aes.encrypt(data, secretKey: key);
    final out = BytesBuilder();
    out.add(magic);
    out.add(salt);
    out.add(secretBox.nonce);
    out.add([secretBox.mac.bytes.length]);
    out.add(secretBox.mac.bytes);
    out.add(secretBox.cipherText);
    final dir = await getTemporaryDirectory();
    final dest = File('${dir.path}/${input.uri.pathSegments.last}.hbsenc');
    await dest.writeAsBytes(out.toBytes(), flush: true);
    return dest;
  }

  static Future<File> decryptFile(File input) async {
    final pass = await passphrase();
    if (pass == null || pass.isEmpty) return input;
    final bytes = await input.readAsBytes();
    if (!looksEncrypted(bytes)) return input;
    var o = 4;
    final salt = bytes.sublist(o, o + 16);
    o += 16;
    final nonceLen = 12;
    final nonce = bytes.sublist(o, o + nonceLen);
    o += nonceLen;
    final macLen = bytes[o];
    o += 1;
    final mac = Mac(bytes.sublist(o, o + macLen));
    o += macLen;
    final cipher = bytes.sublist(o);
    final key = await _key(pass, salt);
    final clear = await _aes.decrypt(
      SecretBox(cipher, nonce: nonce, mac: mac),
      secretKey: key,
    );
    final dir = await getTemporaryDirectory();
    final dest = File('${dir.path}/dec_${input.uri.pathSegments.last.replaceAll('.hbsenc', '')}');
    await dest.writeAsBytes(Uint8List.fromList(clear), flush: true);
    return dest;
  }
}
