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
    const activeJobs = jobs.filter(j => j.status === 'processing' || j.status === 'queued');

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
          <span class="res-tag">360p Canvas</span>
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
          <div class="card-actions">
            <button class="btn btn-primary play-lib-btn">▶️ Play on Canvas</button>
            <button class="btn btn-danger delete-lib-btn" title="Delete Video">🗑️</button>
          </div>
        </div>
      `;

      card.querySelector('.play-lib-btn').addEventListener('click', () => {
        openCanvasPlayer(video.id);
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

  // Pre-Cache Controller Variables
  let preCacheAbortController = null;

  // ----------------------------------------------------
  // 5. Synchronized HTML5 Canvas Video Player & Pre-Cache Engine
  // ----------------------------------------------------
  async function openCanvasPlayer(videoId) {
    try {
      const response = await fetch(`/api/library/${videoId}`);
      if (!response.ok) throw new Error('Video details not found');
      const video = await response.json();

      currentPlayingVideo = video;
      frameCache.clear();

      // Set Canvas Dimensions
      teslaCanvas.width = video.width || 640;
      teslaCanvas.height = video.height || 360;

      // Set Metadata UI
      playerTitle.textContent = video.title;
      playerChannel.textContent = video.channel;
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
      canvasPlayOverlay.classList.add('hidden');
      startPlayNowBtn.disabled = true;
      startPlayNowBtn.innerHTML = '▶️ Start Playing (Buffering...)';

      // Start Browser Frame Pre-Caching
      startFramePreCachePipeline(video);

    } catch (err) {
      alert(`Error loading video player: ${err.message}`);
    }
  }

  function closeCanvasPlayer() {
    isCachingActive = false;
    if (preCacheAbortController) preCacheAbortController.abort();
    teslaAudio.pause();
    if (animFrameId) cancelAnimationFrame(animFrameId);
    playerModal.classList.add('hidden');
    frameCache.clear();
    currentPlayingVideo = null;
  }

  closePlayerBtn.addEventListener('click', closeCanvasPlayer);
  playerOverlayClose.addEventListener('click', closeCanvasPlayer);

  // ----------------------------------------------------
  // High-Performance Non-Blocking Sliding-Window Preloader
  // ----------------------------------------------------
  const PRELOAD_WINDOW = 120; // Keep 120 frames (~5 seconds) buffered ahead
  let activePreloadQueue = new Set();

  function preloadWindowAhead(centerFrame) {
    if (!currentPlayingVideo) return;

    const totalFrames = currentPlayingVideo.frameCount;
    const endFrame = Math.min(totalFrames, centerFrame + PRELOAD_WINDOW);

    // Prune old frames to conserve browser RAM (< centerFrame - 40)
    const minKeepIndex = Math.max(1, centerFrame - 40);
    for (const key of frameCache.keys()) {
      if (key < minKeepIndex || key > endFrame + 60) {
        frameCache.delete(key);
      }
    }

    // High priority fetch for upcoming window
    for (let i = centerFrame; i <= endFrame; i++) {
      if (!frameCache.has(i) && !activePreloadQueue.has(i)) {
        activePreloadQueue.add(i);
        fetchSingleFrame(i, currentPlayingVideo.id).then(() => {
          activePreloadQueue.delete(i);
          updateCacheProgressUI();
        });
      }
    }
  }

  function fetchSingleFrame(frameIndex, videoId = currentPlayingVideo?.id) {
    if (!videoId) return Promise.resolve(null);
    if (frameCache.has(frameIndex)) return Promise.resolve(frameCache.get(frameIndex));

    return new Promise((resolve) => {
      const img = new Image();
      const frameNumStr = String(frameIndex).padStart(5, '0');
      img.src = `/api/library/${videoId}/frames/frame_${frameNumStr}.jpg`;

      img.onload = () => {
        frameCache.set(frameIndex, img);
        resolve(img);
      };
      img.onerror = () => {
        resolve(null);
      };
    });
  }

  function updateCacheProgressUI() {
    if (!currentPlayingVideo) return;
    const totalFrames = currentPlayingVideo.frameCount;
    const cachedCount = frameCache.size;
    const percent = Math.min(100, Math.round((cachedCount / Math.min(totalFrames, PRELOAD_WINDOW)) * 100));

    cachePercentText.textContent = `${percent}%`;
    cacheProgressBar.style.width = `${percent}%`;
    cacheStageText.textContent = `Buffered ${cachedCount} frames ahead`;
    playerCacheBadge.textContent = `Cache: ${percent}%`;

    // Calculate actual buffer percentage for scrubber bar
    const maxFrameInCache = frameCache.size > 0 ? Math.max(...Array.from(frameCache.keys())) : 0;
    const fps = currentPlayingVideo.fps || 24;
    const bufferedSec = maxFrameInCache / fps;
    const duration = teslaAudio.duration || currentPlayingVideo.duration || 1;
    const bufferPercent = Math.min(100, Math.round((bufferedSec / duration) * 100));
    scrubberBuffer.style.width = `${bufferPercent}%`;

    // Enable play button as soon as initial 30 frames are loaded
    if (cachedCount >= 30 || percent >= 50) {
      startPlayNowBtn.disabled = false;
      startPlayNowBtn.innerHTML = '▶️ Play Video';
    }
  }

  async function startFramePreCachePipeline(video) {
    frameCache.clear();
    activePreloadQueue.clear();

    // Load initial 60 frames immediately
    const firstBatch = [];
    for (let i = 1; i <= Math.min(60, video.frameCount); i++) {
      firstBatch.push(fetchSingleFrame(i, video.id));
    }

    await Promise.all(firstBatch);

    // Check if initial frame loaded successfully
    if (!frameCache.has(1) && video.frameCount > 0) {
      cacheStageText.textContent = '⚠️ Video files missing from server disk. Please process video from search.';
      cachePercentText.textContent = 'Error';
      startPlayNowBtn.disabled = true;
      startPlayNowBtn.innerHTML = '⚠️ Video Files Missing on Server';
      return;
    }

    if (frameCache.has(1)) {
      renderCanvasFrame(1);
    }

    updateCacheProgressUI();
    preloadWindowAhead(1);
  }

  // Handle "Start Playing" button on Pre-Cache screen
  startPlayNowBtn.addEventListener('click', () => {
    preCacheScreen.classList.add('hidden');
    canvasPlayOverlay.classList.remove('hidden');
    if (frameCache.has(1)) {
      renderCanvasFrame(1);
    }
  });

  // Canvas Render Frame Function (with Fallback to last drawn frame)
  function renderCanvasFrame(targetFrame) {
    if (!currentPlayingVideo) return;

    let img = frameCache.get(targetFrame);

    // Fallback: If exact frame is loading, search backwards for closest loaded frame
    if (!img || !img.complete) {
      for (let offset = 1; offset <= 10; offset++) {
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
      preloadWindowAhead(currentFrame);

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
    canvasPlayOverlay.classList.add('hidden');
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
    startPlaybackLoop();
  });

  teslaAudio.addEventListener('pause', () => {
    canvasPlayOverlay.classList.remove('hidden');
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    if (animFrameId) cancelAnimationFrame(animFrameId);
  });

  teslaAudio.addEventListener('seeking', () => {
    if (!currentPlayingVideo) return;
    const currentTime = teslaAudio.currentTime;
    const fps = currentPlayingVideo.fps || 24;
    const targetFrame = Math.min(currentPlayingVideo.frameCount, Math.floor(currentTime * fps) + 1);

    preloadWindowAhead(targetFrame);
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
  canvasPlayOverlay.addEventListener('click', togglePlayPause);

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

  // Rewind & Forward 5 seconds
  rewindBtn.addEventListener('click', () => {
    teslaAudio.currentTime = Math.max(0, teslaAudio.currentTime - 5);
  });

  forwardBtn.addEventListener('click', () => {
    teslaAudio.currentTime = Math.min(teslaAudio.duration || 0, teslaAudio.currentTime + 5);
  });

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

  // Fullscreen Canvas Toggle
  fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      if (canvasWrapper.requestFullscreen) {
        canvasWrapper.requestFullscreen();
      } else if (canvasWrapper.webkitRequestFullscreen) {
        canvasWrapper.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  });

  // Keyboard Shortcuts (Space to play/pause, Left/Right arrows to seek)
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
      closeCanvasPlayer();
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
