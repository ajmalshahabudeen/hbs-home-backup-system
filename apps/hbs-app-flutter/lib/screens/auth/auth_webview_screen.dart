import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// In-app page for Better Auth passkey / OAuth callbacks.
/// Intercepts `hbscloud://` so the system browser is never opened.
class AuthWebViewScreen extends StatefulWidget {
  final String url;
  final String title;

  const AuthWebViewScreen({
    super.key,
    required this.url,
    this.title = 'HBS Cloud',
  });

  static Future<Uri?> open(BuildContext context, {required String url, String title = 'Sign in'}) {
    return Navigator.of(context).push<Uri>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => AuthWebViewScreen(url: url, title: title),
      ),
    );
  }

  @override
  State<AuthWebViewScreen> createState() => _AuthWebViewScreenState();
}

class _AuthWebViewScreenState extends State<AuthWebViewScreen> {
  late final WebViewController _controller;
  var _loading = true;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (mounted) setState(() => _loading = true);
          },
          onPageFinished: (_) {
            if (mounted) setState(() => _loading = false);
          },
          onNavigationRequest: (request) {
            final uri = Uri.tryParse(request.url);
            if (uri != null && uri.scheme == 'hbscloud') {
              Navigator.of(context).pop(uri);
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.url));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_loading) const LinearProgressIndicator(),
        ],
      ),
    );
  }
}
