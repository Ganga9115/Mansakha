import React, { createContext, useContext } from 'react';

// The logged-in official's own role/jurisdiction, resolved once via GET /api/me in
// RootNavigator and provided here so screens don't each re-fetch it. Drill-down
// navigation (e.g. a State Admin viewing a specific child district) passes a
// DIFFERENT target jurisdictionId via route params instead - this context is only
// "my own scope," not "whatever I'm currently looking at."
const StaffScopeContext = createContext(null);

export function StaffScopeProvider({ value, children }) {
  return <StaffScopeContext.Provider value={value}>{children}</StaffScopeContext.Provider>;
}

export function useStaffScope() {
  const ctx = useContext(StaffScopeContext);
  if (!ctx) throw new Error('useStaffScope must be used within StaffScopeProvider');
  return ctx;
}
