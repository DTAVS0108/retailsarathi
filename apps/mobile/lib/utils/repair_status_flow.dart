/// Legal next statuses for each repair status.
///
/// Mirrors `REPAIR_STATUS_FLOW` in `packages/types/src/index.ts` (the source of truth shared
/// by the web and desktop apps) — Dart can't import that TS const directly, so keep this map
/// in lockstep by hand whenever the shared flow changes.
const repairStatusFlow = <String, List<String>>{
  'RECEIVED': ['DIAGNOSED', 'CANCELLED'],
  'DIAGNOSED': ['AWAITING_CUSTOMER_APPROVAL', 'AWAITING_PARTS', 'IN_REPAIR', 'CANCELLED'],
  'AWAITING_CUSTOMER_APPROVAL': ['AWAITING_PARTS', 'IN_REPAIR', 'CANCELLED'],
  'AWAITING_PARTS': ['IN_REPAIR', 'ON_HOLD', 'CANCELLED'],
  'IN_REPAIR': ['READY', 'ON_HOLD', 'CANCELLED'],
  'ON_HOLD': ['IN_REPAIR', 'AWAITING_PARTS', 'CANCELLED'],
  'READY': ['DELIVERED'],
  'DELIVERED': [],
  'CANCELLED': [],
};

const repairStatusFilters = [
  '',
  'RECEIVED',
  'DIAGNOSED',
  'AWAITING_CUSTOMER_APPROVAL',
  'AWAITING_PARTS',
  'IN_REPAIR',
  'ON_HOLD',
  'READY',
  'DELIVERED',
  'CANCELLED',
];
