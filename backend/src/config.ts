import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 4500,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-prod',
  db: {
    server: process.env.SQL_SERVER || '5.78.222.255',
    port: Number(process.env.SQL_PORT) || 1433,
    database: process.env.SQL_DATABASE || 'inexped_ia_demo',
    user: process.env.SQL_USER || 'sa',
    password: process.env.SQL_PASSWORD || '',
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  },
  ai: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    chatModel: process.env.CHAT_MODEL || 'claude-sonnet-4-5-20250929',
    classifyModel: process.env.CLASSIFY_MODEL || 'claude-haiku-4-5-20251001',
    embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  },
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:5173,https://inexped-ia.5-78-222-255.sslip.io').split(','),
  },
  storage: {
    uploadsDir: process.env.UPLOADS_DIR || '/tmp/inexped-uploads',
  },
};
