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

router.get('/:id/checklist', async (req, res) => {
  const r = await query(
    `SELECT id, estado, tipo_doc, descripcion, obligatorio, orden
       FROM dbo.checklist_items WHERE fondo_id = @id ORDER BY orden`,
    { id: Number(req.params.id) }
  );
  res.json(r.recordset);
});

export default router;
