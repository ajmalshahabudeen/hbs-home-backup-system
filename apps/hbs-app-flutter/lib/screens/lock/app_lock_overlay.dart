import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/widgets/app_logo.dart';
import '../../providers/app_lock_provider.dart';

class AppLockOverlay extends ConsumerStatefulWidget {
  final Widget child;

  const AppLockOverlay({super.key, required this.child});

  @override
  ConsumerState<AppLockOverlay> createState() => _AppLockOverlayState();
}

class _AppLockOverlayState extends ConsumerState<AppLockOverlay> with WidgetsBindingObserver {
  String _enteredPin = '';
  String? _error;
  bool _unlocking = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _promptDeviceUnlock());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused && !_unlocking) {
      ref.read(appLockProvider.notifier).lockNow();
      setState(() {
        _enteredPin = '';
        _error = null;
      });
    }
  }

  Future<void> _promptDeviceUnlock({bool force = false}) async {
    final lockState = ref.read(appLockProvider);
    if (!lockState.isLocked) return;
    if (!force && !lockState.isDeviceLockEnabled) return;
    if (_unlocking) return;

    setState(() => _unlocking = true);
    try {
      await ref.read(appLockProvider.notifier).authenticateDevice();
    } finally {
      if (mounted) setState(() => _unlocking = false);
    }
  }

  void _handleNumberPress(String digit) {
    if (_enteredPin.length >= 4) return;
    setState(() {
      _enteredPin += digit;
      _error = null;
    });

    if (_enteredPin.length == 4) {
      final ok = ref.read(appLockProvider.notifier).unlockWithPin(_enteredPin);
      if (!ok) {
        setState(() {
          _error = 'Incorrect PIN';
          _enteredPin = '';
        });
      }
    }
  }

  void _handleBackspace() {
    if (_enteredPin.isNotEmpty) {
      setState(() {
        _enteredPin = _enteredPin.substring(0, _enteredPin.length - 1);
        _error = null;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final lockState = ref.watch(appLockProvider);

    if (!lockState.isLocked) {
      return widget.child;
    }

    final theme = Theme.of(context);
    final primary = theme.primaryColor;
    final showPin = lockState.hasPin;

    return Stack(
      children: [
        widget.child,
        Scaffold(
          backgroundColor: Colors.black.withValues(alpha: 0.85),
          body: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32.0, vertical: 24.0),
                child: Column(
                  children: [
                    const Spacer(),
                    const AppLogo(size: 72, circular: true),
                    const SizedBox(height: 16),
                    Text(
                      'HBS Cloud Locked',
                      style: theme.textTheme.titleLarge?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      showPin
                          ? 'Unlock with device security or your 4-digit PIN'
                          : 'Unlock with fingerprint, face, or your device PIN',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 13),
                    ),
                    const SizedBox(height: 24),
                    if (showPin)
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: List.generate(4, (index) {
                          final isFilled = index < _enteredPin.length;
                          return Container(
                            width: 14,
                            height: 14,
                            margin: const EdgeInsets.symmetric(horizontal: 8),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: isFilled ? primary : Colors.white.withValues(alpha: 0.2),
                            ),
                          );
                        }),
                      ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13, fontWeight: FontWeight.w600)),
                    ],
                    const Spacer(),
                    if (!showPin)
                      SizedBox(
                        width: double.infinity,
                        height: 52,
                        child: ElevatedButton.icon(
                          onPressed: _unlocking ? null : () => _promptDeviceUnlock(force: true),
                          icon: const Icon(Icons.fingerprint_rounded),
                          label: Text(_unlocking ? 'Waiting for device…' : 'Unlock with device'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: primary,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                          ),
                        ),
                      ),
                    if (showPin)
                      Column(
                        children: [
                          _keypadRow(['1', '2', '3']),
                          const SizedBox(height: 16),
                          _keypadRow(['4', '5', '6']),
                          const SizedBox(height: 16),
                          _keypadRow(['7', '8', '9']),
                          const SizedBox(height: 16),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.fingerprint_rounded, color: Colors.white, size: 32),
                                onPressed: _unlocking ? null : () => _promptDeviceUnlock(force: true),
                              ),
                              _keypadButton('0'),
                              IconButton(
                                icon: const Icon(Icons.backspace_outlined, color: Colors.white, size: 26),
                                onPressed: _handleBackspace,
                              ),
                            ],
                          ),
                        ],
                      ),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _keypadRow(List<String> digits) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: digits.map((d) => _keypadButton(d)).toList(),
    );
  }

  Widget _keypadButton(String digit) {
    return GestureDetector(
      onTap: () => _handleNumberPress(digit),
      child: Container(
        width: 68,
        height: 68,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.white.withValues(alpha: 0.1),
        ),
        alignment: Alignment.center,
        child: Text(
          digit,
          style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}
