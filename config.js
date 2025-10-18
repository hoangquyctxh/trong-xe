// config.js
// File cấu hình trung tâm cho toàn bộ ứng dụng.
// Mọi thay đổi về API, thông tin thanh toán, mức phí... đều được chỉnh sửa tại đây.

// =================================================================================
// HƯỚNG DẪN: Để bật tính năng thời tiết, hãy đăng ký tài khoản miễn phí tại
// openweathermap.org, lấy API Key và dán vào mục apiKey bên dưới.
// =================================================================================

const APP_CONFIG = {
    // URL Google Apps Script để xử lý dữ liệu
    googleScriptUrl: "https://script.google.com/macros/s/AKfycby9ykTLoFfBGYMBy-O1jI2QeBsn9q6QlLIKjvrjJjbLv5B1UU3ybw9EzNIJZlgUhfQwPw/exec",

    // Cấu hình thanh toán VietQR
    payment: {
        baseUrl: "https://img.vietqr.io/image/MBV-666686989-compact.png",
        accountName: "NGUYEN CAO HOANG QUY"
    },

    // Cấu hình API thời tiết (MỚI)
    weather: {
        apiKey: "c9b24c823032912293817419cb0cd2dc" // <-- DÁN API KEY CỦA BẠN VÀO ĐÂY
    },

    // Cấu hình tính phí gửi xe
    fee: {
        freeMinutes: 15,       // Số phút gửi xe miễn phí
        dayRate: 5000,         // Phí mỗi giờ ban ngày (từ 6h sáng đến 18h tối)
        nightRate: 8000,       // Phí mỗi giờ ban đêm
        nightStartHour: 18,    // Giờ bắt đầu tính phí đêm (6 PM)
        nightEndHour: 6        // Giờ kết thúc tính phí đêm (6 AM)
    },

    // Thời gian tự động làm mới dữ liệu (tính bằng mili giây)
    autoRefreshInterval: 5000 // 5 giây
};