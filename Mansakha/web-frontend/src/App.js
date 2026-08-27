import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import RequireAuth from './components/RequireAuth';
import { ToastProvider } from './context/ToastContext';

import StaffLoginPage from './pages/staff/Login';
import CounsellorDashboard from './pages/staff/counsellor/CounsellorDashboard';
import CaseQueue from './pages/staff/counsellor/CaseQueue';
import CaseDetail from './pages/staff/counsellor/CaseDetail';
import LogIntervention from './pages/staff/counsellor/LogIntervention';
import AlertsFeed from './pages/staff/counsellor/AlertsFeed';
import AdminDashboard from './pages/staff/administration/AdminDashboard';
import StateDashboard from './pages/staff/administration/StateDashboard';
import NationalDashboard from './pages/staff/administration/NationalDashboard';
import AdminAlerts from './pages/staff/administration/AdminAlerts';
import VictimRegistration from './pages/staff/administration/VictimRegistration';
import StaffReports from './pages/staff/shared/Reports';
import Graphs from './pages/staff/shared/Graphs';
import StaffSettings from './pages/staff/shared/Settings';

import MinistryLayout from './layouts/MinistryLayout';
import MinistryLoginPage from './pages/ministry/Login';
import StaffManagement from './pages/ministry/StaffManagement';
import CounsellorPerformance from './pages/ministry/CounsellorPerformance';
import SystemConfig from './pages/ministry/SystemConfig';
import AuditLog from './pages/ministry/AuditLog';
import MinistryDashboard from './pages/ministry/MinistryDashboard';
import Heatmap from './pages/ministry/Heatmap';
import ReportsInbox from './pages/ministry/ReportsInbox';
import EmergencyBroadcast from './pages/ministry/EmergencyBroadcast';

import DataIntakeDashboard from './pages/dataintake/Dashboard';
import DataIntakeFetchCase from './pages/dataintake/FetchCase';
import DataIntakeVictims from './pages/dataintake/Victims';

export default function App() {
  return (
    <Router>
      <ToastProvider>
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

        {/* District Admin - case-level dashboard is the default view;
            Register Victim is District-only per the Feature Catalog. */}
        <Route path="/districtadmin" element={<RequireAuth><AdminDashboard /></RequireAuth>} />
        <Route path="/districtadmin/case-detail/:id" element={<RequireAuth><CaseDetail /></RequireAuth>} />
        <Route path="/districtadmin/register-victim" element={<RequireAuth><VictimRegistration /></RequireAuth>} />
        <Route path="/districtadmin/alerts" element={<RequireAuth><AdminAlerts /></RequireAuth>} />
        <Route path="/districtadmin/reports" element={<RequireAuth><StaffReports /></RequireAuth>} />
        <Route path="/districtadmin/profile" element={<RequireAuth><StaffSettings /></RequireAuth>} />

        {/* State/UT Admin - aggregate (district-wise breakdown) is the
            default view; /district/:id is the drill-down into a specific
            district's case-level AdminDashboard, keeping the state sidebar. */}
        <Route path="/stateadmin" element={<RequireAuth><StateDashboard /></RequireAuth>} />
        <Route path="/stateadmin/district/:jurisdictionId" element={<RequireAuth><AdminDashboard /></RequireAuth>} />
        <Route path="/stateadmin/case-detail/:id" element={<RequireAuth><CaseDetail /></RequireAuth>} />
        <Route path="/stateadmin/graphs" element={<RequireAuth><Graphs /></RequireAuth>} />
        <Route path="/stateadmin/alerts" element={<RequireAuth><AdminAlerts /></RequireAuth>} />
        <Route path="/stateadmin/reports" element={<RequireAuth><StaffReports /></RequireAuth>} />
        <Route path="/stateadmin/profile" element={<RequireAuth><StaffSettings /></RequireAuth>} />

        {/* National Admin - state-wise breakdown by default; drills into a
            state (StateDashboard), then a district (AdminDashboard), then a
            case (CaseDetail), each keeping the national sidebar. */}
        <Route path="/nationaladmin" element={<RequireAuth><NationalDashboard /></RequireAuth>} />
        <Route path="/nationaladmin/graphs" element={<RequireAuth><Graphs /></RequireAuth>} />
        <Route path="/nationaladmin/state/:jurisdictionId" element={<RequireAuth><StateDashboard /></RequireAuth>} />
        <Route path="/nationaladmin/district/:jurisdictionId" element={<RequireAuth><AdminDashboard /></RequireAuth>} />
        <Route path="/nationaladmin/case-detail/:id" element={<RequireAuth><CaseDetail /></RequireAuth>} />
        <Route path="/nationaladmin/profile" element={<RequireAuth><StaffSettings /></RequireAuth>} />

        {/* Ministry */}
        <Route path="/ministry/login" element={<MinistryLoginPage />} />
        <Route path="/ministry/dashboard" element={<RequireAuth loginPath="/ministry/login"><MinistryDashboard /></RequireAuth>} />
        <Route path="/ministry/staff-management" element={<RequireAuth loginPath="/ministry/login"><StaffManagement /></RequireAuth>} />
        <Route path="/ministry/performance" element={<RequireAuth loginPath="/ministry/login"><CounsellorPerformance /></RequireAuth>} />
        <Route path="/ministry/system-config" element={<RequireAuth loginPath="/ministry/login"><SystemConfig /></RequireAuth>} />
        <Route path="/ministry/audit-log" element={<RequireAuth loginPath="/ministry/login"><AuditLog /></RequireAuth>} />
        <Route path="/ministry/heatmap" element={<RequireAuth loginPath="/ministry/login"><Heatmap /></RequireAuth>} />
        <Route path="/ministry/reports" element={<RequireAuth loginPath="/ministry/login"><ReportsInbox /></RequireAuth>} />
        <Route path="/ministry/broadcast" element={<RequireAuth loginPath="/ministry/login"><EmergencyBroadcast /></RequireAuth>} />
        <Route path="/ministry/profile" element={<RequireAuth loginPath="/ministry/login"><StaffSettings Layout={MinistryLayout} /></RequireAuth>} />

        {/* Data Operator - signs in via the shared Staff
            Login (/login) alongside Counsellor/Administration, not a
            separate login page (that treatment is Ministry/Super Admin's
            alone). */}
        <Route path="/dataintake" element={<RequireAuth><DataIntakeDashboard /></RequireAuth>} />
        <Route path="/dataintake/fetch-case" element={<RequireAuth><DataIntakeFetchCase /></RequireAuth>} />
        <Route path="/dataintake/victims" element={<RequireAuth><DataIntakeVictims /></RequireAuth>} />
        <Route path="/dataintake/profile" element={<RequireAuth><StaffSettings /></RequireAuth>} />
      </Routes>
      </ToastProvider>
    </Router>
  );
}
