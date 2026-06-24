// State Management
const state = {
  urlA: '', // Main stream player URL
  urlB: '', // PIP stream player URL
  
  // DOM Wrapper references
  wrapperA: document.getElementById('wrapper-a'),
  wrapperB: document.getElementById('wrapper-b'),
  
  // Current assignments
  mainWrapper: null,
  overlayWrapper: null,
  
  // Setup workflow step: 
  // 'idle' (waiting for site 1),
  // 'browsing_1' (browsing site 1 in main frame),
  // 'loaded_1' (stream 1 locked to PIP overlay; waiting for site 2),
  // 'browsing_2' (browsing site 2 in main frame),
  // 'complete' (both streams loaded and locked)
  setupStep: 'idle',
  
  // Persistent overlay position & size
  overlayConfig: {
    x: 0, // left position in px
    y: 0, // top position in px
    width: 380,
    height: 214,
    minWidth: 240,
    minHeight: 135,
    isMinimized: false
  },
  
  // Drag & Resize states
  drag: {
    isDragging: false,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0
  },
  
  resize: {
    isResizing: false,
    direction: '',
    startX: 0,
    startY: 0,
    initialWidth: 0,
    initialHeight: 0,
    initialX: 0,
    initialY: 0
  },
  
  isOverlayMuted: true,
  isInteractMode: false
};

// Initialize DOM element references
const iframeA = document.getElementById('iframe-a');
const iframeB = document.getElementById('iframe-b');
const urlInputA = document.getElementById('url-input-a');
const urlInputB = document.getElementById('url-input-b');
const loadBtn = document.getElementById('load-btn');
const mainSwapBtn = document.getElementById('main-swap-btn');
const infoBtn = document.getElementById('info-btn');

// Extractor and help references
const extractorBtn = document.getElementById('extractor-btn');
const extractorModal = document.getElementById('extractor-modal');
const closeExtractorBtn = document.getElementById('close-extractor-btn');
const extractUrlBtn = document.getElementById('extract-url-btn');
const extractorUrlInput = document.getElementById('extractor-url-input');
const extractorHtmlInput = document.getElementById('extractor-html-input');
const extractRunBtn = document.getElementById('extract-run-btn');
const extractionResults = document.getElementById('extraction-results');
const streamsList = document.getElementById('streams-list');

const helpModal = document.getElementById('help-modal');
const closeHelpBtn = document.getElementById('close-help-btn');
const closeHelpConfirmBtn = document.getElementById('close-help-confirm-btn');

// Docked / minimized references
const dockedWidget = document.getElementById('docked-overlay-widget');
const restoreOverlayBtn = document.getElementById('restore-overlay-btn');

// Control bar references
const controlBarContainer = document.getElementById('control-bar-container');
const controlBarToggle = document.getElementById('control-bar-toggle');

// Setup Flow DOM references
const setupFlowContainer = document.getElementById('setup-flow-container');
const activeFlowContainer = document.getElementById('active-flow-container');
const setupUrlInput = document.getElementById('setup-url-input');
const setupBrowseBtn = document.getElementById('setup-browse-btn');
const setupStepBadge = document.getElementById('setup-step-badge');
const setupInstructionsOverlay = document.getElementById('setup-instructions-overlay');
const mainDemoLaunchBtn = document.getElementById('main-demo-launch-btn');

// Floating Detector Panel references
const detectorPanel = document.getElementById('detector-panel');
const detectorStatus = document.getElementById('detector-status');
const detectorResults = document.getElementById('detector-results');
const detectorStreamsList = document.getElementById('detector-streams-list');
const closeDetectorBtn = document.getElementById('close-detector-btn');

// Setup default overlay position on load (positioned offset from edges to clear scrollbars)
function initOverlayCoordinates() {
  const gap = 55; // increased from 30px to clear scrollbars and system widgets
  state.overlayConfig.x = window.innerWidth - state.overlayConfig.width - gap;
  state.overlayConfig.y = window.innerHeight - state.overlayConfig.height - gap;
}

// Set layout roles (wrapper roles)
function setRoles(main, overlay) {
  state.mainWrapper = main;
  state.overlayWrapper = overlay;

  // Toggle classes
  main.classList.remove('is-overlay');
  main.classList.add('is-main');
  
  overlay.classList.remove('is-main');
  overlay.classList.add('is-overlay');

  // Reset styles for the main screen (fills screen)
  main.style.left = '';
  main.style.top = '';
  main.style.width = '';
  main.style.height = '';

  // Apply saved layout size and position to overlay wrapper
  applyOverlayPosition();
  
  // Manage title label in overlays
  const titleA = state.wrapperA.querySelector('.stream-title');
  const titleB = state.wrapperB.querySelector('.stream-title');
  titleA.textContent = state.mainWrapper === state.wrapperA ? "Main Screen" : "Overlay Screen (PIP)";
  titleB.textContent = state.mainWrapper === state.wrapperB ? "Main Screen" : "Overlay Screen (PIP)";

  // Synchronize inputs in toolbar if complete
  if (state.setupStep === 'complete') {
    urlInputA.value = state.urlA;
    urlInputB.value = state.urlB;
  }

  // If minimized, maintain minimized visibility
  if (state.overlayConfig.isMinimized) {
    state.overlayWrapper.classList.add('hidden');
    dockedWidget.classList.remove('hidden');
  } else {
    state.overlayWrapper.classList.remove('hidden');
    dockedWidget.classList.add('hidden');
  }

  // Sync interact lock states on swap
  syncInteractMode();

  // Reset overlay to muted state by default on roles swap
  state.isOverlayMuted = true;
  syncOverlayMuteIcon();

  // Mute/Unmute active roles: Main unmuted, Overlay (PIP) muted
  setIframeMuted(main.querySelector('iframe'), false);
  setIframeMuted(overlay.querySelector('iframe'), true);
}

// Apply position values to DOM
function applyOverlayPosition() {
  if (!state.overlayWrapper) return;
  state.overlayWrapper.style.left = `${state.overlayConfig.x}px`;
  state.overlayWrapper.style.top = `${state.overlayConfig.y}px`;
  state.overlayWrapper.style.width = `${state.overlayConfig.width}px`;
  state.overlayWrapper.style.height = `${state.overlayConfig.height}px`;
}

// Cross-origin helper to mute/unmute players (YouTube, Twitch, Vimeo) via postMessage APIs
function setIframeMuted(iframe, isMuted) {
  if (!iframe) return;
  const src = iframe.src;
  if (!src || src === 'about:blank') return;

  try {
    // 1. YouTube postMessage API (needs enablejsapi=1)
    if (src.includes('youtube.com/embed')) {
      const command = isMuted ? 'mute' : 'unMute';
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: command, args: '' }), '*');
    }
    // 2. Vimeo postMessage API
    else if (src.includes('player.vimeo.com')) {
      const command = isMuted ? 'mute' : 'unmute';
      iframe.contentWindow.postMessage(JSON.stringify({ method: command }), '*');
    }
    // 3. Twitch postMessage API
    else if (src.includes('player.twitch.tv')) {
      iframe.contentWindow.postMessage(JSON.stringify({ action: isMuted ? 'mute' : 'unmute' }), '*');
      iframe.contentWindow.postMessage(JSON.stringify({ event: isMuted ? 'mute' : 'unmute' }), '*');
    }
  } catch (e) {
    console.warn('PostMessage mute error:', e);
  }
}

// Synchronize the mute button visual icons in the active overlay chrome
function syncOverlayMuteIcon() {
  if (!state.overlayWrapper) return;
  const muteBtn = state.overlayWrapper.querySelector('.btn-mute');
  if (!muteBtn) return;
  
  const iconUp = muteBtn.querySelector('.icon-volume-up');
  const iconOff = muteBtn.querySelector('.icon-volume-off');
  
  if (state.isOverlayMuted) {
    iconUp.classList.add('hidden');
    iconOff.classList.remove('hidden');
    muteBtn.title = "Unmute PIP Stream";
  } else {
    iconUp.classList.remove('hidden');
    iconOff.classList.add('hidden');
    muteBtn.title = "Mute PIP Stream";
  }
}

// Seamless Swapping Engine (without reloading)
function swapStreams() {
  if (!state.mainWrapper || !state.overlayWrapper) return;
  
  // Save current sizes/positions in case of offsets
  const tempMain = state.mainWrapper;
  const tempOverlay = state.overlayWrapper;

  // Swap URLs state tracker
  const tempUrl = state.urlA;
  state.urlA = state.urlB;
  state.urlB = tempUrl;

  // Save to localStorage
  localStorage.setItem('streamswap_url_a', state.urlA);
  localStorage.setItem('streamswap_url_b', state.urlB);

  setRoles(tempOverlay, tempMain);
}

// Helper to auto-detect and convert stream platform URLs to their embed formats
function autoEmbedUrl(urlStr) {
  if (!urlStr) return 'about:blank';
  
  let url = urlStr.trim();
  if (!url) return 'about:blank';

  // Ensure URL has a protocol
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    
    // YouTube Support
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      let videoId = '';
      if (hostname.includes('youtu.be')) {
        videoId = parsed.pathname.substring(1);
      } else {
        videoId = parsed.searchParams.get('v');
        if (!videoId && parsed.pathname.startsWith('/embed/')) {
          return url; // already in embed format
        }
        if (!videoId && parsed.pathname.startsWith('/shorts/')) {
          videoId = parsed.pathname.split('/')[2];
        }
      }
      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&enablejsapi=1`;
      }
    }
    
    // Twitch Support
    if (hostname.includes('twitch.tv') && !hostname.includes('player.twitch.tv')) {
      const channel = parsed.pathname.substring(1).split('/')[0];
      if (channel && channel !== 'directory' && channel !== 'downloads') {
        const parent = window.location.hostname || 'localhost';
        return `https://player.twitch.tv/?channel=${channel}&parent=${parent}&muted=true`;
      }
    }
    
    // Vimeo Support
    if (hostname.includes('vimeo.com') && !hostname.includes('player.vimeo.com')) {
      const videoId = parsed.pathname.substring(1).split('/')[0];
      if (videoId && /^\d+$/.test(videoId)) {
        return `https://player.vimeo.com/video/${videoId}?autoplay=1&muted=1`;
      }
    }

    // OpenStreetMap & relative paths
    if (hostname.includes('openstreetmap.org') || parsed.pathname.includes('/api/proxy') || hostname === window.location.hostname) {
      return url;
    }
  } catch (e) {
    // If URL is invalid/malformed, return it as-is
    return url;
  }
  
  // Proxy all other generic streaming player URLs to bypass X-Frame-Options / Content Security Policies
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

// Synchronization of URL values into frames directly (bypassing search setup wizard)
function loadUrls(urlA, urlB) {
  state.urlA = autoEmbedUrl(urlA);
  state.urlB = autoEmbedUrl(urlB);

  iframeA.src = state.urlA;
  iframeB.src = state.urlB;

  urlInputA.value = state.urlA;
  urlInputB.value = state.urlB;

  // Initial role configuration (A is main, B is overlay)
  setRoles(state.wrapperA, state.wrapperB);
}

// Setup Step 1: Browse site for Stream 1
function startSetupStep1(urlSite) {
  if (!urlSite) return;
  state.setupStep = 'browsing_1';
  
  // Hide main landing instructions overlay
  setupInstructionsOverlay.classList.add('hidden');
  
  // Load site via proxy in Main Frame
  iframeA.src = `/api/proxy?url=${encodeURIComponent(urlSite)}`;
  
  // Reset overlay PIP stream to blank
  iframeB.src = 'about:blank';
  
  // Update status UI
  setupStepBadge.textContent = "Browse 1";
  detectorStatus.textContent = "Browsing site for Stream 1 (PIP). Navigate to the player stream...";
  detectorResults.classList.add('hidden');
  detectorPanel.classList.remove('hidden');
}

// Setup Step 2: Lock Stream 1 into PIP overlay, reset Main Frame to browse Stream 2
function selectStreamForPIP(streamUrl) {
  state.urlB = autoEmbedUrl(streamUrl);
  
  // Load the stream player in Overlay Frame B
  iframeB.src = state.urlB;
  
  // Update state step
  state.setupStep = 'loaded_1';
  
  // Set main frame back to empty browser
  iframeA.src = 'about:blank';
  
  // Reveal welcome overlay again with step 2 directions
  setupInstructionsOverlay.querySelector('h1').innerHTML = '<span class="gradient-text">Stream 1 PIP Set!</span>';
  setupInstructionsOverlay.querySelector('p').textContent = "Step 2: Enter a site address in the top bar to browse and locate Stream 2 (Main Screen).";
  setupInstructionsOverlay.classList.remove('hidden');
  
  // Sync toolbar badge & inputs
  setupUrlInput.value = '';
  setupStepBadge.textContent = "Find Stream 2";
  
  // Update detector status
  detectorStatus.textContent = "Enter a website URL above to scan for Stream 2...";
  detectorResults.classList.add('hidden');
}

// Setup Step 3: Browse site for Stream 2
function startSetupStep2(urlSite) {
  if (!urlSite) return;
  state.setupStep = 'browsing_2';
  
  // Hide setup overlay
  setupInstructionsOverlay.classList.add('hidden');
  
  // Load site 2 via proxy in Main Frame
  iframeA.src = `/api/proxy?url=${encodeURIComponent(urlSite)}`;
  
  // Update status UI
  setupStepBadge.textContent = "Browse 2";
  detectorStatus.textContent = "Browsing site for Stream 2 (Main). Navigate to the player stream...";
  detectorResults.classList.add('hidden');
  detectorPanel.classList.remove('hidden');
}

// Setup Step 4: Lock Stream 2 into Main Screen and complete workflow
function selectStreamForMain(streamUrl) {
  state.urlA = autoEmbedUrl(streamUrl);
  
  // Load the final player in Main Frame A
  iframeA.src = state.urlA;
  
  // Update state to complete
  state.setupStep = 'complete';
  
  // Hide instructions and detector overlays
  setupInstructionsOverlay.classList.add('hidden');
  detectorPanel.classList.add('hidden');
  
  // Toggle control inputs: hide setup, show active
  setupFlowContainer.classList.add('hidden');
  activeFlowContainer.classList.remove('hidden');
  
  // Sync inputs
  urlInputA.value = state.urlA;
  urlInputB.value = state.urlB;
  
  // Save both stream player URLs to localStorage to remember them on reload!
  localStorage.setItem('streamswap_url_a', state.urlA);
  localStorage.setItem('streamswap_url_b', state.urlB);
  
  // Sync default layout and roles
  setRoles(state.wrapperA, state.wrapperB);
}

// Trigger setup browser scan command
function triggerBrowseAction() {
  const url = setupUrlInput.value.trim();
  if (!url) return;

  if (state.setupStep === 'idle' || state.setupStep === 'browsing_1') {
    startSetupStep1(url);
  } else if (state.setupStep === 'loaded_1' || state.setupStep === 'browsing_2') {
    startSetupStep2(url);
  }
}

// Reset setup wizard
function resetSetupWizard() {
  state.setupStep = 'idle';
  state.urlA = '';
  state.urlB = '';
  localStorage.removeItem('streamswap_url_a');
  localStorage.removeItem('streamswap_url_b');
  
  // Reset wrappers
  iframeA.src = 'about:blank';
  iframeB.src = 'about:blank';
  
  // Reset welcome panel text
  setupInstructionsOverlay.querySelector('h1').innerHTML = '<span class="gradient-text">StreamSwap</span>';
  setupInstructionsOverlay.querySelector('p').textContent = "Enter a site address in the top bar to browse and locate streams. We will detect video players automatically as you navigate!";
  setupInstructionsOverlay.classList.remove('hidden');
  
  // Reset inputs
  setupUrlInput.value = '';
  setupStepBadge.textContent = "Find Stream 1";
  
  // Toggle bar containers
  setupFlowContainer.classList.remove('hidden');
  activeFlowContainer.classList.add('hidden');
  
  detectorPanel.classList.add('hidden');
}

// Handle messages sent from proxied sniffer frame
function handleSnifferMessages(event) {
  if (event.data && event.data.type === 'STREAM_SWAP_DETECTED_STREAMS') {
    const streams = event.data.streams;
    
    // Clear waiting status
    detectorStatus.textContent = "";
    detectorStatus.style.padding = "0px";
    
    detectorStreamsList.innerHTML = '';
    
    streams.forEach((stream, index) => {
      const item = document.createElement('div');
      item.className = 'stream-item';
      
      let domainLabel = stream.type;
      try {
        const parsed = new URL(stream.url);
        domainLabel = `${stream.type} (${parsed.hostname})`;
      } catch(e) {}
      
      item.innerHTML = `
        <div class="stream-item-info">
          <span class="stream-item-title">#${index + 1} - ${domainLabel}</span>
          <span class="stream-item-url" title="${stream.url}">${stream.url}</span>
        </div>
        <div class="stream-item-actions">
          <button class="glow-btn-sm btn-select-stream" style="background: var(--accent-gradient);">Select</button>
        </div>
      `;
      
      // Wire selection button
      item.querySelector('.btn-select-stream').addEventListener('click', () => {
        if (state.setupStep === 'browsing_1') {
          selectStreamForPIP(stream.url);
        } else if (state.setupStep === 'browsing_2') {
          selectStreamForMain(stream.url);
        }
      });
      
      detectorStreamsList.appendChild(item);
    });
    
    detectorResults.classList.remove('hidden');
  }
}

// Drag functionality
function startDrag(e) {
  if (state.isInteractMode) return;
  
  const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
  const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

  state.drag.isDragging = true;
  state.drag.startX = clientX;
  state.drag.startY = clientY;
  state.drag.initialX = state.overlayConfig.x;
  state.drag.initialY = state.overlayConfig.y;

  document.body.classList.add('dragging-active');
  state.overlayWrapper.classList.add('dragging');
}

function handleDrag(e) {
  if (!state.drag.isDragging) return;

  const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
  const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

  const dx = clientX - state.drag.startX;
  const dy = clientY - state.drag.startY;

  let newX = state.drag.initialX + dx;
  let newY = state.drag.initialY + dy;

  const maxLeft = window.innerWidth - 60;
  const maxTop = window.innerHeight - 40;
  
  newX = Math.max(-state.overlayConfig.width + 60, Math.min(newX, maxLeft));
  newY = Math.max(0, Math.min(newY, maxTop));

  state.overlayConfig.x = newX;
  state.overlayConfig.y = newY;
  applyOverlayPosition();
}

function stopDrag() {
  if (!state.drag.isDragging) return;
  state.drag.isDragging = false;
  document.body.classList.remove('dragging-active');
  if (state.overlayWrapper) {
    state.overlayWrapper.classList.remove('dragging');
  }
}

// Resize functionality (Handles all 8 directions)
function startResize(e, direction) {
  e.stopPropagation();
  e.preventDefault();

  const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
  const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

  state.resize.isResizing = true;
  state.resize.direction = direction;
  state.resize.startX = clientX;
  state.resize.startY = clientY;
  state.resize.initialWidth = state.overlayConfig.width;
  state.resize.initialHeight = state.overlayConfig.height;
  state.resize.initialX = state.overlayConfig.x;
  state.resize.initialY = state.overlayConfig.y;

  document.body.classList.add('resizing-active');
}

function handleResize(e) {
  if (!state.resize.isResizing) return;

  const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
  const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

  const dx = clientX - state.resize.startX;
  const dy = clientY - state.resize.startY;

  let newW = state.resize.initialWidth;
  let newH = state.resize.initialHeight;
  let newX = state.resize.initialX;
  let newY = state.resize.initialY;

  const dir = state.resize.direction;

  if (dir.includes('e')) {
    newW = state.resize.initialWidth + dx;
  } else if (dir.includes('w')) {
    newW = state.resize.initialWidth - dx;
    newX = state.resize.initialX + dx;
  }

  if (dir.includes('s')) {
    newH = state.resize.initialHeight + dy;
  } else if (dir.includes('n')) {
    newH = state.resize.initialHeight - dy;
    newY = state.resize.initialY + dy;
  }

  if (newW < state.overlayConfig.minWidth) {
    if (dir.includes('w')) newX = newX - (state.overlayConfig.minWidth - newW);
    newW = state.overlayConfig.minWidth;
  }
  if (newH < state.overlayConfig.minHeight) {
    if (dir.includes('n')) newY = newY - (state.overlayConfig.minHeight - newH);
    newH = state.overlayConfig.minHeight;
  }

  newW = Math.min(newW, window.innerWidth);
  newH = Math.min(newH, window.innerHeight);

  state.overlayConfig.width = newW;
  state.overlayConfig.height = newH;
  state.overlayConfig.x = newX;
  state.overlayConfig.y = newY;

  applyOverlayPosition();
}

function stopResize() {
  if (!state.resize.isResizing) return;
  state.resize.isResizing = false;
  document.body.classList.remove('resizing-active');
}

// Lock / Unlock Interact Mode
function toggleInteractMode() {
  state.isInteractMode = !state.isInteractMode;
  syncInteractMode();
}

function syncInteractMode() {
  if (!state.overlayWrapper) return;
  
  const interactBtn = state.overlayWrapper.querySelector('.btn-interact');
  const lockIcon = interactBtn.querySelector('.icon-lock');
  const unlockIcon = interactBtn.querySelector('.icon-unlock');

  if (state.isInteractMode) {
    state.overlayWrapper.classList.add('interact-active');
    lockIcon.classList.add('hidden');
    unlockIcon.classList.remove('hidden');
    interactBtn.title = "Lock Mode (Click overlays to swap)";
  } else {
    state.overlayWrapper.classList.remove('interact-active');
    lockIcon.classList.remove('hidden');
    unlockIcon.classList.add('hidden');
    interactBtn.title = "Interact Mode (Allow clicks inside)";
  }
}

// Minimize & Restore overlay
function minimizeOverlay() {
  state.overlayConfig.isMinimized = true;
  state.overlayWrapper.classList.add('hidden');
  
  const overlayIframe = state.overlayWrapper.querySelector('iframe');
  const urlDomain = overlayIframe.src !== 'about:blank' 
    ? new URL(overlayIframe.src).hostname 
    : 'Unknown Stream';
  
  dockedWidget.querySelector('.docked-title').textContent = `${urlDomain} (Minimized)`;
  dockedWidget.classList.remove('hidden');
}

function restoreOverlay() {
  state.overlayConfig.isMinimized = false;
  state.overlayWrapper.classList.remove('hidden');
  dockedWidget.classList.add('hidden');
  applyOverlayPosition();
}

// Global Event Listeners setup
function setupEventListeners() {
  // Main control bar home button trigger
  const mainHomeBtn = document.getElementById('main-home-btn');
  if (mainHomeBtn) {
    mainHomeBtn.addEventListener('click', () => {
      resetSetupWizard();
    });
  }

  // Sniffer postMessage listener
  window.addEventListener('message', handleSnifferMessages);

  // Global drag movements
  window.addEventListener('mousemove', (e) => {
    if (state.drag.isDragging) handleDrag(e);
    if (state.resize.isResizing) handleResize(e);
  });

  window.addEventListener('mouseup', () => {
    if (state.drag.isDragging) stopDrag();
    if (state.resize.isResizing) stopResize();
  });

  // Touch support for mobiles/trackpads
  window.addEventListener('touchmove', (e) => {
    if (state.drag.isDragging) handleDrag(e);
    if (state.resize.isResizing) handleResize(e);
  }, { passive: false });

  window.addEventListener('touchend', () => {
    if (state.drag.isDragging) stopDrag();
    if (state.resize.isResizing) stopResize();
  });

  // Window resize bounds checks
  window.addEventListener('resize', () => {
    const maxX = window.innerWidth - state.overlayConfig.width - 20;
    const maxY = window.innerHeight - state.overlayConfig.height - 20;
    state.overlayConfig.x = Math.max(20, Math.min(state.overlayConfig.x, maxX));
    state.overlayConfig.y = Math.max(20, Math.min(state.overlayConfig.y, maxY));
    applyOverlayPosition();
  });

  // Frame Overlay Click Swap Trigger
  document.querySelectorAll('.frame-overlay-cover').forEach(cover => {
    cover.addEventListener('click', (e) => {
      const wrapper = cover.closest('.frame-wrapper');
      if (wrapper && wrapper.classList.contains('is-overlay') && !state.isInteractMode) {
        swapStreams();
      }
    });
  });

  // Connect individual wrapper action chrome buttons
  [state.wrapperA, state.wrapperB].forEach(wrapper => {
    const homeBtn = wrapper.querySelector('.btn-home');
    const dragBar = wrapper.querySelector('.drag-handle');
    const swapBtn = wrapper.querySelector('.btn-swap');
    const interactBtn = wrapper.querySelector('.btn-interact');
    const minBtn = wrapper.querySelector('.btn-minimize');

    if (homeBtn) {
      homeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetSetupWizard();
      });
    }

    dragBar.addEventListener('mousedown', (e) => startDrag(e));
    dragBar.addEventListener('touchstart', (e) => startDrag(e));

    swapBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      swapStreams();
    });

    interactBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleInteractMode();
    });

    minBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      minimizeOverlay();
    });

    // Resize Handles trigger
    const handles = wrapper.querySelectorAll('.resize-handle');
    handles.forEach(handle => {
      const classes = handle.className.split(' ');
      const direction = classes.find(c => c !== 'resize-handle');
      
      handle.addEventListener('mousedown', (e) => startResize(e, direction));
      handle.addEventListener('touchstart', (e) => startResize(e, direction));
    });

    // Mute/Unmute button click handler on overlay
    const muteBtn = wrapper.querySelector('.btn-mute');
    if (muteBtn) {
      muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (wrapper.classList.contains('is-overlay')) {
          state.isOverlayMuted = !state.isOverlayMuted;
          syncOverlayMuteIcon();
          setIframeMuted(wrapper.querySelector('iframe'), state.isOverlayMuted);
        }
      });
    }
  });

  // Setup wizard browse triggers
  setupBrowseBtn.addEventListener('click', triggerBrowseAction);
  setupUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') triggerBrowseAction();
  });

  mainDemoLaunchBtn.addEventListener('click', () => {
    // Populate with OSM map and Vimeo loop
    loadUrls(
      'https://www.openstreetmap.org/export/embed.html?bbox=-0.15%2C51.50%2C-0.13%2C51.52&layer=mapnik',
      'https://player.vimeo.com/video/76979871?autoplay=1&loop=1&muted=1&background=1'
    );
    state.setupStep = 'complete';
    setupInstructionsOverlay.classList.add('hidden');
    setupFlowContainer.classList.add('hidden');
    activeFlowContainer.classList.remove('hidden');
    localStorage.setItem('streamswap_url_a', state.urlA);
    localStorage.setItem('streamswap_url_b', state.urlB);
  });

  // Active control panel events
  loadBtn.addEventListener('click', () => {
    loadUrls(urlInputA.value.trim(), urlInputB.value.trim());
    localStorage.setItem('streamswap_url_a', state.urlA);
    localStorage.setItem('streamswap_url_b', state.urlB);
  });

  urlInputA.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      loadUrls(urlInputA.value.trim(), urlInputB.value.trim());
      localStorage.setItem('streamswap_url_a', state.urlA);
      localStorage.setItem('streamswap_url_b', state.urlB);
    }
  });

  urlInputB.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      loadUrls(urlInputA.value.trim(), urlInputB.value.trim());
      localStorage.setItem('streamswap_url_a', state.urlA);
      localStorage.setItem('streamswap_url_b', state.urlB);
    }
  });

  mainSwapBtn.addEventListener('click', swapStreams);

  // Auto-hide toolbar control Toggle
  controlBarToggle.addEventListener('click', () => {
    controlBarContainer.classList.toggle('control-collapsed');
    controlBarContainer.classList.toggle('control-expanded');
  });

  // Close detector drawer trigger
  closeDetectorBtn.addEventListener('click', () => {
    detectorPanel.classList.add('hidden');
  });

  // Extractor panel (CORS Manual backup) events
  extractorBtn.addEventListener('click', () => {
    // Fill with current setup URL if available
    if (setupUrlInput.value) {
      extractorUrlInput.value = setupUrlInput.value;
    }
    extractorModal.classList.remove('hidden');
    extractionResults.classList.add('hidden');
  });

  closeExtractorBtn.addEventListener('click', () => {
    extractorModal.classList.add('hidden');
  });

  // Helper to render extracted stream buttons in the backup manual modal
  function renderManualExtractorStreams(streams) {
    streamsList.innerHTML = '';
    
    if (!streams || streams.length === 0) {
      streamsList.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 10px; text-align: center;">No streams detected. Make sure to paste the full source.</div>';
    } else {
      streams.forEach((stream, index) => {
        const item = document.createElement('div');
        item.className = 'stream-item';
        
        let label = stream.type;
        try {
          const parsed = new URL(stream.url);
          label = `${stream.type} (${parsed.hostname})`;
        } catch(e) {}

        item.innerHTML = `
          <div class="stream-item-info">
            <span class="stream-item-title">#${index + 1} - ${label}</span>
            <span class="stream-item-url" title="${stream.url}">${stream.url}</span>
          </div>
          <div class="stream-item-actions">
            <button class="glow-btn-sm btn-load-manual-item" style="background: var(--accent-gradient);">Select Stream</button>
          </div>
        `;

        item.querySelector('.btn-load-manual-item').addEventListener('click', () => {
          if (state.setupStep === 'browsing_1' || state.setupStep === 'idle') {
            selectStreamForPIP(stream.url);
          } else {
            selectStreamForMain(stream.url);
          }
          extractorModal.classList.add('hidden');
        });

        streamsList.appendChild(item);
      });
    }

    extractionResults.classList.remove('hidden');
  }

  // Backup Manual Scanner Run
  extractRunBtn.addEventListener('click', () => {
    const html = extractorHtmlInput.value;
    if (!html.trim()) {
      alert("Please paste some HTML source code first.");
      return;
    }

    const streams = [];
    const seen = new Set();

    const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
    let match;
    while ((match = iframeRegex.exec(html)) !== null) {
      let url = match[1];
      if (url.startsWith('//')) url = 'https:' + url;
      if (!seen.has(url) && !url.includes('about:blank')) {
        seen.add(url);
        streams.push({ type: 'Iframe Player', url: url });
      }
    }

    const videoRegex = /<(?:video|source)[^>]+src=["']([^"']+)["']/gi;
    while ((match = videoRegex.exec(html)) !== null) {
      let url = match[1];
      if (url.startsWith('//')) url = 'https:' + url;
      if (!seen.has(url)) {
        seen.add(url);
        streams.push({ type: 'Video Source', url: url });
      }
    }

    const genericStreamRegex = /https?:\/\/[^\s"'><]+(?:embedstream|weakstream|weakspell|sportsurge|vshare|stream|player|play|live)[^\s"'><]*/gi;
    while ((match = genericStreamRegex.exec(html)) !== null) {
      const url = match[0];
      if (!seen.has(url) && !url.includes('google') && !url.includes('facebook') && !url.includes('twitter')) {
        seen.add(url);
        streams.push({ type: 'Possible Player Link', url: url });
      }
    }

    const m3u8Regex = /https?:\/\/[^\s"'><]+\.m3u8[^\s"'><]*/gi;
    while ((match = m3u8Regex.exec(html)) !== null) {
      const url = match[0];
      if (!seen.has(url)) {
        seen.add(url);
        streams.push({ type: 'M3U8 Playlist', url: url });
      }
    }

    renderManualExtractorStreams(streams);
  });

  // Automated modal scan call
  extractUrlBtn.addEventListener('click', async () => {
    const targetUrl = extractorUrlInput.value.trim();
    if (!targetUrl) return;

    extractUrlBtn.disabled = true;
    const originalText = extractUrlBtn.textContent;
    extractUrlBtn.textContent = "Scanning...";
    streamsList.innerHTML = '<div style="color: var(--accent-light); font-size: 0.85rem; padding: 10px; text-align: center;">Scanning page...</div>';
    extractionResults.classList.remove('hidden');

    try {
      const response = await fetch(`/api/scrape?url=${encodeURIComponent(targetUrl)}`);
      if (!response.ok) throw new Error("Connection failed");
      const data = await response.json();
      renderManualExtractorStreams(data.streams);
    } catch (err) {
      streamsList.innerHTML = `<div style="color: #f43f5e; font-size: 0.85rem; padding: 10px; text-align: center;">Scan failed. Copy and paste page HTML code below.</div>`;
    } finally {
      extractUrlBtn.disabled = false;
      extractUrlBtn.textContent = originalText;
    }
  });

  // Restore docked PIP widget
  restoreOverlayBtn.addEventListener('click', restoreOverlay);

  // Global Help Modal Bindings
  infoBtn.addEventListener('click', () => {
    helpModal.classList.remove('hidden');
  });

  closeHelpBtn.addEventListener('click', () => {
    helpModal.classList.add('hidden');
  });

  closeHelpConfirmBtn.addEventListener('click', () => {
    helpModal.classList.add('hidden');
  });
}

// Window load trigger
window.addEventListener('DOMContentLoaded', () => {
  initOverlayCoordinates();
  setupEventListeners();
  
  // Check if there are last saved stream players to restore from localStorage
  const savedA = localStorage.getItem('streamswap_url_a');
  const savedB = localStorage.getItem('streamswap_url_b');
  
  if (savedA && savedB) {
    state.setupStep = 'complete';
    
    // Toggle bar containers
    setupFlowContainer.classList.add('hidden');
    activeFlowContainer.classList.remove('hidden');
    
    // Hide instructions overlay
    setupInstructionsOverlay.classList.add('hidden');
    
    // Load streams
    loadUrls(savedA, savedB);
  } else {
    // Begin setup wizard in idle state
    resetSetupWizard();
  }
});
