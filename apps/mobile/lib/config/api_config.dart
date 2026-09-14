/// RetailSarathi API base URL helpers.
///
/// - Android emulator → `http://10.0.2.2:4000/api/v1`
/// - iOS simulator / desktop / web → `http://127.0.0.1:4000/api/v1`
/// - Physical phone on same Wi‑Fi → set LAN IP in Settings (saved)
/// - Production → [ApiConfig.productionBaseUrl]
class ApiConfig {
  ApiConfig._();

  static const siteDomain = 'retailsarathi.in';
  static const productionBaseUrl = 'https://api.retailsarathi.in/api/v1';

  static const defaultPort = 4000;
  static const pathPrefix = '/api/v1';

  /// Override via SharedPreferences key `api_base_url`.
  static const prefsKey = 'api_base_url';

  static String defaultBaseUrl({required bool isAndroid}) {
    final host = isAndroid ? '10.0.2.2' : '127.0.0.1';
    return 'http://$host:$defaultPort$pathPrefix';
  }
}
