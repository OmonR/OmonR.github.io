const map = L.map('map').setView([55.7558, 37.6173], 13); // Moscow as default
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// DOM Elements
const mapButton = document.getElementById('mapButton');
const cameraButton = document.getElementById('cameraButton');
const sessionButton = document.getElementById('sessionButton');
const mapView = document.getElementById('mapView');
const cameraView = document.getElementById('cameraView');
const sessionView = document.getElementById('sessionView');
const locationButton = document.getElementById('locationButton');
const errorMessage = document.getElementById('error-message');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureButton = document.getElementById('captureButton');
const cameraError = document.getElementById('camera-error');
const backButton = document.getElementById('backButton');
const odometerInput = document.getElementById('odometerInput');
const odometer = document.getElementById('odometer');
const photoCounter = document.getElementById('photoCounter');
const photoGrid = document.getElementById('photoGrid');
const continueButton = document.getElementById('continueButton');

let currentMarker = null;
let stream = null;
let photoTaken = false;
let sessionPhotos = [];
const REQUIRED_PHOTOS = 4;

// Initialize marker with dragging enabled
function createDraggableMarker(latlng) {
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    currentMarker = L.marker(latlng, { draggable: true }).addTo(map)
        .bindPopup('Перетащите маркер для указания точного местоположения')
        .openPopup();
}

// Add click handler to map for marker placement
map.on('click', (e) => {
    createDraggableMarker(e.latlng);
});

// Navigation
function switchView(view) {
    // Update buttons
    mapButton.classList.toggle('active', view === 'map');
    cameraButton.classList.toggle('active', view === 'camera');
    sessionButton.classList.toggle('active', view === 'session');
    
    // Update views
    mapView.classList.toggle('active', view === 'map');
    cameraView.classList.toggle('active', view === 'camera');
    sessionView.classList.toggle('active', view === 'session');

    // Handle camera
    if (view === 'camera' || view === 'session') {
        startCamera();
    } else {
        stopCamera();
    }

    // Update session UI
    if (view === 'session') {
        updateSessionUI();
    }
}

mapButton.addEventListener('click', () => switchView('map'));
cameraButton.addEventListener('click', () => switchView('camera'));
sessionButton.addEventListener('click', () => switchView('session'));

// Location handling
locationButton.addEventListener('click', () => {
    if (!navigator.geolocation) {
        errorMessage.textContent = 'Геолокация не поддерживается вашим браузером.';
        errorMessage.style.display = 'block';
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            
            // Create draggable marker at current location
            createDraggableMarker([latitude, longitude]);
            map.setView([latitude, longitude], 15);

            // Show continue button
            continueButton.classList.remove('hidden');
        },
        (error) => {
            if (error.code === error.PERMISSION_DENIED) {
                errorMessage.textContent = 'Пожалуйста, разрешите доступ к вашей геопозиции для корректной работы.';
                errorMessage.style.display = 'block';
            }
        }
    );
});

// Continue to next step
continueButton.addEventListener('click', () => {
    switchView('session');
});

// Camera handling
async function startCamera() {
    if (photoTaken) {
        resetCameraView();
    }
    
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        video.srcObject = stream;
        captureButton.disabled = false;
        cameraError.style.display = 'none';
        
        // Show video, hide canvas
        video.style.display = 'block';
        canvas.style.display = 'none';
    } catch (err) {
        cameraError.textContent = 'Ошибка доступа к камере. Пожалуйста, предоставьте разрешение.';
        cameraError.style.display = 'block';
        captureButton.disabled = true;
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    video.srcObject = null;
    captureButton.disabled = true;
    resetCameraView();
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
    
    // Clear and update photo grid
    photoGrid.innerHTML = '';
    sessionPhotos.forEach((photo, index) => {
        const img = document.createElement('img');
        img.src = photo;
        img.className = 'session-photo';
        img.alt = `Фото ${index + 1}`;
        photoGrid.appendChild(img);
    });

    // Add empty slots
    for (let i = sessionPhotos.length; i < REQUIRED_PHOTOS; i++) {
        const emptySlot = document.createElement('div');
        emptySlot.className = 'empty-slot';
        emptySlot.innerHTML = `<span>${i + 1}</span>`;
        photoGrid.appendChild(emptySlot);
    }
}

captureButton.addEventListener('click', () => {
    const context = canvas.getContext('2d');
    if (context && video.videoWidth && video.videoHeight) {
        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw the current video frame
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (sessionView.classList.contains('active')) {
            // Session mode - save photo and continue
            const photoData = canvas.toDataURL('image/jpeg');
            sessionPhotos.push(photoData);
            updateSessionUI();

            if (sessionPhotos.length === REQUIRED_PHOTOS) {
                // Session complete
                switchView('map');
                // Here you can handle the completion (e.g., send data to server)
            } else {
                // Reset for next photo
                startCamera();
            }
        } else {
            // Single photo mode
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
            }
            video.style.display = 'none';
            canvas.style.display = 'block';
            captureButton.style.display = 'none';
            odometerInput.classList.remove('hidden');
            backButton.classList.remove('hidden');
            photoTaken = true;
        }
    }
});

backButton.addEventListener('click', () => {
    startCamera();
});

// Handle odometer input
odometer.addEventListener('input', (e) => {
    // Ensure only numbers are entered
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
});

// Initial view
switchView('map');