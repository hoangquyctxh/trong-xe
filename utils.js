// utils.js
// Thư viện các hàm tiện ích dùng chung cho toàn bộ ứng dụng

/**
 * Định dạng một chuỗi ngày giờ để hiển thị.
 * @param {string | Date} dateStr - Chuỗi ngày giờ hoặc đối tượng Date.
 * @returns {string} Chuỗi đã định dạng (ví dụ: '20/10/2025, 14:30:00') hoặc '--' nếu không hợp lệ.
 */
const formatDateTimeForDisplay = (dateStr) => {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? '--' : date.toLocaleString('vi-VN');
};

/**
 * Định dạng số thành chuỗi tiền tệ Việt Nam.
 * @param {number | string} value - Giá trị số.
 * @returns {string} Chuỗi tiền tệ đã định dạng (ví dụ: '5.000').
 */
const formatCurrency = (value) => {
    const numValue = Number(value);
    return isNaN(numValue) ? '0' : numValue.toLocaleString('vi-VN');
};

/**
 * Tính toán khoảng thời gian giữa hai mốc thời gian.
 * @param {string | Date} startTime - Thời gian bắt đầu.
 * @param {string | Date} endTime - Thời gian kết thúc.
 * @returns {string} Chuỗi biểu thị khoảng thời gian (ví dụ: '1d 2h 30m').
 */
const calculateDurationBetween = (startTime, endTime) => {
    if (!startTime || !endTime) return '--';
    const start = new Date(startTime), end = new Date(endTime);
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

/**
 * Hiển thị một thông báo nhanh (toast).
 * @param {string} message - Nội dung thông báo.
 * @param {'success' | 'error' | 'info'} type - Loại thông báo.
 */
const showToast = (message, type = 'info') => {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️');
    toast.innerHTML = `${icon} <span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'fadeOutToast 0.5s ease forwards';
        setTimeout(() => toast.remove(), 500);
    }, 3500); // Tăng thời gian hiển thị lên một chút
};

/**
 * In nội dung của một phần tử HTML.
 * @param {HTMLElement} element - Phần tử cần in.
 * @param {string} documentTitle - Tiêu đề của tài liệu khi in.
 */
const printElement = (element, documentTitle) => {
    const printable = document.createElement('div');
    printable.id = 'printable-area';
    printable.innerHTML = element.innerHTML;
    document.body.appendChild(printable);
    const originalTitle = document.title;
    document.title = documentTitle;
    window.print();
    document.body.removeChild(printable);
    document.title = originalTitle;
};

// =================================================================
// LOGIC NHẬN DIỆN & FORMAT BIỂN SỐ THÔNG MINH (SHARED)
// =================================================================

/**
 * Nhận diện loại xe từ biển số dựa trên quy định mới nhất.
 * @param {string} plate - Biển số xe.
 * @returns {object} { type: string, label: string }
 */
const detectVehicleType = (plate) => {
    if (!plate) return { type: 'unknown', label: 'Khách hàng' };

    const cleaned = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // 0. ƯU TIÊN CAO NHẤT: CHECK TÊN NGƯỜI (KHÔNG CÓ SỐ)
    // Để tránh nhận diện nhầm "HOÀNG QUÝ" (Có NG) thành xe ngoại giao
    if (!/\d/.test(cleaned)) {
        return { type: 'custom', label: 'Người gửi' };
    }

    // 1. XE QUÂN ĐỘI (Army)
    // Biển đỏ, bắt đầu bằng 2 chữ cái (VD: AA, TM, TH, TC, TT...)
    // Regex: 2 chữ cái + dãy số
    const armyPrefixes = ['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH', 'QK', 'QL', 'QM', 'QN', 'QP', 'QQ', 'QR', 'QS', 'QT', 'QU', 'QV', 'QW', 'QX', 'QY', 'QZ', 'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AI', 'AK', 'AL', 'AM', 'AN', 'AP', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AV', 'AW', 'AX', 'AY', 'AZ', 'TM', 'TC', 'TT', 'TK', 'TH', 'KP', 'KK', 'PP', 'LD', 'BH', 'HH', 'PK', 'KB', 'CB', 'KC', 'HC'];
    if (/^[A-Z]{2}\d{2,6}$/.test(cleaned)) {
        const prefix = cleaned.substring(0, 2);
        // Các mã đặc biệt quân đội phổ biến
        if (['AA', 'TM', 'TC', 'TT', 'TK', 'TH', 'KP', 'KK', 'PP', 'PK', 'KB', 'CB', 'KC', 'BB', 'BP', 'HH'].includes(prefix)) {
            return { type: 'army', label: 'Xe Quân đội' };
        }
    }

    // 2. XE CÔNG VỤ / TRUNG ƯƠNG (Central/Police)
    // Biển xanh 80 + Chữ (A, B, E...)
    // VD: 80A-12345
    if (/^80[A-B-E]\d{4,5}$/.test(cleaned)) {
        return { type: 'police', label: 'Xe Công vụ / CSGT' };
    }

    // 3. XE NGOẠI GIAO / NƯỚC NGOÀI
    // NG: Ngoại giao, NN: Nước ngoài, QT: Quốc tế
    if (cleaned.includes('NG')) return { type: 'diplomatic', label: 'Xe Ngoại giao' };
    if (cleaned.includes('QT')) return { type: 'diplomatic', label: 'Xe Quốc tế' };
    if (cleaned.includes('NN')) return { type: 'foreign', label: 'Xe Nước ngoài' };

    // 4. XE ĐẶC BIỆT DÂN SỰ
    // LD: Liên doanh, KT: Quân đội làm kinh tế (có thể trùng, check lại), DA: Dự án
    if (cleaned.includes('LD')) return { type: 'car', label: 'Xe Liên doanh' };
    if (cleaned.includes('KT')) return { type: 'car', label: 'Xe KT Quân đội' };
    if (cleaned.includes('DA')) return { type: 'car', label: 'Xe Dự án' };
    if (cleaned.includes('MĐ')) return { type: 'motorbike', label: 'Xe Máy điện' }; // Máy điện 29MĐ...
    if (cleaned.includes('TĐ')) return { type: 'car', label: 'Xe Thí điểm' };

    // 5. XE HƠI DÂN SỰ CHUẨN (Cập nhật pattern chặt)
    // [2 số][1 Chữ][4-5 số] -> 30A12345
    if (/^\d{2}[A-Z]\d{4,5}$/.test(cleaned)) {
        return { type: 'car', label: 'Ô tô' };
    }

    // 6. TẤT CẢ CÁC TRƯỜNG HỢP alphanumeric CÒN LẠI -> XE MÁY (Fallback)
    // Bao gồm: 1111V2, 29B1..., 29M1...
    // ĐIỀU KIỆN QUAN TRỌNG: PHẢI CÓ SỐ (DIGITS)
    if (/\d/.test(cleaned) && /[A-Z]/.test(cleaned)) {
        return { type: 'motorbike', label: 'Xe máy' };
    }

    return { type: 'custom', label: 'Khách hàng' };
};

/**
 * Định dạng lại biển số cho đẹp (VD: 29A12345 -> 29A-123.45).
 * @param {string} plate - Biển số thô.
 * @returns {string} Biển số đã format.
 */
const formatPlate = (plate) => {
    if (!plate) return '';
    const cleaned = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // 0. Name check: Nếu là tên người (không có số) -> Trả về NGUYÊN GỐC (có dấu)
    if (!/\d/.test(cleaned)) return plate.trim();

    // 1. Xe hơi chuẩn (30A-123.45)
    // 5 số
    const carMatch = cleaned.match(/^(\d{2})([A-Z])(\d{3})(\d{2})$/);
    if (carMatch) return `${carMatch[1]}${carMatch[2]}-${carMatch[3]}.${carMatch[4]}`;
    // 4 số
    const carMatch4 = cleaned.match(/^(\d{2})([A-Z])(\d{4})$/);
    if (carMatch4) return `${carMatch4[1]}${carMatch4[2]}-${carMatch4[3]}`;

    // 2. Xe đặc biệt / Công vụ (80A-123.45, 29LD-123.45)
    const specialMatch = cleaned.match(/^(\d{2})([A-Z]{2})(\d{3})(\d{2})$/);
    if (specialMatch) return `${specialMatch[1]}${specialMatch[2]}-${specialMatch[3]}.${specialMatch[4]}`;

    // 3. Xe Quân đội (AA-12-34 hoặc AA-1234)
    // Format quân đội thường tách 2 số một: AA-12-34
    if (/^[A-Z]{2}\d{4}$/.test(cleaned)) {
        return cleaned.replace(/^([A-Z]{2})(\d{2})(\d{2})$/, '$1-$2-$3');
    }

    // 4. Xe máy quy chuẩn 5 số (29-B1 123.45)
    const motorbikeMatch = cleaned.match(/^(\d{2})([A-Z0-9]{2,3})(\d{3})(\d{2})$/);
    if (motorbikeMatch) {
        return `${motorbikeMatch[1]}-${motorbikeMatch[2]} ${motorbikeMatch[3]}.${motorbikeMatch[4]}`;
    }
    // 4 số
    const motorbikeMatch4 = cleaned.match(/^(\d{2})([A-Z0-9]{2,3})(\d{4})$/);
    if (motorbikeMatch4) {
        return `${motorbikeMatch4[1]}-${motorbikeMatch4[2]} ${motorbikeMatch4[3]}`;
    }

    // 5. Biển cổ / Lạ (1111V2) -> 1111-V2 or 123-A1
    if (/^\d{4}[A-Z0-9]{1,3}$/.test(cleaned)) return cleaned.replace(/^(\d{4})([A-Z0-9]+)$/, '$1-$2');
    if (/^\d{3}[A-Z0-9]{1,3}$/.test(cleaned)) return cleaned.replace(/^(\d{3})([A-Z0-9]+)$/, '$1-$2');

    return plate; // Giữ nguyên
};

/**
 * Đọc số tiền thành chữ tiếng Việt
 * @param {number} number - Số tiền
 * @returns {string} Chuỗi chữ tiếng Việt (Ví dụ: "Mười nghìn đồng")
 */
const readMoneyToText = (number) => {
    if (number === 0) return "Không đồng";
    const str = parseInt(number) + "";
    let i = 0;
    const arr = [];
    let index = str.length;
    const result = [];
    if (index === 0 || str === "NaN") return "";
    let string = "";
    while (index >= 0) {
        arr.push(str.substring(index, Math.max(index - 3, 0)));
        index -= 3;
    }
    const digits = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
    const units = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
    for (i = arr.length - 1; i >= 0; i--) {
        if (arr[i] === "" || arr[i] === "000") {
            continue;
        }
        string = arr[i] + "";
        if (string.length === 1) string = "00" + string;
        if (string.length === 2) string = "0" + string;
        const d1 = parseInt(string.substring(0, 1));
        const d2 = parseInt(string.substring(1, 2));
        const d3 = parseInt(string.substring(2, 3));
        if (d1 > 0) result.push(digits[d1], "trăm");
        else if (i < arr.length - 2 && (d2 > 0 || d3 > 0)) result.push("không", "trăm");

        if (d2 > 1) {
            result.push(digits[d2], "mươi");
            if (d3 === 1) result.push("mốt");
            else if (d3 === 5) result.push("lăm");
            else if (d3 > 0) result.push(digits[d3]);
        } else if (d2 === 1) {
            result.push("mười");
            if (d3 === 1) result.push("một");
            else if (d3 === 5) result.push("lăm");
            else if (d3 > 0) result.push(digits[d3]);
        } else if (d2 === 0 && d3 > 0) {
            if (d1 > 0 || result.length > 0) result.push("lẻ");
            result.push(digits[d3]);
        }
        result.push(units[i]);
    }
    let text = result.join(" ").trim();
    // Capitalize first letter
    return (text.charAt(0).toUpperCase() + text.slice(1) + " đồng").replace(/ +/g, ' ');
};

/**
 * So sánh an toàn hai ID hoặc chuỗi (không phân biệt hoa thường)
 * @param {string|number} a - Giá trị A
 * @param {string|number} b - Giá trị B
 * @returns {boolean} True nếu giống nhau
 */
const compareIds = (a, b) => {
    if (a === b) return true;
    if (a === null || a === undefined || b === null || b === undefined) return false;
    return String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
};

/**
 * Tạo mã định danh duy nhất (UUID v4) chuẩn quốc tế.
 * - An toàn: Sử dụng crypto.getRandomValues
 * - Không thể đoán trước
 * - Không thể làm giả
 */
const generateSecureID = () => {
    // 1. Sử dụng API chuẩn nếu có
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // 2. Fallback sử dụng crypto.getRandomValues cho các trình duyệt cũ hơn
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
};

// EXPORT TO GLOBAL WINDOW.UTILS
window.Utils = window.Utils || {};
window.Utils = {
    ...window.Utils,
    formatDateTime: formatDateTimeForDisplay, // Map tên hàm cũ
    formatDateTimeForDisplay,
    formatCurrency,
    calculateDurationBetween,
    calculateDuration: (start) => calculateDurationBetween(start, new Date()), // Helper alias
    showToast,
    printElement,
    detectVehicleType,
    formatPlate,
    readMoneyToText,
    compareIds,
    generateSecureID,
    // Helper lấy giờ chuẩn (nếu chưa có thì dùng Date.now)
    getSyncedTime: () => new Date(Date.now() + (typeof state !== 'undefined' ? state.serverTimeOffset : 0))
};