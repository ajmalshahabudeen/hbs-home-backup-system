class UserModel {
  final String id;
  final String email;
  final String name;
  final String? image;
  final String? role;

  const UserModel({
    required this.id,
    required this.email,
    required this.name,
    this.image,
    this.role,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      image: json['image']?.toString(),
      role: json['role']?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'email': email,
      'name': name,
      'image': image,
      'role': role,
    };
  }
}
