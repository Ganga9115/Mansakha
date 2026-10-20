import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import './SidebarGlideNav.css';

// Same gliding-pill mechanism as GlideSelect.jsx (a single absolutely
// positioned pill, translateY'd via CSS transition to whichever row is
// active) applied to a vertical sidebar nav list instead of a dropdown
// menu - replaces the static Tailwind class-swap every role's own
// StaffLayout.jsx used to do on its <nav>. `items`: the existing NAV_ITEMS
// shape ({name, icon: LucideComponent, path}), plus an optional numeric
// `badge` (4 of the 12 layouts show an unread-mail count on their Mail
// item - rendered here only when > 0, same as each layout's own previous
// inline JSX did). Row height/gap are fixed pixel values (not measured),
// so every layout using this component renders identically regardless of
// subtle font-metric differences.
const ROW_HEIGHT = 44;
const ROW_GAP = 8;
const STEP = ROW_HEIGHT + ROW_GAP;

export default function SidebarGlideNav({ items, activeName, onItemClick, pillColor = '#ffffff', activeTextColor = '#1a1d45', inactiveTextColor = '#e2e3f4', hoverBg = 'rgba(255, 255, 255, 0.1)' }) {
  const pillRef = useRef(null);
  const activeIndex = items.findIndex(item => item.name === activeName);

  useLayoutEffect(() => {
    const p = pillRef.current;
    if (!p) return;
    if (activeIndex < 0) {
      p.style.opacity = '0';
      return;
    }
    p.style.transform = `translateY(${activeIndex * STEP}px)`;
    p.style.opacity = '1';
  }, [activeIndex]);

  return (
    <nav
      className="sidebar-glide-nav"
      style={{
        '--sgn-row': `${ROW_HEIGHT}px`,
        '--sgn-gap': `${ROW_GAP}px`,
        '--sgn-pill': pillColor,
        '--sgn-active-text': activeTextColor,
        '--sgn-inactive-text': inactiveTextColor,
        '--sgn-hover-bg': hoverBg,
      }}
    >
      <span ref={pillRef} className="sidebar-glide-nav__pill" aria-hidden="true" />
      {items.map((item, i) => {
        const Icon = item.icon;
        const isActive = i === activeIndex;
        return (
          <Link
            key={item.name}
            to={item.path}
            onClick={onItemClick}
            className={`sidebar-glide-nav__item${isActive ? ' sidebar-glide-nav__item--active' : ''}`}
          >
            <Icon size={18} />
            <span className="sidebar-glide-nav__label">{item.name}</span>
            {item.badge > 0 && <span className="sidebar-glide-nav__badge">{item.badge > 99 ? '99+' : item.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
