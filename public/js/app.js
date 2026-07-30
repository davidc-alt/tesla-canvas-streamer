document.addEventListener('DOMContentLoaded', () => {
  // Navigation Tabs
  const navButtons = document.querySelectorAll('.nav-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const libraryCount = document.getElementById('libraryCount');

  // Search Elements
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const searchResultsSection = document.getElementById('searchResultsSection');
  const searchResultsGrid = document.getElementById('searchResultsGrid');
  const searchResultsCount = document.getElementById('resultsCount');
  const searchLoader = document.getElementById('searchLoader');
  const chipButtons = document.querySelectorAll('.chip-btn');

  // Library Elements
  const activeProcessingSection = document.getElementById('activeProcessingSection');
  const activeJobsContainer = document.getElementById('activeJobsContainer');
  const libraryEmptyState = document.getElementById('libraryEmptyState');
  const libraryGrid = document.getElementById('libraryGrid');
  const emptySearchBtn = document.getElementById('emptySearchBtn');

  // Resolution Modal Elements
  const resolutionModal = document.getElementById('resolutionModal');
  const closeResModalBtn = document.getElementById('closeResModalBtn');
  const resModalOverlayClose = document.getElementById('resModalOverlayClose');
  const cancelResBtn = document.getElementById('cancelResBtn');
  const confirmProcessBtn = document.getElementById('confirmProcessBtn');
  const resThumbImg = document.getElementById('resThumbImg');
  const resVideoTitle = document.getElementById('resVideoTitle');
  const resVideoChannel = document.getElementById('resVideoChannel');
  const targetFpsSelect = document.getElementById('targetFpsSelect');

  // Canvas Player Modal Elements
  const playerModal = document.getElementById('playerModal');
  const playerOverlayClose = document.getElementById('playerOverlayClose');
  const closePlayerBtn = document.getElementById('closePlayerBtn');
  const canvasWrapper = document.getElementById('canvasWrapper');
  const teslaCanvas = document.getElementById('teslaCanvas');
  const canvasCtx = teslaCanvas.getContext('2d');
  const canvasPlayOverlay = document.getElementById('canvasPlayOverlay');

  // Pre-Cache & Buffering Elements
  const preCacheScreen = document.getElementById('preCacheScreen');
  const cacheStageText = document.getElementById('cacheStageText');
  const cachePercentText = document.getElementById('cachePercentText');
  const cacheProgressBar = document.getElementById('cacheProgressBar');
  const cacheModeSelect = document.getElementById('cacheModeSelect');
  const startPlayNowBtn = document.getElementById('startPlayNowBtn');
  const canvasBuffering = document.getElementById('canvasBuffering');
  const bufferingText = document.getElementById('bufferingText');

  // Metadata Badges & Titles
  const playerTitle = document.getElementById('playerTitle');
  const playerChannel = document.getElementById('playerChannel');
  const playerResBadge = document.getElementById('playerResBadge');
  const playerFpsBadge = document.getElementById('playerFpsBadge');
  const playerCacheBadge = document.getElementById('playerCacheBadge');
  const playerFramesBadge = document.getElementById('playerFramesBadge');

  // Controls & Audio
  const teslaAudio = document.getElementById('teslaAudio');
  const canvasScrubber = document.getElementById('canvasScrubber');
  const scrubberBuffer = document.getElementById('scrubberBuffer');
  const scrubberProgress = document.getElementById('scrubberProgress');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const rewindBtn = document.getElementById('rewindBtn');
  const forwardBtn = document.getElementById('forwardBtn');
  const currentTimeText = document.getElementById('currentTimeText');
  const totalTimeText = document.getElementById('totalTimeText');
  const speedSelect = document.getElementById('speedSelect');
  const volumeSlider = document.getElementById('volumeSlider');
  const muteBtn = document.getElementById('muteBtn');
  const volumeHighIcon = document.getElementById('volumeHighIcon');
  const volumeMuteIcon = document.getElementById('volumeMuteIcon');
  const fullscreenBtn = document.getElementById('fullscreenBtn');

  // Global State
  let activeJobsMap = new Map(); // jobId -> jobObj
  let sseSources = new Map();   // jobId -> EventSource
  let pendingVideoToProcess = null;
  let currentPlayingVideo = null;
  let frameCache = new Map();   // frameIndex -> HTMLImageElement
  let animFrameId = null;
  let isCachingActive = false;
  let lastDrawnFrameIndex = 1;


  // ----------------------------------------------------
  // 1. Navigation Tab Switching
  // ----------------------------------------------------
  function switchTab(targetTabId) {
    navButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === targetTabId);
    });
    tabPanes.forEach(pane => {
      pane.classList.toggle('active', pane.id === targetTabId);
    });

    if (targetTabId === 'library-tab') {
      loadLibrary();
    }
  }

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  if (emptySearchBtn) {
    emptySearchBtn.addEventListener('click', () => switchTab('search-tab'));
  }

  // ----------------------------------------------------
  // 2. YouTube Search & Resolution Picker Logic
  // ----------------------------------------------------
  async function performSearch(query) {
    if (!query || !query.trim()) return;

    // Check if user pasted a direct YouTube URL
    const isUrl = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(query.trim());
    if (isUrl) {
      openResolutionPicker({
        url: query.trim(),
        title: 'Pasted YouTube URL',
        channel: 'YouTube Video',
        thumbnail: 'https://i.ytimg.com/vi/default/hqdefault.jpg'
      });
      return;
    }

    searchResultsSection.classList.add('hidden');
    searchLoader.classList.remove('hidden');
    searchResultsGrid.innerHTML = '';

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
      const data = await response.json();

      searchLoader.classList.add('hidden');
      if (data.error) {
        alert(`Search Error: ${data.error}`);
        return;
      }

      renderSearchResults(data.results || []);
    } catch (err) {
      searchLoader.classList.add('hidden');
      alert(`Search failed: ${err.message}`);
    }
  }

  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    performSearch(searchInput.value);
  });

  chipButtons.forEach(chip => {
    chip.addEventListener('click', () => {
      searchInput.value = chip.dataset.query;
      performSearch(chip.dataset.query);
    });
  });

  function renderSearchResults(results) {
    searchResultsCount.textContent = `${results.length} videos found`;
    searchResultsGrid.innerHTML = '';

    if (results.length === 0) {
      searchResultsGrid.innerHTML = '<p class="empty-text">No videos found. Try a different keyword.</p>';
      searchResultsSection.classList.remove('hidden');
      return;
    }

    results.forEach(video => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-media">
          <img src="${video.thumbnail}" alt="${escapeHtml(video.title)}" loading="lazy">
          <span class="res-tag">HD / 360p</span>
          <span class="duration-tag">${video.formattedDuration}</span>
        </div>
        <div class="card-body">
          <h4 class="card-title" title="${escapeHtml(video.title)}">${escapeHtml(video.title)}</h4>
          <div class="card-channel">${escapeHtml(video.channel)}</div>
          <div class="card-actions">
            <button class="btn btn-primary process-btn">
              ⚡ Process &amp; Save Video
            </button>
          </div>
        </div>
      `;

      const processBtn = card.querySelector('.process-btn');
      processBtn.addEventListener('click', () => {
        openResolutionPicker(video);
      });

      searchResultsGrid.appendChild(card);
    });

    searchResultsSection.classList.remove('hidden');
  }

  // ----------------------------------------------------
  // Resolution Picker Modal Handlers
  // ----------------------------------------------------
  function openResolutionPicker(video) {
    pendingVideoToProcess = video;
    resThumbImg.src = video.thumbnail || '';
    resVideoTitle.textContent = video.title || 'YouTube Video';
    resVideoChannel.textContent = video.channel || 'YouTube';
    resolutionModal.classList.remove('hidden');
  }

  function closeResolutionPicker() {
    resolutionModal.classList.add('hidden');
    pendingVideoToProcess = null;
  }

  closeResModalBtn.addEventListener('click', closeResolutionPicker);
  resModalOverlayClose.addEventListener('click', closeResolutionPicker);
  cancelResBtn.addEventListener('click', closeResolutionPicker);

  confirmProcessBtn.addEventListener('click', () => {
    if (!pendingVideoToProcess) return;

    const selectedResInput = document.querySelector('input[name="targetRes"]:checked');
    const resolution = selectedResInput ? selectedResInput.value : '360p';
    const fps = targetFpsSelect ? targetFpsSelect.value : '24';
    const videoUrl = pendingVideoToProcess.url;

    closeResolutionPicker();

    // Start background processing with selected options
    startProcessingVideo(videoUrl, resolution, fps);
  });

  // ----------------------------------------------------
  // 3. Process Video & SSE Progress Tracking
  // ----------------------------------------------------
  async function startProcessingVideo(videoUrl, resolution = '360p', fps = '24') {
    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl, resolution, fps })
      });

      const data = await response.json();
      if (data.error) {
        alert(`Failed to start processing: ${data.error}`);
        return;
      }

      // Switch UI tab to Tesla Saved Videos Library (DO NOT Auto-play!)
      switchTab('library-tab');

      // Connect SSE for this job
      connectJobSSE(data.jobId);
    } catch (err) {
      alert(`Error requesting video conversion: ${err.message}`);
    }
  }

  function connectJobSSE(jobId) {
    if (sseSources.has(jobId)) return;

    const eventSource = new EventSource(`/api/jobs/${jobId}/progress`);
    sseSources.set(jobId, eventSource);

    eventSource.onmessage = (event) => {
      try {
        const job = JSON.parse(event.data);
        activeJobsMap.set(jobId, job);
        updateQueueUI();

        if (job.status === 'completed' || job.status === 'error') {
          eventSource.close();
          sseSources.delete(jobId);
          if (job.status === 'completed') {
            loadLibrary();
          }
        }
      } catch (e) {
        console.error('Error parsing SSE message:', e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      sseSources.delete(jobId);
    };
  }

  function updateQueueUI() {
    const jobs = Array.from(activeJobsMap.values());
    const activeJobs = jobs.filter(j => j.status === 'processing' || j.status === 'queued' || j.status === 'error');

    if (activeJobs.length === 0) {
      if (activeProcessingSection) activeProcessingSection.classList.add('hidden');
      activeJobsContainer.innerHTML = '';
      return;
    }

    if (activeProcessingSection) activeProcessingSection.classList.remove('hidden');
    activeJobsContainer.innerHTML = '';

    activeJobs.forEach(job => {
      const card = document.createElement('div');
      card.className = 'job-card';

      const title = job.videoTitle || 'Processing Video...';
      const stage = job.stage || 'Initializing...';
      const percent = job.progress || 0;
      const resText = job.resolution ? `[${job.resolution} @ ${job.fps || 24}fps]` : '';

      card.innerHTML = `
        <div class="job-header">
          <div>
            <div class="job-title">${escapeHtml(title)} <span style="font-size: 0.8rem; color: var(--accent-cyan);">${resText}</span></div>
            <div class="job-stage">${escapeHtml(stage)}</div>
          </div>
          <div class="job-percent">${percent}%</div>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${percent}%;"></div>
        </div>
        ${job.status === 'error' ? `
          <div style="color: #ff5257; font-size: 0.85rem; margin-top: 6px;">Error: ${escapeHtml(job.error || 'Failed')}</div>
        ` : ''}
      `;

      activeJobsContainer.appendChild(card);
    });
  }

  // ----------------------------------------------------
  // 4. Tesla Library Management
  // ----------------------------------------------------
  async function loadLibrary() {
    try {
      const response = await fetch('/api/library');
      const data = await response.json();
      const library = data.library || [];

      libraryCount.textContent = library.length;
      renderLibraryGrid(library);
    } catch (err) {
      console.error('Failed to load library:', err);
    }
  }

  function renderLibraryGrid(library) {
    libraryGrid.innerHTML = '';

    if (library.length === 0) {
      libraryEmptyState.classList.remove('hidden');
      return;
    }

    libraryEmptyState.classList.add('hidden');

    library.forEach(video => {
      const card = document.createElement('div');
      card.className = 'card';

      card.innerHTML = `
        <div class="card-media">
          <img src="${video.thumbnailUrl}" alt="${escapeHtml(video.title)}">
          <span class="res-tag">${video.resolution || '360p'} Canvas</span>
          <span class="duration-tag">${video.formattedDuration}</span>
        </div>
        <div class="card-body">
          <h4 class="card-title">${escapeHtml(video.title)}</h4>
          <div class="card-channel">${escapeHtml(video.channel)}</div>
          <div class="card-meta">
            <span class="meta-pill">🎬 ${video.frameCount} Frames</span>
            <span class="meta-pill">⚡ ${video.fps} FPS</span>
            <span class="meta-pill">💾 ${video.totalSizeMB} MB</span>
          </div>
          <div class="card-actions" style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-primary play-lib-btn" style="flex: 1;">▶️ Play</button>
            <button class="btn btn-secondary offline-lib-btn" style="flex: 1;" title="Download 100% for Offline Driving">📥 Offline</button>
            <button class="btn btn-danger delete-lib-btn" style="width: auto; padding: 10px 14px;" title="Delete Video">🗑️</button>
          </div>
        </div>
      `;

      card.querySelector('.play-lib-btn').addEventListener('click', () => {
        openCanvasPlayer(video.id);
      });

      card.querySelector('.offline-lib-btn').addEventListener('click', () => {
        openCanvasPlayer(video.id).then(() => {
          downloadFullVideoOffline(video);
        });
      });

      card.querySelector('.delete-lib-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Delete "${video.title}" from server storage?`)) {
          await deleteVideoFromLibrary(video.id);
        }
      });

      libraryGrid.appendChild(card);
    });
  }

  async function deleteVideoFromLibrary(videoId) {
    try {
      await fetch(`/api/library/${videoId}`, { method: 'DELETE' });
      loadLibrary();
    } catch (err) {
      alert(`Failed to delete video: ${err.message}`);
    }
  }

  // ----------------------------------------------------
  // 5. Synchronized HTML5 Canvas Video Player & Sliding Window Engine
  // ----------------------------------------------------
  // Touch & Fullscreen Overlay Elements
  const canvasTouchOverlay = document.getElementById('canvasTouchOverlay');
  const touchPlayerTitle = document.getElementById('touchPlayerTitle');
  const touchPlayerChannel = document.getElementById('touchPlayerChannel');
  const exitFullscreenBtn = document.getElementById('exitFullscreenBtn');
  const touchClosePlayerBtn = document.getElementById('touchClosePlayerBtn');
  const touchPlayPauseBtn = document.getElementById('touchPlayPauseBtn');
  const touchPlayIcon = document.getElementById('touchPlayIcon');
  const touchPauseIcon = document.getElementById('touchPauseIcon');
  const touchRewindBtn = document.getElementById('touchRewindBtn');
  const touchForwardBtn = document.getElementById('touchForwardBtn');
  const fullscreenExpandIcon = document.getElementById('fullscreenExpandIcon');
  const fullscreenCompressIcon = document.getElementById('fullscreenCompressIcon');

  // Preloading & Memory Management Constants
  const WINDOW_BEHIND = 40;  // Keep 40 frames behind playhead (~1.5s)
  const WINDOW_AHEAD = 180;  // Keep 180 frames ahead of playhead (~7.5s buffer)
  const MAX_CONCURRENT_FETCHES = 6; // Bounded concurrency queue to prevent network choking

  let activeFetchCount = 0;
  let fetchQueue = [];
  let pendingFetchSet = new Set();
  let preCacheAbortController = null;
  let lastPreloadCenterFrame = -1;
  let lastPreloadTimestamp = 0;
  let controlsTimeout = null;
  let cachedAudioObjectUrl = null;

  async function openCanvasPlayer(videoId) {
    try {
      const response = await fetch(`/api/library/${videoId}`);
      if (!response.ok) throw new Error('Video details not found');
      const video = await response.json();

      currentPlayingVideo = video;
      clearFrameCacheMemory();

      // Set Canvas Dimensions
      teslaCanvas.width = video.width || 640;
      teslaCanvas.height = video.height || 360;

      // Set Metadata UI
      playerTitle.textContent = video.title;
      playerChannel.textContent = video.channel;
      if (touchPlayerTitle) touchPlayerTitle.textContent = video.title;
      if (touchPlayerChannel) touchPlayerChannel.textContent = video.channel;
      playerResBadge.textContent = video.resolution || '360p';
      playerFpsBadge.textContent = `${video.fps} FPS`;
      playerFramesBadge.textContent = `0 / ${video.frameCount} Frames`;
      totalTimeText.textContent = video.formattedDuration;
      scrubberBuffer.style.width = '0%';

      // Set Audio Source
      teslaAudio.src = video.audioUrl;
      teslaAudio.playbackRate = parseFloat(speedSelect.value);
      teslaAudio.volume = parseFloat(volumeSlider.value);

      // Show Modal & Pre-Cache Screen
      playerModal.classList.remove('hidden');
      preCacheScreen.classList.remove('hidden');
      showControls();
      startPlayNowBtn.disabled = true;
      startPlayNowBtn.innerHTML = '▶️ Start Playing (Buffering...)';

      // Start Browser Frame Pre-Caching Pipeline
      startFramePreCachePipeline(video);

    } catch (err) {
      alert(`Error loading video player: ${err.message}`);
    }
  }

  function clearFrameCacheMemory() {
    for (const [key, img] of frameCache.entries()) {
      if (img) {
        img.onload = null;
        img.onerror = null;
        img.src = '';
      }
    }
    frameCache.clear();
    pendingFetchSet.clear();
    fetchQueue = [];
    activeFetchCount = 0;
    lastDrawnFrameIndex = -1;
    lastPreloadCenterFrame = -1;
  }

  function closeCanvasPlayer() {
    exitFullscreen();
    if (preCacheAbortController) preCacheAbortController.abort();
    teslaAudio.pause();
    if (animFrameId) cancelAnimationFrame(animFrameId);
    playerModal.classList.add('hidden');
    clearFrameCacheMemory();
    currentPlayingVideo = null;
    if (controlsTimeout) clearTimeout(controlsTimeout);
  }

  closePlayerBtn.addEventListener('click', closeCanvasPlayer);
  if (touchClosePlayerBtn) touchClosePlayerBtn.addEventListener('click', closeCanvasPlayer);
  playerOverlayClose.addEventListener('click', closeCanvasPlayer);

  // ----------------------------------------------------
  // Fullscreen & Minimize Touch Overlay Management
  // ----------------------------------------------------
  function toggleFullscreen() {
    const isFS = document.fullscreenElement || document.webkitFullscreenElement || canvasWrapper.classList.contains('is-fullscreen');
    if (isFS) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }

  function enterFullscreen() {
    canvasWrapper.classList.add('is-fullscreen');
    if (canvasWrapper.requestFullscreen) {
      canvasWrapper.requestFullscreen().catch(() => {});
    } else if (canvasWrapper.webkitRequestFullscreen) {
      canvasWrapper.webkitRequestFullscreen().catch(() => {});
    }
    updateFullscreenUI(true);
  }

  function exitFullscreen() {
    canvasWrapper.classList.remove('is-fullscreen');
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen().catch(() => {});
      }
    }
    updateFullscreenUI(false);
  }

  function updateFullscreenUI(isFullscreenActive) {
    if (fullscreenExpandIcon && fullscreenCompressIcon) {
      if (isFullscreenActive) {
        fullscreenExpandIcon.classList.add('hidden');
        fullscreenCompressIcon.classList.remove('hidden');
      } else {
        fullscreenExpandIcon.classList.remove('hidden');
        fullscreenCompressIcon.classList.add('hidden');
      }
    }
    showControls();
  }

  if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);
  if (exitFullscreenBtn) exitFullscreenBtn.addEventListener('click', exitFullscreen);

  document.addEventListener('fullscreenchange', () => {
    const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (!isFS) canvasWrapper.classList.remove('is-fullscreen');
    updateFullscreenUI(isFS);
  });
  document.addEventListener('webkitfullscreenchange', () => {
    const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (!isFS) canvasWrapper.classList.remove('is-fullscreen');
    updateFullscreenUI(isFS);
  });

  // Touch & Auto-Hide Control Overlay
  function showControls() {
    if (canvasTouchOverlay) {
      canvasTouchOverlay.classList.remove('controls-hidden');
    }
    if (controlsTimeout) clearTimeout(controlsTimeout);

    if (!teslaAudio.paused) {
      controlsTimeout = setTimeout(() => {
        if (!teslaAudio.paused && canvasTouchOverlay) {
          canvasTouchOverlay.classList.add('controls-hidden');
        }
      }, 3500);
    }
  }

  function hideControls() {
    if (!teslaAudio.paused && canvasTouchOverlay) {
      canvasTouchOverlay.classList.add('controls-hidden');
    }
  }

  if (canvasWrapper) {
    canvasWrapper.addEventListener('mousemove', showControls);
    canvasWrapper.addEventListener('touchstart', showControls, { passive: true });
    canvasWrapper.addEventListener('pointerdown', showControls, { passive: true });
    canvasWrapper.addEventListener('dblclick', toggleFullscreen);
  }

  // ----------------------------------------------------
  // High-Performance Sliding Window & 100% Offline Engine
  // ----------------------------------------------------
  const offlineBlobMap = new Map(); // videoId -> Map(frameIndex -> objectUrl)
  const isOfflineDownloadingMap = new Map(); // videoId -> boolean
  const downloadOfflineBtn = document.getElementById('downloadOfflineBtn');

  async function cacheFullAudio(audioUrl) {
    try {
      const response = await fetch(audioUrl);
      if (!response.ok) return;
      const blob = await response.blob();
      if (cachedAudioObjectUrl) {
        URL.revokeObjectURL(cachedAudioObjectUrl);
      }
      cachedAudioObjectUrl = URL.createObjectURL(blob);
      const currentTime = teslaAudio.currentTime || 0;
      const isPlaying = !teslaAudio.paused;
      teslaAudio.src = cachedAudioObjectUrl;
      teslaAudio.currentTime = currentTime;
      if (isPlaying) teslaAudio.play().catch(() => {});
    } catch (e) {
      console.warn('Audio offline pre-cache fallback:', e);
    }
  }

  async function downloadFullVideoOffline(video, autoPlayWhenDone = false) {
    if (!video || !video.id) return;
    const videoId = video.id;

    if (isOfflineDownloadingMap.get(videoId)) {
      return;
    }

    isOfflineDownloadingMap.set(videoId, true);

    if (!offlineBlobMap.has(videoId)) {
      offlineBlobMap.set(videoId, new Map());
    }
    const frameBlobStore = offlineBlobMap.get(videoId);

    // Update Modal UI
    const heading = document.getElementById('cacheModalHeading');
    const subtext = document.getElementById('cacheModalSubtext');
    if (heading) heading.textContent = '📥 Downloading Video 100% Offline...';
    if (subtext) subtext.textContent = 'Pre-loading audio and all frame images into browser memory. No cellular internet will be needed while driving.';
    
    preCacheScreen.classList.remove('hidden');

    try {
      // 1. Download Full Audio Track
      if (cacheStageText) cacheStageText.textContent = 'Downloading audio track...';
      await cacheFullAudio(video.audioUrl);

      // 2. Open Cache API for persistent storage if available
      let cache = null;
      if ('caches' in window) {
        try {
          cache = await caches.open(`tesla-offline-${videoId}`);
        } catch (e) {
          console.warn('Cache API warning:', e);
        }
      }

      // 3. Batch Download All Frames (Concurrency = 12)
      const totalFrames = video.frameCount;
      let downloadedCount = frameBlobStore.size;
      const batchSize = 12;

      for (let i = 1; i <= totalFrames; i += batchSize) {
        if (currentPlayingVideo && currentPlayingVideo.id !== videoId) break;

        const promises = [];
        for (let j = i; j < Math.min(totalFrames + 1, i + batchSize); j++) {
          if (frameBlobStore.has(j)) {
            downloadedCount++;
            continue;
          }

          const frameNumStr = String(j).padStart(5, '0');
          const frameUrl = `/api/library/${videoId}/frames/frame_${frameNumStr}.jpg`;

          promises.push((async () => {
            try {
              let response = cache ? await cache.match(frameUrl) : null;
              if (!response) {
                response = await fetch(frameUrl);
                if (cache && response.ok) {
                  cache.put(frameUrl, response.clone()).catch(() => {});
                }
              }
              if (response && response.ok) {
                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                frameBlobStore.set(j, objectUrl);
                downloadedCount++;
              }
            } catch (err) {
              console.warn(`Frame ${j} offline fetch warning:`, err);
            }
          })());
        }

        if (promises.length > 0) {
          await Promise.all(promises);
          const percent = Math.min(100, Math.round((downloadedCount / totalFrames) * 100));
          if (cachePercentText) cachePercentText.textContent = `${percent}%`;
          if (cacheProgressBar) cacheProgressBar.style.width = `${percent}%`;
          if (cacheStageText) cacheStageText.textContent = `Offline downloaded ${downloadedCount} / ${totalFrames} frames (${percent}%)`;
        }
      }

      isOfflineDownloadingMap.set(videoId, false);

      if (downloadedCount >= Math.min(30, totalFrames)) {
        startPlayNowBtn.disabled = false;
        startPlayNowBtn.innerHTML = '▶️ Play Video (100% Offline Ready)';
        playerCacheBadge.textContent = '🟢 100% Offline Ready';
        playerCacheBadge.style.backgroundColor = 'var(--accent-green)';
      }

      if (autoPlayWhenDone) {
        preCacheScreen.classList.add('hidden');
        togglePlayPause();
      }

    } catch (err) {
      isOfflineDownloadingMap.set(videoId, false);
      console.error('Offline download failed:', err);
    }
  }

  if (downloadOfflineBtn) {
    downloadOfflineBtn.addEventListener('click', () => {
      if (currentPlayingVideo) {
        downloadFullVideoOffline(currentPlayingVideo);
      }
    });
  }

  if (cacheModeSelect) {
    cacheModeSelect.addEventListener('change', () => {
      if (cacheModeSelect.value === 'full-offline' && currentPlayingVideo) {
        downloadFullVideoOffline(currentPlayingVideo);
      }
    });
  }

  function fetchSingleFrame(frameIndex, videoId = currentPlayingVideo?.id) {
    if (!videoId) return Promise.resolve(null);
    if (frameCache.has(frameIndex)) return Promise.resolve(frameCache.get(frameIndex));

    return new Promise((resolve) => {
      const img = new Image();

      // Priority 1: Use 100% offline downloaded blob objectUrl
      const offlineStore = offlineBlobMap.get(videoId);
      if (offlineStore && offlineStore.has(frameIndex)) {
        img.src = offlineStore.get(frameIndex);
      } else {
        const frameNumStr = String(frameIndex).padStart(5, '0');
        img.src = `/api/library/${videoId}/frames/frame_${frameNumStr}.jpg`;
      }

      // 5 second safety timeout to prevent hanging fetches
      const timeoutId = setTimeout(() => {
        img.onload = null;
        img.onerror = null;
        resolve(null);
      }, 5000);

      img.onload = () => {
        clearTimeout(timeoutId);
        frameCache.set(frameIndex, img);
        if (img.decode) {
          img.decode().catch(() => {});
        }
        resolve(img);
      };
      img.onerror = () => {
        clearTimeout(timeoutId);
        resolve(null);
      };
    });
  }

  function processFetchQueue() {
    while (activeFetchCount < MAX_CONCURRENT_FETCHES && fetchQueue.length > 0) {
      const frameIndex = fetchQueue.shift();

      if (frameCache.has(frameIndex)) {
        pendingFetchSet.delete(frameIndex);
        continue;
      }

      activeFetchCount++;
      fetchSingleFrame(frameIndex)
        .then(() => {
          activeFetchCount--;
          pendingFetchSet.delete(frameIndex); // ONLY remove from pending set when HTTP request finishes!
          updateCacheProgressUI();
          processFetchQueue();
        })
        .catch(() => {
          activeFetchCount--;
          pendingFetchSet.delete(frameIndex);
          processFetchQueue();
        });
    }
  }

  function preloadSlidingWindow(centerFrame) {
    if (!currentPlayingVideo) return;

    const now = Date.now();
    // Throttle check to avoid main thread churn
    if (centerFrame === lastPreloadCenterFrame && now - lastPreloadTimestamp < 150) {
      return;
    }
    lastPreloadCenterFrame = centerFrame;
    lastPreloadTimestamp = now;

    const totalFrames = currentPlayingVideo.frameCount;
    const minKeep = Math.max(1, centerFrame - WINDOW_BEHIND);
    const maxKeep = Math.min(totalFrames, centerFrame + WINDOW_AHEAD + 30);

    // Evict old frames to prevent GPU memory bloat & stutter
    for (const key of frameCache.keys()) {
      if (key < minKeep || key > maxKeep) {
        const oldImg = frameCache.get(key);
        if (oldImg) {
          oldImg.onload = null;
          oldImg.onerror = null;
          oldImg.src = '';
        }
        frameCache.delete(key);
      }
    }

    // Urgent Priority: If center frame is missing, prioritize it immediately
    if (!frameCache.has(centerFrame) && !pendingFetchSet.has(centerFrame)) {
      pendingFetchSet.add(centerFrame);
      fetchQueue.unshift(centerFrame);
    }

    // Queue upcoming window frames
    const endFrame = Math.min(totalFrames, centerFrame + WINDOW_AHEAD);
    for (let i = centerFrame; i <= endFrame; i++) {
      if (!frameCache.has(i) && !pendingFetchSet.has(i)) {
        pendingFetchSet.add(i);
        fetchQueue.push(i);
      }
    }

    processFetchQueue();
  }

  function updateCacheProgressUI() {
    if (!currentPlayingVideo) return;
    const totalFrames = currentPlayingVideo.frameCount;
    const cachedCount = frameCache.size;
    const targetBuffer = Math.min(WINDOW_AHEAD, totalFrames);
    const percent = Math.min(100, Math.round((cachedCount / targetBuffer) * 100));

    if (cachePercentText) cachePercentText.textContent = `${percent}%`;
    if (cacheProgressBar) cacheProgressBar.style.width = `${percent}%`;

    if (cachedCount >= 30 || percent >= 100) {
      startPlayNowBtn.disabled = false;
      startPlayNowBtn.innerHTML = '▶️ Play Video (Buffer Ready)';
      if (cacheStageText) cacheStageText.textContent = `⚡ Sliding Window Buffer Active (${cachedCount} frames in RAM)`;
      playerCacheBadge.textContent = `🟢 Stream Active`;
      playerCacheBadge.style.backgroundColor = 'var(--accent-green)';
    } else {
      if (cacheStageText) cacheStageText.textContent = `Buffering initial frames: ${cachedCount} / 30`;
      playerCacheBadge.textContent = `Buffering: ${percent}%`;
      playerCacheBadge.style.backgroundColor = '';
    }

    // Scrubber buffer calculation
    const maxFrameInCache = frameCache.size > 0 ? Math.max(...Array.from(frameCache.keys())) : 0;
    const fps = currentPlayingVideo.fps || 24;
    const bufferedSec = maxFrameInCache / fps;
    const duration = teslaAudio.duration || currentPlayingVideo.duration || 1;
    const bufferPercent = Math.min(100, Math.round((bufferedSec / duration) * 100));
    scrubberBuffer.style.width = `${bufferPercent}%`;
  }

  async function startFramePreCachePipeline(video) {
    clearFrameCacheMemory();

    // Cache audio in browser storage/blob if possible
    cacheFullAudio(video.audioUrl);

    // Load initial 30 frames immediately
    const initialPromises = [];
    for (let i = 1; i <= Math.min(30, video.frameCount); i++) {
      initialPromises.push(fetchSingleFrame(i, video.id));
    }

    await Promise.all(initialPromises);

    if (frameCache.has(1)) {
      renderCanvasFrame(1);
    }

    updateCacheProgressUI();
    preloadSlidingWindow(1);
  }

  // Handle "Start Playing" button on Pre-Cache screen
  startPlayNowBtn.addEventListener('click', () => {
    preCacheScreen.classList.add('hidden');
    if (frameCache.has(1)) {
      renderCanvasFrame(1);
    }
    togglePlayPause();
  });

  // Canvas Render Frame Function (with Fallback to last drawn frame)
  function renderCanvasFrame(targetFrame) {
    if (!currentPlayingVideo) return;
    if (targetFrame === lastDrawnFrameIndex) return; // Skip redundant draw operations!

    let img = frameCache.get(targetFrame);

    // Fallback: If exact frame is loading, search backwards for closest loaded frame
    if (!img || !img.complete) {
      for (let offset = 1; offset <= 30; offset++) {
        const prevImg = frameCache.get(targetFrame - offset);
        if (prevImg && prevImg.complete) {
          img = prevImg;
          break;
        }
      }
    }

    if (img && img.complete) {
      canvasCtx.drawImage(img, 0, 0, teslaCanvas.width, teslaCanvas.height);
      lastDrawnFrameIndex = targetFrame;
    }
  }

  // Animation Render Loop (Synchronized with HTML5 Audio)
  function startPlaybackLoop() {
    if (animFrameId) cancelAnimationFrame(animFrameId);

    function loop() {
      if (!currentPlayingVideo || teslaAudio.paused || teslaAudio.ended) {
        return;
      }

      const currentTime = teslaAudio.currentTime;
      const fps = currentPlayingVideo.fps || 24;
      const currentFrame = Math.min(
        currentPlayingVideo.frameCount,
        Math.floor(currentTime * fps) + 1
      );

      // Render frame & update controls UI
      renderCanvasFrame(currentFrame);
      updatePlayerUIControls(currentTime, currentFrame);

      // Pre-fetch upcoming sliding window
      preloadSlidingWindow(currentFrame);

      animFrameId = requestAnimationFrame(loop);
    }

    animFrameId = requestAnimationFrame(loop);
  }

  function updatePlayerUIControls(currentTime, currentFrame) {
    if (!currentPlayingVideo) return;

    const duration = teslaAudio.duration || currentPlayingVideo.duration || 1;
    const percent = (currentTime / duration) * 100;

    canvasScrubber.value = percent;
    scrubberProgress.style.width = `${percent}%`;
    currentTimeText.textContent = formatDuration(currentTime);
    playerFramesBadge.textContent = `${currentFrame || lastDrawnFrameIndex} / ${currentPlayingVideo.frameCount} Frames`;
  }

  // Audio Event Listeners for Automatic Canvas Loop Sync
  teslaAudio.addEventListener('play', () => {
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
    if (touchPlayIcon) touchPlayIcon.classList.add('hidden');
    if (touchPauseIcon) touchPauseIcon.classList.remove('hidden');
    showControls();
    startPlaybackLoop();
  });

  teslaAudio.addEventListener('pause', () => {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    if (touchPlayIcon) touchPlayIcon.classList.remove('hidden');
    if (touchPauseIcon) touchPauseIcon.classList.add('hidden');
    showControls();
    if (animFrameId) cancelAnimationFrame(animFrameId);
  });

  teslaAudio.addEventListener('seeking', () => {
    if (!currentPlayingVideo) return;
    const currentTime = teslaAudio.currentTime;
    const fps = currentPlayingVideo.fps || 24;
    const targetFrame = Math.min(currentPlayingVideo.frameCount, Math.floor(currentTime * fps) + 1);

    preloadSlidingWindow(targetFrame);
    renderCanvasFrame(targetFrame);
    updatePlayerUIControls(currentTime, targetFrame);
  });

  // Player Controls Event Listeners
  function togglePlayPause() {
    if (teslaAudio.paused) {
      teslaAudio.play().catch(err => console.error('Audio play error:', err));
    } else {
      teslaAudio.pause();
    }
  }

  playPauseBtn.addEventListener('click', togglePlayPause);
  if (touchPlayPauseBtn) touchPlayPauseBtn.addEventListener('click', togglePlayPause);

  // Scrubber Seeking
  canvasScrubber.addEventListener('input', () => {
    if (!currentPlayingVideo) return;
    const duration = teslaAudio.duration || currentPlayingVideo.duration || 1;
    const targetTime = (canvasScrubber.value / 100) * duration;
    teslaAudio.currentTime = targetTime;

    const fps = currentPlayingVideo.fps || 24;
    const targetFrame = Math.min(currentPlayingVideo.frameCount, Math.floor(targetTime * fps) + 1);
    
    fetchSingleFrame(targetFrame).then(() => {
      renderCanvasFrame(targetFrame);
    });
    updatePlayerUIControls(targetTime, targetFrame);
  });

  // Rewind & Forward buttons (5s and 10s)
  rewindBtn.addEventListener('click', () => {
    teslaAudio.currentTime = Math.max(0, teslaAudio.currentTime - 5);
  });

  forwardBtn.addEventListener('click', () => {
    teslaAudio.currentTime = Math.min(teslaAudio.duration || 0, teslaAudio.currentTime + 5);
  });

  if (touchRewindBtn) {
    touchRewindBtn.addEventListener('click', () => {
      teslaAudio.currentTime = Math.max(0, teslaAudio.currentTime - 10);
    });
  }

  if (touchForwardBtn) {
    touchForwardBtn.addEventListener('click', () => {
      teslaAudio.currentTime = Math.min(teslaAudio.duration || 0, teslaAudio.currentTime + 10);
    });
  }

  // Speed Selector
  speedSelect.addEventListener('change', () => {
    teslaAudio.playbackRate = parseFloat(speedSelect.value);
  });

  // Volume & Mute
  volumeSlider.addEventListener('input', () => {
    teslaAudio.volume = parseFloat(volumeSlider.value);
    updateVolumeIcon();
  });

  muteBtn.addEventListener('click', () => {
    teslaAudio.muted = !teslaAudio.muted;
    updateVolumeIcon();
  });

  function updateVolumeIcon() {
    if (teslaAudio.muted || teslaAudio.volume === 0) {
      volumeHighIcon.classList.add('hidden');
      volumeMuteIcon.classList.remove('hidden');
    } else {
      volumeHighIcon.classList.remove('hidden');
      volumeMuteIcon.classList.add('hidden');
    }
  }

  // Keyboard Shortcuts (Space to play/pause, Left/Right arrows to seek, Esc to exit fullscreen or close player)
  document.addEventListener('keydown', (e) => {
    if (playerModal.classList.contains('hidden')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      teslaAudio.currentTime = Math.max(0, teslaAudio.currentTime - 5);
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      teslaAudio.currentTime = Math.min(teslaAudio.duration || 0, teslaAudio.currentTime + 5);
    } else if (e.code === 'Escape') {
      const isFS = document.fullscreenElement || document.webkitFullscreenElement || canvasWrapper.classList.contains('is-fullscreen');
      if (isFS) {
        exitFullscreen();
      } else {
        closeCanvasPlayer();
      }
    }
  });

  function showBuffering(show, text = 'Buffering Frames...') {
    if (show) {
      if (bufferingText) bufferingText.textContent = text;
      canvasBuffering.classList.remove('hidden');
    } else {
      canvasBuffering.classList.add('hidden');
    }
  }

  // Utilities
  function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const sec = Math.floor(seconds);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(m)}:${pad(s)}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Initial Load
  loadLibrary();
});
