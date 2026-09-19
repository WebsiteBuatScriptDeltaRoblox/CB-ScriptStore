const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, 'challocode.db'));
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase ON users(username COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS scripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function makeToken() { return crypto.randomBytes(32).toString('hex'); }
function getUser(req) {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  if (!token) return null;
  const row = db.prepare(`SELECT u.id, u.username, s.id AS session_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).get(hashToken(token), Date.now());
  return row ? { ...row, token } : null;
}
function requireUser(req, res, next) {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Session tidak valid atau sudah habis.' });
  req.user = user;
  next();
}

app.post('/api/register', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirmPassword || '');
  if (!/^[A-Za-z0-9_]{5,24}$/.test(username)) return res.status(400).json({ error: 'Username minimal 5 dan maksimal 24 karakter: huruf, angka, atau underscore.' });
  if (password.length < 9) return res.status(400).json({ error: 'Password harus lebih dari 8 karakter (minimal 9).' });
  if (password !== confirm) return res.status(400).json({ error: 'Konfirmasi password tidak cocok.' });
  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username);
    if (existing) return res.status(409).json({ error: 'Nama username sudah dipakai orang lain. Silakan gunakan nama lain.' });
    const hash = await bcrypt.hash(password, 12);
    db.prepare('INSERT INTO users (username,password_hash) VALUES (?,?)').run(username, hash);
    res.json({ ok: true });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Nama username sudah dipakai orang lain. Silakan gunakan nama lain.' });
    res.status(500).json({ error: 'Gagal membuat akun.' });
  }
});

app.post('/api/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT id, username, password_hash FROM users WHERE username=? COLLATE NOCASE').get(username);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Username atau password salah.' });
  const token = makeToken();
  db.prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?,?,?)').run(user.id, hashToken(token), Date.now() + 1000 * 60 * 60 * 24 * 7);
  res.json({ ok: true, token, username: user.username });
});

app.post('/api/logout', requireUser, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE id=?').run(req.user.session_id);
  res.json({ ok: true });
});

app.get('/api/me', requireUser, (req, res) => res.json({ id: req.user.id, username: req.user.username }));

app.get('/api/scripts', requireUser, (req, res) => {
  const rows = db.prepare('SELECT id, filename, visibility, created_at, updated_at, code FROM scripts WHERE user_id=? ORDER BY updated_at DESC, id DESC').all(req.user.id);
  res.json(rows);
});

app.post('/api/scripts', requireUser, (req, res) => {
  const filename = String(req.body.filename || '').trim();
  const code = String(req.body.code || '');
  const visibility = req.body.visibility === 'public' ? 'public' : 'private';
  if (!filename || filename.length > 120) return res.status(400).json({ error: 'Nama file tidak valid.' });
  const count = db.prepare('SELECT COUNT(*) AS total FROM scripts WHERE user_id=?').get(req.user.id).total;
  if (count >= 50) return res.status(400).json({ error: 'Maksimal 50 script per akun.' });
  const result = db.prepare('INSERT INTO scripts (user_id,filename,code,visibility) VALUES (?,?,?,?)').run(req.user.id, filename, code, visibility);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/scripts/:id', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const filename = String(req.body.filename || '').trim();
  const code = String(req.body.code || '');
  const visibility = req.body.visibility === 'public' ? 'public' : 'private';
  if (!filename || filename.length > 120) return res.status(400).json({ error: 'Nama file tidak valid.' });
  const result = db.prepare('UPDATE scripts SET filename=?, code=?, visibility=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?').run(filename, code, visibility, id, req.user.id);
  if (!result.changes) return res.status(404).json({ error: 'Script tidak ditemukan.' });
  res.json({ ok: true });
});

app.delete('/api/scripts/:id', requireUser, (req, res) => {
  const result = db.prepare('DELETE FROM scripts WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id);
  if (!result.changes) return res.status(404).json({ error: 'Script tidak ditemukan.' });
  res.json({ ok: true });
});

app.get('/raw/:id', (req, res) => {
  const row = db.prepare(`SELECT filename, code, visibility FROM scripts WHERE id=?`).get(Number(req.params.id));
  if (!row || row.visibility !== 'public') return res.status(404).type('text').send('Script tidak ditemukan.');
  res.type('text/plain').send(row.code);
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, () => console.log(`CB ScriptStore running at http://localhost:${PORT}`));
