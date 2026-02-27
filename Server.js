import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db.js';

import authRoutes       from './routes/auth.js';
import userRoutes       from './routes/users.js';
import pcnRoutes        from './routes/pcns.js';
import practiceRoutes   from './routes/practices.js';
import clinicianRoutes  from './routes/clinicians.js';
import hierarchyRoutes  from './routes/hierarchy.js';
import reportRoutes     from './routes/reports.js';

dotenv.config();

const app = express();

// ── DB ────────────────────────────────────────────────────────────────────────
connectDB();

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/users',       userRoutes);
app.use('/api/pcns',        pcnRoutes);
app.use('/api/practices',   practiceRoutes);
app.use('/api/clinicians',  clinicianRoutes);
app.use('/api/reports',     reportRoutes);
app.use('/api',             hierarchyRoutes);   // /api/icbs  /api/federations

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'CPS CRM API running', timestamp: new Date().toISOString() });
});

// ── Global error handler ───────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Server Error',
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(` CPS CRM Server running on port ${PORT} [${process.env.NODE_ENV}]`));

export default app;