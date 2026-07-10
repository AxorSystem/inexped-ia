import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from './auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const r = await query(
    `SELECT id, codigo, nombre, descripcion, ejercicio, activo FROM dbo.fondos WHERE activo = 1 ORDER BY codigo`
  );
  res.json(r.recordset);
});

export default router;
