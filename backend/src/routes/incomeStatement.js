const express = require('express');
const router = express.Router();
const Analysis = require('../../models/Analysis');
const IncomeStatement = require('../../models/IncomeStatement');

// Save income statement data
router.post('/save', async (req, res) => {
  const { analysisId, years, data, exportOptions } = req.body;
  
  if (!analysisId || !years || !data) {
    return res.status(400).json({ error: 'Missing required data' });
  }

  try {
    // 1. Ensure analysis exists (V1 Mock)
    let analysisExists = null;
    try {
      analysisExists = await Analysis.findById(analysisId);
    } catch (err) {
      // Catch error if format is invalid
    }

    if (!analysisExists) {
      analysisExists = new Analysis({
        _id: analysisId,
        company_name: 'KPMG Client',
        industry: 'Aviation'
      });
      await analysisExists.save();
    }

    // 2. Clear old income statement data for this analysis
    await IncomeStatement.deleteMany({ analysis_id: analysisId });

    // 3. Insert new items in bulk
    const itemsToInsert = [];

    // Helper to structure category items
    const processCategory = (categoryName, items) => {
      if (!items) return;
      items.forEach(item => {
        years.forEach(year => {
          const value = item.values[year] || 0;
          itemsToInsert.push({
            analysis_id: analysisId,
            year: year.toString(),
            category: categoryName,
            line_item: item.name,
            value: value
          });
        });
      });
    };

    processCategory('Revenue', data.revenue);
    processCategory('Cost of Services', data.costOfServices);
    processCategory('Operating Expenses', data.operatingExpenses);
    processCategory('Exchange Gain / (Loss)', data.exchangeGainLoss);
    processCategory('Finance Costs', data.financeCosts);
    processCategory('Levy & Taxation', data.levyAndTaxation);

    // Agar data array khali nahi hai to save karein
    if (itemsToInsert.length > 0) {
      await IncomeStatement.insertMany(itemsToInsert);
    }

    res.json({ success: true, message: 'Income Statement data saved successfully.' });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;