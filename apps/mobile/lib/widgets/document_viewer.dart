import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:pdfx/pdfx.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/api_client.dart';
import '../theme/app_theme.dart';
import '../widgets/app_toast.dart';

enum DocumentKind { image, pdf, other }

class DocumentViewer {
  DocumentViewer._();

  static String? resolveUrl(String apiBaseUrl, String? pathOrUrl) {
    if (pathOrUrl == null || pathOrUrl.isEmpty) return null;
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      return pathOrUrl;
    }
    return ApiClient.publicUploadUrl(apiBaseUrl, pathOrUrl);
  }

  static DocumentKind kind(String url, {String? mimeType, String? fileName}) {
    final mime = (mimeType ?? '').toLowerCase();
    final name = (fileName ?? url).toLowerCase();
    if (mime.startsWith('image/') || _isImageExt(name)) return DocumentKind.image;
    if (mime.contains('pdf') || name.endsWith('.pdf')) return DocumentKind.pdf;
    if (url.contains('/uploads/repairs/') && !name.endsWith('.pdf')) {
      return DocumentKind.image;
    }
    return DocumentKind.other;
  }

  static bool _isImageExt(String value) {
    return RegExp(r'\.(jpe?g|png|gif|webp|bmp|heic|heif)(\?|$)').hasMatch(value);
  }

  static Future<void> open(
    BuildContext context, {
    required String apiBaseUrl,
    String? path,
    String? url,
    String? mimeType,
    String? fileName,
  }) async {
    final resolved = url ?? resolveUrl(apiBaseUrl, path);
    if (resolved == null) return;

    final docKind = kind(resolved, mimeType: mimeType, fileName: fileName);
    if (!context.mounted) return;

    if (docKind == DocumentKind.image) {
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => _ImageViewerScreen(url: resolved, title: fileName),
        ),
      );
      return;
    }

    if (docKind == DocumentKind.pdf) {
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => _PdfViewerScreen(url: resolved, title: fileName),
        ),
      );
      return;
    }

    final uri = Uri.tryParse(resolved);
    if (uri != null) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  static Future<void> shareUrl(
    BuildContext context, {
    required String url,
    String? fileName,
  }) async {
    try {
      final res = await http.get(Uri.parse(url));
      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw Exception('Download failed (${res.statusCode})');
      }
      final dir = await getTemporaryDirectory();
      final name = (fileName == null || fileName.trim().isEmpty)
          ? 'document_${DateTime.now().millisecondsSinceEpoch}'
          : fileName.replaceAll(RegExp(r'[^\w.\-]+'), '_');
      final file = File('${dir.path}/$name');
      await file.writeAsBytes(res.bodyBytes);
      await SharePlus.instance.share(
        ShareParams(files: [XFile(file.path)], text: name),
      );
    } catch (e) {
      if (context.mounted) showErrorToast(context, e.toString());
    }
  }
}

class DocumentAttachmentTile extends StatelessWidget {
  const DocumentAttachmentTile({
    super.key,
    required this.apiBaseUrl,
    this.path,
    this.url,
    this.mimeType,
    this.fileName,
    this.height = 180,
    this.compact = false,
  });

  final String apiBaseUrl;
  final String? path;
  final String? url;
  final String? mimeType;
  final String? fileName;
  final double height;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final resolved = url ?? DocumentViewer.resolveUrl(apiBaseUrl, path);
    if (resolved == null) return const SizedBox.shrink();

    final docKind = DocumentViewer.kind(resolved, mimeType: mimeType, fileName: fileName);
    final label = fileName ?? 'Document';

    if (compact) {
      return TextButton.icon(
        onPressed: () => DocumentViewer.open(
          context,
          apiBaseUrl: apiBaseUrl,
          path: path,
          url: url,
          mimeType: mimeType,
          fileName: fileName,
        ),
        icon: Icon(docKind == DocumentKind.pdf ? Icons.picture_as_pdf_outlined : Icons.image_outlined),
        label: Text('View $label', overflow: TextOverflow.ellipsis),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InkWell(
          onTap: () => DocumentViewer.open(
            context,
            apiBaseUrl: apiBaseUrl,
            path: path,
            url: url,
            mimeType: mimeType,
            fileName: fileName,
          ),
          borderRadius: BorderRadius.circular(12),
          child: Ink(
            height: height,
            decoration: BoxDecoration(
              color: AppColors.tealSoft.withValues(alpha: 0.35),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.tealSoft),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(11),
              child: docKind == DocumentKind.image
                  ? Image.network(
                      resolved,
                      fit: BoxFit.contain,
                      width: double.infinity,
                      errorBuilder: (_, __, ___) => _fallbackTile(docKind, label),
                    )
                  : docKind == DocumentKind.pdf
                      ? Stack(
                          fit: StackFit.expand,
                          children: [
                            const ColoredBox(color: Colors.white),
                            Center(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.picture_as_pdf, size: 48, color: AppColors.tealDark),
                                  const SizedBox(height: 8),
                                  Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 12),
                                    child: Text(
                                      label,
                                      textAlign: TextAlign.center,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        )
                      : _fallbackTile(docKind, label),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: TextButton(
                onPressed: () => DocumentViewer.open(
                  context,
                  apiBaseUrl: apiBaseUrl,
                  path: path,
                  url: url,
                  mimeType: mimeType,
                  fileName: fileName,
                ),
                child: Text('Expand · $label', overflow: TextOverflow.ellipsis),
              ),
            ),
            IconButton(
              tooltip: 'Share',
              onPressed: () => DocumentViewer.shareUrl(context, url: resolved, fileName: fileName),
              icon: const Icon(Icons.ios_share_rounded, size: 20),
            ),
          ],
        ),
      ],
    );
  }

  Widget _fallbackTile(DocumentKind docKind, String label) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            docKind == DocumentKind.pdf ? Icons.picture_as_pdf_outlined : Icons.insert_drive_file_outlined,
            size: 40,
            color: AppColors.tealDark,
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              label,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

class _ImageViewerScreen extends StatelessWidget {
  const _ImageViewerScreen({required this.url, this.title});

  final String url;
  final String? title;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(title ?? 'Image', style: const TextStyle(color: Colors.white)),
        actions: [
          IconButton(
            onPressed: () => DocumentViewer.shareUrl(context, url: url, fileName: title),
            icon: const Icon(Icons.ios_share_rounded),
            tooltip: 'Share',
          ),
          IconButton(
            onPressed: () => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication),
            icon: const Icon(Icons.open_in_new),
            tooltip: 'Open externally',
          ),
        ],
      ),
      body: InteractiveViewer(
        minScale: 0.4,
        maxScale: 6,
        child: SizedBox.expand(
          child: Image.network(
            url,
            fit: BoxFit.contain,
            loadingBuilder: (_, child, progress) {
              if (progress == null) return child;
              return const Center(child: CircularProgressIndicator(color: Colors.white));
            },
            errorBuilder: (_, __, ___) => const Center(
              child: Text('Could not load image', style: TextStyle(color: Colors.white70)),
            ),
          ),
        ),
      ),
    );
  }
}

class _PdfViewerScreen extends StatefulWidget {
  const _PdfViewerScreen({required this.url, this.title});

  final String url;
  final String? title;

  @override
  State<_PdfViewerScreen> createState() => _PdfViewerScreenState();
}

class _PdfViewerScreenState extends State<_PdfViewerScreen> {
  PdfControllerPinch? _controller;
  String? _error;
  int _page = 1;
  int _pages = 0;
  Uint8List? _bytes;

  @override
  void initState() {
    super.initState();
    _controller = PdfControllerPinch(
      document: _loadDocument(widget.url),
    );
  }

  Future<PdfDocument> _loadDocument(String url) async {
    final res = await http.get(Uri.parse(url));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('HTTP ${res.statusCode}');
    }
    _bytes = res.bodyBytes;
    return PdfDocument.openData(res.bodyBytes);
  }

  Future<void> _share() async {
    try {
      var bytes = _bytes;
      if (bytes == null) {
        final res = await http.get(Uri.parse(widget.url));
        if (res.statusCode < 200 || res.statusCode >= 300) {
          throw Exception('Download failed');
        }
        bytes = res.bodyBytes;
      }
      final dir = await getTemporaryDirectory();
      final name = (widget.title ?? 'document').replaceAll(RegExp(r'[^\w.\-]+'), '_');
      final file = File('${dir.path}/${name.endsWith('.pdf') ? name : '$name.pdf'}');
      await file.writeAsBytes(bytes);
      await SharePlus.instance.share(ShareParams(files: [XFile(file.path, mimeType: 'application/pdf')]));
    } catch (e) {
      if (mounted) showErrorToast(context, e.toString());
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: Text(widget.title ?? 'PDF'),
        actions: [
          if (_pages > 0)
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text('$_page / $_pages', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600)),
              ),
            ),
          IconButton(
            onPressed: _share,
            icon: const Icon(Icons.ios_share_rounded),
            tooltip: 'Share',
          ),
          IconButton(
            onPressed: () => launchUrl(Uri.parse(widget.url), mode: LaunchMode.externalApplication),
            icon: const Icon(Icons.open_in_new),
            tooltip: 'Open externally',
          ),
        ],
      ),
      body: controller == null
          ? const Center(child: CircularProgressIndicator())
          : PdfViewPinch(
              controller: controller,
              onDocumentLoaded: (doc) => setState(() => _pages = doc.pagesCount),
              onPageChanged: (page) => setState(() => _page = page),
              onDocumentError: (error) => setState(() => _error = error.toString()),
              builders: PdfViewPinchBuilders<DefaultBuilderOptions>(
                options: const DefaultBuilderOptions(),
                documentLoaderBuilder: (_) => const Center(child: CircularProgressIndicator()),
                errorBuilder: (_, error) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error ?? error.toString(), textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        FilledButton(
                          onPressed: () => launchUrl(
                            Uri.parse(widget.url),
                            mode: LaunchMode.externalApplication,
                          ),
                          child: const Text('Open in browser'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
    );
  }
}
