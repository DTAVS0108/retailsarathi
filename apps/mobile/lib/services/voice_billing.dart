import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:speech_to_text/speech_to_text.dart';

import 'hinglish_voice_parser.dart';

typedef ProductVoiceMatch = ({
  String id,
  String name,
  String? brand,
  String? model,
  String? sku,
});

class VoiceBillingService extends ChangeNotifier {
  final SpeechToText _speech = SpeechToText();
  bool available = false;
  bool listening = false;
  bool _initializing = false;
  String lastHeard = '';
  String? error;

  Completer<void>? _sessionDone;

  Future<bool> init() async {
    if (_initializing) {
      for (var i = 0; i < 40 && _initializing; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      return available;
    }
    if (available && _speech.isAvailable) return true;

    _initializing = true;
    error = null;
    try {
      // androidNoBluetooth: avoids BT headset probe that hangs/fails on Android 12+
      // without BLUETOOTH_CONNECT. androidIntentLookup helps devices missing a
      // default recognition service entry.
      available = await _speech.initialize(
        onError: (e) {
          error = e.errorMsg;
          listening = false;
          _finishSession();
          notifyListeners();
        },
        onStatus: (status) {
          if (status == 'done' || status == 'notListening') {
            listening = false;
            _finishSession();
            notifyListeners();
          }
        },
        options: [
          SpeechToText.androidNoBluetooth,
          SpeechToText.androidIntentLookup,
        ],
      );
      if (!available) {
        final permitted = await _speech.hasPermission;
        error = permitted
            ? 'Speech recognition is unavailable. Install / enable Google speech services, then retry.'
            : 'Microphone permission denied. Enable mic access for RetailSarathi in system settings.';
      }
    } catch (e) {
      available = false;
      error = e.toString();
    } finally {
      _initializing = false;
    }
    notifyListeners();
    return available;
  }

  void _finishSession() {
    final c = _sessionDone;
    if (c != null && !c.isCompleted) c.complete();
  }

  /// Pick a locale the device actually supports (hi_IN / en_IN / system).
  Future<String?> _resolveLocale(String preferred) async {
    try {
      final locales = await _speech.locales();
      if (locales.isEmpty) return preferred;

      String norm(String id) => id.toLowerCase().replaceAll('-', '_');
      final want = norm(preferred);

      for (final l in locales) {
        if (norm(l.localeId) == want) return l.localeId;
      }
      for (final l in locales) {
        if (norm(l.localeId).startsWith(want.split('_').first)) return l.localeId;
      }
      for (final fallback in ['en_IN', 'en_US', 'hi_IN', 'hi']) {
        final f = norm(fallback);
        for (final l in locales) {
          if (norm(l.localeId) == f || norm(l.localeId).startsWith(f.split('_').first)) {
            return l.localeId;
          }
        }
      }
      return locales.first.localeId;
    } catch (_) {
      return preferred;
    }
  }

  /// Listen until the user finishes speaking (or timeout), then parse Hinglish intent.
  Future<VoiceCartIntent?> listenOnce({String localeId = 'hi_IN'}) async {
    error = null;
    lastHeard = '';

    final ok = await init();
    if (!ok) {
      notifyListeners();
      return null;
    }

    final permitted = await _speech.hasPermission;
    if (!permitted) {
      error =
          'Microphone permission denied. Enable mic access for RetailSarathi in system settings.';
      notifyListeners();
      return null;
    }

    if (_speech.isListening) {
      try {
        await _speech.stop();
      } catch (_) {}
      await Future<void>.delayed(const Duration(milliseconds: 120));
    }

    final locale = await _resolveLocale(localeId);
    listening = true;
    notifyListeners();

    final done = Completer<void>();
    _sessionDone = done;
    Timer? safety;

    try {
      // listen() completes when listening *starts*, not when recognition ends.
      await _speech.listen(
        onResult: (result) {
          lastHeard = result.recognizedWords;
          notifyListeners();
          if (result.finalResult) {
            _finishSession();
          }
        },
        listenOptions: SpeechListenOptions(
          localeId: locale,
          listenFor: const Duration(seconds: 10),
          pauseFor: const Duration(seconds: 4),
          partialResults: true,
          cancelOnError: true,
          // Short product + qty phrases; confirmation is more reliable than search.
          listenMode: ListenMode.confirmation,
        ),
      );

      await Future<void>.delayed(const Duration(milliseconds: 200));
      if (!_speech.isListening && lastHeard.isEmpty) {
        error =
            'Could not start the microphone. Check mic permission and that Google speech services are enabled.';
        _finishSession();
      } else {
        safety = Timer(const Duration(seconds: 12), _finishSession);
        await done.future;
      }
    } on SpeechToTextNotInitializedException {
      available = false;
      error = 'Speech not ready. Tap the mic again to allow microphone access.';
    } on ListenFailedException catch (e) {
      error = e.message ?? 'Could not start the microphone.';
    } catch (e) {
      error = e.toString();
    } finally {
      safety?.cancel();
      _sessionDone = null;
      try {
        if (_speech.isListening) await _speech.stop();
      } catch (_) {}
      listening = false;
      notifyListeners();
    }

    final heard = lastHeard.trim();
    if (heard.isEmpty) return null;
    return HinglishVoiceParser.parse(heard);
  }

  /// Below 0.34 there's no usable match at all. Between 0.34 and [confirmBelow] the match is
  /// returned but marginal — callers should confirm with the user before silently billing it,
  /// since a similarly-named but wrong product could otherwise get added without anyone noticing.
  static const confirmBelow = 0.6;

  ({ProductVoiceMatch product, double score})? bestMatch(
    VoiceCartIntent intent,
    List<ProductVoiceMatch> catalog,
  ) {
    ProductVoiceMatch? best;
    var bestScore = 0.0;
    for (final p in catalog) {
      final score = HinglishVoiceParser.scoreProduct(
        query: intent.query,
        name: p.name,
        brand: p.brand,
        model: p.model,
        sku: p.sku,
      );
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (bestScore < 0.34 || best == null) return null;
    return (product: best, score: bestScore);
  }

  Future<void> stop() async {
    try {
      await _speech.stop();
    } catch (_) {}
    listening = false;
    _finishSession();
    notifyListeners();
  }
}
