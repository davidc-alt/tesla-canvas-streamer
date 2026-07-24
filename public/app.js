let currentVideoUrl = '';
let currentVideoResults = [];
let jsmpegPlayer = null;

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

const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

const playPauseBtn = document.getElementById('play-pause-btn');
const volumeBtn = document.getElementById('volume-btn');
const volumeSlider = document.getElementById('volume-slider');
const playerProfileSelect = document.getElementById('player-profile-select');
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

function showLoading(msg = 'Loading Stream...') {
  loadingText.textContent = msg;
  loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

function isYouTubeUrl(input) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i.test(input.trim());
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

  if (isYouTubeUrl(query)) {
    openWatchView(query);
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
  stopPlayback();

  // Hide home view grid completely
  homeView.classList.add('hidden');
  watchView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (videoMeta) {
    videoTitleDisplay.textContent = videoMeta.title;
    videoChannelDisplay.textContent = videoMeta.channel;
    videoChannelIcon.textContent = videoMeta.channel.charAt(0);
    videoViewsDate.textContent = `${videoMeta.views} • Uploaded ${videoMeta.uploadedAt}`;
  } else {
    videoTitleDisplay.textContent = 'Loading video details...';
  }

  renderRelatedGrid(videoUrl);
  startCanvasPlayback(videoUrl);

  // Auto Fullscreen
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

function startCanvasPlayback(videoUrl) {
  stopPlayback();
  showLoading('Connecting Canvas Stream...');

  const profile = playerProfileSelect.value;
  updateStatus(`Streaming Canvas: ${videoTitleDisplay.textContent} (${profile})`);

  // Build WebSocket URL
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/?url=${encodeURIComponent(videoUrl)}&profile=${profile}`;

  try {
    jsmpegPlayer = new JSMpeg.Player(wsUrl, {
      canvas: canvasPlayer,
      autoplay: true,
      audio: true,
      loop: false,
      videoBufferSize: 512 * 1024,
      audioBufferSize: 128 * 1024,
      onVideoDecode: () => {
        hideLoading();
        playPauseBtn.textContent = '⏸';
      }
    });

    if (jsmpegPlayer.audioOut) {
      jsmpegPlayer.audioOut.setVolume(parseFloat(volumeSlider.value));
    }

  } catch (err) {
    console.error('JSMpeg Error:', err);
    updateStatus(`Canvas Stream error: ${err.message}`);
    hideLoading();
  }
}

function stopPlayback() {
  if (jsmpegPlayer) {
    try {
      jsmpegPlayer.destroy();
    } catch (e) {}
    jsmpegPlayer = null;
  }

  playPauseBtn.textContent = '▶';
  hideLoading();
  updateStatus('Stopped');
}

// Media Controls
playPauseBtn.addEventListener('click', () => {
  if (!jsmpegPlayer) return;
  if (jsmpegPlayer.isPlaying) {
    jsmpegPlayer.pause();
    playPauseBtn.textContent = '▶';
  } else {
    jsmpegPlayer.play();
    playPauseBtn.textContent = '⏸';
  }
});

canvasPlayer.addEventListener('click', () => {
  playPauseBtn.click();
});

volumeSlider.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  if (jsmpegPlayer && jsmpegPlayer.audioOut) {
    jsmpegPlayer.audioOut.setVolume(val);
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

playerProfileSelect.addEventListener('change', () => {
  if (currentVideoUrl) {
    startCanvasPlayback(currentVideoUrl);
  }
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
