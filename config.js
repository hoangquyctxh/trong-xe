
/**
 * =================================================================================
 * config.js - PHIÊN BẢN HOÀN CHỈNH
 * Tệp cấu hình và khởi tạo trung tâm, giải quyết triệt để lỗi "APP_CONFIG is not defined".
 * =================================================================================
 *
 * CÁCH HOẠT ĐỘNG:
 * 1. Định nghĩa các cấu hình mặc định (STATIC_CONFIG).
 * 2. Tạo kết nối đến Supabase.
 * 3. Viết hàm `fetchAndMergeSettings` để tải cài đặt từ bảng `app_settings` trên Supabase.
 * 4. Hợp nhất cài đặt từ Supabase vào cấu hình mặc định để tạo ra biến `APP_CONFIG` cuối cùng.
 * 5. Tạo một `configPromise` để các tệp khác (main.js, admin.js) có thể "chờ" cho đến khi
 *    quá trình tải và hợp nhất này hoàn tất.
 *
 * =================================================================================
 */

// 1. Cấu hình tĩnh (Mặc định, làm nền)
const STATIC_CONFIG = {
    supabaseUrl: 'https://mtihqbmlbtrgvamxwrkm.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10aWhxYm1sYnRyZ3ZhbXh3cmttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMTkwMDEsImV4cCI6MjA3NzU5NTAwMX0.hR5X8bp-XD2DfxUnvWF-yxVk4sFVW2zBunp5XXnIZ0Y',
    organizationName: "ĐOÀN TNCS HỒ CHÍ MINH P.BA ĐÌNH",
    weatherApiKey: "c9b24c823032912293817419cb0cd2dc",
    autoRefreshInterval: 5000,
    fee: {
        enabled: true,
        freeMinutes: 15,
        entryFee: 10000,
        dailyFee: 30000,
        dayRate: 5000,
        nightRate: 8000,
        nightStartHour: 18,
        nightEndHour: 6
    },
    // SỬA LỖI: Bổ sung lại cấu hình payment bị thiếu.
    payment: {
        imageUrlBase: "https://img.vietqr.io/image/MSB-968866975500-compact.png?accountName=NGUYEN%20CAO%20HOANG%20QUY"
    }
};

// 2. Khởi tạo biến APP_CONFIG và kết nối Supabase
let APP_CONFIG = { ...STATIC_CONFIG };
const db = supabase.createClient(STATIC_CONFIG.supabaseUrl, STATIC_CONFIG.supabaseKey);

/**
 * 3. Hàm tải và hợp nhất cài đặt từ Supabase.
 * @returns {Promise<object>} Một promise sẽ resolve với đối tượng cấu hình cuối cùng.
 */
const fetchAndMergeSettings = async () => {
    try {
        const { data, error } = await db.from('app_settings').select('key, value');

        if (error) {
            // Nếu lỗi là do không tìm thấy bảng, đây là lỗi nghiêm trọng cần báo.
            if (error.code === '42P01') { // '42P01' là mã lỗi "undefined_table" của PostgreSQL
                console.error("❌ LỖI CẤU HÌNH NGHIÊM TRỌNG: Không tìm thấy bảng 'app_settings'. Vui lòng chạy script SQL để tạo bảng.");
            }
            throw error;
        }

        // Chuyển đổi dữ liệu từ Supabase thành một đối tượng phẳng
        const dynamicConfig = data.reduce((acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
        }, {});

        // 4. Hợp nhất cài đặt động vào APP_CONFIG
        // Cài đặt từ DB sẽ ghi đè lên cài đặt tĩnh nếu có trùng lặp.
        APP_CONFIG = { ...APP_CONFIG, ...dynamicConfig };

        // NÂNG CẤP: Nếu có `payment_qr_url` từ DB, hãy cập nhật nó vào cấu trúc payment.
        if (APP_CONFIG.payment_qr_url) {
            APP_CONFIG.payment.imageUrlBase = APP_CONFIG.payment_qr_url;
        }

        console.log('✅ Cấu hình ứng dụng đã được tải và hợp nhất thành công:', APP_CONFIG);
        return APP_CONFIG;

    } catch (error) {
        console.warn('⚠️ Không thể tải cài đặt từ cơ sở dữ liệu, hệ thống sẽ sử dụng cấu hình mặc định.', error.message);
        // Trong trường hợp lỗi, APP_CONFIG sẽ giữ nguyên giá trị của STATIC_CONFIG.
        return APP_CONFIG;
    }
};

// 5. Chạy hàm và tạo ra `configPromise`
// Đây là một "lời hứa" rằng quá trình tải cấu hình sẽ được thực hiện.
// Các tệp khác có thể `await configPromise` hoặc dùng `.then()` để đảm bảo APP_CONFIG đã sẵn sàng.
const configPromise = fetchAndMergeSettings();