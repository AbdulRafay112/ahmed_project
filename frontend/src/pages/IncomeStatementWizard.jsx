import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ChevronRight, ChevronLeft, CheckCircle, Download } from 'lucide-react';
import { formatAccounting } from '../utils/format';
import './BalanceSheetWizard.css'; // Reusing CSS

const STEPS = ['Revenue & Cost', 'Operating', 'Tax & Finish'];

const lineItems = {
  revenue: ['Revenue - Net'],
  costOfServices: ['Aircraft Fuel', 'Other Cost of Services'],
  operatingExpenses: ['Distribution Costs', 'Administrative Expenses', 'Other Provisions and Adjustments - Net', 'Other Income - Net'],
  exchangeGainLoss: ['Exchange Gain / (Loss) - Net'],
  financeCosts: ['Finance Costs'],
  levyAndTaxation: ['Levy - Minimum Tax', 'Taxation']
};

const IncomeStatementWizard = ({ config, setConfig }) => {
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
    const savedData = localStorage.getItem('kpmgIncomeStatementData');
    if (savedData) {
      try { return JSON.parse(savedData); } catch (e) {}
    }
    return {
      revenue: getInitialState(lineItems.revenue),
      costOfServices: getInitialState(lineItems.costOfServices),
      operatingExpenses: getInitialState(lineItems.operatingExpenses),
      exchangeGainLoss: getInitialState(lineItems.exchangeGainLoss),
      financeCosts: getInitialState(lineItems.financeCosts),
      levyAndTaxation: getInitialState(lineItems.levyAndTaxation)
    };
  });

  const [totals, setTotals] = useState({
    totalCostOfServices: {},
    grossProfit: {},
    totalOperatingExpenses: {},
    profitFromOperations: {},
    profitBeforeInterestTax: {},
    profitBeforeLevyTax: {},
    netProfit: {}
  });

  useEffect(() => {
    if (!config.years || config.years.length === 0) {
        navigate('/dashboard'); 
        return;
    }

    const newTotals = {
      totalCostOfServices: {}, grossProfit: {}, totalOperatingExpenses: {},
      profitFromOperations: {}, profitBeforeInterestTax: {}, profitBeforeLevyTax: {}, netProfit: {}
    };

    config.years.forEach(year => {
      const sumSection = (sectionData) => sectionData.reduce((acc, item) => acc + (parseFloat(item.values[year]) || 0), 0);

      const revenue = sumSection(data.revenue);
      newTotals.totalCostOfServices[year] = sumSection(data.costOfServices);
      
      // FIXED: Cost of services subtracts from revenue (Gross Profit = Revenue - Cost of Services)
      newTotals.grossProfit[year] = revenue - newTotals.totalCostOfServices[year];

      newTotals.totalOperatingExpenses[year] = sumSection(data.operatingExpenses);
      
      // FIXED: Operating expenses subtract from Gross Profit (Profit From Operations = Gross Profit - Operating Expenses)
      newTotals.profitFromOperations[year] = newTotals.grossProfit[year] - newTotals.totalOperatingExpenses[year];

      const exchange = sumSection(data.exchangeGainLoss);
      newTotals.profitBeforeInterestTax[year] = newTotals.profitFromOperations[year] + exchange;

      const finance = sumSection(data.financeCosts);
      
      // FIXED: Finance costs subtract from profit
      newTotals.profitBeforeLevyTax[year] = newTotals.profitBeforeInterestTax[year] - finance;

      const levy = sumSection(data.levyAndTaxation);
      
      // FIXED: Taxes and Levies subtract to reach Net Profit
      newTotals.netProfit[year] = newTotals.profitBeforeLevyTax[year] - levy;
    });

    setTotals(newTotals);
    localStorage.setItem('kpmgIncomeStatementData', JSON.stringify({ ...data, totals: newTotals }));

    // Dashboard Sync for Revenue and Net Profit
    // FIXED: Optional chaining (?.) added to prevent crash if data.revenue is undefined or empty
    const revenueValues = data?.revenue?.[0]?.values || {};

    setConfig(prev => ({
      ...prev,
      revenue: revenueValues,
      netProfit: newTotals.netProfit
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
          else if (currentStep < 2) { setCurrentStep(prev => prev + 1); setFocusTarget('first'); }
          else { activeElement.blur(); }
        }
      }
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setNotification('');
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/income-statement/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: 1, years: config.years, data: { ...data, totals } })
      });
      const result = await response.json();
      if (result.success) {
        setIsDirty(false);
        setNotification('Income Statement saved successfully!');
      } else {
        setNotification(result.error || 'Error saving data.');
      }
    } catch (error) {
      setNotification('Failed to connect to server.');
    }
    setIsSaving(false);
  };

  const handleExport = async () => {
    setIsExporting(true);
    setNotification('');
    try {
      const bsDataRaw = localStorage.getItem('kpmgBalanceSheetData');
      const bsData = bsDataRaw ? JSON.parse(bsDataRaw) : null;
      
      const payload = {
        option: exportOption,
        years: config.years,
        bsData: bsData,
        isData: { ...data, totals }
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
                    {formatAccounting(totals[totalKey]?.[year])}
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
            <h1 className="page-title">Income Statement</h1>
            <p className="page-subtitle">Enter revenue and expenses</p>
          </div>
          <div className="unit-indicator badge glass">
            All amounts are presented in <strong>PKR ('000)</strong>
          </div>
        </div>
      </div>

      {notification && (
        <div className={`notification ${notification.includes('success') || notification.includes('generated') ? 'success' : 'error'}`}>
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
            {renderInputTable('Revenue', data.revenue, 'revenue', null, null)}
            {renderInputTable('Cost of Services', data.costOfServices, 'costOfServices', 'totalCostOfServices', 'Total Cost of Services')}
            
            <div className="grand-total-row glass">
              <h3>GROSS PROFIT / (LOSS)</h3>
              <div className="grand-total-values">
                {config.years.map(year => (
                  <div key={year} className="year-total">
                    <span>{year}:</span><strong>{formatAccounting(totals.grossProfit[year])}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {currentStep === 1 && (
          <div className="step-pane animate-fade-in">
            {renderInputTable('Operating Expenses / Other', data.operatingExpenses, 'operatingExpenses', 'totalOperatingExpenses', 'Total Operating Expenses - Net')}
            <div className="grand-total-row glass">
              <h3>PROFIT / (LOSS) FROM OPERATIONS</h3>
              <div className="grand-total-values">
                {config.years.map(year => (
                  <div key={year} className="year-total">
                    <span>{year}:</span><strong>{formatAccounting(totals.profitFromOperations[year])}</strong>
                  </div>
                ))}
              </div>
            </div>
            {renderInputTable('Exchange Gain / (Loss)', data.exchangeGainLoss, 'exchangeGainLoss', 'profitBeforeInterestTax', 'Profit / (Loss) Before Interest and Taxation', true)}
          </div>
        )}

        {currentStep === 2 && (
          <div className="step-pane animate-fade-in">
            {renderInputTable('Finance Costs', data.financeCosts, 'financeCosts', 'profitBeforeLevyTax', 'Profit / (Loss) Before Levy & Taxation', true)}
            {renderInputTable('Levy & Taxation', data.levyAndTaxation, 'levyAndTaxation', 'netProfit', 'Net Profit / (Loss) for the Year', true)}
          </div>
        )}
      </div>

      <div className="wizard-footer">
        <button className="btn-secondary nav-btn" onClick={() => setCurrentStep(prev => prev - 1)} disabled={currentStep === 0 || isSaving}>
          <ChevronLeft size={16} /> Back
        </button>
        
        {currentStep < STEPS.length - 1 ? (
          <button className="btn-primary nav-btn" onClick={() => setCurrentStep(prev => prev + 1)}>
            Next <ChevronRight size={16} />
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn-primary nav-btn save-btn" onClick={async () => {
              await handleSave();
              navigate('/dashboard/cash-flow-statement');
            }}>
              Next: Cash Flow Statement <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default IncomeStatementWizard;