const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const YouTube = require('youtube-sr').default;

ffmpeg.setFfmpegPath(ffmpegPath);

// Locate system or local yt-dlp binary if available
let ytdlpBinPath = null;
const localYtDlp = path.join(__dirname, 'yt-dlp');
if (fs.existsSync(localYtDlp)) {
  ytdlpBinPath = localYtDlp;
} else if (fs.existsSync('/opt/homebrew/bin/yt-dlp')) {
  ytdlpBinPath = '/opt/homebrew/bin/yt-dlp';
} else {
  try {
    const whichPath = execSync('which yt-dlp', { encoding: 'utf-8' }).trim();
    if (whichPath) ytdlpBinPath = whichPath;
  } catch (e) {}
}

const ytdlpExec = require('yt-dlp-exec');
const ytdlp = ytdlpBinPath ? ytdlpExec.create(ytdlpBinPath) : ytdlpExec;

console.log('Using yt-dlp executable path:', ytdlpBinPath || 'bundled yt-dlp-exec');

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('bypass-tunnel-reminder', 'true');
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// 24/7 Keep-Alive Self-Ping Heartbeat (Prevents Render Free Tier from Sleeping)
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || 'https://tesla-canvas-streamer.onrender.com';
setInterval(() => {
  fetch(`${RENDER_URL}/api/ping`).catch(() => {});
}, 4 * 60 * 1000);

app.get('/api/ping', (req, res) => {
  res.send('PONG');
});

// Fast YouTube search route
app.post('/api/search', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Search query is required' });

  try {
    const videos = await YouTube.search(query, { limit: 16, type: 'video' });
    const results = videos.map(v => ({
      id: v.id,
      title: v.title,
      url: v.url,
      thumbnail: v.thumbnail?.url || (v.id ? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` : ''),
      duration: v.durationFormatted || '',
      channel: v.channel?.name || 'YouTube Channel',
      views: v.views ? (v.views > 1000000 ? `${(v.views/1000000).toFixed(1)}M views` : `${Math.floor(v.views/1000)}K views`) : '1.2M views',
      uploadedAt: v.uploadedAt || 'Recently'
    }));

    res.json({ results });
  } catch (err) {
    console.error('YouTube search error:', err.message || err);
    res.status(500).json({ error: 'Failed to search YouTube' });
  }
});

// Resilient Stream URL Resolver
async function getRawStreamUrl(videoUrl) {
  const videoIdMatch = videoUrl.match(/(?:v=|\/|embed\/|shorts\/)([\w-]{11})/);
  const videoId = videoIdMatch ? videoIdMatch[1] : null;

  // 1. Try local yt-dlp first
  if (ytdlpBinPath) {
    const playerClients = [
      'youtube:player_client=tv_embedded,android_vr',
      'youtube:player_client=mweb,web_embedded',
      'youtube:player_client=android,ios'
    ];

    for (const clientArgs of playerClients) {
      try {
        const url = await ytdlp(videoUrl, {
          getUrl: true,
          format: '18/b',
          forceIpv4: true,
          extractorArgs: clientArgs,
          noWarnings: true
        });
        if (url && url.trim().startsWith('http')) {
          return url.trim();
        }
      } catch (e) {}
    }
  }

  // 2. Pure Cloud API Stream Resolvers (Piped & Invidious)
  if (videoId) {
    const cloudEndpoints = [
      `https://pipedapi.mha.fi/streams/${videoId}`,
      `https://api.piped.video/streams/${videoId}`,
      `https://pipedapi.lunar.icu/streams/${videoId}`,
      `https://inv.tux.pizza/api/v1/videos/${videoId}`,
      `https://invidious.nerdvpn.de/api/v1/videos/${videoId}`
    ];

    for (const ep of cloudEndpoints) {
      try {
        const res = await fetch(ep, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (res.ok) {
          const data = await res.json();
          if (data.videoStreams && data.videoStreams.length > 0) {
            const stream = data.videoStreams.find(s => s.quality === '360p' || s.quality === '360') || data.videoStreams[0];
            if (stream && stream.url) return stream.url;
          }
          if (data.formatStreams && data.formatStreams.length > 0) {
            const stream = data.formatStreams.find(s => s.quality === '360p' || s.resolution === '360p') || data.formatStreams[0];
            if (stream && stream.url) return stream.url;
          }
        }
      } catch (e) {}
    }
  }

  throw new Error('Unable to resolve YouTube stream URL');
}

// Proxied CORS-Allowed Fragmented MP4 Stream for HTML5 Canvas In-Drive Renderer
app.get('/api/canvas-stream', async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) return res.status(400).send('Missing video ID');

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'video/mp4');

  try {
    const rawStreamUrl = await getRawStreamUrl(videoUrl);
    const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const ffmpegProc = ffmpeg(rawStreamUrl)
      .inputOptions([
        '-user_agent', USER_AGENT
      ])
      .format('mp4')
      .outputOptions([
        '-movflags frag_keyframe+empty_moov+default_base_moof',
        '-vcodec copy',
        '-acodec copy'
      ])
      .on('error', (err) => {
        if (err.message && !err.message.includes('SIGKILL')) {
          console.error('[FFmpeg Error]', err.message);
        }
      });

    ffmpegProc.pipe(res);

    req.on('close', () => {
      ffmpegProc.kill('SIGKILL');
    });

  } catch (err) {
    console.error('[Canvas Stream Error]', err.message || err);
    if (!res.headersSent) {
      res.status(500).send('Stream failed');
    }
  }
});

// Fast video resolution metadata route
app.post('/api/resolve', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'YouTube URL is required' });

  try {
    const output = await ytdlp(url, {
      dumpSingleJson: true,
      noWarnings: true,
      forceIpv4: true,
      extractorArgs: 'youtube:player_client=tv_embedded,android_vr'
    });

    res.json({
      title: output.title,
      uploader: output.uploader || output.channel || '',
      duration: output.duration,
      description: output.description ? output.description.slice(0, 300) + '...' : 'No description available.'
    });
  } catch (err) {
    res.json({ title: 'YouTube Video', uploader: 'YouTube Channel', description: 'Playing video stream...' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
