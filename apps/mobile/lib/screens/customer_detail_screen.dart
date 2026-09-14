import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/models.dart';
import '../services/auth_state.dart';
import '../theme/app_theme.dart';
import '../theme/app_ui.dart';
import '../widgets/app_loader.dart';
import 'customer_collect.dart';
import 'customer_form_screen.dart';
import 'invoices_screen.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
final _dateFmt = DateFormat('dd MMM yyyy');

String _waPhone(String phone) {
  final digits = phone.replaceAll(RegExp(r'\D'), '');
  if (digits.length == 10) return '91$digits';
  return digits;
}

class CustomerDetailScreen extends StatefulWidget {
  const CustomerDetailScreen({
    super.key,
    required this.customerId,
    this.initial,
  });

  final String customerId;
  final Map<String, dynamic>? initial;

  @override
  State<CustomerDetailScreen> createState() => _CustomerDetailScreenState();
}

class _CustomerDetailScreenState extends State<CustomerDetailScreen> {
  Map<String, dynamic>? detail;
  bool loading = true;
  String? error;
  bool changed = false;

  @override
  void initState() {
    super.initState();
    if (widget.initial != null) detail = widget.initial;
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final raw = await api.get('/customers/${widget.customerId}');
      if (!mounted) return;
      setState(() {
        detail = asStringKeyedMap(raw);
        loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Map<String, dynamic> get _c => detail ?? widget.initial ?? {};

  Future<void> _edit() async {
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => CustomerFormScreen(initial: _c)),
    );
    if (ok == true) {
      changed = true;
      await _load();
    }
  }

  Future<void> _collect() async {
    final ok = await showCustomerCollectPayment(context, _c, onCollected: _load);
    if (ok) changed = true;
  }

  Future<void> _call() async {
    final phone = _c['phone']?.toString() ?? '';
    if (phone.isEmpty) return;
    await launchUrl(Uri.parse('tel:$phone'));
  }

  Future<void> _whatsapp() async {
    final phone = _c['phone']?.toString() ?? '';
    if (phone.isEmpty) return;
    final wa = _waPhone(phone);
    if (wa.length < 10) return;
    await launchUrl(Uri.parse('https://wa.me/$wa'), mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final c = _c;
    final name = c['name']?.toString() ?? 'Customer';
    final phone = c['phone']?.toString() ?? '';
    final outstanding = asDouble(c['outstandingBalance'] ?? c['outstanding']);
    final points = asInt(c['loyaltyPoints']);
    final creditLimit = asDouble(c['creditLimit']);
    final seg = c['segment']?.toString() ?? 'RETAIL';
    final segLabel = seg.isNotEmpty ? seg[0] + seg.substring(1).toLowerCase() : 'Retail';

    final invoices = (c['invoices'] as List? ?? []).whereType<Map>().map(asStringKeyedMap).toList();
    final repairs = (c['repairJobs'] as List? ?? []).whereType<Map>().map(asStringKeyedMap).toList();

    final addrParts = [
      c['address'],
      c['addressLine2'],
      c['city'],
      c['pincode'],
      if (c['stateCode'] != null) 'State ${c['stateCode']}',
    ].where((x) => x != null && x.toString().trim().isNotEmpty).join(', ');

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(changed);
      },
      child: Scaffold(
        backgroundColor: AppColors.canvas,
        appBar: AppBar(
          title: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis),
          actions: [
            IconButton(tooltip: 'Edit', onPressed: loading ? null : _edit, icon: const Icon(Icons.edit_rounded)),
            IconButton(tooltip: 'Refresh', onPressed: _load, icon: const Icon(Icons.refresh_rounded)),
          ],
        ),
        body: loading && detail == null
            ? const AppLoader()
            : error != null && detail == null
                ? ListView(
                    padding: AppSpace.page,
                    children: [
                      AppPanel(
                        child: Text(error!, style: const TextStyle(color: AppColors.danger)),
                      ),
                    ],
                  )
                : RefreshIndicator(
                    color: AppColors.teal,
                    onRefresh: _load,
                    child: ListView(
                      padding: AppSpace.page,
                      children: [
                        AppPanel(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  CircleAvatar(
                                    radius: 28,
                                    backgroundColor: AppColors.tealSoft,
                                    child: Text(
                                      name.isNotEmpty ? name[0].toUpperCase() : '?',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 22,
                                        fontWeight: FontWeight.w800,
                                        color: AppColors.tealDark,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 14),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          name,
                                          style: GoogleFonts.plusJakartaSans(
                                            fontSize: 18,
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                        if (phone.isNotEmpty)
                                          Text(
                                            phone,
                                            style: GoogleFonts.plusJakartaSans(color: AppColors.muted),
                                          ),
                                        Text(
                                          segLabel,
                                          style: GoogleFonts.plusJakartaSans(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w600,
                                            color: AppColors.tealDark,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 14),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  _StatChip(
                                    label: 'Outstanding',
                                    value: _inr.format(outstanding),
                                    color: outstanding > 0 ? AppColors.danger : AppColors.tealDark,
                                  ),
                                  if (points > 0)
                                    _StatChip(label: 'Loyalty', value: '$points pts', color: AppColors.tealDark),
                                  if (creditLimit > 0)
                                    _StatChip(
                                      label: 'Credit limit',
                                      value: _inr.format(creditLimit),
                                      color: AppColors.muted,
                                    ),
                                ],
                              ),
                              if (phone.isNotEmpty) ...[
                                const SizedBox(height: 14),
                                Row(
                                  children: [
                                    Expanded(
                                      child: OutlinedButton.icon(
                                        onPressed: _call,
                                        icon: const Icon(Icons.call_rounded, size: 18),
                                        label: const Text('Call'),
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: OutlinedButton.icon(
                                        onPressed: _whatsapp,
                                        icon: const Icon(Icons.chat_rounded, size: 18),
                                        label: const Text('WhatsApp'),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ],
                          ),
                        ),
                        AppSpace.sectionGap,
                        AppPanel(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Details',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.muted,
                                ),
                              ),
                              const SizedBox(height: 8),
                              _DetailRow(label: 'Email', value: c['email']?.toString()),
                              _DetailRow(label: 'GSTIN', value: c['gstin']?.toString()),
                              if (addrParts.isNotEmpty) _DetailRow(label: 'Address', value: addrParts),
                              _DetailRow(
                                label: 'WhatsApp',
                                value: c['whatsappOptIn'] == true ? 'Opted in' : 'Not opted in',
                              ),
                            ],
                          ),
                        ),
                        AppSpace.sectionGap,
                        Row(
                          children: [
                            Expanded(
                              child: FilledButton.icon(
                                onPressed: _collect,
                                icon: const Icon(Icons.payments_rounded, size: 18),
                                label: const Text('Collect payment'),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: _edit,
                                icon: const Icon(Icons.edit_rounded, size: 18),
                                label: const Text('Edit'),
                              ),
                            ),
                          ],
                        ),
                        AppSpace.sectionGap,
                        Text(
                          'Recent invoices',
                          style: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 8),
                        if (invoices.isEmpty)
                          AppPanel(
                            child: Text(
                              'No invoices yet.',
                              style: GoogleFonts.plusJakartaSans(color: AppColors.muted),
                            ),
                          )
                        else
                          ...invoices.map((inv) {
                            final invId = inv['id']?.toString() ?? '';
                            final num = inv['invoiceNumber']?.toString() ?? invId;
                            final total = asDouble(inv['grandTotal'] ?? inv['total']);
                            final status = inv['status']?.toString() ?? '';
                            final date = inv['invoiceDate']?.toString() ?? inv['createdAt']?.toString() ?? '';
                            final d = date.isNotEmpty ? DateTime.tryParse(date) : null;
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: AppPanel(
                                padding: EdgeInsets.zero,
                                child: ListTile(
                                  title: Text(
                                    '#$num',
                                    style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                                  ),
                                  subtitle: Text(
                                    [
                                      if (d != null) _dateFmt.format(d.toLocal()),
                                      if (status.isNotEmpty) status,
                                    ].join(' · '),
                                  ),
                                  trailing: Text(
                                    _inr.format(total),
                                    style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800),
                                  ),
                                  onTap: invId.isEmpty
                                      ? null
                                      : () => Navigator.of(context).push(
                                            MaterialPageRoute(
                                              builder: (_) => InvoiceDetailScreen(invoiceId: invId),
                                            ),
                                          ),
                                ),
                              ),
                            );
                          }),
                        if (repairs.isNotEmpty) ...[
                          AppSpace.sectionGap,
                          Text(
                            'Recent repairs',
                            style: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 8),
                          ...repairs.take(5).map((job) {
                            final status = job['status']?.toString() ?? '';
                            final device = job['deviceModel']?.toString() ?? job['deviceType']?.toString() ?? 'Repair';
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: AppPanel(
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        device,
                                        style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600),
                                      ),
                                    ),
                                    Text(
                                      status,
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.muted,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          }),
                        ],
                        const SizedBox(height: 32),
                      ],
                    ),
                  ),
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({required this.label, required this.value, required this.color});

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppRadius.sm),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: GoogleFonts.plusJakartaSans(fontSize: 10, color: AppColors.muted)),
          Text(value, style: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w800, color: color)),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, this.value});

  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    final v = value?.trim();
    if (v == null || v.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 88,
            child: Text(
              label,
              style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600),
            ),
          ),
          Expanded(
            child: Text(v, style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w500)),
          ),
        ],
      ),
    );
  }
}
