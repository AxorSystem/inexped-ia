import sql from 'mssql';
import { config } from './config.js';

let poolPromise: Promise<sql.ConnectionPool> | null = null;

export function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(config.db).then((pool) => {
      console.log('✓ SQL Server pool listo');
      return pool;
    });
  }
  return poolPromise;
}

export async function query<T = any>(text: string, params: Record<string, any> = {}): Promise<{ recordset: T[] }> {
  const pool = await getPool();
  const request = pool.request();
  for (const [k, v] of Object.entries(params)) request.input(k, v);
  return request.query(text) as any;
}
