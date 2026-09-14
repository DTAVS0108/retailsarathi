import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../services/api_client.dart';

typedef ExportFormat = String; // csv | xlsx | pdf

/// Fetch report export payload and share CSV / Excel / HTML-print PDF.
Future<String> exportAndShareReport(
  ApiClient api, {
  required String path,
  required Map<String, String> query,
  required ExportFormat format,
}) async {
  final q = Map<String, String>.from(query)..['format'] = format;
  final raw = await api.get(path, query: q);
  if (raw is! Map) throw ApiException('Unexpected export response');
  final data = Map<String, dynamic>.from(raw);

  if (format == 'csv') {
    final csv = data['csv']?.toString();
    final filename = data['filename']?.toString() ?? 'export.csv';
    if (csv == null || csv.isEmpty) throw ApiException('Export failed');
    final file = await _writeTemp(filename, utf8.encode(csv));
    await SharePlus.instance.share(
      ShareParams(files: [XFile(file.path, mimeType: 'text/csv', name: filename)]),
    );
    return 'Shared $filename';
  }

  if (format == 'xlsx') {
    final b64 = data['base64']?.toString();
    final filename = data['filename']?.toString() ?? 'export.xlsx';
    if (b64 == null || b64.isEmpty) throw ApiException('Export failed');
    final file = await _writeTemp(filename, base64Decode(b64));
    await SharePlus.instance.share(
      ShareParams(
        files: [
          XFile(
            file.path,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            name: filename,
          ),
        ],
      ),
    );
    return 'Shared $filename';
  }

  if (format == 'pdf') {
    final html = data['html']?.toString();
    final baseName = (data['filename']?.toString() ?? 'export').replaceAll(RegExp(r'\.[^.]+$'), '');
    final filename = '$baseName.html';
    if (html == null || html.isEmpty) throw ApiException('Export failed');
    final file = await _writeTemp(filename, utf8.encode(html));
    await SharePlus.instance.share(
      ShareParams(files: [XFile(file.path, mimeType: 'text/html', name: filename)]),
    );
    return 'Shared print view — open and Save as PDF';
  }

  throw ApiException('Unsupported format');
}

Future<File> _writeTemp(String filename, List<int> bytes) async {
  final dir = await getTemporaryDirectory();
  final safe = filename.replaceAll(RegExp(r'[^\w.\-]+'), '_');
  final file = File('${dir.path}/$safe');
  await file.writeAsBytes(bytes, flush: true);
  return file;
}
