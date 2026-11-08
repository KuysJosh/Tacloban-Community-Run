const dns = require('dns');
const mongoose = require('mongoose');

// Only customize DNS on Windows if needed (SRV records on some local Windows networks)
// Do NOT override /etc/resolv.conf on Linux / cloud containers (Render, Docker, AWS)
if (process.platform === 'win32') {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch (e) {
    // Ignore if custom dns setServers is restricted
  }
}

let isConnected = false;

const DEFAULT_ATLAS_SRV = 'mongodb+srv://runnerAdmin:dhYTa5PU9gsG4CuI@cluster0.mbtvqqj.mongodb.net/cebu_marathon_tacloban?retryWrites=true&w=majority';
const DEFAULT_ATLAS_DIRECT = 'mongodb://runnerAdmin:dhYTa5PU9gsG4CuI@ac-ef21ygi-shard-00-00.mbtvqqj.mongodb.net:27017,ac-ef21ygi-shard-00-01.mbtvqqj.mongodb.net:27017,ac-ef21ygi-shard-00-02.mbtvqqj.mongodb.net:27017/cebu_marathon_tacloban?ssl=true&authSource=admin&replicaSet=atlas-vmun6j-shard-0&retryWrites=true&w=majority';

async function connectDB() {
  const uri = process.env.MONGODB_URI || DEFAULT_ATLAS_SRV;
  const isAtlas = uri.includes('mongodb+srv://') || uri.includes('mongodb.net');

  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 6000,
    });
    isConnected = true;
    console.log(isAtlas ? '☁️ Connected to MongoDB Atlas successfully!' : '✅ Connected to local MongoDB successfully.');
    return true;
  } catch (err) {
    // If SRV connection failed on cloud/container, automatically try direct standard replica set URI
    if (uri.includes('cluster0.mbtvqqj.mongodb.net')) {
      console.warn(`⚠️ SRV DNS lookup failed (${err.message}). Attempting direct replica-set connection...`);
      try {
        await mongoose.connect(DEFAULT_ATLAS_DIRECT, {
          serverSelectionTimeoutMS: 6000,
        });
        isConnected = true;
        console.log('☁️ Connected to MongoDB Atlas successfully via direct replica-set URI!');
        return true;
      } catch (directErr) {
        console.warn('⚠️ Direct Atlas replica connection also failed:', directErr.message);
      }
    }

    isConnected = false;
    console.warn(`⚠️ MongoDB connection offline, falling back to local JSON storage (data/registrations.json). Error: ${err.message}`);
    return false;
  }
}

function getIsConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

module.exports = { connectDB, getIsConnected };

