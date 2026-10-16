import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../l10n/app_strings.dart';
import '../models/models.dart';
import '../services/auth_state.dart';
import '../services/api_client.dart';
import '../theme/app_theme.dart';
import '../theme/branding_prefs.dart';
import '../theme/app_ui.dart';
import '../widgets/app_loader.dart';
import '../widgets/app_toast.dart';
import '../widgets/brand_logo.dart';
import 'app_settings_screen.dart';

/// Offline fallback when `/tenants/billing-templates` is unavailable.
const _kFallbackBillingTemplates = <Map<String, dynamic>>[
  {
    'id': 'classic',
    'name': 'Classic GST',
    'description': 'Rule 46 compliant layout with HSN table, tax summary, and amount in words.',
    'mobileRecommended': true,
    'mobilePreviewAsset': 'assets/invoice_previews/classic.png',
  },
  {
    'id': 'minimal',
    'name': 'Minimal Compliance',
    'description': 'Dense black-and-white format optimised for laser printing and audits.',
    'mobileRecommended': true,
    'mobilePreviewAsset': 'assets/invoice_previews/minimal.png',
  },
  {
    'id': 'modern',
    'name': 'Modern Pro',
    'description': 'Contemporary design with e-invoice QR slot and payment summary.',
    'mobileRecommended': true,
    'mobilePreviewAsset': 'assets/invoice_previews/modern.png',
  },
  {
    'id': 'gst-formal',
    'name': 'GST Formal',
    'description': 'Government-style tax invoice with signature blocks and legal footer.',
    'mobileRecommended': true,
    'mobilePreviewAsset': 'assets/invoice_previews/gst-formal.png',
  },
  {
    'id': 'retail-bold',
    'name': 'Retail Counter',
    'description': 'Bold counter bill with large total, UPI note, and customer-friendly layout.',
    'mobileRecommended': true,
    'mobilePreviewAsset': 'assets/invoice_previews/retail-bold.png',
  },
  {
    'id': 'tally-einvoice',
    'name': 'Tally E-Invoice',
    'description': 'Tally-style tax invoice with IRN header, large e-invoice QR, and HSN tax table.',
    'mobilePreviewAsset': 'assets/invoice_previews/tally-einvoice.png',
  },
  {
    'id': 'tally-standard',
    'name': 'Tally Standard',
    'description': 'Classic Tally tax invoice with e-way bill slot, item table, and bank footer.',
    'mobilePreviewAsset': 'assets/invoice_previews/tally-standard.png',
  },
  {
    'id': 'goel-enterprise',
    'name': 'B2B Trade',
    'description': 'Dealer-style layout with inline CGST/SGST columns, vehicle/e-way header, and bottom IRN QR.',
    'mobilePreviewAsset': 'assets/invoice_previews/goel-enterprise.png',
  },
];

/// Shop + account profile editor (GET/PATCH tenants/profile + PATCH auth/me).
class ProfileSettingsScreen extends StatefulWidget {
  const ProfileSettingsScreen({super.key});

  @override
  State<ProfileSettingsScreen> createState() => _ProfileSettingsScreenState();
}

class _ProfileSettingsScreenState extends State<ProfileSettingsScreen> {
  final nameCtrl = TextEditingController();
  final phoneCtrl = TextEditingController();
  final emailCtrl = TextEditingController();
  final gstinCtrl = TextEditingController();
  final stateCtrl = TextEditingController();
  final addressCtrl = TextEditingController();
  final accountNameCtrl = TextEditingController();
  final accountEmailCtrl = TextEditingController();
  final currentPassCtrl = TextEditingController();
  final newPassCtrl = TextEditingController();
  final confirmPassCtrl = TextEditingController();

  bool compositionScheme = false;
  bool loading = true;
  bool savingShop = false;
  bool savingAccount = false;
  bool savingTemplate = false;
  bool uploadingLogo = false;
  String? logoUrl;
  String? error;
  String? success;
  String mobileInvoiceTemplate = 'retail-bold';
  List<Map<String, dynamic>> billingTemplates = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    nameCtrl.dispose();
    phoneCtrl.dispose();
    emailCtrl.dispose();
    gstinCtrl.dispose();
    stateCtrl.dispose();
    addressCtrl.dispose();
    accountNameCtrl.dispose();
    accountEmailCtrl.dispose();
    currentPassCtrl.dispose();
    newPassCtrl.dispose();
    confirmPassCtrl.dispose();
    super.dispose();
  }

  String? _stateFromGstin(String gstin) {
    final g = gstin.trim().toUpperCase();
    if (g.length < 2) return null;
    final code = g.substring(0, 2);
    if (RegExp(r'^\d{2}$').hasMatch(code)) return code;
    return null;
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final auth = context.read<AuthState>();
      Object? profile;
      Object? templatesRaw;
      Object? me;
      final errors = <String>[];

      try {
        profile = await auth.api.get('/tenants/profile');
      } catch (e) {
        errors.add(e.toString());
      }
      try {
        templatesRaw = await auth.api.get('/tenants/billing-templates');
      } catch (e) {
        errors.add(e.toString());
      }
      try {
        me = await auth.api.get('/auth/me');
      } catch (e) {
        errors.add(e.toString());
      }

      if (!mounted) return;

      if (profile is Map) {
        final p = asStringKeyedMap(profile);
        nameCtrl.text = p['name']?.toString() ?? '';
        phoneCtrl.text = p['phone']?.toString() ?? '';
        emailCtrl.text = p['email']?.toString() ?? '';
        gstinCtrl.text = p['gstin']?.toString() ?? '';
        stateCtrl.text = p['stateCode']?.toString() ?? '';
        addressCtrl.text = p['address']?.toString() ?? '';
        compositionScheme = p['compositionScheme'] == true;
        mobileInvoiceTemplate =
            p['mobileInvoiceTemplate']?.toString() ?? p['defaultInvoiceTemplate']?.toString() ?? 'retail-bold';
        logoUrl = p['logoUrl']?.toString();
        await BrandingPrefsController.instance.patch(
          shopName: nameCtrl.text.trim(),
          logoUrl: logoUrl ?? '',
        );
      }

      final parsedTemplates = asItemList(templatesRaw)
          .whereType<Map>()
          .map(asStringKeyedMap)
          .where((m) => (m['id']?.toString() ?? '').isNotEmpty)
          .toList();
      billingTemplates = parsedTemplates.isNotEmpty ? parsedTemplates : _kFallbackBillingTemplates;

      if (me is Map) {
        final u = asStringKeyedMap(me);
        accountNameCtrl.text = u['name']?.toString() ?? auth.user?.name ?? '';
        accountEmailCtrl.text = u['email']?.toString() ?? auth.user?.email ?? '';
        await BrandingPrefsController.instance.patch(ownerName: accountNameCtrl.text.trim());
      } else {
        accountNameCtrl.text = auth.user?.name ?? '';
        accountEmailCtrl.text = auth.user?.email ?? '';
        await BrandingPrefsController.instance.patch(ownerName: accountNameCtrl.text.trim());
      }

      setState(() {
        loading = false;
        error = errors.isEmpty ? null : errors.first;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = e.toString();
        if (billingTemplates.isEmpty) billingTemplates = _kFallbackBillingTemplates;
      });
    }
  }

  Future<void> _uploadLogo(ImageSource source) async {
    final picker = ImagePicker();
    final shot = await picker.pickImage(source: source, imageQuality: 90, maxWidth: 1200);
    if (shot == null || !mounted) return;
    setState(() {
      uploadingLogo = true;
      error = null;
      success = null;
    });
    try {
      final api = context.read<AuthState>().api;
      final res = await api.uploadFile('/tenants/logo', filePath: shot.path, filename: shot.name);
      final next = res is Map ? asStringKeyedMap(res)['logoUrl']?.toString() : null;
      if (next == null || next.isEmpty) throw Exception('Upload failed');
      await BrandingPrefsController.instance.patch(logoUrl: next);
      if (!mounted) return;
      setState(() {
        logoUrl = next;
        uploadingLogo = false;
        success = 'Logo updated';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        uploadingLogo = false;
        error = e.toString();
      });
      showErrorToast(context, e.toString());
    }
  }

  Future<void> _removeLogo() async {
    setState(() {
      uploadingLogo = true;
      error = null;
      success = null;
    });
    try {
      await context.read<AuthState>().api.delete('/tenants/logo');
      await BrandingPrefsController.instance.patch(logoUrl: '');
      if (!mounted) return;
      setState(() {
        logoUrl = null;
        uploadingLogo = false;
        success = 'Logo removed';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        uploadingLogo = false;
        error = e.toString();
      });
      showErrorToast(context, e.toString());
    }
  }

  String? _logoPreviewUrl(BuildContext context) {
    final raw = logoUrl?.trim() ?? '';
    if (raw.isEmpty) return null;
    if (raw.startsWith('http')) return raw;
    return ApiClient.publicUploadUrl(context.read<AuthState>().api.baseUrl, raw);
  }

  Future<void> _saveShop() async {
    final strings = context.read<AppStrings>();
    if (nameCtrl.text.trim().isEmpty) {
      final msg = strings.t('shop_name_required');
      setState(() => error = msg);
      showErrorToast(context, msg);
      return;
    }
    if (stateCtrl.text.trim().isEmpty) {
      final msg = strings.t('state_code_required');
      setState(() => error = msg);
      showErrorToast(context, msg);
      return;
    }
    final gstin = gstinCtrl.text.trim().toUpperCase();
    if (gstin.isNotEmpty && gstin.length != 15) {
      final msg = strings.t('gstin_invalid');
      setState(() => error = msg);
      showErrorToast(context, msg);
      return;
    }
    final fromGstin = _stateFromGstin(gstin);
    if (fromGstin != null &&
        stateCtrl.text.trim().isNotEmpty &&
        fromGstin != stateCtrl.text.trim()) {
      final msg = strings.t('gstin_state_mismatch');
      setState(() => error = msg);
      showErrorToast(context, msg);
      return;
    }

    setState(() {
      savingShop = true;
      error = null;
      success = null;
    });
    try {
      final auth = context.read<AuthState>();
      final api = auth.api;
      final stateCode = fromGstin ?? stateCtrl.text.trim();
      await api.patch('/tenants/profile', body: {
        'name': nameCtrl.text.trim(),
        'phone': phoneCtrl.text.trim().isEmpty ? null : phoneCtrl.text.trim(),
        'email': emailCtrl.text.trim().isEmpty ? null : emailCtrl.text.trim(),
        // GSTIN is owner-only server-side; omit it entirely for a non-owner so saving the rest
        // of this shared form (name/phone/address/etc.) doesn't 403.
        if (auth.isOwner) 'gstin': gstin.isEmpty ? null : gstin,
        'stateCode': stateCode,
        'address': addressCtrl.text.trim().isEmpty ? null : addressCtrl.text.trim(),
        'compositionScheme': compositionScheme,
      });
      await BrandingPrefsController.instance.patch(shopName: nameCtrl.text.trim());
      if (fromGstin != null) stateCtrl.text = fromGstin;
      if (!mounted) return;
      final msg = strings.t('shop_profile_saved');
      setState(() {
        savingShop = false;
        success = msg;
      });
      showSuccessToast(context, msg);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        savingShop = false;
        error = e.toString();
      });
      showErrorToast(context, e.toString());
    }
  }

  Future<void> _saveMobileTemplate(String templateId) async {
    final strings = context.read<AppStrings>();
    setState(() {
      savingTemplate = true;
      error = null;
      success = null;
    });
    try {
      await context.read<AuthState>().api.patch('/tenants/profile', body: {
        'mobileInvoiceTemplate': templateId,
      });
      if (!mounted) return;
      setState(() {
        savingTemplate = false;
        mobileInvoiceTemplate = templateId;
        success = strings.t('invoice_template_saved');
      });
      showSuccessToast(context, strings.t('invoice_template_saved'));
    } catch (e) {
      if (!mounted) return;
      setState(() {
        savingTemplate = false;
        error = e.toString();
      });
      showErrorToast(context, e.toString());
    }
  }

  Future<void> _saveAccount() async {
    final strings = context.read<AppStrings>();
    final auth = context.read<AuthState>();
    if (accountNameCtrl.text.trim().isEmpty) {
      final msg = strings.t('account_name_required');
      setState(() => error = msg);
      showErrorToast(context, msg);
      return;
    }
    final newPass = newPassCtrl.text;
    final confirm = confirmPassCtrl.text;
    if (newPass.isNotEmpty || confirm.isNotEmpty || currentPassCtrl.text.isNotEmpty) {
      if (currentPassCtrl.text.isEmpty) {
        final msg = strings.t('current_password_required');
        setState(() => error = msg);
        showErrorToast(context, msg);
        return;
      }
      if (newPass.length < 6) {
        final msg = strings.t('password_too_short');
        setState(() => error = msg);
        showErrorToast(context, msg);
        return;
      }
      if (newPass != confirm) {
        final msg = strings.t('password_mismatch');
        setState(() => error = msg);
        showErrorToast(context, msg);
        return;
      }
    }

    setState(() {
      savingAccount = true;
      error = null;
      success = null;
    });
    try {
      final body = <String, dynamic>{
        'name': accountNameCtrl.text.trim(),
      };
      if (newPass.isNotEmpty) {
        body['currentPassword'] = currentPassCtrl.text;
        body['newPassword'] = newPass;
      }
      await auth.api.patch('/auth/me', body: body);
      await auth.refreshUser();
      await BrandingPrefsController.instance.patch(ownerName: accountNameCtrl.text.trim());
      currentPassCtrl.clear();
      newPassCtrl.clear();
      confirmPassCtrl.clear();
      if (!mounted) return;
      final msg = strings.t('account_profile_saved');
      setState(() {
        savingAccount = false;
        success = msg;
      });
      showSuccessToast(context, msg);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        savingAccount = false;
        error = e.toString();
      });
      showErrorToast(context, e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = context.watch<AppStrings>();
    final authUser = context.watch<AuthState>().user;
    final colors = AppColors.of(context);

    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        title: Text(strings.t('profile_settings')),
        actions: [
          IconButton(
            onPressed: loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: loading
          ? const AppLoader()
          : ListView(
              padding: AppSpace.page,
              children: [
                if (error != null) ...[
                  AppPanel(
                    child: Text(error!, style: const TextStyle(color: AppColors.danger)),
                  ),
                  AppSpace.itemGap,
                ],
                if (success != null) ...[
                  AppPanel(
                    child: Text(success!, style: TextStyle(color: AppColors.teal)),
                  ),
                  AppSpace.itemGap,
                ],
                AppSectionTitle(strings.t('account_profile')),
                AppSpace.itemGap,
                AppPanel(
                  child: AppFormColumn(
                    children: [
                      Text(
                        '${strings.t('role')}: ${authUser?.role ?? '—'}',
                        style: GoogleFonts.plusJakartaSans(color: AppColors.muted, fontSize: 13),
                      ),
                      TextField(
                        controller: accountNameCtrl,
                        decoration: InputDecoration(labelText: strings.t('your_name')),
                        textCapitalization: TextCapitalization.words,
                      ),
                      TextField(
                        readOnly: true,
                        controller: accountEmailCtrl,
                        decoration: InputDecoration(
                          labelText: strings.t('email'),
                          helperText: strings.t('email_readonly_hint'),
                        ),
                      ),
                      Text(
                        strings.t('change_password'),
                        style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                      ),
                      TextField(
                        controller: currentPassCtrl,
                        obscureText: true,
                        decoration: InputDecoration(labelText: strings.t('current_password')),
                      ),
                      TextField(
                        controller: newPassCtrl,
                        obscureText: true,
                        decoration: InputDecoration(labelText: strings.t('new_password')),
                      ),
                      TextField(
                        controller: confirmPassCtrl,
                        obscureText: true,
                        decoration: InputDecoration(labelText: strings.t('confirm_password')),
                      ),
                      FilledButton(
                        onPressed: savingAccount ? null : _saveAccount,
                        child: Text(
                          savingAccount ? strings.t('saving') : strings.t('save_account'),
                        ),
                      ),
                    ],
                  ),
                ),
                AppSpace.sectionGap,
                AppSectionTitle(strings.t('shop_profile')),
                AppSpace.itemGap,
                AppPanel(
                  child: AppFormColumn(
                    children: [
                      Text(
                        'Shop logo',
                        style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w700,
                          color: colors.inkOn(colors.surface),
                        ),
                      ),
                      Row(
                        children: [
                          Container(
                            width: 72,
                            height: 72,
                            decoration: BoxDecoration(
                              color: colors.canvas,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: colors.border),
                            ),
                            clipBehavior: Clip.antiAlias,
                            child: _logoPreviewUrl(context) != null
                                ? Image.network(
                                    _logoPreviewUrl(context)!,
                                    fit: BoxFit.contain,
                                    errorBuilder: (_, __, ___) => const BrandMark(size: 56),
                                  )
                                : const BrandMark(size: 56),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                OutlinedButton.icon(
                                  onPressed: uploadingLogo ? null : () => _uploadLogo(ImageSource.gallery),
                                  icon: const Icon(Icons.photo_library_outlined, size: 18),
                                  label: Text(uploadingLogo ? 'Uploading…' : 'Upload logo'),
                                ),
                                if (logoUrl != null && logoUrl!.isNotEmpty) ...[
                                  const SizedBox(height: 8),
                                  TextButton(
                                    onPressed: uploadingLogo ? null : _removeLogo,
                                    child: const Text('Remove logo', style: TextStyle(color: AppColors.danger)),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ),
                      TextField(
                        controller: nameCtrl,
                        decoration: InputDecoration(labelText: '${strings.t('shop_name')} *'),
                        textCapitalization: TextCapitalization.words,
                      ),
                      TextField(
                        controller: phoneCtrl,
                        keyboardType: TextInputType.phone,
                        decoration: InputDecoration(labelText: strings.t('phone')),
                      ),
                      TextField(
                        controller: emailCtrl,
                        keyboardType: TextInputType.emailAddress,
                        decoration: InputDecoration(labelText: strings.t('shop_email')),
                      ),
                      TextField(
                        controller: gstinCtrl,
                        enabled: authUser?.role == 'OWNER',
                        textCapitalization: TextCapitalization.characters,
                        maxLength: 15,
                        decoration: InputDecoration(
                          labelText: strings.t('gstin'),
                          counterText: '',
                          helperText: authUser?.role == 'OWNER'
                              ? null
                              : 'Only the shop owner can change the GSTIN',
                        ),
                        onChanged: (v) {
                          final code = _stateFromGstin(v);
                          if (code != null) stateCtrl.text = code;
                        },
                      ),
                      TextField(
                        controller: stateCtrl,
                        decoration: InputDecoration(labelText: '${strings.t('state_code')} *'),
                        maxLength: 2,
                      ),
                      TextField(
                        controller: addressCtrl,
                        minLines: 2,
                        maxLines: 4,
                        decoration: InputDecoration(labelText: strings.t('address')),
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(strings.t('composition_scheme')),
                        subtitle: Text(strings.t('composition_scheme_hint')),
                        value: compositionScheme,
                        onChanged: (v) => setState(() => compositionScheme = v),
                      ),
                      FilledButton(
                        onPressed: savingShop ? null : _saveShop,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.amber,
                          foregroundColor: AppColors.ink,
                        ),
                        child: Text(
                          savingShop ? strings.t('saving') : strings.t('save_shop'),
                        ),
                      ),
                    ],
                  ),
                ),
                AppSpace.sectionGap,
                AppPanel(
                  padding: EdgeInsets.zero,
                  child: ListTile(
                    leading: Icon(Icons.settings_rounded, color: AppColors.teal),
                    title: Text(
                      strings.t('app_settings'),
                      style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(strings.t('app_settings_sub')),
                    trailing: Icon(Icons.chevron_right_rounded, color: AppColors.muted),
                    onTap: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const AppSettingsScreen()),
                      );
                    },
                  ),
                ),
                AppSpace.sectionGap,
                AppSectionTitle(strings.t('invoice_template')),
                AppSpace.itemGap,
                AppPanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        strings.t('invoice_template_hint'),
                        style: GoogleFonts.plusJakartaSans(color: AppColors.muted, fontSize: 13),
                      ),
                      AppSpace.itemGap,
                      if (billingTemplates.isEmpty)
                        Text(
                          'No invoice templates available. Pull to refresh or check API connection.',
                          style: GoogleFonts.plusJakartaSans(color: AppColors.muted),
                        )
                      else
                        ...billingTemplates.map((tpl) {
                          final id = tpl['id']?.toString() ?? '';
                          final name = tpl['name']?.toString() ?? id;
                          final desc = tpl['description']?.toString() ?? '';
                          final mobileOk = tpl['mobileRecommended'] == true;
                          final previewAsset = tpl['mobilePreviewAsset']?.toString() ??
                              'assets/invoice_previews/$id.png';
                          final selected = mobileInvoiceTemplate == id;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Material(
                              color: selected ? AppColors.teal.withValues(alpha: 0.12) : AppColors.canvas,
                              borderRadius: BorderRadius.circular(12),
                              child: InkWell(
                                borderRadius: BorderRadius.circular(12),
                                onTap: savingTemplate || selected ? null : () => _saveMobileTemplate(id),
                                child: Padding(
                                  padding: const EdgeInsets.all(10),
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(8),
                                        child: ColoredBox(
                                          color: AppColors.muted.withValues(alpha: 0.12),
                                          child: Image.asset(
                                            previewAsset,
                                            width: 72,
                                            height: 102,
                                            fit: BoxFit.contain,
                                            alignment: Alignment.topCenter,
                                            errorBuilder: (_, __, ___) => SizedBox(
                                              width: 72,
                                              height: 102,
                                              child: Icon(Icons.receipt_long, color: AppColors.muted),
                                            ),
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Row(
                                              children: [
                                                Icon(
                                                  selected ? Icons.check_circle_rounded : Icons.circle_outlined,
                                                  color: selected ? AppColors.teal : AppColors.muted,
                                                  size: 18,
                                                ),
                                                const SizedBox(width: 6),
                                                Expanded(
                                                  child: Text(
                                                    name,
                                                    style: GoogleFonts.plusJakartaSans(
                                                      fontWeight: FontWeight.w700,
                                                    ),
                                                  ),
                                                ),
                                              ],
                                            ),
                                            if (desc.isNotEmpty)
                                              Padding(
                                                padding: const EdgeInsets.only(top: 4),
                                                child: Text(
                                                  desc,
                                                  style: GoogleFonts.plusJakartaSans(
                                                    fontSize: 12,
                                                    color: AppColors.muted,
                                                  ),
                                                ),
                                              ),
                                            const SizedBox(height: 6),
                                            Text(
                                              mobileOk ? strings.t('mobile_friendly') : strings.t('web_a4'),
                                              style: GoogleFonts.plusJakartaSans(
                                                fontSize: 11,
                                                color: mobileOk ? AppColors.teal : AppColors.amber,
                                                fontWeight: FontWeight.w600,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          );
                        }),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpace.xxl),
              ],
            ),
    );
  }
}
