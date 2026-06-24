// State Management
const state = {
  urlA: '',
  urlB: '',
  
  // DOM Wrapper references
  wrapperA: document.getElementById('wrapper-a'),
  wrapperB: document.getElementById('wrapper-b'),
  
  // Current assignments
  mainWrapper: null,
  overlayWrapper: null,
  
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
  
  // Interaction State
  isInteractMode: false
};

// Initialize DOM element short references
const iframeA = document.getElementById('iframe-a');
const iframeB = document.getElementById('iframe-b');
const urlInputA = document.getElementById('url-input-a');
const urlInputB = document.getElementById('url-input-b');
const loadBtn = document.getElementById('load-btn');
const mainSwapBtn = document.getElementById('main-swap-btn');
const infoBtn = document.getElementById('info-btn');

// Welcome modal references
const welcomeModal = document.getElementById('welcome-modal');
const modalUrlA = document.getElementById('modal-url-a');
const modalUrlB = document.getElementById('modal-url-b');
const modalDemoBtn = document.getElementById('modal-demo-btn');
const modalLaunchBtn = document.getElementById('modal-launch-btn');

// Help modal references
const helpModal = document.getElementById('help-modal');
const closeHelpBtn = document.getElementById('close-help-btn');
const closeHelpConfirmBtn = document.getElementById('close-help-confirm-btn');

// Docked / minimized references
const dockedWidget = document.getElementById('docked-overlay-widget');
const restoreOverlayBtn = document.getElementById('restore-overlay-btn');

// Control bar collapse references
const controlBarContainer = document.getElementById('control-bar-container');
const controlBarToggle = document.getElementById('control-bar-toggle');

// Setup default overlay position on load
function initOverlayCoordinates() {
  const gap = 30;
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
  titleA.textContent = state.mainWrapper === state.wrapperA ? "Main Screen (Stream A)" : "Overlay Screen (Stream A)";
  titleB.textContent = state.mainWrapper === state.wrapperB ? "Main Screen (Stream B)" : "Overlay Screen (Stream B)";

  // Synchronize inputs in toolbar
  urlInputA.value = state.wrapperA.querySelector('iframe').src;
  urlInputB.value = state.wrapperB.querySelector('iframe').src;

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
}

// Apply position values to DOM
function applyOverlayPosition() {
  if (!state.overlayWrapper) return;
  state.overlayWrapper.style.left = `${state.overlayConfig.x}px`;
  state.overlayWrapper.style.top = `${state.overlayConfig.y}px`;
  state.overlayWrapper.style.width = `${state.overlayConfig.width}px`;
  state.overlayWrapper.style.height = `${state.overlayConfig.height}px`;
}

// Seamless Swapping Engine (without reloading)
function swapStreams() {
  if (!state.mainWrapper || !state.overlayWrapper) return;
  
  // Add scale animation class to overlay for transitions
  state.overlayWrapper.style.transition = 'all var(--transition-normal)';
  state.mainWrapper.style.transition = 'all var(--transition-normal)';

  // Save current sizes/positions in case of offsets
  const tempMain = state.mainWrapper;
  const tempOverlay = state.overlayWrapper;

  setRoles(tempOverlay, tempMain);

  // Clear transitions after animation ends to prevent lag during dragging
  setTimeout(() => {
    if (state.overlayWrapper) state.overlayWrapper.style.transition = '';
    if (state.mainWrapper) state.mainWrapper.style.transition = '';
  }, 300);
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
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`;
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
  } catch (e) {
    // If URL is invalid/malformed, return it as-is and let iframe handle error
  }
  
  return url;
}

// Synchronization of URL values into frames
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


// Drag functionality
function startDrag(e) {
  if (state.isInteractMode) return; // Disable drag if interact mode is active
  
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

  // Screen constraints checking (prevent window from disappearing completely)
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
  e.stopPropagation(); // Stop click events propagating
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

  // Width adjustment
  if (dir.includes('e')) {
    newW = state.resize.initialWidth + dx;
  } else if (dir.includes('w')) {
    newW = state.resize.initialWidth - dx;
    newX = state.resize.initialX + dx;
  }

  // Height adjustment
  if (dir.includes('s')) {
    newH = state.resize.initialHeight + dy;
  } else if (dir.includes('n')) {
    newH = state.resize.initialHeight - dy;
    newY = state.resize.initialY + dy;
  }

  // Apply constraints
  if (newW < state.overlayConfig.minWidth) {
    if (dir.includes('w')) {
      newX = newX - (state.overlayConfig.minWidth - newW);
    }
    newW = state.overlayConfig.minWidth;
  }
  if (newH < state.overlayConfig.minHeight) {
    if (dir.includes('n')) {
      newY = newY - (state.overlayConfig.minHeight - newH);
    }
    newH = state.overlayConfig.minHeight;
  }

  // Prevent sizing larger than window viewport
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
  
  // Show docked thumbnail alert
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

  // Window resize handler: adjusts overlay positions to keep them inside viewport bounds
  window.addEventListener('resize', () => {
    const maxX = window.innerWidth - state.overlayConfig.width - 20;
    const maxY = window.innerHeight - state.overlayConfig.height - 20;
    state.overlayConfig.x = Math.max(20, Math.min(state.overlayConfig.x, maxX));
    state.overlayConfig.y = Math.max(20, Math.min(state.overlayConfig.y, maxY));
    applyOverlayPosition();
  });

  // Frame Overlay Click Swap Trigger (swaps on cover click, unless interact is active)
  document.querySelectorAll('.frame-overlay-cover').forEach(cover => {
    cover.addEventListener('click', (e) => {
      // Find wrapper parent
      const wrapper = cover.closest('.frame-wrapper');
      if (wrapper && wrapper.classList.contains('is-overlay') && !state.isInteractMode) {
        swapStreams();
      }
    });
  });

  // Connect individual wrapper action chrome buttons
  [state.wrapperA, state.wrapperB].forEach(wrapper => {
    const dragBar = wrapper.querySelector('.drag-handle');
    const swapBtn = wrapper.querySelector('.btn-swap');
    const interactBtn = wrapper.querySelector('.btn-interact');
    const minBtn = wrapper.querySelector('.btn-minimize');

    // Drag handle triggers drag
    dragBar.addEventListener('mousedown', (e) => startDrag(e));
    dragBar.addEventListener('touchstart', (e) => startDrag(e));

    // Internal Actions
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
  });

  // Control panel events
  loadBtn.addEventListener('click', () => {
    loadUrls(urlInputA.value.trim(), urlInputB.value.trim());
  });

  urlInputA.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loadUrls(urlInputA.value.trim(), urlInputB.value.trim());
  });

  urlInputB.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loadUrls(urlInputA.value.trim(), urlInputB.value.trim());
  });

  mainSwapBtn.addEventListener('click', swapStreams);

  // Auto-hide toolbar control Toggle
  controlBarToggle.addEventListener('click', () => {
    controlBarContainer.classList.toggle('control-collapsed');
    controlBarContainer.classList.toggle('control-expanded');
  });

  // Modals actions
  modalLaunchBtn.addEventListener('click', () => {
    const a = modalUrlA.value.trim();
    const b = modalUrlB.value.trim();
    if (a && b) {
      loadUrls(a, b);
      welcomeModal.classList.add('hidden');
    }
  });

  modalDemoBtn.addEventListener('click', () => {
    modalUrlA.value = 'https://www.openstreetmap.org/export/embed.html?bbox=-0.15%2C51.50%2C-0.13%2C51.52&layer=mapnik';
    modalUrlB.value = 'https://player.vimeo.com/video/76979871?autoplay=1&loop=1&muted=1&background=1';
    loadUrls(modalUrlA.value, modalUrlB.value);
    welcomeModal.classList.add('hidden');
  });

  // Dock widget restore action
  restoreOverlayBtn.addEventListener('click', restoreOverlay);

  // Global Info / Help Actions
  infoBtn.addEventListener('click', () => {
    helpModal.classList.remove('hidden');
  });

  closeHelpBtn.addEventListener('click', () => {
    helpModal.classList.add('hidden');
  });

  closeHelpConfirmBtn.addEventListener('click', () => {
    helpModal.classList.add('hidden');
  });

  // Load Stream Extractor Bindings
  setupExtractor();
}

// Stream Extractor Logic (Automated Cloudflare Worker endpoint API & Manual fallback)
function setupExtractor() {
  const extractorBtn = document.getElementById('extractor-btn');
  const extractorModal = document.getElementById('extractor-modal');
  const closeExtractorBtn = document.getElementById('close-extractor-btn');
  
  const extractorUrlInput = document.getElementById('extractor-url-input');
  const extractUrlBtn = document.getElementById('extract-url-btn');
  
  const extractorHtmlInput = document.getElementById('extractor-html-input');
  const extractRunBtn = document.getElementById('extract-run-btn');
  
  const extractionResults = document.getElementById('extraction-results');
  const streamsList = document.getElementById('streams-list');

  if (!extractorBtn || !extractorModal) return;

  // Open modal & prepopulate URL inputs with whatever is in Input A (likely what failed)
  extractorBtn.addEventListener('click', () => {
    if (urlInputA.value && urlInputA.value !== 'about:blank') {
      extractorUrlInput.value = urlInputA.value;
    } else if (urlInputB.value && urlInputB.value !== 'about:blank') {
      extractorUrlInput.value = urlInputB.value;
    }
    extractorModal.classList.remove('hidden');
    extractionResults.classList.add('hidden');
  });

  closeExtractorBtn.addEventListener('click', () => {
    extractorModal.classList.add('hidden');
  });

  // Helper to render extracted stream buttons in UI
  function renderStreams(streams) {
    streamsList.innerHTML = '';
    
    if (!streams || streams.length === 0) {
      streamsList.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 10px; text-align: center;">No video streams or player iframes detected. Make sure to paste the full code or verify the site domain.</div>';
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
            <button class="glow-btn-sm btn-load-main" style="background: #6366f1;">Set Main</button>
            <button class="glow-btn-sm btn-load-overlay" style="background: #a855f7;">Set PIP</button>
          </div>
        `;

        // Load buttons wireup
        item.querySelector('.btn-load-main').addEventListener('click', () => {
          loadUrls(stream.url, urlInputB.value);
          extractorModal.classList.add('hidden');
        });

        item.querySelector('.btn-load-overlay').addEventListener('click', () => {
          loadUrls(urlInputA.value, stream.url);
          extractorModal.classList.add('hidden');
        });

        streamsList.appendChild(item);
      });
    }

    extractionResults.classList.remove('hidden');
  }

  // --- METHOD 1: AUTOMATED CLOUDFLARE WORKER PROXY SCAN ---
  extractUrlBtn.addEventListener('click', async () => {
    const targetUrl = extractorUrlInput.value.trim();
    if (!targetUrl) {
      alert("Please enter a URL to scan.");
      return;
    }

    // Disable button state
    extractUrlBtn.disabled = true;
    const originalText = extractUrlBtn.textContent;
    extractUrlBtn.textContent = "Scanning...";
    streamsList.innerHTML = '<div style="color: var(--accent-light); font-size: 0.85rem; padding: 10px; text-align: center;">Connecting to Cloudflare edge parser and scraping streams... Please wait...</div>';
    extractionResults.classList.remove('hidden');

    try {
      // Direct call to our Cloudflare Pages API endpoint
      const response = await fetch(`/api/scrape?url=${encodeURIComponent(targetUrl)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      renderStreams(data.streams);
    } catch (err) {
      console.error(err);
      streamsList.innerHTML = `
        <div style="color: #f43f5e; font-size: 0.85rem; padding: 10px; text-align: center; border: 1px dashed rgba(244, 63, 94, 0.3); border-radius: var(--radius-md); background: rgba(244, 63, 94, 0.05);">
          <strong>Automatic Scan Failed:</strong> ${err.message}<br><br>
          <span style="font-size: 0.75rem; color: var(--text-muted);">This is likely due to Cloudflare DDoS protection or anti-bot guards blocking server-side scraping. Please use the <strong>Manual Fallback</strong> below by pasting the page source!</span>
        </div>
      `;
    } finally {
      extractUrlBtn.disabled = false;
      extractUrlBtn.textContent = originalText;
    }
  });

  // --- METHOD 2: MANUAL SOURCE CODE COPY-PASTE PARSER ---
  extractRunBtn.addEventListener('click', () => {
    const html = extractorHtmlInput.value;
    if (!html.trim()) {
      alert("Please paste some HTML source code first.");
      return;
    }

    const streams = [];
    const seen = new Set();

    // 1. Scan iframe src attributes
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

    // 2. Scan video and source tags
    const videoRegex = /<(?:video|source)[^>]+src=["']([^"']+)["']/gi;
    while ((match = videoRegex.exec(html)) !== null) {
      let url = match[1];
      if (url.startsWith('//')) url = 'https:' + url;
      if (!seen.has(url)) {
        seen.add(url);
        streams.push({ type: 'Video Source', url: url });
      }
    }

    // 3. Scan generic stream-like URLs in text
    const genericStreamRegex = /https?:\/\/[^\s"'><]+(?:embedstream|weakstream|weakspell|sportsurge|vshare|stream|player|play|live)[^\s"'><]*/gi;
    while ((match = genericStreamRegex.exec(html)) !== null) {
      const url = match[0];
      if (!seen.has(url) && !url.includes('google') && !url.includes('facebook') && !url.includes('twitter')) {
        seen.add(url);
        streams.push({ type: 'Possible Player Link', url: url });
      }
    }

    // 4. Scan for direct m3u8 playlists
    const m3u8Regex = /https?:\/\/[^\s"'><]+\.m3u8[^\s"'><]*/gi;
    while ((match = m3u8Regex.exec(html)) !== null) {
      const url = match[0];
      if (!seen.has(url)) {
        seen.add(url);
        streams.push({ type: 'M3U8 Playlist', url: url });
      }
    }

    renderStreams(streams);
  });
}

// Window load trigger
window.addEventListener('DOMContentLoaded', () => {
  initOverlayCoordinates();
  setupEventListeners();
  
  // Set default values inside inputs to make setup quick
  urlInputA.value = modalUrlA.value;
  urlInputB.value = modalUrlB.value;
});

