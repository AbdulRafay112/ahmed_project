import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle, XCircle, AlertTriangle, FileText, ChevronRight } from 'lucide-react';
import './PDFImporter.css';
import { formatAccounting } from '../utils/format';

const dictionaries = {
  balanceSheet: [
  'Property, Plant & Equipment',
  'Investment Property',
  'Intangibles',
  'Long-term Investments',
  'Long-term Loan to Subsidiaries',
  'Deferred Taxation (Asset)',
  'Long-term Deposits',

  'Stores & Spares',
  'Trade Debts',
  'Advances',
  'Trade Deposits & Short-term Prepayments',
  'Other Receivables',
  'Short-term Investments',
  'Cash & Bank Balances',
  'Current Maturity of Loan to Subsidiaries',

  'Issued, Subscribed & Paid-up Share Capital',
  'Reserves (Accumulated Losses)',
  'Surplus on Revaluation of PP&E',

  'Long-term Financing',
  'Lease Liabilities',
  'Advances / Loan from Subsidiaries',
  'Deferred Liabilities',

  'Trade & Other Payables',
  'Unclaimed Dividend – Preference Shares',
  'Accrued Interest',
  'Taxation – Net',
  'Short-term Borrowings',
  'Current Maturity of Non-current Liabilities'
],
  incomeStatement: [
    'Revenue', 'Revenue - Net', 'Cost of Services', 'Gross Profit',
    'Administrative Expenses', 'Other Income', 'Other Operating Expenses',
    'Finance Cost', 'Profit Before Taxation', 'Taxation', 'Profit After Taxation',
    'Earnings Per Share'
  ],
  cashFlowStatement: [
  // Operating Activities
  'Cash Generated from Operations',
  'Profit on Bank Deposits Received',
  'Finance Costs Paid',
  'Taxes Paid',
  'Staff Retirement Benefits Paid',
  'Advance to Subsidiaries',
  'Long-term Deposits and Prepayments – Net',

  // Investing Activities
  'Purchase of Property, Plant and Equipment',
  'Purchase of Intangible Assets',
  'Advance Paid to Subsidiary',
  'Proceeds from Sale of PP&E',

  // Financing Activities
  'Repayment of Long-term Financing',
  'Proceeds from Long-term Financing',
  'Proceeds from Short-term Borrowings',
  'Repayment of Lease Liabilities',

  // Cash & Cash Equivalents
  'Cash and Cash Equivalents – Beginning of Year'
]
};

const PDFImporter = ({ availableYears, onImportComplete }) => {
  const [file, setFile] = useState(null);
  const [selectedYear, setSelectedYear] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [reviewData, setReviewData] = useState(null);
  const [possibleData, setPossibleData] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('balanceSheet');
  const [importSuccessStats, setImportSuccessStats] = useState(null);
  const [showPossibleSelection, setShowPossibleSelection] = useState(false);
  const [selectedPossible, setSelectedPossible] = useState({
    balanceSheet: {}, incomeStatement: {}, cashFlowStatement: {}
  });
  
  
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected && selected.type === 'application/pdf') {
      setFile(selected);
      setError('');
    } else {
      setError('Please select a valid PDF file.');
      setFile(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }
    if (!selectedYear) {
      setError('Please select a financial year.');
      return;
    }

    setIsUploading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('year', selectedYear);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/balance-sheet/import-pdf`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        setReviewData(result.finalMappings);
        setPossibleData(result.possibleMappings || { balanceSheet: {}, incomeStatement: {}, cashFlowStatement: {} });
      } else {
        setError(result.error || 'Failed to parse PDF.');
      }
    } catch (err) {
      console.error(err);
      setError('Server connection error. Ensure the backend is running.');
    }
    
    setIsUploading(false);
  };

  const handleConfirm = () => {
    if (!reviewData) return;
    
    let matchedCount = 0;
    let missingCount = 0;
    
    Object.keys(dictionaries).forEach(stmt => {
      dictionaries[stmt].forEach(item => {
        if (reviewData[stmt][item] !== undefined) matchedCount++;
        else missingCount++;
      });
    });

    setImportSuccessStats({
      matched: matchedCount,
      missing: missingCount,
      imported: matchedCount
    });

    // We do NOT unmount immediately, we show the success message first.
    // Call the parent to do the actual state updates quietly.
    onImportComplete(reviewData, selectedYear);
  };

  const renderReviewTable = (statementKey, title) => {
    const dict = dictionaries[statementKey];
    const mappings = reviewData[statementKey];
    const possibleMappings = possibleData[statementKey];
    
    let matched = 0;
    let missing = 0;
    let possible = 0;
    
    dict.forEach(item => {
      if (mappings[item] !== undefined) matched++;
      else if (possibleMappings && possibleMappings[item] !== undefined) possible++;
      else missing++;
    });

    return (
      <div className="review-tab-content">
        <div className="review-stats">
          <div className="stat-pill success">
            <CheckCircle size={16} /> {matched} Matched
          </div>
          {possible > 0 && (
            <div className="stat-pill warning">
              <AlertTriangle size={16} /> {possible} Possible
            </div>
          )}
          <div className="stat-pill error">
            <XCircle size={16} /> {missing} Missing
          </div>
        </div>
        
        <div className="review-table-container">
          <table className="review-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Line Item</th>
                <th>Extracted Value</th>
              </tr>
            </thead>
            <tbody>
              {dict.map(item => {
                const val = mappings[item];
                const isMatched = val !== undefined;
                const possibleVal = possibleMappings ? possibleMappings[item] : undefined;
                const isPossible = !isMatched && possibleVal !== undefined;
                
                let icon = <span className="status-icon missing"><XCircle size={18}/></span>;
                let displayVal = '---';
                let style = { color: '#64748b' };
                let label = 'Missing';

                if (isMatched) {
                   icon = <span className="status-icon matched"><CheckCircle size={18}/></span>;
                   displayVal = formatAccounting(val);
                   style = { fontWeight: 'bold', color: 'white' };
                   label = 'Matched';
                } else if (isPossible) {
                   icon = <span className="status-icon warning" style={{ color: '#fbbf24' }}><AlertTriangle size={18}/></span>;
                   displayVal = formatAccounting(possibleVal);
                   style = { color: '#fbbf24' };
                   label = 'Possible (Review Needed)';
                }

                return (
                  <tr key={item}>
                    <td title={label}>{icon}</td>
                    <td>{item}</td>
                    <td style={style}>{displayVal}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="pdf-importer-container animate-fade-in">
      <div className="pdf-importer-header">
        <h2><FileText size={24} color="var(--color-primary)" /> Import Annual Report PDF</h2>
      </div>

      {importSuccessStats ? (
        <div className="success-message-panel">
          <h3><CheckCircle size={24} /> PDF processed successfully.</h3>
          <p><strong>{importSuccessStats.matched + importSuccessStats.missing}</strong> total fields analyzed.</p>
          <p><strong>{importSuccessStats.matched}</strong> values matched.</p>
          <p><strong>{importSuccessStats.imported}</strong> values imported.</p>
          <p><strong>{importSuccessStats.missing}</strong> fields require manual review.</p>
        </div>
      ) : !reviewData ? (
        <>
          <div 
            className="pdf-upload-zone"
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept=".pdf"
              onChange={handleFileChange}
            />
            <UploadCloud size={48} className="pdf-upload-icon" />
            {file ? (
              <h3>{file.name}</h3>
            ) : (
              <>
                <h3>Click to browse or drag PDF here</h3>
                <p>Upload a single Annual Report PDF containing all financial statements.</p>
              </>
            )}
          </div>

          {error && <div className="notification error" style={{ marginBottom: '20px' }}><AlertTriangle size={18} /> {error}</div>}

          <div className="pdf-controls">
            <div className="year-select-group">
              <label>Which financial year does this PDF belong to?</label>
              <select 
                className="year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                <option value="">Select Year...</option>
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            
            <button 
              className="btn-primary" 
              onClick={handleUpload}
              disabled={isUploading || !file || !selectedYear}
              style={{ padding: '12px 24px', height: '42px' }}
            >
              {isUploading ? 'Parsing PDF...' : 'Extract Data'}
            </button>
          </div>
        </>
      ) : (
        <div className="pdf-review-section animate-fade-in">
          <h3>Review Extracted Data</h3>
          <p style={{ color: '#94a3b8', marginBottom: '20px' }}>
            Please review the extracted data before importing it into the statements.
          </p>

          <div className="statement-tabs">
            <div className={`statement-tab ${activeTab === 'balanceSheet' ? 'active' : ''}`} onClick={() => setActiveTab('balanceSheet')}>
              Balance Sheet
            </div>
            <div className={`statement-tab ${activeTab === 'incomeStatement' ? 'active' : ''}`} onClick={() => setActiveTab('incomeStatement')}>
              Income Statement
            </div>
            <div className={`statement-tab ${activeTab === 'cashFlowStatement' ? 'active' : ''}`} onClick={() => setActiveTab('cashFlowStatement')}>
              Cash Flow
            </div>
          </div>

          {activeTab === 'balanceSheet' && renderReviewTable('balanceSheet', 'Balance Sheet')}
          {activeTab === 'incomeStatement' && renderReviewTable('incomeStatement', 'Income Statement')}
          {activeTab === 'cashFlowStatement' && renderReviewTable('cashFlowStatement', 'Cash Flow Statement')}

          <div className="review-actions">
            <button className="btn-secondary" onClick={() => setReviewData(null)}>Cancel & Retry</button>
            <button className="btn-primary" onClick={handleConfirm}>
              Confirm & Import <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PDFImporter;
