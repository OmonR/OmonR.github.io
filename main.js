const webapp = window.Telegram.WebApp;
webapp.ready();

// Получаем подписанную строку initData
const initDataRaw = webapp.initData;

const map = L.map('map').setView([51.505, -0.09], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

const params = webapp.themeParams;

if (params) {
    root.style.setProperty('--tg-theme-bg-color', params.bg_color);
    root.style.setProperty('--tg-theme-text-color', params.text_color);
    root.style.setProperty('--tg-theme-hint-color', params.hint_color);
    root.style.setProperty('--tg-theme-link-color', params.link_color);
    root.style.setProperty('--tg-theme-button-color', params.button_color);
    root.style.setProperty('--tg-theme-button-text-color', params.button_text_color);
}


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
const carId = urlParams.get('car_id');
const action = urlParams.get('action') || 'start';

// if (!carId) {
//     document.body.innerHTML = '<p style="color:red;padding:1rem;">❌</p>';
//     throw new Error('Missing params');
// }

let currentMarker = null;
let stream = null;
let photoTaken = false;
let sessionPhotos = [];
const REQUIRED_PHOTOS = 4;

navButtons.forEach(button => {
    button.addEventListener('click', () => {
        const view = button.dataset.view;
        switchView(view);
    });
});

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

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
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

async function sendSessionData() {
    const initData = Telegram.WebApp?.initData;
    if (!initData) {
        errorMessage.textContent = '❌ Не удалось получить данные Telegram.';
        errorMessage.style.display = 'block';
        return;
    }

    const marker = currentMarker?.getLatLng?.();
    if (!marker) {
        errorMessage.textContent = '❌ Координаты не выбраны.';
        errorMessage.style.display = 'block';
        return;
    }

    const odo = Number(odometer.value);
    if (isNaN(odo) || odo < 0) {
        errorMessage.textContent = '❌ Пожалуйста, укажите корректный пробег.';
        errorMessage.style.display = 'block';
        return;
    }

    if (sessionPhotos.length !== 4) {
        errorMessage.textContent = '❌ Необходимо 4 фото.';
        errorMessage.style.display = 'block';
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (res.ok && result.status === 'ok') {
            showNotification(result.message || '✅ Сессия завершена');
            setTimeout(() => webapp.close(), 3000);
        } else {
            errorMessage.textContent = result.detail || '❌ Ошибка при отправке';
            errorMessage.style.display = 'block';
        }
    } catch {
        errorMessage.textContent = '⚠️ Ошибка соединения';
        errorMessage.style.display = 'block';
    }
}

switchView('map');

function showForbiddenError() {
    document.querySelector('.container').classList.add('hidden');
    document.getElementById('forbiddenPage').classList.remove('hidden');
}

function initApp() {
    // All your existing app logic goes here
    fetch('https://autopark-gthost.amvera.io/api/auth', {
        method: 'POST',
        headers: {
            'Authorization': `tma ${initDataRaw}`
        }
    })
    .then(res => res.json())
    .catch(err => {
        console.error('Auth failed', err);
    });

    // Set theme variables from Telegram theme params
    const root = document.documentElement;
}

if (!initDataRaw) {
    showForbiddenError();
} else {
    initApp();
}

