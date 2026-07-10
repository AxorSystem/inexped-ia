-- ============================================================
-- Seed demo: cierra completamente el expediente 2026-FAISM-003
-- para tener un ejemplo de "resultado final" visible.
-- Genera docs placeholder realistas (filename + tipo_doc + ai_summary)
-- para cada tarea del expediente que aún no tenga docs. Idempotente.
-- ============================================================
USE inexped_ia_demo;
GO

DECLARE @expId INT = (SELECT id FROM dbo.expedientes WHERE folio = '2026-FAISM-003');

IF @expId IS NULL
BEGIN
  PRINT '2026-FAISM-003 no encontrado';
  RETURN;
END;

-- 1) Marca TODAS las tareas del expediente como completadas
UPDATE dbo.expediente_tareas
   SET estado = 'completada',
       completada_at = SYSUTCDATETIME(),
       completada_por = 'Ing. Carlos Vega',
       updated_at = SYSUTCDATETIME()
 WHERE expediente_id = @expId
   AND estado <> 'completada';

-- 2) Genera un doc placeholder para cada tarea que no tenga uno
DECLARE @nombreExp NVARCHAR(500) = (SELECT nombre FROM dbo.expedientes WHERE id = @expId);

INSERT INTO dbo.documentos
  (expediente_id, expediente_tarea_id, filename, storage_path, mime_type, size_bytes, tipo_doc, extracted_text, metadata_json, ai_summary, uploaded_by, uploaded_at)
SELECT
  @expId,
  et.id,
  -- Nombre realista basado en la tarea
  CONCAT(
    LOWER(REPLACE(REPLACE(REPLACE(REPLACE(et.nombre, ' ', '-'), 'á','a'), 'é','e'), 'ñ','n')),
    '-2026-FAISM-003.pdf'
  ) AS filename,
  CONCAT('/data/uploads/seed/', @expId, '-tarea-', et.id, '.pdf') AS storage_path,
  'application/pdf',
  ABS(CHECKSUM(NEWID())) % 800000 + 80000,   -- 80KB - 880KB simulado
  -- Mapeo tipo_doc por nombre de tarea
  CASE
    WHEN et.nombre LIKE '%acta%' THEN 'acta'
    WHEN et.nombre LIKE '%oficio%' OR et.nombre LIKE '%invitac%' THEN 'oficio'
    WHEN et.nombre LIKE '%factura%' OR et.nombre LIKE '%CFDI%' THEN 'factura'
    WHEN et.nombre LIKE '%contrato%' THEN 'contrato'
    WHEN et.nombre LIKE '%estimac%' THEN 'estimacion'
    WHEN et.nombre LIKE '%bitacora%' OR et.nombre LIKE '%bitácora%' THEN 'bitacora'
    WHEN et.nombre LIKE '%finiquito%' THEN 'finiquito'
    WHEN et.nombre LIKE '%evidencia%' THEN 'evidencia'
    ELSE 'oficio'
  END,
  CONCAT('Documento validado: ', et.nombre, '. Cargado y clasificado por INEXPED IA.'),
  '{"validado":true,"revisado_por_ia":true,"seed":true}',
  CONCAT('Documento validado sin observaciones para la tarea "', et.nombre, '".'),
  'Ing. Carlos Vega',
  DATEADD(day, -ABS(CHECKSUM(NEWID())) % 60 - 5, SYSUTCDATETIME())  -- fecha dispersa en últimos 65 días
FROM dbo.expediente_tareas et
WHERE et.expediente_id = @expId
  AND NOT EXISTS (
    SELECT 1 FROM dbo.documentos d
     WHERE d.expediente_tarea_id = et.id
  );

-- 3) Cambia estado del expediente a 'cerrado'
UPDATE dbo.expedientes
   SET estado = 'cerrado',
       updated_at = SYSUTCDATETIME()
 WHERE id = @expId;

-- 4) Log
INSERT INTO dbo.audit_log (actor, action, entity, entity_id, payload_json)
VALUES ('INEXPED IA (seed)', 'demo_completar_cierre', 'expediente', @expId,
        (SELECT CONCAT('{"tareas_completadas":', COUNT(*), '}')
           FROM dbo.expediente_tareas WHERE expediente_id = @expId));

DECLARE @docs INT = (SELECT COUNT(*) FROM dbo.documentos WHERE expediente_id = @expId);
DECLARE @tareas INT = (SELECT COUNT(*) FROM dbo.expediente_tareas WHERE expediente_id = @expId AND estado = 'completada');
PRINT CONCAT('FAISM-003 cerrado. Tareas completadas: ', @tareas, '. Docs: ', @docs);
GO
