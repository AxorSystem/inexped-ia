import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from './auth.js';

const router = Router();
router.use(requireAuth);

/**
 * Lista de costos con filtros + agregados.
 * Query params: desde, hasta (YYYY-MM-DD), expediente_id, accion, limit
 */
router.get('/costos', async (req, res) => {
  const desde = String(req.query.desde ?? '').trim();
  const hasta = String(req.query.hasta ?? '').trim();
  const accion = String(req.query.accion ?? '').trim();
  const expedienteId = req.query.expediente_id ? Number(req.query.expediente_id) : null;
  const limit = Math.min(500, Number(req.query.limit) || 200);

  const where: string[] = [];
  const params: Record<string, any> = { limit };
  if (desde) { where.push('c.ts >= @desde'); params.desde = desde; }
  if (hasta) { where.push('c.ts < DATEADD(day, 1, @hasta)'); params.hasta = hasta; }
  if (accion) { where.push('c.accion = @accion'); params.accion = accion; }
  if (expedienteId) { where.push('c.expediente_id = @exp'); params.exp = expedienteId; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // Detalle: top N recientes
  const detalleR = await query(
    `SELECT TOP (@limit)
            c.id, c.ts, c.expediente_id, c.accion, c.modelo,
            c.input_tokens, c.output_tokens, c.cost_usd, c.actor, c.meta_json,
            e.folio AS expediente_folio, e.nombre AS expediente_nombre
       FROM dbo.costos_ia c
       LEFT JOIN dbo.expedientes e ON e.id = c.expediente_id
       ${whereSql}
      ORDER BY c.ts DESC`,
    params,
  );

  // Agregados
  const totalR = await query(
    `SELECT COUNT(*) AS n, ISNULL(SUM(cost_usd), 0) AS total
       FROM dbo.costos_ia c ${whereSql}`,
    params,
  );
  const porAccionR = await query(
    `SELECT accion, COUNT(*) AS n, SUM(cost_usd) AS total
       FROM dbo.costos_ia c ${whereSql}
      GROUP BY accion ORDER BY total DESC`,
    params,
  );
  const porModeloR = await query(
    `SELECT ISNULL(modelo, 'desconocido') AS modelo, COUNT(*) AS n, SUM(cost_usd) AS total
       FROM dbo.costos_ia c ${whereSql}
      GROUP BY modelo ORDER BY total DESC`,
    params,
  );
  const porDiaR = await query(
    `SELECT CAST(ts AS DATE) AS dia, COUNT(*) AS n, SUM(cost_usd) AS total
       FROM dbo.costos_ia c ${whereSql}
      GROUP BY CAST(ts AS DATE)
      ORDER BY dia DESC`,
    params,
  );
  const porExpR = await query(
    `SELECT c.expediente_id, e.folio, e.nombre, COUNT(*) AS n, SUM(c.cost_usd) AS total
       FROM dbo.costos_ia c
       LEFT JOIN dbo.expedientes e ON e.id = c.expediente_id
       ${whereSql}
      GROUP BY c.expediente_id, e.folio, e.nombre
      ORDER BY total DESC`,
    params,
  );

  const detalle = detalleR.recordset.map((r: any) => ({
    ...r,
    meta: r.meta_json ? safeJson(r.meta_json) : null,
    meta_json: undefined,
  }));

  res.json({
    total: {
      operaciones: totalR.recordset[0].n,
      cost_usd: Number(totalR.recordset[0].total),
    },
    por_accion: porAccionR.recordset.map((r: any) => ({ accion: r.accion, n: r.n, cost_usd: Number(r.total) })),
    por_modelo: porModeloR.recordset.map((r: any) => ({ modelo: r.modelo, n: r.n, cost_usd: Number(r.total) })),
    por_dia: porDiaR.recordset.map((r: any) => ({ dia: r.dia, n: r.n, cost_usd: Number(r.total) })),
    por_expediente: porExpR.recordset.map((r: any) => ({
      expediente_id: r.expediente_id,
      folio: r.folio,
      nombre: r.nombre,
      n: r.n,
      cost_usd: Number(r.total),
    })),
    detalle,
  });
});

function safeJson(s: string) {
  try { return JSON.parse(s); } catch { return null; }
}

export default router;
