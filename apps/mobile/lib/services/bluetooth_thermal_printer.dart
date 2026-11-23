import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';

/// Native Bluetooth SPP write for ESC/POS thermal printers (Android).
class BluetoothThermalPrinter {
  BluetoothThermalPrinter._();

  static Future<bool> get isBluetoothEnabled async {
    try {
      return await PrintBluetoothThermal.bluetoothEnabled;
    } catch (_) {
      return false;
    }
  }

  static Future<List<BluetoothInfo>> pairedPrinters() async {
    try {
      return await PrintBluetoothThermal.pairedBluetooths;
    } catch (_) {
      return [];
    }
  }

  /// Connect by MAC (e.g. from HardwareConfig.settings.bluetoothAddress).
  static Future<bool> connect(String mac) async {
    final address = mac.trim();
    if (address.isEmpty) return false;
    try {
      final ok = await PrintBluetoothThermal.connectionStatus;
      if (ok) return true;
      return await PrintBluetoothThermal.connect(macPrinterAddress: address);
    } catch (e) {
      debugPrint('BT connect failed: $e');
      return false;
    }
  }

  static Future<bool> disconnect() async {
    try {
      return await PrintBluetoothThermal.disconnect;
    } catch (_) {
      return false;
    }
  }

  /// Decode API `escposBase64` and write raw bytes to the paired printer.
  static Future<bool> printEscPosBase64(String escposBase64, {String? mac}) async {
    if (mac != null && mac.trim().isNotEmpty) {
      final connected = await connect(mac);
      if (!connected) return false;
    } else {
      final status = await PrintBluetoothThermal.connectionStatus;
      if (!status) return false;
    }
    try {
      final bytes = base64Decode(escposBase64);
      return await PrintBluetoothThermal.writeBytes(Uint8List.fromList(bytes));
    } catch (e) {
      debugPrint('BT write failed: $e');
      return false;
    }
  }

  /// Fallback: copy base64 to clipboard when BT write is unavailable.
  static Future<void> copyBase64Fallback(String escposBase64) async {
    await Clipboard.setData(ClipboardData(text: escposBase64));
  }
}
