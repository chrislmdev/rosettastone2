/**
 * CloudPrism — Auth Module
 * JWT-based authentication. Designed to be CAC/PIV-swappable:
 *   - Replace `verifyPassword` with a CAC assertion validator
 *   - Replace `requireAuth` header parsing with client cert parsing
 */
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import pkg from "pg";

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const JWT_EXPIRES = "24h";

// ── Token helpers ────────────────────────────────────────────
export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// ── Login handler ────────────────────────────────────────────
export async function loginHandler(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" });
  }

  try {
    const { rows } = await pool.query(
      "select id, username, password_hash, role, display_name from users where username = $1",
      [username.toLowerCase()]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    // Update last_login
    await pool.query("update users set last_login = now() where id = $1", [user.id]);

    const token = signToken({
      sub: user.id,
      username: user.username,
      role: user.role,
      display_name: user.display_name,
    });

    res.json({ token, role: user.role, display_name: user.display_name });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ── Middleware factory ───────────────────────────────────────
// Usage: app.use('/api/import', requireAuth('admin'))
export function requireAuth(requiredRole = "viewer") {
  return (req, res, next) => {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const payload = verifyToken(token);
      req.user = payload;

      // Role hierarchy: admin > viewer
      const roles = { admin: 2, viewer: 1 };
      const userLevel = roles[payload.role] ?? 0;
      const requiredLevel = roles[requiredRole] ?? 1;

      if (userLevel < requiredLevel) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      next();
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}

// ── Admin: create/update user ────────────────────────────────
export async function createUserHandler(req, res) {
  const { username, password, role, display_name } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" });
  }
  if (!["admin", "viewer"].includes(role)) {
    return res.status(400).json({ error: "role must be admin or viewer" });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `insert into users (username, password_hash, role, display_name)
       values ($1, $2, $3, $4)
       on conflict (username) do update
         set password_hash = excluded.password_hash,
             role = excluded.role,
             display_name = excluded.display_name`,
      [username.toLowerCase(), hash, role, display_name || username]
    );
    res.json({ ok: true, username: username.toLowerCase(), role });
  } catch (err) {
    console.error("createUser error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
