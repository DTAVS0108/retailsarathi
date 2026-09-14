import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';
import '../l10n/app_strings.dart';

import '../models/models.dart';
import '../services/auth_state.dart';
import '../theme/app_theme.dart';
import '../widgets/app_loader.dart';
import '../widgets/document_viewer.dart';
import '../theme/app_ui.dart';
import 'barcode_scanner_screen.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹');

class StockInScreen extends StatefulWidget {
  const StockInScreen({super.key, this.resumeDraftId, this.resumePreview});

  final String? resumeDraftId;
  final Map<String, dynamic>? resumePreview;

  @override
  State<StockInScreen> createState() => _StockInScreenState();
}

class _StockLine {
  _StockLine({
    required this.name,
    required this.quantity,
    this.unitPrice = 0,
    this.salePrice = 0,
    this.hsnCode,
    this.gstRate = 18,
    this.brand,
    this.category,
    this.model,
    this.barcode,
    this.sku,
    this.productId,
    this.matchedName,
    this.matchScore,
    this.currentStock,
    this.createIfMissing = true,
    this.selected = true,
    this.trackSerial = false,
    this.serialNumbers = '',
    this.commitStock = true,
    this.catalogTracksSerial = false,
  });

  String name;
  double quantity;
  double unitPrice;
  double salePrice;
  String? hsnCode;
  double gstRate;
  String? brand;
  String? category;
  String? model;
  String? barcode;
  String? sku;
  String? productId;
  String? matchedName;
  double? matchScore;
  double? currentStock;
  bool createIfMissing;
  bool selected;
  bool trackSerial;
  String serialNumbers;
  bool commitStock;
  /// Product master tracks serials — user must opt in to enter them on stock-in.
  bool catalogTracksSerial;
}

class _StockInScreenState extends State<StockInScreen> {
  final textCtrl = TextEditingController();
  final jsonCtrl = TextEditingController();
  bool showJson = false;
  String? jsonError;
  final supplierCtrl = TextEditingController();
  final invoiceNoCtrl = TextEditingController();
  final invoiceDateCtrl = TextEditingController();
  final gstinCtrl = TextEditingController();
  final bankNameCtrl = TextEditingController();
  final bankAccountCtrl = TextEditingController();
  final ifscCtrl = TextEditingController();
  final bankBranchCtrl = TextEditingController();

  final picker = ImagePicker();
  String? uploadId;
  String? uploadedDocUrl;
  String? uploadedDocMime;
  String? uploadedDocName;
  String? draftId;
  String? fileLabel;
  List<_StockLine> lines = [];
  bool busy = false;
  bool ocrRunning = false;
  String? error;
  String? success;
  int? expandedLine;
  int pageCount = 0;
  String? _supplierAddress;
  String? _supplierPhone;
  double? _taxableValue;
  double? _taxAmount;
  double? _totalAmount;
  double? _cgstAmount;
  double? _sgstAmount;
  double? _igstAmount;
  String? _irn;
  String? _ackNo;
  String? _ewayBillNo;
  String? _vehicleNo;
  String? _placeOfSupply;
  String? _stateName;
  String? _customerName;
  String? _customerGstin;
  bool _appendToExistingBill = false;
  String? _duplicateInvoiceMsg;
  // ignore: unused_field — reserved when linking duplicate supplier bill UI
  String? _duplicateBillId;

  void _applyUploadMeta(Map<String, dynamic> map) {
    if (map['upload'] is! Map) return;
    final upload = asStringKeyedMap(map['upload'] as Map);
    uploadId = upload['id']?.toString();
    uploadedDocUrl = upload['url']?.toString();
    uploadedDocMime = upload['mimeType']?.toString();
    uploadedDocName = upload['originalName']?.toString();
  }

  Future<void> _refreshUploadedDoc() async {
    if (uploadId == null || uploadId!.isEmpty) return;
    try {
      final api = context.read<AuthState>().api;
      final raw = await api.get('/scan/uploads/$uploadId');
      final map = asStringKeyedMap(raw);
      if (!mounted) return;
      setState(() {
        uploadedDocUrl = map['url']?.toString();
        uploadedDocMime = map['mimeType']?.toString();
        uploadedDocName = map['originalName']?.toString();
      });
    } catch (_) {
      /* ignore */
    }
  }

  String _formatInvoiceText(String raw) {
    var s = raw.replaceAll('\r\n', '\n').replaceAll('\r', '\n').replaceAll('\u00a0', ' ');
    s = s.replaceAll(RegExp(r'[ \t]+\n'), '\n');
    s = s
        .split('\n')
        .map((line) => line.replaceAll(RegExp(r'[ \t]{2,}'), ' ').trimRight())
        .join('\n');
    s = s.replaceAllMapped(
      RegExp(r'[ \t]*----- PAGE\s+(\d+)\s*-----[ \t]*', caseSensitive: false),
      (m) => '\n\n----- PAGE ${m[1]} -----\n\n',
    );
    s = s.replaceAll(RegExp(r'\n{3,}'), '\n\n');
    return s.trim();
  }

  String _prettyJson(Object? value) {
    try {
      return const JsonEncoder.withIndent('  ').convert(value);
    } catch (_) {
      return '';
    }
  }

  Map<String, dynamic> _buildEditableJson() {
    return {
      'supplier': {
        'name': supplierCtrl.text.trim().isEmpty ? null : supplierCtrl.text.trim(),
        'gstin': gstinCtrl.text.trim().isEmpty ? null : gstinCtrl.text.trim(),
        'phone': _supplierPhone,
        'address': _supplierAddress,
        'stateName': _stateName,
        'bankName': bankNameCtrl.text.trim().isEmpty ? null : bankNameCtrl.text.trim(),
        'bankAccount': bankAccountCtrl.text.trim().isEmpty ? null : bankAccountCtrl.text.trim(),
        'ifsc': ifscCtrl.text.trim().isEmpty ? null : ifscCtrl.text.trim(),
        'bankBranch': bankBranchCtrl.text.trim().isEmpty ? null : bankBranchCtrl.text.trim(),
      },
      'invoice': {
        'number': invoiceNoCtrl.text.trim().isEmpty ? null : invoiceNoCtrl.text.trim(),
        'date': invoiceDateCtrl.text.trim().isEmpty ? null : invoiceDateCtrl.text.trim(),
        'irn': _irn,
        'ackNo': _ackNo,
        'ewayBillNo': _ewayBillNo,
        'vehicleNo': _vehicleNo,
        'placeOfSupply': _placeOfSupply,
        'totalAmount': _totalAmount,
        'taxableValue': _taxableValue,
        'cgstAmount': _cgstAmount,
        'sgstAmount': _sgstAmount,
        'taxAmount': _taxAmount,
      },
      'customer': {
        'name': _customerName,
        'gstin': _customerGstin,
      },
      'items': lines
          .map(
            (l) => {
              'name': l.name,
              'hsnCode': l.hsnCode,
              'quantity': l.quantity,
              'unitPrice': l.unitPrice,
              'gstRate': l.gstRate,
              'brand': l.brand,
              'category': l.category,
            },
          )
          .toList(),
    };
  }

  void _switchDataView(bool toJson) {
    setState(() {
      if (toJson) {
        jsonCtrl.text = _prettyJson(_buildEditableJson());
        jsonError = null;
      } else {
        textCtrl.text = _formatInvoiceText(textCtrl.text);
      }
      showJson = toJson;
    });
  }

  bool _applyEditedJson(String raw) {
    try {
      final data = jsonDecode(raw);
      if (data is! Map) {
        setState(() {
          jsonError = 'JSON must be an object';
          error = 'JSON is invalid';
        });
        return false;
      }
      final map = asStringKeyedMap(data);
      final supplier = map['supplier'] is Map ? asStringKeyedMap(map['supplier'] as Map) : map;
      final invoice = map['invoice'] is Map ? asStringKeyedMap(map['invoice'] as Map) : map;
      final customer = map['customer'] is Map ? asStringKeyedMap(map['customer'] as Map) : <String, dynamic>{};
      final items = map['items'] is List
          ? map['items'] as List
          : map['lines'] is List
              ? map['lines'] as List
              : const [];

      if (supplier['name'] != null) supplierCtrl.text = supplier['name'].toString();
      if (supplier['gstin'] != null) gstinCtrl.text = supplier['gstin'].toString().toUpperCase();
      _supplierPhone = supplier['phone']?.toString();
      _supplierAddress = supplier['address']?.toString();
      _stateName = supplier['stateName']?.toString();
      if (supplier['bankName'] != null) bankNameCtrl.text = supplier['bankName'].toString();
      if (supplier['bankAccount'] != null) bankAccountCtrl.text = supplier['bankAccount'].toString();
      if (supplier['ifsc'] != null) ifscCtrl.text = supplier['ifsc'].toString().toUpperCase();
      if (supplier['bankBranch'] != null) bankBranchCtrl.text = supplier['bankBranch'].toString();

      if (invoice['number'] != null) invoiceNoCtrl.text = invoice['number'].toString();
      if (invoice['date'] != null) invoiceDateCtrl.text = invoice['date'].toString();
      _irn = invoice['irn']?.toString();
      _ackNo = invoice['ackNo']?.toString();
      _ewayBillNo = invoice['ewayBillNo']?.toString();
      _vehicleNo = invoice['vehicleNo']?.toString();
      _placeOfSupply = invoice['placeOfSupply']?.toString();
      _totalAmount = invoice['totalAmount'] == null ? null : asDouble(invoice['totalAmount']);
      _taxableValue = invoice['taxableValue'] == null ? null : asDouble(invoice['taxableValue']);
      _cgstAmount = invoice['cgstAmount'] == null ? null : asDouble(invoice['cgstAmount']);
      _sgstAmount = invoice['sgstAmount'] == null ? null : asDouble(invoice['sgstAmount']);
      _taxAmount = invoice['taxAmount'] == null ? null : asDouble(invoice['taxAmount']);

      _customerName = customer['name']?.toString();
      _customerGstin = customer['gstin']?.toString();

      final next = <_StockLine>[];
      for (final raw in items.whereType<Map>()) {
        final m = asStringKeyedMap(raw);
        next.add(
          _StockLine(
            name: m['name']?.toString() ?? '',
            quantity: asDouble(m['quantity'], 1),
            unitPrice: asDouble(m['unitPrice']),
            salePrice: asDouble(m['salePrice'], asDouble(m['unitPrice']) * 1.2),
            hsnCode: m['hsnCode']?.toString(),
            gstRate: asDouble(m['gstRate'], 18),
            brand: m['brand']?.toString(),
            category: m['category']?.toString(),
            model: m['model']?.toString(),
            barcode: m['barcode']?.toString(),
            sku: m['sku']?.toString(),
            productId: m['productId']?.toString(),
            createIfMissing: m['createIfMissing'] != false,
            selected: true,
            trackSerial: false,
            catalogTracksSerial: false,
            serialNumbers: '',
            commitStock: true,
          ),
        );
      }

      setState(() {
        jsonCtrl.text = _prettyJson(map);
        jsonError = null;
        if (next.isNotEmpty) {
          lines = next;
          expandedLine = 0;
        }
        error = null;
        success = 'JSON applied — review lines and confirm.';
      });
      return true;
    } catch (e) {
      setState(() {
        jsonError = e.toString();
        error = 'JSON is invalid — fix it before applying.';
      });
      return false;
    }
  }

  String _mergePageText(String existing, String pageText, int pageNo) {
    final chunk = pageText.trim();
    if (chunk.isEmpty) return existing;
    final marker = '\n\n----- PAGE $pageNo -----\n\n';
    var base = existing.trim();
    if (base.isEmpty) return '----- PAGE $pageNo -----\n\n$chunk';
    // First time we add page 2+, label the original block as PAGE 1.
    if (pageNo == 2 && !base.contains('----- PAGE ')) {
      base = '----- PAGE 1 -----\n\n$base';
    }
    return '$base$marker$chunk';
  }

  @override
  void initState() {
    super.initState();
    draftId = widget.resumeDraftId;
    invoiceNoCtrl.addListener(_onInvoiceNumberChanged);
    if (widget.resumePreview != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _applyPreview(widget.resumePreview!, null, resume: true);
        setState(() => success = 'Draft resumed — finish enrichment and confirm.');
      });
    }
  }

  void _onInvoiceNumberChanged() {
    final key = invoiceNoCtrl.text.trim();
    if (key.isEmpty) {
      if (_duplicateInvoiceMsg != null || _appendToExistingBill) {
        setState(() {
          _duplicateInvoiceMsg = null;
          _duplicateBillId = null;
          _appendToExistingBill = false;
        });
      }
      return;
    }
    Future<void>.delayed(const Duration(milliseconds: 450), () async {
      if (!mounted || invoiceNoCtrl.text.trim() != key) return;
      try {
        final api = context.read<AuthState>().api;
        final raw = await api.get(
          '/purchase-bills/check-invoice?invoiceNumber=${Uri.encodeComponent(key)}',
        );
        final map = asStringKeyedMap(raw);
        if (!mounted || invoiceNoCtrl.text.trim() != key) return;
        final exists = map['exists'] == true;
        setState(() {
          if (exists) {
            _duplicateInvoiceMsg =
                map['message']?.toString() ?? 'Invoice $key already exists';
            final bill = map['bill'];
            _duplicateBillId =
                bill is Map ? asStringKeyedMap(bill)['id']?.toString() : null;
          } else {
            _duplicateInvoiceMsg = null;
            _duplicateBillId = null;
            _appendToExistingBill = false;
          }
        });
      } catch (_) {
        /* ignore check errors — confirm will still enforce */
      }
    });
  }

  @override
  void dispose() {
    textCtrl.dispose();
    jsonCtrl.dispose();
    supplierCtrl.dispose();
    invoiceNoCtrl.dispose();
    invoiceDateCtrl.dispose();
    gstinCtrl.dispose();
    bankNameCtrl.dispose();
    bankAccountCtrl.dispose();
    ifscCtrl.dispose();
    bankBranchCtrl.dispose();
    super.dispose();
  }

  Future<String?> _ocrImageBytes(Uint8List bytes, {required String tempName}) async {
    final dir = await getTemporaryDirectory();
    final tmp = File('${dir.path}${Platform.pathSeparator}$tempName');
    await tmp.writeAsBytes(bytes, flush: true);
    try {
      return await _ocrImageFile(tmp.path);
    } finally {
      try {
        await tmp.delete();
      } catch (_) {}
    }
  }

  Future<String?> _ocrImageFile(String path) async {
    final recognizer = TextRecognizer(script: TextRecognitionScript.latin);
    try {
      final input = InputImage.fromFilePath(path);
      final result = await recognizer.processImage(input);
      final text = result.text.trim();
      return text.isEmpty ? null : text;
    } catch (_) {
      return null;
    } finally {
      await recognizer.close();
    }
  }

  Future<String?> _ocrImage(String path) async {
    setState(() => ocrRunning = true);
    try {
      return await _ocrImageFile(path);
    } finally {
      if (mounted) setState(() => ocrRunning = false);
    }
  }

  /// Rasterize PDF pages and OCR each (scanned or text PDFs).
  Future<String?> _ocrPdf(String path) async {
    setState(() => ocrRunning = true);
    try {
      final bytes = await File(path).readAsBytes();
      final parts = <String>[];
      var pageNo = 0;
      await for (final page in Printing.raster(bytes, dpi: 160)) {
        pageNo++;
        if (pageNo > 10) break;
        final png = await page.toPng();
        final text = await _ocrImageBytes(png, tempName: 'stockin_pdf_$pageNo.png');
        if (text != null && text.trim().isNotEmpty) {
          parts.add(pageNo == 1 && parts.isEmpty
              ? text
              : '----- PAGE $pageNo -----\n\n$text');
        }
      }
      if (parts.isEmpty) return null;
      if (parts.length == 1 && !parts.first.contains('----- PAGE ')) return parts.first;
      // Ensure first page has a marker when multi-page
      if (parts.length > 1 && !parts.first.startsWith('----- PAGE ')) {
        parts[0] = '----- PAGE 1 -----\n\n${parts.first}';
      }
      return parts.join('\n\n');
    } catch (_) {
      return null;
    } finally {
      if (mounted) setState(() => ocrRunning = false);
    }
  }

  void _applyPreview(Map<String, dynamic> preview, String? id, {bool resume = false}) {
    supplierCtrl.text = preview['supplierName']?.toString() ?? '';
    invoiceNoCtrl.text = preview['invoiceNumber']?.toString() ?? '';
    invoiceDateCtrl.text = preview['invoiceDate']?.toString() ?? '';
    gstinCtrl.text = preview['gstin']?.toString() ?? '';
    if (preview['extractedText'] != null) {
      textCtrl.text = _formatInvoiceText(preview['extractedText'].toString());
    }
    _supplierAddress = preview['supplierAddress']?.toString();
    _supplierPhone = preview['phone']?.toString() ?? preview['supplierPhone']?.toString();
    _taxableValue = preview['taxableValue'] == null ? null : asDouble(preview['taxableValue']);
    _taxAmount = preview['taxAmount'] == null ? null : asDouble(preview['taxAmount']);
    _totalAmount = preview['totalAmount'] == null ? null : asDouble(preview['totalAmount']);
    _cgstAmount = preview['cgstAmount'] == null ? null : asDouble(preview['cgstAmount']);
    _sgstAmount = preview['sgstAmount'] == null ? null : asDouble(preview['sgstAmount']);
    _igstAmount = preview['igstAmount'] == null ? null : asDouble(preview['igstAmount']);
    _irn = preview['irn']?.toString();
    _ackNo = preview['ackNo']?.toString();
    _ewayBillNo = preview['ewayBillNo']?.toString();
    _vehicleNo = preview['vehicleNo']?.toString();
    bankNameCtrl.text = preview['bankName']?.toString() ?? '';
    bankAccountCtrl.text = preview['bankAccount']?.toString() ?? '';
    ifscCtrl.text = preview['ifsc']?.toString() ?? '';
    bankBranchCtrl.text = preview['bankBranch']?.toString() ?? '';
    _placeOfSupply = preview['placeOfSupply']?.toString();
    _stateName = preview['stateName']?.toString();
    _customerName = preview['customerName']?.toString();
    _customerGstin = preview['customerGstin']?.toString();
    final rawLines = preview['lines'];
    final next = <_StockLine>[];
    if (rawLines is List) {
      for (final raw in rawLines.whereType<Map>()) {
        final m = asStringKeyedMap(raw);
        final serialText = m['serialNumbers'] is List
            ? (m['serialNumbers'] as List).join('\n')
            : (m['serialNumbers']?.toString() ?? '');
        next.add(
          _StockLine(
            name: m['name']?.toString() ?? m['matchedName']?.toString() ?? '',
            quantity: asDouble(m['quantity'], 1),
            unitPrice: asDouble(m['unitPrice']),
            salePrice: asDouble(m['salePrice'], asDouble(m['unitPrice']) * 1.2),
            hsnCode: m['hsnCode']?.toString(),
            gstRate: asDouble(m['gstRate'], 18),
            brand: m['brand']?.toString(),
            category: m['category']?.toString(),
            model: m['model']?.toString(),
            barcode: m['barcode']?.toString(),
            sku: m['sku']?.toString(),
            productId: m['productId']?.toString(),
            matchedName: m['matchedName']?.toString(),
            matchScore: m['matchScore'] == null ? null : asDouble(m['matchScore']),
            currentStock: m['currentStock'] == null ? null : asDouble(m['currentStock']),
            createIfMissing: m['createIfMissing'] != false,
            selected: resume ? m['selected'] != false : true,
            // Fresh parse: do NOT auto-enable trackSerial from catalog match.
            // Resume: restore user's trackSerial + serials from the draft.
            trackSerial: resume ? m['trackSerial'] == true : false,
            catalogTracksSerial: m['trackSerial'] == true || m['catalogTracksSerial'] == true,
            serialNumbers: resume ? serialText : '',
            commitStock: m['commitStock'] != false,
          ),
        );
      }
    }
    // JSON mirrors form fields (after controllers are set) — not raw OCR text.
    setState(() {
      uploadId = id ?? preview['uploadId']?.toString() ?? uploadId;
      lines = next;
      expandedLine = next.isEmpty ? null : 0;
      error = null;
      jsonCtrl.text = _prettyJson(_buildEditableJson());
      final quality = preview['extractionQuality']?.toString();
      if (resume) {
        success = next.isEmpty
            ? 'Draft resumed — add items, then confirm.'
            : 'Draft resumed — ${next.length} line(s). Finish enrich and confirm.';
      } else if (next.isEmpty) {
        success =
            'No product lines found from OCR. Edit the Text tab, then tap Parse for stock-in.';
      } else if (quality == 'poor' || quality == 'fair') {
        success =
            'Found ${next.length} line(s) — OCR was noisy. Fix supplier name in the form or JSON, then confirm.';
      } else {
        success = 'Found ${next.length} line(s). Review supplier & lines, then confirm.';
      }
    });
  }

  Future<void> _uploadPath(
    String path, {
    String? name,
    String? extractedText,
    bool append = false,
    int pageNo = 1,
  }) async {
    setState(() {
      busy = true;
      error = null;
      success = null;
      fileLabel = name ?? path.split(Platform.pathSeparator).last;
    });
    try {
      final api = context.read<AuthState>().api;
      final fields = <String, String>{};
      if (extractedText != null && extractedText.trim().isNotEmpty) {
        fields['extractedText'] = extractedText.trim();
      }
      final raw = await api.uploadFile(
        '/scan/upload',
        filePath: path,
        filename: name,
        fields: fields.isEmpty ? null : fields,
      );
      final map = asStringKeyedMap(raw);
      _applyUploadMeta(map);
      final serverText = map['extractedText']?.toString() ?? '';
      // When appending pages, keep the merged text already in the box.
      final text = append
          ? (extractedText?.trim().isNotEmpty == true ? extractedText!.trim() : textCtrl.text.trim())
          : (serverText.isNotEmpty ? serverText : (extractedText ?? ''));
      if (!append && text.isNotEmpty) textCtrl.text = _formatInvoiceText(text);

      if (map['needsOcr'] == true && (extractedText == null || extractedText.isEmpty)) {
        setState(() {
          uploadId = map['upload'] is Map ? (map['upload'] as Map)['id']?.toString() : null;
          error =
              'Could not read text from image. Try again, or paste invoice lines below and tap Parse.';
        });
        await _refreshUploadedDoc();
        return;
      }

      if (map['kept'] == false && !append) {
        setState(() => error = map['message']?.toString() ?? 'File not recognized as invoice');
        return;
      }

      final preview = map['purchasePreview'];
      final id = map['upload'] is Map ? (map['upload'] as Map)['id']?.toString() : null;
      if (append && text.trim().isNotEmpty) {
        await _parseText(text, id ?? uploadId);
        if (mounted) {
          setState(() {
            success =
                'Page $pageNo added. Re-parsed full bill — review all lines, then confirm.';
          });
        }
      } else if (!append &&
          preview is Map &&
          (preview['lines'] is List) &&
          (preview['lines'] as List).isNotEmpty) {
        _applyPreview(asStringKeyedMap(preview), id);
      } else if (text.trim().isNotEmpty) {
        await _parseText(text, id);
      } else {
        setState(() {
          uploadId = id;
          error = map['message']?.toString() ?? 'No stock lines extracted';
        });
      }
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _parseText(String text, [String? id]) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final raw = await api.post('/scan/parse-purchase', body: {'text': text});
      final map = asStringKeyedMap(raw);
      _applyPreview(map, id ?? uploadId);
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _fromCamera({bool append = false}) async {
    final shot = await picker.pickImage(source: ImageSource.camera, imageQuality: 85);
    if (shot == null) return;
    final ocr = await _ocrImage(shot.path);
    await _ingestPage(path: shot.path, name: shot.name, extractedText: ocr, append: append);
  }

  Future<void> _fromGallery({bool append = false}) async {
    final shot = await picker.pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (shot == null) return;
    final ocr = await _ocrImage(shot.path);
    await _ingestPage(path: shot.path, name: shot.name, extractedText: ocr, append: append);
  }

  Future<void> _fromFile({bool append = false}) async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: [
        'pdf',
        'csv',
        'xlsx',
        'xls',
        'txt',
        'jpg',
        'jpeg',
        'png',
        'webp',
        'gif',
        'bmp',
      ],
      withData: false,
    );
    if (result == null || result.files.isEmpty) return;
    final f = result.files.first;
    final path = f.path;
    if (path == null) {
      setState(() => error = 'Could not read file path');
      return;
    }
    String? ocr;
    final lower = (f.name).toLowerCase();
    if (lower.endsWith('.pdf')) {
      ocr = await _ocrPdf(path);
      if (ocr == null || ocr.trim().isEmpty) {
        setState(() =>
            error = 'Could not read text from this PDF. Try exporting pages as PNG/JPG, or paste text.');
        return;
      }
    } else if (lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png') ||
        lower.endsWith('.webp') ||
        lower.endsWith('.gif') ||
        lower.endsWith('.bmp')) {
      ocr = await _ocrImage(path);
    } else if (lower.endsWith('.txt') || lower.endsWith('.csv')) {
      ocr = await File(path).readAsString();
    }
    // Excel: upload to API — server extracts via xlsx
    await _ingestPage(path: path, name: f.name, extractedText: ocr, append: append);
  }

  Future<void> _ingestPage({
    required String path,
    String? name,
    String? extractedText,
    bool append = false,
  }) async {
    final pageNo = append ? (pageCount < 1 ? 2 : pageCount + 1) : 1;
    var pageText = extractedText?.trim() ?? '';
    if (append) {
      if (pageText.isNotEmpty) {
        final merged = _formatInvoiceText(_mergePageText(textCtrl.text, pageText, pageNo));
        textCtrl.text = merged;
        pageText = merged;
      }
      setState(() => pageCount = pageNo);
    } else if (pageText.isNotEmpty) {
      textCtrl.text = _formatInvoiceText(pageText);
      setState(() => pageCount = 1);
    } else {
      setState(() => pageCount = 1);
    }

    await _uploadPath(
      path,
      name: name,
      extractedText: pageText.isNotEmpty ? pageText : extractedText,
      append: append,
      pageNo: pageNo,
    );
  }

  Future<void> _confirm() async {
    final payloadLines = <Map<String, dynamic>>[];
    for (final l in lines.where((l) => l.selected && l.name.trim().isNotEmpty && l.quantity > 0)) {
      final serials = l.serialNumbers
          .split(RegExp(r'[\n,]'))
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
      if (l.trackSerial && l.commitStock && serials.length != l.quantity.round()) {
        setState(() => error =
            '"${l.name}" has Track serial ON — enter exactly ${l.quantity.round()} serial(s), or turn Track serial OFF to stock without serials.');
        return;
      }
      payloadLines.add({
        'name': l.name.trim(),
        'quantity': l.quantity,
        if (l.unitPrice > 0) 'unitPrice': l.unitPrice,
        if (l.salePrice > 0) 'salePrice': l.salePrice,
        if (l.hsnCode != null && l.hsnCode!.isNotEmpty) 'hsnCode': l.hsnCode,
        'gstRate': l.gstRate,
        if (l.brand != null) 'brand': l.brand,
        if (l.category != null) 'category': l.category,
        if (l.model != null && l.model!.isNotEmpty) 'model': l.model,
        if (l.barcode != null && l.barcode!.isNotEmpty) 'barcode': l.barcode,
        if (l.sku != null) 'sku': l.sku,
        if (l.productId != null) 'productId': l.productId,
        'createIfMissing': l.createIfMissing,
        'trackSerial': l.trackSerial,
        if (serials.isNotEmpty) 'serialNumbers': serials,
        'commitStock': l.commitStock,
      });
    }
    if (payloadLines.isEmpty) {
      setState(() => error = 'Select at least one line with qty > 0');
      return;
    }
    if (invoiceNoCtrl.text.trim().isNotEmpty &&
        _duplicateInvoiceMsg != null &&
        !_appendToExistingBill) {
      setState(() => error =
          '$_duplicateInvoiceMsg Enable “Add to existing bill” to append lines.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
      success = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final raw = await api.post('/scan/confirm-stock-in', body: {
        if (uploadId != null) 'uploadId': uploadId,
        if (draftId != null) 'draftId': draftId,
        if (supplierCtrl.text.trim().isNotEmpty) 'supplierName': supplierCtrl.text.trim(),
        if (_supplierAddress != null && _supplierAddress!.trim().isNotEmpty)
          'supplierAddress': _supplierAddress!.trim(),
        if (_supplierPhone != null && _supplierPhone!.trim().isNotEmpty)
          'supplierPhone': _supplierPhone!.trim(),
        if (invoiceNoCtrl.text.trim().isNotEmpty) 'invoiceNumber': invoiceNoCtrl.text.trim(),
        if (invoiceDateCtrl.text.trim().isNotEmpty) 'invoiceDate': invoiceDateCtrl.text.trim(),
        if (gstinCtrl.text.trim().isNotEmpty) 'gstin': gstinCtrl.text.trim(),
        if (_taxableValue != null) 'taxableValue': _taxableValue,
        if (_taxAmount != null) 'taxAmount': _taxAmount,
        if (_totalAmount != null) 'totalAmount': _totalAmount,
        if (_cgstAmount != null) 'cgstAmount': _cgstAmount,
        if (_sgstAmount != null) 'sgstAmount': _sgstAmount,
        if (_igstAmount != null) 'igstAmount': _igstAmount,
        if (_irn != null) 'irn': _irn,
        if (_ackNo != null) 'ackNo': _ackNo,
        if (_ewayBillNo != null) 'ewayBillNo': _ewayBillNo,
        if (_vehicleNo != null) 'vehicleNo': _vehicleNo,
        if (bankNameCtrl.text.trim().isNotEmpty) 'bankName': bankNameCtrl.text.trim(),
        if (bankAccountCtrl.text.trim().isNotEmpty) 'bankAccount': bankAccountCtrl.text.trim(),
        if (ifscCtrl.text.trim().isNotEmpty) 'ifsc': ifscCtrl.text.trim(),
        if (bankBranchCtrl.text.trim().isNotEmpty) 'bankBranch': bankBranchCtrl.text.trim(),
        if (_placeOfSupply != null) 'placeOfSupply': _placeOfSupply,
        if (_stateName != null) 'stateName': _stateName,
        if (_customerName != null) 'customerName': _customerName,
        if (_customerGstin != null) 'customerGstin': _customerGstin,
        if (_appendToExistingBill) 'appendToExistingBill': true,
        'lines': payloadLines,
      });
      final map = asStringKeyedMap(raw);
      final items = map['items'];
      final count = items is List ? items.length : payloadLines.length;
      final supplier = map['supplier'] is Map ? asStringKeyedMap(map['supplier'] as Map) : null;
      final msg = map['message']?.toString() ?? 'Stock-in confirmed · $count product(s)';
      setState(() {
        success = supplier != null
            ? '$msg · Saved supplier ${supplier['name']}'
            : msg;
        lines = [];
        expandedLine = null;
        textCtrl.clear();
        jsonCtrl.clear();
        bankNameCtrl.clear();
        bankAccountCtrl.clear();
        ifscCtrl.clear();
        bankBranchCtrl.clear();
        fileLabel = null;
        uploadId = null;
        uploadedDocUrl = null;
        uploadedDocMime = null;
        uploadedDocName = null;
        draftId = null;
        pageCount = 0;
        showJson = false;
        jsonError = null;
      });
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _saveDraft() async {
    if (lines.isEmpty) {
      setState(() => error = 'Parse lines before saving a draft');
      return;
    }
    setState(() {
      busy = true;
      error = null;
      success = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final raw = await api.post('/scan/drafts', body: {
        if (draftId != null) 'draftId': draftId,
        if (uploadId != null) 'uploadId': uploadId,
        if (supplierCtrl.text.trim().isNotEmpty) 'supplierName': supplierCtrl.text.trim(),
        if (invoiceNoCtrl.text.trim().isNotEmpty) 'invoiceNumber': invoiceNoCtrl.text.trim(),
        if (invoiceDateCtrl.text.trim().isNotEmpty) 'invoiceDate': invoiceDateCtrl.text.trim(),
        if (gstinCtrl.text.trim().isNotEmpty) 'gstin': gstinCtrl.text.trim(),
        'previewJson': {
          'supplierName': supplierCtrl.text.trim(),
          'invoiceNumber': invoiceNoCtrl.text.trim(),
          'invoiceDate': invoiceDateCtrl.text.trim(),
          'gstin': gstinCtrl.text.trim(),
          if (uploadId != null) 'uploadId': uploadId,
          'linesMatched': lines.where((l) => (l.productId ?? '').isNotEmpty).length,
          'linesTotal': lines.length,
          'lines': lines
              .map(
                (l) => {
                  'name': l.name,
                  'quantity': l.quantity,
                  'unitPrice': l.unitPrice,
                  'salePrice': l.salePrice,
                  'hsnCode': l.hsnCode,
                  'gstRate': l.gstRate,
                  'brand': l.brand,
                  'category': l.category,
                  'model': l.model,
                  'barcode': l.barcode,
                  'sku': l.sku,
                  'productId': l.productId,
                  'matchedName': l.matchedName,
                  'matchScore': l.matchScore,
                  'currentStock': l.currentStock,
                  'createIfMissing': l.createIfMissing,
                  'trackSerial': l.trackSerial,
                  'serialNumbers': l.serialNumbers,
                  'commitStock': l.commitStock,
                  'selected': l.selected,
                },
              )
              .toList(),
        },
      });
      final map = asStringKeyedMap(raw);
      setState(() {
        draftId = map['id']?.toString() ?? draftId;
        success = 'Draft saved. Resume anytime from Stock drafts.';
      });
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final selected = lines.where((l) => l.selected).length;
    final estTotal = lines
        .where((l) => l.selected)
        .fold<double>(0, (s, l) => s + l.quantity * l.unitPrice);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: Text(context.watch<AppStrings>().t('stock_in')),
        actions: [
          if (lines.isNotEmpty)
            TextButton(
              onPressed: busy ? null : _saveDraft,
              child: Text(draftId != null ? 'Draft ✓' : 'Save draft'),
            ),
        ],
      ),
      bottomNavigationBar: lines.isEmpty
          ? null
          : SafeArea(
              child: Container(
                padding: const EdgeInsets.fromLTRB(AppSpace.md, AppSpace.sm, AppSpace.md, AppSpace.sm),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  border: Border(top: BorderSide(color: AppColors.teal.withValues(alpha: 0.1))),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.tealDark.withValues(alpha: 0.06),
                      blurRadius: 12,
                      offset: const Offset(0, -4),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '$selected of ${lines.length} lines',
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                          Text(
                            estTotal > 0 ? '≈ ${_inr.format(estTotal)}' : 'Review & confirm',
                            style: TextStyle(fontSize: 12, color: AppColors.muted),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: AppSpace.sm),
                    FilledButton(
                      onPressed: busy ? null : _confirm,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.amber,
                        foregroundColor: AppColors.ink,
                        minimumSize: const Size(148, 48),
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                      ),
                      child: Text(
                        busy ? 'Updating…' : 'Confirm',
                        style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800),
                      ),
                    ),
                  ],
                ),
              ),
            ),
      body: ListView(
        padding: AppSpace.listWithFab(top: AppSpace.sm),
        children: [
          if (error != null) ...[
            AppPanel(child: Text(error!, style: const TextStyle(color: AppColors.danger))),
            const SizedBox(height: AppSpace.sm),
          ],
          if (success != null) ...[
            AppPanel(child: Text(success!, style: TextStyle(color: AppColors.tealDark))),
            const SizedBox(height: AppSpace.sm),
          ],

          // ── Step 1: capture ──────────────────────────────────────
          AppPanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _SectionHeader(
                  title: 'Capture invoice',
                  subtitle: pageCount > 1
                      ? '$pageCount pages merged — add more or parse'
                      : 'PDF, photo, or camera — use Add another page for extra pages',
                ),
                const SizedBox(height: AppSpace.md),
                Row(
                  children: [
                    Expanded(
                      child: _SourceButton(
                        icon: Icons.photo_camera_rounded,
                        label: 'Camera',
                        filled: true,
                        onPressed: busy || ocrRunning ? null : () => _fromCamera(),
                      ),
                    ),
                    const SizedBox(width: AppSpace.xs),
                    Expanded(
                      child: _SourceButton(
                        icon: Icons.photo_library_outlined,
                        label: 'Gallery',
                        onPressed: busy || ocrRunning ? null : () => _fromGallery(),
                      ),
                    ),
                    const SizedBox(width: AppSpace.xs),
                    Expanded(
                      child: _SourceButton(
                        icon: Icons.upload_file_rounded,
                        label: 'File',
                        outlined: true,
                        onPressed: busy || ocrRunning ? null : () => _fromFile(),
                      ),
                    ),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    'PDF · PNG · JPG · WebP · GIF · TXT · Excel',
                    style: GoogleFonts.dmSans(fontSize: 11, color: AppColors.muted),
                    textAlign: TextAlign.center,
                  ),
                ),
                if (uploadedDocUrl != null && uploadedDocUrl!.isNotEmpty) ...[
                  const SizedBox(height: AppSpace.sm),
                  DocumentAttachmentTile(
                    apiBaseUrl: context.read<AuthState>().api.baseUrl,
                    url: uploadedDocUrl,
                    mimeType: uploadedDocMime,
                    fileName: uploadedDocName ?? fileLabel ?? 'Uploaded invoice',
                  ),
                ],
                const SizedBox(height: AppSpace.sm),
                OutlinedButton.icon(
                  onPressed: busy || ocrRunning || textCtrl.text.trim().isEmpty
                      ? null
                      : () async {
                          final choice = await showModalBottomSheet<String>(
                            context: context,
                            builder: (ctx) => SafeArea(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  ListTile(
                                    leading: const Icon(Icons.photo_camera_rounded),
                                    title: const Text('Add page from camera'),
                                    onTap: () => Navigator.pop(ctx, 'camera'),
                                  ),
                                  ListTile(
                                    leading: const Icon(Icons.photo_library_outlined),
                                    title: const Text('Add page from gallery'),
                                    onTap: () => Navigator.pop(ctx, 'gallery'),
                                  ),
                                  ListTile(
                                    leading: const Icon(Icons.upload_file_rounded),
                                    title: const Text('Add page from file'),
                                    onTap: () => Navigator.pop(ctx, 'file'),
                                  ),
                                ],
                              ),
                            ),
                          );
                          if (choice == 'camera') await _fromCamera(append: true);
                          if (choice == 'gallery') await _fromGallery(append: true);
                          if (choice == 'file') await _fromFile(append: true);
                        },
                  icon: const Icon(Icons.note_add_outlined),
                  label: const Text('Add another page'),
                ),
                if (ocrRunning) ...[
                  const SizedBox(height: AppSpace.sm),
                  const AppLinearLoader(),
                  const SizedBox(height: 6),
                  Text(
                    'Reading invoice text…',
                    style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
                  ),
                ],
                if (fileLabel != null) ...[
                  const SizedBox(height: AppSpace.sm),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppColors.tealSoft.withValues(alpha: 0.45),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.attach_file_rounded, size: 16, color: AppColors.tealDark),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            fileLabel!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 12, color: AppColors.tealDark),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpace.sm),

          // ── Step 2: text / parse ─────────────────────────────────
          AppPanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _SectionHeader(
                  title: 'Extracted data',
                  subtitle: showJson
                      ? 'Structured form data — fix supplier/items, then Apply'
                      : 'Raw OCR text — fix mistakes, then Parse',
                ),
                const SizedBox(height: AppSpace.sm),
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(value: false, label: Text('Text'), icon: Icon(Icons.notes_rounded, size: 16)),
                    ButtonSegment(value: true, label: Text('JSON'), icon: Icon(Icons.data_object_rounded, size: 16)),
                  ],
                  selected: {showJson},
                  onSelectionChanged: (s) => _switchDataView(s.first),
                ),
                const SizedBox(height: AppSpace.sm),
                TextField(
                  controller: showJson ? jsonCtrl : textCtrl,
                  maxLines: 10,
                  minLines: 5,
                  style: GoogleFonts.ibmPlexMono(fontSize: 12, height: 1.45),
                  decoration: InputDecoration(
                    hintText: showJson
                        ? '{\n  "supplier": {},\n  "invoice": {},\n  "items": []\n}'
                        : 'Invoice lines appear here after OCR…',
                    alignLabelWithHint: true,
                    errorText: showJson ? jsonError : null,
                  ),
                  onChanged: (_) => setState(() {
                    if (showJson) jsonError = null;
                  }),
                ),
                const SizedBox(height: AppSpace.sm),
                Row(
                  children: [
                    Expanded(
                      flex: 2,
                      child: FilledButton.tonal(
                        onPressed: busy
                            ? null
                            : showJson
                                ? (jsonCtrl.text.trim().isEmpty ? null : () => _applyEditedJson(jsonCtrl.text))
                                : (textCtrl.text.trim().isEmpty
                                    ? null
                                    : () {
                                        textCtrl.text = _formatInvoiceText(textCtrl.text);
                                        _parseText(textCtrl.text);
                                      }),
                        child: Text(
                          busy
                              ? 'Working…'
                              : showJson
                                  ? 'Apply JSON'
                                  : 'Parse for stock-in',
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpace.xs),
                    Expanded(
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(0, 48),
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        onPressed: busy
                            ? null
                            : () {
                                setState(() {
                                  if (showJson) {
                                    try {
                                      jsonCtrl.text = _prettyJson(jsonDecode(jsonCtrl.text));
                                      jsonError = null;
                                    } catch (e) {
                                      jsonError = e.toString();
                                    }
                                  } else {
                                    textCtrl.text = _formatInvoiceText(textCtrl.text);
                                  }
                                });
                              },
                        child: const Text('Format'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpace.xs),
                TextButton(
                  onPressed: busy
                      ? null
                      : () {
                          const sample = '''TAX INVOICE
PowerHub Distributors Pvt Ltd
Okhla Phase-1, New Delhi - 110020
GSTIN: 07AAACP1234A1Z5
INVOICE No: PH/MOB-SAMPLE/01
Dated: 19-Jul-26

Description of Goods          HSN     QTY   RATE      Amount
Exide InvaMaster 150Ah Tubular Battery  8507  2  11800  23600
Luminous Zelio 1100 Pure Sine Wave Inverter  8504  3  5800  17400
Battery Terminal Cable Set Heavy  8544  10  180  1800

Taxable Value  42800
Grand Total  42800.00''';
                          setState(() {
                            showJson = false;
                            textCtrl.text = _formatInvoiceText(sample);
                          });
                          _parseText(textCtrl.text);
                        },
                  child: const Text('Load sample invoice & parse'),
                ),
              ],
            ),
          ),

          if (lines.isNotEmpty) ...[
            const SizedBox(height: AppSpace.sm),

            // ── Step 3: invoice meta ───────────────────────────────
            AppPanel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _SectionHeader(
                    title: 'Invoice details',
                    subtitle: 'Supplier & bill reference',
                  ),
                  const SizedBox(height: AppSpace.sm),
                  TextField(
                    controller: supplierCtrl,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'Supplier'),
                  ),
                  const SizedBox(height: AppSpace.sm),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: invoiceNoCtrl,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(labelText: 'Invoice no.'),
                        ),
                      ),
                      const SizedBox(width: AppSpace.sm),
                      Expanded(
                        child: TextField(
                          controller: invoiceDateCtrl,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(labelText: 'Date'),
                        ),
                      ),
                    ],
                  ),
                  if (_duplicateInvoiceMsg != null) ...[
                    const SizedBox(height: AppSpace.sm),
                    Text(
                      _duplicateInvoiceMsg!,
                      style: TextStyle(color: Colors.amber.shade900, fontSize: 13),
                    ),
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      title: const Text('Add lines to existing bill'),
                      value: _appendToExistingBill,
                      onChanged: (v) =>
                          setState(() => _appendToExistingBill = v ?? false),
                    ),
                  ],
                  const SizedBox(height: AppSpace.sm),
                  TextField(
                    controller: gstinCtrl,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'GSTIN'),
                  ),
                  const SizedBox(height: AppSpace.sm),
                  TextField(
                    controller: bankNameCtrl,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'Bank name'),
                  ),
                  const SizedBox(height: AppSpace.sm),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: bankAccountCtrl,
                          keyboardType: TextInputType.number,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(labelText: 'A/c number'),
                        ),
                      ),
                      const SizedBox(width: AppSpace.sm),
                      Expanded(
                        child: TextField(
                          controller: ifscCtrl,
                          textCapitalization: TextCapitalization.characters,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(labelText: 'IFSC'),
                          onChanged: (v) {
                            final up = v.toUpperCase();
                            if (up != v) {
                              ifscCtrl.value = ifscCtrl.value.copyWith(
                                text: up,
                                selection: TextSelection.collapsed(offset: up.length),
                              );
                            }
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpace.sm),
                  TextField(
                    controller: bankBranchCtrl,
                    textInputAction: TextInputAction.done,
                    decoration: const InputDecoration(labelText: 'Branch'),
                  ),
                  if (_supplierAddress != null ||
                      _totalAmount != null ||
                      _ewayBillNo != null ||
                      _customerName != null) ...[
                    const SizedBox(height: AppSpace.sm),
                    Text(
                      [
                        if (_supplierAddress != null) 'Address: $_supplierAddress',
                        if (_stateName != null) 'State: $_stateName',
                        if (_taxableValue != null) 'Taxable: $_taxableValue',
                        if (_taxAmount != null) 'Tax: $_taxAmount',
                        if (_totalAmount != null) 'Grand total: $_totalAmount',
                        if (_ewayBillNo != null) 'e-Way: $_ewayBillNo',
                        if (_vehicleNo != null) 'Vehicle: $_vehicleNo',
                        if (_customerName != null) 'Buyer: $_customerName',
                      ].join('\n'),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: AppColors.muted,
                          ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: AppSpace.md),

            // ── Step 4: lines ──────────────────────────────────────
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Line items',
                    style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                    ),
                  ),
                ),
                Text(
                  '$selected selected',
                  style: TextStyle(fontSize: 12, color: AppColors.muted),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'Tap a line to enrich barcode, sale price, serials',
              style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
            ),
            const SizedBox(height: AppSpace.sm),
            ...lines.asMap().entries.map((e) {
              final i = e.key;
              final l = e.value;
              return Padding(
                padding: const EdgeInsets.only(bottom: AppSpace.sm),
                child: _StockLineCard(
                  key: ValueKey('line-$i-${l.name}'),
                  index: i,
                  line: l,
                  expanded: expandedLine == i,
                  onToggle: () => setState(() => expandedLine = expandedLine == i ? null : i),
                  onChanged: () => setState(() {}),
                  onRemove: () => setState(() {
                    lines.removeAt(i);
                    if (expandedLine == i) expandedLine = null;
                    if (expandedLine != null && expandedLine! > i) {
                      expandedLine = expandedLine! - 1;
                    }
                  }),
                ),
              );
            }),
          ],
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.subtitle});
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, fontSize: 15),
        ),
        Text(
          subtitle,
          style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted, height: 1.3),
        ),
      ],
    );
  }
}

class _SourceButton extends StatelessWidget {
  const _SourceButton({
    required this.icon,
    required this.label,
    required this.onPressed,
    this.filled = false,
    this.outlined = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;
  final bool filled;
  final bool outlined;

  @override
  Widget build(BuildContext context) {
    final child = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 22),
        const SizedBox(height: 4),
        Text(label, style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w700)),
      ],
    );
    final style = ButtonStyle(
      minimumSize: const WidgetStatePropertyAll(Size(64, 64)),
      padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(vertical: 10, horizontal: 4)),
      shape: WidgetStatePropertyAll(
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
    if (filled) {
      return FilledButton(onPressed: onPressed, style: style, child: child);
    }
    if (outlined) {
      return OutlinedButton(onPressed: onPressed, style: style, child: child);
    }
    return FilledButton.tonal(onPressed: onPressed, style: style, child: child);
  }
}

class _StockLineCard extends StatefulWidget {
  const _StockLineCard({
    super.key,
    required this.index,
    required this.line,
    required this.expanded,
    required this.onToggle,
    required this.onChanged,
    required this.onRemove,
  });

  final int index;
  final _StockLine line;
  final bool expanded;
  final VoidCallback onToggle;
  final VoidCallback onChanged;
  final VoidCallback onRemove;

  @override
  State<_StockLineCard> createState() => _StockLineCardState();
}

class _StockLineCardState extends State<_StockLineCard> {
  late final TextEditingController qtyCtrl;
  late final TextEditingController rateCtrl;
  late final TextEditingController saleCtrl;
  late final TextEditingController barcodeCtrl;
  late final TextEditingController serialsCtrl;
  late final TextEditingController nameCtrl;

  @override
  void initState() {
    super.initState();
    final l = widget.line;
    qtyCtrl = TextEditingController(text: l.quantity.toStringAsFixed(0));
    rateCtrl = TextEditingController(text: l.unitPrice > 0 ? l.unitPrice.toStringAsFixed(2) : '');
    saleCtrl = TextEditingController(text: l.salePrice > 0 ? l.salePrice.toStringAsFixed(2) : '');
    barcodeCtrl = TextEditingController(text: l.barcode ?? '');
    serialsCtrl = TextEditingController(text: l.serialNumbers);
    nameCtrl = TextEditingController(text: l.name);
  }

  @override
  void dispose() {
    qtyCtrl.dispose();
    rateCtrl.dispose();
    saleCtrl.dispose();
    barcodeCtrl.dispose();
    serialsCtrl.dispose();
    nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _scanBarcode() async {
    final code = await BarcodeScannerScreen.open(
      context,
      title: 'Scan barcode',
      subtitle: 'Product barcode for this line',
    );
    if (code == null || !mounted) return;
    barcodeCtrl.text = code;
    widget.line.barcode = code;
    widget.onChanged();
  }

  String get _badgeLabel {
    final l = widget.line;
    if (l.productId != null && (l.matchScore ?? 0) >= 40) return 'Matched';
    if (l.productId != null) return 'Weak match';
    return 'New';
  }

  Color get _badgeColor {
    final l = widget.line;
    if (l.productId != null && (l.matchScore ?? 0) >= 40) return AppColors.teal;
    if (l.productId != null) return AppColors.amberDeep;
    return AppColors.muted;
  }

  @override
  Widget build(BuildContext context) {
    final l = widget.line;
    final lineTotal = l.quantity * l.unitPrice;

    return AppPanel(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: widget.onToggle,
            borderRadius: BorderRadius.circular(AppRadius.md),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(AppSpace.sm, AppSpace.sm, AppSpace.sm, AppSpace.sm),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Checkbox(
                    value: l.selected,
                    onChanged: (v) {
                      l.selected = v ?? false;
                      widget.onChanged();
                    },
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 10),
                        Text(
                          l.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                            height: 1.25,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          [
                            'Qty ${l.quantity.toStringAsFixed(0)}',
                            if (l.unitPrice > 0) '@ ${_inr.format(l.unitPrice)}',
                            if (lineTotal > 0) '= ${_inr.format(lineTotal)}',
                          ].join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12, color: AppColors.muted),
                        ),
                        if (l.matchedName != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            '→ ${l.matchedName}'
                            '${l.currentStock != null ? ' · stock ${l.currentStock!.toStringAsFixed(0)}' : ''}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 11, color: AppColors.muted),
                          ),
                        ],
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          children: [
                            _miniChip(_badgeLabel, _badgeColor),
                            if (l.trackSerial) _miniChip('Serials', AppColors.warn),
                            if (!l.commitStock) _miniChip('Hold stock', AppColors.amberDeep),
                            if ((l.barcode ?? '').isEmpty) _miniChip('No barcode', AppColors.warn),
                          ],
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    widget.expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                    color: AppColors.muted,
                  ),
                ],
              ),
            ),
          ),
          if (widget.expanded) ...[
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(AppSpace.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: nameCtrl,
                    decoration: const InputDecoration(labelText: 'Product name'),
                    onChanged: (v) {
                      l.name = v;
                      widget.onChanged();
                    },
                  ),
                  const SizedBox(height: AppSpace.sm),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: qtyCtrl,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(labelText: 'Qty'),
                          onChanged: (v) {
                            l.quantity = double.tryParse(v) ?? l.quantity;
                            widget.onChanged();
                          },
                        ),
                      ),
                      const SizedBox(width: AppSpace.sm),
                      Expanded(
                        child: TextField(
                          controller: rateCtrl,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: const InputDecoration(labelText: 'Rate', prefixText: '₹ '),
                          onChanged: (v) {
                            l.unitPrice = double.tryParse(v) ?? l.unitPrice;
                            widget.onChanged();
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpace.sm),
                  TextField(
                    controller: saleCtrl,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(labelText: 'Sale price', prefixText: '₹ '),
                    onChanged: (v) {
                      l.salePrice = double.tryParse(v) ?? l.salePrice;
                      widget.onChanged();
                    },
                  ),
                  const SizedBox(height: AppSpace.sm),
                  TextField(
                    controller: barcodeCtrl,
                    decoration: InputDecoration(
                      labelText: 'Barcode',
                      hintText: 'Optional at stock-in',
                      suffixIcon: IconButton(
                        tooltip: 'Scan',
                        onPressed: _scanBarcode,
                        icon: const Icon(Icons.qr_code_scanner_rounded),
                      ),
                    ),
                    onChanged: (v) {
                      l.barcode = v;
                      widget.onChanged();
                    },
                  ),
                  const SizedBox(height: AppSpace.xs),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      'Track serial (${l.quantity.round()} required)',
                      style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600, fontSize: 14),
                    ),
                    subtitle: Text(
                      l.catalogTracksSerial
                          ? 'Catalog uses serials — turn on only if entering them now'
                          : 'Off by default; stock-in works without serials',
                      style: const TextStyle(fontSize: 12),
                    ),
                    value: l.trackSerial,
                    onChanged: (v) {
                      l.trackSerial = v;
                      widget.onChanged();
                    },
                  ),
                  if (l.trackSerial) ...[
                    TextField(
                      controller: serialsCtrl,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        labelText: 'Serials',
                        hintText: 'One per line',
                        alignLabelWithHint: true,
                      ),
                      onChanged: (v) {
                        l.serialNumbers = v;
                        widget.onChanged();
                      },
                    ),
                    const SizedBox(height: AppSpace.sm),
                  ],
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      'Commit stock now',
                      style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600, fontSize: 14),
                    ),
                    subtitle: const Text(
                      'Off = enrich product without increasing qty yet',
                      style: TextStyle(fontSize: 12),
                    ),
                    value: l.commitStock,
                    onChanged: (v) {
                      l.commitStock = v;
                      widget.onChanged();
                    },
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton.icon(
                      onPressed: widget.onRemove,
                      icon: const Icon(Icons.delete_outline, color: AppColors.danger, size: 18),
                      label: const Text('Remove line', style: TextStyle(color: AppColors.danger)),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _miniChip(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        label,
        style: GoogleFonts.plusJakartaSans(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}
