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
  const customUri = process.env.MONGODB_URI;
  // If no custom URI or if using cluster0, prioritize direct replica set URI
  // to avoid SRV DNS query hangs/timeouts in cloud containers (Render, Docker)
  let primaryUri = DEFAULT_ATLAS_DIRECT;
  let fallbackUri = DEFAULT_ATLAS_SRV;

  if (customUri) {
    if (customUri.includes('cluster0.mbtvqqj.mongodb.net')) {
      primaryUri = DEFAULT_ATLAS_DIRECT;
      fallbackUri = customUri;
    } else {
      primaryUri = customUri;
      fallbackUri = null;
    }
  }

  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(primaryUri, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log('☁️ Connected to MongoDB Atlas successfully!');
    return true;
  } catch (err) {
    console.warn(`⚠️ Primary MongoDB connection failed (${err.message}). Trying fallback...`);
    if (fallbackUri) {
      try {
        await mongoose.connect(fallbackUri, {
          serverSelectionTimeoutMS: 5000,
        });
        isConnected = true;
        console.log('☁️ Connected to MongoDB Atlas successfully via fallback URI!');
        return true;
      } catch (fallbackErr) {
        console.warn('⚠️ Fallback MongoDB connection also failed:', fallbackErr.message);
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

