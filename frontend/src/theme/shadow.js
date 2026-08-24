// Each preset carries both the iOS shadow* keys and Android's `elevation` -
// RN needs both to render consistently cross-platform (elevation alone
// ignores shadowColor/opacity on iOS; the shadow* keys alone do nothing on
// Android).
export const shadow = {
  none: {},
  card: {
    shadowColor: '#0B2439', shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  pop: {
    shadowColor: '#0B2439', shadowOpacity: 0.1, shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 }, elevation: 5,
  },
  modal: {
    shadowColor: '#0B2439', shadowOpacity: 0.18, shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 }, elevation: 10,
  },
};
