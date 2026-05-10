// ─── Asset Routes (Lapsing / Depreciation) ────────────────────────────────────
// POST   /api/assets                    create asset
// GET    /api/assets?clientId=          list assets for client
// PUT    /api/assets/:id                update / mark disposed
// DELETE /api/assets/:id                delete asset
// GET    /api/assets/:id/lapsing        straight-line lapsing schedule

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db, rowToClient, rowToAsset } from '../db.js';
import { authenticate, noEncoder } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);
router.use(noEncoder);

const round = n => Math.round(n * 100) / 100;

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtClientById   = db.prepare('SELECT * FROM clients WHERE id = ?');
const stmtInsertAsset  = db.prepare(`
  INSERT INTO assets (id, client_id, name, category, cost, salvage_value, useful_life_months, start_date, status, created_at)
  VALUES (@id, @client_id, @name, @category, @cost, @salvage_value, @useful_life_months, @start_date, @status, @created_at)
`);
const stmtAssetsByClient = db.prepare('SELECT * FROM assets WHERE client_id=? ORDER BY created_at DESC');
const stmtAssetById      = db.prepare('SELECT * FROM assets WHERE id=?');
const stmtUpdateAsset    = db.prepare(`
  UPDATE assets SET
    name=@name, category=@category, cost=@cost, salvage_value=@salvage_value,
    useful_life_months=@useful_life_months, start_date=@start_date, status=@status
  WHERE id=@id
`);
const stmtDeleteAsset = db.prepare('DELETE FROM assets WHERE id=?');

function canAccess(client, userId) {
  return client.ownerId === userId || client.accountantId === userId;
}

// POST /api/assets
router.post('/', (req, res, next) => {
  try {
    const {
      clientId, name, category = 'Machinery & Equipment',
      cost, salvageValue = 0, usefulLifeMonths, startDate,
    } = req.body;

    if (!clientId || !name || cost == null || !usefulLifeMonths || !startDate)
      return res.status(400).json({ error: 'clientId, name, cost, usefulLifeMonths and startDate are required' });
    if (Number(cost) <= 0)
      return res.status(400).json({ error: 'cost must be positive' });
    if (Number(usefulLifeMonths) < 1)
      return res.status(400).json({ error: 'usefulLifeMonths must be at least 1' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const id = uuid();
    stmtInsertAsset.run({
      id,
      client_id:          clientId,
      name,
      category,
      cost:               round(Number(cost)),
      salvage_value:      round(Number(salvageValue) || 0),
      useful_life_months: Math.round(Number(usefulLifeMonths)),
      start_date:         startDate,
      status:             'active',
      created_at:         new Date().toISOString(),
    });

    const asset = rowToAsset(stmtAssetById.get(id));
    res.status(201).json({ asset });
  } catch (err) { next(err); }
});

// GET /api/assets?clientId=
router.get('/', (req, res, next) => {
  try {
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const assets = stmtAssetsByClient.all(clientId).map(rowToAsset);

    const now = new Date();
    const enriched = assets.map(a => {
      const start   = new Date(a.startDate);
      const cutoff  = a.disposalDate ? new Date(a.disposalDate) : now;
      const monthsElapsed = Math.max(0, Math.floor((cutoff - start) / (1000 * 60 * 60 * 24 * 30.4375)));
      const depPM   = (a.cost - a.salvageValue) / a.usefulLifeMonths;
      const accumDep = round(Math.min(depPM * monthsElapsed, a.cost - a.salvageValue));
      return {
        ...a,
        monthlyDepreciation: round(depPM),
        accumulatedDepreciation: accumDep,
        bookValue: round(a.cost - accumDep),
        monthsElapsed: Math.min(monthsElapsed, a.usefulLifeMonths),
        fullyDepreciated: monthsElapsed >= a.usefulLifeMonths,
      };
    });

    res.json({ assets: enriched, count: enriched.length });
  } catch (err) { next(err); }
});

// PUT /api/assets/:id
router.put('/:id', (req, res, next) => {
  try {
    const existing = rowToAsset(stmtAssetById.get(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Asset not found' });

    const client = rowToClient(stmtClientById.get(existing.clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(403).json({ error: 'Not authorised' });

    const { name, category, cost, salvageValue, usefulLifeMonths, startDate, status } = req.body;

    stmtUpdateAsset.run({
      id:                 req.params.id,
      name:               name               ?? existing.name,
      category:           category           ?? existing.category,
      cost:               cost != null        ? round(Number(cost))               : existing.cost,
      salvage_value:      salvageValue != null ? round(Number(salvageValue))       : existing.salvageValue,
      useful_life_months: usefulLifeMonths    ? Math.round(Number(usefulLifeMonths)) : existing.usefulLifeMonths,
      start_date:         startDate          ?? existing.startDate,
      status:             status             ?? existing.status,
    });

    const asset = rowToAsset(stmtAssetById.get(req.params.id));
    res.json({ asset });
  } catch (err) { next(err); }
});

// DELETE /api/assets/:id
router.delete('/:id', (req, res, next) => {
  try {
    const asset = rowToAsset(stmtAssetById.get(req.params.id));
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    const client = rowToClient(stmtClientById.get(asset.clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(403).json({ error: 'Not authorised' });

    stmtDeleteAsset.run(req.params.id);
    res.json({ message: 'Asset deleted' });
  } catch (err) { next(err); }
});

// GET /api/assets/:id/lapsing — full straight-line lapsing schedule
router.get('/:id/lapsing', (req, res, next) => {
  try {
    const asset = rowToAsset(stmtAssetById.get(req.params.id));
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    const client = rowToClient(stmtClientById.get(asset.clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(403).json({ error: 'Not authorised' });

    const depPerMonth = (asset.cost - asset.salvageValue) / asset.usefulLifeMonths;
    const totalDep    = asset.cost - asset.salvageValue;
    const schedule    = [];
    const startDate   = new Date(asset.startDate);
    let accumulated   = 0;

    for (let i = 0; i < asset.usefulLifeMonths; i++) {
      const period = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
      const dep    = i < asset.usefulLifeMonths - 1
        ? round(depPerMonth)
        : round(totalDep - accumulated);
      accumulated  = round(accumulated + dep);
      const bookValue = round(asset.cost - accumulated);

      schedule.push({
        period: `${period.getFullYear()}-${String(period.getMonth() + 1).padStart(2, '0')}`,
        depreciation: dep,
        accumulated,
        bookValue: Math.max(bookValue, asset.salvageValue),
      });
    }

    res.json({
      asset: {
        id: asset.id, name: asset.name, category: asset.category,
        cost: asset.cost, salvageValue: asset.salvageValue,
        usefulLifeMonths: asset.usefulLifeMonths,
        startDate: asset.startDate, method: 'Straight-Line',
        monthlyDepreciation: round(depPerMonth),
        totalDepreciation:   round(totalDep),
      },
      schedule,
    });
  } catch (err) { next(err); }
});

export default router;
