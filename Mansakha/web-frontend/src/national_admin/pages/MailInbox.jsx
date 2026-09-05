import React, { useState } from 'react';
import MailShell from '../components/MailShell';
import MailThreadList from '../components/MailThreadList';
import { useMailInbox } from '../services/hooks';

export default function MailInbox() {
  const [q, setQ] = useState('');
  const { data, loading, refetch } = useMailInbox(q || undefined);

  return (
    <MailShell basePath="/nationaladmin/mail" title="Mail" onComposed={refetch}>
      <MailThreadList
        threads={data?.threads || []}
        loading={loading}
        q={q}
        onSearchChange={setQ}
        basePath="/nationaladmin/mail"
        folder="inbox"
        onActionDone={refetch}
        emptyLabel="Your inbox is empty."
      />
    </MailShell>
  );
}
