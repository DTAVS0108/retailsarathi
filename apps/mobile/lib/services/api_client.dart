import 'dart:convert';

import 'package:http/http.dart' as http;

class ApiException implements Exception {
  ApiException(this.message);
  final String message;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({required this.baseUrl, this.token});

  String baseUrl;
  String? token;

  Uri _uri(String path, [Map<String, String>? query]) {
    final normalized = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$baseUrl$normalized').replace(queryParameters: query);
  }

  Map<String, String> _headers({bool json = true}) {
    return {
      if (json) 'Content-Type': 'application/json',
      'Accept': 'application/json',
      if (token != null && token!.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  /// Multipart upload (invoice photo / PDF / CSV). Do not set JSON Content-Type.
  Future<dynamic> uploadFile(
    String path, {
    required String filePath,
    String fieldName = 'file',
    String? filename,
    Map<String, String>? fields,
  }) async {
    try {
      final req = http.MultipartRequest('POST', _uri(path));
      if (token != null && token!.isNotEmpty) {
        req.headers['Authorization'] = 'Bearer $token';
      }
      req.headers['Accept'] = 'application/json';
      if (fields != null) req.fields.addAll(fields);
      if (filePath.isNotEmpty) {
        req.files.add(
          await http.MultipartFile.fromPath(
            fieldName,
            filePath,
            filename: filename,
          ),
        );
      }
      final streamed = await req.send();
      final res = await http.Response.fromStream(streamed);
      return _decode(res);
    } on http.ClientException catch (e) {
      throw ApiException(
        'Cannot reach API at $baseUrl. Is the Nest server running on port 4000?\n(${e.message})',
      );
    }
  }

  /// Multipart POST with fields only (e.g. supplier payment without cheque image).
  Future<dynamic> uploadFields(String path, {required Map<String, String> fields}) {
    return uploadFile(path, filePath: '', fields: fields);
  }

  Future<dynamic> get(String path, {Map<String, String>? query}) async {
    try {
      final res = await http.get(_uri(path, query), headers: _headers());
      return _decode(res);
    } on http.ClientException catch (e) {
      throw ApiException(
        'Cannot reach API at $baseUrl. Is the Nest server running on port 4000?\n(${e.message})',
      );
    }
  }

  Future<dynamic> post(String path, {Object? body, Map<String, String>? query}) async {
    try {
      final res = await http.post(
        _uri(path, query),
        headers: _headers(),
        body: body == null ? null : jsonEncode(body),
      );
      return _decode(res);
    } on http.ClientException catch (e) {
      throw ApiException(
        'Cannot reach API at $baseUrl. Is the Nest server running on port 4000?\n(${e.message})',
      );
    }
  }

  Future<dynamic> patch(String path, {Object? body}) async {
    final res = await http.patch(
      _uri(path),
      headers: _headers(),
      body: body == null ? null : jsonEncode(body),
    );
    return _decode(res);
  }

  Future<dynamic> delete(String path) async {
    try {
      final res = await http.delete(_uri(path), headers: _headers());
      return _decode(res);
    } on http.ClientException catch (e) {
      throw ApiException(
        'Cannot reach API at $baseUrl. Is the Nest server running on port 4000?\n(${e.message})',
      );
    }
  }

  /// Convert stored upload path to a browser/app URL under the API host.
  static String? publicUploadUrl(String apiBaseUrl, String? filePath) {
    if (filePath == null || filePath.isEmpty) return null;
    final origin = apiBaseUrl.replaceAll(RegExp(r'/api/v1/?$'), '');
    final n = filePath.replaceAll('\\', '/');
    final idx = n.toLowerCase().lastIndexOf('/uploads/');
    if (idx >= 0) return '$origin${n.substring(idx)}';
    final parts = n.split('/uploads/');
    if (parts.length > 1) return '$origin/uploads/${parts.last}';
    return null;
  }

  dynamic _decode(http.Response res) {
    final raw = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return raw;
    }
    String message = res.reasonPhrase ?? 'API error';
    if (raw is Map && raw['message'] != null) {
      final m = raw['message'];
      message = m is List ? m.join(', ') : m.toString();
    }
    throw ApiException(message);
  }
}
