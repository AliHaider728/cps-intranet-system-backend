import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
  name:      { type: String, trim: true },
  role:      { type: String, trim: true },
  email:     { type: String, trim: true, lowercase: true },
  phone:     { type: String, trim: true },
  isPrimary: { type: Boolean, default: false },
}, { _id: true });

const restrictedClinicianSchema = new mongoose.Schema({
  clinician:    { type: mongoose.Schema.Types.ObjectId, ref: 'Clinician' },
  reason:       { type: String },
  restrictedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  restrictedAt: { type: Date, default: Date.now },
}, { _id: true });

const practiceSchema = new mongoose.Schema({
  practiceName: { type: String, required: true, trim: true },
  odsCode:      { type: String, trim: true, sparse: true },

  // Hierarchy
  pcn:        { type: mongoose.Schema.Types.ObjectId, ref: 'PCN' },
  icb:        { type: mongoose.Schema.Types.ObjectId, ref: 'ICB' },
  federation: { type: mongoose.Schema.Types.ObjectId, ref: 'Federation' },
  isStandalone: { type: Boolean, default: false },

  address: {
    street:   { type: String, trim: true },
    city:     { type: String, trim: true },
    postCode: { type: String, trim: true },
  },

  // Local decision makers
  contacts:          [contactSchema],
  gpLead:            { type: String, trim: true },
  pmBusinessManager: { type: String, trim: true },

  contractStatus:     { type: String, enum: ['Active','Expired','Pending','Suspended','Terminated'], default: 'Active' },
  contractType:       { type: String, enum: ['ARRS','EA','Direct','Mixed'] },
  contractStartDate:  { type: Date },
  contractRenewalDate:{ type: Date },
  contractExpiryDate: { type: Date },
  fteAllocation:      { type: String, trim: true },
  patientListSize:    { type: Number },
  icbName:            { type: String, trim: true },

  // Onboarding checklist (from Excel)
  onboarding: {
    approvalByCCG:         { type: Boolean, default: false },
    ndaSigned:             { type: Boolean, default: false },
    dataSharingAgreement:  { type: Boolean, default: false },
    mobilisationPlan:      { type: Boolean, default: false },
    mouReceived:           { type: Boolean, default: false },
    practiceForms:         { type: Boolean, default: false },
    prescribingPolicies:   { type: Boolean, default: false },
    systemAccessCompleted: { type: Boolean, default: false },
    templateInstalled:     { type: Boolean, default: false },
    reportsImported:       { type: Boolean, default: false },
    welcomePackSent:       { type: Boolean, default: false },
  },

  // Site-specific system access requirements
  systemAccess: {
    emis:         { type: Boolean, default: false },
    s1:           { type: Boolean, default: false },
    ice:          { type: Boolean, default: false },
    accurx:       { type: Boolean, default: false },
    docman:       { type: Boolean, default: false },
    softphone:    { type: Boolean, default: false },
    vpnRequired:  { type: Boolean, default: false },
    otherSystems: [String],
  },

  clinicalSystem:     { type: String, trim: true },
  clinicalSystemCode: { type: String, trim: true },

  // Linked clinicians
  linkedClinicians: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Clinician' }],

  // Restricted/Unsuitable clinicians tab
  restrictedClinicians: [restrictedClinicianSchema],

  // Rota visibility
  rotas: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Rota' }],

  operationsManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  miscNotes: { type: String },
  isActive:  { type: Boolean, default: true },
}, { timestamps: true });

practiceSchema.index({ practiceName: 'text', odsCode: 1 });
practiceSchema.index({ pcn: 1, isStandalone: 1, contractStatus: 1 });

const Practice = mongoose.model('Practice', practiceSchema);
export default Practice;