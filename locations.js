// locations.js
// File cấu hình các điểm trông giữ xe.
// Để thêm/sửa/xóa điểm, chỉ cần chỉnh sửa danh sách bên dưới.
//
// Cấu trúc mỗi điểm:
// {
//   id: "MÃ_NHẬN_DIỆN_DUY_NHẤT", // Viết liền, không dấu, không trùng lặp
//   name: "Tên hiển thị của điểm",
//   lat: 21.12345, // Vĩ độ (lấy từ Google Maps)
//   lng: 105.12345 // Kinh độ (lấy từ Google Maps)
// }

// locations.js

const LOCATIONS_CONFIG = [
    { 
        id: 'DIENBIENPHU', 
        name: 'Điện Biên Phủ', 
        lat: 21.032432212532083, 
        lng: 105.83939563968067,
        capacity: 150 // <--- THÊM SỨC CHỨA Ở ĐÂY
    },
    { 
        id: 'THCSNCT', 
        name: 'Trung Học Cơ Sở Nguyễn Công Trứ', 
        lat: 21.04238224912817,
        lng: 105.84632614752188,
        capacity: 150 // <--- THÊM SỨC CHỨA Ở ĐÂY
    },
    { 
        id: 'VHVANXUAN', 
        name: 'Vườn Hoa Vạn Xuân', 
        lat: 21.040082771937307,
        lng: 105.84675825624123,
        capacity: 300 // <--- THÊM SỨC CHỨA Ở ĐÂY
    },
    { 
        id: 'THPTPDP', 
        name: 'Trung Học Phổ Thông Phan Đình Phùng', 
        lat: 21.040684,
        lng: 105.842947,
        capacity: 150 // <--- THÊM SỨC CHỨA Ở ĐÂY
    },
];


