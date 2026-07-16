import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';
import { formatAccounting } from '../utils/format';
import './BalanceSheetWizard.css';

const STEPS = ['Assets', 'Equity', 'Liabilities', 'Review'];

// Define Line Items
const lineItems = {
  nonCurrentAssets: [
    'Property, Plant & Equipment', 'Investment Property', 'Intangibles', 
    'Long-term Investments', 'Long-term Loan to Subsidiaries', 'Deferred Taxation (Asset)', 'Long-term Deposits'
  ],
  currentAssets: [
    'Stores & Spares', 'Trade Debts', 'Advances', 'Trade Deposits & Short-term Prepayments', 
    'Other Receivables', 'Short-term Investments', 'Cash & Bank Balances', 'Current Maturity of Loan to Subsidiaries'
  ],
  equity: [
    'Issued, Subscribed & Paid-up Share Capital', 'Reserves (Accumulated Losses)', 'Surplus on Revaluation of PP&E'
  ],
  nonCurrentLiabilities: [
    'Long-term Financing', 'Lease Liabilities', 'Advances / Loan from Subsidiaries', 'Deferred Liabilities'
  ],
  currentLiabilities: [
    'Trade & Other Payables', 'Unclaimed Dividend – Preference Shares', 'Accrued Interest', 'Taxation – Net', 
    'Short-term Borrowings', 'Current Maturity of Non-current Liabilities'
  ]
};

const BalanceSheetWizard = ({ config, setConfig }) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  
  // Track focus targets when navigating steps via Enter key
  const [focusTarget, setFocusTarget] = useState(null);

  // Initial State Data Structure
  const getInitialState = (items) => {
    return items.map(name => {
      const values = {};
      config.years.forEach(year => values[year] = '');
      return { name, values };
    });
  };

  const [data, setData] = useState(() => {
    const savedData = localStorage.getItem('kpmgBalanceSheetData');
    if (savedData) {
      try {
        return JSON.parse(savedData);
      } catch (e) {
        console.error("Failed to parse balance sheet data from localStorage");
      }
    }
    return {
      nonCurrentAssets: getInitialState(lineItems.nonCurrentAssets),
      currentAssets: getInitialState(lineItems.currentAssets),
      equity: getInitialState(lineItems.equity),
      nonCurrentLiabilities: getInitialState(lineItems.nonCurrentLiabilities),
      currentLiabilities: getInitialState(lineItems.currentLiabilities)
    };
  });

  const [totals, setTotals] = useState({
    nonCurrentAssets: {}, currentAssets: {}, totalAssets: {},
    totalEquity: {}, nonCurrentLiabilities: {}, currentLiabilities: {},
    totalEquityAndLiabilities: {}
  });

  // Calculate totals whenever data changes
  useEffect(() => {
    if (!config.years || config.years.length === 0) {
        navigate('/dashboard'); // Redirect if no years selected
        return;
    }

    const newTotals = {
      nonCurrentAssets: {}, currentAssets: {}, totalAssets: {},
      totalEquity: {}, nonCurrentLiabilities: {}, currentLiabilities: {},
      totalEquityAndLiabilities: {}
    };

    config.years.forEach(year => {
      // Helper to sum a section
      const sumSection = (sectionData) => sectionData.reduce((acc, item) => acc + (parseFloat(item.values[year]) || 0), 0);

      newTotals.nonCurrentAssets[year] = sumSection(data.nonCurrentAssets);
      newTotals.currentAssets[year] = sumSection(data.currentAssets);
      newTotals.totalAssets[year] = newTotals.nonCurrentAssets[year] + newTotals.currentAssets[year];

      newTotals.totalEquity[year] = sumSection(data.equity);
      newTotals.nonCurrentLiabilities[year] = sumSection(data.nonCurrentLiabilities);
      newTotals.currentLiabilities[year] = sumSection(data.currentLiabilities);
      
      newTotals.totalEquityAndLiabilities[year] = newTotals.totalEquity[year] + newTotals.nonCurrentLiabilities[year] + newTotals.currentLiabilities[year];
    });

    setTotals(newTotals);

    // Save to localStorage
    localStorage.setItem('kpmgBalanceSheetData', JSON.stringify({ ...data, totals: newTotals }));

    // Update global config with Total Assets for Dashboard KPI (Real-time sync)
    setConfig(prev => ({
      ...prev,
      totalAssets: newTotals.totalAssets
    }));

  }, [data, config.years, setConfig]);

  // Handle beforeunload to warn about unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = ''; // Prompt warning
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Handle cross-step auto-focus
  useEffect(() => {
    if (focusTarget) {
      // Allow DOM to render the new step before querying inputs
      const timer = setTimeout(() => {
        const inputs = Array.from(document.querySelectorAll('.financial-input'));
        if (inputs.length > 0) {
          if (focusTarget === 'first') {
            inputs[0].focus();
            inputs[0].select();
          } else if (focusTarget === 'last') {
            inputs[inputs.length - 1].focus();
            inputs[inputs.length - 1].select();
          }
        }
        setFocusTarget(null);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [currentStep, focusTarget]);

  const handleInputChange = (section, index, year, value) => {
    // Only allow numbers, decimals and empty
    if (value !== '' && !/^-?\d*\.?\d*$/.test(value)) return;

    setIsDirty(true); // Mark as unsaved
    setData(prev => {
      const newData = { ...prev };
      newData[section][index].values[year] = value;
      return newData;
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      const activeElement = document.activeElement;
      
      // Ensure we are inside a financial input
      if (!activeElement.classList.contains('financial-input')) return;

      const inputs = Array.from(document.querySelectorAll('.financial-input'));
      const currentIndex = inputs.indexOf(activeElement);

      if (currentIndex !== -1) {
        e.preventDefault(); // Prevent default Enter behavior

        if (e.shiftKey) {
          // Move backward
          if (currentIndex > 0) {
            inputs[currentIndex - 1].focus();
            inputs[currentIndex - 1].select();
          } else if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
            setFocusTarget('last'); // Tell the effect to focus the last input of the previous step
          }
        } else {
          // Move forward
          if (currentIndex < inputs.length - 1) {
            inputs[currentIndex + 1].focus();
            inputs[currentIndex + 1].select();
          } else if (currentStep < 2) { 
            // 2 is Liabilities step, index 3 is Review which has no inputs
            setCurrentStep(prev => prev + 1);
            setFocusTarget('first'); // Tell the effect to focus the first input of the next step
          } else {
            // Reached the end of the entire form
            activeElement.blur();
          }
        }
      }
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setNotification('');
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/balance-sheet/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId: 1, // Mock analysis ID for V1
          years: config.years,
          data: { ...data, totals }
        })
      });
      const result = await response.json();
      if (result.success) {
        setIsDirty(false); // Data saved successfully
        setNotification('Balance Sheet saved successfully! Moving to Income Statement...');
        setTimeout(() => {
          navigate('/dashboard/income-statement');
        }, 1500);
      } else {
        setNotification(result.error || 'Error saving data. Please try again.');
      }
    } catch (error) {
      console.error(error);
      setNotification('Failed to connect to server. Please check your connection.');
    }
    setIsSaving(true); // Kept layout state locked while transitioning
    setIsSaving(false);
  };

  const renderInputTable = (title, sectionData, sectionKey, totalKey, totalLabel) => (
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
                    <input 
                      type="text" 
                      className="financial-input"
                      value={item.values[year] || ''}
                      onChange={(e) => handleInputChange(sectionKey, index, year, e.target.value)}
                      placeholder="0.00"
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="total-row">
              <td>{totalLabel}</td>
              {config.years.map(year => (
                <td key={year}>
                  {/* FIXED: Optional chaining added to prevent crash if totals[totalKey] is initially empty */}
                  {formatAccounting(totals[totalKey]?.[year])}
                </td>
              ))}
            </tr>
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
            <h1 className="page-title">Balance Sheet</h1>
            <p className="page-subtitle">Enter financial statement data</p>
          </div>
          <div className="unit-indicator badge glass">
            All amounts are presented in <strong>PKR ('000)</strong>
          </div>
        </div>
      </div>

      {notification && (
        <div className={`notification ${notification.includes('success') ? 'success' : 'error'}`}>
          <CheckCircle size={20} />
          <span>{notification}</span>
        </div>
      )}

      {/* Progress Indicator */}
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

      {/* Wizard Steps */}
      <div className="wizard-content">
        {currentStep === 0 && (
          <div className="step-pane animate-fade-in">
            {renderInputTable('Non-Current Assets', data.nonCurrentAssets, 'nonCurrentAssets', 'nonCurrentAssets', 'Total Non-Current Assets')}
            {renderInputTable('Current Assets', data.currentAssets, 'currentAssets', 'currentAssets', 'Total Current Assets')}
            
            <div className="grand-total-row glass">
              <h3>TOTAL ASSETS</h3>
              <div className="grand-total-values">
                {config.years.map(year => (
                  <div key={year} className="year-total">
                    <span>{year}:</span>
                    <strong>{formatAccounting(totals.totalAssets[year])}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {currentStep === 1 && (
          <div className="step-pane animate-fade-in">
            {renderInputTable('Equity', data.equity, 'equity', 'totalEquity', 'Total Equity')}
          </div>
        )}

        {currentStep === 2 && (
          <div className="step-pane animate-fade-in">
            {renderInputTable('Non-Current Liabilities', data.nonCurrentLiabilities, 'nonCurrentLiabilities', 'nonCurrentLiabilities', 'Total Non-Current Liabilities')}
            {renderInputTable('Current Liabilities', data.currentLiabilities, 'currentLiabilities', 'currentLiabilities', 'Total Current Liabilities')}

            <div className="grand-total-row glass">
              <h3>TOTAL EQUITY & LIABILITIES</h3>
              <div className="grand-total-values">
                {config.years.map(year => (
                  <div key={year} className="year-total">
                    <span>{year}:</span>
                    <strong className={totals.totalEquityAndLiabilities[year] !== totals.totalAssets[year] ? 'error-text' : ''}>
                      {formatAccounting(totals.totalEquityAndLiabilities[year])}
                    </strong>
                  </div>
                ))}
              </div>
              <p className="validation-note">
                * Total Equity & Liabilities must equal Total Assets. 
              </p>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="step-pane animate-fade-in review-pane">
            <div className="glass padding-lg">
              <h2>Balance Sheet Complete</h2>
              <p>Please ensure all data has been entered correctly. Proceeding will save this section and move you to the Income Statement module.</p>
              
              <div className="balance-check">
                <h3>Balance Check</h3>
                {config.years.map(year => {
                  const isBalanced = Math.abs((totals.totalAssets[year] || 0) - (totals.totalEquityAndLiabilities[year] || 0)) < 0.01;
                  return (
                    <div key={year} className={`balance-item ${isBalanced ? 'balanced' : 'unbalanced'}`}>
                      <span>{year}:</span>
                      {isBalanced ? <span>Balanced</span> : <span>Unbalanced (Diff: {Math.abs(totals.totalAssets[year] - totals.totalEquityAndLiabilities[year]).toFixed(2)})</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Controls */}
      <div className="wizard-footer">
        <button 
          className="btn-secondary nav-btn" 
          onClick={() => setCurrentStep(prev => prev - 1)}
          disabled={currentStep === 0 || isSaving}
        >
          <ChevronLeft size={16} /> Back
        </button>
        
        {currentStep < STEPS.length - 1 ? (
          <button 
            className="btn-primary nav-btn" 
            onClick={() => setCurrentStep(prev => prev + 1)}
          >
            Next <ChevronRight size={16} />
          </button>
        ) : (
          <button 
            className="btn-primary nav-btn save-btn" 
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : <>Next: Income Statement <ChevronRight size={16} /></>}
          </button>
        )}
      </div>
    </div>
  );
};

export default BalanceSheetWizard;