document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // Dán URL Web App của bạn vào đây
    const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwZFTXRHo-0i2HknQAV4Ja-7lZsH27VimRnDre7DnCL2j04lkSYI1BTmCKWCvcG-0jnFg/exec';
    // =========================================================================

    const vehicleForm = document.getElementById('vehicle-form');
    const searchTermInput = document.getElementById('search-term');
    const phoneNumberInput = document.getElementById('phone-number');
    const phoneInputWrapper = document.getElementById('phone-input-wrapper');
    const actionBtn = document.getElementById('action-btn');
    const statusMessage = document.getElementById('status-message');
    const vehicleListContainer = document.getElementById('vehicle-list-container');
    const vehicleCountSpan = document.getElementById('vehicle-count');
    const loader = document.getElementById('loader');

    let parkedVehicles = [];

    const fetchParkedVehicles = async () => {
        loader.style.display = 'flex'; // Hiện loader
        vehicleListContainer.innerHTML = '';
        try {
            const response = await fetch(WEB_APP_URL, { method: 'GET', mode: 'cors' });
            const result = await response.json();
            if (result.status === 'success') {
                parkedVehicles = result.data;
                renderVehicleList();
            } else { throw new Error(result.message); }
        } catch (error) {
            vehicleListContainer.innerHTML = `<p style="color: red; padding: 20px;">Lỗi tải dữ liệu: ${error.message}</p>`;
        } finally {
            loader.style.display = 'none'; // Ẩn loader
        }
    };

    const renderVehicleList = () => {
        vehicleListContainer.innerHTML = '';
        vehicleCountSpan.textContent = `${parkedVehicles.length} xe`;
        if (parkedVehicles.length === 0) {
            vehicleListContainer.innerHTML = `
                <div class="empty-state">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9L2 12v9c0 .6.4 1 1 1h2"/><path d="M7 12V2H3v10"/><path d="m16 12 3.1 3.9c.1.1.1.3 0 .4l-1.1.9c-.1.1-.3.1-.4 0L16 16v-4"/><path d="M5 18h3"/><path d="M6 18v-4"/></svg>
                    <p>Bãi xe hiện đang trống!</p>
                </div>`;
            return;
        }
        parkedVehicles.sort((a, b) => new Date(b.entryTime) - new Date(a.entryTime));
        parkedVehicles.forEach(vehicle => {
            const vehicleItem = document.createElement('div');
            vehicleItem.className = 'vehicle-item';
            const phoneInfo = vehicle.phone ? `<span>📞 ${vehicle.phone}</span>` : '';
            const carIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 16.5V18a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-1.5"/><path d="M19 12H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2Z"/><path d="M10.5 12V4.5a2.5 2.5 0 0 1 5 0V12"/><path d="M6 12V9c0-1.7 1.3-3 3-3h1"/></svg>`;

            vehicleItem.innerHTML = `
                <div class="icon">${carIcon}</div>
                <div class="info">
                    <div class="plate">${vehicle.plate}</div>
                    <div class="details">
                        ${phoneInfo}
                        <span>🕒 ${new Date(vehicle.entryTime).toLocaleString('vi-VN')}</span>
                    </div>
                </div>`;
            vehicleListContainer.appendChild(vehicleItem);
        });
    };

    const updateFormStatus = () => {
        const searchTerm = searchTermInput.value.trim().toUpperCase();
        statusMessage.textContent = '';
        statusMessage.classList.remove('visible');

        if (!searchTerm) {
            actionBtn.disabled = true;
            actionBtn.textContent = 'Nhập thông tin';
            actionBtn.className = '';
            phoneInputWrapper.style.display = 'block';
            return;
        }

        const foundVehicle = parkedVehicles.find(v => v.plate === searchTerm || (v.phone && v.phone === searchTerm));
        actionBtn.disabled = false;

        if (foundVehicle) {
            actionBtn.textContent = 'Xác nhận cho xe ra';
            actionBtn.className = 'btn-check-out';
            statusMessage.textContent = `Xe [${foundVehicle.plate}] của SĐT [${foundVehicle.phone || 'N/A'}] đang có trong bãi.`;
            statusMessage.className = 'status-parked visible';
            searchTermInput.value = foundVehicle.plate;
            phoneInputWrapper.style.display = 'none';
        } else {
            actionBtn.textContent = 'Xác nhận gửi xe';
            actionBtn.className = 'btn-check-in';
            statusMessage.textContent = `Xe [${searchTerm}] chưa có trong bãi, sẵn sàng để gửi.`;
            statusMessage.className = 'status-ready visible';
            phoneInputWrapper.style.display = 'block';
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
        
        if (foundVehicle) {
            handleVehicleAction(foundVehicle.plate, '', 'checkOut');
        } else {
            const phone = phoneNumberInput.value.trim();
            handleVehicleAction(searchTerm, phone, 'checkIn');
        }
    });

    fetchParkedVehicles();
});
