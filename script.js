document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element Selection ---
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const switchCameraBtn = document.getElementById('switchCameraBtn');
    const videoOverlay = document.getElementById('videoOverlay');
    const sessionTimerEl = document.getElementById('sessionTimer');
    const currentGestureEl = document.getElementById('currentGesture');
    const confidenceEl = document.getElementById('confidence');
    const confidenceBar = document.getElementById('confidenceBar');
    const detectionRateEl = document.getElementById('detectionRate');
    const totalGesturesEl = document.getElementById('totalGestures');
    const wordsFormedEl = document.getElementById('wordsFormed');
    const messageDisplayEl = document.getElementById('messageDisplay');

    // --- Application State ---
    let hands = null;
    let isDetecting = false;
    let currentFacingMode = 'user'; // 'user' for front, 'environment' for back
    let currentMessage = [];
    let lastGesture = '';
    let gestureStartTime = 0;
    let gestureCount = 0;
    let wordCount = 0;
    let sessionStartTime = null;
    let sessionTimerInterval = null;
    let detectionTimes = [];

    const GESTURE_HOLD_DURATION_MS = 800;

    const gestureMap = {
        'thumbs_up': 'YES', 'thumbs_down': 'NO', 'open_palm': 'HELLO',
        'peace': 'PEACE', 'ok': 'OKAY', 'point_up': 'WAIT',
        'fist': 'STOP', 'rock': 'ROCK', 'call': 'CALL', 'love': 'LOVE'
    };

    // --- Camera Setup & Detection ---
    const checkForMultipleCameras = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter(device => device.kind === 'videoinput');
            if (videoInputs.length > 1) {
                console.log('Multiple cameras detected. Showing switch button.');
                switchCameraBtn.style.display = 'inline-flex';
            }
        } catch (error) {
            console.error("Could not enumerate devices:", error);
        }
    };
    // We no longer call this on page load. It will be called after the camera starts.

    // --- Core MediaPipe Functions ---
    function initializeHands() {
        hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });
        hands.setOptions({
            maxNumHands: 1, modelComplexity: 1,
            minDetectionConfidence: 0.6, minTrackingConfidence: 0.6
        });
        hands.onResults(onResults);
    }

    function onResults(results) {
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            drawHandLandmarks(landmarks);
            const { gesture, confidence } = detectGesture(landmarks);
            updateGestureDisplay(gesture, confidence);
            updateDetectionRate();
        } else {
            updateGestureDisplay(null, 0);
        }
        ctx.restore();
    }
    
    // --- Gesture Recognition Logic ---
    function detectGesture(landmarks) {
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const middleTip = landmarks[12];
        const ringTip = landmarks[16];
        const pinkyTip = landmarks[20];

        const getDistance = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

        const isThumbExtended = thumbTip.y < landmarks[3].y;
        const isIndexExtended = indexTip.y < landmarks[6].y;
        const isMiddleExtended = middleTip.y < landmarks[10].y;
        const isRingExtended = ringTip.y < landmarks[14].y;
        const isPinkyExtended = pinkyTip.y < landmarks[18].y;
        
        if (isThumbExtended && !isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) return { gesture: 'thumbs_up', confidence: 95 };
        if (!isThumbExtended && !isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) return { gesture: 'fist', confidence: 98 };
        if (!isThumbExtended && isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended) return { gesture: 'peace', confidence: 97 };
        if (isThumbExtended && isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended) return { gesture: 'open_palm', confidence: 99 };
        if (getDistance(thumbTip, indexTip) < 0.07 && isMiddleExtended && isRingExtended && isPinkyExtended) return { gesture: 'ok', confidence: 92 };
        if (!isThumbExtended && isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) return { gesture: 'point_up', confidence: 94 };
        if (isThumbExtended && isIndexExtended && !isMiddleExtended && !isRingExtended && isPinkyExtended) return { gesture: 'rock', confidence: 91 };
        if (isThumbExtended && !isIndexExtended && !isMiddleExtended && !isRingExtended && isPinkyExtended) return { gesture: 'call', confidence: 93 };
        if (isThumbExtended && isIndexExtended && !isMiddleExtended && !isRingExtended && isPinkyExtended) return { gesture: 'love', confidence: 96 };

        return { gesture: null, confidence: 0 };
    }
    
    // --- UI Update Functions ---
    function updateGestureDisplay(gesture, confidence) {
        confidenceEl.textContent = Math.round(confidence);
        confidenceBar.style.width = `${confidence}%`;
        
        document.querySelectorAll('.gesture-card').forEach(card => card.classList.remove('detected'));
        if (gesture) {
            const card = document.querySelector(`[data-gesture="${gesture}"]`);
            if (card) card.classList.add('detected');
        }

        if (gesture !== lastGesture) {
            lastGesture = gesture;
            gestureStartTime = Date.now();
            if (gesture) {
                currentGestureEl.textContent = gestureMap[gesture];
                gestureCount++;
                totalGesturesEl.textContent = gestureCount;
            } else {
                currentGestureEl.textContent = 'None';
            }
        }
        
        if (gesture && lastGesture === gesture && (Date.now() - gestureStartTime > GESTURE_HOLD_DURATION_MS)) {
            addToMessage(gestureMap[gesture]);
            gestureStartTime = Date.now();
        }
    }
    
    function updateDetectionRate() {
        const now = Date.now();
        detectionTimes.push(now);
        detectionTimes = detectionTimes.filter(t => now - t < 60000);
        detectionRateEl.textContent = `${detectionTimes.length}/min`;
    }
    
    function addToMessage(word) {
        if (!word) return;
        if (currentMessage.length === 0 && messageDisplayEl.textContent.includes('Waiting')) {
            messageDisplayEl.textContent = '';
        }
        currentMessage.push(word);
        wordCount++;
        messageDisplayEl.textContent = currentMessage.join(' ');
        wordsFormedEl.textContent = wordCount;
    }

    function drawHandLandmarks(landmarks) {
        const connections = window.HAND_CONNECTIONS;
        if (!connections) return;
        connections.forEach(conn => {
            const start = landmarks[conn[0]];
            const end = landmarks[conn[1]];
            ctx.beginPath();
            ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
            ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
            ctx.lineWidth = 4;
            ctx.stroke();
        });
        landmarks.forEach(point => {
            ctx.beginPath();
            ctx.arc(point.x * canvas.width, point.y * canvas.height, 6, 0, 2 * Math.PI);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
        });
    }
    
    // --- Camera and Session Control ---
    const startCamera = async () => {
        try {
            startBtn.disabled = true;
            startBtn.innerHTML = `<div class="spinner"></div> Starting...`;
            if (video.srcObject) video.srcObject.getTracks().forEach(track => track.stop());

            const constraints = { video: { facingMode: currentFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } } };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            
            video.onloadedmetadata = () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                if (!hands) initializeHands();
                
                // *** CHANGE: Check for cameras AFTER permission is granted ***
                checkForMultipleCameras();

                isDetecting = true;
                detectFrame();
                stopBtn.disabled = false;
                startBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Start Camera`;
                videoOverlay.style.display = 'flex';
                if (!sessionStartTime) {
                    sessionStartTime = Date.now();
                    startSessionTimer();
                }
            };
        } catch (error) {
            console.error('Error accessing camera:', error);
            // *** CHANGE: More helpful error message ***
            alert(`Unable to access camera. Please check site permissions. If using Brave, you may need to lower your Shields for this site. Error: ${error.message}`);
            startBtn.disabled = false;
            startBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Start Camera`;
        }
    };

    const switchCamera = async () => {
        currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
        if (isDetecting) await startCamera();
    };

    const stopCamera = () => {
        isDetecting = false;
        stopBtn.disabled = true;
        startBtn.disabled = false;
        videoOverlay.style.display = 'none';
        if (video.srcObject) video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        clearInterval(sessionTimerInterval);
        sessionTimerInterval = null;
        sessionStartTime = null;
        sessionTimerEl.textContent = 'Session: 00:00:00';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    async function detectFrame() {
        if (!isDetecting) return;
        if (hands && video.readyState >= 3) await hands.send({ image: video });
        requestAnimationFrame(detectFrame);
    }
    
    // --- UI Actions (made globally accessible) ---
    window.clearMessage = () => {
        currentMessage = [];
        wordCount = 0;
        wordsFormedEl.textContent = '0';
        messageDisplayEl.textContent = 'Waiting for gesture input...';
    };

    window.copyMessage = () => {
        const text = currentMessage.join(' ');
        if (text) navigator.clipboard.writeText(text).then(() => showNotification('Message copied!'));
    };

    window.speakMessage = () => {
        const text = currentMessage.join(' ');
        if (text && 'speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    };

-
    // --- Utility Functions ---
    function startSessionTimer() {
        if (sessionTimerInterval) clearInterval(sessionTimerInterval);
        sessionTimerInterval = setInterval(() => {
            if (sessionStartTime) {
                const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
                const h = Math.floor(elapsed / 3600).toString().padStart(2, '0');
                const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
                const s = (elapsed % 60).toString().padStart(2, '0');
                sessionTimerEl.textContent = `Session: ${h}:${m}:${s}`;
            }
        }, 1000);
    }

    function showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification-popup';
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    // --- Event Listeners ---
    startBtn.addEventListener('click', startCamera);
    stopBtn.addEventListener('click', stopCamera);
    switchCameraBtn.addEventListener('click', switchCamera);

    // --- Dynamic Styles ---
    const style = document.createElement('style');
    style.textContent = `
        .notification-popup {
            position: fixed; top: 80px; right: 24px;
            background: #22c55e; color: white; padding: 12px 20px;
            border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1001; animation: slideInNotification 0.3s ease-out;
        }
        @keyframes slideInNotification {
            from { opacity: 0; transform: translateX(100%); }
            to { opacity: 1; transform: translateX(0); }
        }
    `;
    document.head.appendChild(style);
});