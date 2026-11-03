require('dotenv').config();
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Registration = require('../models/Registration');

async function migrate() {
  const uri = process.env.MONGODB_URI;
  console.log('🔄 Target Database URI:', uri ? uri.replace(/:([^:@]+)@/, ':****@') : 'UNDEFINED');

  if (!uri || (!uri.includes('mongodb+srv://') && !uri.includes('mongodb.net'))) {
    console.log('ℹ️ MONGODB_URI in .env is currently set to a local database.');
    console.log('👉 To migrate to MongoDB Atlas:');
    console.log('   1. Open .env');
    console.log('   2. Set MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/cebu_marathon_tacloban?retryWrites=true&w=majority');
    console.log('   3. Run: npm run migrate:atlas');
    process.exit(0);
  }

  console.log('⏳ Connecting to MongoDB Atlas...');
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log('✅ Connected to MongoDB Atlas successfully!');
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB Atlas:', err.message);
    process.exit(1);
  }

  const localJsonPath = path.join(__dirname, '../data/registrations.json');
  let localRecords = [];
  if (fs.existsSync(localJsonPath)) {
    try {
      localRecords = JSON.parse(fs.readFileSync(localJsonPath, 'utf8'));
      console.log(`📂 Found ${localRecords.length} records in local data/registrations.json.`);
    } catch (e) {
      console.warn('⚠️ Could not parse data/registrations.json:', e.message);
    }
  }

  let migratedCount = 0;
  let skippedCount = 0;

  for (const item of localRecords) {
    try {
      if (!item.bibNumber) continue;
      const exists = await Registration.findOne({ bibNumber: item.bibNumber });
      if (exists) {
        skippedCount++;
        continue;
      }

      // Map any old categories or missing fields
      let cat = item.category || '16KM';
      if (cat === 'LEG_16K') cat = '16KM';
      if (cat === 'LEG_21K') cat = '21KM';
      if (cat === 'LEG_26K') cat = '26KM';
      if (cat === 'LEG_32K') cat = '32KM';

      const doc = new Registration({
        bibNumber: item.bibNumber,
        fullName: item.fullName || 'Runner',
        email: item.email || 'runner@example.com',
        mobile: item.mobile || '09000000000',
        gender: item.gender || 'Prefer not to say',
        birthDate: item.birthDate || '',
        age: item.age || 25,
        bloodType: item.bloodType || 'N/A',
        category: cat,
        categoryTitle: item.categoryTitle || `${cat} Community Run`,
        categoryDate: item.categoryDate || 'Nov 15, 2026',
        runningClub: item.runningClub || 'Independent',
        customClub: item.customClub || '',
        desiredPace: item.desiredPace || item.pace || '6:30 minutes per KM',
        singletSize: item.singletSize || 'N/A',
        emergencyName: item.emergencyName || 'Emergency Contact',
        emergencyPhone: item.emergencyPhone || '09000000000',
        emergencyRelation: item.emergencyRelation || 'Family',
        medicalNotes: item.medicalNotes || 'None',
        cebuProofImage: item.cebuProofImage || '',
        cebuProofVerified: item.cebuProofVerified || false,
        qrCodeDataUrl: item.qrCodeDataUrl || '',
        claimed: item.claimed || false,
        claimedAt: item.claimedAt || null,
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date()
      });

      await doc.save();
      migratedCount++;
      console.log(`   ✓ Migrated [${item.bibNumber}] ${item.fullName}`);
    } catch (e) {
      console.warn(`   ⚠️ Skipped ${item.bibNumber}:`, e.message);
      skippedCount++;
    }
  }

  console.log(`\n🎉 Migration Complete:`);
  console.log(`   - Uploaded to Atlas: ${migratedCount} record(s)`);
  console.log(`   - Already in Atlas / Skipped: ${skippedCount} record(s)`);
  console.log(`   - Total in Atlas: ${await Registration.countDocuments()}`);

  await mongoose.disconnect();
  process.exit(0);
}

migrate();

