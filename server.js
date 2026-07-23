const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Resolution profiles for H264 hardware-accelerated streaming
const PROFILES = {
  '360p': { size: '640x360', bitrate: '600k', crf: 28, audioBitrate: '96k' },
  '480p': { size: '854x480', bitrate: '1200k', crf: 25, audioBitrate: '128k' },
  '720p': { size: '1280x720', bitrate: '2500k', crf: 23, audioBitrate: '160k' }
};

// Route to search YouTube videos by keyword
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
      channel: v.channel?.name || ''
    }));

    res.json({ results });
  } catch (err) {
    console.error('YouTube search error:', err.message || err);
    res.status(500).json({ error: 'Failed to search YouTube' });
  }
});

// Route to fetch video metadata via yt-dlp
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
      duration: output.duration
    });
  } catch (err) {
    console.error('yt-dlp resolution error:', err.stderr || err.message);
    res.status(500).json({ error: 'Failed to extract video details' });
  }
});

// Native H264 + AAC Video Stream Endpoint
app.get('/api/stream', async (req, res) => {
  const videoUrl = req.query.url;
  const profileKey = req.query.profile || '360p';
  const profile = PROFILES[profileKey] || PROFILES['360p'];

  if (!videoUrl) return res.status(400).send('Missing video URL');

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Transfer-Encoding', 'chunked');

  try {
    // Extract direct YouTube media stream URL
    const rawStreamUrl = (await ytdlp(videoUrl, { getUrl: true, format: 'best', forceIpv4: true })).trim();

    const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const ffmpegProc = ffmpeg(rawStreamUrl)
      .inputOptions([
        '-user_agent', USER_AGENT
      ])
      .format('mp4')
      .videoCodec('libx264')
      .size(profile.size)
      .audioCodec('aac')
      .audioBitrate(profile.audioBitrate)
      .audioChannels(2)
      .outputOptions([
        '-preset ultrafast',
        `-crf ${profile.crf}`,
        `-maxrate ${profile.bitrate}`,
        `-bufsize ${profile.bitrate}`,
        '-movflags frag_keyframe+empty_moov+default_base_moof'
      ])
      .on('error', (err) => {
        if (err.message && !err.message.includes('SIGKILL') && !err.message.includes('Output stream closed')) {
          console.error('Video streaming error:', err.message);
        }
      });

    const videoStream = ffmpegProc.pipe();
    videoStream.pipe(res);

    req.on('close', () => {
      ffmpegProc.kill('SIGKILL');
    });

  } catch (err) {
    console.error('Stream setup error:', err.message || err);
    if (!res.headersSent) res.status(500).send('Stream initialization failed');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
