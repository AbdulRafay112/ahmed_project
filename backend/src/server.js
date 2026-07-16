const express = require('express');
const cors = require('cors');
require('dotenv').config();

const balanceSheetRoutes = require('./routes/balanceSheet');
const incomeStatementRoutes = require('./routes/incomeStatement');
const cashFlowRoutes = require('./routes/cashFlowStatement');
const { initDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 5000;

// Dynamic CORS configuration for local development and Vercel preview URLs
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, postman, or curl)
    if (!origin) return callback(null, true);
    
    // Check if the origin is in our allowed list or is a Vercel preview deployment
    const isAllowed = allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app');
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
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