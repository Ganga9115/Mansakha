// Typography scale - previously every screen picked its own font sizes ad hoc
// (13/14/15/16/18/20/22/28/32 scattered with no relationship between them).
// One shared scale so headings/body/labels are consistent app-wide.
export const typography = {
  display: { fontSize: 32, fontWeight: '800', lineHeight: 38 },
  h1: { fontSize: 24, fontWeight: '700', lineHeight: 30 },
  h2: { fontSize: 20, fontWeight: '700', lineHeight: 26 },
  h3: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 21 },
  bodyStrong: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  bodySmall: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '600', lineHeight: 16, letterSpacing: 0.3 },
  caption: { fontSize: 11, fontWeight: '500', lineHeight: 14 },
};
