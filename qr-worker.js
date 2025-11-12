/**
 * qr-worker.js
 * Web Worker chuyên dụng để xử lý và giải mã mã QR trên một luồng riêng biệt.
 * Điều này giúp giao diện chính (UI thread) không bị đóng băng, mang lại trải nghiệm quét mượt mà.
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
 * Xử lý một ImageData: chuyển sang ảnh xám, áp dụng thuật toán Otsu và nhị phân hóa.
 * @param {ImageData} imageData - Dữ liệu ảnh từ canvas.
 * @returns {ImageData} Dữ liệu ảnh đã được nhị phân hóa.
 */
function processImageData(imageData) {
    const { width, height, data } = imageData;
    const grayscale = new Uint8ClampedArray(width * height);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        grayscale[j] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    const histogram = createGrayscaleHistogram(grayscale);
    const threshold = getOtsuThreshold(histogram, width * height);
    const binarizedRgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < grayscale.length; i++) {
        const value = grayscale[i] > threshold ? 255 : 0;
        const i4 = i * 4;
        binarizedRgba[i4] = binarizedRgba[i4 + 1] = binarizedRgba[i4 + 2] = value;
        binarizedRgba[i4 + 3] = 255;
    }
    return new ImageData(binarizedRgba, width, height);
}

// Lắng nghe tin nhắn từ luồng chính
self.onmessage = (event) => {
    const imageData = event.data;
    const processedImageData = processImageData(imageData);
    const code = jsQR(processedImageData.data, processedImageData.width, processedImageData.height, { 