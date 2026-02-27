require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || process.env.REACT_APP_YOUTUBE_API_KEY;
const youtubeDownloadProgress = new Map(); // jobId -> { current, total, status, filename?, error? }
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const URI = process.env.REACT_APP_MONGODB_URI || process.env.MONGODB_URI || process.env.REACT_APP_MONGO_URI;
const DB = 'chatapp';

let db;

async function connect() {
  const client = await MongoClient.connect(URI);
  db = client.db(DB);
  console.log('MongoDB connected');
}

app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family:sans-serif;padding:2rem;background:#00356b;color:white;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0">
        <div style="text-align:center">
          <h1>Chat API Server</h1>
          <p>Backend is running. Use the React app at <a href="http://localhost:3000" style="color:#ffd700">localhost:3000</a></p>
          <p><a href="/api/status" style="color:#ffd700">Check DB status</a></p>
        </div>
      </body>
    </html>
  `);
});

app.get('/api/status', async (req, res) => {
  try {
    const usersCount = await db.collection('users').countDocuments();
    const sessionsCount = await db.collection('sessions').countDocuments();
    res.json({ usersCount, sessionsCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Users ────────────────────────────────────────────────────────────────────

app.post('/api/users', async (req, res) => {
  try {
    const { username, password, email, firstName, lastName } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = String(username).trim().toLowerCase();
    const existing = await db.collection('users').findOne({ username: name });
    if (existing) return res.status(400).json({ error: 'Username already exists' });
    const hashed = await bcrypt.hash(password, 10);
    await db.collection('users').insertOne({
      username: name,
      password: hashed,
      email: email ? String(email).trim().toLowerCase() : null,
      firstName: firstName ? String(firstName).trim() : '',
      lastName: lastName ? String(lastName).trim() : '',
      createdAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = username.trim().toLowerCase();
    const user = await db.collection('users').findOne({ username: name });
    if (!user) return res.status(401).json({ error: 'User not found' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid password' });
    res.json({
      ok: true,
      username: name,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sessions ─────────────────────────────────────────────────────────────────

app.get('/api/sessions', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username required' });
    const sessions = await db
      .collection('sessions')
      .find({ username })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(
      sessions.map((s) => ({
        id: s._id.toString(),
        agent: s.agent || null,
        title: s.title || null,
        createdAt: s.createdAt,
        messageCount: (s.messages || []).length,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { username, agent } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    const { title } = req.body;
    const result = await db.collection('sessions').insertOne({
      username,
      agent: agent || null,
      title: title || null,
      createdAt: new Date().toISOString(),
      messages: [],
    });
    res.json({ id: result.insertedId.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    await db.collection('sessions').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/sessions/:id/title', async (req, res) => {
  try {
    const { title } = req.body;
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { title } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Messages ─────────────────────────────────────────────────────────────────

app.post('/api/messages', async (req, res) => {
  try {
    const { session_id, role, content, imageData, charts, toolCalls } = req.body;
    if (!session_id || !role || content === undefined)
      return res.status(400).json({ error: 'session_id, role, content required' });
    const msg = {
      role,
      content,
      timestamp: new Date().toISOString(),
      ...(imageData && {
        imageData: Array.isArray(imageData) ? imageData : [imageData],
      }),
      ...(charts?.length && { charts }),
      ...(toolCalls?.length && { toolCalls }),
    };
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(session_id) },
      { $push: { messages: msg } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    const doc = await db
      .collection('sessions')
      .findOne({ _id: new ObjectId(session_id) });
    const raw = doc?.messages || [];
    const msgs = raw.map((m, i) => {
      const arr = m.imageData
        ? Array.isArray(m.imageData)
          ? m.imageData
          : [m.imageData]
        : [];
      return {
        id: `${doc._id}-${i}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        images: arr.length
          ? arr.map((img) => ({ data: img.data, mimeType: img.mimeType }))
          : undefined,
        charts: m.charts?.length ? m.charts : undefined,
        toolCalls: m.toolCalls?.length ? m.toolCalls : undefined,
      };
    });
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── YouTube Channel Download ───────────────────────────────────────────────────

function parseChannelInput(urlOrHandle) {
  const s = (urlOrHandle || '').trim();
  if (!s) return { type: null, value: null };
  const handleMatch = s.match(/youtube\.com\/@([^/?]+)/);
  if (handleMatch) return { type: 'handle', value: handleMatch[1] };
  const idMatch = s.match(/youtube\.com\/channel\/([^/?]+)/);
  if (idMatch) return { type: 'id', value: idMatch[1] };
  if (s.startsWith('@')) return { type: 'handle', value: s.slice(1) };
  if (/^[a-zA-Z0-9_-]+$/.test(s)) return { type: 'handle', value: s };
  return { type: null, value: null };
}

app.post('/api/youtube/download', async (req, res) => {
  const jobId = `yt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  youtubeDownloadProgress.set(jobId, { current: 0, total: 0, status: 'starting' });
  res.json({ jobId });

  const { channelUrl, maxVideos = 10 } = req.body;
  const max = Math.min(100, Math.max(1, parseInt(maxVideos, 10) || 10));
  const parsed = parseChannelInput(channelUrl);
  if (!parsed.value || !YOUTUBE_API_KEY) {
    youtubeDownloadProgress.set(jobId, {
      current: 0,
      total: 0,
      status: 'error',
      error: !YOUTUBE_API_KEY ? 'YOUTUBE_API_KEY not set' : 'Invalid channel URL or handle',
    });
    return;
  }

  const publicDir = path.join(__dirname, '..', 'public');
  const baseUrl = 'https://www.googleapis.com/youtube/v3';

  try {
    let channelId = parsed.value;
    if (parsed.type === 'handle') {
      let chRes = await fetch(
        `${baseUrl}/channels?part=id,snippet&forUsername=${encodeURIComponent(parsed.value)}&key=${YOUTUBE_API_KEY}`
      );
      let chData = await chRes.json();
      if (!chData.items?.length) {
        const searchRes = await fetch(
          `${baseUrl}/search?part=snippet&type=channel&q=${encodeURIComponent(parsed.value)}&key=${YOUTUBE_API_KEY}`
        );
        const searchData = await searchRes.json();
        const chan = searchData.items?.find((i) => i.snippet?.channelId);
        if (chan) channelId = chan.snippet.channelId;
      } else {
        channelId = chData.items[0].id;
      }
      if (!channelId) {
        youtubeDownloadProgress.set(jobId, { current: 0, total: 0, status: 'error', error: 'Channel not found' });
        return;
      }
    }

    const chDetailsRes = await fetch(
      `${baseUrl}/channels?part=contentDetails&id=${channelId}&key=${YOUTUBE_API_KEY}`
    );
    const chDetails = await chDetailsRes.json();
    const uploadsPlaylistId = chDetails?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      youtubeDownloadProgress.set(jobId, { current: 0, total: 0, status: 'error', error: 'Uploads playlist not found' });
      return;
    }

    const videoIds = [];
    let nextPageToken = '';
    while (videoIds.length < max) {
      const plRes = await fetch(
        `${baseUrl}/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${Math.min(50, max - videoIds.length)}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}&key=${YOUTUBE_API_KEY}`
      );
      const plData = await plRes.json();
      const items = plData.items || [];
      items.forEach((i) => {
        if (i.contentDetails?.videoId) videoIds.push(i.contentDetails.videoId);
      });
      nextPageToken = plData.nextPageToken || '';
      if (!nextPageToken || items.length === 0) break;
    }
    const ids = videoIds.slice(0, max);
    youtubeDownloadProgress.set(jobId, { current: 0, total: ids.length, status: 'fetching' });

    const results = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      youtubeDownloadProgress.set(jobId, { current: i + 1, total: ids.length, status: 'fetching' });
      const vRes = await fetch(
        `${baseUrl}/videos?part=snippet,contentDetails,statistics&id=${id}&key=${YOUTUBE_API_KEY}`
      );
      const vData = await vRes.json();
      const v = vData?.items?.[0];
      if (!v) continue;
      const snippet = v.snippet || {};
      const stat = v.statistics || {};
      const contentDetails = v.contentDetails || {};
      let transcript = null;
      try {
        const { YoutubeTranscript } = await import('youtube-transcript');
        const list = await YoutubeTranscript.fetchTranscript(id);
        transcript = (Array.isArray(list) ? list : []).map((t) => (t && t.text) || '').join(' ').trim() || null;
      } catch (_) {
        transcript = null;
      }
      results.push({
        videoId: id,
        videoUrl: `https://www.youtube.com/watch?v=${id}`,
        title: snippet.title || '',
        description: (snippet.description || '').slice(0, 5000),
        transcript: transcript || '',
        duration: contentDetails.duration || '',
        releaseDate: snippet.publishedAt || '',
        viewCount: parseInt(stat.viewCount, 10) || 0,
        likeCount: parseInt(stat.likeCount, 10) || 0,
        commentCount: parseInt(stat.commentCount, 10) || 0,
        thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
      });
    }

    const slug = (channelUrl || 'channel').replace(/[^a-zA-Z0-9@_-]/g, '_').slice(0, 40);
    const filename = `yt_${slug}_${Date.now()}.json`;
    const filepath = path.join(publicDir, filename);
    fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(results, null, 2), 'utf8');
    youtubeDownloadProgress.set(jobId, {
      current: results.length,
      total: results.length,
      status: 'done',
      filename,
      filepath: `/${filename}`,
    });
  } catch (err) {
    console.error('YouTube download error:', err);
    youtubeDownloadProgress.set(jobId, {
      current: 0,
      total: 0,
      status: 'error',
      error: err.message || 'Download failed',
    });
  }
});

app.get('/api/youtube/status/:jobId', (req, res) => {
  const job = youtubeDownloadProgress.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// ── Image generation (Google Imagen via @google/genai; fallback placeholder) ───
const GEMINI_API_KEY = process.env.REACT_APP_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

// Placeholder SVG as base64 when Imagen is unavailable (so the UI always gets an image)
function getPlaceholderImageBase64(safePromptText) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').slice(0, 50);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
    <rect width="400" height="300" fill="#1e293b"/>
    <text x="200" y="120" text-anchor="middle" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="14">Image generation unavailable</text>
    <text x="200" y="145" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="12">Showing placeholder (Imagen not available for this key)</text>
    <text x="200" y="175" text-anchor="middle" fill="#475569" font-family="system-ui,sans-serif" font-size="11">${esc(safePromptText) || 'Your prompt'}</text>
    <rect x="150" y="200" width="100" height="36" rx="8" fill="#334155" stroke="#475569"/>
    <text x="200" y="223" text-anchor="middle" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="12">Placeholder</text>
  </svg>`;
  return Buffer.from(svg, 'utf8').toString('base64');
}

function sendPlaceholder(res, prompt, message) {
  try {
    res.status(200).json({
      imageData: getPlaceholderImageBase64(prompt),
      mimeType: 'image/svg+xml',
      placeholder: true,
      _message: message || 'Image generation unavailable; showing placeholder.',
    });
  } catch (e) {
    res.status(200).json({
      imageData: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#1e293b"/><text x="200" y="150" text-anchor="middle" fill="#94a3b8">Placeholder</text></svg>').toString('base64'),
      mimeType: 'image/svg+xml',
      placeholder: true,
      _message: 'Placeholder',
    });
  }
}

app.post('/api/generate-image', async (req, res) => {
  const prompt = (req.body && req.body.prompt) != null ? String(req.body.prompt) : '';
  const trimmedPrompt = prompt.trim().slice(0, 4000);

  // Always respond with 200 and an image (real or placeholder). Never 500 for "tool" purposes.
  if (!trimmedPrompt) {
    sendPlaceholder(res, '', 'No prompt provided; showing placeholder.');
    return;
  }

  try {
    if (!GEMINI_API_KEY) {
      sendPlaceholder(res, trimmedPrompt, 'API key not set; showing placeholder.');
      return;
    }

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const modelsToTry = ['imagen-4.0-generate-001', 'imagen-3.0-generate-002'];
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateImages({
          model,
          prompt: trimmedPrompt,
          config: { numberOfImages: 1 },
        });
        const first = response?.generatedImages?.[0]?.image;
        if (first?.imageBytes) {
          return res.status(200).json({
            imageData: first.imageBytes,
            mimeType: first.mimeType || 'image/png',
          });
        }
        lastError = response?.error?.message || 'No image returned';
      } catch (e) {
        lastError = e.message || e?.toString?.() || 'Request failed';
        console.warn('[Imagen]', model, 'failed:', lastError);
      }
    }

    console.warn('[Imagen] All models failed, returning placeholder. Last:', lastError);
    sendPlaceholder(res, trimmedPrompt, 'Imagen API was not available; showing placeholder.');
  } catch (err) {
    console.error('[Imagen] Error:', err);
    sendPlaceholder(res, trimmedPrompt, err.message || 'Image generation failed; showing placeholder.');
  }
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

connect()
  .then(() => {
    app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
