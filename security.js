/* ================================================================= */
/* SECURITY DASHBOARD V5.5 - LOGIC CONTROLLER */
/* ================================================================= */

document.addEventListener('DOMContentLoaded', async () => {
    // --- 1. DOM REFERENCES ---
    const DOM = {
        startScreen: document.getElementById('start-screen'),
        cameraZone: document.getElementById('camera-active-zone'),
        cameraFeed: document.getElementById('camera-feed'),
        hudScannerLine: document.querySelector('.hud-scanner-line'),
        viewport: document.querySelector('.camera-viewport'),

        // Buttons
        btnStart: document.getElementById('btn-start-scan'),
        btnStop: document.getElementById('btn-stop-scan'),
        btnFlash: document.getElementById('btn-toggle-flash'),

        // Panels
        idlePanel: document.getElementById('idle-panel'),
        verificationCard: document.getElementById('verification-card'),
        cccdCard: document.getElementById('cccd-card'),

        // Data Fields (Ticket)
        vPlate: document.getElementById('v-plate'),
        vStatus: document.getElementById('v-status'),
        vEntry: document.getElementById('v-entry'),
        vExit: document.getElementById('v-exit'),
        vLocation: document.getElementById('v-location'),
        vFee: document.getElementById('v-fee'),
        vAlertContainer: document.getElementById('v-alert-container'),

        // Data Fields (CCCD)
        cName: document.getElementById('c-name'),
        cNumber: document.getElementById('c-number'),
        cDob: document.getElementById('c-dob'),
        cGender: document.getElementById('c-gender'),
        cAddress: document.getElementById('c-address'),
    };

    // --- 2. STATE & CONFIG ---
    let cameraStream = null;
    let scanAnimation = null;
    let isProcessing = false;
    let isFlashOn = false;
    let qrWorker = null;
    let lastScanTime = 0;
    let LOCATIONS_DATA = [];
    const MIN_CCCD_PARTS = 6;

    // Sounds
    const sounds = {
        beep: new Audio('https://cdn.jsdelivr.net/gh/pixelastic/sounds-of-the-universe/sounds/beep.mp3'),
        error: new Audio('https://cdn.jsdelivr.net/gh/pixelastic/sounds-of-the-universe/sounds/error.mp3'),
        alert: new Audio('https://cdn.jsdelivr.net/gh/pixelastic/sounds-of-the-universe/sounds/warning.mp3')
    };

    // --- FORCED GOOGLE TTS ---
    const speak = (text) => {
        window.speechSynthesis?.cancel();
        try {
            const url = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
            const audio = new Audio(url);
            audio.play().catch(e => console.error('Audio Play Error', e));
        } catch (e) {
            console.error('TTS Error', e);
        }
    };

    // --- 3. INITIALIZATION ---
    const init = async () => {
        try { qrWorker = new Worker('qr-worker.js'); }
        catch (e) { console.error('Worker failed', e); alert('Lỗi khởi tạo QR Worker'); }

        if (qrWorker) {
            qrWorker.onmessage = (e) => handleScanResult(e.data);
        }

        try {
            const { data } = await db.from('locations').select('*');
            LOCATIONS_DATA = data || [];
        } catch (e) { console.error('Load locations failed', e); }

        DOM.btnStart.addEventListener('click', startScanner);
        DOM.btnStop.addEventListener('click', stopScanner);
        DOM.btnFlash.addEventListener('click', toggleFlash);

        // Handle Close Card Event
        document.addEventListener('close-card', () => {
            resetUI();
            sounds.beep.play(); // Feedback
        });

        // TEST VOICE BUTTON
        const btnTestVoice = document.getElementById('btn-test-voice');
        if (btnTestVoice) {
            btnTestVoice.addEventListener('click', () => {
                const text = 'Hệ thống an ninh đã sẵn sàng.';
                const url = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
                const audio = new Audio(url);
                audio.play().catch(e => {
                    alert('Lỗi phát âm thanh: ' + e.message + '\nKiểm tra lại kết nối mạng của bạn.');
                });
            });
        }
    };

    // --- 4. SCANNER LOGIC ---
    let barcodeDetector = null;

    const startScanner = async () => {
        try { await configPromise; } catch (e) { alert('Lỗi kết nối Config'); return; }

        // Enter Immersive Mode
        document.body.classList.add('scanning-mode');

        // Explicitly update class state to ensure CSS hiding works
        DOM.startScreen.classList.remove('idle-state');
        DOM.startScreen.style.display = 'none';

        DOM.cameraZone.style.display = 'flex';
        resetUI();

        if (!navigator.mediaDevices?.getUserMedia) {
            alert('Trình duyệt không hỗ trợ Camera');
            return;
        }

        // Initialize Native Detector if supported
        if ('BarcodeDetector' in window) {
            try {
                const formats = await BarcodeDetector.getSupportedFormats();
                if (formats.includes('qr_code')) {
                    barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
                }
            } catch (e) { console.warn('Native Detector Failed', e); }
        }

        try {
            // Prefer Environment camera, HD resolution
            // 'continuous' focus is KEY for QR scanning
            const constraints = {
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1920 }, // Try 1080p for better range
                    height: { ideal: 1080 },
                    focusMode: 'continuous'
                }
            };

            cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            DOM.cameraFeed.srcObject = cameraStream;

            // Wait for video to actually play to get dimensions
            await DOM.cameraFeed.play();

            const track = cameraStream.getVideoTracks()[0];
            const caps = track.getCapabilities();

            // Re-apply focus mode if capabilities allow (crucial for macro)
            if (caps.focusMode && caps.focusMode.includes('continuous')) {
                track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => { });
            }
            if (caps.torch) DOM.btnFlash.style.display = 'flex';

            scanAnimation = requestAnimationFrame(tick);
        } catch (err) {
            alert('Không thể truy cập Camera: ' + err.message);
            stopScanner();
        }
    };

    const stopScanner = () => {
        if (scanAnimation) cancelAnimationFrame(scanAnimation);

        if (cameraStream) {
            const track = cameraStream.getVideoTracks()[0];
            if (track && isFlashOn) track.applyConstraints({ advanced: [{ torch: false }] });
            cameraStream.getTracks().forEach(t => t.stop());
            cameraStream = null;
        }

        barcodeDetector = null;

        // Exit Immersive Mode
        document.body.classList.remove('scanning-mode');

        DOM.cameraZone.style.display = 'none';

        // Restore Start Screen
        DOM.startScreen.classList.add('idle-state');
        DOM.startScreen.style.display = 'flex';

        DOM.btnFlash.style.display = 'none';
        isFlashOn = false;
        resetUI();
    };

    const toggleFlash = () => {
        if (!cameraStream) return;
        const track = cameraStream.getVideoTracks()[0];
        isFlashOn = !isFlashOn;
        track.applyConstraints({ advanced: [{ torch: isFlashOn }] })
            .catch(e => console.error(e));
        DOM.btnFlash.classList.toggle('active', isFlashOn);
    };

    const tick = async () => {
        if (!DOM.cameraFeed.videoWidth) {
            scanAnimation = requestAnimationFrame(tick);
            return;
        }

        if (isProcessing) {
            scanAnimation = requestAnimationFrame(tick);
            return;
        }

        // Throttle: Max 15 scans/sec (approx 66ms)
        // High enough for speed, low enough to save CPU
        const now = Date.now();
        if (now - lastScanTime < 66) {
            scanAnimation = requestAnimationFrame(tick);
            return;
        }
        lastScanTime = now;

        try {
            // OPTION A: NATIVE BARCODE DETECTOR (FASTEST)
            if (barcodeDetector) {
                try {
                    const barcodes = await barcodeDetector.detect(DOM.cameraFeed);
                    if (barcodes.length > 0) {
                        const rawVal = barcodes[0].rawValue;
                        handleScanResult({ data: rawVal }); // Mimic worker message format
                    }
                } catch (e) { /* Detect error, ignore frame */ }
            }

            // OPTION B: WEB WORKER FALLBACK (COMPATIBILITY)
            else if (qrWorker && DOM.cameraFeed.readyState === DOM.cameraFeed.HAVE_ENOUGH_DATA) {
                const videoW = DOM.cameraFeed.videoWidth;
                const videoH = DOM.cameraFeed.videoHeight;

                // Crop Center Square (matches CSS guide)
                const scanSize = Math.min(videoW, videoH, 640); // Cap at 640px for worker perf
                const sx = (videoW - scanSize) / 2;
                const sy = (videoH - scanSize) / 2;

                // reusable canvas? Creating new one every frame is GC heavy.
                // Optim: check if we can reuse a global canvas, but for now keeps it safe.
                const canvas = document.createElement('canvas'); // TODO: Optimise this if needed
                canvas.width = scanSize;
                canvas.height = scanSize;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });

                ctx.drawImage(DOM.cameraFeed, sx, sy, scanSize, scanSize, 0, 0, scanSize, scanSize);
                const imageData = ctx.getImageData(0, 0, scanSize, scanSize);

                // Transfer buffer to worker (Zero-Copy)
                qrWorker.postMessage(imageData, [imageData.data.buffer]);
            }
        } catch (e) {
            console.error('Scan Loop Error', e);
        }

        scanAnimation = requestAnimationFrame(tick);
    };

    // --- 5. RESULT HANDLING ---
    let lastScannedData = null; // Track full data string to avoid repetition
    const SCAN_COOLDOWN = 3000;

    const handleScanResult = (code) => {
        if (!code || !code.data) return;

        const currentData = code.data;
        const isDuplicate = (currentData === lastScannedData);

        // Update last scanned data immediately to block rapid fire
        lastScannedData = currentData;

        isProcessing = true;
        navigator.vibrate?.(100);

        if ((currentData.match(/\|/g) || []).length >= (MIN_CCCD_PARTS - 1)) {
            processCCCD(currentData, isDuplicate);
        } else if (currentData.startsWith('_') || currentData.includes('ticketId=')) {
            processTicket(currentData, isDuplicate);
        } else {
            handleError();
        }

        // Reset processing flag after delay
        setTimeout(() => isProcessing = false, 2500);
    };

    const handleError = () => {
        sounds.error.play();
        DOM.viewport.classList.add('error');
        setTimeout(() => DOM.viewport.classList.remove('error'), 500);
    };

    const processCCCD = (raw, isDuplicate) => {
        // Visual feedback always triggers to show system is alive
        if (!isDuplicate) sounds.beep.play();

        DOM.viewport.classList.remove('scanned');
        void DOM.viewport.offsetWidth; // Force reflow
        DOM.viewport.classList.add('scanned');
        setTimeout(() => DOM.viewport.classList.remove('scanned'), 300);

        const parts = raw.split('|');
        const d = {
            number: parts[0],
            name: parts[2],
            dob: parts[3],
            gender: parts[4],
            address: parts[5]
        };

        renderCCCD(d);

        // Audio Logic: Speak ONLY if not duplicate
        if (!isDuplicate) {
            speak(`Đã quét Căn cước: ${d.name}`);
        } else {
            // Optional: Subtle cue for duplicate?
            // console.log('Duplicate scan ignored for audio');
        }
    };

    const processTicket = async (raw, isDuplicate) => {
        let id = raw;
        try { id = new URL(raw).searchParams.get('ticketId') || raw; } catch (e) { }
        id = id.trim();

        renderPartialTicket(id);

        try {
            const { data, error } = await db.rpc('get_security_check_data', { p_unique_id: id });
            if (error) throw error;

            if (data?.security_alert) {
                if (!isDuplicate) sounds.alert.play();
                DOM.viewport.classList.add('error');

                if (!isDuplicate) speak('Cảnh báo an ninh! Phát hiện cảnh báo.');
            } else {
                if (!isDuplicate) sounds.beep.play();
                DOM.viewport.classList.add('scanned');
                setTimeout(() => DOM.viewport.classList.remove('scanned'), 300);

                const plate = data.transaction?.plate || 'xe';

                // Speak only if new
                if (!isDuplicate) {
                    if (data.transaction?.status === 'Đang gửi') {
                        speak(`Vé hợp lệ. Xe ${plate}`);
                    } else {
                        speak(`Vé đã thanh toán. Xe ${plate}`);
                    }
                }
            }

            const combined = data.transaction ? { ...data.transaction, security_alert: data.security_alert } : null;
            renderTicket(combined);

        } catch (e) {
            console.error(e);
            handleError();
        }
    };

    // --- 6. UI RENDERING ---
    const resetUI = () => {
        DOM.idlePanel.style.display = 'flex';
        DOM.verificationCard.classList.remove('active');
        DOM.cccdCard.classList.remove('active');
        DOM.verificationCard.style.display = 'none';
        DOM.cccdCard.style.display = 'none';
    };

    const renderTicket = (tx) => {
        if (!tx) { alert('Không tìm thấy vé'); resetUI(); return; }

        DOM.idlePanel.style.display = 'none';
        DOM.cccdCard.classList.remove('active');
        DOM.cccdCard.style.display = 'none';

        DOM.verificationCard.style.display = 'block';
        requestAnimationFrame(() => DOM.verificationCard.classList.add('active'));

        DOM.vPlate.textContent = tx.plate || 'UNK';
        DOM.vStatus.textContent = tx.status;
        DOM.vStatus.style.color = tx.status === 'Đang gửi' ? '#166534' : '#854d0e';
        DOM.vStatus.style.backgroundColor = tx.status === 'Đang gửi' ? '#dcfce7' : '#fef9c3';

        DOM.vEntry.textContent = tx.entry_time ? new Date(tx.entry_time).toLocaleString('vi-VN') : '--';
        DOM.vExit.textContent = tx.exit_time ? new Date(tx.exit_time).toLocaleString('vi-VN') : '--';
        DOM.vLocation.textContent = LOCATIONS_DATA.find(l => l.id === tx.location_id)?.name || 'N/A';
        DOM.vFee.textContent = tx.fee ? tx.fee.toLocaleString() + 'đ' : '--';

        DOM.vAlertContainer.innerHTML = '';
        if (tx.security_alert) {
            DOM.vAlertContainer.innerHTML = `
                <div class="security-alert-box">
                    <svg class="alert-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <div class="alert-content">
                        <span class="alert-title">CẢNH BÁO AN NINH</span>
                        <p>${tx.security_alert.reason}</p>
                    </div>
                </div>
             `;
        }
    };

    const renderPartialTicket = (id) => {
        DOM.idlePanel.style.display = 'none';
        DOM.verificationCard.style.display = 'block';
        DOM.verificationCard.classList.add('active');

        if (id.startsWith('_')) id = id.substring(0, 8) + '...';
        DOM.vPlate.textContent = id;
        DOM.vStatus.textContent = 'Đang tải...';
        DOM.vEntry.textContent = '...';
    };

    const renderCCCD = (d) => {
        DOM.idlePanel.style.display = 'none';
        DOM.verificationCard.classList.remove('active');
        DOM.verificationCard.style.display = 'none';

        DOM.cccdCard.style.display = 'block';
        requestAnimationFrame(() => DOM.cccdCard.classList.add('active'));

        DOM.cName.textContent = d.name;

        let mask = d.number;
        if (mask.length > 8) mask = mask.substring(0, 3) + '******' + mask.substring(mask.length - 3);
        DOM.cNumber.textContent = mask;

        let dob = d.dob;
        if (dob.length === 8) dob = `${dob.substring(0, 2)}/${dob.substring(2, 4)}/${dob.substring(4)}`;
        DOM.cDob.textContent = dob;

        DOM.cGender.textContent = d.gender;

        // DISPLAY RAW ADDRESS DIRECTLY
        DOM.cAddress.textContent = d.address;
        DOM.cAddress.style.opacity = '1';
        DOM.cAddress.style.color = '#374151';
        DOM.cAddress.style.fontWeight = '500';
    };

    init();
});
