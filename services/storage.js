const fs = require('fs');
const path = require('path');
const { getIsConnected } = require('../config/db');
const Registration = require('../models/Registration');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'registrations.json');

// Ensure data directory and fallback JSON file exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
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

// Save a new registration
async function createRegistration(data) {
  // If no bibNumber provided, generate one
  if (!data.bibNumber) {
    data.bibNumber = await generateBibNumber(data.category);
  }

  data.claimed = false;
  data.claimedAt = null;
  data.createdAt = new Date().toISOString();

  let savedRecord = null;

  if (getIsConnected()) {
    try {
      const reg = new Registration(data);
      savedRecord = await reg.save();
      savedRecord = savedRecord.toObject();
    } catch (err) {
      console.warn('MongoDB insert failed, using fallback:', err.message);
    }
  }

  if (!savedRecord) {
    const localList = readLocalData();
    data._id = 'local_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    localList.unshift(data);
    writeLocalData(localList);
    savedRecord = data;
  } else {
    // Also mirror to local file for offline access
    const localList = readLocalData();
    const existingIdx = localList.findIndex(r => r.bibNumber === savedRecord.bibNumber);
    if (existingIdx >= 0) {
      localList[existingIdx] = savedRecord;
    } else {
      localList.unshift(savedRecord);
    }
    writeLocalData(localList);
  }

  return savedRecord;
}

// Get all registrations with filtering and search
async function getRegistrations(query = {}) {
  const { category, club, search, claimed } = query;

  if (getIsConnected()) {
    try {
      const filter = {};
      if (category && category !== 'ALL') filter.category = category;
      if (club && club !== 'ALL') filter.runningClub = club;
      if (claimed !== undefined && claimed !== '') {
        filter.claimed = claimed === 'true' || claimed === true;
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

// Find single registration by ID or Bib
async function getRegistrationByIdOrBib(idOrBib) {
  if (getIsConnected()) {
    try {
      let reg = null;
      if (idOrBib.startsWith('TBN-')) {
        reg = await Registration.findOne({ bibNumber: idOrBib });
      } else {
        reg = await Registration.findById(idOrBib).catch(() => null);
        if (!reg) {
          reg = await Registration.findOne({ bibNumber: idOrBib });
        }
      }
      if (reg) return reg.toObject();
    } catch (err) {
      console.warn('MongoDB search failed, using JSON fallback:', err.message);
    }
  }

  const localList = readLocalData();
  return localList.find(r => r._id === idOrBib || r.bibNumber === idOrBib) || null;
}

// Toggle or set bib claim / check-in status
async function toggleClaimStatus(idOrBib, status = null) {
  let record = null;
  const localList = readLocalData();
  const idx = localList.findIndex(r => r._id === idOrBib || r.bibNumber === idOrBib);

  if (getIsConnected()) {
    try {
      let reg = await Registration.findOne({
        $or: [{ _id: idOrBib.startsWith('local_') ? null : idOrBib }, { bibNumber: idOrBib }]
      });

      if (reg) {
        reg.claimed = status !== null ? status : !reg.claimed;
        reg.claimedAt = reg.claimed ? new Date() : null;
        await reg.save();
        record = reg.toObject();
      }
    } catch (err) {
      console.warn('MongoDB update claim status failed:', err.message);
    }
  }

  if (idx >= 0) {
    const current = localList[idx];
    const newStatus = status !== null ? status : !current.claimed;
    current.claimed = newStatus;
    current.claimedAt = newStatus ? new Date().toISOString() : null;
    writeLocalData(localList);
    if (!record) record = current;
  }

  return record;
}

// Update registration fields (e.g. cebuProofVerified)
async function updateRegistration(idOrBib, fields) {
  let record = null;
  const localList = readLocalData();
  const idx = localList.findIndex(r => r._id === idOrBib || r.bibNumber === idOrBib);

  if (getIsConnected()) {
    try {
      let reg = await Registration.findOne({
        $or: [{ _id: idOrBib.startsWith('local_') ? null : idOrBib }, { bibNumber: idOrBib }]
      });

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
      await Registration.deleteOne({
        $or: [{ _id: idOrBib.startsWith('local_') ? null : idOrBib }, { bibNumber: idOrBib }]
      });
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
  const claimedCount = all.filter(r => r.claimed).length;

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

  return {
    totalRunners,
    claimedCount,
    unclaimedCount: totalRunners - claimedCount,
    categories,
    clubs
  };
}

module.exports = {
  createRegistration,
  getRegistrations,
  getRegistrationByIdOrBib,
  updateRegistration,
  toggleClaimStatus,
  deleteRegistration,
  getStats,
  generateBibNumber
};

