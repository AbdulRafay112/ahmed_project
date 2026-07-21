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

  // ─── NON-CURRENT ASSETS ───────────────────────────────────────

  'Property, Plant & Equipment': [
    'property plant and equipment',
    'property plant & equipment',
    'property, plant and equipment',
    'pp&e',
    'fixed assets',
    // ── Generic Aviation ──
    'aircraft and engines',
    'flight equipment',
    'flight equipment net',
    'owned aircraft',
    'aircraft fleet',
    'rotable spare parts',
    'ground support equipment',
    'aircraft and related equipment',
    'aviation equipment',
    'aeronautical equipment',
    'fleet assets',
    'aircraft components',
    // ── Emirates ──
    'aircraft and spare engines',
    'owned and finance leased aircraft',
    'property plant equipment and right of use assets',
    'aircraft simulators',
    'cabin equipment',
    // ── Qatar Airways ──
    'aircraft spare engines and parts',
    'advance payments for aircraft and spare engines',
    'passenger aircraft',
    'freighter aircraft',
    // ── Lufthansa ──
    'aircraft and reserve engines',
    'flight equipment and spare parts',
    'technical equipment and machinery',
    'repairable spare parts',
    // ── British Airways / IAG ──
    'owned property plant and equipment',
    'passenger aircraft fleet',
    'cargo aircraft fleet',
    'aircraft modifications',
    // ── Singapore Airlines ──
    'aircraft and related flight equipment',
    'aircraft spares and spares on order',
    'workshop and ground equipment',
    // ── Delta / US Carriers ──
    'flight equipment net',
    'flight equipment owned',
    'flight equipment under finance lease',
    'ground property and equipment',
    'advance payments for equipment',
    // ── Turkish Airlines ──
    'aircraft',
    'engines',
    'aircraft and aircraft related costs',
    'simulation devices',
    // ── Ryanair ──
    'aircraft and aircraft equipment',
    'boeing 737 aircraft',
    'property plant and equipment net'
  ],

  'Investment Property': [
    'investment property',
    // ── Emirates ──
    'investment properties',
    'hotel properties',
    'dnata investment properties',
    // ── Aviation-specific ──
    'airport terminal property',
    'hangar investment property',
    'cargo terminal investment property'
  ],

  'Intangibles': [
    'intangible assets',
    'intangibles',
    'goodwill',
    // ── Generic Aviation ──
    'landing rights',
    'route licenses',
    'slot rights',
    'air traffic rights',
    'airport slots',
    'traffic rights',
    'airline certificates',
    'operating licenses',
    'brand and route rights',
    // ── Emirates ──
    'goodwill and intangible assets',
    'brand name',
    'customer relationships',
    'software and it systems',
    // ── Qatar Airways ──
    'goodwill on consolidation',
    'route rights and licences',
    'computer software',
    // ── Lufthansa ──
    'goodwill',
    'other intangible assets',
    'advance payments on intangible assets',
    'software licenses',
    'customer base',
    // ── British Airways / IAG ──
    'landing rights and slots',
    'airline slots',
    'loyalty programme intangibles',
    'computer software intangibles',
    // ── Singapore Airlines ──
    'intangible assets',
    'software costs',
    'profitable contracts',
    // ── Delta / US Carriers ──
    'goodwill',
    'identifiable intangibles net',
    'airport slots and routes',
    'delta sky miles program intangible',
    'marketing agreements',
    // ── Turkish Airlines ──
    'intangible assets',
    'rights',
    'software',
    // ── Ryanair ──
    'intangible assets',
    'computer software net'
  ],

  'Long-term Investments': [
    'long term investments',
    'long-term investments',
    // ── Emirates ──
    'investments in subsidiaries',
    'investments in associates',
    'investments in joint ventures',
    'equity accounted investments',
    'other investments',
    // ── Qatar Airways ──
    'investment in associates',
    'investment in joint ventures',
    'available for sale investments',
    // ── Lufthansa ──
    'investments accounted for using equity method',
    'equity investments',
    'financial assets measured at fair value',
    // ── British Airways / IAG ──
    'investments in associates and joint ventures',
    'financial assets at fair value',
    // ── Singapore Airlines ──
    'investment in subsidiary companies',
    'investment in associated companies',
    'investment in joint venture companies',
    'long term investments',
    // ── Delta / US Carriers ──
    'equity investments in regional carriers',
    'equity method investments',
    'other investments',
    // ── Turkish Airlines ──
    'financial investments',
    'investments accounted by equity method'
  ],

  'Long-term Loan to Subsidiaries': [
    'long term loan to subsidiaries',
    'long-term loan to subsidiaries',
    // ── Emirates ──
    'loans to subsidiaries',
    'loans to related parties',
    'intercompany loan receivable',
    // ── Qatar Airways ──
    'loans to subsidiaries',
    'amount due from related parties non current'
  ],

  'Deferred Taxation (Asset)': [
    'deferred taxation asset',
    'deferred tax asset',
    'deferred taxation',
    // ── Emirates ──
    'deferred income tax asset',
    'deferred tax assets net',
    // ── Lufthansa ──
    'deferred tax assets',
    'deferred income taxes',
    // ── British Airways / IAG ──
    'deferred tax asset',
    'deferred tax on pension obligations',
    // ── Delta / US Carriers ──
    'deferred income taxes non current',
    'net deferred tax asset',
    // ── Turkish Airlines ──
    'deferred tax assets',
    // ── Singapore Airlines ──
    'deferred tax assets'
  ],

  'Long-term Deposits': [
    'long term deposits',
    'long-term deposits',
    'security deposits',
    'deposits',
    // ── Generic Aviation ──
    'aircraft lease security deposits',
    'maintenance reserve deposits',
    'engine maintenance reserves',
    'lessor security deposits',
    'aircraft security deposits',
    'lease deposits',
    'return condition reserves',
    'supplemental rent deposits',
    // ── Emirates ──
    'aircraft lease deposits',
    'security and other deposits',
    'lease security deposits non current',
    // ── Qatar Airways ──
    'aircraft deposits',
    'maintenance reserves non current',
    'security deposits non current',
    // ── Lufthansa ──
    'other financial assets non current',
    'lease deposits non current',
    // ── British Airways / IAG ──
    'other receivables non current',
    'deposits and other assets',
    // ── Singapore Airlines ──
    'long term deposits',
    'non current deposits',
    // ── Delta / US Carriers ──
    'cash restricted non current',
    'lease deposits non current',
    'other assets non current',
    // ── Turkish Airlines ──
    'other non current assets',
    'deposits given'
  ],

  // ─── CURRENT ASSETS ───────────────────────────────────────────

  'Stores & Spares': [
    'stores and spares',
    'stores & spares',
    'inventories stores',
    // ── Generic Aviation ──
    'aircraft spares and consumables',
    'rotable and expendable parts',
    'aircraft parts and supplies',
    'aviation fuel inventory',
    'expendable spare parts',
    'aircraft inventories',
    'technical stores',
    'engineering stores',
    'maintenance inventories',
    'spare parts inventory',
    // ── Emirates ──
    'aircraft expendables and consumables',
    'inventories',
    'engineering spares',
    'catering inventories',
    // ── Qatar Airways ──
    'aircraft spare parts and consumables',
    'inventories',
    // ── Lufthansa ──
    'inventories',
    'spare parts and supplies',
    'inventories and spare parts',
    // ── British Airways / IAG ──
    'inventories',
    'engineering inventories',
    // ── Singapore Airlines ──
    'spare parts and stores',
    'inventories',
    // ── Delta / US Carriers ──
    'spare parts and supplies net',
    'expendable parts and supplies net',
    // ── Turkish Airlines ──
    'inventories',
    'spare parts',
    // ── Ryanair ──
    'inventories',
    'aircraft parts and consumables'
  ],

  'Trade Debts': [
    'trade debts',
    'trade receivables',
    'accounts receivable',
    // ── Generic Aviation ──
    'passenger receivables',
    'cargo receivables',
    'airline receivables',
    'interline receivables',
    'travel agent receivables',
    'bsp receivables',
    'billing and settlement plan receivables',
    'freight receivables',
    // ── Emirates ──
    'trade and other receivables',
    'receivables from related parties',
    'interline trade receivables',
    // ── Qatar Airways ──
    'trade receivables',
    'amounts due from airlines',
    'cargo receivables',
    // ── Lufthansa ──
    'trade receivables and other receivables',
    'trade accounts receivable',
    // ── British Airways / IAG ──
    'trade receivables',
    'amounts due from related parties',
    // ── Singapore Airlines ──
    'trade debtors',
    'amounts owing by related companies',
    // ── Delta / US Carriers ──
    'accounts receivable net',
    'passenger ticket receivables',
    'cargo receivables',
    // ── Turkish Airlines ──
    'trade receivables',
    'receivables from related parties',
    // ── Ryanair ──
    'trade receivables',
    'amounts due from customers'
  ],

  'Advances': [
    'advances',
    'advances deposits prepayments',
    'loans and advances',
    // ── Generic Aviation ──
    'advance to fuel suppliers',
    'crew advances',
    'advance payments to vendors',
    'advance to catering suppliers',
    'pre-delivery payments',
    'pdp aircraft advances',
    'advance payments for aircraft',
    // ── Emirates ──
    'advances and prepayments',
    'advance payments to suppliers',
    // ── Qatar Airways ──
    'advance payments',
    'prepayments and other receivables',
    // ── Lufthansa ──
    'advance payments made',
    'prepayments and accrued income',
    // ── British Airways / IAG ──
    'prepayments and accrued income',
    // ── Singapore Airlines ──
    'advance payments to suppliers',
    'deposits and prepayments',
    // ── Delta / US Carriers ──
    'prepaid expenses and other current assets',
    'advance purchase deposits',
    // ── Turkish Airlines ──
    'advances given',
    'prepaid expenses',
    // ── Ryanair ──
    'prepayments'
  ],

  'Trade Deposits & Short-term Prepayments': [
    'trade deposits',
    'short term prepayments',
    'prepayments',
    // ── Generic Aviation ──
    'prepaid landing fees',
    'prepaid aircraft insurance',
    'prepaid maintenance contracts',
    'advance lease payments',
    'prepaid route charges',
    // ── Emirates ──
    'prepaid expenses',
    'prepaid lease deposits current',
    // ── Lufthansa ──
    'current prepayments',
    // ── Delta / US Carriers ──
    'prepaid expenses current',
    'prepaid fuel costs'
  ],

  'Other Receivables': [
    'other receivables',
    'other receivable',
    // ── Generic Aviation ──
    'government grants receivable',
    'insurance claims receivable',
    'fuel duty receivable',
    'pax compensation recoverable',
    // ── Emirates ──
    'other debtors',
    'amounts due from related companies',
    'vat recoverable',
    // ── Qatar Airways ──
    'other receivables',
    'due from related parties current',
    // ── Lufthansa ──
    'other current receivables',
    'income tax receivables',
    // ── British Airways / IAG ──
    'other current assets',
    'tax receivables current',
    // ── Singapore Airlines ──
    'sundry debtors',
    'tax recoverable',
    // ── Delta / US Carriers ──
    'other receivables net',
    'income tax receivable current',
    // ── Turkish Airlines ──
    'other receivables',
    'due from related parties'
  ],

  'Short-term Investments': [
    'short term investments',
    'short-term investments',
    // ── Emirates ──
    'short term deposits',
    'financial assets at fair value through profit or loss',
    'money market funds',
    // ── Qatar Airways ──
    'short term investments',
    'available for sale financial assets current',
    // ── Lufthansa ──
    'current financial assets',
    'securities',
    // ── Delta / US Carriers ──
    'short term investments',
    'marketable securities current',
    // ── Singapore Airlines ──
    'short term investments',
    'fixed deposits current'
  ],

  'Cash & Bank Balances': [
    'cash and bank balances',
    'cash & bank balances',
    'cash and cash equivalents',
    'cash at bank',
    // ── Generic Aviation ──
    'cash held for operations',
    'restricted cash fleet deposits',
    'cash and short-term deposits',
    'unrestricted cash and cash equivalents',
    'iata clearing house balances',
    // ── Emirates ──
    'cash and cash equivalents',
    'bank balances and cash',
    'short term bank deposits',
    // ── Qatar Airways ──
    'cash and bank balances',
    'unrestricted cash',
    'restricted cash current',
    // ── Lufthansa ──
    'cash and cash equivalents',
    'cash on hand',
    'bank balances',
    // ── British Airways / IAG ──
    'cash and cash equivalents',
    'money market deposits',
    // ── Singapore Airlines ──
    'cash and bank balances',
    'fixed deposits with financial institutions',
    // ── Delta / US Carriers ──
    'cash and cash equivalents',
    'restricted cash current',
    'cash cash equivalents and restricted cash',
    // ── Turkish Airlines ──
    'cash and cash equivalents',
    'bank deposits',
    // ── Ryanair ──
    'cash and cash equivalents',
    'cash restricted'
  ],

  'Current Maturity of Loan to Subsidiaries': [
    'current maturity of loan to subsidiaries',
    // ── Emirates ──
    'current portion of loans to subsidiaries',
    'amounts due from subsidiaries current',
    // ── Qatar Airways ──
    'current portion of intercompany loan'
  ],

  // ─── EQUITY ───────────────────────────────────────────────────

  'Issued, Subscribed & Paid-up Share Capital': [
    'issued subscribed and paid up capital',
    'issued subscribed & paid up share capital',
    'share capital',
    'issued capital',
    // ── Emirates ──
    'capital',
    'government contribution',
    'equity contribution from owner',
    // ── Qatar Airways ──
    'share capital',
    'paid up share capital',
    // ── Lufthansa ──
    'issued capital',
    'subscribed capital',
    // ── British Airways / IAG ──
    'share capital',
    'called up share capital',
    // ── Singapore Airlines ──
    'share capital',
    'issued and paid up capital',
    // ── Delta / US Carriers ──
    'common stock',
    'additional paid in capital',
    // ── Turkish Airlines ──
    'paid in capital',
    'share capital',
    // ── Ryanair ──
    'ordinary share capital',
    'share capital issued'
  ],

  'Reserves (Accumulated Losses)': [
    'capital reserves',
    'revenue reserves',
    'retained earnings',
    'unappropriated profit',
    'accumulated losses',
    // ── Generic Aviation ──
    'accumulated deficit airline',
    'hedging reserves',
    'foreign currency translation reserve',
    'fuel hedge reserve',
    // ── Emirates ──
    'retained earnings',
    'general reserve',
    'special reserve',
    'hedging reserve',
    'foreign currency translation reserve',
    // ── Qatar Airways ──
    'retained earnings',
    'legal reserve',
    'general reserve',
    'hedging reserve',
    // ── Lufthansa ──
    'retained earnings',
    'other reserves',
    'accumulated other comprehensive income loss',
    'revaluation reserve',
    // ── British Airways / IAG ──
    'retained earnings',
    'other reserves',
    'hedging reserve',
    'translation reserve',
    // ── Singapore Airlines ──
    'capital reserve',
    'hedging reserve',
    'share based compensation reserve',
    'retained profits',
    // ── Delta / US Carriers ──
    'accumulated deficit',
    'accumulated other comprehensive loss',
    'retained earnings accumulated deficit',
    // ── Turkish Airlines ──
    'retained earnings',
    'other comprehensive income reserves',
    'hedging reserve',
    // ── Ryanair ──
    'retained earnings',
    'other undenominated capital'
  ],

  'Surplus on Revaluation of PP&E': [
    'surplus on revaluation of pp&e',
    'surplus on revaluation of property plant and equipment',
    // ── Generic Aviation ──
    'surplus on revaluation of aircraft',
    'aircraft revaluation surplus',
    'fleet revaluation reserve',
    // ── Emirates ──
    'revaluation surplus on properties',
    // ── British Airways / IAG ──
    'revaluation reserve aircraft'
  ],

  // ─── NON-CURRENT LIABILITIES ──────────────────────────────────

  'Long-term Financing': [
    'long term financing',
    'long-term financing',
    'long term loans',
    'long term borrowings',
    // ── Generic Aviation ──
    'aircraft purchase loans',
    'fleet financing facilities',
    'export credit agency loans',
    'eca backed financing',
    'pre-delivery payment financing',
    'aircraft mortgage loans',
    'secured aircraft loans',
    'sukuk payable',
    'bonds payable aviation',
    // ── Emirates ──
    'borrowings non current',
    'sukuk certificates',
    'term loans non current',
    'bonds non current',
    // ── Qatar Airways ──
    'long term borrowings',
    'sukuk financing',
    'bonds and notes payable non current',
    // ── Lufthansa ──
    'financial liabilities non current',
    'bonds and notes',
    'liabilities to banks non current',
    // ── British Airways / IAG ──
    'borrowings non current',
    'bond debt non current',
    'bank loans non current',
    // ── Singapore Airlines ──
    'long term loans',
    'bonds payable non current',
    'term loans non current',
    // ── Delta / US Carriers ──
    'long term debt net of current maturities',
    'secured notes non current',
    'unsecured notes non current',
    // ── Turkish Airlines ──
    'financial liabilities non current',
    'bank loans non current',
    // ── Ryanair ──
    'interest bearing loans non current',
    'senior notes non current'
  ],

  'Lease Liabilities': [
    'lease liabilities',
    'obligations under finance lease',
    // ── Generic Aviation ──
    'aircraft lease liabilities',
    'operating lease liabilities aircraft',
    'ifrs 16 lease liabilities',
    'right of use liabilities',
    'finance lease obligations aircraft',
    'aircraft operating lease payable',
    // ── Emirates ──
    'lease liabilities non current',
    'right of use asset obligations non current',
    // ── Qatar Airways ──
    'lease liabilities non current',
    // ── Lufthansa ──
    'lease liabilities non current',
    'obligations under finance leases',
    // ── British Airways / IAG ──
    'lease liabilities non current',
    'obligations under right of use assets',
    // ── Singapore Airlines ──
    'lease liabilities non current',
    'obligations under finance leases non current',
    // ── Delta / US Carriers ──
    'finance lease obligations non current',
    'operating lease liabilities non current',
    'noncurrent lease obligations',
    // ── Turkish Airlines ──
    'lease obligations non current',
    // ── Ryanair ──
    'lease liabilities non current'
  ],

  'Advances / Loan from Subsidiaries': [
    'advances from subsidiaries',
    'loan from subsidiaries',
    'advance from subsidiaries',
    // ── Emirates ──
    'amounts due to subsidiaries non current',
    'intercompany loans payable non current',
    // ── Qatar Airways ──
    'amounts due to related parties non current'
  ],

  'Deferred Liabilities': [
    'deferred liabilities',
    'deferred tax liability',
    'deferred taxation',
    // ── Generic Aviation ──
    'deferred revenue frequent flyer',
    'frequent flyer liability',
    'loyalty program deferred revenue',
    'unearned revenue miles',
    'deferred passenger revenue',
    'passenger deposits and advance bookings',
    // ── Emirates ──
    'deferred income',
    'skywards deferred revenue',
    'deferred tax liabilities',
    'employees end of service benefits',
    'provision for employees benefits',
    // ── Qatar Airways ──
    'deferred revenue',
    'qmiles deferred revenue',
    'deferred tax liability',
    'employees end of service benefits',
    // ── Lufthansa ──
    'deferred income non current',
    'deferred tax liabilities',
    'other non current liabilities',
    'miles and more deferred revenue',
    // ── British Airways / IAG ──
    'deferred revenue non current',
    'avios deferred revenue',
    'deferred tax liabilities',
    'pension and other post retirement benefits',
    // ── Singapore Airlines ──
    'deferred revenue non current',
    'krisflyer deferred revenue',
    'deferred tax liability',
    'retirement benefit obligations',
    // ── Delta / US Carriers ──
    'loyalty program deferred revenue non current',
    'skymiles deferred revenue',
    'deferred income taxes non current liability',
    'pension and related benefits non current',
    // ── Turkish Airlines ──
    'deferred revenue',
    'miles and smiles deferred revenue',
    'employee benefit obligations',
    // ── Ryanair ──
    'deferred tax liabilities'
  ],

  // ─── CURRENT LIABILITIES ──────────────────────────────────────

  'Trade & Other Payables': [
    'trade and other payables',
    'trade & other payables',
    'trade payables',
    'accounts payable',
    // ── Generic Aviation ──
    'airport charges payable',
    'landing fees payable',
    'ground handling payables',
    'catering payables',
    'fuel payables',
    'interline payables',
    'airline services payable',
    'navigation charges payable',
    'maintenance payables',
    // ── Emirates ──
    'trade and other payables',
    'amounts due to related parties current',
    'interline payables',
    'fuel payables',
    // ── Qatar Airways ──
    'trade payables',
    'amounts due to related parties current',
    'accrued expenses',
    // ── Lufthansa ──
    'trade payables',
    'other current liabilities',
    'accrued liabilities',
    // ── British Airways / IAG ──
    'trade and other payables current',
    'amounts due to related parties',
    // ── Singapore Airlines ──
    'trade creditors',
    'accruals and other payables',
    'amounts owing to related companies',
    // ── Delta / US Carriers ──
    'accounts payable',
    'accrued salaries and wages',
    'accrued liabilities',
    // ── Turkish Airlines ──
    'trade payables',
    'due to related parties current',
    // ── Ryanair ──
    'trade payables',
    'accrued expenses and other liabilities'
  ],

  'Unclaimed Dividend – Preference Shares': [
    'unclaimed dividend',
    'unclaimed dividend preference shares',
    // ── Emirates ──
    'dividend payable',
    // ── Qatar Airways ──
    'proposed dividends payable'
  ],

  'Accrued Interest': [
    'accrued mark up',
    'accrued markup',
    'accrued interest',
    // ── Generic Aviation ──
    'accrued interest on aircraft loans',
    'interest payable on fleet financing',
    // ── Emirates ──
    'accrued interest on borrowings',
    'accrued finance charges',
    // ── Qatar Airways ──
    'accrued interest payable',
    // ── Lufthansa ──
    'accrued interest on financial liabilities',
    // ── Delta / US Carriers ──
    'accrued interest payable',
    // ── Turkish Airlines ──
    'interest accruals',
    // ── Ryanair ──
    'accrued interest on borrowings'
  ],

  'Taxation – Net': [
    'taxation net',
    'taxation - net',
    'income tax payable',
    'income tax receivable',
    'advance tax',
    // ── Emirates ──
    'income tax payable',
    'overseas tax payable',
    // ── Lufthansa ──
    'income tax payables',
    'current tax liabilities',
    // ── British Airways / IAG ──
    'current tax liabilities',
    'corporation tax payable',
    // ── Delta / US Carriers ──
    'income taxes payable',
    'current income tax liability',
    // ── Turkish Airlines ──
    'income taxes payable',
    'tax payable',
    // ── Ryanair ──
    'corporation tax payable',
    'current tax payable'
  ],

  'Short-term Borrowings': [
    'short term borrowings',
    'short-term borrowings',
    'short term loans',
    'running finance',
    // ── Generic Aviation ──
    'revolving credit facility aviation',
    'short term aircraft bridge financing',
    'overdraft airline operations',
    // ── Emirates ──
    'short term borrowings current',
    'commercial paper',
    'overdraft facilities',
    // ── Qatar Airways ──
    'short term borrowings',
    'revolving credit facilities current',
    // ── Lufthansa ──
    'current financial liabilities',
    'commercial paper',
    'liabilities to banks current',
    // ── British Airways / IAG ──
    'borrowings current',
    'revolving credit facility current',
    // ── Singapore Airlines ──
    'short term loans current',
    'bank overdrafts',
    // ── Delta / US Carriers ──
    'revolving credit facility current',
    'current portion of long term debt',
    // ── Turkish Airlines ──
    'short term bank loans',
    'financial liabilities current',
    // ── Ryanair ──
    'interest bearing loans current'
  ],

  'Current Maturity of Non-current Liabilities': [
    'current portion of non current liabilities',
    'current maturity of non-current liabilities',
    'current maturity',
    // ── Generic Aviation ──
    'current portion of aircraft loans',
    'current portion of lease liabilities',
    'current portion of fleet financing',
    // ── Emirates ──
    'current portion of borrowings',
    'current portion of lease liabilities',
    'current portion of sukuk',
    // ── Qatar Airways ──
    'current maturities of long term debt',
    'current portion of lease liabilities',
    // ── Lufthansa ──
    'current maturities of financial liabilities',
    'current portion of lease obligations',
    // ── British Airways / IAG ──
    'current portion of borrowings',
    'current portion of lease liabilities',
    // ── Singapore Airlines ──
    'current portion of long term loans',
    'current portion of lease liabilities',
    // ── Delta / US Carriers ──
    'current maturities of long term debt',
    'current maturities of finance leases',
    // ── Turkish Airlines ──
    'current portion of long term liabilities',
    // ── Ryanair ──
    'current portion of interest bearing loans',
    'current portion of lease liabilities'
  ]
},

cashFlowStatement: {

  // ─── OPERATING ACTIVITIES ─────────────────────────────────────

  'Cash Generated from Operations': [
    'cash generated from operations',
    'net cash from operating activities',
    'cash flow from operating activities',
    // ── Aviation-specific ──
    'net cash generated from airline operations',
    'cash receipts from passengers',
    'cash receipts from cargo customers',
    'cash collected from ticket sales',
    'net cash inflow from operations',
    'operating cash flow airline',
    'cash from flight operations'
  ],

  'Profit on Bank Deposits Received': [
    'profit on bank deposits received',
    'interest received',
    'profit on deposits',
    // ── Aviation-specific ──
    'return on maintenance reserve deposits',
    'interest on lease deposits received',
    'income on short-term investments received',
    'profit on treasury placements'
  ],

  'Finance Costs Paid': [
    'finance costs paid',
    'finance cost paid',
    'interest paid',
    // ── Aviation-specific ──
    'interest paid on aircraft loans',
    'markup paid on fleet financing',
    'interest paid on lease liabilities',
    'finance charges paid on borrowings',
    'interest paid on eca loans'
  ],

  'Taxes Paid': [
    'taxes paid',
    'income tax paid',
    'tax paid',
    // ── Aviation-specific ──
    'withholding tax paid aviation',
    'corporate tax paid airline',
    'customs duty paid',
    'passenger service tax paid'
  ],

  'Staff Retirement Benefits Paid': [
    'staff retirement benefits paid',
    'gratuity paid',
    'retirement benefits',
    // ── Aviation-specific ──
    'pilot pension contributions paid',
    'crew retirement benefits paid',
    'airline staff gratuity paid',
    'provident fund contributions paid',
    'defined benefit obligations paid'
  ],

  'Advance to Subsidiaries': [
    'advance to subsidiaries',
    'loans to subsidiaries',
    'advances to subsidiaries',
    // ── Aviation-specific ──
    'advance to subsidiary airline',
    'intercompany loans paid to subsidiaries',
    'funding to subsidiary ground handler'
  ],

  'Long-term Deposits and Prepayments – Net': [
    'long term deposits and prepayments net',
    'long-term deposits and prepayments',
    'long term deposits',
    // ── Aviation-specific ──
    'aircraft security deposits paid net',
    'maintenance reserves deposited net',
    'engine reserve deposits net',
    'lease deposit movements net',
    'lessor deposits paid refunded net'
  ],

  // ─── INVESTING ACTIVITIES ─────────────────────────────────────

  'Purchase of Property, Plant and Equipment': [
    'purchase of property plant and equipment',
    'capital expenditure',
    'additions to pp&e',
    'purchase of fixed assets',
    // ── Aviation-specific ──
    'purchase of aircraft',
    'acquisition of aircraft and engines',
    'purchase of flight equipment',
    'aircraft fleet additions',
    'purchase of rotable spare parts',
    'addition to ground support equipment',
    'purchase of aircraft components',
    'capex on fleet',
    'pre-delivery payments made',
    'pdp payments aircraft'
  ],

  'Purchase of Intangible Assets': [
    'purchase of intangible assets',
    'additions to intangible assets',
    // ── Aviation-specific ──
    'purchase of route licences',
    'acquisition of airport slots',
    'purchase of landing rights',
    'acquisition of traffic rights',
    'purchase of software aviation systems'
  ],

  'Advance Paid to Subsidiary': [
    'advance paid to subsidiary',
    'advances paid to subsidiaries',
    // ── Aviation-specific ──
    'advance paid to subsidiary ground handler',
    'advance paid to subsidiary mro',
    'intercompany advance paid'
  ],

  'Proceeds from Sale of PP&E': [
    'proceeds from sale of pp&e',
    'proceeds from disposal of property plant and equipment',
    'sale of fixed assets',
    // ── Aviation-specific ──
    'proceeds from sale of aircraft',
    'proceeds from disposal of flight equipment',
    'aircraft sale leaseback proceeds',
    'sale and leaseback receipts',
    'proceeds from disposal of engines',
    'proceeds from sale of spare parts',
    'aircraft disposal proceeds'
  ],

  // ─── FINANCING ACTIVITIES ─────────────────────────────────────

  'Repayment of Long-term Financing': [
    'repayment of long term financing',
    'repayment of long-term loans',
    'repayment of borrowings',
    // ── Aviation-specific ──
    'repayment of aircraft loans',
    'repayment of fleet financing',
    'repayment of eca loans',
    'repayment of sukuk',
    'repayment of export credit financing',
    'scheduled debt repayments aircraft',
    'loan repayment on fleet'
  ],

  'Proceeds from Long-term Financing': [
    'proceeds from long term financing',
    'receipts from long-term loans',
    'long term financing obtained',
    // ── Aviation-specific ──
    'proceeds from aircraft financing',
    'proceeds from fleet loans',
    'eca loan proceeds',
    'proceeds from sukuk issuance',
    'aircraft mortgage proceeds',
    'long term fleet financing received'
  ],

  'Proceeds from Short-term Borrowings': [
    'proceeds from short term borrowings',
    'short term borrowings net',
    'short term loans received',
    // ── Aviation-specific ──
    'proceeds from revolving credit facility',
    'short term working capital loan airline',
    'bridge financing received',
    'overdraft utilised aviation'
  ],

  'Repayment of Lease Liabilities': [
    'repayment of lease liabilities',
    'payment of lease liabilities',
    'lease payments',
    // ── Aviation-specific ──
    'payment of aircraft lease rentals',
    'principal repayment of aircraft leases',
    'operating lease payments aircraft',
    'finance lease principal payments',
    'ifrs 16 lease principal paid',
    'aircraft lease instalments paid'
  ],

  // ─── CASH & CASH EQUIVALENTS ──────────────────────────────────

  'Cash and Cash Equivalents – Beginning of Year': [
    'cash and cash equivalents at beginning of year',
    'cash and cash equivalents beginning of year',
    'cash and cash equivalents at the beginning of the year',
    'opening cash and cash equivalents',
    // ── Aviation-specific ──
    'opening cash balance airline',
    'cash at start of period',
    'cash held at beginning of financial year',
    'opening unrestricted cash',
    'cash and deposits opening balance'
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