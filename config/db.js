const dns = require('dns');
const mongoose = require('mongoose');

// Ensure SRV DNS records resolve reliably on Windows / diverse networks
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Ignore if custom dns setServers is restricted
}

let isConnected = false;

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cebu_marathon_tacloban';
  const isAtlas = uri.includes('mongodb+srv://') || uri.includes('mongodb.net');

  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
    isConnected = true;
    if (isAtlas) {
      console.log('☁️ Connected to MongoDB Atlas successfully!');
    } else {
      console.log('✅ Connected to local MongoDB successfully.');
    }
  } catch (err) {
    isConnected = false;
    if (isAtlas) {
      console.warn('⚠️ MongoDB Atlas connection failed. Please check:');
      console.warn('   1. IP Access List in Atlas Network Access (ensure 0.0.0.0/0 or your current IP is allowed)');
      console.warn('   2. Database username and password are correct');
      console.warn('   3. Internet connection / cluster status');
      console.warn('   Falling back to local storage. Error:', err.message);
    } else {
      console.warn('⚠️ MongoDB connection failed, falling back to local JSON file storage (data/registrations.json). Error:', err.message);
    }
  }
}

function getIsConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

module.exports = { connectDB, getIsConnected };

