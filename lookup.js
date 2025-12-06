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
        plateDisplay: document.getElementById('plate-display'), // header hiển thị biển số
        messageBox: document.getElementById('message-box'),
        plateSearchForm: document.getElementById('plate-search-form'),
        plateInput: document.getElementById('plate-input'),
        scanQrBtn: document.getElementById('scan-qr-btn'),
        qrScannerModal: document.getElementById('qr-scanner-modal'),
        cameraFeed: document.getElementById('camera-feed'),
        closeScannerBtn: document.getElementById('close-scanner-btn'),
        // NÂNG CẤP: Modal xác thực số điện thoại
        phoneVerificationModal: document.getElementById('phone-verification-modal'),
        phoneVerifyForm: document.getElementById('phone-verify-form'),
        verifyPhoneInput: document.getElementById('verify-phone-input'),
        verifyPlateNumber: document.getElementById('verify-plate-number'),
        closeVerifyBtn: document.getElementById('close-verify-btn'),
    };

    let cameraStream = null;
    let scanAnimation = null;
    let LOCATIONS_DATA = [];
    let durationInterval = null;
    let serverTimeOffset = 0;

    // NÂNG CẤP: Biến tạm lưu trữ biển số đang chờ xác thực
    let pendingPlateSearch = null;

    dayjs.extend(window.dayjs_plugin_utc);
    dayjs.extend(window.dayjs_plugin_timezone);
    dayjs.extend(window.dayjs_plugin_duration);

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
    const getSyncedTime = () => new Date(Date.now() + serverTimeOffset);

    const calculateDuration = (startTime, endTime) => {
        if (!startTime || !endTime) return '--';
        const start = dayjs(startTime);
        const end = dayjs(endTime);
        const duration = dayjs.duration(end.diff(start));
        if (duration.asSeconds() <= 0) return '0 giây';

        const parts = [];
        if (duration.years() > 0) parts.push(`${duration.years()} năm`);
        if (duration.months() > 0) parts.push(`${duration.months()} tháng`);
        if (duration.days() > 0) parts.push(`${duration.days()} ngày`);
        if (duration.hours() > 0) parts.push(`${duration.hours()} giờ`);
        if (duration.minutes() > 0) parts.push(`${duration.minutes()} phút`);
        if (duration.seconds() > 0 || parts.length === 0) parts.push(`${duration.seconds()} giây`);
        return parts.join(' ');
    };

    const generateFeeBreakdownHTML = (transaction, locationConfig) => {
        const snapshot = typeof transaction.fee_policy_snapshot === 'string'
            ? JSON.parse(transaction.fee_policy_snapshot)
            : (transaction.fee_policy_snapshot || {});

        const policy = {
            type: snapshot.type || locationConfig?.fee_policy_type || 'free',
            per_entry: snapshot.per_entry ?? locationConfig?.fee_per_entry ?? FeeCalculator.config.per_entry,
            daily: snapshot.daily ?? locationConfig?.fee_daily ?? FeeCalculator.config.daily,
            hourly_day: snapshot.hourly_day ?? locationConfig?.fee_hourly_day ?? FeeCalculator.config.hourly_day,
            hourly_night: snapshot.hourly_night ?? locationConfig?.fee_hourly_night ?? FeeCalculator.config.hourly_night,
        };
        const policyType = policy.type;
        const isVIP = transaction.is_vip;
        const fee = transaction.fee;
        const startTime = dayjs(transaction.entry_time);
        const endTime = transaction.exit_time ? dayjs(transaction.exit_time) : dayjs(getSyncedTime());
        const durationMinutes = dayjs.duration(endTime.diff(startTime)).asMinutes();
        const freeMinutes = FeeCalculator.config.freeMinutes || 15;

        let breakdownHTML = '';
        if (isVIP) {
            breakdownHTML += `<p>✅ Miễn phí do là <strong>Khách VIP/Khách mời</strong>.</p>`;
        } else if (policyType === 'free') {
            breakdownHTML += `<p>✅ Bãi xe đang áp dụng chính sách <strong>Miễn phí</strong>.</p>`;
        } else if (transaction.status !== 'Đang gửi' && durationMinutes <= freeMinutes) {
            breakdownHTML += `<p>✅ Miễn phí do thời gian gửi xe (<strong>${Math.floor(durationMinutes)} phút</strong>) không vượt quá <strong>${freeMinutes} phút</strong> cho phép.</p>`;
        } else {
            breakdownHTML = '<div class="fee-receipt">';
            // Header Row
            breakdownHTML += `
                <div class="fee-row header">
                    <span class="fee-label">Diễn giải</span>
                    <span class="fee-time" style="text-align: center;">Thời gian</span>
                    <span class="fee-amount">Thành tiền</span>
                </div>
            `;

            switch (policyType) {
                case 'per_entry':
                    breakdownHTML += `
                        <div class="fee-row">
                            <span class="fee-label">Phí theo lượt</span>
                            <span class="fee-time">-</span>
                            <span class="fee-amount">${(policy.per_entry || 0).toLocaleString('vi-VN')}đ</span>
                        </div>`;
                    break;
                case 'daily':
                    const totalDays = Math.ceil(Math.max(0, durationMinutes - freeMinutes) / (60 * 24));
                    breakdownHTML += `
                        <div class="fee-row">
                            <span class="fee-label">Đơn giá ngày</span>
                            <span class="fee-time">1 ngày</span>
                            <span class="fee-amount">${(policy.daily || 0).toLocaleString('vi-VN')}đ</span>
                        </div>
                        <div class="fee-row">
                            <span class="fee-label">Số ngày tính phí</span>
                            <span class="fee-time">${Math.max(1, totalDays)} ngày</span>
                            <span class="fee-amount">-</span>
                        </div>`;
                    break;
                case 'hourly':
                    const chargeableStartTime = startTime.add(freeMinutes, 'minute');
                    let dayMinutes = 0; let nightMinutes = 0;
                    let cursor = chargeableStartTime.clone();
                    while (cursor.isBefore(endTime)) {
                        const hour = cursor.hour();
                        if (hour >= FeeCalculator.config.nightStartHour || hour < FeeCalculator.config.nightEndHour) nightMinutes++;
                        else dayMinutes++;
                        cursor = cursor.add(1, 'minute');
                    }
                    const dayFee = Math.floor(dayMinutes / 60) * (policy.hourly_day || 0);
                    const nightFee = Math.floor(nightMinutes / 60) * (policy.hourly_night || 0);

                    if (dayMinutes > 0) {
                        breakdownHTML += `
                            <div class="fee-row">
                                <span class="fee-label">Ban ngày (${(policy.hourly_day || 0).toLocaleString('vi-VN')}đ/h)</span>
                                <span class="fee-time">${Math.floor(dayMinutes / 60)} giờ</span>
                                <span class="fee-amount">${dayFee.toLocaleString('vi-VN')}đ</span>
                            </div>`;
                    }
                    if (nightMinutes > 0) {
                        breakdownHTML += `
                            <div class="fee-row">
                                <span class="fee-label">Ban đêm (${(policy.hourly_night || 0).toLocaleString('vi-VN')}đ/h)</span>
                                <span class="fee-time">${Math.floor(nightMinutes / 60)} giờ</span>
                                <span class="fee-amount">${nightFee.toLocaleString('vi-VN')}đ</span>
                            </div>`;
                    }
                    break;
                default:
                    breakdownHTML += `<div class="fee-row"><span class="fee-label">Không có thông tin chi tiết.</span></div>`;
            }

            if (transaction.status !== 'Đang gửi') {
                breakdownHTML += `
                    <div class="fee-total-row">
                        <span>Tổng cộng</span>
                        <span>${(fee || 0).toLocaleString('vi-VN')}đ</span>
                    </div>
                `;
            }
            breakdownHTML += '</div>';
        }

        let regulationText = '';
        if (isVIP) regulationText = `Xe được miễn phí do thuộc diện ưu tiên (Khách VIP/Khách mời).`;
        else if (policyType === 'free') regulationText = `Bãi xe đang áp dụng chính sách miễn phí cho tất cả các xe.`;
        else if (transaction.status !== 'Đang gửi' && durationMinutes <= freeMinutes) regulationText = `Xe được miễn phí do thời gian gửi không vượt quá ${freeMinutes} phút quy định.`;
        else if (policyType === 'hourly') regulationText = `Miễn phí ${freeMinutes} phút đầu. Phí ban đêm áp dụng từ ${FeeCalculator.config.nightStartHour}h đến ${FeeCalculator.config.nightEndHour}h sáng hôm sau.`;
        else regulationText = `Miễn phí ${freeMinutes} phút đầu tiên.`;

        breakdownHTML += `<p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem; border-top: 1px dashed var(--border-color); padding-top: 0.5rem;">* <strong>Ghi chú:</strong> ${regulationText} Mọi thắc mắc vui lòng liên hệ nhân viên trông xe.</p>`;
        return breakdownHTML;
    };

    const getLocationName = (locationId) => {
        if (!locationId) return 'Không xác định';
        const location = LOCATIONS_DATA.find(loc => loc.id === locationId);
        return location ? location.name : 'Không xác định';
    };

    const renderHistory = (history, searchTerm) => {
        if (!history || history.length === 0) {
            showMessage('Không tìm thấy lịch sử cho xe này.', true);
            return;
        }

        history.sort((a, b) => new Date(b.entry_time) - new Date(a.entry_time));

        if (durationInterval) {
            clearInterval(durationInterval);
            durationInterval = null;
        }
        const elementsToUpdate = [];

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
            const locationConfig = LOCATIONS_DATA.find(loc => loc.id === tx.location_id) || {};

            let durationDisplay = '--';
            let feeDisplay = '--';
            if (isDeparted) {
                durationDisplay = calculateDuration(tx.entry_time, tx.exit_time);
                feeDisplay = (tx.fee || 0).toLocaleString('vi-VN') + 'đ';
            }

            const feeBreakdownHTML = generateFeeBreakdownHTML(tx, locationConfig);

            let directionsButtonHTML = '';
            if (locationConfig.lat && locationConfig.lng) {
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                const locationLabel = encodeURIComponent(locationName);
                const directionsUrl = isMobile
                    ? `geo:${locationConfig.lat},${locationConfig.lng}?q=${locationConfig.lat},${locationConfig.lng}(${locationLabel})`
                    : `https://www.google.com/maps/dir/?api=1&destination=${locationConfig.lat},${locationConfig.lng}`;

                directionsButtonHTML = `<a href="${directionsUrl}" class="directions-btn" target="_blank" rel="noopener noreferrer" title="Chỉ đường đến bãi xe này"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg></a>`;
            }

            card.innerHTML = `
                <div class="history-card-body">
                    <div class="detail-item">
                        <span class="label"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5a2.5 2.5 0 0 1 2.5 2.5V6h-5V5A2.5 2.5 0 0 1 12 2.5z"/><path d="M12 15.1a6.6 6.6 0 0 1-6.6-6.6C5.4 5.1 8.3 2 12 2s6.6 3.1 6.6 6.5a6.6 6.6 0 0 1-6.6 6.6z"/><path d="M15.5 8.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zM12 7.1a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zM8.5 8.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"/><path d="M12 22a8 8 0 0 1-8-8c0-4.4 3.6-8 8-8s8 3.6 8 8a8 8 0 0 1-8 8z"/></svg>Trạng thái</span>
                        <span class="value"><span class="status-badge ${statusClass}">${tx.status}</span></span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>Giờ vào</span>
                        <span class="value">${formatDateTime(tx.entry_time)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>Giờ ra</span>
                        <span class="value">${isDeparted ? formatDateTime(tx.exit_time) : '--'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>Tổng thời gian</span>
                        <span class="value" id="duration-${tx.unique_id}">${durationDisplay}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>Bãi đỗ xe</span>
                        <div class="location-value-wrapper"><span class="value">${locationName}</span>${directionsButtonHTML}</div>
                    </div>
                    <div class="detail-item">
                        <span class="label"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>Phí gửi xe</span>
                        <div class="fee-value-wrapper">
                            <span class="value" id="fee-${tx.unique_id}" style="font-weight: bold; color: var(--accent-color);">${feeDisplay}</span>
                            <button class="fee-details-toggle" data-target="fee-details-${tx.unique_id}" title="Xem chi tiết phí">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                        </div>
                    </div>
                    <div class="fee-breakdown"><div class="fee-details-content" id="fee-details-${tx.unique_id}">${feeBreakdownHTML}</div></div>
                </div>
            `;
            elements.historyContainer.appendChild(card);

            if (!isDeparted) {
                elementsToUpdate.push({
                    transaction: tx,
                    entryTime: tx.entry_time,
                    durationEl: document.getElementById(`duration-${tx.unique_id}`),
                    feeEl: document.getElementById(`fee-${tx.unique_id}`)
                });
            }
        });

        if (elementsToUpdate.length > 0) {
            durationInterval = setInterval(() => {
                elementsToUpdate.forEach(item => {
                    item.durationEl.textContent = calculateDuration(item.entryTime, getSyncedTime());
                    const locationConfig = LOCATIONS_DATA.find(loc => loc.id === item.transaction.location_id) || {};
                    item.feeEl.textContent = FeeCalculator.calculate(item.transaction, getSyncedTime(), locationConfig).toLocaleString('vi-VN') + 'đ (dự kiến)';
                });
            }, 1000);
        }
    };

    // =================================================================
    // --- KHU VỰC 3: LOGIC CHÍNH VÀ SỰ KIỆN ---
    // =================================================================

    // --- QR Scanner Logic ---
    const openQrScanner = async () => {
        if (!('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices)) { showMessage('Trình duyệt không hỗ trợ camera.', true); return; }
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            elements.cameraFeed.srcObject = cameraStream;
            elements.qrScannerModal.style.display = 'flex';
            await elements.cameraFeed.play();
            scanAnimation = requestAnimationFrame(tick);
        } catch (err) { showMessage('Không thể truy cập camera. Vui lòng cấp quyền.', true); }
    };

    const closeQrScanner = () => {
        if (scanAnimation) cancelAnimationFrame(scanAnimation);
        if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
        elements.qrScannerModal.style.display = 'none';
    };

    const tick = () => {
        if (elements.cameraFeed.readyState === elements.cameraFeed.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement('canvas');
            canvas.width = elements.cameraFeed.videoWidth; canvas.height = elements.cameraFeed.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(elements.cameraFeed, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });

            if (code) {
                let termToSearch = code.data;
                try {
                    const url = new URL(code.data);
                    const ticketId = url.searchParams.get('ticketId');
                    if (ticketId) termToSearch = ticketId;
                } catch (e) { }
                closeQrScanner();
                if (navigator.vibrate) navigator.vibrate(100);
                elements.plateInput.value = termToSearch;
                searchByTerm(termToSearch);
            }
        }
        scanAnimation = requestAnimationFrame(tick);
    };

    // --- Xử lý xác thực số điện thoại ---
    const openVerifyModal = (plate) => {
        pendingPlateSearch = plate;
        elements.verifyPlateNumber.textContent = plate;
        elements.verifyPhoneInput.value = '';
        elements.phoneVerificationModal.style.display = 'flex';
        elements.verifyPhoneInput.focus();
    };

    const closeVerifyModal = (resetUI = true) => {
        elements.phoneVerificationModal.style.display = 'none';
        pendingPlateSearch = null;
        if (resetUI) {
            showLoading(); // Reset lại trạng thái loading nếu hủy
            setTimeout(() => {
                elements.messageBox.style.display = 'none'; // Ẩn loading
                elements.resultsSection.style.display = 'none'; // Đảm bảo không hiện kết quả
            }, 300);
        }
    };

    elements.closeVerifyBtn.addEventListener('click', () => closeVerifyModal(true));

    elements.phoneVerifyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = elements.verifyPhoneInput.value.trim();
        const plate = pendingPlateSearch;

        if (!phone || !plate) return;

        // Verify phone matches plate in DB
        const { data, error } = await db
            .from('transactions')
            .select('*')
            .eq('plate', plate)
            // .eq('phone', phone) // CÁCH 1: Verify chính xác 100%
            .limit(1);

        // CÁCH 2: Lấy list theo plate rồi check phone trong JS để linh hoạt hơn (ví dụ check 4 số cuối)
        // Hiện tại dùng cách query DB trực tiếp để bảo mật tối đa

        // Tuy nhiên, vì người dùng có thể nhập số điện thoại khác nhau ở các lượt gửi khác nhau
        // Nên ta cần kiểm tra xem CÓ BẤT KỲ transaction nào của biển số này khớp với SĐT này không.
        const { data: verifyData, error: verifyError } = await db
            .from('transactions')
            .select('*')
            .eq('plate', plate)
            .eq('phone', phone)
            .limit(1);

        if (verifyData && verifyData.length > 0) {
            // Xác thực thành công -> Tiến hành hiển thị kết quả
            closeVerifyModal(false); // Đóng modal nhưng KHÔNG reset UI
            // Gọi lại search nhưng "bypass" bước verify bằng cách dùng function nội bộ hoặc
            // gọi lại searchByTerm nhưng ta cần refactor searchByTerm một chút để hỗ trợ "đã verify".
            // Đơn giản nhất: Thực hiện query lấy full history cho plate này và render luôn.

            showLoading();
            const { data: fullHistory, error: historyError } = await db
                .from('transactions')
                .select('*')
                .eq('plate', plate);

            if (fullHistory) {
                const uniqueResults = Array.from(new Map(fullHistory.map(item => [item.unique_id, item])).values());
                renderHistory(uniqueResults, plate);
            }
        } else {
            alert("Số điện thoại không đúng hoặc không khớp với biển số xe này. Vui lòng kiểm tra lại.");
        }
    });

    // --- Hàm tìm kiếm chính ---
    const searchByTerm = async (term, isVerified = false) => {
        showLoading();
        if (navigator.vibrate) navigator.vibrate(50);

        const cleanedTerm = term.trim();
        const upperCaseTerm = cleanedTerm.toUpperCase();

        // CẬP NHẬT URL ĐỂ CHIA SẺ (NẾU KHÔNG PHẢI CHẾ ĐỘ LOCKED)
        const currentUrlParams = new URLSearchParams(window.location.search);
        if (!currentUrlParams.has('ticketId')) {
            const newUrl = new URL(window.location);
            newUrl.searchParams.set('plate', cleanedTerm);
            window.history.pushState({}, '', newUrl);
        }

        // Kiểm tra xem term có phải là SĐT không (chỉ chứa số, độ dài 10-12)
        const isPhone = /^\d{10,12}$/.test(cleanedTerm);

        try {
            // NẾU LÀ SĐT: Tìm trực tiếp, không cần xác thực
            if (isPhone) {
                const { data, error } = await db.from('transactions').select('*').eq('phone', cleanedTerm);
                if (data && data.length > 0) {
                    const uniqueResults = Array.from(new Map(data.map(item => [item.unique_id, item])).values());
                    renderHistory(uniqueResults, cleanedTerm);
                    return;
                } else {
                    showMessage(`Không tìm thấy xe nào đăng ký với SĐT "${cleanedTerm}".`, true);
                    return;
                }
            }

            // NẾU KHÔNG PHẢI SĐT (Có thể là Biển số hoặc TicketId)

            // 1. Thử tìm theo Unique ID (Ticket ID) trước - Đây là trường hợp quét QR hoặc nhập Mã vé
            // Mã vé thường là UUID hoặc chuỗi ngẫu nhiên dài, khó đoán.
            // Nếu khớp TicketID -> Cho phép xem luôn (coi như người cầm vé là chủ xe).
            const { data: ticketData } = await db.from('transactions').select('*').eq('unique_id', cleanedTerm);

            if (ticketData && ticketData.length > 0) {
                const uniqueResults = Array.from(new Map(ticketData.map(item => [item.unique_id, item])).values());
                renderHistory(uniqueResults, cleanedTerm);
                return;
            }

            // 2. Nếu không phải TicketID, coi là Biển số.
            // Tìm xem biển số có tồn tại không
            const { data: plateData } = await db.from('transactions').select('*').eq('plate', upperCaseTerm).limit(1);

            if (plateData && plateData.length > 0) {
                // Biển số tồn tại.
                const record = plateData[0];

                // YÊU CẦU: Nếu xe không có SĐT đăng ký -> Bỏ qua xác thực, hiển thị luôn.
                if (!record.phone || record.phone.trim() === '') {
                    // Tìm tất cả lịch sử của biển này
                    const { data: fullHistory } = await db.from('transactions').select('*').eq('plate', upperCaseTerm);
                    if (fullHistory) {
                        const uniqueResults = Array.from(new Map(fullHistory.map(item => [item.unique_id, item])).values());
                        renderHistory(uniqueResults, upperCaseTerm);
                    }
                } else {
                    // Xe có SĐT -> Yêu cầu xác thực
                    elements.messageBox.style.display = 'none'; // Ẩn loading
                    openVerifyModal(upperCaseTerm);
                }
            } else {
                showMessage(`Không tìm thấy thông tin cho "${term}".`, true);
            }

        } catch (error) {
            showMessage(`Đã xảy ra lỗi: ${error.message}`, true);
            console.error(error);
        }
    };

    // --- Initialization ---
    const init = async () => {
        try { await configPromise; } catch (e) { }

        // Đồng bộ thời gian
        try {
            const response = await fetch('https://worldtimeapi.org/api/timezone/Asia/Ho_Chi_Minh');
            const data = await response.json();
            serverTimeOffset = new Date(data.utc_datetime).getTime() - Date.now();
        } catch (error) { console.error('Lỗi đồng bộ thời gian', error); }

        try {
            const { data, error } = await db.from('locations').select('*');
            LOCATIONS_DATA = data || [];
        } catch (e) { }

        elements.plateSearchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const searchTerm = elements.plateInput.value.trim();
            if (searchTerm) searchByTerm(searchTerm);
        });

        // Event listener cho toggle chi tiết phí
        elements.historyContainer.addEventListener('click', (e) => {
            const toggleButton = e.target.closest('.fee-details-toggle');
            if (toggleButton) {
                const targetId = toggleButton.dataset.target;
                const content = document.getElementById(targetId);
                if (content) {
                    content.classList.toggle('visible');
                    toggleButton.classList.toggle('expanded');
                }
            }
        });

        elements.scanQrBtn.addEventListener('click', openQrScanner);
        elements.closeScannerBtn.addEventListener('click', closeQrScanner);

        // XỬ LÝ URL & KHÓA TÌM KIẾM
        const urlParams = new URLSearchParams(window.location.search);
        const ticketId = urlParams.get('ticketId');

        if (ticketId) {
            // NÂNG CẤP: Chế độ Xem Vé (Reader Mode / Locked Mode)
            elements.plateInput.value = ticketId;
            elements.plateInput.disabled = true; // Khóa input
            elements.plateInput.style.backgroundColor = '#e2e8f0'; // Gray out
            elements.scanQrBtn.style.display = 'none'; // Ẩn nút quét QR

            // Ẩn nút tìm kiếm trong form để chặn user submit cái khác
            const searchBtn = elements.plateSearchForm.querySelector('button');
            if (searchBtn) searchBtn.style.display = 'none';

            // Thay đổi tiêu đề section để báo hiệu đang ở chế độ xem chi tiết
            const sectionTitle = elements.searchSection.querySelector('.section-title');
            if (sectionTitle) sectionTitle.textContent = "Chi tiết Vé xe";

            setTimeout(() => {
                searchByTerm(ticketId);
            }, 100);
        } else {
            // Logic cũ cho tham số 'plate' (nếu có check debug)
            const plateFromUrl = urlParams.get('plate');
            if (plateFromUrl) {
                elements.plateInput.value = plateFromUrl;
                setTimeout(() => searchByTerm(plateFromUrl), 100);
            }
        }
    };

    init();
});
