import React, { useState } from 'react';
import MailShell from '../components/MailShell';
import MailThreadList from '../components/MailThreadList';
import { useMailSent } from '../services/hooks';

export default function MailSent() {
  const [q, setQ] = useState('');
  const { data, loading, refetch } = useMailSent(q || undefined);

  return (
    <MailShell basePath="/dataoperator/mail" title="Sent Mail" onComposed={refetch}>
      <MailThreadList
        threads={data?.threads || []}
        loading={loading}
        q={q}
        onSearchChange={setQ}
        basePath="/dataoperator/mail"
        folder="sent"
        onActionDone={refetch}
        emptyLabel="You haven't sent anything yet."
      />
    </MailShell>
  );
}
