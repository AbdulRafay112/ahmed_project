import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft, CheckCircle, Download } from 'lucide-react';
import { formatAccounting } from '../utils/format';
import './BalanceSheetWizard.css'; // Reusing CSS

const STEPS = ['Operating', 'Investing', 'Financing', 'Cash & Finish'];

const lineItems = {
  operatingActivities: [
    'Cash Generated from Operations',
    'Profit on Bank Deposits Received',
    'Finance Costs Paid',
    'Taxes Paid',
    'Staff Retirement Benefits Paid',
    'Advance to Subsidiaries',
    'Long-term Deposits and Prepayments – Net'
  ],
  investingActivities: [
    'Purchase of Property, Plant and Equipment',
    'Purchase of Intangible Assets',
    'Advance Paid to Subsidiary',
    'Proceeds from Sale of PP&E'
  ],
  financingActivities: [
    'Repayment of Long-term Financing',
    'Proceeds from Long-term Financing',
    'Proceeds from Short-term Borrowings',
    'Repayment of Lease Liabilities'
  ],
  cashAndCashEquivalents: [
    'Cash and Cash Equivalents – Beginning of Year'
  ]
};

const CashFlowStatementWizard = ({ config, setConfig }) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [notification, setNotification] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportOption, setExportOption] = useState('complete');
  
  const [focusTarget, setFocusTarget] = useState(null);

  const getInitialState = (items) => {
    return items.map(name => {
      const values = {};
      config.years.forEach(year => values[year] = '');
      return { name, values };
    });
  };

  const [data, setData] = useState(() => {
    const savedData = localStorage.getItem('kpmgCashFlowData');
    if (savedData) {
      try { return JSON.parse(savedData); } catch (e) {}
    }
    return {
      operatingActivities: getInitialState(lineItems.operatingActivities),
      investingActivities: getInitialState(lineItems.investingActivities),
      financingActivities: getInitialState(lineItems.financingActivities),
      cashAndCashEquivalents: getInitialState(lineItems.cashAndCashEquivalents)
    };
  });

  const [totals, setTotals] = useState({
    netCashFromOperating: {},
    netCashUsedInInvesting: {},
    netCashFromFinancing: {},
    netIncreaseInCash: {},
    cashAndCashEquivalentsEndOfYear: {}
  });

  useEffect(() => {
    if (!config.years || config.years.length === 0) {
        navigate('/dashboard'); 
        return;
    }

    const newTotals = {
      netCashFromOperating: {}, netCashUsedInInvesting: {}, netCashFromFinancing: {},
      netIncreaseInCash: {}, cashAndCashEquivalentsEndOfYear: {}
    };

    config.years.forEach(year => {
      const sumSection = (sectionData) => sectionData.reduce((acc, item) => acc + (parseFloat(item.values[year]) || 0), 0);

      newTotals.netCashFromOperating[year] = sumSection(data.operatingActivities);
      newTotals.netCashUsedInInvesting[year] = sumSection(data.investingActivities);
      newTotals.netCashFromFinancing[year] = sumSection(data.financingActivities);
      
      newTotals.netIncreaseInCash[year] = newTotals.netCashFromOperating[year] + newTotals.netCashUsedInInvesting[year] + newTotals.netCashFromFinancing[year];

      const beginningCash = parseFloat(data.cashAndCashEquivalents[0].values[year]) || 0;
      newTotals.cashAndCashEquivalentsEndOfYear[year] = beginningCash + newTotals.netIncreaseInCash[year];
    });

    setTotals(newTotals);
    localStorage.setItem('kpmgCashFlowData', JSON.stringify({ ...data, totals: newTotals }));

    // Dashboard Sync for Free Cash Flow
    setConfig(prev => ({
      ...prev,
      freeCashFlow: newTotals.cashAndCashEquivalentsEndOfYear
    }));

  }, [data, config.years, setConfig]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = ''; 
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (focusTarget) {
      const timer = setTimeout(() => {
        const inputs = Array.from(document.querySelectorAll('.financial-input'));
        if (inputs.length > 0) {
          if (focusTarget === 'first') { inputs[0].focus(); inputs[0].select(); }
          else if (focusTarget === 'last') { inputs[inputs.length - 1].focus(); inputs[inputs.length - 1].select(); }
        }
        setFocusTarget(null);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [currentStep, focusTarget]);

  // Handle Hydration from PDF Import natively via config
  useEffect(() => {
    if (config.importedPdfData?.cashFlowStatement) {
      const { cashFlowStatement: importedCF, year } = config.importedPdfData;
      
      setData(prev => {
        const newData = { ...prev };
        for (const sectionKey in newData) {
          if (sectionKey === 'totals') continue;
          newData[sectionKey] = newData[sectionKey].map(item => {
            if (importedCF[item.name] !== undefined) {
              return {
                ...item,
                values: { ...item.values, [year]: importedCF[item.name] }
              };
            }
            return item;
          });
        }
        return newData;
      });
      setIsDirty(true);

      // Clean up the config flag for CF
      setConfig(prev => ({
        ...prev,
        importedPdfData: {
          ...prev.importedPdfData,
          cashFlowStatement: null
        }
      }));
    }
  }, [config.importedPdfData, setConfig]);

  const handleInputChange = (section, index, year, value) => {
    if (value !== '' && !/^-?\d*\.?\d*$/.test(value)) return;
    setIsDirty(true);
    setData(prev => {
      const newData = { ...prev };
      newData[section][index].values[year] = value;
      return newData;
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      const activeElement = document.activeElement;
      if (!activeElement.classList.contains('financial-input')) return;
      const inputs = Array.from(document.querySelectorAll('.financial-input'));
      const currentIndex = inputs.indexOf(activeElement);

      if (currentIndex !== -1) {
        e.preventDefault();
        if (e.shiftKey) {
          if (currentIndex > 0) { inputs[currentIndex - 1].focus(); inputs[currentIndex - 1].select(); }
          else if (currentStep > 0) { setCurrentStep(prev => prev - 1); setFocusTarget('last'); }
        } else {
          if (currentIndex < inputs.length - 1) { inputs[currentIndex + 1].focus(); inputs[currentIndex + 1].select(); }
          else if (currentStep < 3) { setCurrentStep(prev => prev + 1); setFocusTarget('first'); }
          else { activeElement.blur(); }
        }
      }
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/cash-flow/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: 1, years: config.years, data: { ...data, totals } })
      });
      const result = await response.json();
      if (result.success) {
        setIsDirty(false);
      }
    } catch (error) {
      console.error(error);
    }
    setIsSaving(false);
  };

  const handleExport = async () => {
    setIsExporting(true);
    setNotification('');
    try {
      // Auto-save before export
      await handleSave();

      const bsDataRaw = localStorage.getItem('kpmgBalanceSheetData');
      const isDataRaw = localStorage.getItem('kpmgIncomeStatementData');
      const bsData = bsDataRaw ? JSON.parse(bsDataRaw) : null;
      const isData = isDataRaw ? JSON.parse(isDataRaw) : null;
      
      const payload = {
        option: exportOption,
        years: config.years,
        bsData: bsData,
        isData: isData,
        cfData: { ...data, totals }
      };

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        setNotification(errorData.error || 'Export failed.');
        setIsExporting(false);
        return;
      }
      
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition');
      let filename = 'Financial_Statements.xlsx';
      if (disposition && disposition.indexOf('filename=') !== -1) {
          const matches = /filename="([^"]+)"/.exec(disposition) || /filename=([^;]+)/.exec(disposition);
          if (matches != null && matches[1]) {
            filename = matches[1].replace(/['"]/g, '');
          }
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      setNotification('Excel file downloaded successfully.');
      setShowExportModal(false);
    } catch (error) {
      console.error(error);
      setNotification('Export request failed.');
    }
    setIsExporting(false);
  };

  const renderInputTable = (title, sectionData, sectionKey, totalKey, totalLabel, isGrandTotal = false) => (
    <div className="wizard-section glass">
      <h3>{title}</h3>
      <div className="table-responsive">
        <table className="financial-table">
          <thead>
            <tr>
              <th>Line Item</th>
              {config.years.map(year => <th key={year}>{year}</th>)}
            </tr>
          </thead>
          <tbody>
            {sectionData.map((item, index) => (
              <tr key={item.name}>
                <td>{item.name}</td>
                {config.years.map(year => (
                  <td key={year}>
                    <input type="text" className="financial-input" value={item.values[year] || ''} onChange={(e) => handleInputChange(sectionKey, index, year, e.target.value)} placeholder="0.00" />
                  </td>
                ))}
              </tr>
            ))}
            {totalKey && (
              <tr className={`total-row ${isGrandTotal ? 'grand-total-bg' : ''}`}>
                <td style={isGrandTotal ? { fontWeight: 'bold', fontSize: '14px', color: 'var(--color-primary)' } : {}}>{totalLabel}</td>
                {config.years.map(year => (
                  <td key={year} style={isGrandTotal ? { fontWeight: 'bold' } : {}}>
                    {formatAccounting(totals[totalKey][year])}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="wizard-container animate-fade-in" onKeyDown={handleKeyDown}>
      <div className="wizard-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Cash Flow Statement</h1>
            <p className="page-subtitle">Enter cash flows from operating, investing, and financing activities</p>
          </div>
          <div className="unit-indicator badge glass">
            All amounts are presented in <strong>PKR ('000)</strong>
          </div>
        </div>
      </div>

      {notification && (
        <div className={`notification ${notification.includes('generated') ? 'success' : 'error'}`}>
          <CheckCircle size={20} />
          <span>{notification}</span>
        </div>
      )}

      <div className="progress-container">
        {STEPS.map((step, index) => (
          <React.Fragment key={step}>
            <div className={`step-item ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}>
              <div className="step-circle">{index + 1}</div>
              <span className="step-label">{step}</span>
            </div>
            {index < STEPS.length - 1 && <div className={`step-line ${index < currentStep ? 'completed' : ''}`}></div>}
          </React.Fragment>
        ))}
      </div>

      <div className="wizard-content">
        {currentStep === 0 && (
          <div className="step-pane animate-fade-in">
            {renderInputTable('Operating Activities', data.operatingActivities, 'operatingActivities', 'netCashFromOperating', 'Net Cash from Operating Activities', true)}
          </div>
        )}

        {currentStep === 1 && (
          <div className="step-pane animate-fade-in">
            {renderInputTable('Investing Activities', data.investingActivities, 'investingActivities', 'netCashUsedInInvesting', 'Net Cash Used in Investing Activities', true)}
          </div>
        )}

        {currentStep === 2 && (
          <div className="step-pane animate-fade-in">
            {renderInputTable('Financing Activities', data.financingActivities, 'financingActivities', 'netCashFromFinancing', 'Net Cash from / (Used in) Financing Activities', true)}
            <div className="grand-total-row glass">
              <h3>NET INCREASE / (DECREASE) IN CASH</h3>
              <div className="grand-total-values">
                {config.years.map(year => (
                  <div key={year} className="year-total">
                    <span>{year}:</span><strong>{formatAccounting(totals.netIncreaseInCash[year])}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="step-pane animate-fade-in">
            {renderInputTable('Cash and Cash Equivalents', data.cashAndCashEquivalents, 'cashAndCashEquivalents', 'cashAndCashEquivalentsEndOfYear', 'Cash and Cash Equivalents – End of Year', true)}
          </div>
        )}
      </div>

      <div className="wizard-footer">
        <button className="btn-secondary nav-btn" onClick={() => setCurrentStep(prev => prev - 1)} disabled={currentStep === 0 || isSaving}>
          <ChevronLeft size={16} /> Back
        </button>
        
        {currentStep < STEPS.length - 1 ? (
          <button className="btn-primary nav-btn" onClick={() => {
            handleSave(); // Auto-save on next
            setCurrentStep(prev => prev + 1);
          }}>
            Next <ChevronRight size={16} />
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn-primary nav-btn save-btn" onClick={() => {
              handleSave();
              setShowExportModal(true);
            }}>
              <Download size={16} /> Finish & Export
            </button>
          </div>
        )}
      </div>

      {showExportModal && (
        <div className="modal-overlay">
          <div className="modal-content glass animate-fade-in">
            <h2>Export Financial Statements</h2>
            <p>Select which statement(s) you would like to export to Excel.</p>
            
            <div className="form-group radio-group">
              <label>
                <input type="radio" name="export" value="balanceSheet" checked={exportOption === 'balanceSheet'} onChange={(e) => setExportOption(e.target.value)} /> 
                Balance Sheet Only
              </label>
              <label>
                <input type="radio" name="export" value="incomeStatement" checked={exportOption === 'incomeStatement'} onChange={(e) => setExportOption(e.target.value)} /> 
                Income Statement Only
              </label>
              <label>
                <input type="radio" name="export" value="cashFlow" checked={exportOption === 'cashFlow'} onChange={(e) => setExportOption(e.target.value)} /> 
                Cash Flow Statement Only
              </label>
              <label>
                <input type="radio" name="export" value="bs_is" checked={exportOption === 'bs_is'} onChange={(e) => setExportOption(e.target.value)} /> 
                Balance Sheet + Income Statement
              </label>
              <label>
                <input type="radio" name="export" value="bs_cf" checked={exportOption === 'bs_cf'} onChange={(e) => setExportOption(e.target.value)} /> 
                Balance Sheet + Cash Flow Statement
              </label>
              <label>
                <input type="radio" name="export" value="is_cf" checked={exportOption === 'is_cf'} onChange={(e) => setExportOption(e.target.value)} /> 
                Income Statement + Cash Flow Statement
              </label>
              <label>
                <input type="radio" name="export" value="complete" checked={exportOption === 'complete'} onChange={(e) => setExportOption(e.target.value)} /> 
                Complete Financial Statements (BS + IS + CF)
              </label>
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowExportModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleExport} disabled={isExporting}>
                {isExporting ? 'Exporting...' : 'Download Excel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashFlowStatementWizard;
