/// Indian FY / week / month / quarter presets for sell & buy ledgers.
library;

class ReportPeriod {
  const ReportPeriod({
    required this.from,
    required this.to,
    required this.label,
    this.fy,
    this.quarter,
  });

  final String from;
  final String to;
  final String label;
  final String? fy;
  final int? quarter;

  Map<String, String> toQuery() {
    if (fy != null && quarter != null) {
      return {'fy': fy!, 'quarter': '$quarter'};
    }
    if (fy != null) return {'fy': fy!};
    return {'from': from, 'to': to};
  }
}

enum PeriodPreset {
  thisWeek,
  lastWeek,
  thisMonth,
  lastMonth,
  q1,
  q2,
  q3,
  q4,
  thisFy,
  lastFy,
}

extension PeriodPresetX on PeriodPreset {
  String get label => switch (this) {
        PeriodPreset.thisWeek => 'This week',
        PeriodPreset.lastWeek => 'Last week',
        PeriodPreset.thisMonth => 'This month',
        PeriodPreset.lastMonth => 'Last month',
        PeriodPreset.q1 => 'Q1',
        PeriodPreset.q2 => 'Q2',
        PeriodPreset.q3 => 'Q3',
        PeriodPreset.q4 => 'Q4',
        PeriodPreset.thisFy => 'This FY',
        PeriodPreset.lastFy => 'Last FY',
      };

  String get shortLabel => switch (this) {
        PeriodPreset.thisWeek => 'Week',
        PeriodPreset.lastWeek => 'Last wk',
        PeriodPreset.thisMonth => 'Month',
        PeriodPreset.lastMonth => 'Last mo',
        PeriodPreset.q1 => 'Q1',
        PeriodPreset.q2 => 'Q2',
        PeriodPreset.q3 => 'Q3',
        PeriodPreset.q4 => 'Q4',
        PeriodPreset.thisFy => 'This FY',
        PeriodPreset.lastFy => 'Last FY',
      };
}

String _iso(DateTime d) {
  final y = d.year.toString().padLeft(4, '0');
  final m = d.month.toString().padLeft(2, '0');
  final day = d.day.toString().padLeft(2, '0');
  return '$y-$m-$day';
}

DateTime _startOfWeek(DateTime d) {
  final x = DateTime(d.year, d.month, d.day);
  final weekday = (x.weekday + 6) % 7; // Mon=0
  return x.subtract(Duration(days: weekday));
}

({int startYear, String key}) _indianFy(DateTime now) {
  final start = now.month >= 4 ? now.year : now.year - 1;
  return (startYear: start, key: '$start-${start + 1}');
}

({String from, String to}) _quarterRange(int startYear, int quarter) {
  return switch (quarter) {
    1 => (from: '$startYear-04-01', to: '$startYear-06-30'),
    2 => (from: '$startYear-07-01', to: '$startYear-09-30'),
    3 => (from: '$startYear-10-01', to: '$startYear-12-31'),
    _ => (from: '${startYear + 1}-01-01', to: '${startYear + 1}-03-31'),
  };
}

ReportPeriod resolvePeriodPreset(PeriodPreset preset, [DateTime? now]) {
  final n = now ?? DateTime.now();
  final fy = _indianFy(n);
  final label = preset.label;

  switch (preset) {
    case PeriodPreset.thisFy:
      return ReportPeriod(
        from: '${fy.startYear}-04-01',
        to: '${fy.startYear + 1}-03-31',
        fy: fy.key,
        label: label,
      );
    case PeriodPreset.lastFy:
      final start = fy.startYear - 1;
      return ReportPeriod(
        from: '$start-04-01',
        to: '${start + 1}-03-31',
        fy: '$start-${start + 1}',
        label: label,
      );
    case PeriodPreset.q1:
    case PeriodPreset.q2:
    case PeriodPreset.q3:
    case PeriodPreset.q4:
      final q = int.parse(preset.name.substring(1));
      final r = _quarterRange(fy.startYear, q);
      return ReportPeriod(
        from: r.from,
        to: r.to,
        fy: fy.key,
        quarter: q,
        label: label,
      );
    case PeriodPreset.thisMonth:
      final from = DateTime(n.year, n.month, 1);
      final to = DateTime(n.year, n.month + 1, 0);
      return ReportPeriod(from: _iso(from), to: _iso(to), label: label);
    case PeriodPreset.lastMonth:
      final from = DateTime(n.year, n.month - 1, 1);
      final to = DateTime(n.year, n.month, 0);
      return ReportPeriod(from: _iso(from), to: _iso(to), label: label);
    case PeriodPreset.thisWeek:
      return ReportPeriod(from: _iso(_startOfWeek(n)), to: _iso(n), label: label);
    case PeriodPreset.lastWeek:
      final thisMon = _startOfWeek(n);
      final lastMon = thisMon.subtract(const Duration(days: 7));
      final lastSun = thisMon.subtract(const Duration(days: 1));
      return ReportPeriod(from: _iso(lastMon), to: _iso(lastSun), label: label);
  }
}

const kDefaultGstSlabs = [0, 5, 12, 18, 28, 40];
