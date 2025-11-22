/**
 * =========================================================================
 * HỆ THỐNG QUẢN LÝ XE TÌNH NGUYỆN - PHIÊN BẢN 8.0 (STABLE REWRITE)
 * Tác giả: Gemini Code Assist
 * Kiến trúc: State-Driven UI, Module-based, Sequential Data Flow.
 * Mục tiêu: Ổn định tuyệt đối, nhất quán dữ liệu, dễ bảo trì, tối ưu trải nghiệm.
 * =========================================================================
 */
document.addEventListener('DOMContentLoaded', () => {

    // =========================================================================
    // MODULE 1: STATE & CONFIG - TRÁI TIM CỦA ỨNG DỤNG
    // =========================================================================
    let db; // Sẽ được khởi tạo trong App.init sau khi config sẵn sàng

    const dom = {
        // Main Layout
        locationSubtitle: document.getElementById('location-subtitle'),
        changeLocationBtn: document.getElementById('change-location-btn'),
        datePicker: document.getElementById('date-picker'),
        themeCheckbox: document.getElementById('theme-checkbox'),

        // Login Elements
        staffLoginScreen: document.getElementById('staff-login-screen'),
        staffLoginForm: document.getElementById('staff-login-form'),
        staffUsernameInput: document.getElementById('staff-username'),
        staffPinInput: document.getElementById('staff-pin'),
        staffLoginError: document.getElementById('staff-login-error-message'),
        staffInfoDisplay: document.getElementById('staff-info-display'),
        biometricLoginBtn: document.getElementById('biometric-login-btn'),
        userProfileWidget: document.getElementById('user-profile-widget'),

        clockWidget: document.getElementById('clock-widget'),
        weatherWidget: document.getElementById('weather-widget'),

        // Main Form
        searchTermInput: document.getElementById('search-term'),
        phoneNumberInput: document.getElementById('phone-number'),
        vehicleNotesInput: document.getElementById('vehicle-notes'),
        plateSuggestions: document.getElementById('plate-suggestions'),
        isVipCheckbox: document.getElementById('is-vip-checkbox'),
        actionButtonsContainer: document.getElementById('action-buttons-container'),
        additionalInfoGroup: document.querySelector('.additional-info-group'),
        vehicleFormContent: document.getElementById('vehicle-form-content'),
        micBtn: document.getElementById('mic-btn'),
        scanQrBtn: document.getElementById('scan-qr-btn'),

        // Dashboard
        dashboardGrid: document.getElementById('dashboard-grid'),

        // Vehicle List
        listTitle: document.getElementById('list-title'),
        filterInput: document.getElementById('filter-input'),
        vehicleListContainer: document.getElementById('vehicle-list-container'),
        paginationControls: document.getElementById('pagination-controls'),

        // Modals & Toasts
        modalContainer: document.getElementById('modal-container'),
        toastContainer: document.getElementById('toast-container'),
        globalAlertStrip: document.getElementById('global-alert-strip'),

        // UI Elements
        appGrid: document.querySelector('.main-grid'),
        offlineIndicator: document.getElementById('offline-indicator'),

        // Idle Screen
        idleScreen: document.getElementById('idle-screen'),
        adVideoPlayer: document.getElementById('ad-video-player'),
    };

    const state = {
        locations: [],
        currentLocation: null,
        currentDate: new Date(),
        vehicles: [],
        alerts: {},
        selectedPlate: null,
        selectedVehicle: null,
        isLoading: true,
        isProcessing: false,
        filterTerm: '',
        activeModal: null,
        currentPage: 1,
        itemsPerPage: 15,
        cameraStream: null,
        scanAnimation: null,
        statusPieChart: null,
        idleTimer: null,
        adVideoIndex: 0,
        isIdle: false,
        isOnline: navigator.onLine,
        syncQueue: [],
    };

    // =========================================================================
    // MODULE 2: API SERVICES - GIAO TIẾP VỚI SUPABASE
    // =========================================================================
    const Api = {
        async fetchVehiclesForDate(date) {
            const dateStr = date.toISOString().slice(0, 10);

            if (!state.isOnline) {
                console.log("Offline mode: Reading vehicles from local state.");
                return state.vehicles;
            }

            const startOfDayUTC = new Date(`${dateStr}T00:00:00Z`);
            const endOfDayUTC = new Date(startOfDayUTC.getTime() + 24 * 60 * 60 * 1000);

            let query = db.from('transactions').select('*');
            if (state.currentLocation?.id) {
                query = query.eq('location_id', state.currentLocation.id);
            }
            query = query.or(`status.eq.Đang gửi,and(status.eq.Đã rời bãi,exit_time.gte.${startOfDayUTC.toISOString()},exit_time.lt.${endOfDayUTC.toISOString()})`);
            const { data, error } = await query.order('entry_time', { ascending: false });
            if (error) throw new Error(`Lỗi tải dữ liệu xe: ${error.message}`);
            return data || [];
        },

        async fetchLocations() {
            if (!state.isOnline && state.locations.length > 0) {
                console.log("Offline mode: Reading locations from local state.");
                return state.locations;
            }
            const { data, error } = await db.from('locations').select('*');
            if (error) throw new Error(`Lỗi tải danh sách bãi đỗ: ${error.message}`);
            state.locations = data || [];
            return state.locations;
        },

        async fetchHistory(plate) {
            const { data, error } = await db.from('transactions').select('*').eq('plate', plate).order('entry_time', { ascending: false }).limit(5);
            if (error) throw new Error(`Lỗi tải lịch sử: ${error.message}`);
            return data || [];
        },

        async fetchAlerts() {
            if (!state.isOnline) {
                console.log("Offline mode: Reading alerts from local state.");
                return state.alerts;
            }
            const { data, error } = await db.from('security_alerts').select('*');
            if (error) throw new Error(`Lỗi tải cảnh báo: ${error.message}`);
            return data.reduce((acc, alert) => { acc[alert.plate] = alert; return acc; }, {});
        },

        async findVehicleGlobally(plate) {
            const { data, error } = await db.from('transactions')
                .select('*')
                .eq('plate', plate)
                .eq('status', 'Đang gửi')
                .limit(1)
                .single();
            if (error && error.code !== 'PGRST116') {
                throw new Error(`Lỗi tìm kiếm toàn cục: ${error.message}`);
            }
            return data;
        },

        async getStaffInfoByUsername(username) {
            const { data, error } = await db.from('staff_accounts')
                .select('*, locations(*)')
                .eq('username', username)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }
            return data;
        },

        async verifyStaff(username, pin) {
            const { data, error } = await db.from('staff_accounts')
                .select('*, locations(*)')
                .eq('username', username)
                .eq('pin', pin)
                .single();

            if (error || !data) {
                throw new Error('Tên đăng nhập hoặc Mã PIN không đúng.');
            }
            return data;
        },

        async checkIn(plate, phone, isVIP, notes, prePayment = null, providedUniqueID = null, staffUsername = 'system') {
            if (!state.isOnline) {
                return this.addToSyncQueue('checkIn', { plate, phone, isVIP, notes, prePayment, providedUniqueID, staffUsername });
            }

            const uniqueID = providedUniqueID || ('_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36));
            const entryTime = new Date();
            const transactionData = {
                plate, phone, is_vip: isVIP, notes,
                unique_id: uniqueID,
                location_id: state.currentLocation.id,
                entry_time: entryTime.toISOString(),
                status: 'Đang gửi',
                fee: prePayment ? prePayment.fee : null,
                payment_method: prePayment ? prePayment.method : null,
                staff_username: staffUsername,
            };
            const { error } = await db.from('transactions').insert([transactionData]);
            if (error) throw new Error(`Lỗi check-in: ${error.message}. Xe [${plate}] có thể đã tồn tại trong bãi.`);
            return transactionData;
        },

        async checkOut(uniqueID, fee, paymentMethod, staffUsername = 'system') {
            if (!state.isOnline) {
                return this.addToSyncQueue('checkOut', { uniqueID, fee, paymentMethod, staffUsername });
            }

            const { error } = await db.from('transactions').update({
                exit_time: new Date().toISOString(),
                status: 'Đã rời bãi',
                fee, payment_method: paymentMethod,
                staff_username: staffUsername,
            }).eq('unique_id', uniqueID);
            if (error) throw new Error(`Lỗi check-out: ${error.message}. Giao dịch có thể đã được xử lý.`);
            return true;
        },

        addToSyncQueue(action, payload) {
            console.log(`Offline: Adding ${action} to sync queue.`);
            const timestamp = new Date().toISOString();
            state.syncQueue.push({ action, payload, timestamp });
            App.saveStateToLocalStorage();

            if (action === 'checkIn') {
                const { plate, phone, isVIP, notes, prePayment, providedUniqueID, staffUsername } = payload;
                const uniqueID = providedUniqueID || ('_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36));
                const newVehicle = {
                    plate, phone, is_vip: isVIP, notes,
                    unique_id: uniqueID,
                    location_id: state.currentLocation.id,
                    entry_time: timestamp,
                    status: 'Đang gửi',
                    fee: prePayment ? prePayment.fee : null,
                    payment_method: prePayment ? prePayment.method : null,
                    staff_username: staffUsername,
                    is_offline: true
                };
                state.vehicles.unshift(newVehicle);
                return newVehicle;
            }
            if (action === 'checkOut') {
                const { uniqueID, fee, paymentMethod, staffUsername } = payload;
                const vehicleIndex = state.vehicles.findIndex(v => v.unique_id === uniqueID);
                if (vehicleIndex > -1) {
                    state.vehicles[vehicleIndex].status = 'Đã rời bãi';
                    state.vehicles[vehicleIndex].exit_time = timestamp;
                    state.vehicles[vehicleIndex].fee = fee;
                    state.vehicles[vehicleIndex].payment_method = paymentMethod;
                    state.vehicles[vehicleIndex].is_offline = true;
                    state.vehicles[vehicleIndex].staff_username = staffUsername;
                }
                return { unique_id: uniqueID, is_offline: true };
            }
        },

        async processSyncQueue() {
            if (!state.isOnline || state.syncQueue.length === 0) return;

            UI.showToast(`Đang đồng bộ ${state.syncQueue.length} thay đổi...`, 'info');
            const queueToProcess = [...state.syncQueue];
            state.syncQueue = [];

            for (const item of queueToProcess) {
                try {
                    console.log(`Syncing item:`, item);
                    if (item.action === 'checkIn') {
                        await Api.checkIn(item.payload.plate, item.payload.phone, item.payload.isVIP, item.payload.notes, item.payload.prePayment, item.payload.providedUniqueID, item.payload.staffUsername);
                    } else if (item.action === 'checkOut') {
                        await Api.checkOut(item.payload.uniqueID, item.payload.fee, item.payload.paymentMethod, item.payload.staffUsername);
                    }
                    console.log(`Synced: ${item.action} for ${item.payload.plate || item.payload.uniqueID}`);
                } catch (error) {
                    console.error(`Sync failed for item:`, item, error);
                    state.syncQueue.unshift(item);
                }
            }

            App.saveStateToLocalStorage();
            if (state.syncQueue.length === 0) {
                UI.showToast('Đồng bộ dữ liệu hoàn tất!', 'success');
                await App.fetchData(true);
            } else {
                UI.showToast(`Đồng bộ thất bại, còn ${state.syncQueue.length} thay đổi đang chờ.`, 'error');
            }
        }
    };

    // =========================================================================
    // MODULE 3: UI RENDERING - "VẼ" LẠI GIAO DIỆN TỪ STATE
    // =========================================================================
    const UI = {
        showToast(message, type = 'success') {
            const toast = document.createElement('div');
            toast.className = `toast toast--${type}`;
            toast.innerHTML = `<span>${message}</span>`;
            dom.toastContainer.appendChild(toast);
            setTimeout(() => {
                toast.style.animation = 'fadeOutToast 0.5s ease forwards';
                setTimeout(() => toast.remove(), 500);
            }, 3500);
        },

        renderApp() {
            this.renderOnlineStatus();
            this.renderHeader();
            this.renderActionButtons();
            this.updateMainFormUI();
            this.renderDashboard();
            this.renderVehicleList();
        },

        renderUserProfile() {
            const staffInfo = localStorage.getItem('staffInfo');
            if (staffInfo && dom.userProfileWidget) {
                const parsedInfo = JSON.parse(staffInfo);
                dom.userProfileWidget.innerHTML = `
                    <svg class="user-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    <span class="user-name">${parsedInfo.fullName}</span>
                    <a href="settings.html" class="logout-btn" title="Cài đặt tài khoản">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2l.15-.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    </a>
                    <button class="logout-btn" data-action="logout" title="Đăng xuất">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                    </button>
                `;
            }
        },

        animateValue(element, start, end, duration) {
            if (!element) return;
            let startTimestamp = null;
            const step = (timestamp) => {
                if (!startTimestamp) startTimestamp = timestamp;
                const progress = Math.min((timestamp - startTimestamp) / duration, 1);
                const currentValue = Math.floor(progress * (end - start) + start);
                element.textContent = currentValue.toLocaleString('vi-VN');
                if (progress < 1) {
                    window.requestAnimationFrame(step);
                }
            };
            window.requestAnimationFrame(step);
        },

        renderOnlineStatus() {
            if (dom.offlineIndicator) {
                dom.offlineIndicator.classList.toggle('active', !state.isOnline);
                dom.offlineIndicator.textContent = state.isOnline
                    ? 'Đã kết nối'
                    : `Ngoại tuyến (${state.syncQueue.length} thay đổi đang chờ)`;
            }
        },

        renderHeader() {
            let headerText = state.currentLocation?.name || 'Chưa xác định';

            if (state.currentLocation?.event_name) {
                headerText += ` - <strong style="color: var(--primary-accent);">${state.currentLocation.event_name}</strong>`;
            }

            if (state.currentLocation) {
                const policyMap = {
                    'free': { text: 'Miễn phí', class: 'free' },
                    'hourly': { text: 'Theo giờ', class: 'paid' },
                    'per_entry': { text: 'Theo lượt', class: 'paid' },
                    'daily': { text: 'Theo ngày', class: 'paid' },
                };
                const policy = policyMap[state.currentLocation.fee_policy_type] || policyMap.free;
                headerText += ` <span class="fee-status-badge ${policy.class}">${policy.text}</span>`;
            }

            dom.locationSubtitle.innerHTML = `${headerText} `;

            dom.datePicker.value = state.currentDate.toISOString().slice(0, 10);
            dom.listTitle.textContent = `Danh sách xe ngày ${state.currentDate.toLocaleDateString('vi-VN')}`;
            dom.changeLocationBtn.hidden = !state.currentLocation;
        },

        renderSuggestions(term) {
            if (!term || term.length < 2) {
                dom.plateSuggestions.classList.remove('visible');
                return;
            }

            const suggestions = state.vehicles
                .filter(v => v.plate.toUpperCase().startsWith(term.toUpperCase()))
                .map(v => v.plate)
                .filter((value, index, self) => self.indexOf(value) === index)
                .slice(0, 5);

            dom.plateSuggestions.innerHTML = suggestions.map(s => `<div class="suggestion-item" data-plate="${s}">${s}</div>`).join('');
            dom.plateSuggestions.classList.toggle('visible', suggestions.length > 0);
        },

        renderActionButtons() {
            let buttonsHtml = '';
            let alertHtml = '';

            if (state.selectedVehicle) {
                const alert = state.alerts[state.selectedPlate];
                let isDisabled = false;

                if (alert && (state.selectedVehicle.status === 'parking' || state.selectedVehicle.status === 'new')) {
                    alertHtml = Templates.actionAlertBox(alert.level, state.selectedPlate, alert.reason);
                    if (alert.level === 'block') {
                        isDisabled = true;
                    }
                }

                switch (state.selectedVehicle.status) {
                    case 'new':
                        buttonsHtml = Templates.actionButton('check-in', 'Xác nhận Gửi xe');
                        break;
                    case 'parking':
                        buttonsHtml = Templates.actionButton('check-out', isDisabled ? 'XE ĐANG BỊ CHẶN' : 'Xác nhận Lấy xe', isDisabled);
                        buttonsHtml += Templates.secondaryActionButton('view-ticket', 'Xem lại vé điện tử');
                        break;
                    case 'departed':
                        buttonsHtml = `<div class="action-alert-box alert-info"><div class="action-alert-reason">Xe này đã rời bãi.</div></div>`;
                        break;
                    case 'parking_remote':
                        buttonsHtml = '';
                        break;
                }
            } else {
                buttonsHtml = Templates.actionButton('check-in', 'Xác nhận Gửi xe');
            }
            dom.actionButtonsContainer.innerHTML = alertHtml + buttonsHtml;
        },

        updateMainFormUI() {
            const vehicleStatus = state.selectedVehicle?.status;
            const formNew = dom.vehicleFormContent.querySelector('#form-new-vehicle');
            const infoDisplay = dom.vehicleFormContent.querySelector('#info-display-section');
            const additionalDetails = dom.vehicleFormContent.querySelector('#additional-details-section');

            if (!formNew || !infoDisplay || !additionalDetails) return;

            formNew.hidden = false;

            if (vehicleStatus === 'parking' || vehicleStatus === 'departed') {
                infoDisplay.hidden = false;
                additionalDetails.hidden = false;
                const vehicle = state.selectedVehicle.data;
                infoDisplay.innerHTML = Templates.vehicleInfoDisplay(vehicle);

                const historyList = additionalDetails.querySelector('#info-history-list');
                if (historyList) {
                    historyList.innerHTML = '<li>Đang tải lịch sử...</li>';
                    Api.fetchHistory(state.selectedPlate).then(history => {
                        historyList.innerHTML = history && history.length > 0
                            ? history.map(Templates.historyItem).join('')
                            : '<li>Chưa có lịch sử gửi xe.</li>';
                    }).catch(err => {
                        historyList.innerHTML = `<li>Lỗi tải lịch sử.</li>`;
                        console.error(err);
                    });
                }
            } else {
                infoDisplay.hidden = true;
                additionalDetails.hidden = true;
                infoDisplay.innerHTML = '';
            }
        },

        renderDashboard() {
            const parkingVehicles = state.vehicles.filter(v => v.status === 'Đang gửi');
            const totalToday = state.vehicles.length;
            const capacity = state.currentLocation?.capacity || 0;
            const occupancyRate = capacity > 0 ? (parkingVehicles.length / capacity) * 100 : 0;

            const longestParking = parkingVehicles.length > 0
                ? parkingVehicles.reduce((a, b) => new Date(a.entry_time) < new Date(b.entry_time) ? a : b)
                : null;

            const statItemsHtml = `
                ${Templates.geminiStatCard('gauge', 'Tỷ lệ lấp đầy', occupancyRate.toFixed(0), '%', 'Bãi xe đã đầy bao nhiêu phần trăm', 'occupancy-chart')}
                ${Templates.geminiStatCard('vehicles', 'Xe hiện tại', parkingVehicles.length, ` / ${capacity > 0 ? capacity : 'N/A'}`, 'Số xe đang có trong bãi')}
                ${Templates.geminiStatCard('total', 'Tổng lượt trong ngày', totalToday, 'lượt', 'Tổng số xe đã ra/vào trong ngày')}
                ${Templates.geminiStatCard('longest', 'Gửi lâu nhất', longestParking ? `<span class="live-duration" data-starttime="${longestParking.entry_time}">${Utils.calculateDuration(longestParking.entry_time)}</span>` : '--', '', 'Xe có thời gian gửi lâu nhất trong bãi')}
            `;

            dom.dashboardGrid.innerHTML = statItemsHtml;

            this.animateValue(document.querySelector('[data-stat-id="vehicles"] .gemini-stat-card__value'), 0, parkingVehicles.length, 1000);
            this.animateValue(document.querySelector('[data-stat-id="total"] .gemini-stat-card__value'), 0, totalToday, 1000);

            const chartCanvas = document.getElementById('occupancy-chart');
            const chartData = {
                datasets: [{
                    data: [occupancyRate, 100 - occupancyRate],
                    backgroundColor: ['#00529B', 'rgba(128, 128, 128, 0.1)'],
                    borderColor: 'transparent',
                    circumference: 180,
                    rotation: 270,
                    cutout: '80%',
                    borderRadius: 5,
                }]
            };

            if (chartCanvas) {
                if (state.statusPieChart) state.statusPieChart.destroy();
                state.statusPieChart = new Chart(chartCanvas, {
                    type: 'doughnut',
                    data: chartData,
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: {
                            legend: { display: false },
                            tooltip: { enabled: false }
                        },
                        animation: {
                            animateScale: true,
                            animateRotate: true
                        }
                    }
                });
            }
        },

        renderVehicleList() {
            const filteredVehicles = state.vehicles.filter(v => {
                const term = state.filterTerm.toUpperCase();
                if (!term) return true;
                return v.plate.toUpperCase().includes(term) || v.phone?.includes(term);
            });

            const totalItems = filteredVehicles.length;
            const totalPages = Math.ceil(totalItems / state.itemsPerPage);
            if (state.currentPage > totalPages && totalPages > 0) {
                state.currentPage = totalPages;
            }
            const startIndex = (state.currentPage - 1) * state.itemsPerPage;
            const endIndex = startIndex + state.itemsPerPage;
            const paginatedVehicles = filteredVehicles.slice(startIndex, endIndex);

            if (state.isLoading) {
                dom.vehicleListContainer.innerHTML = Array(5).fill(Templates.skeletonItem()).join('');
                dom.paginationControls.innerHTML = '';
                return;
            }
            if (paginatedVehicles.length === 0) {
                dom.vehicleListContainer.innerHTML = Templates.emptyState('Không có xe nào trong danh sách.');
                dom.paginationControls.innerHTML = '';
                return;
            }
            dom.vehicleListContainer.innerHTML = paginatedVehicles.map(v => Templates.vehicleItem(v, state.alerts)).join('');

            this.renderPagination(totalPages, state.currentPage);
        },

        renderPagination(totalPages, currentPage) {
            if (totalPages <= 1) {
                dom.paginationControls.innerHTML = '';
                return;
            }

            let paginationHtml = `<button class="pagination-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>&laquo; Trước</button>`;

            for (let i = 1; i <= totalPages; i++) {
                paginationHtml += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
            }

            paginationHtml += `<button class="pagination-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Sau &raquo;</button>`;

            dom.paginationControls.innerHTML = paginationHtml;
        },

        showModal(modalName, data = {}) {
            state.activeModal = modalName;
            let modalHtml = '';
            switch (modalName) {
                case 'location':
                    modalHtml = Templates.locationModal(data.locations);
                    break;
                case 'qr-scanner':
                    modalHtml = Templates.qrScannerModal();
                    break;
                case 'payment':
                    modalHtml = Templates.paymentModal(data);
                    break;
                case 'confirmation':
                    modalHtml = Templates.confirmationModal(data);
                    break;
                case 'checkInReceipt':
                    modalHtml = Templates.checkInReceiptModal(data);
                    setTimeout(() => {
                        const qrCanvas = document.getElementById('checkin-qrcode-canvas');
                        if (qrCanvas && data.unique_id) {
                            const lookupUrl = `${window.location.origin}${window.location.pathname.replace('index.html', '').replace(/\/$/, '')}/lookup.html?ticketId=${data.unique_id}`;
                            QRCode.toCanvas(qrCanvas, lookupUrl, { width: 220, errorCorrectionLevel: 'H', margin: 1 }, (error) => {
                                if (error) console.error('Lỗi tạo QR code:', error);
                            });
                        }
                        if (data.isNew) {
                            this.startConfetti('checkin-receipt-confetti');
                        }
                    }, 100);
                    break;
                case 'global-alert':
                    modalHtml = data.html;
                    break;
                case 'image-viewer':
                    modalHtml = Templates.imageViewerModal(data);
                    break;
                case 'finalSuccess':
                    modalHtml = Templates.finalSuccessModal(data);
                    break;
            }
            dom.modalContainer.innerHTML = modalHtml;
            const overlay = dom.modalContainer.querySelector('.modal-overlay');
            if (overlay) {
                setTimeout(() => overlay.classList.add('active'), 10);
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay || e.target.closest('[data-action="close-modal"]')) {
                        Handlers.handleModalClose();
                    }
                });
            }
        },

        closeModal() {
            const overlay = dom.modalContainer.querySelector('.modal-overlay');
            if (overlay) {
                overlay.classList.remove('active');
                setTimeout(() => {
                    dom.modalContainer.innerHTML = '';
                    state.activeModal = null;
                    if (state.cameraStream) {
                        state.cameraStream.getTracks().forEach(track => track.stop());
                        state.cameraStream = null;
                    }
                    if (state.scanAnimation) {
                        cancelAnimationFrame(state.scanAnimation);
                        state.scanAnimation = null;
                    }
                    if (state.isProcessing) {
                        state.isProcessing = false;
                        this.renderActionButtons();
                    }
                }, 300);
            }
        },

        showPaymentConfirmation(status, message) {
            const modalContent = dom.modalContainer.querySelector('.modal-content');
            if (!modalContent) return;
            const confirmationOverlay = modalContent.querySelector('.payment-confirmation-overlay');
            if (!confirmationOverlay) return;
            const iconWrapper = confirmationOverlay.querySelector(`.confirmation-icon-wrapper.${status}`);
            const text = confirmationOverlay.querySelector('.confirmation-text');
            if (iconWrapper) iconWrapper.classList.add('active');
            if (text) text.textContent = message;
            confirmationOverlay.classList.add('active');
        },

        showGlobalAlertModal(alert) {
            if (!alert || !alert.plate) return;
            const title = 'Cảnh báo an ninh';
            const modalHtml = Templates.globalAlertModal(title, alert.plate, alert.reason, alert.level);
            this.showModal('global-alert', { html: modalHtml });
        },

        startConfetti(containerId) {
            const container = document.getElementById(containerId);
            if (!container) return;

            for (let i = 0; i < 100; i++) {
                const confetti = document.createElement('div');
                confetti.className = 'confetti';
                confetti.style.left = `${Math.random() * 100}%`;
                confetti.style.animationDelay = `${Math.random() * 2}s`;
                confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 50%)`;
                container.appendChild(confetti);
            }
        },
    };

    // =========================================================================
    // MODULE 4: TEMPLATES - CÁC MẪU HTML
    // =========================================================================
    const Templates = {
        actionButton: (action, text, disabled = false) => `
            <button type="button" class="action-button btn--${action}" data-action="${action}" ${disabled ? 'disabled' : ''}>
                <span class="btn-icon-wrapper">
                    <svg class="btn-icon icon--check-in" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>
                    <svg class="btn-icon icon--check-out" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    <svg class="btn-icon icon--reprint" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    <svg class="btn-icon icon--view-ticket" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>
                </span>
                <span class="btn-text">${text}</span>
            </button>
        `,
        secondaryActionButton: (action, text) => `
            <div class="secondary-action-wrapper">
                <button type="button" class="secondary-action-btn" data-action="${action}">${text}</button>
            </div>
        `,
        actionAlertBox: (level, plate, reason) => `
            <div class="action-alert-box alert-${level}">
                <div class="action-alert-header">
                    <svg class="alert-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    Cảnh báo với xe ${plate}
                </div>
                <div class="action-alert-reason">${reason || 'Không có lý do cụ thể.'}</div>
            </div>
        `,
        infoItem: (label, value) => `<div class="info-item"><span class="label">${label}</span><span class="value">${value}</span></div>`,
        vehicleInfoDisplay: (vehicle) => {
            const isParking = vehicle.status === 'Đang gửi';
            const fee = isParking ? Utils.calculateFee(vehicle.entry_time, null, vehicle.is_vip) : vehicle.fee;
            const duration = isParking ? `<span class="live-duration" data-starttime="${vehicle.entry_time}">${Utils.calculateDuration(vehicle.entry_time)}</span>` : Utils.calculateDuration(vehicle.entry_time, vehicle.exit_time);
            const feeDisplay = isParking ? `<span class="live-fee" data-starttime="${vehicle.entry_time}" data-isvip="${vehicle.is_vip}">${Utils.formatCurrency(fee)}đ</span>` : `<strong>${Utils.formatCurrency(fee)}đ</strong>`;

            let html = `
                ${Templates.infoDisplayItem('Nhận dạng', Utils.decodePlate(vehicle.plate))}
                ${Templates.infoDisplayItem('Trạng thái', `<span class="status-badge ${isParking ? 'parking' : 'departed'}">${vehicle.is_vip ? `${vehicle.status} (VIP)` : vehicle.status}</span>`)}
                ${Templates.infoDisplayItem('Giờ vào', Utils.formatDateTime(vehicle.entry_time))}
                ${isParking ? '' : Templates.infoDisplayItem('Giờ ra', Utils.formatDateTime(vehicle.exit_time))}
                ${Templates.infoDisplayItem('Thời gian gửi', duration)}
                ${Templates.infoDisplayItem(isParking ? 'Phí tạm tính' : 'Phí đã trả', feeDisplay)}
                ${Templates.infoDisplayItem('SĐT', Utils.formatPhone(vehicle.phone))}
            `;
            if (vehicle.notes) {
                html += Templates.infoDisplayItem('Ghi chú', `<strong style="color: var(--primary-accent);">${vehicle.notes}</strong>`);
            }
            if (vehicle.image_url) {
                html += Templates.infoDisplayItem('Ảnh xe', `<button class="action-button btn--secondary" data-action="view-image" data-image-url="${Utils.getDirectImageUrl(vehicle.image_url)}" data-plate="${vehicle.plate || ''}" style="display:inline-flex; align-items:center; gap:0.5rem; padding:0.5rem 1rem; font-size:0.9rem; width: auto; height: auto;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v7"/><path d="M3 15a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2"/><path d="M8 11l2.5 3L14 9l4 6"/></svg><span>Xem ảnh</span></button>`, 'has-image-btn');
            }
            return html;
        },
        infoDisplayItem: (label, value, valueClass = '') => `<div class="info-display-item"><span class="label">${label}</span><span class="value ${valueClass}">${value}</span></div>`,
        historyItem: (entry) => {
            const locationName = Utils.getLocationNameById(entry.location_id) || 'Không rõ';
            return `
                <li>
                    <div class="history-item">
                        <div class="history-details">
                            <div class="history-time">
                                <strong>Vào:</strong> ${Utils.formatDateTime(entry.entry_time)}
                            </div>
                            <div class="history-time">
                                <strong>Ra:</strong> ${Utils.formatDateTime(entry.exit_time)}
                            </div>
                            <div class="history-duration">
                                <strong>TG gửi:</strong> ${Utils.calculateDuration(entry.entry_time, entry.exit_time)}
                            </div>
                        </div>
                        <div class="history-location">${locationName}</div>
                    </div>
                </li>`;
        },
        geminiStatCard: (id, label, value, unit, description, canvasId = null) => {
            const icons = {
                gauge: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>`,
                vehicles: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-1.1-.9-2-2-2H7c-1.1 0-2 .9-2 2v3c0 .6.4 1 1 1h2"/><path d="M19 17H5v-5.9c0-1.2 1-2.1 2.1-2.1h9.8c1.2 0 2.1.9 2.1 2.1V17Z"/><path d="M8 17V9h8v8"/><circle cx="8.5" cy="13.5" r=".5"/><circle cx="15.5" cy="13.5" r=".5"/></svg>`,
                total: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
                longest: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
            };

            const chartHtml = canvasId ? `<div class="gemini-stat-card__chart"><canvas id="${canvasId}"></canvas></div>` : '';

            return `
                <div class="gemini-stat-card" data-stat-id="${id}" title="${description}">
                    <div class="gemini-stat-card__icon">${icons[id] || ''}</div>
                    <div class="gemini-stat-card__content">
                        <span class="gemini-stat-card__label">${label}</span>
                        <div class="gemini-stat-card__value-wrapper">
                            <span class="gemini-stat-card__value">${value}</span><span class="gemini-stat-card__unit">${unit}</span>
                        </div>
                    </div>
                    ${chartHtml}
                </div>
            `;
        },
        vehicleItem: (v, alerts) => {
            const alert = alerts[v.plate];
            let alertClass = '';
            let alertIcon = '';
            const isParking = v.status === 'Đang gửi';
            if (alert) {
                alertClass = `alert-${alert.level}`;
                alertIcon = `<svg class="alert-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
            }

            const iconHtml = isParking
                ? `<svg class="icon--parking" viewBox="0 0 24 24"><circle class="pulse-wave" cx="12" cy="12" r="6"/><path class="vehicle-shape" d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>`
                : `<svg class="icon--departed" viewBox="0 0 24 24"><path class="vehicle-shape" d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/><path class="checkmark-path" fill="none" d="M8 12l3 3 5-5"/></svg>`;

            return `<div class="vehicle-item ${v.is_vip ? 'is-vip' : ''} ${alertClass} ${!isParking ? 'departed-item' : ''}" data-plate="${v.plate}"><div class="icon">${iconHtml}</div><div class="info"><div class="plate">${alertIcon} ${v.plate} <span class="status-badge ${isParking ? 'parking' : 'departed'}">${v.status}</span></div><div class="details"><span>${Utils.formatDateTime(v.entry_time)}</span></div></div></div>`;
        },
        skeletonItem: () => `<div class="skeleton-item"></div>`,
        emptyState: (text) => `<div class="empty-state">${text}</div>`,
        modal(title, content, footer, maxWidth = '500px') {
            const style = `style="max-width: ${maxWidth};"`;
            return `
                <div class="modal-overlay">
                    <div class="modal-content" ${style}>
                        <div class="modal-header"><h2>${title}</h2><button class="modal-close-btn" data-action="close-modal">&times;</button></div>
                        <div class="modal-body">${content}</div>
                        <div class="modal-footer">${footer}</div>
                    </div>
                </div>`;
        },
        locationModal(locations) {
            const locationItems = locations.map((loc, index) => {
                const isRecommended = index === 0 && loc.distance > -1 && loc.distance < 1;
                return `<div class="location-card ${isRecommended ? 'recommended' : ''}" data-action="select-location" data-location-id="${loc.id}">${isRecommended ? '<div class="recommended-badge">Gần nhất</div>' : ''}<div class="location-card-header"><h3>${loc.name}</h3>${loc.distance > -1 ? `<span class="distance-tag">~${(loc.distance * 1000).toFixed(0)}m</span>` : ''}</div><div class="location-card-body"><div class="location-detail"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg><span>${loc.address || 'Chưa có địa chỉ'}</span></div><div class="location-detail"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg><span>${loc.operating_hours || 'Hoạt động 24/7'}</span></div></div></div>`}).join('');
            const title = locations.some(l => l.distance > -1) ? 'Gợi ý Bãi đỗ xe gần bạn' : 'Vui lòng chọn Bãi đỗ xe';
            const content = `<p class="modal-subtitle">Hệ thống đã tự động sắp xếp các bãi xe theo thứ tự từ gần đến xa để bạn tiện lựa chọn.</p><div class="location-card-list">${locationItems}</div>`;
            return this.modal(title, content, '<button class="action-button btn--secondary" data-action="close-modal">Đóng</button>', '650px');
        },
        globalAlertModal(title, plate, reason, level) {
            const content = `
                <div class="global-alert-wrapper">
                    <div class="global-alert-plate-box alert-bg-${level}"><div class="global-alert-plate">${plate}</div></div>
                    <p class="global-alert-reason">${reason || 'Không có lý do cụ thể.'}</p>
                </div>`;
            return this.modal(title, content, '<button class="action-button btn--secondary" data-action="close-modal">Đã hiểu</button>', '450px');
        },
        imageViewerModal({ imageUrl, plate }) {
            const title = `Ảnh xe ${plate}`;
            const content = `<div class="image-viewer-container"><img src="${imageUrl}" alt="Ảnh xe ${plate}"></div>`;
            const footer = `<button class="action-button btn--secondary" data-action="close-modal">Đóng</button>`;
            return this.modal(title, content, footer, '85vw');
        },
        qrScannerModal() {
            const content = `<div class="qr-scanner-body"><video id="camera-feed" playsinline></video><div class="scanner-overlay"><div class="scanner-viewfinder"><div class="corner corner-tl"></div><div class="corner corner-tr"></div><div class="corner corner-bl"></div><div class="corner corner-br"></div></div></div><div class="scanner-feedback-overlay"><div class="feedback-icon"><svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52"><circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/><path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/></svg></div><div class="feedback-plate"></div></div></div><p style="text-align: center; color: var(--text-secondary); margin-top: 1rem;">Di chuyển mã QR vào trong khung để lấy xe.</p>`;
            const footer = `<button class="action-button btn--secondary" data-action="close-modal">Hủy bỏ</button>`;
            return this.modal('Quét mã QR để lấy xe', content, footer, '480px');
        },
        paymentModal({ fee, vehicle }) {
            const memo = `TTGX ${vehicle.plate} ${vehicle.unique_id}`;
            const qrUrl = `${APP_CONFIG.payment.imageUrlBase}&amount=${fee}&addInfo=${encodeURIComponent(memo)}`;
            const content = `<div class="payment-layout"><div class="payment-main"><div class="payment-qr-section"><div class="qr-wrapper"><img src="${qrUrl}" alt="QR Code Thanh toán"><p>Nội dung chuyển khoản: <strong>${memo}</strong></p></div></div><div class="payment-actions"><button class="action-button btn--check-in" data-action="complete-payment" data-method="Chuyển khoản QR"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>Đã nhận (QR)</span></button><button class="action-button btn--reprint" data-action="complete-payment" data-method="Tiền mặt"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path></svg><span>Đã nhận (Tiền mặt)</span></button></div></div><div class="payment-sidebar"><div class="payment-summary"><h3>Thanh toán cho xe</h3><div class="summary-plate">${vehicle.plate}</div></div><div class="payment-details">${Templates.infoItem('Giờ vào', `<strong>${Utils.formatDateTime(vehicle.entry_time)}</strong>`)}${Templates.infoItem('Thời gian gửi', `<strong class="live-duration" data-starttime="${vehicle.entry_time}">${Utils.calculateDuration(vehicle.entry_time)}</strong>`)}</div><div class="payment-total"><div class="fee-label">TỔNG CỘNG</div><div class="fee-display">${Utils.formatCurrency(fee)}<span>đ</span></div></div></div><div class="payment-confirmation-overlay"><div class="confirmation-icon-wrapper success"><svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52"><circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/><path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/></svg></div><div class="confirmation-icon-wrapper error"><svg class="cross" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52"><circle class="cross__circle" cx="26" cy="26" r="25" fill="none"/><path class="cross__path cross__path--right" fill="none" d="M16,16 l20,20" /><path class="cross__path cross__path--left" fill="none" d="M16,36 l20,-20" /></svg></div><p class="confirmation-text"></p></div></div>`;
            const footer = `<button class="action-button btn--secondary" data-action="close-modal">Hủy bỏ</button>`;
            return this.modal('Xác nhận Thanh toán', content, footer, '800px', true);
        },
        confirmationModal({ title, plate, reason, type }) {
            const isVip = type === 'vip';
            const passTitle = isVip ? 'XE ƯU TIÊN' : 'MIỄN PHÍ GỬI XE';
            const icon = isVip
                ? `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`
                : `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`;

            const content = `
                <div class="priority-pass-new ${isVip ? 'vip' : 'free'}">
                    <div class="priority-pass-new__icon">${icon}</div>
                    <h3 class="priority-pass-new__title">${passTitle}</h3>
                    <div class="priority-pass-new__plate">${plate}</div>
                    <p class="priority-pass-new__reason">Lý do: <strong>${reason}</strong></p>
                    <div id="confetti-container"></div>
                    <div class="priority-pass-new__success-overlay">
                        <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52"><circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/><path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/></svg>
                        <p>ĐÃ XÁC NHẬN</p>
                    </div>
                </div>`;
            const footer = `<button class="action-button btn--secondary" data-action="confirm-no">Hủy bỏ</button><button class="action-button ${isVip ? 'btn--reprint' : 'btn--check-in'}" data-action="confirm-yes"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>Xác nhận cho xe ra</span></button>`;
            return this.modal(title, content, footer, '450px');
        },
        finalSuccessModal({ plate, reason }) {
            const content = `
                <div class="priority-pass-new free">
                    <div id="confetti-container"></div>
                    <div class="priority-pass-new__success-overlay active" style="position: relative; background: transparent;">
                        <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52"><circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/><path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/></svg>
                        <h3 class="priority-pass-new__title" style="margin-top: 1rem; color: var(--text-primary);">CHO XE RA THÀNH CÔNG</h3>
                        <div class="priority-pass-new__plate">${plate}</div>
                        <p class="priority-pass-new__reason" style="font-size: 1rem;">${reason}</p>
                    </div>
                </div>`;
            const footer = `<button class="action-button btn--secondary" data-action="close-modal" style="margin: auto;">Đóng</button>`;
            return this.modal('Giao dịch hoàn tất', content, footer, '450px');
        },
        checkInReceiptModal(data) { // THIẾT KẾ LẠI HOÀN TOÀN
            const isVip = data.is_vip;
            const title = data.isNew ? 'GỬI XE THÀNH CÔNG' : (isVip ? 'VÉ GỬI XE VIP' : 'VÉ GỬI XE ĐIỆN TỬ');
            const vipClass = isVip ? 'is-vip' : '';
 
            const content = `
                <div class="digital-pass-wrapper ${vipClass}">
                    <div id="checkin-receipt-confetti"></div>
                    <div class="pass-header">
                        <div class="pass-logo">
                            <img src="https://cdn.haitrieu.com/wp-content/uploads/2021/11/Logo-Doan-Thanh-NIen-Cong-San-Ho-Chi-Minh-1.png" alt="Huy hiệu Đoàn TNCS Hồ Chí Minh">
                        </div>
                        <div class="pass-titles">
                            <div class="pass-title-main">ĐOÀN TNCS HỒ CHÍ MINH</div>
                            <div class="pass-title-sub">${state.currentLocation?.event_name || 'PHƯỜNG BA ĐÌNH'}</div>
                        </div>
                    </div>
                    <div class="pass-body">                        
                        <div class="pass-plate-section">
                            <span class="pass-plate-label">Biển số xe</span>
                            <div class="pass-plate">${data.plate}</div>
                            ${isVip ? '<div class="pass-vip-label">⭐ XE ƯU TIÊN ⭐</div>' : ''}
                        </div>
                        <div class="pass-qr-section">
                            <canvas id="checkin-qrcode-canvas" aria-label="Mã QR của vé xe"></canvas>
                            <p class="pass-qr-instruction">Đưa mã này khi lấy xe</p>
                        </div>
                        <div class="pass-details-section">
                            <div class="pass-detail-item"><span>Giờ vào:</span><strong>${Utils.formatDateTime(data.entry_time)}</strong></div>
                            <div class="pass-detail-item"><span>Tại:</span><strong>${Utils.getLocationNameById(data.location_id)}</strong></div>
                        </div>
                    </div>
                    <div class="pass-footer">
                        <div class="pass-id-display">ID: ${data.unique_id}</div>
                    </div>
                </div>`;
 
            const footer = `<button class="action-button btn--secondary" data-action="close-modal" style="width: 100%; max-width: 200px; margin: 0 auto;">Đóng</button>`;
            return this.modal(title, content, footer, '420px');
        },
    };

    // =========================================================================
    // MODULE 5: UTILITIES - CÁC HÀM TIỆN ÍCH
    // =========================================================================
    const Utils = {
        formatDateTime: (d) => d ? new Date(d).toLocaleString('vi-VN') : '--',
        formatCurrency: (n) => new Intl.NumberFormat('vi-VN').format(n || 0),
        formatPhone: (p) => p || 'Chưa có',
        calculateDuration: (start, end = new Date()) => {
            if (!start) return '--';
            let diff = Math.floor((new Date(end) - new Date(start)) / 1000);
            if (diff < 0) return '0m';
            const d = Math.floor(diff / 86400); diff %= 86400;
            const h = Math.floor(diff / 3600); diff %= 3600;
            const m = Math.floor(diff / 60);
            return [d > 0 ? `${d}d` : '', h > 0 ? `${h}h` : '', `${m}m`].filter(Boolean).join(' ') || '0m';
        },
        calculateFee: (startTime, endTime, isVIP) => {
            const policyType = state.currentLocation?.fee_policy_type || 'free';
            const config = APP_CONFIG.fee;
            const locationConfig = state.currentLocation || {};

            if (!config.enabled || isVIP || !startTime || policyType === 'free') {
                return 0;
            }

            if (endTime === null) {
                const collectionPolicy = state.currentLocation?.fee_collection_policy || 'post_paid';
                if (collectionPolicy === 'pre_paid') {
                    if (policyType === 'per_entry') return locationConfig.fee_per_entry ?? config.entryFee ?? 0;
                    if (policyType === 'daily') return locationConfig.fee_daily ?? config.dailyFee ?? 0;
                    return 0;
                }
            }

            const diffMinutes = Math.floor((new Date(endTime || new Date()) - new Date(startTime)) / (1000 * 60));
            if (diffMinutes <= config.freeMinutes) return 0;

            switch (policyType) {
                case 'per_entry':
                    return locationConfig.fee_per_entry ?? config.entryFee ?? 0;
                case 'daily':
                    const totalDays = Math.ceil((diffMinutes - config.freeMinutes) / (60 * 24));
                    return (locationConfig.fee_daily ?? config.dailyFee ?? 0) * Math.max(1, totalDays);
                case 'hourly':
                    let totalFee = 0;
                    const chargeableStartTime = new Date(new Date(startTime).getTime() + config.freeMinutes * 60 * 1000);
                    const totalChargeableHours = Math.ceil((diffMinutes - config.freeMinutes) / 60);
                    const dayRate = locationConfig.fee_hourly_day ?? config.dayRate;
                    const nightRate = locationConfig.fee_hourly_night ?? config.nightRate;
                    for (let i = 0; i < totalChargeableHours; i++) {
                        const currentHour = new Date(chargeableStartTime.getTime() + i * 60 * 60 * 1000).getHours();
                        totalFee += (currentHour >= config.nightStartHour || currentHour < config.nightEndHour) ? nightRate : dayRate;
                    }
                    return totalFee;
                default:
                    return 0;
            }
        },
        decodePlate: (plate) => {
            if (!plate || typeof PLATE_DATA === 'undefined') return 'Chưa có thông tin';
            const cleaned = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const province = PLATE_DATA.provinces.find(p => p.codes.includes(cleaned.substring(0, 2)));
            return province ? province.name : 'Không xác định';
        },
        getLocationNameById: (id) => {
            if (!id) return 'Không rõ';
            const location = state.locations.find(l => l.id === id);
            return location ? location.name : 'Không rõ';
        },
        getDistance: (lat1, lon1, lat2, lon2) => {
            const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
        },
        getDirectImageUrl: (supabaseUrl) => {
            if (!supabaseUrl) return '';
            const urlParts = supabaseUrl.split('/render/image/sign/');
            if (urlParts.length < 2) return supabaseUrl;
            const filePath = urlParts[1];
            return `${APP_CONFIG.supabaseUrl}/storage/v1/object/public/${filePath}`;
        },
    };

    // =========================================================================
    // MODULE 6: EVENT HANDLERS - BỘ NÃO XỬ LÝ SỰ KIỆN
    // =========================================================================
    const Handlers = {
        async handleStaffLogin(event) {
            event.preventDefault();
            const username = dom.staffUsernameInput.value.trim();
            const pin = dom.staffPinInput.value.trim();
            const loginButton = dom.staffLoginForm.querySelector('button');

            if (!username || !pin) {
                dom.staffLoginError.textContent = 'Vui lòng nhập đủ thông tin.';
                return;
            }

            loginButton.disabled = true;
            loginButton.textContent = 'Đang kiểm tra...';
            dom.staffLoginError.textContent = '';

            try {
                const staffData = await Api.verifyStaff(username, pin);
                App.loginSuccess(staffData);
            } catch (error) {
                dom.staffLoginError.textContent = error.message;
            } finally {
                loginButton.disabled = false;
                loginButton.textContent = 'Đăng nhập';
            }
        },

        async handleUsernameBlur(event) {
            const username = event.target.value.trim();
            if (!username) {
                dom.staffInfoDisplay.classList.remove('visible');
                dom.biometricLoginBtn.style.display = 'none';
                return;
            }

            dom.staffInfoDisplay.innerHTML = `<p style="color: var(--text-secondary);">Đang kiểm tra...</p>`;
            dom.staffInfoDisplay.classList.add('visible');

            try {
                const staffInfo = await Api.getStaffInfoByUsername(username);
                if (staffInfo) {
                    const locationName = (staffInfo.locations && typeof staffInfo.locations === 'object' && staffInfo.locations.name)
                        ? staffInfo.locations.name
                        : '<span style="color: var(--danger-color);">Chưa được phân công</span>';

                    dom.staffInfoDisplay.innerHTML = `
                        <p class="staff-name">Chào, ${staffInfo.full_name}!</p>
                        <p class="staff-location">Bạn được phân công tại: <strong>${locationName}</strong></p>
                    `;

                    if (staffInfo.webauthn_credential_id) {
                        dom.biometricLoginBtn.style.display = 'block';
                    } else {
                        dom.biometricLoginBtn.style.display = 'none';
                    }
                } else {
                    dom.staffInfoDisplay.innerHTML = `<p style="color: var(--danger-color);">Tên đăng nhập không tồn tại.</p>`;
                    dom.biometricLoginBtn.style.display = 'none';
                }
            } catch (error) {
                dom.staffInfoDisplay.innerHTML = `<p style="color: var(--danger-color);">Lỗi kết nối. Vui lòng thử lại.</p>`;
                dom.biometricLoginBtn.style.display = 'none';
            }
        },

        async handleBiometricLogin() {
            const username = dom.staffUsernameInput.value.trim();
            if (!username) return;

            dom.biometricLoginBtn.disabled = true;
            dom.biometricLoginBtn.textContent = 'Đang chờ xác thực...';

            try {
                const staffData = await Api.getStaffInfoByUsername(username);

                if (!staffData || !staffData.webauthn_credential_id) {
                    throw new Error("Tài khoản này chưa đăng ký sinh trắc học.");
                }

                const { data: challengeData, error: challengeError } = await db.functions.invoke('get-webauthn-challenge');
                if (challengeError) throw challengeError;

                const options = {
                    challenge: SimpleWebAuthnBrowser.base64url.decode(challengeData.challenge),
                    allowCredentials: [{
                        id: SimpleWebAuthnBrowser.base64url.decode(staffData.webauthn_credential_id),
                        type: 'public-key',
                    }],
                    userVerification: 'required',
                };

                const assertion = await SimpleWebAuthnBrowser.startAuthentication(options);

                const { error: verifyError } = await db.functions.invoke('verify-webauthn-login', {
                    body: {
                        username: username,
                        assertionResponse: assertion
                    }
                });

                if (verifyError) throw verifyError;

                App.loginSuccess(staffData);

            } catch (error) {
                let errorMessage = 'Đã xảy ra lỗi không xác định.';
                if (error.name === 'NotAllowedError') {
                    errorMessage = 'Thao tác xác thực đã bị hủy.';
                } else {
                    errorMessage = error.message || JSON.stringify(error);
                }
                dom.staffLoginError.textContent = `Lỗi sinh trắc học: ${errorMessage}`;
                console.error('Lỗi đăng nhập sinh trắc học:', error);
            } finally {
                dom.biometricLoginBtn.disabled = false;
                dom.biometricLoginBtn.textContent = 'Đăng nhập bằng Vân tay/Khuôn mặt';
            }
        },

        handleLogout() {
            localStorage.removeItem('staffInfo');
            localStorage.removeItem('appState');
            window.location.reload();
        },

        async handleDateChange(e) {
            state.currentDate = new Date(e.target.value);
            App.saveStateToLocalStorage();
            await App.fetchData();
        },

        handleFilterChange(e) {
            state.filterTerm = e.target.value;
            state.currentPage = 1;
            UI.renderVehicleList();
        },

        async handleSearchTermChange(e) {
            const searchTerm = e.target.value.trim();
            const cleanedPlate = searchTerm.toUpperCase().replace(/[^A-Z0-9]/g, '');
            state.selectedPlate = cleanedPlate;

            if (searchTerm.length < 4) {
                state.selectedVehicle = null;
                UI.renderActionButtons();
                UI.updateMainFormUI();
                UI.renderSuggestions('');
                return;
            }

            const foundParking = state.vehicles.find(v =>
                v.status === 'Đang gửi' && (v.plate === cleanedPlate || (v.phone && v.phone === searchTerm))
            );

            if (foundParking) {
                state.selectedVehicle = { data: foundParking, status: 'parking' };
                const alert = state.alerts[foundParking.plate];
                if (alert) UI.showGlobalAlertModal(alert);
            } else {
                const foundDeparted = state.vehicles.find(v => v.plate === cleanedPlate && v.status === 'Đã rời bãi');
                if (foundDeparted) {
                    state.selectedVehicle = { data: foundDeparted, status: 'departed' };
                } else {
                    try {
                        const globalVehicle = await Api.findVehicleGlobally(cleanedPlate);
                        state.selectedVehicle = globalVehicle ? { data: globalVehicle, status: 'parking_remote' } : { data: null, status: 'new' };
                    } catch (error) {
                        UI.showToast(error.message, 'error');
                        state.selectedVehicle = { data: null, status: 'new' };
                    }
                }
            }

            UI.renderActionButtons();
            UI.updateMainFormUI();
            if (state.selectedVehicle?.status === 'new' || state.selectedVehicle?.status === 'parking_remote') {
                UI.renderSuggestions(cleanedPlate);
            }
        },

        handlePaginationClick(e) {
            const button = e.target.closest('.pagination-btn');
            if (!button || button.disabled) return;
            state.currentPage = parseInt(button.dataset.page, 10);
            UI.renderVehicleList();
        },

        handleVehicleItemClick(item) {
            const plate = item.dataset.plate;
            if (plate) {
                dom.searchTermInput.value = plate;
                dom.searchTermInput.dispatchEvent(new Event('input', { bubbles: true }));
                if (window.innerWidth < 768) {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }
        },

        async handleActionClick(e) {
            const button = e.target.closest('[data-action]');
            if (!button) return;

            const action = button.dataset.action;
            if (!['check-in', 'check-out', 'view-ticket', 'complete-payment'].includes(action)) return;

            if (state.isProcessing) return;

            if (action === 'view-ticket') {
                this.processViewTicket();
                return;
            }

            state.isProcessing = true;
            button.disabled = true;
            button.innerHTML = '<span>Đang xử lý...</span>';

            try {
                if (action === 'check-in') await this.processCheckIn();
                if (action === 'check-out') await this.processCheckOut();
            } catch (error) {
                UI.showToast(error.message, 'error');
            } finally {
                state.isProcessing = false;
                UI.renderActionButtons();
            }
        },

        handleModalClose() {
            if (state.activeModal === 'payment' && state.isProcessing) {
                UI.showPaymentConfirmation('error', 'Đã hủy');
                setTimeout(() => UI.closeModal(), 1500);
            } else {
                UI.closeModal();
            }
        },

        async processCheckIn() {
            const plate = state.selectedPlate;
            if (!plate) throw new Error('Biển số không hợp lệ.');

            const isAlreadyParking = state.vehicles.some(v => v.plate === plate && v.status === 'Đang gửi');
            if (isAlreadyParking) {
                throw new Error(`Xe ${plate} đã có trong bãi. Vui lòng kiểm tra lại.`);
            }

            const phone = dom.phoneNumberInput.value.trim();
            const isVIP = dom.isVipCheckbox.checked;
            const notes = dom.vehicleNotesInput.value.trim();

            const staffInfo = JSON.parse(localStorage.getItem('staffInfo'));
            const staffUsername = staffInfo?.username || 'unknown';

            const feeCollectionPolicy = state.currentLocation?.fee_collection_policy || 'post_paid';
            const feePolicyType = state.currentLocation?.fee_policy_type || 'free';

            let newTransaction;

            if (feePolicyType === 'free' || (feeCollectionPolicy === 'pre_paid' && Utils.calculateFee(new Date(), null, isVIP) === 0)) {
                const reason = isVIP ? 'Khách VIP' : 'Miễn phí';
                newTransaction = await Api.checkIn(plate, phone, isVIP, notes, { fee: 0, method: reason }, null, staffUsername);
            } else if (feeCollectionPolicy === 'pre_paid') {
                const calculatedFee = Utils.calculateFee(new Date(), null, isVIP);
                const uniqueID = '_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
                const paymentResult = await this.getPaymentResult(calculatedFee, { plate, entry_time: new Date().toISOString(), unique_id: uniqueID });
                if (!paymentResult) throw new Error('Đã hủy thao tác gửi xe.');
                newTransaction = await Api.checkIn(plate, phone, isVIP, notes, paymentResult, uniqueID, staffUsername);
            } else {
                newTransaction = await Api.checkIn(plate, phone, isVIP, notes, null, null, staffUsername);
            }

            UI.showModal('checkInReceipt', { ...newTransaction, isNew: true });
            await App.resetFormAndFetchData();
        },

        async getPaymentResult(fee, vehicleData) {
            return new Promise((resolve) => {
                UI.showModal('payment', { fee, vehicle: vehicleData });
                const modalClickHandler = (e) => {
                    const target = e.target.closest('[data-action]');
                    if (!target) return;
                    const action = target.dataset.action;
                    if (action === 'complete-payment') {
                        const method = target.dataset.method;
                        dom.modalContainer.removeEventListener('click', modalClickHandler);
                        resolve({ fee, method });
                    } else if (action === 'close-modal') {
                        dom.modalContainer.removeEventListener('click', modalClickHandler);
                        resolve(null);
                    }
                };
                dom.modalContainer.addEventListener('click', modalClickHandler);
            });
        },

        async processOfflineCheckOut(vehicle, fee, paymentMethod) {
            const staffInfo = JSON.parse(localStorage.getItem('staffInfo'));
            const staffUsername = staffInfo?.username || 'unknown';
            Api.addToSyncQueue('checkOut', { uniqueID: vehicle.unique_id, fee, paymentMethod, staffUsername });
            UI.showToast(`Đã ghi nhận lấy xe (offline) cho ${vehicle.plate}.`, 'success');
            await App.resetFormAndFetchData();
        },

        async processCheckOut() {
            const vehicle = state.selectedVehicle?.data;
            if (!vehicle) throw new Error('Không có thông tin xe để lấy ra.');

            const alert = state.alerts[vehicle.plate];
            if (alert?.level === 'block') throw new Error(`XE BỊ CHẶN: ${alert.reason}`);

            const staffInfo = JSON.parse(localStorage.getItem('staffInfo'));
            const staffUsername = staffInfo?.username || 'unknown';

            if (vehicle.fee !== null && vehicle.payment_method) {
                if (!state.isOnline) return this.processOfflineCheckOut(vehicle, 0, 'Đã thanh toán trước', staffUsername);
                UI.showModal('confirmation', { title: 'Xác nhận cho xe ra', plate: vehicle.plate, reason: 'Đã thanh toán trước', type: 'free' });
                return;
            }

            const isVIP = vehicle.is_vip;
            const fee = Utils.calculateFee(vehicle.entry_time, null, isVIP);

            if (fee > 0) {
                if (!state.isOnline) {
                    throw new Error("Không thể xử lý thanh toán khi đang offline.");
                }
                const paymentResult = await this.getPaymentResult(fee, vehicle);
                if (paymentResult) {
                    await this.processPayment(paymentResult.method);
                    return;
                }
                throw new Error('Đã hủy thanh toán.');
            }
            const reason = isVIP ? 'Khách VIP' : 'Miễn phí';
            UI.showModal('confirmation', { title: 'Xác nhận Miễn phí', plate: vehicle.plate, reason, type: isVIP ? 'vip' : 'free' });
        },

        processViewTicket() {
            const vehicle = state.selectedVehicle?.data;
            if (!vehicle) {
                UI.showToast('Không có thông tin xe để xem vé.', 'error');
                return;
            }
            UI.showModal('checkInReceipt', { ...vehicle, isNew: false });
        },

        handleModalClick(e) {
            const target = e.target.closest('[data-action]');
            if (!target) return;
            const action = target.dataset.action;

            if (action === 'select-location') {
                const locationId = target.closest('.location-card').dataset.locationId;
                const location = state.locations.find(l => l.id === locationId);
                if (location) App.selectLocation(location);
                return;
            }

            switch (action) {
                case 'confirm-yes':
                    this.processConfirmation();
                    break;
                case 'confirm-no':
                    UI.closeModal();
                    state.isProcessing = false;
                    break;
            }
        },

        showConfirmationSuccess() {
            const successOverlay = document.querySelector('.priority-pass-new__success-overlay');
            const modalFooter = document.querySelector('.modal-footer');
            if (!successOverlay) return;

            successOverlay.classList.add('active');
            UI.startConfetti('confetti-container');

            if (modalFooter) {
                setTimeout(() => {
                    modalFooter.innerHTML = `<button class="action-button btn--secondary" data-action="close-modal" style="margin: auto;">Đóng</button>`;
                }, 500);
            }
        },

        async processConfirmation() {
            const vehicle = state.selectedVehicle?.data;
            if (!vehicle) return;
            const reason = vehicle.is_vip ? 'Khách VIP' : 'Miễn phí';
            const staffInfo = JSON.parse(localStorage.getItem('staffInfo'));
            const staffUsername = staffInfo?.username || 'unknown';

            try {
                await Api.checkOut(vehicle.unique_id, 0, reason, staffUsername);
                this.showConfirmationSuccess();
            } catch (error) {
                UI.showToast(`Lỗi xác nhận: ${error.message}`, 'error');
                UI.closeModal();
            }
        },

        async processPayment(paymentMethod) {
            const vehicle = state.selectedVehicle?.data;
            const fee = Utils.calculateFee(vehicle.entry_time, null, vehicle.is_vip);
            const staffInfo = JSON.parse(localStorage.getItem('staffInfo'));
            const staffUsername = staffInfo?.username || 'unknown';

            try {
                await Api.checkOut(vehicle.unique_id, fee, paymentMethod, staffUsername);
                UI.showPaymentConfirmation('success', 'Thành công!');
                const reason = `Đã thanh toán ${Utils.formatCurrency(fee)}đ`;

                setTimeout(async () => {
                    UI.closeModal();
                    UI.showModal('finalSuccess', { plate: vehicle.plate, reason: reason });
                    UI.startConfetti('confetti-container');
                    await App.resetFormAndFetchData();
                }, 2500);
            } catch (error) {
                UI.showToast(`Lỗi checkout: ${error.message}`, 'error');
                UI.closeModal();
            }
        },

        handleThemeChange() {
            const theme = dom.themeCheckbox.checked ? 'dark' : 'light';
            document.body.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
        },

        startVoiceRecognition() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) return UI.showToast('Trình duyệt không hỗ trợ giọng nói.', 'error');
            const recognition = new SpeechRecognition();
            recognition.lang = 'vi-VN';
            dom.micBtn.classList.add('active');
            recognition.onresult = (e) => {
                dom.searchTermInput.value = e.results[0][0].transcript;
                dom.searchTermInput.dispatchEvent(new Event('input', { bubbles: true }));
            };
            recognition.onend = () => dom.micBtn.classList.remove('active');
            recognition.start();
        },

        async openQrScanner() {
            if (!('mediaDevices' in navigator)) return UI.showToast('Trình duyệt không hỗ trợ camera.', 'error');
            UI.showModal('qr-scanner');
            try {
                state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                const video = document.getElementById('camera-feed');
                if (video) {
                    video.srcObject = state.cameraStream;
                    await video.play();
                    state.scanAnimation = requestAnimationFrame(() => this.tickQrScanner());
                }
            } catch (err) {
                UI.showToast('Không thể truy cập camera. Vui lòng cấp quyền.', 'error');
                UI.closeModal();
            }
        },

        tickQrScanner() {
            const video = document.getElementById('camera-feed');
            if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });

                if (code && code.data && !state.isProcessing) {
                    cancelAnimationFrame(state.scanAnimation);
                    this.processQrCheckout(code.data);
                    return;
                }
            }
            if (state.activeModal === 'qr-scanner') {
                state.scanAnimation = requestAnimationFrame(() => this.tickQrScanner());
            }
        },

        async processQrCheckout(qrData) {
            if (state.isProcessing) return;
            state.isProcessing = true;
            UI.closeModal();

            try {
                let uniqueID = qrData;
                try {
                    const url = new URL(qrData);
                    const ticketId = url.searchParams.get('ticketId');
                    if (ticketId) uniqueID = ticketId;
                } catch (e) { /* Not a URL, proceed with raw data */ }

                const vehicle = state.vehicles.find(v => v.unique_id === uniqueID && v.status === 'Đang gửi');
                if (!vehicle) throw new Error('Mã QR không hợp lệ hoặc xe đã rời bãi.');

                const alert = state.alerts[vehicle.plate];
                if (alert?.level === 'block') throw new Error(`XE BỊ CHẶN: ${alert.reason}`);

                const fee = Utils.calculateFee(vehicle.entry_time, null, vehicle.is_vip);
                const staffInfo = JSON.parse(localStorage.getItem('staffInfo'));
                const staffUsername = staffInfo?.username || 'unknown';

                if (fee > 0) {
                    if (!state.isOnline) throw new Error("Không thể xử lý thanh toán khi đang offline.");
                    const paymentResult = await this.getPaymentResult(fee, vehicle);
                    if (!paymentResult) throw new Error('Đã hủy thanh toán.');

                    await Api.checkOut(vehicle.unique_id, paymentResult.fee, paymentResult.method, staffUsername);
                    UI.showPaymentConfirmation('success', 'Thành công!');
                    const reason = `Đã thanh toán ${Utils.formatCurrency(fee)}đ`;

                    setTimeout(async () => {
                        UI.closeModal();
                        UI.showModal('finalSuccess', { plate: vehicle.plate, reason: reason });
                        UI.startConfetti('confetti-container');
                        await App.resetFormAndFetchData();
                    }, 2500);

                } else {
                    const reason = vehicle.is_vip ? 'Khách VIP' : 'Miễn phí';
                    await Api.checkOut(vehicle.unique_id, 0, reason, staffUsername);
                    UI.showToast(`Đã cho xe ${vehicle.plate} ra (${reason}).`, 'success');
                    await App.resetFormAndFetchData();
                }
            } catch (error) {
                UI.showToast(error.message, 'error');
            } finally {
                state.isProcessing = false;
            }
        },
    };

    // =========================================================================
    // MODULE 7: APP INITIALIZATION - KHỞI TẠO ỨNG DỤNG
    // =========================================================================
    const App = {
        init() {
            configPromise.then(() => {
                db = supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseKey);

                this.setupEventListeners();
                this.applySavedTheme();
                this.updateClock();
                setInterval(this.updateClock, 1000);
                setInterval(this.updateLiveDurationsAndFees, 30000);
                window.addEventListener('online', () => this.handleConnectionChange(true));
                window.addEventListener('offline', () => this.handleConnectionChange(false));
                setInterval(() => Api.processSyncQueue(), 15000);

                this.setupLoginListeners();

                this.checkStaffSession().then(isLoggedIn => {
                    if (isLoggedIn) {
                        if (dom.staffLoginScreen) dom.staffLoginScreen.style.display = 'none';
                        this.startApp();
                    } else {
                        if (dom.staffLoginScreen) dom.staffLoginScreen.style.display = 'flex';
                    }
                }).catch(err => {
                    UI.showToast(err.message, 'error');
                    if (dom.staffLoginScreen) dom.staffLoginScreen.style.display = 'flex';
                });
            });
        },

        setupEventListeners() {
            dom.datePicker.addEventListener('change', Handlers.handleDateChange);
            dom.filterInput.addEventListener('input', Handlers.handleFilterChange);
            dom.searchTermInput.addEventListener('input', (e) => Handlers.handleSearchTermChange(e));
            dom.changeLocationBtn.addEventListener('click', () => this.determineLocation(true));
            dom.themeCheckbox.addEventListener('change', Handlers.handleThemeChange);

            dom.isVipCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    dom.vehicleNotesInput.value = 'Khách VIP';
                } else if (dom.vehicleNotesInput.value === 'Khách VIP') {
                    dom.vehicleNotesInput.value = '';
                }
            });

            dom.micBtn.addEventListener('click', Handlers.startVoiceRecognition);
            dom.scanQrBtn.addEventListener('click', () => Handlers.openQrScanner());

            dom.actionButtonsContainer.addEventListener('click', (e) => Handlers.handleActionClick(e));

            dom.vehicleListContainer.addEventListener('click', (e) => {
                const item = e.target.closest('.vehicle-item');
                if (item) Handlers.handleVehicleItemClick(item);
            });
            if (dom.paginationControls) {
                dom.paginationControls.addEventListener('click', (e) => Handlers.handlePaginationClick(e));
            }
            dom.plateSuggestions.addEventListener('click', (e) => {
                const item = e.target.closest('.suggestion-item');
                if (item) {
                    dom.searchTermInput.value = item.dataset.plate;
                    dom.searchTermInput.dispatchEvent(new Event('input', { bubbles: true }));
                    dom.plateSuggestions.classList.remove('visible');
                }
            });
            window.addEventListener('click', (e) => {
                if (!dom.searchTermInput.contains(e.target) && !dom.plateSuggestions.contains(e.target)) {
                    dom.plateSuggestions.classList.remove('visible');
                }
            });

            dom.vehicleFormContent.addEventListener('click', (e) => {
                const button = e.target.closest('[data-action="view-image"]');
                if (button) {
                    UI.showModal('image-viewer', { imageUrl: button.dataset.imageUrl, plate: button.dataset.plate });
                }
            });
            dom.modalContainer.addEventListener('click', (e) => Handlers.handleModalClick(e));
            if (dom.userProfileWidget) {
                dom.userProfileWidget.addEventListener('click', (e) => {
                    if (e.target.closest('[data-action="logout"]')) {
                        Handlers.handleLogout();
                    }
                });
            }
        },

        setupLoginListeners() {
            if (dom.staffLoginForm) {
                dom.staffLoginForm.addEventListener('submit', Handlers.handleStaffLogin);
            }
            if (dom.staffUsernameInput) {
                dom.staffUsernameInput.addEventListener('blur', Handlers.handleUsernameBlur);
            }
            if (dom.biometricLoginBtn) {
                dom.biometricLoginBtn.addEventListener('click', Handlers.handleBiometricLogin);
            }
        },

        setupGlobalEventListeners() {
            ['mousemove', 'mousedown', 'keypress', 'touchstart'].forEach(event => {
                window.addEventListener(event, () => App.resetIdleTimer());
            });
        },

        async determineLocation(forceShowModal = false) {
            const AUTO_SELECT_RADIUS_KM = 0.1;
            const locations = state.locations || [];
            if (locations.length === 0) return UI.showToast('Lỗi cấu hình: Không có bãi xe.', 'error');
            if (locations.length === 1) return this.selectLocation(locations[0]);

            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, enableHighAccuracy: true });
                });

                const sortedLocations = locations.map(loc => ({ ...loc, distance: Utils.getDistance(position.coords.latitude, position.coords.longitude, loc.lat, loc.lng) }))
                    .sort((a, b) => a.distance - b.distance);

                if (!forceShowModal && sortedLocations[0].distance < AUTO_SELECT_RADIUS_KM) {
                    return this.selectLocation(sortedLocations[0]);
                }
                UI.showModal('location', { locations: sortedLocations });
            } catch (error) {
                console.warn("Lỗi định vị, hiển thị danh sách:", error.message);
                UI.showModal('location', { locations: locations.map(l => ({...l, distance: -1})) });
            }
        },

        selectLocation(location) {
            state.currentLocation = location;
            this.saveStateToLocalStorage();
            UI.showToast(`Đã chọn bãi đỗ xe: ${location.name}`, 'success');
            UI.closeModal();
            this.startApp();
        },

        async startApp() {
            try {
                await Api.fetchLocations();

                if (!state.currentLocation) {
                    await this.determineLocation();
                    if (!state.currentLocation) return;
                }

                UI.renderUserProfile();
                await this.fetchData();
                this.fetchWeather();
                this.setupRealtimeListeners();
            } catch (error) {
                UI.showToast(`Lỗi khởi động ứng dụng: ${error.message}`, 'error');
            }
        },

        async fetchData(isSilent = false) {
            if (!isSilent) state.isLoading = true;
            UI.renderVehicleList();

            try {
                const [locations, vehicles, alerts] = await Promise.all([
                    Api.fetchLocations(),
                    Api.fetchVehiclesForDate(state.currentDate),
                    Api.fetchAlerts()
                ]);

                state.locations = locations;
                state.vehicles = vehicles;
                state.alerts = alerts;

                if (state.isOnline) this.saveStateToLocalStorage();
            } catch (error) {
                UI.showToast(error.message, 'error');
                if (!state.isOnline) console.log("Offline: Using local data.");
                else { state.vehicles = []; state.alerts = {}; }
            } finally {
                state.isLoading = false;
                UI.renderApp();
            }
        },

        async resetFormAndFetchData() {
            dom.searchTermInput.value = '';
            dom.searchTermInput.dispatchEvent(new Event('input', { bubbles: true }));
            await this.fetchData(true);
        },

        handleConnectionChange(isOnline) {
            state.isOnline = isOnline;
            UI.renderOnlineStatus();
            if (isOnline) {
                UI.showToast('Đã kết nối mạng trở lại.', 'success');
                Api.processSyncQueue();
            } else {
                UI.showToast('Mất kết nối mạng. Chuyển sang chế độ ngoại tuyến.', 'error');
            }
        },

        saveStateToLocalStorage() {
            try {
                const stateToSave = {
                    currentLocation: state.currentLocation,
                    currentDate: state.currentDate.toISOString(),
                    vehicles: state.vehicles,
                    alerts: state.alerts,
                    syncQueue: state.syncQueue,
                };
                localStorage.setItem('appState', JSON.stringify(stateToSave));
            } catch (e) {
                console.error("Error saving state to localStorage", e);
            }
        },

        loadStateFromLocalStorage() {
            try {
                const savedState = localStorage.getItem('appState');
                if (savedState) {
                    const parsedState = JSON.parse(savedState);
                    if (parsedState.currentLocation && parsedState.currentDate) {
                        state.currentLocation = parsedState.currentLocation;
                        state.currentDate = new Date(parsedState.currentDate);
                        state.vehicles = parsedState.vehicles || [];
                        state.alerts = parsedState.alerts || {};
                        state.syncQueue = parsedState.syncQueue || [];
                        return true;
                    }
                }
            } catch (e) {
                console.error("Error loading state from localStorage", e);
                localStorage.removeItem('appState');
            }
            return false;
        },

        async checkStaffSession() {
            const staffInfo = localStorage.getItem('staffInfo');
            if (staffInfo) {
                this.loadStateFromLocalStorage();
                return true;
            }
            return false;
        },

        saveStaffSession(staffData) {
            const sessionData = {
                username: staffData.username,
                fullName: staffData.full_name,
                locationId: staffData.locations?.id || null
            };
            localStorage.setItem('staffInfo', JSON.stringify(sessionData));

            const locationData = Array.isArray(staffData.locations) ? staffData.locations[0] : staffData.locations;
            if (locationData && locationData.id) {
                state.currentLocation = locationData;
            }
        },

        loginSuccess(staffData) {
            App.saveStaffSession(staffData);
            dom.staffLoginScreen.style.opacity = '0';
            setTimeout(() => {
                dom.staffLoginScreen.style.display = 'none';
                App.startApp();
            }, 500);
        },

        setupRealtimeListeners() {
            if (!state.isOnline) {
                console.log("Offline mode: Skipping realtime listener setup.");
                return;
            }

            const mainChannel = db.channel('main-app-db-changes');
            mainChannel
                .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
                    console.log('Realtime: Giao dịch thay đổi. Tải lại dữ liệu...');
                    this.fetchData(true);
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'security_alerts' }, async (payload) => {
                    console.log('Realtime: Cảnh báo an ninh thay đổi.', payload);
                    let alertData = payload.new || payload.old;
                    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                        UI.showGlobalAlertModal(alertData);
                    } else if (payload.eventType === 'DELETE') {
                        UI.showToast(`Cảnh báo cho xe ${alertData.plate} đã được gỡ bỏ.`, 'success');
                    }
                    await this.fetchData(true);
                    if (state.selectedVehicle && alertData && state.selectedVehicle.data.plate === alertData.plate) {
                        UI.renderActionButtons();
                    }
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, async (payload) => {
                    console.log('Realtime: Thông tin bãi đỗ thay đổi.', payload);
                    UI.showToast('Cài đặt bãi đỗ vừa được cập nhật từ quản trị viên.', 'info');

                    await Api.fetchLocations();

                    if (state.currentLocation) {
                        const updatedLocation = state.locations.find(loc => loc.id === state.currentLocation.id);
                        if (updatedLocation) {
                            state.currentLocation = updatedLocation;
                            App.saveStateToLocalStorage();
                        }
                    }
                    UI.renderApp();
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') console.log('✅ Đã kết nối Realtime thành công!');
                });
        },

        applySavedTheme() {
            const savedTheme = localStorage.getItem('theme') || 'light';
            dom.themeCheckbox.checked = savedTheme === 'dark';
            Handlers.handleThemeChange();
        },

        updateClock() {
            if (dom.clockWidget) {
                dom.clockWidget.textContent = new Date().toLocaleTimeString('vi-VN');
            }
        },

        updateLiveDurationsAndFees() {
            document.querySelectorAll('.live-duration').forEach(el => {
                el.textContent = Utils.calculateDuration(el.dataset.starttime);
            });
            document.querySelectorAll('.live-fee').forEach(el => {
                const isVIP = el.dataset.isvip === 'true';
                el.textContent = Utils.formatCurrency(Utils.calculateFee(el.dataset.starttime, null, isVIP)) + 'đ';
            });
        },

        async fetchWeather() {
            if (!state.currentLocation) return;
            const { lat, lng } = state.currentLocation;
            const apiKey = APP_CONFIG.weatherApiKey;
            if (!apiKey || !lat || !lng) return;
            try {
                const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric&lang=vi`);
                const data = await res.json();
                if (dom.weatherWidget) {
                    dom.weatherWidget.innerHTML = `${Math.round(data.main.temp)}°C, ${data.weather[0].description}`;
                }
            } catch (error) {
                console.error("Lỗi tải thời tiết:", error);
            }
        }
    };

    // =========================================================================
    // MODULE 8: MÀN HÌNH CHỜ (IDLE SCREEN)
    // =========================================================================
    const IdleScreenManager = {
        IDLE_TIMEOUT: 60000,

        init() {
            if (APP_CONFIG.adVideos && APP_CONFIG.adVideos.length > 0) {
                dom.adVideoPlayer.addEventListener('ended', this.playNextVideo.bind(this));
                App.resetIdleTimer();
                App.setupGlobalEventListeners();
            }
        },

        activate() {
            if (state.isIdle || state.activeModal) return;
            console.log("Kích hoạt màn hình chờ.");
            state.isIdle = true;
            dom.idleScreen.classList.add('active');
            this.playNextVideo();
        },

        deactivate() {
            if (!state.isIdle) return;
            console.log("Tắt màn hình chờ.");
            state.isIdle = false;
            dom.idleScreen.classList.remove('active');
            dom.adVideoPlayer.pause();
            App.resetIdleTimer();
        },

        playNextVideo() {
            if (!state.isIdle || !APP_CONFIG.adVideos || APP_CONFIG.adVideos.length === 0) return;

            dom.adVideoPlayer.src = APP_CONFIG.adVideos[state.adVideoIndex];
            dom.adVideoPlayer.play().catch(e => console.error("Lỗi phát video quảng cáo:", e));

            state.adVideoIndex = (state.adVideoIndex + 1) % APP_CONFIG.adVideos.length;
        }
    };

    App.resetIdleTimer = () => {
        if (state.isIdle) IdleScreenManager.deactivate();
        clearTimeout(state.idleTimer);
        state.idleTimer = setTimeout(() => IdleScreenManager.activate(), IdleScreenManager.IDLE_TIMEOUT);
    };

    // Bắt đầu ứng dụng!
    App.init();
    IdleScreenManager.init();
});
