const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const ytDlpHelper = require('./utils/ytDlpHelper');
const libraryManager = require('./utils/libraryManager');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// 1. Search YouTube videos endpoint
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Search query "q" is required.' });
  }

  try {
    const results = await ytDlpHelper.searchVideos(query, 12);
    res.json({ results });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message || 'Failed to search YouTube videos.' });
  }
});

// 2. Start processing YouTube video endpoint
app.post('/api/process', async (req, res) => {
  const { videoUrl, resolution, fps } = req.body;
  if (!videoUrl) {
    return res.status(400).json({ error: 'videoUrl is required.' });
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const job = libraryManager.createJob(jobId, videoUrl);

  // Trigger background task (does not block response)
  libraryManager.processVideoTask(jobId, videoUrl, { resolution, fps });

  res.json({
    message: 'Processing started',
    jobId,
    job
  });
});

// 3. Server-Sent Events (SSE) progress endpoint
app.get('/api/jobs/:jobId/progress', (req, res) => {
  const { jobId } = req.params;
  const job = libraryManager.getJob(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  libraryManager.addSSEClient(jobId, res);
});

// 4. Get job status JSON
app.get('/api/jobs/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = libraryManager.getJob(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// 5. Get saved Tesla video library
app.get('/api/library', (req, res) => {
  const library = libraryManager.getLibrary();
  res.json({ library });
});

// 6. Get single video details
app.get('/api/library/:videoId', (req, res) => {
  const video = libraryManager.getVideo(req.params.videoId);
  if (!video) {
    return res.status(404).json({ error: 'Video not found in library' });
  }
  res.json(video);
});

// 7. Delete video from library
app.delete('/api/library/:videoId', (req, res) => {
  const { videoId } = req.params;
  const success = libraryManager.deleteVideo(videoId);
  res.json({ success, message: `Video ${videoId} deleted.` });
});

// 8. Stream audio file with HTTP Range support for scrubbing
app.get('/api/library/:videoId/audio', (req, res) => {
  const { videoId } = req.params;
  const audioPath = path.join(libraryManager.LIBRARY_DIR, videoId, 'audio.mp3');

  if (!fs.existsSync(audioPath)) {
    return res.status(404).send('Audio file not found');
  }

  const stat = fs.statSync(audioPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(audioPath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'audio/mp3',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'audio/mp3',
    };
    res.writeHead(200, head);
    fs.createReadStream(audioPath).pipe(res);
  }
});

// 9. Serve image frame files
app.get('/api/library/:videoId/frames/:frameName', (req, res) => {
  const { videoId, frameName } = req.params;
  // Sanitize filename to prevent path traversal
  const safeFrameName = path.basename(frameName);
  const framePath = path.join(libraryManager.LIBRARY_DIR, videoId, 'frames', safeFrameName);

  if (!fs.existsSync(framePath)) {
    return res.status(404).send('Frame not found');
  }

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache frame images heavily
  fs.createReadStream(framePath).pipe(res);
});

// Fallback route to serve index.html for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚗 Tesla Canvas Streamer Server Running!`);
  console.log(`🌐 Server URL: http://localhost:${PORT}`);
  console.log(`📁 Storage Dir: ${path.resolve(libraryManager.LIBRARY_DIR)}`);
  console.log(`==================================================`);
});
