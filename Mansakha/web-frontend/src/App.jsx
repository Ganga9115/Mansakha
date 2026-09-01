import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import RequireAuth from './shared/components/RequireAuth';
import { ToastProvider } from './shared/context/ToastContext';
import StaffLoginPage from './shared/pages/Login';

import CounsellorDashboard from './counsellor/pages/CounsellorDashboard';
import CaseQueue from './counsellor/pages/CaseQueue';
import MyUsers from './counsellor/pages/MyUsers';
import CounsellorCaseDetail from './counsellor/pages/CaseDetail';
import AlertsFeed from './counsellor/pages/AlertsFeed';
import CounsellorReports from './counsellor/pages/Reports';
import CounsellorSettings from './counsellor/pages/Settings';

import DistrictAdminDashboard from './district_admin/pages/AdminDashboard';
import DistrictCaseDetail from './district_admin/pages/CaseDetail';
import DistrictAdminAlerts from './district_admin/pages/AdminAlerts';
import UserRegistration from './district_admin/pages/UserRegistration';
import DistrictReports from './district_admin/pages/Reports';
import DistrictSettings from './district_admin/pages/Settings';

import StateDashboard from './state_admin/pages/StateDashboard';
import StateAdminDistrictDashboard from './state_admin/pages/AdminDashboard';
import StateCaseDetail from './state_admin/pages/CaseDetail';
import StateAnalysis from './state_admin/pages/Analysis';
import StateAdminAlerts from './state_admin/pages/AdminAlerts';
import StateReports from './state_admin/pages/Reports';
import StateSettings from './state_admin/pages/Settings';

import NationalDashboard from './national_admin/pages/NationalDashboard';
import NationalStateDashboard from './national_admin/pages/StateDashboard';
import NationalDistrictDashboard from './national_admin/pages/AdminDashboard';
import NationalCaseDetail from './national_admin/pages/CaseDetail';
import NationalAnalysis from './national_admin/pages/Analysis';
import NationalAdminAlerts from './national_admin/pages/AdminAlerts';
import NationalReports from './national_admin/pages/Reports';
import NationalSettings from './national_admin/pages/Settings';

import MinistryLoginPage from './ministry/pages/Login';
import MinistryDashboard from './ministry/pages/MinistryDashboard';
import StaffManagement from './ministry/pages/StaffManagement';
import CounsellorPerformance from './ministry/pages/CounsellorPerformance';
import SystemConfig from './ministry/pages/SystemConfig';
import AuditLog from './ministry/pages/AuditLog';
import Heatmap from './ministry/pages/Heatmap';
import ReportsInbox from './ministry/pages/ReportsInbox';
import EmergencyBroadcast from './ministry/pages/EmergencyBroadcast';
import MinistrySettings from './ministry/pages/Settings';

import DataIntakeDashboard from './dataoperator/pages/Dashboard';
import DataIntakeFetchCase from './dataoperator/pages/FetchCase';
import DataIntakeUsers from './dataoperator/pages/Users';
import DataIntakeSettings from './dataoperator/pages/Settings';

export default function App() {
  return (
    <Router>
      <ToastProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Shared login - real backend, roleName is Counsellor or
            Administration; Administration then routes to /districtadmin
            or /stateadmin based on the account's own jurisdiction level.
            The one deliberate exception to "every role gets its own copy" -
            see shared/pages/Login.jsx's own header comment. */}
        <Route path="/login" element={<StaffLoginPage />} />

        {/* Counsellor */}
        <Route path="/counsellor" element={<RequireAuth><CounsellorDashboard /></RequireAuth>} />
        <Route path="/counsellor/queue" element={<RequireAuth><CaseQueue /></RequireAuth>} />
        <Route path="/counsellor/my-users" element={<RequireAuth><MyUsers /></RequireAuth>} />
        <Route path="/counsellor/case-detail/:id" element={<RequireAuth><CounsellorCaseDetail /></RequireAuth>} />
        <Route path="/counsellor/alerts" element={<RequireAuth><AlertsFeed /></RequireAuth>} />
        <Route path="/counsellor/reports" element={<RequireAuth><CounsellorReports /></RequireAuth>} />
        <Route path="/counsellor/profile" element={<RequireAuth><CounsellorSettings /></RequireAuth>} />

        {/* District Admin - case-level dashboard is the default view;
            district admin has no sub-jurisdictions to break down. */}
        <Route path="/districtadmin" element={<RequireAuth><DistrictAdminDashboard /></RequireAuth>} />
        <Route path="/districtadmin/case-detail/:id" element={<RequireAuth><DistrictCaseDetail /></RequireAuth>} />
        <Route path="/districtadmin/alerts" element={<RequireAuth><DistrictAdminAlerts /></RequireAuth>} />
        <Route path="/districtadmin/registration" element={<RequireAuth><UserRegistration /></RequireAuth>} />
        <Route path="/districtadmin/reports" element={<RequireAuth><DistrictReports /></RequireAuth>} />
        <Route path="/districtadmin/profile" element={<RequireAuth><DistrictSettings /></RequireAuth>} />

        {/* State/UT Admin - aggregate (district-wise breakdown) is the
            default view; /district/:id is the drill-down into a specific
            district's own case-level dashboard, keeping the state sidebar. */}
        <Route path="/stateadmin" element={<RequireAuth><StateDashboard /></RequireAuth>} />
        <Route path="/stateadmin/district/:jurisdictionId" element={<RequireAuth><StateAdminDistrictDashboard /></RequireAuth>} />
        <Route path="/stateadmin/case-detail/:id" element={<RequireAuth><StateCaseDetail /></RequireAuth>} />
        <Route path="/stateadmin/analysis" element={<RequireAuth><StateAnalysis /></RequireAuth>} />
        <Route path="/stateadmin/alerts" element={<RequireAuth><StateAdminAlerts /></RequireAuth>} />
        <Route path="/stateadmin/reports" element={<RequireAuth><StateReports /></RequireAuth>} />
        <Route path="/stateadmin/profile" element={<RequireAuth><StateSettings /></RequireAuth>} />

        {/* National Admin - state-wise breakdown by default; drills into a
            state, then a district, then a case, each keeping the national
            sidebar. */}
        <Route path="/nationaladmin" element={<RequireAuth><NationalDashboard /></RequireAuth>} />
        <Route path="/nationaladmin/analysis" element={<RequireAuth><NationalAnalysis /></RequireAuth>} />
        <Route path="/nationaladmin/alerts" element={<RequireAuth><NationalAdminAlerts /></RequireAuth>} />
        <Route path="/nationaladmin/reports" element={<RequireAuth><NationalReports /></RequireAuth>} />
        <Route path="/nationaladmin/state/:jurisdictionId" element={<RequireAuth><NationalStateDashboard /></RequireAuth>} />
        <Route path="/nationaladmin/district/:jurisdictionId" element={<RequireAuth><NationalDistrictDashboard /></RequireAuth>} />
        <Route path="/nationaladmin/case-detail/:id" element={<RequireAuth><NationalCaseDetail /></RequireAuth>} />
        <Route path="/nationaladmin/profile" element={<RequireAuth><NationalSettings /></RequireAuth>} />

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
        <Route path="/ministry/profile" element={<RequireAuth loginPath="/ministry/login"><MinistrySettings /></RequireAuth>} />

        {/* Data Operator - signs in via the shared Staff Login (/login)
            alongside Counsellor/Administration, not a separate login page
            (that treatment is Ministry/Super Admin's alone). */}
        <Route path="/dataintake" element={<RequireAuth><DataIntakeDashboard /></RequireAuth>} />
        <Route path="/dataintake/fetch-case" element={<RequireAuth><DataIntakeFetchCase /></RequireAuth>} />
        <Route path="/dataintake/users" element={<RequireAuth><DataIntakeUsers /></RequireAuth>} />
        <Route path="/dataintake/profile" element={<RequireAuth><DataIntakeSettings /></RequireAuth>} />
      </Routes>
      </ToastProvider>
    </Router>
  );
}
