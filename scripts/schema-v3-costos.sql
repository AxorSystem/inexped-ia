-- ============================================================
-- INEXPED IA — schema V3: tracking de costos IA
-- Registra cada operación IA con su costo individual para
-- que el owner (David) vea el gasto acumulado y por acción.
-- Idempotente.
-- ============================================================
USE inexped_ia_demo;
GO

IF OBJECT_ID('dbo.costos_ia', 'U') IS NULL
CREATE TABLE dbo.costos_ia (
  id             INT IDENTITY(1,1) PRIMARY KEY,
  ts             DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  expediente_id  INT NULL,
  accion         NVARCHAR(50)  NOT NULL,
    -- copiloto | clasificar_doc | generar_draft | extraer_pdf | extraer_chat | embeddings
  modelo         NVARCHAR(60)  NULL,
  input_tokens   INT NULL,
  output_tokens  INT NULL,
  cost_usd       DECIMAL(12, 6) NOT NULL,
  actor          NVARCHAR(200) NULL,
  meta_json      NVARCHAR(MAX) NULL
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_costos_ts' AND object_id = OBJECT_ID('dbo.costos_ia'))
  CREATE INDEX ix_costos_ts ON dbo.costos_ia (ts DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_costos_exp' AND object_id = OBJECT_ID('dbo.costos_ia'))
  CREATE INDEX ix_costos_exp ON dbo.costos_ia (expediente_id, ts DESC);

PRINT 'Schema V3 (costos_ia) aplicado.';
GO
