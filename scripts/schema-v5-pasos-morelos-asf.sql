-- ============================================================
-- INEXPED IA — schema V5:
--   1. Nueva tabla `pasos` (19 pasos oficiales de Enrique Ocampo)
--   2. Columna `paso_id` en tareas_catalogo + mapeo automático
--   3. Columna `etapa_asf` en tareas_catalogo (1-12) — a qué etapa
--      del proceso oficial ASF responde cada tarea
--   4. Actualiza fundamentos legales con Ley de Obra Pública del
--      Estado de Morelos (Enrique trabaja Morelos)
-- Idempotente.
-- ============================================================
USE inexped_ia_demo;
GO

-- ── 1. Tabla dbo.pasos ──────────────────────────────────────
IF OBJECT_ID('dbo.pasos', 'U') IS NULL
CREATE TABLE dbo.pasos (
  id            INT PRIMARY KEY,
  fase_id       INT NOT NULL REFERENCES dbo.fases(id),
  orden_global  INT NOT NULL,   -- 1..19 según Enrique
  orden_en_fase INT NOT NULL,
  nombre        NVARCHAR(300) NOT NULL,
  descripcion   NVARCHAR(1000) NULL,
  icono         NVARCHAR(50) NULL
);

IF NOT EXISTS (SELECT 1 FROM dbo.pasos)
INSERT INTO dbo.pasos (id, fase_id, orden_global, orden_en_fase, nombre, descripcion, icono) VALUES
  -- Fase I: Planeación (2 pasos)
  ( 1, 1, 1, 1, 'Plan Anual de Obras Públicas', 'Diagnóstico, priorización, alineación al Plan Municipal de Desarrollo, validación del Cabildo', 'clipboard'),
  ( 2, 1, 2, 2, 'Anteproyectos y Presupuestos', 'Estudios previos, memorias de cálculo, presupuesto base, catálogo de conceptos, programación de inversión', 'calculator'),
  -- Fase II: Estudios, Dictámenes y Autorizaciones (4 pasos)
  ( 3, 2, 3, 1, 'Proyectos y Dictámenes', 'Proyecto conceptual, dictamen técnico, dictamen de factibilidad', 'file'),
  ( 4, 2, 4, 2, 'Autorizaciones y Licencias', 'Aprobación del Cabildo, licencia de construcción, permisos y autorizaciones sectoriales', 'stamp'),
  ( 5, 2, 5, 3, 'Proyecto Ejecutivo y Validación', 'Proyecto ejecutivo, especificaciones técnicas, validación por áreas competentes, Vo.Bo. y liberación', 'blueprint'),
  ( 6, 2, 6, 4, 'Derechos de Vía y Posesión del Predio', 'Liberación de derechos de vía, documentación legal de posesión, escrituras, actas de posesión', 'map'),
  -- Fase III: Contratación (3 pasos)
  ( 7, 3, 7, 1, 'Procedimiento de Licitación', 'Convocatoria o invitación, entrega de bases, junta de aclaraciones, visita al sitio, presentación y apertura de proposiciones', 'users'),
  ( 8, 3, 8, 2, 'Evaluación y Fallo', 'Evaluación técnica, legal y económica; dictamen y acta de fallo, notificación a participantes', 'scale'),
  ( 9, 3, 9, 3, 'Adjudicación y Contrato', 'Adjudicación al ganador, firma del contrato, registro en sistemas correspondientes, publicación de resultados', 'handshake'),
  -- Fase IV: Ejecución y Control de la Obra (5 pasos)
  (10, 4, 10, 1, 'Entrega de Fianzas', 'Fianza de cumplimiento, vicios ocultos, anticipo (si aplica), validación y resguardo', 'shield'),
  (11, 4, 11, 2, 'Inicio de Obra y Bitácora', 'Acta de inicio, apertura de bitácora, designación de residente y supervisor, registro diario', 'book'),
  (12, 4, 12, 3, 'Ejecución, Estimaciones y Soportes', 'Generación de estimaciones, soportes: bitácora, reportes, fotografías, croquis, facturas', 'hardhat'),
  (13, 4, 13, 4, 'Notificaciones y Comunicación', 'Notificaciones al contratista, instrucciones por escrito, órdenes de cambio (si aplica), registro en bitácora', 'megaphone'),
  (14, 4, 14, 5, 'Pagos de Estimaciones', 'Revisión y autorización, comprobación de documentos, pago conforme a contrato y avance, registro contable', 'dollar'),
  -- Fase V: Entrega y Recepción (3 pasos)
  (15, 5, 15, 1, 'Entrega-Recepción al Ayuntamiento', 'Acta contratista-municipio, verificación física, manuales, garantías y planos as-built, firma de resguardo, cierre de bitácora', 'building'),
  (16, 5, 16, 2, 'Entrega al Comité Comunitario', 'Acta de entrega al comité, capacitación para operación y mantenimiento, promover goce y disfrute de la obra', 'community'),
  (17, 5, 17, 3, 'Garantías y Vicios Ocultos', 'Vigencia de fianza de vicios ocultos, atención a defectos, liberación de fianzas al cumplir plazos', 'certificate'),
  -- Fase VI: Cierre e Información Pública (2 pasos)
  (18, 6, 18, 1, 'Cierre Administrativo y Financiero', 'Cierre del expediente unitario, conciliación de pagos, cierre contable, archivo documental', 'folder'),
  (19, 6, 19, 2, 'Información en Plataformas Públicas', 'Registro en MIDS/SRFT, publicación en PNT y portal municipal, información de contratos y avances, cumplimiento de transparencia', 'globe');
GO

-- ── 2. paso_id + etapa_asf en tareas_catalogo ────────────────
IF COL_LENGTH('dbo.tareas_catalogo', 'paso_id') IS NULL
  ALTER TABLE dbo.tareas_catalogo ADD paso_id INT NULL REFERENCES dbo.pasos(id);
GO
IF COL_LENGTH('dbo.tareas_catalogo', 'etapa_asf') IS NULL
  ALTER TABLE dbo.tareas_catalogo ADD etapa_asf INT NULL;  -- 1-12 del proceso ASF
GO

-- Mapeo automático: cada tarea del catálogo se asigna al paso más
-- semánticamente cercano dentro de su fase. También asigna etapa_asf
-- (la mayoría cae en etapa 3: ejecución de auditoría).
UPDATE tc SET paso_id = CASE
  -- Fase 1 (Planeación) — todo va al paso 1 o 2
  WHEN tc.fase_id = 1 AND tc.nombre LIKE '%ficha%' THEN 1
  WHEN tc.fase_id = 1 AND tc.nombre LIKE '%croquis%' THEN 1
  WHEN tc.fase_id = 1 AND tc.nombre LIKE '%cédula%' THEN 1
  WHEN tc.fase_id = 1 AND tc.nombre LIKE '%oficio%' THEN 2
  WHEN tc.fase_id = 1 THEN 1
  -- Fase 2 (Estudios/Dictámenes/Autorizaciones)
  WHEN tc.fase_id = 2 AND tc.nombre LIKE '%planeación%' THEN 3
  WHEN tc.fase_id = 2 AND tc.nombre LIKE '%programa%' THEN 3
  WHEN tc.fase_id = 2 AND tc.nombre LIKE '%estudios%' THEN 3
  WHEN tc.fase_id = 2 AND tc.nombre LIKE '%priorización%' THEN 4
  WHEN tc.fase_id = 2 THEN 3
  -- Fase 3 en el schema viejo = Proyecto/Validación/Presupuesto → paso 5 (Proyecto Ejecutivo)
  -- Todas las tareas de la fase 3 vieja se quedan en fase 3, mapean al paso 7-9
  WHEN tc.fase_id = 3 AND tc.nombre LIKE '%proyecto ejecutivo%' THEN 5
  WHEN tc.fase_id = 3 AND tc.nombre LIKE '%presupuesto%' THEN 5
  WHEN tc.fase_id = 3 AND tc.nombre LIKE '%precios unitarios%' THEN 5
  WHEN tc.fase_id = 3 AND tc.nombre LIKE '%validación%' THEN 5
  WHEN tc.fase_id = 3 AND tc.nombre LIKE '%suficiencia%' THEN 3
  WHEN tc.fase_id = 3 THEN 5
  -- Fase 4 (Contratación en el schema nuevo, adjudicación en el viejo)
  WHEN tc.fase_id = 4 AND tc.nombre LIKE '%investigación%' THEN 7
  WHEN tc.fase_id = 4 AND tc.nombre LIKE '%procedimiento de adjudicación%' THEN 8
  WHEN tc.fase_id = 4 AND tc.nombre LIKE '%convocatoria%' THEN 7
  WHEN tc.fase_id = 4 AND tc.nombre LIKE '%bases%' THEN 7
  WHEN tc.fase_id = 4 AND tc.nombre LIKE '%aclaraciones%' THEN 7
  WHEN tc.fase_id = 4 AND tc.nombre LIKE '%presentación%' THEN 7
  WHEN tc.fase_id = 4 AND tc.nombre LIKE '%invitaci%' THEN 7
  WHEN tc.fase_id = 4 AND tc.nombre LIKE '%excepción%' THEN 8
  WHEN tc.fase_id = 4 AND tc.nombre LIKE '%dictamen%' THEN 8
  WHEN tc.fase_id = 4 AND tc.nombre LIKE '%contrato%' THEN 9
  WHEN tc.fase_id = 4 AND tc.nombre LIKE '%fianza%' THEN 9
  WHEN tc.fase_id = 4 THEN 9
  -- Fase 5 (Ejecución y control)
  WHEN tc.fase_id = 5 AND tc.nombre LIKE '%acta de inicio%' THEN 11
  WHEN tc.fase_id = 5 AND tc.nombre LIKE '%bitacora%' OR tc.nombre LIKE '%bitácora%' THEN 11
  WHEN tc.fase_id = 5 AND tc.nombre LIKE '%estimaci%' THEN 12
  WHEN tc.fase_id = 5 AND tc.nombre LIKE '%generadores%' THEN 12
  WHEN tc.fase_id = 5 AND tc.nombre LIKE '%facturas%' THEN 12
  WHEN tc.fase_id = 5 AND tc.nombre LIKE '%evidencia%' THEN 12
  WHEN tc.fase_id = 5 AND tc.nombre LIKE '%órdenes de pago%' THEN 14
  WHEN tc.fase_id = 5 AND tc.nombre LIKE '%pago%' THEN 14
  WHEN tc.fase_id = 5 AND tc.nombre LIKE '%convenios%' THEN 13
  WHEN tc.fase_id = 5 THEN 12
  -- Fase 6 (Cierre)
  WHEN tc.fase_id = 6 AND tc.nombre LIKE '%aviso%' THEN 15
  WHEN tc.fase_id = 6 AND tc.nombre LIKE '%entrega-recepción%' THEN 15
  WHEN tc.fase_id = 6 AND tc.nombre LIKE '%finiquito%' THEN 18
  WHEN tc.fase_id = 6 AND tc.nombre LIKE '%vicios%' THEN 17
  WHEN tc.fase_id = 6 AND tc.nombre LIKE '%administrativa%' THEN 18
  WHEN tc.fase_id = 6 AND tc.nombre LIKE '%digital%' THEN 19
  WHEN tc.fase_id = 6 THEN 18
  ELSE NULL
END,
etapa_asf = CASE
  -- Mayoría cae en etapa 3 (ejecución auditoría — donde ASF revisa docs)
  -- Excepciones específicas:
  WHEN tc.fase_id = 6 AND tc.nombre LIKE '%digital%' THEN 8   -- registro en plataformas ↔ entrega informes
  WHEN tc.fase_id = 6 AND tc.nombre LIKE '%administrativa%' THEN 8
  WHEN tc.fase_id IN (5, 6) THEN 5    -- ejecución/cierre → sirven en solventación
  WHEN tc.fase_id = 4 THEN 3          -- adjudicación → siempre revisada en auditoría
  ELSE 3
END
FROM dbo.tareas_catalogo tc
WHERE tc.paso_id IS NULL OR tc.etapa_asf IS NULL;
GO

-- ── 3. Fundamentos legales alineados a Ley Obra Pública Morelos ──
-- (Enrique trabaja Morelos; la LOPSRM federal aplica por defecto pero
-- la ley estatal es la que él cita primero)
UPDATE dbo.tareas_catalogo SET fundamento_legal =
  'Art. 42 Ley de Obra Pública y Servicios del Estado de Morelos · Art. 21 LGCG'
  WHERE nombre LIKE '%programa%obra%anual%';
UPDATE dbo.tareas_catalogo SET fundamento_legal =
  'Art. 5 Ley de Obra Pública Morelos · Reglamento COPLADEMUN'
  WHERE nombre LIKE '%COPLADEMUN%' OR nombre LIKE '%planeación%';
UPDATE dbo.tareas_catalogo SET fundamento_legal =
  'Art. 24 Ley Obra Pública Morelos · Art. 45 LOPSRM'
  WHERE nombre LIKE '%proyecto ejecutivo%';
UPDATE dbo.tareas_catalogo SET fundamento_legal =
  'Art. 27 Ley Obra Pública Morelos · Reglamento Estatal de Obra'
  WHERE nombre LIKE '%validación técnica%';
UPDATE dbo.tareas_catalogo SET fundamento_legal =
  'Art. 43-48 Ley Obra Pública Morelos · Art. 30-45 LOPSRM'
  WHERE fase_id = 4;
UPDATE dbo.tareas_catalogo SET fundamento_legal =
  'Art. 54-65 Ley Obra Pública Morelos · Art. 46-66 Reglamento LOPSRM'
  WHERE fase_id = 5;
UPDATE dbo.tareas_catalogo SET fundamento_legal =
  'Art. 66-72 Ley Obra Pública Morelos · Lineamientos ASF SRFT/MIDS'
  WHERE fase_id = 6;
GO

DECLARE @sinPaso INT = (SELECT COUNT(*) FROM dbo.tareas_catalogo WHERE paso_id IS NULL);
DECLARE @conPaso INT = (SELECT COUNT(*) FROM dbo.tareas_catalogo WHERE paso_id IS NOT NULL);
PRINT CONCAT('Schema V5 aplicado. Tareas mapeadas a pasos: ', @conPaso, '. Sin paso: ', @sinPaso);
GO
