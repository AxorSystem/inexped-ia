# INEXPED IA — Demo funcional

Demo funcional del sistema INEXPED IA para presentar a Enrique Ocampo y usarlo como base del desarrollo completo.

## Arquitectura del demo

```
frontend (Vue 3 + Vite + Tailwind)
  └── https://inexped-ia.5-78-222-255.sslip.io/

backend (Node 20 + Express + TypeScript)
  └── https://api-inexped-ia.5-78-222-255.sslip.io/api/

DB: SQL Server (axor-db container en Hetzner) — base `inexped_ia_demo`

Servicios IA:
- Anthropic Claude Sonnet 4.5 — copiloto + análisis
- OpenAI text-embedding-3-small — embeddings para RAG
- pdf-parse — OCR de PDFs (texto)
- Reglas hardcoded + regex — validaciones deterministas
```

## Features del demo

1. **Login mock** (cualquier email + password `demo2026`)
2. **Dashboard**: lista de expedientes con estado + KPIs
3. **Detalle de expediente**:
   - Documentos subidos con clasificación automática
   - Chat lateral con copiloto IA (RAG sobre docs del expediente)
   - Estados del expediente (Planeación → Autorizado → Ejecución → Cierre)
   - Detector de faltantes con LLM
4. **Upload de documento**:
   - PDF → OCR local con pdf-parse
   - Clasificación de tipo con LLM (factura/contrato/oficio/acta)
   - Extracción de metadatos (RFC, monto, fecha) con regex + LLM
   - Indexado en vector DB para RAG
5. **Reporte ejecutivo generado por IA** en PDF

## Estructura del repo

```
inexped-ia/
├── backend/          Node.js + Express + TypeScript
│   ├── src/
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── frontend/         Vue 3 + Vite + Tailwind
│   ├── src/
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
├── scripts/
│   ├── schema.sql    Esquema SQL Server + seeds
│   └── deploy.sh     Deploy vía Coolify API
├── docker-compose.yml
└── README.md
```

## Setup local

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

## Deploy en producción

Los dos servicios corren en Coolify sobre el server Hetzner 5.78.222.255.
Ver `scripts/deploy.sh` para detalles.
