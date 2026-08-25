// Page-level layout system - previously every screen picked its own
// `padding: spacing.lg` with no defined content-width, so a wide browser
// window stretched cards/lists edge-to-edge (reads as unstructured
// regardless of what's inside). One content-width scale + section rhythm
// used by ScreenContainer/Section/StatGrid instead.
export const layout = {
  contentMaxWidth: 1120,
  padding: { narrow: 20, tablet: 32, wide: 48 },
  breakpoint: { tablet: 640, wide: 1024 },
  sectionGap: 40,
  sectionHeaderGap: 14,
};

export function responsivePadding(width) {
  if (width >= layout.breakpoint.wide) return layout.padding.wide;
  if (width >= layout.breakpoint.tablet) return layout.padding.tablet;
  return layout.padding.narrow;
}
