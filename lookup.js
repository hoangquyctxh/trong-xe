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

    /**
     * NÂNG CẤP: Giải mã thông tin từ biển số xe.
     * @param {string} plate - Chuỗi biển số xe.
     * @returns {string} - Chuỗi mô tả thông tin đã giải mã.
     */
    const decodePlateNumber = (plate) => {
        if (!plate || typeof plate !== 'string' || typeof PLATE_DATA === 'undefined') return 'Chưa có thông tin';

        const cleanedPlate = cleanPlateNumber(plate);

        // --- BƯỚC 1: Ưu tiên quét các sê-ri đặc biệt (NG, NN, KT, CD...) trong toàn bộ biển số ---
        for (const series in PLATE_DATA.specialSeries) {
            if (cleanedPlate.includes(series)) {
                // Xử lý chi tiết biển ngoại giao (NG)
                if (series === 'NG') {
                    const diplomaticCode = parseInt(cleanedPlate.replace('NG', '').substring(0, 3), 10);
                    if (!isNaN(diplomaticCode)) {
                        for (const range in PLATE_DATA.diplomaticSeries) {
                            if (range.includes('-')) {
                                const [start, end] = range.split('-').map(Number);
                                if (diplomaticCode >= start && diplomaticCode <= end) {
                                    return PLATE_DATA.diplomaticSeries[range];
                                }
                            } else if (diplomaticCode === parseInt(range, 10)) {
                                return PLATE_DATA.diplomaticSeries[range];
                            }
                        }
                    }
                    return "Xe của cơ quan đại diện ngoại giao"; // Fallback
                }
                return PLATE_DATA.specialSeries[series]; // Trả về cho các loại đặc biệt khác
            }
        }

        // --- BƯỚC 2: Phân tích biển số dân sự để phân biệt Ô tô / Xe máy dựa trên độ dài và cấu trúc ---
        let provinceCode = '';
        let vehicleType = 'Chưa xác định';

        // Biển 5 số: 9 ký tự là xe máy, 8 ký tự là ô tô.
        if (cleanedPlate.length === 9 && /^[0-9]{2}/.test(cleanedPlate)) {
            provinceCode = cleanedPlate.substring(0, 2);
            vehicleType = 'Xe máy';
        } else if (cleanedPlate.length === 8 && /^[0-9]{2}/.test(cleanedPlate)) {
            provinceCode = cleanedPlate.substring(0, 2);
            vehicleType = 'Ô tô';
        }

        if (!provinceCode) return 'Biển số không xác định';

        const provinceInfo = PLATE_DATA.provinces.find(p => p.codes.includes(provinceCode));
        const provinceName = provinceInfo ? provinceInfo.name : 'Tỉnh không xác định';
        
        return `${provinceName} - ${vehicleType}`;
    };

    /**
     * SỬA LỖI: Bổ sung hàm chuyển đổi số thành chữ tiếng Việt.
     * Hàm này được đồng bộ từ code.gs để đảm bảo tính nhất quán.
     */
    const numberToVietnameseWords = (num) => {
        const units = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
        const teens = ['', 'mười', 'hai mươi', 'ba mươi', 'bốn mươi', 'năm mươi', 'sáu mươi', 'bảy mươi', 'tám mươi', 'chín mươi'];
        const hundreds = ['', 'một trăm', 'hai trăm', 'ba trăm', 'bốn trăm', 'năm trăm', 'sáu trăm', 'bảy trăm', 'tám trăm', 'chín trăm'];
        const thousands = ['', 'nghìn', 'triệu', 'tỷ'];

        if (num === 0) return 'Không';

        let s = num.toString();
        let result = '';
        let i = 0;

        while (s.length > 0) {
            let chunk = parseInt(s.slice(-3));
            s = s.slice(0, -3);

            if (chunk === 0 && s.length > 0) {
                i++;
                continue;
            }

            let chunkWords = '';
            let h = Math.floor(chunk / 100);
            let t = Math.floor((chunk % 100) / 10);
            let u = chunk % 10;

            if (h > 0) chunkWords += units[h] + ' trăm ';
            if (t > 1) {
                chunkWords += teens[t] + ' ';
                if (u === 1) chunkWords += 'mốt';
                else if (u > 0) chunkWords += units[u];
            } else if (t === 1) {
                chunkWords += 'mười ';
                if (u > 0) chunkWords += units[u];
            } else if (u > 0 && (h > 0 || s.length > 0)) chunkWords += 'lẻ ' + units[u];
            else if (u > 0) chunkWords += units[u];
            if (chunkWords.trim() !== '') result = chunkWords.trim() + ' ' + thousands[i] + ' ' + result;
            i++;
        }
        let finalResult = result.trim().replace(/\s+/g, ' ');
        return finalResult.charAt(0).toUpperCase() + finalResult.slice(1);
    }

    /**
     * NÂNG CẤP: Tính toán chi tiết phí theo giờ ngày/đêm.
     * Logic này được đồng bộ từ file code.gs để đảm bảo tính nhất quán.
     * @param {Date} startTime - Thời gian bắt đầu.
     * @param {Date} endTime - Thời gian kết thúc.
     * @param {boolean} isVIP - Xe có phải là VIP hay không.
     * @returns {object} - { totalFee, dayHours, nightHours }
     */
    const calculateFeeWithBreakdown = (startTime, endTime, isVIP) => {
        if (isVIP) return { totalFee: 0, dayHours: 0, nightHours: 0 };
        if (!startTime) return { totalFee: 0, dayHours: 0, nightHours: 0 };

        const config = APP_CONFIG.fee;
        const start = new Date(startTime);
        const end = endTime ? new Date(endTime) : new Date();
        const diffMinutes = Math.floor((end - start) / (1000 * 60));

        if (diffMinutes <= config.freeMinutes) {
            return { totalFee: 0, dayHours: 0, nightHours: 0 };
        }

        let totalFee = 0;
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
                // GIẢI PHÁP MỚI: Tạo URL đến trang receipt_viewer.html với đầy đủ tham số.
                const fee = tx.Fee || 0;
                const exitTime = new Date(tx['Exit Time']);
                const entryTime = new Date(tx['Entry Time']);
                const feeDetails = calculateFeeWithBreakdown(entryTime, exitTime, tx.VIP === 'Có');
                
                const params = new URLSearchParams({
                    orgName: 'ĐOÀN TNCS HỒ CHÍ MINH PHƯỜNG BA ĐÌNH',
                    orgAddress: '68 Nguyễn Thái Học, Phường Ba Đình, Thành phố Hà Nội',
                    taxId: '0123456789',
                    orgHotline: 'Đang cập nhật',
                    exitDate: exitTime.getDate(),
                    exitMonth: exitTime.getMonth() + 1,
                    exitYear: exitTime.getFullYear(),
                    uniqueID: tx.UniqueID,
                    plate: tx.Plate,
                    vehicleType: decodePlateNumber(tx.Plate), // SỬA LỖI: Sử dụng hàm nhận dạng
                    entryTimeDisplay: formatDateTime(tx['Entry Time']),
                    exitTimeDisplay: formatDateTime(tx['Exit Time']),
                    duration: calculateDuration(tx['Entry Time'], tx['Exit Time']),
                    feeDisplay: fee.toLocaleString('vi-VN'),
                    feeInWords: numberToVietnameseWords(fee), // SỬA LỖI: Thêm số tiền bằng chữ
                    // THÊM DỮ LIỆU CHI TIẾT PHÍ
                    dayHours: feeDetails.dayHours,
                    nightHours: feeDetails.nightHours,
                    dayRateFormatted: APP_CONFIG.fee.dayRate.toLocaleString('vi-VN') + 'đ',
                    nightRateFormatted: APP_CONFIG.fee.nightRate.toLocaleString('vi-VN') + 'đ',
                    paymentMethod: tx['PaymentMethod'] || 'N/A', // SỬA LỖI: Đọc đúng tên trường dữ liệu
                });
                const receiptUrl = `receipt_viewer.html?${params.toString()}`;
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