import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../l10n/app_strings.dart';
import '../services/auth_state.dart';
import '../services/invoice_print_loader.dart';
import '../services/local_db.dart';
import '../services/offline_sync.dart';
import '../services/voice_billing.dart';
import '../theme/app_theme.dart';
import '../widgets/app_loader.dart';
import '../theme/app_metrics.dart';
import '../theme/app_ui.dart';
import '../theme/appearance_prefs.dart';
import '../theme/theme_controller.dart';
import '../utils/app_feedback.dart';
import '../widgets/app_toast.dart';
import '../widgets/floating_calculator.dart';
import 'barcode_scanner_screen.dart';
import 'invoices_screen.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹');

class PosScreen extends StatefulWidget {
  const PosScreen({super.key, this.active = false});

  /// When false (other shell tabs), do not steal focus / open the keypad.
  final bool active;

  @override
  State<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends State<PosScreen> {
  List<Product> products = [];
  List<_CustomerOption> customers = [];
  final List<CartLine> cart = [];
  final scanCtrl = TextEditingController();
  final searchCtrl = TextEditingController();
  final notesCtrl = TextEditingController();
  final custNameCtrl = TextEditingController();
  final custPhoneCtrl = TextEditingController();
  final custGstinCtrl = TextEditingController();
  final custAddressCtrl = TextEditingController();
  final custAddressLine2Ctrl = TextEditingController();
  final custCityCtrl = TextEditingController();
  final custPincodeCtrl = TextEditingController();
  final scanFocus = FocusNode();

  String payment = 'CASH';
  String? paymentRef;
  String? customerId;
  String custStateCode = '';
  String category = 'All';
  String query = '';

  bool loading = true;
  bool saving = false;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncScanFocus());
  }

  @override
  void didUpdateWidget(covariant PosScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.active != widget.active) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _syncScanFocus());
    }
  }

  void _syncScanFocus() {
    if (!mounted) return;
    final voice = context.read<VoiceBillingService>();
    final wantFocus = widget.active &&
        !voice.listening &&
        AppearancePrefsController.instance.hardwareScannerFocus;
    if (wantFocus) {
      scanFocus.requestFocus();
    } else {
      scanFocus.unfocus();
      if (!widget.active) {
        FocusManager.instance.primaryFocus?.unfocus();
      }
    }
  }

  @override
  void dispose() {
    scanCtrl.dispose();
    searchCtrl.dispose();
    notesCtrl.dispose();
    custNameCtrl.dispose();
    custPhoneCtrl.dispose();
    custGstinCtrl.dispose();
    custAddressCtrl.dispose();
    custAddressLine2Ctrl.dispose();
    custCityCtrl.dispose();
    custPincodeCtrl.dispose();
    scanFocus.dispose();
    super.dispose();
  }

  _CustomerOption? get selectedCustomer {
    final id = customerId;
    if (id == null) return null;
    for (final c in customers) {
      if (c.id == id) return c;
    }
    return null;
  }

  bool get hasCustomerDetails =>
      customerId != null ||
      custNameCtrl.text.trim().isNotEmpty ||
      custPhoneCtrl.text.trim().isNotEmpty ||
      custGstinCtrl.text.trim().isNotEmpty;

  String get customerBarLabel {
    final saved = selectedCustomer;
    if (saved != null) {
      final phone = saved.phone.isNotEmpty ? ' · ${saved.phone}' : '';
      return '${saved.name}$phone';
    }
    final name = custNameCtrl.text.trim();
    final phone = custPhoneCtrl.text.trim();
    if (name.isNotEmpty || phone.isNotEmpty) {
      return [if (name.isNotEmpty) name, if (phone.isNotEmpty) phone].join(' · ');
    }
    return context.read<AppStrings>().t('walk_in');
  }

  void _clearCustomerForm() {
    customerId = null;
    custNameCtrl.clear();
    custPhoneCtrl.clear();
    custGstinCtrl.clear();
    custAddressCtrl.clear();
    custAddressLine2Ctrl.clear();
    custCityCtrl.clear();
    custPincodeCtrl.clear();
    custStateCode = '';
  }

  void _applyCustomer(_CustomerOption c) {
    customerId = c.id;
    custNameCtrl.text = c.name;
    custPhoneCtrl.text = c.phone;
    custGstinCtrl.text = c.gstin ?? '';
    custAddressCtrl.text = c.address ?? '';
    custAddressLine2Ctrl.text = c.addressLine2 ?? '';
    custCityCtrl.text = c.city ?? '';
    custPincodeCtrl.text = c.pincode ?? '';
    custStateCode = c.stateCode ?? '';
  }

  String? _stateFromGstin(String gstin) {
    final g = gstin.trim().toUpperCase();
    if (g.length < 2) return null;
    final code = g.substring(0, 2);
    if (RegExp(r'^\d{2}$').hasMatch(code)) return code;
    return null;
  }

  String? _normalizePhone(String raw) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return null;
    if (digits.length == 10) return digits;
    if (digits.length == 12 && digits.startsWith('91')) return digits.substring(2);
    if (digits.length == 11 && digits.startsWith('0')) return digits.substring(1);
    return null;
  }

  String? _normalizeGstin(String raw) {
    final g = raw.trim().toUpperCase();
    if (g.isEmpty) return null;
    if (g.length != 15) throw Exception(context.read<AppStrings>().t('gstin_invalid'));
    return g;
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final sync = context.read<OfflineSyncService>();
      await sync.refreshConnectivity();

      if (sync.online) {
        final results = await Future.wait([
          api.get('/products', query: {'pageSize': '200'}),
          api.get('/customers'),
        ]);

        final items = asItemList(results[0]);
        final custRaw = results[1];
        final custList = custRaw is List
            ? custRaw
            : (custRaw is Map && custRaw['items'] is List)
                ? custRaw['items'] as List
                : <dynamic>[];

        final productMaps = items
            .whereType<Map>()
            .map((e) => asStringKeyedMap(e))
            .toList();
        await LocalDb.instance.upsertProducts(productMaps);

        setState(() {
          products = productMaps
              .map(Product.fromJson)
              .where((p) => p.isActive)
              .toList();
          customers = custList.whereType<Map>().map((e) {
            final m = asStringKeyedMap(e);
            return _CustomerOption.fromJson(m);
          }).where((c) => c.id.isNotEmpty).toList();
        });
      } else {
        final cached = await LocalDb.instance.listProducts();
        setState(() {
          products = cached.map(Product.fromJson).where((p) => p.isActive).toList();
          customers = [];
          if (products.isEmpty) {
            error = 'Offline — no cached products. Open POS once online.';
          }
        });
      }
    } catch (e) {
      try {
        final cached = await LocalDb.instance.listProducts();
        setState(() {
          products = cached.map(Product.fromJson).where((p) => p.isActive).toList();
          error = products.isEmpty ? e.toString() : 'Using offline catalog';
        });
      } catch (_) {
        setState(() => error = e.toString());
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _voiceAdd() async {
    // Keyboard / scan field steals audio focus on many Android devices.
    scanFocus.unfocus();
    FocusManager.instance.primaryFocus?.unfocus();
    await Future<void>.delayed(const Duration(milliseconds: 180));
    if (!mounted) return;

    final voice = context.read<VoiceBillingService>();
    final strings = context.read<AppStrings>();
    final locale = strings.isHindi ? 'hi_IN' : 'en_IN';
    final intent = await voice.listenOnce(localeId: locale);
    if (!mounted) return;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final wantFocus = widget.active &&
          !voice.listening &&
          AppearancePrefsController.instance.hardwareScannerFocus;
      if (wantFocus) scanFocus.requestFocus();
    });

    if (voice.error != null && (intent == null || intent.query.isEmpty)) {
      _toast(voice.error!, errorStyle: true);
      return;
    }
    if (intent == null || intent.query.isEmpty) {
      final heard = voice.lastHeard.trim();
      _toast(
        heard.isEmpty
            ? '${strings.t('no_match')} — ${strings.t('voice_hint')}'
            : '${strings.t('no_match')}: "$heard"',
        errorStyle: true,
      );
      return;
    }
    if (products.isEmpty) {
      _toast('No products loaded — refresh the catalog first.', errorStyle: true);
      return;
    }
    final match = voice.bestMatch(
      intent,
      products
          .map(
            (p) => (
              id: p.id,
              name: p.name,
              brand: p.brand,
              model: p.model,
              sku: p.sku,
            ),
          )
          .toList(),
    );
    if (match == null) {
      _toast('${strings.t('no_match')}: "${intent.raw}"', errorStyle: true);
      return;
    }
    final product = products.firstWhere((p) => p.id == match.id);
    _add(product, qty: intent.quantity);
    _toast('${strings.t('added')}: ${product.name} × ${intent.quantity}');
  }

  List<String> get categories {
    final set = <String>{};
    for (final p in products) {
      if (p.category != null && p.category!.trim().isNotEmpty) {
        set.add(p.category!.trim());
      }
    }
    final list = set.toList()..sort();
    return ['All', ...list];
  }

  List<Product> get filteredProducts {
    final q = query.trim().toLowerCase();
    return products.where((p) {
      if (category != 'All' && (p.category ?? '') != category) return false;
      if (q.isEmpty) return true;
      return p.name.toLowerCase().contains(q) ||
          p.sku.toLowerCase().contains(q) ||
          (p.barcode?.toLowerCase().contains(q) ?? false) ||
          (p.brand?.toLowerCase().contains(q) ?? false) ||
          (p.model?.toLowerCase().contains(q) ?? false);
    }).toList();
  }

  double get subtotal => cart.fold(0.0, (s, l) => s + l.taxable);
  double get taxTotal => cart.fold(0.0, (s, l) => s + l.gstAmount);
  double get grandTotal => cart.fold(0.0, (s, l) => s + l.lineTotal);
  int get itemCount => cart.fold(0, (s, l) => s + l.quantity);

  void _toast(String msg, {bool errorStyle = false}) {
    if (!mounted) return;
    showAppToast(
      context,
      msg,
      tone: errorStyle ? AppToastTone.error : AppToastTone.info,
    );
  }

  Future<void> _add(Product p, {int qty = 1}) async {
    if (p.stockQty <= 0) {
      _toast('${p.name} is out of stock', errorStyle: true);
      AppFeedback.heavy();
      return;
    }
    final existing = cart.where((c) => c.product.id == p.id).firstOrNull;
    if (existing != null) {
      if (existing.quantity + qty > p.stockQty) {
        _toast('Only ${p.stockQty.toStringAsFixed(0)} in stock', errorStyle: true);
        return;
      }
      if (p.trackSerial) {
        final need = existing.quantity + qty;
        final picked = await _pickSerials(p, need, existing.serialNumbers);
        if (picked == null) return;
        setState(() {
          existing.quantity = need;
          existing.serialNumbers
            ..clear()
            ..addAll(picked);
          error = null;
        });
      } else {
        setState(() {
          existing.quantity += qty;
          error = null;
        });
      }
    } else {
      List<String> serials = [];
      if (p.trackSerial) {
        final picked = await _pickSerials(p, qty, const []);
        if (picked == null) return;
        serials = picked;
      }
      setState(() {
        cart.add(CartLine(product: p, quantity: qty, serialNumbers: serials));
        error = null;
      });
    }
    AppFeedback.scanBeep();
  }

  Future<List<String>?> _pickSerials(Product p, int need, List<String> preselected) async {
    final used = <String>{};
    for (final line in cart) {
      if (line.product.id == p.id) continue;
      used.addAll(line.serialNumbers);
    }
    final available = p.serials.where((s) => !used.contains(s) || preselected.contains(s)).toList();
    if (available.isEmpty) {
      _toast('No IMEI/serial in stock for ${p.name}. Receive on GRN first.', errorStyle: true);
      return null;
    }
    final selected = <String>{...preselected.where(available.contains)};
    final result = await showDialog<List<String>>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            return AlertDialog(
              title: Text('Select IMEI (${selected.length}/$need)'),
              content: SizedBox(
                width: double.maxFinite,
                child: ListView(
                  shrinkWrap: true,
                  children: available.map((s) {
                    final on = selected.contains(s);
                    return CheckboxListTile(
                      dense: true,
                      value: on,
                      title: Text(s, style: const TextStyle(fontFamily: 'monospace', fontSize: 14)),
                      onChanged: (v) {
                        setLocal(() {
                          if (v == true) {
                            if (selected.length < need) selected.add(s);
                          } else {
                            selected.remove(s);
                          }
                        });
                      },
                    );
                  }).toList(),
                ),
              ),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
                FilledButton(
                  onPressed: selected.length == need
                      ? () => Navigator.pop(ctx, selected.toList())
                      : null,
                  child: const Text('Confirm'),
                ),
              ],
            );
          },
        );
      },
    );
    return result;
  }

  void _scan() {
    final code = scanCtrl.text.trim();
    if (code.isEmpty) return;
    final matches = products.where(
      (x) =>
          x.barcode == code ||
          x.sku.toLowerCase() == code.toLowerCase() ||
          x.name.toLowerCase().contains(code.toLowerCase()),
    );
    if (matches.isEmpty) {
      _toast('No product for "$code"', errorStyle: true);
      return;
    }
    _add(matches.first);
    scanCtrl.clear();
    if (AppearancePrefsController.instance.hardwareScannerFocus) {
      scanFocus.requestFocus();
    }
  }

  Future<void> _scanWithCamera() async {
    final code = await BarcodeScannerScreen.open(
      context,
      title: 'Scan to bill',
      subtitle: 'Scan product barcode to add to cart',
    );
    if (code == null || !mounted) return;
    scanCtrl.text = code;
    _scan();
  }

  Future<void> _setQty(CartLine line, int qty) async {
    if (qty <= 0) {
      setState(() => cart.remove(line));
      return;
    }
    if (qty > line.product.stockQty) {
      _toast('Only ${line.product.stockQty.toStringAsFixed(0)} in stock', errorStyle: true);
      return;
    }
    if (line.product.trackSerial) {
      final picked = await _pickSerials(line.product, qty, line.serialNumbers);
      if (picked == null) return;
      setState(() {
        line.quantity = qty;
        line.serialNumbers
          ..clear()
          ..addAll(picked);
      });
      return;
    }
    setState(() => line.quantity = qty);
  }

  Future<void> _openStockPicker() async {
    final picks = await showModalBottomSheet<Map<String, int>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (ctx) => _StockCheckSellSheet(
        products: filteredProducts,
        categoryLabel: category == 'All' ? 'All stock' : category,
      ),
    );
    if (picks == null || picks.isEmpty || !mounted) return;
    for (final entry in picks.entries) {
      final p = products.where((x) => x.id == entry.key).firstOrNull;
      if (p != null) _add(p, qty: entry.value);
    }
    _toast('${picks.length} model(s) added to bill');
  }

  Future<void> _openCustomerSheet() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
          child: _CustomerFormSheet(
            customers: customers,
            customerId: customerId,
            nameCtrl: custNameCtrl,
            phoneCtrl: custPhoneCtrl,
            gstinCtrl: custGstinCtrl,
            addressCtrl: custAddressCtrl,
            addressLine2Ctrl: custAddressLine2Ctrl,
            cityCtrl: custCityCtrl,
            pincodeCtrl: custPincodeCtrl,
            stateCode: custStateCode,
            onSelect: (c) {
              setState(() {
                if (c == null) {
                  _clearCustomerForm();
                } else {
                  _applyCustomer(c);
                }
              });
            },
            onStateCode: (code) => setState(() => custStateCode = code),
            onDone: () => Navigator.pop(ctx),
          ),
        );
      },
    );
    if (mounted) setState(() {});
  }

  Future<String?> _ensureCustomer({required bool creditSale}) async {
    final api = context.read<AuthState>().api;
    final name = custNameCtrl.text.trim();
    final phoneRaw = custPhoneCtrl.text.trim();
    final gstinRaw = custGstinCtrl.text.trim();
    final address = custAddressCtrl.text.trim();
    final addressLine2 = custAddressLine2Ctrl.text.trim();
    final city = custCityCtrl.text.trim();
    final pincode = custPincodeCtrl.text.trim();
    final phone = _normalizePhone(phoneRaw);
    final gstin = gstinRaw.isEmpty ? null : _normalizeGstin(gstinRaw);
    final stateFromGstin = gstin == null ? null : _stateFromGstin(gstin);
    final stateCode = (custStateCode.trim().isNotEmpty
            ? custStateCode.trim()
            : stateFromGstin)
        ?.toUpperCase();

    if (phoneRaw.isNotEmpty && phone == null) {
      throw Exception('Enter a valid 10-digit phone number.');
    }

    if (customerId != null && customerId!.isNotEmpty) {
      final updated = await api.patch(
        '/customers/$customerId',
        body: {
          if (name.isNotEmpty) 'name': name,
          if (phone != null) 'phone': phone,
          'gstin': gstin,
          'stateCode': stateCode,
          'address': address.isEmpty ? null : address,
          'addressLine2': addressLine2.isEmpty ? null : addressLine2,
          'city': city.isEmpty ? null : city,
          'pincode': pincode.isEmpty ? null : pincode,
          'country': 'IN',
        },
      );
      final map = asStringKeyedMap(updated);
      final option = _CustomerOption.fromJson(map);
      setState(() {
        customers = [
          option,
          ...customers.where((c) => c.id != option.id),
        ];
        _applyCustomer(option);
      });
      return option.id;
    }

    final hasIdentity = name.isNotEmpty ||
        phoneRaw.isNotEmpty ||
        gstinRaw.isNotEmpty ||
        address.isNotEmpty ||
        city.isNotEmpty;

    if (!hasIdentity) {
      if (creditSale) {
        throw Exception('Select or enter a customer for credit sales.');
      }
      return null;
    }

    if (phone == null) {
      throw Exception(
        'Phone is required to save a new customer (or leave all fields blank for walk-in).',
      );
    }

    final created = await api.post(
      '/customers',
      body: {
        'name': name.isNotEmpty ? name : 'Customer $phone',
        'phone': phone,
        if (gstin != null) 'gstin': gstin,
        if (stateCode != null) 'stateCode': stateCode,
        if (address.isNotEmpty) 'address': address,
        if (addressLine2.isNotEmpty) 'addressLine2': addressLine2,
        if (city.isNotEmpty) 'city': city,
        if (pincode.isNotEmpty) 'pincode': pincode,
        'country': 'IN',
      },
    );
    final map = asStringKeyedMap(created);
    final option = _CustomerOption.fromJson(map);
    setState(() {
      customers = [option, ...customers.where((c) => c.id != option.id)];
      _applyCustomer(option);
    });
    return option.id;
  }

  Future<void> _openCheckout() async {
    if (cart.isEmpty) {
      _toast('Add at least one item', errorStyle: true);
      return;
    }
    for (final line in cart) {
      if (line.product.trackSerial && line.serialNumbers.length != line.quantity) {
        _toast('${line.product.name}: pick ${line.quantity} IMEI/serial', errorStyle: true);
        return;
      }
    }
    final result = await showModalBottomSheet<_CheckoutResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
          child: _CheckoutSheet(
            cart: cart,
            customers: customers,
            customerId: customerId,
            customerLabel: customerBarLabel,
            hasCustomerDetails: hasCustomerDetails,
            notesCtrl: notesCtrl,
            subtotal: subtotal,
            taxTotal: taxTotal,
            grandTotal: grandTotal,
            saving: saving,
            onEditCustomer: () async {
              Navigator.pop(ctx);
              await _openCustomerSheet();
              if (!mounted) return;
              await _openCheckout();
            },
          ),
        );
      },
    );
    if (result == null || !mounted) return;
    setState(() => customerId = result.customerId ?? customerId);
    await _save(
      hold: result.hold,
      payments: result.payments,
      loyaltyRedeem: result.loyaltyRedeem,
      billDiscount: result.billDiscount,
    );
  }

  Future<void> _save({
    bool hold = false,
    List<Map<String, dynamic>>? payments,
    int loyaltyRedeem = 0,
    double billDiscount = 0,
  }) async {
    if (cart.isEmpty) return;
    setState(() {
      saving = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final sync = context.read<OfflineSyncService>();
      final strings = context.read<AppStrings>();
      final redeem = loyaltyRedeem > 0 ? loyaltyRedeem : 0;
      final disc = billDiscount > 0 ? billDiscount : 0.0;
      final total = double.parse((grandTotal - redeem - disc).clamp(0, double.infinity).toStringAsFixed(2));
      final payRows = payments ??
          [
            {'method': payment, 'amount': total},
          ];
      final creditSale = payRows.any(
        (p) => p['method']?.toString() == 'CREDIT' && (p['amount'] as num? ?? 0) > 0,
      );

      String? ensuredId;
      if (sync.online) {
        ensuredId = await _ensureCustomer(creditSale: creditSale || redeem > 0);
      } else if (creditSale || redeem > 0 || hasCustomerDetails) {
        if (customerId == null || customerId!.isEmpty) {
          throw Exception('Customer create needs network — select a saved customer or go online.');
        }
        ensuredId = customerId;
      } else {
        ensuredId = customerId;
      }

      // Distribute bill-level discount across lines by taxable share.
      final base = cart.fold<double>(0, (s, l) => s + (l.unitPrice * l.quantity));
      final lineDiscounts = <String, double>{};
      if (disc > 0 && base > 0) {
        var allocated = 0.0;
        for (var i = 0; i < cart.length; i++) {
          final l = cart[i];
          final share = (l.unitPrice * l.quantity) / base;
          final part = i == cart.length - 1
              ? double.parse((disc - allocated).toStringAsFixed(2))
              : double.parse((disc * share).toStringAsFixed(2));
          allocated += part;
          lineDiscounts[l.product.id] = l.discount + part;
        }
      }

      final body = <String, dynamic>{
        if (ensuredId != null && ensuredId.isNotEmpty) 'customerId': ensuredId,
        if (notesCtrl.text.trim().isNotEmpty) 'notes': notesCtrl.text.trim(),
        'lines': cart
            .map((l) => {
                  'productId': l.product.id,
                  'productName': l.product.name,
                  'hsnCode': l.product.hsnCode,
                  'quantity': l.quantity,
                  'unitPrice': l.unitPrice,
                  'discount': lineDiscounts[l.product.id] ?? l.discount,
                  'gstRate': l.product.gstRate,
                  if (l.serialNumbers.isNotEmpty) 'serialNumbers': l.serialNumbers,
                })
            .toList(),
        if (!hold) 'payments': payRows,
        if (!hold && redeem > 0) 'loyaltyPointsToRedeem': redeem,
      };

      Map<String, dynamic> map;
      if (hold) {
        final raw = await api.post('/invoices/hold', body: body);
        map = asStringKeyedMap(raw);
      } else {
        map = await sync.saveBillOnlineOrOffline(
          body: body,
          subtotal: subtotal,
          totalCgst: taxTotal / 2,
          totalSgst: taxTotal / 2,
          totalIgst: 0,
          grandTotal: total,
        );
        await sync.refreshPending();
      }

      final number = map['invoiceNumber']?.toString() ?? 'bill';
      final id = map['id']?.toString();
      final isOffline = map['offline'] == true;

      setState(() {
        cart.clear();
        notesCtrl.clear();
        _clearCustomerForm();
        payment = 'CASH';
      });
      await _load();

      if (!mounted) return;
      if (hold) {
        _toast('Held bill $number — open Invoices (Draft) to finalize later');
        return;
      }
      if (isOffline) {
        _toast('${strings.t('saved_offline')}: $number');
        return;
      }

      await showModalBottomSheet<void>(
        context: context,
        backgroundColor: AppColors.surface,
        builder: (ctx) => _SuccessSheet(
          invoiceNumber: number,
          amount: total,
          onPrint: id == null
              ? null
              : () async {
                  Navigator.pop(ctx);
                  final nav = Navigator.of(context);
                  try {
                    final printData = await loadMobilePrintData(api, id);
                    await nav.push(
                      MaterialPageRoute(
                        builder: (_) => InvoicePrintScreen(
                          data: printData,
                          invoiceId: id,
                          api: api,
                        ),
                      ),
                    );
                  } catch (e) {
                    if (context.mounted) showErrorToast(context, e.toString());
                  }
                },
          onView: id == null
              ? null
              : () {
                  Navigator.pop(ctx);
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => InvoiceDetailScreen(invoiceId: id)),
                  );
                },
          onDone: () => Navigator.pop(ctx),
        ),
      );
    } catch (e) {
      _toast(e.toString(), errorStyle: true);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final catalog = filteredProducts;
    final compact = Breakpoints.isCompactHeight(context);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      resizeToAvoidBottomInset: false,
      body: Column(
        children: [
          _PosHeader(
            scanCtrl: scanCtrl,
            scanFocus: scanFocus,
            searchCtrl: searchCtrl,
            onScan: _scan,
            onCameraScan: _scanWithCamera,
            onVoice: _voiceAdd,
            onQuery: (v) => setState(() => query = v),
            onRefresh: _load,
            loading: loading,
            compact: compact,
          ),
          if (!compact) _buildCategoryStrip(compact: false),
          if (compact) _buildCategoryStrip(compact: true),
          if (!compact) _buildCustomerBar(compact: false),
          if (category != 'All' && !compact) _buildCategoryHint(),
          if (error != null)
            Padding(
              padding: AppSpace.pageH,
              child: Text(error!, style: const TextStyle(color: AppColors.danger)),
            ),
          Expanded(child: _buildProductGrid(catalog)),
        ],
      ),
      bottomNavigationBar: cart.isEmpty
          ? null
          : _CartDock(
              itemCount: itemCount,
              lines: cart.length,
              total: grandTotal,
              saving: saving,
              onClear: () => setState(() => cart.clear()),
              onOpenCart: () => _showCartSheet(),
              onCheckout: saving ? null : _openCheckout,
            ),
    );
  }

  Widget _buildCategoryStrip({required bool compact}) {
    if (compact) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(AppSpace.md, 4, AppSpace.md, 4),
        child: SizedBox(
          height: 36,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: categories.length,
            separatorBuilder: (_, __) => const SizedBox(width: 6),
            itemBuilder: (_, i) {
              final c = categories[i];
              final selected = category == c;
              return ChoiceChip(
                label: Text(c == 'All' ? 'All' : c),
                selected: selected,
                visualDensity: VisualDensity.compact,
                onSelected: (on) {
                  if (!on) return;
                  setState(() => category = c);
                },
              );
            },
          ),
        ),
      );
    }
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpace.md),
        itemCount: categories.length + 1,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          if (i == 0) {
            return ActionChip(
              avatar: const Icon(Icons.checklist_rounded, size: 18),
              label: const Text('Check & sell'),
              onPressed: products.isEmpty ? null : _openStockPicker,
            );
          }
          final c = categories[i - 1];
          final selected = category == c;
          return ChoiceChip(
            label: Text(c),
            selected: selected,
            onSelected: (on) {
              if (!on) return;
              setState(() => category = c);
            },
          );
        },
      ),
    );
  }

  Widget _buildCategoryHint() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpace.md, 0, AppSpace.md, AppSpace.xs),
      child: Row(
        children: [
          Expanded(
            child: Text(
              '${filteredProducts.length} model(s) · tap tile or Check & sell',
              style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
            ),
          ),
          TextButton(
            onPressed: filteredProducts.isEmpty ? null : _openStockPicker,
            child: const Text('Open list'),
          ),
        ],
      ),
    );
  }

  Widget _buildCustomerBar({required bool compact}) {
    return Padding(
      padding: EdgeInsets.fromLTRB(AppSpace.md, compact ? 0 : AppSpace.xs, AppSpace.md, 0),
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppMetrics.controlRadius),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppMetrics.controlRadius),
          onTap: _openCustomerSheet,
          child: Container(
            padding: EdgeInsets.symmetric(horizontal: 12, vertical: compact ? 8 : 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppMetrics.controlRadius),
              border: Border.all(color: AppColors.muted.withValues(alpha: 0.25)),
            ),
            child: Row(
              children: [
                Icon(
                  hasCustomerDetails ? Icons.person_rounded : Icons.person_add_alt_1_rounded,
                  color: AppColors.teal,
                  size: compact ? 20 : 22,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: compact
                      ? Text(
                          customerBarLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                        )
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Who is buying?',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: AppColors.muted,
                                letterSpacing: 0.4,
                              ),
                            ),
                            Text(
                              customerBarLabel,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.w700,
                                fontSize: 14,
                              ),
                            ),
                          ],
                        ),
                ),
                if (hasCustomerDetails)
                  TextButton(
                    onPressed: () => setState(_clearCustomerForm),
                    child: Text(context.watch<AppStrings>().t('clear')),
                  )
                else
                  Icon(Icons.chevron_right_rounded, color: AppColors.muted.withValues(alpha: 0.7)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildProductGrid(List<Product> catalog) {
    if (loading && products.isEmpty) return const AppLoader();
    if (catalog.isEmpty) {
      return const AppEmptyState(
        message: 'No products match your search',
        icon: Icons.search_off_rounded,
      );
    }
    return GridView.builder(
      padding: AppSpace.listWithFab(top: AppSpace.xs),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: Breakpoints.productGridCount(context),
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 0.72,
      ),
      itemCount: catalog.length,
      itemBuilder: (_, i) {
        final p = catalog[i];
        return _ProductTile(
          product: p,
          onAdd: () => _add(p),
        );
      },
    );
  }

  Future<void> _showCartSheet() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setModal) {
            void refresh() {
              setModal(() {});
              setState(() {});
            }

            return DraggableScrollableSheet(
              expand: false,
              initialChildSize: 0.72,
              minChildSize: 0.45,
              maxChildSize: 0.92,
              builder: (_, scrollCtrl) {
                return Column(
                  children: [
                    const SizedBox(height: 8),
                    Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppColors.muted.withValues(alpha: 0.3),
                        borderRadius: BorderRadius.circular(99),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 14, 12, 8),
                      child: Row(
                        children: [
                          Text(
                            'Cart · $itemCount items',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const Spacer(),
                          TextButton(
                            onPressed: cart.isEmpty
                                ? null
                                : () {
                                    setState(() => cart.clear());
                                    Navigator.pop(ctx);
                                  },
                            child: Text(context.read<AppStrings>().t('clear')),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: ListView.separated(
                        controller: scrollCtrl,
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                        itemCount: cart.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (_, i) {
                          final line = cart[i];
                          return _CartLineCard(
                            line: line,
                            onDec: () async {
                              await _setQty(line, line.quantity - 1);
                              refresh();
                            },
                            onInc: () async {
                              await _setQty(line, line.quantity + 1);
                              refresh();
                            },
                            onRemove: () {
                              setState(() => cart.removeAt(i));
                              refresh();
                              if (cart.isEmpty) Navigator.pop(ctx);
                            },
                          );
                        },
                      ),
                    ),
                    SafeArea(
                      top: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                        child: FilledButton(
                          onPressed: () {
                            Navigator.pop(ctx);
                            _openCheckout();
                          },
                          child: Text('${context.read<AppStrings>().t('checkout')} · ${_inr.format(grandTotal)}'),
                        ),
                      ),
                    ),
                  ],
                );
              },
            );
          },
        );
      },
    );
  }
}

class _CustomerOption {
  _CustomerOption({
    required this.id,
    required this.name,
    required this.phone,
    this.gstin,
    this.address,
    this.addressLine2,
    this.city,
    this.pincode,
    this.stateCode,
    this.segment,
    this.loyaltyPoints = 0,
    this.outstandingBalance = 0,
    this.creditLimit = 0,
  });

  factory _CustomerOption.fromJson(Map<String, dynamic> m) {
    return _CustomerOption(
      id: m['id']?.toString() ?? '',
      name: m['name']?.toString() ?? '',
      phone: m['phone']?.toString() ?? '',
      gstin: m['gstin']?.toString(),
      address: m['address']?.toString(),
      addressLine2: m['addressLine2']?.toString(),
      city: m['city']?.toString(),
      pincode: m['pincode']?.toString(),
      stateCode: m['stateCode']?.toString(),
      segment: m['segment']?.toString(),
      loyaltyPoints: asInt(m['loyaltyPoints']),
      outstandingBalance: asDouble(m['outstandingBalance']),
      creditLimit: asDouble(m['creditLimit']),
    );
  }

  final String id;
  final String name;
  final String phone;
  final String? gstin;
  final String? address;
  final String? addressLine2;
  final String? city;
  final String? pincode;
  final String? stateCode;
  final String? segment;
  final int loyaltyPoints;
  final double outstandingBalance;
  final double creditLimit;

  String get addressLine {
    return [
      if ((address ?? '').isNotEmpty) address!,
      if ((addressLine2 ?? '').isNotEmpty) addressLine2!,
      if ((city ?? '').isNotEmpty) city!,
      if ((pincode ?? '').isNotEmpty) pincode!,
    ].join(', ');
  }
}

class _PosHeader extends StatelessWidget {
  const _PosHeader({
    required this.scanCtrl,
    required this.scanFocus,
    required this.searchCtrl,
    required this.onScan,
    required this.onCameraScan,
    required this.onVoice,
    required this.onQuery,
    required this.onRefresh,
    required this.loading,
    this.compact = false,
  });

  final TextEditingController scanCtrl;
  final FocusNode scanFocus;
  final TextEditingController searchCtrl;
  final VoidCallback onScan;
  final VoidCallback onCameraScan;
  final VoidCallback onVoice;
  final ValueChanged<String> onQuery;
  final VoidCallback onRefresh;
  final bool loading;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    final strings = context.watch<AppStrings>();
    final sync = context.watch<OfflineSyncService>();
    final voice = context.watch<VoiceBillingService>();
    final colors = AppColors.of(context);
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(16, top + (compact ? 6 : 10), 12, compact ? 8 : 12),
      decoration: BoxDecoration(
        gradient: colors.heroGradient,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: compact
                    ? Text(
                        strings.t('new_bill'),
                        style: GoogleFonts.plusJakartaSans(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                        ),
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            strings.t('new_bill'),
                            style: GoogleFonts.plusJakartaSans(
                              color: Colors.white,
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          Text(
                            sync.online
                                ? strings.t('online')
                                : '${strings.t('offline')}${sync.pending > 0 ? ' · ${sync.pending} ${strings.t('pending_sync')}' : ''}',
                            style: GoogleFonts.plusJakartaSans(
                              color: Colors.white70,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
              ),
              IconButton(
                visualDensity: compact ? VisualDensity.compact : VisualDensity.standard,
                tooltip: strings.t('voice_add'),
                onPressed: voice.listening ? () => voice.stop() : onVoice,
                icon: Icon(
                  voice.listening ? Icons.mic_rounded : Icons.mic_none_rounded,
                  color: voice.listening ? AppColors.amber : Colors.white,
                ),
              ),
              const CalculatorAppBarButton(color: Colors.white),
              IconButton(
                visualDensity: compact ? VisualDensity.compact : VisualDensity.standard,
                onPressed: loading ? null : onRefresh,
                icon: const Icon(Icons.refresh_rounded, color: Colors.white),
              ),
            ],
          ),
          if (!compact && (voice.listening || voice.lastHeard.isNotEmpty))
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                voice.listening ? strings.t('voice_listen') : voice.lastHeard,
                style: GoogleFonts.plusJakartaSans(color: Colors.white70, fontSize: 12),
              ),
            ),
          SizedBox(height: compact ? 6 : 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: scanCtrl,
                  focusNode: scanFocus,
                  autofocus: false,
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w600,
                    fontSize: compact ? 13 : 14,
                    color: AppColorsLookup.onWhiteField,
                  ),
                  decoration: InputDecoration(
                    filled: true,
                    fillColor: Colors.white,
                    hintText: compact ? 'Scan / SKU' : 'Gun / type SKU · camera button →',
                    hintStyle: GoogleFonts.plusJakartaSans(
                      color: AppColorsLookup.mutedOnWhiteField,
                      fontSize: compact ? 13 : 14,
                    ),
                    prefixIcon: Icon(
                      Icons.scanner_rounded,
                      color: colors.primary,
                      size: compact ? 20 : 24,
                    ),
                    isDense: compact,
                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: compact ? 10 : 12),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                  ),
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => onScan(),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: onCameraScan,
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: colors.primaryDark,
                  minimumSize: Size(compact ? 40 : 48, compact ? 40 : 48),
                  padding: EdgeInsets.zero,
                ),
                child: const Icon(Icons.photo_camera_rounded),
              ),
              if (!compact) ...[
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: onScan,
                  style: FilledButton.styleFrom(
                    backgroundColor: colors.secondary,
                    foregroundColor: colors.onPrimary,
                    minimumSize: const Size(64, 48),
                  ),
                  child: const Text('Add'),
                ),
              ],
            ],
          ),
          SizedBox(height: compact ? 6 : 8),
          TextField(
            controller: searchCtrl,
            onChanged: onQuery,
            style: GoogleFonts.plusJakartaSans(
              fontSize: compact ? 13 : 14,
              color: AppColorsLookup.onWhiteField,
            ),
            decoration: InputDecoration(
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.92),
              hintText: 'Search catalog…',
              hintStyle: GoogleFonts.plusJakartaSans(
                color: AppColorsLookup.mutedOnWhiteField,
                fontSize: compact ? 13 : 14,
              ),
              prefixIcon: Icon(Icons.search_rounded, size: compact ? 18 : 20, color: AppColorsLookup.mutedOnWhiteField),
              isDense: true,
              contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: compact ? 8 : 10),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProductTile extends StatelessWidget {
  const _ProductTile({required this.product, required this.onAdd});

  final Product product;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    final out = product.stockQty <= 0;
    final low = !out && product.stockQty <= product.lowStockThreshold;
    final ink = colors.inkOn(colors.surface);
    final muted = colors.mutedOn(colors.surface);

    return Material(
      color: colors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: out ? null : onAdd,
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: colors.primary.withValues(alpha: 0.1)),
          ),
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: colors.tealSoft.withValues(alpha: 0.7),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      Icons.inventory_2_outlined,
                      size: 18,
                      color: out ? muted : colors.primary,
                    ),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: out
                          ? AppColors.danger.withValues(alpha: 0.1)
                          : low
                              ? AppColors.warn.withValues(alpha: 0.12)
                              : colors.tealSoft.withValues(alpha: 0.6),
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Text(
                      out ? 'Out' : 'Qty ${product.stockQty.toStringAsFixed(0)}',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: out
                            ? AppColors.danger
                            : low
                                ? AppColors.warn
                                : colors.primaryDark,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                product.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w700,
                  height: 1.25,
                  color: out ? muted : ink,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                product.displayModel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: colors.primaryDark,
                ),
              ),
              Text(
                product.sku,
                style: GoogleFonts.plusJakartaSans(fontSize: 11, color: muted),
              ),
              const Spacer(),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _inr.format(product.salePrice),
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        color: colors.primaryDark,
                      ),
                    ),
                  ),
                  if (!out)
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: AppColors.amber.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.add_rounded, color: AppColors.amberDeep, size: 20),
                    ),
                ],
              ),
              Text(
                'GST ${product.gstRate}%',
                style: GoogleFonts.plusJakartaSans(fontSize: 10, color: muted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CartDock extends StatelessWidget {
  const _CartDock({
    required this.itemCount,
    required this.lines,
    required this.total,
    required this.saving,
    required this.onClear,
    required this.onOpenCart,
    required this.onCheckout,
  });

  final int itemCount;
  final int lines;
  final double total;
  final bool saving;
  final VoidCallback onClear;
  final VoidCallback onOpenCart;
  final VoidCallback? onCheckout;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 12,
      color: AppColors.surface,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Row(
            children: [
              Expanded(
                child: InkWell(
                  onTap: onOpenCart,
                  borderRadius: BorderRadius.circular(14),
                  child: Ink(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: AppColors.tealSoft.withValues(alpha: 0.45),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.shopping_bag_outlined, color: AppColors.teal),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                '$itemCount items · $lines lines',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.muted,
                                ),
                              ),
                              Text(
                                _inr.format(total),
                                style: GoogleFonts.plusJakartaSans(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 16,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Icon(Icons.keyboard_arrow_up_rounded, color: AppColors.teal),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: onCheckout,
                style: FilledButton.styleFrom(
                  minimumSize: const Size(120, 52),
                  backgroundColor: AppColors.amber,
                  foregroundColor: AppColors.ink,
                ),
                child: Text(saving ? '…' : 'Charge'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CartLineCard extends StatelessWidget {
  const _CartLineCard({
    required this.line,
    required this.onDec,
    required this.onInc,
    required this.onRemove,
  });

  final CartLine line;
  final VoidCallback onDec;
  final VoidCallback onInc;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return AppPanel(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  line.product.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                ),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                onPressed: onRemove,
                icon: const Icon(Icons.delete_outline_rounded, color: AppColors.danger),
              ),
            ],
          ),
          Text(
            '${_inr.format(line.unitPrice)} · GST ${line.product.gstRate}%',
            style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _QtyButton(icon: Icons.remove_rounded, onTap: onDec),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Text(
                  '${line.quantity}',
                  style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, fontSize: 16),
                ),
              ),
              _QtyButton(icon: Icons.add_rounded, onTap: onInc),
              const Spacer(),
              Text(
                _inr.format(line.lineTotal),
                style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800, color: AppColors.tealDark),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _QtyButton extends StatelessWidget {
  const _QtyButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.canvas,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: SizedBox(
          width: 36,
          height: 36,
          child: Icon(icon, size: 18, color: AppColors.tealDark),
        ),
      ),
    );
  }
}

class _CustomerFormSheet extends StatefulWidget {
  const _CustomerFormSheet({
    required this.customers,
    required this.customerId,
    required this.nameCtrl,
    required this.phoneCtrl,
    required this.gstinCtrl,
    required this.addressCtrl,
    required this.addressLine2Ctrl,
    required this.cityCtrl,
    required this.pincodeCtrl,
    required this.stateCode,
    required this.onSelect,
    required this.onStateCode,
    required this.onDone,
  });

  final List<_CustomerOption> customers;
  final String? customerId;
  final TextEditingController nameCtrl;
  final TextEditingController phoneCtrl;
  final TextEditingController gstinCtrl;
  final TextEditingController addressCtrl;
  final TextEditingController addressLine2Ctrl;
  final TextEditingController cityCtrl;
  final TextEditingController pincodeCtrl;
  final String stateCode;
  final ValueChanged<_CustomerOption?> onSelect;
  final ValueChanged<String> onStateCode;
  final VoidCallback onDone;

  @override
  State<_CustomerFormSheet> createState() => _CustomerFormSheetState();
}

class _CustomerFormSheetState extends State<_CustomerFormSheet> {
  final searchCtrl = TextEditingController();
  String query = '';

  @override
  void dispose() {
    searchCtrl.dispose();
    super.dispose();
  }

  List<_CustomerOption> get filtered {
    final q = query.trim().toLowerCase();
    Iterable<_CustomerOption> list = widget.customers;
    if (q.isNotEmpty) {
      list = list.where((c) {
        final hay = [
          c.name,
          c.phone,
          c.gstin ?? '',
          c.address ?? '',
          c.city ?? '',
        ].join(' ').toLowerCase();
        return hay.contains(q);
      });
    }
    final out = list.take(80).toList();
    // Keep the selected customer visible even if the filter would hide it.
    final id = widget.customerId;
    if (id != null && !out.any((c) => c.id == id)) {
      final selected = widget.customers.where((c) => c.id == id).firstOrNull;
      if (selected != null) out.insert(0, selected);
    }
    return out;
  }

  _CustomerOption? get selected {
    final id = widget.customerId;
    if (id == null) return null;
    for (final c in widget.customers) {
      if (c.id == id) return c;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final strings = context.watch<AppStrings>();
    final cust = selected;
    final matches = filtered;
    // Dropdown value must be in items; fall back to walk-in if missing.
    final dropdownValue = matches.any((c) => c.id == widget.customerId) ? widget.customerId : null;

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                  color: AppColors.muted.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        strings.t('customer'),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppColors.teal,
                          letterSpacing: 0.6,
                        ),
                      ),
                      Text(
                        'Who is buying?',
                        style: GoogleFonts.plusJakartaSans(fontSize: 20, fontWeight: FontWeight.w800),
                      ),
                      Text(
                        'Pick a saved party from the dropdown, or enter walk-in details below.',
                        style: GoogleFonts.plusJakartaSans(fontSize: 13, color: AppColors.muted),
                      ),
                    ],
                  ),
                ),
                if (widget.customerId != null ||
                    widget.nameCtrl.text.trim().isNotEmpty ||
                    widget.phoneCtrl.text.trim().isNotEmpty)
                  TextButton(
                    onPressed: () {
                      searchCtrl.clear();
                      query = '';
                      widget.onSelect(null);
                      setState(() {});
                    },
                    child: Text(strings.t('clear')),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              'Saved customers',
              style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 13),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: searchCtrl,
              decoration: InputDecoration(
                hintText: 'Filter by name, phone, or GSTIN…',
                prefixIcon: const Icon(Icons.search_rounded),
                isDense: true,
                suffixIcon: searchCtrl.text.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.clear_rounded),
                        onPressed: () => setState(() {
                          searchCtrl.clear();
                          query = '';
                        }),
                      ),
              ),
              onChanged: (v) => setState(() => query = v),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String?>(
              value: dropdownValue,
              isExpanded: true,
              decoration: InputDecoration(
                labelText: strings.t('customer'),
                hintText: strings.t('walk_in'),
              ),
              items: [
                DropdownMenuItem<String?>(
                  value: null,
                  child: Text(
                    'Walk-in / new customer',
                    style: GoogleFonts.plusJakartaSans(color: AppColors.muted),
                  ),
                ),
                ...matches.map((c) {
                  final subtitle = [
                    if (c.phone.isNotEmpty) c.phone,
                    if ((c.gstin ?? '').isNotEmpty) c.gstin!,
                  ].join(' · ');
                  return DropdownMenuItem<String?>(
                    value: c.id,
                    child: Text(
                      subtitle.isEmpty ? c.name : '${c.name} · $subtitle',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  );
                }),
              ],
              onChanged: (id) {
                if (id == null) {
                  widget.onSelect(null);
                } else {
                  final match = widget.customers.where((c) => c.id == id).firstOrNull;
                  if (match != null) widget.onSelect(match);
                }
                setState(() {});
              },
            ),
            if (query.trim().isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  matches.isEmpty
                      ? 'No match — enter details below for a new customer.'
                      : '${matches.length} match${matches.length == 1 ? '' : 'es'} in dropdown',
                  style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
                ),
              ),
            if (cust != null) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _chip(cust.segment ?? 'RETAIL', AppColors.tealSoft, AppColors.tealDark),
                  if (cust.loyaltyPoints > 0)
                    _chip('${cust.loyaltyPoints} loyalty pts', AppColors.canvas, AppColors.ink),
                  if (cust.outstandingBalance > 0)
                    _chip('Udhaar ${_inr.format(cust.outstandingBalance)}', const Color(0xFFFEF3C7), AppColors.warn),
                  if (cust.creditLimit > 0)
                    _chip(
                      'Credit left ${_inr.format(cust.creditLimit - cust.outstandingBalance)}',
                      AppColors.canvas,
                      AppColors.ink,
                    ),
                ],
              ),
            ],
            const SizedBox(height: 16),
            Text(
              cust == null ? 'Walk-in / new customer details' : 'Customer details',
              style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 13),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: widget.nameCtrl,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Name', hintText: 'Customer name'),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: widget.phoneCtrl,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(labelText: strings.t('phone'), hintText: '10-digit mobile'),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: widget.gstinCtrl,
              textCapitalization: TextCapitalization.characters,
              maxLength: 15,
              decoration: InputDecoration(labelText: strings.t('gstin'), hintText: 'Optional', counterText: ''),
              onChanged: (v) {
                final g = v.trim().toUpperCase();
                if (g != v) {
                  widget.gstinCtrl.value = TextEditingValue(
                    text: g,
                    selection: TextSelection.collapsed(offset: g.length),
                  );
                }
                if (g.length >= 2 && RegExp(r'^\d{2}').hasMatch(g)) {
                  widget.onStateCode(g.substring(0, 2));
                }
                setState(() {});
              },
            ),
            const SizedBox(height: 10),
            TextField(
              controller: widget.addressCtrl,
              decoration: InputDecoration(
                labelText: '${strings.t('address')} line 1',
                hintText: 'Shop / house, street',
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: widget.addressLine2Ctrl,
              decoration: const InputDecoration(labelText: 'Address line 2', hintText: 'Area / landmark'),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: widget.cityCtrl,
                    decoration: const InputDecoration(labelText: 'City'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: widget.pincodeCtrl,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    decoration: const InputDecoration(labelText: 'PIN', counterText: ''),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            FilledButton(
              onPressed: widget.onDone,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.teal,
                foregroundColor: Colors.white,
                minimumSize: const Size(64, 52),
              ),
              child: Text('Done', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _chip(String label, Color bg, Color fg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        label,
        style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w700, color: fg),
      ),
    );
  }
}

class _CheckoutResult {
  _CheckoutResult({
    required this.hold,
    required this.customerId,
    required this.payments,
    required this.loyaltyRedeem,
    this.billDiscount = 0,
  });

  final bool hold;
  final String? customerId;
  final List<Map<String, dynamic>> payments;
  final int loyaltyRedeem;
  final double billDiscount;
}

class _PayRow {
  _PayRow({String? method, this.amount = ''}) : method = method ?? 'CASH';
  String method;
  String amount;
}

class _CheckoutSheet extends StatefulWidget {
  const _CheckoutSheet({
    required this.cart,
    required this.customers,
    required this.customerId,
    required this.customerLabel,
    required this.hasCustomerDetails,
    required this.notesCtrl,
    required this.subtotal,
    required this.taxTotal,
    required this.grandTotal,
    required this.saving,
    required this.onEditCustomer,
  });

  final List<CartLine> cart;
  final List<_CustomerOption> customers;
  final String? customerId;
  final String customerLabel;
  final bool hasCustomerDetails;
  final TextEditingController notesCtrl;
  final double subtotal;
  final double taxTotal;
  final double grandTotal;
  final bool saving;
  final VoidCallback onEditCustomer;

  @override
  State<_CheckoutSheet> createState() => _CheckoutSheetState();
}

class _CheckoutSheetState extends State<_CheckoutSheet> {
  late String? customerId;
  late List<_PayRow> payments;
  final loyaltyCtrl = TextEditingController();
  final billDiscountCtrl = TextEditingController();

  static const methods = ['CASH', 'UPI', 'CARD', 'CREDIT', 'BANK_TRANSFER'];

  @override
  void initState() {
    super.initState();
    customerId = widget.customerId;
    payments = [_PayRow(amount: widget.grandTotal.toStringAsFixed(2))];
  }

  @override
  void dispose() {
    loyaltyCtrl.dispose();
    billDiscountCtrl.dispose();
    super.dispose();
  }

  _CustomerOption? get selectedCustomer {
    final id = customerId;
    if (id == null) return null;
    for (final c in widget.customers) {
      if (c.id == id) return c;
    }
    return null;
  }

  double get redeem => double.tryParse(loyaltyCtrl.text.trim()) ?? 0;
  double get billDiscount => (double.tryParse(billDiscountCtrl.text.trim()) ?? 0).clamp(0, widget.grandTotal);
  double get payable => (widget.grandTotal - redeem - billDiscount).clamp(0, double.infinity);
  double get paySum =>
      payments.fold(0.0, (s, p) => s + (double.tryParse(p.amount) ?? 0));

  void _resetPayments() {
    payments = [_PayRow(amount: payable.toStringAsFixed(2))];
  }

  void _submit({required bool hold}) {
    if (!hold) {
      if ((paySum - payable).abs() > 0.05) {
        showErrorToast(context, 'Payments must equal payable');
        return;
      }
      final pts = redeem.floor();
      if (pts > 0 && customerId == null && !widget.hasCustomerDetails) {
        showErrorToast(context, 'Select customer to redeem loyalty');
        return;
      }
      final maxPts = selectedCustomer?.loyaltyPoints ?? 0;
      if (pts > maxPts && customerId != null) {
        showErrorToast(context, 'Only $maxPts loyalty points available');
        return;
      }
      if (billDiscount > widget.grandTotal + 0.01) {
        showErrorToast(context, 'Bill discount too high');
        return;
      }
    }
    Navigator.pop(
      context,
      _CheckoutResult(
        hold: hold,
        customerId: customerId,
        loyaltyRedeem: redeem.floor(),
        billDiscount: billDiscount,
        payments: payments
            .where((p) => (double.tryParse(p.amount) ?? 0) > 0)
            .map((p) => <String, dynamic>{'method': p.method, 'amount': double.parse(p.amount)})
            .toList(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cust = selectedCustomer;
    final strings = context.watch<AppStrings>();
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                  color: AppColors.muted.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            Text(strings.t('checkout'), style: GoogleFonts.plusJakartaSans(fontSize: 20, fontWeight: FontWeight.w800)),
            Text('${widget.cart.length} lines · ${strings.t('charge')} ${_inr.format(payable)}', style: GoogleFonts.plusJakartaSans(color: AppColors.muted)),
            const SizedBox(height: 16),
            Text(strings.t('customer'), style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Material(
              color: AppColors.canvas,
              borderRadius: BorderRadius.circular(AppMetrics.controlRadius),
              child: InkWell(
                borderRadius: BorderRadius.circular(AppMetrics.controlRadius),
                onTap: widget.onEditCustomer,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  child: Row(
                    children: [
                      Icon(Icons.person_rounded, color: AppColors.teal),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          widget.customerLabel,
                          style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                        ),
                      ),
                      Text(
                        'Change',
                        style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w700,
                          color: AppColors.teal,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            if (cust != null && cust.loyaltyPoints > 0) ...[
              const SizedBox(height: 12),
              TextField(
                controller: loyaltyCtrl,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: 'Redeem loyalty (max ${cust.loyaltyPoints})'),
                onChanged: (_) => setState(_resetPayments),
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: billDiscountCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Bill discount (₹)',
                helperText: 'Applied across items before payment',
              ),
              onChanged: (_) => setState(_resetPayments),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Text('Split payment', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
                const Spacer(),
                TextButton(onPressed: () => setState(() => payments.add(_PayRow())), child: const Text('+ Add')),
              ],
            ),
            ...payments.asMap().entries.map((e) {
              final i = e.key;
              final row = e.value;
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(
                      flex: 2,
                      child: DropdownButtonFormField<String>(
                        value: row.method,
                        isExpanded: true,
                        items: methods.map((m) => DropdownMenuItem(value: m, child: Text(m.replaceAll('_', ' ')))).toList(),
                        onChanged: (v) => setState(() => row.method = v ?? 'CASH'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextFormField(
                        initialValue: row.amount,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: const InputDecoration(labelText: 'Amount'),
                        onChanged: (v) => row.amount = v,
                      ),
                    ),
                    if (payments.length > 1)
                      IconButton(onPressed: () => setState(() => payments.removeAt(i)), icon: const Icon(Icons.close_rounded)),
                  ],
                ),
              );
            }),
            const SizedBox(height: 8),
            TextField(
              controller: widget.notesCtrl,
              maxLines: 2,
              decoration: const InputDecoration(labelText: 'Notes (optional)', hintText: 'Delivery / warranty remark…'),
            ),
            const SizedBox(height: 16),
            AppPanel(
              child: Column(
                children: [
                  _kv('Taxable', _inr.format(widget.subtotal)),
                  _kv('GST', _inr.format(widget.taxTotal)),
                  if (redeem > 0) _kv('Loyalty', '−${_inr.format(redeem)}'),
                  const Divider(height: 18),
                  _kv('Payable', _inr.format(payable), bold: true),
                ],
              ),
            ),
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: widget.saving ? null : () => _submit(hold: true),
              style: OutlinedButton.styleFrom(minimumSize: const Size(64, 48), foregroundColor: AppColors.teal),
              child: Text(strings.t('hold_bill'), style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: widget.saving ? null : () => _submit(hold: false),
              style: FilledButton.styleFrom(backgroundColor: AppColors.amber, foregroundColor: AppColors.ink, minimumSize: const Size(64, 52)),
              child: Text(widget.saving ? '…' : strings.t('save_bill'), style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w800)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _kv(String k, String v, {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(child: Text(k, style: GoogleFonts.plusJakartaSans(fontWeight: bold ? FontWeight.w800 : FontWeight.w500, color: bold ? AppColors.ink : AppColors.muted))),
          Text(v, style: GoogleFonts.plusJakartaSans(fontWeight: bold ? FontWeight.w800 : FontWeight.w700, fontSize: bold ? 18 : 14)),
        ],
      ),
    );
  }
}

class _SuccessSheet extends StatelessWidget {
  const _SuccessSheet({
    required this.invoiceNumber,
    required this.amount,
    required this.onDone,
    this.onView,
    this.onPrint,
  });

  final String invoiceNumber;
  final double amount;
  final VoidCallback onDone;
  final VoidCallback? onView;
  final VoidCallback? onPrint;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: AppColors.tealSoft,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Icon(Icons.check_rounded, color: AppColors.teal, size: 36),
              ),
            ),
            const SizedBox(height: 14),
            Text(
              'Bill saved',
              textAlign: TextAlign.center,
              style: GoogleFonts.plusJakartaSans(fontSize: 22, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            Text(
              invoiceNumber,
              textAlign: TextAlign.center,
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w700,
                color: AppColors.tealDark,
              ),
            ),
            Text(
              _inr.format(amount),
              textAlign: TextAlign.center,
              style: GoogleFonts.plusJakartaSans(fontSize: 28, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 18),
            if (onPrint != null)
              FilledButton.icon(
                onPressed: onPrint,
                icon: const Icon(Icons.print_rounded),
                label: const Text('Print / download PDF'),
              ),
            if (onView != null) ...[
              const SizedBox(height: 8),
              FilledButton.tonal(
                onPressed: onView,
                child: const Text('Open bill'),
              ),
            ],
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: onDone,
              child: const Text('New bill'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Checklist of models with stock — tick what to sell, set qty, add to bill.
class _StockCheckSellSheet extends StatefulWidget {
  const _StockCheckSellSheet({
    required this.products,
    required this.categoryLabel,
  });

  final List<Product> products;
  final String categoryLabel;

  @override
  State<_StockCheckSellSheet> createState() => _StockCheckSellSheetState();
}

class _StockCheckSellSheetState extends State<_StockCheckSellSheet> {
  final Map<String, int> selected = {};
  String filter = '';

  List<Product> get visible {
    final q = filter.trim().toLowerCase();
    final list = widget.products.where((p) => p.stockQty > 0).toList()
      ..sort((a, b) => a.name.compareTo(b.name));
    if (q.isEmpty) return list;
    return list
        .where(
          (p) =>
              p.name.toLowerCase().contains(q) ||
              p.sku.toLowerCase().contains(q) ||
              (p.brand?.toLowerCase().contains(q) ?? false) ||
              (p.model?.toLowerCase().contains(q) ?? false),
        )
        .toList();
  }

  void _toggle(Product p) {
    setState(() {
      if (selected.containsKey(p.id)) {
        selected.remove(p.id);
      } else {
        selected[p.id] = 1;
      }
    });
  }

  void _setQty(Product p, int qty) {
    if (qty < 1) {
      setState(() => selected.remove(p.id));
      return;
    }
    final max = p.stockQty.floor();
    setState(() => selected[p.id] = qty > max ? max : qty);
  }

  @override
  Widget build(BuildContext context) {
    final list = visible;
    final bottom = MediaQuery.viewInsetsOf(context).bottom;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: bottom),
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.82,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Check & sell',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          Text(
                            '${widget.categoryLabel} · tick models in stock',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 13,
                              color: AppColors.muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close_rounded),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: TextField(
                  decoration: InputDecoration(
                    hintText: 'Search brand, model, SKU…',
                    prefixIcon: Icon(Icons.search_rounded),
                    filled: true,
                    fillColor: AppColors.canvas,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                  ),
                  onChanged: (v) => setState(() => filter = v),
                ),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: list.isEmpty
                    ? const AppEmptyState(
                        message: 'No in-stock models in this list',
                        icon: Icons.inventory_2_outlined,
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                        itemCount: list.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 6),
                        itemBuilder: (_, i) {
                          final p = list[i];
                          final checked = selected.containsKey(p.id);
                          final qty = selected[p.id] ?? 1;
                          final maxQty = p.stockQty.floor();

                          return Material(
                            color: checked
                                ? AppColors.tealSoft.withValues(alpha: 0.45)
                                : AppColors.canvas,
                            borderRadius: BorderRadius.circular(14),
                            child: InkWell(
                              onTap: () => _toggle(p),
                              borderRadius: BorderRadius.circular(14),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Checkbox(
                                      value: checked,
                                      onChanged: (_) => _toggle(p),
                                    ),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            p.name,
                                            style: GoogleFonts.plusJakartaSans(
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            '${p.displayModel} · ${p.sku}',
                                            style: GoogleFonts.plusJakartaSans(
                                              fontSize: 12,
                                              color: AppColors.muted,
                                            ),
                                          ),
                                          Text(
                                            'In stock: ${p.stockQty.toStringAsFixed(0)} · ${_inr.format(p.salePrice)}',
                                            style: GoogleFonts.plusJakartaSans(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w600,
                                              color: AppColors.tealDark,
                                            ),
                                          ),
                                          if (checked) ...[
                                            const SizedBox(height: 8),
                                            Row(
                                              children: [
                                                Text(
                                                  'Sell qty',
                                                  style: GoogleFonts.plusJakartaSans(
                                                    fontSize: 12,
                                                    fontWeight: FontWeight.w600,
                                                  ),
                                                ),
                                                const SizedBox(width: 10),
                                                _QtyButton(
                                                  icon: Icons.remove_rounded,
                                                  onTap: () => _setQty(p, qty - 1),
                                                ),
                                                Padding(
                                                  padding: const EdgeInsets.symmetric(horizontal: 10),
                                                  child: Text(
                                                    '$qty',
                                                    style: GoogleFonts.plusJakartaSans(
                                                      fontWeight: FontWeight.w800,
                                                      fontSize: 16,
                                                    ),
                                                  ),
                                                ),
                                                _QtyButton(
                                                  icon: Icons.add_rounded,
                                                  onTap: () => _setQty(p, qty + 1),
                                                ),
                                                const SizedBox(width: 8),
                                                Text(
                                                  '/ $maxQty',
                                                  style: TextStyle(
                                                    fontSize: 12,
                                                    color: AppColors.muted,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ],
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: FilledButton.icon(
                  onPressed: selected.isEmpty
                      ? null
                      : () => Navigator.pop(context, Map<String, int>.from(selected)),
                  icon: const Icon(Icons.add_shopping_cart_rounded),
                  label: Text(
                    selected.isEmpty
                        ? 'Select models to sell'
                        : 'Add ${selected.length} to bill',
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
