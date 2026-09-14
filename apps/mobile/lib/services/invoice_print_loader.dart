import '../models/models.dart';
import 'api_client.dart';

/// Loads print payload for mobile using shop mobile template + server HTML.
Future<PrintInvoiceData> loadMobilePrintData(
  ApiClient api,
  String invoiceId, {
  String copy = 'original',
}) async {
  final copyParam = copy == 'duplicate' || copy == 'triplicate' ? copy : 'original';
  final printRaw = await api.get('/invoices/$invoiceId/print?channel=mobile&copy=$copyParam');
  final map = asStringKeyedMap(printRaw);
  try {
    final htmlRaw = await api.get('/invoices/$invoiceId/print-html?channel=mobile&copy=$copyParam');
    if (htmlRaw is Map) {
      final html = htmlRaw['html']?.toString();
      if (html != null && html.isNotEmpty) {
        map['printHtml'] = html;
      }
      final templateId = htmlRaw['templateId']?.toString();
      if (templateId != null && templateId.isNotEmpty) {
        map['templateId'] = templateId;
      }
    }
  } catch (_) {
    // HTML optional — native PDF fallback still works.
  }
  return PrintInvoiceData.fromJson(map);
}
