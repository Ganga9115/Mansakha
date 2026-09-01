// Breakpoint/width tokens for the mobile + tablet + desktop responsive
// system. Single source of truth so every screen/component resolves the
// same tiers off the same numbers.

export const breakpoints = { tablet: 640, desktop: 1024 };

// Width of UserShell's "phone card" wrapper at the tablet tier only.
// Mobile has no wrapper (full width, native app behavior); desktop
// replaces the bottom tab bar with a permanent sidebar instead of using
// this wrapper at all.
export const tabletShellWidth = 720;

// Matches the Counsellor web app's sidebar (`w-64` = 256px).
export const sidebarWidth = 256;

// Height of the sidebar's own logo/app-name corner cell - matched to sit
// roughly level with each screen's own compact-at-desktop banner (which
// doubles as the desktop top bar) rather than a separate fixed-height bar.
export const topBarHeight = 64;

// "Dashboard-like" screen content (Home, Distress History): uses the
// full shell width at mobile/tablet and a generous-but-bounded reading
// width at desktop, so grids/charts get more room without sprawling
// edge-to-edge on an ultra-wide monitor.
export const dashboardContentWidth = { mobile: '100%', tablet: '100%', desktop: 1120 };

// "Form/list-like" screen content nested inside the shell (Settings,
// Support, Check-in, Check-in Confirmation) - capped even inside a wide
// shell so rows/forms never stretch into unreadably long lines.
export const formContentWidth = { mobile: '100%', tablet: 640, desktop: 680 };

// Pre-login screens (Login, Onboarding, Consent, Language Select,
// Signup Success): identical layout to phone, just capped and centered
// at larger tiers.
export const authContentWidth = { mobile: '100%', tablet: 440, desktop: 460 };
