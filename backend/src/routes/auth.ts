import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const router = Router();

/** Login mock: cualquier email + password 'demo2026'. */
router.post('/login', (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || password !== 'demo2026') {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  const token = jwt.sign(
    { sub: email, name: email.split('@')[0], role: 'admin' },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
  res.json({ token, user: { email, name: email.split('@')[0], role: 'admin' } });
});

router.get('/me', (req, res) => {
  const auth = req.headers.authorization?.replace('Bearer ', '') ?? '';
  try {
    const payload = jwt.verify(auth, config.jwtSecret);
    res.json({ user: payload });
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
});

export default router;

/** Middleware para proteger rutas. */
export function requireAuth(req: any, res: any, next: any) {
  const auth = req.headers.authorization?.replace('Bearer ', '') ?? '';
  try {
    req.user = jwt.verify(auth, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'No autenticado' });
  }
}
