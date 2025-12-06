/**
 * =========================================================================
 * HỆ THỐNG QUẢN LÝ XE TÌNH NGUYỆN - ADMIN PANEL JAVASCRIPT
 * Tác giả: Gemini Code Assist
 * Phiên bản: 3.0 (REBUILD)
 * Mục tiêu: Cung cấp giao diện quản trị ổn định, an toàn và đồng bộ
 * với trang điều hành chính.
 * =========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // KHỞI TẠO & KIỂM TRA XÁC THỰC
    // =========================================================================
    const dom = {
        // Login
        loginScreen: document.getElementById('login-screen'),
        loginForm: document.getElementById('login-form'),
        loginEmailInput: document.getElementById('login-email'),
        loginPasswordInput: document.getElementById('login-password'),
        loginError: document.getElementById('login-error-message'),

        // Main Content
        loadingOverlay: document.getElementById('loading-overlay'), // Giữ lại để tương thích
        mainContent: document.getElementById('main-admin-content'),
        logoutBtn: document.getElementById('logout-btn'),

        // Navigation
        navLinks: document.querySelectorAll('.nav-link'),
        pageTitle: document.getElementById('page-title'),
        pageDescription: document.getElementById('page-description'),
        pages: document.querySelectorAll('.page-content'),
        menuToggleBtn: document.getElementById('menu-toggle-btn'),
        sidebar: document.querySelector('.sidebar'),
        sidebarOverlay: document.querySelector('.sidebar-overlay'),

        // Dashboard
        adminDatePicker: document.getElementById('admin-date-picker'),
        totalRevenue: document.getElementById('total-revenue'),
        totalVehicles: document.getElementById('total-vehicles'),
        currentVehicles: document.getElementById('current-vehicles'),
        trafficChartCanvas: document.getElementById('traffic-chart'),
        revenueChartCanvas: document.getElementById('revenue-chart'),
        vehiclesChartCanvas: document.getElementById('vehicles-chart'),
        revenueChartTitle: document.getElementById('revenue-chart-title'),
        vehiclesChartTitle: document.getElementById('vehicles-chart-title'),

        // Transactions
        transactionSearchInput: document.getElementById('transaction-search-input'),
        transactionScanQrBtn: document.getElementById('transaction-scan-qr-btn'),
        adminQrScannerModal: document.getElementById('admin-qr-scanner-modal'),
        closeAdminScannerBtn: document.getElementById('close-admin-scanner-btn'),
        adminCameraFeed: document.getElementById('admin-camera-feed'),
        transactionLogBody: document.getElementById('transaction-log-body'),
        paginationControls: document.getElementById('pagination-controls'),
        transactionModal: document.getElementById('transaction-modal'),
        transactionModalTitle: document.getElementById('transaction-modal-title'),
        closeTransactionModalBtn: document.getElementById('close-transaction-modal-btn'),
        cancelTransactionBtn: document.getElementById('cancel-transaction-btn'),
        saveTransactionBtn: document.getElementById('save-transaction-btn'),
        deleteTransactionBtn: document.getElementById('delete-transaction-btn'),
        transactionForm: document.getElementById('transaction-form'),
        transactionUniqueId: document.getElementById('transaction-unique-id'),
        transactionPlate: document.getElementById('transaction-plate'),
        transactionFee: document.getElementById('transaction-fee'),
        transactionEntryTime: document.getElementById('transaction-entry-time'),
        transactionExitTime: document.getElementById('transaction-exit-time'),
        transactionPaymentMethod: document.getElementById('transaction-payment-method'),
        transactionStatus: document.getElementById('transaction-status'),
        transactionNotes: document.getElementById('transaction-notes'),

        // Locations
        mapContainer: document.getElementById('map-container'),
        locationsTableBody: document.getElementById('locations-table-body'),
        addLocationBtn: document.getElementById('add-location-btn'),
        locationModal: document.getElementById('location-modal'),
        locationModalTitle: document.getElementById('location-modal-title'),
        closeLocationModalBtn: document.getElementById('close-location-modal-btn'),
        cancelLocationBtn: document.getElementById('cancel-location-btn'),
        saveLocationBtn: document.getElementById('save-location-btn'),
        deleteLocationBtn: document.getElementById('delete-location-btn'),
        locationForm: document.getElementById('location-form'),
        locationId: document.getElementById('location-id'),
        locationName: document.getElementById('location-name'),
        locationLat: document.getElementById('location-lat'),
        locationLng: document.getElementById('location-lng'),
        locationAddress: document.getElementById('location-address'),
        locationCapacity: document.getElementById('location-capacity'),
        locationHotline: document.getElementById('location-hotline'),
        locationOperatingHours: document.getElementById('location-operating-hours'),
        locationEventName: document.getElementById('location-event-name'),
        locationFeePolicyType: document.getElementById('location-fee-policy-type'),
        locationFeeCollectionPolicy: document.getElementById('location-fee-collection-policy'),
        customFeeWrapper: document.getElementById('custom-fee-inputs-wrapper'),
        feeInputGroups: document.querySelectorAll('.fee-input-group'),
        locationFeeHourlyDay: document.getElementById('location-fee-hourly-day'),
        locationFeeHourlyNight: document.getElementById('location-fee-hourly-night'),
        locationFeePerEntry: document.getElementById('location-fee-per-entry'),
        locationFeeDaily: document.getElementById('location-fee-daily'),

        // Security
        securityAlertPlate: document.getElementById('security-alert-plate'),
        securityAlertReason: document.getElementById('security-alert-reason'),
        defaultReasonBtns: document.querySelectorAll('.default-reason-btn'),
        alertLevelContainer: document.getElementById('alert-level-container'),
        sendSecurityAlertBtn: document.getElementById('send-security-alert-btn'),
        removeAlertBtn: document.getElementById('remove-alert-btn'),
        activeAlertsList: document.getElementById('active-alerts-list'),

        // Analytics
        analyticsMetricSelect: document.getElementById('analytics-metric-select'),
        analyticsChartCanvas: document.getElementById('analytics-chart-canvas'),
        analyticsResultsContainer: document.getElementById('analytics-results-container'),
        // Fraud Analytics
        suspiciousFreeTransactionsContainer: document.getElementById('suspicious-free-transactions'),
        vipByStaffStatsContainer: document.getElementById('vip-by-staff-stats'),


        // SQL Editor
        sqlQueryInput: document.getElementById('sql-query-input'),
        executeSqlBtn: document.getElementById('execute-sql-btn'),
        sqlResultsContainer: document.getElementById('sql-results-container'),

        // Toast
        toastContainer: document.getElementById('toast-container'),
        fireworksContainer: document.getElementById('fireworks-container'),
    };

    const state = {
        user: null,
        currentDate: new Date(),
        transactions: [],
        locations: [],
        alerts: [],
        currentPage: 1,
        itemsPerPage: 10,
        searchTerm: '',
        charts: {},
        realtimeChannel: null,
        map: null,
        mapMarkers: [],
    };

    // Tái sử dụng Supabase client chung được tạo trong config.js để tránh cảnh báo nhiều GoTrueClient
    const db = window.SUPABASE_DB || supabase.createClient(APP_CONFIG.supabase.url, APP_CONFIG.supabase.anonKey);

    // =========================================================================
    // CÁC HÀM TIỆN ÍCH VÀ API
    // =========================================================================

    const Utils = {
        formatDateTime(d) {
            if (!d) return '';
            const date = new Date(d);
            return date.toISOString().slice(0, 16);
        },
        formatCurrency(n) {
            return new Intl.NumberFormat('vi-VN').format(n || 0);
        },
        /**
         * Hiển thị thông báo toast.
         * @param {string} message Nội dung thông báo.
         * @param {string} type   Tên class kiểu toast, ví dụ: 'toast--success', 'toast--error', 'toast--info'.
         */
        showToast(message, type = 'toast--success') {
            const toast = document.createElement('div');
            // NÂNG CẤP: Truyền trực tiếp class kiểu 'toast--success' thay vì nối chuỗi sai.
            toast.className = `toast ${type}`;
            toast.innerHTML = `<span>${message}</span>`;
            dom.toastContainer.appendChild(toast);
            setTimeout(() => {
                toast.style.animation = 'fadeOutToast 0.5s ease forwards';
                setTimeout(() => toast.remove(), 500);
            }, 3500);
        },
        /**
         * NÂNG CẤP: Gửi tín hiệu thông báo chi tiết cho các client khác.
         * - Luôn bắn một sự kiện tổng quát `data_changed` để index.html bắt được.
         * - Đồng thời bắn thêm sự kiện chi tiết (vd: 'transaction_updated') nếu có.
         * @param {string} event Tên sự kiện chi tiết (vd: 'transaction_updated', 'settings_changed').
         * @param {object} payload Dữ liệu đính kèm (vd: { unique_id: '...' }).
         */
        notifyDataChanged(event = 'data_changed', payload = {}) {
            if (!state.realtimeChannel) return;

            // Sự kiện tổng quát để trang điều hành luôn làm mới dữ liệu
            console.log(`Broadcasting generic event: 'data_changed' with payload:`, payload);
            state.realtimeChannel.send({
                type: 'broadcast',
                event: 'data_changed',
                payload
            });

            // Sự kiện chi tiết (nếu khác với data_changed) để mở rộng về sau
            if (event && event !== 'data_changed') {
                console.log(`Broadcasting detail event: '${event}' with payload:`, payload);
                state.realtimeChannel.send({
                    type: 'broadcast',
                    event,
                    payload
                });
            }
        }
    };

    const Api = {
        async signIn(email, password) {
            const { data, error } = await db.auth.signInWithPassword({ email, password });
            if (error) throw error;
            return data.user;
        },
        async signOut() {
            await db.auth.signOut();
        },
        async getUser() {
            const { data: { session } } = await db.auth.getSession();
            return session?.user || null;
        },
        /**
         * LẤY DỮ LIỆU GIAO DỊCH THEO NGÀY
         * - Đồng bộ logic với trang index (main.js):
         *   + Luôn bao gồm tất cả xe "Đang gửi" (chưa ra bãi).
         *   + Các xe đã rời bãi: lọc theo khoảng thời gian exit_time trong ngày đã chọn.
         * - Khác biệt: Không giới hạn theo location_id => admin xem được toàn hệ thống.
         */
        async fetchDataForDate(date) {
            const dateStr = date.toISOString().slice(0, 10);
            const startOfDayUTC = new Date(`${dateStr}T00:00:00Z`);
            const endOfDayUTC = new Date(startOfDayUTC.getTime() + 24 * 60 * 60 * 1000);

            let query = db.from('transactions').select('*');

            // Sử dụng cùng điều kiện OR như main.js để tránh lệch dữ liệu theo múi giờ/ngày
            query = query.or(
                `status.eq.Đang gửi,` +
                `and(status.eq.Đã rời bãi,exit_time.gte.${startOfDayUTC.toISOString()},exit_time.lt.${endOfDayUTC.toISOString()})`
            );

            const { data, error } = await query.order('entry_time', { ascending: false });

            if (error) throw new Error(`Lỗi tải giao dịch: ${error.message}`);
            return data || [];
        },
        async fetchAllLocations() {
            const { data, error } = await db.from('locations').select('*').order('name');
            if (error) throw new Error(`Lỗi tải danh sách bãi đỗ: ${error.message}`);
            return data || [];
        },
        async fetchAllAlerts() {
            const { data, error } = await db.from('security_alerts').select('*').order('created_at', { ascending: false });
            if (error) throw new Error(`Lỗi tải cảnh báo: ${error.message}`);
            return data || [];
        },
        async updateTransaction(id, updates) {
            const { error } = await db.from('transactions').update(updates).eq('unique_id', id);
            if (error) throw new Error(`Lỗi cập nhật giao dịch: ${error.message}`);
        },
        async deleteTransaction(id) {
            const { error } = await db.from('transactions').delete().eq('unique_id', id);
            if (error) throw new Error(`Lỗi xóa giao dịch: ${error.message}`);
        },
        async saveLocation(locationData) {
            // NÂNG CẤP: Sử dụng id làm PRIMARY KEY cho upsert
            // - Nếu locationData.id tồn tại  → UPDATE bản ghi đó.
            // - Nếu không có id            → INSERT bản ghi mới (id dùng default từ DB).
            const { error } = await db
                .from('locations')
                .upsert(locationData, { onConflict: 'id' });
            if (error) throw new Error(`Lỗi lưu bãi đỗ: ${error.message}`);
        },
        async deleteLocation(id) {
            const { error } = await db.from('locations').delete().eq('id', id);
            if (error) throw new Error(`Lỗi xóa bãi đỗ: ${error.message}`);
        },
        async sendAlert(alertData) {
            const { error } = await db.from('security_alerts').upsert(alertData, { onConflict: 'plate' });
            if (error) throw new Error(`Lỗi gửi cảnh báo: ${error.message}`);
        },
        async removeAlert(plate) {
            const { error } = await db.from('security_alerts').delete().eq('plate', plate);
            if (error) throw new Error(`Lỗi gỡ cảnh báo: ${error.message}`);
        },
        async executeSql(query) {
            const { data, error } = await db.rpc('execute_sql', { query });
            if (error) throw error;
            return data;
        }
    };

    // =========================================================================
    // MODULES GIAO DIỆN (UI)
    // =========================================================================

    const UI = {
        init() {
            this.setupEventListeners();
            this.initRealtime();
        },

        initRealtime() {
            if (state.realtimeChannel) return;

            // Sử dụng cùng một tên kênh với index.html để có thể broadcast & nhận realtime
            state.realtimeChannel = db.channel('he-thong-trong-xe-realtime', {
                config: {
                    broadcast: { self: false } // Không cần nhận lại tin của chính mình
                }
            });

            state.realtimeChannel
                // 1. Nghe thay đổi giao dịch từ Supabase (check-in/check-out ở mọi client)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'transactions' },
                    (payload) => {
                        console.log('Admin Realtime: Thay đổi trên bảng transactions.', payload);
                        App.loadDataForCurrentDate();
                    }
                )
                // 2. Nghe thay đổi cảnh báo an ninh
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'security_alerts' },
                    async (payload) => {
                        console.log('Admin Realtime: Thay đổi trên bảng security_alerts.', payload);
                        try {
                            state.alerts = await Api.fetchAllAlerts();
                            UI.renderAlerts();
                        } catch (error) {
                            console.error('Lỗi reload cảnh báo realtime:', error);
                        }
                    }
                )
                // 3. Nghe thay đổi cấu hình bãi đỗ
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'locations' },
                    async (payload) => {
                        console.log('Admin Realtime: Thay đổi trên bảng locations.', payload);
                        try {
                            state.locations = await Api.fetchAllLocations();
                            UI.renderLocations();
                            UI.initMap();
                            UI.renderMapMarkers();
                            // Cập nhật lại dashboard vì dữ liệu theo bãi có thể thay đổi
                            UI.renderDashboard();
                        } catch (error) {
                            console.error('Lỗi reload bãi đỗ realtime:', error);
                        }
                    }
                )
                // 4. Nhận tín hiệu broadcast tổng quát từ các client khác (vd: index.html)
                .on(
                    'broadcast',
                    { event: 'data_changed' },
                    (payload) => {
                        console.log('Admin Realtime: Nhận tín hiệu "data_changed" từ client khác.', payload);
                        App.loadDataForCurrentDate();
                    }
                )
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('✅ Admin Panel đã kết nối Realtime (postgres_changes + broadcast)!');
                    }
                });
        },

        setupEventListeners() {
            dom.loginForm.addEventListener('submit', Handlers.handleLogin);
            dom.logoutBtn.addEventListener('click', Handlers.handleLogout);
            dom.adminDatePicker.addEventListener('change', Handlers.handleDateChange);

            // Navigation
            dom.navLinks.forEach(link => link.addEventListener('click', Handlers.handleNavClick));
            dom.menuToggleBtn.addEventListener('click', () => {
                dom.sidebar.classList.toggle('open');
                dom.sidebarOverlay.classList.toggle('open');
            });
            dom.sidebarOverlay.addEventListener('click', () => {
                dom.sidebar.classList.remove('open');
                dom.sidebarOverlay.classList.remove('open');
            });

            // Transactions
            dom.transactionSearchInput.addEventListener('input', Handlers.handleTransactionSearch);
            if(dom.transactionScanQrBtn) {
                dom.transactionScanQrBtn.addEventListener('click', Handlers.openAdminQrScanner);
                dom.closeAdminScannerBtn.addEventListener('click', Handlers.closeAdminQrScanner);
            }
            dom.transactionLogBody.addEventListener('click', Handlers.handleTransactionAction);
            dom.closeTransactionModalBtn.addEventListener('click', () => dom.transactionModal.style.display = 'none');
            dom.cancelTransactionBtn.addEventListener('click', () => dom.transactionModal.style.display = 'none');
            dom.saveTransactionBtn.addEventListener('click', Handlers.handleSaveTransaction);
            dom.deleteTransactionBtn.addEventListener('click', Handlers.handleDeleteTransaction);

            // Locations
            dom.addLocationBtn.addEventListener('click', Handlers.handleAddLocation);
            dom.locationsTableBody.addEventListener('click', Handlers.handleLocationAction);
            dom.closeLocationModalBtn.addEventListener('click', () => dom.locationModal.style.display = 'none');
            dom.cancelLocationBtn.addEventListener('click', () => dom.locationModal.style.display = 'none');
            dom.saveLocationBtn.addEventListener('click', Handlers.handleSaveLocation);
            dom.deleteLocationBtn.addEventListener('click', Handlers.handleDeleteLocation);
            dom.locationFeePolicyType.addEventListener('change', this.toggleCustomFeeInputs);

            // Security
            dom.sendSecurityAlertBtn.addEventListener('click', Handlers.handleSendAlert);
            dom.removeAlertBtn.addEventListener('click', Handlers.handleRemoveAlert);
            dom.activeAlertsList.addEventListener('click', Handlers.handleAlertAction);
            dom.defaultReasonBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    dom.securityAlertReason.value = btn.textContent;
                });
            });

            // SQL Editor
            dom.executeSqlBtn.addEventListener('click', Handlers.handleExecuteSql);

            // Analytics
            if(dom.analyticsMetricSelect) dom.analyticsMetricSelect.addEventListener('change', Handlers.handleAnalyticsMetricChange);
        },

        renderDashboard() {
            const revenue = state.transactions.reduce((sum, t) => sum + (t.fee || 0), 0);
            const totalCount = state.transactions.length;
            const parkingCount = state.transactions.filter(t => t.status === 'Đang gửi').length;

            dom.totalRevenue.innerHTML = `${Utils.formatCurrency(revenue)} <sup>đ</sup>`;
            dom.totalVehicles.textContent = totalCount;
            dom.currentVehicles.textContent = parkingCount;

            this.renderTrafficChart();
            this.renderLocationCharts();
        },

        renderTrafficChart() {
            const trafficByHour = Array(24).fill(0);
            state.transactions.forEach(t => {
                const hour = new Date(t.entry_time).getHours();
                trafficByHour[hour]++;
            });

            const chartData = {
                labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
                datasets: [{
                    label: 'Lưu lượng xe vào',
                    data: trafficByHour,
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderColor: 'rgb(54, 162, 235)',
                    borderWidth: 1,
                    tension: 0.4,
                    fill: true,
                }]
            };

            if (state.charts.traffic) state.charts.traffic.destroy();
            state.charts.traffic = new Chart(dom.trafficChartCanvas, { type: 'line', data: chartData });
        },

        renderLocationCharts() {
            const dataByLocation = state.transactions.reduce((acc, t) => {
                // SỬA LỖI: Lấy tên bãi đỗ từ state.locations đã tải sẵn
                const location = state.locations.find(l => l.id === t.location_id);
                const locName = location?.name || 'Không xác định';
                if (!acc[locName]) {
                    acc[locName] = { revenue: 0, count: 0 };
                }
                acc[locName].revenue += t.fee || 0;
                acc[locName].count++;
                return acc;
            }, {});

            const labels = Object.keys(dataByLocation);
            const revenueData = labels.map(l => dataByLocation[l].revenue);
            const vehicleData = labels.map(l => dataByLocation[l].count);

            if (state.charts.revenue) state.charts.revenue.destroy();
            state.charts.revenue = new Chart(dom.revenueChartCanvas, {
                type: 'doughnut',
                data: { labels, datasets: [{ data: revenueData }] },
                options: { plugins: { legend: { position: 'right' } } }
            });

            if (state.charts.vehicles) state.charts.vehicles.destroy();
            state.charts.vehicles = new Chart(dom.vehiclesChartCanvas, {
                type: 'doughnut',
                data: { labels, datasets: [{ data: vehicleData }] },
                options: { plugins: { legend: { position: 'right' } } }
            });
        },

        renderTransactions() {
            const filtered = state.transactions.filter(t =>
                t.plate.includes(state.searchTerm.toUpperCase()) ||
                t.unique_id.includes(state.searchTerm) ||
                (t.phone && t.phone.includes(state.searchTerm))
            );

            const startIndex = (state.currentPage - 1) * state.itemsPerPage;
            const paginated = filtered.slice(startIndex, startIndex + state.itemsPerPage);

            dom.transactionLogBody.innerHTML = paginated.map(t => `
                <tr data-id="${t.unique_id}">
                    <td><span class="plate">${t.plate}</span></td>
                    <td>${new Date(t.entry_time).toLocaleString('vi-VN')}</td>
                    <td>${t.exit_time ? new Date(t.exit_time).toLocaleString('vi-VN') : 'N/A'}</td>
                    <td><span class="fee">${Utils.formatCurrency(t.fee)}</span></td>
                    <td>${t.payment_method || 'N/A'}</td>
                    <td>${state.locations.find(l => l.id === t.location_id)?.name || 'Không xác định'}</td>
                    <td style="text-align: center;"><span class="status-badge ${t.status === 'Đang gửi' ? 'parking' : 'departed'}">${t.status}</span></td>
                    <td style="text-align: center;">
                        <button class="action-button btn-secondary btn-small" data-action="edit-transaction">Sửa</button>
                    </td>
                </tr>
            `).join('');

            this.renderPagination(Math.ceil(filtered.length / state.itemsPerPage));
        },

        renderPagination(totalPages) {
            if (totalPages <= 1) {
                dom.paginationControls.innerHTML = '';
                return;
            }
            let html = `<div class="pagination-summary">Trang ${state.currentPage} / ${totalPages}</div>`;
            for (let i = 1; i <= totalPages; i++) {
                html += `<button class="pagination-btn ${i === state.currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
            }
            dom.paginationControls.innerHTML = html;
            dom.paginationControls.querySelectorAll('.pagination-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    state.currentPage = parseInt(e.target.dataset.page);
                    this.renderTransactions();
                });
            });
        },

        renderLocations() {
            dom.locationsTableBody.innerHTML = state.locations.map(loc => `
                <tr data-id="${loc.id}">
                    <td>${loc.id}</td>
                    <td>${loc.name}</td>
                    <td>${loc.address || 'Chưa có'}</td>
                    <td>
                        <button class="action-button btn-secondary btn-small" data-action="edit-location">Sửa</button>
                    </td>
                </tr>
            `).join('');
        },

        renderAlerts() {
            if (state.alerts.length === 0) {
                dom.activeAlertsList.innerHTML = '<p class="empty-state">Không có cảnh báo nào đang hoạt động.</p>';
                return;
            }
            dom.activeAlertsList.innerHTML = state.alerts.map(alert => `
                <div class="alert-item alert-${alert.level}" data-plate="${alert.plate}">
                    <div class="alert-info">
                        <strong>${alert.plate}</strong>
                        <p>${alert.reason}</p>
                        <small>Tạo lúc: ${new Date(alert.created_at).toLocaleString('vi-VN')}</small>
                    </div>
                    <button class="action-button btn-danger btn-small" data-action="remove-alert">Gỡ</button>
                </div>
            `).join('');
        },

        initMap() {
            if (state.map || !dom.mapContainer) return;
            const center = state.locations.length > 0 ? [state.locations[0].lat, state.locations[0].lng] : [21.0285, 105.8542];
            state.map = L.map(dom.mapContainer).setView(center, 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            }).addTo(state.map);
        },

        renderMapMarkers() {
            if (!state.map) return;
            state.mapMarkers.forEach(marker => marker.remove());
            state.mapMarkers = [];
            state.locations.forEach(loc => {
                if (loc.lat && loc.lng) {
                    const marker = L.marker([loc.lat, loc.lng]).addTo(state.map);
                    marker.bindPopup(`<b>${loc.name}</b><br>${loc.address || 'Chưa có địa chỉ'}`);
                    state.mapMarkers.push(marker);
                }
            });
        },

        renderAnalytics() {
            if (!dom.analyticsChartCanvas) return;
            const metric = dom.analyticsMetricSelect.value;
            console.log(`Đang render phân tích cho: ${metric}`);

            // Dữ liệu giả để minh họa
            const labels = ['Nhân viên A', 'Nhân viên B', 'Nhân viên C', 'Nhân viên D'];
            const data = metric === 'free_ratio' ? [15, 5, 25, 8] : [5, 12, 3, 7];
            const chartLabel = metric === 'free_ratio' ? '% Giao dịch miễn phí' : 'Số giao dịch < 5 phút';

            if (state.charts.analytics) state.charts.analytics.destroy();
            state.charts.analytics = new Chart(dom.analyticsChartCanvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: chartLabel,
                        data: data,
                        backgroundColor: 'rgba(220, 38, 38, 0.6)',
                        borderColor: 'rgb(220, 38, 38)',
                        borderWidth: 1
                    }]
                },
                options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false }
            });

            dom.analyticsResultsContainer.innerHTML = labels.map((label, index) => `<div class="analytics-item"><div class="name">${label}</div><div class="value">${data[index]}</div><div class="details">${metric === 'free_ratio' ? 'Tỷ lệ miễn phí/VIP' : 'Lượt gửi xe ngắn'}</div></div>`).join('');
        },

        toggleCustomFeeInputs() {
            const selectedPolicy = dom.locationFeePolicyType.value;
            dom.feeInputGroups.forEach(group => {
                group.style.display = group.dataset.policy === selectedPolicy ? 'block' : 'none';
            });
        },

        renderSqlResults(results) {
            if (!results || results.length === 0) {
                dom.sqlResultsContainer.innerHTML = '<p class="empty-state">Câu lệnh đã được thực thi nhưng không trả về kết quả nào.</p>';
                return;
            }

            const headers = Object.keys(results[0]);
            const headerHtml = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
            const bodyHtml = `<tbody>${results.map(row =>
                `<tr>${headers.map(h => `<td>${row[h] === null ? 'NULL' : row[h]}</td>`).join('')}</tr>`
            ).join('')}</tbody>`;

            dom.sqlResultsContainer.innerHTML = `<div class="table-wrapper"><table>${headerHtml}${bodyHtml}</table></div>`;
        }
    };

    // =========================================================================
    // MODULES XỬ LÝ SỰ KIỆN (HANDLERS)
    // =========================================================================

    const Handlers = {
        async handleLogin(e) {
            e.preventDefault();
            const email = dom.loginEmailInput.value;
            const password = dom.loginPasswordInput.value;
            dom.loginError.textContent = '';
            try {
                const user = await Api.signIn(email, password);
                state.user = user;
                App.start();
            } catch (error) {
                dom.loginError.textContent = 'Email hoặc mật khẩu không đúng.';
                console.error('Login failed:', error);
            }
        },

        async handleLogout() {
            await Api.signOut();
            state.user = null;
            dom.mainContent.style.display = 'none';
            dom.loginScreen.style.display = 'flex';
        },

        handleNavClick(e) {
            e.preventDefault();
            const targetId = e.currentTarget.dataset.target;

            dom.pages.forEach(page => page.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');

            dom.navLinks.forEach(link => link.classList.remove('active'));
            e.currentTarget.classList.add('active');

            dom.pageTitle.textContent = e.currentTarget.querySelector('span').textContent;
            dom.pageDescription.textContent = e.currentTarget.title || '';

            if (targetId === 'page-fraud-analytics') Handlers.handleRenderFraudAnalytics();
            if (dom.sidebar.classList.contains('open')) {
                dom.sidebar.classList.remove('open');
                dom.sidebarOverlay.classList.remove('open');
            }
        },

        async handleDateChange() {
            state.currentDate = new Date(dom.adminDatePicker.value);
            await App.loadDataForCurrentDate();
        },

        handleTransactionSearch(e) {
            state.searchTerm = e.target.value;
            state.currentPage = 1;
            UI.renderTransactions();
        },

        openAdminQrScanner() {
            dom.adminQrScannerModal.style.display = 'flex';
            navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                .then(stream => {
                    state.cameraStream = stream;
                    dom.adminCameraFeed.srcObject = stream;
                    dom.adminCameraFeed.play();
                    requestAnimationFrame(Handlers.tickAdminScanner);
                })
                .catch(err => {
                    Utils.showToast('Không thể truy cập camera.', 'toast--error');
                    Handlers.closeAdminQrScanner();
                });
        },

        closeAdminQrScanner() {
            if (state.cameraStream) {
                state.cameraStream.getTracks().forEach(track => track.stop());
                state.cameraStream = null;
            }
            dom.adminQrScannerModal.style.display = 'none';
            const feedback = dom.adminQrScannerModal.querySelector('.scanner-feedback');
            if (feedback) feedback.classList.remove('active');
        },

        handleTransactionAction(e) {
            const button = e.target.closest('[data-action="edit-transaction"]');
            if (!button) return;

            const row = button.closest('tr');
            const uniqueId = row.dataset.id;
            const transaction = state.transactions.find(t => t.unique_id === uniqueId);

            if (transaction) {
                dom.transactionUniqueId.value = transaction.unique_id;
                dom.transactionPlate.value = transaction.plate;
                dom.transactionFee.value = transaction.fee;
                dom.transactionEntryTime.value = Utils.formatDateTime(transaction.entry_time);
                dom.transactionExitTime.value = Utils.formatDateTime(transaction.exit_time);
                dom.transactionPaymentMethod.value = transaction.payment_method || '';
                dom.transactionStatus.value = transaction.status;
                dom.transactionNotes.value = transaction.notes || '';
                dom.transactionModal.style.display = 'flex';
            }
        },

        async handleSaveTransaction() {
            const id = dom.transactionUniqueId.value;
            const updates = {
                plate: dom.transactionPlate.value,
                fee: dom.transactionFee.value ? parseFloat(dom.transactionFee.value) : null,
                entry_time: dom.transactionEntryTime.value ? new Date(dom.transactionEntryTime.value).toISOString() : null,
                exit_time: dom.transactionExitTime.value ? new Date(dom.transactionExitTime.value).toISOString() : null,
                payment_method: dom.transactionPaymentMethod.value,
                status: dom.transactionStatus.value,
                notes: dom.transactionNotes.value,
            };

            try {
                await Api.updateTransaction(id, updates);
                Utils.showToast('Cập nhật giao dịch thành công!');
                dom.transactionModal.style.display = 'none';
                await App.loadDataForCurrentDate();
                Utils.notifyDataChanged('transaction_updated', { unique_id: id }); // THÔNG BÁO CHI TIẾT
            } catch (error) {
                Utils.showToast(`Lỗi: ${error.message}`, 'toast--error');
            }
        },

        async handleDeleteTransaction() {
            const id = dom.transactionUniqueId.value;
            if (confirm(`Bạn có chắc chắn muốn XÓA vĩnh viễn giao dịch này không? Hành động này không thể hoàn tác.`)) {
                try {
                    await Api.deleteTransaction(id);
                    Utils.showToast('Xóa giao dịch thành công!');
                    dom.transactionModal.style.display = 'none';
                    await App.loadDataForCurrentDate();
                    Utils.notifyDataChanged('transaction_deleted', { unique_id: id }); // THÔNG BÁO CHI TIẾT
                } catch (error) {
                    Utils.showToast(`Lỗi: ${error.message}`, 'toast--error');
                }
            }
        },

        handleAddLocation() {
            dom.locationForm.reset();
            dom.locationId.value = '';
            dom.locationModalTitle.textContent = 'Thêm Bãi đỗ xe mới';
            dom.deleteLocationBtn.style.display = 'none';
            dom.locationModal.style.display = 'flex';
            UI.toggleCustomFeeInputs();
        },

        handleLocationAction(e) {
            const button = e.target.closest('[data-action="edit-location"]');
            if (!button) return;

            const row = button.closest('tr');
            const id = row.dataset.id;
            const location = state.locations.find(l => l.id == id);

            if (location) {
                dom.locationId.value = location.id;
                dom.locationName.value = location.name;
                dom.locationLat.value = location.lat;
                dom.locationLng.value = location.lng;
                dom.locationAddress.value = location.address || '';
                dom.locationCapacity.value = location.capacity || '';
                dom.locationHotline.value = location.hotline || '';
                dom.locationOperatingHours.value = location.operating_hours || '';
                dom.locationEventName.value = location.event_name || '';
                dom.locationFeePolicyType.value = location.fee_policy_type || 'free';
                dom.locationFeeCollectionPolicy.value = location.fee_collection_policy || 'post_paid';
                dom.locationFeeHourlyDay.value = location.fee_hourly_day || '';
                dom.locationFeeHourlyNight.value = location.fee_hourly_night || '';
                dom.locationFeePerEntry.value = location.fee_per_entry || '';
                dom.locationFeeDaily.value = location.fee_daily || '';

                dom.locationModalTitle.textContent = 'Chỉnh sửa Bãi đỗ xe';
                dom.deleteLocationBtn.style.display = 'block';
                dom.locationModal.style.display = 'flex';
                UI.toggleCustomFeeInputs();
            }
        },

        async handleSaveLocation() {
            const locationData = {
                id: dom.locationId.value || undefined,
                name: dom.locationName.value,
                lat: parseFloat(dom.locationLat.value),
                lng: parseFloat(dom.locationLng.value),
                address: dom.locationAddress.value,
                capacity: parseInt(dom.locationCapacity.value) || null,
                hotline: dom.locationHotline.value,
                operating_hours: dom.locationOperatingHours.value,
                event_name: dom.locationEventName.value,
                fee_policy_type: dom.locationFeePolicyType.value,
                fee_collection_policy: dom.locationFeeCollectionPolicy.value,
                fee_hourly_day: parseInt(dom.locationFeeHourlyDay.value) || null,
                fee_hourly_night: parseInt(dom.locationFeeHourlyNight.value) || null,
                fee_per_entry: parseInt(dom.locationFeePerEntry.value) || null,
                fee_daily: parseInt(dom.locationFeeDaily.value) || null,
            };

            try {
                await Api.saveLocation(locationData);
                Utils.showToast('Lưu thông tin bãi đỗ thành công!');
                dom.locationModal.style.display = 'none';
                await App.loadInitialData();
                Utils.notifyDataChanged('settings_changed', { type: 'locations' }); // THÔNG BÁO THAY ĐỔI CÀI ĐẶT
            } catch (error) {
                Utils.showToast(`Lỗi: ${error.message}`, 'toast--error');
            }
        },

        async handleDeleteLocation() {
            const id = dom.locationId.value;
            if (confirm(`Bạn có chắc chắn muốn XÓA bãi đỗ này? Tất cả giao dịch liên quan có thể bị ảnh hưởng.`)) {
                try {
                    await Api.deleteLocation(id);
                    Utils.showToast('Xóa bãi đỗ thành công!');
                    dom.locationModal.style.display = 'none';
                    await App.loadInitialData();
                    Utils.notifyDataChanged('settings_changed', { type: 'locations' }); // THÔNG BÁO THAY ĐỔI CÀI ĐẶT
                } catch (error) {
                    Utils.showToast(`Lỗi: ${error.message}`, 'toast--error');
                }
            }
        },

        async handleSendAlert() {
            const plate = dom.securityAlertPlate.value.toUpperCase().trim();
            const reason = dom.securityAlertReason.value.trim();
            const level = document.querySelector('input[name="alert-level"]:checked').value;

            if (!plate || !reason) {
                return Utils.showToast('Vui lòng nhập biển số và lý do.', 'toast--error');
            }

            try {
                await Api.sendAlert({ plate, reason, level });
                Utils.showToast(`Đã gửi cảnh báo cho xe ${plate}.`);
                dom.securityAlertPlate.value = '';
                dom.securityAlertReason.value = '';
                await App.loadInitialData();
                Utils.notifyDataChanged('settings_changed', { type: 'alerts' }); // THÔNG BÁO THAY ĐỔI CÀI ĐẶT
            } catch (error) {
                Utils.showToast(`Lỗi: ${error.message}`, 'toast--error');
            }
        },

        async handleRemoveAlert() {
            const plate = dom.securityAlertPlate.value.toUpperCase().trim();
            if (!plate) {
                return Utils.showToast('Vui lòng nhập biển số để gỡ cảnh báo.', 'toast--error');
            }
            try {
                await Api.removeAlert(plate);
                Utils.showToast(`Đã gỡ cảnh báo cho xe ${plate}.`);
                dom.securityAlertPlate.value = '';
                dom.securityAlertReason.value = '';
                await App.loadInitialData();
                Utils.notifyDataChanged('settings_changed', { type: 'alerts' }); // THÔNG BÁO THAY ĐỔI CÀI ĐẶT
            } catch (error) {
                Utils.showToast(`Lỗi: ${error.message}`, 'toast--error');
            }
        },

        handleAlertAction(e) {
            const plate = e.target.closest('.alert-item')?.dataset.plate;
            if (!plate) return;

            if (e.target.matches('[data-action="remove-alert"]')) {
                dom.securityAlertPlate.value = plate;
                Handlers.handleRemoveAlert();
            } else {
                const alert = state.alerts.find(a => a.plate === plate);
                if (alert) {
                    dom.securityAlertPlate.value = alert.plate;
                    dom.securityAlertReason.value = alert.reason;
                    document.querySelector(`input[name="alert-level"][value="${alert.level}"]`).checked = true;
                }
            }
        },

        handleAnalyticsMetricChange() {
            UI.renderAnalytics();
            UI.renderFraudAnalytics();
        },

        async handleExecuteSql() {
            const query = dom.sqlQueryInput.value.trim();
            if (!query) return;

            const isSelect = query.toLowerCase().startsWith('select');
            if (!isSelect && !confirm('CẢNH BÁO: Đây không phải là lệnh SELECT. Bạn có chắc chắn muốn thực thi không?')) {
                return;
            }

            dom.executeSqlBtn.disabled = true;
            dom.executeSqlBtn.textContent = 'Đang thực thi...';
            dom.sqlResultsContainer.innerHTML = '';

            try {
                const results = await Api.executeSql(query);
                UI.renderSqlResults(results);
                Utils.showToast('Thực thi lệnh SQL thành công!');
                // Thông báo cho các client khác nếu có khả năng dữ liệu đã thay đổi
                if (!isSelect) Utils.notifyDataChanged('database_manual_change');
            } catch (error) {
                Utils.showToast(`Lỗi SQL: ${error.message}`, 'toast--error');
                dom.sqlResultsContainer.innerHTML = `<div class="sql-error">${error.message}</div>`;
            } finally {
                dom.executeSqlBtn.disabled = false;
                dom.executeSqlBtn.textContent = 'Thực thi Lệnh';
            }
        },

        handleRenderFraudAnalytics() {
            // 1. Phân tích giao dịch miễn phí đáng ngờ
            const SUSPICIOUS_DURATION_MINUTES = 60; // Giao dịch miễn phí trên 60 phút là đáng ngờ
            const suspiciousFreeTxs = state.transactions.filter(tx =>
                tx.status === 'Đã rời bãi' &&
                tx.fee === 0 &&
                !tx.is_vip &&
                tx.payment_method !== 'Đã thanh toán trước' &&
                new Date(tx.exit_time) - new Date(tx.entry_time) > SUSPICIOUS_DURATION_MINUTES * 60 * 1000
            );

            if (suspiciousFreeTxs.length > 0) {
                const tableHtml = `
                    <table>
                        <thead>
                            <tr>
                                <th>Biển số</th>
                                <th>Thời gian gửi</th>
                                <th>Nhân viên xử lý</th>
                                <th>Lý do</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${suspiciousFreeTxs.map(tx => `
                                <tr>
                                    <td><span class="plate">${tx.plate}</span></td>
                                    <td>${Math.round((new Date(tx.exit_time) - new Date(tx.entry_time)) / 60000)} phút</td>
                                    <td>${tx.staff_username || 'N/A'}</td>
                                    <td>${tx.payment_method || 'Miễn phí'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
                dom.suspiciousFreeTransactionsContainer.innerHTML = tableHtml;
            } else {
                dom.suspiciousFreeTransactionsContainer.innerHTML = '<p class="empty-state">Không có giao dịch miễn phí nào đáng ngờ.</p>';
            }

            // 2. Phân tích số lượt xe VIP theo nhân viên
            const vipByStaff = state.transactions
                .filter(tx => tx.is_vip)
                .reduce((acc, tx) => {
                    const staff = tx.staff_username || 'Chưa rõ';
                    acc[staff] = (acc[staff] || 0) + 1;
                    return acc;
                }, {});

            const sortedStaff = Object.entries(vipByStaff).sort((a, b) => b[1] - a[1]);

            if (sortedStaff.length > 0) {
                const statsHtml = sortedStaff.map(([staff, count]) => `
                    <div class="analytics-item">
                        <div class="name">${staff}</div>
                        <div class="value">${count}</div>
                        <div class="details">lượt xe VIP</div>
                    </div>
                `).join('');
                dom.vipByStaffStatsContainer.innerHTML = statsHtml;
            } else {
                dom.vipByStaffStatsContainer.innerHTML = '<p class="empty-state">Chưa có giao dịch VIP nào được ghi nhận.</p>';
            }
        }
    };

    // =========================================================================
    // MODULE KHỞI ĐỘNG ỨNG DỤNG (APP)
    // =========================================================================

    const App = {
        async init() {
            UI.init();
            state.user = await Api.getUser();
            if (state.user) {
                this.start();
            } else {
                dom.loginScreen.style.display = 'flex';
                if(dom.loadingOverlay) dom.loadingOverlay.classList.add('hidden');
            }
        },

        async start() {
            dom.loginScreen.style.display = 'none';
            dom.mainContent.style.display = 'grid';
            if(dom.loadingOverlay) dom.loadingOverlay.classList.remove('hidden');

            dom.adminDatePicker.value = state.currentDate.toISOString().slice(0, 10);

            await this.loadInitialData();

            if(dom.loadingOverlay) dom.loadingOverlay.classList.add('hidden');
        },

        async loadInitialData() {
            try {
                const [locations, alerts] = await Promise.all([
                    Api.fetchAllLocations(),
                    Api.fetchAllAlerts()
                ]);
                state.locations = locations;
                state.alerts = alerts;

                UI.renderLocations();
                UI.initMap();
                UI.renderMapMarkers();
                UI.renderAlerts();
                UI.renderAnalytics();

                await this.loadDataForCurrentDate();
            } catch (error) {
                Utils.showToast(`Lỗi tải dữ liệu ban đầu: ${error.message}`, 'toast--error');
            }
        },

        async loadDataForCurrentDate() {
            try {
                state.transactions = await Api.fetchDataForDate(state.currentDate);
                state.currentPage = 1;
                UI.renderDashboard();
                UI.renderTransactions();
            } catch (error) {
                Utils.showToast(`Lỗi tải dữ liệu ngày: ${error.message}`, 'toast--error');
            }
        }
    };

    App.init();
});