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
        downloadAllBtn: document.getElementById('download-all-btn'),
    };

    // Bỏ qua các dòng code thừa ở cuối file
    const lastChild = document.body.lastChild;
    if (lastChild && lastChild.nodeType === Node.TEXT_NODE && lastChild.textContent.trim().startsWith('const url')) {
        document.body.removeChild(lastChild);
    }
    let cameraStream = null;
    let scanAnimation = null;
    // GIẢI PHÁP HOÀN THIỆN: Lưu trữ dữ liệu xe trong ngày để tra cứu chéo
    let vehiclesToday = []; 

    // --- UI Functions ---
    const showMessage = (message, isError = false) => {
        // CẢI TIẾN: Không ẩn hoàn toàn khu vực kết quả, chỉ ẩn danh sách
        elements.resultsSection.style.display = 'none'; // Ẩn kết quả cũ
        elements.searchSection.style.display = 'block'; // Đảm bảo ô tìm kiếm hiển thị
        elements.messageBox.style.display = 'block';
        elements.messageBox.innerHTML = `<p style="font-weight: bold; ${isError ? 'color: #c62828;' : ''}">${message}</p>`;
    };

    const showLoading = () => {
        elements.resultsSection.style.display = 'none';
        elements.messageBox.style.display = 'flex'; // Sửa lại để căn giữa tốt hơn
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
     * MỚI: Lấy tên bãi xe từ LocationID.
     * @param {string} locationId - ID của bãi xe (ví dụ: 'VHVANXUAN').
     * @returns {string} - Tên đầy đủ của bãi xe.
     */
    const getLocationName = (locationId) => {
        if (typeof LOCATIONS_CONFIG !== 'undefined' && Array.isArray(LOCATIONS_CONFIG)) {
            const location = LOCATIONS_CONFIG.find(loc => loc.id === locationId);
            return location ? location.name : (locationId || '--');
        }
        return locationId || '--';
    };
    // THÊM: Hàm tính phí, đồng bộ từ main.js để xác định chính xác phí 0đ
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

    /**
     * MỚI: Chuyển đổi số thành chữ tiếng Việt.
     * @param {number} num - Số cần chuyển đổi.
     * @returns {string} - Chuỗi chữ tiếng Việt.
     */
    const numberToWords = (num) => {
        // SỬA LỖI: Thay thế bằng hàm chuyển đổi số sang chữ tiếng Việt hoàn chỉnh hơn.
        const units = ["", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
        const teens = ["mười", "mười một", "mười hai", "mười ba", "mười bốn", "mười lăm", "mười sáu", "mười bảy", "mười tám", "mười chín"];
        const tens = ["", "mười", "hai mươi", "ba mươi", "bốn mươi", "năm mươi", "sáu mươi", "bảy mươi", "tám mươi", "chín mươi"];
        const thousands = ["", "nghìn", "triệu", "tỷ"];

        if (num === 0) return 'Không';
        if (num < 0) return "Âm " + numberToWords(Math.abs(num));

        let word = '';
        let i = 0;

        while (num > 0) {
            let chunk = num % 1000;
            if (chunk > 0) {
                let chunkWord = '';
                const hundred = Math.floor(chunk / 100);
                const remainder = chunk % 100;

                if (hundred > 0) {
                    chunkWord += units[hundred] + ' trăm';
                }

                if (remainder > 0) {
                    if (hundred > 0) chunkWord += ' ';
                    if (remainder < 10) {
                        if (hundred > 0 && remainder > 0) chunkWord += 'linh ';
                        chunkWord += units[remainder];
                    } else if (remainder < 20) {
                        chunkWord += teens[remainder - 10];
                    } else {
                        const ten = Math.floor(remainder / 10);
                        const one = remainder % 10;
                        chunkWord += tens[ten];
                        if (one > 0) {
                            chunkWord += (one === 1 && ten > 1) ? ' mốt' : ' ' + units[one];
                        }
                    }
                }
                if (thousands[i]) {
                    word = chunkWord + ' ' + thousands[i] + ' ' + word;
                } else {
                    word = chunkWord + ' ' + word;
                }
            }
            num = Math.floor(num / 1000);
            i++;
        }

        let finalWord = word.trim();
        return finalWord.charAt(0).toUpperCase() + finalWord.slice(1);
    };
    
    // =================================================================================
    // GIẢI PHÁP DỨT ĐIỂM: SỬ DỤNG IFRAME PROXY ĐỂ VƯỢT QUA LỖI CORS
    // =================================================================================
    let currentActionParams = null;
    const pendingRequests = {};
    let proxyIframe;
    let isProxyLoaded = false; // Cờ để đảm bảo iframe đã tải xong

    // Khởi tạo iframe proxy một lần duy nhất
    const initProxy = () => {
        if (proxyIframe) return; // Đảm bảo chỉ khởi tạo một lần

        proxyIframe = document.createElement('iframe');
        proxyIframe.src = 'proxy.html';
        proxyIframe.style.display = 'none'; // Ẩn iframe
        document.body.appendChild(proxyIframe);

        proxyIframe.onload = () => {
            isProxyLoaded = true;
            console.log("Proxy iframe loaded.");
        };

        // Lắng nghe tin nhắn từ iframe proxy
        window.addEventListener('message', (event) => {
            // Đảm bảo tin nhắn đến từ iframe proxy của chúng ta
            if (event.source !== proxyIframe.contentWindow) {
                return;
            }

            const { requestId, status, data, error } = event.data;
            if (pendingRequests[requestId]) {
                if (status === 'success') {
                    pendingRequests[requestId].resolve(data);
                } else {
                    pendingRequests[requestId].reject(new Error(error));
                }
                delete pendingRequests[requestId];
            }
        });
    };

    // Hàm gửi yêu cầu qua iframe proxy
    const fetchViaProxy = (params) => {
        return new Promise((resolve, reject) => {
            const requestId = 'req_' + Date.now() + Math.random();
            pendingRequests[requestId] = { resolve, reject };

            const sendRequest = () => {
                if (isProxyLoaded && proxyIframe && proxyIframe.contentWindow) {
                    const url = new URL(APP_CONFIG.googleScriptUrl);
                    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
                    // Gửi tin nhắn đến iframe proxy
                    proxyIframe.contentWindow.postMessage({ requestId, url: url.toString() }, '*'); // Sử dụng '*' cho file://
                } else {
                    // Nếu iframe chưa sẵn sàng, thử lại sau một khoảng thời gian ngắn
                    setTimeout(sendRequest, 50);
                }
            };

            sendRequest(); // Bắt đầu gửi yêu cầu

            // Thiết lập timeout cho yêu cầu
            setTimeout(() => {
                if (pendingRequests[requestId]) {
                    reject(new Error('Yêu cầu hết hạn. Proxy không phản hồi.'));
                    delete pendingRequests[requestId];
                }
            }, 15000); // Timeout 15 giây
        });
    };

    const fetchVehiclesToday = async () => {
        try {
            const params = { action: 'getVehicles', date: new Date().toISOString().slice(0, 10), v: new Date().getTime() };
            const result = await fetchViaProxy(params);
            if (result.status === 'success') {
                vehiclesToday = result.data || [];
            } else {
                console.error("Lỗi tải danh sách xe trong ngày:", result.message);
            }
        } catch (error) {
            console.error("Lỗi tải danh sách xe trong ngày:", error);
        }
    };

    /**
     * NÂNG CẤP: Hàm tìm kiếm đa năng, xử lý cả UniqueID, Biển số và SĐT.
     * Đây là giải pháp cốt lõi để sửa lỗi "Không tìm thấy".
     * @param {string} searchTerm - Nội dung cần tìm kiếm.
     * @param {string[]} methods - Các phương thức tìm kiếm cần thử, theo thứ tự ưu tiên.
     */
    const universalSearch = async (searchTerm, methods = ['uniqueID', 'plate', 'phone']) => {
        if (!methods || methods.length === 0) {
            showMessage('Không tìm thấy kết quả phù hợp.', true);
            return;
        }

        showLoading();
        const methodToTry = methods[0];
        const remainingMethods = methods.slice(1);
        let params = {};

        switch (methodToTry) {
            case 'uniqueID':
                params = { action: 'getVehicleHistoryByUniqueID', uniqueID: searchTerm };
                break;
            case 'plate':
                params = { action: 'getVehicleHistoryByPlate', plate: searchTerm };
                break;
            case 'phone':
                // Chỉ thử tìm theo SĐT nếu searchTerm là số
                if (!/^\d+$/.test(searchTerm)) {
                    universalSearch(searchTerm, remainingMethods); // Bỏ qua và thử cách tiếp theo
                    return;
                }
                params = { action: 'getVehicleHistoryByPhone', phone: searchTerm };
                break;
            default:
                universalSearch(searchTerm, remainingMethods); // Bỏ qua phương thức không hợp lệ
                return;
        }

        try {
            const result = await fetchViaProxy(params);
            // Nếu tìm thấy kết quả (dù là mảng rỗng nhưng status là success) và có dữ liệu
            // NÂNG CẤP: Kiểm tra kỹ hơn, đảm bảo kết quả trả về thực sự chứa thông tin đang tìm kiếm
            let foundMatch = false;
            if (result.status === 'success' && result.data && result.data.length > 0) {
                if (methodToTry === 'uniqueID') {
                    foundMatch = result.data.some(tx => tx.UniqueID === searchTerm);
                } else { foundMatch = true; } // Với các phương thức khác, chỉ cần có data là đủ
            }
            if (foundMatch) {
                renderHistory(result.data, searchTerm);
            } else {
                // Nếu không có kết quả, thử phương thức tiếp theo
                universalSearch(searchTerm, remainingMethods);
            }
        } catch (error) {
            // Nếu có lỗi mạng hoặc lỗi server, thử phương thức tiếp theo
            console.error(`Lỗi khi tìm bằng ${methodToTry}:`, error);
            universalSearch(searchTerm, remainingMethods);
        }
    };

    /**
     * MỚI: Hàm tạo và hiển thị một tab mới chứa biên lai tổng hợp.
     */
    const handleViewAllReceipts = () => {
        const plate = elements.plateDisplay.textContent;
        if (!plate || !currentHistory || currentHistory.length === 0) {
            showMessage('Không có dữ liệu lịch sử để xuất file.', true);
            return;
        }

        const btn = elements.downloadAllBtn;
        btn.disabled = true;
        btn.textContent = 'Đang tạo biên lai...';

        const newWindow = window.open('', '_blank');
        if (!newWindow) {
            showMessage('Trình duyệt đã chặn cửa sổ bật lên. Vui lòng cho phép cửa sổ bật lên để xem biên lai.', true);
            btn.disabled = false;
            btn.textContent = 'Xem & In tất cả biên lai';
            return;
        }

        // Sắp xếp lại lịch sử từ cũ nhất đến mới nhất để hiển thị theo đúng thứ tự
        const sortedHistory = [...currentHistory].sort((a, b) => new Date(a['Entry Time']) - new Date(b['Entry Time']));
        const totalFee = sortedHistory.reduce((sum, tx) => sum + (tx.Fee || 0), 0);
        
        // THÊM: Tính toán tổng số giờ ngày/đêm cho tất cả các giao dịch
        let totalDayHours = 0;
        let totalNightHours = 0;

        // Tạo các dòng chi tiết cho bảng dịch vụ
        let serviceRowsHtml = '';
        sortedHistory.forEach((tx, index) => {
            const isVehicleVIP = tx.VIP === 'Có';
            const calculatedFee = calculateFee(tx['Entry Time'], tx['Exit Time'], isVehicleVIP);
            
            // THÊM: Tính toán và cộng dồn giờ cho từng giao dịch
            const feeDetails = calculateFeeWithBreakdown(new Date(tx['Entry Time']), new Date(tx['Exit Time']), isVehicleVIP);
            totalDayHours += feeDetails.dayHours;
            totalNightHours += feeDetails.nightHours;

            let noteHtml = '';

            // THÊM: Tạo dòng ghi chú chi tiết cho các trường hợp miễn phí
            if (isVehicleVIP) {
                noteHtml = `<tr class="note-row"><td colspan="6"><em>Ghi chú: Miễn phí theo chính sách dành cho khách mời/xe ưu tiên.</em></td></tr>`;
            } else if (calculatedFee === 0 && (tx.Fee || 0) === 0) {
                noteHtml = `<tr class="note-row"><td colspan="6"><em>Ghi chú: Miễn phí do thời gian gửi xe dưới ${APP_CONFIG.fee.freeMinutes} phút.</em></td></tr>`;
            }

            serviceRowsHtml += `
                <tr>
                    <td>${index + 1}</td>
                    <td>
                        Phí trông giữ xe
                        <div style="font-size: 0.9em; color: #777;">Bãi xe: ${getLocationName(tx.LocationID)}<br>Vào: ${formatDateTime(tx['Entry Time'])} - Ra: ${formatDateTime(tx['Exit Time'])}<br>Mã GD: ${tx.UniqueID}</div>
                    </td>
                    <td>Lượt</td>
                    <td>1</td>
                    <td class="text-right">${(tx.Fee || 0).toLocaleString('vi-VN')}</td>
                    <td class="text-right">${(tx.Fee || 0).toLocaleString('vi-VN')}</td>
                </tr>
                ${noteHtml}
            `; // Chèn dòng ghi chú ngay sau dòng giao dịch tương ứng
        });

        // THÊM: Tạo HTML cho bảng diễn giải phí tổng hợp
        let feeBreakdownHtml = '';
        if (totalDayHours > 0 || totalNightHours > 0) {
            feeBreakdownHtml = `
                <div class="section-title">Diễn giải cách tính phí tổng hợp</div>
                <table>
                    <thead><tr><th>Loại giờ</th><th>Tổng số giờ</th><th>Đơn giá (giờ)</th></tr></thead>
                    <tbody>
                        <tr><td>Giờ ban ngày</td><td>${totalDayHours}</td><td>${APP_CONFIG.fee.dayRate.toLocaleString('vi-VN')}đ</td></tr>
                        <tr><td>Giờ ban đêm</td><td>${totalNightHours}</td><td>${APP_CONFIG.fee.nightRate.toLocaleString('vi-VN')}đ</td></tr>
                    </tbody>
                </table>`;
        }

        let combinedHtml = `
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8"> 
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>BIÊN LAI THU TIỀN DỊCH VỤ - ${plate}</title>
                <script src="config.js"><\/script>
                <style>
                    /* SỬA LỖI: Nhúng trực tiếp CSS từ receipt_viewer.css vào đây */
                    body { font-family: 'Arial', sans-serif; margin: 0; padding: 20px; color: #333; font-size: 12px; display: flex; flex-direction: column; align-items: center; background-color: #e9ebee; }
                    /* THÊM: Style cho dòng ghi chú */
                    .note-row td {
                        padding: 4px 8px;
                        background-color: #f9f9f9;
                        font-size: 0.9em;
                        color: #555;
                        border-top: none;
                    }
                    .container { width: 100%; max-width: 700px; border: 1px solid #ccc; padding: 20px; box-shadow: 0 0 10px rgba(0,0,0,0.1); background-color: white; }
                    .header { text-align: center; margin-bottom: 20px; }
                    .header img { width: 60px; height: auto; margin-bottom: 10px; }
                    .header h1 { margin: 0; font-size: 18px; color: #0d47a1; text-transform: uppercase; }
                    .header p { margin: 2px 0; font-size: 10px; }
                    .title { text-align: center; font-size: 22px; font-weight: bold; margin: 20px 0; color: #0d47a1; }
                    .invoice-info { display: flex; justify-content: space-between; margin-bottom: 15px; }
                    .invoice-info div { width: 48%; }
                    .invoice-info p { margin: 2px 0; }
                    .section-title { font-weight: bold; margin-top: 15px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                    table th, table td { border: 1px solid #eee; padding: 8px; text-align: left; }
                    table th { background-color: #f5f5f5; font-weight: bold; }
                    .total-row td { font-weight: bold; background-color: #f5f5f5; }
                    .footer { margin-top: 30px; display: flex; justify-content: space-around; text-align: center; }
                    .footer div { width: 45%; }
                    .footer p { margin: 5px 0; }
                    .text-right { text-align: right; }
                    .text-center { text-align: center; }
                    .actions { text-align: center; padding: 20px; background-color: white; border: 1px solid #ccc; border-top: none; max-width: 700px; width: 100%; }
                    .btn-action { background-image: linear-gradient(to bottom, #1565c0, #0d47a1); color: white; border: none; padding: 12px 25px; font-size: 1rem; font-weight: bold; cursor: pointer; }
                    .btn-action:disabled { background: #ccc; cursor: not-allowed; }
                    @media print {
                        body { background-color: white; }
                        .container { margin: 0; max-width: 100%; box-shadow: none; border: none; }
                    }
                </style>
            </head>
            <body>
                <div class="container" id="receipt-container">
                    <div class="header">
                        <img src="https://cdn.haitrieu.com/wp-content/uploads/2021/11/Logo-Doan-Thanh-NIen-Cong-San-Ho-Chi-Minh-1.png" alt="Logo">
                        <h1 id="orgName">ĐOÀN TNCS HỒ CHÍ MINH PHƯỜNG BA ĐÌNH</h1>
                        <p id="orgAddress">68 Nguyễn Thái Học, Phường Ba Đình, Thành phố Hà Nội</p>
                        <p><span id="taxId">Mã số thuế: 0123456789</span> | <span id="orgHotline">Hotline: Đang cập nhật</span></p>
                    </div>
                    <h2 class="title">BIÊN LAI THU TIỀN DỊCH VỤ</h2>
                    <p class="text-center" id="receiptDate">Ngày ${new Date().toLocaleDateString('vi-VN')}</p>
                    <div class="invoice-info">
                        <div>
                            <p><strong>Biển số xe:</strong> <span id="plate">${plate}</span></p>
                            <p><strong>Loại xe:</strong> <span id="vehicleType">${decodePlateNumber(plate)}</span></p>
                        </div>
                        <div class="text-right">
                            <p><strong>Tổng số lượt gửi:</strong> <span id="duration">${sortedHistory.length}</span></p>
                        </div>
                    </div>
                    <div class="section-title">Chi tiết các lần gửi xe</div>
                    <table>
                        <thead><tr><th>STT</th><th>Nội dung</th><th>Đơn vị</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
                        <tbody>
                            ${serviceRowsHtml}
                            <tr class="total-row">
                                <td colspan="5" class="text-right">Tổng cộng:</td>
                                <td class="text-right">${totalFee.toLocaleString('vi-VN')}</td>
                            </tr>
                        </tbody>
                    </table>
                    ${feeBreakdownHtml} <!-- Chèn bảng diễn giải vào đây -->
                    <p><strong>Số tiền bằng chữ:</strong> <span id="feeInWords">${numberToWords(totalFee)}</span> đồng.</p>
                    <div class="footer">
                        <div><p><strong>Người nộp tiền</strong></p><p>(Ký, ghi rõ họ tên)</p></div>
                        <div><p><strong>Người thu tiền</strong></p><p>(Ký, ghi rõ họ tên)</p><p style="margin-top: 50px;" id="footerOrgName">ĐOÀN TNCS HỒ CHÍ MINH PHƯỜNG BA ĐÌNH</p></div>
                    </div>
                    <p class="text-center" style="margin-top: 20px; font-size: 10px;">Cảm ơn Quý khách đã sử dụng dịch vụ!</p>
                </div>
                <div class="actions">
                    <button onclick="window.print()" class="btn-action">In / Lưu PDF</button>
                </div>
            </body>
            </html>
        `;

        newWindow.document.write(combinedHtml);
        newWindow.document.close();

        btn.disabled = false;
        btn.textContent = 'Xem & In tất cả biên lai';
    };

    let currentHistory = []; // Biến để lưu trữ lịch sử hiện tại
    const renderHistory = (history, searchTerm) => {
        if (!history || history.length === 0) {
            showMessage('Không tìm thấy lịch sử cho xe này.', true);
            return;
        }

        history.sort((a, b) => new Date(b['Entry Time']) - new Date(a['Entry Time']));
        currentHistory = history; // Lưu lại lịch sử để dùng cho việc tải PDF

        const plateToDisplay = history[0]?.Plate || searchTerm;
        elements.plateDisplay.textContent = plateToDisplay;
        elements.historyContainer.innerHTML = '';
        elements.messageBox.style.display = 'none';
        elements.resultsSection.style.display = 'block';

        // CẢI TIẾN: Hiển thị nút "Tải tất cả biên lai" nếu có nhiều hơn 1 giao dịch
        if (history.length > 1) {
            elements.downloadAllBtn.style.display = 'inline-block';
        } else {
            elements.downloadAllBtn.style.display = 'none';
        }

        history.forEach(tx => {
            const card = document.createElement('div');
            card.className = 'history-card';
            const isDeparted = tx.Status !== 'Đang gửi';
            const statusClass = isDeparted ? 'departed' : 'parking';

            let receiptActionHtml = '';
            if (isDeparted) {
                const fee = tx.Fee || 0;
                const exitTime = new Date(tx['Exit Time']);
                const entryTime = new Date(tx['Entry Time']);
                const feeDetails = calculateFeeWithBreakdown(entryTime, exitTime, tx.VIP === 'Có');

                // SỬA LỖI: Xác định chính xác paymentMethod để hiển thị phụ chú
                let actualPaymentMethod = tx['Payment Method'] || 'N/A';
                const isVehicleVIP = tx.VIP === 'Có';
                const calculatedFee = calculateFee(tx['Entry Time'], tx['Exit Time'], isVehicleVIP);

                if (isVehicleVIP) {
                    actualPaymentMethod = 'VIP';
                } else if (calculatedFee === 0) {
                    actualPaymentMethod = 'Miễn phí';
                }
                
                const receiptParams = new URLSearchParams({
                    orgName: 'ĐOÀN TNCS HỒ CHÍ MINH PHƯỜNG BA ĐÌNH', orgAddress: '68 Nguyễn Thái Học, Phường Ba Đình, Thành phố Hà Nội',
                    taxId: '0123456789', orgHotline: 'Đang cập nhật',
                    exitDate: exitTime.getDate(), exitMonth: exitTime.getMonth() + 1, exitYear: exitTime.getFullYear(),
                    uniqueID: tx.UniqueID, plate: tx.Plate, vehicleType: decodePlateNumber(tx.Plate),
                    entryTimeDisplay: formatDateTime(tx['Entry Time']), exitTimeDisplay: formatDateTime(tx['Exit Time']),
                    duration: calculateDuration(tx['Entry Time'], tx['Exit Time']), feeDisplay: fee.toLocaleString('vi-VN'),
                    feeInWords: numberToWords(fee), dayHours: feeDetails.dayHours, nightHours: feeDetails.nightHours,
                    dayRateFormatted: APP_CONFIG.fee.dayRate.toLocaleString('vi-VN') + 'đ', nightRateFormatted: APP_CONFIG.fee.nightRate.toLocaleString('vi-VN') + 'đ',
                    paymentMethod: actualPaymentMethod,
                    freeMinutes: APP_CONFIG.fee.freeMinutes,
                });
                receiptActionHtml = `<div class="receipt-action"><a href="receipt_viewer.html?${receiptParams.toString()}" target="_blank" class="btn-print">Xem & Tải biên lai</a></div>`;
            }

            card.innerHTML = `<div class="history-card-header"><span class="date">${new Date(tx['Entry Time']).toLocaleDateString('vi-VN')}</span><span class="status-badge ${statusClass}">${tx.Status}</span></div><div class="history-card-body"><div class="detail-item"><span class="label">Giờ vào:</span><span class="value">${formatDateTime(tx['Entry Time'])}</span></div><div class="detail-item"><span class="label">Giờ ra:</span><span class="value">${formatDateTime(tx['Exit Time'])}</span></div><div class="detail-item"><span class="label">Tổng thời gian:</span><span class="value">${calculateDuration(tx['Entry Time'], tx['Exit Time'])}</span></div><div class="detail-item"><span class="label">Phí gửi xe:</span><span class="value" style="font-weight: bold; color: #c62828;">${(tx.Fee || 0).toLocaleString('vi-VN')}đ</span></div></div>${receiptActionHtml}`;
            elements.historyContainer.appendChild(card);
        });
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
                const uniqueID = code.data;
                // SỬA LỖI & NÂNG CẤP: Sử dụng hàm tìm kiếm đa năng.
                // Nó sẽ tự động thử tìm bằng UniqueID trước, sau đó là biển số.
                universalSearch(uniqueID, ['uniqueID', 'plate']);
            }
        }
        scanAnimation = requestAnimationFrame(tick);
    };

    // --- Initialization ---
    const init = () => {
        initProxy(); // Khởi tạo iframe proxy ngay từ đầu
        fetchVehiclesToday(); // Tải dữ liệu nền ngay khi trang được mở

        const urlParams = new URLSearchParams(window.location.search);
        const uniqueID = urlParams.get('id');
        if (uniqueID) {
            // GIẢI PHÁP HOÀN THIỆN: Chờ dữ liệu nền tải xong rồi tìm kiếm
            setTimeout(() => {
                // SỬA LỖI & NÂNG CẤP: Sử dụng hàm tìm kiếm đa năng.
                universalSearch(uniqueID, ['uniqueID', 'plate']);
            }, 1500); // Chờ 1.5s để dữ liệu nền có thể tải xong
        }

        // Setup event listeners
        elements.plateSearchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const searchTerm = elements.plateInput.value.trim();
            if (searchTerm) {
                // SỬA LỖI & NÂNG CẤP: Sử dụng hàm tìm kiếm đa năng.
                universalSearch(searchTerm, ['plate', 'phone', 'uniqueID']);
            }
        });

        elements.scanQrBtn.addEventListener('click', openQrScanner);
        elements.closeScannerBtn.addEventListener('click', closeQrScanner);
        elements.downloadAllBtn.addEventListener('click', handleViewAllReceipts); // Gán sự kiện cho nút mới
    };
    
    init();
});
