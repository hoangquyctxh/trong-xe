// ai_worker.js - This file runs in the background
// It handles all the heavy AI processing without freezing the main page.

// 1. Import the Tesseract library into this worker thread
self.importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');

let worker = null;

// 2. Listen for a message from the main page to start initialization
self.onmessage = async (e) => {
    const { type, payload } = e.data;

    if (type === 'init') {
        // Create the Tesseract worker once and keep it ready
        try {
            self.postMessage({ status: 'initializing', message: 'Đang tải Lõi AI...' });
            worker = await Tesseract.createWorker('eng', 1, {
                logger: m => self.postMessage({ status: 'progress', data: m }) // Send progress back to main page
            });
            await worker.setParameters({
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
            });
            self.postMessage({ status: 'ready', message: 'Lõi AI đã sẵn sàng!' });
        } catch (error) {
            self.postMessage({ status: 'error', message: 'Không thể tải Lõi AI.' });
        }
    } else if (type === 'recognize') {
        if (!worker) {
            self.postMessage({ status: 'error', message: 'Lõi AI chưa được khởi tạo.' });
            return;
        }

        try {
            // 3. Receive image data and perform recognition
            const result = await worker.recognize(payload);
            
            // 4. Send the result back to the main page
            self.postMessage({ status: 'result', data: result.data });
        } catch (error) {
            self.postMessage({ status: 'error', message: 'Lỗi trong quá trình nhận diện.' });
        }
    }
};
