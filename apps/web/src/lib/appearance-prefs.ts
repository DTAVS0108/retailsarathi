/** Device-local appearance for the web dashboard (not synced to tenant). */

export type WebThemeId =
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
  | 'ruby-counter'
  | 'violet-command';

export type WebDensity = 'comfortable' | 'compact';

export interface WebAppearancePrefs {
  themeId: WebThemeId;
  density: WebDensity;
  reduceMotion: boolean;
  showCalculatorFab: boolean;
  stickySidebarGradient: boolean;
}

export const DEFAULT_WEB_APPEARANCE: WebAppearancePrefs = {
  themeId: 'slate-ember',
  density: 'comfortable',
  reduceMotion: false,
  showCalculatorFab: true,
  stickySidebarGradient: true,
};

export interface WebThemeMeta {
  id: WebThemeId;
  name: string;
  tagline: string;
  bestFor: string;
  /** Full app chrome is dark (forms, cards). */
  isDark?: boolean;
  /** Sidebar uses light text on a deep rail (can pair with light content). */
  sidebarDark?: boolean;
  preview: { bg: string; surface: string; accent: string; text: string; sidebar: string };
  vars: Record<string, string>;
}

function sidebarLight(surface: string, soft: string, ink: string, muted: string, border: string) {
  return {
    '--rs-sidebar-ink': ink,
    '--rs-sidebar-muted': muted,
    '--rs-sidebar-border': border,
    '--rs-sidebar-surface': surface,
    '--rs-sidebar-soft': soft,
  };
}

function sidebarDarkTokens(soft = 'rgba(255,255,255,0.08)', border = 'rgba(255,255,255,0.12)') {
  return {
    '--rs-sidebar-ink': '#F8FAFC',
    '--rs-sidebar-muted': '#94A3B8',
    '--rs-sidebar-border': border,
    '--rs-sidebar-surface': 'rgba(255,255,255,0.06)',
    '--rs-sidebar-soft': soft,
  };
}

/** Everyday neutrals first, then signature dashboard looks. */
export const WEB_THEMES: WebThemeMeta[] = [
  {
    id: 'simple-white',
    name: 'Simple White',
    tagline: 'Clean white desk',
    bestFor: 'All-day billing · low distraction',
    preview: {
      bg: '#F4F4F5',
      surface: '#FFFFFF',
      accent: '#2563EB',
      text: '#18181B',
      sidebar: '#FFFFFF',
    },
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
      '--rs-accent-secondary': '#64748B',
      '--rs-header': 'linear-gradient(180deg, #FFFFFF 0%, #F4F4F5 100%)',
      '--rs-header-ink': '#18181B',
      '--rs-sidebar': 'linear-gradient(180deg, #FFFFFF 0%, #F4F4F5 100%)',
      ...sidebarLight('#FFFFFF', '#F4F4F5', '#18181B', '#71717A', '#E4E4E7'),
      '--rs-border': '#E4E4E7',
      '--rs-danger': '#DC2626',
      '--rs-shadow': '0 8px 24px rgba(24, 24, 27, 0.06)',
      '--rs-radius': '10px',
    },
  },
  {
    id: 'soft-grey',
    name: 'Soft Grey',
    tagline: 'Quiet neutral greys',
    bestFor: 'Long shifts · calm counter',
    preview: {
      bg: '#E8EAED',
      surface: '#F8F9FA',
      accent: '#475569',
      text: '#0F172A',
      sidebar: '#F1F3F5',
    },
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
      '--rs-accent-secondary': '#94A3B8',
      '--rs-header': 'linear-gradient(180deg, #F8F9FA 0%, #E8EAED 100%)',
      '--rs-header-ink': '#0F172A',
      '--rs-sidebar': 'linear-gradient(180deg, #F1F3F5 0%, #E8EAED 100%)',
      ...sidebarLight('#F1F3F5', '#E8EAED', '#0F172A', '#64748B', '#CBD5E1'),
      '--rs-border': '#CBD5E1',
      '--rs-danger': '#B91C1C',
      '--rs-shadow': '0 8px 24px rgba(15, 23, 42, 0.07)',
      '--rs-radius': '10px',
    },
  },
  {
    id: 'business-blue',
    name: 'Business Blue',
    tagline: 'Light office blue',
    bestFor: 'Accounts · clear actions',
    preview: {
      bg: '#F1F5F9',
      surface: '#FFFFFF',
      accent: '#1D4ED8',
      text: '#0F172A',
      sidebar: '#EFF6FF',
    },
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
      '--rs-accent-secondary': '#3B82F6',
      '--rs-header': 'linear-gradient(180deg, #FFFFFF 0%, #EFF6FF 100%)',
      '--rs-header-ink': '#0F172A',
      '--rs-sidebar': 'linear-gradient(180deg, #EFF6FF 0%, #DBEAFE 100%)',
      ...sidebarLight('#EFF6FF', '#DBEAFE', '#1E3A8A', '#3B82F6', '#BFDBFE'),
      '--rs-border': '#CBD5E1',
      '--rs-danger': '#DC2626',
      '--rs-shadow': '0 8px 24px rgba(29, 78, 216, 0.08)',
      '--rs-radius': '10px',
    },
  },
  {
    id: 'charcoal-clean',
    name: 'Charcoal Clean',
    tagline: 'White pages · charcoal actions',
    bestFor: 'Classic POS · print-friendly',
    preview: {
      bg: '#FAFAFA',
      surface: '#FFFFFF',
      accent: '#1F2937',
      text: '#111827',
      sidebar: '#FFFFFF',
    },
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
      '--rs-accent-secondary': '#9CA3AF',
      '--rs-header': 'linear-gradient(180deg, #FFFFFF 0%, #F3F4F6 100%)',
      '--rs-header-ink': '#111827',
      '--rs-sidebar': 'linear-gradient(180deg, #FFFFFF 0%, #F9FAFB 100%)',
      ...sidebarLight('#FFFFFF', '#F9FAFB', '#111827', '#6B7280', '#E5E7EB'),
      '--rs-border': '#E5E7EB',
      '--rs-danger': '#B91C1C',
      '--rs-shadow': '0 6px 20px rgba(17, 24, 39, 0.06)',
      '--rs-radius': '8px',
    },
  },
  {
    id: 'ash-desk',
    name: 'Ash Desk',
    tagline: 'Warm ash greys',
    bestFor: 'Soft lighting · long sessions',
    preview: {
      bg: '#EDEBE8',
      surface: '#FAF9F7',
      accent: '#57534E',
      text: '#1C1917',
      sidebar: '#F5F4F1',
    },
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
      '--rs-accent-secondary': '#A8A29E',
      '--rs-header': 'linear-gradient(180deg, #FAF9F7 0%, #EDEBE8 100%)',
      '--rs-header-ink': '#1C1917',
      '--rs-sidebar': 'linear-gradient(180deg, #F5F4F1 0%, #EDEBE8 100%)',
      ...sidebarLight('#F5F4F1', '#EDEBE8', '#1C1917', '#78716C', '#D6D3D1'),
      '--rs-border': '#D6D3D1',
      '--rs-danger': '#991B1B',
      '--rs-shadow': '0 8px 22px rgba(28, 25, 23, 0.07)',
      '--rs-radius': '10px',
    },
  },
  {
    id: 'monsoon-teal',
    name: 'Monsoon Teal',
    tagline: 'Signature RetailSarathi',
    bestFor: 'Day shifts · accounts desk',
    preview: {
      bg: '#E8F3F1',
      surface: '#FFFFFF',
      accent: '#0F766E',
      text: '#134E4A',
      sidebar: '#0F766E',
    },
    vars: {
      '--rs-bg': '#E8F1F0',
      '--rs-bg-deep': '#D5E8E5',
      '--rs-surface': '#FFFFFF',
      '--rs-surface-2': '#F3FAF8',
      '--rs-ink': '#0F2F2C',
      '--rs-muted': '#5B7A76',
      '--rs-accent': '#0F766E',
      '--rs-accent-hover': '#0D5F59',
      '--rs-accent-soft': '#CCFBF1',
      '--rs-on-accent': '#FFFFFF',
      '--rs-accent-secondary': '#F59E0B',
      '--rs-header': 'linear-gradient(135deg, #0F766E 0%, #115E59 55%, #134E4A 100%)',
      '--rs-header-ink': '#F0FDFA',
      '--rs-sidebar': 'linear-gradient(185deg, #0D9488 0%, #0F766E 42%, #115E59 100%)',
      ...sidebarDarkTokens('rgba(255,255,255,0.12)', 'rgba(255,255,255,0.14)'),
      '--rs-border': '#C5DDD8',
      '--rs-danger': '#B91C1C',
      '--rs-shadow': '0 12px 40px rgba(15, 118, 110, 0.12)',
      '--rs-radius': '14px',
    },
    sidebarDark: true,
  },
  {
    id: 'midnight-graphite',
    name: 'Midnight Graphite',
    tagline: 'Evening counter comfort',
    bestFor: 'Night shifts · low glare',
    isDark: true,
    sidebarDark: true,
    preview: {
      bg: '#12151A',
      surface: '#1C2128',
      accent: '#A3E635',
      text: '#E8EDF2',
      sidebar: '#0B0E12',
    },
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
      '--rs-accent-secondary': '#FBBF24',
      '--rs-header': 'linear-gradient(135deg, #1A1F27 0%, #0F1217 100%)',
      '--rs-header-ink': '#F8FAFC',
      '--rs-sidebar': 'linear-gradient(180deg, #14181F 0%, #0B0E12 55%, #080A0D 100%)',
      ...sidebarDarkTokens(),
      '--rs-border': '#3A4352',
      '--rs-danger': '#F87171',
      '--rs-shadow': '0 16px 48px rgba(0, 0, 0, 0.45)',
      '--rs-radius': '12px',
    },
  },
  {
    id: 'ocean-ink',
    name: 'Ocean Ink',
    tagline: 'Navy rail + coral punch',
    bestFor: 'Fast billing focus',
    sidebarDark: true,
    preview: {
      bg: '#E8EEF6',
      surface: '#FFFFFF',
      accent: '#E11D48',
      text: '#0B1F3A',
      sidebar: '#0B1F3A',
    },
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
      '--rs-accent-secondary': '#0B1F3A',
      '--rs-header': 'linear-gradient(120deg, #0B1F3A 0%, #1E3A5F 60%, #0F2744 100%)',
      '--rs-header-ink': '#F8FAFC',
      '--rs-sidebar': 'linear-gradient(175deg, #12294A 0%, #0B1F3A 48%, #071526 100%)',
      ...sidebarDarkTokens(),
      '--rs-border': '#C9D5E5',
      '--rs-danger': '#BE123C',
      '--rs-shadow': '0 14px 36px rgba(11, 31, 58, 0.14)',
      '--rs-radius': '16px',
    },
  },
  {
    id: 'copper-ledger',
    name: 'Copper Ledger',
    tagline: 'Warm accounts elegance',
    bestFor: 'Ledgers · GST desk',
    sidebarDark: true,
    preview: {
      bg: '#F3EEE6',
      surface: '#FFFCF0',
      accent: '#B45309',
      text: '#1C1917',
      sidebar: '#292524',
    },
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
      '--rs-accent-secondary': '#44403C',
      '--rs-header': 'linear-gradient(135deg, #292524 0%, #44403C 50%, #57534E 100%)',
      '--rs-header-ink': '#FAFAF9',
      '--rs-sidebar': 'linear-gradient(180deg, #3F3A36 0%, #292524 55%, #1C1917 100%)',
      ...sidebarDarkTokens('rgba(251,191,36,0.12)', 'rgba(255,255,255,0.1)'),
      '--rs-border': '#D6CFC4',
      '--rs-danger': '#991B1B',
      '--rs-shadow': '0 12px 32px rgba(41, 37, 36, 0.12)',
      '--rs-radius': '10px',
    },
  },
  {
    id: 'paper-mint',
    name: 'Paper Mint',
    tagline: 'Airy mint workspace',
    bestFor: 'Bright shops · long reports',
    preview: {
      bg: '#ECF8F3',
      surface: '#FFFFFF',
      accent: '#047857',
      text: '#064E3B',
      sidebar: '#ECFDF5',
    },
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
      '--rs-accent-secondary': '#F59E0B',
      '--rs-header': 'linear-gradient(120deg, #047857 0%, #059669 100%)',
      '--rs-header-ink': '#ECFDF5',
      '--rs-sidebar': 'linear-gradient(180deg, #F0FDF4 0%, #DCFCE7 100%)',
      ...sidebarLight('#FFFFFF', '#D1FAE5', '#064E3B', '#4D7C6A', '#A7F3D0'),
      '--rs-border': '#B7DFCD',
      '--rs-danger': '#B91C1C',
      '--rs-shadow': '0 10px 28px rgba(4, 120, 87, 0.1)',
      '--rs-radius': '18px',
    },
  },
  {
    id: 'slate-ember',
    name: 'Slate Ember',
    tagline: 'Modern retail ember',
    bestFor: 'Sales dashboards',
    sidebarDark: true,
    preview: {
      bg: '#EEF1F5',
      surface: '#FFFFFF',
      accent: '#EA580C',
      text: '#0F172A',
      sidebar: '#0F172A',
    },
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
      '--rs-accent-secondary': '#0F172A',
      '--rs-header': 'linear-gradient(135deg, #0F172A 0%, #1E293B 70%, #334155 100%)',
      '--rs-header-ink': '#F8FAFC',
      '--rs-sidebar': 'linear-gradient(175deg, #1E293B 0%, #0F172A 50%, #020617 100%)',
      ...sidebarDarkTokens('rgba(234,88,12,0.16)', 'rgba(255,255,255,0.1)'),
      '--rs-border': '#CBD5E1',
      '--rs-danger': '#DC2626',
      '--rs-shadow': '0 14px 40px rgba(15, 23, 42, 0.12)',
      '--rs-radius': '12px',
    },
  },
  {
    id: 'indigo-harbor',
    name: 'Indigo Harbor',
    tagline: 'Deep rail · mist workspace',
    bestFor: 'Multi-branch managers',
    sidebarDark: true,
    preview: {
      bg: '#EEF2FF',
      surface: '#FFFFFF',
      accent: '#0891B2',
      text: '#1E1B4B',
      sidebar: '#1E1B4B',
    },
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
      '--rs-accent-secondary': '#F59E0B',
      '--rs-header': 'linear-gradient(125deg, #1E1B4B 0%, #312E81 55%, #0E7490 100%)',
      '--rs-header-ink': '#EEF2FF',
      '--rs-sidebar':
        'linear-gradient(180deg, #312E81 0%, #1E1B4B 45%, #0F172A 100%), radial-gradient(120% 80% at 0% 0%, rgba(8,145,178,0.35), transparent 55%)',
      ...sidebarDarkTokens('rgba(8,145,178,0.18)', 'rgba(165,180,252,0.22)'),
      '--rs-border': '#C7D2FE',
      '--rs-danger': '#DC2626',
      '--rs-shadow': '0 16px 40px rgba(30, 27, 75, 0.14)',
      '--rs-radius': '16px',
    },
  },
  {
    id: 'saffron-bazaar',
    name: 'Saffron Bazaar',
    tagline: 'Ink rail · festival saffron',
    bestFor: 'Indian retail counters',
    sidebarDark: true,
    preview: {
      bg: '#FFF7ED',
      surface: '#FFFBF5',
      accent: '#D97706',
      text: '#1C1917',
      sidebar: '#1C1917',
    },
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
      '--rs-accent-secondary': '#0F766E',
      '--rs-header': 'linear-gradient(120deg, #1C1917 0%, #44403C 50%, #D97706 160%)',
      '--rs-header-ink': '#FFFBEB',
      '--rs-sidebar':
        'linear-gradient(185deg, #292524 0%, #1C1917 55%, #0C0A09 100%), radial-gradient(90% 60% at 100% 0%, rgba(217,119,6,0.28), transparent 50%)',
      ...sidebarDarkTokens('rgba(217,119,6,0.18)', 'rgba(253,230,138,0.18)'),
      '--rs-border': '#F5D0A9',
      '--rs-danger': '#B91C1C',
      '--rs-shadow': '0 14px 36px rgba(28, 25, 23, 0.12)',
      '--rs-radius': '12px',
    },
  },
  {
    id: 'forest-canopy',
    name: 'Forest Canopy',
    tagline: 'Pine rail · leaf accents',
    bestFor: 'Quiet back-office hours',
    sidebarDark: true,
    preview: {
      bg: '#F0FDF4',
      surface: '#FFFFFF',
      accent: '#65A30D',
      text: '#14532D',
      sidebar: '#052E16',
    },
    vars: {
      '--rs-bg': '#F0FDF4',
      '--rs-bg-deep': '#DCFCE7',
      '--rs-surface': '#FFFFFF',
      '--rs-surface-2': '#F7FEF9',
      '--rs-ink': '#14532D',
      '--rs-muted': '#4D6B45',
      '--rs-accent': '#65A30D',
      '--rs-accent-hover': '#4D7C0F',
      '--rs-accent-soft': '#ECFCCB',
      '--rs-on-accent': '#14532D',
      '--rs-accent-secondary': '#CA8A04',
      '--rs-header': 'linear-gradient(130deg, #052E16 0%, #14532D 55%, #3F6212 100%)',
      '--rs-header-ink': '#F7FEE7',
      '--rs-sidebar':
        'linear-gradient(180deg, #14532D 0%, #052E16 60%, #022C22 100%), radial-gradient(100% 70% at 0% 100%, rgba(101,163,13,0.25), transparent 55%)',
      ...sidebarDarkTokens('rgba(101,163,13,0.2)', 'rgba(190,242,100,0.16)'),
      '--rs-border': '#BBF7D0',
      '--rs-danger': '#B91C1C',
      '--rs-shadow': '0 14px 36px rgba(5, 46, 22, 0.12)',
      '--rs-radius': '14px',
    },
  },
  {
    id: 'noir-cyan',
    name: 'Noir Cyan',
    tagline: 'OLED dark · electric cyan',
    bestFor: 'Late-night billing',
    isDark: true,
    sidebarDark: true,
    preview: {
      bg: '#020617',
      surface: '#0F172A',
      accent: '#22D3EE',
      text: '#E2E8F0',
      sidebar: '#020617',
    },
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
      '--rs-accent-secondary': '#F472B6',
      '--rs-header': 'linear-gradient(135deg, #0F172A 0%, #020617 70%, #083344 100%)',
      '--rs-header-ink': '#ECFEFF',
      '--rs-sidebar':
        'linear-gradient(180deg, #0B1224 0%, #020617 100%), radial-gradient(80% 50% at 50% 0%, rgba(34,211,238,0.18), transparent 60%)',
      ...sidebarDarkTokens('rgba(34,211,238,0.14)', 'rgba(34,211,238,0.2)'),
      '--rs-border': '#334155',
      '--rs-danger': '#FB7185',
      '--rs-shadow': '0 18px 48px rgba(0, 0, 0, 0.55)',
      '--rs-radius': '12px',
    },
  },
  {
    id: 'sky-atelier',
    name: 'Sky Atelier',
    tagline: 'Soft sky rail · clean desk',
    bestFor: 'Reports · analytics',
    preview: {
      bg: '#F0F9FF',
      surface: '#FFFFFF',
      accent: '#0284C7',
      text: '#0C4A6E',
      sidebar: '#E0F2FE',
    },
    vars: {
      '--rs-bg': '#F0F9FF',
      '--rs-bg-deep': '#E0F2FE',
      '--rs-surface': '#FFFFFF',
      '--rs-surface-2': '#F8FCFF',
      '--rs-ink': '#0C4A6E',
      '--rs-muted': '#5B7C8F',
      '--rs-accent': '#0284C7',
      '--rs-accent-hover': '#0369A1',
      '--rs-accent-soft': '#E0F2FE',
      '--rs-on-accent': '#FFFFFF',
      '--rs-accent-secondary': '#F59E0B',
      '--rs-header': 'linear-gradient(120deg, #0C4A6E 0%, #0284C7 100%)',
      '--rs-header-ink': '#F0F9FF',
      '--rs-sidebar': 'linear-gradient(180deg, #F0F9FF 0%, #E0F2FE 45%, #BAE6FD 100%)',
      ...sidebarLight('#FFFFFF', '#E0F2FE', '#0C4A6E', '#0369A1', '#7DD3FC'),
      '--rs-border': '#BAE6FD',
      '--rs-danger': '#DC2626',
      '--rs-shadow': '0 12px 32px rgba(2, 132, 199, 0.12)',
      '--rs-radius': '18px',
    },
  },
  {
    id: 'ruby-counter',
    name: 'Ruby Counter',
    tagline: 'Charcoal rail · ruby CTA',
    bestFor: 'Busy POS days',
    sidebarDark: true,
    preview: {
      bg: '#FFF1F2',
      surface: '#FFFFFF',
      accent: '#E11D48',
      text: '#4C0519',
      sidebar: '#1C1917',
    },
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
      '--rs-accent-secondary': '#0F766E',
      '--rs-header': 'linear-gradient(125deg, #1C1917 0%, #4C0519 55%, #9F1239 140%)',
      '--rs-header-ink': '#FFF1F2',
      '--rs-sidebar':
        'linear-gradient(180deg, #292524 0%, #1C1917 50%, #0C0A09 100%), radial-gradient(90% 55% at 0% 0%, rgba(225,29,72,0.28), transparent 55%)',
      ...sidebarDarkTokens('rgba(225,29,72,0.16)', 'rgba(255,255,255,0.1)'),
      '--rs-border': '#FECDD3',
      '--rs-danger': '#BE123C',
      '--rs-shadow': '0 14px 36px rgba(76, 5, 25, 0.12)',
      '--rs-radius': '14px',
    },
  },
  {
    id: 'violet-command',
    name: 'Violet Command',
    tagline: 'Executive violet rail',
    bestFor: 'Owner-level exec overview',
    sidebarDark: true,
    preview: {
      bg: '#F5F3FF',
      surface: '#FFFFFF',
      accent: '#DB2777',
      text: '#3B0764',
      sidebar: '#3B0764',
    },
    vars: {
      '--rs-bg': '#F5F3FF',
      '--rs-bg-deep': '#EDE9FE',
      '--rs-surface': '#FFFFFF',
      '--rs-surface-2': '#FAF5FF',
      '--rs-ink': '#3B0764',
      '--rs-muted': '#7C6A9C',
      '--rs-accent': '#DB2777',
      '--rs-accent-hover': '#BE185D',
      '--rs-accent-soft': '#FCE7F3',
      '--rs-on-accent': '#FFFFFF',
      '--rs-accent-secondary': '#7C3AED',
      '--rs-header': 'linear-gradient(120deg, #3B0764 0%, #581C87 55%, #6D28D9 100%)',
      '--rs-header-ink': '#F5F3FF',
      '--rs-sidebar':
        'linear-gradient(180deg, #4C1D95 0%, #3B0764 55%, #2E1065 100%), radial-gradient(90% 60% at 100% 0%, rgba(219,39,119,0.25), transparent 55%)',
      ...sidebarDarkTokens('rgba(219,39,119,0.16)', 'rgba(255,255,255,0.12)'),
      '--rs-border': '#E9D5FF',
      '--rs-danger': '#DC2626',
      '--rs-shadow': '0 16px 40px rgba(59, 7, 100, 0.14)',
      '--rs-radius': '14px',
    },
  },
];

export const WEB_APPEARANCE_LS_KEY = 'rs_web_appearance';
/** Same-tab notify when Design & settings saves (storage event is cross-tab only). */
export const WEB_APPEARANCE_EVENT = 'rs-web-appearance';

export function mergeWebAppearance(raw: Partial<WebAppearancePrefs> | null | undefined): WebAppearancePrefs {
  const merged = { ...DEFAULT_WEB_APPEARANCE, ...(raw || {}) };
  if (!WEB_THEMES.some((t) => t.id === merged.themeId)) {
    merged.themeId = DEFAULT_WEB_APPEARANCE.themeId;
  }
  return merged;
}

export function applyWebAppearance(prefs: WebAppearancePrefs) {
  if (typeof document === 'undefined') return;
  const theme = WEB_THEMES.find((t) => t.id === prefs.themeId) ?? WEB_THEMES[0];
  const root = document.documentElement;
  const dark = Boolean(theme.isDark);
  root.setAttribute('data-theme', theme.id);
  root.setAttribute('data-density', prefs.density);
  root.setAttribute('data-sidebar', theme.sidebarDark ? 'dark' : 'light');
  root.classList.add('rs-themed');
  root.classList.toggle('rs-reduce-motion', prefs.reduceMotion);
  root.classList.toggle('rs-sidebar-flat', !prefs.stickySidebarGradient);
  root.classList.toggle('rs-theme-dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  for (const [k, v] of Object.entries(theme.vars)) {
    root.style.setProperty(k, v);
  }
  // Keep browser chrome / PWA theme-color in sync
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme.preview.accent);
  }
  setThemedFavicon(theme);
}

/** Brand mark SVG filled with the active theme accents (for tab favicon). */
export function buildThemedFaviconSvg(theme: WebThemeMeta): string {
  const accent = theme.vars['--rs-accent'] ?? theme.preview.accent;
  const hover = theme.vars['--rs-accent-hover'] ?? accent;
  const onAccent = theme.vars['--rs-on-accent'] ?? '#F8FFFE';
  const secondary = theme.vars['--rs-accent-secondary'] ?? '#F59E0B';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="18" y1="10" x2="110" y2="118" gradientUnits="userSpaceOnUse"><stop stop-color="${accent}"/><stop offset="1" stop-color="${hover}"/></linearGradient></defs><rect width="128" height="128" rx="28" fill="url(#g)"/><path fill="${onAccent}" d="M34 98c0-28 14-46 42-52 8-2 14-8 14-16 0-10-8-16-20-16H42c-4 0-6 2-6 6v66c0 4 2 6 6 6h8c4 0 6-2 6-6V74c18 2 30 14 30 32 0 4-2 6-6 6h-10c-4 0-6-2-6-6 0-10-8-16-20-16H40c-4 0-6 2-6 6z"/><path fill="${onAccent}" d="M52 38h16c6 0 10 3 10 8s-4 8-10 8H52V38z"/><circle cx="74" cy="34" r="7" fill="${secondary}"/><path fill="${secondary}" d="M96 52c8 6 12 16 10 26-1 4 2 6 5 4 8-12 4-30-10-40-3-2-6 1-5 10z"/></svg>`;
}

/** Replace static PNG icons with a live theme-colored SVG favicon. */
export function setThemedFavicon(theme: WebThemeMeta) {
  if (typeof document === 'undefined') return;
  const svg = buildThemedFaviconSvg(theme);
  const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-rs-theme-icon="1"]');
  if (!link) {
    // Drop static PNG/ICO icons so the themed SVG wins in the tab strip
    document
      .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
      .forEach((el) => {
        if (!(el as HTMLLinkElement).dataset.rsThemeIcon) el.remove();
      });
    link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.setAttribute('data-rs-theme-icon', '1');
    document.head.appendChild(link);
  }
  // Hash bust so Chrome refreshes the tab icon when the theme changes
  link.href = `${href}#${theme.id}`;
}

export function loadWebAppearance(): WebAppearancePrefs {
  if (typeof window === 'undefined') return DEFAULT_WEB_APPEARANCE;
  try {
    const raw = localStorage.getItem(WEB_APPEARANCE_LS_KEY);
    if (!raw) return DEFAULT_WEB_APPEARANCE;
    return mergeWebAppearance(JSON.parse(raw) as Partial<WebAppearancePrefs>);
  } catch {
    return DEFAULT_WEB_APPEARANCE;
  }
}

export function saveWebAppearance(prefs: WebAppearancePrefs) {
  try {
    localStorage.setItem(WEB_APPEARANCE_LS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  applyWebAppearance(prefs);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WEB_APPEARANCE_EVENT, { detail: prefs }));
  }
}

/**
 * Blocking script for <head> — applies saved theme before first paint so
 * home / login / dashboard / admin keep the same look until the user changes it.
 */
export function getWebAppearanceInlineScript(): string {
  const catalog = Object.fromEntries(
    WEB_THEMES.map((t) => [
      t.id,
      {
        isDark: Boolean(t.isDark),
        sidebarDark: Boolean(t.sidebarDark),
        accent: t.vars['--rs-accent'] ?? t.preview.accent,
        hover: t.vars['--rs-accent-hover'] ?? t.preview.accent,
        onAccent: t.vars['--rs-on-accent'] ?? '#F8FFFE',
        secondary: t.vars['--rs-accent-secondary'] ?? '#F59E0B',
        vars: t.vars,
      },
    ]),
  );
  return `(function(){try{var K=${JSON.stringify(WEB_APPEARANCE_LS_KEY)};var D=${JSON.stringify(DEFAULT_WEB_APPEARANCE.themeId)};var T=${JSON.stringify(catalog)};var raw=localStorage.getItem(K);var p=raw?JSON.parse(raw):{};var id=(p.themeId&&T[p.themeId])?p.themeId:D;var theme=T[id];if(!theme)return;var r=document.documentElement;r.setAttribute('data-theme',id);r.setAttribute('data-density',p.density||'comfortable');r.setAttribute('data-sidebar',theme.sidebarDark?'dark':'light');r.classList.add('rs-themed');if(p.reduceMotion)r.classList.add('rs-reduce-motion');if(p.stickySidebarGradient===false)r.classList.add('rs-sidebar-flat');if(theme.isDark)r.classList.add('rs-theme-dark');r.style.colorScheme=theme.isDark?'dark':'light';for(var k in theme.vars){if(Object.prototype.hasOwnProperty.call(theme.vars,k))r.style.setProperty(k,theme.vars[k]);}var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',theme.accent);var svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="18" y1="10" x2="110" y2="118" gradientUnits="userSpaceOnUse"><stop stop-color="'+theme.accent+'"/><stop offset="1" stop-color="'+theme.hover+'"/></linearGradient></defs><rect width="128" height="128" rx="28" fill="url(#g)"/><path fill="'+theme.onAccent+'" d="M34 98c0-28 14-46 42-52 8-2 14-8 14-16 0-10-8-16-20-16H42c-4 0-6 2-6 6v66c0 4 2 6 6 6h8c4 0 6-2 6-6V74c18 2 30 14 30 32 0 4-2 6-6 6h-10c-4 0-6-2-6-6 0-10-8-16-20-16H40c-4 0-6 2-6 6z"/><path fill="'+theme.onAccent+'" d="M52 38h16c6 0 10 3 10 8s-4 8-10 8H52V38z"/><circle cx="74" cy="34" r="7" fill="'+theme.secondary+'"/><path fill="'+theme.secondary+'" d="M96 52c8 6 12 16 10 26-1 4 2 6 5 4 8-12 4-30-10-40-3-2-6 1-5 10z"/></svg>';var href='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)+'#'+id;document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"]').forEach(function(el){if(!el.getAttribute('data-rs-theme-icon'))el.remove();});var link=document.querySelector('link[rel="icon"][data-rs-theme-icon="1"]');if(!link){link=document.createElement('link');link.setAttribute('rel','icon');link.setAttribute('type','image/svg+xml');link.setAttribute('data-rs-theme-icon','1');document.head.appendChild(link);}link.setAttribute('href',href);}catch(e){}})();`;
}

export function getWebTheme(themeId: WebThemeId | string | undefined) {
  return WEB_THEMES.find((t) => t.id === themeId) ?? WEB_THEMES[0];
}
