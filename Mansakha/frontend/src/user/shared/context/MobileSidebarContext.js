import React, { createContext, useContext, useMemo, useState } from 'react';

// Open/closed state for the mobile/tablet hamburger menu (MobileSidebarOverlay
// in shared/components). A plain Context rather than threading props, since
// the trigger (MenuButton, in each tab-root screen's header) and the panel
// itself (mounted once, as a sibling of the bottom-tab navigator in
// UserShell.js) sit far apart in the tree with plain screens in between.
const MobileSidebarContext = createContext({
  isOpen: false,
  open: () => {},
  close: () => {},
});

export function MobileSidebarProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const value = useMemo(
    () => ({
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    }),
    [isOpen]
  );

  return <MobileSidebarContext.Provider value={value}>{children}</MobileSidebarContext.Provider>;
}

export function useMobileSidebar() {
  return useContext(MobileSidebarContext);
}
