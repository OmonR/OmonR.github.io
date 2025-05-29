const webapp = window.Telegram.WebApp;
webapp.ready();
webapp.expand();

const initData = webapp.initData;
const params   = webapp.themeParams;
const root     = document.documentElement;

// Theme vars
if (params) {
  root.style.setProperty('--tg-theme-bg-color',    params.bg_color);
  root.style.setProperty('--tg-theme-text-color',  params.text_color);
  root.style.setProperty('--tg-theme-hint-color',  params.hint_color);
  root.style.setProperty('--tg-theme-link-color',  params.link_color);
  root.style.setProperty('--tg-theme-button-color',    params.button_color);
  root.style.setProperty('--tg-theme-button-text-color', params.button_text_color);
}

// DOM elements
const navButtons           = document.querySelectorAll('.nav-button');
const views                = document.querySelectorAll('.view');
const locationButton       = document.getElementById('locationButton');
const continueButton       = document.getElementById('continueButton');
const errorMessage         = document.getElementById('camera-error');

const video                = document.getElementById('video');
const canvas               = document.getElementById('canvas');
const captureButton        = document.getElementById('captureButton');
const backToCameraBtn      = document.getElementById('backToCamera');
const odometerInput        = document.getElementById('odometerInput');
const odometer             = document.getElementById('odometer');

const sessionVideo         = document.getElementById('sessionVideo');
const sessionCanvas        = document.getElementById('sessionCanvas');
const sessionCaptureButton = document.getElementById('sessionCaptureButton');
const photoCounter         = document.getElementById('photoCounter');

const flashButton          = document.getElementById('flashButton');
const zoomSlider           = document.getElementById('zoomSlider');
const zoomValue            = document.getElementById('zoomValue');

let stream           = null;
let videoTrack       = null;
let currentZoom      = 1;
let isTorchOn        = false;
let photoTaken       = false;
let sessionPhotos    = [];
let currentMarker    = null;
const REQUIRED_PHOTOS = 4;

// Initialize map
const map = L.map('map').setView([51.505, -0.09], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Show/hide error
function showError(msg) {
  errorMessage.textContent = msg;
  errorMessage.style.display = 'block';
}
function hideError() {
  errorMessage.style.display = 'none';
}

// Switch view
function switchView(view) {
  hideError();
  navButtons.forEach(b => b.classList.toggle('active', b.dataset.view === view));
  views.forEach(v => {
    v.id === `${view}View`
      ? v.classList.add('active')
      : v.classList.remove('active');
  });
  // always show nav-tabs (we control when to hide it)
  document.querySelector('.nav-tabs').classList.remove('hidden');

  if (view === 'camera' || view === 'session') startCamera(view);
  else stopCamera();

  if (view === 'session') updateSessionUI();
}

// Create draggable marker and show continue button
function createDraggableMarker(latlng) {
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker(latlng, { draggable: true }).addTo(map);
  continueButton.classList.remove('hidden');
}
map.on('click', e => createDraggableMarker(e.latlng));

// Location button
locationButton.addEventListener('click', () => {
  if (!navigator.geolocation) return showError('Geolocation отсутствует');
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      createDraggableMarker([coords.latitude, coords.longitude]);
      map.setView([coords.latitude, coords.longitude], 15);
    },
    () => showError('Разрешите геолокацию')
  );
});

// Continue to camera
continueButton.addEventListener('click', () => switchView('camera'));

// Initialize or forbidden
if (!initData) {
  document.querySelector('.container').classList.add('hidden');
  document.getElementById('forbiddenPage').classList.remove('hidden');
} else {
  initApp();  // ваша функция авторизации
  switchView('map');
}

// Start camera
async function startCamera(view) {
  if (stream) stopCamera();
  if (photoTaken) resetCameraView();

  const videoEl    = view === 'session' ? sessionVideo : video;
  const captureBtn = view === 'session' ? sessionCaptureButton : captureButton;

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    videoEl.srcObject = stream;
    videoTrack = stream.getVideoTracks()[0];
    setupZoomAndTorch();
    await videoEl.play();

    captureBtn.classList.remove('hidden');
    captureBtn.disabled = false;
  } catch (e) {
    console.error(e);
    showError('Не удалось запустить камеру');
  }
}

function stopCamera() {
  if (!stream) return;
  stream.getTracks().forEach(t => t.stop());
  stream = null;
  videoTrack = null;
  [video, sessionVideo].forEach(v => v.srcObject = null);
  [captureButton, sessionCaptureButton].forEach(b => b.disabled = true);
}

function resetCameraView() {
  photoTaken = false;
  video.style.display  = 'block';
  canvas.style.display = 'none';
  captureButton.classList.remove('hidden');
  captureButton.disabled = false;
}

// Zoom & torch
function setupZoomAndTorch() {
  const cap = videoTrack.getCapabilities();

  if (cap.zoom) {
    zoomSlider.min   = cap.zoom.min;
    zoomSlider.max   = cap.zoom.max;
    zoomSlider.step  = 0.01;
    zoomSlider.value = currentZoom;
    zoomValue.textContent = `${currentZoom.toFixed(2)}x`;
    zoomSlider.style.display = 'block';
    zoomValue.style.display  = 'block';

    zoomSlider.oninput = async () => {
      currentZoom = parseFloat(zoomSlider.value);
      zoomValue.textContent = `${currentZoom.toFixed(2)}x`;
      try {
        await videoTrack.applyConstraints({ advanced: [{ zoom: currentZoom }] });
      } catch {}
    };
  }

  if (cap.torch) {
    flashButton.style.display = 'block';
    flashButton.onclick = async () => {
      isTorchOn = !isTorchOn;
      try {
        await videoTrack.applyConstraints({ advanced: [{ torch: isTorchOn }] });
        flashButton.style.opacity = isTorchOn ? '0.7' : '1';
      } catch {
        alert('Фонарик не поддерживается');
      }
    };
  }
}

// Capture functions
function captureAndCropPhoto(v, c) {
  const ctx = c.getContext('2d');
  const w   = v.videoWidth;
  const h   = v.videoHeight;
  const z   = currentZoom;

  const cw = w / z;
  const ch = h / z;
  const cx = (w - cw) / 2;
  const cy = (h - ch) / 2;

  c.width  = cw;
  c.height = ch;
  ctx.drawImage(v, cx, cy, cw, ch, 0, 0, cw, ch);
  return c.toDataURL('image/jpeg');
}
function capturePhoto(v, c) {
  const ctx = c.getContext('2d');
  c.width  = v.videoWidth;
  c.height = v.videoHeight;
  ctx.drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg');
}

// Capture button
captureButton.addEventListener('click', () => {
  photoTaken = true;
  const imgData = captureAndCropPhoto(video, canvas);
  video.style.display = 'none';
  canvas.style.display = 'block';
  captureButton.classList.add('hidden');
  document.querySelector('.nav-tabs').classList.add('hidden');
  showReviewButtons();  // ваша функция
});

// Session capture
sessionCaptureButton.addEventListener('click', () => {
  const photo = capturePhoto(sessionVideo, sessionCanvas);
  if (sessionPhotos.length < REQUIRED_PHOTOS) sessionPhotos.push(photo);
  updateSessionUI();  // ваша функция
  if (sessionPhotos.length === REQUIRED_PHOTOS) {
    sendSessionData(); // ваша функция
  } else {
    setTimeout(() => startCamera('session'), 500);
  }
});

// Back to camera
backToCameraBtn.addEventListener('click', () => {
  hideSpinner();       // ваша функция
  hideReviewButtons(); // ваша функция
  photoTaken = false;
  resetCameraView();
  startCamera('camera');
  document.querySelector('.nav-tabs').classList.remove('hidden');
});

// Опрос и переход к просмотру фото
continueButton.addEventListener('click', () => switchView('camera'));

odometer.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (!odometer.value) {
      showError('Пожалуйста, введите показания одометра');
      return;
    }
    if (window.Telegram?.WebApp?.HapticFeedback) {
      Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
    switchView('session');
  }
});

// Сессия фотографий
function updateSessionUI() {
  photoCounter.innerHTML = '';
  sessionPhotos.forEach((src, i) => {
    const slot = document.createElement('div');
    slot.className = `photo-slot-mini ${src ? 'filled' : 'empty'}`;
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      slot.appendChild(img);
    } else {
      slot.textContent = i + 1;
    }
    photoCounter.appendChild(slot);
  });
}

// Загрузка одометра
async function uploadOdometerPhoto(base64Photo, recognizedPhotoBase64, carId, odometerValue, initData) {
  try {
    const response = await fetch("https://autopark-gthost.amvera.io/api/odometer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `tma ${initData}`
      },
      body: JSON.stringify({
        photo: base64Photo,
        recognized_photo: recognizedPhotoBase64 || null,
        car_id: carId,
        odometer_value: odometerValue || null
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "Failed to upload odometer photo");
    console.log("📸 Фото успешно загружено:", result);
    return result;
  } catch (error) {
    console.error("❌ Ошибка загрузки фото одометра:", error);
    return null;
  }
}

async function handleSubmitPhoto() {
  showSpinner();
  try {
    if (canvas.width === 0 || canvas.height === 0) {
      hideSpinner();
      return;
    }
    const base64image = canvas.toDataURL('image/jpeg');
    lastOdometerPhoto = base64image;
    const res = await fetch('https://autopark-gthost.amvera.io/api/odometer/recognize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `tma ${initData}`
      },
      body: JSON.stringify({
        photo: base64image,
        car_id: Number(carId),
        action
      }),
    });
    const result = await res.json();
    if (res.ok) {
      if (result.status === 'ok') {
        recognizedOdometer = result.odometer;
        showCheckmark();
        setTimeout(() => switchView('session'), 1000);
      } else if (result.status === 'processing') {
        alert("Не удалось распознать значение");
        switchView('camera');
        document.getElementById('reviewButtons').classList.add('hidden');
      }
    } else {
      console.error("Ошибка при запросе: ", result);
    }
  } catch (err) {
    console.error("Ошибка запроса:", err);
  } finally {
    hideSpinner();
  }
}

// Отправка callback
async function notifyServer(eventPayload) {
  const body = { chat_id: chatId, message_id: msgId, event: eventPayload, init_data: initData };
  try {
    const res = await fetch('https://autopark-gthost.amvera.io/api/webapp/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    console.log('Callback response:', await res.json());
  } catch (err) {
    console.error('Callback error:', err);
    showError(err);
    return;
  }
  setTimeout(() => webapp.close(), 100);
}

// Отправка отчёта
async function sendSessionData() {
  if (!initData) {
    showError('❌ Не удалось получить данные Telegram.');
    return;
  }
  const marker = currentMarker?.getLatLng?.();
  if (!marker) {
    showError('❌ Координаты не выбраны.');
    return;
  }
  const odo = Number(odometer.value);
  if (isNaN(odo) || odo < 0) {
    showError('❌ Пожалуйста, укажите корректный пробег.');
    return;
  }
  if (sessionPhotos.length !== REQUIRED_PHOTOS) {
    showError('❌ Необходимо 4 фото.');
    return;
  }
  if (!lastOdometerPhoto) {
    showError('❌ Отсутствует фото одометра.');
    return;
  }
  const finalOdometer = recognizedOdometer ?? odo;
  const payload = {
    car_id: Number(carId),
    action,
    latitude: marker.lat,
    longitude: marker.lng,
    odometer: finalOdometer,
    photos: sessionPhotos,
    odometer_photo: lastOdometerPhoto,
    init_data: initData
  };
  try {
    const res = await fetch('https://autopark-gthost.amvera.io/api/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `tma ${initData}`
      },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (res.ok && result.status === 'ok') {
      await notifyServer({ event: action, car_id: Number(carId) });
      showNotification(result.message || '✅ ОК');
    } else {
      showError(result.detail || '❌ Ошибка при отправке');
    }
  } catch (e) {
    console.error(e);
    showError('⚠️ Ошибка соединения с сервером');
  }
}

// UI: спиннер и галочка
function showSpinner() {
  const el = document.getElementById('photoStatus');
  el.classList.remove('hidden', 'check');
  el.querySelector('.spinner').style.display = 'block';
}
function hideSpinner() {
  document.getElementById('photoStatus').classList.add('hidden');
}
function showCheckmark() {
  const el = document.getElementById('photoStatus');
  el.classList.add('check');
  el.querySelector('.spinner').style.display = 'none';
}

// Управление кнопками ревью
let reviewHandlerAttached = false;
function showReviewButtons() {
  const btn = document.getElementById('submitOdometerPhoto');
  if (!reviewHandlerAttached) {
    btn.addEventListener('click', handleSubmitPhoto);
    reviewHandlerAttached = true;
  }
  document.getElementById('reviewButtons').classList.remove('hidden');
}
function hideReviewButtons() {
  document.getElementById('reviewButtons').classList.add('hidden');
}

// Инициализация сессии
function initApp() {
  fetch(`https://autopark-gthost.amvera.io/api/auth?car_id=${carId}&action=${action}`, {
    method: 'POST',
    headers: { 'Authorization': `tma ${initData}` }
  })
  .then(res => {
    if (res.status === 403) {
      alert('⛔ У вас уже есть активная сессия. Завершите её прежде, чем начинать новую.');
      setTimeout(() => webapp.close(), 100);
      return;
    }
    return res.json();
  })
  .then(data => {
    if (data?.status === 'ok') switchView('map');
  })
  .catch(err => {
    console.error('Auth failed', err);
    alert('Ошибка авторизации.');
    setTimeout(() => webapp.close(), 2000);
  });
}

// Обработчики навигации и геолокации
navButtons.forEach(button => {
  button.addEventListener('click', () => switchView(button.dataset.view));
});
map.on('click', e => {
  createDraggableMarker(e.latlng);
});
locationButton.addEventListener('click', () => {
  if (!navigator.geolocation) return showError('Geolocation is not supported.');
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      createDraggableMarker([coords.latitude, coords.longitude]);
      map.setView([coords.latitude, coords.longitude], 15);
    },
    () => showError('Please enable location services.')
  );
});
