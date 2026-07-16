const mongoose = require('mongoose');

const IncomeStatementSchema = new mongoose.Schema({
  analysis_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Analysis', required: true },
  year: { type: String, required: true },
  category: { type: String, required: true },
  line_item: { type: String, required: true },
  value: { type: Number, required: true }
});

module.exports = mongoose.model('IncomeStatement', IncomeStatementSchema);