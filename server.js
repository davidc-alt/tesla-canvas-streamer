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
  res.setHeader('bypass-tunnel-reminder', 'true');
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// Resolution profiles for MPEG1 Canvas Streaming (Ultra Smooth 1x Speed)
const PROFILES = {
  '144p': { size: '256x144', bitrate: '150k', fps: 25, audioBitrate: '64k' },
  '240p': { size: '426x240', bitrate: '300k', fps: 25, audioBitrate: '96k' },
  '360p': { size: '640x360', bitrate: '500k', fps: 25, audioBitrate: '128k' },
  '480p': { size: '854x480', bitrate: '900k', fps: 30, audioBitrate: '128k' }
};

// Resilient Stream Extractor (tries tv_embedded, mweb, android_vr, web_embedded)
async function getRawStreamUrl(videoUrl) {
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

  throw new Error('Unable to resolve YouTube stream URL');
}

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

// HTTP Chunked MPEG-TS Stream Route for 100% Reliable Cloud & Tesla Canvas Playback
app.get('/api/stream', async (req, res) => {
  const videoUrl = req.query.url;
  const profileKey = req.query.profile || '360p';
  const profile = PROFILES[profileKey] || PROFILES['360p'];

  if (!videoUrl) return res.status(400).send('Missing video URL');

  console.log(`[HTTP Stream] Client connected for Tesla Canvas Stream: ${videoUrl} (${profileKey})`);

  res.setHeader('Content-Type', 'video/mp2t');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');

  try {
    const rawStreamUrl = await getRawStreamUrl(videoUrl);
    const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const ffmpegProc = ffmpeg(rawStreamUrl)
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
    stream.pipe(res);

    req.on('close', () => {
      console.log('[HTTP Stream] Client disconnected');
      ffmpegProc.kill('SIGKILL');
    });

  } catch (err) {
    console.error('[HTTP Stream Error]', err.message || err);
    if (!res.headersSent) {
      res.status(500).send('Stream initialization failed');
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
