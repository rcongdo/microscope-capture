const video = document.getElementById('preview');
const canvas = document.getElementById('capture-canvas');
const cameraSelect = document.getElementById('camera-select');
const filenameInput = document.getElementById('filename-input');
const captureBtn = document.getElementById('capture-btn');
const errorMessage = document.getElementById('error-message');

let currentStream = null;

function timestampFilename() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `capture-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
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
  captureBtn.disabled = true;
}

async function getDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === 'videoinput');
}

async function startStream(deviceId) {
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
    // Initial getUserMedia call required before enumerateDevices returns labels
    await startStream(null);
    const hasDevices = await populateCameraList();
    if (!hasDevices) return;
    // Re-start with explicit deviceId so dropdown stays in sync
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

cameraSelect.addEventListener('change', async () => {
  try {
    await startStream(cameraSelect.value);
  } catch (err) {
    showError('Could not switch camera. Please try again or reload.');
  }
});

captureBtn.addEventListener('click', () => {
  const filename = filenameInput.value.trim() || timestampFilename();

  const track = currentStream && currentStream.getVideoTracks()[0];
  const settings = track ? track.getSettings() : {};
  const width = settings.width || video.videoWidth;
  const height = settings.height || video.videoHeight;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, width, height);

  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.png`;
    a.click();
    URL.revokeObjectURL(url);
    filenameInput.value = timestampFilename();
  }, 'image/png');
});
