let currentVideoUrl = '';

const urlInput = document.getElementById('url-input');
const searchBtn = document.getElementById('search-btn');
const statusBar = document.getElementById('status-bar');
const videoPlayer = document.getElementById('video-player');

const resultsContainer = document.getElementById('results-container');
const resultsGrid = document.getElementById('results-grid');

const playerSection = document.getElementById('player-section');
const playerViewportWrapper = document.getElementById('player-viewport-wrapper');
const videoTitleDisplay = document.getElementById('video-title-display');
const videoChannelDisplay = document.getElementById('video-channel-display');
const closePlayerBtn = document.getElementById('close-player-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

const playPauseBtn = document.getElementById('play-pause-btn');
const volumeBtn = document.getElementById('volume-btn');
const volumeSlider = document.getElementById('volume-slider');
const timeDisplay = document.getElementById('time-display');
const timelineSlider = document.getElementById('timeline-slider');
const playerProfileSelect = document.getElementById('player-profile-select');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const stopBtn = document.getElementById('stop-btn');

function updateStatus(msg) {
  statusBar.textContent = `Status: ${msg}`;
}

function showLoading(msg = 'Buffering Stream...') {
  loadingText.textContent = msg;
  loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

function isYouTubeUrl(input) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i.test(input.trim());
}

async function handleSearchOrPlay() {
  const query = urlInput.value.trim();
  if (!query) {
    alert('Please enter a video search term or YouTube URL');
    return;
  }

  if (isYouTubeUrl(query)) {
    startPlayback(query);
  } else {
    performSearch(query);
  }
}

async function performSearch(query) {
  searchBtn.disabled = true;
  updateStatus(`Searching YouTube for "${query}"...`);
  resultsGrid.innerHTML = '';

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
      resultsGrid.innerHTML = '<p style="color:#94a3b8; font-size:14px; padding:20px;">No videos found matching your query.</p>';
      return;
    }

    updateStatus(`Found ${data.results.length} videos. Click a video thumbnail to play.`);
    renderSearchResults(data.results);
  } catch (err) {
    console.error(err);
    updateStatus(`Search error: ${err.message}`);
  } finally {
    searchBtn.disabled = false;
  }
}

function renderSearchResults(videos) {
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
        <div class="card-title">${escapeHtml(video.title)}</div>
        <div class="card-channel">${escapeHtml(video.channel)}</div>
      </div>
    `;

    card.addEventListener('click', () => {
      startPlayback(video.url, video.title, video.channel);
    });

    resultsGrid.appendChild(card);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, match => {
    const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return escapeMap[match];
  });
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds === Infinity) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

async function startPlayback(videoUrl, titleHint = '', channelHint = '') {
  currentVideoUrl = videoUrl;
  stopPlayback();

  videoTitleDisplay.textContent = titleHint || 'Loading stream...';
  videoChannelDisplay.textContent = channelHint || 'YouTube Video';
  
  playerSection.classList.remove('hidden');
  playerSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showLoading('Initializing stream...');

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
    }

    const profile = playerProfileSelect.value;
    updateStatus(`Playing: ${videoTitleDisplay.textContent} (${profile})`);

    const streamSrc = `/api/stream?url=${encodeURIComponent(videoUrl)}&profile=${profile}`;
    videoPlayer.src = streamSrc;
    videoPlayer.volume = parseFloat(volumeSlider.value);
    
    videoPlayer.play().then(() => {
      playPauseBtn.textContent = '⏸';
      hideLoading();
    }).catch(err => {
      console.warn('Autoplay prevented or waiting for interaction:', err);
      showLoading('Click Play to start');
    });

  } catch (err) {
    console.error(err);
    updateStatus(`Error: ${err.message}`);
    hideLoading();
  }
}

function stopPlayback() {
  videoPlayer.pause();
  videoPlayer.removeAttribute('src');
  videoPlayer.load();

  playPauseBtn.textContent = '▶';
  timelineSlider.value = 0;
  timeDisplay.textContent = '0:00 / 0:00';
  hideLoading();
  updateStatus('Stopped');
}

function closePlayer() {
  stopPlayback();
  playerSection.classList.add('hidden');
}

// Media Player Events
videoPlayer.addEventListener('playing', () => {
  hideLoading();
  playPauseBtn.textContent = '⏸';
});

videoPlayer.addEventListener('waiting', () => {
  showLoading('Buffering Stream...');
});

videoPlayer.addEventListener('timeupdate', () => {
  if (videoPlayer.duration) {
    const pct = (videoPlayer.currentTime / videoPlayer.duration) * 100;
    timelineSlider.value = pct;
    timeDisplay.textContent = `${formatTime(videoPlayer.currentTime)} / ${formatTime(videoPlayer.duration)}`;
  }
});

timelineSlider.addEventListener('input', (e) => {
  if (videoPlayer.duration) {
    const targetTime = (e.target.value / 100) * videoPlayer.duration;
    videoPlayer.currentTime = targetTime;
  }
});

playPauseBtn.addEventListener('click', () => {
  if (videoPlayer.paused) {
    videoPlayer.play();
    playPauseBtn.textContent = '⏸';
  } else {
    videoPlayer.pause();
    playPauseBtn.textContent = '▶';
  }
});

videoPlayer.addEventListener('click', () => {
  playPauseBtn.click();
});

volumeSlider.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  videoPlayer.volume = val;
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
    startPlayback(currentVideoUrl, videoTitleDisplay.textContent, videoChannelDisplay.textContent);
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
videoPlayer.addEventListener('dblclick', toggleFullscreen);

closePlayerBtn.addEventListener('click', closePlayer);
stopBtn.addEventListener('click', stopPlayback);
searchBtn.addEventListener('click', handleSearchOrPlay);
urlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleSearchOrPlay();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    stopPlayback();
  }
});

// Load default trending search on launch
performSearch('lofi hip hop');
