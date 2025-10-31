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
        paginationControls: document.getElementById('pagination-controls'),
        toastContainer: document.getElementById('toast-container'),
        // Các phần tử cho cảnh báo an ninh
        securityAlertPlateInput: document.getElementById('security-alert-plate'),
        securityAlertReasonInput: document.getElementById('security-alert-reason'),
        defaultReasonsContainer: document.getElementById('default-reasons-container'),
        sendSecurityAlertBtn: document.getElementById('send-security-alert-btn'),
        removeAlertBtn: document.getElementById('remove-alert-btn'),
        activeAlertsList: document.getElementById('active-alerts-list'),
    };

    const securityChannel = new BroadcastChannel('security_alert_channel');

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

    const decodePlateNumber = (plate) => {
        if (!plate || typeof plate !== 'string' || typeof PLATE_DATA === 'undefined') return 'Chưa có thông tin';
        const cleanedPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
        for (const series in PLATE_DATA.specialSeries) {
            if (cleanedPlate.includes(series)) {
                if (series === 'NG') {
                    const diplomaticCode = parseInt(cleanedPlate.replace('NG', '').substring(0, 3), 10);
                    if (!isNaN(diplomaticCode)) {
                        for (const range in PLATE_DATA.diplomaticSeries) {
                            if (range.includes('-')) {
                                const [start, end] = range.split('-').map(Number);
                                if (diplomaticCode >= start && diplomaticCode <= end) return PLATE_DATA.diplomaticSeries[range];
                            } else if (diplomaticCode === parseInt(range, 10)) return PLATE_DATA.diplomaticSeries[range];
                        }
                    }
                    return "Xe của cơ quan đại diện ngoại giao";
                }
                return PLATE_DATA.specialSeries[series];
            }
        }
        let provinceCode = '', vehicleType = 'Chưa xác định';
        if (cleanedPlate.length === 9 && /^[0-9]{2}/.test(cleanedPlate)) {
            provinceCode = cleanedPlate.substring(0, 2); vehicleType = 'Xe máy';
        } else if (cleanedPlate.length === 8 && /^[0-9]{2}/.test(cleanedPlate)) {
            provinceCode = cleanedPlate.substring(0, 2); vehicleType = 'Ô tô';
        }
        if (!provinceCode) return 'Biển số không xác định';
        const provinceInfo = PLATE_DATA.provinces.find(p => p.codes.includes(provinceCode));
        const provinceName = provinceInfo ? provinceInfo.name : 'Tỉnh không xác định';
        return `${provinceName} - ${vehicleType}`;
    };

    let trafficChart, revenueChart, vehiclesChart, map, fullAdminData, currentSecretKey, autoRefreshInterval, currentVehicleContext = null;
    
    let currentPage = 1;
    const rowsPerPage = 15;
    let activeSecurityAlerts = {};

    const formatCurrency = (value) => {
        const numValue = Number(value);
        return isNaN(numValue) ? '0' : numValue.toLocaleString('vi-VN');
    };

    const showToast = (message, type = 'info') => {
        if (!elements.toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️');
        toast.innerHTML = `${icon} <span>${message}</span>`;
        elements.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'fadeOutToast 0.5s ease forwards';
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    };

    const filterDataByLocation = (locationId) => {
        if (!fullAdminData) return;
        const locationName = getLocationName(locationId);
        elements.resetFilterBtn.style.display = 'block';
        const currentVehiclesAtLocation = (fullAdminData.transactions || []).filter(tx => tx.LocationID === locationId && tx.Status === 'Đang gửi').length;
        elements.totalRevenue.innerHTML = `${formatCurrency(fullAdminData.revenueByLocation?.[locationId] || 0)} <sup>đ</sup>`;
        elements.totalVehicles.textContent = fullAdminData.vehiclesByLocation?.[locationId] || 0;
        elements.currentVehicles.textContent = currentVehiclesAtLocation;
        elements.revenueChartTitle.textContent = `Doanh thu (Lọc: ${locationName})`;
        elements.vehiclesChartTitle.textContent = `Lượt xe (Lọc: ${locationName})`;
        highlightChartSlice(revenueChart, locationName);
        highlightChartSlice(vehiclesChart, locationName);
    };

    const resetFilter = () => {
        if (!fullAdminData) return;
        updateDashboardUI(fullAdminData);
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
        if (map) map.remove();
        map = L.map(elements.mapContainer).setView([21.035, 105.84], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        map.markers = {};
        LOCATIONS_CONFIG.forEach(loc => {
            const revenue = data.revenueByLocation?.[loc.id] || 0;
            const vehicleCount = data.vehiclesByLocation?.[loc.id] || 0;
            const popupContent = `<div style="font-family: 'Be Vietnam Pro', sans-serif;"><h4 style="margin: 0 0 8px 0;">${getLocationName(loc.id)}</h4><p style="margin: 0;"><strong>Lượt xe:</strong> ${vehicleCount}</p><p style="margin: 0;"><strong>Doanh thu:</strong> ${formatCurrency(revenue)} đ</p></div>`;
            const marker = L.marker([loc.lat, loc.lng]).addTo(map).bindPopup(popupContent);
            map.markers[loc.id] = marker;
            marker.on('click', () => filterDataByLocation(loc.id));
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
            if (targetId === 'page-map' && map) setTimeout(() => map.invalidateSize(), 10);
            // Không cần tải lại dữ liệu ở đây vì đã tải từ đầu
        });
    };

    const renderTransactionTable = (transactions, page = 1) => {
        if (!elements.transactionLogBody) return;
        elements.transactionLogBody.innerHTML = '';
        currentPage = page;
        if (!transactions || transactions.length === 0) {
            elements.transactionLogBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px;">Không có giao dịch.</td></tr>`;
            setupPagination(0, 1);
            return;
        }
        const startIndex = (page - 1) * rowsPerPage;
        const endIndex = startIndex + rowsPerPage;
        const paginatedItems = transactions.slice(startIndex, endIndex);
        paginatedItems.forEach(tx => {
            const row = document.createElement('tr');
            const statusClass = tx.Status === 'Đang gửi' ? 'parking' : 'departed';
            const feeDisplay = tx.Fee ? `${formatCurrency(tx.Fee)}đ` : '--';
            const exitTimeDisplay = tx['Exit Time'] ? new Date(tx['Exit Time']).toLocaleString('vi-VN') : '--';
            const decodedPlateInfo = decodePlateNumber(tx.Plate);
            row.innerHTML = `
                <td class="plate" title="${decodedPlateInfo}">${tx.Plate || '--'}</td>
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
        setupPagination(transactions.length, page);
    };

    const openEditModal = (uniqueID) => {
        const transaction = fullAdminData.transactions.find(tx => tx.UniqueID === uniqueID);
        if (!transaction) {
            showToast('Không tìm thấy giao dịch.', 'error');
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

    const renderActiveAlertsDashboard = () => {
        if (!elements.activeAlertsList) return;
        elements.activeAlertsList.innerHTML = '';
        const alertPlates = Object.keys(activeSecurityAlerts);
        if (alertPlates.length === 0) {
            elements.activeAlertsList.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-secondary);">Không có cảnh báo nào đang hoạt động.</div>`;
            return;
        }
        alertPlates.forEach(plate => {
            const alertInfo = activeSecurityAlerts[plate];
            // NÂNG CẤP: Tạo HTML cho phần phản hồi nếu có
            let feedbackHtml = '';
            if (alertInfo.feedback) {
                // Tách phản hồi chính và ghi chú để hiển thị đẹp hơn
                const feedbackParts = alertInfo.feedback.split('(Ghi chú:');
                const mainFeedback = feedbackParts[0].trim();
                const note = feedbackParts[1] ? feedbackParts[1].replace(')', '').trim() : '';
                feedbackHtml = `
                    <div class="alert-feedback">
                        Phản hồi từ <strong>${alertInfo.feedbackBy || 'Điểm trực'}</strong>: "${mainFeedback}"
                        ${note ? `<br><span style="color: #555; font-style: normal;">Ghi chú riêng: <em>${note}</em></span>` : ''}
                    </div>
                `;
            }
            const alertItem = document.createElement('div');
            alertItem.className = 'alert-item';
            alertItem.innerHTML = `
                <div class="alert-info">
                    <span class="alert-plate">${plate}</span>
                    <span class="alert-level ${alertInfo.level}">${alertInfo.level === 'block' ? 'CHẶN' : 'CẢNH BÁO'}</span>
                    <p class="alert-reason">Lý do: ${alertInfo.reason || 'Không có ghi chú'}</p>
                    ${feedbackHtml}
                </div>
                <button class="action-button btn-secondary remove-alert-inline-btn" data-plate="${plate}" style="padding: 5px 15px; width: auto;">Gỡ</button>
            `;
            elements.activeAlertsList.appendChild(alertItem);
        });
    };

    const fetchActiveAlerts = async (isSilent = false) => {
        try {
            const response = await fetch(`${APP_CONFIG.googleScriptUrl}?action=getActiveAlerts&v=${new Date().getTime()}`);
            if (!response.ok) throw new Error(`Lỗi mạng: ${response.statusText}`);
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            activeSecurityAlerts = result.data || {};
            renderActiveAlertsDashboard();
        } catch (error) {
            console.error('Lỗi tải danh sách cảnh báo:', error);
            if (!isSilent) {
                showToast(`Không thể tải danh sách cảnh báo: ${error.message}`, 'error');
            }
        }
    };

    const sendSecurityAlert = () => {
        const plate = elements.securityAlertPlateInput.value.trim().toUpperCase();
        const reason = elements.securityAlertReasonInput.value.trim();
        const level = document.querySelector('input[name="alert-level"]:checked')?.value || 'warning';
        if (!plate) {
            showToast('Vui lòng nhập biển số xe cần cảnh báo.', 'error');
            return;
        }
        fetch(APP_CONFIG.googleScriptUrl, {
            method: 'POST',
            body: JSON.stringify({ action: 'addOrUpdateAlert', plate, reason, level })
        }).catch(error => showToast(`Lỗi đồng bộ cảnh báo lên server: ${error.message}`, 'error'));
        const payload = { type: 'SECURITY_ALERT', plate, reason, level, sender: 'Admin', timestamp: new Date().toISOString() };
        securityChannel.postMessage(payload);
        showToast(`Đã gửi cảnh báo cho biển số ${plate} đến tất cả các điểm.`, 'success');
        elements.securityAlertPlateInput.value = '';
        elements.securityAlertReasonInput.value = '';
    };

    const removeSecurityAlert = (plateToRemove) => {
        const plate = plateToRemove || elements.securityAlertPlateInput.value.trim().toUpperCase();
        if (!plate) {
            showToast('Vui lòng nhập biển số xe cần gỡ cảnh báo.', 'error');
            return;
        }
        fetch(APP_CONFIG.googleScriptUrl, {
            method: 'POST',
            body: JSON.stringify({ action: 'removeAlert', plate })
        }).catch(error => showToast(`Lỗi đồng bộ gỡ cảnh báo lên server: ${error.message}`, 'error'));
        const payload = { type: 'REMOVE_SECURITY_ALERT', plate, sender: 'Admin', timestamp: new Date().toISOString() };
        securityChannel.postMessage(payload);
        showToast(`Đã gửi yêu cầu gỡ cảnh báo cho biển số ${plate}.`, 'info');
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
            const response = await fetch(APP_CONFIG.googleScriptUrl, { method: 'POST', body: JSON.stringify(payload) });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            showToast('Cập nhật thành công!', 'success');
            closeEditModal();
            // Tải lại cả hai loại dữ liệu để đảm bảo đồng bộ
            await fetchAllAdminData(currentSecretKey, elements.adminDatePicker.value, true);
        } catch (error) {
            showToast(`Lỗi khi lưu: ${error.message}`, 'error');
        } finally {
            elements.saveEditBtn.disabled = false;
            elements.saveEditBtn.textContent = 'Lưu thay đổi';
        }
    };

    const handleSecurityChannelMessage = (event) => {
        const { type, plate, reason, level, feedback, feedbackBy } = event.data;
        const cleanedPlate = plate ? plate.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
        if (!cleanedPlate) return;
        if (type === 'SECURITY_ALERT') {
            activeSecurityAlerts[cleanedPlate] = { reason, level };
        } else if (type === 'REMOVE_SECURITY_ALERT') {
            showToast(`Đã gỡ cảnh báo cho xe ${cleanedPlate}.`, 'info');
            if (activeSecurityAlerts[cleanedPlate]) delete activeSecurityAlerts[cleanedPlate];
        } else if (type === 'ALERT_FEEDBACK') { // NÂNG CẤP: Xử lý tin nhắn phản hồi
            if (activeSecurityAlerts[cleanedPlate]) {
                activeSecurityAlerts[cleanedPlate].feedback = feedback;
                activeSecurityAlerts[cleanedPlate].feedbackBy = feedbackBy;
                showToast(`Nhận được phản hồi cho xe ${plate} từ ${feedbackBy}.`, 'info');
            }
        }
        renderActiveAlertsDashboard();
    };

    const updateDashboardUI = (data) => {
        if (!data) return;
        fullAdminData = { ...fullAdminData, ...data };
        
        elements.totalRevenue.innerHTML = `${formatCurrency(fullAdminData.totalRevenueForDate ?? 0)} <sup>đ</sup>`;
        elements.totalVehicles.textContent = fullAdminData.totalVehiclesForDate ?? 0;
        elements.currentVehicles.textContent = fullAdminData.vehiclesCurrentlyParking ?? 0;
        
        const locationData = { names: [], revenue: [], vehicles: [] };
        if (fullAdminData?.revenueByLocation && fullAdminData?.vehiclesByLocation) {
            Object.keys(fullAdminData.revenueByLocation).forEach(id => {
                locationData.names.push(getLocationName(id));
                locationData.revenue.push(fullAdminData.revenueByLocation[id] || 0);
                locationData.vehicles.push(fullAdminData.vehiclesByLocation[id] || 0);
            });
        }
        
        const trafficData = fullAdminData?.trafficByHour || Array(24).fill(0);
        if (trafficChart) trafficChart.destroy();
        if (elements.trafficChartCanvas) {
            trafficChart = new Chart(elements.trafficChartCanvas, {
                type: 'bar',
                data: {
                    labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
                    datasets: [{ label: 'Số lượt xe vào', data: trafficData, backgroundColor: 'rgba(0, 123, 255, 0.7)', borderColor: 'rgba(0, 123, 255, 1)', borderWidth: 1 }]
                },
                options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } }
            });
        }

        const chartColors = ['rgba(40, 167, 69, 0.8)', 'rgba(255, 193, 7, 0.8)', 'rgba(23, 162, 184, 0.8)', 'rgba(220, 53, 69, 0.8)', 'rgba(108, 117, 125, 0.8)'];
        if (revenueChart) revenueChart.destroy();
        if (elements.revenueChartCanvas) {
            revenueChart = new Chart(elements.revenueChartCanvas, {
                type: 'doughnut',
                data: {
                    labels: locationData.names,
                    datasets: [{ label: 'Doanh thu', data: locationData.revenue, backgroundColor: chartColors, originalBackgroundColor: [...chartColors] }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: (c) => `${c.label || ''}: ${formatCurrency(c.parsed)} đ` } } } }
            });
        }

        if (vehiclesChart) vehiclesChart.destroy();
        if (elements.vehiclesChartCanvas) {
            vehiclesChart = new Chart(elements.vehiclesChartCanvas, {
                type: 'pie',
                data: {
                    labels: locationData.names,
                    datasets: [{ label: 'Lượt xe', data: locationData.vehicles, backgroundColor: [...chartColors].reverse(), originalBackgroundColor: [...chartColors].reverse() }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }
            });
        }

        if (!map && typeof L !== 'undefined' && LOCATIONS_CONFIG && elements.mapContainer) initMap(fullAdminData);
        else updateMapPopups(fullAdminData);
    };

    const setTodayDate = () => {
        if (elements.adminDatePicker) elements.adminDatePicker.value = '';
    };

    const fetchAllAdminData = async (secretKey, date = null, isSilent = false) => {
        if (!isSilent) {
            elements.loader.style.display = 'flex';
            elements.loader.querySelector('span').textContent = 'Đang tải dữ liệu...';
        }
        try {
            const dateParam = date ? `&date=${date}` : '';
            const overviewPromise = fetch(`${APP_CONFIG.googleScriptUrl}?action=getAdminOverview&secret=${secretKey}${dateParam}&v=${new Date().getTime()}`).then(res => res.json());
            const transactionsPromise = fetch(`${APP_CONFIG.googleScriptUrl}?action=getTransactions&secret=${secretKey}${dateParam}&v=${new Date().getTime()}`).then(res => res.json());

            const [overviewResult, transactionsResult] = await Promise.all([overviewPromise, transactionsPromise]);

            if (overviewResult.status !== 'success' || !overviewResult.data) {
                throw new Error(overviewResult.message || 'Lỗi tải dữ liệu tổng quan.');
            }
            if (transactionsResult.status !== 'success' || !transactionsResult.data) {
                throw new Error(transactionsResult.message || 'Lỗi tải danh sách giao dịch.');
            }

            fullAdminData = {
                ...overviewResult.data,
                transactions: transactionsResult.data.transactions
            };

            updateDashboardUI(fullAdminData);
            renderTransactionTable(fullAdminData.transactions);
            return true;

        } catch (error) {
            if (!isSilent) {
                showToast(`Không thể tải dữ liệu quản trị: ${error.message}`, 'error');
                console.error('ADMIN ERROR LOG:', error);
                showLoginScreen('Đã xảy ra lỗi. Vui lòng thử lại.');
            }
            return false;
        } finally {
            if (!isSilent) {
                elements.loader.style.display = 'none';
            }
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
            
            const success = await fetchAllAdminData(secretKey, dateToFetch);

            if (success) {
                elements.loader.style.display = 'none';
                if (autoRefreshInterval) clearInterval(autoRefreshInterval);
                autoRefreshInterval = setInterval(() => {
                    const currentDate = elements.adminDatePicker.value;
                    fetchAllAdminData(secretKey, currentDate, true);
                }, APP_CONFIG.autoRefreshInterval || 30000);

                // Tải cảnh báo lần đầu
                fetchActiveAlerts(false); 
                // NÂNG CẤP: Tự động làm mới danh sách cảnh báo mỗi 5 giây trong âm thầm
                setInterval(() => fetchActiveAlerts(true), 5000);
            }
        } catch (error) {
            console.error("Lỗi nghiêm trọng khi bắt đầu phiên quản trị:", error);
            if (elements.loader) elements.loader.style.display = 'none';
            alert("Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.");
        }
    };

    const setupPagination = (totalItems, currentPage) => {
        if (!elements.paginationControls) return;
        elements.paginationControls.innerHTML = '';
        const pageCount = Math.ceil(totalItems / rowsPerPage);
        if (pageCount <= 1) return;
        const prevButton = document.createElement('button');
        prevButton.textContent = '« Trước';
        prevButton.className = 'action-button btn-secondary';
        prevButton.disabled = currentPage === 1;
        prevButton.addEventListener('click', () => {
            if (currentPage > 1) renderTransactionTable(fullAdminData.transactions, currentPage - 1);
        });
        elements.paginationControls.appendChild(prevButton);
        const pageInfo = document.createElement('span');
        pageInfo.textContent = `Trang ${currentPage} / ${pageCount}`;
        pageInfo.style.fontWeight = 'bold';
        pageInfo.style.margin = '0 10px';
        elements.paginationControls.appendChild(pageInfo);
        const nextButton = document.createElement('button');
        nextButton.textContent = 'Sau »';
        nextButton.className = 'action-button btn-secondary';
        nextButton.disabled = currentPage === pageCount;
        nextButton.addEventListener('click', () => {
            if (currentPage < pageCount) renderTransactionTable(fullAdminData.transactions, currentPage + 1);
        });
        elements.paginationControls.appendChild(nextButton);
        elements.paginationControls.querySelectorAll('button').forEach(btn => {
            btn.style.width = 'auto';
            btn.style.padding = '8px 16px';
        });
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
                    fetchAllAdminData(currentSecretKey, elements.adminDatePicker.value);
                }
            });
            if (elements.transactionLogBody) elements.transactionLogBody.addEventListener('click', (e) => { if (e.target.classList.contains('edit-btn')) openEditModal(e.target.dataset.uniqueid); });
            if (elements.closeEditModalBtn) elements.closeEditModalBtn.addEventListener('click', closeEditModal);
            if (elements.cancelEditBtn) elements.cancelEditBtn.addEventListener('click', closeEditModal);
            if (elements.editForm) elements.editForm.addEventListener('submit', saveTransactionChanges);
            if (elements.startSessionBtn) elements.startSessionBtn.addEventListener('click', startAdminSession);
            if (elements.sendSecurityAlertBtn) elements.sendSecurityAlertBtn.addEventListener('click', sendSecurityAlert);
            if (elements.removeAlertBtn) elements.removeAlertBtn.addEventListener('click', () => removeSecurityAlert());
            if (elements.defaultReasonsContainer) {
                elements.defaultReasonsContainer.addEventListener('click', (e) => {
                    if (e.target.classList.contains('default-reason-btn')) elements.securityAlertReasonInput.value = e.target.textContent;
                });
            }
            securityChannel.addEventListener('message', handleSecurityChannelMessage);
            if (elements.activeAlertsList) {
                elements.activeAlertsList.addEventListener('click', (e) => {
                    if (e.target.classList.contains('remove-alert-inline-btn')) removeSecurityAlert(e.target.dataset.plate);
                });
            }
            showLoginScreen('Vui lòng xác nhận để truy cập trang quản trị.');
        } catch (error) {
            console.error("Lỗi nghiêm trọng khi khởi tạo:", error);
            document.body.innerHTML = `<h1 style="text-align: center; margin-top: 50px;">LỖI KHỞI TẠO TRANG. VUI LÒNG TẢI LẠI.</h1><p style="text-align: center;">Chi tiết: ${error.message}</p>`;
        }
    };

    init();
});
