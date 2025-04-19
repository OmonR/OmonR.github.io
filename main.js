
const webapp = window.Telegram.WebApp;
webapp.ready();
webapp.expand();


// Get signed initData string
const initData = webapp.initData;

// Set theme variables from Telegram theme params
const params = webapp.themeParams;
const root = document.documentElement;

if (params) {
    root.style.setProperty('--tg-theme-bg-color', params.bg_color);
    root.style.setProperty('--tg-theme-text-color', params.text_color);
    root.style.setProperty('--tg-theme-hint-color', params.hint_color);
    root.style.setProperty('--tg-theme-link-color', params.link_color);
    root.style.setProperty('--tg-theme-button-color', params.button_color);
    root.style.setProperty('--tg-theme-button-text-color', params.button_text_color);
}

// 2. DOM Elements and Variables
const navButtons = document.querySelectorAll('.nav-button');
const views = document.querySelectorAll('.view');
const locationButton = document.getElementById('locationButton');
const continueButton = document.getElementById('continueButton');
const errorMessage = document.getElementById('error-message');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureButton = document.getElementById('captureButton');
const backButton = document.getElementById('backButton');
const odometerInput = document.getElementById('odometerInput');
const odometer = document.getElementById('odometer');
const continueToPhotos = document.getElementById('continueToPhotos');
const sessionVideo = document.getElementById('sessionVideo');
const sessionCanvas = document.getElementById('sessionCanvas');
const sessionCaptureButton = document.getElementById('sessionCaptureButton');
const photoCounter = document.getElementById('photoCounter');
const photoGrid = document.getElementById('photoGrid');
const urlParams = new URLSearchParams(window.location.search);
const chatId = urlParams.get('chat_id');
const msgId  = urlParams.get('msg_id');
const carId  = urlParams.get('car_id');

const action = urlParams.get('action') || 'start';

let currentMarker = null;
let stream = null;
let photoTaken = false;
let sessionPhotos = [];
const REQUIRED_PHOTOS = 4;

// 3. Initialize Map
const map = L.map('map').setView([51.505, -0.09], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// 4. Utility Functions
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function switchView(view) {
    navButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    views.forEach(v => {
        v.classList.toggle('active', v.id === `${view}View`);
    });

    if (view === 'camera' || view === 'session') {
        startCamera(view);
    } else {
        stopCamera();
    }

    if (view === 'session') {
        updateSessionUI();
    }
}

function createDraggableMarker(latlng) {
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    currentMarker = L.marker(latlng, { draggable: true }).addTo(map);
    continueButton.classList.remove('hidden');
}

async function startCamera(view) {
    const videoElement = view === 'session' ? sessionVideo : video;
    const captureBtn = view === 'session' ? sessionCaptureButton : captureButton;

    if (photoTaken) resetCameraView();

    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        videoElement.srcObject = stream;
        captureBtn.disabled = false;

        videoElement.style.display = 'block';
        (view === 'session' ? sessionCanvas : canvas).style.display = 'none';
    } catch {
        showError('Camera access denied. Please grant permission.');
        captureBtn.disabled = true;
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    [video, sessionVideo].forEach(v => v.srcObject = null);
    [captureButton, sessionCaptureButton].forEach(btn => btn.disabled = true);
}

function resetCameraView() {
    photoTaken = false;
    video.style.display = 'block';
    canvas.style.display = 'none';
    captureButton.style.display = 'block';
    odometerInput.classList.add('hidden');
    backButton.classList.add('hidden');
    odometer.value = '';
}

function capturePhoto(video, canvas) {
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg');
}

function updateSessionUI() {
    photoCounter.textContent = `${sessionPhotos.length} из ${REQUIRED_PHOTOS} фото`;
    photoGrid.innerHTML = '';
    for (let i = 0; i < REQUIRED_PHOTOS; i++) {
        const slot = document.createElement('div');
        slot.className = `photo-slot ${sessionPhotos[i] ? 'filled' : 'empty'}`;
        if (sessionPhotos[i]) {
            const img = document.createElement('img');
            img.src = sessionPhotos[i];
            img.alt = `Photo ${i + 1}`;
            slot.appendChild(img);
        } else {
            slot.textContent = i + 1;
        }
        photoGrid.appendChild(slot);
    }
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    notification.offsetHeight;
    notification.classList.add('show');

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

async function notifyServer(eventPayload) {
    const body = { chat_id: chatId, message_id: msgId, event: eventPayload };
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
    setTimeout(() => webapp.close(), 500);
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

    const payload = {
        car_id: Number(carId),
        action,
        latitude: marker.lat,
        longitude: marker.lng,
        odometer: odo,
        photos: sessionPhotos,
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
            // ← здесь уведомляем ваш сервер о событии
            await notifyServer({
                event: action,        // будет либо "start", либо "end"
                car_id: Number(carId)
              });

            // Показываем уведомление в WebApp
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
    const photoData = capturePhoto(video, canvas);
    stopCamera();
    video.style.display = 'none';
    canvas.style.display = 'block';
    captureButton.style.display = 'none';
    odometerInput.classList.remove('hidden');
    backButton.classList.remove('hidden');
    photoTaken = true;
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
    fetch('https://autopark-gthost.amvera.io/api/auth', {
        method: 'POST',
        headers: {
            'Authorization': `tma ${initData}`
        }
    })
    .then(res => res.json())
    .catch(err => {
        console.error('Auth failed', err);
    });
}

// Start the application
if (!initData) {
    showForbiddenError();
} else {
    initApp();
    switchView('map');
}