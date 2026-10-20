import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import RequireAuth from './shared/components/RequireAuth';
import { ToastProvider } from './shared/context/ToastContext';
import { PageHeaderProvider } from './shared/context/PageHeaderContext';
import StaffLoginPage from './shared/pages/Login';
import SignInPage from './shared/pages/SignIn';

import CounsellorStaffLayout from './counsellor/layouts/StaffLayout';
import CounsellorDashboard from './counsellor/pages/CounsellorDashboard';
import MyUsers from './counsellor/pages/MyUsers';
import CounsellorCaseDetail from './counsellor/pages/CaseDetail';
import CounsellorCaseNotes from './counsellor/pages/CaseNotes';
import CounsellorCaseChat from './counsellor/pages/CaseChat';
import AlertsFeed from './counsellor/pages/AlertsFeed';
import CounsellorAnalysis from './counsellor/pages/Analysis';
import CounsellorSettings from './counsellor/pages/Settings';


import DistrictAdminStaffLayout from './district_admin/layouts/StaffLayout';
import DistrictAdminDashboard from './district_admin/pages/AdminDashboard';
import DistrictAnalysis from './district_admin/pages/Analysis';
import DistrictCoordinationRolePerformance from './district_admin/pages/CoordinationRolePerformance';
import DistrictCaseDetail from './district_admin/pages/CaseDetail';
import DistrictAdminAlerts from './district_admin/pages/AdminAlerts';
import EditUserRecord from './district_admin/pages/EditUserRecord';
import DistrictReports from './district_admin/pages/Reports';
import DistrictInterventionRequests from './district_admin/pages/InterventionRequests';
import DistrictAgencyCoordination from './district_admin/pages/AgencyCoordination';
import DistrictSettings from './district_admin/pages/Settings';
import DistrictMailInbox from './district_admin/pages/MailInbox';
import DistrictMailSent from './district_admin/pages/MailSent';
import DistrictMailArchived from './district_admin/pages/MailArchived';
import DistrictMailThread from './district_admin/pages/MailThread';

import StateAdminStaffLayout from './state_admin/layouts/StaffLayout';
import StateDashboard from './state_admin/pages/StateDashboard';
import StateAdminDistrictDashboard from './state_admin/pages/AdminDashboard';
import StateCaseDetail from './state_admin/pages/CaseDetail';
import StateAnalysis from './state_admin/pages/Analysis';
import StateCoordinationRolePerformance from './state_admin/pages/CoordinationRolePerformance';
import StateAdminAlerts from './state_admin/pages/AdminAlerts';
import StateReports from './state_admin/pages/Reports';
import StateSettings from './state_admin/pages/Settings';
import StateMailInbox from './state_admin/pages/MailInbox';
import StateMailSent from './state_admin/pages/MailSent';
import StateMailArchived from './state_admin/pages/MailArchived';
import StateMailThread from './state_admin/pages/MailThread';

import NationalAdminStaffLayout from './national_admin/layouts/StaffLayout';
import NationalDashboard from './national_admin/pages/NationalDashboard';
import NationalStateDashboard from './national_admin/pages/StateDashboard';
import NationalDistrictDashboard from './national_admin/pages/AdminDashboard';
import NationalCaseDetail from './national_admin/pages/CaseDetail';
import NationalAnalysis from './national_admin/pages/Analysis';
import NationalCoordinationRolePerformance from './national_admin/pages/CoordinationRolePerformance';
import NationalAdminAlerts from './national_admin/pages/AdminAlerts';
import NationalReports from './national_admin/pages/Reports';
import NationalSettings from './national_admin/pages/Settings';
import NationalMailInbox from './national_admin/pages/MailInbox';
import NationalMailSent from './national_admin/pages/MailSent';
import NationalMailArchived from './national_admin/pages/MailArchived';
import NationalMailThread from './national_admin/pages/MailThread';

import MinistryLoginPage from './ministry/pages/Login';
import MinistryStaffLayout from './ministry/layouts/MinistryLayout';
import MinistryDashboard from './ministry/pages/MinistryDashboard';
import StaffManagement from './ministry/pages/StaffManagement';
import CounsellorPerformance from './ministry/pages/CounsellorPerformance';
import MinistryCoordinationRolePerformance from './ministry/pages/CoordinationRolePerformance';
import SystemConfig from './ministry/pages/SystemConfig';
import AuditLog from './ministry/pages/AuditLog';
import ReportsInbox from './ministry/pages/ReportsInbox';
import MinistrySettings from './ministry/pages/Settings';
import MinistryMailInbox from './ministry/pages/MailInbox';
import MinistryMailSent from './ministry/pages/MailSent';
import MinistryMailArchived from './ministry/pages/MailArchived';
import MinistryMailThread from './ministry/pages/MailThread';

// New coordination roles (Sign In portal) - see shared/pages/SignIn.jsx and
// backend/src/core/routes/auth.signin.routes.js for the shared login this
// group of 7 signs in through.
import IoStaffLayout from './io/layouts/StaffLayout';
import IoCaseQueue from './io/pages/CaseQueue';
import IoCaseDetail from './io/pages/CaseDetail';
import IoCaseLog from './io/pages/CaseLog';
import IoCaseTasks from './io/pages/CaseTasks';
import IoProfile from './io/pages/Profile';
import DwoStaffLayout from './dwo/layouts/StaffLayout';
import DwoReferralQueue from './dwo/pages/ReferralQueue';
import DwoReferralDetail from './dwo/pages/ReferralDetail';
import DwoReferralRelief from './dwo/pages/ReferralRelief';
import DwoReferralCompensation from './dwo/pages/ReferralCompensation';
import DwoReferralLog from './dwo/pages/ReferralLog';
import DwoReferralTasks from './dwo/pages/ReferralTasks';
import DwoInterventionRequests from './dwo/pages/InterventionRequests';
import DwoProfile from './dwo/pages/Profile';
import ProtectionOfficerStaffLayout from './protection_officer/layouts/StaffLayout';
import ProtectionOfficerRegistry from './protection_officer/pages/ProtectionRegistry';
import ProtectionOfficerReferralDetail from './protection_officer/pages/ReferralDetail';
import ProtectionOfficerInterventionRequests from './protection_officer/pages/InterventionRequests';
import ProtectionOfficerInterventionRequestDetail from './protection_officer/pages/InterventionRequestDetail';
import ProtectionOfficerProfile from './protection_officer/pages/Profile';
import DlsaStaffLayout from './dlsa/layouts/StaffLayout';
import DlsaLegalAidQueue from './dlsa/pages/LegalAidQueue';
import DlsaLegalAidRequestDetail from './dlsa/pages/LegalAidRequestDetail';
import DlsaAssignedCases from './dlsa/pages/AssignedCases';
import DlsaReferralDetail from './dlsa/pages/ReferralDetail';
import DlsaMyTasks from './dlsa/pages/MyTasks';
import DlsaInterventionRequests from './dlsa/pages/InterventionRequests';
import DlsaProfile from './dlsa/pages/Profile';
import LegalRepresentativeStaffLayout from './legal_representative/layouts/StaffLayout';
import LegalRepresentativeMyCases from './legal_representative/pages/MyCases';
import LegalRepresentativeCaseDetail from './legal_representative/pages/CaseDetail';
import LegalRepresentativeHearings from './legal_representative/pages/Hearings';
import LegalRepresentativeProfile from './legal_representative/pages/Profile';
import RehabilitationOfficerStaffLayout from './rehabilitation_officer/layouts/StaffLayout';
import RehabilitationOfficerPlans from './rehabilitation_officer/pages/RehabilitationPlans';
import RehabilitationOfficerReferralDetail from './rehabilitation_officer/pages/ReferralDetail';

import RehabilitationOfficerProfile from './rehabilitation_officer/pages/Profile';

export default function App() {
  return (
    <Router>
      <ToastProvider>
      <PageHeaderProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Shared login - real backend, roleName is Counsellor or
            Administration; Administration then routes to /districtadmin
            or /stateadmin based on the account's own jurisdiction level.
            The one deliberate exception to "every role gets its own copy" -
            see shared/pages/Login.jsx's own header comment. */}
        <Route path="/login" element={<StaffLoginPage />} />

        {/* Counsellor - nested under one persistent layout route (renders
            <Outlet/>) instead of each page wrapping StaffLayout itself, so
            the sidebar survives navigation between these pages and its
            gliding active-item pill (SidebarGlideNav) can actually animate
            between them - see PageHeaderContext.jsx for how each page still
            gets its own title/header into that persistent layout. */}
        <Route path="/counsellor" element={<RequireAuth><CounsellorStaffLayout /></RequireAuth>}>
          <Route index element={<CounsellorDashboard />} />
          <Route path="my-users" element={<MyUsers />} />
          <Route path="case-detail/:id" element={<CounsellorCaseDetail />} />
          <Route path="case-detail/:id/notes" element={<CounsellorCaseNotes />} />
          <Route path="case-detail/:id/chat" element={<CounsellorCaseChat />} />
          <Route path="alerts" element={<AlertsFeed />} />
          <Route path="analysis" element={<CounsellorAnalysis />} />
          <Route path="profile" element={<CounsellorSettings />} />
        </Route>

        {/* District Admin - nested under one persistent layout route (renders
            <Outlet/>) instead of each page wrapping StaffLayout itself, so
            the sidebar survives navigation between these pages - same
            pattern as Counsellor above. Case-level dashboard is the default
            view; district admin has no sub-jurisdictions to break down. */}
        <Route path="/districtadmin" element={<RequireAuth><DistrictAdminStaffLayout /></RequireAuth>}>
          <Route index element={<DistrictAdminDashboard />} />
          <Route path="analysis" element={<DistrictAnalysis />} />
          <Route path="coordination-roster" element={<DistrictCoordinationRolePerformance />} />
          <Route path="case-detail/:id" element={<DistrictCaseDetail />} />
          <Route path="alerts" element={<DistrictAdminAlerts />} />
          <Route path="intervention-requests" element={<DistrictInterventionRequests />} />
          <Route path="agency-coordination" element={<DistrictAgencyCoordination />} />
          <Route path="edit-user" element={<EditUserRecord />} />
          <Route path="reports" element={<DistrictReports />} />
          <Route path="mail" element={<DistrictMailInbox />} />
          <Route path="mail/sent" element={<DistrictMailSent />} />
          <Route path="mail/archived" element={<DistrictMailArchived />} />
          <Route path="mail/thread/:threadId" element={<DistrictMailThread />} />
          <Route path="profile" element={<DistrictSettings />} />
        </Route>

        {/* State/UT Admin - nested under one persistent layout route, same
            pattern as District Admin above. Aggregate (district-wise
            breakdown) is the default view; district/:id is the drill-down
            into a specific district's own case-level dashboard, keeping the
            state sidebar. */}
        <Route path="/stateadmin" element={<RequireAuth><StateAdminStaffLayout /></RequireAuth>}>
          <Route index element={<StateDashboard />} />
          <Route path="district/:jurisdictionId" element={<StateAdminDistrictDashboard />} />
          <Route path="case-detail/:id" element={<StateCaseDetail />} />
          <Route path="analysis" element={<StateAnalysis />} />
          <Route path="coordination-roster" element={<StateCoordinationRolePerformance />} />
          <Route path="alerts" element={<StateAdminAlerts />} />
          <Route path="reports" element={<StateReports />} />
          <Route path="mail" element={<StateMailInbox />} />
          <Route path="mail/sent" element={<StateMailSent />} />
          <Route path="mail/archived" element={<StateMailArchived />} />
          <Route path="mail/thread/:threadId" element={<StateMailThread />} />
          <Route path="profile" element={<StateSettings />} />
        </Route>

        {/* National Admin - nested under one persistent layout route, same
            pattern as Counsellor above. State-wise breakdown by default;
            drills into a state, then a district, then a case, each keeping
            the national sidebar. */}
        <Route path="/nationaladmin" element={<RequireAuth><NationalAdminStaffLayout /></RequireAuth>}>
          <Route index element={<NationalDashboard />} />
          <Route path="analysis" element={<NationalAnalysis />} />
          <Route path="coordination-roster" element={<NationalCoordinationRolePerformance />} />
          <Route path="alerts" element={<NationalAdminAlerts />} />
          <Route path="reports" element={<NationalReports />} />
          <Route path="state/:jurisdictionId" element={<NationalStateDashboard />} />
          <Route path="district/:jurisdictionId" element={<NationalDistrictDashboard />} />
          <Route path="case-detail/:id" element={<NationalCaseDetail />} />
          <Route path="mail" element={<NationalMailInbox />} />
          <Route path="mail/sent" element={<NationalMailSent />} />
          <Route path="mail/archived" element={<NationalMailArchived />} />
          <Route path="mail/thread/:threadId" element={<NationalMailThread />} />
          <Route path="profile" element={<NationalSettings />} />
        </Route>

        {/* Ministry - login stays a standalone top-level route (its own
            separate auth flow, not part of this nesting); every other
            Ministry page nests under one persistent layout route, same
            pattern as Counsellor/National Admin above. */}
        <Route path="/ministry/login" element={<MinistryLoginPage />} />
        <Route path="/ministry" element={<RequireAuth loginPath="/ministry/login"><MinistryStaffLayout /></RequireAuth>}>
          <Route path="dashboard" element={<MinistryDashboard />} />
          <Route path="staff-management" element={<StaffManagement />} />
          <Route path="performance" element={<CounsellorPerformance />} />
          <Route path="coordination-roster" element={<MinistryCoordinationRolePerformance />} />
          <Route path="system-config" element={<SystemConfig />} />
          <Route path="audit-log" element={<AuditLog />} />
          <Route path="reports" element={<ReportsInbox />} />
          <Route path="mail" element={<MinistryMailInbox />} />
          <Route path="mail/sent" element={<MinistryMailSent />} />
          <Route path="mail/archived" element={<MinistryMailArchived />} />
          <Route path="mail/thread/:threadId" element={<MinistryMailThread />} />
          <Route path="profile" element={<MinistrySettings />} />
        </Route>

        {/* Signin - the second shared pre-role login (see SignIn.jsx's own
            header comment), for the 7 new coordination roles. Each portal
            below wraps in RequireAuth loginPath="/signin" - same pattern as
            Ministry's own loginPath="/ministry/login". */}
        <Route path="/signin" element={<SignInPage />} />

        {/* Investigating Officer - nested under one persistent layout route,
            same pattern as Counsellor/Protection Officer above. */}
        <Route path="/io" element={<RequireAuth loginPath="/signin"><IoStaffLayout /></RequireAuth>}>
          <Route index element={<IoCaseQueue />} />
          <Route path="cases/:userId" element={<IoCaseDetail />} />
          <Route path="cases/:userId/log" element={<IoCaseLog />} />
          <Route path="cases/:userId/tasks" element={<IoCaseTasks />} />
          <Route path="profile" element={<IoProfile />} />
        </Route>

        {/* District Welfare Officer - nested under one persistent layout
            route, same pattern as Counsellor/Protection Officer above. */}
        <Route path="/dwo" element={<RequireAuth loginPath="/signin"><DwoStaffLayout /></RequireAuth>}>
          <Route index element={<DwoReferralQueue />} />
          <Route path="referrals/:referralId" element={<DwoReferralDetail />} />
          <Route path="referrals/:referralId/relief" element={<DwoReferralRelief />} />
          <Route path="referrals/:referralId/compensation" element={<DwoReferralCompensation />} />
          <Route path="referrals/:referralId/log" element={<DwoReferralLog />} />
          <Route path="referrals/:referralId/tasks" element={<DwoReferralTasks />} />
          <Route path="intervention-requests" element={<DwoInterventionRequests />} />
          <Route path="profile" element={<DwoProfile />} />
        </Route>
        {/* Protection Officer - nested under one persistent layout route, same
            pattern as Counsellor (see App.jsx's own "Counsellor" comment
            above and PageHeaderContext.jsx for how each page still gets its
            own title into the persistent layout). */}
        <Route path="/protectionofficer" element={<RequireAuth loginPath="/signin"><ProtectionOfficerStaffLayout /></RequireAuth>}>
          <Route index element={<ProtectionOfficerRegistry />} />
          <Route path="referrals/:referralId" element={<ProtectionOfficerReferralDetail />} />
          <Route path="intervention-requests" element={<ProtectionOfficerInterventionRequests />} />
          <Route path="intervention-requests/:requestId" element={<ProtectionOfficerInterventionRequestDetail />} />
          <Route path="profile" element={<ProtectionOfficerProfile />} />
        </Route>
        {/* DLSA Coordinator - nested under one persistent layout route, same
            pattern as Counsellor/Protection Officer above. */}
        <Route path="/dlsa" element={<RequireAuth loginPath="/signin"><DlsaStaffLayout /></RequireAuth>}>
          <Route index element={<DlsaLegalAidQueue />} />
          <Route path="legal-aid-requests/:requestId" element={<DlsaLegalAidRequestDetail />} />
          <Route path="assigned-cases" element={<DlsaAssignedCases />} />
          <Route path="profile" element={<DlsaProfile />} />
          {/* migration_040: unlinked from the DLSA sidebar (which now shows
              only Legal Aid Requests / Assigned Cases / Profile), but left
              mounted and reachable by direct URL - the legacy
              agency_referrals-backed flow these serve still has to work for
              any pre-existing case. */}
          <Route path="referrals/:referralId" element={<DlsaReferralDetail />} />
          <Route path="tasks" element={<DlsaMyTasks />} />
          <Route path="intervention-requests" element={<DlsaInterventionRequests />} />
        </Route>
        {/* Legal Representative - nested under one persistent layout route,
            same pattern as Counsellor/Protection Officer above. */}
        <Route path="/legalrepresentative" element={<RequireAuth loginPath="/signin"><LegalRepresentativeStaffLayout /></RequireAuth>}>
          <Route index element={<LegalRepresentativeMyCases />} />
          <Route path="cases/:requestId" element={<LegalRepresentativeCaseDetail />} />
          <Route path="hearings" element={<LegalRepresentativeHearings />} />
          <Route path="profile" element={<LegalRepresentativeProfile />} />
        </Route>

        {/* Rehabilitation Officer - nested under one persistent layout route,
            same pattern as Counsellor/Protection Officer above. */}
        <Route path="/rehabilitationofficer" element={<RequireAuth loginPath="/signin"><RehabilitationOfficerStaffLayout /></RequireAuth>}>
          <Route index element={<RehabilitationOfficerPlans />} />
          <Route path="referrals/:referralId" element={<RehabilitationOfficerReferralDetail />} />
          <Route path="profile" element={<RehabilitationOfficerProfile />} />
        </Route>
      </Routes>
      </PageHeaderProvider>
      </ToastProvider>
    </Router>
  );
}
