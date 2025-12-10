/* ================================================================= */
/* SECURITY DASHBOARD V5.5 - LOGIC CONTROLLER + 2-LEVEL ADDRESS */
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
            // Use googleapis.com endpoint
            const url = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
            const audio = new Audio(url);

            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.error('Audio Play Error', error);
                });
            }
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
    const startScanner = async () => {
        try { await configPromise; } catch (e) { alert('Lỗi kết nối Config'); return; }

        DOM.startScreen.style.display = 'none';
        DOM.cameraZone.style.display = 'flex';
        resetUI();

        if (!navigator.mediaDevices?.getUserMedia) {
            alert('Trình duyệt không hỗ trợ Camera');
            return;
        }

        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            DOM.cameraFeed.srcObject = cameraStream;
            await DOM.cameraFeed.play();

            const track = cameraStream.getVideoTracks()[0];
            const caps = track.getCapabilities();
            if (caps.torch) DOM.btnFlash.style.display = 'flex';

            if (caps.focusMode && caps.focusMode.includes('continuous')) {
                track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => { });
            }

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

        DOM.cameraZone.style.display = 'none';
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

    const tick = () => {
        if (isProcessing || !qrWorker) {
            if (scanAnimation) scanAnimation = requestAnimationFrame(tick);
            return;
        }

        const now = Date.now();
        if (now - lastScanTime < 50) {
            scanAnimation = requestAnimationFrame(tick);
            return;
        }
        lastScanTime = now;

        if (DOM.cameraFeed.readyState === DOM.cameraFeed.HAVE_ENOUGH_DATA) {
            // ROI: 480px
            const videoW = DOM.cameraFeed.videoWidth;
            const videoH = DOM.cameraFeed.videoHeight;
            const scanSize = 480;

            const sx = Math.max(0, (videoW - scanSize) / 2);
            const sy = Math.max(0, (videoH - scanSize) / 2);
            const sw = Math.min(scanSize, videoW);
            const sh = Math.min(scanSize, videoH);

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            canvas.width = sw;
            canvas.height = sh;

            ctx.drawImage(DOM.cameraFeed, sx, sy, sw, sh, 0, 0, sw, sh);

            const imageData = ctx.getImageData(0, 0, sw, sh);
            qrWorker.postMessage(imageData, [imageData.data.buffer]);
        }

        scanAnimation = requestAnimationFrame(tick);
    };

    // --- 5. RESULT HANDLING ---
    const handleScanResult = (code) => {
        if (!code || !code.data) return;

        isProcessing = true;
        navigator.vibrate?.(100);

        const data = code.data;
        if ((data.match(/\|/g) || []).length >= (MIN_CCCD_PARTS - 1)) {
            processCCCD(data);
        } else if (data.startsWith('_') || data.includes('ticketId=')) {
            processTicket(data);
        } else {
            handleError();
        }

        setTimeout(() => isProcessing = false, 2500);
    };

    const handleError = () => {
        sounds.error.play();
        DOM.viewport.classList.add('error');
        setTimeout(() => DOM.viewport.classList.remove('error'), 500);
    };

    const processCCCD = (raw) => {
        sounds.beep.play();
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
        speak(`Đã quét Căn cước: ${d.name}`);
    };

    const processTicket = async (raw) => {
        let id = raw;
        try { id = new URL(raw).searchParams.get('ticketId') || raw; } catch (e) { }
        id = id.trim();

        renderPartialTicket(id);

        try {
            const { data, error } = await db.rpc('get_security_check_data', { p_unique_id: id });
            if (error) throw error;

            if (data?.security_alert) {
                sounds.alert.play();
                DOM.viewport.classList.add('error');
                speak('Cảnh báo an ninh! Phát hiện cảnh báo.');
            } else {
                sounds.beep.play();
                DOM.viewport.classList.add('scanned');
                setTimeout(() => DOM.viewport.classList.remove('scanned'), 300);

                const plate = data.transaction?.plate || 'xe';
                if (data.transaction?.status === 'Đang gửi') {
                    speak(`Vé hợp lệ. Xe ${plate}`);
                } else {
                    speak(`Vé đã thanh toán. Xe ${plate}`);
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

        // Show raw address first
        DOM.cAddress.textContent = d.address;
        DOM.cAddress.style.opacity = '0.7';

        // Trigger 2-Level Conversion
        convertAddressToTwoLevel(d.address).then(newAddr => {
            if (newAddr && newAddr !== d.address) {
                DOM.cAddress.textContent = newAddr;
                DOM.cAddress.style.opacity = '1';
                DOM.cAddress.style.color = '#0f766e'; // Highlight
                DOM.cAddress.style.fontWeight = '700';
            }
        });
    };

    // --- 7. ADDRESS CONVERSION ---
    const convertAddressToTwoLevel = async (rawAddress) => {
        try {
            const parts = rawAddress.split(',').map(s => s.trim());
            if (parts.length < 3) return rawAddress;

            // Classic: [Street], [Ward], [District], [Province]
            // We want [Street], [Ward], [Province]

            const rawProvince = parts[parts.length - 1];
            // Skip District (n-2)
            const rawWard = parts[parts.length - 3] || parts[parts.length - 2] || '';
            const detail = parts.slice(0, parts.length - 3).join(', ');

            // 1. Search Province
            const pRes = await fetch(`https://provinces.open-api.vn/api/p/search/?q=${encodeURIComponent(rawProvince)}`);
            const pData = await pRes.json();
            const officialProvince = pData.length > 0 ? pData[0].name : rawProvince;

            // 2. Search Ward (Fuzzy)
            const wRes = await fetch(`https://provinces.open-api.vn/api/w/search/?q=${encodeURIComponent(rawWard)}`);
            const wData = await wRes.json();
            const officialWard = wData.length > 0 ? wData[0].name : rawWard;

            // Construct 2-Level Address (Street, Ward, Province)
            return `${detail}, ${officialWard}, ${officialProvince}`;

        } catch (e) {
            console.error('Addr Convert Error', e);
            return rawAddress;
        }
    };

    init();
});
