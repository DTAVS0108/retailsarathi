import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/auth_state.dart';
import '../theme/app_theme.dart';
import '../theme/app_ui.dart';

const _segments = ['RETAIL', 'DEALER', 'DISTRIBUTOR', 'CORPORATE'];

class CustomerFormScreen extends StatefulWidget {
  const CustomerFormScreen({super.key, this.initial});

  /// When non-null, form opens in edit mode (must include `id`).
  final Map<String, dynamic>? initial;

  @override
  State<CustomerFormScreen> createState() => _CustomerFormScreenState();
}

class _CustomerFormScreenState extends State<CustomerFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController name;
  late final TextEditingController phone;
  late final TextEditingController email;
  late final TextEditingController gstin;
  late final TextEditingController address;
  late final TextEditingController city;
  late final TextEditingController pincode;
  late final TextEditingController stateCode;
  late final TextEditingController creditLimit;
  String segment = 'RETAIL';
  bool whatsappOptIn = false;
  bool saving = false;
  String? error;

  bool get isEdit => widget.initial?['id'] != null;

  @override
  void initState() {
    super.initState();
    final i = widget.initial ?? {};
    name = TextEditingController(text: i['name']?.toString() ?? '');
    phone = TextEditingController(text: i['phone']?.toString() ?? '');
    email = TextEditingController(text: i['email']?.toString() ?? '');
    gstin = TextEditingController(text: i['gstin']?.toString() ?? '');
    address = TextEditingController(text: i['address']?.toString() ?? '');
    city = TextEditingController(text: i['city']?.toString() ?? '');
    pincode = TextEditingController(text: i['pincode']?.toString() ?? '');
    stateCode = TextEditingController(text: i['stateCode']?.toString() ?? '');
    final cl = asDouble(i['creditLimit']);
    creditLimit = TextEditingController(text: cl > 0 ? cl.toStringAsFixed(0) : '');
    final seg = i['segment']?.toString().toUpperCase() ?? 'RETAIL';
    segment = _segments.contains(seg) ? seg : 'RETAIL';
    whatsappOptIn = i['whatsappOptIn'] == true;
  }

  @override
  void dispose() {
    name.dispose();
    phone.dispose();
    email.dispose();
    gstin.dispose();
    address.dispose();
    city.dispose();
    pincode.dispose();
    stateCode.dispose();
    creditLimit.dispose();
    super.dispose();
  }

  Map<String, dynamic> _body() {
    final cl = double.tryParse(creditLimit.text.trim()) ?? 0;
    return {
      'name': name.text.trim(),
      'phone': phone.text.trim(),
      if (email.text.trim().isNotEmpty) 'email': email.text.trim(),
      if (gstin.text.trim().isNotEmpty) 'gstin': gstin.text.trim(),
      if (address.text.trim().isNotEmpty) 'address': address.text.trim(),
      if (city.text.trim().isNotEmpty) 'city': city.text.trim(),
      if (pincode.text.trim().isNotEmpty) 'pincode': pincode.text.trim(),
      if (stateCode.text.trim().isNotEmpty) 'stateCode': stateCode.text.trim(),
      'segment': segment,
      if (cl > 0) 'creditLimit': cl,
      'whatsappOptIn': whatsappOptIn,
    };
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      saving = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      if (isEdit) {
        await api.patch('/customers/${widget.initial!['id']}', body: _body());
      } else {
        await api.post('/customers', body: _body());
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: Text(isEdit ? 'Edit customer' : 'Add customer'),
        actions: [
          TextButton(
            onPressed: saving ? null : () => Navigator.of(context).pop(false),
            child: const Text('Close'),
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(AppSpace.md, AppSpace.md, AppSpace.md, AppSpace.xxl),
          children: [
            if (error != null) ...[
              AppPanel(
                child: Text(error!, style: const TextStyle(color: AppColors.danger)),
              ),
              const SizedBox(height: 12),
            ],
            TextFormField(
              controller: name,
              decoration: const InputDecoration(labelText: 'Name *', border: OutlineInputBorder()),
              textCapitalization: TextCapitalization.words,
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: phone,
              decoration: const InputDecoration(labelText: 'Phone *', border: OutlineInputBorder()),
              keyboardType: TextInputType.phone,
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: email,
              decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: gstin,
              decoration: const InputDecoration(labelText: 'GSTIN', border: OutlineInputBorder()),
              textCapitalization: TextCapitalization.characters,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: address,
              decoration: const InputDecoration(labelText: 'Address', border: OutlineInputBorder()),
              maxLines: 2,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: city,
                    decoration: const InputDecoration(labelText: 'City', border: OutlineInputBorder()),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: pincode,
                    decoration: const InputDecoration(labelText: 'Pincode', border: OutlineInputBorder()),
                    keyboardType: TextInputType.number,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: stateCode,
              decoration: const InputDecoration(
                labelText: 'State code (e.g. 27)',
                border: OutlineInputBorder(),
              ),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: segment,
              decoration: const InputDecoration(labelText: 'Segment', border: OutlineInputBorder()),
              items: _segments
                  .map((s) => DropdownMenuItem(value: s, child: Text(s[0] + s.substring(1).toLowerCase())))
                  .toList(),
              onChanged: (v) => setState(() => segment = v ?? 'RETAIL'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: creditLimit,
              decoration: const InputDecoration(labelText: 'Credit limit (₹)', border: OutlineInputBorder()),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
            ),
            const SizedBox(height: 8),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('WhatsApp opt-in', style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600)),
              subtitle: Text(
                'Allow WhatsApp bill reminders',
                style: GoogleFonts.plusJakartaSans(fontSize: 12, color: AppColors.muted),
              ),
              value: whatsappOptIn,
              onChanged: (v) => setState(() => whatsappOptIn = v),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: saving ? null : _save,
              child: saving
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.5),
                    )
                  : Text(isEdit ? 'Save changes' : 'Create customer'),
            ),
          ],
        ),
      ),
    );
  }
}
