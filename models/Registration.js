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
    default: 'Male'
  },
  birthDate: {
    type: String,
    default: ''
  },
  age: {
    type: Number,
    default: 25
  },
  bloodType: {
    type: String,
    default: 'N/A'
  },
  category: {
    type: String,
    default: '16KM',
    required: true
  },
  categoryTitle: {
    type: String,
    default: '16 KM Community Run'
  },
  categoryDate: {
    type: String,
    default: ''
  },
  runningClub: {
    type: String,
    default: 'No group (individual)'
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
    default: 'N/A',
    trim: true
  },
  emergencyPhone: {
    type: String,
    default: 'N/A',
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
    default: '',
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
  reconsideredAt: {
    type: Date,
    default: null
  },
  reconsiderationCount: {
    type: Number,
    default: 0
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

module.exports = mongoose.model('Registration', registrationSchema, 'registrations');

