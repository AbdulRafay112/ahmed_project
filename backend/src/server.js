const express = require('express');
require('dotenv').config();

const balanceSheetRoutes = require('./routes/balanceSheet');
const incomeStatementRoutes = require('./routes/incomeStatement');
const cashFlowRoutes = require('./routes/cashFlowStatement');
const { initDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 5000;

// Raw Custom CORS Middleware (Bypassing npm cors package for Vercel Serverless)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Clean FRONTEND_URL to remove trailing slash if exists
  let frontendUrl = process.env.FRONTEND_URL;
  if (frontendUrl && frontendUrl.endsWith('/')) {
    frontendUrl = frontendUrl.slice(0, -1);
  }

  const allowedOrigins = [
    frontendUrl,
    'http://localhost:3000',
    'http://localhost:5173'
  ].filter(Boolean);

  // Check if incoming origin is allowed or is a Vercel deployment
  if (origin && (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Fallback for requests without origin (like direct server hits/postman)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version');

  // OPTIONS (Preflight) request ko furan 200 OK de kar response complete karein
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

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

app.get("/", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "KPMG Financial Analysis Backend Running"
  });
});

app.get("/health", (req, res) => {
  res.send("OK");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});