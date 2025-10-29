document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const elements = {
        searchSection: document.getElementById('search-section'),
        resultsSection: document.getElementById('results-section'),
        historyContainer: document.getElementById('history-container'),
        plateDisplayWrapper: document.getElementById('plate-display-wrapper'),
        plateDisplay: document.getElementById('plate-display'),
        messageBox: document.getElementById('message-box'),
        plateSearchForm: document.getElementById('plate-search-form'),
        plateInput: document.getElementById('plate-input'),
        scanQrBtn: document.getElementById('scan-qr-btn'),
        qrScannerModal: document.getElementById('qr-scanner-modal'),
        cameraFeed: document.getElementById('camera-feed'),
        closeScannerBtn: document.getElementById('close-scanner-btn'),
    };

    let cameraStream = null;
    let scanAnimation = null;

    // --- UI Functions ---
    const showMessage = (message, isError = false) => {
        elements.resultsSection.style.display = 'none';
        elements.searchSection.style.display = 'block';
        elements.messageBox.style.display = 'block';
        elements.messageBox.innerHTML = `<p style="font-weight: bold; ${isError ? 'color: #c62828;' : ''}">${message}</p>`;
    };

    const showLoading = () => {
        elements.resultsSection.style.display = 'none';
        elements.messageBox.style.display = 'block';
        elements.messageBox.innerHTML = `<p>Đang tải lịch sử, vui lòng chờ...</p>`;
    };

    // --- Utility Functions ---
    const formatDateTime = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--';
    const calculateDuration = (startTime, endTime) => {
        if (!startTime || !endTime) return '--';
        const start = new Date(startTime);
        const end = new Date(endTime);
        let diff = Math.floor((end - start) / 1000);
        if (diff < 0) return '0m';
        const days = Math.floor(diff / 86400);
        diff %= 86400;
        const hours = Math.floor(diff / 3600);
        diff %= 3600;
        const minutes = Math.floor(diff / 60);
        let result = '';
        if (days > 0) result += `${days}d `;
        if (hours > 0) result += `${hours}h `;
        result += `${minutes}m`;
        return result.trim() || '0m';
    };
    const cleanPlateNumber = (plateStr) => plateStr ? plateStr.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';

    // --- Core Logic ---
    const renderHistory = (history) => {
        if (!history || history.length === 0) {
            showMessage('Không tìm thấy lịch sử cho xe này.', true);
            return;
        }

        // SỬA LỖI: Sắp xếp lại lịch sử để đảm bảo lượt mới nhất luôn ở trên đầu
        history.sort((a, b) => new Date(b['Entry Time']) - new Date(a['Entry Time']));

        elements.plateDisplay.textContent = history[0].Plate;
        elements.historyContainer.innerHTML = '';
        elements.messageBox.style.display = 'none';
        elements.searchSection.style.display = 'none';
        elements.resultsSection.style.display = 'block';

        history.forEach(tx => {
            const card = document.createElement('div');
            card.className = 'history-card';
            const isDeparted = tx.Status !== 'Đang gửi';
            const statusClass = isDeparted ? 'departed' : 'parking';

            let receiptActionHtml = '';
            if (isDeparted) {
                // SỬA LỖI: Truyền cả uniqueID sang trang receipt.html
                const receiptUrl = `receipt.html?plate=${encodeURIComponent(tx.Plate)}&entryTime=${encodeURIComponent(formatDateTime(tx['Entry Time']))}&exitTime=${encodeURIComponent(formatDateTime(tx['Exit Time']))}&duration=${encodeURIComponent(calculateDuration(tx['Entry Time'], tx['Exit Time']))}&fee=${encodeURIComponent((tx.Fee || 0).toLocaleString('vi-VN'))}&paymentMethod=${encodeURIComponent(tx['Payment Method'] || 'N/A')}&uniqueID=${tx.UniqueID}`;
                // ĐƠN GIẢN HÓA: Chỉ còn 1 nút "Xem & Tải biên lai"
                receiptActionHtml = `<div class="receipt-action"><a href="${receiptUrl}" target="_blank" class="btn-print">Xem & Tải biên lai</a></div>`;
            }

            card.innerHTML = `
                <div class="history-card-header">
                    <span class="date">${new Date(tx['Entry Time']).toLocaleDateString('vi-VN')}</span>
                    <span class="status-badge ${statusClass}">${tx.Status}</span>
                </div>
                <div class="history-card-body">
                    <div class="detail-item"><span class="label">Giờ vào:</span><span class="value">${formatDateTime(tx['Entry Time'])}</span></div>
                    <div class="detail-item"><span class="label">Giờ ra:</span><span class="value">${formatDateTime(tx['Exit Time'])}</span></div>
                    <div class="detail-item"><span class="label">Tổng thời gian:</span><span class="value">${calculateDuration(tx['Entry Time'], tx['Exit Time'])}</span></div>
                    <div class="detail-item"><span class="label">Phí gửi xe:</span><span class="value" style="color: #c62828;">${(tx.Fee || 0).toLocaleString('vi-VN')}đ</span></div>
                </div>
                ${receiptActionHtml}
            `;
            elements.historyContainer.appendChild(card);
        });
    };

    const fetchData = async (params) => {
        showLoading();
        try {
            const url = new URL(APP_CONFIG.googleScriptUrl);
            Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
            
            const response = await fetch(url);
            if (!response.ok) throw new Error('Lỗi mạng khi kết nối đến máy chủ.');
            
            const result = await response.json();
            if (result.status === 'success') {
                renderHistory(result.data);
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            showMessage(error.message, true);
        }
    };

    // --- QR Scanner Logic ---
    const openQrScanner = async () => {
        if (!('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices)) {
            showMessage('Trình duyệt không hỗ trợ camera.', true);
            return;
        }
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            elements.cameraFeed.srcObject = cameraStream;
            elements.qrScannerModal.style.display = 'flex';
            await elements.cameraFeed.play();
            scanAnimation = requestAnimationFrame(tick);
        } catch(err) { 
            showMessage('Không thể truy cập camera. Vui lòng cấp quyền.', true); 
        }
    };

    const closeQrScanner = () => {
        if (scanAnimation) cancelAnimationFrame(scanAnimation);
        if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
        elements.qrScannerModal.style.display = 'none';
    };

    const tick = () => {
        if (elements.cameraFeed.readyState === elements.cameraFeed.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement('canvas');
            canvas.width = elements.cameraFeed.videoWidth;
            canvas.height = elements.cameraFeed.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(elements.cameraFeed, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
            
            if (code) {
                closeQrScanner();
                fetchData({ action: 'getVehicleHistoryByUniqueID', uniqueID: code.data });
            }
        }
        scanAnimation = requestAnimationFrame(tick);
    };

    // --- Initialization ---
    const init = () => {
        // Check for ID in URL first
        const urlParams = new URLSearchParams(window.location.search);
        const uniqueID = urlParams.get('id');
        if (uniqueID) {
            fetchData({ action: 'getVehicleHistoryByUniqueID', uniqueID });
        }

        // Setup event listeners
        elements.plateSearchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const plate = cleanPlateNumber(elements.plateInput.value);
            if (plate) {
                fetchData({ action: 'getVehicleHistoryByPlate', plate });
            }
        });

        elements.scanQrBtn.addEventListener('click', openQrScanner);
        elements.closeScannerBtn.addEventListener('click', closeQrScanner);
    };
    
    init();
});