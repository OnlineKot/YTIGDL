import { verifyIdToken } from '../firebase.js';
import { isAdminEmail } from '../config.js';

/**
 * Wyciąga token Bearer i weryfikuje użytkownika. Ustawia req.user (lub null).
 */
export async function attachUser(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  req.user = token ? await verifyIdToken(token) : null;
  if (req.user) req.user.isAdmin = isAdminEmail(req.user.email);
  next();
}

/**
 * Wymaga zalogowanego użytkownika.
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Wymagane logowanie.', code: 'auth_required' });
  }
  next();
}

/**
 * Wymaga zweryfikowanego e-maila (dla kont e-mail/hasło).
 */
export function requireVerified(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Wymagane logowanie.', code: 'auth_required' });
  }
  // Konta Google/Microsoft są zweryfikowane z definicji; e-mail/hasło wymaga weryfikacji.
  if (req.user.provider === 'password' && req.user.emailVerified === false) {
    return res
      .status(403)
      .json({ error: 'Potwierdź adres e-mail, aby kontynuować.', code: 'email_unverified' });
  }
  next();
}

/**
 * Wymaga uprawnień administratora.
 */
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Wymagane logowanie.', code: 'auth_required' });
  }
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Brak uprawnień administratora.', code: 'forbidden' });
  }
  next();
}
