// config.js
// File cấu hình trung tâm cho toàn bộ ứng dụng.
// Mọi thay đổi về API, thông tin thanh toán, mức phí... đều được chỉnh sửa tại đây.

// =================================================================================
// HƯỚNG DẪN: Để bật tính năng thời tiết, hãy đăng ký tài khoản miễn phí tại
// openweathermap.org, lấy API Key và dán vào mục apiKey bên dưới.
// =================================================================================

const APP_CONFIG = {
    // Tên đơn vị chủ quản để đóng dấu lên ảnh
    organizationName: "ĐOÀN TNCS HỒ CHÍ MINH P.BA ĐÌNH",

    // Cấu hình thanh toán QR bằng cách tạo ảnh từ API của VietQR
    payment: {
        // URL gốc để tạo ảnh QR. Các tham số `amount` và `addInfo` sẽ được thêm vào sau.
        imageUrlBase: "https://img.vietqr.io/image/MSB-968866975500-compact.png?accountName=NGUYEN%20CAO%20HOANG%20QUY"
    },

    // Cấu hình API thời tiết (MỚI)
    weather: {
        apiKey: "c9b24c823032912293817419cb0cd2dc" // <-- DÁN API KEY CỦA BẠN VÀO ĐÂY
    },

    // Cấu hình tính phí gửi xe
    fee: {
        enabled: true,         // BẬT/TẮT THU PHÍ: true = có thu phí, false = miễn phí toàn bộ.
        freeMinutes: 15,       // Số phút gửi xe miễn phí
        entryFee: 10000,       // NÂNG CẤP: Phí cố định cho mỗi lượt gửi (chính sách "Theo lượt")
        dailyFee: 30000,       // NÂNG CẤP: Phí cố định cho mỗi ngày gửi (chính sách "Theo ngày")
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
