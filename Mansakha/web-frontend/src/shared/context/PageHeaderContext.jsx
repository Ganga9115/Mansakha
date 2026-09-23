import React, { createContext, useContext, useState, useLayoutEffect } from 'react';

// Lets a persistent StaffLayout/MinistryLayout (now mounted once per role,
// rendering <Outlet/>, instead of once per page) still show a per-page
// title/headerAction/fullBleedContent - the same 3 things every layout used
// to receive as plain props from whichever page wrapped itself in it. Now
// the page is a CHILD of the layout (via the route tree), not its caller,
// so it can't hand props down the normal way - it registers them here
// instead, and the layout reads them back out. Modeled on ToastContext.jsx's
// shape (one provider mounted once in App.jsx, one useX() hook per side),
// except this one needs real state since, unlike toast() calls, the value
// has to persist and be read continuously by the layout, not just fired
// once.
const PageHeaderContext = createContext(null);

const DEFAULT_HEADER = { title: '', headerAction: null, fullBleedContent: false };

export function PageHeaderProvider({ children }) {
  const [header, setHeader] = useState(DEFAULT_HEADER);
  return (
    <PageHeaderContext.Provider value={{ header, setHeader }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

function useContextOrThrow() {
  const ctx = useContext(PageHeaderContext);
  if (!ctx) throw new Error('Must be used within PageHeaderProvider');
  return ctx;
}

// Called by each role's StaffLayout/MinistryLayout to read the current
// page's declared header config.
export function usePageHeaderValue() {
  return useContextOrThrow().header;
}

// Called by each PAGE (once, at the top of its component) to declare its
// own title/headerAction/fullBleedContent - same 3 fields every layout used
// to take as props, same defaults. useLayoutEffect (not useEffect) so the
// header updates before paint - otherwise navigating to a new page would
// briefly flash the previous page's title/header for one frame.
export function usePageHeader({ title = '', headerAction = null, fullBleedContent = false } = {}) {
  const { setHeader } = useContextOrThrow();
  useLayoutEffect(() => {
    setHeader({ title, headerAction, fullBleedContent });
  }, [title, headerAction, fullBleedContent, setHeader]);
}
