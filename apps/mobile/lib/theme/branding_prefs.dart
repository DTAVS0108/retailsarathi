import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Product brand (OS / about / marketing). Shop chrome uses [shopName].
const kProductBrandName = 'RetailSarathi';

class BrandingPrefsController extends ChangeNotifier {
  BrandingPrefsController._();

  static final BrandingPrefsController instance = BrandingPrefsController._();

  static const _kShopName = 'rs_mobile_shop_name';
  static const _kOwnerName = 'rs_mobile_owner_name';
  static const _kLogoUrl = 'rs_mobile_shop_logo';

  String shopName = '';
  String ownerName = '';
  String logoUrl = '';

  /// Wordmark for chrome — shop/organization when known.
  String get displayShopName => shopName.trim().isNotEmpty ? shopName.trim() : kProductBrandName;

  bool get hasShopName => shopName.trim().isNotEmpty;

  bool get hasLogo => logoUrl.trim().isNotEmpty;

  Future<void> bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    shopName = prefs.getString(_kShopName) ?? '';
    ownerName = prefs.getString(_kOwnerName) ?? '';
    logoUrl = prefs.getString(_kLogoUrl) ?? '';
    notifyListeners();
  }

  Future<void> patch({
    String? shopName,
    String? ownerName,
    String? logoUrl,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    if (shopName != null) {
      this.shopName = shopName.trim();
      await prefs.setString(_kShopName, this.shopName);
    }
    if (ownerName != null) {
      this.ownerName = ownerName.trim();
      await prefs.setString(_kOwnerName, this.ownerName);
    }
    if (logoUrl != null) {
      this.logoUrl = logoUrl.trim();
      await prefs.setString(_kLogoUrl, this.logoUrl);
    }
    notifyListeners();
  }
}
