import { API_BASE_URL } from '@retail-sarathi/types';

export type ThemeId =
  | 'simple-white'
  | 'soft-grey'
  | 'business-blue'
  | 'charcoal-clean'
  | 'ash-desk'
  | 'monsoon-teal'
  | 'midnight-graphite'
  | 'ocean-ink'
  | 'copper-ledger'
  | 'paper-mint'
  | 'slate-ember'
  | 'indigo-harbor'
  | 'saffron-bazaar'
  | 'forest-canopy'
  | 'noir-cyan'
  | 'sky-atelier'
  | 'ruby-counter';

export type LayoutId =
  | 'classic-split'
  | 'cart-priority'
  | 'catalog-focus'
  | 'stacked-touch'
  | 'rail-sidebar';

export type InvoiceTemplateId =
  | 'classic'
  | 'minimal'
  | 'modern'
  | 'gst-formal'
  | 'retail-bold'
  | 'tally-einvoice'
  | 'tally-standard'
  | 'goel-enterprise';

export type DefaultPayMethod = 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'BANK_TRANSFER';

export interface DesktopPrefs {
  themeId: ThemeId;
  layoutId: LayoutId;
  invoiceTemplateId: InvoiceTemplateId;
  thermalWidth: 58 | 80;
  showShopGstin: boolean;
  showShopAddress: boolean;
  showCustomerOnThermal: boolean;
  denseUi: boolean;
  largeTouchTargets: boolean;
  /** Floating calculator button on POS */
  showCalculatorFab: boolean;
  /** Soft beep when barcode adds a line (Web Audio) */
  soundOnScan: boolean;
  /** Confirm before holding a bill */
  confirmHold: boolean;
  /** Auto-focus barcode after each cart add */
  autoFocusBarcode: boolean;
  /** Default payment method row on new bill */
  defaultPayMethod: DefaultPayMethod;
  /** Quick-pick product tiles on POS catalog pane */
  catalogPreviewCount: 8 | 12 | 16 | 24;
  reduceMotion: boolean;
  /** Nest API base including /api/v1 */
  apiUrl: string;
  /** ESC/POS COM port e.g. COM5 (Windows Bluetooth SPP) */
  comPort: string;
  /** Optional Bluetooth MAC for future native BT */
  bluetoothAddress: string;
  /** Append cash-drawer kick after thermal print */
  kickDrawerAfterPrint: boolean;
  /** Auto sync interval in minutes (0 = off) */
  autoSyncIntervalMinutes: number;
  /** Thermal receipt header / footer */
  receiptHeader: string;
  receiptFooter: string;
}

export const DEFAULT_PREFS: DesktopPrefs = {
  themeId: 'slate-ember',
  layoutId: 'classic-split',
  invoiceTemplateId: 'classic',
  thermalWidth: 80,
  showShopGstin: true,
  showShopAddress: true,
  showCustomerOnThermal: true,
  denseUi: false,
  largeTouchTargets: true,
  showCalculatorFab: true,
  soundOnScan: false,
  confirmHold: false,
  autoFocusBarcode: true,
  defaultPayMethod: 'CASH',
  catalogPreviewCount: 12,
  reduceMotion: false,
  apiUrl: 'http://localhost:4000/api/v1',
  comPort: '',
  bluetoothAddress: '',
  kickDrawerAfterPrint: false,
  autoSyncIntervalMinutes: 5,
  receiptHeader: '',
  receiptFooter: 'Thank you! Visit again.',
};

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  tagline: string;
  /** Dark themes need color-scheme:dark + custom selects (native OS popups break). */
  isDark?: boolean;
  sidebarDark?: boolean;
  preview: { bg: string; surface: string; accent: string; text: string; sidebar?: string };
  vars: Record<string, string>;
}

/** Everyday neutrals first, then signature RetailSarathi looks. */
export const THEMES: ThemeMeta[] = [
  {
    id: 'simple-white',
    name: 'Simple White',
    tagline: 'Clean white desk — easy on the eyes all day',
    preview: { bg: '#F4F4F5', surface: '#FFFFFF', accent: '#2563EB', text: '#18181B', sidebar: '#FFFFFF' },
    vars: {
      '--rs-bg': '#F4F4F5',
      '--rs-bg-deep': '#E4E4E7',
      '--rs-surface': '#FFFFFF',
      '--rs-surface-2': '#FAFAFA',
      '--rs-ink': '#18181B',
      '--rs-muted': '#71717A',
      '--rs-accent': '#2563EB',
      '--rs-accent-hover': '#1D4ED8',
      '--rs-accent-soft': '#DBEAFE',
      '--rs-on-accent': '#FFFFFF',
      '--rs-header': 'linear-gradient(180deg, #FFFFFF 0%, #F4F4F5 100%)',
      '--rs-header-ink': '#18181B',
      '--rs-sidebar': 'linear-gradient(180deg, #FFFFFF 0%, #F4F4F5 100%)',
      '--rs-sidebar-ink': '#18181B',
      '--rs-sidebar-muted': '#71717A',
      '--rs-sidebar-border': '#E4E4E7',
      '--rs-border': '#E4E4E7',
      '--rs-success': '#16A34A',
      '--rs-warn': '#D97706',
      '--rs-danger': '#DC2626',
      '--rs-shadow': '0 8px 24px rgba(24, 24, 27, 0.06)',
      '--rs-radius': '10px',
      '--rs-font-display': '"DM Sans", system-ui, sans-serif',
      '--rs-font-body': '"DM Sans", system-ui, sans-serif',
    },
  },
  {
    id: 'soft-grey',
    name: 'Soft Grey',
    tagline: 'Neutral greys — quiet counter, no distraction',
    preview: { bg: '#E8EAED', surface: '#F8F9FA', accent: '#475569', text: '#0F172A', sidebar: '#F1F3F5' },
    vars: {
      '--rs-bg': '#E8EAED',
      '--rs-bg-deep': '#D8DCE2',
      '--rs-surface': '#F8F9FA',
      '--rs-surface-2': '#EEF0F3',
      '--rs-ink': '#0F172A',
      '--rs-muted': '#64748B',
      '--rs-accent': '#475569',
      '--rs-accent-hover': '#334155',
      '--rs-accent-soft': '#E2E8F0',
      '--rs-on-accent': '#FFFFFF',
      '--rs-header': 'linear-gradient(180deg, #F8F9FA 0%, #E8EAED 100%)',
      '--rs-header-ink': '#0F172A',
      '--rs-sidebar': 'linear-gradient(180deg, #F1F3F5 0%, #E8EAED 100%)',
      '--rs-sidebar-ink': '#0F172A',
      '--rs-sidebar-muted': '#64748B',
      '--rs-sidebar-border': '#CBD5E1',
      '--rs-border': '#CBD5E1',
      '--rs-success': '#15803D',
      '--rs-warn': '#B45309',
      '--rs-danger': '#B91C1C',
      '--rs-shadow': '0 8px 24px rgba(15, 23, 42, 0.07)',
      '--rs-radius': '10px',
      '--rs-font-display': '"IBM Plex Sans", system-ui, sans-serif',
      '--rs-font-body': '"IBM Plex Sans", system-ui, sans-serif',
    },
  },
  {
    id: 'business-blue',
    name: 'Business Blue',
    tagline: 'Light office look — clear blue actions',
    preview: { bg: '#F1F5F9', surface: '#FFFFFF', accent: '#1D4ED8', text: '#0F172A', sidebar: '#EFF6FF' },
    vars: {
      '--rs-bg': '#F1F5F9',
      '--rs-bg-deep': '#E2E8F0',
      '--rs-surface': '#FFFFFF',
      '--rs-surface-2': '#F8FAFC',
      '--rs-ink': '#0F172A',
      '--rs-muted': '#64748B',
      '--rs-accent': '#1D4ED8',
      '--rs-accent-hover': '#1E40AF',
      '--rs-accent-soft': '#DBEAFE',
      '--rs-on-accent': '#FFFFFF',
      '--rs-header': 'linear-gradient(180deg, #FFFFFF 0%, #EFF6FF 100%)',
      '--rs-header-ink': '#0F172A',
      '--rs-sidebar': 'linear-gradient(180deg, #EFF6FF 0%, #DBEAFE 100%)',
      '--rs-sidebar-ink': '#1E3A8A',
      '--rs-sidebar-muted': '#3B82F6',
      '--rs-sidebar-border': '#BFDBFE',
      '--rs-border': '#CBD5E1',
      '--rs-success': '#15803D',
      '--rs-warn': '#D97706',
      '--rs-danger': '#DC2626',
      '--rs-shadow': '0 8px 24px rgba(29, 78, 216, 0.08)',
      '--rs-radius': '10px',
      '--rs-font-display': '"Source Sans 3", system-ui, sans-serif',
      '--rs-font-body': '"Source Sans 3", system-ui, sans-serif',
    },
  },
  {
    id: 'charcoal-clean',
    name: 'Charcoal Clean',
    tagline: 'White pages · charcoal buttons — classic POS',
    preview: { bg: '#FAFAFA', surface: '#FFFFFF', accent: '#1F2937', text: '#111827', sidebar: '#FFFFFF' },
    vars: {
      '--rs-bg': '#FAFAFA',
      '--rs-bg-deep': '#F3F4F6',
      '--rs-surface': '#FFFFFF',
      '--rs-surface-2': '#F9FAFB',
      '--rs-ink': '#111827',
      '--rs-muted': '#6B7280',
      '--rs-accent': '#1F2937',
      '--rs-accent-hover': '#111827',
      '--rs-accent-soft': '#E5E7EB',
      '--rs-on-accent': '#FFFFFF',
      '--rs-header': 'linear-gradient(180deg, #FFFFFF 0%, #F3F4F6 100%)',
      '--rs-header-ink': '#111827',
      '--rs-sidebar': 'linear-gradient(180deg, #FFFFFF 0%, #F9FAFB 100%)',
      '--rs-sidebar-ink': '#111827',
      '--rs-sidebar-muted': '#6B7280',
      '--rs-sidebar-border': '#E5E7EB',
      '--rs-border': '#E5E7EB',
      '--rs-success': '#15803D',
      '--rs-warn': '#B45309',
      '--rs-danger': '#B91C1C',
      '--rs-shadow': '0 6px 20px rgba(17, 24, 39, 0.06)',
      '--rs-radius': '8px',
      '--rs-font-display': '"Work Sans", system-ui, sans-serif',
      '--rs-font-body': '"Work Sans", system-ui, sans-serif',
    },
  },
  {
    id: 'ash-desk',
    name: 'Ash Desk',
    tagline: 'Warm ash greys — soft lighting for long shifts',
    preview: { bg: '#EDEBE8', surface: '#FAF9F7', accent: '#57534E', text: '#1C1917', sidebar: '#F5F4F1' },
    vars: {
      '--rs-bg': '#EDEBE8',
      '--rs-bg-deep': '#E0DDD8',
      '--rs-surface': '#FAF9F7',
      '--rs-surface-2': '#F3F1EE',
      '--rs-ink': '#1C1917',
      '--rs-muted': '#78716C',
      '--rs-accent': '#57534E',
      '--rs-accent-hover': '#44403C',
      '--rs-accent-soft': '#E7E5E4',
      '--rs-on-accent': '#FAFAF9',
      '--rs-header': 'linear-gradient(180deg, #FAF9F7 0%, #EDEBE8 100%)',
      '--rs-header-ink': '#1C1917',
      '--rs-sidebar': 'linear-gradient(180deg, #F5F4F1 0%, #EDEBE8 100%)',
      '--rs-sidebar-ink': '#1C1917',
      '--rs-sidebar-muted': '#78716C',
      '--rs-sidebar-border': '#D6D3D1',
      '--rs-border': '#D6D3D1',
      '--rs-success': '#166534',
      '--rs-warn': '#B45309',
      '--rs-danger': '#991B1B',
      '--rs-shadow': '0 8px 22px rgba(28, 25, 23, 0.07)',
      '--rs-radius': '10px',
      '--rs-font-display': '"Source Sans 3", system-ui, sans-serif',
      '--rs-font-body': '"Source Sans 3", system-ui, sans-serif',
    },
  },
  {
    id: 'monsoon-teal',
    name: 'Monsoon Teal',
    tagline: 'Signature RetailSarathi — calm, trusted, counter-ready',
    sidebarDark: true,
    preview: { bg: '#E8F3F1', surface: '#FFFFFF', accent: '#0F766E', text: '#134E4A', sidebar: '#0F766E' },
    vars: {
      '--rs-bg': '#E6F2F0',
      '--rs-bg-deep': '#D1E8E4',
      '--rs-surface': '#FFFFFF',
      '--rs-surface-2': '#F3FAF8',
      '--rs-ink': '#0F2F2C',
      '--rs-muted': '#5B7A76',
      '--rs-accent': '#0F766E',
      '--rs-accent-hover': '#0D5F59',
      '--rs-accent-soft': '#CCFBF1',
      '--rs-on-accent': '#FFFFFF',
      '--rs-header': 'linear-gradient(135deg, #0F766E 0%, #115E59 55%, #134E4A 100%)',
      '--rs-header-ink': '#F0FDFA',
      '--rs-sidebar': 'linear-gradient(185deg, #0D9488 0%, #0F766E 42%, #115E59 100%)',
      '--rs-sidebar-ink': '#F8FAFA',
      '--rs-sidebar-muted': '#99F6E4',
      '--rs-sidebar-border': 'rgba(255,255,255,0.14)',
      '--rs-border': '#C5DDD8',
      '--rs-success': '#15803D',
      '--rs-warn': '#B45309',
      '--rs-danger': '#B91C1C',
      '--rs-shadow': '0 12px 40px rgba(15, 118, 110, 0.12)',
      '--rs-radius': '14px',
      '--rs-font-display': '"Fraunces", Georgia, serif',
      '--rs-font-body': '"DM Sans", system-ui, sans-serif',
    },
  },
  {
    id: 'midnight-graphite',
    name: 'Midnight Graphite',
    tagline: 'Dark counter — high contrast for evening shifts',
    isDark: true,
    sidebarDark: true,
    preview: { bg: '#12151A', surface: '#1C2128', accent: '#A3E635', text: '#E8EDF2', sidebar: '#0B0E12' },
    vars: {
      '--rs-bg': '#0F1217',
      '--rs-bg-deep': '#090B0E',
      '--rs-surface': '#1A1F27',
      '--rs-surface-2': '#232A34',
      '--rs-ink': '#E8EDF2',
      '--rs-muted': '#9AA7B5',
      '--rs-accent': '#A3E635',
      '--rs-accent-hover': '#BEF264',
      '--rs-accent-soft': '#1A2E05',
      '--rs-on-accent': '#0F1217',
      '--rs-header': 'linear-gradient(135deg, #1A1F27 0%, #0F1217 100%)',
      '--rs-header-ink': '#F8FAFC',
      '--rs-sidebar': 'linear-gradient(180deg, #14181F 0%, #0B0E12 100%)',
      '--rs-sidebar-ink': '#F8FAFC',
      '--rs-sidebar-muted': '#94A3B8',
      '--rs-sidebar-border': 'rgba(255,255,255,0.12)',
      '--rs-border': '#3A4352',
      '--rs-success': '#4ADE80',
      '--rs-warn': '#FBBF24',
      '--rs-danger': '#F87171',
      '--rs-shadow': '0 16px 48px rgba(0, 0, 0, 0.45)',
      '--rs-radius': '12px',
      '--rs-font-display': '"Space Grotesk", system-ui, sans-serif',
      '--rs-font-body': '"IBM Plex Sans", system-ui, sans-serif',
    },
  },
  {
    id: 'ocean-ink',
    name: 'Ocean Ink',
    tagline: 'Deep navy rail + coral punch for fast billing',
    sidebarDark: true,
    preview: { bg: '#E8EEF6', surface: '#FFFFFF', accent: '#E11D48', text: '#0B1F3A', sidebar: '#0B1F3A' },
    vars: {
      '--rs-bg': '#E7EDF5',
      '--rs-bg-deep': '#D5DEEB',
      '--rs-surface': '#FFFFFF',
      '--rs-surface-2': '#F4F7FB',
      '--rs-ink': '#0B1F3A',
      '--rs-muted': '#5A6F8C',
      '--rs-accent': '#E11D48',
      '--rs-accent-hover': '#BE123C',
      '--rs-accent-soft': '#FFE4E6',
      '--rs-on-accent': '#FFFFFF',
      '--rs-header': 'linear-gradient(120deg, #0B1F3A 0%, #1E3A5F 60%, #0F2744 100%)',
      '--rs-header-ink': '#F8FAFC',
      '--rs-sidebar': 'linear-gradient(175deg, #12294A 0%, #0B1F3A 48%, #071526 100%)',
      '--rs-sidebar-ink': '#F8FAFC',
      '--rs-sidebar-muted': '#94A3B8',
      '--rs-sidebar-border': 'rgba(255,255,255,0.12)',
      '--rs-border': '#C9D5E5',
      '--rs-success': '#047857',
      '--rs-warn': '#C2410C',
      '--rs-danger': '#BE123C',
      '--rs-shadow': '0 14px 36px rgba(11, 31, 58, 0.14)',
      '--rs-radius': '16px',
      '--rs-font-display': '"Outfit", system-ui, sans-serif',
      '--rs-font-body': '"Source Sans 3", system-ui, sans-serif',
    },
  },
  {
    id: 'copper-ledger',
    name: 'Copper Ledger',
    tagline: 'Warm ink & copper — accounts-desk elegance',
    sidebarDark: true,
    preview: { bg: '#F3EEE6', surface: '#FFFCF0', accent: '#B45309', text: '#1C1917', sidebar: '#292524' },
    vars: {
      '--rs-bg': '#F1EBE2',
      '--rs-bg-deep': '#E5DCCF',
      '--rs-surface': '#FFFEF9',
      '--rs-surface-2': '#F8F3EB',
      '--rs-ink': '#1C1917',
      '--rs-muted': '#78716C',
      '--rs-accent': '#B45309',
      '--rs-accent-hover': '#92400E',
      '--rs-accent-soft': '#FEF3C7',
      '--rs-on-accent': '#FFFFFF',
      '--rs-header': 'linear-gradient(135deg, #292524 0%, #44403C 50%, #57534E 100%)',
      '--rs-header-ink': '#FAFAF9',
      '--rs-sidebar': 'linear-gradient(180deg, #3F3A36 0%, #292524 55%, #1C1917 100%)',
      '--rs-sidebar-ink': '#FAFAF9',
      '--rs-sidebar-muted': '#A8A29E',
      '--rs-sidebar-border': 'rgba(255,255,255,0.1)',
      '--rs-border': '#D6CFC4',
      '--rs-success': '#166534',
      '--rs-warn': '#B45309',
      '--rs-danger': '#991B1B',
      '--rs-shadow': '0 12px 32px rgba(41, 37, 36, 0.12)',
      '--rs-radius': '10px',
      '--rs-font-display': '"Libre Baskerville", Georgia, serif',
      '--rs-font-body': '"Source Sans 3", system-ui, sans-serif',
    },
  },
  {
    id: 'paper-mint',
    name: 'Paper Mint',
    tagline: 'Airy mint workspace — soft light, sharp totals',
    preview: { bg: '#ECF8F3', surface: '#FFFFFF', accent: '#047857', text: '#064E3B', sidebar: '#ECFDF5' },
    vars: {
      '--rs-bg': '#EAF7F1',
      '--rs-bg-deep': '#D7EEE4',
      '--rs-surface': '#FFFFFF',
      '--rs-surface-2': '#F5FBF8',
      '--rs-ink': '#064E3B',
      '--rs-muted': '#4D7C6A',
      '--rs-accent': '#047857',
      '--rs-accent-hover': '#065F46',
      '--rs-accent-soft': '#D1FAE5',
      '--rs-on-accent': '#FFFFFF',
      '--rs-header': 'linear-gradient(120deg, #047857 0%, #059669 100%)',
      '--rs-header-ink': '#ECFDF5',
      '--rs-sidebar': 'linear-gradient(180deg, #F0FDF4 0%, #DCFCE7 100%)',
      '--rs-sidebar-ink': '#064E3B',
      '--rs-sidebar-muted': '#4D7C6A',
      '--rs-sidebar-border': '#A7F3D0',
      '--rs-border': '#B7DFCD',
      '--rs-success': '#15803D',
      '--rs-warn': '#A16207',
      '--rs-danger': '#B91C1C',
      '--rs-shadow': '0 10px 28px rgba(4, 120, 87, 0.1)',
      '--rs-radius': '18px',
      '--rs-font-display': '"Sora", system-ui, sans-serif',
      '--rs-font-body': '"Manrope", system-ui, sans-serif',
    },
  },
  {
    id: 'slate-ember',
    name: 'Slate Ember',
    tagline: 'Cool slate with ember highlights — modern retail',
    sidebarDark: true,
    preview: { bg: '#EEF1F5', surface: '#FFFFFF', accent: '#EA580C', text: '#0F172A', sidebar: '#0F172A' },
    vars: {
      '--rs-bg': '#ECEFF4',
      '--rs-bg-deep': '#DCE2EA',
      '--rs-surface': '#FFFFFF',
      '--rs-surface-2': '#F7F8FA',
      '--rs-ink': '#0F172A',
      '--rs-muted': '#64748B',
      '--rs-accent': '#EA580C',
      '--rs-accent-hover': '#C2410C',
      '--rs-accent-soft': '#FFEDD5',
      '--rs-on-accent': '#FFFFFF',
      '--rs-header': 'linear-gradient(135deg, #0F172A 0%, #1E293B 70%, #334155 100%)',
      '--rs-header-ink': '#F8FAFC',
      '--rs-sidebar': 'linear-gradient(175deg, #1E293B 0%, #0F172A 50%, #020617 100%)',
      '--rs-sidebar-ink': '#F8FAFC',
      '--rs-sidebar-muted': '#94A3B8',
      '--rs-sidebar-border': 'rgba(255,255,255,0.1)',
      '--rs-border': '#CBD5E1',
      '--rs-success': '#16A34A',
      '--rs-warn': '#D97706',
      '--rs-danger': '#DC2626',
      '--rs-shadow': '0 14px 40px rgba(15, 23, 42, 0.12)',
      '--rs-radius': '12px',
      '--rs-font-display': '"Syne", system-ui, sans-serif',
      '--rs-font-body': '"Work Sans", system-ui, sans-serif',
    },
  },
  {
    id: 'indigo-harbor',
    name: 'Indigo Harbor',
    tagline: 'Deep indigo rail · cyan accent · mist desk',
    sidebarDark: true,
    preview: { bg: '#EEF2FF', surface: '#FFFFFF', accent: '#0891B2', text: '#1E1B4B', sidebar: '#1E1B4B' },
    vars: {
      '--rs-bg': '#EEF2FF',
      '--rs-bg-deep': '#E0E7FF',
      '--rs-surface': '#FFFFFF',
      '--rs-surface-2': '#F5F7FF',
      '--rs-ink': '#1E1B4B',
      '--rs-muted': '#64748B',
      '--rs-accent': '#0891B2',
      '--rs-accent-hover': '#0E7490',
      '--rs-accent-soft': '#CFFAFE',
      '--rs-on-accent': '#FFFFFF',
      '--rs-header': 'linear-gradient(125deg, #1E1B4B 0%, #312E81 55%, #0E7490 100%)',
      '--rs-header-ink': '#EEF2FF',
      '--rs-sidebar': 'linear-gradient(180deg, #312E81 0%, #1E1B4B 45%, #0F172A 100%)',
      '--rs-sidebar-ink': '#F8FAFC',
      '--rs-sidebar-muted': '#A5B4FC',
      '--rs-sidebar-border': 'rgba(165,180,252,0.22)',
      '--rs-border': '#C7D2FE',
      '--rs-success': '#15803D',
      '--rs-warn': '#D97706',
      '--rs-danger': '#DC2626',
      '--rs-shadow': '0 16px 40px rgba(30, 27, 75, 0.14)',
      '--rs-radius': '16px',
      '--rs-font-display': '"Outfit", system-ui, sans-serif',
      '--rs-font-body': '"Source Sans 3", system-ui, sans-serif',
    },
  },
  {
    id: 'saffron-bazaar',
    name: 'Saffron Bazaar',
    tagline: 'Ink rail · festival saffron CTAs',
    sidebarDark: true,
    preview: { bg: '#FFF7ED', surface: '#FFFBF5', accent: '#D97706', text: '#1C1917', sidebar: '#1C1917' },
    vars: {
      '--rs-bg': '#FFF7ED',
      '--rs-bg-deep': '#FFEDD5',
      '--rs-surface': '#FFFBF5',
      '--rs-surface-2': '#FFF1E0',
      '--rs-ink': '#1C1917',
      '--rs-muted': '#78716C',
      '--rs-accent': '#D97706',
      '--rs-accent-hover': '#B45309',
      '--rs-accent-soft': '#FEF3C7',
      '--rs-on-accent': '#1C1917',
      '--rs-header': 'linear-gradient(120deg, #1C1917 0%, #44403C 50%, #D97706 160%)',
      '--rs-header-ink': '#FFFBEB',
      '--rs-sidebar': 'linear-gradient(185deg, #292524 0%, #1C1917 55%, #0C0A09 100%)',
      '--rs-sidebar-ink': '#FAFAF9',
      '--rs-sidebar-muted': '#D6D3D1',
      '--rs-sidebar-border': 'rgba(253,230,138,0.18)',
      '--rs-border': '#F5D0A9',
      '--rs-success': '#15803D',
      '--rs-warn': '#B45309',
      '--rs-danger': '#B91C1C',
      '--rs-shadow': '0 14px 36px rgba(28, 25, 23, 0.12)',
      '--rs-radius': '12px',
      '--rs-font-display': '"Sora", system-ui, sans-serif',
      '--rs-font-body': '"DM Sans", system-ui, sans-serif',
    },
  },
  {
    id: 'forest-canopy',
    name: 'Forest Canopy',
    tagline: 'Pine rail · leaf-lime accents',
    sidebarDark: true,
    preview: { bg: '#F0FDF4', surface: '#FFFFFF', accent: '#65A30D', text: '#14532D', sidebar: '#052E16' },
    vars: {
      '--rs-bg': '#F0FDF4',
      '--rs-bg-deep': '#DCFCE7',
      '--rs-surface': '#FFFFFF',
      '--rs-surface-2': '#F7FEF9',
      '--rs-ink': '#14532D',
      '--rs-muted': '#3F6212',
      '--rs-accent': '#65A30D',
      '--rs-accent-hover': '#4D7C0F',
      '--rs-accent-soft': '#ECFCCB',
      '--rs-on-accent': '#14532D',
      '--rs-header': 'linear-gradient(130deg, #052E16 0%, #14532D 55%, #3F6212 100%)',
      '--rs-header-ink': '#F7FEE7',
      '--rs-sidebar': 'linear-gradient(180deg, #14532D 0%, #052E16 60%, #022C22 100%)',
      '--rs-sidebar-ink': '#F7FEE7',
      '--rs-sidebar-muted': '#86EFAC',
      '--rs-sidebar-border': 'rgba(190,242,100,0.16)',
      '--rs-border': '#BBF7D0',
      '--rs-success': '#15803D',
      '--rs-warn': '#CA8A04',
      '--rs-danger': '#B91C1C',
      '--rs-shadow': '0 14px 36px rgba(5, 46, 22, 0.12)',
      '--rs-radius': '14px',
      '--rs-font-display': '"Fraunces", Georgia, serif',
      '--rs-font-body': '"Manrope", system-ui, sans-serif',
    },
  },
  {
    id: 'noir-cyan',
    name: 'Noir Cyan',
    tagline: 'OLED dark · electric cyan',
    isDark: true,
    sidebarDark: true,
    preview: { bg: '#020617', surface: '#0F172A', accent: '#22D3EE', text: '#E2E8F0', sidebar: '#020617' },
    vars: {
      '--rs-bg': '#020617',
      '--rs-bg-deep': '#01040F',
      '--rs-surface': '#0F172A',
      '--rs-surface-2': '#1E293B',
      '--rs-ink': '#E2E8F0',
      '--rs-muted': '#94A3B8',
      '--rs-accent': '#22D3EE',
      '--rs-accent-hover': '#67E8F9',
      '--rs-accent-soft': '#083344',
      '--rs-on-accent': '#082F49',
      '--rs-header': 'linear-gradient(135deg, #0F172A 0%, #020617 70%, #083344 100%)',
      '--rs-header-ink': '#ECFEFF',
      '--rs-sidebar': 'linear-gradient(180deg, #0B1224 0%, #020617 100%)',
      '--rs-sidebar-ink': '#ECFEFF',
      '--rs-sidebar-muted': '#67E8F9',
      '--rs-sidebar-border': 'rgba(34,211,238,0.2)',
      '--rs-border': '#334155',
      '--rs-success': '#4ADE80',
      '--rs-warn': '#FBBF24',
      '--rs-danger': '#FB7185',
      '--rs-shadow': '0 18px 48px rgba(0, 0, 0, 0.55)',
      '--rs-radius': '12px',
      '--rs-font-display': '"Space Grotesk", system-ui, sans-serif',
      '--rs-font-body': '"IBM Plex Sans", system-ui, sans-serif',
    },
  },
  {
    id: 'sky-atelier',
    name: 'Sky Atelier',
    tagline: 'Soft sky rail · clean analytics desk',
    preview: { bg: '#F0F9FF', surface: '#FFFFFF', accent: '#0284C7', text: '#0C4A6E', sidebar: '#E0F2FE' },
    vars: {
      '--rs-bg': '#F0F9FF',
      '--rs-bg-deep': '#E0F2FE',
      '--rs-surface': '#FFFFFF',
      '--rs-surface-2': '#F8FCFF',
      '--rs-ink': '#0C4A6E',
      '--rs-muted': '#0369A1',
      '--rs-accent': '#0284C7',
      '--rs-accent-hover': '#0369A1',
      '--rs-accent-soft': '#E0F2FE',
      '--rs-on-accent': '#FFFFFF',
      '--rs-header': 'linear-gradient(120deg, #0C4A6E 0%, #0284C7 100%)',
      '--rs-header-ink': '#F0F9FF',
      '--rs-sidebar': 'linear-gradient(180deg, #F0F9FF 0%, #E0F2FE 45%, #BAE6FD 100%)',
      '--rs-sidebar-ink': '#0C4A6E',
      '--rs-sidebar-muted': '#0369A1',
      '--rs-sidebar-border': '#7DD3FC',
      '--rs-border': '#BAE6FD',
      '--rs-success': '#15803D',
      '--rs-warn': '#D97706',
      '--rs-danger': '#DC2626',
      '--rs-shadow': '0 12px 32px rgba(2, 132, 199, 0.12)',
      '--rs-radius': '18px',
      '--rs-font-display': '"Sora", system-ui, sans-serif',
      '--rs-font-body': '"Source Sans 3", system-ui, sans-serif',
    },
  },
  {
    id: 'ruby-counter',
    name: 'Ruby Counter',
    tagline: 'Charcoal rail · ruby CTAs for rush hours',
    sidebarDark: true,
    preview: { bg: '#FFF1F2', surface: '#FFFFFF', accent: '#E11D48', text: '#4C0519', sidebar: '#1C1917' },
    vars: {
      '--rs-bg': '#FFF1F2',
      '--rs-bg-deep': '#FFE4E6',
      '--rs-surface': '#FFFFFF',
      '--rs-surface-2': '#FFF8F8',
      '--rs-ink': '#4C0519',
      '--rs-muted': '#7A4554',
      '--rs-accent': '#E11D48',
      '--rs-accent-hover': '#BE123C',
      '--rs-accent-soft': '#FFE4E6',
      '--rs-on-accent': '#FFFFFF',
      '--rs-header': 'linear-gradient(125deg, #1C1917 0%, #4C0519 55%, #9F1239 140%)',
      '--rs-header-ink': '#FFF1F2',
      '--rs-sidebar': 'linear-gradient(180deg, #292524 0%, #1C1917 50%, #0C0A09 100%)',
      '--rs-sidebar-ink': '#FFF1F2',
      '--rs-sidebar-muted': '#FDA4AF',
      '--rs-sidebar-border': 'rgba(255,255,255,0.1)',
      '--rs-border': '#FECDD3',
      '--rs-success': '#15803D',
      '--rs-warn': '#D97706',
      '--rs-danger': '#BE123C',
      '--rs-shadow': '0 14px 36px rgba(76, 5, 25, 0.12)',
      '--rs-radius': '14px',
      '--rs-font-display': '"Syne", system-ui, sans-serif',
      '--rs-font-body': '"Work Sans", system-ui, sans-serif',
    },
  },
];

export interface LayoutMeta {
  id: LayoutId;
  name: string;
  description: string;
  catalogFlex: string;
  cartFlex: string;
  direction: 'row' | 'column';
  showRail: boolean;
}

export const LAYOUTS: LayoutMeta[] = [
  {
    id: 'classic-split',
    name: 'Classic Split',
    description: 'Balanced catalog + cart — default for most shops',
    catalogFlex: '1 1 50%',
    cartFlex: '1 1 50%',
    direction: 'row',
    showRail: false,
  },
  {
    id: 'cart-priority',
    name: 'Cart Priority',
    description: 'Wider cart for checkout speed during rush hours',
    catalogFlex: '1 1 38%',
    cartFlex: '1 1 62%',
    direction: 'row',
    showRail: false,
  },
  {
    id: 'catalog-focus',
    name: 'Catalog Focus',
    description: 'Browse-heavy — great for large SKU catalogs',
    catalogFlex: '1 1 64%',
    cartFlex: '1 1 36%',
    direction: 'row',
    showRail: false,
  },
  {
    id: 'stacked-touch',
    name: 'Stacked Touch',
    description: 'Catalog on top, cart below — tablet / touch friendly',
    catalogFlex: '1 1 52%',
    cartFlex: '1 1 48%',
    direction: 'column',
    showRail: false,
  },
  {
    id: 'rail-sidebar',
    name: 'Rail + Split',
    description: 'Icon rail for modules + classic POS split',
    catalogFlex: '1 1 48%',
    cartFlex: '1 1 52%',
    direction: 'row',
    showRail: true,
  },
];

export const INVOICE_TEMPLATE_OPTIONS: Array<{
  id: InvoiceTemplateId;
  name: string;
  description: string;
  previewImage: string;
}> = [
  { id: 'classic', name: 'Classic GST', description: 'Rule 46 HSN table — most trusted', previewImage: 'invoice-previews/classic.png' },
  { id: 'minimal', name: 'Minimal Compliance', description: 'Dense B&W audit-friendly', previewImage: 'invoice-previews/minimal.png' },
  { id: 'modern', name: 'Modern Pro', description: 'QR slot + payment summary', previewImage: 'invoice-previews/modern.png' },
  { id: 'gst-formal', name: 'GST Formal', description: 'Signature blocks + legal footer', previewImage: 'invoice-previews/gst-formal.png' },
  { id: 'retail-bold', name: 'Retail Counter', description: 'Large total for walk-in customers', previewImage: 'invoice-previews/retail-bold.png' },
  { id: 'tally-einvoice', name: 'Tally E-Invoice', description: 'IRN header + large e-invoice QR', previewImage: 'invoice-previews/tally-einvoice.png' },
  { id: 'tally-standard', name: 'Tally Standard', description: 'E-way slot + bank footer', previewImage: 'invoice-previews/tally-standard.png' },
  { id: 'goel-enterprise', name: 'B2B Trade', description: 'Dealer CGST/SGST columns', previewImage: 'invoice-previews/goel-enterprise.png' },
];

export function applyThemeVars(themeId: ThemeId) {
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  const root = document.documentElement;
  const dark = Boolean(theme.isDark);
  root.setAttribute('data-theme', theme.id);
  root.setAttribute('data-sidebar', theme.sidebarDark ? 'dark' : 'light');
  root.classList.toggle('rs-theme-dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  document.body?.style && (document.body.style.colorScheme = dark ? 'dark' : 'light');
  for (const [k, v] of Object.entries(theme.vars)) {
    root.style.setProperty(k, v);
  }
}

export function mergePrefs(raw: Partial<DesktopPrefs> | null | undefined): DesktopPrefs {
  const merged = { ...DEFAULT_PREFS, ...(raw || {}) };
  if (!THEMES.some((t) => t.id === merged.themeId)) {
    merged.themeId = DEFAULT_PREFS.themeId;
  }
  return merged;
}

export const DESKTOP_PREFS_LS_KEY = 'rs_desktop_prefs';

/** Blocking script — desktop theme persists from localStorage until Settings change. */
export function getDesktopAppearanceInlineScript(): string {
  const catalog = Object.fromEntries(
    THEMES.map((t) => [
      t.id,
      {
        isDark: Boolean(t.isDark),
        sidebarDark: Boolean(t.sidebarDark),
        vars: t.vars,
      },
    ]),
  );
  return `(function(){try{var K=${JSON.stringify(DESKTOP_PREFS_LS_KEY)};var D=${JSON.stringify(DEFAULT_PREFS.themeId)};var T=${JSON.stringify(catalog)};var raw=localStorage.getItem(K);var p=raw?JSON.parse(raw):{};var id=(p.themeId&&T[p.themeId])?p.themeId:D;var theme=T[id];if(!theme)return;var r=document.documentElement;r.setAttribute('data-theme',id);r.setAttribute('data-sidebar',theme.sidebarDark?'dark':'light');if(theme.isDark)r.classList.add('rs-theme-dark');r.style.colorScheme=theme.isDark?'dark':'light';if(p.denseUi)r.classList.add('rs-dense');if(p.largeTouchTargets)r.classList.add('rs-touch-lg');if(p.reduceMotion)r.classList.add('rs-reduce-motion');for(var k in theme.vars){if(Object.prototype.hasOwnProperty.call(theme.vars,k))r.style.setProperty(k,theme.vars[k]);}}catch(e){}})();`;
}
