self.importScripts('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js');

/**
 * qr-worker.js - PHIÊN BẢN 3.0 (ADAPTIVE THRESHOLDING)
 * Web Worker chuyên dụng để xử lý và giải mã mã QR trên một luồng riêng biệt.
 * Tích hợp thuật toán Ngưỡng Thích ứng (Adaptive Thresholding) sử dụng Ảnh Tích phân
 * để đạt hiệu năng cao và độ chính xác vượt trội trong mọi điều kiện ánh sáng.
 * Tác giả: Gemini Code Assist
 */

/**
 * Pipeline xử lý ảnh: Chuyển sang ảnh xám, tạo ảnh tích phân và áp dụng ngưỡng thích ứng.
 * @param {ImageData} imageData - Dữ liệu ảnh từ canvas.
 * @returns {ImageData} Dữ liệu ảnh đã được nhị phân hóa, sẵn sàng cho jsQR.
 */
function preprocessImageAdaptive(imageData) {
    const { width, height, data } = imageData;
    const integralImage = new Uint32Array(width * height);
    const grayscaleData = new Uint8ClampedArray(width * height);

    // 1. Chuyển sang ảnh xám và tạo Ảnh Tích phân (Integral Image)
    for (let y = 0; y < height; y++) {
        let rowSum = 0;
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            const i4 = i * 4;
            const gray = data[i4] * 0.299 + data[i4 + 1] * 0.587 + data[i4 + 2] * 0.114;
            grayscaleData[i] = gray;

            rowSum += gray;
            integralImage[i] = (y > 0 ? integralImage[i - width] : 0) + rowSum;
        }
    }

    // 2. Áp dụng Ngưỡng Thích ứng
    const s = Math.floor(width / 8); // Kích thước vùng lân cận
    const s2 = Math.floor(s / 2);
    const t = 0.15; // Tỷ lệ điều chỉnh (giảm độ sáng trung bình đi 15%)

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            const i4 = i * 4;

            // Xác định vùng lân cận
            const x1 = Math.max(0, x - s2);
            const x2 = Math.min(width - 1, x + s2);
            const y1 = Math.max(0, y - s2);
            const y2 = Math.min(height - 1, y + s2);

            const count = (x2 - x1 + 1) * (y2 - y1 + 1);

            // Tính tổng độ sáng của vùng lân cận bằng Ảnh Tích phân (cực nhanh)
            const sum = integralImage[y2 * width + x2] -
                        (y1 > 0 ? integralImage[(y1 - 1) * width + x2] : 0) -
                        (x1 > 0 ? integralImage[y2 * width + (x1 - 1)] : 0) +
                        (y1 > 0 && x1 > 0 ? integralImage[(y1 - 1) * width + (x1 - 1)] : 0);

            // Nếu độ sáng của pixel hiện tại sáng hơn (1-t)% so với trung bình vùng, nó là màu trắng
            const finalValue = (grayscaleData[i] * count) < (sum * (1.0 - t)) ? 0 : 255;

            data[i4] = data[i4 + 1] = data[i4 + 2] = finalValue;
        }
    }

    return imageData;
}

self.onmessage = (event) => {
    const imageData = event.data;

    // Bước 1: Xử lý ảnh nâng cao bằng Ngưỡng Thích ứng
    const processedImageData = preprocessImageAdaptive(imageData);

    // Bước 2: Giải mã QR từ ảnh đã xử lý
    const code = jsQR(processedImageData.data, processedImageData.width, processedImageData.height, {
        inversionAttempts: "dontInvert",
    });

    // Bước 3: Gửi kết quả (hoặc null nếu không tìm thấy) về luồng chính
    postMessage(code);
};