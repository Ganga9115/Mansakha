import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { PenSquare, Inbox as InboxIcon, Send as SendIcon, Archive as ArchiveIcon } from 'lucide-react';
import StaffLayout from '../layouts/StaffLayout';
import MailComposeModal from './MailComposeModal';
import { useMailUnreadCount } from '../services/hooks';

// Gmail's own left rail, scoped to just the Mail section - the app's real
// sidebar (StaffLayout) already covers Dashboard/My Users/etc, so this is a
// second, narrower rail that only exists while inside Mail: a prominent
// Compose pill above Inbox/Sent/Archived, exactly like Gmail nests its
// account-level nav (left) inside the browser/app chrome (further left).
const FOLDERS = [
  { key: 'inbox', label: 'Inbox', icon: InboxIcon, suffix: '' },
  { key: 'sent', label: 'Sent', icon: SendIcon, suffix: '/sent' },
  { key: 'archived', label: 'Archived', icon: ArchiveIcon, suffix: '/archived' },
];

export default function MailShell({ basePath, title = 'Mail', headerAction, children, onComposed }) {
  const [composing, setComposing] = useState(false);
  const { data: unread, refetch: refetchUnread } = useMailUnreadCount();

  return (
    <StaffLayout title={title} headerAction={headerAction}>
      <div className="flex flex-col md:flex-row gap-3 sm:gap-5 min-h-[calc(100vh-10rem)] md:h-[calc(100vh-8rem)]">
        <aside className="w-full md:w-52 shrink-0 flex flex-row md:flex-col items-center md:items-start justify-between md:justify-start gap-3 md:gap-5 pb-2 md:pb-0 border-b md:border-b-0 border-gray-100">
          <button
            onClick={() => setComposing(true)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-3 rounded-full bg-[#519BCE] text-white text-xs sm:text-sm font-semibold shadow-sm hover:shadow-md hover:bg-[#3d83b3] transition shrink-0"
          >
            <PenSquare size={15} /> Compose
          </button>

          <nav className="flex flex-row md:flex-col gap-1 overflow-x-auto w-full no-scrollbar">
            {FOLDERS.map((f) => {
              const Icon = f.icon;
              return (
                <NavLink
                  key={f.key}
                  to={`${basePath}${f.suffix}`}
                  end
                  className={({ isActive }) =>
                    `flex items-center gap-2 sm:gap-3 px-3 py-1.5 sm:py-2 rounded-full md:rounded-l-none md:rounded-r-full text-xs sm:text-sm transition shrink-0 md:shrink ${
                      isActive ? 'bg-[#D6E8F5] text-[#3D5A80] font-bold' : 'text-gray-600 hover:bg-gray-100 font-medium'
                    }`
                  }
                >
                  <Icon size={15} />
                  <span className="flex-1">{f.label}</span>
                  {f.key === 'inbox' && unread?.count > 0 && (
                    <span className="text-xs font-bold text-[#3D5A80] ml-1">{unread.count}</span>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 min-w-0 h-[calc(100vh-14rem)] md:h-auto">{children}</div>
      </div>

      {composing && (
        <MailComposeModal
          onClose={() => setComposing(false)}
          onSent={() => { setComposing(false); refetchUnread(); onComposed?.(); }}
        />
      )}
    </StaffLayout>
  );
}
