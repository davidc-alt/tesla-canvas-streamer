const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

let cachedYtDlpPath = null;

/**
 * Ensures yt-dlp executable exists and returns its path.
 */
async function getYtDlpPath() {
  if (cachedYtDlpPath && fs.existsSync(cachedYtDlpPath)) {
    return cachedYtDlpPath;
  }

  // 1. Check environment variable
  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) {
    cachedYtDlpPath = process.env.YTDLP_PATH;
    return cachedYtDlpPath;
  }

  // 2. Check standard system locations
  const commonPaths = [
    '/opt/homebrew/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp'
  ];

  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      cachedYtDlpPath = p;
      return cachedYtDlpPath;
    }
  }

  // 3. Try `which yt-dlp`
  try {
    const whichPath = execSync('which yt-dlp', { encoding: 'utf-8' }).trim();
    if (whichPath && fs.existsSync(whichPath)) {
      cachedYtDlpPath = whichPath;
      return cachedYtDlpPath;
    }
  } catch (e) {
    // ignore search failure
  }

  // 4. Check local bin/yt-dlp
  const localBinDir = path.join(__dirname, '..', 'bin');
  const localYtDlp = path.join(localBinDir, 'yt-dlp');
  if (fs.existsSync(localYtDlp)) {
    cachedYtDlpPath = localYtDlp;
    return cachedYtDlpPath;
  }

  // 5. Download yt-dlp binary if not found
  console.log('yt-dlp not found on system. Downloading latest binary to local bin/...');
  if (!fs.existsSync(localBinDir)) {
    fs.mkdirSync(localBinDir, { recursive: true });
  }

  const downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
  await downloadFile(downloadUrl, localYtDlp);
  fs.chmodSync(localYtDlp, 0o755);

  cachedYtDlpPath = localYtDlp;
  return cachedYtDlpPath;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to download yt-dlp: status code ${response.statusCode}`));
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(dest));
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const sec = Math.floor(seconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

const COMMON_YT_ARGS = [
  '--extractor-args', 'youtube:player_client=ios,android,mweb',
  '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  '--no-warnings',
  '--no-check-certificates'
];

/**
 * Search YouTube videos using yt-dlp
 */
async function searchVideos(query, limit = 10) {
  const ytDlp = await getYtDlpPath();
  return new Promise((resolve, reject) => {
    let args = [...COMMON_YT_ARGS];
    const isUrl = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(query.trim());

    if (isUrl) {
      args.push('--dump-single-json', query.trim());
    } else {
      args.push('--dump-single-json', '--flat-playlist', `ytsearch${limit}:${query.trim()}`);
    }

    const proc = spawn(ytDlp, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`yt-dlp search failed with code ${code}: ${stderr}`));
      }

      try {
        const data = JSON.parse(stdout);
        let items = [];

        if (data._type === 'playlist' || Array.isArray(data.entries)) {
          items = data.entries || [];
        } else if (data.id) {
          items = [data];
        }

        const results = items
          .filter(item => item && (item.id || item.url))
          .map(item => {
            const videoId = item.id || (item.url ? item.url.split('v=')[1] : null);
            const durationSec = item.duration || 0;
            return {
              id: videoId,
              title: item.title || 'Untitled Video',
              channel: item.uploader || item.channel || item.uploader_id || 'YouTube',
              duration: durationSec,
              formattedDuration: formatDuration(durationSec),
              thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              url: `https://www.youtube.com/watch?v=${videoId}`
            };
          });

        resolve(results);
      } catch (err) {
        reject(new Error(`Failed to parse yt-dlp search JSON: ${err.message}`));
      }
    });
  });
}

/**
 * Get detailed video info for a specific YouTube URL / ID
 */
async function getVideoInfo(videoUrlOrId) {
  const ytDlp = await getYtDlpPath();
  const url = videoUrlOrId.startsWith('http')
    ? videoUrlOrId
    : `https://www.youtube.com/watch?v=${videoUrlOrId}`;

  return new Promise((resolve, reject) => {
    const args = [
      ...COMMON_YT_ARGS,
      '--dump-json',
      url
    ];

    const proc = spawn(ytDlp, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`yt-dlp info failed with code ${code}: ${stderr}`));
      }

      try {
        const data = JSON.parse(stdout);
        const videoId = data.id;
        const durationSec = data.duration || 0;

        resolve({
          id: videoId,
          title: data.title || 'Untitled Video',
          channel: data.uploader || data.channel || 'YouTube',
          duration: durationSec,
          formattedDuration: formatDuration(durationSec),
          thumbnail: data.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${videoId}`
        });
      } catch (err) {
        reject(new Error(`Failed to parse video info: ${err.message}`));
      }
    });
  });
}

/**
 * Download video at 360p resolution max
 */
async function downloadVideo(videoUrlOrId, outputFilePath, maxHeight = 360, onProgress) {
  const ytDlp = await getYtDlpPath();
  const ffmpegHelper = require('./ffmpegHelper');
  const ffmpegPath = ffmpegHelper.getFfmpegPath();

  const url = videoUrlOrId.startsWith('http')
    ? videoUrlOrId
    : `https://www.youtube.com/watch?v=${videoUrlOrId}`;

  const h = parseInt(maxHeight) || 360;

  return new Promise((resolve, reject) => {
    const args = [
      ...COMMON_YT_ARGS,
      '--ffmpeg-location', ffmpegPath,
      '-f', `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/b[height<=${h}]/best`,
      '--recode-video', 'mp4',
      '--newline',
      '-o', outputFilePath,
      url
    ];

    const proc = spawn(ytDlp, args);
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const line = data.toString();
      // Match yt-dlp download percentage e.g. [download]  45.2% of  12.50MiB
      const match = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
      if (match && onProgress) {
        const percent = parseFloat(match[1]);
        onProgress(percent);
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0 && !fs.existsSync(outputFilePath)) {
        return reject(new Error(`yt-dlp download failed (code ${code}): ${stderr}`));
      }
      resolve(outputFilePath);
    });
  });
}

module.exports = {
  getYtDlpPath,
  searchVideos,
  getVideoInfo,
  downloadVideo,
  formatDuration
};
