import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import CounsellorDashboard from '../src/components/CounsellorDashboard';
import CaseQueue from '../src/components/CaseQueue';
import LogIntervention from '../src/components/LogIntervention';
import Alerts from '../src/components/Alerts';
import Settings from '../src/components/Settings';
import CaseDetail from '../src/components/CaseDetail';
import Reports from '../src/components/Reports';
export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<CounsellorDashboard />} />
        <Route path="/case-queue" element={<CaseQueue />} />
        <Route path="/case-detail/:id?" element={<CaseDetail />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/interventions" element={<LogIntervention />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/reports" element={<Reports />} />
      </Routes>
    </Router>
  );
}