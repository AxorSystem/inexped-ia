-- ============================================================
-- INEXPED IA — schema V2 (6 FASES + TAREAS por fase)
-- Modelado según la estructura real del INEXPED legacy.
-- Idempotente. Se puede correr múltiples veces.
-- ============================================================

USE inexped_ia_demo;
GO

-- ── FASES (6 fijas) ─────────────────────────────────────────
IF OBJECT_ID('dbo.fases', 'U') IS NULL
CREATE TABLE dbo.fases (
  id          INT PRIMARY KEY,
  orden       INT NOT NULL,
  clave       NVARCHAR(10)  NOT NULL,
  nombre      NVARCHAR(200) NOT NULL,
  icono       NVARCHAR(50)  NULL,
  color       NVARCHAR(20)  NULL
);

IF NOT EXISTS (SELECT 1 FROM dbo.fases WHERE id = 1)
INSERT INTO dbo.fases (id, orden, clave, nombre, icono, color) VALUES
  (1, 1, 'I',   'Información General',              'info',      '#3b82f6'),
  (2, 2, 'II',  'Planeación y Programación',        'calendar',  '#8b5cf6'),
  (3, 3, 'III', 'Proyecto, Validación y Presupuesto','dollar',   '#a855f7'),
  (4, 4, 'IV',  'Proceso de Adjudicación y Contratación', 'handshake', '#ec4899'),
  (5, 5, 'V',   'Ejecución y Pago',                 'briefcase', '#f97316'),
  (6, 6, 'VI',  'Cierre y Resguardo',               'archive',   '#eab308');

-- ── CATÁLOGO DE TAREAS (por fase) ────────────────────────────
IF OBJECT_ID('dbo.tareas_catalogo', 'U') IS NULL
CREATE TABLE dbo.tareas_catalogo (
  id                  INT IDENTITY(1,1) PRIMARY KEY,
  fase_id             INT NOT NULL REFERENCES dbo.fases(id),
  orden               INT NOT NULL,
  nombre              NVARCHAR(300) NOT NULL,
  descripcion         NVARCHAR(1000) NULL,
  fundamento_legal    NVARCHAR(500) NULL,
  obligatorio         BIT NOT NULL DEFAULT 1,
  tipos_adjudicacion  NVARCHAR(100) NULL, -- CSV: 'LP,IR,I3,AD' o NULL para todos
  created_at          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

-- Seed tareas del catálogo (~30 tareas realistas)
IF NOT EXISTS (SELECT 1 FROM dbo.tareas_catalogo)
BEGIN
  -- FASE I - Información General
  INSERT INTO dbo.tareas_catalogo (fase_id, orden, nombre, descripcion, fundamento_legal) VALUES
    (1, 1, 'Ficha técnica del proyecto', 'Datos generales de la obra: ubicación, monto, metas físicas y financieras.', 'Art. 24 Ley de Coordinación Fiscal'),
    (1, 2, 'Croquis de localización', 'Ubicación georreferenciada del sitio de la obra.', 'Lineamientos GASFED'),
    (1, 3, 'Cédula de identificación del responsable', 'Nombramiento oficial del responsable operativo.', 'Ley de Responsabilidades Administrativas'),
    (1, 4, 'Oficio de asignación de recursos', 'Comunicado oficial de asignación del fondo al proyecto.', 'Art. 34 LGCG');

  -- FASE II - Planeación y Programación
  INSERT INTO dbo.tareas_catalogo (fase_id, orden, nombre, descripcion, fundamento_legal) VALUES
    (2, 1, 'Cédula de planeación (COPLADEMUN)', 'Acta del Comité de Planeación para el Desarrollo Municipal.', 'Ley de Planeación'),
    (2, 2, 'Programa de obra anual', 'Calendario detallado de ejecución con hitos y recursos.', 'Art. 21 LGCG'),
    (2, 3, 'Estudios previos y diagnóstico', 'Estudios de campo, geotécnicos, topográficos que justifican la obra.', 'Reglamento de Construcción'),
    (2, 4, 'Priorización por criterios sociales', 'Justificación de zonas de atención prioritaria (ZAP).', 'Lineamientos FAIS');

  -- FASE III - Proyecto, Validación y Presupuesto
  INSERT INTO dbo.tareas_catalogo (fase_id, orden, nombre, descripcion, fundamento_legal) VALUES
    (3, 1, 'Proyecto ejecutivo', 'Planos, memoria de cálculo, especificaciones técnicas.', 'Reglamento de Obra Pública'),
    (3, 2, 'Presupuesto base', 'Presupuesto de referencia con precios unitarios.', 'Art. 45 LOPSRM'),
    (3, 3, 'Análisis de precios unitarios', 'Desglose de costo directo, indirecto, financiamiento y utilidad.', 'Art. 45 LOPSRM'),
    (3, 4, 'Validación técnica', 'Oficio de validación técnica emitido por la dependencia normativa.', 'Reglamento Estatal de Obra'),
    (3, 5, 'Dictamen de suficiencia presupuestal', 'Constancia de que existen recursos presupuestales asignados.', 'Art. 24 Ley Federal de Presupuesto');

  -- FASE IV - Proceso de Adjudicación y Contratación
  -- Documentos base (siempre requeridos)
  INSERT INTO dbo.tareas_catalogo (fase_id, orden, nombre, descripcion, fundamento_legal, tipos_adjudicacion) VALUES
    (4, 1, 'Investigación de mercado', 'Estudio comparativo de proveedores/contratistas.', 'Art. 26 LOPSRM', NULL),
    (4, 2, 'Dictamen de procedimiento de adjudicación', 'Justificación del tipo de procedimiento elegido.', 'Art. 27 LOPSRM', NULL),
  -- Documentos específicos por tipo de procedimiento
    (4, 3, 'Convocatoria pública',                'Convocatoria publicada en CompraNet y periódicos oficiales.', 'Art. 30 LOPSRM', 'LP'),
    (4, 4, 'Bases de licitación',                 'Bases publicadas en CompraNet.', 'Art. 31 LOPSRM', 'LP'),
    (4, 5, 'Junta de aclaraciones',              'Acta de la junta de aclaraciones con licitantes.', 'Art. 34 LOPSRM', 'LP,IR'),
    (4, 6, 'Acta de presentación y apertura',    'Acta de acto de recepción y apertura de propuestas.', 'Art. 37 LOPSRM', 'LP,IR'),
    (4, 7, 'Invitaciones a cuando menos tres',   'Oficios de invitación a mínimo tres contratistas.', 'Art. 42 LOPSRM', 'IR,I3'),
    (4, 8, 'Justificación de excepción a licitación', 'Escrito que justifica adjudicación directa.', 'Art. 43 LOPSRM', 'AD'),
    (4, 9, 'Dictamen técnico de fallo',           'Dictamen del ganador con evaluación de propuestas.', 'Art. 38 LOPSRM', NULL),
    (4, 10,'Contrato de obra pública',            'Contrato firmado por ambas partes.', 'Art. 45 LOPSRM', NULL),
    (4, 11,'Fianza de cumplimiento',              'Póliza que garantiza el cumplimiento del contrato.', 'Art. 48 LOPSRM', NULL),
    (4, 12,'Fianza de anticipo',                  'Póliza que garantiza el buen uso del anticipo.', 'Art. 48 LOPSRM', NULL);

  -- FASE V - Ejecución y Pago
  INSERT INTO dbo.tareas_catalogo (fase_id, orden, nombre, descripcion, fundamento_legal) VALUES
    (5, 1, 'Acta de inicio de obra', 'Acta que formaliza el inicio de los trabajos.', 'Art. 54 LOPSRM'),
    (5, 2, 'Bitácora de obra',       'Bitácora electrónica o física con avances diarios.', 'Art. 46 Reglamento LOPSRM'),
    (5, 3, 'Estimaciones',           'Estimaciones de obra ejecutada firmadas por residente y supervisor.', 'Art. 54 LOPSRM'),
    (5, 4, 'Números generadores',    'Cálculos detallados que soportan cada estimación.', 'Reglamento LOPSRM'),
    (5, 5, 'Facturas y CFDI',        'Comprobantes fiscales de proveedores.', 'CFF y CFDI 4.0'),
    (5, 6, 'Evidencia fotográfica',  'Fotografías del avance físico de la obra.', 'Lineamientos GASFED'),
    (5, 7, 'Órdenes de pago',        'Órdenes de pago autorizadas por tesorería.', 'Art. 68 LGCG'),
    (5, 8, 'Convenios modificatorios','Convenios de ampliación de monto o plazo (si aplican).', 'Art. 59 LOPSRM');

  -- FASE VI - Cierre y Resguardo
  INSERT INTO dbo.tareas_catalogo (fase_id, orden, nombre, descripcion, fundamento_legal) VALUES
    (6, 1, 'Aviso de terminación',           'Aviso del contratista al ente que concluyó los trabajos.', 'Art. 64 LOPSRM'),
    (6, 2, 'Acta de entrega-recepción',      'Acta firmada por contratista, ente y beneficiario.', 'Art. 64 LOPSRM'),
    (6, 3, 'Finiquito',                      'Documento que cierra formalmente las obligaciones.', 'Art. 64 LOPSRM'),
    (6, 4, 'Fianza de vicios ocultos',       'Póliza que cubre defectos por 12 meses posteriores.', 'Art. 66 LOPSRM'),
    (6, 5, 'Acta administrativa de cierre',  'Documento interno del ente que cierra el expediente.', 'Lineamientos GASFED'),
    (6, 6, 'Expediente digital completo',    'Consolidación de todos los documentos en formato digital.', 'Lineamientos ASF');
END;

-- ── TIPO DE ADJUDICACIÓN al expediente ──────────────────────
IF COL_LENGTH('dbo.expedientes', 'tipo_adjudicacion') IS NULL
  ALTER TABLE dbo.expedientes ADD tipo_adjudicacion NVARCHAR(5) NULL;
  -- LP = Licitación Pública, IR = Invitación Restringida, I3 = Invitación a 3, AD = Adjudicación Directa
GO

-- Set tipos de adjudicación en los expedientes seed
UPDATE dbo.expedientes SET tipo_adjudicacion = 'LP' WHERE folio = '2026-FAISM-001' AND tipo_adjudicacion IS NULL;
UPDATE dbo.expedientes SET tipo_adjudicacion = 'IR' WHERE folio = '2026-FAISM-002' AND tipo_adjudicacion IS NULL;
UPDATE dbo.expedientes SET tipo_adjudicacion = 'I3' WHERE folio = '2026-FORTAMUN-005' AND tipo_adjudicacion IS NULL;
UPDATE dbo.expedientes SET tipo_adjudicacion = 'AD' WHERE folio = '2026-FAISM-003' AND tipo_adjudicacion IS NULL;
GO

-- ── TAREAS INSTANCIADAS POR EXPEDIENTE ──────────────────────
IF OBJECT_ID('dbo.expediente_tareas', 'U') IS NULL
CREATE TABLE dbo.expediente_tareas (
  id                 INT IDENTITY(1,1) PRIMARY KEY,
  expediente_id      INT NOT NULL REFERENCES dbo.expedientes(id),
  tarea_catalogo_id  INT NOT NULL REFERENCES dbo.tareas_catalogo(id),
  fase_id            INT NOT NULL,
  orden              INT NOT NULL,
  nombre             NVARCHAR(300) NOT NULL,
  estado             NVARCHAR(20) NOT NULL DEFAULT 'pendiente',
    -- pendiente | completada | observada | no_aplica
  observaciones      NVARCHAR(1000) NULL,
  completada_at      DATETIME2 NULL,
  completada_por     NVARCHAR(200) NULL,
  created_at         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_extarea_exp' AND object_id = OBJECT_ID('dbo.expediente_tareas'))
  CREATE INDEX ix_extarea_exp ON dbo.expediente_tareas(expediente_id, fase_id, orden);

-- ── DOCUMENTOS: agregar referencia a la tarea ───────────────
IF COL_LENGTH('dbo.documentos', 'expediente_tarea_id') IS NULL
  ALTER TABLE dbo.documentos ADD expediente_tarea_id INT NULL;
GO

-- ── FUNCIÓN: instanciar tareas para un expediente ───────────
-- Se ejecuta al crear un expediente o para los seeds
-- Copia del catálogo, filtrando fase IV por tipo_adjudicacion
IF NOT EXISTS (SELECT 1 FROM dbo.expediente_tareas)
BEGIN
  DECLARE @cursorExp CURSOR;
  DECLARE @expId INT, @tipoAdj NVARCHAR(5);
  SET @cursorExp = CURSOR FOR SELECT id, tipo_adjudicacion FROM dbo.expedientes;
  OPEN @cursorExp;
  FETCH NEXT FROM @cursorExp INTO @expId, @tipoAdj;
  WHILE @@FETCH_STATUS = 0
  BEGIN
    INSERT INTO dbo.expediente_tareas (expediente_id, tarea_catalogo_id, fase_id, orden, nombre)
    SELECT @expId, tc.id, tc.fase_id, tc.orden, tc.nombre
      FROM dbo.tareas_catalogo tc
     WHERE tc.tipos_adjudicacion IS NULL
        OR CHARINDEX(@tipoAdj, tc.tipos_adjudicacion) > 0
     ORDER BY tc.fase_id, tc.orden;
    FETCH NEXT FROM @cursorExp INTO @expId, @tipoAdj;
  END;
  CLOSE @cursorExp;
  DEALLOCATE @cursorExp;

  -- Marcar algunas tareas como completadas para los seeds
  -- FAISM-001 (ejecucion): fase I, II, III, IV completas + algunas de V
  UPDATE dbo.expediente_tareas SET estado='completada', completada_at=SYSUTCDATETIME(), completada_por='Ing. Roberto Morales'
    WHERE expediente_id = (SELECT id FROM dbo.expedientes WHERE folio='2026-FAISM-001') AND fase_id IN (1,2,3,4);
  UPDATE dbo.expediente_tareas SET estado='completada', completada_at=SYSUTCDATETIME(), completada_por='Ing. Roberto Morales'
    WHERE expediente_id = (SELECT id FROM dbo.expedientes WHERE folio='2026-FAISM-001') AND fase_id=5 AND orden IN (1,2,3);

  -- FAISM-002 (autorizado): fase I, II, III completas
  UPDATE dbo.expediente_tareas SET estado='completada', completada_at=SYSUTCDATETIME(), completada_por='Arq. María López'
    WHERE expediente_id = (SELECT id FROM dbo.expedientes WHERE folio='2026-FAISM-002') AND fase_id IN (1,2,3);

  -- FAISM-003 (cierre): casi todo completado, faltan algunas de VI
  UPDATE dbo.expediente_tareas SET estado='completada', completada_at=SYSUTCDATETIME(), completada_por='Ing. Carlos Vega'
    WHERE expediente_id = (SELECT id FROM dbo.expedientes WHERE folio='2026-FAISM-003') AND fase_id IN (1,2,3,4,5);
  UPDATE dbo.expediente_tareas SET estado='completada', completada_at=SYSUTCDATETIME(), completada_por='Ing. Carlos Vega'
    WHERE expediente_id = (SELECT id FROM dbo.expedientes WHERE folio='2026-FAISM-003') AND fase_id=6 AND orden IN (1,2);
END;

PRINT 'Schema V2 aplicado correctamente (6 fases + tareas).';
GO
