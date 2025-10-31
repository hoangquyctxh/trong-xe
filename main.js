document.addEventListener('DOMContentLoaded', () => {
    // =================================================================
    // KHU VỰC 1: KHAI BÁO BIẾN VÀ THAM CHIẾU DOM
    // =================================================================
    const allElements = {
        datePicker: document.getElementById('date-picker'),
        searchTermInput: document.getElementById('search-term'),
        phoneNumberInput: document.getElementById('phone-number'),
        phoneItemMain: document.getElementById('phone-item-main'),
        vipCheckboxContainer: document.getElementById('vip-checkbox-container'),
        isVipCheckbox: document.getElementById('is-vip-checkbox'),
        checkInBtn: document.getElementById('check-in-btn'),
        checkOutBtn: document.getElementById('check-out-btn'),
        toastContainer: document.getElementById('toast-container'),
        vehicleInfoPanel: document.getElementById('vehicle-info-panel'),
        infoStatus: document.getElementById('info-status'),
        infoEntryTime: document.getElementById('info-entry-time'),
        infoDuration: document.getElementById('info-duration'),
        infoPhoneNumber: document.getElementById('info-phone-number'),
        infoFee: document.getElementById('info-fee'),
        feeItem: document.getElementById('fee-item'),
        durationItem: document.getElementById('duration-item'),
        infoHistoryList: document.getElementById('info-history-list'),
        listTitle: document.getElementById('list-title'),
        vehicleListContainer: document.getElementById('vehicle-list-container'),
        filterInput: document.getElementById('filter-input'),
        dashboardCurrent: document.getElementById('dashboard-current'),
        dashboardTotal: document.getElementById('dashboard-total'),
        dashboardPeak: document.getElementById('dashboard-peak'),
        dashboardLongest: document.getElementById('dashboard-longest'),
        micBtn: document.getElementById('mic-btn'),
        scanQrBtn: document.getElementById('scan-qr-btn'),
        qrcodeModal: document.getElementById('qrcode-modal'),
        qrcodeCanvas: document.getElementById('qrcode-canvas'),
        closeQrcodeBtn: document.getElementById('close-qrcode-btn'),
        qrScannerModal: document.getElementById('qr-scanner-modal'),
        cameraFeed: document.getElementById('camera-feed'),
        closeScannerBtn: document.getElementById('close-scanner-btn'),
        ticketPlateDisplay: document.getElementById('ticket-plate-display'),
        ticketTimeDisplay: document.getElementById('ticket-time-display'),
        ticketLookupLink: document.getElementById('ticket-lookup-link-anchor'),
        reprintReceiptBtn: document.getElementById('reprint-receipt-btn'),
        offlineIndicator: document.getElementById('offline-indicator'),
        locationSubtitle: document.getElementById('location-subtitle'),
        ticketLocationDisplay: document.getElementById('ticket-location-display'),
        paymentModal: document.getElementById('payment-modal'),
        paymentAmountDisplay: document.getElementById('payment-amount-display'),
        paymentQrcodeImage: document.getElementById('payment-qrcode-image'),
        paymentMemoDisplay: document.getElementById('payment-memo-display'),
        closePaymentModalBtn: document.getElementById('close-payment-modal-btn'),
        completePaymentBtn: document.getElementById('complete-payment-btn'),
        paymentPlateDisplay: document.getElementById('payment-plate-display'),
        paymentEntryTime: document.getElementById('payment-entry-time'),
        paymentExitTime: document.getElementById('payment-exit-time'),
        paymentDuration: document.getElementById('payment-duration'),
        printReceiptBtn: document.getElementById('print-receipt-btn'),
        qrSpinner: document.getElementById('qr-spinner'),
        capacityGaugeFill: document.getElementById('capacity-gauge-fill'),
        capacityGaugeText: document.getElementById('capacity-gauge-text'),
        capacityStatusMessage: document.getElementById('capacity-status-message'),
        locationSelectModal: document.getElementById('location-select-modal'),
        locationListContainer: document.getElementById('location-list-container'),
        useDefaultLocationBtn: document.getElementById('use-default-location-btn'),
        footerAddress: document.getElementById('footer-address'),
        footerHotline: document.getElementById('footer-hotline'),
        footerHours: document.getElementById('footer-hours'),
        confirmationModal: document.getElementById('confirmation-modal'),
        confirmationTitle: document.getElementById('confirmation-title'),
        confirmationMessage: document.getElementById('confirmation-message'),
        confirmActionBtn: document.getElementById('confirm-action-btn'),
        cancelConfirmationBtn: document.getElementById('cancel-confirmation-btn'),
        selectQrBtn: document.getElementById('select-qr-btn'),
        selectCashBtn: document.getElementById('select-cash-btn'),
        infoPlateType: document.getElementById('info-plate-type'),
        plateInfoItem: document.getElementById('plate-info-item'),
        // MỚI: Các phần tử cho modal cảnh báo an ninh
        securityAlertModal: document.getElementById('security-alert-modal'),
        securityAlertPlateDisplay: document.getElementById('security-alert-plate-display'),
        securityAlertStatus: document.getElementById('security-alert-status'),
        securityAlertReasonDisplay: document.getElementById('security-alert-reason-display'),
        acknowledgeAlertBtn: document.getElementById('acknowledge-alert-btn'),
        selectedVehicleAlert: document.getElementById('selected-vehicle-alert'),
        globalAlertStrip: document.getElementById('global-alert-strip'), // MỚI
    };

    let vehiclesOnSelectedDate = [], isLoading = false, durationIntervals = [], cameraStream = null;
    let currentVehicleContext = null, scanAnimation = null, paymentChannel = null, confirmationWindow = null;
    let autoRefreshInterval = null, currentLocation = null, currentCapacity = 0;
    // MỚI: Khởi tạo BroadcastChannel để nhận cảnh báo
    const securityChannel = new BroadcastChannel('security_alert_channel');
    // MỚI: Biến cho hiệu ứng nhấp nháy tiêu đề
    let titleAlertInterval = null;
    const originalTitle = document.title;
    // MỚI: Lưu trữ các cảnh báo đang hoạt động
    let activeSecurityAlerts = {};

    // =================================================================
    // KHU VỰC 2: CÁC HÀM TIỆN ÍCH (UTILITY FUNCTIONS)
    // =================================================================
    const formatDateForAPI = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const formatDateTimeForDisplay = (dateStr) => dateStr ? new Date(dateStr).toLocaleString('vi-VN') : '--';
    const cleanPlateNumber = (plateStr) => plateStr ? plateStr.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
    const formatPhoneNumberForDisplay = (phoneStr) => {
        if (!phoneStr || String(phoneStr).trim() === '') return 'Chưa có';
        let phone = String(phoneStr);
        if (phone.length === 9 && !phone.startsWith('0')) return '0' + phone;
        return phone;
    };
    const isMobileDevice = () => window.innerWidth < 1024;

    const getDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return R * c;
    };

    const setIsLoading = (loading, isInitialLoad = false) => {
        isLoading = loading;
        const mainInputs = [allElements.searchTermInput, allElements.micBtn, allElements.scanQrBtn];
        const secondaryElements = [allElements.checkInBtn, allElements.checkOutBtn, allElements.phoneNumberInput, allElements.datePicker, allElements.filterInput];
        if (isInitialLoad && !loading) [...mainInputs, ...secondaryElements].forEach(el => { if(el) el.disabled = false; });
        else if (!isInitialLoad) secondaryElements.forEach(el => { if(el) el.disabled = loading; });
        if (!isInitialLoad) mainInputs.forEach(el => { if(el) el.disabled = loading; });
        else mainInputs.forEach(el => { if(el) el.disabled = false; });
        if(loading) { allElements.checkInBtn.disabled = true; allElements.checkOutBtn.disabled = true; }
    };

    const showToast = (message, type = 'success') => {
        const toast = document.createElement('div'); toast.className = `toast ${type}`;
        const icon = type === 'success' ? '✅' : '❌'; toast.innerHTML = `${icon} <span>${message}</span>`;
        allElements.toastContainer.appendChild(toast);
        setTimeout(() => { toast.style.animation = 'fadeOutToast 0.5s ease forwards'; setTimeout(() => toast.remove(), 500); }, 2500);
    };

    const calculateDuration = (startTime) => {
        if (!startTime) return '--'; const start = new Date(startTime), now = new Date();
        let diff = Math.floor((now - start) / 1000);
        const days = Math.floor(diff / 86400); diff %= 86400; const hours = Math.floor(diff / 3600); diff %= 3600;
        const minutes = Math.floor(diff / 60); let result = '';
        if (days > 0) result += `${days}d `; if (hours > 0) result += `${hours}h `; result += `${minutes}m`;
        return result.trim();
    };

    const calculateDurationBetween = (startTime, endTime) => {
        if (!startTime || !endTime) return '--'; const start = new Date(startTime), end = new Date(endTime);
        let diff = Math.floor((end - start) / 1000); if (diff < 0) return '0m';
        const days = Math.floor(diff / 86400); diff %= 86400; const hours = Math.floor(diff / 3600); diff %= 3600;
        const minutes = Math.floor(diff / 60); let result = '';
        if (days > 0) result += `${days}d `; if (hours > 0) result += `${hours}h `; result += `${minutes}m`;
        return result.trim() || '0m';
    };

    const calculateFee = (startTime, endTime, isVIP = false) => {
        if (isVIP || !startTime) return 0;
        const config = APP_CONFIG.fee, start = new Date(startTime), end = endTime ? new Date(endTime) : new Date();
        const diffMinutes = Math.floor((end - start) / (1000 * 60));
        if (diffMinutes <= config.freeMinutes) return 0;
        let totalFee = 0;
        let chargeableStartTime = new Date(start.getTime() + config.freeMinutes * 60 * 1000);
        const totalChargeableHours = Math.ceil((diffMinutes - config.freeMinutes) / 60);
        for (let i = 0; i < totalChargeableHours; i++) {
            let currentBlockStartHour = new Date(chargeableStartTime.getTime() + i * 60 * 60 * 1000).getHours();
            const isNight = currentBlockStartHour >= config.nightStartHour || currentBlockStartHour < config.nightEndHour;
            totalFee += isNight ? config.nightRate : config.dayRate;
        }
        return totalFee;
    };

    const clearAllIntervals = () => { durationIntervals.forEach(clearInterval); durationIntervals = []; };

    const decodePlateNumber = (plate) => {
        if (!plate || typeof plate !== 'string' || typeof PLATE_DATA === 'undefined') return 'Chưa có thông tin';
        const cleanedPlate = cleanPlateNumber(plate);
        for (const series in PLATE_DATA.specialSeries) {
            if (cleanedPlate.includes(series)) {
                if (series === 'NG') {
                    const diplomaticCode = parseInt(cleanedPlate.replace('NG', '').substring(0, 3), 10);
                    if (!isNaN(diplomaticCode)) {
                        for (const range in PLATE_DATA.diplomaticSeries) {
                            if (range.includes('-')) {
                                const [start, end] = range.split('-').map(Number);
                                if (diplomaticCode >= start && diplomaticCode <= end) return PLATE_DATA.diplomaticSeries[range];
                            } else if (diplomaticCode === parseInt(range, 10)) return PLATE_DATA.diplomaticSeries[range];
                        }
                    }
                    return "Xe của cơ quan đại diện ngoại giao";
                }
                return PLATE_DATA.specialSeries[series];
            }
        }
        let provinceCode = '', vehicleType = 'Chưa xác định';
        if (cleanedPlate.length === 9 && /^[0-9]{2}/.test(cleanedPlate)) {
            provinceCode = cleanedPlate.substring(0, 2); vehicleType = 'Xe máy';
        } else if (cleanedPlate.length === 8 && /^[0-9]{2}/.test(cleanedPlate)) {
            provinceCode = cleanedPlate.substring(0, 2); vehicleType = 'Ô tô';
        }
        if (!provinceCode) return 'Biển số không xác định';
        const provinceInfo = PLATE_DATA.provinces.find(p => p.codes.includes(provinceCode));
        const provinceName = provinceInfo ? provinceInfo.name : 'Tỉnh không xác định';
        return `${provinceName} - ${vehicleType}`;
    };

    /**
     * TÍCH HỢP: Tính toán chi tiết phí theo giờ ngày/đêm.
     * Logic này được đồng bộ từ file lookup.js để đảm bảo tính nhất quán.
     * @param {Date} startTime - Thời gian bắt đầu.
     * @param {Date} endTime - Thời gian kết thúc.
     * @param {boolean} isVIP - Xe có phải là VIP hay không.
     * @returns {object} - { dayHours, nightHours }
     */
    const calculateFeeWithBreakdown = (startTime, endTime, isVIP) => {
        if (isVIP || !startTime) return { dayHours: 0, nightHours: 0 };

        const config = APP_CONFIG.fee;
        const start = new Date(startTime);
        const end = endTime ? new Date(endTime) : new Date();
        const diffMinutes = Math.floor((end - start) / (1000 * 60));

        if (diffMinutes <= config.freeMinutes) {
            return { dayHours: 0, nightHours: 0 };
        }

        let dayHours = 0;
        let nightHours = 0;
        let chargeableStartTime = new Date(start.getTime() + config.freeMinutes * 60 * 1000);
        const chargeableMinutes = diffMinutes - config.freeMinutes;
        const totalChargeableHours = Math.ceil(chargeableMinutes / 60);

        for (let i = 0; i < totalChargeableHours; i++) {
            let currentBlockStartHour = new Date(chargeableStartTime.getTime() + i * 60 * 60 * 1000).getHours();
            const isNight = currentBlockStartHour >= config.nightStartHour || currentBlockStartHour < config.nightEndHour;
            isNight ? nightHours++ : dayHours++;
        }
        return { dayHours, nightHours };
    };

    /**
     * TÍCH HỢP: Chuyển đổi số thành chữ tiếng Việt.
     * @param {number} num - Số cần chuyển đổi.
     * @returns {string} - Chuỗi chữ tiếng Việt.
     */
    const numberToWords = (num) => {
        const units = ["", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
        const teens = ["mười", "mười một", "mười hai", "mười ba", "mười bốn", "mười lăm", "mười sáu", "mười bảy", "mười tám", "mười chín"];
        const tens = ["", "mười", "hai mươi", "ba mươi", "bốn mươi", "năm mươi", "sáu mươi", "bảy mươi", "tám mươi", "chín mươi"];
        const thousands = ["", "nghìn", "triệu", "tỷ"];

        if (num === 0) return 'Không';
        if (num < 0) return "Âm " + numberToWords(Math.abs(num));

        let word = '', i = 0;
        while (num > 0) {
            let chunk = num % 1000;
            if (chunk > 0) {
                let chunkWord = '';
                const hundred = Math.floor(chunk / 100);
                const remainder = chunk % 100;
                if (hundred > 0) chunkWord += units[hundred] + ' trăm';
                if (remainder > 0) {
                    if (hundred > 0) chunkWord += ' ';
                    if (remainder < 10) { if (hundred > 0) chunkWord += 'linh '; chunkWord += units[remainder]; }
                    else if (remainder < 20) { chunkWord += teens[remainder - 10]; }
                    else { const ten = Math.floor(remainder / 10); const one = remainder % 10; chunkWord += tens[ten]; if (one > 0) { chunkWord += (one === 1 && ten > 1) ? ' mốt' : ' ' + units[one]; } }
                }
                if (thousands[i]) word = chunkWord + ' ' + thousands[i] + ' ' + word; else word = chunkWord + ' ' + word;
            }
            num = Math.floor(num / 1000); i++;
        }
        let finalWord = word.trim();
        return finalWord.charAt(0).toUpperCase() + finalWord.slice(1);
    };

    // MỚI: Hàm tải danh sách cảnh báo từ Google Sheets
    const fetchActiveAlerts = async () => {
        try {
            const response = await fetch(`${APP_CONFIG.googleScriptUrl}?action=getActiveAlerts&v=${new Date().getTime()}`);
            if (!response.ok) throw new Error(`Lỗi mạng: ${response.statusText}`);
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            
            activeSecurityAlerts = result.data || {};
            updateGlobalAlertStrip(); // Cập nhật dải băng cảnh báo
            // Cập nhật lại UI nếu xe đang hiển thị có trong danh sách cảnh báo
            if (currentVehicleContext && currentVehicleContext.plate) {
                updateUIFromCache(cleanPlateNumber(currentVehicleContext.plate));
            }
        } catch (error) {
            console.error('Lỗi tải danh sách cảnh báo:', error);
        }
    };

    // =================================================================
    // KHU VỰC 3: CÁC HÀM CẬP NHẬT GIAO DIỆN (UI FUNCTIONS)
    // =================================================================
    const showConfirmationModal = (message, onConfirm) => {
        allElements.confirmationTitle.textContent = message.title;
        allElements.confirmationMessage.innerHTML = `Xác nhận cho xe <strong style="font-size:1.5rem; color:var(--text-primary); display:block; margin:8px 0;">${message.plate}</strong> ra khỏi bãi.<br>Lý do: <strong>${message.reason}</strong>`;
        allElements.confirmationModal.style.display = 'flex';
        const handleConfirmClick = () => { onConfirm(); allElements.confirmationModal.style.display = 'none'; };
        allElements.confirmActionBtn.addEventListener('click', handleConfirmClick, { once: true });
    };

    const fetchVehiclesForDate = async (dateStr, isSilent = false, isInitialLoad = false) => {
        if (!dateStr) { dateStr = formatDateForAPI(new Date()); if (allElements.datePicker) allElements.datePicker.value = dateStr; }
        let displayDateObj = new Date(dateStr + 'T00:00:00');
        if (isNaN(displayDateObj.getTime())) { displayDateObj = new Date(); dateStr = formatDateForAPI(displayDateObj); if (allElements.datePicker) allElements.datePicker.value = dateStr; }
        if (isLoading && !isSilent) return;
        if (!isSilent) { setIsLoading(true, isInitialLoad); showSkeletonLoader(); } 
        else { if (allElements.datePicker) allElements.datePicker.disabled = true; }
        allElements.listTitle.textContent = `Danh sách xe ngày ${displayDateObj.toLocaleDateString('vi-VN')}`;
        try {
            const locationIdParam = currentLocation ? `&locationId=${currentLocation.id}` : '';
            const response = await fetch(`${APP_CONFIG.googleScriptUrl}?action=getVehicles&date=${dateStr}${locationIdParam}&v=${new Date().getTime()}`);
            if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
            const result = await response.json();
            if (result.status === 'success') {
                vehiclesOnSelectedDate = result.data;
                filterVehicleList(); updateDashboard();
                if (allElements.searchTermInput.value) updateUIFromCache(cleanPlateNumber(allElements.searchTermInput.value));
            } else { throw new Error(result.message); }
        } catch (error) {
            if (!isSilent) showToast(`Lỗi tải dữ liệu: ${error.message}`, 'error');
            console.error("Fetch error:", error);
            vehiclesOnSelectedDate = []; filterVehicleList(); updateDashboard();
        } finally {
            if (!isSilent) setIsLoading(false, isInitialLoad);
            else { if (allElements.datePicker) allElements.datePicker.disabled = false; }
        }
    };

    const fetchVehicleHistory = (plate) => {
        fetch(`${APP_CONFIG.googleScriptUrl}?plate=${plate}&v=${new Date().getTime()}`)
            .then(response => response.json()).then(result => {
                if (result.status === 'success') populateHistoryList(result.data);
                else throw new Error(result.message);
            }).catch(error => {
                console.error("Lỗi tải lịch sử:", error);
                document.getElementById('info-history-list').innerHTML = `<li class="history-item" style="color: var(--danger-color);">Không thể tải lịch sử.</li>`;
            });
    };

    const showSkeletonLoader = () => {
        allElements.vehicleListContainer.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const skeleton = document.createElement('div'); skeleton.className = 'skeleton-item';
            allElements.vehicleListContainer.appendChild(skeleton);
        }
    };

    const renderVehicleList = (list) => {
        allElements.vehicleListContainer.innerHTML = '';
        if (!list || list.length === 0) {
            allElements.vehicleListContainer.innerHTML = `<div class="empty-state" style="color: var(--text-secondary); text-align: center; padding: 40px 0;"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 1rem;"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9L2 12v9c0 .6.4 1 1 1h2"/><path d="M7 12V2H3v10"/><path d="m16 12 3.1 3.9c.1.1.1.3 0 .4l-1.1.9c-.1.1-.3.1-.4 0L16 16v-4"/><path d="M5 18h3"/><path d="M6 18v-4"/></svg><p>Không có xe nào trong danh sách.</p></div>`;
            return;
        }
        list.sort((a, b) => new Date(b['Entry Time']) - new Date(a['Entry Time']));
        list.forEach(vehicle => {
            const vehicleItem = document.createElement('div');
            const isVehicleVIP = vehicle.VIP === 'Có';
            vehicleItem.className = isVehicleVIP ? 'vehicle-item is-vip' : 'vehicle-item';
            vehicleItem.dataset.plate = vehicle.Plate; vehicleItem.dataset.uniqueid = vehicle.UniqueID;
            const phoneInfo = vehicle.Phone ? `<span>📞 ${formatPhoneNumberForDisplay(vehicle.Phone)}</span>` : '';
            const statusClass = vehicle.Status === 'Đang gửi' ? 'parking' : 'departed';
            const statusBadge = `<span class="status-badge ${statusClass}">${vehicle.Status}</span>`;
            const carIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M19.94,10.25a2.5,2.5,0,0,0-4.88,0H4.06a2.5,2.5,0,0,0-4.88,0H0v10H24V10.25ZM6,14.75a1.5,1.5,0,1,1,1.5,1.5A1.5,1.5,0,0,1,6,14.75Zm12,0a1.5,1.5,0,1,1,1.5,1.5A1.5,1.5,0,0,1,18,14.75Z"/></svg>`;
            const vipIcon = isVehicleVIP ? '⭐' : '';
            vehicleItem.innerHTML = `<div class="icon">${carIcon}</div><div class="info" style="flex-grow:1;"><div class="plate">${vipIcon} ${vehicle.Plate} ${statusBadge}</div><div class="details">${phoneInfo}<span>🕒 ${formatDateTimeForDisplay(vehicle['Entry Time'])}</span></div></div>`;
            allElements.vehicleListContainer.appendChild(vehicleItem);
        });
    };

    const filterVehicleList = () => {
        const filterText = cleanPlateNumber(allElements.filterInput.value);
        if (!filterText) { renderVehicleList(vehiclesOnSelectedDate); return; }
        const filteredList = vehiclesOnSelectedDate.filter(v => (v.Plate && cleanPlateNumber(v.Plate).includes(filterText)) || (v.Phone && String(v.Phone).includes(filterText)));
        renderVehicleList(filteredList);
    };

    const updateDashboard = () => {
        if (!vehiclesOnSelectedDate) return;
        const currentVehicles = vehiclesOnSelectedDate.filter(v => v.Status === 'Đang gửi');
        const vehiclesToday = vehiclesOnSelectedDate;
        allElements.dashboardCurrent.textContent = currentVehicles.length;
        allElements.dashboardTotal.textContent = vehiclesToday.length;
        if (vehiclesToday.length > 0) {
            const hours = vehiclesToday.map(v => new Date(v['Entry Time']).getHours());
            const hourCounts = hours.reduce((acc, hour) => { acc[hour] = (acc[hour] || 0) + 1; return acc; }, {});
            const peakHour = Object.keys(hourCounts).length > 0 ? Object.keys(hourCounts).reduce((a, b) => hourCounts[a] > hourCounts[b] ? a : b) : '--';
            allElements.dashboardPeak.textContent = peakHour !== '--' ? `${peakHour}h - ${parseInt(peakHour) + 1}h` : '--';
        } else { allElements.dashboardPeak.textContent = '--'; }
        if (currentVehicles.length > 0) {
            const longest = currentVehicles.reduce((a, b) => new Date(a['Entry Time']) < new Date(b['Entry Time']) ? a : b);
            allElements.dashboardLongest.textContent = calculateDuration(longest['Entry Time']);
        } else { allElements.dashboardLongest.textContent = '--'; }
        if (currentCapacity > 0 && allElements.capacityGaugeFill && allElements.capacityGaugeText) {
            const percentage = Math.min(100, Math.round((currentVehicles.length / currentCapacity) * 100));
            const rotation = (percentage / 100) * 180;
            allElements.capacityGaugeFill.style.transform = `rotate(${135 + rotation}deg)`;
            allElements.capacityGaugeText.textContent = `${percentage}%`;
        }
        if (allElements.capacityStatusMessage && currentCapacity > 0) {
            const currentCount = currentVehicles.length;
            const percentage = (currentCount / currentCapacity) * 100;
            allElements.capacityStatusMessage.style.display = 'none';
            allElements.capacityStatusMessage.className = 'capacity-status-message';
            if (percentage >= 100) {
                allElements.capacityStatusMessage.textContent = `⚠️ Bãi xe đã ĐẦY hoặc QUÁ TẢI! (${currentCount}/${currentCapacity} xe)`;
                allElements.capacityStatusMessage.classList.add('danger');
                allElements.capacityStatusMessage.style.display = 'block';
            } else if (percentage >= 90) {
                allElements.capacityStatusMessage.textContent = `🔔 Bãi xe SẮP ĐẦY! (${currentCount}/${currentCapacity} xe)`;
                allElements.capacityStatusMessage.classList.add('warning');
                allElements.capacityStatusMessage.style.display = 'block';
            } else if (percentage >= 80) {
                allElements.capacityStatusMessage.textContent = `Bãi xe gần đầy (${currentCount}/${currentCapacity} xe)`;
                allElements.capacityStatusMessage.classList.add('warning');
                allElements.capacityStatusMessage.style.display = 'block';
            }
        }
    };

    const updateUIFromCache = (plate) => {
        clearAllIntervals();
        const vehicleParking = vehiclesOnSelectedDate.find(v => v.Plate && cleanPlateNumber(v.Plate) === plate && v.Status === 'Đang gửi');
        const vehicleDeparted = vehiclesOnSelectedDate.find(v => v.Plate && cleanPlateNumber(v.Plate) === plate && v.Status !== 'Đang gửi');
        allElements.vehicleInfoPanel.style.display = 'none';

        // NÂNG CẤP: Hiển thị cảnh báo ngay trên panel thông tin xe và ô tìm kiếm
        const alertInfo = activeSecurityAlerts[plate];
        if (alertInfo) {
            allElements.selectedVehicleAlert.style.display = 'block';
            let reasonText = alertInfo.reason || 'Không có ghi chú cụ thể.';
            if (alertInfo.level === 'block') {
                reasonText += ' <strong>(MỨC ĐỘ: CHẶN LẤY XE)</strong>';
            }
            document.getElementById('selected-vehicle-alert-reason').innerHTML = reasonText;
            allElements.searchTermInput.classList.add('alerted'); // Làm nhấp nháy ô tìm kiếm
        } else {
            allElements.selectedVehicleAlert.style.display = 'none';
            allElements.searchTermInput.classList.remove('alerted');
        }

        if (vehicleParking) {
            const isVehicleVIP = vehicleParking.VIP === 'Có';
            currentVehicleContext = { plate: vehicleParking.Plate, status: 'parking', uniqueID: vehicleParking.UniqueID, isVIP: isVehicleVIP };
            allElements.phoneItemMain.style.display = 'none';
            allElements.vipCheckboxContainer.style.display = 'none';
            if (isVehicleVIP) allElements.infoStatus.innerHTML = `<span class="status-badge parking">Đang gửi (VIP) ⭐</span>`;
            else allElements.infoStatus.innerHTML = `<span class="status-badge parking">Đang gửi</span>`;
            allElements.infoEntryTime.textContent = formatDateTimeForDisplay(vehicleParking['Entry Time']);
            allElements.infoPhoneNumber.textContent = formatPhoneNumberForDisplay(vehicleParking.Phone);
            allElements.durationItem.style.display = 'flex';
            allElements.feeItem.style.display = 'flex';
            const updateLiveInfo = () => {
                const duration = calculateDuration(vehicleParking['Entry Time']) || '--';
                const fee = calculateFee(vehicleParking['Entry Time'], null, isVehicleVIP);
                allElements.infoDuration.textContent = duration;
                allElements.infoFee.textContent = `${fee.toLocaleString('vi-VN')}đ`;
            };
            updateLiveInfo();
            const interval = setInterval(updateLiveInfo, 10000);
            durationIntervals.push(interval);
            allElements.reprintReceiptBtn.classList.add('hidden');
            allElements.checkOutBtn.classList.remove('hidden');
            allElements.checkOutBtn.disabled = false;
            allElements.checkOutBtn.style.backgroundImage = ''; // Reset style
            // NÂNG CẤP: Vô hiệu hóa nút checkout nếu xe bị chặn
            if (alertInfo && alertInfo.level === 'block') {
                allElements.checkOutBtn.disabled = true;
                allElements.checkOutBtn.title = `XE BỊ CHẶN: ${alertInfo.reason || 'Không thể lấy xe.'}`; // Sửa lỗi chính tả
                allElements.checkOutBtn.style.backgroundImage = 'linear-gradient(to bottom, #777, #555)';
            }
            allElements.checkInBtn.classList.add('hidden');
            allElements.vehicleInfoPanel.style.display = 'block';
        } else if (vehicleDeparted) {
            currentVehicleContext = { plate: vehicleDeparted.Plate, status: 'departed', uniqueID: vehicleDeparted.UniqueID, isVIP: vehicleDeparted.VIP === 'Có' };
            allElements.phoneItemMain.style.display = 'none';
            allElements.vipCheckboxContainer.style.display = 'none';
            allElements.infoStatus.innerHTML = `<span class="status-badge departed">Đã rời bãi</span>`;
            allElements.infoEntryTime.textContent = formatDateTimeForDisplay(vehicleDeparted['Entry Time']);
            allElements.infoPhoneNumber.textContent = formatPhoneNumberForDisplay(vehicleDeparted.Phone);
            allElements.durationItem.style.display = 'flex';
            allElements.feeItem.style.display = 'flex';
            allElements.infoDuration.textContent = calculateDurationBetween(vehicleDeparted['Entry Time'], vehicleDeparted['Exit Time']);
            allElements.infoFee.textContent = `${(vehicleDeparted.Fee || 0).toLocaleString('vi-VN')}đ`;
            allElements.reprintReceiptBtn.classList.remove('hidden');
            allElements.checkInBtn.classList.add('hidden');
            allElements.checkOutBtn.classList.add('hidden');
            allElements.vehicleInfoPanel.style.display = 'block';
            // TÍCH HỢP: Khi nhấn nút "In lại biên lai", mở thẳng trang receipt_viewer.html
            allElements.reprintReceiptBtn.onclick = () => {
                const fee = vehicleDeparted.Fee || 0;
                const exitTime = new Date(vehicleDeparted['Exit Time']);
                const entryTime = new Date(vehicleDeparted['Entry Time']);
                const feeDetails = calculateFeeWithBreakdown(entryTime, exitTime, vehicleDeparted.VIP === 'Có');

                // SỬA LỖI: Xác định chính xác paymentMethod để hiển thị phụ chú
                let actualPaymentMethod = vehicleDeparted['Payment Method'] || 'N/A';
                const isVehicleVIP = vehicleDeparted.VIP === 'Có';
                const calculatedFee = calculateFee(vehicleDeparted['Entry Time'], vehicleDeparted['Exit Time'], isVehicleVIP);

                if (isVehicleVIP) {
                    actualPaymentMethod = 'VIP';
                } else if (calculatedFee === 0) {
                    actualPaymentMethod = 'Miễn phí';
                }
                
                const params = new URLSearchParams({
                    orgName: currentLocation?.name || 'ĐOÀN TNCS HỒ CHÍ MINH PHƯỜNG BA ĐÌNH',
                    orgAddress: currentLocation?.address || 'Đang cập nhật',
                    taxId: '0123456789',
                    orgHotline: currentLocation?.hotline || 'Đang cập nhật',
                    exitDate: exitTime.getDate(),
                    exitMonth: exitTime.getMonth() + 1,
                    exitYear: exitTime.getFullYear(),
                    uniqueID: vehicleDeparted.UniqueID,
                    plate: vehicleDeparted.Plate,
                    vehicleType: decodePlateNumber(vehicleDeparted.Plate),
                    entryTimeDisplay: formatDateTimeForDisplay(vehicleDeparted['Entry Time']),
                    exitTimeDisplay: formatDateTimeForDisplay(vehicleDeparted['Exit Time']),
                    duration: calculateDurationBetween(vehicleDeparted['Entry Time'], vehicleDeparted['Exit Time']),
                    feeDisplay: fee.toLocaleString('vi-VN'),
                    feeInWords: numberToWords(fee),
                    dayHours: feeDetails.dayHours, // SỬA LỖI: Đảm bảo truyền đúng feeDetails.dayHours
                    nightHours: feeDetails.nightHours,
                    dayRateFormatted: APP_CONFIG.fee.dayRate.toLocaleString('vi-VN') + 'đ',
                    nightRateFormatted: APP_CONFIG.fee.nightRate.toLocaleString('vi-VN') + 'đ',
                    paymentMethod: actualPaymentMethod, // Sử dụng phương thức đã xác định
                    freeMinutes: APP_CONFIG.fee.freeMinutes, // THÊM: Truyền số phút miễn phí
                });
                window.open(`receipt_viewer.html?${params.toString()}`, '_blank');
            };
        } else {
            currentVehicleContext = { plate: plate, status: 'new' };
            allElements.phoneItemMain.style.display = 'block';
            allElements.vipCheckboxContainer.style.display = 'flex';
            resetMainForm();
            allElements.checkInBtn.classList.remove('hidden');
            allElements.reprintReceiptBtn.classList.add('hidden');
            allElements.checkOutBtn.classList.add('hidden');
        }
        const decodedInfo = decodePlateNumber(plate);
        if (allElements.plateInfoItem && allElements.infoPlateType) {
            allElements.infoPlateType.textContent = decodedInfo;
            allElements.plateInfoItem.style.display = 'flex';
        }
        fetchVehicleHistory(plate);
    };

    const populateHistoryList = (history) => {
        const historyList = allElements.infoHistoryList;
        historyList.innerHTML = '';
        const historyExists = Array.isArray(history) && history.length > 0;
        if (currentVehicleContext && (currentVehicleContext.status === 'parking' || (currentVehicleContext.status === 'new' && historyExists))) {
            allElements.vehicleInfoPanel.style.display = 'block';
        } else if (currentVehicleContext && currentVehicleContext.status === 'new' && !historyExists) {
             allElements.vehicleInfoPanel.style.display = 'none';
        }
        if (historyExists) {
            if(currentVehicleContext && currentVehicleContext.status === 'new') {
                allElements.phoneNumberInput.value = history[0]?.Phone || '';
            }
            history.slice(0, 5).forEach(entry => {
                const li = document.createElement('li');
                li.className = 'history-item';
                const duration = calculateDurationBetween(entry['Entry Time'], entry['Exit Time']);
                li.innerHTML = `<div style="font-weight: 500; color: var(--text-primary); margin-bottom: 5px;">Vào: ${formatDateTimeForDisplay(entry['Entry Time'])}</div><div style="color: var(--text-secondary); margin-bottom: 5px;">Ra: ${formatDateTimeForDisplay(entry['Exit Time'])}</div><div style="font-weight: 700; color: var(--primary-accent);">Tổng thời gian: ${duration}</div>`;
                historyList.appendChild(li);
            });
        } else {
            historyList.innerHTML = `<li style="list-style: none; color: var(--text-secondary);">Chưa có lịch sử.</li>`;
        }
    };

    const resetMainForm = () => {
        allElements.vehicleInfoPanel.style.display = 'none';
        allElements.phoneItemMain.style.display = 'block';
        allElements.vipCheckboxContainer.style.display = 'flex';
        allElements.checkInBtn.classList.add('hidden');
        allElements.reprintReceiptBtn.classList.add('hidden');
        allElements.checkOutBtn.classList.add('hidden');
        allElements.infoPhoneNumber.textContent = '--';
        allElements.isVipCheckbox.checked = false;
        currentVehicleContext = null;
        clearAllIntervals();
        if (allElements.plateInfoItem) allElements.plateInfoItem.style.display = 'none';
    };
    
    // MỚI: Hàm cập nhật dải băng cảnh báo toàn cục
    const updateGlobalAlertStrip = () => {
        const hasActiveAlerts = Object.keys(activeSecurityAlerts).length > 0;
        allElements.globalAlertStrip.style.display = hasActiveAlerts ? 'block' : 'none';
    };

    const processCheckOut = async (checkoutData) => {
        // ================== SỬA LỖI BẢO MẬT QUAN TRỌNG ==================
        // Luôn kiểm tra cảnh báo chặn ngay tại hàm checkout cốt lõi.
        if (!checkAlertBeforeCheckout(checkoutData.plate)) {
            return false; // Ngăn chặn hành vi ngay lập tức
        }
        // ===============================================================
        if (isLoading) return;
        setIsLoading(true);
        const payload = { action: 'checkOut', ...checkoutData };
        try {
            if (navigator.onLine) {
                const response = await fetch(APP_CONFIG.googleScriptUrl, { method: 'POST', body: JSON.stringify(payload) });
                const result = await response.json();
                if (result.status !== 'success') throw new Error(result.message);
            } else {
                const offlineAction = { ...payload, timestamp: new Date().toISOString() };
                addToOfflineQueue(offlineAction);
            }
            return true; 
        } catch (error) {
            showToast(`Lỗi khi cho xe ra: ${error.message}`, 'error');
            return false;
        }
    };

    const closeQrCode = () => {
        if (allElements.qrcodeModal) allElements.qrcodeModal.style.display = 'none';
        if (allElements.qrcodeCanvas) {
            try { const ctx = allElements.qrcodeCanvas.getContext('2d'); if (ctx) ctx.clearRect(0, 0, allElements.qrcodeCanvas.width, allElements.qrcodeCanvas.height); } catch(e){ /* ignore */ }
        }
        if (allElements.searchTermInput) allElements.searchTermInput.value = '';
        if (allElements.phoneNumberInput) allElements.phoneNumberInput.value = '';
        resetMainForm(); setIsLoading(false);
        fetchVehiclesForDate(allElements.datePicker ? allElements.datePicker.value : formatDateForAPI(new Date()), true);
    };
    
    // =================================================================
    // KHU VỰC 4: CÁC HÀM XỬ LÝ LOGIC CHÍNH (CHECK-IN, CHECK-OUT)
    // =================================================================
    const syncCheckInInBackground = (payload) => {
        (async () => {
            try {
                if (navigator.onLine) {
                    const response = await fetch(APP_CONFIG.googleScriptUrl, { method: 'POST', body: JSON.stringify(payload) });
                    const result = await response.json();
                    if (result.status !== 'success') { console.error('Lỗi đồng bộ nền:', result.message); } 
                    else { console.log(`Đồng bộ check-in cho ${payload.plate} thành công.`); }
                } else {
                    const offlineAction = { ...payload, timestamp: new Date().toISOString() };
                    addToOfflineQueue(offlineAction);
                }
            } catch (error) {
                console.error(`Lỗi đồng bộ nền: ${error.message}`);
                const offlineAction = { ...payload, timestamp: new Date().toISOString() };
                addToOfflineQueue(offlineAction);
            }
        })();
    };

    const showQrCode = (plate, entryTime, uniqueID) => {
        if (allElements.ticketPlateDisplay) allElements.ticketPlateDisplay.textContent = plate;
        if (allElements.ticketTimeDisplay) allElements.ticketTimeDisplay.textContent = formatDateTimeForDisplay(entryTime);
        if (allElements.ticketLocationDisplay && currentLocation) allElements.ticketLocationDisplay.textContent = `Bãi đỗ xe: ${currentLocation.name}`;
        if (allElements.ticketLookupLink) {
            const lookupUrl = `${window.location.origin}${window.location.pathname.replace('index.html', '')}lookup.html?id=${uniqueID}`;
            allElements.ticketLookupLink.href = lookupUrl;
        }
        QRCode.toCanvas(allElements.qrcodeCanvas, uniqueID, { width: 220, errorCorrectionLevel: 'H', margin: 1 }, (error) => {
            if (error) { showToast('Lỗi tạo mã QR.', 'error'); return; }
            if (allElements.qrcodeModal) allElements.qrcodeModal.style.display = 'flex';
        });
    };

    const showReceiptForDepartedVehicle = (vehicle) => {
        if (!vehicle) return;
        allElements.paymentPlateDisplay.textContent = vehicle.Plate;
        allElements.paymentEntryTime.textContent = formatDateTimeForDisplay(vehicle['Entry Time']);
        allElements.paymentExitTime.textContent = formatDateTimeForDisplay(vehicle['Exit Time']);
        allElements.paymentDuration.textContent = calculateDurationBetween(vehicle['Entry Time'], vehicle['Exit Time']);
        allElements.paymentAmountDisplay.textContent = (vehicle.Fee || 0).toLocaleString('vi-VN');
        allElements.paymentMemoDisplay.textContent = `TTGX ${vehicle.Plate} ${vehicle.UniqueID}`;
        document.querySelector('.payment-method-selector').style.display = 'none';
        allElements.paymentQrcodeImage.style.display = 'none';
        document.getElementById('payment-qrcode-wrapper').style.display = 'none';
        allElements.completePaymentBtn.style.display = 'none';
        allElements.closePaymentModalBtn.style.display = 'block';
        allElements.paymentModal.style.display = 'flex';
    };

    const showPaymentModal = () => {
        if (!currentVehicleContext || currentVehicleContext.status !== 'parking') return;
        const vehicle = vehiclesOnSelectedDate.find(v => v.UniqueID === currentVehicleContext.uniqueID);
        if (!vehicle) { showToast('Không tìm thấy thông tin xe để tính phí.', 'error'); return; }
        const isVehicleVIP = vehicle.VIP === 'Có';
        const fee = calculateFee(vehicle['Entry Time'], null, isVehicleVIP);
        const memo = cleanPlateNumber(vehicle.Plate);
        allElements.paymentPlateDisplay.textContent = vehicle.Plate;
        allElements.paymentEntryTime.textContent = formatDateTimeForDisplay(vehicle['Entry Time']);
        allElements.paymentExitTime.textContent = formatDateTimeForDisplay(new Date());
        allElements.paymentDuration.textContent = calculateDuration(vehicle['Entry Time']);
        allElements.paymentAmountDisplay.textContent = fee.toLocaleString('vi-VN');
        const paymentInfoText = `TTGX ${vehicle.Plate} ${vehicle.UniqueID}`;
        allElements.paymentMemoDisplay.textContent = paymentInfoText;
        allElements.paymentModal.style.display = 'flex';
        allElements.paymentQrcodeImage.style.display = 'none';
        allElements.paymentQrcodeImage.src = '';
        const qrWrapper = document.getElementById('payment-qrcode-wrapper');
        if (qrWrapper) qrWrapper.style.display = 'none';
        allElements.selectQrBtn.classList.remove('active');
        allElements.selectCashBtn.classList.remove('active');
        document.querySelector('.payment-method-selector').style.display = 'flex';
        allElements.completePaymentBtn.style.display = 'block';
        allElements.closePaymentModalBtn.style.display = 'block';
        allElements.completePaymentBtn.disabled = true;
        if (paymentChannel && confirmationWindow && !confirmationWindow.closed) {
            const payloadForConfirmation = createInitialDataForConfirmation(vehicle, null, paymentInfoText);
            if (payloadForConfirmation) paymentChannel.postMessage({ type: 'VEHICLE_CHECKOUT_INITIATE', payload: payloadForConfirmation });
        }
    };

    const completePayment = async () => {
        try {
            if (!currentVehicleContext || currentVehicleContext.status !== 'parking') return;
            const fee = parseFloat(allElements.paymentAmountDisplay.textContent.replace(/\./g, '')) || 0;
            let paymentMethod = 'Chưa chọn';
            if (allElements.selectCashBtn.classList.contains('active')) paymentMethod = 'Tiền mặt';
            else if (allElements.selectQrBtn.classList.contains('active')) paymentMethod = 'Chuyển khoản QR';
            allElements.paymentModal.style.display = 'none';
            const finalReceiptData = {
                licensePlate: currentVehicleContext.plate, timeIn: allElements.paymentEntryTime.textContent,
                timeOut: formatDateTimeForDisplay(new Date()), duration: allElements.paymentDuration.textContent,
                paymentMethod: paymentMethod, totalAmount: `${fee.toLocaleString('vi-VN')}đ`
            };
            const checkoutResult = await processCheckOut({
                uniqueID: currentVehicleContext.uniqueID, plate: currentVehicleContext.plate,
                fee: fee, paymentMethod: paymentMethod
            });
            if (!checkoutResult) return; 
            if (paymentChannel) paymentChannel.postMessage({ type: 'CHECKOUT_COMPLETE', payload: finalReceiptData });
            showToast('Đã hoàn tất cho xe ra!', 'success');
            resetMainForm();
            allElements.searchTermInput.value = ''; allElements.phoneNumberInput.value = '';
            await fetchVehiclesForDate(allElements.datePicker.value);
        } finally { setIsLoading(false); }
    };

    // =================================================================
    // KHU VỰC 5: LOGIC MÀN HÌNH PHỤ VÀ GIAO TIẾP KÊNH
    // =================================================================
    const openWindowOnSecondaryScreen = async (url, windowName, features) => {
        if ('getScreenDetails' in window) {
            try {
                const screenDetails = await window.getScreenDetails();
                const secondaryScreen = screenDetails.screens.find(screen => !screen.isPrimary);
                if (secondaryScreen) { const { availLeft, availTop } = secondaryScreen; features += `,left=${availLeft},top=${availTop}`; }
            } catch (err) { console.warn("Không thể truy cập thông tin màn hình chi tiết:", err.message); features += `,left=${window.screen.width},top=0`; }
        } else { console.log("Trình duyệt không hỗ trợ getScreenDetails. Sử dụng phương pháp dự phòng."); features += `,left=${window.screen.width},top=0`; }
        return window.open(url, windowName, features);
    };

    const handlePaymentChannelMessage = (event) => {
        const { type, payload, method } = event.data;
        switch (type) {
            case 'CUSTOMER_PAYMENT_METHOD_SELECTED':
                if (method === 'qr') allElements.selectQrBtn.click();
                else if (method === 'cash') allElements.selectCashBtn.click();
                if (paymentChannel) paymentChannel.postMessage({ type: 'PAYMENT_METHOD_SELECTED', method: method });
                break;
            case 'SELF_SERVICE_CHECKIN_REQUEST':
                if (payload && payload.plate) {
                    allElements.searchTermInput.value = payload.plate;
                    allElements.phoneNumberInput.value = payload.phone || '';
                    allElements.searchTermInput.dispatchEvent(new Event('input', { bubbles: true }));
                    setTimeout(() => { if (allElements.checkInBtn && !allElements.checkInBtn.disabled) allElements.checkInBtn.click(); }, 100);
                }
                break;
            case 'SHOW_PAYMENT_MODAL_FOR_VEHICLE':
                if (payload && payload.vehicle) {
                    const vehicle = payload.vehicle;
                    const fee = calculateFee(vehicle['Entry Time'], null, vehicle.VIP === 'Có');
                    if (fee === 0) processFreeCheckoutFromKiosk(vehicle);
                    else {
                        currentVehicleContext = { plate: vehicle.Plate, status: 'parking', uniqueID: vehicle.UniqueID, isVIP: vehicle.VIP === 'Có' };
                        showPaymentModal();
                    }
                }
                break;
            case 'TRANSACTION_CANCELED':
                if (allElements.paymentModal.style.display === 'flex') {
                    allElements.paymentModal.style.display = 'none'; resetMainForm();
                }
                break;
        }
    };

    const processFreeCheckoutFromKiosk = async (vehicle) => {
        // ================== SỬA LỖI BẢO MẬT QUAN TRỌNG ==================
        // Thêm bước kiểm tra cảnh báo trước khi tự động cho xe ra từ Kiosk.
        if (!checkAlertBeforeCheckout(vehicle.Plate)) {
            return; // Dừng lại nếu xe bị chặn
        }
        // ===============================================================
        const isVehicleVIP = vehicle.VIP === 'Có';
        const paymentMethod = isVehicleVIP ? 'VIP' : 'Miễn phí';
        const finalReceiptData = {
            licensePlate: vehicle.Plate, timeIn: formatDateTimeForDisplay(vehicle['Entry Time']), timeOut: formatDateTimeForDisplay(new Date()),
            duration: calculateDuration(vehicle['Entry Time']), paymentMethod: paymentMethod, totalAmount: '0đ'
        };
        const checkoutResult = await processCheckOut({ uniqueID: vehicle.UniqueID, plate: vehicle.Plate, fee: 0, paymentMethod: paymentMethod });
        if (checkoutResult) {
            if (paymentChannel) paymentChannel.postMessage({ type: 'CHECKOUT_COMPLETE', payload: finalReceiptData });
            showToast(`Đã tự động cho xe ${vehicle.Plate} ra (${paymentMethod}).`, 'success');
            await fetchVehiclesForDate(allElements.datePicker.value, true);
        }
    };

    // =================================================================
    // MỚI: KHU VỰC LOGIC CẢNH BÁO AN NINH
    // =================================================================
    const handleSecurityAlert = (event) => {
        const { type, plate, reason, level } = event.data;

        if (type === 'REMOVE_SECURITY_ALERT' && plate) {
            const cleanedPlate = cleanPlateNumber(plate);
            if (activeSecurityAlerts[cleanedPlate]) {
                delete activeSecurityAlerts[cleanedPlate];
                showToast(`Đã gỡ cảnh báo cho xe ${plate}.`, 'success');
                // Nếu xe đang được hiển thị, cập nhật lại UI
                if (currentVehicleContext && cleanPlateNumber(currentVehicleContext.plate) === cleanedPlate) {
                    updateUIFromCache(cleanedPlate);
                }
                updateGlobalAlertStrip(); // Cập nhật dải băng
            }
            return;
        }

        if (type !== 'SECURITY_ALERT' || !plate) return;
        const cleanedPlate = cleanPlateNumber(plate);

        // NÂNG CẤP: Lưu lại cảnh báo
        activeSecurityAlerts[cleanedPlate] = { reason, level };

        // NÂNG CẤP: Hiệu ứng nhấp nháy tiêu đề tab
        if (titleAlertInterval) clearInterval(titleAlertInterval);
        let isTitleAlerted = false;
        titleAlertInterval = setInterval(() => {
            document.title = isTitleAlerted ? originalTitle : `🚨 CẢNH BÁO: ${plate}`; // Giữ lại icon 🚨
            isTitleAlerted = !isTitleAlerted;
        }, 1000);

        // NÂNG CẤP: Âm thanh cảnh báo theo mức độ
        const alertSoundUrl = level === 'block' ? 'https://cdn.jsdelivr.net/gh/haitrieu/cdn/emergency-alarm.mp3' : 'https://cdn.jsdelivr.net/gh/haitrieu/cdn/ting.mp3';
        const alertSound = new Audio(alertSoundUrl);
        alertSound.play().catch(e => console.warn("Không thể phát âm thanh cảnh báo:", e));

        // NÂNG CẤP: Hiển thị lý do cảnh báo
        if (reason && allElements.securityAlertReasonDisplay) {
            allElements.securityAlertReasonDisplay.textContent = `Lý do: ${reason}`;
            allElements.securityAlertReasonDisplay.style.display = 'block';
        } else {
            if (allElements.securityAlertReasonDisplay) {
                allElements.securityAlertReasonDisplay.style.display = 'none';
            }
        }

        // Hiển thị thông tin trên modal
        allElements.securityAlertPlateDisplay.textContent = plate;

        // Kiểm tra trạng thái xe trong danh sách hiện tại
        const vehicleInLot = vehiclesOnSelectedDate.find(v => v.Plate && cleanPlateNumber(v.Plate) === cleanedPlate && v.Status === 'Đang gửi');

        if (vehicleInLot) {
            allElements.securityAlertStatus.textContent = "⚠️ CẢNH BÁO: Xe này ĐANG CÓ TRONG BÃI!";
            allElements.securityAlertStatus.style.color = 'var(--danger-color)';
            // Tự động điền và tìm kiếm xe
            allElements.searchTermInput.value = plate;
            allElements.searchTermInput.dispatchEvent(new Event('input', { bubbles: true }));
            // Cuộn tới xe trong danh sách
            const vehicleItem = allElements.vehicleListContainer.querySelector(`[data-plate="${vehicleInLot.Plate}"]`);
            if (vehicleItem) {
                vehicleItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                vehicleItem.style.backgroundColor = '#f2dede'; // Highlight màu đỏ nhạt
            }
        } else {
            allElements.securityAlertStatus.textContent = "Thông báo: Xe này hiện không có trong bãi.";
            allElements.securityAlertStatus.style.color = 'var(--text-primary)';
        }

        // Hiển thị modal
        allElements.securityAlertModal.style.display = 'flex';
    };

    // =================================================================
    // KHU VỰC 6: LOGIC QUÉT MÃ QR
    // =================================================================
    const openQrScanner = async () => {
        if (isLoading) return;
        if (!('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices)) { showToast('Trình duyệt không hỗ trợ camera.', 'error'); return; }
        if (!allElements.cameraFeed || !allElements.qrScannerModal) { showToast('Không tìm thấy phần tử máy quét trên trang.', 'error'); return; }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            cameraStream = stream; allElements.cameraFeed.srcObject = stream;
            allElements.qrScannerModal.style.display = 'flex';
            await allElements.cameraFeed.play().catch(()=>{});
            scanAnimation = requestAnimationFrame(tick);
        } catch(err) { console.error(err); showToast('Không thể truy cập camera. Vui lòng cấp quyền.', 'error'); }
    };

    const closeQrScanner = () => {
        if (scanAnimation) { cancelAnimationFrame(scanAnimation); scanAnimation = null; }
        if (cameraStream) { cameraStream.getTracks().forEach(track => track.stop()); cameraStream = null; }
        if (allElements.qrScannerModal) allElements.qrScannerModal.style.display = 'none';
        if (allElements.cameraFeed) { try { allElements.cameraFeed.pause(); allElements.cameraFeed.srcObject = null; } catch(e){/*ignore*/ } }
    };

    const tick = () => {
        if (allElements.cameraFeed.readyState === allElements.cameraFeed.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement('canvas');
            canvas.width = allElements.cameraFeed.videoWidth; canvas.height = allElements.cameraFeed.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(allElements.cameraFeed, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
            if (code) {
                const uniqueID = code.data; closeQrScanner();
                const vehicle = vehiclesOnSelectedDate.find(v => v.UniqueID === uniqueID);
                if (vehicle) {
                    if (vehicle.Status === 'Đang gửi') {
                        const isVehicleVIP = vehicle.VIP === 'Có';
                        const fee = calculateFee(vehicle['Entry Time'], null, isVehicleVIP);
                        if (fee > 0) {
                            currentVehicleContext = { plate: vehicle.Plate, status: 'parking', uniqueID: vehicle.UniqueID, isVIP: isVehicleVIP };
                                // SỬA LỖI: Kiểm tra cảnh báo trước khi hiển thị modal thanh toán
                                if (checkAlertBeforeCheckout(vehicle.Plate)) {
                                    showPaymentModal();
                                }
                        } else {
                            processCheckOut({ uniqueID: uniqueID, plate: vehicle.Plate, fee: 0, paymentMethod: isVehicleVIP ? 'VIP' : 'Miễn phí' });
                            showToast(`Xe ${vehicle.Plate} ra thành công (miễn phí).`, 'success');
                        }
                    } else { showToast(`Xe ${vehicle.Plate} đã rời bãi lúc ${formatDateTimeForDisplay(vehicle['Exit Time'])}.`, 'error'); resetMainForm(); }
                } else { showToast('Mã QR không hợp lệ hoặc xe đã ra khỏi bãi.', 'error'); }
            }
        }
        scanAnimation = requestAnimationFrame(tick);
    };
    
    // =================================================================
    // KHU VỰC 7: LOGIC NHẬN DẠNG GIỌNG NÓI & OFFLINE
    // =================================================================
    const startVoiceRecognition = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) { showToast('Trình duyệt không hỗ trợ nhận dạng giọng nói.', 'error'); return; }
        const r = new SpeechRecognition(); r.lang = 'vi-VN'; r.interimResults = false;
        allElements.micBtn.classList.add('active'); showToast('Đang lắng nghe...', 'success');
        r.onspeechend = () => r.stop();
        r.onresult = (e) => {
            let transcript = e.results[0][0].transcript;
            transcript = transcript.replace(/ /g, '').replace(/\./g, '').toUpperCase();
            allElements.searchTermInput.value = transcript;
            allElements.searchTermInput.dispatchEvent(new Event('input', { bubbles: true }));
        };
        r.onerror = () => { showToast('Lỗi nhận dạng giọng nói.', 'error'); };
        r.onend = () => { allElements.micBtn.classList.remove('active'); };
        r.start();
    };

    const getOfflineQueue = () => JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    const saveOfflineQueue = (queue) => localStorage.setItem('offlineQueue', JSON.stringify(queue));
    const addToOfflineQueue = (action) => {
        const queue = getOfflineQueue(); queue.push(action); saveOfflineQueue(queue);
        showToast('Ngoại tuyến! Hành động đã được lưu tạm.', 'error');
    };
    const syncOfflineQueue = async () => {
        const queue = getOfflineQueue(); if (queue.length === 0) return;
        showToast(`Đang đồng bộ ${queue.length} hành động...`, 'success');
        try {
            const response = await fetch(APP_CONFIG.googleScriptUrl, { method: 'POST', body: JSON.stringify({ action: 'sync', queue: queue }) });
            const result = await response.json();
            if (result.status === 'success') {
                showToast('Đồng bộ thành công!', 'success'); saveOfflineQueue([]);
                fetchVehiclesForDate(allElements.datePicker.value);
            } else { throw new Error(result.message); }
        } catch (error) { showToast(`Lỗi đồng bộ: ${error.message}`, 'error'); }
    };
    const updateOnlineStatus = () => {
        if (navigator.onLine) { allElements.offlineIndicator.style.display = 'none'; syncOfflineQueue(); } 
        else { allElements.offlineIndicator.style.display = 'flex'; }
    };

    // NÂNG CẤP: Kiểm tra cảnh báo trước khi checkout
    const checkAlertBeforeCheckout = (plate) => {
        const cleanedPlate = cleanPlateNumber(plate);
        const alertInfo = activeSecurityAlerts[cleanedPlate];
        if (alertInfo) {
            const message = `Lý do: ${alertInfo.reason || 'Không có ghi chú'}.`;
            if (alertInfo.level === 'block') {
                showToast(`KHÔNG THỂ LẤY XE! Xe ${plate} đang trong diện cảnh báo chặn. ${message}`, 'error');
                return false; // Chặn hành vi
            }
        }
        return true; // Cho phép hành vi
    };

    // MỚI: Hàm dừng hiệu ứng cảnh báo
    const stopTitleAlert = () => {
        if (titleAlertInterval) clearInterval(titleAlertInterval);
        titleAlertInterval = null;
        document.title = originalTitle;
    };

    // =================================================================
    // KHU VỰC 8: LOGIC VỊ TRÍ & KHỞI TẠO
    // =================================================================
    const updateFooterInfo = (location) => {
        if (!location) return;
        if (allElements.footerAddress) allElements.footerAddress.textContent = location.address || 'Chưa cập nhật';
        if (allElements.footerHotline) allElements.footerHotline.textContent = location.hotline || 'Chưa cập nhật';
        if (allElements.footerHours) allElements.footerHours.textContent = location.operatingHours ? `Hàng ngày: ${location.operatingHours}` : 'Chưa cập nhật';
    };

    const selectLocation = async (location) => {
        currentLocation = location; currentCapacity = location.capacity || 0;
        allElements.locationSubtitle.textContent = `Bãi đỗ xe: ${location.name}`;
        allElements.locationSelectModal.style.display = 'none';
        showToast(`Đã xác nhận bãi đỗ xe: ${location.name}`, 'success');
        updateFooterInfo(location); fetchWeather(location.lat, location.lng);
        if (!isMobileDevice() && (!confirmationWindow || confirmationWindow.closed)) {
            const url = `lookup.html?mode=kiosk&locationName=${encodeURIComponent(location.name)}`;
            confirmationWindow = await openWindowOnSecondaryScreen(url, 'KioskWindow', 'popup,width=950,height=700');
        }
        fetchVehiclesForDate(allElements.datePicker.value, false);
    };

    const showLocationSelector = (nearbyLocations) => {
        allElements.locationListContainer.innerHTML = '';
        nearbyLocations.forEach(loc => {
            const option = document.createElement('div'); option.className = 'location-option';
            const distanceText = loc.distance < 1 ? `~${(loc.distance * 1000).toFixed(0)} m` : `~${loc.distance.toFixed(1)} km`;
            option.innerHTML = `<div class="icon-wrapper"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div><div class="info"><div style="font-weight: 700;">${loc.name}</div></div><div class="distance">${distanceText}</div>`;
            option.onclick = () => selectLocation(loc);
            allElements.locationListContainer.appendChild(option);
        });
        allElements.locationSelectModal.style.display = 'flex';
    };

    const determineNearestLocation = async () => {
        const locations = typeof LOCATIONS_CONFIG !== 'undefined' ? LOCATIONS_CONFIG : [];
        if (!navigator.geolocation) { console.warn('Trình duyệt không hỗ trợ định vị.'); return; }
        try {
            const position = await new Promise((resolve, reject) => { navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }); });
            const nearbyLocations = locations.map(loc => ({ ...loc, distance: getDistance(position.coords.latitude, position.coords.longitude, loc.lat, loc.lng) }))
              .filter(loc => loc.distance < 5).sort((a, b) => a.distance - b.distance);
            if (nearbyLocations.length === 0) showToast('Không tìm thấy bãi đỗ xe nào ở gần. Sử dụng điểm mặc định.', 'error');
            else if (nearbyLocations.length === 1) selectLocation(nearbyLocations[0]);
            else {
                const distanceDifference = nearbyLocations[1].distance - nearbyLocations[0].distance;
                if (distanceDifference > 0.3) selectLocation(nearbyLocations[0]);
                else showLocationSelector(nearbyLocations);
            }
        } catch (err) {
            console.error('Lỗi định vị:', err);
            const message = err.code === 1 ? 'Vui lòng cấp quyền truy cập vị trí.' : 'Không thể xác định vị trí.';
            showToast(message, 'error');
        }
    };

    const initialize = async () => {
        resetMainForm(); updateOnlineStatus();
        const today = new Date(); if (allElements.datePicker) allElements.datePicker.value = formatDateForAPI(today);
        try {
            paymentChannel = new BroadcastChannel('parking_payment_channel');
            if (paymentChannel) paymentChannel.addEventListener('message', handlePaymentChannelMessage);
        } catch (e) { console.error("Trình duyệt không hỗ trợ BroadcastChannel.", e); }

        // MỚI: Lắng nghe các tin nhắn cảnh báo an ninh
        securityChannel.addEventListener('message', handleSecurityAlert);

        // NÂNG CẤP: Tải danh sách cảnh báo từ Google Sheets khi khởi tạo
        fetchActiveAlerts();

        if (LOCATIONS_CONFIG.length > 0) {
            currentLocation = LOCATIONS_CONFIG[0]; currentCapacity = currentLocation.capacity || 0;
            allElements.locationSubtitle.textContent = `Bãi đỗ xe: ${currentLocation.name}`;
            updateFooterInfo(currentLocation); fetchWeather(currentLocation.lat, currentLocation.lng);
            await fetchVehiclesForDate(allElements.datePicker.value, false, true);
        } else { showToast("Lỗi cấu hình: Không có bãi đỗ xe nào được định nghĩa trong locations.js", "error"); return; }
        determineNearestLocation();
        if (autoRefreshInterval) clearInterval(autoRefreshInterval);
        autoRefreshInterval = setInterval(() => {
            if (document.activeElement.tagName !== 'INPUT' && !isLoading) { fetchVehiclesForDate(allElements.datePicker.value, true); } 
        }, APP_CONFIG.autoRefreshInterval);
    };

    // =================================================================
    // KHU VỰC 9: GẮN CÁC EVENT LISTENER
    // =================================================================
    window.addEventListener('online', updateOnlineStatus); window.addEventListener('offline', updateOnlineStatus);
    if (allElements.datePicker) allElements.datePicker.addEventListener('change', () => fetchVehiclesForDate(allElements.datePicker.value));
    if (allElements.useDefaultLocationBtn) allElements.useDefaultLocationBtn.addEventListener('click', () => { selectLocation(LOCATIONS_CONFIG[0]); });
    if (allElements.checkInBtn) allElements.checkInBtn.addEventListener('click', async (e) => {
        const btn = e.target;
        try {
            btn.disabled = true; if (isLoading) return; setIsLoading(true);
            if (!currentLocation) { showToast("Chưa xác định được điểm trực. Vui lòng thử lại.", 'error'); determineNearestLocation(); return; }
            const originalPlate = allElements.searchTermInput.value.trim().toUpperCase();
            if (!originalPlate) { showToast("Biển số không hợp lệ.", 'error'); return; }
            const entryTime = new Date(), uniqueID = '_' + Math.random().toString(36).substr(2, 9) + entryTime.getTime().toString(36);
            const phone = allElements.phoneNumberInput.value.trim(), isVIP = allElements.isVipCheckbox.checked;
            const payload = { action: 'checkIn', plate: originalPlate, phone, uniqueID, locationId: currentLocation.id, isVIP: isVIP };
            syncCheckInInBackground(payload); showQrCode(originalPlate, entryTime, uniqueID);
            setIsLoading(false);
            if (paymentChannel) {
                paymentChannel.postMessage({
                    type: 'VEHICLE_CHECKIN_COMPLETE',
                    payload: {
                        licensePlate: originalPlate, timeIn: formatDateTimeForDisplay(entryTime), uniqueID: uniqueID,
                        soundText: `Đã gửi thành công xe ${originalPlate}. Vui lòng nhận vé điện tử.`
                    }
                });
            }
        } finally { setIsLoading(false); if (btn) btn.disabled = false; }
    });
    if (allElements.checkOutBtn) allElements.checkOutBtn.addEventListener('click', async (e) => {
        const btn = e.target;
        try {
            if (!currentVehicleContext || currentVehicleContext.status !== 'parking') { showToast('Vui lòng chọn một xe đang gửi để xử lý.', 'error'); return; }
            // NÂNG CẤP: Kiểm tra cảnh báo trước khi thực hiện
            if (!checkAlertBeforeCheckout(currentVehicleContext.plate)) {
                return; // Dừng lại nếu xe bị chặn
            }

            const vehicle = vehiclesOnSelectedDate.find(v => v.UniqueID === currentVehicleContext.uniqueID);
            if (!vehicle) { showToast('Không tìm thấy thông tin xe để xử lý.', 'error'); return; }
            const isVehicleVIP = vehicle.VIP === 'Có';
            const fee = calculateFee(vehicle['Entry Time'], null, isVehicleVIP);
            if (fee > 0) {
                if (isMobileDevice()) showPaymentModal();
                else {
                    if (!confirmationWindow || confirmationWindow.closed) {
                        const url = `lookup.html?mode=kiosk&locationName=${encodeURIComponent(currentLocation.name)}`;
                        confirmationWindow = await openWindowOnSecondaryScreen(url, 'KioskWindow', 'popup,width=950,height=700');
                    }
                    showPaymentModal();
                }
            } else {
                const paymentMethod = isVehicleVIP ? 'VIP' : 'Miễn phí';
                showConfirmationModal({ title: 'XÁC NHẬN CHO XE RA', plate: vehicle.Plate, reason: paymentMethod }, async () => {
                    const finalReceiptData = {
                        licensePlate: vehicle.Plate, timeIn: formatDateTimeForDisplay(vehicle['Entry Time']), timeOut: formatDateTimeForDisplay(new Date()),
                        duration: calculateDuration(vehicle['Entry Time']), paymentMethod: paymentMethod, totalAmount: '0đ'
                    };
                    const checkoutResult = await processCheckOut({ uniqueID: vehicle.UniqueID, plate: vehicle.Plate, fee: 0, paymentMethod: paymentMethod });
                    if (checkoutResult) {
                        if (paymentChannel) paymentChannel.postMessage({ type: 'CHECKOUT_COMPLETE', payload: finalReceiptData });
                        showToast(`Đã cho xe ${vehicle.Plate} ra (Miễn phí).`, 'success'); 
                        resetMainForm(); allElements.searchTermInput.value = '';
                        await fetchVehiclesForDate(allElements.datePicker.value);
                    }
                });
            }
        } finally { if (btn) btn.disabled = false; }
    });
    if (allElements.vipCheckboxContainer) allElements.vipCheckboxContainer.addEventListener('click', (e) => { if(e.target.tagName !== 'INPUT') allElements.isVipCheckbox.checked = !allElements.isVipCheckbox.checked; });
    if (allElements.closePaymentModalBtn) allElements.closePaymentModalBtn.addEventListener('click', () => { allElements.paymentModal.style.display = 'none'; });
    if (allElements.completePaymentBtn) allElements.completePaymentBtn.addEventListener('click', completePayment);

    const generateAndShowQR = () => {
        const fee = parseFloat(allElements.paymentAmountDisplay.textContent.replace(/\./g, '')) || 0;
        const paymentInfoText = allElements.paymentMemoDisplay.textContent;
        if (!paymentInfoText || paymentInfoText === '--') { showToast('Lỗi: Không có thông tin thanh toán.', 'error'); return; }
        allElements.paymentQrcodeImage.style.display = 'none';
        allElements.qrSpinner.style.display = 'block';
        const encodedMemo = encodeURIComponent(paymentInfoText);
        const qrImageUrl = `${APP_CONFIG.payment.imageUrlBase}&amount=${fee}&addInfo=${encodedMemo}`;
        allElements.paymentQrcodeImage.src = qrImageUrl;
        allElements.paymentQrcodeImage.onload = () => {
            allElements.qrSpinner.style.display = 'none';
            allElements.paymentQrcodeImage.style.display = 'block';
            // SỬA LỖI: Gửi URL của mã QR đến màn hình phụ
            if (paymentChannel) paymentChannel.postMessage({ type: 'QR_CODE_GENERATED', payload: { qrImageUrl: qrImageUrl } });
        };
        allElements.paymentQrcodeImage.onerror = () => {
            allElements.qrSpinner.style.display = 'none';
            showToast('Không thể tải ảnh QR. Vui lòng kiểm tra mạng.', 'error');
        };
    };
    
    if (allElements.selectQrBtn) allElements.selectQrBtn.addEventListener('click', () => {
        allElements.selectQrBtn.classList.add('active');
        allElements.selectCashBtn.classList.remove('active');
        const qrWrapper = document.getElementById('payment-qrcode-wrapper');
        if (qrWrapper) qrWrapper.style.display = 'flex';
        generateAndShowQR();
        allElements.completePaymentBtn.disabled = false;
    });
    
    if (allElements.selectCashBtn) allElements.selectCashBtn.addEventListener('click', () => {
        allElements.selectCashBtn.classList.add('active');
        allElements.selectQrBtn.classList.remove('active');
        const qrWrapper = document.getElementById('payment-qrcode-wrapper');
        if (qrWrapper) qrWrapper.style.display = 'none';
        allElements.completePaymentBtn.disabled = false;
    });

    const createInitialDataForConfirmation = (vehicle, qrImageUrl, paymentMemo) => {
        if (!vehicle) return null;
        const isVehicleVIP = vehicle.VIP === 'Có';
        const duration = calculateDuration(vehicle['Entry Time']);
        const fee = calculateFee(vehicle['Entry Time'], null, isVehicleVIP);
        const location = LOCATIONS_CONFIG.find(loc => loc.id === vehicle.LocationID);
        const locationName = location ? location.name : 'Không xác định';
        return {
            licensePlate: vehicle.Plate, timeIn: formatDateTimeForDisplay(vehicle['Entry Time']),
            totalAmount: `${fee.toLocaleString('vi-VN')}đ`, qrImageUrl: qrImageUrl, duration: duration,
            paymentMemo: paymentMemo, locationName: locationName, lat: location ? location.lat : null, lng: location ? location.lng : null
        };
    };

    if (allElements.printReceiptBtn) allElements.printReceiptBtn.addEventListener('click', () => window.print());
    if (allElements.searchTermInput) allElements.searchTermInput.addEventListener('input', () => {
        const plate = cleanPlateNumber(allElements.searchTermInput.value);
        if (plate.length >= 6) { updateUIFromCache(plate); } else { resetMainForm(); }
    });
    if (allElements.cancelConfirmationBtn) allElements.cancelConfirmationBtn.addEventListener('click', () => { allElements.confirmationModal.style.display = 'none'; });
    if (allElements.filterInput) allElements.filterInput.addEventListener('input', filterVehicleList);
    if (allElements.micBtn) allElements.micBtn.addEventListener('click', startVoiceRecognition);
    if (allElements.scanQrBtn) allElements.scanQrBtn.addEventListener('click', openQrScanner);
    if (allElements.closeQrcodeBtn) allElements.closeQrcodeBtn.addEventListener('click', closeQrCode);
    if (allElements.closeScannerBtn) allElements.closeScannerBtn.addEventListener('click', closeQrScanner);
    // MỚI: Gắn sự kiện cho nút "Đã rõ" trên modal cảnh báo
    if (allElements.acknowledgeAlertBtn) allElements.acknowledgeAlertBtn.addEventListener('click', () => { 
        allElements.securityAlertModal.style.display = 'none'; 
        stopTitleAlert(); // Dừng hiệu ứng nhấp nháy tiêu đề
    });

    
    if (allElements.vehicleListContainer) {
        allElements.vehicleListContainer.addEventListener('click', (e) => {
            const item = e.target.closest('.vehicle-item');
            if (item && item.dataset.plate) { allElements.searchTermInput.value = item.dataset.plate; updateUIFromCache(cleanPlateNumber(item.dataset.plate)); }
        });
    }

    const updateClock = () => {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0'), minutes = String(now.getMinutes()).padStart(2, '0'), seconds = String(now.getSeconds()).padStart(2, '0');
        if (document.getElementById('clock-widget')) document.getElementById('clock-display').textContent = `${hours}:${minutes}:${seconds}`;
    };

    const fetchWeather = async (lat, lon) => {
        const apiKey = APP_CONFIG.weather?.apiKey;
        if (!apiKey || apiKey === "YOUR_OPENWEATHERMAP_API_KEY") { document.getElementById('weather-desc').textContent = 'Chưa cấu hình API'; return; }
        try {
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=vi`;
            const response = await fetch(url);
            if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.message || `Lỗi HTTP: ${response.status}`); }
            const data = await response.json();
            if (!data.weather || data.weather.length === 0) throw new Error("Dữ liệu thời tiết không hợp lệ.");
            document.getElementById('weather-icon').src = `https://openweathermap.org/img/wn/${data.weather[0].icon}.png`;
            document.getElementById('weather-icon').style.display = 'inline';
            document.getElementById('weather-temp').textContent = `${Math.round(data.main.temp)}°C`;
            document.getElementById('weather-desc').textContent = data.weather[0].description.charAt(0).toUpperCase() + data.weather[0].description.slice(1);
        } catch (error) {
            console.error("Lỗi tải thời tiết:", error);
            document.getElementById('weather-desc').textContent = 'Lỗi thời tiết';
        }
    };

    setInterval(updateClock, 1000);
    initialize();
});
