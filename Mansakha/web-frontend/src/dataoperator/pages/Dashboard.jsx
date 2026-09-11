import React from 'react';
import { useLocation } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import UserRegistrationForm from '../components/UserRegistrationForm';
import { useCreateUserDataOperator } from '../services/hooks';

// Data Operator - not jurisdiction-locked the way District Admin's own User
// Registration is, so this reuses its own copy of the form with open
// State/District dropdowns.
export default function Dashboard() {
  const createUser = useCreateUserDataOperator();
  // FetchCase.jsx's "Use These Details" hands a simulated-fixture result
  // here via router state, so a fetched (fake, clearly-labeled) case can be
  // reviewed/edited and turned into a real user without retyping everything.
  const { state } = useLocation();
  const prefill = state?.prefill || null;

  return (
    <StaffLayout title="Register User">
      <div>
        <UserRegistrationForm onCreate={createUser.mutate} creating={createUser.loading} initialValues={prefill} />
      </div>
    </StaffLayout>
  );
}
