import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from './auth.js';

const router = Router();
router.use(requireAuth);

/** Catálogo de 6 fases. */
router.get('/', async (req, res) => {
  const r = await query('SELECT id, orden, clave, nombre, icono, color FROM dbo.fases ORDER BY orden');
  res.json(r.recordset);
});

/** Catálogo de tareas por fase. */
router.get('/:faseId/tareas', async (req, res) => {
  const r = await query(
    `SELECT id, fase_id, orden, nombre, descripcion, fundamento_legal, obligatorio, tipos_adjudicacion
       FROM dbo.tareas_catalogo WHERE fase_id = @f ORDER BY orden`,
    { f: Number(req.params.faseId) }
  );
  res.json(r.recordset);
});

export default router;
