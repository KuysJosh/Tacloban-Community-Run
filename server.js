require('dotenv').config();

// Ensure unhandled promise rejections or exceptions do not crash cloud instances
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception:', err);
});

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { connectDB } = require('./config/db');
const storage = require('./services/storage');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// Admin Authentication Configuration
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'TaclobanComRun@2031';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cebumarathon2027';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'cebu_marathon_tacloban_admin_secret_key_2027';

function generateAdminToken(username) {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  const payload = `${username}:${expiresAt}`;
  const sig = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64');
}

function verifyAdminToken(token) {
  if (!token) return null;
  try {
    const raw = Buffer.from(token, 'base64').toString('utf8');
    const [username, expiresAtStr, sig] = raw.split(':');
    if (!username || !expiresAtStr || !sig) return null;
    if (Date.now() > Number(expiresAtStr)) return null;
    const expectedSig = crypto.createHmac('sha256', ADMIN_SECRET).update(`${username}:${expiresAtStr}`).digest('hex');
    if (sig === expectedSig) {
      return { username, expiresAt: Number(expiresAtStr) };
    }
  } catch {
    return null;
  }
  return null;
}

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.headers['x-admin-token'] || req.query.admin_token;
  const user = verifyAdminToken(token);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized. Marshal Admin authentication required.'
    });
  }
  req.adminUser = user;
  next();
}

// Safely extract and parse base64 image data URLs (supports any size/type/whitespace)
function extractBase64Image(dataString) {
  if (!dataString || typeof dataString !== 'string') return null;
  const commaIdx = dataString.indexOf(',');
  if (commaIdx === -1) return null;
  const header = dataString.substring(0, commaIdx);
  const data = dataString.substring(commaIdx + 1).replace(/\s/g, '');
  if (!data) return null;

  let ext = 'jpg';
  let mime = 'image/jpeg';
  const mimeMatch = header.match(/data:image\/([a-zA-Z0-9+.-]+)/i);
  if (mimeMatch) {
    const rawExt = mimeMatch[1].toLowerCase();
    mime = `image/${rawExt}`;
    if (rawExt.includes('png')) ext = 'png';
    else if (rawExt.includes('webp')) ext = 'webp';
    else if (rawExt.includes('gif')) ext = 'gif';
    else ext = 'jpg';
  }
  try {
    const buffer = Buffer.from(data, 'base64');
    return {
      ext,
      mime,
      buffer,
      dataUrl: `data:${mime};base64,${data}`
    };
  } catch (err) {
    console.warn('extractBase64Image decoding error:', err.message);
    return null;
  }
}

// Ensure upload directory exists
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads', 'proofs');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Connect to MongoDB (with auto fallback to JSON storage)
connectDB();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ultra-fast health and ping endpoints for cloud load-balancers & keep-alive monitors
app.get(['/health', '/ping'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.status(200).send('OK');
});

// Lightweight Health-Check endpoint for Render uptime monitoring & wake-up detection
app.get('/api/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    database: storage.getIsConnected() ? 'connected' : 'offline_fallback',
    timestamp: new Date().toISOString()
  });
});

// Admin Login Endpoint
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }

  if ((username === ADMIN_USERNAME || username.toLowerCase() === 'admin') && password === ADMIN_PASSWORD) {
    const token = generateAdminToken(username);
    return res.json({
      success: true,
      message: 'Admin authenticated successfully.',
      token,
      user: { username }
    });
  }

  return res.status(401).json({
    success: false,
    message: 'Invalid admin username or password.'
  });
});

// Admin Verify Token Endpoint
app.get('/api/admin/verify', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.headers['x-admin-token'] || req.query.admin_token;
  const user = verifyAdminToken(token);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session.' });
  }
  res.json({ success: true, user });
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

// Serve the poster image
app.get('/poster.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'poster.png'));
});

// Event Configuration Data based on the official poster
const EVENT_INFO = {
  title: "CEBULANDMASTERS CEBU MARATHON 2027",
  subtitle: "COMMUNITY RUN TACLOBAN LEG",
  location: "Tacloban City, Leyte, Philippines",
  categories: [
    {
      id: "16KM",
      distance: "16 KM",
      date: "November 15, 2026",
      dayOfWeek: "SUNDAY",
      checkInTime: "03:30 AM",
      gunTime: "04:00 AM",
      cutOffTime: "3.5 Hours",
      elevation: "Rolling Hills & Scenic Coastal Bypass",
      description: "Kickoff leg exploring the scenic Tacloban bypass with early morning breeze.",
      color: "#00d2c4"
    },
    {
      id: "21KM",
      distance: "21 KM",
      date: "November 28, 2026",
      dayOfWeek: "SATURDAY",
      checkInTime: "03:00 AM",
      gunTime: "03:30 AM",
      cutOffTime: "4.0 Hours",
      elevation: "Flat to Moderate Incline",
      description: "Half marathon challenge through Tacloban grandstand corridors.",
      color: "#3a86ff"
    },
    {
      id: "26KM",
      distance: "26 KM",
      date: "December 5, 2026",
      dayOfWeek: "SATURDAY",
      checkInTime: "02:30 AM",
      gunTime: "03:00 AM",
      cutOffTime: "5.0 Hours",
      elevation: "Endurance Test & Long Highway Strides",
      description: "Level-up endurance test stepping into ultra-training distance.",
      color: "#8338ec"
    },
    {
      id: "32KM",
      distance: "32 KM",
      date: "December 19, 2026",
      dayOfWeek: "SATURDAY",
      checkInTime: "02:00 AM",
      gunTime: "02:30 AM",
      cutOffTime: "6.0 Hours",
      elevation: "Peak LSD (Long Slow Distance) - Grand Finale",
      description: "The ultimate long run prep for the Cebu Marathon 2027 main race.",
      color: "#ff006e"
    },
    {
      id: "ALL_LEGS",
      distance: "ALL 4 LEGS",
      date: "Nov 15 - Dec 19, 2026",
      dayOfWeek: "FULL SERIES",
      gunTime: "Various Gun Starts",
      cutOffTime: "Full Series Finisher Medal & Certificate of Completion",
      description: "Conquer all 4 Tacloban Community Legs (16K + 21K + 26K + 32K) totaling 95 KM!",
      color: "#f77f00",
      isBundle: true
    }
  ],
  runningGroups: [
    { id: "TBRC", name: "Tacloban Bypass Running Club (TBRC)", tag: "#TBRC #Est2024" },
    { id: "TGR", name: "Tacloban Grandstand Runners (TGR)", tag: "#TGR #RunTacloban" },
    { id: "TRC", name: "TRC - Talisayan / Tolosa Running Club", tag: "#TRC" },
    { id: "MOTION", name: "Motion Runners", tag: "#MotionRunners" },
    { id: "OST", name: "One Stride Tacloban (OST)", tag: "#OST #OneRunOnePace" },
    { id: "ALANGALANG", name: "Alangalang Runners Club", tag: "#AlangalangRunners" },
    { id: "SANTA_FE", name: "Santa Fe Runners", tag: "#dalagansantafeanon" },
    { id: "OTHER", name: "Other / Individual Runner", tag: "#IndependentRunner" }
  ]
};

// Seed initial runner roster if empty so demo works out of the box
async function seedInitialDataIfEmpty() {
  try {
    const current = await storage.getRegistrations();
    if (current.length === 0) {
      console.log('🌱 Seeding initial demo registrations for Tacloban Leg...');
      const samples = [
        {
          fullName: "Kenneth Ian Veloso",
          email: "kenneth.veloso@example.com",
          mobile: "09171234567",
          gender: "Male",
          birthDate: "1995-04-12",
          age: 31,
          bloodType: "O+",
          category: "32KM",
          categoryTitle: "32 KM - Peak LSD Grand Finale",
          categoryDate: "December 19, 2026 (Saturday)",
          runningClub: "Tacloban Bypass Running Club (TBRC)",
          customClub: "",
          emergencyName: "Maria Veloso",
          emergencyPhone: "09187654321",
          emergencyRelation: "Spouse",
          medicalNotes: "No known allergies",
          cebuProofVerified: true,
          verificationStatus: 'VERIFIED',
          claimed: true,
          claimedAt: new Date().toISOString()
        },
        {
          fullName: "Jessica Mae Romualdez",
          email: "jessica.r@example.com",
          mobile: "09289876543",
          gender: "Female",
          birthDate: "1998-08-20",
          age: 28,
          bloodType: "A+",
          category: "21KM",
          categoryTitle: "21 KM Half Marathon",
          categoryDate: "November 28, 2026 (Saturday)",
          runningClub: "Tacloban Grandstand Runners (TGR)",
          customClub: "",
          emergencyName: "Roberto Romualdez",
          emergencyPhone: "09205551234",
          emergencyRelation: "Parent",
          medicalNotes: "Mild asthma, carries inhaler",
          cebuProofVerified: true,
          verificationStatus: 'VERIFIED',
          claimed: false
        },
        {
          fullName: "Aldrin De Paz",
          email: "aldrin.depaz@example.com",
          mobile: "09391112233",
          gender: "Male",
          birthDate: "1992-11-03",
          age: 34,
          bloodType: "B+",
          category: "ALL_LEGS",
          categoryTitle: "All 4 Legs Series Pass (95 KM Total)",
          categoryDate: "Nov 15 - Dec 19, 2026",
          runningClub: "One Stride Tacloban (OST)",
          customClub: "",
          emergencyName: "Elena De Paz",
          emergencyPhone: "09398889900",
          emergencyRelation: "Sibling",
          medicalNotes: "None",
          cebuProofVerified: false,
          verificationStatus: 'PENDING',
          claimed: false
        },
        {
          fullName: "Charito Montilla",
          email: "charito.m@example.com",
          mobile: "09456781234",
          gender: "Female",
          birthDate: "2000-02-14",
          age: 26,
          bloodType: "O+",
          category: "16KM",
          categoryTitle: "16 KM Community Kickoff",
          categoryDate: "November 15, 2026 (Sunday)",
          runningClub: "Santa Fe Runners",
          customClub: "",
          emergencyName: "Danilo Montilla",
          emergencyPhone: "09459990011",
          emergencyRelation: "Parent",
          medicalNotes: "None",
          cebuProofVerified: false,
          verificationStatus: 'DISAPPROVED',
          disapprovalReason: 'Proof photo is blurry; transaction number is unreadable',
          claimed: false
        }
      ];

      for (const item of samples) {
        item.bibNumber = await storage.generateBibNumber(item.category);
        const qrPayload = JSON.stringify({
          bib: item.bibNumber,
          name: item.fullName,
          category: item.category,
          club: item.runningClub,
          event: "Cebu Marathon 2027 Tacloban Leg"
        });
        item.qrCodeDataUrl = await QRCode.toDataURL(qrPayload, {
          width: 250,
          margin: 2,
          color: { dark: '#0b1a30', light: '#ffffff' }
        });
        await storage.createRegistration(item);
      }
      console.log('✅ Initial demo data seeded successfully.');
    }
  } catch (err) {
    console.warn('Note during seedInitialDataIfEmpty:', err.message);
  }
}

// Progressive Race Schedule Configuration
const RACE_SCHEDULE_CONFIG = [
  {
    id: "16KM",
    distVal: "16",
    title: "16 KM",
    date: "November 15, 2026",
    dayOfWeek: "SUNDAY",
    checkInTime: "03:30 AM",
    gunTime: "04:00 AM",
    gunTimestamp: new Date("2026-11-15T04:00:00+08:00").getTime(),
    concludeTimestamp: new Date("2026-11-15T11:00:00+08:00").getTime(),
    desc: "Coastal Bypass Kickoff"
  },
  {
    id: "21KM",
    distVal: "21",
    title: "21 KM",
    date: "November 28, 2026",
    dayOfWeek: "SATURDAY",
    checkInTime: "03:00 AM",
    gunTime: "03:30 AM",
    gunTimestamp: new Date("2026-11-28T03:30:00+08:00").getTime(),
    concludeTimestamp: new Date("2026-11-28T11:00:00+08:00").getTime(),
    desc: "Half Marathon Challenge"
  },
  {
    id: "26KM",
    distVal: "26",
    title: "26 KM",
    date: "December 5, 2026",
    dayOfWeek: "SATURDAY",
    checkInTime: "02:30 AM",
    gunTime: "03:00 AM",
    gunTimestamp: new Date("2026-12-05T03:00:00+08:00").getTime(),
    concludeTimestamp: new Date("2026-12-05T11:00:00+08:00").getTime(),
    desc: "Ultra Training Distance"
  },
  {
    id: "32KM",
    distVal: "32",
    title: "32 KM",
    date: "December 19, 2026",
    dayOfWeek: "SATURDAY",
    checkInTime: "02:00 AM",
    gunTime: "02:30 AM",
    gunTimestamp: new Date("2026-12-19T02:30:00+08:00").getTime(),
    concludeTimestamp: new Date("2026-12-19T11:00:00+08:00").getTime(),
    desc: "Peak LSD Grand Finale"
  }
];

function getLegRegistrationStatus(legIndex, now = Date.now()) {
  const leg = RACE_SCHEDULE_CONFIG[legIndex];
  if (!leg) return { status: 'INVALID', isOpen: false, message: 'Invalid category' };

  if (now > leg.concludeTimestamp) {
    return {
      status: 'CONCLUDED',
      isOpen: false,
      badgeText: '✓ CONCLUDED',
      message: `The ${leg.title} run on ${leg.date} has already concluded.`
    };
  }

  // Progressive Rule: Each leg unlocks once its immediately preceding leg concludes
  // 21KM opens after 16KM, 26KM opens after 21KM, 32KM opens after 26KM
  if (legIndex > 0) {
    const prevLeg = RACE_SCHEDULE_CONFIG[legIndex - 1];
    if (now <= prevLeg.concludeTimestamp) {
      return {
        status: 'LOCKED',
        isOpen: false,
        badgeText: `🔒 OPENS AFTER ${prevLeg.title}`,
        lockedUntil: prevLeg.title,
        unlocksOn: prevLeg.date,
        message: `Registration for ${leg.title} is locked. In accordance with the progressive race schedule, registration will unlock once the ${prevLeg.title} leg concludes on ${prevLeg.date}.`
      };
    }
  }

  return {
    status: 'OPEN',
    isOpen: true,
    badgeText: '● OPEN FOR REGISTRATION',
    message: `Registration for ${leg.title} is currently open!`
  };
}

// ── API ROUTES ──

// Get Event Information
app.get('/api/event', (req, res) => {
  res.json({ success: true, event: EVENT_INFO });
});

// Get Progressive Schedule Status
app.get('/api/schedule-status', (req, res) => {
  const simulatedTime = req.query.simulateDate ? new Date(req.query.simulateDate).getTime() : Date.now();
  const scheduleWithStatus = RACE_SCHEDULE_CONFIG.map((leg, idx) => ({
    ...leg,
    ...getLegRegistrationStatus(idx, simulatedTime)
  }));
  res.json({
    success: true,
    serverTime: new Date(simulatedTime).toISOString(),
    schedule: scheduleWithStatus
  });
});

// Register New Runner (supports both standard and template form field names)
app.post('/api/register', async (req, res) => {
  try {
    const raw = req.body;

    // Resolve fields supporting either format
    const fullName = (raw.fullName || `${raw.fn || ''} ${raw.ln || ''}`).trim();
    const email = (raw.email || raw.em || '').trim();
    const mobile = (raw.mobile || raw.ph || '').trim();
    const gender = raw.gender || raw.gd || 'Prefer not to say';
    const birthDate = raw.birthDate || raw.bd || '';
    const bloodType = raw.bloodType || 'N/A';
    
    // Dist / Category (handles "16" -> "16KM", or "16KM")
    let category = (raw.category || raw.dist || '').toString().trim().toUpperCase();
    if (/^\d+$/.test(category)) {
      category = `${category}KM`;
    }
    
    const runningClub = (raw.runningClub || raw.gr || 'No group (individual)').trim();
    const customClub = (raw.customClub || '').trim();
    const desiredPace = (raw.desiredPace || raw.pace || '6:30 minutes per KM').trim();
    const singletSize = (raw.singletSize || raw.sz || 'N/A').trim();
    const emergencyName = (raw.emergencyName || raw.ec || '').trim();
    const emergencyPhone = (raw.emergencyPhone || raw.ecp || '').trim();
    const emergencyRelation = raw.emergencyRelation || 'Family';
    const medicalNotes = raw.medicalNotes || 'None';

    // Photo proof of Cebu Marathon registration
    let cebuProofImage = (raw.cebuProofImage || raw.cebuProof || raw.proof || '').trim();

    // Basic Validation
    if (!fullName || !email || !mobile || !category || !emergencyName || !emergencyPhone) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields (Name, Email, Mobile, Distance, Emergency Contact).'
      });
    }

    // Photo proof of Cebu Marathon 2027 registration is strictly required
    if (!cebuProofImage || typeof cebuProofImage !== 'string' || !cebuProofImage.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Photo proof of Cebu Marathon 2027 registration is strictly required. Please attach a photo/screenshot of your registration confirmation.'
      });
    }

    const isDataUrl = cebuProofImage.startsWith('data:image/');
    const isPath = cebuProofImage.startsWith('/uploads/proofs/');
    if (!isDataUrl && !isPath) {
      return res.status(400).json({
        success: false,
        message: 'Invalid photo proof format. Please attach a valid image file (PNG, JPG, or WEBP).'
      });
    }

    if (isDataUrl) {
      const testParsed = extractBase64Image(cebuProofImage);
      if (!testParsed || !testParsed.buffer || testParsed.buffer.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'The uploaded photo proof could not be decoded or is empty. Please attach a valid image file.'
        });
      }
    }

    // Progressive Race Schedule Check: Cannot register for a leg unless previous legs are done
    const legIdx = RACE_SCHEDULE_CONFIG.findIndex(l => l.id === category || l.distVal === category.replace('KM', ''));
    if (legIdx >= 0) {
      const legStatus = getLegRegistrationStatus(legIdx);
      if (!legStatus.isOpen) {
        return res.status(400).json({
          success: false,
          message: legStatus.message
        });
      }
    }

    // Resolve Category Metadata
    const catObj = EVENT_INFO.categories.find(c => c.id === category);
    const categoryTitle = catObj ? `${catObj.distance} - ${catObj.description}` : `${category} Community Run`;
    const categoryDate = catObj ? `${catObj.date} (${catObj.dayOfWeek})` : 'TBA';

    // Calculate Age if birthDate provided
    let age = null;
    if (birthDate) {
      const birth = new Date(birthDate);
      const diff = Date.now() - birth.getTime();
      age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
    }

    // Generate Bib Number
    const bibNumber = await storage.generateBibNumber(category);

    // Process and save proof image to uploads directory if provided as base64
    let savedProofPath = cebuProofImage;
    let proofDataUrlToStore = '';
    if (cebuProofImage.startsWith('data:image/')) {
      try {
        const parsed = extractBase64Image(cebuProofImage);
        if (parsed && parsed.buffer && parsed.buffer.length > 0) {
          const safeBib = bibNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
          const fileName = `${safeBib}_cebu_proof_${Date.now()}.${parsed.ext}`;
          const filePath = path.join(UPLOADS_DIR, fileName);
          fs.writeFileSync(filePath, parsed.buffer);
          savedProofPath = `/uploads/proofs/${fileName}`;
          proofDataUrlToStore = parsed.dataUrl;
          console.log(`✅ Saved proof image to disk: ${fileName} (${parsed.buffer.length} bytes)`);
        }
      } catch (saveErr) {
        console.warn('Could not write proof image file, retaining data URL:', saveErr.message);
        proofDataUrlToStore = cebuProofImage;
      }
    }

    // Generate Official QR Code
    const verificationUrl = `${req.protocol}://${req.get('host')}/api/registrations/${bibNumber}`;
    const qrPayload = JSON.stringify({
      bib: bibNumber,
      name: fullName,
      category,
      club: (runningClub === 'Other' && customClub) ? customClub : runningClub,
      verify: verificationUrl
    });

    const qrCodeDataUrl = await QRCode.toDataURL(qrPayload, {
      width: 280,
      margin: 1,
      color: {
        dark: '#050f45',
        light: '#ffffff'
      }
    });

    // Save Registration with both static path and persistent image data
    const registrationData = {
      bibNumber,
      fullName,
      email,
      mobile,
      gender,
      birthDate,
      age: age || 25,
      bloodType,
      category,
      categoryTitle,
      categoryDate,
      runningClub: (runningClub === 'Other' && customClub) ? customClub : runningClub,
      customClub,
      desiredPace,
      singletSize,
      emergencyName,
      emergencyPhone,
      emergencyRelation,
      medicalNotes,
      cebuProofImage: savedProofPath,
      cebuProofDataUrl: proofDataUrlToStore || (cebuProofImage.startsWith('data:image/') ? cebuProofImage : ''),
      cebuProofVerified: false,
      verificationStatus: 'PENDING',
      disapprovalReason: '',
      qrCodeDataUrl
    };

    const record = await storage.createRegistration(registrationData);

    return res.status(201).json({
      success: true,
      message: 'Registration submitted successfully! Your proof has been submitted for admin verification.',
      registration: record
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while processing registration: ' + error.message
    });
  }
});

// Get Registrations List with filters (Admin authenticated or sanitized public search)
app.get('/api/registrations', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : req.headers['x-admin-token'] || req.query.admin_token;
    const adminUser = verifyAdminToken(token);

    // If request is from the public "Find My Pass" modal lookup:
    if (!adminUser && req.query.search) {
      const list = await storage.getRegistrations({ search: req.query.search });
      // Only return public-safe fields (omit sensitive phone, emergency contact details)
      const publicList = list.slice(0, 20).map(r => ({
        _id: r._id,
        bibNumber: r.bibNumber,
        fullName: r.fullName,
        category: r.category,
        categoryTitle: r.categoryTitle,
        categoryDate: r.categoryDate,
        runningClub: r.runningClub,
        desiredPace: r.desiredPace,
        cebuProofVerified: Boolean(r.cebuProofVerified),
        verificationStatus: r.verificationStatus || (r.cebuProofVerified ? 'VERIFIED' : 'PENDING'),
        disapprovalReason: r.disapprovalReason || '',
        claimed: Boolean(r.claimed),
        claimedAt: r.claimedAt || null,
        createdAt: r.createdAt || null,
        qrCodeDataUrl: r.qrCodeDataUrl || null
      }));
      return res.json({
        success: true,
        count: publicList.length,
        registrations: publicList
      });
    }

    // Otherwise, admin authentication is required to list all registered runners
    if (!adminUser) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Marshal Admin authentication required to view runner database.'
      });
    }

    const list = await storage.getRegistrations(req.query);
    res.json({
      success: true,
      count: list.length,
      registrations: list
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Single Registration by ID or Bib
app.get('/api/registrations/:idOrBib', async (req, res) => {
  try {
    const record = await storage.getRegistrationByIdOrBib(req.params.idOrBib);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Runner registration not found.' });
    }
    // Ensure QR code is present for digital pass and tracking
    if (!record.qrCodeDataUrl) {
      try {
        record.qrCodeDataUrl = await QRCode.toDataURL(JSON.stringify({
          bib: record.bibNumber,
          name: record.fullName,
          category: record.category,
          club: record.runningClub,
          verified: Boolean(record.cebuProofVerified),
          claimed: Boolean(record.claimed)
        }));
      } catch (qrErr) {
        console.warn('QR generation note:', qrErr.message);
      }
    }
    res.json({ success: true, registration: record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Direct Proof Image Retrieval Endpoint (Serves disk file or recovers from database)
app.get('/api/registrations/:idOrBib/proof', async (req, res) => {
  try {
    const record = await storage.getRegistrationByIdOrBib(req.params.idOrBib);
    if (!record) {
      return res.status(404).send('Runner registration not found');
    }

    // Try serving disk file first
    if (record.cebuProofImage && !record.cebuProofImage.startsWith('data:image/')) {
      const cleanPath = record.cebuProofImage.replace(/^\/+/, '');
      const localFile = path.join(__dirname, 'public', cleanPath);
      if (fs.existsSync(localFile)) {
        return res.sendFile(localFile);
      }
    }

    // Fallback to stored base64 data URL
    const rawData = record.cebuProofDataUrl || (record.cebuProofImage && record.cebuProofImage.startsWith('data:image/') ? record.cebuProofImage : '');
    if (rawData) {
      const parsed = extractBase64Image(rawData);
      if (parsed) {
        res.setHeader('Content-Type', parsed.mime);
        return res.send(parsed.buffer);
      }
    }

    return res.status(404).send('No proof photo on file for this runner');
  } catch (error) {
    res.status(500).send('Error loading proof: ' + error.message);
  }
});

// Re-upload Photo Proof for Reconsideration (Used by runners on tracking page when status is DISAPPROVED)
app.post('/api/registrations/:idOrBib/reupload-proof', async (req, res) => {
  try {
    const { idOrBib } = req.params;
    const { cebuProofImage } = req.body || {};

    if (!cebuProofImage || typeof cebuProofImage !== 'string' || !cebuProofImage.startsWith('data:image/')) {
      return res.status(400).json({
        success: false,
        message: 'A valid photo proof image (PNG, JPG, or WEBP) is required for reconsideration.'
      });
    }

    const record = await storage.getRegistrationByIdOrBib(idOrBib);
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Runner registration record not found.'
      });
    }

    const parsed = extractBase64Image(cebuProofImage);
    if (!parsed || !parsed.buffer || parsed.buffer.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'The uploaded photo could not be read or is corrupted. Please try another image.'
      });
    }

    // Save newly uploaded proof file to disk
    const safeBib = (record.bibNumber || 'RUNNER').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safeBib}_cebu_proof_${Date.now()}.${parsed.ext}`;
    const filePath = path.join(UPLOADS_DIR, fileName);
    try {
      fs.writeFileSync(filePath, parsed.buffer);
      console.log(`✅ Saved reconsideration proof image to disk: ${fileName} (${parsed.buffer.length} bytes)`);
    } catch (fsErr) {
      console.warn('Could not write disk file for re-uploaded proof:', fsErr.message);
    }

    const savedProofPath = `/uploads/proofs/${fileName}`;

    // Update runner status back to PENDING review with cleared rejection reason
    const updatePayload = {
      cebuProofImage: savedProofPath,
      cebuProofDataUrl: parsed.dataUrl,
      cebuProofVerified: false,
      verificationStatus: 'PENDING',
      disapprovalReason: '',
      reconsideredAt: new Date(),
      reconsiderationCount: (record.reconsiderationCount || 0) + 1
    };

    const updated = await storage.updateRegistration(idOrBib, updatePayload);

    return res.json({
      success: true,
      message: 'New photo proof submitted successfully for reconsideration. Your registration is now pending marshal review.',
      registration: updated
    });
  } catch (error) {
    console.error('Re-upload proof error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing re-uploaded proof: ' + error.message
    });
  }
});

// Automatic recovery for static /uploads/proofs/:fileName if Render disk restarted
app.get('/uploads/proofs/:fileName', async (req, res, next) => {
  const localFile = path.join(UPLOADS_DIR, req.params.fileName);
  if (fs.existsSync(localFile)) {
    return res.sendFile(localFile);
  }

  try {
    const rawBib = req.params.fileName.split('_cebu_proof_')[0].replace(/_/g, '-');
    const record = await storage.getRegistrationByIdOrBib(rawBib);
    const rawData = (record && (record.cebuProofDataUrl || record.cebuProofImage)) || '';
    if (rawData && rawData.startsWith('data:image/')) {
      const parsed = extractBase64Image(rawData);
      if (parsed) {
        // Restore file on disk for instant subsequent access
        try { fs.writeFileSync(localFile, parsed.buffer); } catch (_) {}
        res.setHeader('Content-Type', parsed.mime);
        return res.send(parsed.buffer);
      }
    }
  } catch (err) {
    console.warn('Fallback proof retrieval note:', err.message);
  }
  next();
});

// Toggle Bib Claim / Check-In Status (Protected - Only allowed for verified runners)
app.patch('/api/registrations/:idOrBib/claim', requireAdminAuth, async (req, res) => {
  try {
    const { claimed } = req.body;
    const record = await storage.toggleClaimStatus(req.params.idOrBib, claimed !== undefined ? claimed : null);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Runner not found.' });
    }
    res.json({
      success: true,
      message: record.claimed ? 'Race Bib & Kit marked as CHECKED-IN.' : 'Race Bib status updated to NOT CHECKED-IN.',
      registration: record
    });
  } catch (error) {
    if (error.code === 'UNVERIFIED_RUNNER') {
      return res.status(400).json({
        success: false,
        message: error.message || 'Runner must be verified before checking in.'
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// Verify or Disapprove Cebu Marathon Proof (Protected)
app.patch('/api/registrations/:idOrBib/verify-proof', requireAdminAuth, async (req, res) => {
  try {
    const { status, verified, reason } = req.body || {};
    const updated = await storage.verifyRegistration(req.params.idOrBib, {
      status,
      verified,
      reason,
      adminUser: req.adminUser ? req.adminUser.username : 'Admin'
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Runner not found.' });
    }

    const isApproved = Boolean(updated.cebuProofVerified);
    res.json({
      success: true,
      message: isApproved 
        ? 'Cebu Marathon proof approved & runner verified successfully.' 
        : (updated.verificationStatus === 'DISAPPROVED' ? 'Proof marked as disapproved.' : 'Proof marked as pending review.'),
      registration: updated
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete Registration (Protected)
app.delete('/api/registrations/:idOrBib', requireAdminAuth, async (req, res) => {
  try {
    await storage.deleteRegistration(req.params.idOrBib);
    res.json({ success: true, message: 'Registration deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Live Statistics & Leaderboard (Public / Admin)
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await storage.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Export Masterlist as CSV (Protected)
app.get('/api/export-csv', requireAdminAuth, async (req, res) => {
  try {
    const records = await storage.getRegistrations();
    const headers = [
      'Pass ID',
      'Full Name',
      'Category',
      'Desired Pace',
      'Running Club',
      'Gender',
      'Age',
      'Blood Type',
      'Email',
      'Mobile',
      'Emergency Contact',
      'Emergency Phone',
      'Check-in Status',
      'Check-in Time',
      'Cebu Proof URL',
      'Proof Verified',
      'Registration Date'
    ];

    const rows = records.map(r => [
      `"${r.bibNumber || ''}"`,
      `"${(r.fullName || '').replace(/"/g, '""')}"`,
      `"${r.category || ''}"`,
      `"${r.desiredPace || '6:30 minutes per KM'}"`,
      `"${(r.runningClub || '').replace(/"/g, '""')}"`,
      `"${r.gender || ''}"`,
      `"${r.age || ''}"`,
      `"${r.bloodType || ''}"`,
      `"${r.email || ''}"`,
      `"${r.mobile || ''}"`,
      `"${(r.emergencyName || '').replace(/"/g, '""')}"`,
      `"${r.emergencyPhone || ''}"`,
      `"${r.claimed ? 'CHECKED-IN' : 'PENDING'}"`,
      `"${r.claimedAt ? new Date(r.claimedAt).toLocaleString() : ''}"`,
      `"${r.cebuProofImage || ''}"`,
      `"${r.cebuProofVerified ? 'VERIFIED' : 'PENDING'}"`,
      `"${r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="Cebu_Marathon_Tacloban_Registrations.csv"');
    res.send(csvContent);
  } catch (error) {
    res.status(500).send('Error generating CSV: ' + error.message);
  }
});

// Serve frontend SPA pages
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Dedicated Runner Status Tracking Page
app.get(['/track', '/tracking', '/track-status', '/status'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'track.html'));
});

// Fallback to index.html for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server with explicit 0.0.0.0 host binding for cloud platforms (Render, Docker, etc.)
function startServer(portToTry) {
  const HOST = '0.0.0.0';
  const server = app.listen(portToTry, HOST);

  server.on('listening', async () => {
    const address = server.address();
    const actualPort = typeof address === 'string' ? address : address.port;

    if (actualPort !== PORT) {
      console.log(`\n💡 Note: Port ${PORT} was occupied, so server automatically bound to available port ${actualPort}.`);
    }

    console.log(`\n=============================================================`);
    console.log(`🏃 Cebu Marathon 2027 - Tacloban Community Leg Server Running`);
    console.log(`🔌 Host & Port:    ${HOST}:${actualPort}`);
    console.log(`📍 Web App:        http://${HOST}:${actualPort}`);
    console.log(`📊 Admin Portal:   http://${HOST}:${actualPort}/admin`);
    console.log(`📸 Poster View:    http://${HOST}:${actualPort}/poster.png`);
    console.log(`=============================================================\n`);

    // Seed sample data only if explicitly enabled via SEED_DEMO_DATA=true
    if (process.env.SEED_DEMO_DATA === 'true') {
      await seedInitialDataIfEmpty();
    }
  });

  server.on('error', (err) => {
    // Only attempt port increment in local dev when PORT is not provided by host environment
    if (err.code === 'EADDRINUSE' && !process.env.PORT) {
      const nextPort = Number(portToTry) + 1;
      console.log(`⚠️  Port ${portToTry} is in use. Automatically trying port ${nextPort}...`);
      startServer(nextPort);
    } else {
      console.error(`\n❌ Server error:`, err);
      process.exit(1);
    }
  });
}

if (require.main === module) {
  startServer(PORT);
}

module.exports = app;

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Gracefully exiting...');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('SIGINT received. Gracefully exiting...');
  process.exit(0);
});
