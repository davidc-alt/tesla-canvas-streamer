const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const WebSocket = require('ws');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const YouTube = require('youtube-sr').default;

ffmpeg.setFfmpegPath(ffmpegPath);

// Locate system or homebrew yt-dlp binary if available
let ytdlpBinPath = null;
if (fs.existsSync('/opt/homebrew/bin/yt-dlp')) {
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
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('bypass-tunnel-reminder', 'true');
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// Resolution profiles for MPEG1 Canvas Streaming (Strict 1x real-time speed)
const PROFILES = {
  '144p': { size: '256x144', bitrate: '150k', fps: 25, audioBitrate: '64k', bps: 27000 },
  '240p': { size: '426x240', bitrate: '300k', fps: 25, audioBitrate: '96k', bps: 50000 },
  '360p': { size: '640x360', bitrate: '500k', fps: 25, audioBitrate: '128k', bps: 80000 },
  '480p': { size: '854x480', bitrate: '900k', fps: 30, audioBitrate: '128k', bps: 130000 }
};

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

// Fast video resolution metadata route
app.post('/api/resolve', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'YouTube URL is required' });

  try {
    const output = await ytdlp(url, {
      dumpSingleJson: true,
      noWarnings: true,
      forceIpv4: true,
      preferFreeFormats: true
    });

    res.json({
      title: output.title,
      uploader: output.uploader || output.channel || '',
      duration: output.duration,
      description: output.description ? output.description.slice(0, 300) + '...' : 'No description available.'
    });
  } catch (err) {
    console.error('yt-dlp resolution error:', err.stderr || err.message);
    res.status(500).json({ error: 'Failed to extract video details' });
  }
});

// WebSocket Canvas Transcoder with Strict 1x Real-Time Rate Locking
wss.on('connection', async (ws, req) => {
  const urlParams = new URLSearchParams(req.url.replace('/?', ''));
  const videoUrl = urlParams.get('url');
  const profileKey = urlParams.get('profile') || '360p';
  const profile = PROFILES[profileKey] || PROFILES['360p'];

  if (!videoUrl) {
    ws.close(1008, 'Missing video URL');
    return;
  }

  console.log(`[WebSocket] Client connected for Tesla Canvas Stream (1x Speed Lock): ${videoUrl} (${profileKey})`);

  let ffmpegProc = null;
  let sendQueue = [];
  let isSending = false;
  let bytesSent = 0;
  const startTime = Date.now();

  try {
    // Fast stream URL extraction
    const rawStreamUrl = (await ytdlp(videoUrl, { getUrl: true, format: '18/b', forceIpv4: true })).trim();

    const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    // Transcode into MPEG1 Video + MP2 Audio TS stream
    ffmpegProc = ffmpeg(rawStreamUrl)
      .inputOptions([
        '-user_agent', USER_AGENT
      ])
      .format('mpegts')
      .videoCodec('mpeg1video')
      .size(profile.size)
      .audioCodec('mp2')
      .audioBitrate(profile.audioBitrate)
      .audioChannels(2)
      .outputOptions([
        `-b:v ${profile.bitrate}`,
        `-maxrate ${profile.bitrate}`,
        `-bufsize ${profile.bitrate}`,
        `-r ${profile.fps}`,
        '-g 15',
        '-bf 0',
        '-q:v 4'
      ])
      .on('error', (err) => {
        if (err.message && !err.message.includes('SIGKILL')) {
          console.error('[FFmpeg Error]', err.message);
        }
      });

    const stream = ffmpegProc.pipe();

    // Strict 1x Speed Real-Time Pacing Controller
    const processQueue = () => {
      if (ws.readyState !== WebSocket.OPEN) return;

      const elapsedSec = (Date.now() - startTime) / 1000;
      const maxAllowedBytes = elapsedSec * profile.bps;

      while (sendQueue.length > 0 && bytesSent < maxAllowedBytes + (profile.bps * 2)) {
        const chunk = sendQueue.shift();
        ws.send(chunk);
        bytesSent += chunk.length;
      }

      if (sendQueue.length > 0) {
        setTimeout(processQueue, 40);
      } else {
        isSending = false;
      }
    };

    stream.on('data', (chunk) => {
      sendQueue.push(chunk);
      if (!isSending) {
        isSending = true;
        processQueue();
      }
    });

    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected');
      if (ffmpegProc) ffmpegProc.kill('SIGKILL');
      sendQueue = [];
    });

    ws.on('error', () => {
      if (ffmpegProc) ffmpegProc.kill('SIGKILL');
      sendQueue = [];
    });

  } catch (err) {
    console.error('[Canvas Stream Error]', err.message || err);
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1011, 'Stream initialization failed');
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
