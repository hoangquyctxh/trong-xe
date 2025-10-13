// ai_worker.js - Lõi AI độc lập, chạy trên một luồng riêng.
// Import thư viện Tesseract.js
self.importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');

let worker = null;
let isReady = false;

// Hàm khởi tạo "bộ não" AI
async function initializeAI() {
    try {
        // Tạo một worker Tesseract mới
        worker = await Tesseract.createWorker('eng', 1, {
            logger: m => {
                // Gửi tiến trình về cho giao diện chính
                self.postMessage({ type: 'progress', data: m });
            }
        });
        
        // *** FIX QUAN TRỌNG NHẤT: Ra lệnh cho AI chỉ đọc các ký tự có trên biển số ***
        await worker.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        });
        
        isReady = true;
        // Báo cho giao diện chính biết AI đã sẵn sàng
        self.postMessage({ type: 'ready' });
    } catch (error) {
        // Báo lỗi nếu không thể khởi tạo
        self.postMessage({ type: 'error', data: 'Không thể khởi tạo Lõi AI.' });
        console.error('Lỗi khởi tạo Tesseract Worker:', error);
    }
}

// Lắng nghe yêu cầu từ giao diện chính
self.onmessage = async (e) => {
    const { type, data } = e.data;

    if (type === 'init') {
        // Bắt đầu khởi tạo AI
        await initializeAI();
    } else if (type === 'recognize') {
        if (!isReady || !worker) {
            self.postMessage({ type: 'error', data: 'Lõi AI chưa sẵn sàng.' });
            return;
        }

        const { imageData } = data;
        
        // *** TẦNG TIỀN XỬ LÝ ẢNH CHUYÊN SÂU ***
        // Chuyển ảnh sang dạng đen trắng để tăng độ chính xác
        const processedImageData = preprocessImage(imageData);

        try {
            // Đưa ảnh đã được "rửa sạch" cho AI đọc
            const result = await worker.recognize(processedImageData);
            // Gửi kết quả về cho giao diện chính
            self.postMessage({ type: 'result', data: result.data });
        } catch (error) {
            self.postMessage({ type: 'error', data: 'Lỗi trong quá trình nhận diện.' });
            console.error('Lỗi nhận diện:', error);
        }
    }
};

// Hàm "rửa ảnh" để tăng độ chính xác
function preprocessImage(imageData) {
    const data = imageData.data;
    // Chuyển sang ảnh thang độ xám (grayscale)
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = avg;     // red
        data[i + 1] = avg; // green
        data[i + 2] = avg; // blue
    }
    // (Có thể thêm các bước xử lý nâng cao khác như tăng tương phản ở đây)
    return imageData;
}

