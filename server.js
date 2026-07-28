const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');
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
const ytdlp = (url, opts) => {
  const env = {
    ...process.env,
    PATH: '/opt/homebrew/bin:/usr/local/bin:' + (process.env.PATH || ''),
    DEVELOPER_DIR: '/Library/Developer/CommandLineTools'
  };
  if (ytdlpBinPath) {
    return ytdlpExec.create(ytdlpBinPath)(url, { ...opts, env });
  }
  return ytdlpExec(url, { ...opts, env });
};

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

const jobsDir = path.join(__dirname, 'public', 'jobs');
if (!fs.existsSync(jobsDir)) {
  fs.mkdirSync(jobsDir, { recursive: true });
}

app.use(express.static(path.join(__dirname, 'public')));

// Active processing jobs cache
const jobs = {};

// 24/7 Keep-Alive Self-Ping Heartbeat
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

// Stream URL Resolver
async function getRawStreamUrl(videoUrl) {
  const videoIdMatch = videoUrl.match(/(?:v=|\/|embed\/|shorts\/)([\w-]{11})/);
  const videoId = videoIdMatch ? videoIdMatch[1] : null;

  // 1. Try python3 + yt-dlp binary directly
  try {
    const pyBin = fs.existsSync('/opt/homebrew/bin/python3') ? '/opt/homebrew/bin/python3' : 'python3';
    const ytdlpScript = ytdlpBinPath || path.join(__dirname, 'yt-dlp');
    const cmd = `"${pyBin}" "${ytdlpScript}" "${videoUrl}" --get-url --format 18/b --force-ipv4 --no-warnings`;
    const url = execSync(cmd, { encoding: 'utf-8', timeout: 10000 }).trim();
    if (url && url.startsWith('http')) return url;
  } catch (e) {
    console.error('yt-dlp exec error:', e.message || e);
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

// Start Processing Video Ahead of Time into Image Sequence & Audio
app.post('/api/process-video', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Video URL is required' });

  const videoIdMatch = url.match(/(?:v=|\/|embed\/|shorts\/)([\w-]{11})/);
  if (!videoIdMatch) return res.status(400).json({ error: 'Invalid YouTube URL' });

  const videoId = videoIdMatch[1];
  const jobDir = path.join(jobsDir, videoId);

  // Return cached job if already processing or completed
  if (jobs[videoId]) {
    return res.json(jobs[videoId]);
  }

  // Check if already processed on disk
  if (fs.existsSync(jobDir) && fs.existsSync(path.join(jobDir, 'meta.json'))) {
    const meta = JSON.parse(fs.readFileSync(path.join(jobDir, 'meta.json'), 'utf-8'));
    jobs[videoId] = meta;
    return res.json(meta);
  }

  if (!fs.existsSync(jobDir)) {
    fs.mkdirSync(jobDir, { recursive: true });
  }

  const jobMeta = {
    id: videoId,
    status: 'initializing',
    percent: 0,
    fps: 15,
    totalFrames: 0,
    audioUrl: `/jobs/${videoId}/audio.mp3`,
    framePattern: `/jobs/${videoId}/frame_%04d.jpg`
  };

  jobs[videoId] = jobMeta;
  res.json(jobMeta);

  // Run background processing
  try {
    jobMeta.status = 'extracting_stream';
    jobMeta.percent = 5;

    const rawStreamUrl = await getRawStreamUrl(url);

    jobMeta.status = 'processing_frames';
    jobMeta.percent = 15;

    const audioPath = path.join(jobDir, 'audio.mp3');
    const framePatternPath = path.join(jobDir, 'frame_%04d.jpg');

    // Extract MP3 Audio & Image Sequence simultaneously at 15 FPS (426x240 resolution)
    let processedFrames = 0;
    const ffmpegProc = ffmpeg(rawStreamUrl)
      .inputOptions(['-user_agent', 'Mozilla/5.0'])
      .output(audioPath)
      .audioCodec('libmp3lame')
      .audioBitrate('96k')
      .output(framePatternPath)
      .outputOptions([
        '-r 15',
        '-s 426x240',
        '-q:v 6'
      ])
      .on('progress', (p) => {
        if (p.percent) {
          jobMeta.percent = Math.min(95, Math.max(15, Math.floor(p.percent)));
        } else if (p.frames) {
          processedFrames = p.frames;
          jobMeta.totalFrames = processedFrames;
          jobMeta.percent = Math.min(95, 15 + Math.floor(processedFrames / 30));
        }
      })
      .on('end', () => {
        // Count total frames written to disk
        const files = fs.readdirSync(jobDir).filter(f => f.startsWith('frame_') && f.endsWith('.jpg'));
        jobMeta.totalFrames = files.length;
        jobMeta.percent = 100;
        jobMeta.status = 'ready';

        fs.writeFileSync(path.join(jobDir, 'meta.json'), JSON.stringify(jobMeta, null, 2));
        console.log(`[Job Complete] ${videoId}: ${jobMeta.totalFrames} frames extracted successfully.`);
      })
      .on('error', (err) => {
        console.error(`[Job Error] ${videoId}:`, err.message);
        jobMeta.status = 'error';
        jobMeta.error = err.message;
      });

    ffmpegProc.run();

  } catch (err) {
    console.error(`[Job Failed] ${videoId}:`, err.message);
    jobMeta.status = 'error';
    jobMeta.error = err.message;
  }
});

// Job Status Route
app.get('/api/job-status', (req, res) => {
  const videoId = req.query.id;
  if (!videoId) return res.status(400).json({ error: 'Missing video ID' });

  if (jobs[videoId]) {
    return res.json(jobs[videoId]);
  }

  const jobDir = path.join(jobsDir, videoId);
  if (fs.existsSync(jobDir) && fs.existsSync(path.join(jobDir, 'meta.json'))) {
    const meta = JSON.parse(fs.readFileSync(path.join(jobDir, 'meta.json'), 'utf-8'));
    jobs[videoId] = meta;
    return res.json(meta);
  }

  res.status(404).json({ error: 'Job not found' });
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
