document.addEventListener('DOMContentLoaded', () => {
    // =================================================================
    // KHU VỰC 0: THIẾT LẬP KẾT NỐI SUPABASE
    // =================================================================
    const db = supabase.createClient(
        'https://mtihqbmlbtrgvamxwrkm.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10aWhxYm1sYnRyZ3ZhbXh3cmttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMTkwMDEsImV4cCI6MjA3NzU5NTAwMX0.hR5X8bp-XD2DfxUnvWF-yxVk4sFVW2zBunp5XXnIZ0Y'
    );

    // =================================================================
    // KHU VỰC 1: KHAI BÁO BIẾN VÀ THAM CHIẾU DOM
    // =================================================================
    const elements = {
        searchSection: document.getElementById('search-section'),
        resultsSection: document.getElementById('results-section'),
        resultSummaryCard: document.getElementById('result-summary-card'),
        historyTimeline: document.getElementById('history-timeline'),
        messageBox: document.getElementById('message-box'),
        plateSearchForm: document.getElementById('plate-search-form'),
        plateInput: document.getElementById('plate-input'),
        scanQrBtn: document.getElementById('scan-qr-btn'),
        modalContainer: document.getElementById('modal-container'),
    };

    let cameraStream = null;
    let scanAnimation = null;
    let currentHistory = [];

    // =================================================================
    // KHU VỰC 2: CÁC HÀM TIỆN ÍCH VÀ GIAO DIỆN
    // =================================================================
    const showMessage = (message, isError = false) => {
        elements.resultsSection.style.display = 'none';
        elements.messageBox.style.display = 'block';
        elements.messageBox.innerHTML = `<div class="card__body" style="${isError ? 'color: var(--danger-color);' : ''}">${message}</div>`;
    };

    const showLoading = () => {
        elements.resultsSection.style.display = 'none';
        elements.messageBox.style.display = 'block';
        elements.messageBox.innerHTML = `<div class="card__body"><div class="skeleton-item" style="height: 40px; width: 80%; margin: auto;"></div></div>`;
    };

    const formatDateTime = (dateStr) => dateStr ? new Date(dateStr).toLocaleString('vi-VN') : '--';
    const formatCurrency = (n) => new Intl.NumberFormat('vi-VN').format(n || 0);

    const calculateDuration = (startTime, endTime) => {
        if (!startTime || !endTime) return '--';
        const start = new Date(startTime);
        const end = new Date(endTime);
        let diff = Math.floor((end - start) / 1000);
        if (diff < 0) return '0m';
        const d = Math.floor(diff / 86400); diff %= 86400;
        const h = Math.floor(diff / 3600); diff %= 3600;
        const m = Math.floor(diff / 60);
        return [d > 0 ? `${d}d` : '', h > 0 ? `${h}h` : '', `${m}m`].filter(Boolean).join(' ') || '0m';
    };

    // TỐI ƯU HÓA: Tìm kiếm trên nhiều trường cùng lúc bằng .or()
    const universalSearch = async (searchTerm) => {
        showLoading();
        const term = searchTerm.trim(); // Chỉ cần trim, không cần toUpperCase() vì DB sẽ xử lý

        try {
            // SỬA LỖI TRIỆT ĐỂ: Gọi hàm RPC trên Supabase thay vì xây dựng câu lệnh .or() thủ công.
            // Phương pháp này an toàn tuyệt đối với các ký tự đặc biệt và hiệu quả hơn.
            const { data, error } = await db
                .rpc('search_transactions', { search_term: term })
                .select('*, locations(name)') // Vẫn có thể select kèm bảng khác sau khi gọi RPC
                .order('entry_time', { ascending: false });

            if (error) throw error;

            if (data && data.length > 0) {
                renderHistory(data);
            } else {
                showMessage(`Không tìm thấy lịch sử nào cho từ khóa "${searchTerm}".`, true);
            }
        } catch (error) {
            console.error('Lỗi tìm kiếm:', error);
            showMessage('Đã có lỗi xảy ra trong quá trình tìm kiếm. Vui lòng thử lại.', true);
        }
    };

    // CẢI TIẾN: Giao diện hiển thị kết quả hoàn toàn mới
    const renderHistory = (history) => {
        if (!history || history.length === 0) {
            showMessage('Không tìm thấy lịch sử cho xe này.', true);
            return;
        }

        currentHistory = history;
        const plateToDisplay = history[0]?.plate;
        const totalFee = history.reduce((sum, tx) => sum + (tx.fee || 0), 0);

        // Render card thông tin tóm tắt
        elements.resultSummaryCard.innerHTML = `
            <div class="card__body" style="text-align: center;">
                <p style="color: var(--text-secondary);">Lịch sử giao dịch cho biển số</p>
                <h2 style="font-size: 2.5rem; font-family: monospace; color: var(--primary-accent); margin: 0.5rem 0;">${plateToDisplay}</h2>
                <p>Tổng số <strong>${history.length}</strong> lượt gửi. Tổng chi phí: <strong style="color: var(--danger-color);">${formatCurrency(totalFee)}đ</strong></p>
                <button id="download-all-btn" class="action-button btn--secondary" style="width: auto; margin-top: 1rem; padding: 0.5rem 1rem;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Tải tất cả biên lai (PDF)
                </button>
            </div>
        `;
        document.getElementById('download-all-btn').addEventListener('click', downloadAllReceipts);

        // Render dòng thời gian
        elements.historyTimeline.innerHTML = '';
        elements.messageBox.style.display = 'none';
        elements.resultsSection.style.display = 'block';

        history.forEach(tx => {
            const card = document.createElement('div');
            card.className = 'card history-card'; // Sử dụng class 'card'
            const isDeparted = tx.status !== 'Đang gửi';
            const statusClass = isDeparted ? 'departed' : 'parking';
            const locationName = tx.locations?.name || 'Không rõ';

            let receiptActionHtml = '';
            if (isDeparted) {
                const params = new URLSearchParams({
                    uniqueID: tx.unique_id,
                    plate: tx.plate,
                    entryTime: tx.entry_time,
                    exitTime: tx.exit_time,
                    fee: tx.fee,
                    paymentMethod: tx.payment_method || '--',
                    isVip: tx.is_vip,
                });
                receiptActionHtml = `<a href="receipt.html?${params.toString()}" target="_blank" class="action-button btn--secondary" style="width: auto; padding: 0.5rem 1rem;">Xem biên lai</a>`;
            }

            card.innerHTML = `
                <div class="card__header">
                    <span>${new Date(tx.entry_time).toLocaleDateString('vi-VN')} - Tại: <strong>${locationName}</strong></span>
                    <span class="status-badge ${statusClass}">${tx.status}</span>
                </div>
                <div class="card__body">
                    <div class="info-grid">
                        <div class="info-item"><span class="label">Giờ vào</span><span class="value">${formatDateTime(tx.entry_time)}</span></div>
                        <div class="info-item"><span class="label">Giờ ra</span><span class="value">${formatDateTime(tx.exit_time)}</span></div>
                        <div class="info-item"><span class="label">Tổng thời gian</span><span class="value">${calculateDuration(tx.entry_time, tx.exit_time)}</span></div>
                        <div class="info-item"><span class="label">Phí gửi xe</span><span class="value" style="color: var(--danger-color);">${formatCurrency(tx.fee)}đ</span></div>
                    </div>
                </div>
                ${isDeparted ? `<div class="card__footer" style="text-align: right;">${receiptActionHtml}</div>` : ''}
            `;
            elements.historyTimeline.appendChild(card);
        });
    };

    // =================================================================
    // KHU VỰC 3: HÀM TẢI TẤT CẢ BIÊN LAI
    // =================================================================
    const downloadAllReceipts = () => {
        // Chức năng này phức tạp và có thể gây lỗi, tạm thời vô hiệu hóa để đảm bảo tính ổn định
        // và sẽ được nâng cấp trong phiên bản sau.
        alert('Chức năng "Tải tất cả biên lai" đang được nâng cấp và sẽ sớm quay trở lại. Cảm ơn bạn đã thông cảm!');
        return;

        // --- Code cũ (đã tạm ẩn) ---
        /*
        const btn = document.getElementById('download-all-btn');
        btn.disabled = true;
        btn.textContent = 'Đang chuẩn bị file...';

        const allReceiptsContainer = document.createElement('div');
        document.body.appendChild(allReceiptsContainer);

        let receiptsHtml = '';
        currentHistory.filter(tx => tx.status !== 'Đang gửi').forEach(tx => {
            const params = new URLSearchParams({
                uniqueID: tx.unique_id, plate: tx.plate,
                entryTime: formatDateTime(tx.entry_time), exitTime: formatDateTime(tx.exit_time),
                duration: calculateDuration(tx.entry_time, tx.exit_time),
                fee: formatCurrency(tx.fee), paymentMethod: tx.payment_method || '--',
            });
            // Cần một trang template để render iframe
            // receiptsHtml += `<iframe src="receipt.html?${params.toString()}"></iframe>`;
        });

        allReceiptsContainer.innerHTML = receiptsHtml;
        const opt = {
            margin: [0, 0, 0, 0],
            filename: `TatCaBienLai_${currentHistory[0].plate}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().from(allReceiptsContainer).set(opt).save().then(() => {
            document.body.removeChild(allReceiptsContainer);
            btn.disabled = false;
            btn.innerHTML = `...`; // Khôi phục nội dung nút
        }).catch(err => {
            console.error("Lỗi khi tạo PDF:", err);
            document.body.removeChild(allReceiptsContainer);
            btn.disabled = false;
            btn.innerHTML = `...`; // Khôi phục nội dung nút
            showMessage('Đã có lỗi xảy ra khi tạo file PDF.', true);
        });
        */
    };

    // --- QR Scanner Logic ---
    const openQrScanner = async () => {
        const modalHTML = `
            <div class="modal-overlay active" id="qr-scanner-modal">
                <div class="modal-content" style="max-width: 480px;">
                    <div class="modal-header">
                        <h2>Quét mã QR trên vé xe</h2>
                        <button class="modal-close-btn" data-action="close-scanner">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="qr-scanner-body">
                            <video id="camera-feed" playsinline></video>
                            <div class="scanner-overlay">
                                <div class="scanner-viewfinder">
                                    <div class="corner corner-tl"></div><div class="corner corner-tr"></div>
                                    <div class="corner corner-bl"></div><div class="corner corner-br"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        elements.modalContainer.innerHTML = modalHTML;

        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            const video = document.getElementById('camera-feed');
            video.srcObject = cameraStream;
            await video.play();
            scanAnimation = requestAnimationFrame(tick);
        } catch(err) { 
            showMessage('Không thể truy cập camera. Vui lòng cấp quyền.', true); 
            closeQrScanner();
        }
    };

    const closeQrScanner = () => {
        if (scanAnimation) cancelAnimationFrame(scanAnimation);
        if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
        elements.modalContainer.innerHTML = '';
    };

    const tick = () => {
        const video = document.getElementById('camera-feed');
        if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
            
            if (code) {
                closeQrScanner();
                universalSearch(code.data);
            }
        }
        scanAnimation = requestAnimationFrame(tick);
    };

    // --- Initialization ---
    const init = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const uniqueID = urlParams.get('id');
        if (uniqueID) {
            universalSearch(uniqueID);
        }

        // Setup event listeners
        elements.plateSearchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const searchTerm = elements.plateInput.value.trim();
            if (searchTerm) {
                universalSearch(searchTerm);
            }
        });

        elements.scanQrBtn.addEventListener('click', openQrScanner);
        elements.modalContainer.addEventListener('click', (e) => {
            if (e.target.closest('[data-action="close-scanner"]')) {
                closeQrScanner();
            }
        });
    };
    
    init();
});
