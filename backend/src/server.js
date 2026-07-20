const express = require('express');
require('dotenv').config();

const balanceSheetRoutes = require('./routes/balanceSheet');
const incomeStatementRoutes = require('./routes/incomeStatement');
const cashFlowRoutes = require('./routes/cashFlowStatement');
const { initDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 5000;

app.use((req, res, next) => {
  const origin = req.headers.origin;

  let frontendUrl = process.env.FRONTEND_URL;
  if (frontendUrl && frontendUrl.endsWith('/')) {
    frontendUrl = frontendUrl.slice(0, -1);
  }

  const allowedOrigins = [
    frontendUrl,
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175'
  ].filter(Boolean);

  if (origin && (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-CSRF-Token, X-Requested-With'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

app.use(express.json());

initDb();

app.use('/api/balance-sheet', balanceSheetRoutes);
app.use('/api/income-statement', incomeStatementRoutes);
app.use('/api/cash-flow', cashFlowRoutes);
app.use('/api/export', require('./routes/export'));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'KPMG Financial Analysis API is running.'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});