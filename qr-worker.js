self.importScripts('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js');

/**
 * qr-worker.js - PHIÊN BẢN 4.0 (PERFORMANCE OPTIMIZED)
 * Web Worker tối ưu hóa tốc độ.
 * Loại bỏ các bước tiền xử lý thủ công đắt đỏ, để jsQR tự xử lý (nhanh hơn C++ style optimization của JS).
 */

self.onmessage = (event) => {
    const imageData = event.data;

    // Không cần tiền xử lý thủ công (gây chậm trên mobile).
    // jsQR có thuật toán binarization riêng được tối ưu cực tốt.
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "attemptBoth", // Tăng khả năng nhận diện (chậm hơn xíu nhưng an toàn)
    });

    // Gửi kết quả (hoặc null) về luồng chính
    postMessage(code);
};