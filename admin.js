// admin.js - PHIÊN BẢN HOÀN CHỈNH ĐÃ SỬA LỖI MENU DI ĐỘNG
document.addEventListener('DOMContentLoaded', () => {
    // =================================================================
    // KHU VỰC 0: THIẾT LẬP SUPABASE
    // =================================================================
    const SUPABASE_URL = 'https://mtihqbmlbtrgvamxwrkm.supabase.co'; // <-- THAY BẰNG URL CỦA BẠN
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10aWhxYm1sYnRyZ3ZhbXh3cmttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMTkwMDEsImV4cCI6MjA3NzU5NTAwMX0.hR5X8bp-XD2DfxUnvWF-yxVk4sFVW2zBunp5XXnIZ0Y'; // <-- THAY BẰNG ANON PUBLIC KEY CỦA BẠN
    const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // =================================================================
    // KHU VỰC 1: THAM CHIẾU DOM
    // =================================================================
    const elements = {
        loginScreen: document.getElementById('login-screen'),
        loginForm: document.getElementById('login-form'),
        loginEmailInput: document.getElementById('login-email'),
        loginPasswordInput: document.getElementById('login-password'),
        loginErrorMessage: document.getElementById('login-error-message'),
        mainAdminContent: document.getElementById('main-admin-content'),
        logoutBtn: document.getElementById('logout-btn'),

        pageTitle: document.getElementById('page-title'),
        pageDescription: document.getElementById('page-description'),

        totalRevenue: document.getElementById('total-revenue'),
        totalVehicles: document.getElementById('total-vehicles'),
        currentVehicles: document.getElementById('current-vehicles'),
        trafficChartCanvas: document.getElementById('traffic-chart'),
        revenueChartCanvas: document.getElementById('revenue-chart'),
        vehiclesChartCanvas: document.getElementById('vehicles-chart'),
        sidebar: document.querySelector('.sidebar'),
        pages: document.querySelectorAll('.page-content'),
        mapContainer: document.getElementById('map-container'),
        resetFilterBtn: document.getElementById('reset-filter-btn'),
        transactionLogBody: document.getElementById('transaction-log-body'),
        adminDatePicker: document.getElementById('admin-date-picker'),
        
        transactionSearchInput: document.getElementById('transaction-search-input'),
        transactionScanQrBtn: document.getElementById('transaction-scan-qr-btn'),
        transactionSearchWrapper: document.getElementById('transaction-search-wrapper'),
        adminCameraFeed: document.getElementById('admin-camera-feed'),
        adminQrScannerModal: document.getElementById('admin-qr-scanner-modal'),
        adminScanFeedback: document.getElementById('admin-scan-feedback'),
        closeAdminScannerBtn: document.getElementById('close-admin-scanner-btn'),
        
        paginationControls: document.getElementById('pagination-controls'),
        toastContainer: document.getElementById('toast-container'),
        
        securityAlertPlateInput: document.getElementById('security-alert-plate'),
        securityAlertReasonInput: document.getElementById('security-alert-reason'),
        addLocationBtn: document.getElementById('add-location-btn'),
        locationsTableBody: document.getElementById('locations-table-body'),
        locationModal: document.getElementById('location-modal'),
        locationModalTitle: document.getElementById('location-modal-title'),
        closeLocationModalBtn: document.getElementById('close-location-modal-btn'),
        cancelLocationBtn: document.getElementById('cancel-location-btn'),
        saveLocationBtn: document.getElementById('save-location-btn'),
        deleteLocationBtn: document.getElementById('delete-location-btn'),
        locationForm: document.getElementById('location-form'),
        locationIdInput: document.getElementById('location-id'),
        locationNameInput: document.getElementById('location-name'),
        locationLatInput: document.getElementById('location-lat'),
        locationLngInput: document.getElementById('location-lng'),
        locationAddressInput: document.getElementById('location-address'),
        locationCapacityInput: document.getElementById('location-capacity'),
        locationHotlineInput: document.getElementById('location-hotline'),
        locationOperatingHoursInput: document.getElementById('location-operating-hours'),
        locationEventNameInput: document.getElementById('location-event-name'), // NÂNG CẤP
        locationFeePolicyTypeSelect: document.getElementById('location-fee-policy-type'), // NÂNG CẤP: Dropdown loại hình thu phí
        // NÂNG CẤP: Các ô nhập phí tùy chỉnh
        locationFeeCollectionPolicySelect: document.getElementById('location-fee-collection-policy'), // NÂNG CẤP
        feeHourlyDayInput: document.getElementById('location-fee-hourly-day'),
        feeHourlyNightInput: document.getElementById('location-fee-hourly-night'),
        feePerEntryInput: document.getElementById('location-fee-per-entry'),
        feeDailyInput: document.getElementById('location-fee-daily'),
        defaultReasonsContainer: document.getElementById('default-reasons-container'),
        sendSecurityAlertBtn: document.getElementById('send-security-alert-btn'),
        removeAlertBtn: document.getElementById('remove-alert-btn'),
        activeAlertsList: document.getElementById('active-alerts-list'),

        // NÂNG CẤP: Các phần tử trang Cài đặt
        paymentQrUrlInput: document.getElementById('payment-qr-url'),
        saveSettingsBtn: document.getElementById('save-settings-btn'),

        // SỬA LỖI: Khai báo chính xác các phần tử cho menu di động
        menuToggleBtn: document.getElementById('menu-toggle-btn'),
        sidebarOverlay: document.querySelector('.sidebar-overlay'),

        // NÂNG CẤP: Các phần tử quản lý nhân sự
        addStaffBtn: document.getElementById('add-staff-btn'),
        staffTableBody: document.getElementById('staff-table-body'),
        staffModal: document.getElementById('staff-modal'),
        staffModalTitle: document.getElementById('staff-modal-title'),
        closeStaffModalBtn: document.getElementById('close-staff-modal-btn'),
        cancelStaffBtn: document.getElementById('cancel-staff-btn'),
        saveStaffBtn: document.getElementById('save-staff-btn'),
        deleteStaffBtn: document.getElementById('delete-staff-btn'),
        staffForm: document.getElementById('staff-form'),
        staffLocationAssignmentSelect: document.getElementById('staff-location-assignment'),
    };

    // =================================================================
    // KHU VỰC 2: BIẾN TRẠNG THÁI TOÀN CỤC
    // =================================================================
    let trafficChart, revenueChart, vehiclesChart, map, fullAdminData;
    let LOCATIONS_DATA = [];
    let transactionCurrentPage = 1;
    let STAFF_DATA = []; // NÂNG CẤP: Lưu trữ dữ liệu nhân viên
    const transactionRowsPerPage = 10;
    let transactionSearchTerm = '';
    let currentEditingRow = null; // NÂNG CẤP: Theo dõi dòng đang được sửa
    let activeSecurityAlerts = {};

    // =================================================================
    // KHU VỰC 3: CÁC HÀM TIỆN ÍCH (UTILITY FUNCTIONS)
    // =================================================================
    const getLocationName = (locationId) => {
        if (!locationId) return '--';
        const location = LOCATIONS_DATA.find(loc => loc.id === locationId);
        return location ? location.name : locationId;
    };

    const formatCurrency = (value) => {
        const numValue = Number(value);
        return isNaN(numValue) ? '0' : numValue.toLocaleString('vi-VN');
    };

    const showToast = (message, type = 'info') => {
        if (!elements.toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        // SỬA LỖI TRIỆT ĐỂ: Đảm bảo `message` luôn là một chuỗi trước khi hiển thị.
        // Chuyển đổi đối tượng lỗi thành chuỗi một cách an toàn.
        const messageText = (typeof message === 'object' && message.message) ? message.message : String(message);

        const titles = { success: 'Thành công!', error: 'Lỗi!', info: 'Thông báo' }; // Sửa lỗi cú pháp
        const icons = { success: '✅', error: '❌', info: 'ℹ️' };
        toast.innerHTML = `${icons[type] || ''} <strong>${titles[type] || ''}</strong> <span>${messageText}</span>`;

        elements.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'fadeOutToast 0.5s ease forwards';
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    };

    const debounce = (func, delay) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    };

    // =================================================================
    // KHU VỰC 4: CÁC HÀM XỬ LÝ GIAO DIỆN (UI RENDERING)
    // =================================================================

    const filterDataByLocation = (locationId) => {
        if (!fullAdminData) return;
        const locationName = getLocationName(locationId);
        if (elements.resetFilterBtn) elements.resetFilterBtn.style.display = 'block';
        const currentVehiclesAtLocation = (fullAdminData.transactions || []).filter(tx => tx.location_id === locationId && tx.status === 'Đang gửi').length;
        elements.totalRevenue.innerHTML = `${formatCurrency(fullAdminData.revenueByLocation?.[locationId] || 0)} <sup>đ</sup>`;
        elements.totalVehicles.textContent = fullAdminData.vehiclesByLocation?.[locationId] || 0;
        elements.currentVehicles.textContent = currentVehiclesAtLocation;
        document.getElementById('revenue-chart-title').textContent = `Doanh thu (Lọc: ${locationName})`;
        document.getElementById('vehicles-chart-title').textContent = `Lượt xe (Lọc: ${locationName})`;
        highlightChartSlice(revenueChart, locationName);
        highlightChartSlice(vehiclesChart, locationName);
    };

    const resetFilter = () => {
        if (!fullAdminData) return;
        updateDashboardUI(fullAdminData);
        if (elements.resetFilterBtn) elements.resetFilterBtn.style.display = 'none';
        document.getElementById('revenue-chart-title').textContent = 'Doanh thu theo bãi đỗ xe';
        document.getElementById('vehicles-chart-title').textContent = 'Lượt xe theo bãi đỗ xe';
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
            const loc = LOCATIONS_DATA.find(l => l.id === locationId);
            if (!marker || !loc) return;
            const revenue = data.revenueByLocation?.[loc.id] || 0;
            const vehicleCount = data.vehiclesByLocation?.[loc.id] || 0;
            const newPopupContent = `<div style="font-family: 'Be Vietnam Pro', sans-serif;"><h4 style="margin: 0 0 8px 0;">${loc.name}</h4><p style="margin: 0;"><strong>Lượt xe:</strong> ${vehicleCount}</p><p style="margin: 0;"><strong>Doanh thu:</strong> ${formatCurrency(revenue)} đ</p></div>`;
            marker.setPopupContent(newPopupContent);
        });
    };

    const initMap = (data) => {
        if (map) map.remove();
        if (!elements.mapContainer || typeof L === 'undefined') return;
        map = L.map(elements.mapContainer).setView([21.035, 105.84], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        map.markers = {};
        LOCATIONS_DATA.forEach(loc => {
            const revenue = data.revenueByLocation?.[loc.id] || 0;
            const vehicleCount = data.vehiclesByLocation?.[loc.id] || 0;
            const popupContent = `<div style="font-family: 'Be Vietnam Pro', sans-serif;"><h4 style="margin: 0 0 8px 0;">${loc.name}</h4><p style="margin: 0;"><strong>Lượt xe:</strong> ${vehicleCount}</p><p style="margin: 0;"><strong>Doanh thu:</strong> ${formatCurrency(revenue)} đ</p></div>`;
            const marker = L.marker([loc.lat, loc.lng]).addTo(map).bindPopup(popupContent);
            map.markers[loc.id] = marker;
            marker.on('click', () => filterDataByLocation(loc.id));
        });
    };

    const setupNavigation = () => {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
    
                const targetId = link.dataset.target;
                const pageTitleText = link.querySelector('span').textContent;
                const pageDescriptionText = {
                    'Tổng quan': 'Thống kê và biểu đồ trực quan về hoạt động trong ngày.',
                    'Giao dịch': 'Tra cứu, xem và chỉnh sửa tất cả các giao dịch trong hệ thống.',
                    'Quản lý Vị trí': 'Xem, thêm, sửa, xóa thông tin các điểm trông giữ xe của hệ thống.',
                    'An ninh': 'Các công cụ chuyên biệt để quản lý và giám sát an ninh hệ thống.',
                    'Nhân sự': 'Quản lý tài khoản đăng nhập cho nhân viên tạm thời.'
                }[pageTitleText] || 'Chào mừng đến với trang quản trị';
    
                elements.pageTitle.textContent = pageTitleText;
                elements.pageDescription.textContent = pageDescriptionText;
    
                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
    
                elements.pages.forEach(page => page.classList.toggle('active', page.id === targetId));
    
                if (targetId === 'page-locations' && map) setTimeout(() => map.invalidateSize(), 10);
                if (targetId === 'page-transactions') fetchTransactions(1, transactionSearchTerm);
                
                handleSidebarLinkClick(); // Đóng menu trên di động sau khi click
            });
        });
    };

    const renderTransactionTable = (transactions, totalCount) => {
        if (!elements.transactionLogBody) return;
        elements.transactionLogBody.innerHTML = '';

        if (!transactions || transactions.length === 0) {
            const message = transactionSearchTerm ?
                `Không tìm thấy giao dịch nào khớp với "${transactionSearchTerm}".` :
                'Chưa có giao dịch nào trong hệ thống.';
            elements.transactionLogBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px;">${message}</td></tr>`;
            setupTransactionPagination(0, 1);
            return;
        }

        transactions.forEach(tx => {
            const row = document.createElement('tr');
            const statusClass = tx.status === 'Đang gửi' ? 'parking' : 'departed';
            const feeDisplay = tx.fee ? `${formatCurrency(tx.fee)}đ` : '--';
            const exitTimeDisplay = tx.exit_time ? new Date(tx.exit_time).toLocaleString('vi-VN') : '--';
            row.dataset.uniqueid = tx.unique_id;
            row.dataset.plate = tx.plate || '';
            row.dataset.entryTime = tx.entry_time || '';
            row.dataset.exitTime = tx.exit_time || '';
            row.dataset.fee = tx.fee ?? '';
            row.dataset.paymentMethod = tx.payment_method || '';
            row.dataset.status = tx.status || 'Đã rời bãi';

            row.innerHTML = `
                <td class="plate">${tx.plate || '--'}</td>
                <td>${new Date(tx.entry_time).toLocaleString('vi-VN')}</td>
                <td>${exitTimeDisplay}</td>
                <td class="fee">${feeDisplay}</td>
                <td>${tx.payment_method || '--'}</td>
                <td>${getLocationName(tx.location_id)}</td>
                <td style="text-align: center;"><span class="status-badge ${statusClass}">${tx.status}</span></td>
                <td style="text-align: center; font-size: 0.8rem; color: var(--text-secondary);">Nhấn đúp để sửa</td>
            `;
            elements.transactionLogBody.appendChild(row);
        });
        setupTransactionPagination(totalCount, transactionCurrentPage);
    };

    // NÂNG CẤP: Render bảng nhân viên
    const renderStaffTable = () => {
        if (!elements.staffTableBody) return;
        elements.staffTableBody.innerHTML = '';
        if (STAFF_DATA.length === 0) {
            elements.staffTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px;">Chưa có nhân viên nào.</td></tr>`;
            return;
        }
        STAFF_DATA.forEach(staff => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${staff.username}</strong></td>
                <td>${staff.full_name}</td>
                <td>${getLocationName(staff.location_id)}</td>
                <td>
                    <button class="edit-btn edit-staff-btn" data-id="${staff.id}">Sửa</button>
                    <button class="edit-btn delete-staff-btn" data-id="${staff.id}" style="color: var(--danger-color); margin-left: 5px;">Xóa</button>
                </td>
            `;
            elements.staffTableBody.appendChild(row);
        });
    };


    const closeInlineEditor = () => {
        if (currentEditingRow) {
            const formRow = currentEditingRow.nextElementSibling;
            const formContainer = formRow?.querySelector('.edit-inline-form-container');
            if (formContainer) {
                formContainer.style.maxHeight = null;
                setTimeout(() => {
                    formRow.remove();
                }, 400);
            }
            currentEditingRow.classList.remove('editing-row');
            currentEditingRow = null;
        }
    };

    const openInlineEditor = (clickedRow) => {
        closeInlineEditor();
        currentEditingRow = clickedRow;
        clickedRow.classList.add('editing-row');

        const transaction = clickedRow.dataset;
        const toLocalISOString = (date) => {
            if (!date) return '';
            const dt = new Date(date);
            dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
            return dt.toISOString().slice(0, 16);
        };

        const formHtml = `
            <div class="edit-inline-form-container">
                <form class="inline-edit-form">
                    <input type="hidden" name="unique_id" value="${transaction.uniqueid}">
                    <div class="form-grid">
                        <div class="form-group"><label>Biển số xe</label><input type="text" name="plate" value="${transaction.plate}" required></div>
                        <div class="form-group"><label>Phí (VNĐ)</label><input type="number" name="fee" value="${transaction.fee}"></div>
                        <div class="form-group"><label>Giờ vào</label><input type="datetime-local" name="entry_time" value="${toLocalISOString(transaction.entryTime)}"></div>
                        <div class="form-group"><label>Giờ ra</label><input type="datetime-local" name="exit_time" value="${toLocalISOString(transaction.exitTime)}"></div>
                        <div class="form-group"><label>Phương thức TT</label>
                            <select name="payment_method">
                                <option value="" ${transaction.paymentMethod === '' ? 'selected' : ''}>Chưa chọn</option>
                                <option value="Tiền mặt" ${transaction.paymentMethod === 'Tiền mặt' ? 'selected' : ''}>Tiền mặt</option>
                                <option value="Chuyển khoản QR" ${transaction.paymentMethod === 'Chuyển khoản QR' ? 'selected' : ''}>Chuyển khoản QR</option>
                                <option value="Miễn phí" ${transaction.paymentMethod === 'Miễn phí' ? 'selected' : ''}>Miễn phí</option>
                                <option value="VIP" ${transaction.paymentMethod === 'VIP' ? 'selected' : ''}>VIP</option>
                            </select>
                        </div>
                        <div class="form-group"><label>Trạng thái</label>
                            <select name="status">
                                <option value="Đang gửi" ${transaction.status === 'Đang gửi' ? 'selected' : ''}>Đang gửi</option>
                                <option value="Đã rời bãi" ${transaction.status === 'Đã rời bãi' ? 'selected' : ''}>Đã rời bãi</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-footer" style="padding: 1.5rem 0 0 0; background: transparent; border: none;">
                        <button type="button" class="action-button btn-secondary cancel-inline-edit">Hủy</button>
                        <button type="submit" class="action-button btn-primary save-inline-edit">Lưu thay đổi</button>
                    </div>
                </form>
            </div>
        `;

        const newRow = document.createElement('tr');
        newRow.className = 'edit-inline-row';
        newRow.innerHTML = `<td colspan="8">${formHtml}</td>`;
        clickedRow.insertAdjacentElement('afterend', newRow);
        
        setTimeout(() => {
            const formContainer = newRow.querySelector('.edit-inline-form-container');
            if (formContainer) formContainer.style.maxHeight = formContainer.scrollHeight + "px";
        }, 10);
    };

    const renderLocationsTable = () => {
        if (!elements.locationsTableBody) return;
        elements.locationsTableBody.innerHTML = '';
        if (LOCATIONS_DATA.length === 0) {
            elements.locationsTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px;">Chưa có bãi đỗ nào.</td></tr>`;
            return;
        }
        LOCATIONS_DATA.forEach(loc => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${loc.id}</strong></td>
                <td>${loc.name}</td>
                <td>${loc.address || '--'}</td>
                <td>
                    <button class="edit-btn edit-location-btn" data-id="${loc.id}">Sửa</button>
                    <button class="edit-btn delete-location-btn" data-id="${loc.id}" style="color: var(--danger-color); margin-left: 5px;">Xóa</button>
                </td>
            `;
            elements.locationsTableBody.appendChild(row);
        });
    };

    const openLocationModal = (locationData = null) => {
        elements.locationForm.reset();
        if (locationData) {
            elements.locationModalTitle.textContent = 'Chỉnh sửa Bãi đỗ xe';
            elements.locationIdInput.value = locationData.id;
            elements.locationIdInput.disabled = true;
            elements.locationNameInput.value = locationData.name;
            elements.locationLatInput.value = locationData.lat;
            elements.locationLngInput.value = locationData.lng;
            elements.locationAddressInput.value = locationData.address || '';
            elements.locationCapacityInput.value = locationData.capacity || '';
            elements.locationHotlineInput.value = locationData.hotline || '';
            elements.locationOperatingHoursInput.value = locationData.operating_hours || '';
            elements.locationEventNameInput.value = locationData.event_name || ''; // NÂNG CẤP
            elements.locationFeePolicyTypeSelect.value = locationData.fee_policy_type || 'hourly'; // NÂNG CẤP
            elements.locationFeeCollectionPolicySelect.value = locationData.fee_collection_policy || 'post_paid'; // NÂNG CẤP
            // NÂNG CẤP: Điền giá trị phí tùy chỉnh
            elements.feeHourlyDayInput.value = locationData.fee_hourly_day || '';
            elements.feeHourlyNightInput.value = locationData.fee_hourly_night || '';
            elements.feePerEntryInput.value = locationData.fee_per_entry || '';
            elements.feeDailyInput.value = locationData.fee_daily || '';
            toggleCustomFeeInputs(); // Hiển thị các ô phí phù hợp
            elements.deleteLocationBtn.style.display = 'block';
            elements.deleteLocationBtn.dataset.id = locationData.id;
        } else {
            elements.locationModalTitle.textContent = 'Thêm Bãi đỗ xe mới';
            elements.locationIdInput.disabled = false;
            elements.deleteLocationBtn.style.display = 'none';
        }
        toggleCustomFeeInputs();
        // SỬA LỖI: Sử dụng class 'active' để hiển thị modal đúng cách
        elements.locationModal.classList.add('active');
    };

    const closeLocationModal = () => {
        // SỬA LỖI: Sử dụng class 'active' để ẩn modal
        elements.locationModal.classList.remove('active');
    };

    // NÂNG CẤP: Mở/Đóng modal nhân viên
    const openStaffModal = (staffData = null) => {
        elements.staffForm.reset();
        // Điền danh sách bãi đỗ vào dropdown
        elements.staffLocationAssignmentSelect.innerHTML = LOCATIONS_DATA.map(loc => `<option value="${loc.id}">${loc.name}</option>`).join('');

        if (staffData) {
            elements.staffModalTitle.textContent = 'Chỉnh sửa Nhân viên';
            document.getElementById('staff-id').value = staffData.id;
            document.getElementById('staff-username').value = staffData.username;
            document.getElementById('staff-username').disabled = true; // Không cho sửa username
            document.getElementById('staff-pin').placeholder = "Để trống nếu không muốn đổi";
            document.getElementById('staff-pin').required = false;
            document.getElementById('staff-fullname').value = staffData.full_name;
            elements.staffLocationAssignmentSelect.value = staffData.location_id;
            elements.deleteStaffBtn.style.display = 'block';
            elements.deleteStaffBtn.dataset.id = staffData.id;
        } else {
            elements.staffModalTitle.textContent = 'Thêm Nhân viên mới';
            document.getElementById('staff-id').value = '';
            document.getElementById('staff-username').disabled = false;
            document.getElementById('staff-pin').placeholder = "4-6 chữ số";
            document.getElementById('staff-pin').required = true;
            elements.deleteStaffBtn.style.display = 'none';
        }
        elements.staffModal.classList.add('active');
    };

    const closeStaffModal = () => {
        elements.staffModal.classList.remove('active');
    };


    let adminCameraStream = null;
    let adminScanAnimation = null;

    const openAdminQrScanner = async () => {
        if (!('mediaDevices' in navigator)) return showToast('Trình duyệt không hỗ trợ camera.', 'error');
        elements.adminQrScannerModal.classList.add('active');
        if (elements.transactionSearchWrapper) elements.transactionSearchWrapper.classList.add('scanning');
        try {
            adminCameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            elements.adminCameraFeed.srcObject = adminCameraStream;
            await elements.adminCameraFeed.play();
            adminScanAnimation = requestAnimationFrame(tickAdminQrScanner);
        } catch (err) {
            showToast('Không thể truy cập camera. Vui lòng cấp quyền.', 'error');
            closeAdminQrScanner();
        }
    };

    const closeAdminQrScanner = () => {
        if (adminScanAnimation) cancelAnimationFrame(adminScanAnimation);
        if (adminCameraStream) adminCameraStream.getTracks().forEach(track => track.stop());
        if (elements.adminScanFeedback) elements.adminScanFeedback.classList.remove('active');
        if (elements.transactionSearchWrapper) elements.transactionSearchWrapper.classList.remove('scanning');
        elements.adminQrScannerModal.classList.remove('active');
    };

    const tickAdminQrScanner = () => {
        if (elements.adminCameraFeed && elements.adminCameraFeed.readyState === elements.adminCameraFeed.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement('canvas');
            canvas.width = elements.adminCameraFeed.videoWidth;
            canvas.height = elements.adminCameraFeed.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(elements.adminCameraFeed, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });

            if (code && code.data) {
                if (adminScanAnimation) cancelAnimationFrame(adminScanAnimation);
                if (elements.adminScanFeedback) elements.adminScanFeedback.classList.add('active');
                setTimeout(() => {
                    elements.transactionSearchInput.value = code.data;
                    debouncedFetchTransactions(1, code.data);
                    closeAdminQrScanner();
                }, 1200);
                return;
            }
        }
        adminScanAnimation = requestAnimationFrame(tickAdminQrScanner);
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
            let feedbackHtml = '';
            if (alertInfo.feedback) {
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
            alertItem.dataset.plate = plate;
            alertItem.dataset.reason = alertInfo.reason || '';
            alertItem.dataset.level = alertInfo.level;

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

    const updateDashboardUI = (data) => {
        if (!data) return;
        fullAdminData = { ...fullAdminData, ...data };

        if (elements.totalRevenue) elements.totalRevenue.innerHTML = `${formatCurrency(fullAdminData.totalRevenueForDate ?? 0)} <sup>đ</sup>`;
        if (elements.totalVehicles) elements.totalVehicles.textContent = fullAdminData.totalVehiclesForDate ?? 0;
        if (elements.currentVehicles) elements.currentVehicles.textContent = fullAdminData.vehiclesCurrentlyParking ?? 0;

        const locationData = {
            names: [],
            revenue: [],
            vehicles: []
        };
        if (fullAdminData.revenueByLocation && fullAdminData.vehiclesByLocation) {
            Object.keys(fullAdminData.revenueByLocation).forEach(id => {
                locationData.names.push(getLocationName(id));
                locationData.revenue.push(fullAdminData.revenueByLocation[id] || 0);
                locationData.vehicles.push(fullAdminData.vehiclesByLocation[id] || 0);
            });
        }

        const trafficData = fullAdminData.trafficByHour || Array(24).fill(0);
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
                        tooltip: { callbacks: { label: (c) => `${c.label || ''}: ${formatCurrency(c.parsed)} đ` } }
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

        if (!map && typeof L !== 'undefined' && LOCATIONS_DATA && elements.mapContainer) initMap(fullAdminData);
        else updateMapPopups(fullAdminData);
    };

    const setTodayDate = () => {
        if (elements.adminDatePicker) elements.adminDatePicker.value = new Date().toISOString().slice(0, 10);
    };

    // =================================================================
    // KHU VỰC 5: CÁC HÀM TRUY VẤN DỮ LIỆU (API CALLS)
    // =================================================================

    const fetchLocations = async () => {
        try {
            const { data, error } = await db.from('locations').select('*').order('created_at');
            if (error) throw error;
            LOCATIONS_DATA = data || [];
            renderLocationsTable();
        } catch (error) {
            showToast(`Lỗi tải danh sách bãi đỗ: ${error.message}`, 'error');
        }
    };

    // NÂNG CẤP: Hàm tải danh sách nhân viên
    const fetchStaff = async () => {
        try {
            const { data, error } = await db.from('staff_accounts').select('*').order('created_at');
            if (error) throw error;
            STAFF_DATA = data || [];
            renderStaffTable();
        } catch (error) {
            showToast(`Lỗi tải danh sách nhân viên: ${error.message}`, 'error');
        }
    };

    const fetchActiveAlerts = async (isSilent = false) => {
        try {
            const { data, error } = await db.from('security_alerts').select('*');
            if (error) throw error;
            activeSecurityAlerts = data.reduce((acc, alert) => {
                acc[alert.plate] = alert;
                return acc;
            }, {});
            renderActiveAlertsDashboard();
        } catch (error) {
            console.error('Lỗi tải danh sách cảnh báo:', error);
            if (!isSilent) {
                showToast(`Không thể tải danh sách cảnh báo: ${error.message}`, 'error');
            }
        }
    };

    const sendSecurityAlert = async () => {
        const plate = elements.securityAlertPlateInput.value.trim().toUpperCase();
        const reason = elements.securityAlertReasonInput.value.trim();
        const level = document.querySelector('input[name="alert-level"]:checked')?.value || 'warning';
        if (!plate) {
            showToast('Vui lòng nhập biển số xe cần cảnh báo.', 'error');
            return;
        }

        const button = elements.sendSecurityAlertBtn;
        button.disabled = true;
        button.textContent = 'Đang gửi...'; // NÂNG CẤP: Dùng textContent cho nhất quán

        const { data: { user } } = await db.auth.getUser();
        if (!user) {
            showToast('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.', 'error');
            button.disabled = false;
            button.textContent = 'Gửi Cảnh Báo';
            return;
        }
        try {
            const { error } = await db.from('security_alerts').upsert(
                { plate, reason, level, user_id: user.id },
                { onConflict: 'plate' }
            );

            if (error) throw error;

            showToast(`Đã cập nhật cảnh báo cho biển số ${plate}.`, 'success');
            elements.securityAlertPlateInput.value = '';
            elements.securityAlertReasonInput.value = '';
        } catch (error) {
            showToast(`Lỗi gửi cảnh báo: ${error.message}`, 'error');
        } finally {
            button.disabled = false;
            button.textContent = 'Gửi Cảnh Báo';
        }
    };

    const removeSecurityAlert = async (plateToRemove) => {
        const plate = plateToRemove || elements.securityAlertPlateInput.value.trim().toUpperCase();
        if (!plate) {
            showToast('Vui lòng nhập biển số xe cần gỡ cảnh báo.', 'error');
            return;
        }

        try {
            const { error } = await db.from('security_alerts').delete().eq('plate', plate);
            if (error) throw error;
            showToast(`Đã gửi yêu cầu gỡ cảnh báo cho biển số ${plate}.`, 'info');
        } catch (error) {
            showToast(`Lỗi gỡ cảnh báo: ${error.message}`, 'error');
        }
    };

    const fetchTransactions = async (page = 1, searchTerm = '') => {
        transactionCurrentPage = page;
        transactionSearchTerm = searchTerm.trim();
        const startIndex = (page - 1) * transactionRowsPerPage;
        const endIndex = startIndex + transactionRowsPerPage - 1;

        try {
            let query = db.from('transactions').select('*', { count: 'exact' });

            if (transactionSearchTerm) {
                if (transactionSearchTerm.startsWith('_')) {
                    query = query.eq('unique_id', transactionSearchTerm);
                } else {
                    const cleanedTerm = transactionSearchTerm.toUpperCase();
                    query = query.or(`plate.ilike.%${cleanedTerm}%,phone.ilike.%${cleanedTerm}%`);
                }
            }

            query = query.order('entry_time', { ascending: false }).range(startIndex, endIndex);
            const { data, error, count } = await query;
            if (error) throw error;
            renderTransactionTable(data, count);
        } catch (error) {
            showToast(`Lỗi tải giao dịch: ${error.message}`, 'error');
            renderTransactionTable([], 0);
        }
    };

    const fetchAllAdminData = async (date = null, isSilent = false) => {
        if (!isSilent) showToast('Đang tải dữ liệu mới...', 'info');

        try {
            const targetDateStr = date || new Date().toISOString().slice(0, 10);
            const startOfDay = new Date(targetDateStr + 'T00:00:00Z').toISOString();
            const endOfDay = new Date(targetDateStr + 'T23:59:59Z').toISOString();

            const { data: transactions, error: transactionsError } = await db
                .from('transactions')
                .select('*')
                .gte('entry_time', startOfDay)
                .lte('entry_time', endOfDay)
                .order('entry_time', { ascending: false });
            if (transactionsError) throw transactionsError;

            const { count: vehiclesCurrentlyParking, error: countError } = await db
                .from('transactions')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'Đang gửi');
            if (countError) throw countError;

            let totalRevenueForDate = 0;
            const trafficByHour = Array(24).fill(0);
            const revenueByLocation = {};
            const vehiclesByLocation = {};

            transactions.forEach(tx => {
                const fee = tx.fee || 0;
                totalRevenueForDate += fee;
                trafficByHour[new Date(tx.entry_time).getHours()]++;
                if (tx.location_id) {
                    revenueByLocation[tx.location_id] = (revenueByLocation[tx.location_id] || 0) + fee;
                    vehiclesByLocation[tx.location_id] = (vehiclesByLocation[tx.location_id] || 0) + 1;
                }
            });

            fullAdminData = {
                totalRevenueForDate,
                totalVehiclesForDate: transactions.length,
                vehiclesCurrentlyParking,
                trafficByHour,
                revenueByLocation,
                vehiclesByLocation,
                transactions
            };

            updateDashboardUI(fullAdminData);
            return true;

        } catch (error) {
            if (!isSilent) showToast(`Lỗi tải dữ liệu: ${error.message}`, 'error');
            console.error('ADMIN FETCH ERROR:', error);
            return false;
        }
    };

    const saveTransactionChanges = async (event) => {
        event.preventDefault();
        const form = event.target;
        const saveBtn = form.querySelector('.save-inline-edit');
        if (!saveBtn) return;

        saveBtn.disabled = true;
        saveBtn.textContent = 'Đang lưu...';

        const formData = new FormData(form);
        const dataToUpdate = Object.fromEntries(formData.entries());
        const uniqueId = dataToUpdate.unique_id;
        delete dataToUpdate.unique_id;

        if (dataToUpdate.entry_time) dataToUpdate.entry_time = new Date(dataToUpdate.entry_time).toISOString();
        if (dataToUpdate.exit_time) dataToUpdate.exit_time = new Date(dataToUpdate.exit_time).toISOString();

        try {
            const { error } = await db.from('transactions').update(dataToUpdate).eq('unique_id', uniqueId);
            if (error) throw error;

            showToast('Cập nhật thành công!', 'success');
            closeInlineEditor();
            await fetchTransactions(transactionCurrentPage, transactionSearchTerm);
        } catch (error) {
            showToast(`Lỗi khi lưu: ${error.message}`, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Lưu thay đổi';
        }
    };

    const saveLocation = async () => {
        const id = elements.locationIdInput.value.trim().toUpperCase();
        const locationData = {
            id: id,
            name: elements.locationNameInput.value.trim(),
            lat: parseFloat(elements.locationLatInput.value),
            lng: parseFloat(elements.locationLngInput.value),
            address: elements.locationAddressInput.value.trim() || null,
            capacity: parseInt(elements.locationCapacityInput.value) || null,
            hotline: elements.locationHotlineInput.value.trim() || null,
            operating_hours: elements.locationOperatingHoursInput.value.trim() || null,
            fee_policy_type: elements.locationFeePolicyTypeSelect.value, // NÂNG CẤP
            event_name: elements.locationEventNameInput.value.trim() || null, // NÂNG CẤP
            fee_collection_policy: elements.locationFeeCollectionPolicySelect.value, // NÂNG CẤP
            // NÂNG CẤP: Lấy giá trị từ các ô phí tùy chỉnh
            fee_hourly_day: parseInt(elements.feeHourlyDayInput.value) || null,
            fee_hourly_night: parseInt(elements.feeHourlyNightInput.value) || null,
            fee_per_entry: parseInt(elements.feePerEntryInput.value) || null,
            fee_daily: parseInt(elements.feeDailyInput.value) || null,
        };

        if (!locationData.id || !locationData.name || isNaN(locationData.lat) || isNaN(locationData.lng)) {
            showToast('Mã, Tên, Vĩ độ và Kinh độ là bắt buộc.', 'error');
            return;
        }

        const { error } = await db.from('locations').upsert(locationData);

        if (error) showToast(`Lỗi lưu bãi đỗ: ${error.message}`, 'error');
        else {
            showToast('Lưu thông tin bãi đỗ thành công!', 'success');
            closeLocationModal();
        }
    };

    const deleteLocation = async (id) => {
        if (!confirm(`Bạn có chắc chắn muốn xóa bãi đỗ "${id}"? Hành động này không thể hoàn tác.`)) return;
        const { error } = await db.from('locations').delete().eq('id', id);
        if (error) showToast(`Lỗi xóa bãi đỗ: ${error.message}`, 'error');
        else {
            showToast('Đã xóa bãi đỗ thành công.', 'success');
            closeLocationModal(); // Đóng modal sau khi xóa
        }
    };

    // NÂNG CẤP: Hàm lưu thông tin nhân viên
    const saveStaff = async () => {
        const id = document.getElementById('staff-id').value;
        const username = document.getElementById('staff-username').value.trim();
        const pin = document.getElementById('staff-pin').value.trim();
        const fullName = document.getElementById('staff-fullname').value.trim();
        const locationId = elements.staffLocationAssignmentSelect.value;

        if (!username || !fullName || !locationId) {
            return showToast('Tên đăng nhập, Họ tên và Bãi đỗ là bắt buộc.', 'error');
        }
        if (!id && !pin) { // Bắt buộc nhập PIN khi tạo mới
            return showToast('Mã PIN là bắt buộc khi tạo nhân viên mới.', 'error');
        }
        if (pin && !/^\d{4,6}$/.test(pin)) {
            return showToast('Mã PIN phải là 4 đến 6 chữ số.', 'error');
        }

        const staffData = { username, full_name: fullName, location_id: locationId };
        if (pin) staffData.pin = pin; // Chỉ cập nhật PIN nếu được nhập
        if (id) staffData.id = id;

        const { error } = await db.from('staff_accounts').upsert(staffData);
        if (error) showToast(`Lỗi lưu nhân viên: ${error.message}`, 'error');
        else {
            showToast('Lưu thông tin nhân viên thành công!', 'success');
            closeStaffModal();
        }
    };

    const deleteStaff = async (id) => {
        if (!confirm(`Bạn có chắc chắn muốn xóa nhân viên này?`)) return;
        const { error } = await db.from('staff_accounts').delete().eq('id', id);
        if (error) showToast(`Lỗi xóa nhân viên: ${error.message}`, 'error');
        else showToast('Đã xóa nhân viên thành công.', 'success');
    };

    // =================================================================
    // KHU VỰC 6: KHỞI TẠO VÀ GẮN SỰ KIỆN
    // =================================================================

    const handleLogin = async (event) => {
        event.preventDefault();
        const email = elements.loginEmailInput.value;
        const password = elements.loginPasswordInput.value;
        const loginButton = elements.loginForm.querySelector('button');
        loginButton.disabled = true;
        loginButton.textContent = 'Đang đăng nhập...';

        const { data, error } = await db.auth.signInWithPassword({ email, password });

        if (error) {
            elements.loginErrorMessage.textContent = 'Email hoặc mật khẩu không đúng.';
            elements.loginErrorMessage.style.display = 'block';
            loginButton.disabled = false;
            loginButton.textContent = 'Đăng nhập';
        } else if (data.user) {
            elements.loginScreen.style.display = 'none';
            elements.mainAdminContent.style.display = 'flex';
            await startAdminSession();
        }
    };

    const handleLogout = async () => {
        await db.auth.signOut();
        window.location.reload();
    };

    const startAdminSession = async () => {
        showToast('Đăng nhập thành công! Đang tải dữ liệu...', 'success');

        await fetchLocations();
        const dateToFetch = elements.adminDatePicker.value;
        await fetchAllAdminData(dateToFetch);
        await fetchTransactions(1, '');
        await fetchActiveAlerts(false);
        await fetchStaff(); // NÂNG CẤP: Tải danh sách nhân viên

        console.log("Thiết lập lắng nghe Realtime cho trang Admin...");
        const adminChannel = db.channel('app-db-changes');
        adminChannel
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' },
                (payload) => {
                    console.log('Admin Realtime event on "transactions":', payload);
                    fetchAllAdminData(elements.adminDatePicker.value, true);
                }
            )
            .on('postgres_changes', { event: '*', schema: 'public', table: 'security_alerts' },
                (payload) => {
                    console.log('Admin Realtime event on "security_alerts":', payload);
                    fetchActiveAlerts(true);
                }
            )
            .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' },
                (payload) => {
                    console.log('Admin Realtime event on "locations":', payload);
                    fetchLocations();
                }
            )
            .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_accounts' },
                (payload) => {
                    console.log('Admin Realtime event on "staff_accounts":', payload);
                    fetchStaff();
                }
            ).subscribe((status) => {
                if (status === 'SUBSCRIBED') console.log('✅ Admin đã kết nối Realtime thành công!');
            });
    };

    const setupTransactionPagination = (totalItems, currentPage) => {
        if (!elements.paginationControls) return;
        elements.paginationControls.innerHTML = '';
        const pageCount = Math.ceil(totalItems / transactionRowsPerPage);
        if (pageCount <= 1) return;

        const prevButton = document.createElement('button');
        prevButton.textContent = '« Trước';
        prevButton.className = 'action-button btn-secondary';
        prevButton.disabled = currentPage === 1;
        prevButton.addEventListener('click', () => fetchTransactions(currentPage - 1, transactionSearchTerm));
        elements.paginationControls.appendChild(prevButton);

        const pageInfo = document.createElement('span');
        pageInfo.textContent = `Trang ${currentPage} / ${pageCount}`;
        pageInfo.style.fontWeight = 'bold';
        pageInfo.style.margin = '0 10px';
        pageInfo.title = `Tổng số ${totalItems} giao dịch`;
        elements.paginationControls.appendChild(pageInfo);

        const nextButton = document.createElement('button');
        nextButton.textContent = 'Sau »';
        nextButton.className = 'action-button btn-secondary';
        nextButton.disabled = currentPage === pageCount;
        nextButton.addEventListener('click', () => fetchTransactions(currentPage + 1, transactionSearchTerm));
        elements.paginationControls.appendChild(nextButton);

        elements.paginationControls.querySelectorAll('button').forEach(btn => {
            btn.style.width = 'auto';
            btn.style.padding = '5px 12px';
            btn.style.fontSize = '0.9rem';
        });
    };

    // NÂNG CẤP: Hàm hiển thị/ẩn các ô nhập phí tùy chỉnh
    const toggleCustomFeeInputs = () => {
        const customFeeInputsWrapper = document.getElementById('custom-fee-inputs-wrapper');
        const selectedPolicy = elements.locationFeePolicyTypeSelect.value;
        const allFeeGroups = customFeeInputsWrapper.querySelectorAll('.fee-input-group');
        
        allFeeGroups.forEach(group => {
            // Hiển thị group nếu data-policy của nó trùng với policy được chọn
            group.style.display = group.dataset.policy === selectedPolicy ? 'grid' : 'none';
        });
    };

    // NÂNG CẤP: Các hàm cho trang Cài đặt
    const fetchSettings = async () => {
        try {
            const { data, error } = await db.from('app_settings').select('*');
            if (error) throw error;

            const settings = data.reduce((acc, setting) => {
                acc[setting.setting_key] = setting.setting_value;
                return acc;
            }, {});

            // Điền dữ liệu vào form
            if (elements.paymentQrUrlInput) {
                elements.paymentQrUrlInput.value = settings.payment_qr_base_url || '';
            }

        } catch (error) {
            showToast(`Lỗi tải cài đặt: ${error.message}`, 'error');
        }
    };

    const saveSettings = async () => {
        const qrUrl = elements.paymentQrUrlInput.value.trim();
        if (!qrUrl) {
            showToast('URL mã QR không được để trống.', 'error');
            return;
        }

        const { error } = await db.from('app_settings').upsert({ setting_key: 'payment_qr_base_url', setting_value: qrUrl });
        if (error) showToast(`Lỗi lưu cài đặt: ${error.message}`, 'error');
        else showToast('Đã lưu cài đặt thanh toán thành công!', 'success');
    };

    // SỬA LỖI: Hàm xử lý cho menu di động
    const toggleMobileMenu = () => {
        elements.sidebar.classList.toggle('open');
        elements.sidebarOverlay.classList.toggle('active');
    };

    const closeMobileMenu = () => {
        elements.sidebar.classList.remove('open');
        elements.sidebarOverlay.classList.remove('active');
    };

    const handleSidebarLinkClick = () => {
        if (window.innerWidth <= 992) closeMobileMenu();
    };

    const debouncedFetchTransactions = debounce((page, term) => {
        fetchTransactions(page, term);
    }, 500);

    const init = () => {
        try {
            setTodayDate();
            setupNavigation();

            db.auth.getSession().then(({ data: { session } }) => {
                if (session) {
                    elements.loginScreen.style.display = 'none';
                    elements.mainAdminContent.style.display = 'flex';
                    startAdminSession();
                } else {
                    // Nếu không có session, vẫn có thể cần fetch một số cài đặt công khai nếu có
                    if(typeof fetchSettings === 'function') fetchSettings();
                }
            });

            if (elements.resetFilterBtn) elements.resetFilterBtn.addEventListener('click', resetFilter);
            if (elements.adminDatePicker) elements.adminDatePicker.addEventListener('change', () => {
                fetchAllAdminData(elements.adminDatePicker.value);
            });
            if (elements.transactionSearchInput) elements.transactionSearchInput.addEventListener('input', (e) => {
                debouncedFetchTransactions(1, e.target.value);
            });
            if (elements.transactionScanQrBtn) elements.transactionScanQrBtn.addEventListener('click', openAdminQrScanner);
            if (elements.closeAdminScannerBtn) elements.closeAdminScannerBtn.addEventListener('click', closeAdminQrScanner);
            
            if (elements.transactionLogBody) {
                elements.transactionLogBody.addEventListener('dblclick', (e) => {
                    const clickedRow = e.target.closest('tr');
                    if (!clickedRow || !clickedRow.dataset.uniqueid) return;

                    if (currentEditingRow === clickedRow) {
                        closeInlineEditor();
                    } else {
                        openInlineEditor(clickedRow);
                    }
                });
                elements.transactionLogBody.addEventListener('click', (e) => {
                    if (e.target.classList.contains('cancel-inline-edit')) closeInlineEditor();
                });
                elements.transactionLogBody.addEventListener('submit', (e) => {
                    if (e.target.classList.contains('inline-edit-form')) saveTransactionChanges(e);
                });
            }

            if (elements.sendSecurityAlertBtn) elements.sendSecurityAlertBtn.addEventListener('click', sendSecurityAlert);
            if (elements.removeAlertBtn) elements.removeAlertBtn.addEventListener('click', () => removeSecurityAlert());
            if (elements.defaultReasonsContainer) {
                elements.defaultReasonsContainer.addEventListener('click', (e) => {
                    if (e.target.classList.contains('default-reason-btn')) elements.securityAlertReasonInput.value = e.target.textContent;
                });
            }
            if (elements.activeAlertsList) {
                elements.activeAlertsList.addEventListener('click', (e) => {
                    const alertItem = e.target.closest('.alert-item');
                    if (alertItem && !e.target.classList.contains('remove-alert-inline-btn')) {
                        elements.securityAlertPlateInput.value = alertItem.dataset.plate;
                        elements.securityAlertReasonInput.value = alertItem.dataset.reason;
                        document.querySelector(`input[name="alert-level"][value="${alertItem.dataset.level}"]`).checked = true;
                        elements.securityAlertPlateInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }

                    if (e.target.classList.contains('remove-alert-inline-btn')) removeSecurityAlert(e.target.dataset.plate);
                });
            }
            if (elements.addLocationBtn) elements.addLocationBtn.addEventListener('click', () => openLocationModal());
            if (elements.closeLocationModalBtn) elements.closeLocationModalBtn.addEventListener('click', closeLocationModal);
            if (elements.cancelLocationBtn) elements.cancelLocationBtn.addEventListener('click', closeLocationModal);
            if (elements.saveLocationBtn) elements.saveLocationBtn.addEventListener('click', saveLocation);
            if (elements.deleteLocationBtn) elements.deleteLocationBtn.addEventListener('click', (e) => deleteLocation(e.target.dataset.id));
            if (elements.locationsTableBody) elements.locationsTableBody.addEventListener('click', (e) => {
                if (e.target.classList.contains('edit-location-btn')) {
                    const location = LOCATIONS_DATA.find(l => l.id === e.target.dataset.id);
                    if (location) openLocationModal(location);
                }
                if (e.target.classList.contains('delete-location-btn')) {
                    deleteLocation(e.target.dataset.id);
                }
            });

            if (elements.locationFeePolicyTypeSelect) elements.locationFeePolicyTypeSelect.addEventListener('change', toggleCustomFeeInputs);

            if (elements.menuToggleBtn) elements.menuToggleBtn.addEventListener('click', toggleMobileMenu);
            if (elements.sidebarOverlay) elements.sidebarOverlay.addEventListener('click', closeMobileMenu);

            if (elements.saveSettingsBtn) elements.saveSettingsBtn.addEventListener('click', saveSettings);

            if (elements.addStaffBtn) elements.addStaffBtn.addEventListener('click', () => openStaffModal());
            if (elements.closeStaffModalBtn) elements.closeStaffModalBtn.addEventListener('click', closeStaffModal);
            if (elements.cancelStaffBtn) elements.cancelStaffBtn.addEventListener('click', closeStaffModal);
            if (elements.saveStaffBtn) elements.saveStaffBtn.addEventListener('click', saveStaff);
            if (elements.deleteStaffBtn) elements.deleteStaffBtn.addEventListener('click', (e) => deleteStaff(e.target.dataset.id));
            if (elements.staffTableBody) {
                elements.staffTableBody.addEventListener('click', (e) => {
                    const target = e.target;
                    const staffId = target.dataset.id;
                    if (target.classList.contains('edit-staff-btn')) {
                        const staff = STAFF_DATA.find(s => s.id.toString() === staffId);
                        if (staff) openStaffModal(staff);
                    } else if (target.classList.contains('delete-staff-btn')) {
                        deleteStaff(staffId);
                    }
                });
            }

            if (elements.loginForm) elements.loginForm.addEventListener('submit', handleLogin);
            if (elements.logoutBtn) elements.logoutBtn.addEventListener('click', handleLogout);
        } catch (error) {
            console.error("Lỗi nghiêm trọng khi khởi tạo:", error);
            document.body.innerHTML = `<h1 style="text-align: center; margin-top: 50px;">LỖI KHỞI TẠO TRANG. VUI LÒNG TẢI LẠI.</h1><p style="text-align: center;">Chi tiết: ${error.message}</p>`;
        }
    };

    init();
});
