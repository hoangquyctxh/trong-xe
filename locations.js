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
        id: 'VHVANXUAN', 
        name: 'Vườn Hoa Vạn Xuân', 
        lat: 21.040082771937307,
        lng: 105.84675825624123,
        capacity: 300,
        address: 'Gần 16 P. Phan Đình Phùng, Quán Thánh, Ba Đình',
        hotline: '0977.777.777',
        operatingHours: '08:00 – 22:00'
    },
    { 
        id: 'COTCOHN', 
        name: 'Cột Cờ Hà Nội', 
        lat: 21.032236917035874, 
        lng: 105.83967310503118,
        capacity: 150,
        address: '28 Điện Biên Phủ, Ba Đình',
        hotline: '0966.666.666',
        operatingHours: '11:00 – 22:00'
    },
];

