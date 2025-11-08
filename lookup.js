document.addEventListener('DOMContentLoaded', () => {
    // =================================================================
    // KHU VỰC 0: THIẾT LẬP KẾT NỐI SUPABASE
    // =================================================================
    const SUPABASE_URL = 'https://mtihqbmlbtrgvamxwrkm.supabase.co'; // <-- THAY BẰNG URL CỦA BẠN
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10aWhxYm1sYnRyZ3ZhbXh3cmttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMTkwMDEsImV4cCI6MjA3NzU5NTAwMX0.hR5X8bp-XD2DfxUnvWF-yxVk4sFVW2zBunp5XXnIZ0Y'; // <-- THAY BẰNG ANON PUBLIC KEY CỦA BẠN
    const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // =================================================================
    // KHU VỰC 1: KHAI BÁO BIẾN VÀ THAM CHIẾU DOM
    // =================================================================
    const elements = {
        searchSection: document.getElementById('search-section'),
        resultsSection: document.getElementById('results-section'),
        historyContainer: document.getElementById('history-container'),
        plateDisplay: document.getElementById('plate-display'),
        messageBox: document.getElementById('message-box'),
        plateSearchForm: document.getElementById('plate-search-form'),
        plateInput: document.getElementById('plate-input'),
        scanQrBtn: document.getElementById('scan-qr-btn'),
        qrScannerModal: document.getElementById('qr-scanner-modal'),
        cameraFeed: document.getElementById('camera-feed'),
        closeScannerBtn: document.getElementById('close-scanner-btn'),
        downloadAllBtn: document.getElementById('download-all-btn'),
    };

    let cameraStream = null;
    let scanAnimation = null;
    let LOCATIONS_DATA = []; // MỚI: Lưu trữ danh sách bãi đỗ từ DB
    let currentHistory = [];

    // =================================================================
    // KHU VỰC 2: CÁC HÀM TIỆN ÍCH VÀ GIAO DIỆN
    // =================================================================
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

    const formatDateTime = (dateStr) => dateStr ? new Date(dateStr).toLocaleString('vi-VN') : '--';
    const calculateDuration = (startTime, endTime) => {
        if (!startTime || !endTime) return '--';
        const start = new Date(startTime);
        const end = new Date(endTime);
        let diff = Math.floor((end - start) / 1000);
        if (diff < 0) return '0m';
        const days = Math.floor(diff / 86400); diff %= 86400;
        const hours = Math.floor(diff / 3600); diff %= 3600;
        const minutes = Math.floor(diff / 60); 
        let result = '';
        if (days > 0) result += `${days}d `;
        if (hours > 0) result += `${hours}h `;
        result += `${minutes}m`;
        return result.trim() || '0m';
    };

    const universalSearch = async (searchTerm, methods = ['uniqueID', 'plate', 'phone']) => {
        if (!methods || methods.length === 0 || !searchTerm) {
            showMessage('Không tìm thấy kết quả phù hợp.', true);
            return;
        }

        showLoading();
        const methodToTry = methods[0];
        const remainingMethods = methods.slice(1);
        let query;

        switch (methodToTry) {
            case 'uniqueID':
                query = db.from('transactions').select('*').eq('unique_id', searchTerm);
                break;
            case 'plate':
                query = db.from('transactions').select('*').eq('plate', searchTerm.toUpperCase());
                break;
            case 'phone':
                if (!/^\d+$/.test(searchTerm)) {
                    universalSearch(searchTerm, remainingMethods);
                    return;
                }
                query = db.from('transactions').select('*').eq('phone', searchTerm);
                break;
            default:
                universalSearch(searchTerm, remainingMethods);
                return;
        }

        try {
            const { data, error } = await query;
            if (error) throw error;

            if (data && data.length > 0) {
                renderHistory(data, searchTerm);
            } else {
                universalSearch(searchTerm, remainingMethods);
            }
        } catch (error) {
            console.error(`Lỗi khi tìm bằng ${methodToTry}:`, error);
            universalSearch(searchTerm, remainingMethods);
        }
    };

    const renderHistory = (history, searchTerm) => {
        if (!history || history.length === 0) {
            showMessage('Không tìm thấy lịch sử cho xe này.', true);
            return;
        }

        history.sort((a, b) => new Date(b['Entry Time']) - new Date(a['Entry Time']));
        currentHistory = history;

        const plateToDisplay = history[0]?.Plate || searchTerm;
        elements.plateDisplay.textContent = plateToDisplay;
        elements.historyContainer.innerHTML = '';
        elements.messageBox.style.display = 'none';
        elements.resultsSection.style.display = 'block';

        // Đã bỏ chức năng tải tất cả biên lai
        elements.downloadAllBtn.style.display = 'none';

        history.forEach(tx => {
            const card = document.createElement('div');
            card.className = 'history-card';
            const isDeparted = tx.status !== 'Đang gửi';
            const statusClass = isDeparted ? 'departed' : 'parking';

            // Đã bỏ phần hiển thị nút "Xem biên lai" (receiptActionHtml)
            card.innerHTML = `<div class="history-card-header"><span class="date">${new Date(tx.entry_time).toLocaleDateString('vi-VN')}</span><span class="status-badge ${statusClass}">${tx.status}</span></div><div class="history-card-body"><div class="detail-item"><span class="label">Giờ vào:</span><span class="value">${formatDateTime(tx.entry_time)}</span></div><div class="detail-item"><span class="label">Giờ ra:</span><span class="value">${formatDateTime(tx.exit_time)}</span></div><div class="detail-item"><span class="label">Tổng thời gian:</span><span class="value">${calculateDuration(tx.entry_time, tx.exit_time)}</span></div><div class="detail-item"><span class="label">Phí gửi xe:</span><span class="value" style="font-weight: bold; color: #c62828;">${(tx.fee || 0).toLocaleString('vi-VN')}đ</span></div></div>`;
            elements.historyContainer.appendChild(card);
        });
    };

    // =================================================================
    // KHU VỰC 3: HÀM TẢI TẤT CẢ BIÊN LAI
    // =================================================================
    const downloadAllReceipts = () => { // Đã bỏ chức năng này
        showMessage('Chức năng tải biên lai đã được tắt.', true);
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
                universalSearch(code.data, ['uniqueID', 'plate']);
            }
        }
        scanAnimation = requestAnimationFrame(tick);
    };

    // --- Initialization ---
    const init = async () => {
        // MỚI: Tải danh sách bãi đỗ khi bắt đầu
        try {
            const { data, error } = await db.from('locations').select('*');
            if (error) throw error;
            LOCATIONS_DATA = data || [];
        } catch (error) {
            console.error("Lỗi tải danh sách bãi đỗ:", error);
        }

        const urlParams = new URLSearchParams(window.location.search);
        const uniqueID = urlParams.get('id');
        if (uniqueID) {
            universalSearch(uniqueID, ['uniqueID', 'plate']);
        }

        // Setup event listeners
        elements.plateSearchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const searchTerm = elements.plateInput.value.trim().toUpperCase();
            if (searchTerm) {
                universalSearch(searchTerm, ['plate', 'phone', 'uniqueID']);
            }
        });

        elements.scanQrBtn.addEventListener('click', openQrScanner);
        elements.closeScannerBtn.addEventListener('click', closeQrScanner);
        elements.downloadAllBtn.addEventListener('click', () => {
            showMessage('Chức năng tải biên lai đã được tắt.', true);
        });
    };
    
    init();
});
