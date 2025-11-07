const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
// Serve static files (kapoor.html, styles.css, images/*)
app.use(express.static(path.join(__dirname)));

const DATA_DIR = path.join(__dirname, 'data');
const POSTERS_FILE = path.join(DATA_DIR, 'posters.json');
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch (e) { /* ignore logging errors */ }
  console.log(...args);
}

// Load posters from data/posters.json (falls back to default sample if missing)
function loadPosters() {
  try {
    const raw = fs.readFileSync(POSTERS_FILE, 'utf8');
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr;
    log('data/posters.json does not contain an array, falling back to default');
  } catch (err) {
    // fallback
  }
  return [1, 3, 5, 4, 7, 9];
}

function savePosters(arr) {
  try {
    fs.writeFileSync(POSTERS_FILE, JSON.stringify(arr, null, 2), 'utf8');
    log('Saved posters.json', arr);
    return true;
  } catch (err) {
    log('Error writing posters.json', err.message || err);
    return false;
  }
}

// POST /api/subscribe -> { email: string }
app.post('/api/subscribe', (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  const subsFile = path.join(DATA_DIR, 'subscribers.json');
  let subs = [];
  try {
    if (fs.existsSync(subsFile)) {
      subs = JSON.parse(fs.readFileSync(subsFile, 'utf8')) || [];
    }
  } catch (e) {
    log('Error reading subscribers.json', e.message || e);
  }
  if (!subs.includes(email)) subs.push(email);
  try {
    fs.writeFileSync(subsFile, JSON.stringify(subs, null, 2), 'utf8');
    log('New newsletter subscriber', email);
    return res.json({ success: true });
  } catch (e) {
    log('Error writing subscribers.json', e.message || e);
    return res.status(500).json({ error: 'Unable to save' });
  }
});

// ADMIN API KEY: set via environment variable ADMIN_API_KEY
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'change-me';

function requireAdmin(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || String(key) !== String(ADMIN_API_KEY)) {
    log('Unauthorized admin attempt', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /api/list -> return the posters array
app.get('/api/list', (req, res) => {
  const posters = loadPosters();
  res.json({ list: posters });
});

// GET /api/search?key=7 -> find index of key in posters
app.get('/api/search', (req, res) => {
  const keyRaw = req.query.key;
  if (typeof keyRaw === 'undefined') {
    return res.status(400).json({ error: 'Missing query parameter: key' });
  }
  const key = Number(keyRaw);
  if (Number.isNaN(key)) {
    return res.status(400).json({ error: 'key must be a number' });
  }
  const posters = loadPosters();
  const index = posters.indexOf(key);
  res.json({ index });
});

// POST /api/posters -> { key: number } - add poster
app.post('/api/posters', requireAdmin, (req, res) => {
  const { key } = req.body;
  if (typeof key === 'undefined') return res.status(400).json({ error: 'Missing key' });
  const k = Number(key);
  if (Number.isNaN(k)) return res.status(400).json({ error: 'key must be a number' });
  const posters = loadPosters();
  posters.push(k);
  const ok = savePosters(posters);
  if (!ok) return res.status(500).json({ error: 'Unable to save' });
  log('Added poster', k);
  res.json({ list: posters });
});

// DELETE /api/posters?key=NUMBER -> remove all occurrences of key
app.delete('/api/posters', requireAdmin, (req, res) => {
  const keyRaw = req.query.key;
  if (typeof keyRaw === 'undefined') return res.status(400).json({ error: 'Missing query parameter: key' });
  const key = Number(keyRaw);
  if (Number.isNaN(key)) return res.status(400).json({ error: 'key must be a number' });
  let posters = loadPosters();
  const before = posters.length;
  posters = posters.filter(x => x !== key);
  const ok = savePosters(posters);
  if (!ok) return res.status(500).json({ error: 'Unable to save' });
  log('Removed poster', key, 'removedCount', before - posters.length);
  res.json({ list: posters });
});

// Serve kapoor.html for root explicitly (so visiting / shows the page)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'kapoor.html'));
});

app.listen(PORT, () => {
  log(`Server listening on http://localhost:${PORT}`);
});
