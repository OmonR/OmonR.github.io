const webapp = window.Telegram.WebApp;
webapp.ready();
webapp.expand();

const initData = webapp.initData;
const params = webapp.themeParams;
const root = document.documentElement;

if (params) {
  Object.entries(params).forEach(([key, val]) => {
    const cssVar = `--tg-theme-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    root.style.setProperty(cssVar, val);
  });
}

// DOM
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

let stream        = null;
let videoTrack    = null;
let currentZoom   = 1;
let isTorchOn     = false;
let photoTaken    = false;
let sessionPhotos = [];
const REQUIRED_PHOTOS = 4;

// Инициализируем карту
const map = L.map('map').setView([51.505, -0.09], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Переключение видов
function showError(msg) {
  errorMessage.textContent = msg;
  errorMessage.style.display = 'block';
}

function hideError() {
  errorMessage.style.display = 'none';
}

function switchView(view) {
  hideError();
  navButtons.forEach(b => b.classList.toggle('active', b.dataset.view === view));
  views.forEach(v => v.id === `${view}View`
    ? v.classList.add('active')
    : v.classList.remove('active')
  );
  document.querySelector('.nav-tabs').classList.remove('hidden');

  if (view === 'camera' || view === 'session') {
    startCamera(view);
  } else {
    stopCamera();
  }

  if (view === 'session') {
    updateSessionUI();
  }
}

// Запускаем приложение
if (!initData) {
  document.querySelector('.container').classList.add('hidden');
  document.getElementById('forbiddenPage').classList.remove('hidden');
} else {
  initApp();    // ваша реализация
  switchView('map');
}

// Камера
async function startCamera(view) {
  if (stream) stopCamera();
  if (photoTaken) resetCameraView();

  const videoEl   = view === 'session' ? sessionVideo : video;
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
    showError('Не удалось получить доступ к камере.');
  }
}

function stopCamera() {
  if (!stream) return;
  stream.getTracks().forEach(t => t.stop());
  stream = null;
  videoTrack = null;

  [video, sessionVideo].forEach(v => v.srcObject = null);
  [captureButton, sessionCaptureButton].forEach(btn => btn.disabled = true);
}

function resetCameraView() {
  photoTaken = false;
  video.style.display = 'block';
  canvas.style.display = 'none';
  captureButton.classList.remove('hidden');
  captureButton.disabled = false;
}

function setupZoomAndTorch() {
  const cap = videoTrack.getCapabilities();

  // Zoom
  if (cap.zoom) {
    zoomSlider.min = cap.zoom.min;
    zoomSlider.max = cap.zoom.max;
    zoomSlider.step = 0.01;
    zoomSlider.value = currentZoom;
    zoomValue.textContent = `${currentZoom.toFixed(2)}x`;
    zoomSlider.style.display = 'block';
    zoomValue.style.display = 'block';

    zoomSlider.oninput = async () => {
      currentZoom = parseFloat(zoomSlider.value);
      zoomValue.textContent = `${currentZoom.toFixed(2)}x`;
      try {
        await videoTrack.applyConstraints({ advanced: [{ zoom: currentZoom }] });
      } catch (_) {}
    };
  }

  // Torch
  if (cap.torch) {
    flashButton.style.display = 'block';
    flashButton.onclick = async () => {
      isTorchOn = !isTorchOn;
      try {
        await videoTrack.applyConstraints({ advanced: [{ torch: isTorchOn }] });
        flashButton.style.opacity = isTorchOn ? '0.7' : '1';
      } catch {
        alert('Фонарик не поддерживается этим устройством.');
      }
    };
  }
}

// Снимок фото + обрезка
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
  const w   = v.videoWidth;
  const h   = v.videoHeight;

  c.width  = w;
  c.height = h;
  ctx.drawImage(v, 0, 0, w, h);

  return c.toDataURL('image/jpeg');
}

// События захвата и возврата
captureButton.addEventListener('click', () => {
  photoTaken = true;
  const data = captureAndCropPhoto(video, canvas);
  video.style.display    = 'none';
  canvas.style.display   = 'block';
  captureButton.classList.add('hidden');
  document.querySelector('.nav-tabs').classList.add('hidden');
  showReviewButtons(); // ваша реализация
});

sessionCaptureButton.addEventListener('click', () => {
  const photo = capturePhoto(sessionVideo, sessionCanvas);
  if (sessionPhotos.length < REQUIRED_PHOTOS) {
    sessionPhotos.push(photo);
  }
  updateSessionUI(); // ваша реализация
  if (sessionPhotos.length === REQUIRED_PHOTOS) {
    sendSessionData(); // ваша реализация
  } else {
    setTimeout(() => startCamera('session'), 500);
  }
});

backToCameraBtn.addEventListener('click', () => {
  hideSpinner();           // ваша реализация
  hideReviewButtons();     // ваша реализация
  photoTaken = false;
  resetCameraView();
  startCamera('camera');
  document.querySelector('.nav-tabs').classList.remove('hidden');
});

// Остальные функции: updateSessionUI, sendSessionData, initApp и т.п.

 
 let reviewHandlerAttached = false;
 
 function showReviewButtons() {
     const btn = document.getElementById('submitOdometerPhoto');
 
     if (!reviewHandlerAttached) {
         btn.addEventListener('click', handleSubmitPhoto);
         reviewHandlerAttached = true;
     }
 
     document.getElementById('reviewButtons').classList.remove('hidden');
 }
 
 
 let recognizedOdometer = null;
 let lastOdometerPhoto = null;
 let lastRecognizedOdometerPhoto = null; 
 
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

        // Только распознаем одометр, не сохраняем в S3
        const res = await fetch('https://autopark-gthost.amvera.io/api/odometer/recognize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `tma ${initData}`
            },
            body: JSON.stringify({
                photo: base64image,
                car_id: Number(carId),
                action: action
            }),
        });

        const result = await res.json();

        if (res.ok) {
            if (result.status === 'ok') {
                recognizedOdometer = result.odometer;
                showCheckmark();
                setTimeout(() => {
                    switchView('session');
                }, 1000);
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


 async function notifyServer(eventPayload) {
     const body = { chat_id: chatId, message_id: msgId, event: eventPayload, init_data: initData};
     try {
       const res = await fetch('https://autopark-gthost.amvera.io/api/webapp/callback', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(body),
       });
       const json = await res.json();
       console.log('Callback response:', json);
     } catch (err) {
       console.error('Callback error:', err);
       showError(err);
       return;
     }
     // Только после того, как мы точно получили ответ:
     setTimeout(() => webapp.close(), 100);
   }
 
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

    const finalOdometer = recognizedOdometer !== null && recognizedOdometer !== undefined ? recognizedOdometer : odo;

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
            await notifyServer({
                event: action,
                car_id: Number(carId)
            });

            showNotification(result.message || '✅ ОК');
        } else {
            const msg = result.detail || '❌ Ошибка при отправке';
            showError(msg);
        }
    } catch (e) {
        console.error(e);
        showError('⚠️ Ошибка соединения с сервером');
    }
}
 
 function showForbiddenError() {
     document.querySelector('.container').classList.add('hidden');
     document.getElementById('forbiddenPage').classList.remove('hidden');
 }
 
 // 5. Event Listeners
 navButtons.forEach(button => {
     button.addEventListener('click', () => {
         const view = button.dataset.view;
         switchView(view);
     });
 });
 
 map.on('click', e => createDraggableMarker(e.latlng));
 
 locationButton.addEventListener('click', () => {
     if (!navigator.geolocation) {
         showError('Geolocation is not supported by your browser.');
         return;
     }
 
     navigator.geolocation.getCurrentPosition(
         ({ coords }) => {
             createDraggableMarker([coords.latitude, coords.longitude]);
             map.setView([coords.latitude, coords.longitude], 15);
         },
         () => showError('Please enable location services to continue.')
     );
 });
 
 captureButton.addEventListener('click', () => {
     const croppedPhoto = captureAndCropPhoto(video, canvas);
     stopCamera();
     canvas.style.display = 'block';
     video.style.display = 'none';
     captureButton.style.display = 'none';
 
     // Скрываем nav-button
     document.querySelector('.nav-tabs').classList.add('hidden');
     
     showReviewButtons();
 });
 
 sessionCaptureButton.addEventListener('click', () => {
     const photoData = capturePhoto(sessionVideo, sessionCanvas);
     if (sessionPhotos.length < REQUIRED_PHOTOS) {
         sessionPhotos.push(photoData);
     }
     updateSessionUI();
 
     if (sessionPhotos.length === REQUIRED_PHOTOS) {
         showNotification('📤 Отправка данных...');
         setTimeout(() => sendSessionData(), 1000);
     } else {
         setTimeout(() => startCamera('session'), 500);
     }
 });
 
 continueButton.addEventListener('click', () => switchView('camera'));
 backButton.addEventListener('click', () => startCamera('camera'));
 
 odometer.addEventListener('input', () => {
     continueToPhotos.disabled = !odometer.value;
 });
 
 continueToPhotos.addEventListener('click', () => {
     if (odometer.value) switchView('session');
 });
 
 // 6. Initialize Application
 function initApp() {
    fetch(`https://autopark-gthost.amvera.io/api/auth?car_id=${carId}&action=${action}`, {
        method: 'POST',
        headers: {
            'Authorization': `tma ${initData}`
        }
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
        if (data?.status === 'ok') {
            switchView('map'); 
        }
    })
    .catch(err => {
        console.error('Auth failed', err);
        alert('Ошибка авторизации.');
        alert(err);
        setTimeout(() => webapp.close(), 2000);
    });
}