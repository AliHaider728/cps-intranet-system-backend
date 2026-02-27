import mongoose from 'mongoose';

// Contact sub-schema
const contactSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  role: { type: String, trim: true }, // GP Lead, PM, Finance, Decision Maker etc.
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  isPrimary: { type: Boolean, default: false },
}, { _id: true });

// Contact history entry
const contactHistorySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Email', 'Phone', 'Meeting', 'Document', 'Contract', 'Complaint', 'System Access', 'Other'],
    required: true
  },
  subject: { type: String, trim: true },
  summary: { type: String },
  direction: { type: String, enum: ['Inbound', 'Outbound'], default: 'Outbound' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isStarred: { type: Boolean, default: false },
  attachments: [{ fileName: String, fileUrl: String }],
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

// Restricted Clinician entry
const restrictedClinicianSchema = new mongoose.Schema({
  clinician: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinician' },
  reason: { type: String },
  restrictedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  restrictedAt: { type: Date, default: Date.now },
}, { _id: true });

// Document entry
const documentSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  category: {
    type: String,
    enum: ['Contract', 'SOP', 'NDA', 'MOU', 'Mobilisation Plan', 'Confidentiality', 'DPA', 'Prescribing Policy', 'Welcome Pack', 'Report', 'Other']
  },
  fileUrl: { type: String },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  uploadedAt: { type: Date, default: Date.now },
  isArchived: { type: Boolean, default: false },
}, { _id: true });

const pcnSchema = new mongoose.Schema({
  // Identity
  pcnName: { type: String, required: true, trim: true },
  pcnCode: { type: String, trim: true, unique: true, sparse: true },

  // Hierarchy
  icb: { type: mongoose.Schema.Types.ObjectId, ref: 'ICB' },
  federation: { type: mongoose.Schema.Types.ObjectId, ref: 'Federation' },

  // Address
  address: {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    postCode: { type: String, trim: true },
  },

  // Key Contacts
  contacts: [contactSchema],

  // Contract Overview
  contractStatus: {
    type: String,
    enum: ['Active', 'Expired', 'Pending', 'Suspended', 'Terminated'],
    default: 'Active'
  },
  contractStartDate: { type: Date },
  contractRenewalDate: { type: Date },
  contractExpiryDate: { type: Date },
  annualSpend: { type: Number, default: 0 },
  contractType: {
    type: String,
    enum: ['ARRS', 'EA', 'Direct', 'Mixed'],
  },

  // Compliance / Onboarding Checklist (from Excel)
  onboarding: {
    approvalByCCG: { type: Boolean, default: false },
    ndaSigned: { type: Boolean, default: false },
    dataSharingAgreement: { type: Boolean, default: false },
    mobilisationPlan: { type: Boolean, default: false },
    mouReceived: { type: Boolean, default: false },
    practiceForms: { type: Boolean, default: false },
    prescribingPolicies: { type: Boolean, default: false },
    systemAccessCompleted: { type: Boolean, default: false },
    templateInstalled: { type: Boolean, default: false },
    reportsImported: { type: Boolean, default: false },
    welcomePackSent: { type: Boolean, default: false },
  },

  // Clinical System
  clinicalSystem: { type: String, trim: true }, // EMIS, S1 etc.
  clinicalSystemCode: { type: String, trim: true },
  patientListSize: { type: Number },

  // Linked data
  activeClinicians: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Clinician' }],
  practices: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Practice' }],

  // Restricted Clinicians
  restrictedClinicians: [restrictedClinicianSchema],

  // Documents
  documents: [documentSchema],

  // Contact History
  contactHistory: [contactHistorySchema],

  // Monthly Meetings
  monthlyMeetings: [{
    title: String,
    meetingDate: Date,
    attendees: [String],
    notes: String,
    nextMeetingDate: Date,
  }],

  // Operations Manager assigned
  operationsManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Misc
  notes: { type: String },
  isActive: { type: Boolean, default: true },

}, { timestamps: true });

// Index for fast lookups
pcnSchema.index({ pcnName: 'text', pcnCode: 1 });
pcnSchema.index({ icb: 1, federation: 1 });
pcnSchema.index({ contractStatus: 1 });

const PCN = mongoose.model('PCN', pcnSchema);
export default PCN;