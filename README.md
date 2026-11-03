# Cebulandmasters Cebu Marathon 2027 - Tacloban Community Run Registration System

Official Node.js & Express registration web application for the **Cebu Marathon 2027 Community Run (Tacloban Leg)**.

---

## 🏃 About The Event

- **Title Sponsor:** CEBULANDMASTERS
- **Main Event:** Cebu Marathon 2027
- **Leg:** Community Run - Tacloban Leg
- **Location:** Tacloban City, Leyte, Philippines

### Community Training Legs & Dates:
1. **16 KM:** November 15, 2026 (Sunday)
2. **21 KM (Half Marathon):** November 28, 2026 (Saturday)
3. **26 KM:** December 5, 2026 (Saturday)
4. **32 KM (Peak LSD):** December 19, 2026 (Saturday)
5. **All 4 Legs Series Pass:** Full 95 KM Series Challenger

### Committed Running Groups from Leyte / Tacloban:
- Tacloban Bypass Running Club (TBRC)
- Tacloban Grandstand Runners (TGR)
- TRC - Talisayan / Tolosa Running Club
- Motion Runners
- One Stride Tacloban (OST)
- Alangalang Runners Club
- Santa Fe Runners (#dalagansantafeanon)

---

## 🌟 Features

- **Dynamic Runner Registration:**
  - Category selection (16K, 21K, 26K, 32K, or All 4 Legs)
  - Runner details, emergency contact, medical notes, blood type
  - Leyte running club selection with custom club option
  - Singlet/shirt size selection with interactive size chart guide
- **Instant Official Race E-Bib & QR Pass:**
  - Auto-generated unique Bib Number (e.g., `TBN-16-1001`, `TBN-21-2001`)
  - High-resolution, realistic race bib with runner name, category, club badge, barcode, and QR code
  - One-click **Download as PNG** (via `html2canvas`) and **Print Ticket** buttons
- **Search & Bib Verification:**
  - Public search tool allowing registered runners to look up and reprint their pass anytime using their bib number, name, or phone.
- **Race Marshal & Organizer Admin Portal (`/admin`):**
  - Live analytics counters (total participants, claimed vs pending kits, category counts)
  - Filterable runners roster (filter by distance, club, kit status)
  - 1-click **Kit Claim Toggle** (Mark bib claimed / unclaimed)
  - **Export to CSV** for timing chips, race marshals, and kit preparation
- **Zero-Friction Dual Storage (MongoDB + JSON Fallback):**
  - Automatically connects to MongoDB if available
  - Seamlessly falls back to local JSON file storage (`data/registrations.json`) if MongoDB is not running, ensuring 100% crash resilience!

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Application
```bash
npm start
```
Or with development hot-reload:
```bash
npm run dev
```

### 3. Open in Browser
- **Runner Portal & Registration:** [http://localhost:3000](http://localhost:3000)
- **Race Marshal Admin Portal:** [http://localhost:3000/admin](http://localhost:3000/admin)
- **Event Poster Preview:** [http://localhost:3000/poster.png](http://localhost:3000/poster.png)

---

## 📡 REST API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/event` | Get event metadata, dates, distances, and running clubs |
| `POST` | `/api/register` | Register new participant & generate official E-Bib & QR Code |
| `GET` | `/api/registrations` | List registered runners (supports `?search=`, `?category=`, `?club=`, `?claimed=`) |
| `GET` | `/api/registrations/:idOrBib` | Get single runner registration details |
| `PATCH` | `/api/registrations/:idOrBib/claim` | Toggle kit claim / bib collection status |
| `DELETE` | `/api/registrations/:idOrBib` | Delete a runner registration |
| `GET` | `/api/stats` | Get live category breakdown and registration statistics |
| `GET` | `/api/export-csv` | Download complete runner roster as CSV file |

---

## 📁 Project Structure

```text
Marathon Registration/
├── config/
│   └── db.js                 # MongoDB connection & offline fallback detection
├── data/
│   └── registrations.json    # Local JSON persistence fallback
├── models/
│   └── Registration.js       # Mongoose Schema
├── public/
│   ├── index.html            # Main Registration & E-Bib Portal
│   ├── admin.html            # Race Marshal Admin Dashboard
│   ├── styles.css            # Responsive marathon sports styling
│   └── app.js                # Client logic, live countdown, PNG generation
├── services/
│   └── storage.js            # Unified DB / File storage abstraction
├── poster.png                # Official Cebu Marathon Tacloban poster
├── server.js                 # Main Node.js Express server
├── package.json              # Project scripts & dependencies
└── .env                      # Environment configuration
```

