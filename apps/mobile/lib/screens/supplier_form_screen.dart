import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/auth_state.dart';
import '../theme/app_theme.dart';
import '../theme/app_ui.dart';

class SupplierFormScreen extends StatefulWidget {
  const SupplierFormScreen({super.key});

  @override
  State<SupplierFormScreen> createState() => _SupplierFormScreenState();
}

class _SupplierFormScreenState extends State<SupplierFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final name = TextEditingController();
  final phone = TextEditingController();
  final gstin = TextEditingController();
  final address = TextEditingController();
  bool saving = false;
  String? error;

  @override
  void dispose() {
    name.dispose();
    phone.dispose();
    gstin.dispose();
    address.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      saving = true;
      error = null;
    });
    try {
      final api = context.read<AuthState>().api;
      await api.post('/suppliers', body: {
        'name': name.text.trim(),
        if (phone.text.trim().isNotEmpty) 'phone': phone.text.trim(),
        if (gstin.text.trim().isNotEmpty) 'gstin': gstin.text.trim(),
        if (address.text.trim().isNotEmpty) 'address': address.text.trim(),
      });
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
        title: const Text('Add supplier'),
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
              decoration: const InputDecoration(labelText: 'Phone', border: OutlineInputBorder()),
              keyboardType: TextInputType.phone,
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
            const SizedBox(height: 20),
            FilledButton(
              onPressed: saving ? null : _save,
              child: saving
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.5),
                    )
                  : const Text('Create supplier'),
            ),
          ],
        ),
      ),
    );
  }
}
