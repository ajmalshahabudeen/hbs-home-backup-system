import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/widgets/app_logo.dart';
import '../../core/widgets/glass_card.dart';
import '../../models/saved_account.dart';
import '../../providers/auth_provider.dart';
import '../../providers/server_provider.dart';
import '../../services/storage_service.dart';
import '../settings/lan_scanner_modal.dart';
import 'register_screen.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  bool _showManualForm = false;
  List<SavedAccount> _savedAccounts = [];

  @override
  void initState() {
    super.initState();
    _loadSavedAccounts();
  }

  Future<void> _loadSavedAccounts() async {
    final accounts = await StorageService().getSavedAccounts();
    if (!mounted) return;
    setState(() {
      _savedAccounts = accounts.where((e) => e.email.isNotEmpty && e.password.isNotEmpty).toList();
      _showManualForm = _savedAccounts.isEmpty;
    });
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _signIn(String email, String password, {String? serverUrl}) async {
    if (email.isEmpty || password.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter your email and password')),
      );
      return;
    }
    if (serverUrl != null && serverUrl.isNotEmpty) {
      await ref.read(serverProvider.notifier).setServerUrl(serverUrl);
    }
    final success = await ref.read(authProvider.notifier).signIn(email, password);
    if (success && mounted) {
      Navigator.of(context).popUntil((route) => route.isFirst);
    }
  }

  Future<void> _handleLogin() async {
    await _signIn(_emailController.text.trim(), _passwordController.text);
  }

  Future<void> _forgetAccount(SavedAccount account) async {
    await StorageService().removeSavedAccount(account.email);
    await _loadSavedAccounts();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final primary = theme.primaryColor;
    final authState = ref.watch(authProvider);
    final serverInfo = ref.watch(serverProvider);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 12.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const AppLogo(size: 56, borderRadius: 16),
            const SizedBox(height: 20),
            Text(
              'Welcome Back',
              style: theme.textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.w900,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Sign in to access your cloud photos and files',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.textTheme.bodyMedium?.color?.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(height: 24),
            GestureDetector(
              onTap: () {
                showModalBottomSheet(
                  context: context,
                  isScrollControlled: true,
                  backgroundColor: Colors.transparent,
                  builder: (_) => const LanScannerModal(),
                );
              },
              child: GlassCard(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                borderRadius: 14,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.dns_rounded, size: 16, color: primary),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        serverInfo.url,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: primary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Icon(Icons.edit_rounded, size: 14, color: primary),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            if (authState.errorMessage != null)
              Container(
                margin: const EdgeInsets.only(bottom: 16),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: theme.colorScheme.error.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: theme.colorScheme.error.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.error_outline_rounded, color: theme.colorScheme.error, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        authState.errorMessage!,
                        style: TextStyle(color: theme.colorScheme.error, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
            if (_savedAccounts.isNotEmpty) ...[
              Text(
                'Saved accounts',
                style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              ..._savedAccounts.map((account) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: GlassCard(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    borderRadius: 16,
                    child: Row(
                      children: [
                        CircleAvatar(
                          backgroundColor: primary.withValues(alpha: 0.15),
                          child: Text(
                            account.displayName.isNotEmpty ? account.displayName[0].toUpperCase() : 'U',
                            style: TextStyle(color: primary, fontWeight: FontWeight.w800),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                account.displayName,
                                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                              ),
                              Text(
                                account.email,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: theme.textTheme.bodySmall?.color?.withValues(alpha: 0.65),
                                ),
                              ),
                            ],
                          ),
                        ),
                        TextButton(
                          onPressed: authState.isLoading
                              ? null
                              : () => _signIn(account.email, account.password, serverUrl: account.serverUrl),
                          child: const Text('Sign in'),
                        ),
                        IconButton(
                          tooltip: 'Forget account',
                          icon: const Icon(Icons.close_rounded, size: 18),
                          onPressed: () => _forgetAccount(account),
                        ),
                      ],
                    ),
                  ),
                );
              }),
              TextButton(
                onPressed: () => setState(() => _showManualForm = !_showManualForm),
                child: Text(_showManualForm ? 'Hide other account form' : 'Use a different account'),
              ),
              const SizedBox(height: 8),
            ],
            if (_showManualForm) ...[
              Text(
                'Email Address',
                style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              TextField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                decoration: InputDecoration(
                  hintText: 'user@example.com',
                  prefixIcon: const Icon(Icons.email_outlined, size: 20),
                  filled: true,
                  fillColor: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.03),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
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
              const SizedBox(height: 16),
              Text(
                'Password',
                style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              TextField(
                controller: _passwordController,
                obscureText: _obscurePassword,
                decoration: InputDecoration(
                  hintText: '••••••••',
                  prefixIcon: const Icon(Icons.lock_outline_rounded, size: 20),
                  suffixIcon: IconButton(
                    icon: Icon(
                      _obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                      size: 20,
                    ),
                    onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                  ),
                  filled: true,
                  fillColor: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.03),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
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
              const SizedBox(height: 28),
              SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton(
                  onPressed: authState.isLoading ? null : _handleLogin,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  child: authState.isLoading
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                        )
                      : const Text(
                          'Sign In',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                        ),
                ),
              ),
            ],
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: OutlinedButton.icon(
                icon: const Icon(Icons.g_mobiledata_rounded, size: 28),
                label: const Text(
                  'Continue with Google',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                ),
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Redirecting to Google Sign-In...')),
                  );
                },
                style: OutlinedButton.styleFrom(
                  side: BorderSide(
                    color: isDark ? Colors.white.withValues(alpha: 0.15) : Colors.black.withValues(alpha: 0.12),
                  ),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
              ),
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  "Don't have an account? ",
                  style: TextStyle(color: theme.textTheme.bodyMedium?.color?.withValues(alpha: 0.7)),
                ),
                GestureDetector(
                  onTap: () {
                    Navigator.of(context).pushReplacement(
                      MaterialPageRoute(builder: (_) => const RegisterScreen()),
                    );
                  },
                  child: Text(
                    'Sign Up',
                    style: TextStyle(
                      color: primary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
