// config.js
// File cấu hình trung tâm cho toàn bộ ứng dụng.
// Mọi thay đổi về API, thông tin thanh toán, mức phí... đều được chỉnh sửa tại đây.

// =================================================================================
// HƯỚNG DẪN: Để bật tính năng thời tiết, hãy đăng ký tài khoản miễn phí tại
// openweathermap.org, lấy API Key và dán vào mục apiKey bên dưới.
// =================================================================================

const APP_CONFIG = {
    // Cập nhật URL mới nhất từ Google Apps Script
    googleScriptUrl: "https://script.google.com/macros/s/AKfycbxAisLSy1prrlhDNLpkMtb1bX-rCXsxtMMP-xe9Ndg1YRePKwilVQoWNr4Z0C1SxujO5g/exec",

    // Cấu hình thanh toán QR (SỬ DỤNG LẠI PHƯƠP PHÁP TĨNH)
    payment: {
        baseUrl: "https://qr.sepay.vn/img?bank=Oceanbank&acc=666686989&template=compact"
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
    autoRefreshInterval: 5000, // 5 giây

    // MỚI: Danh sách video quảng cáo cho màn hình chờ
    // Dán các đường link video của bạn vào đây.
    // Hệ thống sẽ tự động phát lần lượt.
    adVideos: [
        // LƯU Ý: Phải dùng link trực tiếp đến file video .mp4.
        // Ví dụ link từ Cloudflare R2: "https://ten-bucket.id-tai-khoan.r2.dev/ten-video.mp4"
        // Ví dụ link từ các trang video miễn phí:
        "https://pub-e8b9f290d56545b29e32c494b6ec8f86.r2.dev/video_20251019_222646.mp4"
    ]
};