import 'package:flutter/material.dart';

import 'package:flutter/services.dart';

import 'package:google_fonts/google_fonts.dart';

import 'package:provider/provider.dart';

import 'package:share_plus/share_plus.dart';

import '../l10n/app_strings.dart';



import '../models/models.dart';

import '../screens/barcode_scanner_screen.dart';

import '../services/auth_state.dart';

import '../theme/app_theme.dart';

import '../theme/appearance_prefs.dart';

import '../widgets/app_loader.dart';

import '../theme/app_ui.dart';
import '../services/bluetooth_thermal_printer.dart';



const _varianceReasons = <String, String>{

  '': '— reason —',

  'shrink': 'Shrink / theft',

  'damage': 'Damage',

  'found': 'Found stock',

  'recount': 'Recount error',

  'other': 'Other',

};



class StockTakeScreen extends StatefulWidget {

  const StockTakeScreen({super.key});



  @override

  State<StockTakeScreen> createState() => _StockTakeScreenState();

}



class _StockTakeScreenState extends State<StockTakeScreen> {

  List<Map<String, dynamic>> takes = [];

  Map<String, dynamic>? active;

  final counts = <String, TextEditingController>{};

  final reasons = <String, String>{};

  final notesCtrl = TextEditingController();

  final scanCtrl = TextEditingController();

  bool loading = true;

  bool saving = false;

  String? error;

  String? success;



  @override

  void initState() {

    super.initState();

    _load();

  }



  @override

  void dispose() {

    notesCtrl.dispose();

    scanCtrl.dispose();

    for (final c in counts.values) {

      c.dispose();

    }

    super.dispose();

  }



  void _hydrateTake(Map<String, dynamic> take) {

    for (final c in counts.values) {

      c.dispose();

    }

    counts.clear();

    reasons.clear();

    final lines = (take['lines'] is List) ? take['lines'] as List : const [];

    for (final raw in lines.whereType<Map>()) {

      final l = asStringKeyedMap(raw);

      final id = l['id']?.toString() ?? '';

      final counted = l['countedQty'];

      counts[id] = TextEditingController(

        text: counted != null ? counted.toString() : '',

      );

      reasons[id] = l['varianceReason']?.toString() ?? '';

    }

  }



  Future<void> _load() async {

    setState(() {

      loading = true;

      error = null;

    });

    try {

      final api = context.read<AuthState>().api;

      final raw = await api.get('/stock-takes');

      final list = raw is List

          ? raw.whereType<Map>().map((e) => asStringKeyedMap(e)).toList()

          : <Map<String, dynamic>>[];

      Map<String, dynamic>? inProgress;

      for (final t in list) {

        final status = t['status']?.toString();

        if (status == 'OPEN' || status == 'PENDING_APPROVAL') {

          inProgress = t;

          break;

        }

      }

      if (inProgress != null) {

        _hydrateTake(inProgress);

      } else {

        for (final c in counts.values) {

          c.dispose();

        }

        counts.clear();

        reasons.clear();

      }

      setState(() {

        takes = list;

        active = inProgress;

        loading = false;

      });

    } catch (e) {

      setState(() {

        error = e.toString();

        loading = false;

      });

    }

  }



  Future<void> _start() async {

    setState(() {

      saving = true;

      error = null;

      success = null;

    });

    try {

      final api = context.read<AuthState>().api;

      await api.post('/stock-takes', body: {

        if (notesCtrl.text.trim().isNotEmpty) 'notes': notesCtrl.text.trim(),

      });

      notesCtrl.clear();

      setState(() => success = 'Stock take started');

      await _load();

    } catch (e) {

      setState(() => error = e.toString());

    } finally {

      if (mounted) setState(() => saving = false);

    }

  }



  Future<void> _scan({String? code}) async {

    final take = active;

    final value = (code ?? scanCtrl.text).trim();

    if (take == null || value.isEmpty) return;

    setState(() {

      saving = true;

      error = null;

    });

    try {

      final api = context.read<AuthState>().api;

      final updated = await api.post('/stock-takes/${take['id']}/scan', body: {'code': value});

      if (updated is Map) {

        final m = asStringKeyedMap(updated);

        _hydrateTake(m);

        setState(() {

          active = m;

          success = 'Scan counted +1';

        });

      }

      scanCtrl.clear();

      await _load();

    } catch (e) {

      setState(() => error = e.toString());

    } finally {

      if (mounted) setState(() => saving = false);

    }

  }



  Future<void> _openScanner() async {

    final code = await BarcodeScannerScreen.open(context, title: 'Scan to count');

    if (code != null && code.trim().isNotEmpty) {

      await _scan(code: code.trim());

    }

  }



  List<Map<String, dynamic>> _linesPayload() {

    final take = active;

    if (take == null) return [];

    final lines = (take['lines'] is List) ? take['lines'] as List : const [];

    final out = <Map<String, dynamic>>[];

    for (final raw in lines.whereType<Map>()) {

      final l = asStringKeyedMap(raw);

      final id = l['id']?.toString() ?? '';

      final text = counts[id]?.text.trim() ?? '';

      if (text.isEmpty) continue;

      out.add({

        'lineId': id,

        'countedQty': double.tryParse(text) ?? 0,

        if ((reasons[id] ?? '').trim().isNotEmpty) 'varianceReason': reasons[id]!.trim(),

      });

    }

    return out;

  }



  Future<void> _saveCounts() async {

    final take = active;

    if (take == null) return;

    final lines = _linesPayload();

    if (lines.isEmpty) {

      setState(() => error = 'Enter at least one counted quantity.');

      return;

    }

    setState(() {

      saving = true;

      error = null;

    });

    try {

      final api = context.read<AuthState>().api;

      await api.patch('/stock-takes/${take['id']}/counts', body: {'lines': lines});

      setState(() => success = 'Counts saved');

      await _load();

    } catch (e) {

      setState(() => error = e.toString());

    } finally {

      if (mounted) setState(() => saving = false);

    }

  }



  Future<void> _submit() async {

    final take = active;

    if (take == null) return;

    await _saveCounts();

    setState(() => saving = true);

    try {

      final api = context.read<AuthState>().api;

      final result = await api.post('/stock-takes/${take['id']}/complete');

      if (result is Map && result['status']?.toString() == 'PENDING_APPROVAL') {

        setState(() => success = 'Submitted for owner approval');

      } else {

        setState(() => success = 'Stock take completed · variances posted');

      }

      await _load();

    } catch (e) {

      setState(() => error = e.toString());

    } finally {

      if (mounted) setState(() => saving = false);

    }

  }



  Future<void> _approve() async {

    final take = active;

    if (take == null) return;

    setState(() => saving = true);

    try {

      final api = context.read<AuthState>().api;

      await api.post('/stock-takes/${take['id']}/approve');

      setState(() => success = 'Approved · variances posted');

      await _load();

    } catch (e) {

      setState(() => error = e.toString());

    } finally {

      if (mounted) setState(() => saving = false);

    }

  }



  Future<void> _cancel() async {

    final take = active;

    if (take == null) return;

    final ok = await showDialog<bool>(

      context: context,

      builder: (ctx) => AlertDialog(

        title: const Text('Cancel stock take?'),

        content: const Text('No stock changes will be applied.'),

        actions: [

          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep')),

          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Cancel session')),

        ],

      ),

    );

    if (ok != true) return;

    setState(() => saving = true);

    try {

      final api = context.read<AuthState>().api;

      await api.post('/stock-takes/${take['id']}/cancel', body: {});

      setState(() => success = 'Stock take cancelled');

      await _load();

    } catch (e) {

      setState(() => error = e.toString());

    } finally {

      if (mounted) setState(() => saving = false);

    }

  }



  Future<void> _shareThermalJob() async {

    setState(() {

      saving = true;

      error = null;

    });

    try {

      final api = context.read<AuthState>().api;

      final invoices = await api.get('/invoices?pageSize=1');

      String? invoiceId;

      if (invoices is Map && invoices['items'] is List) {

        final items = invoices['items'] as List;

        if (items.isNotEmpty && items.first is Map) {

          invoiceId = asStringKeyedMap(items.first as Map)['id']?.toString();

        }

      }

      if (invoiceId == null || invoiceId.isEmpty) {

        setState(() => error = 'No invoice for thermal preview');

        return;

      }

      final job = await api.post('/hardware/print-thermal', body: {'invoiceId': invoiceId});

      if (job is! Map) return;

      final m = asStringKeyedMap(job);

      final text = m['text']?.toString() ?? '';

      final escpos = m['escposBase64']?.toString() ?? '';

      final mac = (m['bluetoothAddress']?.toString() ?? '').trim().isNotEmpty
          ? m['bluetoothAddress']!.toString()
          : AppearancePrefsController.instance.printerMac;

      var printed = false;

      if (escpos.isNotEmpty) {

        printed = await BluetoothThermalPrinter.printEscPosBase64(escpos, mac: mac);

        if (!printed) {

          await BluetoothThermalPrinter.copyBase64Fallback(escpos);

        }

      }

      if (!printed && text.isNotEmpty) {

        await SharePlus.instance.share(ShareParams(text: text, subject: 'Thermal receipt'));

      }

      setState(() => success = printed
          ? 'Printed to Bluetooth thermal (${mac.isEmpty ? "paired" : mac})'
          : 'BT print failed — ESC/POS copied / text shared');

    } catch (e) {

      setState(() => error = e.toString());

    } finally {

      if (mounted) setState(() => saving = false);

    }

  }



  bool _hasVariance(Map<String, dynamic> line) {

    final id = line['id']?.toString() ?? '';

    final text = counts[id]?.text.trim() ?? '';

    if (text.isEmpty) return false;

    final counted = double.tryParse(text) ?? 0;

    final system = asDouble(line['systemQty']);

    return (counted - system).abs() >= 0.001;

  }



  @override

  Widget build(BuildContext context) {

    final lines = (active?['lines'] is List) ? active!['lines'] as List : const [];

    final status = active?['status']?.toString() ?? '';

    final isPending = status == 'PENDING_APPROVAL';

    final isOpen = status == 'OPEN';

    final missingFields = active?['missingFields'] is List ? active!['missingFields'] as List : const [];

    final missingReasons = asDouble(active?['missingReasons']).toInt();



    return Scaffold(

      backgroundColor: AppColors.canvas,

      appBar: AppBar(

        title: Text(context.watch<AppStrings>().t('stock_take')),

        actions: [

          IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)),

        ],

      ),

      body: loading

          ? const AppLoader()

          : RefreshIndicator(

              onRefresh: _load,

              child: ListView(

                padding: AppSpace.page,

                children: [

                  if (error != null)

                    AppPanel(child: Text(error!, style: const TextStyle(color: AppColors.danger))),

                  if (success != null)

                    AppPanel(child: Text(success!, style: TextStyle(color: AppColors.tealDark))),

                  if (active == null) ...[

                    AppPanel(

                      child: Column(

                        crossAxisAlignment: CrossAxisAlignment.stretch,

                        children: [

                          Text('Start cycle count', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800)),

                          TextField(controller: notesCtrl, decoration: const InputDecoration(labelText: 'Notes')),

                          const SizedBox(height: 8),

                          FilledButton(

                            onPressed: saving ? null : _start,

                            child: Text(saving ? 'Starting…' : 'Start stock take'),

                          ),

                        ],

                      ),

                    ),

                  ] else ...[

                    Text(

                      isPending ? 'Pending approval' : 'In progress · ${lines.length} products',

                      style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800),

                    ),

                    if (missingFields.isNotEmpty || missingReasons > 0)

                      Padding(

                        padding: const EdgeInsets.only(top: 6),

                        child: Wrap(

                          spacing: 6,

                          runSpacing: 4,

                          children: [

                            ...missingFields.map((f) => Chip(

                                  label: Text(f.toString(), style: const TextStyle(fontSize: 11)),

                                  visualDensity: VisualDensity.compact,

                                )),

                            if (missingReasons > 0)

                              Chip(

                                label: Text('$missingReasons missing reason(s)', style: const TextStyle(fontSize: 11)),

                                backgroundColor: Colors.red.shade50,

                                visualDensity: VisualDensity.compact,

                              ),

                          ],

                        ),

                      ),

                    if (isOpen) ...[

                      const SizedBox(height: 8),

                      Row(

                        children: [

                          Expanded(

                            child: TextField(

                              controller: scanCtrl,

                              decoration: const InputDecoration(

                                labelText: 'Barcode / SKU',

                                hintText: 'Scan or type',

                              ),

                              onSubmitted: (_) => _scan(),

                            ),

                          ),

                          IconButton(onPressed: saving ? null : _openScanner, icon: const Icon(Icons.qr_code_scanner)),

                          FilledButton.tonal(onPressed: saving ? null : () => _scan(), child: const Text('+1')),

                        ],

                      ),

                    ],

                    const SizedBox(height: 8),

                    ...lines.whereType<Map>().map((raw) {

                      final l = asStringKeyedMap(raw);

                      final id = l['id']?.toString() ?? '';

                      final product = l['product'] is Map

                          ? asStringKeyedMap(l['product'] as Map)

                          : <String, dynamic>{};

                      counts.putIfAbsent(id, () => TextEditingController(text: ''));

                      final showReason = _hasVariance(l);

                      return Padding(

                        padding: const EdgeInsets.only(bottom: 8),

                        child: AppPanel(

                          child: Column(

                            crossAxisAlignment: CrossAxisAlignment.start,

                            children: [

                              Text(

                                product['name']?.toString() ?? 'Product',

                                style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),

                              ),

                              Text(

                                'System ${asDouble(l['systemQty']).toStringAsFixed(0)} · ${product['sku'] ?? ''}',

                                style: TextStyle(color: AppColors.muted, fontSize: 12),

                              ),

                              TextField(

                                controller: counts[id],

                                enabled: !isPending,

                                keyboardType: const TextInputType.numberWithOptions(decimal: true),

                                decoration: const InputDecoration(labelText: 'Counted qty'),

                                onChanged: (_) => setState(() {}),

                              ),

                              if (showReason)

                                DropdownButtonFormField<String>(

                                  value: (reasons[id]?.isNotEmpty ?? false) ? reasons[id] : '',

                                  decoration: const InputDecoration(labelText: 'Variance reason'),

                                  items: _varianceReasons.entries

                                      .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))

                                      .toList(),

                                  onChanged: isPending

                                      ? null

                                      : (v) => setState(() => reasons[id] = v ?? ''),

                                ),

                            ],

                          ),

                        ),

                      );

                    }),

                    if (isOpen) ...[

                      FilledButton.tonal(

                        onPressed: saving ? null : _saveCounts,

                        child: const Text('Save counts'),

                      ),

                      const SizedBox(height: 8),

                      FilledButton(

                        onPressed: saving ? null : _submit,

                        child: const Text('Submit for approval / complete'),

                      ),

                    ],

                    if (isPending)

                      FilledButton(

                        onPressed: saving ? null : _approve,

                        child: const Text('Approve & apply variances'),

                      ),

                    const SizedBox(height: 8),

                    OutlinedButton(

                      onPressed: saving ? null : _cancel,

                      child: const Text('Cancel session'),

                    ),

                    const SizedBox(height: 8),

                    TextButton(

                      onPressed: saving ? null : _shareThermalJob,

                      child: const Text('Share last invoice thermal (BT helper)'),

                    ),

                  ],

                  const SizedBox(height: 16),

                  Text('History', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800)),

                  ...takes.map(

                    (t) => ListTile(

                      title: Text(t['status']?.toString() ?? ''),

                      subtitle: Text(t['createdAt']?.toString() ?? ''),

                      dense: true,

                    ),

                  ),

                ],

              ),

            ),

    );

  }

}

