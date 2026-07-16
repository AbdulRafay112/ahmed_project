const express = require('express');
const cors = require('cors');
require('dotenv').config();

const balanceSheetRoutes = require('./routes/balanceSheet');
const incomeStatementRoutes = require('./routes/incomeStatement');
const cashFlowRoutes = require('./routes/cashFlowStatement');
const { initDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    "https://financial-analysis-kpmg.vercel.app",
    "https://kpmg-financial-analysis-production.up.railway.app",
    "http://localhost:5173" // Good to keep for local dev
  ]
}));
app.use(express.json());

// Initialize Database
initDb();

// Routes
app.use('/api/balance-sheet', balanceSheetRoutes);
app.use('/api/income-statement', incomeStatementRoutes);
app.use('/api/cash-flow', cashFlowRoutes);
app.use('/api/export', require('./routes/export'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'KPMG Financial Analysis API is running.' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
