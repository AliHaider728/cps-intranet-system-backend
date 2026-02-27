import express from 'express';
import Practice from '../models/Practice.js';
import PCN from '../models/PCN.js';
import ContactHistory from '../models/ContactHistory.js';
import Document from '../models/Document.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// GET /api/practices
router.get('/', protect, async (req, res) => {
  try {
    const { pcn, standalone, status, icb, search, page = 1, limit = 20 } = req.query;
    const filter = { isActive: true };
    if (pcn) filter.pcn = pcn;
    if (standalone === 'true') filter.isStandalone = true;
    if (standalone === 'false') filter.isStandalone = false;
    if (status) filter.contractStatus = status;
    if (icb) filter.icb = icb;
    if (search) filter.$text = { $search: search };
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Practice.countDocuments(filter);
    const practices = await Practice.find(filter)
      .populate('pcn', 'pcnName pcnCode')
      .populate('icb', 'name icbCode')
      .populate('operationsManager', 'firstName lastName')
      .select('-restrictedClinicians')
      .sort({ practiceName: 1 })
      .skip(skip)
      .limit(parseInt(limit));
    res.json({ success: true, count: practices.length, total, pages: Math.ceil(total / parseInt(limit)), currentPage: parseInt(page), data: practices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/practices/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const practice = await Practice.findById(req.params.id)
      .populate('pcn', 'pcnName pcnCode')
      .populate('icb', 'name icbCode region')
      .populate('federation', 'name type')
      .populate('linkedClinicians', 'firstName lastName clinicianType compliance supervisionRAG')
      .populate('restrictedClinicians.clinician', 'firstName lastName clinicianType')
      .populate('restrictedClinicians.restrictedBy', 'firstName lastName')
      .populate('operationsManager', 'firstName lastName email');
    if (!practice) return res.status(404).json({ success: false, message: 'Practice not found' });
    const contactHistory = await ContactHistory.find({ ownerType: 'Practice', ownerId: practice._id })
      .populate('createdBy', 'firstName lastName').sort({ createdAt: -1 }).limit(50);
    const documents = await Document.find({ ownerType: 'Practice', ownerId: practice._id, isArchived: false })
      .populate('uploadedBy', 'firstName lastName').sort({ createdAt: -1 });
    res.json({ success: true, data: { ...practice.toObject(), contactHistory, documents } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/practices
router.post('/', protect, async (req, res) => {
  try {
    const practice = await Practice.create(req.body);
    if (practice.pcn) {
      await PCN.findByIdAndUpdate(practice.pcn, { $addToSet: { practices: practice._id } });
    }
    res.status(201).json({ success: true, data: practice });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'ODS Code already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/practices/:id
router.put('/:id', protect, async (req, res) => {
  try {
    const practice = await Practice.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!practice) return res.status(404).json({ success: false, message: 'Practice not found' });
    res.json({ success: true, data: practice });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/practices/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    await Practice.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Practice deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/practices/:id/contact-history
router.post('/:id/contact-history', protect, async (req, res) => {
  try {
    const entry = await ContactHistory.create({ ownerType: 'Practice', ownerId: req.params.id, createdBy: req.user._id, ...req.body });
    await entry.populate('createdBy', 'firstName lastName');
    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/practices/:id/contact-history
router.get('/:id/contact-history', protect, async (req, res) => {
  try {
    const { starred, type } = req.query;
    const filter = { ownerType: 'Practice', ownerId: req.params.id };
    if (starred === 'true') filter.isStarred = true;
    if (type) filter.type = type;
    const history = await ContactHistory.find(filter).populate('createdBy', 'firstName lastName').sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/practices/:id/contact-history/:histId/star
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

// PATCH /api/practices/:id/onboarding
router.patch('/:id/onboarding', protect, async (req, res) => {
  try {
    const practice = await Practice.findByIdAndUpdate(req.params.id, { $set: { onboarding: req.body } }, { new: true });
    if (!practice) return res.status(404).json({ success: false, message: 'Practice not found' });
    res.json({ success: true, data: practice.onboarding });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/practices/:id/system-access
router.patch('/:id/system-access', protect, async (req, res) => {
  try {
    const practice = await Practice.findByIdAndUpdate(req.params.id, { $set: { systemAccess: req.body } }, { new: true });
    if (!practice) return res.status(404).json({ success: false, message: 'Practice not found' });
    res.json({ success: true, data: practice.systemAccess });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/practices/:id/restricted-clinicians
router.post('/:id/restricted-clinicians', protect, async (req, res) => {
  try {
    const practice = await Practice.findById(req.params.id);
    if (!practice) return res.status(404).json({ success: false, message: 'Practice not found' });
    practice.restrictedClinicians.push({ ...req.body, restrictedBy: req.user._id });
    await practice.save();
    res.status(201).json({ success: true, data: practice.restrictedClinicians });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/practices/:id/restricted-clinicians/:rcId
router.delete('/:id/restricted-clinicians/:rcId', protect, async (req, res) => {
  try {
    const practice = await Practice.findById(req.params.id);
    if (!practice) return res.status(404).json({ success: false, message: 'Practice not found' });
    practice.restrictedClinicians = practice.restrictedClinicians.filter(rc => rc._id.toString() !== req.params.rcId);
    await practice.save();
    res.json({ success: true, message: 'Removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/practices/:id/documents
router.post('/:id/documents', protect, async (req, res) => {
  try {
    const doc = await Document.create({ ownerType: 'Practice', ownerId: req.params.id, uploadedBy: req.user._id, ...req.body });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/practices/:id/documents
router.get('/:id/documents', protect, async (req, res) => {
  try {
    const docs = await Document.find({ ownerType: 'Practice', ownerId: req.params.id, isArchived: false })
      .populate('uploadedBy', 'firstName lastName').sort({ createdAt: -1 });
    res.json({ success: true, data: docs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/practices/:id/contacts
router.patch('/:id/contacts', protect, async (req, res) => {
  try {
    const practice = await Practice.findByIdAndUpdate(req.params.id, { $set: { contacts: req.body.contacts } }, { new: true });
    if (!practice) return res.status(404).json({ success: false, message: 'Practice not found' });
    res.json({ success: true, data: practice.contacts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;