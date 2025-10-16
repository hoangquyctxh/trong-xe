// camera_integration.js - Module tích hợp camera và kết nối đến Máy chủ AI

function initializeCameraIntegration(elements, callbacks) {
    const {
        scanPlateBtn,
        cameraModal,
        liveCameraFeed,
        captureBtn,
        closeCameraBtn,
        cameraStatus
    } = elements;

    const {
        onPlateRecognized,
        showToast
    } = callbacks;

    let cameraStream = null;

    const openCamera = async () => {
        if (!('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices)) {
            showToast('Trình duyệt không hỗ trợ camera.', 'error');
            return;
        }
        try {
            cameraStatus.textContent = 'Đang khởi động camera...';
            cameraModal.style.display = 'flex';
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "environment",
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
            cameraStream = stream;
            liveCameraFeed.srcObject = stream;
            await liveCameraFeed.play();
            
            cameraStatus.textContent = 'Hướng camera về phía biển số xe.';
            captureBtn.disabled = false;
        } catch (err) {
            console.error("Lỗi camera:", err);
            showToast('Không thể truy cập camera. Vui lòng cấp quyền.', 'error');
            closeCamera();
        }
    };

    const closeCamera = () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
        }
        liveCameraFeed.srcObject = null;
        cameraModal.style.display = 'none';
        captureBtn.disabled = true;
        // Reset lại nội dung nút chụp về trạng thái ban đầu
        captureBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px; vertical-align: middle;"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg> Chụp & Nhận diện';
    };

    const captureAndRecognize = async () => {
        captureBtn.disabled = true;
        cameraStatus.textContent = 'Đang chụp và phân tích...';

        const canvas = document.createElement('canvas');
        canvas.width = liveCameraFeed.videoWidth;
        canvas.height = liveCameraFeed.videoHeight;
        canvas.getContext('2d').drawImage(liveCameraFeed, 0, 0);
        
        canvas.toBlob(async (blob) => {
            const formData = new FormData();
            formData.append('image', blob, 'capture.jpg');

            try {
                // URL của máy chủ AI trực tuyến (sẽ được cung cấp)
                const AI_SERVER_URL = 'https://park-assist-ai-h7t2.onrender.com/scan_plate';
                const response = await fetch(AI_SERVER_URL, { method: 'POST', body: formData });
                const result = await response.json();
                onPlateRecognized(result);
            } catch (error) {
                console.error("Lỗi kết nối AI:", error);
                showToast('Lỗi kết nối đến máy chủ AI.', 'error');
            } finally {
                closeCamera();
            }
        }, 'image/jpeg', 0.9); // Chất lượng ảnh 90%
    };

    scanPlateBtn.addEventListener('click', openCamera);
    closeCameraBtn.addEventListener('click', closeCamera);
    captureBtn.addEventListener('click', captureAndRecognize);
}