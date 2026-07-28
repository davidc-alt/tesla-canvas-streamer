let currentVideoUrl = '';
let currentVideoResults = [];
let currentVideoId = '';
let animationFrameId = null;

let audioElement = null;
let imageFrames = [];
let totalFramesCount = 0;
let isJobReady = false;
let pollInterval = null;

const urlInput = document.getElementById('url-input');
const searchBtn = document.getElementById('search-btn');
const statusBar = document.getElementById('status-bar');
const canvasPlayer = document.getElementById('canvas-player');

const homeLogo = document.getElementById('home-logo');
const navHomeBtn = document.getElementById('nav-home-btn');
const backHomeBtn = document.getElementById('back-home-btn');

const homeView = document.getElementById('home-view');
const watchView = document.getElementById('watch-view');
const resultsGrid = document.getElementById('results-grid');
const relatedGrid = document.getElementById('related-grid');

const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeIcon = document.getElementById('theme-icon');

const playerViewportWrapper = document.getElementById('player-viewport-wrapper');
const videoTitleDisplay = document.getElementById('video-title-display');
const videoChannelDisplay = document.getElementById('video-channel-display');
const videoChannelIcon = document.getElementById('video-channel-icon');
const videoViewsDate = document.getElementById('video-views-date');
const videoDescriptionText = document.getElementById('video-description-text');

const processingOverlay = document.getElementById('processing-overlay');
const processingStatusText = document.getElementById('processing-status-text');
const progressBarFill = document.getElementById('progress-bar-fill');
const progressPercentage = document.getElementById('progress-percentage');

const playPauseBtn = document.getElementById('play-pause-btn');
const volumeBtn = document.getElementById('volume-btn');
const volumeSlider = document.getElementById('volume-slider');
const timelineSlider = document.getElementById('timeline-slider');
const timeDisplay = document.getElementById('time-display');
const fullscreenBtn = document.getElementById('fullscreen-btn');

// Light / Dark Theme Toggle
let isLightMode = false;
themeToggleBtn.addEventListener('click', () => {
  isLightMode = !isLightMode;
  if (isLightMode) {
    document.body.classList.add('light-mode');
    themeIcon.textContent = '🌙 Dark';
  } else {
    document.body.classList.remove('light-mode');
    themeIcon.textContent = '☀️ Light';
  }
});

function updateStatus(msg) {
  statusBar.textContent = `Status: ${msg}`;
}

function showProcessingOverlay(statusText = 'Preparing video conversion...') {
  processingStatusText.textContent = statusText;
  progressBarFill.style.width = '0%';
  progressPercentage.textContent = '0%';
  processingOverlay.classList.remove('hidden');
}

function updateProgressUI(percent, statusText) {
  progressBarFill.style.width = `${percent}%`;
  progressPercentage.textContent = `${percent}%`;
  if (statusText) processingStatusText.textContent = statusText;
}

function hideProcessingOverlay() {
  processingOverlay.classList.add('hidden');
}

function extractVideoId(input) {
  const match = input.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : (input.length === 11 ? input : null);
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function showHomeView() {
  stopPlayback();
  watchView.classList.add('hidden');
  homeView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function handleSearchOrPlay() {
  const query = urlInput.value.trim();
  if (!query) {
    alert('Please enter a video search term or YouTube URL');
    return;
  }

  const videoId = extractVideoId(query);
  if (videoId) {
    openWatchView(`https://www.youtube.com/watch?v=${videoId}`, { id: videoId, title: 'YouTube Video', channel: 'YouTube' });
  } else {
    performSearch(query);
  }
}

async function performSearch(query) {
  searchBtn.disabled = true;
  updateStatus(`Searching for "${query}"...`);
  resultsGrid.innerHTML = '';
  showHomeView();

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });

    if (!res.ok) throw new Error('Search request failed');
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      updateStatus('No results found.');
      resultsGrid.innerHTML = '<p style="color:var(--text-secondary); font-size:14px; padding:20px;">No videos found matching your query.</p>';
      return;
    }

    currentVideoResults = data.results;
    updateStatus(`Found ${data.results.length} videos.`);
    renderHomeResults(data.results);
  } catch (err) {
    console.error(err);
    updateStatus(`Search error: ${err.message}`);
  } finally {
    searchBtn.disabled = false;
  }
}

function renderHomeResults(videos) {
  resultsGrid.innerHTML = '';

  videos.forEach(video => {
    const card = document.createElement('div');
    card.className = 'video-card';

    card.innerHTML = `
      <div class="thumb-wrapper">
        <img class="thumb-img" src="${video.thumbnail}" alt="${escapeHtml(video.title)}" loading="lazy" />
        ${video.duration ? `<span class="duration-badge">${video.duration}</span>` : ''}
      </div>
      <div class="card-info">
        <div class="channel-avatar">${escapeHtml(video.channel.charAt(0) || 'D')}</div>
        <div class="meta-text">
          <div class="card-title">${escapeHtml(video.title)}</div>
          <div class="card-channel">${escapeHtml(video.channel)}</div>
          <div class="card-stats">${video.views} • ${video.uploadedAt}</div>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      openWatchView(video.url, video);
    });

    resultsGrid.appendChild(card);
  });
}

function renderRelatedGrid(currentUrl) {
  relatedGrid.innerHTML = '';

  const related = currentVideoResults.filter(v => v.url !== currentUrl).slice(0, 10);
  related.forEach(video => {
    const card = document.createElement('div');
    card.className = 'related-card';

    card.innerHTML = `
      <div class="thumb-wrapper">
        <img class="thumb-img" src="${video.thumbnail}" alt="${escapeHtml(video.title)}" loading="lazy" />
        ${video.duration ? `<span class="duration-badge">${video.duration}</span>` : ''}
      </div>
      <div class="meta-text">
        <div class="card-title">${escapeHtml(video.title)}</div>
        <div class="card-channel">${escapeHtml(video.channel)}</div>
        <div class="card-stats">${video.views}</div>
      </div>
    `;

    card.addEventListener('click', () => {
      openWatchView(video.url, video);
    });

    relatedGrid.appendChild(card);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, match => {
    const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return escapeMap[match];
  });
}

async function openWatchView(videoUrl, videoMeta = null) {
  currentVideoUrl = videoUrl;
  const videoId = videoMeta?.id || extractVideoId(videoUrl);
  currentVideoId = videoId;

  // Hide home view grid completely
  homeView.classList.add('hidden');
  watchView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (videoMeta) {
    videoTitleDisplay.textContent = videoMeta.title;
    videoChannelDisplay.textContent = videoMeta.channel;
    videoChannelIcon.textContent = videoMeta.channel.charAt(0);
    videoViewsDate.textContent = `${videoMeta.views || ''} • ${videoMeta.uploadedAt || 'Uploaded recently'}`;
  } else {
    videoTitleDisplay.textContent = 'Loading video details...';
  }

  renderRelatedGrid(videoUrl);
  startAheadOfTimeProcessing(videoUrl, videoId);

  // Auto Fullscreen Trigger
  setTimeout(() => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (playerViewportWrapper.requestFullscreen) {
        playerViewportWrapper.requestFullscreen().catch(() => {});
      } else if (playerViewportWrapper.webkitRequestFullscreen) {
        playerViewportWrapper.webkitRequestFullscreen();
      }
    }
  }, 200);

  try {
    const res = await fetch('/api/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: videoUrl })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.title) videoTitleDisplay.textContent = data.title;
      if (data.uploader) videoChannelDisplay.textContent = data.uploader;
      if (data.description) videoDescriptionText.textContent = data.description;
    }
  } catch (e) {}
}

function startAheadOfTimeProcessing(videoUrl, videoId) {
  stopPlayback();
  showProcessingOverlay('Initializing video processing engine...');
  updateStatus('Processing video on server ahead of time...');

  fetch('/api/process-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: videoUrl })
  })
  .then(res => res.json())
  .then(job => {
    pollJobStatus(videoId);
  })
  .catch(err => {
    console.error(err);
    updateProgressUI(0, 'Failed to start processing');
  });
}

function pollJobStatus(videoId) {
  if (pollInterval) clearInterval(pollInterval);

  pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/job-status?id=${videoId}`);
      if (!res.ok) return;
      const job = await res.json();

      updateProgressUI(job.percent || 0, getStatusMessage(job.status));

      if (job.status === 'ready') {
        clearInterval(pollInterval);
        pollInterval = null;
        startImageSequencePlayback(job);
      } else if (job.status === 'error') {
        clearInterval(pollInterval);
        pollInterval = null;
        updateProgressUI(0, `Error: ${job.error || 'Conversion failed'}`);
      }
    } catch (e) {}
  }, 600);
}

function getStatusMessage(status) {
  switch (status) {
    case 'initializing': return 'Preparing conversion engine...';
    case 'extracting_stream': return 'Extracting video stream...';
    case 'processing_frames': return 'Extracting audio & image sequence frames...';
    case 'ready': return 'Conversion complete!';
    default: return 'Processing video...';
  }
}

function startImageSequencePlayback(job) {
  hideProcessingOverlay();
  updateStatus('Playing Image Sequence Canvas Stream');

  totalFramesCount = job.totalFrames;
  imageFrames = new Array(totalFramesCount);

  // Preload first 30 frames for instant launch
  for (let i = 1; i <= Math.min(30, totalFramesCount); i++) {
    const img = new Image();
    const pad = String(i).padStart(4, '0');
    img.src = `/jobs/${job.id}/frame_${pad}.jpg`;
    imageFrames[i - 1] = img;
  }

  // Preload remaining frames in background
  setTimeout(() => {
    for (let i = 31; i <= totalFramesCount; i++) {
      const img = new Image();
      const pad = String(i).padStart(4, '0');
      img.src = `/jobs/${job.id}/frame_${pad}.jpg`;
      imageFrames[i - 1] = img;
    }
  }, 100);

  // Create Audio Engine
  audioElement = new Audio(job.audioUrl);
  audioElement.volume = parseFloat(volumeSlider.value);

  const ctx = canvasPlayer.getContext('2d');

  audioElement.onloadedmetadata = () => {
    timeDisplay.textContent = `0:00 / ${formatTime(audioElement.duration)}`;
  };

  audioElement.ontimeupdate = () => {
    if (audioElement.duration) {
      const pct = (audioElement.currentTime / audioElement.duration) * 100;
      timelineSlider.value = pct;
      timeDisplay.textContent = `${formatTime(audioElement.currentTime)} / ${formatTime(audioElement.duration)}`;
    }
  };

  function renderLoop() {
    if (audioElement && !audioElement.paused && !audioElement.ended) {
      const currentSec = audioElement.currentTime;
      const frameIdx = Math.min(totalFramesCount - 1, Math.max(0, Math.floor(currentSec * job.fps)));

      let frameImg = imageFrames[frameIdx];

      // Fallback if image not loaded yet
      if (!frameImg) {
        frameImg = new Image();
        const pad = String(frameIdx + 1).padStart(4, '0');
        frameImg.src = `/jobs/${job.id}/frame_${pad}.jpg`;
        imageFrames[frameIdx] = frameImg;
      }

      if (frameImg.complete && frameImg.naturalWidth > 0) {
        if (canvasPlayer.width !== frameImg.naturalWidth || canvasPlayer.height !== frameImg.naturalHeight) {
          canvasPlayer.width = frameImg.naturalWidth || 426;
          canvasPlayer.height = frameImg.naturalHeight || 240;
        }
        ctx.drawImage(frameImg, 0, 0, canvasPlayer.width, canvasPlayer.height);
      }
    }
    animationFrameId = requestAnimationFrame(renderLoop);
  }

  audioElement.play().then(() => {
    playPauseBtn.textContent = '⏸';
    renderLoop();
  }).catch(err => {
    console.error('Audio play error:', err);
  });
}

function stopPlayback() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (audioElement) {
    try {
      audioElement.pause();
      audioElement.src = '';
    } catch (e) {}
    audioElement = null;
  }

  imageFrames = [];
  playPauseBtn.textContent = '▶';
  hideProcessingOverlay();
  updateStatus('Stopped');
}

// Media Controls
playPauseBtn.addEventListener('click', () => {
  if (!audioElement) return;

  if (audioElement.paused) {
    audioElement.play();
    playPauseBtn.textContent = '⏸';
  } else {
    audioElement.pause();
    playPauseBtn.textContent = '▶';
  }
});

canvasPlayer.addEventListener('click', () => {
  playPauseBtn.click();
});

timelineSlider.addEventListener('input', (e) => {
  if (audioElement && audioElement.duration) {
    const targetTime = (parseFloat(e.target.value) / 100) * audioElement.duration;
    audioElement.currentTime = targetTime;
  }
});

volumeSlider.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  if (audioElement) {
    audioElement.volume = val;
  }
  volumeBtn.textContent = val === 0 ? '🔇' : '🔊';
});

volumeBtn.addEventListener('click', () => {
  if (volumeSlider.value > 0) {
    volumeSlider.dataset.prevVal = volumeSlider.value;
    volumeSlider.value = 0;
  } else {
    volumeSlider.value = volumeSlider.dataset.prevVal || 1;
  }
  volumeSlider.dispatchEvent(new Event('input'));
});

function toggleFullscreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (playerViewportWrapper.requestFullscreen) {
      playerViewportWrapper.requestFullscreen();
    } else if (playerViewportWrapper.webkitRequestFullscreen) {
      playerViewportWrapper.webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
}

fullscreenBtn.addEventListener('click', toggleFullscreen);
canvasPlayer.addEventListener('dblclick', toggleFullscreen);

homeLogo.addEventListener('click', showHomeView);
navHomeBtn.addEventListener('click', showHomeView);
backHomeBtn.addEventListener('click', showHomeView);

searchBtn.addEventListener('click', handleSearchOrPlay);
urlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleSearchOrPlay();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    stopPlayback();
  }
});

// Load default Home Feed on launch
performSearch('lofi hip hop');
