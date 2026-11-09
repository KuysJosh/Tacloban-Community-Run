const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectDB, getIsConnected } = require('../config/db');
const Registration = require('../models/Registration');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'registrations.json');

// Ensure data directory and fallback JSON file exist (with error guarding for read-only serverless platforms like Vercel)
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  // Read-only filesystem in serverless environments
}

try {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
  }
} catch (e) {
  // Read-only filesystem in serverless environments
}

function readLocalData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error('Error reading JSON fallback:', err);
    return [];
  }
}

function writeLocalData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing JSON fallback:', err);
  }
}

// Generate unique bib number
async function generateBibNumber(category) {
  const prefixMap = {
    '16KM': 'TBN-16',
    '21KM': 'TBN-21',
    '26KM': 'TBN-26',
    '32KM': 'TBN-32',
    'ALL_LEGS': 'TBN-VIP'
  };
  const prefix = prefixMap[category] || 'TBN-RUN';

  // Always ensure connection to MongoDB Atlas database
  if (!getIsConnected()) {
    try {
      await connectDB();
    } catch (e) {}
  }

  // Count existing registrations in this category
  let count = 0;
  if (getIsConnected()) {
    try {
      count = await Registration.countDocuments({ category });
    } catch {
      count = readLocalData().filter(r => r.category === category).length;
    }
  } else {
    count = readLocalData().filter(r => r.category === category).length;
  }

  let baseNumber = 1001 + count;
  let bib = `${prefix}-${baseNumber}`;

  // Ensure absolute uniqueness
  while (true) {
    let exists = false;
    if (getIsConnected()) {
      try {
        const found = await Registration.findOne({ bibNumber: bib });
        if (found) exists = true;
      } catch {}
    }
    if (!exists) {
      const local = readLocalData();
      if (local.some(r => r.bibNumber === bib)) exists = true;
    }
    if (!exists) break;
    baseNumber++;
    bib = `${prefix}-${baseNumber}`;
  }

  return bib;
}

// Save a new registration directly into MongoDB Atlas cebu_marathon_tacloban.registrations
async function createRegistration(data) {
  if (!data.cebuProofImage || typeof data.cebuProofImage !== 'string' || !data.cebuProofImage.trim()) {
    throw new Error('Photo proof of Cebu Marathon 2027 registration is strictly required.');
  }

  // Always ensure MongoDB Atlas connection is active
  if (!getIsConnected()) {
    try {
      await connectDB();
    } catch (dbErr) {
      console.warn('⚠️ Atlas reconnect in createRegistration:', dbErr.message);
    }
  }

  // If no bibNumber provided, generate one
  if (!data.bibNumber) {
    data.bibNumber = await generateBibNumber(data.category);
  }

  data.claimed = false;
  data.claimedAt = null;
  data.createdAt = new Date().toISOString();
  data.cebuProofVerified = Boolean(data.cebuProofVerified);
  data.verificationStatus = data.cebuProofVerified ? 'VERIFIED' : (data.verificationStatus || 'PENDING');
  data.disapprovalReason = data.disapprovalReason || '';

  let savedRecord = null;
  let lastInsertError = '';

  if (getIsConnected()) {
    try {
      const reg = new Registration(data);
      savedRecord = await reg.save();
      savedRecord = savedRecord.toObject();
      console.log(`☁️ [Atlas] Successfully saved registration ${savedRecord.bibNumber} (${savedRecord.fullName}) into cebu_marathon_tacloban.registrations`);
    } catch (err) {
      lastInsertError = err.message;
      console.error('❌ MongoDB insert error:', err.message);
      // If error is caused by document size (large base64 image), trim the duplicate base64 cache and retry
      if (err.message && (err.message.includes('large') || err.message.includes('BSON') || err.message.includes('maximum allowed document size'))) {
        try {
          console.log('⚠️ Retrying insert with stripped data URL cache...');
          data.cebuProofDataUrl = '';
          const retryReg = new Registration(data);
          savedRecord = await retryReg.save();
          savedRecord = savedRecord.toObject();
          console.log(`☁️ [Atlas] Successfully saved registration ${savedRecord.bibNumber} on retry!`);
        } catch (retryErr) {
          lastInsertError = retryErr.message;
          console.error('❌ Retry insert also failed:', retryErr.message);
        }
      }
    }
  }

  // Enforce cloud database persistence: NEVER fake success if not saved in MongoDB Atlas!
  if (!savedRecord) {
    console.error('❌ Registration save aborted: MongoDB Atlas insert failed. Reason:', lastInsertError);
    throw new Error('Database save failed: ' + (lastInsertError || 'Could not connect to MongoDB Atlas database.'));
  }

  // Also mirror to local file for offline access
  try {
    const localList = readLocalData();
    const existingIdx = localList.findIndex(r => r.bibNumber === savedRecord.bibNumber);
    if (existingIdx >= 0) {
      localList[existingIdx] = savedRecord;
    } else {
      localList.unshift(savedRecord);
    }
    writeLocalData(localList);
  } catch (e) {}

  return savedRecord;
}

// Get all registrations with filtering and search
async function getRegistrations(query = {}) {
  const { category, club, search, claimed, verified, verificationStatus, pace } = query;

  if (!getIsConnected()) {
    try {
      await connectDB();
    } catch (e) {}
  }

  if (getIsConnected()) {
    try {
      const filter = {};
      if (category && category !== 'ALL') filter.category = category;
      if (club && club !== 'ALL') filter.runningClub = club;
      if (claimed !== undefined && claimed !== '') {
        filter.claimed = claimed === 'true' || claimed === true;
      }
      if (verified !== undefined && verified !== '') {
        filter.cebuProofVerified = verified === 'true' || verified === true;
      }
      if (verificationStatus && verificationStatus !== 'ALL') {
        if (verificationStatus === 'UNVERIFIED') {
          filter.cebuProofVerified = false;
        } else {
          filter.verificationStatus = verificationStatus;
        }
      }
      if (pace && pace !== 'ALL') {
        if (pace === 'runwalk' || pace.toLowerCase().includes('walk') || pace.includes('8:30')) {
          filter.desiredPace = { $regex: /(runwalk|run-walk|8:30|walk)/i };
        } else if (pace === 'other') {
          filter.desiredPace = { $not: /(5:30|6:30|7:30|8:30|runwalk)/i };
        } else {
          filter.desiredPace = { $regex: new RegExp(pace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') };
        }
      }
      if (search) {
        const regex = new RegExp(search.trim(), 'i');
        filter.$or = [
          { fullName: regex },
          { bibNumber: regex },
          { email: regex },
          { mobile: regex }
        ];
      }

      const list = await Registration.find(filter).sort({ createdAt: -1 });
      return list.map(item => item.toObject());
    } catch (err) {
      console.warn('MongoDB query failed, falling back to JSON:', err.message);
    }
  }

  // Fallback to local JSON
  let records = readLocalData();
  if (category && category !== 'ALL') {
    records = records.filter(r => r.category === category);
  }
  if (club && club !== 'ALL') {
    records = records.filter(r => r.runningClub === club);
  }
  if (claimed !== undefined && claimed !== '') {
    const isClaimed = claimed === 'true' || claimed === true;
    records = records.filter(r => Boolean(r.claimed) === isClaimed);
  }
  if (verified !== undefined && verified !== '') {
    const isVer = verified === 'true' || verified === true;
    records = records.filter(r => Boolean(r.cebuProofVerified) === isVer);
  }
  if (verificationStatus && verificationStatus !== 'ALL') {
    if (verificationStatus === 'UNVERIFIED') {
      records = records.filter(r => !r.cebuProofVerified);
    } else {
      records = records.filter(r => (r.verificationStatus || (r.cebuProofVerified ? 'VERIFIED' : 'PENDING')) === verificationStatus);
    }
  }
  if (pace && pace !== 'ALL') {
    if (pace === 'runwalk' || pace.toLowerCase().includes('walk') || pace.includes('8:30')) {
      records = records.filter(r => {
        const p = (r.desiredPace || '').toLowerCase();
        return p.includes('runwalk') || p.includes('run-walk') || p.includes('8:30') || p.includes('walk');
      });
    } else if (pace === 'other') {
      records = records.filter(r => {
        const p = (r.desiredPace || '').toLowerCase();
        return !p.includes('5:30') && !p.includes('6:30') && !p.includes('7:30') && !p.includes('8:30') && !p.includes('runwalk');
      });
    } else {
      const pLow = pace.toLowerCase();
      records = records.filter(r => (r.desiredPace || '').toLowerCase().includes(pLow));
    }
  }
  if (search) {
    const s = search.trim().toLowerCase();
    records = records.filter(r => 
      (r.fullName && r.fullName.toLowerCase().includes(s)) ||
      (r.bibNumber && r.bibNumber.toLowerCase().includes(s)) ||
      (r.email && r.email.toLowerCase().includes(s)) ||
      (r.mobile && r.mobile.toLowerCase().includes(s))
    );
  }
  return records;
}

// Helper to reliably find a document in Mongo by bibNumber or valid ObjectId
async function findMongoDoc(idOrBib) {
  if (typeof idOrBib !== 'string') return null;
  if (idOrBib.startsWith('TBN-')) {
    return await Registration.findOne({ bibNumber: idOrBib });
  }
  if (mongoose.Types.ObjectId.isValid(idOrBib)) {
    const doc = await Registration.findById(idOrBib).catch(() => null);
    if (doc) return doc;
  }
  return await Registration.findOne({ bibNumber: idOrBib });
}

// Find single registration by ID or Bib
async function getRegistrationByIdOrBib(idOrBib) {
  if (!getIsConnected()) {
    try {
      await connectDB();
    } catch (e) {}
  }

  if (getIsConnected()) {
    try {
      const reg = await findMongoDoc(idOrBib);
      if (reg) return reg.toObject();
    } catch (err) {
      console.warn('MongoDB search failed, using JSON fallback:', err.message);
    }
  }

  const localList = readLocalData();
  return localList.find(r => r._id === idOrBib || r.bibNumber === idOrBib) || null;
}

// Toggle or set bib claim / check-in status (Only allowed for verified runners)
async function toggleClaimStatus(idOrBib, status = null) {
  const currentRecord = await getRegistrationByIdOrBib(idOrBib);
  if (!currentRecord) return null;

  const isVerified = Boolean(currentRecord.cebuProofVerified);
  const targetStatus = status !== null ? status : !currentRecord.claimed;

  // Strict rule: runners must have verified proof before check-in can be marked true!
  if (targetStatus && !isVerified) {
    const err = new Error('Runner proof must be approved & verified before check-in.');
    err.code = 'UNVERIFIED_RUNNER';
    throw err;
  }

  let record = null;
  const localList = readLocalData();
  const idx = localList.findIndex(r => r._id === idOrBib || r.bibNumber === idOrBib);

  if (getIsConnected()) {
    try {
      const reg = await findMongoDoc(idOrBib);
      if (reg) {
        reg.claimed = targetStatus;
        reg.claimedAt = targetStatus ? new Date() : null;
        await reg.save();
        record = reg.toObject();
      }
    } catch (err) {
      console.warn('MongoDB update claim status failed:', err.message);
    }
  }

  if (idx >= 0) {
    const current = localList[idx];
    current.claimed = targetStatus;
    current.claimedAt = targetStatus ? new Date().toISOString() : null;
    writeLocalData(localList);
    if (!record) record = current;
  }

  return record;
}

// Manually verify or disapprove registration proof
async function verifyRegistration(idOrBib, options = {}) {
  const isApprove = options.status === 'VERIFIED' || options.verified === true;
  const isDisapprove = options.status === 'DISAPPROVED' || options.verified === false;

  const fields = {};
  if (isApprove) {
    fields.cebuProofVerified = true;
    fields.verificationStatus = 'VERIFIED';
    fields.disapprovalReason = '';
    fields.verifiedAt = new Date().toISOString();
    fields.verifiedBy = options.adminUser || 'Admin';
  } else if (isDisapprove) {
    fields.cebuProofVerified = false;
    fields.verificationStatus = 'DISAPPROVED';
    fields.disapprovalReason = options.reason || 'Cebu Marathon proof does not meet requirements.';
    fields.claimed = false;
    fields.claimedAt = null;
  } else {
    fields.cebuProofVerified = false;
    fields.verificationStatus = 'PENDING';
    fields.disapprovalReason = '';
  }

  return await updateRegistration(idOrBib, fields);
}

// Update registration fields (e.g. cebuProofVerified)
async function updateRegistration(idOrBib, fields) {
  let record = null;
  const localList = readLocalData();
  const idx = localList.findIndex(r => r._id === idOrBib || r.bibNumber === idOrBib);

  if (getIsConnected()) {
    try {
      const reg = await findMongoDoc(idOrBib);
      if (reg) {
        Object.assign(reg, fields);
        await reg.save();
        record = reg.toObject();
      }
    } catch (err) {
      console.warn('MongoDB update fields failed:', err.message);
    }
  }

  if (idx >= 0) {
    const current = localList[idx];
    Object.assign(current, fields);
    writeLocalData(localList);
    if (!record) record = current;
  }

  return record;
}

// Delete registration
async function deleteRegistration(idOrBib) {
  if (getIsConnected()) {
    try {
      if (idOrBib.startsWith('TBN-')) {
        await Registration.deleteOne({ bibNumber: idOrBib });
      } else if (mongoose.Types.ObjectId.isValid(idOrBib)) {
        await Registration.deleteOne({ _id: idOrBib });
      } else {
        await Registration.deleteOne({ bibNumber: idOrBib });
      }
    } catch (err) {
      console.warn('MongoDB delete failed:', err.message);
    }
  }

  let localList = readLocalData();
  localList = localList.filter(r => r._id !== idOrBib && r.bibNumber !== idOrBib);
  writeLocalData(localList);
  return true;
}

// Get statistics
async function getStats() {
  const all = await getRegistrations();

  const totalRunners = all.length;

  // Verified runners
  const verifiedRunners = all.filter(r => Boolean(r.cebuProofVerified));
  const totalVerified = verifiedRunners.length;
  const verifiedCheckedIn = verifiedRunners.filter(r => Boolean(r.claimed)).length;
  const verifiedNotCheckedIn = totalVerified - verifiedCheckedIn;

  // Unverified runners (Pending & Disapproved)
  const unverifiedRunners = all.filter(r => !r.cebuProofVerified);
  const totalUnverified = unverifiedRunners.length;
  const pendingReviewCount = unverifiedRunners.filter(r => r.verificationStatus !== 'DISAPPROVED').length;
  const disapprovedCount = unverifiedRunners.filter(r => r.verificationStatus === 'DISAPPROVED').length;

  const categories = {
    '16KM': 0,
    '21KM': 0,
    '26KM': 0,
    '32KM': 0,
    'ALL_LEGS': 0
  };

  const clubs = {};

  all.forEach(r => {
    if (categories[r.category] !== undefined) {
      categories[r.category]++;
    }
    const c = r.runningClub || 'Independent';
    clubs[c] = (clubs[c] || 0) + 1;
  });

  // Approved / Verified runners categorized by desired pace
  const verifiedPaces = {
    '5:30': 0,
    '6:30': 0,
    '7:30': 0,
    'runwalk': 0,
    'other': 0
  };

  verifiedRunners.forEach(r => {
    const p = (r.desiredPace || '').toLowerCase();
    if (p.includes('5:30')) {
      verifiedPaces['5:30']++;
    } else if (p.includes('6:30')) {
      verifiedPaces['6:30']++;
    } else if (p.includes('7:30')) {
      verifiedPaces['7:30']++;
    } else if (p.includes('runwalk') || p.includes('run-walk') || p.includes('8:30') || p.includes('walk')) {
      verifiedPaces['runwalk']++;
    } else {
      verifiedPaces['other']++;
    }
  });

  return {
    totalRunners,
    totalVerified,
    verifiedCheckedIn,
    verifiedNotCheckedIn,
    totalUnverified,
    pendingReviewCount,
    disapprovedCount,
    claimedCount: verifiedCheckedIn,
    unclaimedCount: verifiedNotCheckedIn,
    categories,
    clubs,
    verifiedPaces
  };
}

module.exports = {
  createRegistration,
  getRegistrations,
  getRegistrationByIdOrBib,
  updateRegistration,
  verifyRegistration,
  toggleClaimStatus,
  deleteRegistration,
  getStats,
  generateBibNumber,
  getIsConnected
};

