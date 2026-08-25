// Typography scale, on Public Sans (US federal government's own typeface -
// loaded via @expo-google-fonts/public-sans, gated by useFonts() in
// App.js) instead of the system default, for stronger institutional
// signaling and strict data-table/telemetry legibility. No italic
// anywhere in this scale - institutional copy stays upright throughout.
const FAMILY = {
  regular: 'PublicSans_400Regular',
  medium: 'PublicSans_500Medium',
  semiBold: 'PublicSans_600SemiBold',
  bold: 'PublicSans_700Bold',
};

export const typography = {
  display: { fontFamily: FAMILY.bold, fontSize: 32, lineHeight: 38, letterSpacing: 0 },
  h1: { fontFamily: FAMILY.bold, fontSize: 24, lineHeight: 30, letterSpacing: 0 },
  h2: { fontFamily: FAMILY.semiBold, fontSize: 20, lineHeight: 26, letterSpacing: 0 },
  h3: { fontFamily: FAMILY.semiBold, fontSize: 17, lineHeight: 22, letterSpacing: 0 },
  body: { fontFamily: FAMILY.regular, fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  bodyStrong: { fontFamily: FAMILY.semiBold, fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  bodySmall: { fontFamily: FAMILY.regular, fontSize: 13, lineHeight: 19, letterSpacing: 0 },
  label: { fontFamily: FAMILY.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.4, textTransform: 'uppercase' },
  caption: { fontFamily: FAMILY.medium, fontSize: 11, lineHeight: 15, letterSpacing: 0 },
};
