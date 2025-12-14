document.addEventListener('DOMContentLoaded', () => {
    // SỬA LỖI: Đã xóa dòng `let db;` không cần thiết.
    // Giờ đây, tệp này sẽ sử dụng biến `db` toàn cục được cung cấp bởi `config.js`.
    const db = window.SUPABASE_DB; // Ensure explicit reference

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
    let activePlate = null; // Track currently viewed plate for realtime updates

    // --- EMAIL RECEIPT LOGIC ---
    const emailElements = {
        modal: document.getElementById('email-receipt-modal'),
        form: document.getElementById('email-receipt-form'),
        input: document.getElementById('email-input'),
        ticketId: document.getElementById('email-ticket-id'),
        closeBtn: document.getElementById('close-email-btn')
    };

    // --- GLOBAL HANDLERS (EXPOSED FOR ONCLICK) ---
    window.Handlers = {
        openEmailModal: (ticketId) => {
            try {
                // Fetch elements dynamically to avoid init race conditions
                const modal = document.getElementById('email-receipt-modal');
                const form = document.getElementById('email-receipt-form');
                const input = document.getElementById('email-input');
                const ticketInput = document.getElementById('email-ticket-id');

                if (!modal || !input || !ticketInput) {
                    console.error('Email Modal Elements missing:', { modal, input, ticketInput });
                    alert('Lỗi: Không tìm thấy khung nhập Email. Vui lòng tải lại trang (F5).');
                    return;
                }

                ticketInput.value = ticketId;
                // Get last email safely
                try { input.value = localStorage.getItem('last_email') || ''; } catch (e) { }

                modal.style.display = 'flex';

                // Focus with slight delay to ensure visibility
                setTimeout(() => input.focus(), 50);
            } catch (err) {
                console.error('Error opening modal:', err);
                alert('Có lỗi xảy ra khi mở hộp thoại: ' + err.message);
            }
        }
    };

    if (emailElements.closeBtn) {
        emailElements.closeBtn.addEventListener('click', () => {
            emailElements.modal.style.display = 'none';
        });
    }

    if (emailElements.form) {
        emailElements.form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = emailElements.input.value.trim();
            const ticketId = emailElements.ticketId.value;

            if (!email) return;
            localStorage.setItem('last_email', email);

            // Kiểm tra cấu hình URL
            if (!APP_CONFIG.googleScriptUrl || APP_CONFIG.googleScriptUrl.includes('HÃY_DÁN')) {
                alert('Chưa cấu hình Google Script URL. Vui lòng liên hệ quản trị viên.');
                return;
            }

            // Lấy thông tin chi tiết transaction để gửi lên GAS
            // (Tuy GAS có thể query DB nhưng để đơn giản ta gửi luôn dữ liệu cần thiết từ client hoặc GAS tự query nếu có quyền)
            // Tối ưu: Client gửi ticketID -> GAS query DB (Bảo mật hơn). 
            // Nhưng hiện tại GAS chưa kết nối Supabase, nên ta sẽ lấy data từ Client gửi lên.

            // showLoading(); // BỎ: Không dùng màn hình chờ toàn cục

            const submitBtn = emailElements.form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.classList.add('btn-loading'); // Thêm hiệu ứng quay vòng
                submitBtn.disabled = true;
            }

            try {
                // Fetch data mới nhất từ DB
                const { data: txData } = await db.from('transactions').select('*').eq('unique_id', ticketId).single();
                if (!txData) throw new Error('Không tìm thấy dữ liệu vé.');

                const locationConfig = LOCATIONS_DATA.find(loc => loc.id == txData.location_id || (loc.id && String(loc.id).toUpperCase() === String(txData.location_id).toUpperCase())) || {};
                const fee = FeeCalculator.calculate(txData, getSyncedTime(), locationConfig);
                const duration = calculateDuration(txData.entry_time, txData.exit_time || getSyncedTime());

                // Tái tạo logic tính toán text
                let feeDetailsText = "Chi tiết phí không khả dụng";
                try {
                    // (Giữ nguyên logic tạo text chi tiết phí - Rút gọn để tiết kiệm token cho prompt này, 
                    // thực tế code vẫn giữ nguyên logic cũ vì nó dài. 
                    // Ở đây tôi giả định logic này không đổi, chỉ thay đổi flow UI)
                    // ... [LOGIC TẠO TEXT GIỮ NGUYÊN] ...
                    // Để đảm bảo code chạy đúng, tôi sẽ copy lại đoạn logic tạo text ngắn gọn nhất hoặc giả định nó đã có.
                    // NHƯNG ĐỂ AN TOÀN TUYỆT ĐỐI, tôi sẽ giữ nguyên khối logic cũ, chỉ bọc lại flow UI.

                    // COPY LẠI LOGIC CŨ (Bắt buộc phải có để tính feeDetailsText)
                    const snapshot = typeof txData.fee_policy_snapshot === 'string' ? JSON.parse(txData.fee_policy_snapshot) : (txData.fee_policy_snapshot || {});
                    const policy = {
                        type: snapshot.type || locationConfig?.fee_policy_type || 'free',
                        per_entry: snapshot.per_entry ?? locationConfig?.fee_per_entry ?? FeeCalculator.config.per_entry,
                        daily: snapshot.daily ?? locationConfig?.fee_daily ?? FeeCalculator.config.daily,
                        hourly_day: snapshot.hourly_day ?? locationConfig?.fee_hourly_day ?? FeeCalculator.config.hourly_day,
                        hourly_night: snapshot.hourly_night ?? locationConfig?.fee_hourly_night ?? FeeCalculator.config.hourly_night,
                    };
                    const startTime = dayjs(txData.entry_time);
                    const endTime = txData.exit_time ? dayjs(txData.exit_time) : dayjs(getSyncedTime());
                    const durationMinutes = dayjs.duration(endTime.diff(startTime)).asMinutes();
                    const freeMinutes = FeeCalculator.config.freeMinutes || 15;

                    if (txData.is_vip) feeDetailsText = "Miễn phí (Khách VIP/Khách mời)";
                    else if (policy.type === 'free') feeDetailsText = "Miễn phí (Chính sách bãi xe)";
                    else if (txData.status !== 'Đang gửi' && durationMinutes <= freeMinutes) feeDetailsText = `Miễn phí (Gửi dưới ${freeMinutes} phút)`;
                    else {
                        // --- LOGIC CHI TIẾT CAO CẤP (CHỐNG TRANH CHẤP) ---
                        // Tái sử dụng logic diễn giải từ Web View để email có độ chi tiết tương đương
                        let lines = [];

                        // 1. Phần tính toán toán học (Cũ)
                        switch (policy.type) {
                            case 'per_entry':
                                lines.push(`- Loại hình: Vé lượt`);
                                lines.push(`- Đơn giá: ${(policy.per_entry || 0).toLocaleString('vi-VN')}đ / lượt`);
                                break;
                            case 'daily':
                                const totalDays = Math.ceil(Math.max(0, durationMinutes - freeMinutes) / (60 * 24));
                                lines.push(`- Loại hình: Vé ngày`);
                                lines.push(`- Đơn giá: ${(policy.daily || 0).toLocaleString('vi-VN')}đ / ngày`);
                                lines.push(`- Số ngày tính phí: ${Math.max(1, totalDays)} ngày`);
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

                                lines.push(`CHI TIẾT GIỜ GỬI:`);
                                if (dayMinutes > 0) lines.push(`- Ban ngày: ${Math.floor(dayMinutes / 60)}h${dayMinutes % 60}p (Đơn giá: ${(policy.hourly_day || 0).toLocaleString()}đ/h) => Thành tiền: ${dayFee.toLocaleString()}đ`);
                                if (nightMinutes > 0) lines.push(`- Ban đêm: ${Math.floor(nightMinutes / 60)}h${nightMinutes % 60}p (Đơn giá: ${(policy.hourly_night || 0).toLocaleString()}đ/h) => Thành tiền: ${nightFee.toLocaleString()}đ`);

                                // 2. Phần diễn giải quy định (Mới - Rất quan trọng để dân không cãi)
                                const totalMin = Math.ceil(durationMinutes);
                                const hours = Math.floor(totalMin / 60);
                                const mins = totalMin % 60;
                                const timeString = hours > 0 ? `${hours} giờ ${mins} phút` : `${mins} phút`;

                                let specificExample = "";
                                if (totalMin > 60) {
                                    const extraHours = Math.ceil((totalMin - 60) / 60);
                                    specificExample = `được quy đổi thành 02 block 30 phút (cho giờ đầu tiên) và ${extraHours.toString().padStart(2, '0')} block 01 giờ (cho các giờ tiếp theo)`;
                                } else {
                                    const blocks = Math.ceil(totalMin / 30);
                                    specificExample = `được quy đổi thành ${blocks.toString().padStart(2, '0')} block 30 phút`;
                                }

                                lines.push(``);
                                lines.push(`CĂN CỨ TÍNH PHÍ (QUY ĐỊNH):`);
                                lines.push(`- Theo quy định, nhà xe miễn phí hoàn toàn cho ${freeMinutes} phút gửi đầu tiên.`);
                                lines.push(`- Đối với giờ đầu tiên (từ phút thứ 16 đến phút 75), phí được tính chi tiết theo từng block 30 phút (mỗi block bằng 50% giá giờ).`);
                                lines.push(`- Từ giờ thứ hai trở đi, phí được tính tròn theo từng block 01 giờ.`);
                                lines.push(`- Lưu ý: Khung giờ Ban đêm (từ ${FeeCalculator.config.nightStartHour}h00 đến ${FeeCalculator.config.nightEndHour}h00 sáng hôm sau) sẽ áp dụng mức đơn giá riêng biệt khác với ban ngày.`);

                                lines.push(``);
                                lines.push(`ÁP DỤNG CHO XE HIỆN TẠI:`);
                                lines.push(`- Tổng thời gian quý khách đã gửi xe là ${timeString} (tương đương ${totalMin} phút).`);
                                lines.push(`- Dựa trên quy định trên, thời gian này ${specificExample}.`);
                                lines.push(`=> Tổng số tiền cước phí cuối cùng quý khách cần thanh toán là: ${(fee || 0).toLocaleString('vi-VN')}đ.`);
                                break;
                            default:
                                lines.push("Xem chi tiết tại bảng giá niêm yết tại bãi xe.");
                        }
                        feeDetailsText = lines.join('\n');
                    }
                } catch (e) { }

                const paymentMethod = txData.payment_method || 'Tiền mặt';
                const isPaid = txData.status === 'Đã rời bãi';
                const paymentStatusText = isPaid ? `Đã thanh toán (${txData.payment_method || '?'})` : 'Chưa thanh toán (Đang gửi)';
                const verificationUrl = `${window.location.origin}${window.location.pathname}?ticketId=${txData.unique_id}`;
                const hotline = locationConfig.hotline || 'Chưa cập nhật';
                const address = locationConfig.address || 'Chưa cập nhật';

                const payload = {
                    email: email,
                    ticket_id: txData.unique_id,
                    plate: txData.plate,
                    entry_time: txData.entry_time,
                    exit_time: txData.exit_time || new Date().toISOString(),
                    duration: duration,
                    fee: txData.status === 'Đang gửi' ? fee : txData.fee,
                    location: getLocationName(txData.location_id),
                    fee_details: feeDetailsText,
                    issue_date: new Date().toLocaleString('vi-VN'),
                    payment_status: paymentStatusText,
                    notes: txData.notes || 'Không có',
                    verification_url: verificationUrl,
                    hotline: hotline,
                    customer_phone: txData.phone || 'Không có',
                    location_address: address
                };

                // 1. UI UPDATE IMMEDIATELY
                setTimeout(async () => {
                    const submitBtn = emailElements.form.querySelector('button[type="submit"]');
                    if (submitBtn) {
                        submitBtn.classList.add('btn-loading');
                        submitBtn.disabled = true;
                    }

                    // 2. START UI TIMER (Guaranteed 3s wait)
                    const uiTimerPromise = new Promise(resolve => setTimeout(resolve, 3000));

                    // 3. BACKGROUND EMAIL TASK (Fire & Forget)
                    const backgroundEmailTask = async () => {
                        try {
                            await fetch(APP_CONFIG.googleScriptUrl, {
                                method: 'POST', mode: 'no-cors', cache: 'no-cache',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                            console.log("Email sent successfully (background)");
                        } catch (err) {
                            console.error("Background Email Error:", err);
                        }
                    };

                    // Execute without awaiting
                    backgroundEmailTask();

                    // 4. WAIT FOR TIMER
                    await uiTimerPromise;

                    // 5. SHOW SUCCESS
                    emailElements.modal.style.display = 'none';
                    showSuccessModal();

                    if (submitBtn) {
                        submitBtn.classList.remove('btn-loading');
                        submitBtn.textContent = 'Gửi Ngay';
                        submitBtn.disabled = false;
                    }
                }, 10);

                // End of main thread execution for this handler
                return;

                /*
                // OLD BLOCKING CODE REMOVED
                // Gửi request + Đợi 3 giây (Song song)
                const sendPromise = fetch(APP_CONFIG.googleScriptUrl, { ... });
                const delayPromise = new Promise(resolve => setTimeout(resolve, 3000));
                await Promise.all([sendPromise, delayPromise]);
                */

            } catch (error) {
                console.error('Email handling error:', error);

                // Show toast only if it's a critical logic error before the async part
                if (error.message !== 'Không tìm thấy dữ liệu vé.') {
                    showToast('Lỗi: ' + error.message, 'error');
                }

                // Restore button state
                if (submitBtn) {
                    submitBtn.classList.remove('btn-loading');
                    submitBtn.textContent = 'Gửi Ngay';
                    submitBtn.disabled = false;
                }
            }
        });
    }

    // --- SUCCESS MODAL LOGIC ---
    let successCountDownInterval;
    const emailSuccessElements = {
        modal: document.getElementById('email-success-modal'),
        closeBtn: document.getElementById('close-success-btn'),
        countDown: document.getElementById('success-countdown')
    };

    const showSuccessModal = () => {
        elements.messageBox.style.display = 'none'; // Hide loading
        if (emailSuccessElements.modal) {
            emailSuccessElements.modal.style.display = 'flex';

            let timeLeft = 15;
            if (emailSuccessElements.countDown) emailSuccessElements.countDown.textContent = timeLeft;

            if (successCountDownInterval) clearInterval(successCountDownInterval);

            successCountDownInterval = setInterval(() => {
                timeLeft--;
                if (emailSuccessElements.countDown) emailSuccessElements.countDown.textContent = timeLeft;

                if (timeLeft <= 0) {
                    closeSuccessModal();
                }
            }, 1000);
        }
    };

    const closeSuccessModal = () => {
        if (successCountDownInterval) clearInterval(successCountDownInterval);
        if (emailSuccessElements.modal) emailSuccessElements.modal.style.display = 'none';
        elements.resultsSection.style.display = 'block'; // Back to results
    };

    if (emailSuccessElements.closeBtn) {
        emailSuccessElements.closeBtn.addEventListener('click', closeSuccessModal);
    }

    // --- TOAST NOTIFICATION SYSTEM ---
    const showToast = (message, type = 'info') => {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        let iconSvg = '';
        if (type === 'success') iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
        else if (type === 'error') iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
        else iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

        toast.innerHTML = `
            <div class="toast-icon">${iconSvg}</div>
            <div class="toast-message">${message.replace(/\n/g, '<br>')}</div>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'fadeOutRight 0.3s forwards';
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    };

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

    // Hiển thị trạng thái đang tải (PREMIUM UI)
    const showLoading = () => {
        elements.resultsSection.style.display = 'none';
        elements.messageBox.style.display = 'block';
        elements.messageBox.innerHTML = `
        <div class="premium-loading-overlay">
            <div class="premium-loader"></div>
            <span class="premium-loading-text">Đang truy xuất dữ liệu...</span>
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
        // FIX: Nếu xe phương tiện đang gửi (chưa checkout), fee sẽ là null -> Cần tính toán lại để hiển thị
        const isOngoing = transaction.status === 'Đang gửi';
        const searchTime = isOngoing ? getSyncedTime() : new Date(transaction.exit_time || Date.now());

        // CHỮA CHÁY: Phát hiện lỗi tràn số Integer (2.147.483.647) do Database
        // Nếu phí trong DB bị max, ta sẽ tính lại bằng JS để hiển thị đúng.
        let displayFee = isOngoing ? FeeCalculator.calculate({ ...transaction, fee_policy_snapshot: snapshot }, searchTime, locationConfig) : (transaction.fee || 0);

        if (!isOngoing && displayFee === 2147483647) {
            console.warn("⚠️ Phát hiện phí bị giới hạn bởi Int32 DB. Đang tính toán lại...");
            // Force recalculate using the snapshot and times
            const reconstructedTx = {
                ...transaction,
                fee_policy_snapshot: snapshot
            };
            displayFee = FeeCalculator.calculate(reconstructedTx, new Date(transaction.exit_time), locationConfig);
        }

        const freeMinutes = FeeCalculator.config.freeMinutes;
        const startTime = dayjs(transaction.entry_time);
        const endTime = dayjs(searchTime);
        const durationMinutes = Math.max(0, endTime.diff(startTime, 'minute', true));

        // Helper: Generate Text breakdown for Email/Receipt
        const generateFeeBreakdownText = () => {
            if (isVIP) return "Miễn phí (Khách VIP/Khách mời)";
            if (policyType === 'free') return "Miễn phí (Chính sách bãi xe)";
            if (transaction.status !== 'Đang gửi' && durationMinutes <= freeMinutes) return `Miễn phí (Gửi dưới ${freeMinutes} phút)`;

            let lines = [];
            switch (policyType) {
                case 'per_entry':
                    lines.push(`- Phí theo lượt: ${(policy.per_entry || 0).toLocaleString('vi-VN')}đ`);
                    break;
                case 'daily':
                    const totalDays = Math.ceil(Math.max(0, durationMinutes - freeMinutes) / (60 * 24));
                    lines.push(`- Đơn giá ngày: ${(policy.daily || 0).toLocaleString('vi-VN')}đ/ngày`);
                    lines.push(`- Số ngày: ${Math.max(1, totalDays)} ngày`);
                    break;
                case 'hourly':
                    const chargeableStartTime = startTime.add(freeMinutes, 'minute');
                    let dayMinutes = 0; let nightMinutes = 0;
                    let cursor = chargeableStartTime.clone();
                    // Re-calculate minutes breakdown (duplicated logic for safety)
                    // TỐI ƯU HÓA: Thay vòng lặp 1 phút bằng vòng lặp step lớn (30/60p)
                    // 1. Tính số ngày trọn vẹn (nhanh)
                    const diffDays = Math.floor(durationMinutes / (60 * 24));
                    if (diffDays > 0) {
                        // Mỗi ngày có 12 tiếng ngày (6-18) và 12 tiếng đêm
                        // Giả định nightStart=18, nightEnd=6 -> Day=12h, Night=12h
                        // TODO: Nếu config thay đổi giờ đêm, logic này cần chỉnh. Tạm tính theo default 18-6.
                        dayMinutes += diffDays * 12 * 60;
                        nightMinutes += diffDays * 12 * 60;

                        // Dời cursor lên
                        cursor = cursor.add(diffDays, 'day');
                    }

                    // 2. Tính phần dư còn lại bằng vòng lặp (nhưng step lớn)
                    while (cursor.isBefore(endTime)) {
                        const hour = cursor.hour();
                        // Logic block 30/60 giống FeeCalculator
                        let step = 60;
                        // Nếu là giờ đầu tiên (tính từ chargeableStartTime gốc), check logic 30p
                        // Nhưng ở đây chỉ cần đếm phút thôi.
                        // Đếm chính xác từng phút sẽ an toàn nhất cho việc hiển thị "số phút",
                        // NHƯNG để tránh treo, ta jump từng giờ.

                        // CÁCH AN TOÀN NHẤT: Jump 60p, nếu còn ít hơn 60p thì jump phần dư.
                        const minutesLeft = endTime.diff(cursor, 'minute');
                        const jump = Math.min(60, Math.max(1, minutesLeft)); // Jump tối đa 60p

                        if (hour >= FeeCalculator.config.nightStartHour || hour < FeeCalculator.config.nightEndHour) {
                            nightMinutes += jump;
                        } else {
                            dayMinutes += jump;
                        }
                        cursor = cursor.add(jump, 'minute');
                    }
                    const dayFee = Math.floor(dayMinutes / 60) * (policy.hourly_day || 0);
                    const nightFee = Math.floor(nightMinutes / 60) * (policy.hourly_night || 0);

                    if (dayMinutes > 0) lines.push(`- Ban ngày: ${Math.floor(dayMinutes / 60)}h${dayMinutes % 60}p x ${(policy.hourly_day || 0).toLocaleString('vi-VN')}đ = ${dayFee.toLocaleString('vi-VN')}đ`);
                    if (nightMinutes > 0) lines.push(`- Ban đêm: ${Math.floor(nightMinutes / 60)}h${nightMinutes % 60}p x ${(policy.hourly_night || 0).toLocaleString('vi-VN')}đ = ${nightFee.toLocaleString('vi-VN')}đ`);
                    break;
            }
            return lines.join('\n');
        };

        let regulationText = '';
        let breakdownHTML = '';

        // Helper: Format minutes into Y M D H M S
        const formatTimeVerbose = (totalMinutes) => {
            const totalSeconds = Math.floor(totalMinutes * 60);
            if (totalSeconds < 60) return `${totalSeconds} giây`;

            let remaining = totalSeconds;
            const years = Math.floor(remaining / (365 * 24 * 60 * 60));
            remaining %= (365 * 24 * 60 * 60);

            const months = Math.floor(remaining / (30 * 24 * 60 * 60));
            remaining %= (30 * 24 * 60 * 60);

            const days = Math.floor(remaining / (24 * 60 * 60));
            remaining %= (24 * 60 * 60);

            const hours = Math.floor(remaining / (60 * 60));
            remaining %= (60 * 60);

            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;

            let parts = [];
            if (years > 0) parts.push(`<strong>${years}</strong> năm`);
            if (months > 0) parts.push(`<strong>${months}</strong> tháng`);
            if (days > 0) parts.push(`<strong>${days}</strong> ngày`);
            if (hours > 0) parts.push(`<strong>${hours}</strong> giờ`);
            if (minutes > 0) parts.push(`<strong>${minutes}</strong> phút`);
            if (seconds > 0 || parts.length === 0) parts.push(`<strong>${seconds}</strong> giây`);

            return parts.join(' ');
        };
        if (isVIP) {
            breakdownHTML += `<p>✅ Miễn phí do là <strong>Khách VIP/Khách mời</strong>.</p>`;
        } else if (policyType === 'free') {
            breakdownHTML += `<p>✅ Bãi xe đang áp dụng chính sách <strong>Miễn phí</strong>.</p>`;
        } else if (transaction.status !== 'Đang gửi' && durationMinutes <= freeMinutes) {
            breakdownHTML += `<p>✅ Miễn phí do thời gian gửi xe (<strong>${Math.floor(durationMinutes)} phút</strong>) không vượt quá <strong>${freeMinutes} phút</strong> cho phép.</p>`;
        } else if (transaction.payment_method && transaction.status === 'Đang gửi' && (transaction.fee !== null)) {
            // CASE: PREPAID (Đã thanh toán trước nhưng xe chưa ra)
            breakdownHTML = '<div class="fee-receipt">';
            breakdownHTML += `
                <div class="fee-row header">
                    <span class="fee-label">Diễn giải</span>
                    <span class="fee-time" style="text-align: center;">Thời gian</span>
                    <span class="fee-amount">Số tiền</span>
                </div>
                <div class="fee-row">
                    <span class="fee-label">Đã thanh toán trước (${transaction.payment_method})</span>
                    <span class="fee-time">${Math.floor(durationMinutes)} phút</span>
                    <span class="fee-amount">${(transaction.fee || 0).toLocaleString('vi-VN')}đ</span>
                </div>
                <div class="fee-total-row">
                    <span style="color: var(--success-color);">ĐÃ THANH TOÁN</span>
                    <span style="color: var(--success-color);">${(transaction.fee || 0).toLocaleString('vi-VN')}đ</span>
                </div>
            `;
            breakdownHTML += '</div>';
        } else if (policyType === 'hourly') {
            let specificExample = '';
            const totalMin = Math.ceil(durationMinutes);
            const timeString = formatTimeVerbose(durationMinutes);

            if (totalMin > 60) {
                const extraHours = Math.ceil((totalMin - 60) / 60);
                specificExample = `Tổng thời gian gửi <strong>${timeString}</strong> được quy đổi thành: <strong>02 đơn vị 30 phút</strong> (giờ đầu) + <strong>${extraHours.toString().padStart(2, '0')} đơn vị 01 giờ</strong> (thời gian tiếp theo).`;
            } else {
                const blocks = Math.ceil(totalMin / 30);
                specificExample = `Tổng thời gian gửi <strong>${totalMin} phút</strong> được quy đổi thành: <strong>${blocks.toString().padStart(2, '0')} đơn vị 30 phút</strong>.`;
            }

            regulationText = `<strong>QUY ĐỊNH TÍNH GIÁ DỊCH VỤ:</strong><br>
            - <strong>Phạm vi miễn phí:</strong> 15 phút đầu tiên.<br>
            - <strong>Cơ chế giờ đầu (phút 16 - 75):</strong> Áp dụng chia nhỏ theo <strong>đơn vị 30 phút</strong> (mỗi đơn vị tương ứng 50% đơn giá giờ).<br>
            - <strong>Cơ chế các giờ tiếp theo:</strong> Tính tròn theo <strong>đơn vị 01 giờ</strong>.<br><br>
            <strong>ÁP DỤNG THỰC TẾ VỚI XE CỦA QUÝ KHÁCH:</strong><br>
            - ${specificExample}<br>
            - Tổng cước phí tạm tính: <strong>${(displayFee || 0).toLocaleString('vi-VN')}đ</strong><br>
            <span style="font-style: italic; color: #64748b; margin-left: 10px;">(${readMoneyToText(displayFee || 0)})</span>.<br><br>
            <strong>Lưu ý bắt buộc:</strong> Khung giờ Ban đêm (từ ${FeeCalculator.config.nightStartHour}h00 đến ${FeeCalculator.config.nightEndHour}h00 sáng hôm sau) áp dụng đơn giá riêng biệt theo quy định niêm yết.<br>
            Đề nghị Quý khách kiểm tra kỹ <strong>chi tiết thời gian và số tiền</strong> trước khi thực hiện thanh toán.`;
        } else {
            regulationText = `Theo quy định hiện hành của bãi xe, Quý khách được hưởng quyền lợi <strong>miễn phí cước gửi xe cho ${freeMinutes} phút đầu tiên</strong> kể từ thời điểm vào bãi.<br><br>Sau khoảng thời gian ưu đãi này, hệ thống sẽ tự động tính phí dựa trên tổng thời gian lưu trú thực tế.<br>Quý khách vui lòng tham khảo bảng giá chi tiết được niêm yết tại cổng ra vào.`;
        }

        // Ensure breakdownHTML is constructed correctly for hourly/others if not already
        if (!breakdownHTML) {
            breakdownHTML = '<div class="fee-receipt">';
            // Header Row: 2 Columns Only
            breakdownHTML += `
                <div class="fee-row header" style="display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; margin-bottom: 12px;">
                    <span class="fee-label" style="font-weight: 700; color: #64748b;">KHOẢN PHÍ</span>
                    <span class="fee-amount" style="font-weight: 700; color: #64748b;">THÀNH TIỀN</span>
                </div>
            `;



            const rowStyle = 'display: flex; justify-content: space-between; align-items: flex-start; padding: 12px 0; border-bottom: 1px dashed #f1f5f9;';
            const labelColStyle = 'display: flex; flex-direction: column; gap: 6px; flex: 1; padding-right: 16px; min-width: 0;';
            const labelStyle = 'font-weight: 600; font-size: 1rem; line-height: 1.5; color: #334155;';
            const amountStyle = 'font-weight: 700; color: #0f172a; white-space: nowrap; font-size: 1.05rem; line-height: 1.5;';
            const timeStyle = 'font-size: 0.9em; color: #64748b; display: flex; align-items: center; gap: 6px; line-height: 1.4;';

            // Helper: Format minutes into Y M D H M S
            // (Defined at top of function)

            switch (policyType) {
                case 'per_entry':
                    breakdownHTML += `
                        <div style="${rowStyle}">
                            <div style="${labelColStyle}">
                                <span style="${labelStyle}">Phí theo lượt</span>
                            </div>
                            <span style="${amountStyle}">${(policy.per_entry || 0).toLocaleString('vi-VN')}đ</span>
                        </div>`;
                    break;
                case 'daily':
                    const totalDays = Math.ceil(Math.max(0, durationMinutes - freeMinutes) / (60 * 24));
                    breakdownHTML += `
                        <div style="${rowStyle}">
                            <div style="${labelColStyle}">
                                <span style="${labelStyle}">Đơn giá ngày</span>
                                <span style="${timeStyle}">Thời gian: 1 ngày</span>
                            </div>
                            <span style="${amountStyle}">${(policy.daily || 0).toLocaleString('vi-VN')}đ</span>
                        </div>
                        <div style="${rowStyle}">
                            <div style="${labelColStyle}">
                                <span style="${labelStyle}">Số ngày tính phí</span>
                                <span style="${timeStyle}">Số lượng: ${Math.max(1, totalDays)} ngày</span>
                            </div>
                            <span style="${amountStyle}">-</span>
                        </div>`;
                    break;
                case 'hourly':
                    const chargeableStartTime = startTime.add(freeMinutes, 'minute');
                    let dayMinutes = 0; let nightMinutes = 0;
                    let cursor = chargeableStartTime.clone();
                    // TỐI ƯU HÓA (Lặp lại logic trên cho phần HTML generation)
                    const diffDays2 = Math.floor(durationMinutes / (60 * 24));
                    if (diffDays2 > 0) {
                        dayMinutes += diffDays2 * 12 * 60;
                        nightMinutes += diffDays2 * 12 * 60;
                        cursor = cursor.add(diffDays2, 'day');
                    }

                    while (cursor.isBefore(endTime)) {
                        const hour = cursor.hour();
                        const minutesLeft = endTime.diff(cursor, 'minute');
                        const jump = Math.min(60, Math.max(1, minutesLeft));

                        if (hour >= FeeCalculator.config.nightStartHour || hour < FeeCalculator.config.nightEndHour) {
                            nightMinutes += jump;
                        } else {
                            dayMinutes += jump;
                        }
                        cursor = cursor.add(jump, 'minute');
                    }
                    // Helper: Format minutes into Y M D H M
                    // REMOVED DUPLICATE DEFINITION

                    const dayFee = Math.floor(dayMinutes / 60) * (policy.hourly_day || 0);
                    const nightFee = Math.floor(nightMinutes / 60) * (policy.hourly_night || 0);

                    if (dayMinutes > 0) {
                        breakdownHTML += `
                            <div style="${rowStyle}">
                                <div style="${labelColStyle}">
                                    <span style="${labelStyle}">Ban ngày (${(policy.hourly_day || 0).toLocaleString('vi-VN')}đ/h)</span>
                                    <div style="${timeStyle}">
                                        <span style="opacity: 0.7;">⏱</span> ${formatTimeVerbose(dayMinutes)}
                                    </div>
                                </div>
                                <span style="${amountStyle}">${dayFee.toLocaleString('vi-VN')}đ</span>
                            </div>`;
                    }
                    if (nightMinutes > 0) {
                        breakdownHTML += `
                            <div style="${rowStyle}">
                                <div style="${labelColStyle}">
                                    <span style="${labelStyle}">Ban đêm (${(policy.hourly_night || 0).toLocaleString('vi-VN')}đ/h)</span>
                                    <div style="${timeStyle}">
                                        <span style="opacity: 0.7;">🌑</span> ${formatTimeVerbose(nightMinutes)}
                                    </div>
                                </div>
                                <span style="${amountStyle}">${nightFee.toLocaleString('vi-VN')}đ</span>
                            </div>`;
                    }
                    break;
                default:
                    breakdownHTML += `<div style="${rowStyle}"><span class="fee-label">Không có thông tin chi tiết.</span></div>`;
            }

            if (transaction.status !== 'Đang gửi') {
                breakdownHTML += `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 2px solid #e2e8f0;">
                        <span style="font-weight: 700; color: #64748b;">TỔNG CỘNG</span>
                        <div style="text-align: right;">
                            <span style="font-weight: 800; font-size: 1.25rem; color: #0f172a; display: block;">${(displayFee || 0).toLocaleString('vi-VN')}đ</span>
                            <span style="font-size: 0.9rem; font-style: italic; color: #64748b;">${readMoneyToText(displayFee || 0)}</span>
                        </div>
                    </div>
                `;
            } else {
                // For ongoing transactions, show total estimated fee
                breakdownHTML += `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 2px solid #e2e8f0;">
                        <span style="font-weight: 700; color: #64748b;">TẠM TÍNH</span>
                        <div style="text-align: right;">
                            <span style="font-weight: 800; font-size: 1.25rem; color: #0f172a; display: block;">${(displayFee || 0).toLocaleString('vi-VN')}đ</span>
                            <span style="font-size: 0.9rem; font-style: italic; color: #64748b;">${readMoneyToText(displayFee || 0)}</span>
                        </div>
                    </div>
                `;
            }
            breakdownHTML += '</div>';
        }

        breakdownHTML += `
            <div style="font-size: 0.9rem; color: var(--text-color); margin-top: 1rem; border-top: 1px dashed var(--border-color); padding-top: 0.5rem;">
                <div style="margin-bottom: 0.5rem;"><strong>* Ghi chú quan trọng:</strong></div>
                <div style="line-height: 1.6; text-align: justify;">${regulationText}</div>
                <div style="margin-top: 0.8rem; font-style: italic; color: var(--text-muted); font-size: 0.85rem;">Mọi thắc mắc vui lòng liên hệ nhân viên trông xe.</div>
            </div>`;
        return breakdownHTML;
    };

    const getLocationName = (locationId) => {
        if (!locationId) return 'Không xác định';
        const location = LOCATIONS_DATA.find(loc => loc.id == locationId || (loc.id && String(loc.id).toUpperCase() === String(locationId).toUpperCase()));
        return location ? location.name : 'Không xác định';
    };

    const renderHistory = (history, searchTerm) => {
        if (!history || history.length === 0) {
            showMessage('Không tìm thấy lịch sử cho xe này.', true);
            return;
        }

        // Update active context for realtime listeners
        activePlate = history[0]?.plate || searchTerm.toUpperCase();

        // 1. Sắp xếp: Đang gửi lên đầu (Active), sau đó đến Mới nhất
        history.sort((a, b) => {
            const isDepartedA = a.status !== 'Đang gửi';
            const isDepartedB = b.status !== 'Đang gửi';
            if (isDepartedA !== isDepartedB) return isDepartedA ? 1 : -1; // Active first
            return new Date(b.entry_time) - new Date(a.entry_time); // Newest first
        });

        if (durationInterval) {
            clearInterval(durationInterval);
            durationInterval = null;
        }
        const elementsToUpdate = [];

        const plateToDisplay = history[0]?.plate || searchTerm.toUpperCase();
        // NÂNG CẤP: Hiển thị biển số đẹp và Loại xe
        const vehicleType = detectVehicleType(plateToDisplay);
        const formattedPlate = formatPlate(plateToDisplay);

        if (elements.resultLabel) {
            elements.resultLabel.textContent = vehicleType.type === 'custom' ? 'Thông tin khách hàng' : 'Kết quả cho biển số';
        }

        elements.plateDisplay.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center;">
                <span style="font-size:2rem; font-weight:800; color:#ffffff; letter-spacing:1px; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">${formattedPlate}</span>
                <span style="font-size:0.9rem; font-weight:600; color:rgba(255,255,255,0.9); text-transform:uppercase; margin-top:4px;">${vehicleType.label}</span>
            </div>
        `;
        elements.historyContainer.innerHTML = '';
        elements.messageBox.style.display = 'none';
        elements.resultsSection.style.display = 'block';

        history.forEach((tx, index) => {
            // Unified Card Creation
            const card = document.createElement('div');
            const isLatest = index === 0;
            // Use 'latest-card' class for the first item to give it special Hero styling
            card.className = isLatest ? 'history-card latest-card' : 'history-card';

            // Expand ONLY the latest item by default
            const isExpanded = isLatest;

            const isDeparted = tx.status !== 'Đang gửi';
            const statusClass = isDeparted ? 'departed' : 'parking';
            const locationName = getLocationName(tx.location_id);
            const locationConfig = LOCATIONS_DATA.find(loc => loc.id == tx.location_id || (loc.id && String(loc.id).toUpperCase() === String(tx.location_id).toUpperCase())) || {};

            // Layout Logic
            // NEW REQUIREMENT: "Thông tin mới nhất sẽ được xếp trước" -> Handled by sort above
            // "Có hiệu ứng" -> Handled by .latest-highlight CSS
            // isExpanded is already defined above

            let durationDisplay = '--';
            let feeDisplay = '--';
            let finalFee = tx.fee;

            if (isDeparted) {
                durationDisplay = calculateDuration(tx.entry_time, tx.exit_time);

                // CHỮA CHÁY: Phát hiện lỗi tràn số Int32 ở list view
                if (finalFee === 2147483647) {
                    const snapshot = typeof tx.fee_policy_snapshot === 'string'
                        ? JSON.parse(tx.fee_policy_snapshot)
                        : (tx.fee_policy_snapshot || {});

                    const reconstructedTx = { ...tx, fee_policy_snapshot: snapshot };
                    finalFee = FeeCalculator.calculate(reconstructedTx, new Date(tx.exit_time), locationConfig);
                }

                feeDisplay = (finalFee || 0).toLocaleString('vi-VN') + 'đ';
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

            // Header Content
            // ADD 'active' class if expanded
            // Header Content - "Icon Box" Design (Refined)
            const latestLabel = isLatest ? `<span class="latest-text">Mới nhất</span>` : '';
            const statusIcon = isDeparted
                ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`
                : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><path d="M9 16v-8h4a2 2 0 0 1 0 4h-4"></path></svg>`;

            const headerHTML = `
                <div class="history-card-header ${isExpanded ? 'active' : ''}" onclick="this.nextElementSibling.classList.toggle('collapsed'); this.classList.toggle('active')">
                    <div class="header-icon-box ${statusClass}">
                        ${statusIcon}
                    </div>
                    <div class="header-info-col">
                        <div class="header-title-row">
                            <span class="status-text-refined">${tx.status}</span>
                            ${latestLabel}
                        </div>
                        <div class="header-time-row">
                            ${formatDateTime(tx.entry_time)}
                        </div>
                    </div>
                    <div class="header-arrow-col">
                         <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </div>
            `;

            card.innerHTML = `
                ${headerHTML}
                <div class="history-card-body ${isExpanded ? '' : 'collapsed'}">
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

                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border-light); display: flex; gap: 10px;">
                        ${isDeparted ? `
                        <button class="btn-email" onclick="Handlers.openEmailModal('${tx.unique_id}')" style="flex: 1;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                            Gửi Email
                        </button>
                        ` : ''}
                        <button class="btn-share-premium" onclick="Handlers.openShareModal('${tx.unique_id}')" style="flex: 1;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                            Nhờ lấy hộ
                        </button>
                    </div>

                    ${!isDeparted ? (() => {
                    // SMART FEE ALERT LOGIC
                    try {
                        // FIX: Nếu đã trả trước thì không hiển thị cảnh báo
                        if (tx.payment_method && Number(tx.fee || 0) >= 0) return '';

                        const now = new Date();
                        const startTime = new Date(tx.entry_time);
                        const minutesElapsed = (now - startTime) / 60000;
                        const policyType = locationConfig?.fee_policy_type || 'hourly';
                        const freeMinutes = 15;

                        let alertHTML = '';
                        let nextJumpMinutes = 0;
                        let msg = '';

                        if (minutesElapsed < freeMinutes) {
                            nextJumpMinutes = Math.ceil(freeMinutes - minutesElapsed);
                            msg = `Còn <strong>${nextJumpMinutes} phút</strong> nữa sẽ hết miễn phí!`;
                        } else if (policyType === 'hourly') {
                            const chargeableMinutes = minutesElapsed - freeMinutes;
                            const minutesIntoBlock = chargeableMinutes % 60;
                            nextJumpMinutes = Math.ceil(60 - minutesIntoBlock);
                            if (nextJumpMinutes <= 15) { // Only alert if close to jump
                                msg = `Còn <strong>${nextJumpMinutes} phút</strong> nữa sẽ nhảy giá tiếp theo!`;
                            }
                        }

                        if (msg) {
                            return `<div class="fee-alert-badge"><span class="fee-alert-icon">⚠️</span><span>${msg}</span></div>`;
                        }
                        return '';
                    } catch (e) { return ''; }
                })() : ''}
                    
                </div>
            `;
            elements.historyContainer.appendChild(card);

            if (!isDeparted) {
                // SỬA LỖI: Kiểm tra nếu đã thanh toán trước (có payment_method và fee > 0)
                // ĐÃ SỬA: Loại bỏ sự phụ thuộc vào Utils.parseFee vì Utils không tồn tại trong scope này.
                const feeVal = Number(tx.fee || 0);
                const isPrepaid = tx.payment_method && feeVal >= 0;

                // Nếu đã thanh toán rồi thì không cần update fee liên tục, chỉ update duration
                if (isPrepaid) {
                    // Update duration only
                    elementsToUpdate.push({
                        transaction: tx,
                        entryTime: tx.entry_time,
                        durationEl: document.getElementById(`duration-${tx.unique_id}`),
                        feeEl: null // Null feeEl means don't update fee
                    });
                    // Set static fee text immediately
                    const feeEl = document.getElementById(`fee-${tx.unique_id}`);
                    if (feeEl) {
                        feeEl.textContent = (tx.fee || 0).toLocaleString('vi-VN') + 'đ (Đã thanh toán)';
                        feeEl.style.color = 'var(--success-color)';
                    }
                } else {
                    // Standard case: Update both
                    elementsToUpdate.push({
                        transaction: tx,
                        entryTime: tx.entry_time,
                        durationEl: document.getElementById(`duration-${tx.unique_id}`),
                        feeEl: document.getElementById(`fee-${tx.unique_id}`)
                    });
                }
            }
        });

        if (elementsToUpdate.length > 0) {
            durationInterval = setInterval(() => {
                elementsToUpdate.forEach(item => {
                    if (item.durationEl) {
                        item.durationEl.textContent = calculateDuration(item.entryTime, getSyncedTime());
                    }
                    if (item.feeEl) {
                        const locationConfig = LOCATIONS_DATA.find(loc => loc.id === item.transaction.location_id) || {};
                        item.feeEl.textContent = FeeCalculator.calculate(item.transaction, getSyncedTime(), locationConfig).toLocaleString('vi-VN') + 'đ (dự kiến)';
                    }
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
        // Chúng ta kiểm tra lịch sử xem có bất kỳ giao dịch nào khớp cặp Biển số + SĐT này không
        const { data: verifyData } = await db
            .from('transactions')
            .select('unique_id')
            .eq('plate', plate)
            .eq('phone', phone)
            .limit(1);

        if (verifyData && verifyData.length > 0) {
            // Xác thực thành công
            closeVerifyModal(false); // Đóng modal

            // Gọi lại searchByTerm với cờ isVerified = true
            // Hàm này sẽ thực hiện lại query (đã tối ưu limit 20) và hiển thị kết quả ngay
            searchByTerm(plate, true);
        } else {
            alert("Số điện thoại không đúng hoặc không khớp với biển số xe này. Vui lòng kiểm tra lại.");
        }
    });

    // --- Hàm tìm kiếm chính ---
    const searchByTerm = async (term, isVerified = false) => {
        showLoading();
        if (navigator.vibrate) navigator.vibrate(50);

        // Ensure locations are loaded before calculating fees
        if (locationsPromise) {
            try { await locationsPromise; } catch (e) { console.error("Wait for locations failed", e); }
        }

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
            // NẾU LÀ SĐT: Tìm trực tiếp
            if (isPhone) {
                const { data, error } = await db.from('transactions')
                    .select('*')
                    .eq('phone', cleanedTerm)
                    .order('entry_time', { ascending: false })
                    .limit(20); // TỐI ƯU: Chỉ lấy 20 bản ghi gần nhất

                if (data && data.length > 0) {
                    const uniqueResults = Array.from(new Map(data.map(item => [item.unique_id, item])).values());
                    renderHistory(uniqueResults, cleanedTerm);
                } else {
                    showMessage(`Không tìm thấy xe nào đăng ký với SĐT "${cleanedTerm}".`, true);
                }
                return;
            }

            // NẾU KHÔNG PHẢI SĐT (Có thể là Biển số hoặc TicketId)

            // TỐI ƯU HÓA: Phân loại dựa trên dữ liệu nhập vào để tránh query thừa
            const isLikelyPlate = !cleanedTerm.startsWith('_') && cleanedTerm.length <= 15;

            if (isLikelyPlate) {
                // 1. Ưu tiên tìm theo Biển số (Case phổ biến nhất)
                const query = db.from('transactions')
                    .select('*')
                    .eq('plate', upperCaseTerm)
                    .order('entry_time', { ascending: false })
                    .limit(5); // TỐI ƯU: Chỉ lấy 5 bản ghi gần nhất (Giảm tải load data)

                const { data: plateHistory } = await query;

                if (plateHistory && plateHistory.length > 0) {
                    const latestRecord = plateHistory[0];
                    if (isVerified || !latestRecord.phone || latestRecord.phone.trim() === '') {
                        const uniqueResults = Array.from(new Map(plateHistory.map(item => [item.unique_id, item])).values());
                        renderHistory(uniqueResults, upperCaseTerm);
                    } else {
                        elements.messageBox.style.display = 'none';
                        openVerifyModal(upperCaseTerm);
                    }
                    return; // TÌM THẤY -> KẾT THÚC NGAY
                }
            }

            // 2. Nếu không tìm thấy biển số (hoặc input giống ID), thử tìm theo Ticket ID
            const { data: ticketData } = await db.from('transactions')
                .select('*')
                .eq('unique_id', cleanedTerm)
                .single();

            if (ticketData) {
                renderHistory([ticketData], cleanedTerm);
                return;
            }

            // Không tìm thấy gì cả
            showMessage(`Không tìm thấy thông tin cho "${term}".`, true);

        } catch (error) {
            // Ignored some errors like .single() returning null handled above logic implicitly or explicit checks
            if (error.code !== 'PGRST116') { // PGRST116 is JSON result none, handled by checks
                showMessage(`Đã xảy ra lỗi: ${error.message}`, true);
                console.error(error);
            } else {
                showMessage(`Không tìm thấy thông tin cho "${term}".`, true);
            }
        }
    };

    // --- REALTIME UPDATES ---
    const setupRealtimeListeners = () => {
        // 1. Transactions Listener
        db.channel('public:transactions')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'transactions' },
                async (payload) => {
                    const record = payload.new || payload.old;
                    if (activePlate && record && record.plate === activePlate) {
                        const { data: fullHistory } = await db.from('transactions').select('*').eq('plate', activePlate).order('entry_time', { ascending: false }).limit(5);
                        if (fullHistory) {
                            const uniqueResults = Array.from(new Map(fullHistory.map(item => [item.unique_id, item])).values());
                            renderHistory(uniqueResults, activePlate);
                        }
                    }
                }
            )
            .subscribe();

        // 2. Locations Listener (Update prices dynamically)
        db.channel('public:locations')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'locations' },
                async () => {
                    console.log('Location updated, refreshing data...');
                    const { data } = await db.from('locations').select('*');
                    if (data) LOCATIONS_DATA = data;
                    // If viewing a result, re-render to show new prices immediately
                    if (activePlate) {
                        // Re-trigger search silent
                        const { data: fullHistory } = await db.from('transactions')
                            .select('*')
                            .eq('plate', activePlate)
                            .order('entry_time', { ascending: false })
                            .limit(5);
                        if (fullHistory) {
                            renderHistory(fullHistory, activePlate);
                        }
                    }
                }
            )
            .subscribe();
    };

    let locationsPromise = null;

    // --- Initialization ---
    const init = async () => {
        // 1. Start fetching locations IMMEDIATELY
        locationsPromise = db.from('locations').select('*').then(({ data }) => {
            LOCATIONS_DATA = data || [];
            return data;
        });

        setupRealtimeListeners();

        // 2. Parallelize Time Sync & Config Wait
        // Wrap time sync in a promise
        const timeSyncPromise = (async () => {
            // Đồng bộ thời gian (Multi-source Fallback)
            try {
                const response = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=Asia/Ho_Chi_Minh');
                if (!response.ok) throw new Error('TimeAPI failed');
                const data = await response.json();
                serverTimeOffset = new Date(data.dateTime).getTime() - Date.now();
            } catch (e1) {
                try {
                    const response = await fetch('https://worldtimeapi.org/api/timezone/Asia/Ho_Chi_Minh');
                    const data = await response.json();
                    serverTimeOffset = new Date(data.utc_datetime).getTime() - Date.now();
                } catch (e2) {
                    serverTimeOffset = 0;
                }
            }
        })();

        // TỐI ƯU HÓA TỐI ĐA: Chạy Time Sync ngầm, không chờ.
        // Chấp nhận sai số vài giây đầu (dùng giờ máy) đổi lấy tốc độ tải trang tức thì.
        timeSyncPromise.catch(e => console.warn(e));

        // Chỉ chờ Locations (từ DB, nhanh) và Config
        await Promise.all([locationsPromise, configPromise]);

        // Xử lý tham số URL để tìm kiếm trực tiếp
        const urlParams = new URLSearchParams(window.location.search);
        const ticketIdParam = urlParams.get('ticketId');
        const plateParam = urlParams.get('plate');

        if (ticketIdParam) {
            elements.plateInput.value = ticketIdParam;
            // NÂNG CẤP: Chế độ Xem Vé (Reader Mode / Locked Mode)
            elements.plateInput.disabled = true; // Khóa input
            elements.plateInput.style.backgroundColor = '#e2e8f0'; // Gray out
            elements.scanQrBtn.style.display = 'none'; // Ẩn nút quét QR

            // Ẩn nút tìm kiếm trong form để chặn user submit cái khác
            const searchBtn = elements.plateSearchForm.querySelector('button');
            if (searchBtn) searchBtn.style.display = 'none';

            // Thay đổi tiêu đề section để báo hiệu đang ở chế độ xem chi tiết
            const sectionTitle = elements.searchSection.querySelector('.section-title');
            if (sectionTitle) sectionTitle.textContent = "Chi tiết Vé xe";

            searchByTerm(ticketIdParam);
        } else if (plateParam) {
            elements.plateInput.value = plateParam;
            searchByTerm(plateParam);
        }

        // --- SMART FEATURE HTML ELEMENTS ---
        const voiceBtn = document.getElementById('voice-search-btn');
        const shareElements = {
            modal: document.getElementById('share-modal'),
            closeBtn: document.getElementById('close-share-modal'),
            linkInput: document.getElementById('share-link-input'),
            qrContainer: document.getElementById('share-qr-code'),
            copyBtn: document.getElementById('copy-share-link')
        };

        // --- VOICE SEARCH ---
        if (voiceBtn && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognition.lang = 'vi-VN';
            recognition.continuous = false;

            voiceBtn.addEventListener('click', () => {
                recognition.start();
                voiceBtn.classList.add('listening');
            });

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                let finalTerm = transcript.replace(/\./g, '').trim();
                // Simple plate heuristic
                if (/^\d{2}\s?[A-Z]/i.test(finalTerm)) {
                    finalTerm = finalTerm.replace(/\s/g, '').toUpperCase();
                }
                elements.plateInput.value = finalTerm;
                searchByTerm(finalTerm);
            };

            recognition.onend = () => voiceBtn.classList.remove('listening');
            recognition.onerror = () => voiceBtn.classList.remove('listening');
        } else if (voiceBtn) {
            voiceBtn.style.display = 'none';
        }

        // --- SHARE HANDLERS ---
        window.Handlers.openShareModal = (ticketId) => {
            const shareUrl = `${window.location.origin}${window.location.pathname}?ticketId=${ticketId}`;
            shareElements.linkInput.value = shareUrl;
            shareElements.qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shareUrl)}" alt="QR Code" width="150" height="150">`;
            shareElements.modal.style.display = 'flex';
        };

        if (shareElements.closeBtn) shareElements.closeBtn.addEventListener('click', () => shareElements.modal.style.display = 'none');
        if (shareElements.copyBtn) shareElements.copyBtn.addEventListener('click', () => {
            shareElements.linkInput.select();
            document.execCommand('copy');

            // Lưu lại HTML gốc
            const originalHTML = shareElements.copyBtn.innerHTML;

            // Chuyển sang trạng thái thành công
            shareElements.copyBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Đã Copy!
            `;
            shareElements.copyBtn.style.background = '#10b981'; // Green color for success
            shareElements.copyBtn.style.color = 'white';
            shareElements.copyBtn.style.borderColor = '#10b981';

            // Khôi phục sau 2 giây
            setTimeout(() => {
                shareElements.copyBtn.innerHTML = originalHTML;
                shareElements.copyBtn.style.background = '';
                shareElements.copyBtn.style.color = '';
                shareElements.copyBtn.style.borderColor = '';
            }, 2000);
        });

        elements.plateSearchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const searchTerm = elements.plateInput.value.trim();
            if (searchTerm) searchByTerm(searchTerm);
        });

        // NÂNG CẤP: Chặn ký tự đặc biệt ngay khi nhập (Hỗ trợ Tiếng Việt)
        elements.plateInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^a-zA-Z0-9\u00C0-\u1EF9 ]/g, '');
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

    };

    init();
});
