// Institutional government-portal theme - Build Prompt Section 2's "Blue
// and white theme... calm, trustworthy, government-appropriate." Kept as
// the one shared blue/white palette across the whole app (explicit
// instruction: no second accent color, no navy/gold split) - the
// institutional feel comes from structure (flat borders, DataTable,
// GovernmentHeader, Public Sans, no animation), not a different color.
export const colors = {
  primary: '#2563EB',
  onPrimary: '#FFFFFF',
  primaryDark: '#1D4ED8',   // pressed/emphasis shade of primary
  primaryLight: '#EFF6FF',  // pale blue tint, for subtle backgrounds/active states

  accent: '#475569',        // slate, for secondary actions/visual hierarchy

  background: '#FFFFFF',
  surface: '#F8FAFC',       // page surface, distinguishes cards/panels from bare white
  border: '#E2E8F0',        // crisp neutral border
  borderStrong: '#CBD5E1',

  textPrimary: '#0F172A',   // slate-900
  textSecondary: '#475569', // darkened from the earlier #64748B for AAA contrast on white

  // Risk-level colors - standard semantic meaning (green=safe through red=critical).
  low: '#15803D',
  moderate: '#B45309',
  high: '#C2410C',
  danger: '#B91C1C',        // Critical risk level

  white: '#FFFFFF',

  success: '#15803D',
  successLight: '#F0FDF4',
  warning: '#B45309',
  warningLight: '#FFFBEB',
  dangerLight: '#FEF2F2',
  infoLight: '#EFF6FF',

  // Keyboard accessibility - a visible focus ring on every interactive
  // element, not just a border-color change.
  focusRing: '#2563EB',
  focusRingWidth: 2,

  // Reserved slot for a coat-of-arms/department emblem treatment
  // (GovernmentHeader's insignia badge) - blue/white, matching the one
  // shared palette rather than introducing a second accent for it.
  insignia: '#2563EB',
  insigniaAccent: '#1D4ED8',

  // Staff sidebar/top bar - dark shell, blue active state (unchanged from
  // this session's earlier PragatiMitra-sourced treatment).
  sidebarBg: '#0B1220',
  sidebarText: '#94A3B8',
  sidebarTextActive: '#FFFFFF',
  sidebarAccent: '#2563EB',
};
