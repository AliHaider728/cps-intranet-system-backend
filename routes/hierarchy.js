import express from 'express';
import ICB from '../models/ICB.js';
import Federation from '../models/Federation.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// ============ ICB ROUTES ============
router.get('/icbs', protect, async (req, res) => {
  try {
    const icbs = await ICB.find({ isActive: true }).sort({ name: 1 });
    res.json({ success: true, data: icbs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/icbs', protect, async (req, res) => {
  try {
    const icb = await ICB.create(req.body);
    res.status(201).json({ success: true, data: icb });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/icbs/:id', protect, async (req, res) => {
  try {
    const icb = await ICB.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: icb });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ FEDERATION ROUTES ============
router.get('/federations', protect, async (req, res) => {
  try {
    const { icb } = req.query;
    const filter = { isActive: true };
    if (icb) filter.icb = icb;
    const federations = await Federation.find(filter).populate('icb', 'name').sort({ name: 1 });
    res.json({ success: true, data: federations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/federations', protect, async (req, res) => {
  try {
    const federation = await Federation.create(req.body);
    res.status(201).json({ success: true, data: federation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/federations/:id', protect, async (req, res) => {
  try {
    const fed = await Federation.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: fed });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;