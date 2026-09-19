const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();
const FRONTEND_ORIGINS = String(process.env.FRONTEND_ORIGINS || '')
  .split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);

if (!DATABASE_URL) {
  console.error('DATABASE_URL belum diatur. Tambahkan DATABASE_URL di environment Render.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(24) NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase ON users (LOWER(username));

    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expires_at BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scripts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      filename VARCHAR(120) NOT NULL,
      code TEXT NOT NULL DEFAULT '',
      visibility VARCHAR(10) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS presence (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      last_seen BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message VARCHAR(500) NOT NULL,
      created_at BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON presence(last_seen);
    CREATE INDEX IF NOT EXISTS idx_chat_created_at ON chat_messages(created_at, id);
    CREATE INDEX IF NOT EXISTS idx_scripts_user_updated ON scripts(user_id, updated_at DESC, id DESC);
  `);
}

app.disable('x-powered-by');
app.use((req, res, next) => {
  const origin = String(req.headers.origin || '').replace(/\/$/, '');
  if (FRONTEND_ORIGINS.length === 0) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && FRONTEND_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'cb-scriptstore-api', time: Date.now() }));

function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function makeToken() { return crypto.randomBytes(32).toString('hex'); }
function getBearerToken(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}
async function cleanupSessions() {
  await pool.query('DELETE FROM sessions WHERE expires_at <= $1', [Date.now()]);
}
async function touchPresence(userId) {
  await pool.query(`
    INSERT INTO presence(user_id,last_seen) VALUES ($1,$2)
    ON CONFLICT(user_id) DO UPDATE SET last_seen=EXCLUDED.last_seen
  `, [userId, Date.now()]);
}
async function getUser(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  await cleanupSessions();
  const result = await pool.query(`
    SELECT u.id, u.username, s.id AS session_id
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>$2
  `, [hashToken(token), Date.now()]);
  const row = result.rows[0];
  if (!row) return null;
  await pool.query('UPDATE sessions SET last_used_at=NOW() WHERE id=$1', [row.session_id]);
  await touchPresence(row.id);
  return { ...row, token };
}
async function requireUser(req, res, next) {
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Session tidak valid atau sudah habis.' });
    req.user = user;
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal memeriksa sesi.' });
  }
}
function cleanText(value, max) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

app.post('/api/register', async (req, res) => {
  const username = cleanText(req.body.username, 24);
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirmPassword || '');
  if (!/^[A-Za-z0-9_]{5,24}$/.test(username)) return res.status(400).json({ error: 'Username minimal 5 dan maksimal 24 karakter: huruf, angka, atau underscore.' });
  if (password.length < 9) return res.status(400).json({ error: 'Password harus lebih dari 8 karakter (minimal 9).' });
  if (password !== confirm) return res.status(400).json({ error: 'Konfirmasi password tidak cocok.' });
  try {
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1', [username]);
    if (existing.rowCount) return res.status(409).json({ error: 'Nama username sudah dipakai orang lain. Silakan gunakan nama lain.' });
    const hash = await bcrypt.hash(password, 12);
    await pool.query('INSERT INTO users (username,password_hash) VALUES ($1,$2)', [username, hash]);
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Nama username sudah dipakai orang lain. Silakan gunakan nama lain.' });
    console.error(e);
    res.status(500).json({ error: 'Gagal membuat akun.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const username = cleanText(req.body.username, 24);
    const password = String(req.body.password || '');
    const result = await pool.query('SELECT id, username, password_hash FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1', [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Username atau password salah.' });
    const token = makeToken();
    const now = Date.now();
    const expiresAt = now + 1000 * 60 * 60 * 24 * 7;
    await pool.query('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2,$3)', [user.id, hashToken(token), expiresAt]);
    await touchPresence(user.id);
    res.json({ ok: true, token, username: user.username, expiresAt });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal masuk ke akun.' });
  }
});

app.post('/api/logout', requireUser, async (req, res) => {
  try {
    await pool.query('DELETE FROM sessions WHERE id=$1', [req.user.session_id]);
    await pool.query('DELETE FROM presence WHERE user_id=$1', [req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal keluar.' });
  }
});
app.get('/api/me', requireUser, (req, res) => res.json({ id: req.user.id, username: req.user.username }));
app.post('/api/presence', requireUser, async (req, res) => {
  try { await touchPresence(req.user.id); res.json({ ok: true, online: true }); }
  catch (e) { console.error(e); res.status(500).json({ error: 'Gagal memperbarui status online.' }); }
});

app.get('/api/online', async (req, res) => {
  try {
    const cutoff = Date.now() - 60_000;
    const result = await pool.query(`
      SELECT u.id, u.username, p.last_seen
      FROM presence p JOIN users u ON u.id=p.user_id
      WHERE p.last_seen > $1
      ORDER BY LOWER(u.username) ASC
      LIMIT 100
    `, [cutoff]);
    res.json({ users: result.rows, count: result.rows.length });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Gagal mengambil pengguna online.' }); }
});

app.get('/api/chat', requireUser, async (req, res) => {
  try {
    const after = Math.max(0, Number(req.query.after || 0));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 60)));
    let result;
    if (after) {
      result = await pool.query(`SELECT m.id,m.user_id,m.message,m.created_at,u.username FROM chat_messages m JOIN users u ON u.id=m.user_id WHERE m.id>$1 ORDER BY m.id ASC LIMIT $2`, [after, limit]);
    } else {
      result = await pool.query(`SELECT m.id,m.user_id,m.message,m.created_at,u.username FROM chat_messages m JOIN users u ON u.id=m.user_id ORDER BY m.id DESC LIMIT $1`, [limit]);
      result.rows.reverse();
    }
    res.json({ messages: result.rows });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Gagal mengambil chat.' }); }
});

const lastChatAt = new Map();
app.post('/api/chat', requireUser, async (req, res) => {
  try {
    const now = Date.now();
    const previous = lastChatAt.get(req.user.id) || 0;
    if (now - previous < 1200) return res.status(429).json({ error: 'Tunggu sebentar sebelum mengirim pesan lagi.' });
    const message = cleanText(req.body.message, 500);
    if (!message) return res.status(400).json({ error: 'Pesan tidak boleh kosong.' });
    const inserted = await pool.query('INSERT INTO chat_messages(user_id,message,created_at) VALUES ($1,$2,$3) RETURNING id', [req.user.id, message, now]);
    lastChatAt.set(req.user.id, now);
    const result = await pool.query(`SELECT m.id,m.user_id,m.message,m.created_at,u.username FROM chat_messages m JOIN users u ON u.id=m.user_id WHERE m.id=$1`, [inserted.rows[0].id]);
    await pool.query(`DELETE FROM chat_messages WHERE id <= COALESCE((SELECT MAX(id)-1000 FROM chat_messages), 0)`);
    res.status(201).json(result.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Gagal mengirim pesan.' }); }
});

app.get('/api/scripts', requireUser, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, filename, visibility, created_at, updated_at, code FROM scripts WHERE user_id=$1 ORDER BY updated_at DESC, id DESC', [req.user.id]);
    res.json(result.rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Gagal mengambil script.' }); }
});
app.post('/api/scripts', requireUser, async (req, res) => {
  try {
    const filename = cleanText(req.body.filename, 120);
    const code = String(req.body.code || '').slice(0, 500_000);
    const visibility = req.body.visibility === 'public' ? 'public' : 'private';
    if (!filename) return res.status(400).json({ error: 'Nama file tidak valid.' });
    const countResult = await pool.query('SELECT COUNT(*)::int AS total FROM scripts WHERE user_id=$1', [req.user.id]);
    if (countResult.rows[0].total >= 50) return res.status(400).json({ error: 'Maksimal 50 script per akun.' });
    const result = await pool.query('INSERT INTO scripts (user_id,filename,code,visibility) VALUES ($1,$2,$3,$4) RETURNING id', [req.user.id, filename, code, visibility]);
    res.status(201).json({ id: result.rows[0].id });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Gagal menyimpan script.' }); }
});
app.put('/api/scripts/:id', requireUser, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const filename = cleanText(req.body.filename, 120);
    const code = String(req.body.code || '').slice(0, 500_000);
    const visibility = req.body.visibility === 'public' ? 'public' : 'private';
    if (!Number.isInteger(id) || id < 1 || !filename) return res.status(400).json({ error: 'Data script tidak valid.' });
    const result = await pool.query('UPDATE scripts SET filename=$1, code=$2, visibility=$3, updated_at=NOW() WHERE id=$4 AND user_id=$5', [filename, code, visibility, id, req.user.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Script tidak ditemukan.' });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Gagal memperbarui script.' }); }
});
app.delete('/api/scripts/:id', requireUser, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await pool.query('DELETE FROM scripts WHERE id=$1 AND user_id=$2', [id, req.user.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Script tidak ditemukan.' });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Gagal menghapus script.' }); }
});
app.get('/raw/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(404).type('text').send('Script tidak ditemukan.');
    const result = await pool.query('SELECT code, visibility FROM scripts WHERE id=$1', [id]);
    const row = result.rows[0];
    if (!row || row.visibility !== 'public') return res.status(404).type('text').send('Script tidak ditemukan.');
    res.type('text/plain').send(row.code);
  } catch (e) { console.error(e); res.status(500).type('text').send('Gagal mengambil script.'); }
});

setInterval(async () => {
  try {
    const cutoff = Date.now() - 60_000;
    await pool.query('DELETE FROM presence WHERE last_seen <= $1', [cutoff]);
    await cleanupSessions();
  } catch (e) { console.error('Cleanup error:', e.message); }
}, 30_000).unref();

app.use(express.static(__dirname));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

initDb()
  .then(() => app.listen(PORT, HOST, () => console.log(`CB ScriptStore API listening on ${HOST}:${PORT}`)))
  .catch(err => {
    console.error('Gagal menginisialisasi PostgreSQL:', err);
    process.exit(1);
  });

process.on('SIGTERM', async () => { await pool.end(); process.exit(0); });
process.on('SIGINT', async () => { await pool.end(); process.exit(0); });
