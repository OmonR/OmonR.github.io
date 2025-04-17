// Initialize map
const map = L.map('map').setView([51.505, -0.09], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// DOM Elements
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

// State
let currentMarker = null;
let stream = null;
let photoTaken = false;
let sessionPhotos = [];
const urlParams = new URLSearchParams(window.location.search);
const carId = urlParams.get('car_id');
const action = urlParams.get('action') || 'start';

if (!carId) {
    document.body.innerHTML = '<p style="color:red;padding:1rem;">❌</p>';
    throw new Error('Missing params');
}

const REQUIRED_PHOTOS = 4;

// Navigation
navButtons.forEach(button => {
    button.addEventListener('click', () => {
        const view = button.dataset.view;
        switchView(view);
    });
});

function switchView(view) {
    // Update buttons
    navButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    // Update views
    views.forEach(v => {
        v.classList.toggle('active', v.id === `${view}View`);
    });

    // Handle camera
    if (view === 'camera' || view === 'session') {
        startCamera(view);
    } else {
        stopCamera();
    }

    // Update session UI
    if (view === 'session') {
        updateSessionUI();
    }
}

// Map handling
function createDraggableMarker(latlng) {
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    currentMarker = L.marker(latlng, { draggable: true }).addTo(map);
    continueButton.classList.remove('hidden');
}

map.on('click', (e) => {
    createDraggableMarker(e.latlng);
});

locationButton.addEventListener('click', () => {
    if (!navigator.geolocation) {
        showError('Geolocation is not supported by your browser.');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            createDraggableMarker([latitude, longitude]);
            map.setView([latitude, longitude], 15);
        },
        () => {
            showError('Please enable location services to continue.');
        }
    );
});

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

// Camera handling
async function startCamera(view) {
    const videoElement = view === 'session' ? sessionVideo : video;
    const captureBtn = view === 'session' ? sessionCaptureButton : captureButton;
    
    if (photoTaken) {
        resetCameraView();
    }
    
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        videoElement.srcObject = stream;
        captureBtn.disabled = false;
        
        // Show video, hide canvas
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
    [video, sessionVideo].forEach(v => {
        if (v) v.srcObject = null;
    });
    [captureButton, sessionCaptureButton].forEach(btn => {
        if (btn) btn.disabled = true;
    });
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

function updateSessionUI() {
    photoCounter.textContent = `${sessionPhotos.length} из ${REQUIRED_PHOTOS} фото`;
    
    // Update photo grid
    photoGrid.innerHTML = '';
    
    // Create slots for all photos
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

    // Force reflow
    notification.offsetHeight;
    notification.classList.add('show');

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 2000);
}

// Capture photo
function capturePhoto(video, canvas) {
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
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
    sessionPhotos.push(photoData);
    updateSessionUI();
    
    showNotification(`Photo ${sessionPhotos.length} of ${REQUIRED_PHOTOS} taken`);
    
    if (sessionPhotos.length === REQUIRED_PHOTOS) {
        showNotification('📤 Отправка данных...');
        setTimeout(() => {
            sendSessionData();
        }, 1000);
    } else {
        setTimeout(() => {
            startCamera('session');
        }, 500);
    }
});

// Navigation handlers
continueButton.addEventListener('click', () => {
    switchView('camera');
});

backButton.addEventListener('click', () => {
    startCamera('camera');
});

odometer.addEventListener('input', () => {
    continueToPhotos.disabled = !odometer.value;
});

continueToPhotos.addEventListener('click', () => {
    if (odometer.value) {
        switchView('session');
    }
});

async function sendSessionData() {
    const initData = Telegram.WebApp.initData;
    if (!initData) {
        showError("❌ Не удалось получить данные Telegram.");
        return;
    }

    const marker = currentMarker?.getLatLng?.();
    if (!marker) {
        showError("❌ Координаты не выбраны.");
        return;
    }

    const odo = Number(odometer.value);
    if (isNaN(odo) || odo < 0) {
        showError("❌ Укажите корректный пробег.");
        return;
    }

    const sessionPayload = {
        car_id: Number(carId),
        action,
        latitude: marker.lat,
        longitude: marker.lng,
        odometer: odo,
        photos: sessionPhotos,
        init_data: initData
    };


    try {
        const res = await fetch("https://gtlauto-gthost.amvera.io/api/report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sessionPayload)
        });

        const result = await res.json();

        if (res.ok && result.status === "ok") {
            showNotification(result.message || "✅ Сессия успешно завершена");
            setTimeout(() => Telegram.WebApp.close(), 3000);
        } else {
            showError(result.detail || "❌ Ошибка при отправке. Попробуйте снова.");
        }
    } catch (err) {
        showError("⚠️ Ошибка соединения. Попробуйте снова.");
        console.error(err);
    }
}

// Initialize
switchView('map');