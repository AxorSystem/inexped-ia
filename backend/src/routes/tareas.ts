import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from './auth.js';

const router = Router();
router.use(requireAuth);

/** Marca una tarea como completada / observada / no aplica. */
router.patch('/:id', async (req: any, res) => {
  const id = Number(req.params.id);
  const { estado, observaciones } = req.body ?? {};
  if (!['pendiente', 'completada', 'observada', 'no_aplica'].includes(estado)) {
    return res.status(400).json({ error: 'estado inválido' });
  }
  const completadaAt = estado === 'completada' ? new Date() : null;
  await query(
    `UPDATE dbo.expediente_tareas
        SET estado=@e, observaciones=@o,
            completada_at=@ca, completada_por=@cp,
            updated_at=SYSUTCDATETIME()
      WHERE id=@id`,
    {
      id,
      e: estado,
      o: observaciones ?? null,
      ca: completadaAt,
      cp: estado === 'completada' ? (req.user?.name ?? req.user?.sub ?? 'anon') : null,
    }
  );
  const r = await query(
    `SELECT id, expediente_id, fase_id, estado, observaciones, completada_at, completada_por
       FROM dbo.expediente_tareas WHERE id=@id`,
    { id }
  );
  res.json(r.recordset[0]);
});

/** Documentos de una tarea. */
router.get('/:id/documentos', async (req, res) => {
  const r = await query(
    `SELECT id, filename, tipo_doc, metadata_json, ai_summary, uploaded_at, uploaded_by
       FROM dbo.documentos WHERE expediente_tarea_id=@id ORDER BY uploaded_at DESC`,
    { id: Number(req.params.id) }
  );
  res.json(
    r.recordset.map((d: any) => ({
      ...d,
      metadata: d.metadata_json ? JSON.parse(d.metadata_json) : null,
    }))
  );
});

export default router;
