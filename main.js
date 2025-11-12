/**
 * =========================================================================
 * HỆ THỐNG QUẢN LÝ XE TÌNH NGUYỆN - PHIÊN BẢN 7.0 (FINAL)
 * Tác giả: Gemini Code Assist
 * Kiến trúc: State-Driven UI, Module-based, Sequential Data Flow.
 * Mục tiêu: Ổn định tuyệt đối, nhất quán dữ liệu, dễ bảo trì.
 * =========================================================================
 */
document.addEventListener('DOMContentLoaded', () => {

    // =========================================================================
    // MODULE 1: STATE & CONFIG - TRÁI TIM CỦA ỨNG DỤNG
    // =========================================================================
    const db = supabase.createClient(
        'https://mtihqbmlbtrgvamxwrkm.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10aWhxYm1sYnRyZ3ZhbXh3cmttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMTkwMDEsImV4cCI6MjA3NzU5NTAwMX0.hR5X8bp-XD2DfxUnvWF-yxVk4sFVW2zBunp5XXnIZ0Y' // Thay bằng Anon Key của bạn
    );

    const dom = {
        // Main Layout
        locationSubtitle: document.getElementById('location-subtitle'),
        changeLocationBtn: document.getElementById('change-location-btn'),
        offlineIndicator: document.getElementById('offline-indicator'),
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
        micBtn: document.getElementById('mic-btn'),
        scanQrBtn: document.getElementById('scan-qr-btn'),
        formNewVehicle: document.getElementById('form-new-vehicle'),
        phoneNumberInput: document.getElementById('phone-number'),
        vehicleNotesInput: document.getElementById('vehicle-notes'), // NÂNG CẤP: Ô nhập ghi chú
        plateSuggestions: document.getElementById('plate-suggestions'),
        isVipCheckbox: document.getElementById('is-vip-checkbox'),
        actionButtonsContainer: document.getElementById('action-buttons-container'),


        // Info Panel
        vehicleInfoPanel: document.getElementById('vehicle-info-panel'),
        selectedVehicleAlert: document.getElementById('selected-vehicle-alert'),
        infoDetailsGrid: document.getElementById('info-details-grid'),
        infoHistoryList: document.getElementById('info-history-list'),

        // Dashboard
        dashboardGrid: document.getElementById('dashboard-grid'),
        statusPieChartCanvas: document.getElementById('status-pie-chart'),

        // Vehicle List
        listTitle: document.getElementById('list-title'),
        filterInput: document.getElementById('filter-input'),
        vehicleListContainer: document.getElementById('vehicle-list-container'),
        paginationControls: document.getElementById('pagination-controls'),

        // Modals & Toasts
        modalContainer: document.getElementById('modal-container'),
        toastContainer: document.getElementById('toast-container'),
        globalAlertStrip: document.getElementById('global-alert-strip'),

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

            const startOfDay = new Date(`${dateStr}T00:00:00Z`).toISOString();
            
            let query = db.from('transactions').select('*');
            if (state.currentLocation?.id) {
                query = query.eq('location_id', state.currentLocation.id);
            }
            query = query.or(`entry_time.gte.${startOfDay},and(entry_time.lt.${startOfDay},status.eq.Đang gửi)`);
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
                // SỬA LỖI TRIỆT ĐỂ: Luôn lấy cả thông tin bãi đỗ xe (`locations`) được liên kết.
                .select('*, locations(*)')
                .eq('username', username)
                .single();

            // SỬA LỖI: Ném ra lỗi để khối try...catch bên ngoài có thể xử lý đúng.
            // Lỗi 'PGRST116' của Supabase có nghĩa là không tìm thấy dòng nào, đây không phải lỗi kết nối.
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

            if (error) {
                throw new Error('Tên đăng nhập hoặc Mã PIN không đúng.');
            }
            return data;
        },

        async checkIn(plate, phone, isVIP, notes, prePayment = null, providedUniqueID = null) {
            if (!state.isOnline) {
                return this.addToSyncQueue('checkIn', { plate, phone, isVIP, notes, prePayment, providedUniqueID });
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
            };
            const { error } = await db.from('transactions').insert([transactionData]);
            if (error) throw new Error(`Lỗi check-in: ${error.message}. Xe [${plate}] có thể đã tồn tại trong bãi.`);
            return transactionData;
        },

        async checkOut(uniqueID, fee, paymentMethod) {
            if (!state.isOnline) {
                return this.addToSyncQueue('checkOut', { uniqueID, fee, paymentMethod });
            }

            const { error } = await db.from('transactions').update({
                exit_time: new Date().toISOString(),
                status: 'Đã rời bãi',
                fee, payment_method: paymentMethod
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
                const { plate, phone, isVIP, notes, prePayment, providedUniqueID } = payload;
                const uniqueID = providedUniqueID || ('_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36));
                const newVehicle = {
                    plate, phone, is_vip: isVIP, notes,
                    unique_id: uniqueID,
                    location_id: state.currentLocation.id,
                    entry_time: timestamp,
                    status: 'Đang gửi',
                    fee: prePayment ? prePayment.fee : null,
                    payment_method: prePayment ? prePayment.method : null,
                    is_offline: true
                };
                state.vehicles.unshift(newVehicle);
                return newVehicle;
            }
            if (action === 'checkOut') {
                const { uniqueID, fee, paymentMethod } = payload;
                const vehicleIndex = state.vehicles.findIndex(v => v.unique_id === uniqueID);
                if (vehicleIndex > -1) {
                    state.vehicles[vehicleIndex].status = 'Đã rời bãi';
                    state.vehicles[vehicleIndex].exit_time = timestamp;
                    state.vehicles[vehicleIndex].fee = fee;
                    state.vehicles[vehicleIndex].payment_method = paymentMethod;
                    state.vehicles[vehicleIndex].is_offline = true;
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
                        await Api.checkIn(item.payload.plate, item.payload.phone, item.payload.isVIP, item.payload.prePayment, item.payload.providedUniqueID);
                    } else if (item.action === 'checkOut') {
                        await Api.checkOut(item.payload.uniqueID, item.payload.fee, item.payload.paymentMethod);
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
            this.renderVehicleInfoPanel();
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
                        // YÊU CẦU: Thêm nút xem lại vé cho xe đang gửi
                        buttonsHtml = Templates.actionButton('check-out', isDisabled ? 'XE ĐANG BỊ CHẶN' : 'Xác nhận Lấy xe', isDisabled);
                        buttonsHtml += Templates.secondaryActionButton('view-ticket', 'Xem lại vé điện tử');
                        break;
                    case 'departed':
                        // YÊU CẦU: Khôi phục nút "In lại biên lai" cho xe đã rời bãi
                        buttonsHtml = Templates.actionButton('reprint-receipt', 'In lại biên lai', false, 'reprint');
                        break;
                    case 'parking_remote':
                        buttonsHtml = ''; // Không hiển thị nút nào
                        break;
                }
            } else {
                buttonsHtml = Templates.actionButton('check-in', 'Xác nhận Gửi xe');
            }
            dom.actionButtonsContainer.innerHTML = alertHtml + buttonsHtml;
        },

        renderVehicleInfoPanel() {
            if (!state.selectedVehicle) {
                dom.vehicleInfoPanel.hidden = true;
                return;
            }
            dom.vehicleInfoPanel.hidden = false;
            const { data, status } = state.selectedVehicle;            
            dom.selectedVehicleAlert.hidden = true;

            let detailsHtml = '';
            if (status === 'parking' || status === 'parking_remote') {
                const isVIP = data.is_vip;
                const fee = Utils.calculateFee(data.entry_time, null, isVIP);

                if (status === 'parking_remote') {
                    const locationName = Utils.getLocationNameById(data.location_id);
                    dom.selectedVehicleAlert.hidden = false;
                    dom.selectedVehicleAlert.className = 'selected-vehicle-alert warning';
                    dom.selectedVehicleAlert.innerHTML = `<strong>LƯU Ý:</strong> Xe đang gửi tại bãi <strong>${locationName}</strong>. Không thể thao tác tại đây.`;
                }

                detailsHtml = `
                    ${Templates.infoItem('Trạng thái', `<span class="status-badge parking">${isVIP ? 'Đang gửi (VIP)' : 'Đang gửi'}</span>`)}
                    ${Templates.infoItem('Giờ vào', Utils.formatDateTime(data.entry_time))}
                    ${Templates.infoItem('Thời gian gửi', `<span class="live-duration" data-starttime="${data.entry_time}">${Utils.calculateDuration(data.entry_time)}</span>`)}
                    ${Templates.infoItem('Phí tạm tính', `<span class="live-fee" data-starttime="${data.entry_time}" data-isvip="${isVIP}">${Utils.formatCurrency(fee)}đ</span>`)}
                    ${Templates.infoItem('SĐT', Utils.formatPhone(data.phone))}
                `;
                // NÂNG CẤP: Hiển thị ghi chú nếu có
                if (data.notes) {
                    detailsHtml += Templates.infoItem('Ghi chú', `<strong style="color: var(--primary-accent);">${data.notes}</strong>`);
                }
            } else if (status === 'departed') {
                detailsHtml = `
                    ${Templates.infoItem('Trạng thái', '<span class="status-badge departed">Đã rời bãi</span>')}
                    ${Templates.infoItem('Giờ vào', Utils.formatDateTime(data.entry_time))}
                    ${Templates.infoItem('Giờ ra', Utils.formatDateTime(data.exit_time))}
                    ${Templates.infoItem('Tổng thời gian', Utils.calculateDuration(data.entry_time, data.exit_time))}
                    ${Templates.infoItem('Phí đã trả', `<strong>${Utils.formatCurrency(data.fee)}đ</strong>`)}
                    ${Templates.infoItem('SĐT', Utils.formatPhone(data.phone))}
                `;
                // NÂNG CẤP: Hiển thị ghi chú nếu có
                if (data.notes) {
                    detailsHtml += Templates.infoItem('Ghi chú', `<strong style="color: var(--primary-accent);">${data.notes}</strong>`);
                }
            }
            detailsHtml += Templates.infoItem('Nhận dạng', Utils.decodePlate(state.selectedPlate));
            dom.infoDetailsGrid.innerHTML = detailsHtml;

            Api.fetchHistory(state.selectedPlate).then(history => {
                if (dom.infoHistoryList) {
                    dom.infoHistoryList.innerHTML = history && history.length > 0
                        ? history.map(Templates.historyItem).join('')
                        : '<li>Chưa có lịch sử.</li>';
                }
            }).catch(err => {
                if (dom.infoHistoryList) dom.infoHistoryList.innerHTML = `<li>Lỗi tải lịch sử.</li>`;
                console.error(err);
            });
        },

        renderDashboard() {
            const parkingVehicles = state.vehicles.filter(v => v.status === 'Đang gửi');
            const totalToday = state.vehicles.length;
            const longestParking = parkingVehicles.length > 0 
                ? parkingVehicles.reduce((a, b) => new Date(a.entry_time) < new Date(b.entry_time) ? a : b)
                : null;
            
            const statItemsHtml = `
                ${Templates.statItemWithChart('Xe hiện tại', parkingVehicles.length, 'current-vehicles-chart')}
                ${Templates.statItem('Tổng lượt trong ngày', totalToday)}
                ${Templates.statItem('Xe gửi lâu nhất', longestParking ? `<span class="live-duration" data-starttime="${longestParking.entry_time}">${Utils.calculateDuration(longestParking.entry_time)}</span>` : '--')}
            `;
            
            dom.dashboardGrid.innerHTML = statItemsHtml;

            const chartCanvas = document.getElementById('current-vehicles-chart');
            const chartData = {
                labels: ['Đang gửi', 'Còn lại'],
                datasets: [{
                    data: [parkingVehicles.length, Math.max(0, (state.currentLocation?.capacity || totalToday) - parkingVehicles.length)],
                    backgroundColor: ['var(--youth-union-blue)', 'var(--border-color)'],
                    borderColor: 'var(--bg-card)',
                    borderWidth: 2,
                    cutout: '70%',
                }]
            };

            if (chartCanvas) {
                if (state.statusPieChart) {
                    state.statusPieChart.destroy();
                }
                
                state.statusPieChart = new Chart(chartCanvas, {
                    type: 'doughnut',
                    data: chartData,
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false, 
                        plugins: { 
                            legend: { display: false },
                            tooltip: { enabled: false }
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
                    // NÂNG CẤP TOÀN DIỆN V2: Giao diện xác nhận gửi xe thành công với hiệu ứng động
                    const vipClass = data.is_vip ? 'is-vip' : ''; // YÊU CẦU: Thêm class nếu là VIP
                    const content = `
                        <div class="checkin-success-wrapper ${vipClass}" id="printable-checkin-receipt">
                            <button class="modal-close-btn success-close-btn" data-action="close-modal" title="Đóng">&times;</button>
                            <div id="checkin-confetti-container"></div>
                            <div class="checkin-success-icon">
                                <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                                    <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
                                    <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                                </svg>
                            </div>
                            <h2 class="checkin-success-title">GỬI XE THÀNH CÔNG</h2>
                            <p class="checkin-success-subtitle">Vui lòng đưa mã QR này khi lấy xe.</p>
                            <div class="checkin-success-qr">
                                ${data.is_vip ? '<div class="vip-badge">VIP</div>' : ''}
                                <!-- SỬA LỖI TRIỆT ĐỂ: Thay thế img bằng canvas để tự tạo QR -->
                                <canvas id="checkin-qrcode-canvas" aria-label="Mã QR của vé xe"></canvas>
                            </div>
                            <div class="checkin-success-plate">${data.plate}</div>
                            <div class="auto-close-progress-bar">
                                <div class="progress"></div>
                            </div>
                        </div>`;
                    // Bỏ footer và title để modal trông như một màn hình xác nhận chuyên dụng
                    modalHtml = `<div class="modal-overlay"><div class="modal-content" style="max-width: 480px; padding: 0; background: transparent; box-shadow: none;">${content}</div></div>`;
                    // SỬA LỖI TRIỆT ĐỂ: Vẽ QR code lên canvas sau khi modal được hiển thị
                    setTimeout(() => {
                        const qrCanvas = document.getElementById('checkin-qrcode-canvas');
                        if (qrCanvas && data.unique_id) {
                            QRCode.toCanvas(qrCanvas, data.unique_id, { width: 220, errorCorrectionLevel: 'H', margin: 1 }, (error) => {
                                if (error) console.error('Lỗi tạo QR code:', error);
                            });
                        }
                    }, 100); // Chờ một chút để DOM được cập nhật
                    break;
                case 'global-alert':
                    modalHtml = data.html;
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
            text.textContent = message;
            confirmationOverlay.classList.add('active');
        },
        
        showGlobalAlertModal(alert) {
            if (!alert || !alert.plate) return;
            const title = 'Cảnh báo an ninh';
            const modalHtml = Templates.globalAlertModal(title, alert.plate, alert.reason, alert.level);
            this.showModal('global-alert', { html: modalHtml });
        },

        // NÂNG CẤP & SỬA LỖI: Chuyển hàm confetti vào UI để dùng chung
        startConfetti(containerId) {
            const container = document.getElementById(containerId);
            if (!container) return;

            // Logic bắn pháo giấy (confetti)
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
        // NÂNG CẤP: Template cho nút bấm "biến đổi"
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
        // YÊU CẦU: Template cho nút hành động phụ
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
        
        historyItem: (entry) => {
            return `<li><div class="history-item"><div><div>Vào: ${Utils.formatDateTime(entry.entry_time)}</div><div>Ra: ${Utils.formatDateTime(entry.exit_time)}</div><div><strong>Thời gian: ${Utils.calculateDuration(entry.entry_time, entry.exit_time)}</strong></div></div></div></li>`;
        },
        statItem: (label, value) => `<div class="stat-item"><div class="label">${label}</div><div class="value">${value}</div></div>`,
        statItemWithChart: (label, value, canvasId) => `<div class="stat-item"><div class="label">${label}</div><div class="value">${value}</div><div class="stat-item-chart-wrapper"><canvas id="${canvasId}"></canvas></div></div>`,
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
        skeletonItem: () => `<div class="skeleton-item"></div>`, // Giữ nguyên
        emptyState: (text) => `<div class="empty-state">${text}</div>`, // Giữ nguyên
        
        modal(title, content, footer, maxWidth = '500px') {
            const style = window.innerWidth > 600 ? `style="max-width: ${maxWidth};"` : '';
            return `<div class="modal-overlay"><div class="modal-content" ${style}><div class="modal-header"><h2>${title}</h2><button class="modal-close-btn" data-action="close-modal">&times;</button></div><div class="modal-body">${content}</div><div class="modal-footer">${footer}</div></div></div>`;
        },

        locationModal(locations) {
            const locationItems = locations.map((loc, index) => {
                const isRecommended = index === 0 && loc.distance > -1 && loc.distance < 1;
                return `<div class="location-card ${isRecommended ? 'recommended' : ''}" data-action="select-location" data-location-id="${loc.id}">${isRecommended ? '<div class="recommended-badge">Gần nhất</div>' : ''}<div class="location-card-header"><h3>${loc.name}</h3>${loc.distance > -1 ? `<span class="distance-tag">~${(loc.distance * 1000).toFixed(0)}m</span>` : ''}</div><div class="location-card-body"><div class="location-detail"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg><span>${loc.address || 'Chưa có địa chỉ'}</span></div><div class="location-detail"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg><span>${loc.operating_hours || 'Hoạt động 24/7'}</span></div></div></div>`}).join('');
            const title = locations.some(l => l.distance > -1) ? 'Gợi ý Bãi đỗ xe gần bạn' : 'Vui lòng chọn Bãi đỗ xe';
            const content = `<p class="modal-subtitle">Hệ thống đã tự động sắp xếp các bãi xe theo thứ tự từ gần đến xa để bạn tiện lựa chọn.</p><div class="location-card-list">${locationItems}</div>`;
            return this.modal(title, content, '<button class="action-button btn--secondary" data-action="close-modal">Đóng</button>', '600px');
        },

        globalAlertModal(title, plate, reason, level) {
            const content = `
                <div class="global-alert-wrapper">
                    <div class="global-alert-plate-box alert-bg-${level}"><div class="global-alert-plate">${plate}</div></div>
                    <p class="global-alert-reason">${reason || 'Không có lý do cụ thể.'}</p>
                </div>`;
            return this.modal(title, content, '<button class="action-button btn--secondary" data-action="close-modal">Đã hiểu</button>', '450px');
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

        // NÂNG CẤP TOÀN DIỆN: Thiết kế lại modal xác nhận miễn phí/VIP
        confirmationModal({ title, plate, reason, type }) {
            const isVip = type === 'vip'; // 'vip' hoặc 'free'
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
        printElement: (element, documentTitle) => {
            const printable = document.createElement('div');
            printable.id = 'printable-area';
            printable.innerHTML = element.innerHTML;
            document.body.appendChild(printable);
            const originalTitle = document.title;
            document.title = documentTitle;
            window.print();
            document.body.removeChild(printable);
            document.title = originalTitle;
        }
    };

    // =========================================================================
    // MODULE 5.5: UTILITIES NÂNG CAO (CHO BIÊN LAI)
    // =========================================================================
    const AdvancedUtils = {
        calculateFeeWithBreakdown: (startTime, endTime, isVIP) => {
            if (isVIP || !startTime) return { dayHours: 0, nightHours: 0 };
            const config = APP_CONFIG.fee;
            const start = new Date(startTime);
            const end = endTime ? new Date(endTime) : new Date();
            const diffMinutes = Math.floor((end - start) / (1000 * 60));
            if (diffMinutes <= config.freeMinutes) return { dayHours: 0, nightHours: 0 };
            let dayHours = 0, nightHours = 0;
            let chargeableStartTime = new Date(start.getTime() + config.freeMinutes * 60 * 1000);
            const totalChargeableHours = Math.ceil((diffMinutes - config.freeMinutes) / 60);
            for (let i = 0; i < totalChargeableHours; i++) {
                let currentBlockStartHour = new Date(chargeableStartTime.getTime() + i * 60 * 60 * 1000).getHours();
                (currentBlockStartHour >= config.nightStartHour || currentBlockStartHour < config.nightEndHour) ? nightHours++ : dayHours++;
            }
            return { dayHours, nightHours };
        },
        numberToWords: (num) => {
            const units = ["", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"], teens = ["mười", "mười một", "mười hai", "mười ba", "mười bốn", "mười lăm", "mười sáu", "mười bảy", "mười tám", "mười chín"], tens = ["", "mười", "hai mươi", "ba mươi", "bốn mươi", "năm mươi", "sáu mươi", "bảy mươi", "tám mươi", "chín mươi"], thousands = ["", "nghìn", "triệu", "tỷ"];
            if (num === 0) return 'Không'; let word = '', i = 0;
            while (num > 0) {
                let chunk = num % 1000;
                if (chunk > 0) {
                    let chunkWord = ''; const hundred = Math.floor(chunk / 100), remainder = chunk % 100;
                    if (hundred > 0) chunkWord += units[hundred] + ' trăm';
                    if (remainder > 0) {
                        if (hundred > 0) chunkWord += ' ';
                        if (remainder < 10) { if (hundred > 0) chunkWord += 'linh '; chunkWord += units[remainder]; }
                        else if (remainder < 20) { chunkWord += teens[remainder - 10]; }
                        else { const ten = Math.floor(remainder / 10), one = remainder % 10; chunkWord += tens[ten]; if (one > 0) { chunkWord += (one === 1 && ten > 1) ? ' mốt' : ' ' + units[one]; } }
                    }
                    if (thousands[i]) word = chunkWord + ' ' + thousands[i] + ' ' + word; else word = chunkWord + ' ' + word;
                }
                num = Math.floor(num / 1000); i++;
            }
            let finalWord = word.trim(); return finalWord.charAt(0).toUpperCase() + finalWord.slice(1);
        }
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
                    // SỬA LỖI TRIỆT ĐỂ: Kiểm tra xem nhân viên có được gán bãi đỗ không trước khi truy cập.
                    const locationName = (staffInfo.locations && typeof staffInfo.locations === 'object' && staffInfo.locations.name)
                        ? staffInfo.locations.name
                        : '<span style="color: var(--danger-color);">Chưa được phân công</span>';

                    dom.staffInfoDisplay.innerHTML = `
                        <p class="staff-name">Chào, ${staffInfo.full_name}!</p>
                        <p class="staff-location">Bạn được phân công tại: <strong>${locationName}</strong></p>
                    `;

                    // NÂNG CẤP: Kiểm tra và hiển thị nút sinh trắc học
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

        // NÂNG CẤP: Xử lý đăng nhập bằng sinh trắc học
        async handleBiometricLogin() {
            const username = dom.staffUsernameInput.value.trim();
            if (!username) return;

            dom.biometricLoginBtn.disabled = true;
            dom.biometricLoginBtn.textContent = 'Đang chờ xác thực...';

            try {
                // SỬA LỖI: Dùng lại hàm getStaffInfoByUsername đã được đồng bộ
                const staffData = await Api.getStaffInfoByUsername(username);

                // SỬA LỖI TRIỆT ĐỂ: Xử lý trường hợp không tìm thấy người dùng khi bấm nút.
                if (!staffData || !staffData.webauthn_credential_id) {
                    throw new Error("Tài khoản này chưa đăng ký sinh trắc học.");
                }
                
                const options = {
                    challenge: 'đoạn-mã-ngẫu-nhiên-từ-server', // Trong thực tế, đây phải là một chuỗi ngẫu nhiên từ server
                    allowCredentials: [{
                        id: simpleWebAuthnBrowser.base64url.decode(staffData.webauthn_credential_id),
                        type: 'public-key',
                    }],
                    userVerification: 'required',
                };

                const assertion = await simpleWebAuthnBrowser.startAuthentication(options);
                
                // Tại đây, bạn sẽ gửi `assertion` về server để xác thực.
                // Vì chúng ta không có server, ta sẽ giả định xác thực thành công và đăng nhập luôn.
                App.loginSuccess(staffData);

            } catch (error) {
                // SỬA LỖI TRIỆT ĐỂ: Xử lý tất cả các loại lỗi từ thư viện WebAuthn.
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
                UI.renderVehicleInfoPanel();
                UI.renderSuggestions('');
                return;
            }
            
            // NÂNG CẤP: Tìm kiếm đồng thời bằng biển số xe HOẶC số điện thoại.
            const foundParking = state.vehicles.find(v => 
                v.status === 'Đang gửi' && (v.plate === cleanedPlate || (v.phone && v.phone === searchTerm))
            );

            if (foundParking) {
                state.selectedVehicle = { data: foundParking, status: 'parking' }; // Cập nhật trạng thái xe tìm thấy
                const alert = state.alerts[foundParking.plate]; // Lấy cảnh báo theo biển số của xe tìm được
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
            UI.renderVehicleInfoPanel();
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
            }
        },

        async handleActionClick(e) {
            const button = e.target.closest('[data-action]');
            if (!button) return;

            const action = button.dataset.action;
            if (!['check-in', 'check-out', 'view-ticket', 'reprint-receipt'].includes(action)) return;

            if (state.isProcessing) return;
            
            state.isProcessing = true;
            button.disabled = true;
            button.innerHTML = '<span>Đang xử lý...</span>';
            
            try {
                switch (action) {
                    case 'check-in': await this.processCheckIn(); break;
                    case 'check-out': await this.processCheckOut(); break;
                    case 'view-ticket': // YÊU CẦU: Xử lý xem lại vé
                        this.processViewTicket();
                        break;
                    case 'reprint-receipt':
                        this.processReprintReceipt();
                        break;
                }
            } catch (error) {
                UI.showToast(error.message, 'error');
            } finally {
                // SỬA LỖI: Luôn reset trạng thái xử lý và vẽ lại nút bấm sau mỗi thao tác,
                // bất kể thành công hay thất bại, để tránh nút bị kẹt ở trạng thái "Đang xử lý...".
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

            // NÂNG CẤP: Kiểm tra xem xe đã tồn tại trong bãi chưa TRƯỚC KHI gửi đi.
            const isAlreadyParking = state.vehicles.some(v => v.plate === plate && v.status === 'Đang gửi');
            if (isAlreadyParking) {
                // Nếu xe đã tồn tại, hiển thị cảnh báo rõ ràng và dừng lại.
                throw new Error(`Xe ${plate} đã có trong bãi. Vui lòng kiểm tra lại.`);
            }

            const phone = dom.phoneNumberInput.value.trim();
            const isVIP = dom.isVipCheckbox.checked;
            const notes = dom.vehicleNotesInput.value.trim(); // NÂNG CẤP: Lấy ghi chú

            const feeCollectionPolicy = state.currentLocation?.fee_collection_policy || 'post_paid';
            const feePolicyType = state.currentLocation?.fee_policy_type || 'free';

            let newTransaction;

            if (feePolicyType === 'free' || (feeCollectionPolicy === 'pre_paid' && Utils.calculateFee(new Date(), null, isVIP) === 0)) {
                const reason = isVIP ? 'Khách VIP' : 'Miễn phí';
                newTransaction = await Api.checkIn(plate, phone, isVIP, notes, { fee: 0, method: reason });
            } else if (feeCollectionPolicy === 'pre_paid') {
                const calculatedFee = Utils.calculateFee(new Date(), null, isVIP);
                const uniqueID = '_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
                const paymentResult = await this.getPaymentResult(calculatedFee, { plate, entry_time: new Date().toISOString(), unique_id: uniqueID });
                if (!paymentResult) throw new Error('Đã hủy thao tác gửi xe.');
                newTransaction = await Api.checkIn(plate, phone, isVIP, notes, paymentResult, uniqueID);
            } else { // post_paid
                newTransaction = await Api.checkIn(plate, phone, isVIP, notes);
            }

            // SỬA LỖI: Hiển thị modal vé xe điện tử thay vì chỉ hiện toast.
            UI.showModal('checkInReceipt', newTransaction); // Hiển thị modal mới
            UI.startConfetti('checkin-confetti-container'); // Bắn pháo giấy
            await App.resetFormAndFetchData(); // Reset form ngay lập tức
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
            Api.addToSyncQueue('checkOut', { uniqueID: vehicle.unique_id, fee, paymentMethod });
            UI.showToast(`Đã ghi nhận lấy xe (offline) cho ${vehicle.plate}.`, 'success');
            await App.resetFormAndFetchData();
        },

        async processCheckOut() {
            const vehicle = state.selectedVehicle?.data;
            if (!vehicle) throw new Error('Không có thông tin xe để lấy ra.');

            const alert = state.alerts[vehicle.plate];
            if (alert?.level === 'block') throw new Error(`XE BỊ CHẶN: ${alert.reason}`);

            if (vehicle.fee !== null && vehicle.payment_method) {
                if (!state.isOnline) return this.processOfflineCheckOut(vehicle, 0, 'Đã thanh toán trước');
                UI.showModal('confirmation', { title: 'Xác nhận cho xe ra', plate: vehicle.plate, reason: 'Đã thanh toán trước', type: 'free' });
                return;
            }

            const isVIP = vehicle.is_vip;
            const fee = Utils.calculateFee(vehicle.entry_time, null, isVIP);

            if (fee > 0) {
                if (!state.isOnline) throw new Error("Không thể xử lý thanh toán khi đang offline.");
                const paymentResult = await this.getPaymentResult(fee, vehicle);
                if (!paymentResult) throw new Error('Đã hủy thanh toán.');
                await this.processPayment(paymentResult.method);
            } else {
                const reason = isVIP ? 'Khách VIP' : 'Miễn phí';
                if (!state.isOnline) return this.processOfflineCheckOut(vehicle, 0, reason);
                UI.showModal('confirmation', { title: 'Xác nhận Miễn phí', plate: vehicle.plate, reason, type: isVIP ? 'vip' : 'free' });
            }
        },

        // YÊU CẦU: Hàm xử lý xem lại vé
        processViewTicket() {
            const vehicle = state.selectedVehicle?.data;
            if (!vehicle) {
                throw new Error('Không có thông tin xe để xem vé.');
            }
            UI.showModal('checkInReceipt', vehicle);
        },

        // YÊU CẦU: Hàm xử lý in lại biên lai
        processReprintReceipt() {
            const vehicle = state.selectedVehicle?.data;
            if (!vehicle || vehicle.status !== 'Đã rời bãi') {
                throw new Error('Chức năng này chỉ dành cho xe đã rời bãi.');
            }
            // YÊU CẦU: Điều hướng sang trang tra cứu công khai (lookup.html) với biển số xe
            const url = `lookup.html?plate=${encodeURIComponent(vehicle.plate)}`;
            window.open(url, '_blank');
            state.isProcessing = false; // Cho phép thao tác tiếp
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

            // TÁI CẤU TRÚC: Sử dụng switch-case để quản lý các action trong modal tốt hơn
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

        // NÂNG CẤP: Hàm hiển thị hiệu ứng thành công và bắn pháo giấy
        showConfirmationSuccess() {
            const successOverlay = document.querySelector('.priority-pass-new__success-overlay');
            if (!successOverlay) return;

            successOverlay.classList.add('active');
            UI.startConfetti('confetti-container'); // Gọi hàm đã chuyển vào UI
        },

        async processConfirmation() {
            const vehicle = state.selectedVehicle?.data;
            if (!vehicle) return;
            const reason = vehicle.is_vip ? 'Khách VIP' : 'Miễn phí';
            this.showConfirmationSuccess(); // Hiển thị hiệu ứng
            await Api.checkOut(vehicle.unique_id, 0, reason);
            setTimeout(() => {
                UI.closeModal();
                App.resetFormAndFetchData();
            }, 2000); // Đợi 2 giây rồi mới đóng modal và reset
        },

        async processPayment(paymentMethod) {
            const vehicle = state.selectedVehicle?.data;
            const fee = Utils.calculateFee(vehicle.entry_time, null, vehicle.is_vip);
            try {
                await Api.checkOut(vehicle.unique_id, fee, paymentMethod);
                UI.showPaymentConfirmation('success', 'Thanh toán thành công!');
                setTimeout(() => {
                    UI.closeModal(); // Đóng modal thanh toán
                    App.resetFormAndFetchData(); // Reset form thay vì hiển thị biên lai
                }, 1500);
            } catch (error) {
                UI.showToast(`Lỗi checkout: ${error.message}`, 'error');
            } finally {
                // Việc reset form và fetch data sẽ được thực hiện sau khi biên lai được hiển thị
            }
        },

        // NÂNG CẤP: Hàm hiển thị biên lai chuyên dụng, nhất quán
        showReceipt(vehicle, fee, paymentMethod) { // Vô hiệu hóa hàm này
            console.log("Chức năng hiển thị biên lai đã được tắt.");
            App.resetFormAndFetchData(); // Chỉ reset form
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
                    this.processQrCheckout(code.data).then(vehiclePlate => {
                        if (vehiclePlate) {
                            const feedbackOverlay = document.querySelector('.scanner-feedback-overlay');
                            const feedbackPlate = document.querySelector('.feedback-plate');
                            if (feedbackOverlay && feedbackPlate) {
                                feedbackPlate.textContent = vehiclePlate;
                                feedbackOverlay.classList.add('active');
                            }
                        }
                        setTimeout(() => {
                            const feedbackOverlay = document.querySelector('.scanner-feedback-overlay');
                            if (feedbackOverlay) feedbackOverlay.classList.remove('active');
                            if (state.activeModal === 'qr-scanner') {
                                state.scanAnimation = requestAnimationFrame(() => this.tickQrScanner());
                            }
                        }, 2000);
                    });
                    return;
                }
            }
            if (state.activeModal === 'qr-scanner') {
                state.scanAnimation = requestAnimationFrame(() => this.tickQrScanner());
            }
        },

        async processQrCheckout(uniqueID) {
            if (state.isProcessing) return null;
            state.isProcessing = true;
            
            try {
                const vehicle = state.vehicles.find(v => v.unique_id === uniqueID && v.status === 'Đang gửi');
                if (!vehicle) throw new Error('Mã QR không hợp lệ hoặc xe đã rời bãi.');
        
                const alert = state.alerts[vehicle.plate];
                if (alert?.level === 'block') throw new Error(`XE BỊ CHẶN: ${alert.reason}`);
        
                const fee = Utils.calculateFee(vehicle.entry_time, null, vehicle.is_vip);
        
                if (fee > 0) {
                    if (!state.isOnline) throw new Error("Không thể xử lý thanh toán khi đang offline.");
                    UI.closeModal();
                    const paymentResult = await this.getPaymentResult(fee, vehicle);
                    if (!paymentResult) throw new Error('Đã hủy thanh toán.');
                    await Api.checkOut(vehicle.unique_id, paymentResult.fee, paymentResult.method);
                    UI.showToast(`Thanh toán thành công cho xe ${vehicle.plate}.`, 'success');
                } else {
                    const reason = vehicle.is_vip ? 'Khách VIP' : 'Miễn phí';
                    await Api.checkOut(vehicle.unique_id, 0, reason);
                    UI.showToast(`Đã cho xe ${vehicle.plate} ra (${reason}).`, 'success');
                }
                await App.fetchData(true);
                return vehicle.plate;
            } catch (error) {
                UI.showToast(error.message, 'error');
                return null;
            } finally {
                state.isProcessing = false;
            }
        },
    };
    // =========================================================================
    // NÂNG CẤP TOÀN DIỆN: BỘ XỬ LÝ OCR THÔNG MINH
    // =========================================================================
    
    /**
     * Tạo biểu đồ độ sáng (histogram) cho ảnh xám.
     * @param {Uint8ClampedArray} grayscaleData - Dữ liệu pixel của ảnh xám.
     * @returns {Int32Array} Mảng 256 phần tử chứa tần suất của mỗi mức độ xám.
     */
    Handlers.createGrayscaleHistogram = function(grayscaleData) {
        const histogram = new Int32Array(256).fill(0);
        for (let i = 0; i < grayscaleData.length; i++) {
            histogram[grayscaleData[i]]++;
        }
        return histogram;
    };

    /**
     * Tìm ngưỡng nhị phân hóa tối ưu bằng thuật toán Otsu.
     * @param {Int32Array} histogram - Biểu đồ độ sáng của ảnh.
     * @param {number} totalPixels - Tổng số pixel trong ảnh.
     * @returns {number} Ngưỡng tối ưu (0-255).
     */
    Handlers.getOtsuThreshold = function(histogram, totalPixels) {
        let sum = 0;
        for (let i = 0; i < 256; i++) {
            sum += i * histogram[i];
        }

        let sumB = 0;
        let wB = 0; // weight background
        let wF = 0; // weight foreground
        let maxVariance = 0;
        let threshold = 0;

        for (let i = 0; i < 256; i++) {
            wB += histogram[i];
            if (wB === 0) continue;

            wF = totalPixels - wB;
            if (wF === 0) break;

            sumB += i * histogram[i];

            const meanB = sumB / wB;
            const meanF = (sum - sumB) / wF;

            // Tính phương sai giữa các lớp (between-class variance)
            const varianceBetween = wB * wF * (meanB - meanF) ** 2;

            if (varianceBetween > maxVariance) {
                maxVariance = varianceBetween;
                threshold = i;
            }
        }
        return threshold;
    };

    // =========================================================================
    // MODULE 7: APP INITIALIZATION - KHỞI TẠO ỨNG DỤNG
    // =========================================================================
    const App = {
        init() {
            dom.micBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
            dom.scanQrBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`;

            this.setupEventListeners();
            this.applySavedTheme();
            this.updateClock();
            setInterval(this.updateClock, 1000);
            setInterval(this.updateLiveDurationsAndFees, 30000);
            this.setupLoginListeners();
            window.addEventListener('online', () => this.handleConnectionChange(true));
            window.addEventListener('offline', () => this.handleConnectionChange(false));
            setInterval(() => Api.processSyncQueue(), 15000);
            
            this.checkStaffSession().then(isLoggedIn => {
                if (isLoggedIn) {
                    if (dom.staffLoginScreen) dom.staffLoginScreen.style.display = 'none';
                    this.startApp();
                } else {
                    if (dom.staffLoginScreen) dom.staffLoginScreen.style.display = 'flex';
                }
            }).catch(err => UI.showToast(err.message, 'error'));
        },

        setupEventListeners() {
            dom.datePicker.addEventListener('change', Handlers.handleDateChange);
            dom.filterInput.addEventListener('input', Handlers.handleFilterChange);
            dom.searchTermInput.addEventListener('input', (e) => Handlers.handleSearchTermChange(e));
            dom.themeCheckbox.addEventListener('change', Handlers.handleThemeChange);
            dom.micBtn.addEventListener('click', Handlers.startVoiceRecognition);
            dom.scanQrBtn.addEventListener('click', () => Handlers.openQrScanner());
            dom.changeLocationBtn.addEventListener('click', () => this.determineLocation(true));
            
            // NÂNG CẤP: Tự động điền ghi chú cho xe VIP
            dom.isVipCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    dom.vehicleNotesInput.value = 'Khách VIP';
                } else if (dom.vehicleNotesInput.value === 'Khách VIP') {
                    dom.vehicleNotesInput.value = '';
                }
            });

            // SỬA LỖI: Di chuyển listener lên form để bắt được cả sự kiện của nút phụ "Xem lại vé"
            dom.formNewVehicle.addEventListener('click', (e) => Handlers.handleActionClick(e));

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
            dom.modalContainer.addEventListener('click', (e) => Handlers.handleModalClick(e));
            // NÂNG CẤP: Gắn sự kiện cho nút đăng xuất
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
            // NÂNG CẤP: Gắn sự kiện cho nút đăng nhập sinh trắc học
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

        startApp() {
            Api.fetchLocations().then(() => {
                UI.renderUserProfile();
                UI.renderApp();
                this.fetchWeather();
                this.fetchData();
                this.setupRealtimeListeners();
            });
        },

        async fetchData(isSilent = false) {
            if (!isSilent) state.isLoading = true;
            UI.renderVehicleList();

            try {
                const [vehicles, alerts] = await Promise.all([
                    Api.fetchVehiclesForDate(state.currentDate),
                    Api.fetchAlerts()
                ]);
                state.vehicles = vehicles;
                state.alerts = alerts;
                if (state.isOnline) this.saveStateToLocalStorage();
            } catch (error) {
                UI.showToast(error.message, 'error');
                if (!state.isOnline) {
                    console.log("Offline: Using local data.");
                } else {
                    state.vehicles = [];
                    state.alerts = {};
                }
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
            }
            return false;
        },
        
        async checkStaffSession() {
            const staffInfo = localStorage.getItem('staffInfo');
            if (staffInfo) { // Nếu có thông tin đăng nhập
                // SỬA LỖI: Không ghi đè state.currentLocation ở đây.
                // Chỉ xác nhận là đã đăng nhập. Việc tải thông tin location sẽ do luồng chính xử lý.
                // Thử tải trạng thái ứng dụng đầy đủ (bao gồm location mới nhất nếu có)
                if (this.loadStateFromLocalStorage()) {
                    return true;
                }
                return true; // Vẫn trả về true để biết là đã đăng nhập.
            }
            return false;
        },

        saveStaffSession(staffData) {
            const sessionData = {
                username: staffData.username,
                fullName: staffData.full_name,
                // SỬA LỖI TRIỆT ĐỂ: Đảm bảo location luôn là một object, không phải array.
                // Dữ liệu trả về từ Supabase có thể là object hoặc array tùy theo truy vấn.
                location: Array.isArray(staffData.locations) ? staffData.locations[0] : staffData.locations
            };
            localStorage.setItem('staffInfo', JSON.stringify(sessionData));
            // Đồng bộ state hiện tại của ứng dụng với location đã được chuẩn hóa.
            state.currentLocation = sessionData.location;
        },

        // NÂNG CẤP: Hàm xử lý khi đăng nhập thành công (dùng chung)
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
                        UI.renderVehicleInfoPanel();
                    }
                })
                // NÂNG CẤP: Lắng nghe thay đổi trên bảng 'locations'
                .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, async (payload) => {
                    console.log('Realtime: Thông tin bãi đỗ thay đổi.', payload);
                    UI.showToast('Cài đặt bãi đỗ vừa được cập nhật từ quản trị viên.', 'info');

                    // Tải lại danh sách tất cả các bãi đỗ
                    await Api.fetchLocations();

                    // Cập nhật thông tin cho bãi đỗ hiện tại
                    if (state.currentLocation) {
                        const updatedLocation = state.locations.find(loc => loc.id === state.currentLocation.id);
                        if (updatedLocation) {
                             // SỬA LỖI: Cập nhật cả state và APP_CONFIG để đảm bảo tính phí đúng
                            state.currentLocation = updatedLocation;
                            APP_CONFIG.fee.dayRate = updatedLocation.fee_hourly_day || APP_CONFIG.fee.dayRate;
                            APP_CONFIG.fee.nightRate = updatedLocation.fee_hourly_night || APP_CONFIG.fee.nightRate;
                            APP_CONFIG.fee.entryFee = updatedLocation.fee_per_entry || APP_CONFIG.fee.entryFee;
                            APP_CONFIG.fee.dailyFee = updatedLocation.fee_daily || APP_CONFIG.fee.dailyFee;

                            // SỬA LỖI TRIỆT ĐỂ: Lưu trạng thái mới nhất vào localStorage
                            App.saveStateToLocalStorage();
                        }
                    }
                    UI.renderApp(); // Vẽ lại toàn bộ App để đảm bảo tính nhất quán
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
            dom.clockWidget.textContent = new Date().toLocaleTimeString('vi-VN');
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
            const apiKey = APP_CONFIG.weather?.apiKey;
            if (!apiKey || !lat || !lng) return;
            try {
                const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric&lang=vi`);
                const data = await res.json();
                dom.weatherWidget.innerHTML = `${Math.round(data.main.temp)}°C, ${data.weather[0].description}`;
            } catch (error) {
                console.error("Lỗi tải thời tiết:", error);
            }
        }
    };

    // =========================================================================
    // MODULE 8: MÀN HÌNH CHỜ (IDLE SCREEN) - TÍNH NĂNG MỚI
    // =========================================================================
    const IdleScreenManager = {
        IDLE_TIMEOUT: 60000, // 60 giây không hoạt động

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

    // Let's go!
    App.init();
    IdleScreenManager.init();
});
