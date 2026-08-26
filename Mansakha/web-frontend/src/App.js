import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import RequireAuth from './components/RequireAuth';

import StaffLoginPage from './pages/staff/Login';
import CounsellorDashboard from './pages/staff/counsellor/CounsellorDashboard';
import CaseQueue from './pages/staff/counsellor/CaseQueue';
import CaseDetail from './pages/staff/counsellor/CaseDetail';
import LogIntervention from './pages/staff/counsellor/LogIntervention';
import AlertsFeed from './pages/staff/counsellor/AlertsFeed';
import AdminDashboard from './pages/staff/administration/AdminDashboard';
import Workload from './pages/staff/administration/Workload';
import AdminAlerts from './pages/staff/administration/AdminAlerts';
import StaffReports from './pages/staff/shared/Reports';
import StaffSettings from './pages/staff/shared/Settings';

import MinistryLoginPage from './pages/ministry/Login';
import StaffManagement from './pages/ministry/StaffManagement';
import SystemConfig from './pages/ministry/SystemConfig';
import AuditLog from './pages/ministry/AuditLog';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Shared login - real backend, roleName is Counsellor or
            Administration; Administration then routes to /districtadmin
            or /stateadmin based on the account's own jurisdiction level. */}
        <Route path="/login" element={<StaffLoginPage />} />

        {/* Counsellor - Reports/Profile are role-prefixed like everything
            else now, so which role's shell to show never has to be guessed
            from a shared, prefix-less route. */}
        <Route path="/counsellor" element={<RequireAuth><CounsellorDashboard /></RequireAuth>} />
        <Route path="/counsellor/case-queue" element={<RequireAuth><CaseQueue /></RequireAuth>} />
        <Route path="/counsellor/case-detail/:id" element={<RequireAuth><CaseDetail /></RequireAuth>} />
        <Route path="/counsellor/interventions" element={<RequireAuth><LogIntervention /></RequireAuth>} />
        <Route path="/counsellor/alerts" element={<RequireAuth><AlertsFeed /></RequireAuth>} />
        <Route path="/counsellor/reports" element={<RequireAuth><StaffReports /></RequireAuth>} />
        <Route path="/counsellor/profile" element={<RequireAuth><StaffSettings /></RequireAuth>} />

        {/* District Admin / State Admin - same components as before ("Coming
            soon" stubs), reached via jurisdiction-specific URLs instead of
            one shared /administration. */}
        <Route path="/districtadmin" element={<RequireAuth><AdminDashboard /></RequireAuth>} />
        <Route path="/districtadmin/case-detail/:id" element={<RequireAuth><CaseDetail /></RequireAuth>} />
        <Route path="/districtadmin/workload" element={<RequireAuth><Workload /></RequireAuth>} />
        <Route path="/districtadmin/alerts" element={<RequireAuth><AdminAlerts /></RequireAuth>} />
        <Route path="/districtadmin/reports" element={<RequireAuth><StaffReports /></RequireAuth>} />
        <Route path="/districtadmin/profile" element={<RequireAuth><StaffSettings /></RequireAuth>} />

        <Route path="/stateadmin" element={<RequireAuth><AdminDashboard /></RequireAuth>} />
        <Route path="/stateadmin/case-detail/:id" element={<RequireAuth><CaseDetail /></RequireAuth>} />
        <Route path="/stateadmin/workload" element={<RequireAuth><Workload /></RequireAuth>} />
        <Route path="/stateadmin/alerts" element={<RequireAuth><AdminAlerts /></RequireAuth>} />
        <Route path="/stateadmin/reports" element={<RequireAuth><StaffReports /></RequireAuth>} />
        <Route path="/stateadmin/profile" element={<RequireAuth><StaffSettings /></RequireAuth>} />

        {/* Ministry (unchanged stubs, out of this branch's scope) */}
        <Route path="/ministry/login" element={<MinistryLoginPage />} />
        <Route path="/ministry/staff-management" element={<StaffManagement />} />
        <Route path="/ministry/system-config" element={<SystemConfig />} />
        <Route path="/ministry/audit-log" element={<AuditLog />} />
      </Routes>
    </Router>
  );
}
