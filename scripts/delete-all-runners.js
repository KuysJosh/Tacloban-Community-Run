require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connectDB, getIsConnected } = require('../config/db');
const Registration = require('../models/Registration');

async function deleteAll() {
  console.log('🔄 Connecting to Database...');
  await connectDB();

  // 1. Delete from MongoDB if connected
  if (getIsConnected()) {
    const mongoCountBefore = await Registration.countDocuments();
    console.log(`📦 MongoDB Atlas registrations before deletion: ${mongoCountBefore}`);
    const res = await Registration.deleteMany({});
    console.log(`🗑️ Deleted ${res.deletedCount} documents from MongoDB Atlas.`);
    const mongoCountAfter = await Registration.countDocuments();
    console.log(`✅ MongoDB Atlas registrations remaining: ${mongoCountAfter}`);
  } else {
    console.log('⚠️ MongoDB not connected, proceeding with local fallback.');
  }

  // 2. Clear local JSON storage
  const localFile = path.join(__dirname, '..', 'data', 'registrations.json');
  if (fs.existsSync(localFile)) {
    let localData = [];
    try {
      localData = JSON.parse(fs.readFileSync(localFile, 'utf8') || '[]');
    } catch (e) {}
    console.log(`📁 Local registrations.json before deletion: ${localData.length}`);
    fs.writeFileSync(localFile, JSON.stringify([], null, 2), 'utf8');
    console.log('🗑️ Local data/registrations.json wiped and reset to [].');
  }

  console.log('\n🎉 All runner data and registration submissions have been successfully deleted!');
  process.exit(0);
}

deleteAll().catch(err => {
  console.error('❌ Error during deletion:', err);
  process.exit(1);
});
