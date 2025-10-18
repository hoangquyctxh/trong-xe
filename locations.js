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
        capacity: 150,
        address: '22 Điện Biên Phủ, Ba Đình, Hà Nội',
        hotline: '0987.654.321',
        operatingHours: '11:00 – 22:00'
    },
    { 
        id: 'THCSNCT', 
        name: 'Trung Học Cơ Sở Nguyễn Công Trứ', 
        lat: 21.04238224912817,
        lng: 105.84632614752188,
        capacity: 150,
        address: '6 P. Nguyễn Trường Tộ, Nguyễn Trung Trực, Ba Đình',
        hotline: '0988.888.888',
        operatingHours: '07:00 – 17:00'
    },
    { 
        id: 'VHVANXUAN', 
        name: 'Vườn Hoa Vạn Xuân', 
        lat: 21.040082771937307,
        lng: 105.84675825624123,
        capacity: 300,
        address: 'Gần 16 P. Phan Đình Phùng, Quán Thánh, Ba Đình',
        hotline: '0977.777.777',
        operatingHours: '08:00 – 23:00'
    },
    { 
        id: 'THPTPDP', 
        name: 'Trung Học Phổ Thông Phan Đình Phùng', 
        lat: 21.040684,
        lng: 105.842947,
        capacity: 150,
        address: '67 P. Cửa Bắc, Quán Thánh, Ba Đình',
        hotline: '0966.666.666',
        operatingHours: '07:00 – 18:00'
    },
];
