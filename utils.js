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