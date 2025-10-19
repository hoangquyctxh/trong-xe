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
        mapContainer: document.getElementById('map-container'),
        resetFilterBtn: document.getElementById('reset-filter-btn'),
        transactionLogBody: document.getElementById('transaction-log-body'), // MỚI
    };

    const locationMap = LOCATIONS_CONFIG.reduce((map, loc) => {
        map[loc.id] = loc.name;
        return map;
    }, {});

    let trafficChart, revenueChart, vehiclesChart, map, fullAdminData, currentSecretKey, autoRefreshInterval;

    const formatCurrency = (value) => {
        return value.toLocaleString('vi-VN');
    };

    // MỚI: Hàm lọc dữ liệu và cập nhật UI
    const filterDataByLocation = (locationId) => {
        if (!fullAdminData) return;

        const locationName = locationMap[locationId];
        elements.resetFilterBtn.style.display = 'block';

        // Cập nhật thẻ thống kê
        elements.totalRevenue.innerHTML = `${formatCurrency(fullAdminData.revenueByLocation[locationId] || 0)} <sup>đ</sup>`;
        elements.totalVehicles.textContent = fullAdminData.vehiclesByLocation[locationId] || 0;
        // Lưu ý: Dữ liệu 'xe đang gửi' theo từng điểm cần được tính toán từ backend.
        // Hiện tại, chúng ta sẽ hiển thị 'N/A' để cho biết dữ liệu này không có sẵn khi lọc.
        elements.currentVehicles.textContent = 'N/A';

        // Cập nhật tiêu đề biểu đồ
        elements.revenueChartTitle.textContent = `Doanh thu (Lọc: ${locationName})`;
        elements.vehiclesChartTitle.textContent = `Lượt xe (Lọc: ${locationName})`;

        // Làm nổi bật biểu đồ
        highlightChartSlice(revenueChart, locationName);
        highlightChartSlice(vehiclesChart, locationName);
    };

    // MỚI: Hàm reset bộ lọc
    const resetFilter = () => {
        if (!fullAdminData) return;
        updateDashboardUI(fullAdminData); // Vẽ lại mọi thứ với dữ liệu đầy đủ
        elements.resetFilterBtn.style.display = 'none';
        elements.revenueChartTitle.textContent = 'Doanh thu theo điểm';
        elements.vehiclesChartTitle.textContent = 'Lượt xe theo điểm';
    };

    // MỚI: Hàm tiện ích để làm nổi bật một phần của biểu đồ
    const highlightChartSlice = (chart, labelToHighlight) => {
        const labelIndex = chart.data.labels.indexOf(labelToHighlight);
        chart.data.datasets.forEach(dataset => {
            dataset.backgroundColor = dataset.originalBackgroundColor.map((color, index) => index === labelIndex ? color.replace('0.8', '1') : color.replace('1', '0.8').replace('0.8', '0.2'));
        });
        chart.update();
    };

    // MỚI: Hàm cập nhật popup trên bản đồ mà không cần vẽ lại
    const updateMapPopups = (data) => {
        if (!map || !map.markers) return;

        Object.keys(map.markers).forEach(locationId => {
            const marker = map.markers[locationId];
            const loc = LOCATIONS_CONFIG.find(l => l.id === locationId);
            if (!marker || !loc) return;

            const revenue = data.revenueByLocation[loc.id] || 0;
            const vehicleCount = data.vehiclesByLocation[loc.id] || 0;
            const newPopupContent = `<div style="font-family: 'Be Vietnam Pro', sans-serif;"><h4 style="margin: 0 0 8px 0; font-size: 1rem; color: var(--primary-accent);">${loc.name}</h4><p style="margin: 0 0 5px 0; font-size: 0.9rem;"><strong>Lượt xe:</strong> ${vehicleCount}</p><p style="margin: 0; font-size: 0.9rem;"><strong>Doanh thu:</strong> ${formatCurrency(revenue)} đ</p></div>`;
            
            marker.setPopupContent(newPopupContent);
        });
    };

    // MỚI: Hàm khởi tạo bản đồ
    const initMap = (data) => {
        // Chỉ khởi tạo map một lần
        if (map) {
            map.remove();
        }

        // Khởi tạo bản đồ, đặt trung tâm ở Hà Nội
        map = L.map(elements.mapContainer).setView([21.035, 105.84], 14);

        // Thêm lớp nền bản đồ từ OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // MỚI: Lưu trữ các marker để cập nhật sau
        map.markers = {};

        // Lặp qua các điểm trong cấu hình và thêm marker
        LOCATIONS_CONFIG.forEach(loc => {
            const revenue = data.revenueByLocation[loc.id] || 0;
            const vehicleCount = data.vehiclesByLocation[loc.id] || 0;

            const popupContent = `
                <div style="font-family: 'Be Vietnam Pro', sans-serif;">
                    <h4 style="margin: 0 0 8px 0; font-size: 1rem; color: var(--primary-accent);">${loc.name}</h4>
                    <p style="margin: 0 0 5px 0; font-size: 0.9rem;"><strong>Lượt xe:</strong> ${vehicleCount}</p>
                    <p style="margin: 0; font-size: 0.9rem;"><strong>Doanh thu:</strong> ${formatCurrency(revenue)} đ</p>
                </div>
            `;

            const marker = L.marker([loc.lat, loc.lng])
                .addTo(map)
                .bindPopup(popupContent);

            // Lưu marker lại
            map.markers[loc.id] = marker;

            // THÊM SỰ KIỆN CLICK VÀO MARKER
            marker.on('click', () => {
                filterDataByLocation(loc.id);
            });
        });
    };

    // MỚI: Hàm hiển thị bảng giao dịch
    const renderTransactionTable = (transactions) => {
        if (!elements.transactionLogBody) return;
        elements.transactionLogBody.innerHTML = '';

        if (!transactions || transactions.length === 0) {
            elements.transactionLogBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--text-secondary);">Không có giao dịch nào trong ngày hôm nay.</td></tr>`;
            return;
        }

        // Sắp xếp giao dịch mới nhất lên đầu
        transactions.sort((a, b) => new Date(b['Entry Time']) - new Date(a['Entry Time']));

        transactions.forEach(tx => {
            const row = document.createElement('tr');
            const statusClass = tx.Status === 'Đang gửi' ? 'parking' : 'departed';
            const feeDisplay = tx.Fee !== null && tx.Fee !== undefined ? `${formatCurrency(tx.Fee)}đ` : '--';
            const exitTimeDisplay = tx['Exit Time'] ? new Date(tx['Exit Time']).toLocaleTimeString('vi-VN') : '--';

            // CẬP NHẬT: Sắp xếp lại thứ tự và đảm bảo hiển thị đúng các cột
            row.innerHTML = `
                <td class="plate">${tx.Plate || '--'}</td>
                <td>${new Date(tx['Entry Time']).toLocaleString('vi-VN')}</td>
                <td>${exitTimeDisplay}</td>
                <td class="fee">${feeDisplay}</td>
                <td>${tx['Payment Method'] || '--'}</td>
                <td>${locationMap[tx.LocationID] || tx.LocationID || '--'}</td>
                <td style="text-align: center;"><span class="status-badge ${statusClass}">${tx.Status}</span></td>
            `;
            elements.transactionLogBody.appendChild(row);
        });
    };

    const updateDashboardUI = (data, isSilentUpdate = false) => {
        fullAdminData = data; // Lưu dữ liệu gốc
        elements.totalRevenue.innerHTML = `${formatCurrency(data.totalRevenueToday)} <sup>đ</sup>`;
        elements.totalVehicles.textContent = data.totalVehiclesToday;
        elements.currentVehicles.textContent = data.vehiclesCurrentlyParking;

        // MỚI: Gọi hàm render bảng giao dịch
        // Giả định backend trả về một mảng `data.transactions`
        renderTransactionTable(data.transactions);

        // Dữ liệu cho biểu đồ
        const locationNames = Object.keys(data.revenueByLocation).map(id => locationMap[id] || id);
        const revenueData = Object.values(data.revenueByLocation);
        const vehiclesData = Object.values(data.vehiclesByLocation);

        // 1. Biểu đồ lưu lượng xe theo giờ
        if (trafficChart) trafficChart.destroy();
        trafficChart = new Chart(elements.trafficChartCanvas, {
            type: 'bar',
            data: {
                labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
                datasets: [{
                    label: 'Số lượt xe vào',
                    data: data.trafficByHour,
                    backgroundColor: 'rgba(0, 123, 255, 0.7)', // --primary-accent-light
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

        // 2. Biểu đồ doanh thu theo điểm
        if (revenueChart) revenueChart.destroy();
        revenueChart = new Chart(elements.revenueChartCanvas, {
            type: 'doughnut',
            data: {
                labels: locationNames,
                datasets: [{
                    label: 'Doanh thu', // Sửa lỗi chính tả
                    data: revenueData,
                    backgroundColor: [
                        'rgba(40, 167, 69, 0.8)',   // success-color
                        'rgba(255, 193, 7, 0.8)',  // warning-color
                        'rgba(23, 162, 184, 0.8)', // info-color
                        'rgba(220, 53, 69, 0.8)',  // danger-color
                        'rgba(108, 117, 125, 0.8)' // secondary,
                    ],
                    // MỚI: Lưu màu gốc để reset
                    originalBackgroundColor: ['rgba(40, 167, 69, 0.8)', 'rgba(255, 193, 7, 0.8)', 'rgba(23, 162, 184, 0.8)', 'rgba(220, 53, 69, 0.8)', 'rgba(108, 117, 125, 0.8)']
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
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed !== null) {
                                    label += formatCurrency(context.parsed) + ' đ';
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });

        // 3. Biểu đồ lượt xe theo điểm
        if (vehiclesChart) vehiclesChart.destroy();
        vehiclesChart = new Chart(elements.vehiclesChartCanvas, {
            type: 'pie',
            data: {
                labels: locationNames,
                datasets: [{
                    label: 'Lượt xe',
                    data: vehiclesData,
                    backgroundColor: [
                        'rgba(0, 86, 179, 0.8)',    // primary-accent
                        'rgba(0, 123, 255, 0.8)',  // primary-accent-light
                        'rgba(108, 117, 125, 0.8)',// text-secondary
                        'rgba(255, 193, 7, 0.8)', // secondary-accent (yellow)
                        'rgba(23, 162, 184, 0.8)'  // info-color,
                    ],
                    // MỚI: Lưu màu gốc để reset
                    originalBackgroundColor: ['rgba(0, 86, 179, 0.8)', 'rgba(0, 123, 255, 0.8)', 'rgba(108, 117, 125, 0.8)', 'rgba(255, 193, 7, 0.8)', 'rgba(23, 162, 184, 0.8)']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } }
            }
        });

        // MỚI: Gọi hàm khởi tạo bản đồ sau khi có dữ liệu
        if (!map) { // Chỉ khởi tạo bản đồ lần đầu
            initMap(data);
        } else if (isSilentUpdate) {
            // Nếu là cập nhật "âm thầm", chỉ update popup
            updateMapPopups(data);
        }
    };

    const fetchAdminData = async (secretKey, isSilent = false) => {
        if (!isSilent) {
            elements.loader.style.display = 'flex';
        }
        try {
            const response = await fetch(`${APP_CONFIG.googleScriptUrl}?action=getAdminData&secret=${secretKey}`);
            if (!response.ok) {
                throw new Error(`Lỗi mạng: ${response.statusText}`);
            }
            const result = await response.json();
            if (result.status === 'success') {
                updateDashboardUI(result.data, isSilent);
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            // Chỉ hiện alert khi tải lần đầu
            if (!isSilent) {
                alert(`Không thể tải dữ liệu quản trị: ${error.message}`);
            }
            console.error("Lỗi tải dữ liệu quản trị:", error);
        } finally {
            if (!isSilent) {
                elements.loader.style.display = 'none';
            }
        }
    };

    const init = () => {
        const secretKey = prompt("Vui lòng nhập mật khẩu quản trị:", "");
        if (secretKey) {
            fetchAdminData(secretKey);
            currentSecretKey = secretKey; // Lưu lại mật khẩu

            // MỚI: Bắt đầu tự động làm mới
            if (autoRefreshInterval) clearInterval(autoRefreshInterval);
            autoRefreshInterval = setInterval(() => {
                fetchAdminData(currentSecretKey, true); // Gọi ở chế độ silent
            }, APP_CONFIG.autoRefreshInterval);
        } else {
            alert("Cần có mật khẩu để truy cập.");
            document.body.innerHTML = '<h1 style="text-align: center; margin-top: 50px;">TRUY CẬP BỊ TỪ CHỐI</h1>';
        }
    };

    // MỚI: Gắn sự kiện cho nút reset
    elements.resetFilterBtn.addEventListener('click', resetFilter);

    init();
});