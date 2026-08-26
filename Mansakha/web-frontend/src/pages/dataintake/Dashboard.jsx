import React from 'react';
import StaffLayout from '../../layouts/StaffLayout';
import VictimRegistrationForm from '../../components/VictimRegistrationForm';
import { useCreateVictimDataIntake } from '../../services/hooks';

// Data Intake & Integration Admin - not jurisdiction-locked the way District
// Admin's own Victim Registration is, so this reuses the shared form with
// no locked jurisdiction (State/District are open dropdowns).
export default function DataIntakeDashboard() {
  const createVictim = useCreateVictimDataIntake();

  return (
    <StaffLayout title="Register Victim" section="dataintake">
      <div className="max-w-xl">
        <VictimRegistrationForm onCreate={createVictim.mutate} creating={createVictim.loading} />
      </div>
    </StaffLayout>
  );
}
