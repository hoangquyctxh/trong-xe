/**
 * qr-worker.js
 * Web Worker chuyên dụng để xử lý và giải mã mã QR trên một luồng riêng biệt.
 * Tích hợp các thuật toán xử lý ảnh nâng cao để cải thiện độ chính xác trong điều kiện khó.
 * Tác giả: Gemini Code Assist
 */

// Import thư viện jsQR vào trong worker
self.importScripts('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js');

/**
 * Tạo biểu đồ độ sáng (histogram) cho ảnh xám.
 * @param {Uint8ClampedArray} grayscaleData - Dữ liệu pixel của ảnh xám.
 * @returns {Int32Array} Mảng 256 phần tử chứa tần suất của mỗi mức độ xám.
 */
function createGrayscaleHistogram(grayscaleData) {
    const histogram = new Int32Array(256).fill(0);
    for (let i = 0; i < grayscaleData.length; i++) {
        histogram[grayscaleData[i]]++;
    }
    return histogram;
}

/**
 * Tìm ngưỡng nhị phân hóa tối ưu bằng thuật toán Otsu.
 * Đây là chìa khóa để xử lý ảnh có ánh sáng không đồng đều hoặc bị lóa.
 * @param {Int32Array} histogram - Biểu đồ độ sáng của ảnh.
 * @param {number} totalPixels - Tổng số pixel trong ảnh.
 * @returns {number} Ngưỡng tối ưu (0-255).
 */
function getOtsuThreshold(histogram, totalPixels) {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];

    let sumB = 0, wB = 0, wF = 0, maxVariance = 0, threshold = 0;

    for (let i = 0; i < 256; i++) {
        wB += histogram[i];
        if (wB === 0) continue;
        wF = totalPixels - wB;
        if (wF === 0) break;
        sumB += i * histogram[i];
        const meanB = sumB / wB;
        const meanF = (sum - sumB) / wF;
        const varianceBetween = wB * wF * (meanB - meanF) ** 2;
        if (varianceBetween > maxVariance) {
            maxVariance = varianceBetween;
            threshold = i;
        }
    }
    return threshold;
}

/**
 * Pipeline xử lý một ImageData: chuyển sang ảnh xám, áp dụng thuật toán Otsu và nhị phân hóa.
 * @param {ImageData} imageData - Dữ liệu ảnh từ canvas.
 * @returns {ImageData} Dữ liệu ảnh đã được nhị phân hóa, sẵn sàng cho jsQR.
 */
function preprocessImage(imageData) {
    const { width, height, data } = imageData;
    const grayscale = new Uint8ClampedArray(width * height);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        // Chuyển sang ảnh xám theo công thức độ sáng (luminance)
        grayscale[j] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    const histogram = createGrayscaleHistogram(grayscale);
    const threshold = getOtsuThreshold(histogram, width * height);
    
    // Áp dụng ngưỡng để tạo ảnh đen trắng (nhị phân hóa)
    for (let i = 0; i < grayscale.length; i++) {
        const value = grayscale[i] > threshold ? 255 : 0;
        const i4 = i * 4;
        data[i4] = data[i4 + 1] = data[i4 + 2] = value;
    }
    return imageData;
}

// Lắng nghe tin nhắn từ luồng chính
self.onmessage = (event) => {
    const imageData = event.data;
    // Bước 1: Xử lý ảnh nâng cao
    const processedImageData = preprocessImage(imageData);
    // Bước 2: Giải mã QR từ ảnh đã xử lý
    const code = jsQR(processedImageData.data, processedImageData.width, processedImageData.height, {
        inversionAttempts: "dontInvert",
    });
    // Bước 3: Gửi kết quả về luồng chính
    self.postMessage(code);
};