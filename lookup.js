document.addEventListener('DOMContentLoaded', () => {
    const historyContainer = document.getElementById('history-container');
    const plateDisplay = document.getElementById('plate-display');
    const messageBox = document.getElementById('message-box');

    const showMessage = (message, isError = false) => {
        historyContainer.style.display = 'none';
        plateDisplay.style.display = 'none';
        messageBox.style.display = 'block';
        messageBox.innerHTML = `<p style="${isError ? 'color: red;' : ''}">${message}</p>`;
    };

    const formatDateTime = (dateStr) => dateStr ? new Date(dateStr).toLocaleString('vi-VN') : '--';

    const calculateDuration = (startTime, endTime) => {
        if (!startTime || !endTime) return '--';
        const start = new Date(startTime);
        const end = new Date(endTime);
        let diff = Math.floor((end - start) / 1000);
        if (diff < 0) return '0m';
        const days = Math.floor(diff / 86400); diff %= 86400;
        const hours = Math.floor(diff / 3600); diff %= 3600;
        const minutes = Math.floor(diff / 60);
        let result = '';
        if (days > 0) result += `${days}d `;
        if (hours > 0) result += `${hours}h `;
        result += `${minutes}m`;
        return result.trim() || '0m';
    };

    const renderHistory = (history) => {
        if (!history || history.length === 0) {
            showMessage('Không tìm thấy lịch sử cho xe này.', true);
            return;
        }

        plateDisplay.textContent = history[0].Plate;
        plateDisplay.style.display = 'block';
        historyContainer.innerHTML = '';

        history.forEach(tx => {
            const card = document.createElement('div');
            card.className = 'history-card';

            const isDeparted = tx.Status !== 'Đang gửi';
            const statusClass = isDeparted ? 'departed' : 'parking';

            let receiptActionHtml = '';
            if (isDeparted) {
                // Tạo URL cho biên lai với các tham số
                const receiptUrl = `receipt.html?plate=${encodeURIComponent(tx.Plate)}&entryTime=${encodeURIComponent(formatDateTime(tx['Entry Time']))}&exitTime=${encodeURIComponent(formatDateTime(tx['Exit Time']))}&duration=${encodeURIComponent(calculateDuration(tx['Entry Time'], tx['Exit Time']))}&fee=${encodeURIComponent((tx.Fee || 0).toLocaleString('vi-VN'))}&paymentMethod=${encodeURIComponent(tx['Payment Method'] || 'N/A')}`;
                receiptActionHtml = `
                    <div class="receipt-action">
                        <a href="${receiptUrl}" target="_blank" class="btn-print">Xem & Tải biên lai</a>
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="detail-item">
                    <span class="label">Trạng thái</span>
                    <span class="value"><span class="status-badge ${statusClass}">${tx.Status}</span></span>
                </div>
                <div class="detail-item">
                    <span class="label">Phí gửi xe</span>
                    <span class="value">${(tx.Fee || 0).toLocaleString('vi-VN')}đ</span>
                </div>
                <div class="detail-item">
                    <span class="label">Giờ vào</span>
                    <span class="value">${formatDateTime(tx['Entry Time'])}</span>
                </div>
                <div class="detail-item">
                    <span class="label">Giờ ra</span>
                    <span class="value">${formatDateTime(tx['Exit Time'])}</span>
                </div>
                ${receiptActionHtml}
            `;
            historyContainer.appendChild(card);
        });
    };

    const init = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const uniqueID = urlParams.get('id');

        if (!uniqueID) {
            showMessage('URL không hợp lệ. Vui lòng quét lại mã QR từ vé xe.', true);
            return;
        }

        showMessage('Đang tải lịch sử, vui lòng chờ...');
        const response = await fetch(`${APP_CONFIG.googleScriptUrl}?action=getVehicleHistoryByUniqueID&uniqueID=${uniqueID}`);
        const result = await response.json();

        if (result.status === 'success') {
            messageBox.style.display = 'none';
            historyContainer.style.display = 'flex';
            renderHistory(result.data);
        } else {
            showMessage(result.message, true);
        }
    };

    init();
});