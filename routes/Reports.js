import express from 'express';
import ICB from '../models/ICB.js';
import Federation from '../models/Federation.js';
import PCN from '../models/PCN.js';
import Practice from '../models/Practice.js';
import Clinician from '../models/Clinician.js';
import ContactHistory from '../models/ContactHistory.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/hierarchy-rollup
// Full ICB → Federation → PCN → Practices roll-up with financials
// ─────────────────────────────────────────────────────────────────────────────
router.get('/hierarchy-rollup', protect, async (req, res) => {
  try {
    const { icbId } = req.query;
    const icbFilter = icbId ? { _id: icbId } : {};

    const icbs = await ICB.find({ ...icbFilter, isActive: true }).lean();

    const rollup = await Promise.all(icbs.map(async (icb) => {
      const federations = await Federation.find({ icb: icb._id, isActive: true }).lean();

      const federationsWithData = await Promise.all(federations.map(async (fed) => {
        const pcns = await PCN.find({ federation: fed._id, isActive: true })
          .populate('practices', 'practiceName odsCode contractStatus annualSpend patientListSize fteAllocation onboarding')
          .populate('activeClinicians', 'firstName lastName clinicianType')
          .lean();

        const pcnsWithStats = pcns.map(pcn => {
          const onboardingKeys = Object.keys(pcn.onboarding || {});
          const onboardingDone = onboardingKeys.filter(k => pcn.onboarding[k] === true).length;
          return {
            ...pcn,
            stats: {
              practicesCount:   pcn.practices?.length || 0,
              cliniciansCount:  pcn.activeClinicians?.length || 0,
              onboardingPercent: onboardingKeys.length ? Math.round(onboardingDone / onboardingKeys.length * 100) : 0,
              daysToRenewal: pcn.contractRenewalDate
                ? Math.ceil((new Date(pcn.contractRenewalDate) - new Date()) / (1000 * 60 * 60 * 24))
                : null,
            }
          };
        });

        const fedTotals = {
          totalPCNs:       pcns.length,
          totalPractices:  pcns.reduce((s, p) => s + (p.practices?.length || 0), 0),
          totalClinicians: pcns.reduce((s, p) => s + (p.activeClinicians?.length || 0), 0),
          totalAnnualSpend: pcns.reduce((s, p) => s + (p.annualSpend || 0), 0),
          activePCNs:      pcns.filter(p => p.contractStatus === 'Active').length,
        };

        return { ...fed, pcns: pcnsWithStats, totals: fedTotals };
      }));

      // ICB-level totals (roll-up from all federations)
      const icbTotals = {
        totalFederations: federations.length,
        totalPCNs:        federationsWithData.reduce((s, f) => s + f.totals.totalPCNs, 0),
        totalPractices:   federationsWithData.reduce((s, f) => s + f.totals.totalPractices, 0),
        totalClinicians:  federationsWithData.reduce((s, f) => s + f.totals.totalClinicians, 0),
        totalAnnualSpend: federationsWithData.reduce((s, f) => s + f.totals.totalAnnualSpend, 0),
      };

      return { ...icb, federations: federationsWithData, totals: icbTotals };
    }));

    res.json({ success: true, data: rollup });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/pcn-rollup/:pcnId
// Roll-up from all Practices under a PCN
// ─────────────────────────────────────────────────────────────────────────────
router.get('/pcn-rollup/:pcnId', protect, async (req, res) => {
  try {
    const pcn = await PCN.findById(req.params.pcnId)
      .populate('icb', 'name icbCode')
      .populate('federation', 'name type')
      .populate('operationsManager', 'firstName lastName')
      .lean();

    if (!pcn) return res.status(404).json({ success: false, message: 'PCN not found' });

    const practices = await Practice.find({ pcn: req.params.pcnId, isActive: true })
      .populate('linkedClinicians', 'firstName lastName clinicianType compliance supervisionRAG')
      .lean();

    const practicesWithStats = practices.map(p => {
      const ob = p.onboarding || {};
      const keys = Object.keys(ob);
      const done = keys.filter(k => ob[k]).length;
      return {
        ...p,
        onboardingPercent: keys.length ? Math.round(done / keys.length * 100) : 0,
        daysToRenewal: p.contractRenewalDate
          ? Math.ceil((new Date(p.contractRenewalDate) - new Date()) / (1000 * 60 * 60 * 24))
          : null,
      };
    });

    // Roll-up totals: Practices → PCN
    const rollupTotals = {
      totalPractices:      practices.length,
      activePractices:     practices.filter(p => p.contractStatus === 'Active').length,
      totalPatients:       practices.reduce((s, p) => s + (p.patientListSize || 0), 0),
      totalClinicians:     practices.reduce((s, p) => s + (p.linkedClinicians?.length || 0), 0),
      avgOnboarding:       Math.round(practicesWithStats.reduce((s, p) => s + p.onboardingPercent, 0) / (practices.length || 1)),
      renewingSoon:        practicesWithStats.filter(p => p.daysToRenewal !== null && p.daysToRenewal <= 30 && p.daysToRenewal >= 0).length,
    };

    // Recent contact history across all practices (communications roll-up)
    const practiceIds = practices.map(p => p._id);
    const recentComms = await ContactHistory.find({
      ownerType: 'Practice',
      ownerId:   { $in: practiceIds }
    })
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({
      success: true,
      data: {
        pcn,
        practices: practicesWithStats,
        rollupTotals,
        recentCommunications: recentComms,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/contract-overview
// All contracts across PCNs + Practices with status breakdown
// ─────────────────────────────────────────────────────────────────────────────
router.get('/contract-overview', protect, async (req, res) => {
  try {
    const [pcnContracts, practiceContracts] = await Promise.all([
      PCN.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$contractStatus', count: { $sum: 1 }, totalSpend: { $sum: '$annualSpend' } } }
      ]),
      Practice.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$contractStatus', count: { $sum: 1 } } }
      ]),
    ]);

    // Contracts renewing in next 30 days
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [renewingPCNs, renewingPractices] = await Promise.all([
      PCN.find({ isActive: true, contractRenewalDate: { $gte: now, $lte: in30 } })
        .select('pcnName contractRenewalDate annualSpend contractStatus')
        .sort({ contractRenewalDate: 1 }),
      Practice.find({ isActive: true, contractRenewalDate: { $gte: now, $lte: in30 } })
        .select('practiceName odsCode contractRenewalDate contractStatus')
        .sort({ contractRenewalDate: 1 }),
    ]);

    res.json({
      success: true,
      data: {
        pcnByStatus:      Object.fromEntries(pcnContracts.map(c => [c._id, { count: c.count, totalSpend: c.totalSpend }])),
        practiceByStatus: Object.fromEntries(practiceContracts.map(c => [c._id, c.count])),
        renewingSoon: { pcns: renewingPCNs, practices: renewingPractices },
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/onboarding-overview
// All onboarding progress across PCNs + Practices
// ─────────────────────────────────────────────────────────────────────────────
router.get('/onboarding-overview', protect, async (req, res) => {
  try {
    const [pcns, practices] = await Promise.all([
      PCN.find({ isActive: true }).select('pcnName onboarding contractStatus').lean(),
      Practice.find({ isActive: true }).select('practiceName odsCode onboarding contractStatus').populate('pcn', 'pcnName').lean(),
    ]);

    const calcPercent = (ob) => {
      const keys = Object.keys(ob || {});
      if (!keys.length) return 0;
      return Math.round(keys.filter(k => ob[k]).length / keys.length * 100);
    };

    const pcnStats = pcns.map(p => ({ id: p._id, name: p.pcnName, status: p.contractStatus, percent: calcPercent(p.onboarding) }));
    const practiceStats = practices.map(p => ({ id: p._id, name: p.practiceName, odsCode: p.odsCode, pcn: p.pcn?.pcnName, status: p.contractStatus, percent: calcPercent(p.onboarding) }));

    const avgPCN      = Math.round(pcnStats.reduce((s, p) => s + p.percent, 0) / (pcnStats.length || 1));
    const avgPractice = Math.round(practiceStats.reduce((s, p) => s + p.percent, 0) / (practiceStats.length || 1));

    res.json({
      success: true,
      data: {
        pcns: pcnStats, practices: practiceStats,
        averages: { pcns: avgPCN, practices: avgPractice },
        complete: {
          pcns:      pcnStats.filter(p => p.percent === 100).length,
          practices: practiceStats.filter(p => p.percent === 100).length,
        },
        incomplete: {
          pcns:      pcnStats.filter(p => p.percent < 100).length,
          practices: practiceStats.filter(p => p.percent < 100).length,
        },
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/clinician-placement
// Clinician → PCN/Practice placement overview
// ─────────────────────────────────────────────────────────────────────────────
router.get('/clinician-placement', protect, async (req, res) => {
  try {
    const clinicians = await Clinician.find({ isActive: true })
      .populate('currentPCNs',      'pcnName pcnCode annualSpend contractStatus')
      .populate('currentPractices', 'practiceName odsCode contractStatus')
      .select('firstName lastName clinicianType currentPCNs currentPractices compliance supervisionRAG cppeStatus')
      .lean();

    const unassigned = clinicians.filter(c => !c.currentPCNs?.length && !c.currentPractices?.length);
    const byType = {};
    clinicians.forEach(c => {
      if (!byType[c.clinicianType]) byType[c.clinicianType] = 0;
      byType[c.clinicianType]++;
    });

    res.json({
      success: true,
      data: {
        total:      clinicians.length,
        unassigned: unassigned.length,
        byType,
        clinicians,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;