const multer = require("multer");

// Store uploaded PDF in memory (Vercel compatible)
const storage = multer.memoryStorage();

module.exports = multer({ storage });