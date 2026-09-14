import 'package:flutter/material.dart';

/// Shared tap-target / control metrics for every Flutter theme and screen.
class AppMetrics {
  AppMetrics._();

  /// Primary Filled / Outlined button height.
  static const controlHeight = 48.0;

  /// Dense chips / compact actions.
  static const controlHeightDense = 40.0;

  /// TextField / dropdown min height.
  static const fieldHeight = 52.0;

  static const controlRadius = 12.0;
  static const controlHPad = 16.0;
  static const controlVPad = 12.0;
  static const fieldHPad = 14.0;
  static const fieldVPad = 14.0;

  static const buttonMinSize = Size(64, controlHeight);
  static const buttonPadding = EdgeInsets.symmetric(horizontal: controlHPad, vertical: controlVPad);
  static const fieldPadding = EdgeInsets.fromLTRB(fieldHPad, fieldVPad, fieldHPad, fieldVPad);
  static const fieldConstraints = BoxConstraints(minHeight: fieldHeight);
}
