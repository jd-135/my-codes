// PCDP OTP Receiver Engine for iOS

const STORAGE_KEYS = {
  BASE_URL: 'pcdp_otp_base_url',
  SESSION: 'pcdp_otp_session'
};

const DEFAULT_BASE_URL = 'https://otpbunk.vercel.app';
const DEFAULT_SESSION = 'pcdp-00dz8m';

let isPolling = false;
let pollTimer = null;
let lastReceivedOtp = null;

// DOM Elements
const baseUrlInput = document.getElementById('baseUrlInput');
const sessionInput = document.getElementById('sessionInput');
const btnToggleReceiver = document.getElementById('btnToggleReceiver');
const btnIcon = document.getElementById('btnIcon');
const btnLabel = document.getElementById('btnLabel');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const btnTestOtp = document.getElementById('btnTestOtp');
const btnClearLogs = document.getElementById('btnClearLogs');
const logsList = document.getElementById('logsList');
const btnOpenOtpbunk = document.getElementById('btnOpenOtpbunk');

// Persistent Overlay Elements
const otpOverlayBackdrop = document.getElementById('otpOverlayBackdrop');
const overlayOtpCode = document.getElementById('overlayOtpCode');
const overlayOtpTime = document.getElementById('overlayOtpTime');
const btnOverlayOk = document.getElementById('btnOverlayOk');

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

function initApp() {
  loadPreferences();
  setupEventListeners();
  updateOtpbunkLink();
  registerServiceWorker();
}

function loadPreferences() {
  const savedUrl = localStorage.getItem(STORAGE_KEYS.BASE_URL);
  const savedSession = localStorage.getItem(STORAGE_KEYS.SESSION);
  if (savedUrl) baseUrlInput.value = savedUrl;
  if (savedSession) sessionInput.value = savedSession;
}

function updateOtpbunkLink() {
  const url = baseUrlInput.value.trim() || DEFAULT_BASE_URL;
  const session = sessionInput.value.trim() || DEFAULT_SESSION;
  if (btnOpenOtpbunk) {
    btnOpenOtpbunk.href = `${url}/?role=send&session=${encodeURIComponent(session)}`;
  }
}

function setupEventListeners() {
  if (btnToggleReceiver) btnToggleReceiver.addEventListener('click', toggleReceiver);
  if (btnSaveSettings) btnSaveSettings.addEventListener('click', savePreferences);
  if (btnTestOtp) btnTestOtp.addEventListener('click', simulateTestOtp);
  if (btnClearLogs) btnClearLogs.addEventListener('click', clearLogs);

  if (sessionInput) sessionInput.addEventListener('input', updateOtpbunkLink);
  if (baseUrlInput) baseUrlInput.addEventListener('input', updateOtpbunkLink);

  // Persistent Overlay OK button listener - dismisses overlay when clicked
  if (btnOverlayOk) {
    btnOverlayOk.addEventListener('click', () => {
      otpOverlayBackdrop.classList.remove('visible');
    });
  }
}

function savePreferences() {
  let url = baseUrlInput.value.trim();
  let session = sessionInput.value.trim();
  if (!url) url = DEFAULT_BASE_URL;
  if (!session) session = DEFAULT_SESSION;

  // Clean trailing slashes
  url = url.replace(/\/+$/, '');
  baseUrlInput.value = url;
  sessionInput.value = session;

  localStorage.setItem(STORAGE_KEYS.BASE_URL, url);
  localStorage.setItem(STORAGE_KEYS.SESSION, session);
  updateOtpbunkLink();

  alert('Settings saved successfully!');
}

function toggleReceiver() {
  if (isPolling) {
    stopReceiver();
  } else {
    startReceiver();
  }
}

function startReceiver() {
  isPolling = true;
  if (btnToggleReceiver) {
    btnToggleReceiver.className = 'btn-toggle btn-stop';
  }
  if (btnIcon) btnIcon.textContent = '⏹';
  if (btnLabel) btnLabel.textContent = 'Stop Receiver';

  if (statusDot) statusDot.className = 'status-dot active';
  if (statusText) statusText.textContent = 'Receiver active - Polling for OTP...';

  pollOnce();
  pollTimer = setInterval(pollOnce, 2000);
}

function stopReceiver() {
  isPolling = false;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;

  if (btnToggleReceiver) {
    btnToggleReceiver.className = 'btn-toggle btn-start';
  }
  if (btnIcon) btnIcon.textContent = '▶';
  if (btnLabel) btnLabel.textContent = 'Start Receiver';

  if (statusDot) statusDot.className = 'status-dot';
  if (statusText) statusText.textContent = 'Receiver stopped';
}

async function pollOnce() {
  if (!isPolling) return;

  const baseUrl = baseUrlInput.value.trim() || DEFAULT_BASE_URL;
  const session = sessionInput.value.trim() || DEFAULT_SESSION;

  // Endpoint candidates (Local Server Proxy -> Direct -> CORS Proxy Fallbacks)
  const directApiUrl = `${baseUrl}/api/otp?session=${encodeURIComponent(session)}`;
  const localProxyUrl = `/api/otp?session=${encodeURIComponent(session)}&target=${encodeURIComponent(baseUrl)}`;
  const corsProxyUrl1 = `https://corsproxy.io/?${encodeURIComponent(directApiUrl)}`;
  const corsProxyUrl2 = `https://api.allorigins.win/raw?url=${encodeURIComponent(directApiUrl)}`;

  const candidates = [localProxyUrl, directApiUrl, corsProxyUrl1, corsProxyUrl2];

  if (statusDot) statusDot.className = 'status-dot polling';

  for (const url of candidates) {
    if (!isPolling) break;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().length > 0) {
          extractAndHandleOtp(text);
          break;
        }
      }
    } catch (err) {
      // Try next candidate
    }
  }

  if (isPolling && statusDot) {
    statusDot.className = 'status-dot active';
  }
}

function extractAndHandleOtp(rawResponse) {
  let code = null;

  try {
    const json = JSON.parse(rawResponse);

    // Support otpbunk.vercel.app history format: {"history": [{"otp": "123456", ...}]}
    if (Array.isArray(json.history) && json.history.length > 0 && json.history[0].otp) {
      code = String(json.history[0].otp).trim();
    } else if (json.otp) {
      code = String(json.otp).trim();
    }
  } catch (e) {
    // Fallback JSON / Regex matching
  }

  if (!code) {
    // Regex fallback as in classes2.dex: "otp"\s*:\s*"(\d{6})"
    const match = rawResponse.match(/"otp"\s*:\s*"(\d{6})"/);
    if (match && match[1]) {
      code = match[1];
    } else {
      // General 6-digit match
      const genMatch = rawResponse.match(/\b\d{6}\b/);
      if (genMatch) code = genMatch[0];
    }
  }

  if (code && code !== lastReceivedOtp) {
    lastReceivedOtp = code;
    showPersistentOverlay(code);
    addLogEntry(code);
  }
}

  if (code && code !== lastReceivedOtp) {
    lastReceivedOtp = code;
    showPersistentOverlay(code);
    addLogEntry(code);
  }
}

function showPersistentOverlay(otpCode) {
  // Update overlay content
  overlayOtpCode.textContent = otpCode;
  overlayOtpTime.textContent = `Received at ${new Date().toLocaleTimeString()}`;

  // Show backdrop persistent overlay
  otpOverlayBackdrop.classList.add('visible');

  // Audio alert chime
  playNotificationSound();

  // Haptic feedback if supported on iOS / mobile
  if ('vibrate' in navigator) {
    navigator.vibrate([150, 80, 150]);
  }
}

function simulateTestOtp() {
  const randomOtp = Math.floor(100000 + Math.random() * 900000).toString();
  showPersistentOverlay(randomOtp);
  addLogEntry(randomOtp);
}

function addLogEntry(code) {
  const now = new Date().toLocaleTimeString();

  // Remove empty state message
  const emptyState = logsList.querySelector('.log-item[style*="justify-content: center"]');
  if (emptyState) {
    logsList.innerHTML = '';
  }

  const logItem = document.createElement('div');
  logItem.className = 'log-item';
  logItem.innerHTML = `
    <div>
      <span style="font-size: 0.8rem; color: var(--text-muted);">OTP:</span>
      <span class="log-code">${code}</span>
    </div>
    <span class="log-time">${now}</span>
  `;

  logsList.prepend(logItem);
}

function clearLogs() {
  logsList.innerHTML = `
    <div class="log-item" style="justify-content: center; color: var(--text-muted);">
      No OTPs received yet. Click Start Receiver or Simulate Test OTP.
    </div>
  `;
}

// Synthesize iOS alert chime using Web Audio API
function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';

    osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.1);

    osc2.start(ctx.currentTime + 0.1);
    osc2.stop(ctx.currentTime + 0.4);
  } catch (e) {
    console.log('Audio alert playback error:', e);
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.log('Service Worker registration skipped:', err);
    });
  }
}
