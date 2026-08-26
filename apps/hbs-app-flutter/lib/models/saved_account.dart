class SavedAccount {
  final String email;
  final String password;
  final String name;
  final String serverUrl;

  const SavedAccount({
    required this.email,
    required this.password,
    this.name = '',
    this.serverUrl = '',
  });

  factory SavedAccount.fromJson(Map<String, dynamic> json) {
    return SavedAccount(
      email: json['email']?.toString() ?? '',
      password: json['password']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      serverUrl: json['serverUrl']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'email': email,
      'password': password,
      'name': name,
      'serverUrl': serverUrl,
    };
  }

  String get displayName => name.isNotEmpty ? name : email.split('@').first;
}
