
/**
 * =================================================================================
 * config.js - Tệp cấu hình và khởi tạo trung tâm
 * =================================================================================
 *
 * CÁCH HOẠT ĐỘNG:
 * 1. Định nghĩa cấu hình tĩnh (STATIC_CONFIG) làm nền tảng.
 * 2. Khởi tạo biến `APP_CONFIG` và kết nối Supabase.
 * 3. Tải và hợp nhất cài đặt động từ bảng `app_settings` trên Supabase.
 * 4. Cung cấp một `configPromise` để các tệp khác có thể chờ quá trình tải cấu hình hoàn tất.
 *
 * =================================================================================
 */

// 1. Cấu hình tĩnh (Mặc định)
const STATIC_CONFIG = {
    supabase: {
        url: 'https://mtihqbmlbtrgvamxwrkm.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10aWhxYm1sYnRyZ3ZhbXh3cmttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMTkwMDEsImV4cCI6MjA3NzU5NTAwMX0.hR5X8bp-XD2DfxUnvWF-yxVk4sFVW2zBunp5XXnIZ0Y'
    },
    organizationName: "ĐOÀN TNCS HỒ CHÍ MINH P.BA ĐÌNH",
    weatherApiKey: "c9b24c823032912293817419cb0cd2dc",
    autoRefreshInterval: 5000,
    payment: {
        imageUrlBase: "https://img.vietqr.io/image/MSB-968866975500-compact.png?accountName=NGUYEN%20CAO%20HOANG%20QUY"
    },
    tinhThanhPhoApi: {
        url: 'https://tinhthanhpho.com/api/standardize-address',
        apiKey: 'hvn_LVZHrmtmusRmhR4OXA4FPp9ahUGFz8oE' // API Key của bạn
    }
};

// 2. Khởi tạo biến APP_CONFIG và kết nối Supabase
let APP_CONFIG = { ...STATIC_CONFIG };
// Dùng một Supabase client dùng chung cho toàn bộ ứng dụng (được gắn lên window để tái sử dụng)
const db = supabase.createClient(STATIC_CONFIG.supabase.url, STATIC_CONFIG.supabase.anonKey);
window.SUPABASE_DB = db;

/**
 * 3. Hàm tải và hợp nhất cài đặt từ Supabase.
 * @returns {Promise<object>} Một promise sẽ resolve với đối tượng cấu hình cuối cùng.
 */
const fetchAndMergeSettings = async () => {
    try {
        // NÂNG CẤP: Không phụ thuộc vào cột is_active (tránh lỗi nếu DB chưa có cột này)
        const { data, error } = await db.from('app_settings').select('key, value');

        if (error) {
            if (error.code === '42P01') {
                console.error("❌ LỖI CẤU HÌNH NGHIÊM TRỌNG: Không tìm thấy bảng 'app_settings'. Vui lòng chạy script SQL để tạo bảng.");
            }
            throw error;
        }

        const dynamicConfig = data.reduce((acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
        }, {});

        // 4. Hợp nhất cài đặt động vào APP_CONFIG
        APP_CONFIG = { ...APP_CONFIG, ...dynamicConfig };

        // Cập nhật các cấu trúc lồng nhau nếu có giá trị từ DB
        if (APP_CONFIG.payment_qr_url) {
            APP_CONFIG.payment.imageUrlBase = APP_CONFIG.payment_qr_url;
        }

        // TÁI CẤU TRÚC: "Bơm" cấu hình phí vào module FeeCalculator
        if (typeof FeeCalculator !== 'undefined' && FeeCalculator.updateConfig) {
            FeeCalculator.updateConfig(APP_CONFIG.fee);
        }

        console.log('✅ Cấu hình ứng dụng đã được tải và hợp nhất thành công:', APP_CONFIG);
        return APP_CONFIG;

    } catch (error) {
        console.warn('⚠️ Không thể tải cài đặt động, hệ thống sẽ sử dụng cấu hình mặc định.', error.message);
        return APP_CONFIG;
    }
};

// 5. Chạy hàm và tạo ra `configPromise`
const configPromise = fetchAndMergeSettings();
