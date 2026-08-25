import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

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
        <Route path="/" element={<Navigate to="/staff/login" replace />} />

        {/* Staff (Counsellor + Administration) */}
        <Route path="/staff/login" element={<StaffLoginPage />} />
        <Route path="/staff/counsellor" element={<CounsellorDashboard />} />
        <Route path="/staff/counsellor/case-queue" element={<CaseQueue />} />
        <Route path="/staff/counsellor/case-detail/:id?" element={<CaseDetail />} />
        <Route path="/staff/counsellor/interventions" element={<LogIntervention />} />
        <Route path="/staff/counsellor/alerts" element={<AlertsFeed />} />
        <Route path="/staff/administration" element={<AdminDashboard />} />
        <Route path="/staff/administration/case-detail/:id?" element={<CaseDetail />} />
        <Route path="/staff/administration/workload" element={<Workload />} />
        <Route path="/staff/administration/alerts" element={<AdminAlerts />} />
        <Route path="/staff/reports" element={<StaffReports />} />
        <Route path="/staff/settings" element={<StaffSettings />} />

        {/* Ministry */}
        <Route path="/ministry/login" element={<MinistryLoginPage />} />
        <Route path="/ministry/staff-management" element={<StaffManagement />} />
        <Route path="/ministry/system-config" element={<SystemConfig />} />
        <Route path="/ministry/audit-log" element={<AuditLog />} />
      </Routes>
    </Router>
  );
}
