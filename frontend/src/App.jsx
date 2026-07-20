import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/Dashboard';
import BalanceSheetWizard from './pages/BalanceSheetWizard';
import IncomeStatementWizard from './pages/IncomeStatementWizard';
import CashFlowStatementWizard from './pages/CashFlowStatementWizard';

function App() {
  // Load initial state from localStorage if available
  const [analysisConfig, setAnalysisConfig] = useState(() => {
    const savedConfig = localStorage.getItem('kpmgAnalysisConfig');
    if (savedConfig) {
      try {
        return JSON.parse(savedConfig);
      } catch (e) {
        console.error("Failed to parse config from localStorage");
      }
    }
    return {
      industry: null,
      years: [], // e.g. [2021, 2022, 2023, 2024, 2025]
      totalAssets: {}, // mock KPI connected state
      importedPdfData: null
    };
  });

  // Persist to localStorage on change
  useEffect(() => {
    localStorage.setItem('kpmgAnalysisConfig', JSON.stringify(analysisConfig));
  }, [analysisConfig]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage setAnalysisConfig={setAnalysisConfig} />} />
        
        {/* Protected Dashboard Routes */}
        <Route path="/dashboard" element={<DashboardLayout industry={analysisConfig.industry} />}>
          <Route index element={<Dashboard config={analysisConfig} setConfig={setAnalysisConfig} />} />
          <Route path="balance-sheet" element={<BalanceSheetWizard config={analysisConfig} setConfig={setAnalysisConfig} />} />
          <Route path="income-statement" element={<IncomeStatementWizard config={analysisConfig} setConfig={setAnalysisConfig} />} />
          <Route path="cash-flow-statement" element={<CashFlowStatementWizard config={analysisConfig} setConfig={setAnalysisConfig} />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
