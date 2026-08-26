import { useWindowDimensions } from 'react-native';
import { breakpoints } from '../theme/layout';

// Purely width-driven (not Platform.OS-gated) so it resolves correctly on
// both native and web - a landscape tablet gets the tablet/desktop
// treatment same as a browser window of that width would.
export function useResponsive() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= breakpoints.desktop;
  const isTablet = !isDesktop && width >= breakpoints.tablet;
  const isMobile = !isDesktop && !isTablet;
  const tier = isDesktop ? 'desktop' : isTablet ? 'tablet' : 'mobile';
  return { width, tier, isMobile, isTablet, isDesktop };
}
