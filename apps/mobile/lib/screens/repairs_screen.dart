import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../l10n/app_strings.dart';

import '../models/models.dart';
import '../services/auth_state.dart';
import '../theme/app_theme.dart';
import '../widgets/app_loader.dart';
import '../widgets/document_viewer.dart';
import '../widgets/floating_calculator.dart';
import '../theme/app_ui.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹');
final _day = DateFormat('dd MMM yyyy, HH:mm');

const _statusFlow = <String, List<String>>{
  'RECEIVED': ['DIAGNOSED', 'CANCELLED'],
  'DIAGNOSED': ['AWAITING_PARTS', 'IN_REPAIR', 'CANCELLED'],
  'AWAITING_PARTS': ['IN_REPAIR', 'CANCELLED'],
  'IN_REPAIR': ['READY', 'CANCELLED'],
  'READY': ['DELIVERED'],
  'DELIVERED': [],
  'CANCELLED': [],
};

const _statusFilters = [
  '',
  'RECEIVED',
  'DIAGNOSED',
  'AWAITING_PARTS',
  'IN_REPAIR',
  'READY',
  'DELIVERED',
  'CANCELLED',
];

String _statusLabel(String s) => s.replaceAll('_', ' ');

/// Repair jobs — list, create, status, parts, photo upload.
class RepairsScreen extends StatefulWidget {
  const RepairsScreen({super.key, this.initialStatus});

  /// Optional status filter (e.g. open jobs when tapping home metric).
  final String? initialStatus;

  @override
  State<RepairsScreen> createState() => _RepairsScreenState();
}

class _RepairsScreenState extends State<RepairsScreen> {
  List<Map<String, dynamic>> jobs = [];
  List<Map<String, dynamic>> customers = [];
  String statusFilter = '';
  bool loading = true;
  bool saving = false;
  String? error;
  String? success;

  final deviceCtrl = TextEditingController();
  final imeiCtrl = TextEditingController();
  final issueCtrl = TextEditingController();
  final estimateCtrl = TextEditingController();
  String? customerId;
  bool showCreate = false;

  @override
  void initState() {
    super.initState();
    statusFilter = widget.initialStatus ?? '';
    _load();
  }

  @override
  void dispose() {
    deviceCtrl.dispose();
    imeiCtrl.dispose();
    issueCtrl.dispose();
    estimateCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final query = <String, String>{};
      if (statusFilter.isNotEmpty) query['status'] = statusFilter;
      final results = await Future.wait([
        api.get('/repairs', query: query.isEmpty ? null : query),
        api.get('/customers'),
      ]);
      final rawJobs = results[0];
      final jobList = rawJobs is List
          ? rawJobs
          : (rawJobs is Map && rawJobs['items'] is List ? rawJobs['items'] as List : const []);
      final custRaw = results[1];
      final custList = custRaw is List
          ? custRaw
          : (custRaw is Map && custRaw['items'] is List ? custRaw['items'] as List : const []);
      setState(() {
        jobs = jobList.whereType<Map>().map((e) => asStringKeyedMap(e)).toList();
        customers = custList.whereType<Map>().map((e) => asStringKeyedMap(e)).toList();
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<void> _create() async {
    if (customerId == null || customerId!.isEmpty) {
      setState(() => error = 'Select a customer');
      return;
    }
    if (deviceCtrl.text.trim().isEmpty || issueCtrl.text.trim().isEmpty) {
      setState(() => error = 'Device model and issue are required');
      return;
    }
    setState(() {
      saving = true;
      error = null;
      success = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final estimate = double.tryParse(estimateCtrl.text.trim());
      await api.post('/repairs', body: {
        'customerId': customerId,
        'deviceModel': deviceCtrl.text.trim(),
        'imei': imeiCtrl.text.trim().isEmpty ? null : imeiCtrl.text.trim(),
        'issue': issueCtrl.text.trim(),
        if (estimate != null) 'estimateAmount': estimate,
      });
      deviceCtrl.clear();
      imeiCtrl.clear();
      issueCtrl.clear();
      estimateCtrl.clear();
      customerId = null;
      setState(() {
        showCreate = false;
        success = 'Repair job created';
        saving = false;
      });
      await _load();
    } catch (e) {
      setState(() {
        error = e.toString();
        saving = false;
      });
    }
  }

  int get openCount =>
      jobs.where((j) => !['DELIVERED', 'CANCELLED'].contains(j['status']?.toString())).length;

  @override
  Widget build(BuildContext context) {
    final strings = context.watch<AppStrings>();
    final colors = AppColors.of(context);
    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: AppBar(
        title: Text(strings.t('repair_jobs')),
        actions: [
          const CalculatorAppBarButton(),
          IconButton(
            onPressed: loading ? null : _load,
            icon: Icon(Icons.refresh_rounded, color: colors.ink),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'repairs_new_job',
        onPressed: () => setState(() => showCreate = !showCreate),
        icon: Icon(showCreate ? Icons.close : Icons.add),
        label: Text(showCreate ? strings.t('close') : strings.t('new_job')),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(AppSpace.md, AppSpace.sm, AppSpace.md, AppSpace.xs),
            child: Row(
              children: [
                for (final s in _statusFilters)
                  Padding(
                    padding: const EdgeInsets.only(right: AppSpace.xs),
                    child: AppSegChip(
                      dense: true,
                      label: s.isEmpty ? strings.t('all') : _statusLabel(s),
                      selected: statusFilter == s,
                      onTap: () {
                        setState(() => statusFilter = s);
                        _load();
                      },
                    ),
                  ),
              ],
            ),
          ),
          if (!loading)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.md),
              child: Text(
                '${jobs.length} jobs · $openCount open in this list',
                style: GoogleFonts.plusJakartaSans(fontSize: 12, color: colors.muted),
              ),
            ),
          if (loading) const AppLinearLoader(),
          if (error != null)
            Padding(
              padding: AppSpace.page,
              child: Text(error!, style: const TextStyle(color: AppColors.danger)),
            ),
          if (success != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.md),
              child: Text(success!, style: TextStyle(color: colors.primaryDark)),
            ),
          Expanded(
            child: RefreshIndicator(
              color: colors.primary,
              onRefresh: _load,
              child: ListView(
                padding: AppSpace.listWithFab(),
                children: [
                  if (showCreate) ...[
                    AppPanel(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            'New repair job',
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w800,
                              fontSize: 16,
                              color: colors.inkOn(colors.surface),
                            ),
                          ),
                          const SizedBox(height: 12),
                          DropdownButtonFormField<String>(
                            value: customerId,
                            isExpanded: true,
                            decoration: const InputDecoration(labelText: 'Customer'),
                            items: customers
                                .map(
                                  (c) => DropdownMenuItem(
                                    value: c['id']?.toString(),
                                    child: Text(
                                      '${c['name']} · ${c['phone']}',
                                      overflow: TextOverflow.ellipsis,
                                      maxLines: 1,
                                    ),
                                  ),
                                )
                                .toList(),
                            onChanged: (v) => setState(() => customerId = v),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: deviceCtrl,
                            decoration: const InputDecoration(labelText: 'Device model'),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: imeiCtrl,
                            decoration: const InputDecoration(labelText: 'IMEI (optional)'),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: issueCtrl,
                            maxLines: 3,
                            decoration: const InputDecoration(labelText: 'Issue'),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: estimateCtrl,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(labelText: 'Estimate ₹ (optional)'),
                          ),
                          const SizedBox(height: 14),
                          FilledButton(
                            onPressed: saving ? null : _create,
                            child: Text(saving ? 'Saving…' : 'Create job'),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  if (!loading && jobs.isEmpty)
                    AppPanel(
                      child: Text(
                        'No repair jobs yet. Tap New job to receive a device.',
                        style: TextStyle(color: colors.mutedOn(colors.surface)),
                      ),
                    ),
                  for (final job in jobs)
                    AppPanel(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: EdgeInsets.zero,
                      onTap: () async {
                        await Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => RepairDetailScreen(jobId: job['id']!.toString()),
                          ),
                        );
                        if (mounted) _load();
                      },
                      child: ListTile(
                        title: Text(
                          job['jobNumber']?.toString() ?? '',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: colors.inkOn(colors.surface),
                          ),
                        ),
                        subtitle: Text(
                          '${job['deviceModel']}\n'
                          '${(job['customer'] is Map ? asStringKeyedMap(job['customer'])['name'] : '')} · '
                          '${_statusLabel(job['status']?.toString() ?? '')}',
                          style: TextStyle(color: colors.mutedOn(colors.surface)),
                        ),
                        isThreeLine: true,
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            if (job['estimateAmount'] != null)
                              Text(
                                _inr.format(asDouble(job['estimateAmount'])),
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  color: colors.inkOn(colors.surface),
                                ),
                              ),
                            Icon(Icons.chevron_right_rounded, color: colors.mutedOn(colors.surface)),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class RepairDetailScreen extends StatefulWidget {
  const RepairDetailScreen({super.key, required this.jobId});
  final String jobId;

  @override
  State<RepairDetailScreen> createState() => _RepairDetailScreenState();
}

class _RepairDetailScreenState extends State<RepairDetailScreen> {
  Map<String, dynamic>? job;
  List<Map<String, dynamic>> products = [];
  List<Map<String, dynamic>> technicians = [];
  bool loading = true;
  bool busy = false;
  String? error;
  String? success;

  final notesCtrl = TextEditingController();
  final finalAmountCtrl = TextEditingController();
  final partQtyCtrl = TextEditingController(text: '1');
  final partPriceCtrl = TextEditingController();
  bool customerApproved = false;
  String? partProductId;
  String? technicianId;
  final picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    notesCtrl.dispose();
    finalAmountCtrl.dispose();
    partQtyCtrl.dispose();
    partPriceCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final results = await Future.wait([
        api.get('/repairs/${widget.jobId}'),
        api.get('/products', query: {'pageSize': '200'}),
        api.get('/users/technicians'),
      ]);
      final detail = asStringKeyedMap(results[0]);
      final prodRaw = results[1];
      final prodItems = asItemList(prodRaw);
      final techRaw = results[2];
      final techList = techRaw is List ? techRaw : const [];
      setState(() {
        job = detail;
        products = prodItems.whereType<Map>().map((e) => asStringKeyedMap(e)).toList();
        technicians = techList.whereType<Map>().map((e) => asStringKeyedMap(e)).toList();
        technicianId = detail['technician'] is Map
            ? asStringKeyedMap(detail['technician'])['id']?.toString()
            : null;
        customerApproved = detail['customerApproved'] == true;
        finalAmountCtrl.text = detail['finalAmount'] != null
            ? asDouble(detail['finalAmount']).toStringAsFixed(0)
            : (detail['estimateAmount'] != null
                ? asDouble(detail['estimateAmount']).toStringAsFixed(0)
                : '');
        loading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        loading = false;
      });
    }
  }

  Future<void> _setStatus(String status) async {
    setState(() {
      busy = true;
      error = null;
      success = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final finalAmt = double.tryParse(finalAmountCtrl.text.trim());
      await api.patch('/repairs/${widget.jobId}/status', body: {
        'status': status,
        if (notesCtrl.text.trim().isNotEmpty) 'notes': notesCtrl.text.trim(),
        'customerApproved': customerApproved,
        if (finalAmt != null) 'finalAmount': finalAmt,
      });
      notesCtrl.clear();
      setState(() {
        success = 'Status → ${_statusLabel(status)}';
        busy = false;
      });
      await _load();
    } catch (e) {
      setState(() {
        error = e.toString();
        busy = false;
      });
    }
  }

  Future<void> _assignTech() async {
    if (technicianId == null) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      await api.patch('/repairs/${widget.jobId}/technician', body: {
        'technicianId': technicianId,
      });
      setState(() {
        success = 'Technician assigned';
        busy = false;
      });
      await _load();
    } catch (e) {
      setState(() {
        error = e.toString();
        busy = false;
      });
    }
  }

  Future<void> _addPart() async {
    if (partProductId == null) {
      setState(() => error = 'Select a part');
      return;
    }
    final qty = double.tryParse(partQtyCtrl.text.trim()) ?? 0;
    final price = double.tryParse(partPriceCtrl.text.trim()) ?? 0;
    if (qty <= 0) {
      setState(() => error = 'Quantity must be > 0');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      await api.post('/repairs/${widget.jobId}/parts', body: {
        'productId': partProductId,
        'quantity': qty,
        'unitPrice': price,
      });
      partProductId = null;
      partQtyCtrl.text = '1';
      partPriceCtrl.clear();
      setState(() {
        success = 'Part added';
        busy = false;
      });
      await _load();
    } catch (e) {
      setState(() {
        error = e.toString();
        busy = false;
      });
    }
  }

  Future<void> _uploadPhoto(ImageSource source) async {
    final api = context.read<AuthState>().api;
    final shot = await picker.pickImage(source: source, imageQuality: 85);
    if (shot == null || !mounted) return;
    setState(() {
      busy = true;
      error = null;
      success = null;
    });
    try {
      await api.uploadFile(
        '/repairs/${widget.jobId}/photos',
        filePath: shot.path,
        filename: shot.name,
      );
      if (!mounted) return;
      setState(() {
        success = 'Photo uploaded';
        busy = false;
      });
      await _load();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        error = e.toString();
        busy = false;
      });
    }
  }

  Future<void> _sendEstimate() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      await api.post('/repairs/${widget.jobId}/send-estimate');
      setState(() {
        success = 'Estimate sent';
        busy = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        busy = false;
      });
    }
  }

  Future<void> _createInvoice() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      await api.post('/repairs/${widget.jobId}/create-invoice');
      setState(() {
        success = 'Invoice created';
        busy = false;
      });
      await _load();
    } catch (e) {
      setState(() {
        error = e.toString();
        busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    final ink = colors.inkOn(colors.surface);
    final muted = colors.mutedOn(colors.surface);
    final j = job;
    final next = j == null ? <String>[] : (_statusFlow[j['status']?.toString()] ?? []);
    final photos = j?['photoUrls'] is List
        ? (j!['photoUrls'] as List).map((e) => e.toString()).toList()
        : <String>[];
    final parts = j?['partsUsed'] is List ? j!['partsUsed'] as List : const [];
    final history = j?['statusHistory'] is List ? j!['statusHistory'] as List : const [];
    final customer = j?['customer'] is Map ? asStringKeyedMap(j!['customer']) : null;

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: AppBar(
        title: Text(j?['jobNumber']?.toString() ?? 'Repair'),
        actions: [
          IconButton(
            onPressed: loading ? null : _load,
            icon: Icon(Icons.refresh_rounded, color: colors.ink),
          ),
        ],
      ),
      body: loading
          ? const AppLoader()
          : j == null
              ? Center(
                  child: Text(
                    error ?? 'Not found',
                    style: TextStyle(color: error != null ? AppColors.danger : colors.muted),
                  ),
                )
              : ListView(
                  padding: AppSpace.page,
                  children: [
                    if (error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(error!, style: const TextStyle(color: AppColors.danger)),
                      ),
                    if (success != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(success!, style: TextStyle(color: colors.primaryDark)),
                      ),
                    AppPanel(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  j['deviceModel']?.toString() ?? '',
                                  style: GoogleFonts.plusJakartaSans(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 18,
                                    color: ink,
                                  ),
                                ),
                              ),
                              Chip(
                                label: Text(
                                  _statusLabel(j['status']?.toString() ?? ''),
                                  style: TextStyle(
                                    color: colors.primaryDark,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                backgroundColor: colors.tealSoft.withValues(alpha: 0.6),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(j['issue']?.toString() ?? '', style: TextStyle(color: ink)),
                          const SizedBox(height: 10),
                          Text(
                            '${customer?['name'] ?? ''} · ${customer?['phone'] ?? ''}',
                            style: TextStyle(color: muted),
                          ),
                          if (j['imei'] != null && j['imei'].toString().isNotEmpty)
                            Text('IMEI ${j['imei']}', style: TextStyle(color: muted)),
                          const SizedBox(height: 8),
                          Text(
                            'Estimate ${_inr.format(asDouble(j['estimateAmount']))}'
                            '${j['finalAmount'] != null ? ' · Final ${_inr.format(asDouble(j['finalAmount']))}' : ''}',
                            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, color: ink),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    AppPanel(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            'Update status',
                            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, color: ink),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: notesCtrl,
                            decoration: const InputDecoration(labelText: 'Notes (optional)'),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: finalAmountCtrl,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(labelText: 'Final amount ₹'),
                          ),
                          CheckboxListTile(
                            contentPadding: EdgeInsets.zero,
                            value: customerApproved,
                            onChanged: (v) => setState(() => customerApproved = v ?? false),
                            title: Text('Customer approved', style: TextStyle(color: ink)),
                            controlAffinity: ListTileControlAffinity.leading,
                            activeColor: colors.primary,
                          ),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              for (final s in next)
                                FilledButton(
                                  onPressed: busy ? null : () => _setStatus(s),
                                  child: Text(_statusLabel(s)),
                                ),
                            ],
                          ),
                          if (next.isEmpty)
                            Text('No further transitions', style: TextStyle(color: muted)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    AppPanel(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            'Technician & photos',
                            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, color: ink),
                          ),
                          const SizedBox(height: 8),
                          DropdownButtonFormField<String>(
                            value: technicianId,
                            isExpanded: true,
                            decoration: const InputDecoration(labelText: 'Technician'),
                            items: [
                              const DropdownMenuItem(value: null, child: Text('Unassigned')),
                              ...technicians.map(
                                (t) => DropdownMenuItem(
                                  value: t['id']?.toString(),
                                  child: Text(t['name']?.toString() ?? ''),
                                ),
                              ),
                            ],
                            onChanged: (v) => setState(() => technicianId = v),
                          ),
                          const SizedBox(height: 8),
                          OutlinedButton(
                            onPressed: busy || technicianId == null ? null : _assignTech,
                            child: const Text('Assign technician'),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: busy ? null : () => _uploadPhoto(ImageSource.camera),
                                  icon: Icon(Icons.photo_camera_outlined, color: colors.primary),
                                  label: const Text('Camera'),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: busy ? null : () => _uploadPhoto(ImageSource.gallery),
                                  icon: Icon(Icons.photo_library_outlined, color: colors.primary),
                                  label: const Text('Gallery'),
                                ),
                              ),
                            ],
                          ),
                          if (photos.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            SizedBox(
                              height: 120,
                              child: ListView.separated(
                                scrollDirection: Axis.horizontal,
                                itemCount: photos.length,
                                separatorBuilder: (_, __) => const SizedBox(width: 8),
                                itemBuilder: (_, i) {
                                  return SizedBox(
                                    width: 120,
                                    child: DocumentAttachmentTile(
                                      apiBaseUrl: context.read<AuthState>().api.baseUrl,
                                      path: photos[i].startsWith('http') ? null : photos[i],
                                      url: photos[i].startsWith('http') ? photos[i] : null,
                                      fileName: 'Repair photo ${i + 1}',
                                      height: 120,
                                    ),
                                  );
                                },
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    AppPanel(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            'Parts used',
                            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, color: ink),
                          ),
                          const SizedBox(height: 8),
                          DropdownButtonFormField<String>(
                            value: partProductId,
                            isExpanded: true,
                            decoration: const InputDecoration(labelText: 'Part from inventory'),
                            items: products
                                .map(
                                  (p) => DropdownMenuItem(
                                    value: p['id']?.toString(),
                                    child: Text(
                                      '${p['name']} (${p['sku']})',
                                      overflow: TextOverflow.ellipsis,
                                      maxLines: 1,
                                    ),
                                  ),
                                )
                                .toList(),
                            onChanged: (v) {
                              setState(() {
                                partProductId = v;
                                Map<String, dynamic>? p;
                                for (final e in products) {
                                  if (e['id']?.toString() == v) {
                                    p = e;
                                    break;
                                  }
                                }
                                if (p != null) {
                                  partPriceCtrl.text = asDouble(p['salePrice']).toStringAsFixed(0);
                                }
                              });
                            },
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: partQtyCtrl,
                                  keyboardType: TextInputType.number,
                                  decoration: const InputDecoration(labelText: 'Qty'),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: TextField(
                                  controller: partPriceCtrl,
                                  keyboardType: TextInputType.number,
                                  decoration: const InputDecoration(labelText: 'Unit ₹'),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          FilledButton(
                            onPressed: busy ? null : _addPart,
                            child: const Text('Add part'),
                          ),
                          const SizedBox(height: 8),
                          ...parts.whereType<Map>().map((raw) {
                            final p = asStringKeyedMap(raw);
                            final prod = p['product'] is Map ? asStringKeyedMap(p['product']) : null;
                            return ListTile(
                              contentPadding: EdgeInsets.zero,
                              dense: true,
                              title: Text(
                                prod?['name']?.toString() ?? 'Part',
                                style: TextStyle(color: ink, fontWeight: FontWeight.w600),
                              ),
                              subtitle: Text(
                                '${asDouble(p['quantity'])} × ${_inr.format(asDouble(p['unitPrice']))}',
                                style: TextStyle(color: muted),
                              ),
                              trailing: ConstrainedBox(
                                constraints: const BoxConstraints(maxWidth: 110),
                                child: Text(
                                  _inr.format(asDouble(p['quantity']) * asDouble(p['unitPrice'])),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  textAlign: TextAlign.end,
                                  style: TextStyle(fontWeight: FontWeight.w800, color: ink),
                                ),
                              ),
                            );
                          }),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    AppPanel(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            'Billing',
                            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, color: ink),
                          ),
                          const SizedBox(height: 8),
                          OutlinedButton(
                            onPressed: busy ? null : _sendEstimate,
                            child: const Text('Send estimate'),
                          ),
                          const SizedBox(height: 8),
                          FilledButton(
                            onPressed: busy ? null : _createInvoice,
                            child: Text(
                              j['linkedInvoiceId'] != null ? 'Create another invoice' : 'Create invoice',
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    AppPanel(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'History',
                            style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, color: ink),
                          ),
                          const SizedBox(height: 8),
                          ...history.whereType<Map>().map((raw) {
                            final h = asStringKeyedMap(raw);
                            final at = DateTime.tryParse(h['createdAt']?.toString() ?? '');
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Text(
                                '${_statusLabel(h['status']?.toString() ?? '')}'
                                '${h['notes'] != null && h['notes'].toString().isNotEmpty ? ' — ${h['notes']}' : ''}'
                                '${at != null ? '\n${_day.format(at.toLocal())}' : ''}',
                                style: TextStyle(fontSize: 13, color: muted, height: 1.35),
                              ),
                            );
                          }),
                        ],
                      ),
                    ),
                    const SizedBox(height: 40),
                  ],
                ),
    );
  }
}
