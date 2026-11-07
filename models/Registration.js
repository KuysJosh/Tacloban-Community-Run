const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
  bibNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email address is required'],
    trim: true,
    lowercase: true
  },
  mobile: {
    type: String,
    required: [true, 'Mobile number is required'],
    trim: true
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Non-Binary', 'Prefer not to say'],
    default: 'Male'
  },
  birthDate: {
    type: String,
    default: ''
  },
  age: {
    type: Number,
    min: 12,
    max: 100
  },
  bloodType: {
    type: String,
    default: 'N/A'
  },
  category: {
    type: String,
    enum: ['16KM', '21KM', '26KM', '32KM', 'ALL_LEGS'],
    required: true
  },
  categoryTitle: {
    type: String,
    required: true
  },
  categoryDate: {
    type: String,
    required: true
  },
  runningClub: {
    type: String,
    required: true,
    default: 'Individual / No Affiliation'
  },
  customClub: {
    type: String,
    default: ''
  },
  desiredPace: {
    type: String,
    default: '6:30 minutes per KM'
  },
  singletSize: {
    type: String,
    default: 'N/A'
  },
  emergencyName: {
    type: String,
    required: true,
    trim: true
  },
  emergencyPhone: {
    type: String,
    required: true,
    trim: true
  },
  emergencyRelation: {
    type: String,
    default: 'Family/Friend'
  },
  medicalNotes: {
    type: String,
    default: 'None'
  },
  cebuProofImage: {
    type: String,
    required: [true, 'Photo proof of Cebu Marathon 2027 registration is required'],
    trim: true
  },
  cebuProofDataUrl: {
    type: String,
    default: ''
  },
  cebuProofVerified: {
    type: Boolean,
    default: false,
    index: true
  },
  verificationStatus: {
    type: String,
    enum: ['PENDING', 'VERIFIED', 'DISAPPROVED'],
    default: 'PENDING',
    index: true
  },
  disapprovalReason: {
    type: String,
    default: ''
  },
  verifiedAt: {
    type: Date,
    default: null
  },
  verifiedBy: {
    type: String,
    default: ''
  },
  qrCodeDataUrl: {
    type: String,
    default: ''
  },
  claimed: {
    type: Boolean,
    default: false
  },
  claimedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Registration', registrationSchema);

