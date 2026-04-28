const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));

const DATA_FILE = path.join(__dirname, 'data', 'characters.json');

async function readData() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return null; // first run — signals client to seed
    throw e;
  }
}

async function writeData(data) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

app.get('/api/characters', async (req, res) => {
  try {
    const data = await readData();
    res.json(data); // null on first run, array thereafter
  } catch (e) {
    console.error('Read error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/characters', async (req, res) => {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Expected an array' });
    }
    await writeData(req.body);
    res.json({ ok: true });
  } catch (e) {
    console.error('Write error:', e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`  API  →  http://localhost:${PORT}`);
});
