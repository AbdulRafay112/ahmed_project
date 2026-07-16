const mongoose = require('mongoose');

const initDb = async () => {
  try {
    const connString = process.env.MONGODB_URI;
    if (!connString) {
      throw new Error("MONGODB_URI is not defined in environment variables");
    }
    
    await mongoose.connect(connString);
    console.log('MongoDB Connected Successfully...');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

// SQLite compatibility ke liye empty object export kar rahe hain
// taake jo files "const { db } = require(...)" karti hain wo crash na hon
const db = {}; 

module.exports = {
  db,
  initDb
};