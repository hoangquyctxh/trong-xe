document.addEventListener('DOMContentLoaded', () => {
    // =================================================================
    // KHU VỰC 0: THIẾT LẬP KẾT NỐI SUPABASE VÀ CÁC BIẾN
    // =================================================================
    const SUPABASE_URL = 'https://mtihqbmlbtrgvamxwrkm.supabase.co'; // <-- THAY BẰNG URL CỦA BẠN
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10aWhxYm1sYnRyZ3ZhbXh3cmttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMTkwMDEsImV4cCI6MjA3NzU5NTAwMX0.hR5X8bp-XD2DfxUnvWF-yxVk4sFVW2zBunp5XXnIZ0Y'; // <-- THAY BẰNG ANON PUBLIC KEY CỦA BẠN
    const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // =================================================================
    // KHU VỰC 1: THAM CHIẾU DOM
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
    };

    let cameraStream = null;
    let scanAnimation = null;
    let LOCATIONS_DATA = [];

    // =================================================================
    // KHU VỰC 2: CÁC HÀM TIỆN ÍCH VÀ GIAO DIỆN
    // =================================================================

    // Hiển thị thông báo chung
    const showMessage = (message, isError = false) => {
        elements.resultsSection.style.display = 'none';
        elements.searchSection.style.display = 'block';
        elements.messageBox.style.display = 'block';
        elements.messageBox.innerHTML = `<p style="font-weight: bold; ${isError ? 'color: #c62828;' : ''}">${message}</p>`;
    };
    // Hiển thị trạng thái đang tải
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

    // Lấy tên bãi đỗ từ ID
    const getLocationName = (locationId) => {
        if (!locationId) return 'Không xác định';
        const location = LOCATIONS_DATA.find(loc => loc.id === locationId);
        return location ? location.name : 'Không xác định';
    };

    // Hàm render kết quả lịch sử ra giao diện
    const renderHistory = (history, searchTerm) => {
        if (!history || history.length === 0) {
            showMessage('Không tìm thấy lịch sử cho xe này.', true);
            return;
        }

        // Sắp xếp lịch sử theo thời gian vào gần nhất
        history.sort((a, b) => new Date(b.entry_time) - new Date(a.entry_time));

        const plateToDisplay = history[0]?.plate || searchTerm.toUpperCase();
        elements.plateDisplay.textContent = plateToDisplay;
        elements.historyContainer.innerHTML = '';
        elements.messageBox.style.display = 'none';
        elements.resultsSection.style.display = 'block';

        history.forEach(tx => {
            const card = document.createElement('div');
            card.className = 'history-card';
            const isDeparted = tx.status !== 'Đang gửi';
            const statusClass = isDeparted ? 'departed' : 'parking';
            const locationName = getLocationName(tx.location_id);

            card.innerHTML = `
                <div class="history-card-header">
                    <span class="date">${new Date(tx.entry_time).toLocaleDateString('vi-VN')}</span>
                    <span class="status-badge ${statusClass}">${tx.status}</span>
                </div>
                <div class="history-card-body">
                    <div class="detail-item">
                        <span class="label">Giờ vào:</span>
                        <span class="value">${formatDateTime(tx.entry_time)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Giờ ra:</span>
                        <span class="value">${formatDateTime(tx.exit_time)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Tổng thời gian:</span>
                        <span class="value">${calculateDuration(tx.entry_time, tx.exit_time)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Bãi đỗ xe:</span>
                        <span class="value">${locationName}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Phí gửi xe:</span>
                        <span class="value" style="font-weight: bold; color: #c62828;">${(tx.fee || 0).toLocaleString('vi-VN')}đ</span>
                    </div>
                </div>
            `;
            elements.historyContainer.appendChild(card);
        });
    };

    // =================================================================
    // KHU VỰC 3: LOGIC CHÍNH VÀ SỰ KIỆN
    // =================================================================

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
                searchByTerm(code.data);
            }
        }
        scanAnimation = requestAnimationFrame(tick);
    };

    // --- Hàm tìm kiếm chính ---
    const searchByTerm = async (term) => {
        showLoading();
        const cleanedTerm = term.trim().toUpperCase();

        try {
            // Sử dụng rpc để gọi một hàm PostgreSQL tùy chỉnh (cần tạo trong Supabase)
            // hoặc thực hiện nhiều truy vấn song song. Ở đây ta dùng nhiều truy vấn.
            const queries = [
                db.from('transactions').select('*').eq('plate', cleanedTerm),
                db.from('transactions').select('*').eq('unique_id', term.trim()),
                db.from('transactions').select('*').eq('phone', term.trim())
            ];

            const results = await Promise.all(queries);
            let allFound = [];
            results.forEach(res => {
                if (res.data) {
                    allFound = allFound.concat(res.data);
                }
                if (res.error) {
                    console.warn("Lỗi truy vấn phụ:", res.error.message);
                }
            });

            // Lọc các kết quả trùng lặp
            const uniqueResults = Array.from(new Map(allFound.map(item => [item.unique_id, item])).values());

            if (uniqueResults.length > 0) {
                renderHistory(uniqueResults, cleanedTerm);
            } else {
                showMessage(`Không tìm thấy lịch sử nào cho "${term}".`, true);
            }
        } catch (error) {
            showMessage(`Đã xảy ra lỗi khi tra cứu: ${error.message}`, true);
            console.error("Lỗi tra cứu:", error);
        }
    };

    // --- Initialization ---
    const init = async () => {
        try {
            const { data, error } = await db.from('locations').select('*');
            if (error) throw error;
            LOCATIONS_DATA = data || [];
        } catch (error) {
            console.error("Lỗi tải danh sách bãi đỗ:", error);
            showMessage("Không thể tải cấu hình bãi đỗ. Vui lòng thử lại.", true);
        }

        const urlParams = new URLSearchParams(window.location.search);
        const plateFromUrl = urlParams.get('plate');
        if (plateFromUrl) {
            elements.plateInput.value = plateFromUrl;
            searchByTerm(plateFromUrl);
        }

        // Setup event listeners
        elements.plateSearchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const searchTerm = elements.plateInput.value.trim();
            if (searchTerm) {
                searchByTerm(searchTerm);
            }
        });

        elements.scanQrBtn.addEventListener('click', openQrScanner);
        elements.closeScannerBtn.addEventListener('click', closeQrScanner);
    };
    
    init();
});
