const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

// Save cash flow statement data
router.post('/save', async (req, res) => {
  const { analysisId, years, data } = req.body;
  
  if (!analysisId || !years || !data) {
    return res.status(400).json({ error: 'Missing required data' });
  }

  try {
    const saveToDb = db.transaction((cfData) => {
      const analysisExists = db.prepare('SELECT id FROM analyses WHERE id = ?').get(analysisId);
      if (!analysisExists) {
        db.prepare('INSERT INTO analyses (id, company_name, industry) VALUES (?, ?, ?)').run(analysisId, 'KPMG Client', 'Aviation');
      }

      const deleteStmt = db.prepare('DELETE FROM cash_flow_statement_data WHERE analysis_id = ?');
      deleteStmt.run(analysisId);

      const insertStmt = db.prepare(`
        INSERT INTO cash_flow_statement_data (analysis_id, year, category, line_item, value) 
        VALUES (?, ?, ?, ?, ?)
      `);

      const insertCategory = (categoryName, items) => {
        if (!items) return;
        items.forEach(item => {
          years.forEach(year => {
            const value = item.values[year] || 0;
            insertStmt.run(analysisId, year.toString(), categoryName, item.name, value);
          });
        });
      };

      insertCategory('Operating Activities', cfData.operatingActivities);
      insertCategory('Investing Activities', cfData.investingActivities);
      insertCategory('Financing Activities', cfData.financingActivities);
      // FIXED: Spelled with "and" instead of "&" to match Excel Service headings and UI
      insertCategory('Cash and Cash Equivalents', cfData.cashAndCashEquivalents);
    });

    saveToDb(data);

    res.json({ success: true, message: 'Cash Flow Statement data saved successfully.' });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;