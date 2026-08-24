// Blue and white theme - Build Prompt Section 2. Calm, trustworthy,
// government-appropriate; not playful or consumer-app bright.
//
// Sourced deliberately from PragatiMitra's actual palette
// (frontend/src/pages/Login/Login.jsx's inline CSS), per explicit user
// confirmation to override the original palette built earlier in this project -
// a standard Tailwind slate+blue scale (#2563eb primary, #0f172a/#64748b slate
// text, #e2e8f0 borders, #dc2626 red).
export const colors = {
  primary: '#2563EB',       // primary brand/action blue
  onPrimary: '#FFFFFF',     // #2563EB is dark enough for white text/icons directly
  primaryDark: '#1D4ED8',   // hover/emphasis shade of primary
  primaryLight: '#EFF6FF',  // light blue tint, for subtle backgrounds/active states
  accent: '#475569',        // slate, for secondary actions/visual hierarchy

  background: '#FFFFFF',
  surface: '#F1F5F9',       // light neutral surface, distinguishes cards/panels from bare white
  border: '#E2E8F0',        // neutral border

  textPrimary: '#0F172A',   // slate-900
  textSecondary: '#64748B', // slate-500

  // Risk-level colors - standard semantic meaning (green=safe through red=critical).
  // PragatiMitra (a report-builder app) has no risk-tier concept of its own to
  // source moderate/high from, so those two stay sensible standard tones from the
  // same broader palette family; low and danger ARE PragatiMitra's own colors.
  low: '#15803D',
  moderate: '#D97706',
  high: '#EA580C',
  danger: '#DC2626',        // Critical risk level - PragatiMitra's own error red

  white: '#FFFFFF',

  // Distinct from the risk-tier colors above (low/moderate/high/danger),
  // for generic success/warning UI feedback (toasts, form validation) that
  // isn't describing a victim's risk level.
  success: '#15803D',
  successLight: '#F0FDF4',
  warning: '#D97706',
  warningLight: '#FFFBEB',
  dangerLight: '#FEF2F2',
  infoLight: '#EFF6FF',

  // Logo-tile / primary-button gradient pair (Phase 0 design system) -
  // expo-linear-gradient was already a dependency, unused until now.
  gradientStart: '#2563EB',
  gradientEnd: '#1D4ED8',

  // Staff sidebar/top bar - sourced from PragatiMitra's actual AppShell
  // (frontend/src/components/Dashboard/Appshell.jsx's --sh-sidebar/--sh-topbar/
  // --sh-side-text/--sh-side-active tokens): a dark navy shell with a blue active
  // state, distinct from the rest of the app's light blue-on-white screens.
  sidebarBg: '#0B1220',
  sidebarText: '#94A3B8',
  sidebarTextActive: '#FFFFFF',
  sidebarAccent: '#2563EB',
};
