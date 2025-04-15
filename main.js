const map = L.map('map').setView([55.7558, 37.6173], 13); // Moscow as default
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// DOM Elements
const mapButton = document.getElementById('mapButton');
const cameraButton = document.getElementById('cameraButton');
const mapView = document.getElementById('mapView');
const cameraView = document.getElementById('cameraView');
const locationButton = document.getElementById('locationButton');
const errorMessage = document.getElementById('error-message');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureButton = document.getElementById('captureButton');
const cameraError = document.getElementById('camera-error');

let currentMarker = null;
let stream = null;

// Navigation
function switchView(view) {
    // Update buttons
    mapButton.classList.toggle('active', view === 'map');
    cameraButton.classList.toggle('active', view === 'camera');
    
    // Update views
    mapView.classList.toggle('active', view === 'map');
    cameraView.classList.toggle('active', view === 'camera');

    // Handle camera
    if (view === 'camera') {
        startCamera();
    } else {
        stopCamera();
    }
}

mapButton.addEventListener('click', () => switchView('map'));
cameraButton.addEventListener('click', () => switchView('camera'));

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
            
            // Update map
            if (currentMarker) {
                map.removeLayer(currentMarker);
            }
            currentMarker = L.marker([latitude, longitude]).addTo(map)
                .bindPopup('Вы здесь')
                .openPopup();
            map.setView([latitude, longitude], 15);

            // Send to Telegram WebApp
            if (window.Telegram?.WebApp) {
                window.Telegram.WebApp.sendData(JSON.stringify({ latitude, longitude }));
            }

            // Switch to camera view
            switchView('camera');
        },
        (error) => {
            if (error.code === error.PERMISSION_DENIED) {
                errorMessage.textContent = 'Пожалуйста, разрешите доступ к вашей геопозиции для корректной работы.';
                errorMessage.style.display = 'block';
            }
        }
    );
});

// Camera handling
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        video.srcObject = stream;
        captureButton.disabled = false;
        cameraError.style.display = 'none';
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
}

captureButton.addEventListener('click', () => {
    const context = canvas.getContext('2d');
    if (context && video.videoWidth && video.videoHeight) {
        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw the current video frame
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert to data URL and send
        const imageData = canvas.toDataURL('image/png');
        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.sendData(imageData);
        }
    }
});

// Initial view
switchView('map');