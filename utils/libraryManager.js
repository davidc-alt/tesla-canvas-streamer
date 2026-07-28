const fs = require('fs');
const path = require('path');
const ytDlpHelper = require('./ytDlpHelper');
const ffmpegHelper = require('./ffmpegHelper');

const STORAGE_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.join(__dirname, '..', 'storage');

const LIBRARY_DIR = path.join(STORAGE_DIR, 'library');
const TEMP_DIR = path.join(STORAGE_DIR, 'temp');
const DB_FILE = path.join(STORAGE_DIR, 'library.json');

// Ensure directories exist
function initStorage() {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
  if (!fs.existsSync(LIBRARY_DIR)) fs.mkdirSync(LIBRARY_DIR, { recursive: true });
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
  }
}

initStorage();

// Memory store for active processing jobs and SSE listeners
const activeJobs = new Map();
const sseClients = new Map(); // jobId -> Set(res)

function getLibrary() {
  try {
    if (!fs.existsSync(DB_FILE)) return [];
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading library database:', err);
    return [];
  }
}

function saveLibrary(library) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(library, null, 2));
  } catch (err) {
    console.error('Error saving library database:', err);
  }
}

function getVideo(videoId) {
  const library = getLibrary();
  return library.find(v => v.id === videoId) || null;
}

function deleteVideo(videoId) {
  let library = getLibrary();
  library = library.filter(v => v.id !== videoId);
  saveLibrary(library);

  const videoDir = path.join(LIBRARY_DIR, videoId);
  if (fs.existsSync(videoDir)) {
    try {
      fs.rmSync(videoDir, { recursive: true, force: true });
    } catch (e) {
      console.error(`Failed to delete directory for video ${videoId}:`, e);
    }
  }
  return true;
}

function createJob(jobId, videoUrlOrId) {
  const job = {
    id: jobId,
    videoUrlOrId,
    status: 'queued', // queued, processing, completed, error
    stage: 'Initializing video processing...',
    progress: 0,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  activeJobs.set(jobId, job);
  return job;
}

function getJob(jobId) {
  return activeJobs.get(jobId) || null;
}

function updateJob(jobId, updates) {
  const job = activeJobs.get(jobId);
  if (!job) return null;

  Object.assign(job, updates, { updatedAt: new Date().toISOString() });
  broadcastJobUpdate(jobId);
  return job;
}

function addSSEClient(jobId, res) {
  if (!sseClients.has(jobId)) {
    sseClients.set(jobId, new Set());
  }
  sseClients.get(jobId).add(res);

  // Send current state immediately
  const job = getJob(jobId);
  if (job) {
    res.write(`data: ${JSON.stringify(job)}\n\n`);
  }

  res.on('close', () => {
    const clients = sseClients.get(jobId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        sseClients.delete(jobId);
      }
    }
  });
}

function broadcastJobUpdate(jobId) {
  const clients = sseClients.get(jobId);
  const job = getJob(jobId);
  if (!clients || !job) return;

  const data = `data: ${JSON.stringify(job)}\n\n`;
  for (const client of clients) {
    try {
      client.write(data);
    } catch (e) {
      // client disconnected
    }
  }
}

/**
 * Total directory size calculator in MB
 */
function getDirectorySizeMB(dirPath) {
  let totalBytes = 0;
  if (!fs.existsSync(dirPath)) return 0;

  function traverse(currentPath) {
    const stats = fs.statSync(currentPath);
    if (stats.isDirectory()) {
      const files = fs.readdirSync(currentPath);
      files.forEach(file => traverse(path.join(currentPath, file)));
    } else {
      totalBytes += stats.size;
    }
  }

  traverse(dirPath);
  return Math.round((totalBytes / (1024 * 1024)) * 10) / 10;
}

/**
 * Execute full background video processing pipeline
 */
async function processVideoTask(jobId, videoUrlOrId, options = {}) {
  const jobTempDir = path.join(TEMP_DIR, jobId);

  const resolution = options.resolution || '360p';
  const fps = parseInt(options.fps) || 24;
  const maxHeight = parseInt(resolution) || 360;

  const resMap = {
    '360p': { w: 640, h: 360 },
    '480p': { w: 854, h: 480 },
    '720p': { w: 1280, h: 720 }
  };
  const dimensions = resMap[resolution] || resMap['360p'];

  try {
    if (!fs.existsSync(jobTempDir)) {
      fs.mkdirSync(jobTempDir, { recursive: true });
    }

    // Step 1: Fetch Video Info (0% -> 10%)
    updateJob(jobId, {
      status: 'processing',
      stage: 'Fetching YouTube video metadata...',
      progress: 5,
      resolution,
      fps
    });

    const info = await ytDlpHelper.getVideoInfo(videoUrlOrId);
    const videoId = info.id;
    const targetVideoDir = path.join(LIBRARY_DIR, videoId);
    const targetFramesDir = path.join(targetVideoDir, 'frames');

    // Ensure target folder exists
    if (!fs.existsSync(targetFramesDir)) {
      fs.mkdirSync(targetFramesDir, { recursive: true });
    }

    updateJob(jobId, {
      videoTitle: info.title,
      videoId: info.id,
      stage: `Downloading ${resolution} video stream...`,
      progress: 10
    });

    // Step 2: Download Video File (10% -> 40%)
    const tempVideoPath = path.join(jobTempDir, 'video.mp4');
    await ytDlpHelper.downloadVideo(videoUrlOrId, tempVideoPath, maxHeight, (downloadPercent) => {
      // Map 0-100% download to 10-40% total progress
      const totalProgress = Math.round(10 + (downloadPercent * 0.3));
      updateJob(jobId, {
        stage: `Downloading ${resolution} video (${Math.round(downloadPercent)}%)...`,
        progress: totalProgress
      });
    });

    // Step 3: Extract Audio Track (40% -> 50%)
    updateJob(jobId, {
      stage: 'Extracting synchronized audio track...',
      progress: 42
    });

    const audioOutputPath = path.join(targetVideoDir, 'audio.mp3');
    await ffmpegHelper.extractAudio(tempVideoPath, audioOutputPath);

    updateJob(jobId, {
      stage: 'Audio track extracted successfully. Preparing frame extraction...',
      progress: 50
    });

    // Step 4: Extract Frames (50% -> 95%)
    updateJob(jobId, {
      stage: `Converting video to ${resolution} canvas frames @ ${fps} fps...`,
      progress: 52
    });

    const frameResult = await ffmpegHelper.extractFrames(
      tempVideoPath,
      targetFramesDir,
      info.duration,
      fps,
      resolution,
      (framePercent) => {
        // Map 0-100% frame extraction to 50-95% total progress
        const totalProgress = Math.round(50 + (framePercent * 0.45));
        updateJob(jobId, {
          stage: `Rendering ${resolution} frames (${Math.round(framePercent)}%)...`,
          progress: totalProgress
        });
      }
    );

    // Step 5: Finalize & Save to Library (95% -> 100%)
    updateJob(jobId, {
      stage: 'Finalizing Tesla Library storage...',
      progress: 96
    });

    const totalSizeMB = getDirectorySizeMB(targetVideoDir);
    const videoRecord = {
      id: videoId,
      title: info.title,
      channel: info.channel,
      duration: info.duration,
      formattedDuration: info.formattedDuration,
      fps: frameResult.fps,
      frameCount: frameResult.frameCount,
      resolution: `${resolution} (${dimensions.w}x${dimensions.h})`,
      width: dimensions.w,
      height: dimensions.h,
      thumbnailUrl: info.thumbnail,
      audioUrl: `/api/library/${videoId}/audio`,
      framesUrlPattern: `/api/library/${videoId}/frames/frame_%05d.jpg`,
      totalSizeMB,
      processedAt: new Date().toISOString()
    };

    // Save record to DB
    const library = getLibrary();
    const existingIndex = library.findIndex(v => v.id === videoId);
    if (existingIndex >= 0) {
      library[existingIndex] = videoRecord;
    } else {
      library.unshift(videoRecord);
    }
    saveLibrary(library);

    // Clean up temporary files
    try {
      fs.rmSync(jobTempDir, { recursive: true, force: true });
    } catch (e) {
      // ignore temp cleanup error
    }

    // Complete job
    updateJob(jobId, {
      status: 'completed',
      stage: 'Video processed successfully! Saved to Tesla Library.',
      progress: 100,
      videoRecord
    });

  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    updateJob(jobId, {
      status: 'error',
      stage: 'Processing failed',
      error: error.message || 'An error occurred during video processing.'
    });

    // Clean temp
    if (fs.existsSync(jobTempDir)) {
      try { fs.rmSync(jobTempDir, { recursive: true, force: true }); } catch (e) {}
    }
  }
}

module.exports = {
  getLibrary,
  getVideo,
  deleteVideo,
  createJob,
  getJob,
  addSSEClient,
  processVideoTask,
  LIBRARY_DIR
};
