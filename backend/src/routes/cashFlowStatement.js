const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Analysis = require('../../models/Analysis');
const CashFlow = require('../../models/CashFlow');

// Save cash flow statement data
router.post('/save', async (req, res) => {
  const { analysisId, years, data } = req.body;
  
  if (!analysisId || !years || !data) {
    return res.status(400).json({ error: 'Missing required data' });
  }

  try {
    // 1. Ensure analysis exists with valid ID check
    let analysisExists = null;
    const isValidObjectId = mongoose.Types.ObjectId.isValid(analysisId);

    if (isValidObjectId) {
      try {
        analysisExists = await Analysis.findById(analysisId);
      } catch (err) {
        // Catch invalid format errors quietly
      }
    }

    if (!analysisExists) {
      analysisExists = new Analysis({
        company_name: 'KPMG Client',
        industry: 'Aviation'
      });
      await analysisExists.save();
    }

    // 2. Clear old cash flow data for this analysis
    await CashFlow.deleteMany({ analysis_id: analysisExists._id });

    // 3. Insert new items in bulk
    const itemsToInsert = [];

    // Helper to structure category items
    const processCategory = (categoryName, items) => {
      if (!items) return;
      items.forEach(item => {
        years.forEach(year => {
          const value = item.values[year] || 0;
          itemsToInsert.push({
            analysis_id: analysisExists._id, // Using the verified valid database ID
            year: year.toString(),
            category: categoryName,
            line_item: item.name,
            value: value
          });
        });
      });
    };

    processCategory('Operating Activities', data.operatingActivities);
    processCategory('Investing Activities', data.investingActivities);
    processCategory('Financing Activities', data.financingActivities);
    processCategory('Cash and Cash Equivalents', data.cashAndCashEquivalents);

    // Agar data array khali nahi hai to save karein
    if (itemsToInsert.length > 0) {
      await CashFlow.insertMany(itemsToInsert);
    }

    res.json({ success: true, message: 'Cash Flow Statement data saved successfully.' });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;