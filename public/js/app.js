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
  // Ultra-Smooth Zero-Stutter Frame Decoder Engine (ImageBitmap + Concurrency Queue)
  // ----------------------------------------------------
  const MAX_CONCURRENT_FETCHES = 6;
  let currentActiveFetches = 0;
  const fetchQueue = [];

  function processFetchQueue() {
    while (currentActiveFetches < MAX_CONCURRENT_FETCHES && fetchQueue.length > 0) {
      const task = fetchQueue.shift();
      currentActiveFetches++;
      task().finally(() => {
        currentActiveFetches--;
        processFetchQueue();
      });
    }
  }

  function clearFrameCache() {
    for (const [key, value] of frameCache.entries()) {
      if (value && typeof value.close === 'function') {
        try { value.close(); } catch (e) {}
      }
    }
    frameCache.clear();
    fetchQueue.length = 0;
  }

  function fetchSingleFrame(frameIndex, videoId = currentPlayingVideo?.id) {
    if (!videoId) return Promise.resolve(null);
    if (frameCache.has(frameIndex)) return Promise.resolve(frameCache.get(frameIndex));

    return new Promise((resolve) => {
      fetchQueue.push(async () => {
        try {
          const frameNumStr = String(frameIndex).padStart(5, '0');
          const response = await fetch(`/api/library/${videoId}/frames/frame_${frameNumStr}.jpg`);
          if (!response.ok) {
            resolve(null);
            return;
          }
          const blob = await response.blob();
          let bitmap = null;
          try {
            if (window.createImageBitmap) {
              bitmap = await createImageBitmap(blob);
            }
          } catch (e) {
            bitmap = null;
          }

          if (!bitmap) {
            bitmap = await new Promise((res) => {
              const img = new Image();
              const objectUrl = URL.createObjectURL(blob);
              img.src = objectUrl;
              img.onload = () => {
                res(img);
              };
              img.onerror = () => {
                res(null);
              };
            });
          }

          if (bitmap) {
            frameCache.set(frameIndex, bitmap);
          }
          updateCacheProgressUI();
          resolve(bitmap);
        } catch (e) {
          resolve(null);
        }
      });
      processFetchQueue();
    });
  }

  function getCacheModeTargetFrames() {
    if (!currentPlayingVideo) return 0;
    const totalFrames = currentPlayingVideo.frameCount;
    const fps = currentPlayingVideo.fps || 24;
    const mode = cacheModeSelect ? cacheModeSelect.value : 'medium';

    if (mode === 'full') {
      return totalFrames;
    } else if (mode === 'medium') {
      // 5.5 minutes = 330 seconds
      const mediumTarget = Math.round(fps * 330);
      return Math.min(totalFrames, mediumTarget);
    } else {
      // quick mode = 30 seconds
      const quickTarget = Math.round(fps * 30);
      return Math.min(totalFrames, quickTarget);
    }
  }

  function preloadWindowAhead(centerFrame) {
    if (!currentPlayingVideo) return;

    const totalFrames = currentPlayingVideo.frameCount;
    const targetCount = getCacheModeTargetFrames();
    const mode = cacheModeSelect ? cacheModeSelect.value : 'medium';

    if (mode === 'full' || mode === 'medium') {
      fetchFramesUpToTarget(targetCount);
    } else {
      // Quick Mode: Keep 120 frame window ahead and prune old frames
      const endFrame = Math.min(totalFrames, centerFrame + 120);
      const minKeepIndex = Math.max(1, centerFrame - 40);
      for (const key of frameCache.keys()) {
        if (key < minKeepIndex || key > endFrame + 60) {
          frameCache.delete(key);
        }
      }

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
  }

  async function fetchFramesUpToTarget(targetCount) {
    if (!currentPlayingVideo || isFullOfflineCacheDone) return;

    const totalFrames = Math.min(currentPlayingVideo.frameCount, targetCount);
    const batchSize = 12;

    for (let i = 1; i <= totalFrames; i += batchSize) {
      if (!currentPlayingVideo) break;
      const batchPromises = [];
      for (let j = i; j < Math.min(totalFrames + 1, i + batchSize); j++) {
        if (!frameCache.has(j) && !activePreloadQueue.has(j)) {
          activePreloadQueue.add(j);
          batchPromises.push(
            fetchSingleFrame(j, currentPlayingVideo.id).then(() => {
              activePreloadQueue.delete(j);
            })
          );
        }
      }
      if (batchPromises.length > 0) {
        await Promise.all(batchPromises);
        updateCacheProgressUI();
      }
    }
  }

  function updateCacheProgressUI() {
    if (!currentPlayingVideo) return;
    const totalFrames = currentPlayingVideo.frameCount;
    const cachedCount = frameCache.size;
    const targetCount = getCacheModeTargetFrames();
    const mode = cacheModeSelect ? cacheModeSelect.value : 'medium';
    const percent = Math.min(100, Math.round((cachedCount / targetCount) * 100));

    cachePercentText.textContent = `${percent}%`;
    cacheProgressBar.style.width = `${percent}%`;
    
    if (cachedCount >= targetCount) {
      if (mode === 'full' || cachedCount >= totalFrames) {
        isFullOfflineCacheDone = true;
        cacheStageText.textContent = `✅ 100% Full Video Cached in Memory (Offline Ready)`;
        playerCacheBadge.textContent = `🟢 Offline Ready`;
      } else if (mode === 'medium') {
        cacheStageText.textContent = `✅ 5-6 Min Buffer Cached in Memory (Ready for Driving)`;
        playerCacheBadge.textContent = `🟢 5.5m Buffer Ready`;
      } else {
        cacheStageText.textContent = `⚡ 30s Quick Buffer Ready`;
        playerCacheBadge.textContent = `⚡ 30s Ready`;
      }
      playerCacheBadge.style.backgroundColor = 'var(--accent-green)';
    } else {
      if (mode === 'medium') {
        cacheStageText.textContent = `Caching 5.5m buffer: ${cachedCount} / ${targetCount} frames`;
      } else if (mode === 'full') {
        cacheStageText.textContent = `Caching full video: ${cachedCount} / ${totalFrames} frames`;
      } else {
        cacheStageText.textContent = `Buffered ${cachedCount} / ${targetCount} frames ahead`;
      }
      playerCacheBadge.textContent = `Cache: ${percent}%`;
      playerCacheBadge.style.backgroundColor = '';
    }

    // Scrubber buffer calculation
    const maxFrameInCache = frameCache.size > 0 ? Math.max(...Array.from(frameCache.keys())) : 0;
    const fps = currentPlayingVideo.fps || 24;
    const bufferedSec = maxFrameInCache / fps;
    const duration = teslaAudio.duration || currentPlayingVideo.duration || 1;
    const bufferPercent = Math.min(100, Math.round((bufferedSec / duration) * 100));
    scrubberBuffer.style.width = `${bufferPercent}%`;

    // Enable play button as soon as initial 30 frames are loaded
    if (cachedCount >= Math.min(30, totalFrames)) {
      startPlayNowBtn.disabled = false;
      if (cachedCount >= targetCount || percent >= 100) {
        startPlayNowBtn.innerHTML = mode === 'medium' 
          ? '▶️ Play Video (5.5 Min Buffer Ready)'
          : mode === 'full' ? '▶️ Play Video (100% Offline Ready)' : '▶️ Play Video';
      } else {
        startPlayNowBtn.innerHTML = '▶️ Start Playing (Buffering...)';
      }
    }
  }

  async function startFramePreCachePipeline(video) {
    clearFrameCache();
    activePreloadQueue.clear();
    isFullOfflineCacheDone = false;

    // Load initial 40 frames immediately with top priority
    const firstBatch = [];
    for (let i = 1; i <= Math.min(40, video.frameCount); i++) {
      firstBatch.push(fetchSingleFrame(i, video.id));
    }

    // Pre-cache audio blob in background after starting frame fetches
    setTimeout(() => {
      if (currentPlayingVideo && currentPlayingVideo.id === video.id) {
        cacheFullAudio(video.audioUrl);
      }
    }, 100);

    await Promise.all(firstBatch);

    if (frameCache.has(1)) {
      renderCanvasFrame(1);
    }

    updateCacheProgressUI();
    preloadWindowAhead(1);
  }

  if (cacheModeSelect) {
    cacheModeSelect.addEventListener('change', () => {
      if (currentPlayingVideo) {
        preloadWindowAhead(lastDrawnFrameIndex || 1);
      }
    });
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
    if (!img) {
      for (let offset = 1; offset <= 10; offset++) {
        const prevImg = frameCache.get(targetFrame - offset);
        if (prevImg) {
          img = prevImg;
          break;
        }
      }
    }

    if (img) {
      try {
        canvasCtx.drawImage(img, 0, 0, teslaCanvas.width, teslaCanvas.height);
        lastDrawnFrameIndex = targetFrame;
      } catch (e) {}
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
