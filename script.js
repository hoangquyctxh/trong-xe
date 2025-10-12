document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // Dán URL Web App của bạn đã sao chép ở Phần 1 vào đây
    const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwZFTXRHo-0i2HknQAV4Ja-7lZsH27VimRnDre7DnCL2j04lkSYI1BTmCKWCvcG-0jnFg/exec';
    // =========================================================================

    const vehicleForm = document.getElementById('vehicle-form');
    const licensePlateInput = document.getElementById('license-plate');
    const actionBtn = document.getElementById('action-btn');
    const statusMessage = document.getElementById('status-message');
    const vehicleListContainer = document.getElementById('vehicle-list-container');
    const vehicleCountSpan = document.getElementById('vehicle-count');

    let parkedVehicles = []; // Mảng chứa danh sách xe đang gửi lấy từ Google Sheet

    // Hàm lấy danh sách xe đang gửi từ Google Sheet
    const fetchParkedVehicles = async () => {
        vehicleListContainer.innerHTML = '<p>Đang tải dữ liệu từ Google Sheet...</p>';
        try {
            const response = await fetch(WEB_APP_URL, { method: 'GET', mode: 'cors' });
            const result = await response.json();

            if (result.status === 'success') {
                parkedVehicles = result.data;
                renderVehicleList();
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            vehicleListContainer.innerHTML = `<p style="color: red;">Lỗi tải dữ liệu: ${error.message}</p>`;
        }
    };

    // Hàm hiển thị danh sách xe đang gửi
    const renderVehicleList = () => {
        vehicleListContainer.innerHTML = '';
        vehicleCountSpan.textContent = parkedVehicles.length;

        if (parkedVehicles.length === 0) {
            vehicleListContainer.innerHTML = '<p>Chưa có xe nào trong bãi.</p>';
            return;
        }

        parkedVehicles.sort((a, b) => new Date(b.entryTime) - new Date(a.entryTime)); // Sắp xếp xe mới nhất lên đầu

        parkedVehicles.forEach(vehicle => {
            const vehicleItem = document.createElement('div');
            vehicleItem.className = 'vehicle-item';
            vehicleItem.innerHTML = `
                <div class="vehicle-info">
                    <div class="plate">${vehicle.plate}</div>
                    <div class="time">Vào lúc: ${new Date(vehicle.entryTime).toLocaleString('vi-VN')}</div>
                </div>
            `;
            vehicleListContainer.appendChild(vehicleItem);
        });
    };

    // Hàm cập nhật giao diện form dựa trên biển số nhập vào
    const updateFormStatus = () => {
        const plate = licensePlateInput.value.trim().toUpperCase();
        statusMessage.textContent = '';
        statusMessage.className = '';

        if (!plate) {
            actionBtn.disabled = true;
            actionBtn.textContent = 'Nhập biển số';
            actionBtn.className = '';
            return;
        }

        const isParked = parkedVehicles.some(v => v.plate === plate);
        actionBtn.disabled = false;

        if (isParked) {
            actionBtn.textContent = 'Cho xe ra';
            actionBtn.className = 'btn-check-out';
            statusMessage.textContent = `Xe [${plate}] đang có trong bãi.`;
            statusMessage.className = 'status-parked';
        } else {
            actionBtn.textContent = 'Gửi xe';
            actionBtn.className = 'btn-check-in';
            statusMessage.textContent = `Xe [${plate}] chưa có trong bãi, sẵn sàng để gửi.`;
            statusMessage.className = 'status-ready';
        }
    };

    // Hàm gửi yêu cầu Gửi xe / Cho xe ra
    const handleVehicleAction = async (plate, action) => {
        actionBtn.disabled = true;
        actionBtn.textContent = 'Đang xử lý...';

        try {
            const response = await fetch(WEB_APP_URL, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ plate, action })
            });
            const result = await response.json();

            if (result.status === 'success') {
                alert(result.message); // Hiển thị thông báo thành công
                await fetchParkedVehicles(); // Tải lại danh sách xe
                licensePlateInput.value = ''; // Xóa ô nhập liệu
                updateFormStatus(); // Cập nhật lại form
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            alert(`Đã xảy ra lỗi: ${error.message}`);
            actionBtn.disabled = false;
            updateFormStatus(); // Cập nhật lại form về trạng thái cũ
        }
    };

    // Gắn sự kiện cho ô nhập biển số
    licensePlateInput.addEventListener('input', updateFormStatus);

    // Gắn sự kiện cho form
    vehicleForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const plate = licensePlateInput.value.trim().toUpperCase();
        if (!plate) return;

        const isParked = parkedVehicles.some(v => v.plate === plate);
        const action = isParked ? 'checkOut' : 'checkIn';
        handleVehicleAction(plate, action);
    });

    // --- Khởi chạy ứng dụng ---
    fetchParkedVehicles();
});
