// Single source of truth for the mobile/tablet bottom-tab bar's icon +
// label per route name - shared by UserShell's TabNavigator (the real tab
// bar) and MobileSidebarOverlay (the hamburger menu's synthetic route list,
// since it isn't a descendant of the Tab.Navigator and can't read its
// screen options directly). Keeping both in one place means they can't
// silently drift apart.
export const TAB_ITEMS = [
  { name: 'home', title: 'Home', icon: 'home' },
  { name: 'checkin', title: 'Check-in', icon: 'mic' },
  { name: 'wellbeing', title: 'My well-being', icon: 'heart' },
  { name: 'history', title: 'History', icon: 'bar-chart-2' },
  { name: 'mycounsellor', title: 'My Counsellor', icon: 'message-square' },
  { name: 'settings', title: 'Profile', icon: 'user' },
];

export const TAB_ICONS = TAB_ITEMS.reduce((acc, item) => {
  acc[item.name] = item.icon;
  return acc;
}, {});
