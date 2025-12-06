// plate_data.js
// Cơ sở dữ liệu nhận dạng biển số xe Việt Nam
// Dữ liệu được tham khảo từ Wikipedia và các nguồn công khai.

const PLATE_DATA = {
    // Mã số các tỉnh thành
    // NÂNG CẤP: Cấu trúc lại dữ liệu tỉnh thành theo quy hoạch sáp nhập mới (dự kiến 2025)
    // Mỗi tỉnh mới sẽ có tên và danh sách các mã tỉnh cũ được gộp vào.
    provinces: [
        { name: "TP. Hà Nội", codes: ["29", "30", "31", "32", "33", "40", "88", "99"] },
        { name: "TP. Hồ Chí Minh", codes: ["41", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59"] },
        { name: "Tỉnh An Giang", codes: ["67", "66", "63"] },
        { name: "Tỉnh Bà Rịa - Vũng Tàu", codes: ["72", "39", "60"] },
        { name: "Tỉnh Bắc Giang", codes: ["98", "12"] },
        { name: "Tỉnh Bình Định", codes: ["77", "78"] },
        { name: "Tỉnh Bình Thuận", codes: ["86", "85"] },
        { name: "Tỉnh Cà Mau", codes: ["69", "94"] },
        { name: "TP. Cần Thơ", codes: ["65", "95", "83", "64"] },
        { name: "Tỉnh Đắk Lắk", codes: ["47", "48"] },
        { name: "Tỉnh Gia Lai", codes: ["81", "82"] },
        { name: "Tỉnh Hà Nam", codes: ["90", "35"] },
        { name: "Tỉnh Hà Tĩnh", codes: ["38", "73"] },
        { name: "Tỉnh Hải Dương", codes: ["34", "89"] },
        { name: "TP. Hải Phòng", codes: ["15", "16", "14"] },
        { name: "Tỉnh Hòa Bình", codes: ["28", "26"] },
        { name: "Tỉnh Khánh Hòa", codes: ["79", "92"] },
        { name: "Tỉnh Kiên Giang", codes: ["68", "93"] },
        { name: "Tỉnh Lào Cai", codes: ["24", "25"] },
        { name: "Tỉnh Lâm Đồng", codes: ["49", "61"] },
        { name: "Tỉnh Long An", codes: ["62", "70"] },
        { name: "Tỉnh Nam Định", codes: ["18", "17"] },
        { name: "Tỉnh Nghệ An", codes: ["37", "36"] },
        { name: "Tỉnh Phú Thọ", codes: ["19", "23"] },
        { name: "Tỉnh Quảng Nam", codes: ["92", "43"] }, // Đà Nẵng sáp nhập vào Quảng Nam
        { name: "Tỉnh Quảng Ngãi", codes: ["76", "74"] },
        { name: "Tỉnh Thái Nguyên", codes: ["20", "97"] },
        { name: "Tỉnh Thừa Thiên Huế", codes: ["75", "74"] },
        { name: "Tỉnh Trà Vinh", codes: ["84", "71"] },
        { name: "Tỉnh Tuyên Quang", codes: ["22", "21"] },
        { name: "Tỉnh Yên Bái", codes: ["21", "27"] },
        // Các tỉnh không thay đổi
        { name: "Tỉnh Bến Tre", codes: ["71"] },
        { name: "Tỉnh Cao Bằng", codes: ["11"] },
        { name: "Tỉnh Điện Biên", codes: ["27"] }
    ],

    // NÂNG CẤP: Dữ liệu chi tiết cho biển số ngoại giao (NG)
    diplomaticSeries: {
        "001-010": "Tổ chức quốc tế",
        "011": "Đại sứ quán Afghanistan", "021": "Đại sứ quán Albania", "026": "Đại sứ quán Algérie", "031": "Đại sứ quán Angola",
        "041": "Đại sứ quán Argentina", "046": "Đại sứ quán Úc", "051": "Đại sứ quán Áo", "056": "Đại sứ quán Ấn Độ",
        "061": "Đại sứ quán Azerbaijan", "066": "Đại sứ quán Bangladesh", "071": "Đại sứ quán Belarus", "076": "Đại sứ quán Bỉ",
        "081": "Đại sứ quán Brasil", "086": "Đại sứ quán Brunei", "091": "Đại sứ quán Bulgaria", "096": "Đại sứ quán Campuchia",
        "101": "Đại sứ quán Canada", "106": "Đại sứ quán Chile", "111": "Đại sứ quán Colombia", "116": "Đại sứ quán Cuba",
        "121": "Đại sứ quán Cộng hòa Séc", "126": "Đại sứ quán Đan Mạch", "131": "Đại sứ quán Ai Cập", "136": "Đại sứ quán Phần Lan",
        "141": "Đại sứ quán Pháp", "146": "Đại sứ quán Đức", "156": "Đại sứ quán Hy Lạp", "161": "Đại sứ quán Guatemala",
        "166": "Đại sứ quán Hungary", "171": "Đại sứ quán Indonesia", "176": "Đại sứ quán Iran", "181": "Đại sứ quán Iraq",
        "186": "Đại sứ quán Ireland", "191": "Đại sứ quán Israel", "196": "Đại sứ quán Ý", "201": "Đại sứ quán Nhật Bản",
        "206": "Đại sứ quán Kazakhstan", "211": "Đại sứ quán Triều Tiên", "216": "Đại sứ quán Hàn Quốc", "221": "Đại sứ quán Kuwait",
        "226": "Đại sứ quán Lào", "231": "Đại sứ quán Liban", "236": "Đại sứ quán Libya", "241": "Đại sứ quán Malaysia",
        "246": "Đại sứ quán México", "251": "Đại sứ quán Mông Cổ", "256": "Đại sứ quán Maroc", "261": "Đại sứ quán Mozambique",
        "266": "Đại sứ quán Myanmar", "271": "Đại sứ quán Hà Lan", "276": "Đại sứ quán New Zealand", "281": "Đại sứ quán Nigeria",
        "286": "Đại sứ quán Na Uy", "291": "Đại sứ quán Oman", "296": "Đại sứ quán Pakistan", "301": "Đại sứ quán Palestine",
        "306": "Đại sứ quán Panama", "311": "Đại sứ quán Peru", "316": "Đại sứ quán Philippines", "321": "Đại sứ quán Ba Lan",
        "326": "Đại sứ quán Bồ Đào Nha", "331": "Đại sứ quán Qatar", "336": "Đại sứ quán România", "341": "Đại sứ quán Nga",
        "346": "Đại sứ quán Ả Rập Xê Út", "351": "Đại sứ quán Singapore", "356": "Đại sứ quán Slovakia", "361": "Đại sứ quán Nam Phi",
        "366": "Đại sứ quán Tây Ban Nha", "371": "Đại sứ quán Sri Lanka", "376": "Đại sứ quán Thụy Điển", "381": "Đại sứ quán Thụy Sĩ",
        "386": "Đại sứ quán Tanzania", "391": "Đại sứ quán Thái Lan", "396": "Đại sứ quán Timor-Leste", "406": "Đại sứ quán Thổ Nhĩ Kỳ",
        "411": "Đại sứ quán Ukraina", "416": "Đại sứ quán Các Tiểu vương quốc Ả Rập Thống nhất", "421": "Đại sứ quán Vương quốc Anh", "426": "Đại sứ quán Hoa Kỳ",
        "431": "Đại sứ quán Uruguay", "436": "Đại sứ quán Venezuela", "441": "Đại sứ quán Haiti", "446": "Đại sứ quán El Salvador",
        "451": "Đại sứ quán Úc (Lãnh sự)", "456": "Đại sứ quán Canada (Lãnh sự)", "461": "Đại sứ quán Trung Quốc (Lãnh sự)", "466": "Đại sứ quán Cuba (Lãnh sự)",
        "471": "Đại sứ quán Pháp (Lãnh sự)", "476": "Đại sứ quán Đức (Lãnh sự)", "481": "Đại sứ quán Hungary (Lãnh sự)", "486": "Đại sứ quán Ấn Độ (Lãnh sự)",
        "491": "Đại sứ quán Indonesia (Lãnh sự)", "496": "Đại sứ quán Nhật Bản (Lãnh sự)", "501": "Đại sứ quán Lào (Lãnh sự)", "506": "Đại sứ quán Malaysia (Lãnh sự)",
        "511": "Đại sứ quán New Zealand (Lãnh sự)", "516": "Đại sứ quán Ba Lan (Lãnh sự)", "521": "Đại sứ quán Hàn Quốc (Lãnh sự)", "526": "Đại sứ quán Nga (Lãnh sự)",
        "531": "Đại sứ quán Singapore (Lãnh sự)", "536": "Đại sứ quán Thụy Sĩ (Lãnh sự)", "541": "Đại sứ quán Thái Lan (Lãnh sự)", "546": "Đại sứ quán Vương quốc Anh (Lãnh sự)",
        "551": "Đại sứ quán Hoa Kỳ (Lãnh sự)", "600-799": "Tổ chức quốc tế phi chính phủ", "800-999": "Cơ quan thông tấn, báo chí nước ngoài"
    },

    // Các loại sê-ri đặc biệt
    specialSeries: {
        "NG": "Xe của cơ quan đại diện ngoại giao",
        "NN": "Xe của tổ chức, cá nhân nước ngoài",
        "QT": "Xe của cơ quan đại diện ngoại giao (có yếu tố quốc tế)",
        "CV": "Xe của chuyên viên tư vấn nước ngoài",
        "LD": "Xe của doanh nghiệp có vốn đầu tư nước ngoài",
        "DA": "Xe của các ban quản lý dự án nước ngoài",
        "CD": "Xe chuyên dùng của Công an",
        "KT": "Xe của doanh nghiệp quân đội",
        "RM": "Rơ moóc quân đội",
        "MK": "Máy kéo quân đội",
        "TĐ": "Xe máy chuyên dùng của quân đội",
        "HC": "Xe ô tô chuyên dùng của Công an"
    },

    // Ý nghĩa màu sắc (để tham khảo và mở rộng trong tương lai)
    plateColors: {
        "white": "Xe cá nhân, doanh nghiệp",
        "blue": "Xe cơ quan hành chính, sự nghiệp nhà nước",
        "yellow": "Xe kinh doanh vận tải",
        "red": "Xe thuộc Bộ Quốc phòng, xe quân sự",
        "green_temp": "Biển số tạm thời"
    }
};
