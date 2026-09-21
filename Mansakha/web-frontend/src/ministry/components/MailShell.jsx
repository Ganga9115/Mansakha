import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { PenSquare, Inbox as InboxIcon, Send as SendIcon, Archive as ArchiveIcon } from 'lucide-react';
import MinistryLayout from '../layouts/MinistryLayout';
import MailComposeModal from './MailComposeModal';
import { useMailUnreadCount } from '../services/hooks';

// Gmail's own left rail, scoped to just the Mail section - the app's real
// sidebar (MinistryLayout) already covers Dashboard/Staff Management/etc, so
// this is a second, narrower rail that only exists while inside Mail: a
// prominent Compose pill above Inbox/Sent/Archived, exactly like Gmail nests
// its account-level nav (left) inside the browser/app chrome (further left).
// Ministry's own copy of Counsellor's MailShell - wraps MinistryLayout
// instead of StaffLayout, since Ministry's shell has its own name/console
// framing rather than the Administration/Counsellor shared StaffLayout shape.
const FOLDERS = [
  { key: 'inbox', label: 'Inbox', icon: InboxIcon, suffix: '' },
  { key: 'sent', label: 'Sent', icon: SendIcon, suffix: '/sent' },
  { key: 'archived', label: 'Archived', icon: ArchiveIcon, suffix: '/archived' },
];

export default function MailShell({ basePath, title = 'Mail', headerAction, children, onComposed }) {
  const [composing, setComposing] = useState(false);
  const { data: unread, refetch: refetchUnread } = useMailUnreadCount();

  return (
    <MinistryLayout title={title} headerAction={headerAction}>
      <div className="flex gap-5 h-[calc(100vh-8rem)]">
        <aside className="w-52 shrink-0 flex flex-col gap-5">
          <button
            onClick={() => setComposing(true)}
            className="flex items-center gap-2 pl-4 pr-5 py-3 rounded-full bg-brand-900 text-white text-sm font-semibold shadow-sm hover:shadow-md hover:bg-brand-900 transition w-fit"
          >
            <PenSquare size={16} /> Compose
          </button>

          <nav className="space-y-1">
            {FOLDERS.map((f) => {
              const Icon = f.icon;
              return (
                <NavLink
                  key={f.key}
                  to={`${basePath}${f.suffix}`}
                  end
                  className={({ isActive }) =>
                    `flex items-center gap-3 pl-4 pr-3 py-2 rounded-r-full text-sm transition ${
                      isActive ? 'bg-brand-100 text-brand-900 font-bold' : 'text-gray-600 hover:bg-gray-100 font-medium'
                    }`
                  }
                >
                  <Icon size={16} />
                  <span className="flex-1">{f.label}</span>
                  {f.key === 'inbox' && unread?.count > 0 && (
                    <span className="text-xs font-bold text-brand-900">{unread.count}</span>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 min-w-0">{children}</div>
      </div>

      {composing && (
        <MailComposeModal
          onClose={() => setComposing(false)}
          onSent={() => { setComposing(false); refetchUnread(); onComposed?.(); }}
        />
      )}
    </MinistryLayout>
  );
}
