document.addEventListener('DOMContentLoaded', () => {
    // SỬA LỖI: Đã xóa dòng `let db;` không cần thiết.
    // Giờ đây, tệp này sẽ sử dụng biến `db` toàn cục được cung cấp bởi `config.js`.

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
    // --- KHU VỰC 2: CÁC HÀM TIỆN ÍCH VÀ GIAO DIỆN ---
    // =================================================================

    // Hiển thị thông báo chung
    const showMessage = (message, isError = false) => {
        elements.resultsSection.style.display = 'none';
        elements.messageBox.style.display = 'block';
        elements.messageBox.innerHTML = `
            <div class="message-box">
                <p style="font-weight: bold; font-size: 1.1rem; color: ${isError ? 'var(--danger-color)' : 'var(--text-primary)'};">${message}</p>
            </div>
        `;
    };
    // Hiển thị trạng thái đang tải
    const showLoading = () => {
        elements.resultsSection.style.display = 'none';
        elements.messageBox.style.display = 'block';
        elements.messageBox.innerHTML = `
            <div class="loading-box">
                <div class="loading-spinner"></div>
                <p>Đang tìm kiếm, vui lòng chờ...</p>
            </div>
        `;
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
        elements.plateDisplay.textContent = plateToDisplay; // SỬA LỖI: Đổi tên thành plate-display-header
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
                <div class="history-card-body">
                    <div class="detail-item">
                        <span class="label">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            Trạng thái
                        </span>
                        <span class="value"><span class="status-badge ${statusClass}">${tx.status}</span></span>
                    </div>
                    <div class="detail-item">
                        <span class="label">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path></svg>
                            Giờ vào
                        </span>
                        <span class="value">${formatDateTime(tx.entry_time)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                            Giờ ra
                        </span>
                        <span class="value">${isDeparted ? formatDateTime(tx.exit_time) : '--'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 4 3 3-1.5 1.5-3-3L16 4Z"></path><path d="m10 10 3 3-6 6H4v-3l6-6Z"></path></svg>
                            Tổng thời gian
                        </span>
                        <span class="value">${isDeparted ? calculateDuration(tx.entry_time, tx.exit_time) : '--'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-10a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                            Bãi đỗ xe
                        </span>
                        <span class="value">${locationName}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                            Phí gửi xe
                        </span>
                        <span class="value" style="font-weight: bold; color: var(--warning-color);">${isDeparted ? (tx.fee || 0).toLocaleString('vi-VN') + 'đ' : '--'}</span>
                    </div>
                </div>
            `;
            elements.historyContainer.appendChild(card);
        });
    };

    // =================================================================
    // --- KHU VỰC 3: LOGIC CHÍNH VÀ SỰ KIỆN ---
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
                let termToSearch = code.data;
                // NÂNG CẤP: Xử lý trường hợp mã QR là một URL
                try {
                    const url = new URL(code.data);
                    const ticketId = url.searchParams.get('ticketId');
                    if (ticketId) {
                        termToSearch = ticketId;
                    }
                } catch (e) {
                    // Không phải URL, giữ nguyên code.data
                }

                closeQrScanner();
                // TỐI ƯU HÓA: Thêm phản hồi rung khi quét thành công
                if (navigator.vibrate) navigator.vibrate(100);
                elements.plateInput.value = termToSearch; // Hiển thị trên input
                searchByTerm(termToSearch);
            }
        }
        scanAnimation = requestAnimationFrame(tick);
    };

    // --- Hàm tìm kiếm chính ---
    const searchByTerm = async(term) => {
        showLoading();
        // TỐI ƯU HÓA: Thêm phản hồi rung khi bắt đầu tìm kiếm
        if (navigator.vibrate) navigator.vibrate(50);

        const cleanedTerm = term.trim(); // Giữ lại giá trị gốc để tìm unique_id, phone
        const upperCaseTerm = cleanedTerm.toUpperCase(); // Dùng giá trị viết hoa để tìm biển số

        try {
            // BƯỚC 1: Tìm kiếm ban đầu trên nhiều trường
            const queries = [
                db.from('transactions').select('*').eq('plate', upperCaseTerm),
                db.from('transactions').select('*').eq('unique_id', cleanedTerm),
                db.from('transactions').select('*').eq('phone', cleanedTerm)
            ];
            const results = await Promise.all(queries);
            let initialResults = [];
            results.forEach(res => {
                if (res.data) initialResults = initialResults.concat(res.data);
                if (res.error) console.warn("Lỗi truy vấn phụ:", res.error.message);
            });

            if (initialResults.length === 0) {
                showMessage(`Không tìm thấy lịch sử nào cho "${term}".`, true);
                return;
            }

            // BƯỚC 2: Nâng cấp - Nếu tìm thấy kết quả, lấy biển số và tìm tất cả lịch sử liên quan
            const foundPlate = initialResults[0]?.plate;
            let finalResults = [...initialResults];

            // Chỉ thực hiện truy vấn bổ sung nếu tìm thấy biển số và truy vấn ban đầu không phải là biển số
            if (foundPlate && foundPlate !== upperCaseTerm) {
                const { data: historyByPlate, error: historyError } = await db
                    .from('transactions')
                    .select('*')
                    .eq('plate', foundPlate);

                if (historyError) {
                    console.warn("Lỗi khi tìm lịch sử mở rộng theo biển số:", historyError.message);
                } else if (historyByPlate) {
                    finalResults = finalResults.concat(historyByPlate);
                }
            }

            // BƯỚC 3: Lọc các kết quả trùng lặp và hiển thị
            const uniqueResults = Array.from(new Map(finalResults.map(item => [item.unique_id, item])).values());
            renderHistory(uniqueResults, upperCaseTerm);

        } catch (error) {
            showMessage(`Đã xảy ra lỗi khi tra cứu: ${error.message}`, true);
            console.error("Lỗi tra cứu:", error);
        }
    };

    // --- Initialization ---
    const init = async () => {
        // SỬA LỖI: Không cần khởi tạo lại 'db'.
        // Tệp config.js đã khởi tạo và cung cấp sẵn đối tượng 'db' toàn cục.
        // Chỉ cần chờ configPromise để đảm bảo cấu hình động đã được tải (nếu cần).
        try {
            await configPromise;
        } catch (error) {
            console.warn("Lỗi khi tải cấu hình động, nhưng vẫn tiếp tục với cấu hình tĩnh.", error);
        }

        // Bước 2: Tải danh sách bãi đỗ
        try {
            const { data, error } = await db.from('locations').select('*');
            if (error) throw error;
            LOCATIONS_DATA = data || [];
        } catch (error) {
            console.warn("Lỗi tải danh sách bãi đỗ:", error.message);
            // Không cần hiển thị lỗi này cho người dùng cuối, nhưng ghi lại để debug
        }

        // Bước 3: Gắn sự kiện cho các thành phần trên trang
        elements.plateSearchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const searchTerm = elements.plateInput.value.trim();
            if (searchTerm) {
                searchByTerm(searchTerm);
            }
        });

        elements.scanQrBtn.addEventListener('click', openQrScanner);
        elements.closeScannerBtn.addEventListener('click', closeQrScanner);

        // Bước 4: Xử lý tra cứu tự động từ URL
        const urlParams = new URLSearchParams(window.location.search);
        const ticketId = urlParams.get('ticketId');
        const plateFromUrl = urlParams.get('plate'); // Hỗ trợ cả tham số 'plate' cũ
        const termFromUrl = ticketId || plateFromUrl;

        if (termFromUrl) {
            elements.plateInput.value = termFromUrl;
            // Thêm một khoảng trễ nhỏ để đảm bảo giao diện được vẽ xong
            setTimeout(() => {
                searchByTerm(termFromUrl);
            }, 100);
        }
    };
    
    init();
});
