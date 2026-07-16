const mongoose = require('mongoose');

const AnalysisSchema = new mongoose.Schema({
  company_name: { type: String, required: true },
  industry: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Analysis', AnalysisSchema);