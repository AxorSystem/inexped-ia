import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { getPool } from './db.js';
import auth from './routes/auth.js';
import expedientes from './routes/expedientes.js';
import documentos from './routes/documentos.js';
import fondos from './routes/fondos.js';
import fases from './routes/fases.js';
import tareas from './routes/tareas.js';

const app = express();
app.disable('x-powered-by');

app.use(cors({ origin: config.cors.origins, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'inexped-ia-backend', ts: new Date().toISOString() });
});

app.use('/api/auth', auth);
app.use('/api/expedientes', expedientes);
app.use('/api/documentos', documentos);
app.use('/api/fondos', fondos);
app.use('/api/fases', fases);
app.use('/api/tareas', tareas);

app.use((req, res) => res.status(404).json({ error: 'ruta no encontrada' }));
app.use((err: any, req: any, res: any, _next: any) => {
  console.error('[error]', err);
  res.status(err.status || 500).json({ error: err.message || 'error interno' });
});

try {
  await getPool();
  app.listen(config.port, () => {
    console.log(`🚀 INEXPED IA backend listo en :${config.port}`);
  });
} catch (e: any) {
  console.error('✗ No se pudo conectar a SQL Server:', e.message);
  process.exit(1);
}
