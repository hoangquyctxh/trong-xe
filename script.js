document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // BƯỚC QUAN TRỌNG: Dán URL Web App của bạn đã sao chép ở Phần 1 vào đây
    // =========================================================================
    const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwZFTXRHo-0i2HknQAV4Ja-7lZsH27VimRnDre7DnCL2j04lkSYI1BTmCKWCvcG-0jnFg/exec';
    // =========================================================================

    const addVehicleForm = document.getElementById('add-vehicle-form');
    const licensePlateInput = document.getElementById('license-plate');
    const vehicleListContainer = document.getElementById('vehicle-list-container');
    const addBtn = document.getElementById('add-btn');

    let vehiclesInLot = []; // Mảng tạm thời để hiển thị trên giao diện

    // Hàm hiển thị lại danh sách xe trên giao diện
    const renderVehicleList = () => {
        vehicleListContainer.innerHTML = '';
        if (vehiclesInLot.length === 0) {
            vehicleListContainer.innerHTML = '<p>Chưa có xe nào trong bãi.</p>';
            return;
        }

        vehiclesInLot.forEach(vehicle => {
            const vehicleItem = document.createElement('div');
            vehicleItem.className = 'vehicle-item';
            vehicleItem.innerHTML = `
                <div class="vehicle-info">
                    <div class="plate">${vehicle.plate}</div>
                    <div class="time">Vào lúc: ${new Date(vehicle.entryTime).toLocaleString('vi-VN')}</div>
                </div>
                <button class="checkout-btn" data-plate="${vehicle.plate}">Cho xe ra</button>
            `;
            vehicleListContainer.appendChild(vehicleItem);
        });
    };
    
    // Hàm gửi dữ liệu đến Google Sheet
    const sendDataToSheet = async (plate, action) => {
        addBtn.disabled = true; // Vô hiệu hóa nút để tránh spam
        addBtn.textContent = 'Đang xử lý...';

        try {
            const response = await fetch(WEB_APP_URL, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8', // Cần thiết cho Apps Script
                },
                body: JSON.stringify({ plate, action })
            });

            const result = await response.json();

            if (result.status === 'success') {
                return true;
            } else {
                alert(`Lỗi từ server: ${result.message}`);
                return false;
            }
        } catch (error) {
            alert(`Lỗi kết nối: Không thể gửi dữ liệu đến Google Sheet. Vui lòng kiểm tra lại URL trong file script.js và kết nối mạng.\nChi tiết lỗi: ${error}`);
            return false;
        } finally {
            addBtn.disabled = false;
            addBtn.textContent = 'Gửi xe';
        }
    };

    // Sự kiện thêm xe mới
    addVehicleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const plate = licensePlateInput.value.trim().toUpperCase();
        if (plate) {
            if (vehiclesInLot.some(v => v.plate === plate)) {
                alert('Lỗi: Biển số xe này đã có trong danh sách hiển thị!');
                return;
            }

            const success = await sendDataToSheet(plate, 'checkIn');
            
            if (success) {
                const newVehicle = {
                    plate: plate,
                    entryTime: new Date().toISOString()
                };
                vehiclesInLot.push(newVehicle);
                renderVehicleList();
                licensePlateInput.value = '';
                licensePlateInput.focus();
            }
        }
    });

    // Sự kiện cho xe ra
    vehicleListContainer.addEventListener('click', async (e) => {
        if (e.target.classList.contains('checkout-btn')) {
            const plate = e.target.dataset.plate;
            
            if (confirm(`Bạn có chắc chắn muốn cho xe có biển số [${plate}] ra khỏi bãi không?`)) {
                const success = await sendDataToSheet(plate, 'checkOut');
                
                if (success) {
                    vehiclesInLot = vehiclesInLot.filter(v => v.plate !== plate);
                    renderVehicleList();
                }
            }
        }
    });

    // Khởi chạy
    renderVehicleList();
});
