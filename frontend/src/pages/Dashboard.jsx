import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import KPICard from '../components/KPICard';
import './Dashboard.css';

const Dashboard = ({ config, setConfig }) => {
  const navigate = useNavigate();
  const [modalState, setModalState] = useState('none'); // 'none', 'options', 'newAnalysis', 'addYears', 'reset'
  const [selectedYearsOption, setSelectedYearsOption] = useState('5');
  const [customYears, setCustomYears] = useState(5);
  const [addHistoricalYears, setAddHistoricalYears] = useState(2);

  const [activeYear, setActiveYear] = useState(
    config.years && config.years.length > 0 ? config.years[config.years.length - 1] : null
  );

  // FIXED: Sync activeYear when config.years dynamically loads or updates
  useEffect(() => {
    if (config.years && config.years.length > 0) {
      if (!activeYear || !config.years.includes(activeYear)) {
        setActiveYear(config.years[config.years.length - 1]);
      }
    } else {
      setActiveYear(null);
    }
  }, [config.years]);

  const handleStartAnalysisClick = () => {
    if (config.years && config.years.length > 0) {
      setModalState('options');
    } else {
      setModalState('newAnalysis');
    }
  };

  const handleStartNewAnalysis = () => {
    let numYears = parseInt(selectedYearsOption);
    if (selectedYearsOption === 'custom') {
      numYears = parseInt(customYears);
    }
    
    // FIXED: Dynamically generate years based on current date (instead of hardcoded 2025)
    const currentYear = new Date().getFullYear();
    const endYear = currentYear - 1; // Standard practice: previous complete financial year as base
    const yearsArr = [];
    for (let i = endYear - numYears + 1; i <= endYear; i++) {
      yearsArr.push(i);
    }

    setConfig(prev => ({
      ...prev,
      years: yearsArr,
      totalAssets: {}, // Reset old data on new analysis
      revenue: {},
      netProfit: {},
      freeCashFlow: {}
    }));
    
    setModalState('none');
    navigate('/dashboard/balance-sheet');
  };

  const handleAddHistoricalYears = () => {
    const numYearsToAdd = parseInt(addHistoricalYears);
    if (numYearsToAdd > 0 && config.years && config.years.length > 0) {
      const earliestYear = config.years[0];
      const newHistoricalYears = [];
      for (let i = numYearsToAdd; i > 0; i--) {
        newHistoricalYears.push(earliestYear - i);
      }
      
      const newYearsArr = [...newHistoricalYears, ...config.years];
      setConfig(prev => ({
        ...prev,
        years: newYearsArr
      }));
      setModalState('none');
    }
  };

  const handleResetAnalysis = () => {
    localStorage.removeItem('kpmgBalanceSheetData');
    localStorage.removeItem('kpmgIncomeStatementData');
    localStorage.removeItem('kpmgCashFlowData');
    
    setConfig({
      years: [],
      totalAssets: {},
      revenue: {},
      netProfit: {},
      freeCashFlow: {}
    });
    setModalState('none');
    setActiveYear(null);
  };

  const getKPIData = (year) => {
    if (!year) return { totalAssets: 'No Data', revenue: 'No Data', netProfit: 'No Data', freeCashFlow: 'No Data' };
    return {
      totalAssets: config.totalAssets && config.totalAssets[year] !== undefined ? config.totalAssets[year] : 'No Data',
      revenue: config.revenue && config.revenue[year] !== undefined ? config.revenue[year] : 'No Data',
      netProfit: config.netProfit && config.netProfit[year] !== undefined ? config.netProfit[year] : 'No Data',
      freeCashFlow: config.freeCashFlow && config.freeCashFlow[year] !== undefined ? config.freeCashFlow[year] : 'No Data'
    };
  };

  const kpiData = getKPIData(activeYear);

  return (
    <div className="dashboard-container animate-fade-in">
      <header className="dashboard-header">
        <div>
          <h1 className="page-title">Executive Dashboard</h1>
          <p className="page-subtitle">Real-time financial performance overview</p>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div className="unit-indicator badge glass">
            All amounts are presented in <strong>PKR ('000)</strong>
          </div>
          <button className="btn-primary" onClick={handleStartAnalysisClick}>
            Start New Analysis
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <KPICard title="Total Assets" value={kpiData.totalAssets} status={kpiData.totalAssets !== 'No Data' ? 'active' : 'placeholder'} />
        <KPICard title="Revenue – Net" value={kpiData.revenue} status={kpiData.revenue !== 'No Data' ? 'active' : 'placeholder'} />
        <KPICard title="Net Profit / (Loss) for the Year" value={kpiData.netProfit} status={kpiData.netProfit !== 'No Data' ? 'active' : 'placeholder'} />
        <KPICard title="Free Cash Flow" value={kpiData.freeCashFlow} status={kpiData.freeCashFlow !== 'No Data' ? 'active' : 'placeholder'} />
        <KPICard title="Current Ratio" value="Pending" status="placeholder" />
        <KPICard title="Total Debt" value="Pending" status="placeholder" />
      </div>

      {config.years && config.years.length > 0 && (
        <div className="year-selector glass">
          <label>Selected Year Context: <strong>{activeYear}</strong></label>
          <input 
            type="range" 
            min={config.years[0]} 
            max={config.years[config.years.length - 1]} 
            step="1" 
            value={activeYear || config.years[config.years.length - 1]} 
            onChange={(e) => setActiveYear(parseInt(e.target.value))}
            className="year-slider"
          />
          <div className="year-labels">
            <span>{config.years[0]}</span>
            <span>{config.years[config.years.length - 1]}</span>
          </div>
        </div>
      )}

      {/* Analysis Modals */}
      {modalState !== 'none' && (
        <div className="modal-overlay">
          
          {modalState === 'options' && (
            <div className="modal-content glass animate-fade-in" style={{ maxWidth: '400px' }}>
              <h2>Analysis In Progress</h2>
              <p>You currently have an active financial analysis. Would you like to extend it with historical years or start over entirely?</p>
              
              <div className="modal-actions" style={{ flexDirection: 'column', gap: '10px' }}>
                <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setModalState('addYears')}>
                  Add Historical Years
                </button>
                <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center', borderColor: 'var(--color-error)', color: 'var(--color-error)' }} onClick={() => setModalState('reset')}>
                  Reset Whole Analysis
                </button>
                <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center', border: 'none' }} onClick={() => setModalState('none')}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {modalState === 'addYears' && (
            <div className="modal-content glass animate-fade-in" style={{ maxWidth: '400px' }}>
              <h2>Add Historical Years</h2>
              <p>How many historical years would you like to add before {config.years[0]}?</p>
              
              <div className="form-group mt-3">
                <input 
                  type="number" 
                  min="1" 
                  max="10" 
                  value={addHistoricalYears} 
                  onChange={(e) => setAddHistoricalYears(e.target.value)} 
                  style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                />
              </div>

              <div className="modal-actions mt-4">
                <button className="btn-secondary" onClick={() => setModalState('options')}>Back</button>
                <button className="btn-primary" onClick={handleAddHistoricalYears}>Add Years</button>
              </div>
            </div>
          )}

          {modalState === 'reset' && (
            <div className="modal-content glass animate-fade-in" style={{ maxWidth: '450px' }}>
              <h2 style={{ color: 'var(--color-error)' }}>Reset Analysis</h2>
              <p><strong>Are you sure you want to reset the entire financial analysis?</strong></p>
              <p style={{ fontSize: '13px', marginTop: '10px' }}>This action will permanently remove:</p>
              <ul style={{ fontSize: '13px', marginBottom: '20px', marginLeft: '20px' }}>
                <li>Balance Sheet data</li>
                <li>Income Statement data</li>
                <li>Cash Flow Statement data</li>
                <li>Dashboard values</li>
              </ul>
              
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setModalState('options')}>Cancel</button>
                <button className="btn-primary" style={{ backgroundColor: 'var(--color-error)' }} onClick={handleResetAnalysis}>
                  Reset Analysis
                </button>
              </div>
            </div>
          )}

          {modalState === 'newAnalysis' && (
            <div className="modal-content glass animate-fade-in">
              <h2>Start New Analysis</h2>
              <p>How many years of financial data do you want to analyze?</p>
              
              <div className="form-group radio-group">
                <label>
                  <input 
                    type="radio" 
                    name="years" 
                    value="3" 
                    checked={selectedYearsOption === '3'} 
                    onChange={(e) => setSelectedYearsOption(e.target.value)} 
                  /> 
                  3 Years
                </label>
                <label>
                  <input 
                    type="radio" 
                    name="years" 
                    value="5" 
                    checked={selectedYearsOption === '5'} 
                    onChange={(e) => setSelectedYearsOption(e.target.value)} 
                  /> 
                  5 Years
                </label>
                <label>
                  <input 
                    type="radio" 
                    name="years" 
                    value="custom" 
                    checked={selectedYearsOption === 'custom'} 
                    onChange={(e) => setSelectedYearsOption(e.target.value)} 
                  /> 
                  Custom
                </label>
              </div>

              {selectedYearsOption === 'custom' && (
                <div className="form-group mt-3">
                  <label>Number of Years</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="10" 
                    value={customYears} 
                    onChange={(e) => setCustomYears(e.target.value)} 
                  />
                </div>
              )}

              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setModalState('none')}>Cancel</button>
                <button className="btn-primary" onClick={handleStartNewAnalysis}>Continue</button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

export default Dashboard;