const FAMILY = {
  regular: 'PublicSans_400Regular',
  medium: 'PublicSans_500Medium',
  semiBold: 'PublicSans_600SemiBold',
  bold: 'PublicSans_700Bold',
};

export const typography = {
  display: { fontFamily: FAMILY.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.2 },
  h1: { fontFamily: FAMILY.bold, fontSize: 22, lineHeight: 28, letterSpacing: 0 },
  h2: { fontFamily: FAMILY.semiBold, fontSize: 18, lineHeight: 24, letterSpacing: 0 },
  h3: { fontFamily: FAMILY.semiBold, fontSize: 16, lineHeight: 22, letterSpacing: 0 },
  body: { fontFamily: FAMILY.regular, fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  bodyStrong: { fontFamily: FAMILY.semiBold, fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  bodySmall: { fontFamily: FAMILY.regular, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  label: { fontFamily: FAMILY.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.5, textTransform: 'uppercase' },
  caption: { fontFamily: FAMILY.medium, fontSize: 11, lineHeight: 15, letterSpacing: 0 },
};