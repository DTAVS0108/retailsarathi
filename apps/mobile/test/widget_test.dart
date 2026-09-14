import 'package:flutter_test/flutter_test.dart';
import 'package:retail_sarathi_mobile/config/api_config.dart';

void main() {
  test('default API URL for android emulator', () {
    expect(
      ApiConfig.defaultBaseUrl(isAndroid: true),
      'http://10.0.2.2:4000/api/v1',
    );
  });

  test('default API URL for desktop/ios', () {
    expect(
      ApiConfig.defaultBaseUrl(isAndroid: false),
      'http://127.0.0.1:4000/api/v1',
    );
  });
}
