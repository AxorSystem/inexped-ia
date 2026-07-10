-- ============================================================
-- INEXPED IA — schema demo (base inexped_ia_demo en axor-db)
-- Idempotente. Se puede correr múltiples veces sin error.
-- ============================================================

IF DB_ID('inexped_ia_demo') IS NULL
  CREATE DATABASE inexped_ia_demo;
GO

USE inexped_ia_demo;
GO

-- ── FONDOS GASFED ────────────────────────────────────────────
IF OBJECT_ID('dbo.fondos', 'U') IS NULL
CREATE TABLE dbo.fondos (
  id           INT IDENTITY(1,1) PRIMARY KEY,
  codigo       NVARCHAR(20)  NOT NULL UNIQUE,
  nombre       NVARCHAR(200) NOT NULL,
  descripcion  NVARCHAR(500) NULL,
  ejercicio    INT           NOT NULL,
  activo       BIT           NOT NULL DEFAULT 1,
  created_at   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);

-- ── EXPEDIENTES ──────────────────────────────────────────────
IF OBJECT_ID('dbo.expedientes', 'U') IS NULL
CREATE TABLE dbo.expedientes (
  id           INT IDENTITY(1,1) PRIMARY KEY,
  folio        NVARCHAR(60)  NOT NULL UNIQUE,
  fondo_id     INT           NOT NULL REFERENCES dbo.fondos(id),
  nombre       NVARCHAR(300) NOT NULL,
  descripcion  NVARCHAR(2000) NULL,
  monto        DECIMAL(14,2) NULL,
  municipio    NVARCHAR(200) NULL,
  responsable  NVARCHAR(200) NULL,
  estado       NVARCHAR(30)  NOT NULL DEFAULT 'planeacion',
    -- planeacion | autorizado | ejecucion | cierre | cerrado
  created_at   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);

-- ── DOCUMENTOS ───────────────────────────────────────────────
IF OBJECT_ID('dbo.documentos', 'U') IS NULL
CREATE TABLE dbo.documentos (
  id             INT IDENTITY(1,1) PRIMARY KEY,
  expediente_id  INT NOT NULL REFERENCES dbo.expedientes(id),
  filename       NVARCHAR(500) NOT NULL,
  storage_path   NVARCHAR(1000) NOT NULL,
  mime_type      NVARCHAR(100) NULL,
  size_bytes    BIGINT NULL,
  tipo_doc       NVARCHAR(50) NULL,
    -- factura | contrato | oficio | acta | evidencia | otro
  extracted_text NVARCHAR(MAX) NULL,
  metadata_json  NVARCHAR(MAX) NULL,
    -- json extraído: rfc, monto, fecha, etc.
  ai_summary     NVARCHAR(MAX) NULL,
  uploaded_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  uploaded_by    NVARCHAR(200) NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_docs_exp' AND object_id = OBJECT_ID('dbo.documentos'))
  CREATE INDEX ix_docs_exp ON dbo.documentos(expediente_id);

-- ── EMBEDDINGS (para RAG básico sin Qdrant en el demo) ───────
-- Los embeddings los guardamos como binary para búsqueda vectorial simple.
IF OBJECT_ID('dbo.embeddings', 'U') IS NULL
CREATE TABLE dbo.embeddings (
  id             INT IDENTITY(1,1) PRIMARY KEY,
  documento_id   INT NOT NULL REFERENCES dbo.documentos(id),
  chunk_idx      INT NOT NULL,
  chunk_text     NVARCHAR(MAX) NOT NULL,
  vector_json    NVARCHAR(MAX) NOT NULL,  -- embedding como JSON array
  created_at     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_emb_doc' AND object_id = OBJECT_ID('dbo.embeddings'))
  CREATE INDEX ix_emb_doc ON dbo.embeddings(documento_id);

-- ── CHECKLIST NORMATIVO POR FONDO ────────────────────────────
IF OBJECT_ID('dbo.checklist_items', 'U') IS NULL
CREATE TABLE dbo.checklist_items (
  id           INT IDENTITY(1,1) PRIMARY KEY,
  fondo_id     INT NOT NULL REFERENCES dbo.fondos(id),
  estado       NVARCHAR(30) NOT NULL,
  tipo_doc     NVARCHAR(50) NOT NULL,
  descripcion  NVARCHAR(500) NOT NULL,
  obligatorio  BIT NOT NULL DEFAULT 1,
  orden        INT NOT NULL DEFAULT 0
);

-- ── CHAT HISTORY (copiloto) ──────────────────────────────────
IF OBJECT_ID('dbo.chat_messages', 'U') IS NULL
CREATE TABLE dbo.chat_messages (
  id             INT IDENTITY(1,1) PRIMARY KEY,
  expediente_id  INT NOT NULL REFERENCES dbo.expedientes(id),
  role           NVARCHAR(20) NOT NULL,  -- user | assistant
  content        NVARCHAR(MAX) NOT NULL,
  tokens_input   INT NULL,
  tokens_output  INT NULL,
  cost_usd       DECIMAL(10,6) NULL,
  created_at     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_chat_exp' AND object_id = OBJECT_ID('dbo.chat_messages'))
  CREATE INDEX ix_chat_exp ON dbo.chat_messages(expediente_id, created_at);

-- ── AUDITORÍA ────────────────────────────────────────────────
IF OBJECT_ID('dbo.audit_log', 'U') IS NULL
CREATE TABLE dbo.audit_log (
  id           INT IDENTITY(1,1) PRIMARY KEY,
  actor        NVARCHAR(200) NULL,
  action       NVARCHAR(100) NOT NULL,
  entity       NVARCHAR(50) NULL,
  entity_id    INT NULL,
  payload_json NVARCHAR(MAX) NULL,
  ts           DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

-- ============================================================
-- SEEDS
-- ============================================================

-- Fondos GASFED principales
IF NOT EXISTS (SELECT 1 FROM dbo.fondos WHERE codigo = 'FAISM')
INSERT INTO dbo.fondos (codigo, nombre, descripcion, ejercicio) VALUES
  ('FAISM',    'Fondo de Aportaciones para la Infraestructura Social Municipal', 'Recursos para infraestructura básica en zonas de rezago social.', 2026),
  ('FORTAMUN', 'Fondo de Aportaciones para el Fortalecimiento de los Municipios', 'Recursos para atender obligaciones financieras y seguridad pública municipal.', 2026),
  ('FASSA',    'Fondo de Aportaciones para los Servicios de Salud',              'Recursos para servicios de salud estatales.', 2026),
  ('FASP',     'Fondo de Aportaciones para la Seguridad Pública',                'Recursos para seguridad pública en estados y municipios.', 2026),
  ('FORTASEG', 'Programa de Fortalecimiento para la Seguridad',                  'Recursos para profesionalización y equipamiento policial.', 2026);

-- Checklist mínimo por fondo
DECLARE @faismId INT = (SELECT id FROM dbo.fondos WHERE codigo = 'FAISM');
IF @faismId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.checklist_items WHERE fondo_id = @faismId)
INSERT INTO dbo.checklist_items (fondo_id, estado, tipo_doc, descripcion, obligatorio, orden) VALUES
  (@faismId, 'planeacion', 'oficio',    'Oficio de asignación de recursos',            1, 1),
  (@faismId, 'planeacion', 'anteproyecto', 'Anteproyecto o proyecto ejecutivo',        1, 2),
  (@faismId, 'planeacion', 'acta',      'Acta de comité de planeación (COPLADEMUN)',   1, 3),
  (@faismId, 'autorizado', 'oficio',    'Oficio de autorización presupuestal',         1, 4),
  (@faismId, 'autorizado', 'contrato',  'Contrato de obra pública firmado',            1, 5),
  (@faismId, 'ejecucion',  'estimacion','Estimaciones firmadas por residente',         1, 6),
  (@faismId, 'ejecucion',  'factura',   'Facturas / CFDI de proveedores',              1, 7),
  (@faismId, 'ejecucion',  'evidencia', 'Evidencia fotográfica de avance',             1, 8),
  (@faismId, 'ejecucion',  'bitacora',  'Bitácora de obra firmada',                    1, 9),
  (@faismId, 'cierre',     'acta',      'Acta de entrega-recepción',                   1, 10),
  (@faismId, 'cierre',     'finiquito', 'Finiquito y liberación de fianzas',           1, 11);

-- Expedientes demo
IF NOT EXISTS (SELECT 1 FROM dbo.expedientes)
BEGIN
  DECLARE @fFAISM INT = (SELECT id FROM dbo.fondos WHERE codigo = 'FAISM');
  DECLARE @fFORT  INT = (SELECT id FROM dbo.fondos WHERE codigo = 'FORTAMUN');

  INSERT INTO dbo.expedientes (folio, fondo_id, nombre, descripcion, monto, municipio, responsable, estado) VALUES
    ('2026-FAISM-001',    @fFAISM, 'Rehabilitación de red de agua potable en colonia Progreso',           'Cambio de tubería de PVC en 1.2 km y reposición de tomas domiciliarias.',                              1450000.00, 'Jonacatepec, Morelos', 'Ing. Roberto Morales',    'ejecucion'),
    ('2026-FAISM-002',    @fFAISM, 'Construcción de aulas en escuela primaria Benito Juárez',            'Dos aulas nuevas de 6×8m con estructura de concreto armado y techumbre.',                                 2100000.00, 'Tetela del Volcán, Morelos', 'Arq. María López',      'autorizado'),
    ('2026-FORTAMUN-005', @fFORT,  'Adquisición de patrullas para policía municipal',                    'Compra de 4 unidades tipo pick-up equipadas para seguridad pública.',                                   3200000.00, 'Puente de Ixtla, Morelos', 'Cmdte. Jorge Ramírez',  'planeacion'),
    ('2026-FAISM-003',    @fFAISM, 'Pavimentación de calle Miguel Hidalgo',                              'Concreto hidráulico en 380 metros lineales con guarniciones y banquetas.',                              890000.00,  'Tlaltizapán, Morelos', 'Ing. Carlos Vega',           'cierre');
END;

PRINT 'Schema inexped_ia_demo aplicado correctamente.';
GO
