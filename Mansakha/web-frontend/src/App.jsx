import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import RequireAuth from './shared/components/RequireAuth';
import { ToastProvider } from './shared/context/ToastContext';
import StaffLoginPage from './shared/pages/Login';
import SignInPage from './shared/pages/SignIn';

import CounsellorDashboard from './counsellor/pages/CounsellorDashboard';
import MyUsers from './counsellor/pages/MyUsers';
import CounsellorCaseDetail from './counsellor/pages/CaseDetail';
import CounsellorCaseNotes from './counsellor/pages/CaseNotes';
import CounsellorCaseChat from './counsellor/pages/CaseChat';
import AlertsFeed from './counsellor/pages/AlertsFeed';
import CounsellorAnalysis from './counsellor/pages/Analysis';
import CounsellorSettings from './counsellor/pages/Settings';
import CounsellorMailInbox from './counsellor/pages/MailInbox';
import CounsellorMailSent from './counsellor/pages/MailSent';
import CounsellorMailArchived from './counsellor/pages/MailArchived';
import CounsellorMailThread from './counsellor/pages/MailThread';

import DistrictAdminDashboard from './district_admin/pages/AdminDashboard';
import DistrictAnalysis from './district_admin/pages/Analysis';
import DistrictCaseDetail from './district_admin/pages/CaseDetail';
import DistrictAdminAlerts from './district_admin/pages/AdminAlerts';
import UserRegistration from './district_admin/pages/UserRegistration';
import DistrictReports from './district_admin/pages/Reports';
import DistrictInterventionRequests from './district_admin/pages/InterventionRequests';
import DistrictAgencyCoordination from './district_admin/pages/AgencyCoordination';
import DistrictSettings from './district_admin/pages/Settings';
import DistrictMailInbox from './district_admin/pages/MailInbox';
import DistrictMailSent from './district_admin/pages/MailSent';
import DistrictMailArchived from './district_admin/pages/MailArchived';
import DistrictMailThread from './district_admin/pages/MailThread';

import StateDashboard from './state_admin/pages/StateDashboard';
import StateAdminDistrictDashboard from './state_admin/pages/AdminDashboard';
import StateCaseDetail from './state_admin/pages/CaseDetail';
import StateAnalysis from './state_admin/pages/Analysis';
import StateAdminAlerts from './state_admin/pages/AdminAlerts';
import StateReports from './state_admin/pages/Reports';
import StateSettings from './state_admin/pages/Settings';
import StateMailInbox from './state_admin/pages/MailInbox';
import StateMailSent from './state_admin/pages/MailSent';
import StateMailArchived from './state_admin/pages/MailArchived';
import StateMailThread from './state_admin/pages/MailThread';

import NationalDashboard from './national_admin/pages/NationalDashboard';
import NationalStateDashboard from './national_admin/pages/StateDashboard';
import NationalDistrictDashboard from './national_admin/pages/AdminDashboard';
import NationalCaseDetail from './national_admin/pages/CaseDetail';
import NationalAnalysis from './national_admin/pages/Analysis';
import NationalAdminAlerts from './national_admin/pages/AdminAlerts';
import NationalReports from './national_admin/pages/Reports';
import NationalSettings from './national_admin/pages/Settings';
import NationalMailInbox from './national_admin/pages/MailInbox';
import NationalMailSent from './national_admin/pages/MailSent';
import NationalMailArchived from './national_admin/pages/MailArchived';
import NationalMailThread from './national_admin/pages/MailThread';

import MinistryLoginPage from './ministry/pages/Login';
import MinistryDashboard from './ministry/pages/MinistryDashboard';
import StaffManagement from './ministry/pages/StaffManagement';
import CounsellorPerformance from './ministry/pages/CounsellorPerformance';
import SystemConfig from './ministry/pages/SystemConfig';
import AuditLog from './ministry/pages/AuditLog';
import Heatmap from './ministry/pages/Heatmap';
import ReportsInbox from './ministry/pages/ReportsInbox';
import MinistrySettings from './ministry/pages/Settings';
import MinistryMailInbox from './ministry/pages/MailInbox';
import MinistryMailSent from './ministry/pages/MailSent';
import MinistryMailArchived from './ministry/pages/MailArchived';
import MinistryMailThread from './ministry/pages/MailThread';

import DataOperatorDashboard from './dataoperator/pages/Dashboard';
import DataOperatorFetchCase from './dataoperator/pages/FetchCase';
import DataOperatorUsers from './dataoperator/pages/Users';
import DataOperatorLinkCases from './dataoperator/pages/LinkCases';
import DataOperatorSettings from './dataoperator/pages/Settings';
import DataOperatorMailInbox from './dataoperator/pages/MailInbox';
import DataOperatorMailSent from './dataoperator/pages/MailSent';
import DataOperatorMailArchived from './dataoperator/pages/MailArchived';
import DataOperatorMailThread from './dataoperator/pages/MailThread';

// New coordination roles (Sign In portal) - see shared/pages/SignIn.jsx and
// backend/src/core/routes/auth.signin.routes.js for the shared login this
// group of 7 signs in through.
import IoCaseQueue from './io/pages/CaseQueue';
import IoCaseDetail from './io/pages/CaseDetail';
import IoCaseLog from './io/pages/CaseLog';
import IoCaseTasks from './io/pages/CaseTasks';
import IoProfile from './io/pages/Profile';
import DwoReferralQueue from './dwo/pages/ReferralQueue';
import DwoReferralDetail from './dwo/pages/ReferralDetail';
import DwoReferralRelief from './dwo/pages/ReferralRelief';
import DwoReferralCompensation from './dwo/pages/ReferralCompensation';
import DwoReferralLog from './dwo/pages/ReferralLog';
import DwoReferralTasks from './dwo/pages/ReferralTasks';
import DwoInterventionRequests from './dwo/pages/InterventionRequests';
import DwoProfile from './dwo/pages/Profile';
import ProtectionOfficerRegistry from './protection_officer/pages/ProtectionRegistry';
import ProtectionOfficerReferralDetail from './protection_officer/pages/ReferralDetail';
import ProtectionOfficerInterventionRequests from './protection_officer/pages/InterventionRequests';
import ProtectionOfficerInterventionRequestDetail from './protection_officer/pages/InterventionRequestDetail';
import ProtectionOfficerProfile from './protection_officer/pages/Profile';
import DlsaLegalAidQueue from './dlsa/pages/LegalAidQueue';
import DlsaReferralDetail from './dlsa/pages/ReferralDetail';
import DlsaMyTasks from './dlsa/pages/MyTasks';
import DlsaInterventionRequests from './dlsa/pages/InterventionRequests';
import DlsaProfile from './dlsa/pages/Profile';
import DistrictCollectorCommitteeReview from './district_collector/pages/CommitteeReview';
import DistrictCollectorReviewDetail from './district_collector/pages/ReviewDetail';
import DistrictCollectorMyTasks from './district_collector/pages/MyTasks';
import DistrictCollectorProfile from './district_collector/pages/Profile';
import RehabilitationOfficerPlans from './rehabilitation_officer/pages/RehabilitationPlans';
import RehabilitationOfficerReferralDetail from './rehabilitation_officer/pages/ReferralDetail';
import RehabilitationOfficerMyTasks from './rehabilitation_officer/pages/MyTasks';
import RehabilitationOfficerProfile from './rehabilitation_officer/pages/Profile';

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
        <Route path="/counsellor/my-users" element={<RequireAuth><MyUsers /></RequireAuth>} />
        <Route path="/counsellor/case-detail/:id" element={<RequireAuth><CounsellorCaseDetail /></RequireAuth>} />
        <Route path="/counsellor/case-detail/:id/notes" element={<RequireAuth><CounsellorCaseNotes /></RequireAuth>} />
        <Route path="/counsellor/case-detail/:id/chat" element={<RequireAuth><CounsellorCaseChat /></RequireAuth>} />
        <Route path="/counsellor/alerts" element={<RequireAuth><AlertsFeed /></RequireAuth>} />
        <Route path="/counsellor/analysis" element={<RequireAuth><CounsellorAnalysis /></RequireAuth>} />
        <Route path="/counsellor/mail" element={<RequireAuth><CounsellorMailInbox /></RequireAuth>} />
        <Route path="/counsellor/mail/sent" element={<RequireAuth><CounsellorMailSent /></RequireAuth>} />
        <Route path="/counsellor/mail/archived" element={<RequireAuth><CounsellorMailArchived /></RequireAuth>} />
        <Route path="/counsellor/mail/thread/:threadId" element={<RequireAuth><CounsellorMailThread /></RequireAuth>} />
        <Route path="/counsellor/profile" element={<RequireAuth><CounsellorSettings /></RequireAuth>} />

        {/* District Admin - case-level dashboard is the default view;
            district admin has no sub-jurisdictions to break down. */}
        <Route path="/districtadmin" element={<RequireAuth><DistrictAdminDashboard /></RequireAuth>} />
        <Route path="/districtadmin/analysis" element={<RequireAuth><DistrictAnalysis /></RequireAuth>} />
        <Route path="/districtadmin/case-detail/:id" element={<RequireAuth><DistrictCaseDetail /></RequireAuth>} />
        <Route path="/districtadmin/alerts" element={<RequireAuth><DistrictAdminAlerts /></RequireAuth>} />
        <Route path="/districtadmin/intervention-requests" element={<RequireAuth><DistrictInterventionRequests /></RequireAuth>} />
        <Route path="/districtadmin/agency-coordination" element={<RequireAuth><DistrictAgencyCoordination /></RequireAuth>} />
        <Route path="/districtadmin/registration" element={<RequireAuth><UserRegistration /></RequireAuth>} />
        <Route path="/districtadmin/reports" element={<RequireAuth><DistrictReports /></RequireAuth>} />
        <Route path="/districtadmin/mail" element={<RequireAuth><DistrictMailInbox /></RequireAuth>} />
        <Route path="/districtadmin/mail/sent" element={<RequireAuth><DistrictMailSent /></RequireAuth>} />
        <Route path="/districtadmin/mail/archived" element={<RequireAuth><DistrictMailArchived /></RequireAuth>} />
        <Route path="/districtadmin/mail/thread/:threadId" element={<RequireAuth><DistrictMailThread /></RequireAuth>} />
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
        <Route path="/stateadmin/mail" element={<RequireAuth><StateMailInbox /></RequireAuth>} />
        <Route path="/stateadmin/mail/sent" element={<RequireAuth><StateMailSent /></RequireAuth>} />
        <Route path="/stateadmin/mail/archived" element={<RequireAuth><StateMailArchived /></RequireAuth>} />
        <Route path="/stateadmin/mail/thread/:threadId" element={<RequireAuth><StateMailThread /></RequireAuth>} />
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
        <Route path="/nationaladmin/mail" element={<RequireAuth><NationalMailInbox /></RequireAuth>} />
        <Route path="/nationaladmin/mail/sent" element={<RequireAuth><NationalMailSent /></RequireAuth>} />
        <Route path="/nationaladmin/mail/archived" element={<RequireAuth><NationalMailArchived /></RequireAuth>} />
        <Route path="/nationaladmin/mail/thread/:threadId" element={<RequireAuth><NationalMailThread /></RequireAuth>} />
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
        <Route path="/ministry/mail" element={<RequireAuth loginPath="/ministry/login"><MinistryMailInbox /></RequireAuth>} />
        <Route path="/ministry/mail/sent" element={<RequireAuth loginPath="/ministry/login"><MinistryMailSent /></RequireAuth>} />
        <Route path="/ministry/mail/archived" element={<RequireAuth loginPath="/ministry/login"><MinistryMailArchived /></RequireAuth>} />
        <Route path="/ministry/mail/thread/:threadId" element={<RequireAuth loginPath="/ministry/login"><MinistryMailThread /></RequireAuth>} />
        <Route path="/ministry/profile" element={<RequireAuth loginPath="/ministry/login"><MinistrySettings /></RequireAuth>} />

        {/* Data Operator - signs in via the shared Staff Login (/login)
            alongside Counsellor/Administration, not a separate login page
            (that treatment is Ministry/Super Admin's alone). */}
        <Route path="/dataoperator" element={<RequireAuth><DataOperatorDashboard /></RequireAuth>} />
        <Route path="/dataoperator/fetch-case" element={<RequireAuth><DataOperatorFetchCase /></RequireAuth>} />
        <Route path="/dataoperator/users" element={<RequireAuth><DataOperatorUsers /></RequireAuth>} />
        <Route path="/dataoperator/link-cases" element={<RequireAuth><DataOperatorLinkCases /></RequireAuth>} />
        <Route path="/dataoperator/mail" element={<RequireAuth><DataOperatorMailInbox /></RequireAuth>} />
        <Route path="/dataoperator/mail/sent" element={<RequireAuth><DataOperatorMailSent /></RequireAuth>} />
        <Route path="/dataoperator/mail/archived" element={<RequireAuth><DataOperatorMailArchived /></RequireAuth>} />
        <Route path="/dataoperator/mail/thread/:threadId" element={<RequireAuth><DataOperatorMailThread /></RequireAuth>} />
        <Route path="/dataoperator/profile" element={<RequireAuth><DataOperatorSettings /></RequireAuth>} />

        {/* Signin - the second shared pre-role login (see SignIn.jsx's own
            header comment), for the 7 new coordination roles. Each portal
            below wraps in RequireAuth loginPath="/signin" - same pattern as
            Ministry's own loginPath="/ministry/login". */}
        <Route path="/signin" element={<SignInPage />} />

        <Route path="/io" element={<RequireAuth loginPath="/signin"><IoCaseQueue /></RequireAuth>} />
        <Route path="/io/cases/:userId" element={<RequireAuth loginPath="/signin"><IoCaseDetail /></RequireAuth>} />
        <Route path="/io/cases/:userId/log" element={<RequireAuth loginPath="/signin"><IoCaseLog /></RequireAuth>} />
        <Route path="/io/cases/:userId/tasks" element={<RequireAuth loginPath="/signin"><IoCaseTasks /></RequireAuth>} />
        <Route path="/io/profile" element={<RequireAuth loginPath="/signin"><IoProfile /></RequireAuth>} />
        <Route path="/dwo" element={<RequireAuth loginPath="/signin"><DwoReferralQueue /></RequireAuth>} />
        <Route path="/dwo/referrals/:referralId" element={<RequireAuth loginPath="/signin"><DwoReferralDetail /></RequireAuth>} />
        <Route path="/dwo/referrals/:referralId/relief" element={<RequireAuth loginPath="/signin"><DwoReferralRelief /></RequireAuth>} />
        <Route path="/dwo/referrals/:referralId/compensation" element={<RequireAuth loginPath="/signin"><DwoReferralCompensation /></RequireAuth>} />
        <Route path="/dwo/referrals/:referralId/log" element={<RequireAuth loginPath="/signin"><DwoReferralLog /></RequireAuth>} />
        <Route path="/dwo/referrals/:referralId/tasks" element={<RequireAuth loginPath="/signin"><DwoReferralTasks /></RequireAuth>} />
        <Route path="/dwo/intervention-requests" element={<RequireAuth loginPath="/signin"><DwoInterventionRequests /></RequireAuth>} />
        <Route path="/dwo/profile" element={<RequireAuth loginPath="/signin"><DwoProfile /></RequireAuth>} />
        <Route path="/protectionofficer" element={<RequireAuth loginPath="/signin"><ProtectionOfficerRegistry /></RequireAuth>} />
        <Route path="/protectionofficer/referrals/:referralId" element={<RequireAuth loginPath="/signin"><ProtectionOfficerReferralDetail /></RequireAuth>} />
        <Route path="/protectionofficer/intervention-requests" element={<RequireAuth loginPath="/signin"><ProtectionOfficerInterventionRequests /></RequireAuth>} />
        <Route path="/protectionofficer/intervention-requests/:requestId" element={<RequireAuth loginPath="/signin"><ProtectionOfficerInterventionRequestDetail /></RequireAuth>} />
        <Route path="/protectionofficer/profile" element={<RequireAuth loginPath="/signin"><ProtectionOfficerProfile /></RequireAuth>} />
        <Route path="/dlsa" element={<RequireAuth loginPath="/signin"><DlsaLegalAidQueue /></RequireAuth>} />
        <Route path="/dlsa/referrals/:referralId" element={<RequireAuth loginPath="/signin"><DlsaReferralDetail /></RequireAuth>} />
        <Route path="/dlsa/tasks" element={<RequireAuth loginPath="/signin"><DlsaMyTasks /></RequireAuth>} />
        <Route path="/dlsa/intervention-requests" element={<RequireAuth loginPath="/signin"><DlsaInterventionRequests /></RequireAuth>} />
        <Route path="/dlsa/profile" element={<RequireAuth loginPath="/signin"><DlsaProfile /></RequireAuth>} />
        <Route path="/districtcollector" element={<RequireAuth loginPath="/signin"><DistrictCollectorCommitteeReview /></RequireAuth>} />
        <Route path="/districtcollector/referrals/:referralId" element={<RequireAuth loginPath="/signin"><DistrictCollectorReviewDetail /></RequireAuth>} />
        <Route path="/districtcollector/tasks" element={<RequireAuth loginPath="/signin"><DistrictCollectorMyTasks /></RequireAuth>} />
        <Route path="/districtcollector/profile" element={<RequireAuth loginPath="/signin"><DistrictCollectorProfile /></RequireAuth>} />
        <Route path="/rehabilitationofficer" element={<RequireAuth loginPath="/signin"><RehabilitationOfficerPlans /></RequireAuth>} />
        <Route path="/rehabilitationofficer/referrals/:referralId" element={<RequireAuth loginPath="/signin"><RehabilitationOfficerReferralDetail /></RequireAuth>} />
        <Route path="/rehabilitationofficer/tasks" element={<RequireAuth loginPath="/signin"><RehabilitationOfficerMyTasks /></RequireAuth>} />
        <Route path="/rehabilitationofficer/profile" element={<RequireAuth loginPath="/signin"><RehabilitationOfficerProfile /></RequireAuth>} />
      </Routes>
      </ToastProvider>
    </Router>
  );
}
