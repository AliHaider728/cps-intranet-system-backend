import express from 'express';
import Clinician from "../models/"
import PCN from '../models/PCN.js';
import Practice from '../models/Practice.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// ─── GET /api/clinicians ───────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const { type, pcn, practice, cppeStatus, complianceBelow, search, page = 1, limit = 20 } = req.query;
    const filter = { isActive: true };

    if (type)       filter.clinicianType = type;
    if (pcn)        filter.currentPCNs = pcn;
    if (practice)   filter.currentPractices = practice;
    if (cppeStatus) filter.cppeStatus = cppeStatus;
    if (search)     filter.$text = { $search: search };
    if (complianceBelow) filter['compliance.percentComplete'] = { $lt: parseInt(complianceBelow) };

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Clinician.countDocuments(filter);
    const clinicians = await Clinician.find(filter)
      .populate('currentPCNs',   'pcnName pcnCode')
      .populate('currentPractices', 'practiceName odsCode')
      .populate('clinicalSupervisor', 'firstName lastName')
      .populate('opsLead', 'firstName lastName')
      .sort({ lastName: 1, firstName: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({ success: true, count: clinicians.length, total, pages: Math.ceil(total / parseInt(limit)), currentPage: parseInt(page), data: clinicians });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/clinicians/:id ───────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const clinician = await Clinician.findById(req.params.id)
      .populate('currentPCNs',      'pcnName pcnCode contractStatus annualSpend')
      .populate('currentPractices', 'practiceName odsCode contractStatus')
      .populate('clinicalSupervisor', 'firstName lastName email')
      .populate('opsLead',            'firstName lastName email');

    if (!clinician) return res.status(404).json({ success: false, message: 'Clinician not found' });
    res.json({ success: true, data: clinician });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/clinicians ──────────────────────────────────────────────────────
router.post('/', protect, async (req, res) => {
  try {
    const clinician = await Clinician.create(req.body);

    // If assigned to PCNs — add to their activeClinicians array
    if (req.body.currentPCNs?.length) {
      await PCN.updateMany(
        { _id: { $in: req.body.currentPCNs } },
        { $addToSet: { activeClinicians: clinician._id } }
      );
    }
    // If assigned to Practices
    if (req.body.currentPractices?.length) {
      await Practice.updateMany(
        { _id: { $in: req.body.currentPractices } },
        { $addToSet: { linkedClinicians: clinician._id } }
      );
    }

    res.status(201).json({ success: true, data: clinician });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Email already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUT /api/clinicians/:id ───────────────────────────────────────────────────
router.put('/:id', protect, async (req, res) => {
  try {
    const clinician = await Clinician.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!clinician) return res.status(404).json({ success: false, message: 'Clinician not found' });
    res.json({ success: true, data: clinician });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── DELETE /api/clinicians/:id (soft delete) ──────────────────────────────────
router.delete('/:id', protect, authorize('Admin', 'Director', 'Operations Manager'), async (req, res) => {
  try {
    await Clinician.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Clinician deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PATCH /api/clinicians/:id/compliance ─────────────────────────────────────
router.patch('/:id/compliance', protect, async (req, res) => {
  try {
    const clinician = await Clinician.findByIdAndUpdate(
      req.params.id,
      { $set: { compliance: req.body } },
      { new: true }
    );
    if (!clinician) return res.status(404).json({ success: false, message: 'Clinician not found' });

    // Recalculate compliance percent
    const comp = clinician.compliance;
    const fields = ['dbsCheck', 'indemnityInsurance', 'gphcRegistration', 'rightToWork', 'mandatoryTraining'];
    const done = fields.filter(f => comp[f]?.status === 'Valid' || comp[f]?.status === 'Completed').length;
    const extraDone = (comp.cvOnFile ? 1 : 0) + (comp.referencesOnFile ? 1 : 0);
    const total = fields.length + 2;
    const percent = Math.round(((done + extraDone) / total) * 100);

    await Clinician.findByIdAndUpdate(req.params.id, { 'compliance.percentComplete': percent });
    res.json({ success: true, data: { ...clinician.toObject(), compliance: { ...comp.toObject(), percentComplete: percent } } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PATCH /api/clinicians/:id/assign-pcn ─────────────────────────────────────
// Assign or remove clinician from a PCN
router.patch('/:id/assign-pcn', protect, async (req, res) => {
  try {
    const { pcnId, action } = req.body; // action: 'add' | 'remove'
    if (!pcnId || !action) return res.status(400).json({ success: false, message: 'pcnId and action required' });

    const update = action === 'add'
      ? { $addToSet: { currentPCNs: pcnId } }
      : { $pull:     { currentPCNs: pcnId } };
    const clinician = await Clinician.findByIdAndUpdate(req.params.id, update, { new: true });

    const pcnUpdate = action === 'add'
      ? { $addToSet: { activeClinicians: req.params.id } }
      : { $pull:     { activeClinicians: req.params.id } };
    await PCN.findByIdAndUpdate(pcnId, pcnUpdate);

    res.json({ success: true, data: clinician });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PATCH /api/clinicians/:id/assign-practice ────────────────────────────────
router.patch('/:id/assign-practice', protect, async (req, res) => {
  try {
    const { practiceId, action } = req.body;
    if (!practiceId || !action) return res.status(400).json({ success: false, message: 'practiceId and action required' });

    const update = action === 'add'
      ? { $addToSet: { currentPractices: practiceId } }
      : { $pull:     { currentPractices: practiceId } };
    const clinician = await Clinician.findByIdAndUpdate(req.params.id, update, { new: true });

    const practiceUpdate = action === 'add'
      ? { $addToSet: { linkedClinicians: req.params.id } }
      : { $pull:     { linkedClinicians: req.params.id } };
    await Practice.findByIdAndUpdate(practiceId, practiceUpdate);

    res.json({ success: true, data: clinician });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/clinicians/:id/system-access ────────────────────────────────────
router.get('/:id/system-access', protect, async (req, res) => {
  try {
    const clinician = await Clinician.findById(req.params.id).select('systemAccess firstName lastName');
    if (!clinician) return res.status(404).json({ success: false, message: 'Clinician not found' });
    res.json({ success: true, data: clinician.systemAccess });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/clinicians/:id/system-access ───────────────────────────────────
// Request system access for a client
router.post('/:id/system-access', protect, async (req, res) => {
  try {
    const clinician = await Clinician.findById(req.params.id);
    if (!clinician) return res.status(404).json({ success: false, message: 'Clinician not found' });
    clinician.systemAccess.push({ ...req.body, requestedAt: new Date() });
    await clinician.save();
    res.status(201).json({ success: true, data: clinician.systemAccess });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PATCH /api/clinicians/:id/system-access/:accessId ───────────────────────
// Update status of system access request (Requested → Approved → Completed)
router.patch('/:id/system-access/:accessId', protect, async (req, res) => {
  try {
    const clinician = await Clinician.findById(req.params.id);
    if (!clinician) return res.status(404).json({ success: false, message: 'Clinician not found' });
    const access = clinician.systemAccess.id(req.params.accessId);
    if (!access) return res.status(404).json({ success: false, message: 'Access record not found' });
    Object.assign(access, req.body);
    await clinician.save();
    res.json({ success: true, data: access });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/clinicians/stats/overview ───────────────────────────────────────
router.get('/stats/overview', protect, async (req, res) => {
  try {
    const [total, byType, byCPPE, complianceAvg] = await Promise.all([
      Clinician.countDocuments({ isActive: true }),
      Clinician.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$clinicianType', count: { $sum: 1 } } }
      ]),
      Clinician.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$cppeStatus', count: { $sum: 1 } } }
      ]),
      Clinician.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: null, avg: { $avg: '$compliance.percentComplete' } } }
      ]),
    ]);

    res.json({
      success: true,
      data: {
        total,
        byType:      Object.fromEntries(byType.map(b => [b._id, b.count])),
        byCPPE:      Object.fromEntries(byCPPE.map(b => [b._id, b.count])),
        avgCompliance: Math.round(complianceAvg[0]?.avg || 0),
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;