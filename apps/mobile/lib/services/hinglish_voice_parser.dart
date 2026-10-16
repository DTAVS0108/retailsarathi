/// Parse Hinglish / Hindi voice phrases into product search + quantity.
/// Examples: "Exide battery ek", "दो इन्वर्टर", "Amaron 2 piece", "inverter teen"
class VoiceCartIntent {
  const VoiceCartIntent({required this.query, required this.quantity, required this.raw});
  final String query;
  final int quantity;
  final String raw;
}

class HinglishVoiceParser {
  static const _qtyWords = <String, int>{
    'ek': 1,
    'एक': 1,
    'one': 1,
    '1': 1,
    'do': 2,
    'दो': 2,
    'two': 2,
    '2': 2,
    'teen': 3,
    'तीन': 3,
    'three': 3,
    '3': 3,
    'char': 4,
    'चार': 4,
    'four': 4,
    '4': 4,
    'paanch': 5,
    'panch': 5,
    'पाँच': 5,
    'पांच': 5,
    'five': 5,
    '5': 5,
    'chhe': 6,
    'che': 6,
    'छह': 6,
    'six': 6,
    '6': 6,
    'saat': 7,
    'सात': 7,
    'seven': 7,
    '7': 7,
    'aath': 8,
    'आठ': 8,
    'eight': 8,
    '8': 8,
    'nau': 9,
    'नौ': 9,
    'nine': 9,
    '9': 9,
    'das': 10,
    'दस': 10,
    'ten': 10,
    '10': 10,
  };

  static const _noise = {
    'piece',
    'pieces',
    'pcs',
    'pc',
    'qty',
    'quantity',
    'add',
    'bill',
    'karo',
    'करो',
    'please',
    ' जी',
    'ji',
    'bhai',
    'डालो',
    'डाल',
    'lagao',
    'लगाओ',
  };

  static VoiceCartIntent parse(String raw) {
    final text = raw.trim().toLowerCase().replaceAll(RegExp(r'[^\w\u0900-\u097F\s]'), ' ');
    final tokens = text.split(RegExp(r'\s+')).where((t) => t.isNotEmpty).toList();
    if (tokens.isEmpty) {
      return VoiceCartIntent(query: '', quantity: 1, raw: raw);
    }

    int qty = 1;
    final productTokens = <String>[];

    for (final t in tokens) {
      if (_qtyWords.containsKey(t)) {
        qty = _qtyWords[t]!;
        continue;
      }
      final asNum = int.tryParse(t);
      if (asNum != null && asNum > 0 && asNum <= 999) {
        qty = asNum;
        continue;
      }
      if (_noise.contains(t)) continue;
      productTokens.add(t);
    }

    // "do inverter" — if first token was qty word already consumed
    return VoiceCartIntent(
      query: productTokens.join(' ').trim(),
      quantity: qty < 1 ? 1 : qty,
      raw: raw,
    );
  }

  /// Score product match against spoken query (name/brand/model/sku).
  static double scoreProduct({
    required String query,
    required String name,
    String? brand,
    String? model,
    String? sku,
  }) {
    if (query.isEmpty) return 0;
    final q = query.toLowerCase();
    final hay = [
      name,
      brand ?? '',
      model ?? '',
      sku ?? '',
      '${brand ?? ''} ${model ?? ''}',
    ].join(' ').toLowerCase();

    if (hay.contains(q)) return 1.0;
    final parts = q.split(' ').where((p) => p.length > 1);
    var hits = 0;
    var total = 0;
    for (final part in parts) {
      total++;
      if (hay.contains(part)) hits++;
    }
    if (total == 0) return 0;
    return hits / total;
  }
}
