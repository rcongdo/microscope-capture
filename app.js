const video = document.getElementById('preview');
const canvas = document.getElementById('capture-canvas');
const cameraSelect = document.getElementById('camera-select');
const filenameInput = document.getElementById('filename-input');
const captureBtn = document.getElementById('capture-btn');
const errorMessage = document.getElementById('error-message');
const infoBtn = document.getElementById('info-btn');
const infoPanel = document.getElementById('info-panel');
const settingsGrid = document.getElementById('settings-grid');

let currentStream = null;

const SETTINGS_META = [
  { key: 'width',                label: 'Width',           unit: 'px'  },
  { key: 'height',               label: 'Height',          unit: 'px'  },
  { key: 'aspectRatio',          label: 'Aspect Ratio',    unit: ''    },
  { key: 'frameRate',            label: 'Frame Rate',      unit: 'fps' },
  { key: 'exposureMode',         label: 'Exposure Mode',   unit: ''    },
  { key: 'exposureTime',         label: 'Exposure Time',   unit: 'ms'  },
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

function timestampFilename() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `capture-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function formatValue(key, value, unit) {
  if (key === 'deviceId') return String(value).slice(0, 16) + '…';
  if (key === 'aspectRatio') return Number(value).toFixed(2);
  if (key === 'frameRate') return Number(value).toFixed(1) + (unit ? ' ' + unit : '');
  return String(value) + (unit ? ' ' + unit : '');
}

function hideInfoPanel() {
  infoPanel.classList.add('hidden');
  infoBtn.classList.remove('active');
  infoBtn.setAttribute('aria-expanded', 'false');
}

function showInfoPanel() {
  const track = currentStream && currentStream.getVideoTracks()[0];
  const settings = track ? track.getSettings() : {};
  settingsGrid.innerHTML = '';
  SETTINGS_META.forEach(({ key, label, unit }) => {
    if (settings[key] === undefined) return;
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = formatValue(key, settings[key], unit);
    settingsGrid.appendChild(dt);
    settingsGrid.appendChild(dd);
  });
  infoPanel.classList.remove('hidden');
  infoBtn.classList.add('active');
  infoBtn.setAttribute('aria-expanded', 'true');
}

function toggleInfoPanel() {
  if (infoPanel.classList.contains('hidden')) {
    showInfoPanel();
  } else {
    hideInfoPanel();
  }
}

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
    audio: false
  };
  currentStream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = currentStream;
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

init();

infoBtn.addEventListener('click', toggleInfoPanel);

cameraSelect.addEventListener('change', async () => {
  try {
    await startStream(cameraSelect.value);
  } catch (err) {
    showError('Could not switch camera. Please try again or reload.');
  }
});

captureBtn.addEventListener('click', () => {
  if (!currentStream || video.readyState < 2) return;

  const rawName = filenameInput.value.trim() || timestampFilename();
  const filename = rawName.replace(/[/\\:*?"<>|]/g, '_');

  const track = currentStream && currentStream.getVideoTracks()[0];
  const settings = track ? track.getSettings() : {};
  const width = settings.width || video.videoWidth;
  const height = settings.height || video.videoHeight;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, width, height);

  canvas.toBlob(blob => {
    if (!blob) {
      showError('Capture failed: could not encode the frame. Please try again.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    filenameInput.value = timestampFilename();
  }, 'image/png');
});
