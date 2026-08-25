// Flat/near-zero elevation throughout - institutional surfaces are
// distinguished by a 1px border (theme/colors.js's `border`), not
// shadow depth. Kept as named presets (rather than removing the concept
// entirely) so call sites don't need touching, but every preset now
// resolves to at most a hairline shadow.
export const shadow = {
  none: {},
  card: {
    shadowColor: '#0F172A', shadowOpacity: 0.02, shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 }, elevation: 0,
  },
  pop: {
    shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  modal: {
    shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
};
