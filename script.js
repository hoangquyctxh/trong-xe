document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // Dán URL Web App của bạn đã sao chép ở Phần 1 vào đây
    const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwZFTXRHo-0i2HknQAV4Ja-7lZsH27VimRnDre7DnCL2j04lkSYI1BTmCKWCvcG-0jnFg/exec';
    // =========================================================================

    const vehicleForm = document.getElementById('vehicle-form');
    const searchTermInput = document.getElementById('search-term');
    const phoneNumberInput = document.getElementById('phone-number');
    const actionBtn = document.getElementById('action-btn');
    const statusMessage = document.getElementById('status-message');
    const vehicleListContainer = document.getElementById('vehicle-list-container');
    const vehicleCountSpan = document.getElementById('vehicle-count');

    let parkedVehicles = [];

    const fetchParkedVehicles = async () => {
        vehicleListContainer.innerHTML = '<p>Đang tải dữ liệu...</p>';
        try {
            const response = await fetch(WEB_APP_URL, { method: 'GET', mode: 'cors' });
            const result = await response.json();
            if (result.status === 'success') {
                parkedVehicles = result.data;
                renderVehicleList();
            } else { throw new Error(result.message); }
        } catch (error) {
            vehicleListContainer.innerHTML = `<p style="color: red;">Lỗi tải dữ liệu: ${error.message}</p>`;
        }
    };

    const renderVehicleList = () => {
        vehicleListContainer.innerHTML = '';
        vehicleCountSpan.textContent = parkedVehicles.length;
        if (parkedVehicles.length === 0) {
            vehicleListContainer.innerHTML = '<p>Chưa có xe nào trong bãi.</p>';
            return;
        }
        parkedVehicles.sort((a, b) => new Date(b.entryTime) - new Date(a.entryTime));
        parkedVehicles.forEach(vehicle => {
            const vehicleItem = document.createElement('div');
            vehicleItem.className = 'vehicle-item';
            const phoneInfo = vehicle.phone ? `<div class="phone">📞 ${vehicle.phone}</div>` : '';
            vehicleItem.innerHTML = `
                <div class="vehicle-info">
                    <div class="plate">${vehicle.plate}</div>
                    ${phoneInfo}
                    <div class="time">Vào lúc: ${new Date(vehicle.entryTime).toLocaleString('vi-VN')}</div>
                </div>`;
            vehicleListContainer.appendChild(vehicleItem);
        });
    };

    const updateFormStatus = () => {
        const searchTerm = searchTermInput.value.trim().toUpperCase();
        statusMessage.textContent = '';
        statusMessage.className = '';

        if (!searchTerm) {
            actionBtn.disabled = true;
            actionBtn.textContent = 'Nhập thông tin';
            actionBtn.className = '';
            phoneNumberInput.style.display = 'block';
            phoneNumberInput.disabled = false;
            phoneNumberInput.value = '';
            return;
        }

        const foundVehicle = parkedVehicles.find(v => v.plate === searchTerm || (v.phone && v.phone === searchTerm));
        actionBtn.disabled = false;

        if (foundVehicle) {
            actionBtn.textContent = 'Cho xe ra';
            actionBtn.className = 'btn-check-out';
            statusMessage.textContent = `Xe [${foundVehicle.plate}] của SĐT [${foundVehicle.phone || 'N/A'}] đang có trong bãi.`;
            statusMessage.className = 'status-parked';
            searchTermInput.value = foundVehicle.plate; // Hiển thị BKS chuẩn
            phoneNumberInput.style.display = 'none'; // Ẩn ô SĐT khi cho xe ra
        } else {
            actionBtn.textContent = 'Gửi xe';
            actionBtn.className = 'btn-check-in';
            statusMessage.textContent = `Xe [${searchTerm}] chưa có trong bãi, sẵn sàng để gửi.`;
            statusMessage.className = 'status-ready';
            phoneNumberInput.style.display = 'block';
            phoneNumberInput.disabled = false;
        }
    };

    const handleVehicleAction = async (plate, phone, action) => {
        actionBtn.disabled = true;
        actionBtn.textContent = 'Đang xử lý...';
        try {
            const response = await fetch(WEB_APP_URL, {
                method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ plate, phone, action })
            });
            const result = await response.json();
            if (result.status === 'success') {
                alert(result.message);
                await fetchParkedVehicles();
                searchTermInput.value = '';
                phoneNumberInput.value = '';
                updateFormStatus();
            } else { throw new Error(result.message); }
        } catch (error) {
            alert(`Đã xảy ra lỗi: ${error.message}`);
            actionBtn.disabled = false;
            updateFormStatus();
        }
    };

    searchTermInput.addEventListener('input', updateFormStatus);
    vehicleForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const searchTerm = searchTermInput.value.trim().toUpperCase();
        if (!searchTerm) return;
        const foundVehicle = parkedVehicles.find(v => v.plate === searchTerm || (v.phone && v.phone === searchTerm));
        
        if (foundVehicle) { // Cho xe ra
            handleVehicleAction(foundVehicle.plate, '', 'checkOut');
        } else { // Gửi xe
            const phone = phoneNumberInput.value.trim();
            handleVehicleAction(searchTerm, phone, 'checkIn');
        }
    });

    fetchParkedVehicles();
});
