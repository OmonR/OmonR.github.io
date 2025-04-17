// ----------------- main.js -----------------

// Инициализация карты
const map = L.map('map').setView([51.505, -0.09], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// DOM элементы
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

// Состояние
let currentMarker = null;
let stream = null;
let photoTaken = false;
let sessionPhotos = [];
const REQUIRED_PHOTOS = 4;

// Навигация
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

// Обработка карты
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

// Камера
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
    } catch (err) {
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

// Захват фото
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

// Отправка данных на сервер
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

    const payload = {
        latitude: marker.lat,
        longitude: marker.lng,
        odometer: Number(odometer.value),
        photos: sessionPhotos,
        init_data: initData
    };

    try {
        const res = await fetch('https://autopark-gthost.amvera.io//api/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (res.ok && result.status === 'ok') {
            showNotification(result.message || '✅ Сессия завершена');
            setTimeout(() => Telegram.WebApp.close(), 3000);
        } else {
            errorMessage.textContent = result.detail || '❌ Ошибка при отправке';
            errorMessage.style.display = 'block';
        }
    } catch (err) {
        errorMessage.textContent = '⚠️ Ошибка соединения';
        errorMessage.style.display = 'block';
        console.error(err);
    }
}

// Запуск
switchView('map');
