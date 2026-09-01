import React from 'react';
import StaffLayout from '../layouts/StaffLayout';
import UserRegistrationForm from '../components/UserRegistrationForm';
import { useCreateUserDataIntake } from '../services/hooks';

// Data Operator - not jurisdiction-locked the way District Admin's own User
// Registration is, so this reuses its own copy of the form with open
// State/District dropdowns.
export default function Dashboard() {
  const createUser = useCreateUserDataIntake();

  return (
    <StaffLayout title="Register User">
      <div className="max-w-xl mx-auto">
        <UserRegistrationForm onCreate={createUser.mutate} creating={createUser.loading} />
      </div>
    </StaffLayout>
  );
}
