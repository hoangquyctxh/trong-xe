// admin.js
document.addEventListener('DOMContentLoaded', () => {
    const elements = {
        loader: document.getElementById('loader'),
        totalRevenue: document.getElementById('total-revenue'),
        totalVehicles: document.getElementById('total-vehicles'),
        currentVehicles: document.getElementById('current-vehicles'),
        trafficChartCanvas: document.getElementById('traffic-chart'),
        revenueChartCanvas: document.getElementById('revenue-chart'),
        vehiclesChartCanvas: document.getElementById('vehicles-chart'),
        revenueChartTitle: document.getElementById('revenue-chart-title'),
        vehiclesChartTitle: document.getElementById('vehicles-chart-title'),
        sidebar: document.querySelector('.sidebar'),
        pages: document.querySelectorAll('.page-content'),
        mapContainer: document.getElementById('map-container'),
        resetFilterBtn: document.getElementById('reset-filter-btn'),
        transactionLogBody: document.getElementById('transaction-log-body'),
        adminDatePicker: document.getElementById('admin-date-picker'),
        startSessionBtn: document.getElementById('start-session-btn'),
        editModal: document.getElementById('edit-transaction-modal'),
        editForm: document.getElementById('edit-transaction-form'),
        closeEditModalBtn: document.getElementById('close-edit-modal-btn'),
        cancelEditBtn: document.getElementById('cancel-edit-btn'),
        saveEditBtn: document.getElementById('save-edit-btn'),
        editUniqueID: document.getElementById('edit-unique-id'),
        editPlate: document.getElementById('edit-plate'),
        editEntryTime: document.getElementById('edit-entry-time'),
        editExitTime: document.getElementById('edit-exit-time'),
        editFee: document.getElementById('edit-fee'),
        editPaymentMethod: document.getElementById('edit-payment-method'),
        editStatus: document.getElementById('edit-status'),
    };

    const locationMap = (typeof LOCATIONS_CONFIG !== 'undefined' && Array.isArray(LOCATIONS_CONFIG)) 
        ? LOCATIONS_CONFIG.reduce((map, loc) => {
            if (loc && loc.id) {
                map[loc.id] = loc.name || loc.id;
            }
            return map;
        }, {})
        : {};

    const getLocationName = (locationId) => {
        return locationMap[locationId] || locationId || '--';
    };

    let trafficChart, revenueChart, vehiclesChart, map, fullAdminData, currentSecretKey, autoRefreshInterval;

    const formatCurrency = (value) => {
        const numValue = Number(value);
        return isNaN(numValue) ? '0' : numValue.toLocaleString('vi-VN');
    };

    const filterDataByLocation = (locationId) => {
        if (!fullAdminData) return;

// admin.js
document.addEventListener('DOMContentLoaded', () => {
    const elements = {
        loader: document.getElementById('loader'),
        totalRevenue: document.getElementById('total-revenue'),
        totalVehicles: document.getElementById('total-vehicles'),
        currentVehicles: document.getElementById('current-vehicles'),
        trafficChartCanvas: document.getElementById('traffic-chart'),
        revenueChartCanvas: document.getElementById('revenue-chart'),
        vehiclesChartCanvas: document.getElementById('vehicles-chart'),
        revenueChartTitle: document.getElementById('revenue-chart-title'),
        vehiclesChartTitle: document.getElementById('vehicles-chart-title'),
        sidebar: document.querySelector('.sidebar'),
        pages: document.querySelectorAll('.page-content'),
        mapContainer: document.getElementById('map-container'),
        resetFilterBtn: document.getElementById('reset-filter-btn'),
        transactionLogBody: document.getElementById('transaction-log-body'),
        adminDatePicker: document.getElementById('admin-date-picker'),
        startSessionBtn: document.getElementById('start-session-btn'),
        editModal: document.getElementById('edit-transaction-modal'),
        editForm: document.getElementById('edit-transaction-form'),
        closeEditModalBtn: document.getElementById('close-edit-modal-btn'),
        cancelEditBtn: document.getElementById('cancel-edit-btn'),
        saveEditBtn: document.getElementById('save-edit-btn'),
        editUniqueID: document.getElementById('edit-unique-id'),
        editPlate: document.getElementById('edit-plate'),
        editEntryTime: document.getElementById('edit-entry-time'),
        editExitTime: document.getElementById('edit-exit-time'),
        editFee: document.getElementById('edit-fee'),
        editPaymentMethod: document.getElementById('edit-payment-method'),
        editStatus: document.getElementById('edit-status'),
    };

    const locationMap = (typeof LOCATIONS_CONFIG !== 'undefined' && Array.isArray(LOCATIONS_CONFIG)) 
        ? LOCATIONS_CONFIG.reduce((map, loc) => {
            if (loc && loc.id) {
                map[loc.id] = loc.name || loc.id;
            }
            return map;
        }, {})
        : {};

    const getLocationName = (locationId) => {
        return locationMap[locationId] || locationId || '--';
    };

    let trafficChart, revenueChart, vehiclesChart, map, fullAdminData, currentSecretKey, autoRefreshInterval;

    const formatCurrency = (value) => {
        const numValue = Number(value);
        return isNaN(numValue) ? '0' : numValue.toLocaleString('vi-VN');
    };

    const filterDataByLocation = (locationId) => {
        if (!fullAdminData) return;

        const locationName = getLocationName(locationId);
        elements.resetFilterBtn.style.display = 'block';

        // Cập nhật thẻ thống kê
        elements.totalRevenue.innerHTML = `${formatCurrency(fullAdminData.revenueByLocation?.[locationId] || 0)} <sup>đ</sup>`;
        elements.totalVehicles.textContent = fullAdminData.vehiclesByLocation?.[locationId] || 0;
        elements.currentVehicles.textContent = 'N/A';

        // Cập nhật tiêu đề biểu đồ
        elements.revenueChartTitle.textContent = `Doanh thu (Lọc: )`;
        elements.vehiclesChartTitle.textContent = `Lượt xe (Lọc: )`;

        // Làm nổi bật biểu đồ
        highlightChartSlice(revenueChart, locationName);
        highlightChartSlice(vehiclesChart, locationName);
    };

    const resetFilter = () => {
        if (!fullAdminData) return;
        updateDashboardUI(fullAdminData); // Vẽ lại mọi thứ với dữ liệu đầy đủ
        elements.resetFilterBtn.style.display = 'none';
        elements.revenueChartTitle.textContent = 'Doanh thu theo bãi đỗ xe';
        elements.vehiclesChartTitle.textContent = 'Lượt xe theo bãi đỗ xe';
    };

    const highlightChartSlice = (chart, labelToHighlight) => {
        if (!chart || !chart.data) return;
        const labelIndex = chart.data.labels.indexOf(labelToHighlight);
        chart.data.datasets.forEach(dataset => {
            dataset.backgroundColor = dataset.originalBackgroundColor.map((color, index) => 
                index === labelIndex ? color.replace(/, 0\.\d+\)/, ', 1)') : color.replace(/, 1\)/, ', 0.2)')
            );
        });
        chart.update();
    };

    const updateMapPopups = (data) => {
        if (!map || !map.markers) return;

        Object.keys(map.markers).forEach(locationId => {
            const marker = map.markers[locationId];
            const loc = LOCATIONS_CONFIG.find(l => l.id === locationId);
            if (!marker || !loc) return;
            const revenue = data.revenueByLocation?.[loc.id] || 0;
            const vehicleCount = data.vehiclesByLocation?.[loc.id] || 0;
            const newPopupContent = `<div style="font-family: 'Be Vietnam Pro', sans-serif;"><h4 style="margin: 0 0 8px 0;">${loc.name}</h4><p style="margin: 0;"><strong>Lượt xe:</strong> </p><p style="margin: 0;"><strong>Doanh thu:</strong> ${formatCurrency(revenue)} đ</p></div>`;
            
            marker.setPopupContent(newPopupContent);
        });
    };

    const initMap = (data) => {
        if (map) {
            map.remove();
        }

        map = L.map(elements.mapContainer).setView([21.035, 105.84], 14);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        map.markers = {};

        LOCATIONS_CONFIG.forEach(loc => {
            const revenue = data.revenueByLocation?.[loc.id] || 0;
            const vehicleCount = data.vehiclesByLocation?.[loc.id] || 0;

            const popupContent = `<div style="font-family: 'Be Vietnam Pro', sans-serif;"><h4 style="margin: 0 0 8px 0;">${getLocationName(loc.id)}</h4><p style="margin: 0;"><strong>Lượt xe:</strong> </p><p style="margin: 0;"><strong>Doanh thu:</strong> ${formatCurrency(revenue)} đ</p></div>`;

            const marker = L.marker([loc.lat, loc.lng])
                .addTo(map)
                .bindPopup(popupContent);

            map.markers[loc.id] = marker;

            marker.on('click', () => {
                filterDataByLocation(loc.id);
            });
        });
    };

    const setupNavigation = () => {
        if (!elements.sidebar) return;

        elements.sidebar.addEventListener('click', (e) => {
            const link = e.target.closest('.nav-link');
            if (!link) return;

            e.preventDefault();
            const targetId = link.dataset.target;

            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            elements.pages.forEach(page => page.classList.toggle('active', page.id === targetId));

            if (targetId === 'page-map' && map) {
                setTimeout(() => map.invalidateSize(), 10);
            }
        });
    };

    const renderTransactionTable = (transactions) => {
        if (!elements.transactionLogBody) return;
        elements.transactionLogBody.innerHTML = '';

        if (!transactions || transactions.length === 0) {
            elements.transactionLogBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px;">Không có giao dịch.</td></tr>`;
            return;
        }

        transactions.forEach(tx => {
            const row = document.createElement('tr');
            const statusClass = tx.Status === 'Đang gửi' ? 'parking' : 'departed';
            const feeDisplay = tx.Fee ? `${formatCurrency(tx.Fee)}đ` : '--';
            const exitTimeDisplay = tx['Exit Time'] ? new Date(tx['Exit Time']).toLocaleString('vi-VN') : '--';
            
            row.innerHTML = `
                <td class="plate">${tx.Plate || '--'}</td>
                <td>${new Date(tx['Entry Time']).toLocaleString('vi-VN')}</td>
                <td></td>
                <td class="fee"></td>
                <td>${tx['Payment Method'] || '--'}</td>
                <td>${getLocationName(tx.LocationID)}</td>
                <td style="text-align: center;"><span class="status-badge ">${tx.Status}</span></td>
                <td style="text-align: center;"><button class="edit-btn" data-uniqueid="${tx.UniqueID}">Sửa</button></td>
            `;
            elements.transactionLogBody.appendChild(row);
        });
    };

    const openEditModal = (uniqueID) => {
        const transaction = fullAdminData.transactions.find(tx => tx.UniqueID === uniqueID);
        if (!transaction) {
            alert('Không tìm thấy giao dịch.');
            return;
        }

        const toLocalISOString = (date) => {
            if (!date) return '';
            const dt = new Date(date);
            dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
            return dt.toISOString().slice(0, 16);
        };

        elements.editUniqueID.value = transaction.UniqueID;
        elements.editPlate.value = transaction.Plate || '';
        elements.editEntryTime.value = toLocalISOString(transaction['Entry Time']);
        elements.editExitTime.value = toLocalISOString(transaction['Exit Time']);
        elements.editFee.value = transaction.Fee ?? '';
        elements.editPaymentMethod.value = transaction['Payment Method'] || '';
        elements.editStatus.value = transaction.Status || 'Đã rời bãi';

        elements.editModal.style.display = 'flex';
    };

    const closeEditModal = () => {
        elements.editModal.style.display = 'none';
        elements.editForm.reset();
    };

    const saveTransactionChanges = async (event) => {
        event.preventDefault();
        elements.saveEditBtn.disabled = true;
        elements.saveEditBtn.textContent = 'Đang lưu...';

        const payload = {
            action: 'editTransaction',
            uniqueID: elements.editUniqueID.value,
            plate: elements.editPlate.value,
            entryTime: elements.editEntryTime.value ? new Date(elements.editEntryTime.value).toISOString() : null,
            exitTime: elements.editExitTime.value ? new Date(elements.editExitTime.value).toISOString() : null,
            fee: elements.editFee.value,
            paymentMethod: elements.editPaymentMethod.value,
            status: elements.editStatus.value,
            secret: currentSecretKey
        };

        try {
            const response = await fetch(APP_CONFIG.googleScriptUrl, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
                alert('Cập nhật thành công!');
                closeEditModal();
                fetchAdminData(currentSecretKey, true, elements.adminDatePicker.value);
        } catch (error) {
            alert(`Lỗi khi lưu: ${error.message}`);
        } finally {
            elements.saveEditBtn.disabled = false;
            elements.saveEditBtn.textContent = 'Lưu thay đổi';
        }
    };

    const updateDashboardUI = (data, isSilentUpdate = false) => {
        fullAdminData = data;

        elements.totalRevenue.innerHTML = `${formatCurrency(data?.totalRevenueToday ?? 0)} <sup>đ</sup>`;
        elements.totalVehicles.textContent = data?.totalVehiclesToday ?? 0;
        elements.currentVehicles.textContent = data?.vehiclesCurrentlyParking ?? 0;

        renderTransactionTable(data?.transactions || []);

        const locationData = {
            names: [],
            revenue: [],
            vehicles: []
        };

        // SỬA LỖI: Thêm kiểm tra an toàn cho các đối tượng location
        if (data?.revenueByLocation && data?.vehiclesByLocation) {
            Object.keys(data.revenueByLocation).forEach(id => {
                locationData.names.push(getLocationName(id));
                locationData.revenue.push(data.revenueByLocation[id] || 0);
                locationData.vehicles.push(data.vehiclesByLocation[id] || 0);
            });
        }

        // SỬA LỖI: Thêm kiểm tra an toàn cho dữ liệu biểu đồ traffic
        const trafficData = data?.trafficByHour || Array(24).fill(0);
        if (trafficChart) trafficChart.destroy();
        trafficChart = new Chart(elements.trafficChartCanvas, {
            type: 'bar',
            data: {
                labels: Array.from({ length: 24 }, (_, i) => `h`),
                datasets: [{
                    label: 'Số lượt xe vào',
                    data: trafficData,
                    backgroundColor: 'rgba(0, 123, 255, 0.7)',
                    borderColor: 'rgba(0, 123, 255, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { 
                        beginAtZero: true, 
                        ticks: { 
                            stepSize: 1 
                        } 
                    }
                },
                plugins: { legend: { display: false } }
            }
        });

        const chartColors = ['rgba(40, 167, 69, 0.8)', 'rgba(255, 193, 7, 0.8)', 'rgba(23, 162, 184, 0.8)', 'rgba(220, 53, 69, 0.8)', 'rgba(108, 117, 125, 0.8)'];
        
        if (revenueChart) revenueChart.destroy();
        revenueChart = new Chart(elements.revenueChartCanvas, {
            type: 'doughnut',
            data: {
                labels: locationData.names,
                datasets: [{
                    label: 'Doanh thu',
                    data: locationData.revenue,
                    backgroundColor: chartColors,
                    originalBackgroundColor: [...chartColors]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.label || ''}: ${formatCurrency(context.parsed)} đ`;
                            }
                        }
                    }
                }
            }
        });

        if (vehiclesChart) vehiclesChart.destroy();
        vehiclesChart = new Chart(elements.vehiclesChartCanvas, {
            type: 'pie',
            data: {
                labels: locationData.names,
                datasets: [{
                    label: 'Lượt xe',
                    data: locationData.vehicles,
                    backgroundColor: [...chartColors].reverse(),
                    originalBackgroundColor: [...chartColors].reverse()
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } }
            }
        });

        if (!map && typeof L !== 'undefined' && LOCATIONS_CONFIG) {
            initMap(data);
        } else if (isSilentUpdate) {
            updateMapPopups(data);
        }
    };

    const setTodayDate = () => {
        const today = new Date();
        const formatDateForAPI = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `--`;
        };
        const formattedDate = formatDateForAPI(new Date());
        if (elements.adminDatePicker) {
            elements.adminDatePicker.value = formattedDate;
        }
        return formattedDate;
    };

    const fetchAdminData = async (secretKey, isSilent = false, date = null) => {
        try {
            const dateParam = date ? `&date=` : '';
            const response = await fetch(`${APP_CONFIG.googleScriptUrl}?action=getAdminData&secret=&v=${new Date().getTime()}`);

            if (!response.ok) {
                throw new Error(`Lỗi mạng: ${response.statusText}`);
            }
            const result = await response.json();

            if (result.status !== 'success' || !result.data) {
                throw new Error(result.message || 'Lỗi không xác định từ server');
            }

            updateDashboardUI(result.data, isSilent);
            return true;
        } catch (error) {
            if (!isSilent) {
                alert(`Không thể tải dữ liệu quản trị: ${error.message}`);
                console.error('ADMIN ERROR LOG:', error);
                showLoginScreen('Đã xảy ra lỗi. Vui lòng thử lại.');
            }
            return false;
        }
    };

    const startAdminSession = async () => {
        try {
            if (elements.loader) {
                elements.loader.querySelector('span').textContent = 'Đang xác thực và tải dữ liệu...';
                elements.loader.querySelector('.spinner').style.display = 'block';
                elements.startSessionBtn.style.display = 'none';
            }
    
            const secretKey = prompt("Vui lòng nhập mật khẩu quản trị:", "");
            if (!secretKey) {
                showLoginScreen('Cần có mật khẩu để truy cập.');
                return;
            }
            currentSecretKey = secretKey;
    
            const dateToFetch = elements.adminDatePicker.value;
    
            const success = await fetchAdminData(secretKey, false, dateToFetch);
    
            if (success) {
                elements.loader.style.display = 'none';
                if (autoRefreshInterval) clearInterval(autoRefreshInterval);
                autoRefreshInterval = setInterval(() => {
                    const currentDate = elements.adminDatePicker.value;
                    fetchAdminData(secretKey, true, currentDate);
                }, APP_CONFIG.autoRefreshInterval || 30000);
            }

        } catch (error) {
            console.error("Lỗi nghiêm trọng khi bắt đầu phiên quản trị:", error);
            if (elements.loader) {
                elements.loader.style.display = 'none';
            }
            alert("Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.");
        }
    };

    const showLoginScreen = (message) => {
        if (elements.loader) {
            elements.loader.style.display = 'flex';
            elements.loader.querySelector('span').textContent = message || 'Vui lòng xác nhận để truy cập trang quản trị.';
            elements.loader.querySelector('.spinner').style.display = 'none';
            elements.startSessionBtn.style.display = 'block';
        }
    };

    const init = () => {
        try {
            setTodayDate();
            setupNavigation();
    
            if (elements.resetFilterBtn) elements.resetFilterBtn.addEventListener('click', resetFilter);
            if (elements.adminDatePicker) elements.adminDatePicker.addEventListener('change', () => {
                if (currentSecretKey) fetchAdminData(currentSecretKey, false, elements.adminDatePicker.value);
            });
            if (elements.transactionLogBody) elements.transactionLogBody.addEventListener('click', (e) => { if (e.target.classList.contains('edit-btn')) openEditModal(e.target.dataset.uniqueid); });
            if (elements.closeEditModalBtn) elements.closeEditModalBtn.addEventListener('click', closeEditModal);
            if (elements.cancelEditBtn) elements.cancelEditBtn.addEventListener('click', closeEditModal);
            if (elements.editForm) elements.editForm.addEventListener('submit', saveTransactionChanges);
            if (elements.startSessionBtn) elements.startSessionBtn.addEventListener('click', startAdminSession);
    
            showLoginScreen('Vui lòng xác nhận để truy cập trang quản trị.');
        } catch (error) {
            console.error("Lỗi trong quá trình khởi tạo:", error);
            document.body.innerHTML = `<h1 style="text-align: center; margin-top: 50px;">LỖI KHỞI TẠO TRANG. VUI LÒNG TẢI LẠI.</h1><p style="text-align: center;">Chi tiết: ${error.message}</p>`;
        }
    };

    init();
});
// admin.js
document.addEventListener('DOMContentLoaded', () => {
    const elements = {
        loader: document.getElementById('loader'),
        totalRevenue: document.getElementById('total-revenue'),
        totalVehicles: document.getElementById('total-vehicles'),
        currentVehicles: document.getElementById('current-vehicles'),
        trafficChartCanvas: document.getElementById('traffic-chart'),
        revenueChartCanvas: document.getElementById('revenue-chart'),
        vehiclesChartCanvas: document.getElementById('vehicles-chart'),
        revenueChartTitle: document.getElementById('revenue-chart-title'),
        vehiclesChartTitle: document.getElementById('vehicles-chart-title'),
        sidebar: document.querySelector('.sidebar'),
        pages: document.querySelectorAll('.page-content'),
        mapContainer: document.getElementById('map-container'),
        resetFilterBtn: document.getElementById('reset-filter-btn'),
        transactionLogBody: document.getElementById('transaction-log-body'),
        adminDatePicker: document.getElementById('admin-date-picker'),
        startSessionBtn: document.getElementById('start-session-btn'),
        editModal: document.getElementById('edit-transaction-modal'),
        editForm: document.getElementById('edit-transaction-form'),
        closeEditModalBtn: document.getElementById('close-edit-modal-btn'),
        cancelEditBtn: document.getElementById('cancel-edit-btn'),
        saveEditBtn: document.getElementById('save-edit-btn'),
        editUniqueID: document.getElementById('edit-unique-id'),
        editPlate: document.getElementById('edit-plate'),
        editEntryTime: document.getElementById('edit-entry-time'),
        editExitTime: document.getElementById('edit-exit-time'),
        editFee: document.getElementById('edit-fee'),
        editPaymentMethod: document.getElementById('edit-payment-method'),
        editStatus: document.getElementById('edit-status'),
    };

    const locationMap = (typeof LOCATIONS_CONFIG !== 'undefined' && Array.isArray(LOCATIONS_CONFIG)) 
        ? LOCATIONS_CONFIG.reduce((map, loc) => {
            if (loc && loc.id) {
                map[loc.id] = loc.name || loc.id;
            }
            return map;
        }, {})
        : {};

    const getLocationName = (locationId) => {
        return locationMap[locationId] || locationId || '--';
    };

    let trafficChart, revenueChart, vehiclesChart, map, fullAdminData, currentSecretKey, autoRefreshInterval;

    const formatCurrency = (value) => {
        const numValue = Number(value);
        return isNaN(numValue) ? '0' : numValue.toLocaleString('vi-VN');
    };

    const filterDataByLocation = (locationId) => {
        if (!fullAdminData) return;

        const locationName = getLocationName(locationId);
        elements.resetFilterBtn.style.display = 'block';

        // Lọc các giao dịch đang gửi tại địa điểm được chọn
        const currentVehiclesAtLocation = fullAdminData.transactions.filter(tx => tx.LocationID === locationId && tx.Status === 'Đang gửi').length;

        // Cập nhật thẻ thống kê
        elements.totalRevenue.innerHTML = `${formatCurrency(fullAdminData.revenueByLocation?.[locationId] || 0)} <sup>đ</sup>`;
        elements.totalVehicles.textContent = fullAdminData.vehiclesByLocation?.[locationId] || 0;
        // Cập nhật số xe đang gửi cho địa điểm cụ thể
        elements.currentVehicles.textContent = currentVehiclesAtLocation;

        // Cập nhật tiêu đề biểu đồ
        elements.revenueChartTitle.textContent = `Doanh thu (Lọc: ${locationName})`;
        elements.vehiclesChartTitle.textContent = `Lượt xe (Lọc: ${locationName})`;

        // Làm nổi bật biểu đồ
        highlightChartSlice(revenueChart, locationName);
        highlightChartSlice(vehiclesChart, locationName);
    };

    const resetFilter = () => {
        if (!fullAdminData) return;
        updateDashboardUI(fullAdminData); // Vẽ lại mọi thứ với dữ liệu đầy đủ
        elements.resetFilterBtn.style.display = 'none';
        elements.revenueChartTitle.textContent = 'Doanh thu theo bãi đỗ xe';
        elements.vehiclesChartTitle.textContent = 'Lượt xe theo bãi đỗ xe';
    };

    const highlightChartSlice = (chart, labelToHighlight) => {
        if (!chart || !chart.data) return;
        const labelIndex = chart.data.labels.indexOf(labelToHighlight);
        chart.data.datasets.forEach(dataset => {
            dataset.backgroundColor = dataset.originalBackgroundColor.map((color, index) => 
                index === labelIndex ? color.replace(/, 0\.\d+\)/, ', 1)') : color.replace(/, 1\)/, ', 0.2)')
            );
        });
        chart.update();
    };

    const updateMapPopups = (data) => {
        if (!map || !map.markers) return;

        Object.keys(map.markers).forEach(locationId => {
            const marker = map.markers[locationId];
            const loc = LOCATIONS_CONFIG.find(l => l.id === locationId);
            if (!marker || !loc) return;
            const revenue = data.revenueByLocation?.[loc.id] || 0;
            const vehicleCount = data.vehiclesByLocation?.[loc.id] || 0;
            const newPopupContent = `<div style="font-family: 'Be Vietnam Pro', sans-serif;"><h4 style="margin: 0 0 8px 0;">${loc.name}</h4><p style="margin: 0;"><strong>Lượt xe:</strong> ${vehicleCount}</p><p style="margin: 0;"><strong>Doanh thu:</strong> ${formatCurrency(revenue)} đ</p></div>`;
            
            marker.setPopupContent(newPopupContent);
        });
    };

    const initMap = (data) => {
        if (map) {
            map.remove();
        }

        map = L.map(elements.mapContainer).setView([21.035, 105.84], 14);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        map.markers = {};

        LOCATIONS_CONFIG.forEach(loc => {
            const revenue = data.revenueByLocation?.[loc.id] || 0;
            const vehicleCount = data.vehiclesByLocation?.[loc.id] || 0;

            const popupContent = `<div style="font-family: 'Be Vietnam Pro', sans-serif;"><h4 style="margin: 0 0 8px 0;">${getLocationName(loc.id)}</h4><p style="margin: 0;"><strong>Lượt xe:</strong> ${vehicleCount}</p><p style="margin: 0;"><strong>Doanh thu:</strong> ${formatCurrency(revenue)} đ</p></div>`;

            const marker = L.marker([loc.lat, loc.lng])
                .addTo(map)
                .bindPopup(popupContent);

            map.markers[loc.id] = marker;

            marker.on('click', () => {
                filterDataByLocation(loc.id);
            });
        });
    };

    const setupNavigation = () => {
        if (!elements.sidebar) return;

        elements.sidebar.addEventListener('click', (e) => {
            const link = e.target.closest('.nav-link');
            if (!link) return;

            e.preventDefault();
            const targetId = link.dataset.target;

            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            elements.pages.forEach(page => page.classList.toggle('active', page.id === targetId));

            if (targetId === 'page-map' && map) {
                setTimeout(() => map.invalidateSize(), 10);
            }
        });
    };

    const renderTransactionTable = (transactions) => {
        if (!elements.transactionLogBody) return;
        elements.transactionLogBody.innerHTML = '';

        if (!transactions || transactions.length === 0) {
            elements.transactionLogBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px;">Không có giao dịch.</td></tr>`;
            return;
        }

        transactions.forEach(tx => {
            const row = document.createElement('tr');
            const statusClass = tx.Status === 'Đang gửi' ? 'parking' : 'departed';
            const feeDisplay = tx.Fee ? `${formatCurrency(tx.Fee)}đ` : '--';
            const exitTimeDisplay = tx['Exit Time'] ? new Date(tx['Exit Time']).toLocaleString('vi-VN') : '--';
            
            row.innerHTML = `
                <td class="plate">${tx.Plate || '--'}</td>
                <td>${new Date(tx['Entry Time']).toLocaleString('vi-VN')}</td>
                <td>${exitTimeDisplay}</td>
                <td class="fee">${feeDisplay}</td>
                <td>${tx['Payment Method'] || '--'}</td>
                <td>${getLocationName(tx.LocationID)}</td>
                <td style="text-align: center;"><span class="status-badge ${statusClass}">${tx.Status}</span></td>
                <td style="text-align: center;"><button class="edit-btn" data-uniqueid="${tx.UniqueID}">Sửa</button></td>
            `;
            elements.transactionLogBody.appendChild(row);
        });
    };

    const openEditModal = (uniqueID) => {
        const transaction = fullAdminData.transactions.find(tx => tx.UniqueID === uniqueID);
        if (!transaction) {
            alert('Không tìm thấy giao dịch.');
            return;
        }

        const toLocalISOString = (date) => {
            if (!date) return '';
            const dt = new Date(date);
            dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
            return dt.toISOString().slice(0, 16);
        };

        elements.editUniqueID.value = transaction.UniqueID;
        elements.editPlate.value = transaction.Plate || '';
        elements.editEntryTime.value = toLocalISOString(transaction['Entry Time']);
        elements.editExitTime.value = toLocalISOString(transaction['Exit Time']);
        elements.editFee.value = transaction.Fee ?? '';
        elements.editPaymentMethod.value = transaction['Payment Method'] || '';
        elements.editStatus.value = transaction.Status || 'Đã rời bãi';

        elements.editModal.style.display = 'flex';
    };

    const closeEditModal = () => {
        elements.editModal.style.display = 'none';
        elements.editForm.reset();
    };

    const saveTransactionChanges = async (event) => {
        event.preventDefault();
        elements.saveEditBtn.disabled = true;
        elements.saveEditBtn.textContent = 'Đang lưu...';

        const payload = {
            action: 'editTransaction',
            uniqueID: elements.editUniqueID.value,
            plate: elements.editPlate.value,
            entryTime: elements.editEntryTime.value ? new Date(elements.editEntryTime.value).toISOString() : null,
            exitTime: elements.editExitTime.value ? new Date(elements.editExitTime.value).toISOString() : null,
            fee: elements.editFee.value,
            paymentMethod: elements.editPaymentMethod.value,
            status: elements.editStatus.value,
            secret: currentSecretKey
        };

        try {
            const response = await fetch(APP_CONFIG.googleScriptUrl, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
                alert('Cập nhật thành công!');
                closeEditModal();
                fetchAdminData(currentSecretKey, true, elements.adminDatePicker.value);
        } catch (error) {
            alert(`Lỗi khi lưu: ${error.message}`);
        } finally {
            elements.saveEditBtn.disabled = false;
            elements.saveEditBtn.textContent = 'Lưu thay đổi';
        }
    };

    const updateDashboardUI = (data, isSilentUpdate = false) => {
        fullAdminData = data;

        elements.totalRevenue.innerHTML = `${formatCurrency(data?.totalRevenueToday ?? 0)} <sup>đ</sup>`;
        elements.totalVehicles.textContent = data?.totalVehiclesToday ?? 0;
        elements.currentVehicles.textContent = data?.vehiclesCurrentlyParking ?? 0;

        renderTransactionTable(data?.transactions || []);

        const locationData = {
            names: [],
            revenue: [],
            vehicles: []
        };

        if (data?.revenueByLocation && data?.vehiclesByLocation) {
            Object.keys(data.revenueByLocation).forEach(id => {
                locationData.names.push(getLocationName(id));
                locationData.revenue.push(data.revenueByLocation[id] || 0);
                locationData.vehicles.push(data.vehiclesByLocation[id] || 0);
            });
        }

        // SỬA LỖI: Thêm kiểm tra an toàn cho dữ liệu biểu đồ traffic
        const trafficData = data?.trafficByHour || Array(24).fill(0);
        if (trafficChart) trafficChart.destroy();
        trafficChart = new Chart(elements.trafficChartCanvas, {
            type: 'bar',
            data: {
                labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
                datasets: [{
                    label: 'Số lượt xe vào',
                    data: trafficData,
                    backgroundColor: 'rgba(0, 123, 255, 0.7)',
                    borderColor: 'rgba(0, 123, 255, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { 
                        beginAtZero: true, 
                        ticks: { 
                            stepSize: 1 
                        } 
                    }
                },
                plugins: { legend: { display: false } }
            }
        });

        const chartColors = ['rgba(40, 167, 69, 0.8)', 'rgba(255, 193, 7, 0.8)', 'rgba(23, 162, 184, 0.8)', 'rgba(220, 53, 69, 0.8)', 'rgba(108, 117, 125, 0.8)'];
        
        if (revenueChart) revenueChart.destroy();
        revenueChart = new Chart(elements.revenueChartCanvas, {
            type: 'doughnut',
            data: {
                labels: locationData.names,
                datasets: [{
                    label: 'Doanh thu',
                    data: locationData.revenue,
                    backgroundColor: chartColors,
                    originalBackgroundColor: [...chartColors]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.label || ''}: ${formatCurrency(context.parsed)} đ`;
                            }
                        }
                    }
                }
            }
        });

        if (vehiclesChart) vehiclesChart.destroy();
        vehiclesChart = new Chart(elements.vehiclesChartCanvas, {
            type: 'pie',
            data: {
                labels: locationData.names,
                datasets: [{
                    label: 'Lượt xe',
                    data: locationData.vehicles,
                    backgroundColor: [...chartColors].reverse(),
                    originalBackgroundColor: [...chartColors].reverse()
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } }
            }
        });

        if (!map && typeof L !== 'undefined' && LOCATIONS_CONFIG) {
            initMap(data);
        } else if (isSilentUpdate) {
            updateMapPopups(data);
        }
    };

    const setTodayDate = () => {
        const today = new Date();
        const formatDateForAPI = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        const formattedDate = formatDateForAPI(new Date());
        if (elements.adminDatePicker) {
            elements.adminDatePicker.value = formattedDate;
        }
        return formattedDate;
    };

    const fetchAdminData = async (secretKey, isSilent = false, date = null) => {
        try {
            const dateParam = date ? `&date=${date}` : '';
            const response = await fetch(`${APP_CONFIG.googleScriptUrl}?action=getAdminData&secret=${secretKey}${dateParam}&v=${new Date().getTime()}`);

            if (!response.ok) {
                throw new Error(`Lỗi mạng: ${response.statusText}`);
            }
            const result = await response.json();

            if (result.status !== 'success' || !result.data) {
                throw new Error(result.message || 'Lỗi không xác định từ server');
            }

            updateDashboardUI(result.data, isSilent);
            return true;
        } catch (error) {
            if (!isSilent) {
                alert(`Không thể tải dữ liệu quản trị: ${error.message}`);
                console.error('ADMIN ERROR LOG:', error);
                showLoginScreen('Đã xảy ra lỗi. Vui lòng thử lại.');
            }
            return false;
        }
    };

    const startAdminSession = async () => {
        try {
            if (elements.loader) {
                elements.loader.querySelector('span').textContent = 'Đang xác thực và tải dữ liệu...';
                elements.loader.querySelector('.spinner').style.display = 'block';
                elements.startSessionBtn.style.display = 'none';
            }
    
            const secretKey = prompt("Vui lòng nhập mật khẩu quản trị:", "");
            if (!secretKey) {
                showLoginScreen('Cần có mật khẩu để truy cập.');
                return;
            }
            currentSecretKey = secretKey;
    
            const dateToFetch = elements.adminDatePicker.value;
    
            const success = await fetchAdminData(secretKey, false, dateToFetch);
    
            if (success) {
                elements.loader.style.display = 'none';
                if (autoRefreshInterval) clearInterval(autoRefreshInterval);
                autoRefreshInterval = setInterval(() => {
                    const currentDate = elements.adminDatePicker.value;
                    fetchAdminData(secretKey, true, currentDate);
                }, APP_CONFIG.autoRefreshInterval || 30000);
            }

        } catch (error) {
            console.error("Lỗi nghiêm trọng khi bắt đầu phiên quản trị:", error);
            if (elements.loader) {
                elements.loader.style.display = 'none';
            }
            alert("Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.");
        }
    };

    const showLoginScreen = (message) => {
        if (elements.loader) {
            elements.loader.style.display = 'flex';
            elements.loader.querySelector('span').textContent = message || 'Vui lòng xác nhận để truy cập trang quản trị.';
            elements.loader.querySelector('.spinner').style.display = 'none';
            elements.startSessionBtn.style.display = 'block';
        }
    };

    const init = () => {
        try {
            setTodayDate();
            setupNavigation();
    // admin.js
    document.addEventListener('DOMContentLoaded', () => {
        const elements = {
            loader: document.getElementById('loader'),
            totalRevenue: document.getElementById('total-revenue'),
            totalVehicles: document.getElementById('total-vehicles'),
            currentVehicles: document.getElementById('current-vehicles'),
            trafficChartCanvas: document.getElementById('traffic-chart'),
            revenueChartCanvas: document.getElementById('revenue-chart'),
            vehiclesChartCanvas: document.getElementById('vehicles-chart'),
            revenueChartTitle: document.getElementById('revenue-chart-title'),
            vehiclesChartTitle: document.getElementById('vehicles-chart-title'),
            sidebar: document.querySelector('.sidebar'),
            pages: document.querySelectorAll('.page-content'),
            mapContainer: document.getElementById('map-container'),
            resetFilterBtn: document.getElementById('reset-filter-btn'),
            transactionLogBody: document.getElementById('transaction-log-body'),
            adminDatePicker: document.getElementById('admin-date-picker'),
            startSessionBtn: document.getElementById('start-session-btn'),
            editModal: document.getElementById('edit-transaction-modal'),
            editForm: document.getElementById('edit-transaction-form'),
            closeEditModalBtn: document.getElementById('close-edit-modal-btn'),
            cancelEditBtn: document.getElementById('cancel-edit-btn'),
            saveEditBtn: document.getElementById('save-edit-btn'),
            editUniqueID: document.getElementById('edit-unique-id'),
            editPlate: document.getElementById('edit-plate'),
            editEntryTime: document.getElementById('edit-entry-time'),
            editExitTime: document.getElementById('edit-exit-time'),
            editFee: document.getElementById('edit-fee'),
            editPaymentMethod: document.getElementById('edit-payment-method'),
            editStatus: document.getElementById('edit-status'),
        };
    
        const locationMap = (typeof LOCATIONS_CONFIG !== 'undefined' && Array.isArray(LOCATIONS_CONFIG)) 
            ? LOCATIONS_CONFIG.reduce((map, loc) => {
                if (loc && loc.id) {
                    map[loc.id] = loc.name || loc.id;
                }
                return map;
            }, {})
            : {};
    
        const getLocationName = (locationId) => {
            return locationMap[locationId] || locationId || '--';
        };
    
        let trafficChart, revenueChart, vehiclesChart, map, fullAdminData, currentSecretKey, autoRefreshInterval;
    
        const formatCurrency = (value) => {
            const numValue = Number(value);
            return isNaN(numValue) ? '0' : numValue.toLocaleString('vi-VN');
        };
    
        const filterDataByLocation = (locationId) => {
            if (!fullAdminData) return;
    
            const locationName = getLocationName(locationId);
            elements.resetFilterBtn.style.display = 'block';
    
            // Cập nhật thẻ thống kê
            elements.totalRevenue.innerHTML = `${formatCurrency(fullAdminData.revenueByLocation?.[locationId] || 0)} <sup>đ</sup>`;
            elements.totalVehicles.textContent = fullAdminData.vehiclesByLocation?.[locationId] || 0;
            elements.currentVehicles.textContent = 'N/A';
    
            // Cập nhật tiêu đề biểu đồ
            elements.revenueChartTitle.textContent = `Doanh thu (Lọc: )`;
            elements.vehiclesChartTitle.textContent = `Lượt xe (Lọc: )`;
    
            // Làm nổi bật biểu đồ
            highlightChartSlice(revenueChart, locationName);
            highlightChartSlice(vehiclesChart, locationName);
        };
    
        const resetFilter = () => {
            if (!fullAdminData) return;
            updateDashboardUI(fullAdminData); // Vẽ lại mọi thứ với dữ liệu đầy đủ
            elements.resetFilterBtn.style.display = 'none';
            elements.revenueChartTitle.textContent = 'Doanh thu theo bãi đỗ xe';
            elements.vehiclesChartTitle.textContent = 'Lượt xe theo bãi đỗ xe';
        };
    
        const highlightChartSlice = (chart, labelToHighlight) => {
            if (!chart || !chart.data) return;
            const labelIndex = chart.data.labels.indexOf(labelToHighlight);
            chart.data.datasets.forEach(dataset => {
                dataset.backgroundColor = dataset.originalBackgroundColor.map((color, index) => 
                    index === labelIndex ? color.replace(/, 0\.\d+\)/, ', 1)') : color.replace(/, 1\)/, ', 0.2)')
                );
            });
            chart.update();
        };
    
        const updateMapPopups = (data) => {
            if (!map || !map.markers) return;
    
            Object.keys(map.markers).forEach(locationId => {
                const marker = map.markers[locationId];
                const loc = LOCATIONS_CONFIG.find(l => l.id === locationId);
                if (!marker || !loc) return;
                const revenue = data.revenueByLocation?.[loc.id] || 0;
                const vehicleCount = data.vehiclesByLocation?.[loc.id] || 0;
                const newPopupContent = `<div style="font-family: 'Be Vietnam Pro', sans-serif;"><h4 style="margin: 0 0 8px 0;">${loc.name}</h4><p style="margin: 0;"><strong>Lượt xe:</strong> </p><p style="margin: 0;"><strong>Doanh thu:</strong> ${formatCurrency(revenue)} đ</p></div>`;
                
                marker.setPopupContent(newPopupContent);
            });
        };
    
        const initMap = (data) => {
            if (map) {
                map.remove();
            }
    
            map = L.map(elements.mapContainer).setView([21.035, 105.84], 14);
    
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);
    
            map.markers = {};
    
            LOCATIONS_CONFIG.forEach(loc => {
                const revenue = data.revenueByLocation?.[loc.id] || 0;
                const vehicleCount = data.vehiclesByLocation?.[loc.id] || 0;
    
                const popupContent = `<div style="font-family: 'Be Vietnam Pro', sans-serif;"><h4 style="margin: 0 0 8px 0;">${getLocationName(loc.id)}</h4><p style="margin: 0;"><strong>Lượt xe:</strong> </p><p style="margin: 0;"><strong>Doanh thu:</strong> ${formatCurrency(revenue)} đ</p></div>`;
    
                const marker = L.marker([loc.lat, loc.lng])
                    .addTo(map)
                    .bindPopup(popupContent);
    
                map.markers[loc.id] = marker;
    
                marker.on('click', () => {
                    filterDataByLocation(loc.id);
                });
            });
        };
    
        const setupNavigation = () => {
            if (!elements.sidebar) return;
    
            elements.sidebar.addEventListener('click', (e) => {
                const link = e.target.closest('.nav-link');
                if (!link) return;
    
                e.preventDefault();
                const targetId = link.dataset.target;
    
                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
    
                elements.pages.forEach(page => page.classList.toggle('active', page.id === targetId));
    
                if (targetId === 'page-map' && map) {
                    setTimeout(() => map.invalidateSize(), 10);
                }
            });
        };
    
        const renderTransactionTable = (transactions) => {
            if (!elements.transactionLogBody) return;
            elements.transactionLogBody.innerHTML = '';
    
            if (!transactions || transactions.length === 0) {
                elements.transactionLogBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px;">Không có giao dịch.</td></tr>`;
                return;
            }
    
            transactions.forEach(tx => {
                const row = document.createElement('tr');
                const statusClass = tx.Status === 'Đang gửi' ? 'parking' : 'departed';
                const feeDisplay = tx.Fee ? `${formatCurrency(tx.Fee)}đ` : '--';
                const exitTimeDisplay = tx['Exit Time'] ? new Date(tx['Exit Time']).toLocaleString('vi-VN') : '--';
                
                row.innerHTML = `
                    <td class="plate">${tx.Plate || '--'}</td>
                    <td>${new Date(tx['Entry Time']).toLocaleString('vi-VN')}</td>
                    <td></td>
                    <td class="fee"></td>
                    <td>${tx['Payment Method'] || '--'}</td>
                    <td>${getLocationName(tx.LocationID)}</td>
                    <td style="text-align: center;"><span class="status-badge ">${tx.Status}</span></td>
                    <td style="text-align: center;"><button class="edit-btn" data-uniqueid="${tx.UniqueID}">Sửa</button></td>
                `;
                elements.transactionLogBody.appendChild(row);
            });
        };
    
        const openEditModal = (uniqueID) => {
            const transaction = fullAdminData.transactions.find(tx => tx.UniqueID === uniqueID);
            if (!transaction) {
                alert('Không tìm thấy giao dịch.');
                return;
            }
    
            const toLocalISOString = (date) => {
                if (!date) return '';
                const dt = new Date(date);
                dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
                return dt.toISOString().slice(0, 16);
            };
    
            elements.editUniqueID.value = transaction.UniqueID;
            elements.editPlate.value = transaction.Plate || '';
            elements.editEntryTime.value = toLocalISOString(transaction['Entry Time']);
            elements.editExitTime.value = toLocalISOString(transaction['Exit Time']);
            elements.editFee.value = transaction.Fee ?? '';
            elements.editPaymentMethod.value = transaction['Payment Method'] || '';
            elements.editStatus.value = transaction.Status || 'Đã rời bãi';
    
            elements.editModal.style.display = 'flex';
        };
    
        const closeEditModal = () => {
            elements.editModal.style.display = 'none';
            elements.editForm.reset();
        };
    
        const saveTransactionChanges = async (event) => {
            event.preventDefault();
            elements.saveEditBtn.disabled = true;
            elements.saveEditBtn.textContent = 'Đang lưu...';
    
            const payload = {
                action: 'editTransaction',
                uniqueID: elements.editUniqueID.value,
                plate: elements.editPlate.value,
                entryTime: elements.editEntryTime.value ? new Date(elements.editEntryTime.value).toISOString() : null,
                exitTime: elements.editExitTime.value ? new Date(elements.editExitTime.value).toISOString() : null,
                fee: elements.editFee.value,
                paymentMethod: elements.editPaymentMethod.value,
                status: elements.editStatus.value,
                secret: currentSecretKey
            };
    
            try {
                const response = await fetch(APP_CONFIG.googleScriptUrl, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.status !== 'success') throw new Error(result.message);
                    alert('Cập nhật thành công!');
                    closeEditModal();
                    fetchAdminData(currentSecretKey, true, elements.adminDatePicker.value);
            } catch (error) {
                alert(`Lỗi khi lưu: ${error.message}`);
            } finally {
                elements.saveEditBtn.disabled = false;
                elements.saveEditBtn.textContent = 'Lưu thay đổi';
            }
        };
    
        const updateDashboardUI = (data, isSilentUpdate = false) => {
            fullAdminData = data;
    
            elements.totalRevenue.innerHTML = `${formatCurrency(data?.totalRevenueToday ?? 0)} <sup>đ</sup>`;
            elements.totalVehicles.textContent = data?.totalVehiclesToday ?? 0;
            elements.currentVehicles.textContent = data?.vehiclesCurrentlyParking ?? 0;
    
            renderTransactionTable(data?.transactions || []);
    
            const locationData = {
                names: [],
                revenue: [],
                vehicles: []
            };
    
            if (data?.revenueByLocation && data?.vehiclesByLocation) {
                Object.keys(data.revenueByLocation).forEach(id => {
                    locationData.names.push(getLocationName(id));
                    locationData.revenue.push(data.revenueByLocation[id] || 0);
                    locationData.vehicles.push(data.vehiclesByLocation[id] || 0);
                });
            }
    
            // SỬA LỖI: Thêm kiểm tra an toàn cho dữ liệu biểu đồ traffic
            const trafficData = data?.trafficByHour || Array(24).fill(0);
            if (trafficChart) trafficChart.destroy();
            trafficChart = new Chart(elements.trafficChartCanvas, {
                type: 'bar',
                data: {
                    labels: Array.from({ length: 24 }, (_, i) => `h`),
                    datasets: [{
                        label: 'Số lượt xe vào',
                        data: trafficData,
                        backgroundColor: 'rgba(0, 123, 255, 0.7)',
                        borderColor: 'rgba(0, 123, 255, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { 
                            beginAtZero: true, 
                            ticks: { 
                                stepSize: 1 
                            } 
                        }
                    },
                    plugins: { legend: { display: false } }
                }
            });
    
            const chartColors = ['rgba(40, 167, 69, 0.8)', 'rgba(255, 193, 7, 0.8)', 'rgba(23, 162, 184, 0.8)', 'rgba(220, 53, 69, 0.8)', 'rgba(108, 117, 125, 0.8)'];
            
            if (revenueChart) revenueChart.destroy();
            revenueChart = new Chart(elements.revenueChartCanvas, {
                type: 'doughnut',
                data: {
                    labels: locationData.names,
                    datasets: [{
                        label: 'Doanh thu',
                        data: locationData.revenue,
                        backgroundColor: chartColors,
                        originalBackgroundColor: [...chartColors]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top' },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `${context.label || ''}: ${formatCurrency(context.parsed)} đ`;
                                }
                            }
                        }
                    }
                }
            });
    
            if (vehiclesChart) vehiclesChart.destroy();
            vehiclesChart = new Chart(elements.vehiclesChartCanvas, {
                type: 'pie',
                data: {
                    labels: locationData.names,
                    datasets: [{
                        label: 'Lượt xe',
                        data: locationData.vehicles,
                        backgroundColor: [...chartColors].reverse(),
                        originalBackgroundColor: [...chartColors].reverse()
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'top' } }
                }
            });
    
            if (!map && typeof L !== 'undefined' && LOCATIONS_CONFIG) {
                initMap(data);
            } else if (isSilentUpdate) {
                updateMapPopups(data);
            }
        };
    
        const setTodayDate = () => {
            const today = new Date();
            const formatDateForAPI = (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `--`;
            };
            const formattedDate = formatDateForAPI(new Date());
            if (elements.adminDatePicker) {
                elements.adminDatePicker.value = formattedDate;
            }
            return formattedDate;
        };
    
        const fetchAdminData = async (secretKey, isSilent = false, date = null) => {
            try {
                const dateParam = date ? `&date=` : '';
                const response = await fetch(`${APP_CONFIG.googleScriptUrl}?action=getAdminData&secret=&v=${new Date().getTime()}`);
    
                if (!response.ok) {
                    throw new Error(`Lỗi mạng: ${response.statusText}`);
                }
                const result = await response.json();
    
                if (result.status !== 'success' || !result.data) {
                    throw new Error(result.message || 'Lỗi không xác định từ server');
                }
    
                updateDashboardUI(result.data, isSilent);
                return true;
            } catch (error) {
                if (!isSilent) {
                    alert(`Không thể tải dữ liệu quản trị: ${error.message}`);
                    console.error('ADMIN ERROR LOG:', error);
                    showLoginScreen('Đã xảy ra lỗi. Vui lòng thử lại.');
                }
                return false;
            }
        };
    
        const startAdminSession = async () => {
            try {
                if (elements.loader) {
                    elements.loader.querySelector('span').textContent = 'Đang xác thực và tải dữ liệu...';
                    elements.loader.querySelector('.spinner').style.display = 'block';
                    elements.startSessionBtn.style.display = 'none';
                }
        
                const secretKey = prompt("Vui lòng nhập mật khẩu quản trị:", "");
                if (!secretKey) {
                    showLoginScreen('Cần có mật khẩu để truy cập.');
                    return;
                }
                currentSecretKey = secretKey;
        
                const dateToFetch = elements.adminDatePicker.value;
        
                const success = await fetchAdminData(secretKey, false, dateToFetch);
        
                if (success) {
                    elements.loader.style.display = 'none';
                    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
                    autoRefreshInterval = setInterval(() => {
                        const currentDate = elements.adminDatePicker.value;
                        fetchAdminData(secretKey, true, currentDate);
                    }, APP_CONFIG.autoRefreshInterval || 30000);
                }
    
            } catch (error) {
                console.error("Lỗi nghiêm trọng khi bắt đầu phiên quản trị:", error);
                if (elements.loader) {
                    elements.loader.style.display = 'none';
                }
                alert("Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.");
            }
        };
    
        const showLoginScreen = (message) => {
            if (elements.loader) {
                elements.loader.style.display = 'flex';
                elements.loader.querySelector('span').textContent = message || 'Vui lòng xác nhận để truy cập trang quản trị.';
                elements.loader.querySelector('.spinner').style.display = 'none';
                elements.startSessionBtn.style.display = 'block';
            }
        };
    
        const init = () => {
            try {
                setTodayDate();
                setupNavigation();
        
                if (elements.resetFilterBtn) elements.resetFilterBtn.addEventListener('click', resetFilter);
                if (elements.adminDatePicker) elements.adminDatePicker.addEventListener('change', () => {
                    if (currentSecretKey) fetchAdminData(currentSecretKey, false, elements.adminDatePicker.value);
                });
                if (elements.transactionLogBody) elements.transactionLogBody.addEventListener('click', (e) => { if (e.target.classList.contains('edit-btn')) openEditModal(e.target.dataset.uniqueid); });
                if (elements.closeEditModalBtn) elements.closeEditModalBtn.addEventListener('click', closeEditModal);
                if (elements.cancelEditBtn) elements.cancelEditBtn.addEventListener('click', closeEditModal);
                if (elements.editForm) elements.editForm.addEventListener('submit', saveTransactionChanges);
                if (elements.startSessionBtn) elements.startSessionBtn.addEventListener('click', startAdminSession);
        
                showLoginScreen('Vui lòng xác nhận để truy cập trang quản trị.');
            } catch (error) {
                console.error("Lỗi trong quá trình khởi tạo:", error);
                document.body.innerHTML = `<h1 style="text-align: center; margin-top: 50px;">LỖI KHỞI TẠO TRANG. VUI LÒNG TẢI LẠI.</h1><p style="text-align: center;">Chi tiết: ${error.message}</p>`;
            }
        };
    
        init();
    });
    
            if (elements.resetFilterBtn) elements.resetFilterBtn.addEventListener('click', resetFilter);
            if (elements.adminDatePicker) elements.adminDatePicker.addEventListener('change', () => {
                if (currentSecretKey) fetchAdminData(currentSecretKey, false, elements.adminDatePicker.value);
            });
            if (elements.transactionLogBody) elements.transactionLogBody.addEventListener('click', (e) => { if (e.target.classList.contains('edit-btn')) openEditModal(e.target.dataset.uniqueid); });
            if (elements.closeEditModalBtn) elements.closeEditModalBtn.addEventListener('click', closeEditModal);
            if (elements.cancelEditBtn) elements.cancelEditBtn.addEventListener('click', closeEditModal);
            if (elements.editForm) elements.editForm.addEventListener('submit', saveTransactionChanges);
            if (elements.startSessionBtn) elements.startSessionBtn.addEventListener('click', startAdminSession);
    
            showLoginScreen('Vui lòng xác nhận để truy cập trang quản trị.');
        } catch (error) {
            console.error("Lỗi trong quá trình khởi tạo:", error);
            document.body.innerHTML = `<h1 style="text-align: center; margin-top: 50px;">LỖI KHỞI TẠO TRANG. VUI LÒNG TẢI LẠI.</h1><p style="text-align: center;">Chi tiết: ${error.message}</p>`;
        }
    };

    init();
});
        const locationName = getLocationName(locationId);
        elements.resetFilterBtn.style.display = 'block';

        // Cập nhật thẻ thống kê
        elements.totalRevenue.innerHTML = `${formatCurrency(fullAdminData.revenueByLocation?.[locationId] || 0)} <sup>đ</sup>`;
        elements.totalVehicles.textContent = fullAdminData.vehiclesByLocation?.[locationId] || 0;
        elements.currentVehicles.textContent = 'N/A';

        // Cập nhật tiêu đề biểu đồ
        elements.revenueChartTitle.textContent = `Doanh thu (Lọc: ${locationName})`;
        elements.vehiclesChartTitle.textContent = `Lượt xe (Lọc: ${locationName})`;

        // Làm nổi bật biểu đồ
        highlightChartSlice(revenueChart, locationName);
        highlightChartSlice(vehiclesChart, locationName);
    };

    const resetFilter = () => {
        if (!fullAdminData) return;
        updateDashboardUI(fullAdminData); // Vẽ lại mọi thứ với dữ liệu đầy đủ
        elements.resetFilterBtn.style.display = 'none';
        elements.revenueChartTitle.textContent = 'Doanh thu theo bãi đỗ xe';
        elements.vehiclesChartTitle.textContent = 'Lượt xe theo bãi đỗ xe';
    };

    const highlightChartSlice = (chart, labelToHighlight) => {
        if (!chart || !chart.data || !chart.data.datasets[0]?.originalBackgroundColor) return;
        const labelIndex = chart.data.labels.indexOf(labelToHighlight);
        chart.data.datasets.forEach(dataset => {
            dataset.backgroundColor = dataset.originalBackgroundColor.map((color, index) => 
                index === labelIndex ? color.replace(/, 0\.\d+\)/, ', 1)') : color.replace(/, 1\)/, ', 0.2)')
            );
        });
        chart.update();
    };

    const updateMapPopups = (data) => {
        if (!map || !map.markers) return;

        Object.keys(map.markers).forEach(locationId => {
            const marker = map.markers[locationId];
            const loc = LOCATIONS_CONFIG.find(l => l.id === locationId);
            if (!marker || !loc) return;
            // SỬA LỖI: Thêm kiểm tra an toàn (optional chaining)
            const revenue = data.revenueByLocation?.[loc.id] || 0;
            const vehicleCount = data.vehiclesByLocation?.[loc.id] || 0;
            const newPopupContent = `<div style="font-family: 'Be Vietnam Pro', sans-serif;"><h4 style="margin: 0 0 8px 0;">${loc.name}</h4><p style="margin: 0;"><strong>Lượt xe:</strong> ${vehicleCount}</p><p style="margin: 0;"><strong>Doanh thu:</strong> ${formatCurrency(revenue)} đ</p></div>`;
            
            marker.setPopupContent(newPopupContent);
        });
    };

    const initMap = (data) => {
        if (map) {
            map.remove();
        }

        map = L.map(elements.mapContainer).setView([21.035, 105.84], 14);

        // Thêm lớp nền bản đồ từ OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // MỚI: Lưu trữ các marker để cập nhật sau
        map.markers = {};

        LOCATIONS_CONFIG.forEach(loc => {
            // SỬA LỖI: Thêm kiểm tra an toàn (optional chaining)
            const revenue = data.revenueByLocation?.[loc.id] || 0;
            const vehicleCount = data.vehiclesByLocation?.[loc.id] || 0;

            const popupContent = `<div style="font-family: 'Be Vietnam Pro', sans-serif;"><h4 style="margin: 0 0 8px 0;">${getLocationName(loc.id)}</h4><p style="margin: 0;"><strong>Lượt xe:</strong> ${vehicleCount}</p><p style="margin: 0;"><strong>Doanh thu:</strong> ${formatCurrency(revenue)} đ</p></div>`;

            const marker = L.marker([loc.lat, loc.lng])
                .addTo(map)
                .bindPopup(popupContent);

            map.markers[loc.id] = marker;

            marker.on('click', () => {
                filterDataByLocation(loc.id);
            });
        });
    };

    const setupNavigation = () => {
        if (!elements.sidebar) return;

        elements.sidebar.addEventListener('click', (e) => {
            const link = e.target.closest('.nav-link');
            if (!link) return;

            e.preventDefault();
            const targetId = link.dataset.target;

            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            elements.pages.forEach(page => page.classList.toggle('active', page.id === targetId));

            if (targetId === 'page-map' && map) {
                setTimeout(() => map.invalidateSize(), 10);
            }
        });
    };

    const renderTransactionTable = (transactions) => {
        if (!elements.transactionLogBody) return;
        elements.transactionLogBody.innerHTML = '';

        if (!transactions || transactions.length === 0) {
            elements.transactionLogBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px;">Không có giao dịch.</td></tr>`;
            return;
        }

        transactions.forEach(tx => {
            const row = document.createElement('tr');
            const statusClass = tx.Status === 'Đang gửi' ? 'parking' : 'departed';
            const feeDisplay = tx.Fee ? `${formatCurrency(tx.Fee)}đ` : '--';
            const exitTimeDisplay = tx['Exit Time'] ? new Date(tx['Exit Time']).toLocaleString('vi-VN') : '--';
            
            row.innerHTML = `
                <td class="plate">${tx.Plate || '--'}</td>
                <td>${new Date(tx['Entry Time']).toLocaleString('vi-VN')}</td>
                <td>${exitTimeDisplay}</td>
                <td class="fee">${feeDisplay}</td>
                <td>${tx['Payment Method'] || '--'}</td>
                <td>${getLocationName(tx.LocationID)}</td>
                <td style="text-align: center;"><span class="status-badge ${statusClass}">${tx.Status}</span></td>
                <td style="text-align: center;"><button class="edit-btn" data-uniqueid="${tx.UniqueID}">Sửa</button></td>
            `;
            elements.transactionLogBody.appendChild(row);
        });
    };

    const openEditModal = (uniqueID) => {
        const transaction = fullAdminData.transactions.find(tx => tx.UniqueID === uniqueID);
        if (!transaction) {
            alert('Không tìm thấy giao dịch.');
            return;
        }

        const toLocalISOString = (date) => {
            if (!date) return '';
            const dt = new Date(date);
            dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
            return dt.toISOString().slice(0, 16);
        };

        elements.editUniqueID.value = transaction.UniqueID;
        elements.editPlate.value = transaction.Plate || '';
        elements.editEntryTime.value = toLocalISOString(transaction['Entry Time']);
        elements.editExitTime.value = toLocalISOString(transaction['Exit Time']);
        elements.editFee.value = transaction.Fee ?? '';
        elements.editPaymentMethod.value = transaction['Payment Method'] || '';
        elements.editStatus.value = transaction.Status || 'Đã rời bãi';

        elements.editModal.style.display = 'flex';
    };

    const closeEditModal = () => {
        elements.editModal.style.display = 'none';
        elements.editForm.reset();
    };

    const saveTransactionChanges = async (event) => {
        event.preventDefault();
        elements.saveEditBtn.disabled = true;
        elements.saveEditBtn.textContent = 'Đang lưu...';

        const payload = {
            action: 'editTransaction',
            uniqueID: elements.editUniqueID.value,
            plate: elements.editPlate.value,
            entryTime: elements.editEntryTime.value ? new Date(elements.editEntryTime.value).toISOString() : null,
            exitTime: elements.editExitTime.value ? new Date(elements.editExitTime.value).toISOString() : null,
            fee: elements.editFee.value,
            paymentMethod: elements.editPaymentMethod.value,
            status: elements.editStatus.value,
            secret: currentSecretKey // Gửi kèm mật khẩu để xác thực
        };

        try {
            const response = await fetch(APP_CONFIG.googleScriptUrl, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
                alert('Cập nhật thành công!');
                closeEditModal();
                fetchAdminData(currentSecretKey, true, elements.adminDatePicker.value);
        } catch (error) {
            alert(`Lỗi khi lưu: ${error.message}`);
        } finally {
            elements.saveEditBtn.disabled = false;
            elements.saveEditBtn.textContent = 'Lưu thay đổi';
        }
    };

    const updateDashboardUI = (data, isSilentUpdate = false) => {
        fullAdminData = data; // Lưu dữ liệu gốc

        elements.totalRevenue.innerHTML = `${formatCurrency(data?.totalRevenueToday ?? 0)} <sup>đ</sup>`;
        elements.totalVehicles.textContent = data?.totalVehiclesToday ?? 0;
        elements.currentVehicles.textContent = data?.vehiclesCurrentlyParking ?? 0;

        renderTransactionTable(data?.transactions || []);

        const locationData = {
            names: [],
            revenue: [],
            vehicles: []
        };

        if (data?.revenueByLocation && data?.vehiclesByLocation) {
            Object.keys(data.revenueByLocation).forEach(id => {
                locationData.names.push(getLocationName(id));
                locationData.revenue.push(data.revenueByLocation[id] || 0);
                locationData.vehicles.push(data.vehiclesByLocation[id] || 0);
            });
        }

        // Biểu đồ lưu lượng xe theo giờ
        if (trafficChart) trafficChart.destroy();
        trafficChart = new Chart(elements.trafficChartCanvas, {
            type: 'bar',
            data: {
                labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
                datasets: [{
                    label: 'Số lượt xe vào',
                    data: data.trafficByHour,
                    backgroundColor: 'rgba(0, 123, 255, 0.7)',
                    borderColor: 'rgba(0, 123, 255, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { 
                        beginAtZero: true, 
                        ticks: { 
                            stepSize: 1 
                        } 
                    }
                },
                plugins: { legend: { display: false } }
            }
        });

        const chartColors = ['rgba(40, 167, 69, 0.8)', 'rgba(255, 193, 7, 0.8)', 'rgba(23, 162, 184, 0.8)', 'rgba(220, 53, 69, 0.8)', 'rgba(108, 117, 125, 0.8)'];
        
        // Biểu đồ doanh thu theo điểm
        if (revenueChart) revenueChart.destroy();
        revenueChart = new Chart(elements.revenueChartCanvas, {
            type: 'doughnut',
            data: {
                labels: locationData.names,
                datasets: [{
                    label: 'Doanh thu',
                    data: locationData.revenue,
                    backgroundColor: chartColors,
                    originalBackgroundColor: [...chartColors]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.label || ''}: ${formatCurrency(context.parsed)} đ`;
                            }
                        }
                    }
                }
            }
        });

        // Biểu đồ lượt xe theo điểm
        if (vehiclesChart) vehiclesChart.destroy();
        vehiclesChart = new Chart(elements.vehiclesChartCanvas, {
            type: 'pie',
            data: {
                labels: locationData.names,
                datasets: [{
                    label: 'Lượt xe',
                    data: locationData.vehicles,
                    backgroundColor: [...chartColors].reverse(),
                    originalBackgroundColor: [...chartColors].reverse()
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } }
            }
        });

        if (!map) {
            initMap(data);
        } else if (isSilentUpdate) {
            // Nếu là cập nhật "âm thầm", chỉ update popup
            updateMapPopups(data);
        }
    };

    const setTodayDate = () => {
        const today = new Date();
        const formatDateForAPI = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        const formattedDate = formatDateForAPI(new Date());
        if (elements.adminDatePicker) {
            elements.adminDatePicker.value = formattedDate;
        }
        return formattedDate;
    };

    const fetchAdminData = async (secretKey, isSilent = false, date = null) => {
        try {
            const dateParam = date ? `&date=${date}` : '';
            const response = await fetch(`${APP_CONFIG.googleScriptUrl}?action=getAdminData&secret=${secretKey}${dateParam}&v=${new Date().getTime()}`);

            if (!response.ok) {
                throw new Error(`Lỗi mạng: ${response.statusText}`);
            }
            const result = await response.json();

            if (result.status !== 'success' || !result.data) {
                throw new Error(result.message || 'Lỗi không xác định từ server');
            }

            updateDashboardUI(result.data, isSilent);
            return true;
        } catch (error) {
            if (!isSilent) {
                alert(`Không thể tải dữ liệu quản trị: ${error.message}`);
                console.error('ADMIN ERROR LOG:', error);
                showLoginScreen('Đã xảy ra lỗi. Vui lòng thử lại.');
            }
            return false;
        }
    };

    const startAdminSession = async () => {
        try {
            if (elements.loader) {
                elements.loader.querySelector('span').textContent = 'Đang xác thực và tải dữ liệu...';
                elements.loader.querySelector('.spinner').style.display = 'block';
                elements.startSessionBtn.style.display = 'none';
            }
    
            const secretKey = prompt("Vui lòng nhập mật khẩu quản trị:", "");
            if (!secretKey) {
                showLoginScreen('Cần có mật khẩu để truy cập.');
                return;
            }
            currentSecretKey = secretKey; // Lưu lại mật khẩu
    
            const dateToFetch = elements.adminDatePicker.value;
    
            const success = await fetchAdminData(secretKey, false, dateToFetch);
    
            if (success) {
                elements.loader.style.display = 'none';
                if (autoRefreshInterval) clearInterval(autoRefreshInterval);
                autoRefreshInterval = setInterval(() => {
                    const currentDate = elements.adminDatePicker.value;
                    fetchAdminData(secretKey, true, currentDate);
                }, APP_CONFIG.autoRefreshInterval || 30000);
            }
            // Nếu không thành công, fetchAdminData đã xử lý việc hiển thị lại màn hình đăng nhập

        } catch (error) {
            // Bắt các lỗi không mong muốn khác
            console.error("Lỗi nghiêm trọng khi bắt đầu phiên quản trị:", error);
            if (elements.loader) {
                elements.loader.style.display = 'none';
            }
            alert("Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.");
        }
    };

    const showLoginScreen = (message) => {
        if (elements.loader) {
            elements.loader.style.display = 'flex';
            elements.loader.querySelector('span').textContent = message || 'Vui lòng xác nhận để truy cập trang quản trị.';
            elements.loader.querySelector('.spinner').style.display = 'none';
            elements.startSessionBtn.style.display = 'block';
        }
    };

    const init = () => {
        try {
            setTodayDate();
            setupNavigation();
    
            if (elements.resetFilterBtn) elements.resetFilterBtn.addEventListener('click', resetFilter);
            if (elements.adminDatePicker) elements.adminDatePicker.addEventListener('change', () => {
                if (currentSecretKey) fetchAdminData(currentSecretKey, false, elements.adminDatePicker.value);
            });
            if (elements.transactionLogBody) elements.transactionLogBody.addEventListener('click', (e) => { if (e.target.classList.contains('edit-btn')) openEditModal(e.target.dataset.uniqueid); });
            if (elements.closeEditModalBtn) elements.closeEditModalBtn.addEventListener('click', closeEditModal);
            if (elements.cancelEditBtn) elements.cancelEditBtn.addEventListener('click', closeEditModal);
            if (elements.editForm) elements.editForm.addEventListener('submit', saveTransactionChanges);
            if (elements.startSessionBtn) elements.startSessionBtn.addEventListener('click', startAdminSession);
    
            showLoginScreen('Vui lòng xác nhận để truy cập trang quản trị.');
        } catch (error) {
            console.error("Lỗi trong quá trình khởi tạo:", error);
            document.body.innerHTML = `<h1 style="text-align: center; margin-top: 50px;">LỖI KHỞI TẠO TRANG. VUI LÒNG TẢI LẠI.</h1><p style="text-align: center;">Chi tiết: ${error.message}</p>`;
        }
    };

    init();
});
document.addEventListener('DOMContentLoaded', () => {
    // --- KHAI BÁO BIẾN ---
    const loader = document.getElementById('loader');
    const startSessionBtn = document.getElementById('start-session-btn');
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page-content');
    const datePicker = document.getElementById('admin-date-picker');
    const resetFilterBtn = document.getElementById('reset-filter-btn');

    // Biến cho modal chỉnh sửa giao dịch
    const editModal = document.getElementById('edit-transaction-modal');
    const closeEditModalBtn = document.getElementById('close-edit-modal-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const editForm = document.getElementById('edit-transaction-form');

    // --- BIẾN MỚI: Cho quản lý tài khoản ngân hàng ---
    const bankAccountModal = document.getElementById('bank-account-modal');
    const addBankAccountBtn = document.getElementById('add-bank-account-btn');
    const closeBankModalBtn = document.getElementById('close-bank-modal-btn');
    const cancelBankBtn = document.getElementById('cancel-bank-btn');
    const bankAccountForm = document.getElementById('bank-account-form');
    const bankAccountsBody = document.getElementById('bank-accounts-body');
    const bankModalTitle = document.getElementById('bank-modal-title');

    let allTransactions = [];
    let map;
    let charts = {};

    // --- KHỞI TẠO ỨNG DỤNG ---
    function initializeApp() {
        // Thiết lập ngày mặc định cho date picker là hôm nay
        setTodayDate();

        // Gắn sự kiện
        setupEventListeners();

        // Tải và hiển thị danh sách tài khoản ngân hàng
        renderBankAccounts();

        // Hiển thị màn hình đăng nhập khi bắt đầu
        showLoginScreen();
        // Tải dữ liệu
        // Sửa lỗi: Bỏ qua màn hình đăng nhập, tải dữ liệu trực tiếp từ localStorage
        // để đồng bộ với logic của index.html
        if (loader) loader.style.display = 'none';
        loadDataFromLocalStorage();
 

    }

    // --- QUẢN LÝ GIAO DIỆN (UI) ---
    function setupEventListeners() {
        // Chuyển trang
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('data-target');

                // Cập nhật trạng thái active cho link
                navLinks.forEach(nav => nav.classList.remove('active'));
                link.classList.add('active');

                // Hiển thị trang tương ứng
                pages.forEach(page => {
                    page.classList.toggle('active', page.id === targetId);
                });

                // Vẽ lại bản đồ nếu chuyển đến trang bản đồ
                if (targetId === 'page-map' && map) {
                    setTimeout(() => map.invalidateSize(), 10);
                }
            });
        });

        // Lọc theo ngày (Thêm kiểm tra null)
        if (datePicker) {
            datePicker.addEventListener('change', () => {
                filterDataByDate(datePicker.value);
                if (resetFilterBtn) resetFilterBtn.style.display = 'inline-block';
            });
        }
 
        // Reset bộ lọc (Thêm kiểm tra null)
        if (resetFilterBtn) {
            resetFilterBtn.addEventListener('click', () => {
                if (datePicker) datePicker.value = new Date().toISOString().split('T')[0];
                filterDataByDate(datePicker.value);
                resetFilterBtn.style.display = 'none';
            });
        }
 
        // Sự kiện cho modal chỉnh sửa giao dịch
        if (closeEditModalBtn) closeEditModalBtn.addEventListener('click', () => editModal.style.display = 'none');
        if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => editModal.style.display = 'none');
        if (editForm) editForm.addEventListener('submit', handleSaveTransaction);
 
        // --- MỚI: Sự kiện cho modal tài khoản ngân hàng ---
        if (addBankAccountBtn) addBankAccountBtn.addEventListener('click', () => openBankAccountModal());
        if (closeBankModalBtn) closeBankModalBtn.addEventListener('click', () => bankAccountModal.style.display = 'none');
        if (cancelBankBtn) cancelBankBtn.addEventListener('click', () => bankAccountModal.style.display = 'none');
        if (bankAccountForm) bankAccountForm.addEventListener('submit', handleSaveBankAccount);
 
        // Đóng modal khi click bên ngoài
        window.onclick = (event) => {
            if (event.target == editModal) editModal.style.display = "none";
            if (event.target == bankAccountModal) bankAccountModal.style.display = "none";
        };
    }
 
    // --- XỬ LÝ DỮ LIỆU ---
    function loadDataFromLocalStorage() {
        if (loader) loader.style.display = 'flex';
        // Giả lập tải dữ liệu từ localStorage hoặc API
        setTimeout(() => {
            const data = JSON.parse(localStorage.getItem('parkingTransactions')) || [];
            allTransactions = data.map(tx => ({
                ...tx,
                entryTime: new Date(tx.entryTime),
                exitTime: tx.exitTime ? new Date(tx.exitTime) : null
            }));
            filterDataByDate(datePicker.value);
            if (loader) loader.style.display = 'none';
        }, 1000);
    }
 
    function filterDataByDate(selectedDate) {
        const filteredTransactions = allTransactions.filter(tx => {
            const entryDate = tx.entryTime.toISOString().split('T')[0];
            return entryDate === selectedDate;
        });
        updateDashboard(filteredTransactions);
    }
 
    function updateDashboard(transactions) {
        updateSummaryCards(transactions);
        updateTransactionTable(transactions);
        updateCharts(transactions);
        initializeOrUpdateMap(transactions);
    }

    // --- CÁC THÀNH PHẦN CỦA DASHBOARD (Thêm kiểm tra null) ---
 
    function updateSummaryCards(transactions) {
        const revenue = transactions.reduce((sum, tx) => sum + (tx.fee || 0), 0);
        const totalVehicles = transactions.length;
        const currentVehiclesCount = transactions.filter(tx => tx.status === 'Đang gửi').length;
 
        const totalRevenueEl = document.getElementById('total-revenue');
        const totalVehiclesEl = document.getElementById('total-vehicles');
        const currentVehiclesEl = document.getElementById('current-vehicles');
 
        if (totalRevenueEl) totalRevenueEl.innerHTML = `${revenue.toLocaleString('vi-VN')} <sup>đ</sup>`;
        if (totalVehiclesEl) totalVehiclesEl.textContent = totalVehicles;
        if (currentVehiclesEl) currentVehiclesEl.textContent = currentVehiclesCount;
    }
 
    function updateTransactionTable(transactions) {
        const tbody = document.getElementById('transaction-log-body');
        if (!tbody) return;
 
        tbody.innerHTML = '';
        if (transactions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px;">Không có giao dịch nào trong ngày được chọn.</td></tr>`;
            return;
        }
 
        transactions.sort((a, b) => b.entryTime - a.entryTime).forEach(tx => {
            const statusBadge = tx.status === 'Đang gửi' 
                ? `<span class="status-badge parking">Đang gửi</span>`
                : `<span class="status-badge departed">Đã rời bãi</span>`;
 
            const row = `
                <tr>
                    <td class="col-plate plate">${tx.licensePlate}</td>
                    <td class="col-time">${tx.entryTime.toLocaleString('vi-VN')}</td>
                    <td class="col-time">${tx.exitTime ? tx.exitTime.toLocaleString('vi-VN') : 'N/A'}</td>
                    <td class="col-fee fee">${tx.fee ? tx.fee.toLocaleString('vi-VN') + ' đ' : 'N/A'}</td>
                    <td class="col-payment">${tx.paymentMethod || 'N/A'}</td>
                    <td class="col-location">${tx.locationName || 'N/A'}</td>
                    <td class="col-status">${statusBadge}</td>
                    <td class="col-action">
                        <button class="edit-btn" data-id="${tx.uniqueId}">Sửa</button>
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', row);
        });
 
        // Gắn sự kiện cho các nút "Sửa"
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => openEditModal(e.target.dataset.id));
        });
    }
 
    function initializeOrUpdateMap(transactions) {
        const mapContainer = document.getElementById('map-container');
        // Kiểm tra sự tồn tại của thư viện Leaflet (L) và cấu hình PARKING_LOCATIONS
        if (!mapContainer || typeof L === 'undefined' || typeof PARKING_LOCATIONS === 'undefined') return;
 
        const currentVehicles = transactions.filter(tx => tx.status === 'Đang gửi');
        const vehiclesByLocation = currentVehicles.reduce((acc, tx) => {
            const locationId = tx.locationId;
            if (!acc[locationId]) {
                const locationInfo = PARKING_LOCATIONS.find(l => l.id === locationId);
                acc[locationId] = {
                    count: 0,
                    name: locationInfo ? locationInfo.name : 'Không xác định',
                    coords: locationInfo ? [locationInfo.lat, locationInfo.lng] : null
                };
            }
            acc[locationId].count++;
            return acc;
        }, {});

        if (!map) {
            map = L.map('map-container').setView([21.028511, 105.804817], 13); // Tọa độ Hà Nội
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);
        }
 
        // Xóa các marker cũ
        map.eachLayer(layer => {
            if (layer instanceof L.Marker) {
                map.removeLayer(layer);
            }
        });
 
        // Thêm marker mới
        Object.values(vehiclesByLocation).forEach(loc => {
            if (loc.coords) {
                const marker = L.marker(loc.coords).addTo(map);
                marker.bindPopup(`<b>${loc.name}</b><br>Xe đang gửi: ${loc.count}`);
            }
        });
    }

    function updateCharts(transactions, summaryData) {
        const createOrUpdateChart = (chartId, config) => {
            const canvas = document.getElementById(chartId);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (charts[chartId]) charts[chartId].destroy();
            charts[chartId] = new Chart(ctx, config);
        };

        // Biểu đồ lưu lượng từ summaryData
        const trafficData = summaryData.trafficByHour || Array(24).fill(0);
        createOrUpdateChart('traffic-chart', {
            type: 'bar',
            data: {
                labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
                datasets: [{
                    label: 'Lượt xe vào', data: trafficData,
                    backgroundColor: 'rgba(0, 123, 255, 0.6)',
                    borderColor: 'rgba(0, 123, 255, 1)', borderWidth: 1
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
        });

        // Biểu đồ doanh thu và lượt xe theo điểm từ summaryData
        const labels = Object.keys(summaryData.revenueByLocation || {});
        const revenueData = labels.map(l => summaryData.revenueByLocation[l]);
        const vehicleData = labels.map(l => summaryData.vehiclesByLocation[l]);

        createOrUpdateChart('revenue-chart', {
            type: 'doughnut',
            data: { labels, datasets: [{ data: revenueData, backgroundColor: ['#28a745', '#ffc107', '#dc3545', '#17a2b8', '#6c757d'] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }
        });
        createOrUpdateChart('vehicles-chart', {
            type: 'doughnut',
            data: { labels, datasets: [{ data: vehicleData, backgroundColor: ['#007bff', '#ffc107', '#17a2b8', '#6c757d', '#28a745'] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }
        });
    }

    // --- XỬ LÝ MODAL CHỈNH SỬA GIAO DỊCH ---
    function openEditModal(uniqueId) {
        const transaction = allTransactions.find(tx => tx.uniqueId === uniqueId);
        if (!transaction || !editModal) return;

        document.getElementById('edit-unique-id').value = transaction.uniqueId;
        document.getElementById('edit-plate').value = transaction.licensePlate;
        document.getElementById('edit-entry-time').value = transaction.entryTime.toISOString().slice(0, 16);
        document.getElementById('edit-exit-time').value = transaction.exitTime ? transaction.exitTime.toISOString().slice(0, 16) : '';
        document.getElementById('edit-fee').value = transaction.fee ?? '';
        document.getElementById('edit-payment-method').value = transaction.paymentMethod || '';
        document.getElementById('edit-status').value = transaction.status;

        editModal.style.display = 'flex';
    }

    async function handleSaveTransaction(e) {
        e.preventDefault();
        if (!currentSecretKey) {
            alert("Phiên làm việc đã hết hạn. Vui lòng tải lại trang.");
            return;
        }

        const payload = {
            action: 'editTransaction',
            secret: currentSecretKey,
            uniqueID: document.getElementById('edit-unique-id').value,
            plate: document.getElementById('edit-plate').value,
            entryTime: new Date(document.getElementById('edit-entry-time').value).toISOString(),
            exitTime: document.getElementById('edit-exit-time').value ? new Date(document.getElementById('edit-exit-time').value).toISOString() : null,
            fee: parseFloat(document.getElementById('edit-fee').value) || null,
            paymentMethod: document.getElementById('edit-payment-method').value,
            status: document.getElementById('edit-status').value,
        };

        try {
            const response = await fetch(APP_CONFIG.googleScriptUrl, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            
            alert('Cập nhật giao dịch thành công!');
            if (editModal) editModal.style.display = 'none';
            fetchAdminData(currentSecretKey, true, datePicker.value); // Tải lại dữ liệu
        } catch (error) {
            alert(`Lỗi khi lưu: ${error.message}`);
        }
    }

    // --- QUẢN LÝ TÀI KHOẢN NGÂN HÀNG ---
    function getBankAccounts() {
        return JSON.parse(localStorage.getItem('bankAccounts')) || [];
    }

    function saveBankAccounts(accounts) {
        localStorage.setItem('bankAccounts', JSON.stringify(accounts));
        // Thông báo cho các tab khác (trang index.html) về sự thay đổi
        const activeAccount = accounts.find(acc => acc.isActive);
        if (activeAccount) {
            localStorage.setItem('activeBankAccount', JSON.stringify(activeAccount));
        } else {
            localStorage.removeItem('activeBankAccount');
        }
    }

    function renderBankAccounts() {
        if (!bankAccountsBody) return;
        const accounts = getBankAccounts();
        bankAccountsBody.innerHTML = '';

        if (accounts.length === 0) {
            bankAccountsBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">Chưa có tài khoản.</td></tr>`;
            return;
        }
        accounts.forEach(acc => {
            const statusHtml = acc.isActive
                ? `<span class="status-badge parking">Đang hoạt động</span>`
                : `<button class="action-button btn-secondary set-active-btn" data-id="${acc.id}" style="width: auto; padding: 5px 10px; font-size: 0.8rem;">Kích hoạt</button>`;

            const row = `
                <tr>
                    <td>${acc.bin}</td>
                    <td>${acc.accountName}</td>
                    <td>${acc.accountNumber}</td>
                    <td style="text-align: center;">${statusHtml}</td>
                    <td style="text-align: center;">
                        <button class="edit-bank-btn edit-btn" data-id="${acc.id}" style="margin-right: 5px;">Sửa</button>
                        <button class="delete-bank-btn action-button" data-id="${acc.id}" style="background: var(--danger-color); width: auto; padding: 5px 10px; font-size: 0.8rem;">Xóa</button>
                    </td>
                </tr>
            `;
            bankAccountsBody.insertAdjacentHTML('beforeend', row);
        });
        // Gắn sự kiện cho các nút mới
        document.querySelectorAll('.set-active-btn').forEach(btn => btn.addEventListener('click', handleSetActiveAccount));
        document.querySelectorAll('.edit-bank-btn').forEach(btn => btn.addEventListener('click', handleEditAccount));
        document.querySelectorAll('.delete-bank-btn').forEach(btn => btn.addEventListener('click', handleDeleteAccount));
    }

    function openBankAccountModal(accountToEdit = null) {
        if (!bankAccountModal) return;
        bankAccountForm.reset();

        if (accountToEdit) {
            bankModalTitle.textContent = 'Sửa Tài khoản Ngân hàng';
            document.getElementById('bank-account-id').value = accountToEdit.id;
            document.getElementById('bank-bin').value = accountToEdit.bin;
            document.getElementById('bank-account-name').value = accountToEdit.accountName;
            document.getElementById('bank-account-number').value = accountToEdit.accountNumber;
            document.getElementById('bank-account-template').value = accountToEdit.template || 'compact2';
        } else {
            bankModalTitle.textContent = 'Thêm Tài khoản Ngân hàng';
            document.getElementById('bank-account-id').value = '';
        }
        bankAccountModal.style.display = 'flex';
    }

    function handleSaveBankAccount(e) {
        e.preventDefault();
        let accounts = getBankAccounts();
        const accountId = document.getElementById('bank-account-id').value;

        const newAccountData = {
            bin: document.getElementById('bank-bin').value,
            accountName: document.getElementById('bank-account-name').value,
            accountNumber: document.getElementById('bank-account-number').value,
            template: document.getElementById('bank-account-template').value || 'compact2',
        };

        if (accountId) { // Chế độ sửa
            const index = accounts.findIndex(acc => acc.id === accountId);
            if (index !== -1) {
                accounts[index] = { ...accounts[index], ...newAccountData };
            }
        } else { // Chế độ thêm mới
            newAccountData.id = `bank_${new Date().getTime()}`;
            newAccountData.isActive = accounts.length === 0; // Kích hoạt tài khoản đầu tiên
            accounts.push(newAccountData);
        }

        saveBankAccounts(accounts);
        renderBankAccounts();
        if (bankAccountModal) bankAccountModal.style.display = 'none';
    }

    function handleSetActiveAccount(e) {
        const accountId = e.target.dataset.id;
        let accounts = getBankAccounts();
        accounts.forEach(acc => {
            acc.isActive = acc.id === accountId;
        });
        saveBankAccounts(accounts);
        renderBankAccounts();
    }

    function handleEditAccount(e) {
        const accountId = e.target.dataset.id;
        const accountToEdit = getBankAccounts().find(acc => acc.id === accountId);
        if (accountToEdit) {
            openBankAccountModal(accountToEdit);
        }
    }

    function handleDeleteAccount(e) {
        if (!confirm('Bạn có chắc chắn muốn xóa tài khoản này?')) return;

        const accountId = e.target.dataset.id;
        let accounts = getBankAccounts();
        const updatedAccounts = accounts.filter(acc => acc.id !== accountId);

        // Nếu tài khoản bị xóa đang active, cần xử lý lại
        const wasActive = accounts.find(acc => acc.id === accountId)?.isActive;
        if (wasActive && updatedAccounts.length > 0) {
            updatedAccounts[0].isActive = true; // Kích hoạt tài khoản đầu tiên còn lại
        }

        saveBankAccounts(updatedAccounts);
        renderBankAccounts();
    }

    // --- KHỞI CHẠY ---
    initializeApp();
});
