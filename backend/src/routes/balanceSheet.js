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

module.exports = router;