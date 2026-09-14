import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/auth_state.dart';
import '../theme/app_theme.dart';
import '../theme/app_ui.dart';
import '../widgets/app_toast.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

/// Opens the collect-payment bottom sheet for a customer.
/// Returns `true` if payment was collected successfully.
Future<bool> showCustomerCollectPayment(
  BuildContext context,
  Map<String, dynamic> c, {
  Future<void> Function()? onCollected,
}) async {
  final id = c['id']?.toString() ?? '';
  final name = c['name']?.toString() ?? '';
  final outstanding = asDouble(c['outstandingBalance'] ?? c['outstanding'] ?? c['totalDue']);
  final amountCtrl = TextEditingController(
    text: outstanding > 0 ? outstanding.toStringAsFixed(2) : '',
  );
  final refCtrl = TextEditingController();
  String method = 'CASH';
  bool pickInvoices = true;
  final Map<String, TextEditingController> allocCtrls = {};

  List<Map<String, dynamic>> openInvoices = [];
  if (id.isNotEmpty) {
    try {
      final api = context.read<AuthState>().api;
      final raw = await api.get('/customers/$id/open-invoices');
      if (raw is List) {
        openInvoices = raw
            .whereType<Map>()
            .map(asStringKeyedMap)
            .where((e) => asDouble(e['dueAmount'] ?? e['outstanding'] ?? e['balance']) > 0.009)
            .toList();
      }
    } catch (_) {
      // Pending list is optional if endpoint fails
    }
  }

  if (!context.mounted) return false;
  final ok = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) {
      return Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 16,
          bottom: MediaQuery.viewInsetsOf(ctx).bottom + 20,
        ),
        child: StatefulBuilder(
          builder: (ctx, setLocal) {
            final showRef = method == 'CHEQUE' || method == 'BANK_TRANSFER' || method == 'NEFT' || method == 'RTGS';
            TextEditingController allocCtrl(String invId) =>
                allocCtrls.putIfAbsent(invId, TextEditingController.new);
            return SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(name, style: GoogleFonts.plusJakartaSans(fontSize: 18, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 2),
                  Text(
                    outstanding > 0 ? 'Outstanding ${_inr.format(outstanding)}' : 'No udhaar',
                    style: GoogleFonts.plusJakartaSans(
                      color: outstanding > 0 ? AppColors.danger : AppColors.muted,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppColors.danger.withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(AppRadius.sm),
                      border: Border.all(color: AppColors.danger.withValues(alpha: 0.15)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                'Pending invoices (${openInvoices.length})',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.muted,
                                ),
                              ),
                            ),
                            TextButton(
                              onPressed: () => setLocal(() => pickInvoices = !pickInvoices),
                              child: Text(pickInvoices ? 'Use FIFO' : 'Pick invoices'),
                            ),
                          ],
                        ),
                        if (openInvoices.isEmpty)
                          Text(
                            'No pending invoices.',
                            style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
                          )
                        else ...[
                          Text(
                            pickInvoices
                                ? 'Enter how much goes to each invoice.'
                                : 'Collection clears these oldest-first.',
                            style: GoogleFonts.plusJakartaSans(fontSize: 11, color: AppColors.muted),
                          ),
                          const SizedBox(height: 4),
                          ...openInvoices.map((inv) {
                            final invId = inv['id']?.toString() ?? '';
                            final num = inv['invoiceNumber']?.toString() ?? invId;
                            final due = asDouble(inv['dueAmount'] ?? inv['outstanding'] ?? inv['balance']);
                            final date = inv['invoiceDate']?.toString() ?? inv['createdAt']?.toString() ?? '';
                            final d = date.isNotEmpty ? DateTime.tryParse(date) : null;
                            final dateStr = d != null ? ' · ${d.day}/${d.month}/${d.year}' : '';
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      '#$num$dateStr\nDue ${_inr.format(due)}',
                                      style: GoogleFonts.plusJakartaSans(fontSize: 12),
                                    ),
                                  ),
                                  if (pickInvoices) ...[
                                    TextButton(
                                      onPressed: () {
                                        allocCtrl(invId).text = due.toStringAsFixed(2);
                                        setLocal(() {});
                                      },
                                      child: const Text('Full'),
                                    ),
                                    SizedBox(
                                      width: 88,
                                      child: TextField(
                                        controller: allocCtrl(invId),
                                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                        decoration: const InputDecoration(isDense: true, hintText: '0'),
                                      ),
                                    ),
                                  ] else
                                    Text(
                                      'Pending',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.warn,
                                      ),
                                    ),
                                ],
                              ),
                            );
                          }),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: amountCtrl,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(labelText: 'Collect amount'),
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    value: method,
                    isExpanded: true,
                    items: const [
                      DropdownMenuItem(value: 'CASH', child: Text('Cash')),
                      DropdownMenuItem(value: 'UPI', child: Text('UPI')),
                      DropdownMenuItem(value: 'CARD', child: Text('Card')),
                      DropdownMenuItem(value: 'CHEQUE', child: Text('Cheque')),
                      DropdownMenuItem(value: 'NEFT', child: Text('NEFT')),
                      DropdownMenuItem(value: 'RTGS', child: Text('RTGS')),
                      DropdownMenuItem(value: 'BANK_TRANSFER', child: Text('Bank transfer')),
                    ],
                    onChanged: (v) => setLocal(() => method = v ?? 'CASH'),
                    decoration: const InputDecoration(labelText: 'Method'),
                  ),
                  if (showRef) ...[
                    const SizedBox(height: 8),
                    TextField(
                      controller: refCtrl,
                      decoration: InputDecoration(
                        labelText: method == 'CHEQUE' ? 'Cheque no.' : 'Ref / UTR no.',
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: () => Navigator.pop(ctx, true),
                    child: const Text('Collect payment'),
                  ),
                ],
              ),
            );
          },
        ),
      );
    },
  );
  if (ok != true || !context.mounted || id.isEmpty) {
    amountCtrl.dispose();
    refCtrl.dispose();
    for (final ctrl in allocCtrls.values) {
      ctrl.dispose();
    }
    return false;
  }
  final amount = double.tryParse(amountCtrl.text.trim()) ?? 0;
  if (amount <= 0) {
    amountCtrl.dispose();
    refCtrl.dispose();
    for (final ctrl in allocCtrls.values) {
      ctrl.dispose();
    }
    return false;
  }
  try {
    final api = context.read<AuthState>().api;
    final allocations = pickInvoices
        ? openInvoices
            .map((inv) {
              final invId = inv['id']?.toString() ?? '';
              final amt = double.tryParse(allocCtrls[invId]?.text.trim() ?? '') ?? 0;
              return {'invoiceId': invId, 'amount': amt};
            })
            .where((a) => (a['invoiceId'] as String).isNotEmpty && (a['amount'] as double) > 0.009)
            .toList()
        : <Map<String, dynamic>>[];
    if (pickInvoices && allocations.isEmpty) {
      showErrorToast(context, 'Enter at least one invoice allocation, or switch to FIFO.');
      amountCtrl.dispose();
      refCtrl.dispose();
      for (final ctrl in allocCtrls.values) {
        ctrl.dispose();
      }
      return false;
    }
    final body = <String, dynamic>{
      'amount': amount,
      'method': method,
      if (refCtrl.text.trim().isNotEmpty) 'reference': refCtrl.text.trim(),
      if (allocations.isNotEmpty) 'allocations': allocations,
    };
    await api.post('/customers/$id/collect', body: body);
    if (!context.mounted) return false;
    showSuccessToast(context, 'Collected ${_inr.format(amount)}');
    if (onCollected != null) await onCollected();
    amountCtrl.dispose();
    refCtrl.dispose();
    for (final ctrl in allocCtrls.values) {
      ctrl.dispose();
    }
    return true;
  } catch (e) {
    if (context.mounted) showErrorToast(context, e.toString());
    amountCtrl.dispose();
    refCtrl.dispose();
    for (final ctrl in allocCtrls.values) {
      ctrl.dispose();
    }
    return false;
  }
}
