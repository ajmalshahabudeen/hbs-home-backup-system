import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/app_lock_provider.dart';

class AppLockOverlay extends ConsumerStatefulWidget {
  final Widget child;

  const AppLockOverlay({super.key, required this.child});

  @override
  ConsumerState<AppLockOverlay> createState() => _AppLockOverlayState();
}

class _AppLockOverlayState extends ConsumerState<AppLockOverlay> {
  String _enteredPin = '';
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final lockState = ref.read(appLockProvider);
      if (lockState.isLocked && lockState.isBiometricsEnabled) {
        ref.read(appLockProvider.notifier).authenticateBiometrics();
      }
    });
  }

  void _handleNumberPress(String digit) {
    if (_enteredPin.length < 6) {
      setState(() {
        _enteredPin += digit;
        _error = null;
      });

      if (_enteredPin.length >= 4) {
        final ok = ref.read(appLockProvider.notifier).unlockWithPin(_enteredPin);
        if (!ok && _enteredPin.length >= 4) {
          setState(() {
            _error = 'Incorrect PIN';
            _enteredPin = '';
          });
        }
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
                    Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        color: primary.withValues(alpha: 0.2),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(Icons.lock_rounded, color: primary, size: 32),
                    ),
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
                      'Enter PIN or use biometrics to unlock',
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 13),
                    ),
                    const SizedBox(height: 24),

                    // PIN Dots Indicator
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

                    // Keypad Grid
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
                              onPressed: () => ref.read(appLockProvider.notifier).authenticateBiometrics(),
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
