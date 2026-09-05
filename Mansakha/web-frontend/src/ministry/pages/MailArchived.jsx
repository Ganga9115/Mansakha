import React, { useState } from 'react';
import MailShell from '../components/MailShell';
import MailThreadList from '../components/MailThreadList';
import { useMailArchived } from '../services/hooks';

export default function MailArchived() {
  const [q, setQ] = useState('');
  const { data, loading, refetch } = useMailArchived(q || undefined);

  return (
    <MailShell basePath="/ministry/mail" title="Archived Mail" onComposed={refetch}>
      <MailThreadList
        threads={data?.threads || []}
        loading={loading}
        q={q}
        onSearchChange={setQ}
        basePath="/ministry/mail"
        folder="archived"
        onActionDone={refetch}
        emptyLabel="No archived mail."
      />
    </MailShell>
  );
}
