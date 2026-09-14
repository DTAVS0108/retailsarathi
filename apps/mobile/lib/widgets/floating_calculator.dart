import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../theme/app_theme.dart';
import '../theme/appearance_prefs.dart';
import '../theme/app_ui.dart';

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹');

const _gstSlabs = [0, 5, 12, 18, 28];

/// Opens the calculator panel from AppBar / POS header actions.
class CalculatorController extends ChangeNotifier {
  bool open = false;

  void toggle() {
    open = !open;
    notifyListeners();
  }

  void show() {
    if (open) return;
    open = true;
    notifyListeners();
  }

  void hide() {
    if (!open) return;
    open = false;
    notifyListeners();
  }
}

/// Header action used on shell tabs (Home, POS, Stock, Bills, …).
class CalculatorAppBarButton extends StatelessWidget {
  const CalculatorAppBarButton({super.key, this.color});

  final Color? color;

  @override
  Widget build(BuildContext context) {
    final show = context.watch<AppearancePrefsController>().showCalculatorFab;
    if (!show) return const SizedBox.shrink();
    final ctrl = context.watch<CalculatorController>();
    return IconButton(
      tooltip: 'Calculator',
      onPressed: () {
        if (AppearancePrefsController.instance.hapticFeedback) {
          HapticFeedback.selectionClick();
        }
        ctrl.toggle();
      },
      icon: Icon(
        ctrl.open ? Icons.close_rounded : Icons.calculate_rounded,
        color: color,
      ),
    );
  }
}

/// Modal panel only — opened from [CalculatorAppBarButton], no floating FAB.
class FloatingCalculatorOverlay extends StatelessWidget {
  const FloatingCalculatorOverlay({super.key});

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<CalculatorController>();
    if (!ctrl.open) return const SizedBox.shrink();

    final colors = AppColors.of(context);
    final keyboard = MediaQuery.viewInsetsOf(context).bottom;
    // Contained card — enough room for keypad without overflow.
    final panelH = (MediaQuery.sizeOf(context).height * 0.64).clamp(448.0, 520.0);

    return Stack(
      children: [
        Positioned.fill(
          child: GestureDetector(
            onTap: ctrl.hide,
            behavior: HitTestBehavior.opaque,
            child: ColoredBox(color: Colors.black.withValues(alpha: 0.28)),
          ),
        ),
        Padding(
          padding: EdgeInsets.only(bottom: keyboard),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Material(
                elevation: 12,
                borderRadius: BorderRadius.circular(20),
                color: colors.surface,
                clipBehavior: Clip.antiAlias,
                child: SizedBox(
                  width: double.infinity,
                  height: panelH,
                  child: DefaultTextStyle.merge(
                    style: TextStyle(color: colors.ink),
                    child: IconTheme.merge(
                      data: IconThemeData(color: colors.ink),
                      child: _CalculatorPanel(onClose: ctrl.hide),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _CalculatorPanel extends StatefulWidget {
  const _CalculatorPanel({required this.onClose});

  final VoidCallback onClose;

  @override
  State<_CalculatorPanel> createState() => _CalculatorPanelState();
}

class _CalculatorPanelState extends State<_CalculatorPanel> with SingleTickerProviderStateMixin {
  late final TabController tabs;

  @override
  void initState() {
    super.initState();
    tabs = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 4, 0),
          child: Row(
            children: [
              Icon(Icons.calculate_rounded, color: colors.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Calculator',
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    color: colors.ink,
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Close',
                visualDensity: VisualDensity.compact,
                onPressed: widget.onClose,
                icon: Icon(Icons.close_rounded, color: colors.ink),
              ),
            ],
          ),
        ),
        TabBar(
          controller: tabs,
          labelColor: AppColors.tealDark,
          unselectedLabelColor: AppColors.muted,
          indicatorColor: AppColors.teal,
          labelStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 13),
          tabs: const [
            Tab(text: 'Basic', height: 40),
            Tab(text: 'GST', height: 40),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: tabs,
            children: const [
              Padding(
                padding: EdgeInsets.fromLTRB(12, 6, 12, 10),
                child: _BasicCalculator(),
              ),
              SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(12, 6, 12, 10),
                physics: ClampingScrollPhysics(),
                child: _GstCalculator(),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _BasicCalculator extends StatefulWidget {
  const _BasicCalculator();

  @override
  State<_BasicCalculator> createState() => _BasicCalculatorState();
}

class _BasicCalculatorState extends State<_BasicCalculator> {
  String display = '0';
  double? acc;
  String? op;
  bool fresh = true;

  String _format(double n) {
    if (!n.isFinite) return 'Error';
    final rounded = (n * 1e10).round() / 1e10;
    if (rounded == rounded.roundToDouble()) return rounded.toInt().toString();
    return rounded.toString();
  }

  double _compute(double a, double b, String operator) {
    return switch (operator) {
      '+' => a + b,
      '-' => a - b,
      '*' => a * b,
      '/' => b == 0 ? double.nan : a / b,
      _ => b,
    };
  }

  void _digit(String d) {
    setState(() {
      if (fresh || display == '0') {
        display = d == '.' ? '0.' : d;
      } else if (d == '.' && display.contains('.')) {
        return;
      } else if (display.replaceAll('.', '').replaceAll('-', '').length >= 12) {
        return;
      } else {
        display = display + d;
      }
      fresh = false;
    });
  }

  void _clear() {
    setState(() {
      display = '0';
      acc = null;
      op = null;
      fresh = true;
    });
  }

  void _backspace() {
    setState(() {
      if (fresh || display.length <= 1) {
        display = '0';
        fresh = true;
        return;
      }
      display = display.substring(0, display.length - 1);
    });
  }

  void _applyOp(String nextOp) {
    final current = double.tryParse(display) ?? 0;
    setState(() {
      if (acc == null || op == null || fresh) {
        acc = current;
        op = nextOp;
        fresh = true;
        return;
      }
      final result = _compute(acc!, current, op!);
      display = _format(result);
      acc = result.isFinite ? result : null;
      op = nextOp;
      fresh = true;
    });
  }

  void _equals() {
    if (acc == null || op == null) return;
    final current = double.tryParse(display) ?? 0;
    setState(() {
      final result = _compute(acc!, current, op!);
      display = _format(result);
      acc = null;
      op = null;
      fresh = true;
    });
  }

  void _percent() {
    setState(() {
      display = _format((double.tryParse(display) ?? 0) / 100);
      fresh = true;
    });
  }

  void _toggleSign() {
    if (display == '0') return;
    setState(() {
      display = display.startsWith('-') ? display.substring(1) : '-$display';
    });
  }

  Widget _key(
    String label, {
    required VoidCallback onTap,
    required Color bg,
    required Color fg,
    int flex = 1,
  }) {
    return Expanded(
      flex: flex,
      child: Padding(
        padding: const EdgeInsets.all(2.5),
        child: Material(
          color: bg,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            onTap: () {
              HapticFeedback.lightImpact();
              onTap();
            },
            borderRadius: BorderRadius.circular(12),
            child: Center(
              child: Text(
                label,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: fg,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _keyRow(List<Widget> children) {
    return Expanded(child: Row(children: children));
  }

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    final digitBg = colors.softFill;
    final digitFg = colors.ink;
    final utilBg = Color.lerp(colors.surface, colors.ink, colors.isDark ? 0.14 : 0.08)!;
    final utilFg = colors.ink;
    final opBg = colors.primary;
    final opFg = colors.onPrimary;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: 40,
          child: Row(
            children: [
              Expanded(
                child: Text(
                  display,
                  textAlign: TextAlign.right,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 28,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.5,
                    color: colors.ink,
                  ),
                ),
              ),
              IconButton(
                onPressed: _backspace,
                visualDensity: VisualDensity.compact,
                icon: Icon(Icons.backspace_outlined, size: 20, color: colors.ink),
              ),
            ],
          ),
        ),
        if (op != null && acc != null)
          Align(
            alignment: Alignment.centerRight,
            child: Text(
              '${_format(acc!)} ${switch (op!) {
                '/' => '÷',
                '*' => '×',
                '-' => '−',
                _ => op!,
              }}',
              style: GoogleFonts.plusJakartaSans(fontSize: 11, color: colors.muted),
            ),
          ),
        const SizedBox(height: 4),
        _keyRow([
          _key('AC', onTap: _clear, bg: utilBg, fg: utilFg),
          _key('±', onTap: _toggleSign, bg: utilBg, fg: utilFg),
          _key('%', onTap: _percent, bg: utilBg, fg: utilFg),
          _key('÷', onTap: () => _applyOp('/'), bg: opBg, fg: opFg),
        ]),
        _keyRow([
          _key('7', onTap: () => _digit('7'), bg: digitBg, fg: digitFg),
          _key('8', onTap: () => _digit('8'), bg: digitBg, fg: digitFg),
          _key('9', onTap: () => _digit('9'), bg: digitBg, fg: digitFg),
          _key('×', onTap: () => _applyOp('*'), bg: opBg, fg: opFg),
        ]),
        _keyRow([
          _key('4', onTap: () => _digit('4'), bg: digitBg, fg: digitFg),
          _key('5', onTap: () => _digit('5'), bg: digitBg, fg: digitFg),
          _key('6', onTap: () => _digit('6'), bg: digitBg, fg: digitFg),
          _key('−', onTap: () => _applyOp('-'), bg: opBg, fg: opFg),
        ]),
        _keyRow([
          _key('1', onTap: () => _digit('1'), bg: digitBg, fg: digitFg),
          _key('2', onTap: () => _digit('2'), bg: digitBg, fg: digitFg),
          _key('3', onTap: () => _digit('3'), bg: digitBg, fg: digitFg),
          _key('+', onTap: () => _applyOp('+'), bg: opBg, fg: opFg),
        ]),
        _keyRow([
          _key('0', onTap: () => _digit('0'), bg: digitBg, fg: digitFg, flex: 2),
          _key('.', onTap: () => _digit('.'), bg: digitBg, fg: digitFg),
          _key('=', onTap: _equals, bg: colors.primaryDark, fg: colors.onPrimary),
        ]),
      ],
    );
  }
}

class _GstCalculator extends StatefulWidget {
  const _GstCalculator();

  @override
  State<_GstCalculator> createState() => _GstCalculatorState();
}

class _GstCalculatorState extends State<_GstCalculator> {
  int slab = 18;
  final taxableCtrl = TextEditingController();
  final finalCtrl = TextEditingController();
  String lastEdited = 'final';

  @override
  void dispose() {
    taxableCtrl.dispose();
    finalCtrl.dispose();
    super.dispose();
  }

  double _roundMoney(double n) => (n * 100).round() / 100;

  ({double? taxable, double? cgst, double? sgst, double? gst, double? finalAmt}) get result {
    final rate = slab / 100;
    late final double base;
    late final double gstRaw;
    late final double finalAmt;
    if (lastEdited == 'final') {
      final raw = finalCtrl.text.trim();
      final parsed = double.tryParse(raw);
      if (raw.isEmpty || parsed == null) {
        return (taxable: null, cgst: null, sgst: null, gst: null, finalAmt: null);
      }
      finalAmt = parsed;
      base = rate == 0 ? finalAmt : finalAmt / (1 + rate);
      gstRaw = finalAmt - base;
    } else {
      final raw = taxableCtrl.text.trim();
      final parsed = double.tryParse(raw);
      if (raw.isEmpty || parsed == null) {
        return (taxable: null, cgst: null, sgst: null, gst: null, finalAmt: null);
      }
      base = parsed;
      gstRaw = base * rate;
      finalAmt = base + gstRaw;
    }
    final totalGst = _roundMoney(gstRaw);
    final cgst = _roundMoney(totalGst / 2);
    final sgst = _roundMoney(totalGst - cgst);
    return (
      taxable: _roundMoney(base),
      cgst: cgst,
      sgst: sgst,
      gst: totalGst,
      finalAmt: _roundMoney(finalAmt),
    );
  }

  void _onTaxable(String value) {
    setState(() {
      lastEdited = 'taxable';
      final base = double.tryParse(value);
      if (value.trim().isEmpty || base == null) {
        finalCtrl.text = '';
        return;
      }
      finalCtrl.text = _roundMoney(base * (1 + slab / 100)).toStringAsFixed(2);
    });
  }

  void _onFinal(String value) {
    setState(() {
      lastEdited = 'final';
      final finalAmt = double.tryParse(value);
      if (value.trim().isEmpty || finalAmt == null) {
        taxableCtrl.text = '';
        return;
      }
      final base = slab == 0 ? finalAmt : finalAmt / (1 + slab / 100);
      taxableCtrl.text = _roundMoney(base).toStringAsFixed(2);
    });
  }

  void _onSlab(int next) {
    setState(() {
      slab = next;
      if (lastEdited == 'final' && finalCtrl.text.trim().isNotEmpty) {
        final finalAmt = double.tryParse(finalCtrl.text);
        if (finalAmt != null) {
          final base = next == 0 ? finalAmt : finalAmt / (1 + next / 100);
          taxableCtrl.text = _roundMoney(base).toStringAsFixed(2);
        }
      } else if (lastEdited == 'taxable' && taxableCtrl.text.trim().isNotEmpty) {
        final base = double.tryParse(taxableCtrl.text);
        if (base != null) {
          finalCtrl.text = _roundMoney(base * (1 + next / 100)).toStringAsFixed(2);
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = AppColors.of(context);
    final r = result;
    final half = slab / 2;
    String money(double? n) => n == null ? '—' : _inr.format(n);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'GST slab',
          style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 13, color: colors.ink),
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            for (final s in _gstSlabs)
              ChoiceChip(
                label: Text('$s%'),
                selected: slab == s,
                visualDensity: VisualDensity.compact,
                onSelected: (_) => _onSlab(s),
              ),
          ],
        ),
        const SizedBox(height: 10),
        TextField(
          controller: taxableCtrl,
          style: GoogleFonts.plusJakartaSans(color: colors.ink),
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            labelText: 'Taxable (excl. GST)',
            hintText: '0.00',
            isDense: true,
            filled: true,
            fillColor: colors.softFill,
          ),
          onChanged: _onTaxable,
        ),
        const SizedBox(height: 8),
        TextField(
          controller: finalCtrl,
          style: GoogleFonts.plusJakartaSans(color: colors.ink),
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            labelText: 'Final (incl. GST)',
            hintText: '0.00',
            isDense: true,
            filled: true,
            fillColor: colors.softFill,
          ),
          onChanged: _onFinal,
        ),
        const SizedBox(height: 6),
        Text(
          'CGST + SGST = total GST (intra-state split).',
          style: GoogleFonts.plusJakartaSans(fontSize: 12, color: colors.muted),
        ),
        const SizedBox(height: 10),
        AppPanel(
          child: Column(
            children: [
              _kv(context, 'Taxable', money(r.taxable)),
              _kv(context, 'CGST (${half % 1 == 0 ? half.toInt() : half}%)', money(r.cgst)),
              _kv(context, 'SGST (${half % 1 == 0 ? half.toInt() : half}%)', money(r.sgst)),
              _kv(context, 'Total GST ($slab%)', money(r.gst)),
              const Divider(height: 16),
              _kv(context, 'Final', money(r.finalAmt), bold: true),
            ],
          ),
        ),
      ],
    );
  }

  Widget _kv(BuildContext context, String k, String v, {bool bold = false}) {
    final colors = AppColors.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text(
              k,
              style: GoogleFonts.plusJakartaSans(
                fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
                color: bold ? colors.ink : colors.muted,
              ),
            ),
          ),
          Text(
            v,
            style: GoogleFonts.plusJakartaSans(
              fontWeight: bold ? FontWeight.w800 : FontWeight.w700,
              fontSize: bold ? 16 : 14,
              color: bold ? colors.primaryDark : colors.ink,
            ),
          ),
        ],
      ),
    );
  }
}
