const express = require('express');
const router = express.Router();
const Analysis = require('../../models/Analysis');
const BalanceSheet = require('../../models/BalanceSheet');

// Create a new analysis
router.post('/analysis', async (req, res) => {
  const { industry, companyName } = req.body;
  try {
    const newAnalysis = new Analysis({
      industry: industry || 'Aviation',
      company_name: companyName || 'KPMG Client'
    });
    
    const savedAnalysis = await newAnalysis.save();
    // Vercel aur SQL compatibility ke liye ID string mein convert kar ke bhej rahe hain
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
    // SQL ki ID integer thi, MongoDB mein ye ek valid 24-char hex string (ObjectId) hoti hai
    let analysisExists = null;
    try {
      analysisExists = await Analysis.findById(analysisId);
    } catch (err) {
      // Agar ID valid format mein nahi hai, to findById throw karega
    }

    if (!analysisExists) {
      // Agar direct create karna pare (jaise test ID bhej di ho), to hum manually generate kar lete hain
      analysisExists = new Analysis({
        _id: analysisId, // Agar hardcoded numeric ya custom format string aa rahi hai
        company_name: 'KPMG Client',
        industry: 'Aviation'
      });
      await analysisExists.save();
    }

    // 2. Clear old balance sheet data for this analysis
    await BalanceSheet.deleteMany({ analysis_id: analysisId });

    // 3. Insert new items in bulk (MongoDB mein bulk insert zyaada fast hota hai)
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

    processCategory('Non-Current Assets', data.nonCurrentAssets);
    processCategory('Current Assets', data.currentAssets);
    processCategory('Equity', data.equity);
    processCategory('Non-Current Liabilities', data.nonCurrentLiabilities);
    processCategory('Current Liabilities', data.currentLiabilities);

    // Agar data array khali nahi hai to database mein aik sath save karein
    if (itemsToInsert.length > 0) {
      await BalanceSheet.insertMany(itemsToInsert);
    }

    res.json({ success: true, message: 'Balance Sheet data saved successfully.' });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;