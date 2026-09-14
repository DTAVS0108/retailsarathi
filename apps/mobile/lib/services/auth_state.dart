import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import '../models/models.dart';
import '../theme/branding_prefs.dart';
import 'api_client.dart';

class AuthState extends ChangeNotifier {
  AuthState();

  late ApiClient api;
  String? token;
  UserProfile? user;
  bool ready = false;
  String? error;

  Future<void> bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    final savedBase = prefs.getString(ApiConfig.prefsKey);
    final isAndroid = !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
    final base = (savedBase != null && savedBase.isNotEmpty)
        ? savedBase
        : ApiConfig.defaultBaseUrl(isAndroid: isAndroid);

    token = prefs.getString('token');
    api = ApiClient(baseUrl: base, token: token);

    if (token != null && token!.isNotEmpty) {
      try {
        final me = await api.get('/auth/me');
        if (me is Map<String, dynamic>) {
          user = UserProfile.fromJson(me);
          await BrandingPrefsController.instance.patch(ownerName: user?.name ?? '');
        }
        await _syncShopBranding();
      } catch (_) {
        token = null;
        user = null;
        api.token = null;
        await prefs.remove('token');
      }
    }
    ready = true;
    notifyListeners();
  }

  Future<void> _syncShopBranding() async {
    try {
      final profile = await api.get('/tenants/profile');
      if (profile is Map) {
        final name = asStringKeyedMap(profile)['name']?.toString() ?? '';
        final logo = asStringKeyedMap(profile)['logoUrl']?.toString() ?? '';
        await BrandingPrefsController.instance.patch(
          shopName: name.isNotEmpty ? name : null,
          logoUrl: logo,
        );
      }
    } catch (_) {
      // Branding is best-effort; keep cached shop name if profile fetch fails.
    }
  }

  Future<void> setBaseUrl(String url) async {
    final cleaned = url.trim().replaceAll(RegExp(r'/+$'), '');
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(ApiConfig.prefsKey, cleaned);
    api.baseUrl = cleaned;
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    error = null;
    notifyListeners();
    try {
      final raw = await api.post('/auth/login', body: {
        'email': email.trim(),
        'password': password,
      });
      if (raw is! Map<String, dynamic>) {
        throw ApiException('Unexpected login response');
      }
      token = raw['accessToken']?.toString();
      if (token == null || token!.isEmpty) {
        throw ApiException('No access token returned');
      }
      api.token = token;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('token', token!);

      final userJson = raw['user'];
      if (userJson is Map<String, dynamic>) {
        user = UserProfile.fromJson(userJson);
      } else {
        final me = await api.get('/auth/me');
        user = UserProfile.fromJson(Map<String, dynamic>.from(me as Map));
      }
      await BrandingPrefsController.instance.patch(ownerName: user?.name ?? '');
      await _syncShopBranding();
      notifyListeners();
    } catch (e) {
      error = e.toString();
      notifyListeners();
      rethrow;
    }
  }

  Future<void> logout() async {
    token = null;
    user = null;
    api.token = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    await BrandingPrefsController.instance.patch(ownerName: '', shopName: '');
    notifyListeners();
  }

  Future<void> refreshUser() async {
    if (token == null || token!.isEmpty) return;
    final me = await api.get('/auth/me');
    if (me is Map<String, dynamic>) {
      user = UserProfile.fromJson(me);
    } else if (me is Map) {
      user = UserProfile.fromJson(Map<String, dynamic>.from(me));
    }
    await BrandingPrefsController.instance.patch(ownerName: user?.name ?? '');
    await _syncShopBranding();
    notifyListeners();
  }

  bool get isLoggedIn => token != null && token!.isNotEmpty;
}
