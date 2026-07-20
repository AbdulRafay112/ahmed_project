const express = require('express');
const router = express.Router();
const Analysis = require('../../models/Analysis');
const BalanceSheet = require('../../models/BalanceSheet');
const multer = require('multer');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const upload = multer({ storage: multer.memoryStorage() });

// ── PDF EXTRACTION ENGINE ────────────────────────────────────────────────────

/**
 * Extract text items with x/y coordinates from every page.
 * Y is flipped to top-down reading order.
 */

async function extractRawItems(buffer) {
  const data = new Uint8Array(buffer);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const items = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1.0 });
    const content = await page.getTextContent();
    for (const item of content.items) {
      const text = (item.str || '').trim();
      if (!text) continue;
      items.push({
        text,
        x: Math.round(item.transform[4]),
        y: Math.round(viewport.height - item.transform[5]), // top-down
        page: p
      });
    }
  }
  return items;
}

/**
 * Group items into rows by Y proximity, then sort rows top-down
 * and items left-to-right within each row.
 */
function groupIntoRows(items, yTol = 4) {
  const rowMap = new Map();
  for (const item of items) {
    let key = null;
    for (const k of rowMap.keys()) {
      if (item.page === rowMap.get(k)[0].page && Math.abs(item.y - k) <= yTol) {
        key = k; break;
      }
    }
    if (key === null) { rowMap.set(item.y, []); key = item.y; }
    rowMap.get(key).push(item);
  }
  return Array.from(rowMap.entries())
    .sort(([ya, ia], [yb, ib]) => {
      const pa = ia[0].page, pb = ib[0].page;
      return pa !== pb ? pa - pb : ya - yb;
    })
    .map(([y, its]) => ({
      y, page: its[0].page,
      items: its.sort((a, b) => a.x - b.x),
      text: its.sort((a, b) => a.x - b.x).map(i => i.text).join(' ')
    }));
}

/** Returns true if a string looks like a financial number */
function isNumeric(str) {
  return /^[\(\-]?[\d,\.]+[\)]?$/.test(str.trim());
}

/** Parse an accounting number: (1,234) → -1234, 1,234 → 1234 */
function parseNum(str) {
  const s = str.replace(/,/g, '').trim();
  const neg = (s.startsWith('(') && s.endsWith(')')) || s.startsWith('-');
  const n = parseFloat(s.replace(/[(),-]/g, ''));
  return isNaN(n) ? null : (neg ? -n : n);
}

/**
 * Reconstruct table rows: detect year-header rows by coordinate,
 * then for each data row extract { label, values: { [year]: number } }.
 */
function reconstructTableRows(rows) {

  const tableRows = [];
  let pendingLabel = "";

  for (let i = 0; i < rows.length; i++) {

    const texts = rows[i].items
      .map(x => x.text.trim())
      .filter(Boolean);

    if (texts.length === 0) continue;

    const numericTokens = texts.filter(isNumeric);

    // Pure text row
    if (numericTokens.length === 0) {
      pendingLabel += " " + texts.join(" ");
      continue;
    }

    const lastNumber = numericTokens[numericTokens.length - 1];

    const value = parseNum(lastNumber);

    let label = (
      pendingLabel + " " +
      texts.filter(t => t !== lastNumber).join(" ")
    )
      .replace(/\s+/g, " ")
      .replace(/\s*-\s*/g, "-")
      .trim();

    pendingLabel = "";

    // Look ahead for continuation rows
    while (i + 1 < rows.length) {

      const nextTexts = rows[i + 1].items
        .map(x => x.text.trim())
        .filter(Boolean);

      const nextHasNumber = nextTexts.some(isNumeric);

      if (nextHasNumber) break;

      label += " " + nextTexts.join(" ");

      i++;
    }

    label = label
      .replace(/\s+/g, " ")
      .replace(/\s*-\s*/g, "-")
      .trim();
// Ignore year-only rows
if (
    label.length === 0 &&
    value >= 1990 &&
    value <= 2100
) {
    continue;
}
    tableRows.push({
      label,
      values: {
        CURRENT: value
      }
    });

  }

  console.log("Extracted Rows");
  console.log(tableRows);

  return tableRows;
}

// Create a new analysis
router.post('/analysis', async (req, res) => {
  const { industry, companyName } = req.body;
  try {
    const newAnalysis = new Analysis({
      industry: industry || 'Aviation',
      company_name: companyName || 'KPMG Client'
    });

    const savedAnalysis = await newAnalysis.save();
    res.json({ success: true, analysisId: savedAnalysis._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save balance sheet data
router.post('/save', async (req, res) => {
  const { analysisId, years, data } = req.body;

  if (!analysisId || !years || !data) {
    return res.status(400).json({ error: 'Missing required data' });
  }

  try {
    // 1. Ensure analysis exists (V1 Mock)
    let analysisExists = null;

    // Check if incoming analysisId is a valid 24-character hex string
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(analysisId);

    if (isValidObjectId) {
      try {
        analysisExists = await Analysis.findById(analysisId);
      } catch (err) {
        // Find failed
      }
    }

    // Agar database mein nahi mila ya valid ObjectId nahi thi (jaise numeric ID "1")
    if (!analysisExists) {
      const newAnalysis = new Analysis({
        company_name: 'KPMG Client',
        industry: 'Aviation'
      });
      analysisExists = await newAnalysis.save();
    }

    // Hamesha guaranteed valid ObjectId hamare paas hogi
    const actualAnalysisId = analysisExists._id;

    // 2. Clear old balance sheet data for this SPECIFIC valid analysis_id only!
    // Hum invalid "1" ko yahan pass hi nahi karenge taake schema cast error na aaye
    await BalanceSheet.deleteMany({ analysis_id: actualAnalysisId });

    // 3. Insert new items in bulk
    const itemsToInsert = [];

    // Helper to structure category items
    const processCategory = (categoryName, items) => {
      if (!items) return;
      items.forEach(item => {
        years.forEach(year => {
          const value = item.values[year] || 0;
          itemsToInsert.push({
            analysis_id: actualAnalysisId, // Valid database ObjectId binding
            year: year.toString(),
            category: categoryName,
            line_item: item.name,
            value: value
          });
        });
      });
    };

    processCategory('Non-Current Assets', data.nonCurrentAssets);
    processCategory('Current Assets', data.currentAssets);
    processCategory('Equity', data.equity);
    processCategory('Non-Current Liabilities', data.nonCurrentLiabilities);
    processCategory('Current Liabilities', data.currentLiabilities);

    // Agar data array khali nahi hai to database mein save karein
    if (itemsToInsert.length > 0) {
      await BalanceSheet.insertMany(itemsToInsert);
    }

    // Response mein frontend ko batana zaroori hai ke naya database ID actualAnalysisId hai
    res.json({
      success: true,
      message: 'Balance Sheet data saved successfully.',
      analysisId: actualAnalysisId
    });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ error: error.message });
  }
});

// PDF Import parser
router.post('/import-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded.' });
    }

    const yearStr = req.body.year;
    if (!yearStr) {
      return res.status(400).json({ error: 'Financial year is required.' });
    }

    const targetYear = parseInt(yearStr, 10);

    // ── Alias dictionary (unchanged) ────────────────────────────────────────
    const aliases = {
      balanceSheet: {
  'Property, Plant & Equipment': [
    'property plant and equipment',
    'property plant & equipment',
    'property, plant and equipment',
    'pp&e',
    'fixed assets'
  ],

  'Investment Property': [
    'investment property'
  ],

  'Intangibles': [
    'intangible assets',
    'intangibles',
    'goodwill'
  ],

  'Long-term Investments': [
    'long term investments',
    'long-term investments'
  ],

  'Long-term Loan to Subsidiaries': [
    'long term loan to subsidiaries',
    'long-term loan to subsidiaries'
  ],

  'Deferred Taxation (Asset)': [
    'deferred taxation asset',
    'deferred tax asset',
    'deferred taxation'
  ],

  'Long-term Deposits': [
    'long term deposits',
    'long-term deposits',
    'security deposits',
    'deposits'
  ],

  'Stores & Spares': [
    'stores and spares',
    'stores & spares',
    'inventories stores'
  ],

  'Trade Debts': [
    'trade debts',
    'trade receivables',
    'accounts receivable'
  ],

  'Advances': [
    'advances',
    'advances deposits prepayments',
    'loans and advances'
  ],

  'Trade Deposits & Short-term Prepayments': [
    'trade deposits',
    'short term prepayments',
    'prepayments'
  ],

  'Other Receivables': [
    'other receivables',
    'other receivable'
  ],

  'Short-term Investments': [
    'short term investments',
    'short-term investments'
  ],

  'Cash & Bank Balances': [
    'cash and bank balances',
    'cash & bank balances',
    'cash and cash equivalents',
    'cash at bank'
  ],

  'Current Maturity of Loan to Subsidiaries': [
    'current maturity of loan to subsidiaries'
  ],

  'Issued, Subscribed & Paid-up Share Capital': [
    'issued subscribed and paid up capital',
    'issued subscribed & paid up share capital',
    'share capital',
    'issued capital'
  ],

  'Reserves (Accumulated Losses)': [
    'capital reserves',
    'revenue reserves',
    'retained earnings',
    'unappropriated profit',
    'accumulated losses'
  ],

  'Surplus on Revaluation of PP&E': [
    'surplus on revaluation of pp&e',
    'surplus on revaluation of property plant and equipment'
  ],

  'Long-term Financing': [
    'long term financing',
    'long-term financing',
    'long term loans',
    'long term borrowings'
  ],

  'Lease Liabilities': [
    'lease liabilities',
    'obligations under finance lease'
  ],

  'Advances / Loan from Subsidiaries': [
    'advances from subsidiaries',
    'loan from subsidiaries',
    'advance from subsidiaries'
  ],

  'Deferred Liabilities': [
    'deferred liabilities',
    'deferred tax liability',
    'deferred taxation'
  ],

  'Trade & Other Payables': [
    'trade and other payables',
    'trade & other payables',
    'trade payables',
    'accounts payable'
  ],

  'Unclaimed Dividend – Preference Shares': [
    'unclaimed dividend',
    'unclaimed dividend preference shares'
  ],

  'Accrued Interest': [
    'accrued mark up',
    'accrued markup',
    'accrued interest'
  ],

  'Taxation – Net': [
    'taxation net',
    'taxation - net',
    'income tax payable',
    'income tax receivable',
    'advance tax'
  ],

  'Short-term Borrowings': [
    'short term borrowings',
    'short-term borrowings',
    'short term loans',
    'running finance'
  ],

  'Current Maturity of Non-current Liabilities': [
    'current portion of non current liabilities',
    'current maturity of non-current liabilities',
    'current maturity'
  ]

      },
     incomeStatement: {
  'Revenue - Net': [
    'revenue',
    'revenue net',
    'net revenue',
    'net sales',
    'sales',
    'turnover'
  ],

  'Aircraft Fuel': [
    'aircraft fuel',
    'fuel expense',
    'fuel cost'
  ],

  'Other Cost of Services': [
    'other cost of services',
    'cost of services',
    'cost of sales',
    'cost of goods sold'
  ],

  'Distribution Costs': [
    'distribution costs',
    'selling expenses'
  ],

  'Administrative Expenses': [
    'administrative expenses',
    'admin expenses',
    'general and administrative expenses'
  ],

  'Other Provisions and Adjustments - Net': [
    'other provisions and adjustments net',
    'other provisions',
    'adjustments net'
  ],

  'Other Income - Net': [
    'other income net',
    'other income',
    'other operating income'
  ],

  'Exchange Gain / (Loss) - Net': [
    'exchange gain loss net',
    'exchange gain',
    'exchange loss',
    'foreign exchange gain loss'
  ],

  'Finance Costs': [
    'finance costs',
    'finance cost',
    'financial charges'
  ],

  'Levy - Minimum Tax': [
    'levy minimum tax',
    'minimum tax',
    'levy'
  ],

  'Taxation': [
    'taxation',
    'income tax expense',
    'tax expense',
    'income tax'
  ]

      },
    cashFlowStatement: {

  // Operating Activities
  'Cash Generated from Operations': [
    'cash generated from operations',
    'net cash from operating activities',
    'cash flow from operating activities'
  ],

  'Profit on Bank Deposits Received': [
    'profit on bank deposits received',
    'interest received',
    'profit on deposits'
  ],

  'Finance Costs Paid': [
    'finance costs paid',
    'finance cost paid',
    'interest paid'
  ],

  'Taxes Paid': [
    'taxes paid',
    'income tax paid',
    'tax paid'
  ],

  'Staff Retirement Benefits Paid': [
    'staff retirement benefits paid',
    'gratuity paid',
    'retirement benefits'
  ],

  'Advance to Subsidiaries': [
    'advance to subsidiaries',
    'loans to subsidiaries',
    'advances to subsidiaries'
  ],

  'Long-term Deposits and Prepayments – Net': [
    'long term deposits and prepayments net',
    'long-term deposits and prepayments',
    'long term deposits'
  ],


  // Investing Activities
  'Purchase of Property, Plant and Equipment': [
    'purchase of property plant and equipment',
    'capital expenditure',
    'additions to pp&e',
    'purchase of fixed assets'
  ],

  'Purchase of Intangible Assets': [
    'purchase of intangible assets',
    'additions to intangible assets'
  ],

  'Advance Paid to Subsidiary': [
    'advance paid to subsidiary',
    'advances paid to subsidiaries'
  ],

  'Proceeds from Sale of PP&E': [
    'proceeds from sale of pp&e',
    'proceeds from disposal of property plant and equipment',
    'sale of fixed assets'
  ],


  // Financing Activities
  'Repayment of Long-term Financing': [
    'repayment of long term financing',
    'repayment of long-term loans',
    'repayment of borrowings'
  ],

  'Proceeds from Long-term Financing': [
    'proceeds from long term financing',
    'receipts from long-term loans',
    'long term financing obtained'
  ],

  'Proceeds from Short-term Borrowings': [
    'proceeds from short term borrowings',
    'short term borrowings net',
    'short term loans received'
  ],

  'Repayment of Lease Liabilities': [
    'repayment of lease liabilities',
    'payment of lease liabilities',
    'lease payments'
  ],


  // Cash & Cash Equivalents
  'Cash and Cash Equivalents – Beginning of Year': [
    'cash and cash equivalents at beginning of year',
    'cash and cash equivalents beginning of year',
    'cash and cash equivalents at the beginning of the year',
    'opening cash and cash equivalents'
  ]
}
    };

    // ── Step 1-3: Extract & group items into rows ────────────────────────────
    console.log('\n[PDF.JS] Extracting items with coordinates...');
    const rawItems = await extractRawItems(req.file.buffer);
    const rows = groupIntoRows(rawItems);
    console.log(`[PDF.JS] ${rawItems.length} items → ${rows.length} rows`);

    // ── Step 4-6: Reconstruct table rows (label + year values) ───────────────
    const tableRows = reconstructTableRows(rows);
    console.log(`[PDF.JS] ${tableRows.length} table rows reconstructed`);

    // ── Step 7: Alias matching (logic preserved, better input) ───────────────
const normalize = (str) =>
  str
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/-/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
    const finalMappings = { balanceSheet: {}, incomeStatement: {}, cashFlowStatement: {} };
    const possibleMappings = { balanceSheet: {}, incomeStatement: {}, cashFlowStatement: {} };

    for (const [stmtKey, dictAliases] of Object.entries(aliases)) {
      console.log(`\n--- Matching ${stmtKey.toUpperCase()} ---`);
      for (const row of tableRows) {
        const normLabel = normalize(row.label);
        if (!normLabel)
    continue;
        let extractedVal =
    row.values[targetYear] ??
    row.values[String(targetYear)] ??
    row.values.CURRENT;

if (extractedVal === undefined || extractedVal === null)
    continue;
        for (const [canonicalField, aliasList] of Object.entries(dictAliases)) {
          if (finalMappings[stmtKey][canonicalField] !== undefined) continue;

          const exactMatch = aliasList.some(alias => normalize(alias) === normLabel);
          if (exactMatch) {
            console.log(`[HIGH] ${canonicalField} = ${extractedVal}`);
            finalMappings[stmtKey][canonicalField] = extractedVal;
            delete possibleMappings[stmtKey][canonicalField];
            break;
          }

         const partialMatch = aliasList.some(alias => {

    const a = normalize(alias);

    if (normLabel.length < 4)
        return false;

    return (
        normLabel.includes(a) ||
        a.includes(normLabel)
    );

});
          if (partialMatch && possibleMappings[stmtKey][canonicalField] === undefined) {
            console.log(`[LOW] ${canonicalField} = ${extractedVal} ("${row.label}")`);
            possibleMappings[stmtKey][canonicalField] = extractedVal;
          }
        }
      }
    } res.json({
      success: true,
      message: 'PDF successfully parsed.',
      finalMappings,
      possibleMappings
    });
  } catch (error) {
    console.error('PDF parsing error:', error);
    res.status(500).json({ error: 'Failed to parse PDF document.' });
  }
});

// DEBUG: returns raw pdfjs extraction so we can diagnose layout
router.post('/debug-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file.' });
    const rawItems = await extractRawItems(req.file.buffer);
    const rows = groupIntoRows(rawItems);

    // Return first 120 rows with full item details
    const sampleRows = rows.slice(0, 120).map(r => ({
      y: r.y, page: r.page,
      text: r.text,
      items: r.items.map(i => ({ text: i.text, x: i.x, y: i.y }))
    }));

    // Which rows look like year headers?
    const yearRows = rows.filter(r =>
      r.items.some(i => /^\d{4}$/.test(i.text) && +i.text >= 1990 && +i.text <= 2040)
    ).map(r => ({ y: r.y, page: r.page, text: r.text }));

    res.json({ totalItems: rawItems.length, totalRows: rows.length, yearHeaderRows: yearRows, sampleRows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
module.exports = router;