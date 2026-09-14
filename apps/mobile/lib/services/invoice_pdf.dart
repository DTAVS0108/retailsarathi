import 'dart:typed_data';

import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../models/models.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: 'Rs ');

/// Builds a printable A4 tax invoice PDF for mobile print / download.
class InvoicePdfBuilder {
  InvoicePdfBuilder._();

  static Future<Uint8List> build(PrintInvoiceData data) async {
    final html = data.printHtml?.trim();
    if (html != null && html.isNotEmpty) {
      try {
        return await Printing.convertHtml(format: PdfPageFormat.a4, html: html);
      } catch (_) {
        // Fall back to native PDF layout below.
      }
    }

    final template = data.templateId ?? 'retail-bold';
    if (template == 'retail-bold') {
      return _buildRetailBold(data);
    }
    return _buildClassic(data);
  }

  static Future<Uint8List> _buildClassic(PrintInvoiceData data) async {
    final doc = pw.Document(
      title: 'Invoice ${data.invoiceNumber}',
      author: data.shopName,
    );

    doc.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(36),
        build: (context) => [
          pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Expanded(
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(
                      data.shopName,
                      style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold),
                    ),
                    if (data.shopAddress.isNotEmpty)
                      pw.Text(data.shopAddress, style: const pw.TextStyle(fontSize: 10)),
                    if (data.gstin != null && data.gstin!.isNotEmpty)
                      pw.Text('GSTIN: ${data.gstin}', style: const pw.TextStyle(fontSize: 10)),
                    if (data.shopPhone != null && data.shopPhone!.isNotEmpty)
                      pw.Text('Phone: ${data.shopPhone}', style: const pw.TextStyle(fontSize: 10)),
                  ],
                ),
              ),
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.end,
                children: [
                  pw.Text(
                    'TAX INVOICE',
                    style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold),
                  ),
                  pw.SizedBox(height: 4),
                  pw.Text('No: ${data.invoiceNumber}', style: const pw.TextStyle(fontSize: 11)),
                  pw.Text('Date: ${data.date}', style: const pw.TextStyle(fontSize: 11)),
                ],
              ),
            ],
          ),
          pw.SizedBox(height: 16),
          pw.Container(
            padding: const pw.EdgeInsets.all(10),
            decoration: pw.BoxDecoration(
              border: pw.Border.all(color: PdfColors.grey400),
              borderRadius: pw.BorderRadius.circular(4),
            ),
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text('Bill to', style: pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
                pw.Text(
                  data.customerName?.isNotEmpty == true ? data.customerName! : 'Walk-in customer',
                  style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 12),
                ),
                if (data.customerPhone != null && data.customerPhone!.isNotEmpty)
                  pw.Text(data.customerPhone!, style: const pw.TextStyle(fontSize: 10)),
              ],
            ),
          ),
          pw.SizedBox(height: 16),
          pw.TableHelper.fromTextArray(
            headers: ['Item', 'HSN', 'Qty', 'Rate', 'GST%', 'Amount'],
            headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9),
            cellStyle: const pw.TextStyle(fontSize: 9),
            headerDecoration: const pw.BoxDecoration(color: PdfColors.grey200),
            cellAlignments: {
              0: pw.Alignment.centerLeft,
              1: pw.Alignment.center,
              2: pw.Alignment.centerRight,
              3: pw.Alignment.centerRight,
              4: pw.Alignment.centerRight,
              5: pw.Alignment.centerRight,
            },
            columnWidths: {
              0: const pw.FlexColumnWidth(3.2),
              1: const pw.FlexColumnWidth(1.1),
              2: const pw.FlexColumnWidth(0.8),
              3: const pw.FlexColumnWidth(1.2),
              4: const pw.FlexColumnWidth(0.9),
              5: const pw.FlexColumnWidth(1.4),
            },
            data: data.lines
                .map(
                  (l) => [
                    l.name,
                    l.hsnCode ?? '',
                    l.qty.toStringAsFixed(l.qty == l.qty.roundToDouble() ? 0 : 2),
                    l.rate.toStringAsFixed(2),
                    l.gstRate.toStringAsFixed(0),
                    l.amount.toStringAsFixed(2),
                  ],
                )
                .toList(),
          ),
          pw.SizedBox(height: 16),
          pw.Align(
            alignment: pw.Alignment.centerRight,
            child: pw.SizedBox(
              width: 220,
              child: pw.Column(
                children: [
                  _totalRow('Subtotal', _inr.format(data.subtotal)),
                  if (data.totalCgst > 0) _totalRow('CGST', _inr.format(data.totalCgst)),
                  if (data.totalSgst > 0) _totalRow('SGST', _inr.format(data.totalSgst)),
                  if (data.totalIgst > 0) _totalRow('IGST', _inr.format(data.totalIgst)),
                  pw.Divider(),
                  _totalRow('Grand total', _inr.format(data.grandTotal), bold: true),
                ],
              ),
            ),
          ),
          if (data.payments.isNotEmpty) ...[
            pw.SizedBox(height: 12),
            pw.Text('Payments', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 11)),
            ...data.payments.map(
              (p) => pw.Text(
                '${p.method.replaceAll('_', ' ')}: ${_inr.format(p.amount)}',
                style: const pw.TextStyle(fontSize: 10),
              ),
            ),
          ],
          if (data.notes != null && data.notes!.isNotEmpty) ...[
            pw.SizedBox(height: 12),
            pw.Text('Notes: ${data.notes}', style: const pw.TextStyle(fontSize: 10)),
          ],
          pw.SizedBox(height: 24),
          pw.Text(
            'Thank you for your business · Generated by RetailSarathi',
            style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
          ),
        ],
      ),
    );

    return doc.save();
  }

  static Future<Uint8List> _buildRetailBold(PrintInvoiceData data) async {
    final doc = pw.Document(title: 'Invoice ${data.invoiceNumber}', author: data.shopName);
    final payLabel = data.payments.isNotEmpty
        ? data.payments.map((p) => p.method.replaceAll('_', ' ')).join(', ')
        : 'Cash / UPI';

    doc.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(28),
        build: (context) => [
          pw.Container(
            padding: const pw.EdgeInsets.all(14),
            decoration: pw.BoxDecoration(
              color: PdfColors.red700,
              borderRadius: pw.BorderRadius.circular(8),
            ),
            child: pw.Row(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Expanded(
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    children: [
                      pw.Text(
                        data.shopName,
                        style: pw.TextStyle(
                          fontSize: 18,
                          fontWeight: pw.FontWeight.bold,
                          color: PdfColors.white,
                        ),
                      ),
                      pw.Text(
                        '${data.invoiceNumber} · ${data.date}',
                        style: const pw.TextStyle(fontSize: 10, color: PdfColors.white),
                      ),
                      pw.Text(
                        'Paid via $payLabel',
                        style: const pw.TextStyle(fontSize: 9, color: PdfColors.white),
                      ),
                    ],
                  ),
                ),
                pw.Text(
                  _inr.format(data.grandTotal),
                  style: pw.TextStyle(
                    fontSize: 22,
                    fontWeight: pw.FontWeight.bold,
                    color: PdfColors.white,
                  ),
                ),
              ],
            ),
          ),
          pw.SizedBox(height: 10),
          if (data.shopAddress.isNotEmpty)
            pw.Text(data.shopAddress, style: const pw.TextStyle(fontSize: 9)),
          if (data.gstin != null && data.gstin!.isNotEmpty)
            pw.Text('GSTIN: ${data.gstin}', style: const pw.TextStyle(fontSize: 9)),
          pw.SizedBox(height: 8),
          pw.Text(
            'Customer: ${data.customerName?.isNotEmpty == true ? data.customerName : 'Walk-in'}',
            style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 11),
          ),
          pw.SizedBox(height: 12),
          pw.TableHelper.fromTextArray(
            headers: ['Item', 'Qty', 'Rate', 'GST%', 'Amount'],
            headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9, color: PdfColors.white),
            headerDecoration: const pw.BoxDecoration(color: PdfColors.black),
            cellStyle: const pw.TextStyle(fontSize: 9),
            data: data.lines
                .map(
                  (l) => [
                    l.name,
                    l.qty.toStringAsFixed(l.qty == l.qty.roundToDouble() ? 0 : 2),
                    l.rate.toStringAsFixed(2),
                    l.gstRate.toStringAsFixed(0),
                    l.amount.toStringAsFixed(2),
                  ],
                )
                .toList(),
          ),
          pw.SizedBox(height: 12),
          pw.Align(
            alignment: pw.Alignment.centerRight,
            child: pw.SizedBox(
              width: 220,
              child: pw.Column(
                children: [
                  _totalRow('Taxable', _inr.format(data.subtotal)),
                  if (data.totalCgst > 0) _totalRow('CGST', _inr.format(data.totalCgst)),
                  if (data.totalSgst > 0) _totalRow('SGST', _inr.format(data.totalSgst)),
                  if (data.totalIgst > 0) _totalRow('IGST', _inr.format(data.totalIgst)),
                ],
              ),
            ),
          ),
          pw.SizedBox(height: 16),
          pw.Text(
            'Thank you for shopping with us!',
            style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: PdfColors.red800),
          ),
        ],
      ),
    );
    return doc.save();
  }

  static pw.Widget _totalRow(String label, String value, {bool bold = false}) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 2),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(
            label,
            style: pw.TextStyle(
              fontSize: bold ? 12 : 10,
              fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
            ),
          ),
          pw.Text(
            value,
            style: pw.TextStyle(
              fontSize: bold ? 12 : 10,
              fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
            ),
          ),
        ],
      ),
    );
  }
}
