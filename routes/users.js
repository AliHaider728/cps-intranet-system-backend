import express from 'express';
import User from '../models/User.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// ─── GET /api/users ────────────────────────────────────────────────────────────
router.get('/', protect, authorize('Admin', 'Director'), async (req, res) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (role)   filter.role = role;
    if (search) filter.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName:  { $regex: search, $options: 'i' } },
      { email:     { $regex: search, $options: 'i' } },
    ];
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('-password')
      .sort({ firstName: 1 })
      .skip(skip)
      .limit(parseInt(limit));
    res.json({ success: true, count: users.length, total, pages: Math.ceil(total / parseInt(limit)), data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/users/:id ────────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUT /api/users/:id ────────────────────────────────────────────────────────
router.put('/:id', protect, async (req, res) => {
  try {
    // Only Admin/Director can change roles
    if (req.body.role && !['Admin', 'Director'].includes(req.user.role)) {
      delete req.body.role;
    }
    // Don't allow password update via this route
    delete req.body.password;

    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PATCH /api/users/:id/toggle-active ───────────────────────────────────────
router.patch('/:id/toggle-active', protect, authorize('Admin', 'Director'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.isActive = !user.isActive;
    await user.save();
    res.json({ success: true, isActive: user.isActive });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PATCH /api/users/:id/change-password ─────────────────────────────────────
router.patch('/:id/change-password', protect, async (req, res) => {
  try {
    // Only self or Admin can change password
    if (req.params.id !== req.user._id.toString() && !['Admin', 'Director'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (req.params.id === req.user._id.toString()) {
      const valid = await user.comparePassword(currentPassword);
      if (!valid) return res.status(401).json({ success: false, message: 'Current password incorrect' });
    }

    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;