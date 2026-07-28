const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpegStatic = require('ffmpeg-static');

let cachedFfmpegPath = null;

function getFfmpegPath() {
  if (cachedFfmpegPath && fs.existsSync(cachedFfmpegPath)) {
    return cachedFfmpegPath;
  }

  // 1. Check ffmpeg-static path
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    cachedFfmpegPath = ffmpegStatic;
    return cachedFfmpegPath;
  }

  // 2. Check system paths
  const commonPaths = [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg'
  ];

  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      cachedFfmpegPath = p;
      return cachedFfmpegPath;
    }
  }

  // 3. Try `which ffmpeg`
  try {
    const whichPath = execSync('which ffmpeg', { encoding: 'utf-8' }).trim();
    if (whichPath && fs.existsSync(whichPath)) {
      cachedFfmpegPath = whichPath;
      return cachedFfmpegPath;
    }
  } catch (e) {
    // ignore
  }

  throw new Error('FFmpeg executable not found on system or node_modules.');
}

/**
 * Extract audio track from video file as MP3
 */
function extractAudio(videoPath, audioOutputPath) {
  const ffmpeg = getFfmpegPath();
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', videoPath,
      '-vn',
      '-acodec', 'libmp3lame',
      '-q:a', '2',
      audioOutputPath
    ];

    const proc = spawn(ffmpeg, args);
    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0 && !fs.existsSync(audioOutputPath)) {
        return reject(new Error(`FFmpeg audio extraction failed (code ${code}): ${stderr}`));
      }
      resolve(audioOutputPath);
    });
  });
}

/**
 * Helper to convert HH:MM:SS.ms to seconds
 */
function timeToSeconds(timeStr) {
  const parts = timeStr.split(':');
  if (parts.length < 3) return 0;
  const hours = parseFloat(parts[0]);
  const minutes = parseFloat(parts[1]);
  const seconds = parseFloat(parts[2]);
  return (hours * 3600) + (minutes * 60) + seconds;
}

/**
 * Extract 360p frame images sequence from video file
 * @param {string} videoPath - Input video path
 * @param {string} outputDir - Directory to save frame_%05d.jpg
 * @param {number} totalDurationSec - Total duration in seconds for progress calculation
 * @param {number} fps - Frame rate (default 12 fps)
 * @param {function} onProgress - Callback (percent)
 */
function extractFrames(videoPath, outputDir, totalDurationSec, fps = 24, resolution = '360p', onProgress) {
  const ffmpeg = getFfmpegPath();
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Resolution dimension mapping
  const resMap = {
    '360p': { w: 640, h: 360 },
    '480p': { w: 854, h: 480 },
    '720p': { w: 1280, h: 720 }
  };
  const targetRes = resMap[resolution] || resMap['360p'];

  return new Promise((resolve, reject) => {
    const framePattern = path.join(outputDir, 'frame_%05d.jpg');
    
    // Scale to selected resolution maintaining aspect ratio with black padding
    const filter = `fps=${fps},scale=${targetRes.w}:${targetRes.h}:force_original_aspect_ratio=decrease,pad=${targetRes.w}:${targetRes.h}:(ow-iw)/2:(oh-ih)/2:black`;

    const args = [
      '-y',
      '-i', videoPath,
      '-vf', filter,
      '-q:v', '4', // High quality JPEG
      framePattern
    ];

    const proc = spawn(ffmpeg, args);
    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;

      // Extract time=HH:MM:SS.ms for progress tracking
      const match = text.match(/time=(\d{2}:\d{2}:\d{2}\.\d+)/);
      if (match && totalDurationSec > 0 && onProgress) {
        const currentTime = timeToSeconds(match[1]);
        const percent = Math.min(100, (currentTime / totalDurationSec) * 100);
        onProgress(percent);
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`FFmpeg frame extraction failed (code ${code}): ${stderr}`));
      }

      // Count generated frames
      const files = fs.readdirSync(outputDir).filter(f => f.startsWith('frame_') && f.endsWith('.jpg'));
      resolve({
        frameCount: files.length,
        outputDir,
        fps
      });
    });
  });
}

module.exports = {
  getFfmpegPath,
  extractAudio,
  extractFrames
};
