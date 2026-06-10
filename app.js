const video = document.getElementById('preview');
const capturePreview = document.getElementById('capture-preview');
const canvas = document.getElementById('capture-canvas');
const cameraSelect = document.getElementById('camera-select');
const filenameInput = document.getElementById('filename-input');
const extLabel = document.querySelector('.ext-label');
const captureBtn = document.getElementById('capture-btn');
const retakeBtn = document.getElementById('retake-btn');
const errorMessage = document.getElementById('error-message');
const infoBtn = document.getElementById('info-btn');
const infoPanel = document.getElementById('info-panel');
const settingsGrid = document.getElementById('settings-grid');

let currentStream = null;
let captureBlob = null;      // non-null while in capture mode
let captureMimeType = 'image/png';

const SETTINGS_META = [
  { key: 'width',                label: 'Width',           unit: 'px'  },
  { key: 'height',               label: 'Height',          unit: 'px'  },
  { key: 'aspectRatio',          label: 'Aspect Ratio',    unit: ''    },
  { key: 'frameRate',            label: 'Frame Rate',      unit: 'fps' },
  { key: 'exposureMode',         label: 'Exposure Mode',   unit: ''    },
  { key: 'exposureTime',         label: 'Exposure Time',   unit: 'µs'  },
  { key: 'exposureCompensation', label: 'Exposure Comp.',  unit: 'EV'  },
  { key: 'brightness',           label: 'Brightness',      unit: ''    },
  { key: 'whiteBalanceMode',     label: 'White Balance',   unit: ''    },
  { key: 'colorTemperature',     label: 'Color Temp.',     unit: 'K'   },
  { key: 'contrast',             label: 'Contrast',        unit: ''    },
  { key: 'saturation',           label: 'Saturation',      unit: ''    },
  { key: 'sharpness',            label: 'Sharpness',       unit: ''    },
  { key: 'focusMode',            label: 'Focus Mode',      unit: ''    },
  { key: 'focusDistance',        label: 'Focus Distance',  unit: 'm'   },
  { key: 'facingMode',           label: 'Facing Mode',     unit: ''    },
  { key: 'zoom',                 label: 'Zoom',            unit: ''    },
  { key: 'pan',                  label: 'Pan',             unit: ''    },
  { key: 'tilt',                 label: 'Tilt',            unit: ''    },
  { key: 'deviceId',             label: 'Device ID',       unit: ''    },
];

const EXIF_TAG_MAP = [
  { key: 'ImageWidth',      label: 'Width' },
  { key: 'ImageHeight',     label: 'Height' },
  { key: 'ISO',             label: 'ISO' },
  { key: 'ExposureTime',    label: 'Exposure Time' },
  { key: 'FNumber',         label: 'F-Number' },
  { key: 'FocalLength',     label: 'Focal Length' },
  { key: 'WhiteBalance',    label: 'White Balance' },
  { key: 'BrightnessValue', label: 'Brightness' },
  { key: 'Flash',           label: 'Flash' },
  { key: 'ColorSpace',      label: 'Color Space' },
  { key: 'DateTimeOriginal',label: 'Captured At' },
];

// ── Utilities ────────────────────────────────────────────────────────────────

function timestampFilename() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `capture-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function formatValue(key, value, unit) {
  if (key === 'deviceId') { const s = String(value); return s.length > 16 ? s.slice(0, 16) + '…' : s; }
  if (key === 'aspectRatio') return Number(value).toFixed(2);
  if (key === 'frameRate') return Number(value).toFixed(1) + (unit ? ' ' + unit : '');
  return String(value) + (unit ? ' ' + unit : '');
}

function formatExifValue(key, value) {
  if (value === undefined || value === null) return undefined;
  if (key === 'ExposureTime') {
    if (value === 0) return '0s';
    return value >= 1 ? `${value}s` : `1/${Math.round(1 / value)}s`;
  }
  if (key === 'FNumber') return `f/${value}`;
  if (key === 'FocalLength') return `${value} mm`;
  if (key === 'WhiteBalance') return value === 0 ? 'Auto' : value === 1 ? 'Manual' : String(value);
  if (key === 'ColorSpace') return value === 1 ? 'sRGB' : value === 65535 ? 'Uncalibrated' : String(value);
  if (key === 'Flash') return value === 0 ? 'No flash' : String(value);
  if (key === 'DateTimeOriginal') return value instanceof Date ? value.toLocaleString() : String(value);
  if (key === 'ImageWidth' || key === 'ImageHeight') return `${value} px`;
  return String(value);
}

function populateGrid(rows) {
  settingsGrid.innerHTML = '';
  rows.forEach(({ label, value }) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    settingsGrid.appendChild(dt);
    settingsGrid.appendChild(dd);
  });
}

// ── Info panel ───────────────────────────────────────────────────────────────

function hideInfoPanel() {
  infoPanel.classList.add('hidden');
  infoBtn.classList.remove('active');
  infoBtn.setAttribute('aria-expanded', 'false');
}

function openInfoPanel() {
  infoPanel.classList.remove('hidden');
  infoBtn.classList.add('active');
  infoBtn.setAttribute('aria-expanded', 'true');
}

function toggleInfoPanel() {
  if (!infoPanel.classList.contains('hidden')) {
    hideInfoPanel();
    return;
  }
  // In capture mode the grid is already populated with EXIF — just open
  if (captureBlob) {
    openInfoPanel();
    return;
  }
  // Live mode — populate stream settings then open
  const track = currentStream && currentStream.getVideoTracks()[0];
  const settings = track ? track.getSettings() : {};
  const rows = [];
  SETTINGS_META.forEach(({ key, label, unit }) => {
    if (settings[key] === undefined) return;
    rows.push({ label, value: formatValue(key, settings[key], unit) });
  });
  populateGrid(rows);
  openInfoPanel();
}

async function showExifPanel(blob, mimeType) {
  let rows = [];
  // PNG captures (canvas fallback on Safari / unsupported cameras) have no EXIF
  if (mimeType !== 'image/jpeg') {
    rows = [{ label: 'EXIF', value: 'Not available — use Chrome or Edge for EXIF metadata.' }];
    populateGrid(rows);
    openInfoPanel();
    return;
  }
  try {
    const exif = await exifr.parse(blob, {
      tiff: true, xmp: false, icc: false, iptc: false,
      pick: ['Make', 'Model', 'ImageWidth', 'ImageHeight', 'ISO',
             'ExposureTime', 'FNumber', 'FocalLength', 'WhiteBalance',
             'BrightnessValue', 'Flash', 'ColorSpace', 'DateTimeOriginal'],
    });
    if (exif) {
      const camera = [exif.Make, exif.Model].filter(Boolean).join(' ');
      if (camera) rows.push({ label: 'Camera', value: camera });
      EXIF_TAG_MAP.forEach(({ key, label }) => {
        const formatted = formatExifValue(key, exif[key]);
        if (formatted !== undefined) rows.push({ label, value: formatted });
      });
    }
  } catch (_) {
    // parse failed — fall through to no-EXIF message
  }
  if (rows.length === 0) {
    rows = [{ label: 'EXIF', value: 'This camera does not report EXIF metadata.' }];
  }
  populateGrid(rows);
  openInfoPanel();
}

// ── Error handling ────────────────────────────────────────────────────────────

function showError(message) {
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
  }
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
  video.classList.add('hidden');
  cameraSelect.closest('#camera-select-row').classList.add('hidden');
  infoBtn.classList.add('hidden');
  captureBtn.disabled = true;
  hideInfoPanel();
}

// ── Camera stream ─────────────────────────────────────────────────────────────

async function getDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === 'videoinput');
}

async function startStream(deviceId) {
  hideInfoPanel();
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
  }
  const constraints = {
    video: deviceId ? { deviceId: { exact: deviceId } } : true,
    audio: false,
  };
  currentStream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = currentStream;
  infoBtn.classList.remove('hidden');
  video.classList.remove('hidden');
  cameraSelect.closest('#camera-select-row').classList.remove('hidden');
}

async function populateCameraList() {
  const devices = await getDevices();
  cameraSelect.innerHTML = '';
  if (devices.length === 0) {
    showError('No camera detected. Please connect your USB microscope and reload.');
    return false;
  }
  devices.forEach((device, i) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `Camera ${i + 1}`;
    cameraSelect.appendChild(option);
  });
  return true;
}

async function init() {
  filenameInput.value = timestampFilename();
  try {
    await startStream(null);
    const hasDevices = await populateCameraList();
    if (!hasDevices) return;
    await startStream(cameraSelect.value);
  } catch (err) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      showError('Camera access was denied. Please allow camera access in your browser settings and reload the page.');
    } else {
      showError('No camera detected. Please connect your USB microscope and reload.');
    }
  }
}

// ── Capture ───────────────────────────────────────────────────────────────────

async function capturePhoto() {
  const track = currentStream && currentStream.getVideoTracks()[0];
  // Try ImageCapture API first (Chrome / Edge)
  if (track && typeof ImageCapture !== 'undefined') {
    try {
      const imageCapture = new ImageCapture(track);
      const blob = await imageCapture.takePhoto();
      return { blob, mimeType: blob.type || 'image/jpeg' };
    } catch (_) {
      // fall through to canvas
    }
  }
  // Canvas fallback (Safari)
  const settings = track ? track.getSettings() : {};
  const width = settings.width || video.videoWidth;
  const height = settings.height || video.videoHeight;
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(video, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('canvas toBlob failed')); return; }
      resolve({ blob, mimeType: 'image/png' });
    }, 'image/png');
  });
}

function enterCaptureMode(blob, mimeType) {
  captureBlob = blob;
  captureMimeType = mimeType;
  extLabel.textContent = mimeType === 'image/jpeg' ? '.jpg' : '.png';
  capturePreview.src = URL.createObjectURL(blob);
  capturePreview.classList.remove('hidden');
  video.classList.add('hidden');
  retakeBtn.classList.remove('hidden');
  captureBtn.textContent = 'Save';
  showExifPanel(blob, mimeType);
}

function exitCaptureMode() {
  URL.revokeObjectURL(capturePreview.src);
  capturePreview.src = '';
  capturePreview.classList.add('hidden');
  captureBlob = null;
  video.classList.remove('hidden');
  retakeBtn.classList.add('hidden');
  captureBtn.textContent = 'Capture';
  extLabel.textContent = '.png';
  filenameInput.value = timestampFilename();
  hideInfoPanel();
}

function saveCapture() {
  const rawName = filenameInput.value.trim() || timestampFilename();
  const filename = rawName.replace(/[/\\:*?"<>|]/g, '_');
  const ext = captureMimeType === 'image/jpeg' ? '.jpg' : '.png';
  const url = URL.createObjectURL(captureBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  exitCaptureMode();
}

// ── Event listeners ───────────────────────────────────────────────────────────

init();

infoBtn.addEventListener('click', toggleInfoPanel);

retakeBtn.addEventListener('click', exitCaptureMode);

cameraSelect.addEventListener('change', async () => {
  try {
    await startStream(cameraSelect.value);
  } catch (err) {
    showError('Could not switch camera. Please try again or reload.');
  }
});

captureBtn.addEventListener('click', async () => {
  if (captureBlob) {
    // Capture mode — save the captured image
    saveCapture();
    return;
  }
  // Live mode — take a photo
  if (!currentStream || video.readyState < 2) return;
  try {
    const { blob, mimeType } = await capturePhoto();
    enterCaptureMode(blob, mimeType);
  } catch (_) {
    showError('Capture failed: could not encode the frame. Please try again.');
  }
});
