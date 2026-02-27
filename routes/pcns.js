import express from 'express';
import PCN from '../models/PCN.js';
import ContactHistory from '../models/ContactHistory.js';
import Document from '../models/Document.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

const calcOnboarding = (ob) => {
  if (!ob) return 0;
  const keys = Object.keys(ob);
  return Math.round(keys.filter(k => ob[k] === true).length / keys.length * 100);
};

// GET /api/pcns
router.get('/', protect, async (req, res) => {
  try {
    const { status, icb, federation, search, page = 1, limit = 20 } = req.query;
    const filter = { isActive: true };
    if (status) filter.contractStatus = status;
    if (icb) filter.icb = icb;
    if (federation) filter.federation = federation;
    if (search) filter.$text = { $search: search };
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await PCN.countDocuments(filter);
    const pcns = await PCN.find(filter)
      .populate('icb', 'name icbCode')
      .populate('federation', 'name type')
      .populate('operationsManager', 'firstName lastName email')
      .populate('practices', 'practiceName odsCode contractStatus isActive')
      .populate('activeClinicians', 'firstName lastName clinicianType')
      .select('-restrictedClinicians -monthlyMeetings')
      .sort({ pcnName: 1 })
      .skip(skip)
      .limit(parseInt(limit));
    res.json({ success: true, count: pcns.length, total, pages: Math.ceil(total / parseInt(limit)), currentPage: parseInt(page), data: pcns });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/pcns/:id  — full profile
router.get('/:id', protect, async (req, res) => {
  try {
    const pcn = await PCN.findById(req.params.id)
      .populate('icb', 'name icbCode region')
      .populate('federation', 'name type contactEmail contactPhone')
      .populate('operationsManager', 'firstName lastName email')
      .populate('practices', 'practiceName odsCode contractStatus address fteAllocation patientListSize isActive')
      .populate('activeClinicians', 'firstName lastName clinicianType compliance cppeStatus supervisionRAG')
      .populate('restrictedClinicians.clinician', 'firstName lastName clinicianType')
      .populate('restrictedClinicians.restrictedBy', 'firstName lastName');
    if (!pcn) return res.status(404).json({ success: false, message: 'PCN not found' });
    const contactHistory = await ContactHistory.find({ ownerType: 'PCN', ownerId: pcn._id })
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 }).limit(50);
    const documents = await Document.find({ ownerType: 'PCN', ownerId: pcn._id, isArchived: false })
      .populate('uploadedBy', 'firstName lastName')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: { ...pcn.toObject(), contactHistory, documents } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/pcns
router.post('/', protect, async (req, res) => {
  try {
    const pcn = await PCN.create(req.body);
    res.status(201).json({ success: true, data: pcn });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'PCN code already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/pcns/:id
router.put('/:id', protect, async (req, res) => {
  try {
    const pcn = await PCN.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!pcn) return res.status(404).json({ success: false, message: 'PCN not found' });
    res.json({ success: true, data: pcn });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/pcns/:id  (soft delete)
router.delete('/:id', protect, async (req, res) => {
  try {
    await PCN.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'PCN deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/pcns/:id/stats
router.get('/:id/stats', protect, async (req, res) => {
  try {
    const pcn = await PCN.findById(req.params.id).populate('practices', 'contractStatus').populate('activeClinicians', 'compliance');
    if (!pcn) return res.status(404).json({ success: false, message: 'PCN not found' });
    const daysToRenewal = pcn.contractRenewalDate ? Math.ceil((new Date(pcn.contractRenewalDate) - new Date()) / (1000 * 60 * 60 * 24)) : null;
    res.json({ success: true, data: { totalPractices: pcn.practices?.length || 0, totalClinicians: pcn.activeClinicians?.length || 0, annualSpend: pcn.annualSpend, contractStatus: pcn.contractStatus, onboardingPercent: calcOnboarding(pcn.onboarding), daysToRenewal, restrictedClinicians: pcn.restrictedClinicians?.length || 0 } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/pcns/:id/contact-history
router.post('/:id/contact-history', protect, async (req, res) => {
  try {
    const entry = await ContactHistory.create({ ownerType: 'PCN', ownerId: req.params.id, createdBy: req.user._id, ...req.body });
    await entry.populate('createdBy', 'firstName lastName');
    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/pcns/:id/contact-history
router.get('/:id/contact-history', protect, async (req, res) => {
  try {
    const { starred, type } = req.query;
    const filter = { ownerType: 'PCN', ownerId: req.params.id };
    if (starred === 'true') filter.isStarred = true;
    if (type) filter.type = type;
    const history = await ContactHistory.find(filter).populate('createdBy', 'firstName lastName').sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/pcns/:id/contact-history/:histId/star
router.patch('/:id/contact-history/:histId/star', protect, async (req, res) => {
  try {
    const entry = await ContactHistory.findById(req.params.histId);
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' });
    entry.isStarred = !entry.isStarred;
    await entry.save();
    res.json({ success: true, isStarred: entry.isStarred });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/pcns/:id/restricted-clinicians
router.post('/:id/restricted-clinicians', protect, async (req, res) => {
  try {
    const pcn = await PCN.findById(req.params.id);
    if (!pcn) return res.status(404).json({ success: false, message: 'PCN not found' });
    pcn.restrictedClinicians.push({ ...req.body, restrictedBy: req.user._id });
    await pcn.save();
    res.status(201).json({ success: true, data: pcn.restrictedClinicians });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/pcns/:id/restricted-clinicians/:rcId
router.delete('/:id/restricted-clinicians/:rcId', protect, async (req, res) => {
  try {
    const pcn = await PCN.findById(req.params.id);
    if (!pcn) return res.status(404).json({ success: false, message: 'PCN not found' });
    pcn.restrictedClinicians = pcn.restrictedClinicians.filter(rc => rc._id.toString() !== req.params.rcId);
    await pcn.save();
    res.json({ success: true, message: 'Removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/pcns/:id/monthly-meetings
router.post('/:id/monthly-meetings', protect, async (req, res) => {
  try {
    const pcn = await PCN.findById(req.params.id);
    if (!pcn) return res.status(404).json({ success: false, message: 'PCN not found' });
    pcn.monthlyMeetings.push(req.body);
    await pcn.save();
    res.status(201).json({ success: true, data: pcn.monthlyMeetings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/pcns/:id/onboarding
router.patch('/:id/onboarding', protect, async (req, res) => {
  try {
    const pcn = await PCN.findByIdAndUpdate(req.params.id, { $set: { onboarding: req.body } }, { new: true });
    if (!pcn) return res.status(404).json({ success: false, message: 'PCN not found' });
    res.json({ success: true, data: pcn.onboarding });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/pcns/:id/documents
router.post('/:id/documents', protect, async (req, res) => {
  try {
    const doc = await Document.create({ ownerType: 'PCN', ownerId: req.params.id, uploadedBy: req.user._id, ...req.body });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/pcns/:id/documents
router.get('/:id/documents', protect, async (req, res) => {
  try {
    const docs = await Document.find({ ownerType: 'PCN', ownerId: req.params.id, isArchived: false })
      .populate('uploadedBy', 'firstName lastName').sort({ createdAt: -1 });
    res.json({ success: true, data: docs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/pcns/:id/contacts
router.patch('/:id/contacts', protect, async (req, res) => {
  try {
    const pcn = await PCN.findByIdAndUpdate(req.params.id, { $set: { contacts: req.body.contacts } }, { new: true });
    if (!pcn) return res.status(404).json({ success: false, message: 'PCN not found' });
    res.json({ success: true, data: pcn.contacts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;