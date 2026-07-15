-- ============================================================
-- INEXPED IA — schema V4: nombres oficiales de las 6 fases
-- según metodología Ing. Enrique Ocampo Rojas (GASFED).
-- Idempotente.
-- ============================================================
USE inexped_ia_demo;
GO

-- Actualiza nombres exactos según infográfico oficial de Enrique
UPDATE dbo.fases SET nombre = 'Planeación' WHERE id = 1;
UPDATE dbo.fases SET nombre = 'Estudios, Dictámenes y Autorizaciones' WHERE id = 2;
UPDATE dbo.fases SET nombre = 'Contratación (Licitación y Adjudicación)' WHERE id = 3;
UPDATE dbo.fases SET nombre = 'Ejecución y Control de la Obra' WHERE id = 4;
UPDATE dbo.fases SET nombre = 'Entrega y Recepción de la Obra' WHERE id = 5;
UPDATE dbo.fases SET nombre = 'Cierre e Información Pública' WHERE id = 6;

-- Actualiza nombres de tareas también en expediente_tareas (denormalizado)
UPDATE et
   SET et.nombre = tc.nombre,
       et.updated_at = SYSUTCDATETIME()
  FROM dbo.expediente_tareas et
  JOIN dbo.tareas_catalogo tc ON tc.id = et.tarea_catalogo_id;

PRINT 'Fases renombradas según metodología Enrique Ocampo (GASFED).';
GO
