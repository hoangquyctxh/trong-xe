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

    let trafficChart, revenueChart, vehiclesChart, map, fullAdminData, currentSecretKey, autoRefreshInterval, allTransactions = [];

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

            // NÂNG CẤP: Chỉ tải dữ liệu giao dịch khi người dùng click vào tab "Giao dịch"
            // và dữ liệu đó chưa được tải.
            const isTransactionTab = targetId === 'page-transactions';
            const transactionsLoaded = fullAdminData && fullAdminData.transactions;
            if (isTransactionTab && !transactionsLoaded && currentSecretKey) {
                fetchTransactionData(currentSecretKey, elements.adminDatePicker.value || null); // Pass null if date is empty
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

    // ================================================================

    const updateDashboardUI = (data, isSilentUpdate = false) => {
        if (!data) return; // SỬA LỖI: Thoát nếu không có dữ liệu
        fullAdminData = data;

        elements.totalRevenue.innerHTML = `${formatCurrency(data?.totalRevenueToday ?? 0)} <sup>đ</sup>`;
        elements.totalVehicles.textContent = data?.totalVehiclesToday ?? 0;
        elements.currentVehicles.textContent = data?.vehiclesCurrentlyParking ?? 0;

        // Bỏ render bảng giao dịch ở đây, chỉ render khi có dữ liệu giao dịch được tải riêng
        if (data?.transactions) {
            renderTransactionTable(data.transactions);
        }

        const locationData = {
            names: [],
            revenue: [],
            vehicles: []
        };

        // SỬA LỖI: Lấy dữ liệu cho biểu đồ từ `data`
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
        if (elements.trafficChartCanvas) {
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
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                    plugins: { legend: { display: false } }
                }
            });
        }

        const chartColors = ['rgba(40, 167, 69, 0.8)', 'rgba(255, 193, 7, 0.8)', 'rgba(23, 162, 184, 0.8)', 'rgba(220, 53, 69, 0.8)', 'rgba(108, 117, 125, 0.8)'];
        
        if (revenueChart) revenueChart.destroy();
        if (elements.revenueChartCanvas) {
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
        }

        if (vehiclesChart) vehiclesChart.destroy();
        if (elements.vehiclesChartCanvas) {
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
        }

        if (!map && typeof L !== 'undefined' && LOCATIONS_CONFIG && elements.mapContainer) {
            initMap(data);
        } else if (isSilentUpdate) {
            updateMapPopups(data);
        }
    };

    const setTodayDate = () => {
         // NÂNG CẤP: Để trống bộ chọn ngày ban đầu để tải tất cả dữ liệu
        if (elements.adminDatePicker) {
            elements.adminDatePicker.value = ''; // Để trống
        }
    };

    // NÂNG CẤP: Tách hàm fetchAdminData thành 2 hàm: một cho dữ liệu tổng quan, một cho giao dịch
    const fetchAdminData = async (secretKey, isSilent = false, date = null) => {
        try {
            const dateParam = date ? `&date=${date}` : '';
            // Thay đổi action để chỉ lấy dữ liệu tổng quan (overview)
            const response = await fetch(`${APP_CONFIG.googleScriptUrl}?action=getAdminOverview&secret=${secretKey}${dateParam}&v=${new Date().getTime()}`);

            if (!response.ok) {
                throw new Error(`Lỗi mạng: ${response.statusText}`);
            }
            const result = await response.json();

            if (result.status !== 'success' || !result.data) {
                throw new Error(result.message || 'Lỗi không xác định từ server');
            }

            // Gộp dữ liệu mới vào dữ liệu cũ (nếu có)
            fullAdminData = { ...(fullAdminData || {}), ...result.data };
            updateDashboardUI(fullAdminData, isSilent);

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

    // NÂNG CẤP: Hàm mới chỉ để tải dữ liệu giao dịch
    const fetchTransactionData = async (secretKey, date = null) => {
        if (!elements.transactionLogBody) return;
        
        // Hiển thị trạng thái đang tải trong bảng
        elements.transactionLogBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 40px;">Đang tải chi tiết giao dịch...</td></tr>`;

        try {
            const dateParam = date ? `&date=${date}` : '';
            const response = await fetch(`${APP_CONFIG.googleScriptUrl}?action=getTransactions&secret=${secretKey}${dateParam}&v=${new Date().getTime()}`);

            if (!response.ok) throw new Error(`Lỗi mạng: ${response.statusText}`);
            
            const result = await response.json();
            if (result.status !== 'success' || !result.data) {
                throw new Error(result.message || 'Lỗi không xác định từ server');
            }

            // Gộp dữ liệu giao dịch vào biến fullAdminData và render lại bảng
            fullAdminData.transactions = result.data.transactions;
            renderTransactionTable(fullAdminData.transactions);

        } catch (error) {
            elements.transactionLogBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: var(--danger-color);">Lỗi tải giao dịch: ${error.message}</td></tr>`;
            console.error('Lỗi tải giao dịch:', error);
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
                if (currentSecretKey) {
                    // Khi đổi ngày, xóa dữ liệu giao dịch cũ và tải lại cả hai
                    if (fullAdminData) {
                        fullAdminData.transactions = null; 
                    }
                    fetchAdminData(currentSecretKey, false, elements.adminDatePicker.value);
                    if (document.getElementById('page-transactions').classList.contains('active')) {
                        fetchTransactionData(currentSecretKey, elements.adminDatePicker.value);
                    }
                }
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
