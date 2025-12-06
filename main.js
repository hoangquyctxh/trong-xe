/**
 * =========================================================================
 * HỆ THỐNG QUẢN LÝ XE TÌNH NGUYỆN - PHIÊN BẢN 8.0 (STABLE REWRITE)
 * Tác giả: Gemini Code Assist
 * Kiến trúc: State-Driven UI, Module-based, Sequential Data Flow.
 * Mục tiêu: Ổn định tuyệt đối, nhất quán dữ liệu, dễ bảo trì, tối ưu trải nghiệm.
 * =========================================================================
 */

// =========================================================================
// MODULE 1: STATE & CONFIG - TRÁI TIM CỦA ỨNG DỤNG
// =========================================================================

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
    plateSuggestions: document.getElementById('plate-suggestions'),
    actionButtonsContainer: document.getElementById('action-buttons-container'),
    actionHubDetails: document.getElementById('action-hub-details'),
    // CÁC THÀNH PHẦN MỚI ĐƯỢC THÊM VÀO
    checkinFormDetails: document.getElementById('checkin-form-details'),
    phoneInput: document.getElementById('phone-input'),
    notesInput: document.getElementById('notes-input'),
    vehicleInfoDisplay: document.getElementById('vehicle-info-display'),
    infoDisplaySection: document.getElementById('info-display-section'),
    vehicleHistoryList: document.getElementById('vehicle-history-list'),
    isVipCheckbox: document.getElementById('is-vip-checkbox'),
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
    actionColumn: document.getElementById('action-column'), // NÂNG CẤP
    ticketViewContainer: document.getElementById('ticket-view-container'), // NÂNG CẤP
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
    vehicleMap: new Map(), // CẢI TIẾN: Map để tra cứu xe tức thì
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
    realtimeChannel: null,
    isOnline: navigator.onLine,
    syncQueue: [],
    serverTimeOffset: 0, // NEW: Offset thời gian với server chuẩn
};
let filterDebounceTimer; // BIẾN CHO DEBOUNCE LỌC DANH SÁCH
let globalSearchDebounceTimer; // BIẾN CHO DEBOUNCE

// CỜ ĐỂ TRÁNH GỌI NHIỀU LẦN FETCH SONG SONG TRONG NỀN
let isBackgroundRefreshing = false;

// =========================================================================
// MODULE 2: API SERVICES - GIAO TIẾP VỚI SUPABASE
// =========================================================================
const Api = {
    async fetchVehiclesForDate(date) {
        // SỬA: Sử dụng múi giờ địa phương để tạo query chính xác
        const offset = date.getTimezoneOffset() * 60000;
        const localDate = new Date(date.getTime() - offset);
        const dateStr = localDate.toISOString().slice(0, 10);

        // Query vẫn cần UTC cho range tìm kiếm trong DB (giả sử DB lưu UTC)
        // Nhưng nếu người dùng chọn ngày X theo giờ Việt Nam, ta cần tìm các khoảng thời gian tương ứng
        // Cách đơn giản nhất: Tạo start/end timestamp dựa trên ngày đã chọn ở local time
        const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

        const startOfDayUTC = startOfDay.toISOString();
        const endOfDayUTC = endOfDay.toISOString();

        let query = db.from('transactions').select('*');
        if (state.currentLocation?.id) {
            query = query.eq('location_id', state.currentLocation.id);
        }
        query = query.or(`status.eq.Đang gửi,and(status.eq.Đã rời bãi,exit_time.gte.${startOfDayUTC},exit_time.lt.${endOfDayUTC})`);
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
        const { data, error } = await db.from('transactions')
            .select('*')
            .eq('plate', plate)
            .order('entry_time', { ascending: false })
            .limit(5);
        if (error) throw new Error(`Lỗi tải lịch sử: ${error.message}`);
        return data || [];
    },

    // NEW: Lấy thông tin mới nhất của xe (bất kể thời gian) để điền tự động
    // CẢI TIẾN: Chỉ lấy bản ghi CÓ số điện thoại
    async fetchLatestVehicleInfo(plate) {
        // Tìm bản ghi gần nhất có số điện thoại khác null và khác rỗng
        const { data, error } = await db.from('transactions')
            .select('phone, is_vip, notes')
            .eq('plate', plate)
            .neq('phone', null)
            .neq('phone', '')
            .order('entry_time', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error("Lỗi lấy thông tin xe cũ:", error);
            return null;
        }

        // Nếu không tìm thấy bản ghi có SĐT, thử tìm bản ghi VIP
        if (!data) {
            const { data: vipData } = await db.from('transactions')
                .select('phone, is_vip, notes')
                .eq('plate', plate)
                .eq('is_vip', true)
                .limit(1)
                .maybeSingle();
            return vipData;
        }
        return data;
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
        const entryTime = Utils.getSyncedTime(); // SỬA LỖI: Dùng giờ chuẩn
        const transactionData = {
            plate, phone, is_vip: isVIP, notes,
            unique_id: uniqueID,
            location_id: state.currentLocation.id,
            entry_time: entryTime.toISOString(),
            status: 'Đang gửi',
            fee: prePayment ? prePayment.fee : null,
            payment_method: prePayment ? prePayment.method : null,
            // fee_policy_snapshot: prePayment ? prePayment.snapshot : null, // TẠM THỜI VÔ HIỆU HÓA
            staff_username: staffUsername,
        };
        const { error } = await db.from('transactions').insert([transactionData]);
        if (error) throw new Error(`Lỗi check-in: ${error.message}. Xe [${plate}] có thể đã tồn tại trong bãi.`);
        // THÔNG BÁO cho admin & client khác biết có giao dịch mới
        UI.notifyDataChangedFromIndex('transaction_created', { unique_id: uniqueID, plate });
        return transactionData;
    },

    async checkOut(uniqueID, fee, paymentMethod, staffUsername = 'system') {
        if (!state.isOnline) {
            return this.addToSyncQueue('checkOut', { uniqueID, fee, paymentMethod, staffUsername });
        }

        const { error } = await db.from('transactions').update({
            exit_time: Utils.getSyncedTime().toISOString(), // SỬA LỖI: Dùng giờ chuẩn
            status: 'Đã rời bãi',
            fee, payment_method: paymentMethod,
            staff_username: staffUsername,
        }).eq('unique_id', uniqueID);
        if (error) throw new Error(`Lỗi check-out: ${error.message}. Giao dịch có thể đã được xử lý.`);
        // THÔNG BÁO cho admin & client khác biết giao dịch đã cập nhật
        UI.notifyDataChangedFromIndex('transaction_updated', { unique_id: uniqueID });
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

    /**
     * THÔNG BÁO CHO CÁC CLIENT KHÁC (vd: admin.html) BIẾT DỮ LIỆU ĐÃ THAY ĐỔI.
     * - Dùng chung kênh 'he-thong-trong-xe-realtime' giống admin.js.
     * - Nếu Supabase Realtime chưa bật trên bảng, broadcast này vẫn hoạt động.
     */
    notifyDataChangedFromIndex(event = 'data_changed', payload = {}) {
        try {
            const channel = db.channel('he-thong-trong-xe-realtime', {
                config: { broadcast: { self: false } }
            });
            channel.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('[Index] Broadcasting data_changed →', { event, payload });
                    // Sự kiện tổng quát để admin tự reload
                    channel.send({ type: 'broadcast', event: 'data_changed', payload });
                    // Sự kiện chi tiết (mở rộng trong tương lai nếu cần)
                    if (event && event !== 'data_changed') {
                        channel.send({ type: 'broadcast', event, payload });
                    }
                }
            });
        } catch (e) {
            console.warn('Không thể broadcast data_changed từ index:', e);
        }
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
            try {
                const parsedInfo = JSON.parse(staffInfo);
                dom.userProfileWidget.innerHTML = `
                        <svg class="user-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        <span class="user-name">${parsedInfo.fullName || 'Nhân viên'}</span>
                        <button class="logout-btn" data-action="logout" title="Đăng xuất">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        </button>
                    `;
            } catch (e) {
                // Nếu dữ liệu trong localStorage bị lỗi, hiển thị nút đăng nhập
                this.renderLoginButton();
            }
        } else if (dom.userProfileWidget) {
            this.renderLoginButton();
        }
    },

    renderLoginButton() {
        // THIẾT KẾ LẠI: Nút đăng nhập/quản trị tinh tế hơn
        dom.userProfileWidget.innerHTML = `
                <a href="admin.html" class="admin-login-link">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                    <span>Quản trị</span>
                </a>
            `;
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

    // SỬA LỖI NGHIÊM TRỌNG: Cập nhật cả state và UI khi chế độ thu phí thay đổi
    updateFeeModeDisplay(newPolicy) {
        if (state.currentLocation) {
            state.currentLocation.fee_policy_type = newPolicy.type;
            state.currentLocation.fee_collection_policy = newPolicy.collection;
            // Cập nhật lại toàn bộ header để hiển thị badge mới
            this.renderHeader();
            this.showToast(`Chế độ thu phí đã được cập nhật thành: ${newPolicy.name}`, 'info');
            console.log(`State đã được cập nhật với chế độ mới:`, state.currentLocation);
        }
    },

    renderSuggestions(term) {
        if (!term || term.length < 2) {
            dom.plateSuggestions.classList.remove('visible');
            return;
        }

        // NÂNG CẤP: Lấy cả thông tin xe để kiểm tra VIP
        const suggestions = state.vehicles
            .filter(v => v.plate.toUpperCase().startsWith(term.toUpperCase()))
            // Lấy các xe duy nhất theo biển số, ưu tiên xe đang gửi
            .reduce((acc, v) => {
                if (!acc.has(v.plate) || v.status === 'Đang gửi') {
                    acc.set(v.plate, v);
                }
                return acc;
            }, new Map())
            .values()
            .slice(0, 5);

        dom.plateSuggestions.innerHTML = Array.from(suggestions).map(v => `<div class="suggestion-item" data-plate="${v.plate}">${v.plate} ${v.is_vip ? '<span class="vip-star">⭐</span>' : ''}</div>`).join('');
        dom.plateSuggestions.classList.toggle('visible', suggestions.size > 0 || Array.from(suggestions).length > 0);
    },

    renderActionButtons() {
        // ===================================================================
        // THIẾT KẾ LẠI: Giao diện "Action Hub" - Luôn hiển thị 2 nút chính
        // CẬP NHẬT: Hiển thị Gửi hoặc Lấy xe tùy theo trạng thái
        // ===================================================================
        const plate = dom.searchTermInput.value.trim();
        const isPlateValid = plate.length >= 4;
        const vehicleStatus = state.selectedVehicle?.status;

        // Xác định nút nào sẽ hiển thị
        const showCheckIn = !vehicleStatus || vehicleStatus === 'new' || vehicleStatus === 'departed' || vehicleStatus === 'parking_remote';
        const showCheckOut = vehicleStatus === 'parking';

        // Change: Removed inline styles. Relying on style.css as requested.
        dom.actionButtonsContainer.className = 'action-hub-buttons'; // Ensure class match
        dom.actionButtonsContainer.classList.toggle('show-check-out', showCheckOut);

        if (showCheckOut) {
            dom.actionButtonsContainer.innerHTML = `
                ${Templates.actionButton('check-out', 'Lấy xe', !isPlateValid)}
                ${Templates.actionButton('view-ticket', 'Xem vé', false)}
            `;
        } else {
            dom.actionButtonsContainer.innerHTML = `
                ${Templates.actionButton('check-in', 'Gửi xe', !isPlateValid || !showCheckIn)}
            `;
        }
    },

    /**
     * TÁI CẤU TRÚC TOÀN DIỆN: Hàm này sẽ điều khiển việc ẩn/hiện và điền dữ liệu
     * vào các khu vực đã có sẵn trong index.html, thay vì tạo lại HTML.
     * Điều này giúp loại bỏ hoàn toàn hiện tượng "nháy" giao diện.
     */
    updateMainFormUI() {
        const vehicleStatus = state.selectedVehicle?.status;
        const vehicle = state.selectedVehicle?.data;

        // SỬA LỖI: Kiểm tra xem form gửi xe có đang hiển thị hay không TRƯỚC KHI ẩn nó đi.
        const wasCheckinFormVisible = dom.checkinFormDetails.style.display === 'block';

        // SỬA LỖI: Lưu trạng thái mở/đóng của thẻ thông tin để khôi phục sau khi render lại
        // Điều này ngăn thẻ bị tự động đóng khi auto-refresh chạy.
        const wasInfoExpanded = dom.vehicleInfoDisplay.querySelector('.collapsible-card.expanded') !== null;

        // XÓA CẢNH BÁO CŨ (NẾU CÓ) TRƯỚC KHI RENDER LẠI
        const existingAlert = dom.actionHubDetails.querySelector('.action-alert-box');
        if (existingAlert) existingAlert.remove();

        // HIỂN THỊ CẢNH BÁO MỚI (NẾU CÓ)
        const alert = state.alerts[state.selectedPlate];
        if (alert) dom.actionHubDetails.insertAdjacentHTML('afterbegin', Templates.actionAlertBox(alert.level, state.selectedPlate, alert.reason));

        // Ẩn tất cả các khu vực chi tiết trước khi quyết định hiển thị cái nào
        dom.checkinFormDetails.style.display = 'none';
        dom.vehicleInfoDisplay.style.display = 'none';

        if (vehicleStatus === 'parking' || vehicleStatus === 'departed') {
            // TRƯỜNG HỢP 1: Xe đã có trong bãi hoặc đã rời đi
            // Điền thông tin vào khu vực hiển thị
            dom.infoDisplaySection.innerHTML = Templates.vehicleInfoDisplay(vehicle);

            // Tải lịch sử bất đồng bộ
            dom.vehicleHistoryList.innerHTML = '<li>Đang tải lịch sử...</li>';
            Api.fetchHistory(vehicle.plate).then(history => {
                dom.vehicleHistoryList.innerHTML = history && history.length > 0
                    ? history.map(Templates.historyItem).join('')
                    : '<li>Chưa có lịch sử ra vào.</li>';
            }).catch(err => {
                dom.vehicleHistoryList.innerHTML = `<li>Lỗi tải lịch sử.</li>`;
                console.error(err);
            });

            // Hiển thị khu vực thông tin chi tiết
            dom.vehicleInfoDisplay.style.display = 'block';

            // NÂNG CẤP: Khôi phục trạng thái mở/đóng của thẻ
            const collapsibleCard = dom.vehicleInfoDisplay.querySelector('.collapsible-card');
            if (collapsibleCard) {
                // Nếu trước đó đang mở, hãy mở lại. Ngược lại thì giữ nguyên (đóng).
                if (wasInfoExpanded) {
                    collapsibleCard.classList.add('expanded');
                } else {
                    collapsibleCard.classList.remove('expanded');
                }
            }

            // SỬA LỖI (User Request): Xe đã từng gửi (departed) quay lại thì PHẢI hiện form nhập liệu
            if (vehicleStatus === 'departed') {
                if (!wasCheckinFormVisible) {
                    dom.phoneInput.value = vehicle.phone || '';
                    dom.notesInput.value = '';
                    if (dom.isVipCheckbox) dom.isVipCheckbox.checked = !!vehicle.is_vip;
                }
                dom.checkinFormDetails.style.display = 'block';
            }

        } else if (vehicleStatus === 'parking_remote') {
            // TRƯỜNG HỢP 2: Xe ở bãi khác, hiển thị cảnh báo
            const alertHtml = `<div class="action-alert-box alert-warning" style="margin-top: 1rem;"><div class="action-alert-reason">Xe đang được gửi ở một bãi khác. Không thể thực hiện thao tác tại đây.</div></div>`;
            dom.actionHubDetails.insertAdjacentHTML('afterbegin', alertHtml);

        } else if (vehicleStatus === 'new') {
            // TRƯỜNG HỢP 3: Xe mới, hiển thị form nhập SĐT và Ghi chú

            // SỬA LỖI: Chỉ xóa nội dung form nếu nó không được hiển thị trước đó.
            // Điều này ngăn việc xóa dữ liệu khi người dùng đang nhập hoặc khi có refresh ngầm.
            if (!wasCheckinFormVisible) {
                dom.phoneInput.value = '';
                dom.notesInput.value = '';
                if (dom.isVipCheckbox) dom.isVipCheckbox.checked = false;
            }
            dom.checkinFormDetails.style.display = 'block';
        } else {
            // TRƯỜNG HỢP 4: Không có xe nào được chọn, đảm bảo mọi thứ đều trống
            // Không cần làm gì thêm, các khối con đã được ẩn ở đầu hàm.
        }
    },

    // ===================================================================
    // GIẢI PHÁP TRIỆT ĐỂ CHỐNG "NHÁY": CẬP NHẬT "PHẪU THUẬT" DOM
    // Thay vì render lại toàn bộ item, hàm này chỉ cập nhật các phần
    // thực sự thay đổi bên trong một vehicle-item đã có trên màn hình.
    // ===================================================================
    updateVehicleItemDOM(node, vehicleData) { // SỬA LỖI & NÂNG CẤP
        if (!node || !vehicleData) return;

        const isParking = vehicleData.status === 'Đang gửi';

        // 1. Cập nhật class chính để thay đổi giao diện (vạch màu, độ mờ)
        // Template V7 sử dụng class 'departed'
        node.classList.toggle('departed', !isParking);

        // 2. Cập nhật thời gian gửi để dừng bộ đếm live
        const durationSpan = node.querySelector('.live-duration');
        if (durationSpan) {
            // Nếu xe đã rời đi, tính toán và hiển thị thời gian gửi cuối cùng
            if (!isParking) {
                durationSpan.textContent = Utils.calculateDuration(vehicleData.entry_time, vehicleData.exit_time);
                // Xóa thuộc tính data-starttime để ngăn nó cập nhật lại tự động
                durationSpan.removeAttribute('data-starttime');
            } else {
                // Nếu vì lý do nào đó xe được cập nhật lại thành "Đang gửi", đảm bảo nó tiếp tục cập nhật live
                durationSpan.textContent = Utils.calculateDuration(vehicleData.entry_time);
                durationSpan.setAttribute('data-starttime', vehicleData.entry_time);
            }
        }
    },

    // YÊU CẦU: Hiển thị chỉ báo khi dữ liệu được cập nhật
    showDataSyncIndicator() {
        const indicator = document.getElementById('data-sync-indicator');
        if (indicator) {
            indicator.classList.add('active');
            setTimeout(() => indicator.classList.remove('active'), 2000);
        }
    },

    renderDashboard() {
        // ===================================================================
        // THIẾT KẾ LẠI TOÀN DIỆN: BẢNG TIN NHANH V3 (Yêu cầu người dùng)
        // ===================================================================
        const parkingVehicles = state.vehicles.filter(v => v.status === 'Đang gửi');
        const totalToday = state.vehicles.length;
        const capacity = state.currentLocation?.capacity || 0;

        // Tính toán các chỉ số mới
        const revenueToday = state.vehicles
            .filter(v => v.status === 'Đã rời bãi' && v.fee > 0)
            .reduce((sum, v) => sum + v.fee, 0);

        const vipCount = parkingVehicles.filter(v => v.is_vip).length;

        const statItemsHtml = `
                ${Templates.geminiStatCard('vehicles', 'Xe trong bãi', parkingVehicles.length, ` / ${capacity > 0 ? capacity : 'N/A'}`, 'Số xe đang có trong bãi so với sức chứa', 'vehicles')}
                ${Templates.geminiStatCard('revenue', 'Doanh thu hôm nay', Utils.formatCurrency(revenueToday), 'đ', 'Tổng doanh thu từ các xe đã rời bãi trong ngày', 'revenue')}
                ${Templates.geminiStatCard('total', 'Tổng lượt xe', totalToday, 'lượt', 'Tổng số xe đã ra/vào trong ngày', 'total')}
                ${Templates.geminiStatCard('vip', 'Xe VIP', vipCount, 'xe', 'Số xe VIP/Khách mời đang có trong bãi', 'vip')}
            `;

        dom.dashboardGrid.innerHTML = statItemsHtml;

        // Cập nhật giá trị tĩnh cho các thẻ (đảm bảo không có hiệu ứng số đếm)
        const vehiclesCardValue = document.querySelector('[data-stat-id="vehicles"] .gemini-stat-card__value');
        if (vehiclesCardValue) vehiclesCardValue.textContent = parkingVehicles.length;

        const revenueCardValue = document.querySelector('[data-stat-id="revenue"] .gemini-stat-card__value');
        if (revenueCardValue) revenueCardValue.textContent = Utils.formatCurrency(revenueToday);

        const totalCardValue = document.querySelector('[data-stat-id="total"] .gemini-stat-card__value');
        if (totalCardValue) totalCardValue.textContent = totalToday;

        const vipCardValue = document.querySelector('[data-stat-id="vip"] .gemini-stat-card__value');
        if (vipCardValue) vipCardValue.textContent = vipCount;
    },

    renderVehicleList() {
        // ===================================================================
        // GIẢI PHÁP CUỐI CÙNG CHỐNG "NHÁY": CẬP NHẬT THÔNG MINH
        // Xóa bỏ hoàn toàn cơ chế DOM diffing cũ (so sánh outerHTML) - NGUYÊN NHÂN GỐC RỄ.
        // Thay thế bằng logic duyệt và "phẫu thuật" trực tiếp các node đã có.
        // ===================================================================

        // YÊU CẦU: Chỉ hiển thị 1 thẻ cho mỗi xe, ưu tiên trạng thái mới nhất.
        // Vì state.vehicles đã được sắp xếp theo thời gian giảm dần, chúng ta chỉ cần
        // lấy bản ghi đầu tiên cho mỗi biển số xe.
        const uniqueVehicles = [];
        const seenPlates = new Set();
        for (const vehicle of state.vehicles) {
            if (!seenPlates.has(vehicle.plate)) {
                uniqueVehicles.push(vehicle);
                seenPlates.add(vehicle.plate);
            }
        }
        const filteredVehicles = uniqueVehicles.filter(v => {
            const term = state.filterTerm;
            if (!term) return true;
            const upperTerm = term.toUpperCase();
            // NÂNG CẤP: Tìm kiếm theo cả biển số và số điện thoại
            return v.plate.toUpperCase().includes(upperTerm) || v.phone?.includes(term);
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

        const newVehicleIds = new Set(paginatedVehicles.map(v => v.unique_id));
        const existingNodesMap = new Map(Array.from(dom.vehicleListContainer.children).map(node => [node.dataset.id, node]));

        // 1. Xóa các node không còn trong danh sách mới
        existingNodesMap.forEach((node, id) => {
            if (!newVehicleIds.has(id)) {
                node.remove();
            }
        });

        // 2. Cập nhật, thêm và sắp xếp lại các node
        paginatedVehicles.forEach((vehicle, index) => {
            const existingNode = existingNodesMap.get(vehicle.unique_id);
            if (existingNode) {
                // Node đã tồn tại, chỉ di chuyển nó đến đúng vị trí nếu cần
                if (dom.vehicleListContainer.children[index] !== existingNode) {
                    dom.vehicleListContainer.insertBefore(existingNode, dom.vehicleListContainer.children[index] || null);
                }
            } else {
                // Node mới, tạo và chèn vào đúng vị trí
                const newNode = document.createElement('div');
                newNode.innerHTML = Templates.vehicleItemV7(vehicle, state.alerts);
                const childNode = newNode.firstElementChild;
                if (childNode) {
                    const referenceNode = dom.vehicleListContainer.children[index];
                    dom.vehicleListContainer.insertBefore(childNode, referenceNode || null);
                }
            }
        });

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

    // NÂNG CẤP: Quản lý modal tập trung
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
            // KHÔI PHỤC: Case để hiển thị vé trong modal trên di động
            case 'checkInReceipt':
                modalHtml = Templates.checkInReceiptModal(data);
                setTimeout(() => {
                    const qrCanvas = document.getElementById('checkin-qrcode-canvas');
                    if (qrCanvas && data.unique_id) {
                        const lookupUrl = `${window.location.origin}${window.location.pathname.replace('index.html', '').replace(/\/$/, '')}/lookup.html?ticketId=${data.unique_id}`;
                        // Gán URL cho link
                        const qrLink = document.getElementById('qr-code-link');
                        if (qrLink) qrLink.href = lookupUrl;
                        // Vẽ QR code
                        QRCode.toCanvas(qrCanvas, lookupUrl, { width: 140, errorCorrectionLevel: 'H', margin: 1 }, (error) => { if (error) console.error('Lỗi tạo QR code:', error); });
                    }
                    if (data.isNew) { this.startConfetti(); }
                }, 100);
                break;
            case 'global-alert':
                modalHtml = data.html;
                break;
            case 'image-viewer':
                modalHtml = Templates.imageViewerModal(data);
                break;
            case 'checkoutSuccess':
                modalHtml = Templates.checkoutSuccessModal(data);
                this.startConfetti('checkout-success-confetti');
                break;
        }
        dom.modalContainer.innerHTML = modalHtml;
        const overlay = dom.modalContainer.querySelector('.modal-overlay');
        // NÂNG CẤP: Thêm hiệu ứng "nở ra" mượt mà
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
        // NÂNG CẤP: Thêm hiệu ứng "thu nhỏ" khi đóng
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

    // NÂNG CẤP: Hàm tạo hiệu ứng pháo hoa
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
        `, // NÂNG CẤP: Đã thêm các icon và cấu trúc cho hiệu ứng chuyển đổi
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
        // SỬA LỖI CHÍ MẠNG: Luôn truyền new Date() để tính phí tạm tính chính xác
        const fee = isParking ? FeeCalculator.calculate(vehicle, new Date(), state.currentLocation) : (vehicle.fee ?? 0);
        const duration = isParking ? `<span class="live-duration" data-starttime="${vehicle.entry_time}">${Utils.calculateDuration(vehicle.entry_time)}</span>` : Utils.calculateDuration(vehicle.entry_time, vehicle.exit_time);
        const feeDisplay = isParking ? `<span class="live-fee" data-starttime="${vehicle.entry_time}" data-isvip="${vehicle.is_vip}">${Utils.formatCurrency(fee)}đ</span>` : `<strong>${Utils.formatCurrency(fee)}đ</strong>`;

        let html = `
                ${Templates.infoDisplayItem('Trạng thái', `<span class="status-badge ${isParking ? 'parking' : 'departed'}">${vehicle.is_vip ? `VIP` : vehicle.status}</span>`)}
                ${Templates.infoDisplayItem('Tỉnh', Utils.decodePlate(vehicle.plate))}
                ${Templates.infoDisplayItem('Giờ vào', `<strong>${Utils.formatDateTime(vehicle.entry_time)}</strong>`)}
                ${isParking ? '' : Templates.infoDisplayItem('Giờ ra', Utils.formatDateTime(vehicle.exit_time))}
                ${Templates.infoDisplayItem('Thời gian gửi', duration)}
                ${Templates.infoDisplayItem(isParking ? 'Phí tạm tính' : 'Phí đã trả', feeDisplay)}
            `;
        if (vehicle.phone) {
            html += Templates.infoDisplayItem('SĐT', Utils.formatPhone(vehicle.phone));
        }
        if (vehicle.notes) {
            html += Templates.infoDisplayItem('Ghi chú', `<strong style="color: var(--primary-accent);">${vehicle.notes}</strong>`);
        }
        if (vehicle.image_url) {
            // NÂNG CẤP: Chuyển từ link <a> sang button để mở modal xem ảnh
            html += Templates.infoDisplayItem('Ảnh xe', `<button class="action-button btn--secondary" data-action="view-image" data-image-url="${Utils.getDirectImageUrl(vehicle.image_url)}" data-plate="${vehicle.plate || ''}" style="display:inline-flex; align-items:center; gap:0.5rem; padding:0.5rem 1rem; font-size:0.9rem; width: auto; height: auto;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v7"/><path d="M3 15a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2"/><path d="M8 11l2.5 3L14 9l4 6"/></svg><span>Xem ảnh</span></button>`);
        }
        return html;
    },
    // NÂNG CẤP: Template cho từng dòng thông tin, dễ quản lý hơn
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
                </li>`; // Sửa lỗi: Thêm thẻ đóng </li>
    },
    geminiStatCard: (id, label, value, unit, description, iconName) => {
        // ===================================================================
        // THIẾT KẾ LẠI TOÀN DIỆN: BỘ ICON VÀ THẺ THỐNG KÊ V3
        // ===================================================================
        const icons = {
            vehicles: `<svg class="animated-icon vehicle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-1.1-.9-2-2-2H7c-1.1 0-2 .9-2 2v3c0 .6.4 1 1 1h2"/><path d="M19 17H5v-5.9c0-1.2 1-2.1 2.1-2.1h9.8c1.2 0 2.1.9 2.1 2.1V17Z"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>`,
            revenue: `<svg class="animated-icon revenue-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`,
            total: `<svg class="animated-icon total-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 23 9"></polyline></svg>`,
            vip: `<svg class="animated-icon vip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>`,
        };

        const iconHtml = icons[iconName] || '';
        return `<div class="gemini-stat-card" data-stat-id="${id}" title="${description}"><div class="gemini-stat-card__header"><div class="gemini-stat-card__icon">${iconHtml}</div><span class="gemini-stat-card__label">${label}</span></div><div class="gemini-stat-card__value-wrapper"><span class="gemini-stat-card__value">${value}</span><span class="gemini-stat-card__unit">${unit}</span></div></div>`;
    },
    // TÁCH LOGIC: Tạo template riêng cho icon để hàm updateVehicleItemDOM có thể tái sử dụng
    vehicleItemIcon: (isParking) => isParking
        ? `<svg class="icon--parking" viewBox="0 0 24 24"><circle class="pulse-wave" cx="12" cy="12" r="6"/><path class="vehicle-shape" d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>`
        : `<svg class="icon--departed" viewBox="0 0 24 24"><path class="vehicle-shape" d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/><path class="checkmark-path" fill="none" d="M8 12l3 3 5-5"/></svg>`,
    // ===================================================================
    // THIẾT KẾ LẠI TOÀN DIỆN: GIAO DIỆN DANH SÁCH XE V5
    // Bố cục dạng bảng, thông tin rõ ràng, hiện đại.
    // THIẾT KẾ LẠI TOÀN DIỆN: GIAO DIỆN DANH SÁCH XE V6 (Yêu cầu người dùng)
    // Phong cách tối giản, hiện đại, tối ưu cho các thiết bị hiển thị.
    // ===================================================================
    vehicleItem: (v, alerts) => {
        const alert = alerts[v.plate];
        const isParking = v.status === 'Đang gửi';
        const alertClass = alert ? `alert-${alert.level}` : '';

        const alertIcon = alert ? `<div class="vehicle-v5__alert-icon alert-${alert.level}" title="${alert.reason}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>` : '';
        const vipIcon = v.is_vip ? `<div class="vehicle-v5__vip-icon" title="Khách VIP"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg></div>` : '';

        return `
                <div class="vehicle-item-v5 ${!isParking ? 'departed' : ''} ${alertClass}" data-plate="${v.plate}" data-id="${v.unique_id}">
                    <div class="vehicle-v5__cell vehicle-v5__plate">
                        <div class="vehicle-v5__plate-text">${v.plate}</div>
                        <div class="vehicle-v5__icons">${alertIcon}${vipIcon}</div>
                    </div>
                    <div class="vehicle-v5__cell vehicle-v5__status">
                        <span class="status-badge-v5 status--${isParking ? 'parking' : 'departed'}">${v.status}</span>
                    </div>
                    <div class="vehicle-v5__cell vehicle-v5__time">
                        <span class="time-label">Vào:</span>
                        <span class="time-value">${Utils.formatDateTime(v.entry_time)}</span>
                    </div>
                    <div class="vehicle-v5__cell vehicle-v5__duration">
                        <span class="time-label">Gửi:</span>
                        <span class="time-value live-duration" data-starttime="${v.entry_time}">${Utils.calculateDuration(v.entry_time)}</span>
                    </div>
                </div>
            `;
    },
    // ===================================================================
    // THIẾT KẾ MỚI: GIAO DIỆN DANH SÁCH XE V7 - "INFO CARD"
    // Hiện đại, thân thiện và có hiệu ứng tốt hơn.
    // ===================================================================
    vehicleItemV7: (v, alerts) => {
        const alert = alerts[v.plate];
        const isParking = v.status === 'Đang gửi';
        const alertIcon = alert ? `<div class="v7-icon v7-alert-icon alert-${alert.level}" title="${alert.reason}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>` : '';
        const vipIcon = v.is_vip ? `<div class="v7-icon v7-vip-icon" title="Khách VIP"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg></div>` : '';

        return `
                <div class="vehicle-item-v7 ${!isParking ? 'departed' : ''}" data-plate="${v.plate}" data-id="${v.unique_id}">
                    <div class="v7-main">
                        <div class="v7-plate">${v.plate}</div>
                        <div class="v7-status-icons">
                            ${alertIcon}
                            ${vipIcon}
                        </div>
                    </div>
                    <div class="v7-meta">
                        <div class="v7-meta-item">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>
                            <span>${Utils.formatDateTime(v.entry_time)}</span>
                        </div>
                        <div class="v7-meta-item">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            <span class="live-duration" data-starttime="${v.entry_time}">${Utils.calculateDuration(v.entry_time)}</span>
                        </div>
                    </div>
                </div>`;
    },
    skeletonItem: () => `<div class="skeleton-item"></div>`,
    emptyState: (text) => `<div class="empty-state">${text}</div>`,
    modal(title, content, footer, maxWidth = '500px') {
        const style = `style="max-width: ${maxWidth};"`;
        return `
                <div class="modal-overlay active">
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
            return `<div class="location-card ${isRecommended ? 'recommended' : ''}" data-action="select-location" data-location-id="${loc.id}">${isRecommended ? '<div class="recommended-badge">Gần nhất</div>' : ''}<div class="location-card-header"><h3>${loc.name}</h3>${loc.distance > -1 ? `<span class="distance-tag">~${(loc.distance * 1000).toFixed(0)}m</span>` : ''}</div><div class="location-card-body"><div class="location-detail"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg><span>${loc.address || 'Chưa có địa chỉ'}</span></div><div class="location-detail"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg><span>${loc.operating_hours || 'Hoạt động 24/7'}</span></div></div></div>`
        }).join('');
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
        const title = `Ảnh xe: ${plate}`;
        const content = `<div class="image-viewer-container"><img src="${imageUrl}" alt="Ảnh xe ${plate}" loading="lazy"></div>`;
        const footer = `<button class="action-button btn--secondary" data-action="close-modal">Đóng</button>`;
        return this.modal(title, content, footer, '85vw');
    },
    qrScannerModal() {
        const content = `<div class="qr-scanner-body"><video id="camera-feed" playsinline></video><div class="scanner-overlay"><div class="scanner-viewfinder"><div class="corner corner-tl"></div><div class="corner corner-tr"></div><div class="corner corner-bl"></div><div class="corner corner-br"></div></div></div><div class="scanner-feedback-overlay"><div class="feedback-icon"><svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52"><circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/><path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/></svg></div><div class="feedback-plate"></div></div></div><p style="text-align: center; color: var(--text-secondary); margin-top: 1rem;">Di chuyển mã QR vào trong khung để lấy xe.</p>`;
        const footer = `<button class="action-button btn--secondary" data-action="close-modal">Hủy bỏ</button>`;
        return this.modal('Quét mã QR để lấy xe', content, footer, '480px');
    },
    paymentModal({ fee, vehicle }) {
        if (!vehicle) return '';
        const memo = `TTGX ${vehicle.plate || 'UNK'} ${vehicle.unique_id || 'UNK'}`;
        const qrUrl = APP_CONFIG.payment.getQrUrl(fee, memo);

        const content = `
            <div class="payment-flow-v10">
                <div class="ticket-paper">
                    <div class="ticket-header">
                        <span class="ticket-brand">Vé Gửi Xe</span>
                        <span class="ticket-id" style="font-size: 0.7em; word-break: break-all;">ID: ${vehicle.unique_id || ''}</span>
                    </div>
                    
                    <div class="ticket-info-grid">
                        <div class="ticket-info-item">
                            <span class="info-label">Biển số</span>
                            <span class="info-value plate">${vehicle.plate || '--'}</span>
                        </div>
                        <div class="ticket-info-item">
                            <span class="info-label">Giờ vào</span>
                            <span class="info-value">${Utils.formatDateTime(vehicle.entry_time).split(' ')[1] || '--'}</span>
                            <span class="info-label" style="margin-top:2px">${Utils.formatDateTime(vehicle.entry_time).split(' ')[0] || '--'}</span>
                        </div>
                        <div class="ticket-info-item">
                            <span class="info-label">Thời gian</span>
                            <span class="info-value">${Utils.calculateDuration(vehicle.entry_time)}</span>
                        </div>
                        <div class="ticket-info-item">
                            <span class="info-label">Trạng thái</span>
                            <span class="info-value">Chờ thanh toán</span>
                        </div>
                    </div>

                    <div class="ticket-fee-section">
                        <span class="ticket-fee-label">Thành tiền</span>
                        <span class="ticket-fee-amount">${Utils.formatCurrency(fee || 0)}<small style="font-size:1rem; font-weight:400">đ</small></span>
                    </div>

                    <div class="ticket-payment-method">
                        <div class="method-tabs">
                            <button class="method-tab" data-action="select-payment-method" data-method="Chuyển khoản QR">Chuyển khoản</button>
                            <button class="method-tab" data-action="select-payment-method" data-method="Tiền mặt">Tiền mặt</button>
                        </div>
                    </div>

                    <div id="payment-details-v10" class="ticket-details-area">
                         <div class="payment-display-area" id="qr-display-area-v10" style="text-align:center">
                            <p class="display-instruction">Quét mã để thanh toán</p>
                            <div class="qr-wrapper" style="display:inline-block; margin-top:0.5rem">
                                <img src="${qrUrl}" alt="QR Code">
                            </div>
                         </div>
                         <div class="payment-display-area" id="cash-display-area-v10" style="display:none; text-align:center">
                            <p class="display-instruction">Thu tiền mặt từ khách</p>
                            <div class="cash-animation-wrapper" style="height:150px">
                                 <svg class="cash-stack-icon" viewBox="0 0 64 64" style="width:80px; height:80px">
                                    <path class="cash-stack-bill" d="M55.5 32.8H8.5c-1.7 0-3-1.3-3-3V17.2c0-1.7 1.3-3 3-3h47c1.7 0 3 1.3 3 3v12.5c0 1.7-1.3 3.1-3 3.1z"/>
                                    <path class="cash-stack-bill" d="M55.5 40.8H8.5c-1.7 0-3-1.3-3-3V25.2c0-1.7 1.3-3 3-3h47c1.7 0 3 1.3 3 3v12.5c0 1.7-1.3 3.1-3 3.1z"/>
                                    <path class="cash-stack-bill" d="M55.5 48.8H8.5c-1.7 0-3-1.3-3-3V33.2c0-1.7 1.3-3 3-3h47c1.7 0 3 1.3 3 3v12.5c0 1.7-1.3 3.1-3 3.1z"/>
                                </svg>
                            </div>
                         </div>
                    </div>
                    <div class="paid-stamp">ĐÃ THANH TOÁN</div>
                </div>
            </div>
        `;

        const footer = `
            <button class="action-button btn--secondary" data-action="close-modal" style="min-width:100px">Hủy</button>
            <button class="action-button btn--check-in" data-action="complete-payment" disabled style="background:#000; border-color:#000; min-width:160px">
                <span>Xác nhận</span>
            </button>
        `;
        return this.modal('THANH TOÁN', content, footer, '420px');
    },
    confirmationModal({ title, plate, reason, type }) {
        const isVip = type === 'vip';
        const passTitle = isVip ? 'XE ƯU TIÊN' : 'MIỄN PHÍ GỬI XE';

        const content = `
                <div class="confirm-card-v1 ${isVip ? 'is-vip' : 'is-free'}">
                    <div class="confirm-card__header">
                        <h3 class="confirm-card__title">${passTitle}</h3>
                    </div>
                    <div class="confirm-card__body">
                        <div class="confirm-card__plate">${plate}</div>
                        <p class="confirm-card__reason">Lý do: <strong>${reason}</strong></p>
                    </div>
                    <div class="confirm-card__success-overlay">
                        <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52"><circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/><path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/></svg>
                        <p>ĐÃ XÁC NHẬN</p>
                        <div class="success-v6__icon">
                            <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52"><circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/><path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/></svg>
                        </div>
                        <h3 class="success-v6__title">${title}</h3>
                    </div>
                    <div class="success-v6__body">
                        <div class="success-v6__amount-paid">
                            <span class="amount-label">${isPaid ? 'Số tiền đã thanh toán' : 'Miễn phí'}</span>
                            <span class="amount-value">${isPaid ? Utils.formatCurrency(fee) + 'đ' : '0đ'}</span>
                        </div>
                        <div class="success-v6__divider"></div>
                        <ul class="success-v6__details-list">
                            <li><span>Biển số xe</span><strong>${vehicle.plate}</strong></li>
                            <li><span>Thời gian vào</span><strong>${Utils.formatDateTime(vehicle.entry_time)}</strong></li>
                            <li><span>Thời gian ra</span><strong>${Utils.formatDateTime(vehicle.exit_time || new Date())}</strong></li>
                            <li><span>Tổng thời gian</span><strong>${Utils.calculateDuration(vehicle.entry_time, vehicle.exit_time)}</strong></li>
                            <li><span>Phương thức</span><strong>${method}</strong></li>
                        </ul>
                    </div>
                </div>`;
        const footer = `<button class="action-button btn--secondary" data-action="close-modal" style="margin: 0 auto;">Đóng</button>`;
        return this.modal('Giao dịch hoàn tất', content, footer, '550px');
    },

    // TÁI CẤU TRÚC: Hàm này CHỈ tạo ra nội dung HTML của tấm vé.
    digitalPassContent(data) {
        return this.digitalPassContentV2(data);
    },

    // ====================================================================================================
    // THIẾT KẾ LẠI HOÀN TOÀN: GIAO DIỆN VÉ "THẺ THANH NIÊN" V2 (PREMIUM STYLE)
    // ====================================================================================================
    digitalPassContentV2(data) {
        const isVip = data.is_vip;
        const locationName = Utils.getLocationNameById(data.location_id) || 'Bãi xe Ba Đình';

        return `
            <div class="ticket-v2">
                ${isVip ? '<div class="ticket-v2__vip">KHÁCH MỜI</div>' : ''}
                
                <div class="ticket-v2__header">
                    <div class="ticket-v2__brand">
                        <img src="https://cdn.haitrieu.com/wp-content/uploads/2021/11/Logo-Doan-Thanh-NIen-Cong-San-Ho-Chi-Minh-1.png" alt="Logo" class="ticket-v2__logo">
                        <div class="ticket-v2__title-main">Đoàn TNCS Hồ Chí Minh</div>
                        <div class="ticket-v2__title-sub">Vé Gửi Xe Điện Tử</div>
                    </div>
                </div>

                <div class="ticket-v2__body">
                    <div class="ticket-v2__plate-box">
                        <span class="ticket-v2__plate-label">Biển số xe</span>
                        <div class="ticket-v2__plate-number">${data.plate}</div>
                    </div>

                    <div class="ticket-v2__qr-box">
                        <a id="qr-code-link" href="#" target="_blank" rel="noopener noreferrer">
                            <canvas id="checkin-qrcode-canvas" class="ticket-v2__qr-canvas"></canvas>
                        </a>
                        <span class="ticket-v2__qr-hint">Quét mã để lấy xe</span>
                    </div>

                    <div class="ticket-v2__details">
                        <div class="ticket-v2__row">
                            <span class="ticket-v2__label">Giờ vào</span>
                            <span class="ticket-v2__value">${Utils.formatDateTime(data.entry_time)}</span>
                        </div>
                        <div class="ticket-v2__row">
                            <span class="ticket-v2__label">Địa điểm</span>
                            <span class="ticket-v2__value">${locationName}</span>
                        </div>
                    </div>
                </div>

                <div class="ticket-v2__footer">
                    <span class="ticket-v2__id">ID: ${data.unique_id}</span>
                </div>
            </div>
        `;
    },

    checkInReceiptModal(data) {
        // ====================================================================================================
        // THIẾT KẾ LẠI HOÀN TOÀN: GIAO DIỆN VÉ "PRESTIGE PASS V2"
        // Triết lý: "Thẻ vật lý trong không gian số" - Hiện đại, Đẳng cấp, Độc bản.
        // ====================================================================================================
        const title = data.isNew ? 'GỬI XE THÀNH CÔNG' : 'VÉ GỬI XE ĐIỆN TỬ';
        const content = this.digitalPassContentV2(data);
        const footer = `<button class="action-button btn--secondary" data-action="close-modal" style="width: 100%; max-width: 200px; margin: 0 auto;">Đóng</button>`;
        return this.modal(title, content, footer, 'auto');
    },

    checkInReceiptView(data) {
        const ticketContent = this.digitalPassContentV2(data);
        return `
                <div class="ticket-view-header">
                    <button class="action-button btn--secondary back-to-form-btn" data-action="back-to-form">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                        Quay lại
                    </button>
                </div>
                ${ticketContent}`;
    }
};

const Utils = {
    formatDateTime: (d) => d ? new Date(d).toLocaleString('vi-VN') : '--',
    // NÂNG CẤP: Hàm kiểm tra thiết bị di động
    isMobile: () => window.innerWidth <= 768,

    formatCurrency: (n) => new Intl.NumberFormat('vi-VN').format(n || 0),
    formatPhone: (p) => p || 'Chưa có',
    getSyncedTime: () => new Date(Date.now() + state.serverTimeOffset),

    calculateDuration: (start, end = Utils.getSyncedTime()) => { // SỬA LỖI: Mặc định là giờ chuẩn
        if (!start) return '--';
        let diff = Math.floor((new Date(end) - new Date(start)) / 1000);
        if (diff < 0) return '0m';
        const d = Math.floor(diff / 86400); diff %= 86400;
        const h = Math.floor(diff / 3600); diff %= 3600;
        const m = Math.floor(diff / 60);
        return [d > 0 ? `${d}d` : '', h > 0 ? `${h}h` : '', `${m}m`].filter(Boolean).join(' ') || '0m';
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
        return `${APP_CONFIG.supabase.url}/storage/v1/object/public/${filePath}`;
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
        // TỐI ƯU HÓA: Sử dụng debounce để tránh lọc lại danh sách trên mỗi phím bấm
        clearTimeout(filterDebounceTimer);
        filterDebounceTimer = setTimeout(() => {
            state.filterTerm = e.target.value;
            state.currentPage = 1;
            UI.renderVehicleList();
        }, 250); // Chờ 250ms sau khi người dùng ngừng gõ
    },

    handleSearchTermChange(e) {
        const searchTerm = e.target.value.trim();
        const cleanedPlate = searchTerm.toUpperCase().replace(/[^A-Z0-9]/g, '');
        state.selectedPlate = cleanedPlate;

        // Bước 1: Reset và cập nhật giao diện ngay lập tức
        if (searchTerm.length < 4) {
            state.selectedVehicle = null;
            UI.renderActionButtons();
            UI.updateMainFormUI();
            UI.renderSuggestions('');
            clearTimeout(globalSearchDebounceTimer); // Hủy debounce nếu xóa hết
            return;
        }

        // Bước 2: Tìm kiếm tức thì trong danh sách xe đã tải (cực nhanh)
        // CẢI TIẾN: Sử dụng Map để tra cứu O(1)
        const foundVehicle = state.vehicleMap.get(cleanedPlate);

        if (foundVehicle && foundVehicle.status === 'Đang gửi') {
            // Tìm thấy xe trong bãi hiện tại -> Hiển thị ngay
            state.selectedVehicle = { data: foundVehicle, status: 'parking' };
            const alert = state.alerts[foundVehicle.plate];
            if (alert) UI.showGlobalAlertModal(alert);
        } else {
            // Không tìm thấy trong bãi, thử tìm trong danh sách đã rời bãi
            const foundDeparted = state.vehicles.find(v => v.plate === cleanedPlate && v.status === 'Đã rời bãi');
            if (foundDeparted) {
                state.selectedVehicle = { data: foundDeparted, status: 'departed' };
            } else {
                // Không tìm thấy trong dữ liệu hiện tại -> Mặc định là xe mới
                state.selectedVehicle = { data: null, status: 'new' };
                // TỐI ƯU HÓA: Đã loại bỏ bước tìm kiếm ngầm để tăng tốc độ phản hồi.
            }
        }
        UI.renderActionButtons(); // Cập nhật nút bấm dựa trên kết quả tìm kiếm tức thì
        UI.updateMainFormUI();
        if (state.selectedVehicle?.status === 'new' || state.selectedVehicle?.status === 'parking_remote') {
            UI.renderSuggestions(cleanedPlate);

            // NÂNG CẤP (User Request): Tự động điền SĐT cho xe đã từng gửi (ngay cả khi không có trong state hiện tại)
            clearTimeout(globalSearchDebounceTimer);
            globalSearchDebounceTimer = setTimeout(() => {
                App.attemptAutoFill(cleanedPlate);
            }, 500); // Debounce 500ms
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

    // NÂNG CẤP: Xử lý việc mở/đóng thẻ thông tin xe
    handleToggleVehicleInfo(button) {
        const card = button.closest('.collapsible-card');
        if (card) {
            card.classList.toggle('expanded');
        }
    },

    async handleActionClick(e, button) {
        const action = button.dataset.action;
        if (!['check-in', 'check-out'].includes(action)) return;

        if (state.isProcessing) return;

        const plate = dom.searchTermInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!plate) {
            UI.showToast('Vui lòng nhập biển số xe!', 'error');
            return;
        }

        state.isProcessing = true;
        // NÂNG CẤP: Sử dụng hàm animateButtonStateChange để tạo hiệu ứng
        button.disabled = true;
        button.innerHTML = '<span>Đang xử lý...</span>';

        try {
            // Cập nhật state.selectedPlate trước khi xử lý
            state.selectedPlate = plate;

            if (action === 'check-in') await this.processCheckIn(plate);
            if (action === 'check-out') await this.processCheckOut(plate);

        } catch (error) {
            UI.showToast(error.message, 'error');
        } finally {
            // NÂNG CẤP: Reset trạng thái nút và form sau khi xử lý
            state.isProcessing = false;
            UI.renderActionButtons();
        }
    },

    // SỬA LỖI: Tạo handler riêng cho các action không nằm trong modal và reset form
    handleViewActionClick(e) {
        const button = e.target.closest('[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        if (action === 'back-to-form') {
            App.resetFormAndFetchData();
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

    async processCheckIn(plate) {
        const isAlreadyParking = state.vehicles.some(v => v.plate === plate && v.status === 'Đang gửi');
        if (isAlreadyParking) {
            throw new Error(`Xe ${plate} đã có trong bãi. Vui lòng kiểm tra lại.`);
        }

        const phone = dom.phoneInput ? dom.phoneInput.value.trim() : '';
        const isVIP = dom.isVipCheckbox ? dom.isVipCheckbox.checked : false;
        const notes = dom.notesInput ? dom.notesInput.value.trim() : '';

        const staffInfo = JSON.parse(localStorage.getItem('staffInfo'));
        const staffUsername = staffInfo?.username || 'unknown';

        let newTransaction;

        // Đơn giản hóa logic: Chỉ kiểm tra chính sách thu phí khi vào
        const collectionPolicy = state.currentLocation?.fee_collection_policy || 'post_paid';
        const isPrePaid = collectionPolicy === 'pre_paid';

        // Tạo một đối tượng giao dịch giả để tính phí trả trước
        const tempTransaction = { entry_time: new Date(), is_vip: isVIP };

        if (isPrePaid && FeeCalculator.calculate(tempTransaction, null, state.currentLocation) > 0) {
            // Xử lý thu phí trước
            const calculatedFee = FeeCalculator.calculate(tempTransaction, null, state.currentLocation);
            const uniqueID = '_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
            const paymentResult = await this.getPaymentResult(calculatedFee, { plate, entry_time: new Date().toISOString(), unique_id: uniqueID });
            if (!paymentResult) throw new Error('Đã hủy thao tác gửi xe.');
            newTransaction = await Api.checkIn(plate, phone, isVIP, notes, { ...paymentResult /*, snapshot: feePolicySnapshot*/ }, uniqueID, staffUsername);
        } else {
            // Gửi xe không thu phí trước, vẫn lưu snapshot
            newTransaction = await Api.checkIn(plate, phone, isVIP, notes, { /*snapshot: feePolicySnapshot*/ }, null, staffUsername);
        }

        // NÂNG CẤP: Hiển thị vé theo thiết bị
        if (Utils.isMobile()) {
            UI.showModal('checkInReceipt', { ...newTransaction, isNew: true });
            await App.resetFormAndFetchData(); // Reset form ngay trên mobile
        } else {
            UI.showModal('checkInReceipt', { ...newTransaction, isNew: true });
            // SỬA LỖI: Cập nhật trạng thái của xe đang được chọn ngay lập tức.
            // Điều này đảm bảo khi fetchData render lại UI, nó sẽ sử dụng trạng thái 'parking' mới.
            state.selectedVehicle = { data: newTransaction, status: 'parking' };
            // Tải lại dữ liệu nền để đồng bộ và render lại UI với trạng thái đúng.
            await App.fetchData(true);
        }
    },

    async getPaymentResult(fee, vehicleData) {
        return new Promise((resolve) => {
            UI.showModal('payment', { fee, vehicle: vehicleData });
            let selectedMethod = null;

            const modal = dom.modalContainer.querySelector('.modal-content');
            const confirmBtn = modal.querySelector('[data-action="complete-payment"]');
            // V10 Selectors
            const detailsArea = modal.querySelector('#payment-details-v10');
            const methodTabs = modal.querySelectorAll('.method-tab');
            const flowContainer = modal.querySelector('.payment-flow-v10');

            const handleClick = (e) => {
                const target = e.target.closest('[data-action]');
                if (!target) return;
                const action = target.dataset.action;

                if (action === 'select-payment-method') {
                    selectedMethod = target.dataset.method;

                    // Update V10 Logic: Tabs
                    methodTabs.forEach(tab => tab.classList.remove('active'));
                    target.classList.add('active');

                    // Show Details
                    if (detailsArea) {
                        detailsArea.classList.add('active');
                        // Show correct sub-area
                        detailsArea.querySelectorAll('.payment-display-area').forEach(el => el.style.display = 'none');
                        const areaToShow = detailsArea.querySelector(`#${selectedMethod === 'Tiền mặt' ? 'cash' : 'qr'}-display-area-v10`);
                        if (areaToShow) areaToShow.style.display = 'block';
                    }

                    if (confirmBtn) confirmBtn.disabled = false;
                }
                else if (action === 'complete-payment') {
                    if (!selectedMethod) return;
                    // V10: Show Stamp Animation
                    if (flowContainer) flowContainer.classList.add('paid');

                    // Delay slightly to show animation
                    setTimeout(() => {
                        dom.modalContainer.removeEventListener('click', handleClick);
                        resolve({ fee, method: selectedMethod });
                    }, 800);
                } else if (action === 'close-modal') {
                    dom.modalContainer.removeEventListener('click', handleClick);
                    resolve(null);
                }
            };

            dom.modalContainer.addEventListener('click', handleClick);
        });
    },

    async processOfflineCheckOut(vehicle, fee, paymentMethod) {
        const staffInfo = JSON.parse(localStorage.getItem('staffInfo'));
        const staffUsername = staffInfo?.username || 'unknown';
        Api.addToSyncQueue('checkOut', { uniqueID: vehicle.unique_id, fee, paymentMethod, staffUsername });
        UI.showToast(`Đã ghi nhận lấy xe (offline) cho ${vehicle.plate}.`, 'success');
        await App.resetFormAndFetchData();
    },

    async processCheckOut(plate) {
        const vehicle = state.vehicles.find(v => v.plate === plate && v.status === 'Đang gửi');

        if (!vehicle) throw new Error('Không có thông tin xe để lấy ra.');

        // Cập nhật state để các hàm khác có thể sử dụng
        state.selectedVehicle = { data: vehicle, status: 'parking' };

        const alert = state.alerts[vehicle.plate];
        if (alert?.level === 'block') throw new Error(`XE BỊ CHẶN: ${alert.reason}`);

        const staffInfo = JSON.parse(localStorage.getItem('staffInfo'));
        const staffUsername = staffInfo?.username || 'unknown';

        // Trường hợp 1: Xe đã thanh toán trước khi vào
        if (vehicle.fee !== null && vehicle.payment_method) {
            if (!state.isOnline) return this.processOfflineCheckOut(vehicle, 0, 'Đã thanh toán trước', staffUsername);
            // Tự động cho ra luôn
            await Api.checkOut(vehicle.unique_id, vehicle.fee, vehicle.payment_method, staffUsername);
            UI.showModal('checkoutSuccess', { vehicle: vehicle, fee: 0, method: 'Đã thanh toán trước' });
            await App.resetFormAndFetchData();
            return;
        }

        // Trường hợp 2: Tính phí tại thời điểm ra
        const fee = FeeCalculator.calculate(vehicle, new Date(), state.currentLocation);

        // Trường hợp 2a: Phí là 0 (VIP, miễn phí, gửi ngắn) -> Tự động cho ra
        if (fee <= 0) {
            const reason = vehicle.is_vip ? 'Khách VIP' : 'Miễn phí';
            await Api.checkOut(vehicle.unique_id, 0, reason, staffUsername);
            UI.showModal('checkoutSuccess', { vehicle: vehicle, fee: 0, method: reason });
            await App.resetFormAndFetchData();
            return;
        }

        // Trường hợp 2b: Phí > 0 -> Mở modal thanh toán
        if (fee > 0) {
            if (!state.isOnline) {
                throw new Error("Không thể xử lý thanh toán khi đang offline.");
            }
            const paymentResult = await this.getPaymentResult(fee, vehicle);
            if (paymentResult) {
                await this.processPayment(paymentResult.method); // Chờ thanh toán hoàn tất
                return;
            }
            // Chỉ throw lỗi khi paymentResult là null (người dùng đã hủy)
            throw new Error('Đã hủy thanh toán.');
        }
    },

    processViewTicket() {
        const vehicle = state.selectedVehicle?.data;
        if (!vehicle) {
            UI.showToast('Không có thông tin xe để xem vé.', 'error');
            return;
        }
        // NÂNG CẤP: Luôn hiển thị modal xem vé cho thống nhất trải nghiệm
        UI.showModal('checkInReceipt', { ...vehicle, isNew: false });
    },

    handleModalClick(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;

        if (action === 'select-location') {
            // NÂNG CẤP: Xử lý chọn vị trí từ modal
            const locationId = target.closest('.location-card').dataset.locationId;
            const location = state.locations.find(l => l.id === locationId);
            if (location) App.selectLocation(location);
            return;
        }

        switch (action) {
            case 'confirm-yes':
                // NÂNG CẤP: Xử lý xác nhận cho xe ra (miễn phí/VIP)
                this.processConfirmation();
                break;
            case 'confirm-no':
                // NÂNG CẤP: Đóng modal và reset trạng thái xử lý
                UI.closeModal();
                state.isProcessing = false;
                break;
        }
    },

    // NÂNG CẤP: Hiển thị hiệu ứng thành công trong modal xác nhận
    showConfirmationSuccess() {
        const successOverlay = document.querySelector('.priority-pass-new__success-overlay');
        const modalFooter = document.querySelector('.modal-footer');
        if (!successOverlay) return;

        successOverlay.classList.add('active');
        UI.startConfetti('confetti-container');
        // NÂNG CẤP: Thay đổi nút bấm sau khi xác nhận thành công

        if (modalFooter) {
            setTimeout(() => {
                modalFooter.innerHTML = `<button class="action-button btn--secondary" data-action="close-modal" style="margin: auto;">Đóng</button>`;
            }, 500);
        }
    },

    // NÂNG CẤP: Logic xử lý xác nhận cho xe ra (miễn phí/VIP)
    async processConfirmation() {
        const vehicle = state.selectedVehicle?.data;
        if (!vehicle) return;
        const reason = vehicle.is_vip ? 'Khách VIP' : 'Miễn phí';
        const staffInfo = JSON.parse(localStorage.getItem('staffInfo'));
        const staffUsername = staffInfo?.username || 'unknown';

        try {
            await Api.checkOut(vehicle.unique_id, 0, reason, staffUsername);
            this.showConfirmationSuccess();
            // SỬA LỖI: Sau khi xác nhận thành công, chờ một chút rồi reset form và tải lại dữ liệu
            // để giao diện được cập nhật ngay lập tức.
            setTimeout(() => {
                App.resetFormAndFetchData();
            }, 1500); // Chờ 1.5s để người dùng thấy thông báo thành công
        } catch (error) {
            UI.showToast(`Lỗi xác nhận: ${error.message}`, 'error');
            UI.closeModal();
        }
    },

    // NÂNG CẤP: Logic xử lý thanh toán và hiển thị kết quả
    async processPayment(paymentMethod) {
        const vehicle = state.selectedVehicle?.data;
        const fee = FeeCalculator.calculate(vehicle, new Date(), state.currentLocation);
        const staffInfo = JSON.parse(localStorage.getItem('staffInfo'));
        const staffUsername = staffInfo?.username || 'unknown';

        try {
            await Api.checkOut(vehicle.unique_id, fee, paymentMethod, staffUsername);
            UI.showPaymentConfirmation('success', 'Thành công!');

            setTimeout(async () => {
                // NÂNG CẤP: Hiển thị modal thành công cuối cùng với hiệu ứng pháo hoa
                UI.closeModal();
                UI.showModal('checkoutSuccess', { vehicle: vehicle, fee: fee, method: paymentMethod });
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

            const staffInfo = JSON.parse(localStorage.getItem('staffInfo'));
            const staffUsername = staffInfo?.username || 'unknown';

            // NÂNG CẤP: Tự động cho xe đã thanh toán trước ra khỏi bãi
            if (vehicle.fee !== null && vehicle.payment_method) {
                await Api.checkOut(vehicle.unique_id, vehicle.fee, vehicle.payment_method, staffUsername);
                UI.showToast(`Đã cho xe ${vehicle.plate} ra (đã thanh toán trước).`, 'success');
                await App.resetFormAndFetchData();
            } else {
                // Xử lý cho xe chưa thanh toán như bình thường
                const fee = FeeCalculator.calculate(vehicle, new Date(), state.currentLocation);
                if (fee <= 0) { // Bao gồm cả xe miễn phí và VIP
                    const reason = vehicle.is_vip ? 'Khách VIP' : 'Miễn phí';
                    await Api.checkOut(vehicle.unique_id, 0, reason, staffUsername);
                    UI.showToast(`Đã cho xe ${vehicle.plate} ra (${reason}).`, 'success');
                    await App.resetFormAndFetchData();
                    return;
                }

                if (!state.isOnline) throw new Error("Không thể xử lý thanh toán khi đang offline.");
                const paymentResult = await this.getPaymentResult(fee, vehicle);
                if (!paymentResult) throw new Error('Đã hủy thanh toán.');

                await Api.checkOut(vehicle.unique_id, paymentResult.fee, paymentResult.method, staffUsername);

                setTimeout(async () => {
                    UI.closeModal();
                    UI.showModal('checkoutSuccess', { plate: vehicle.plate, fee: paymentResult.fee, method: paymentResult.method });
                    await App.resetFormAndFetchData();
                }, 1500);
            }
        } catch (error) {
            UI.showToast(error.message, 'error');
        } finally {
            state.isProcessing = false;
        }
    },
};

const App = {


    setupEventListeners() {
        if (dom.datePicker) dom.datePicker.addEventListener('change', Handlers.handleDateChange);
        if (dom.filterInput) dom.filterInput.addEventListener('input', Handlers.handleFilterChange);
        if (dom.searchTermInput) dom.searchTermInput.addEventListener('input', (e) => Handlers.handleSearchTermChange(e));
        if (dom.changeLocationBtn) dom.changeLocationBtn.addEventListener('click', () => this.determineLocation(true));
        if (dom.themeCheckbox) dom.themeCheckbox.addEventListener('change', Handlers.handleThemeChange);

        if (dom.isVipCheckbox) {
            dom.isVipCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    dom.vehicleNotesInput.value = 'Khách VIP';
                } else if (dom.vehicleNotesInput.value === 'Khách VIP') {
                    dom.vehicleNotesInput.value = '';
                }
            });
        }

        if (dom.micBtn) dom.micBtn.addEventListener('click', Handlers.startVoiceRecognition);
        if (dom.scanQrBtn) dom.scanQrBtn.addEventListener('click', () => Handlers.openQrScanner());

        if (dom.vehicleListContainer) {
            dom.vehicleListContainer.addEventListener('click', (e) => {
                const item = e.target.closest('.vehicle-item-v7'); // Sửa selector để khớp với class mới
                if (item) Handlers.handleVehicleItemClick(item);
            });
        }
        if (dom.paginationControls) dom.paginationControls.addEventListener('click', (e) => Handlers.handlePaginationClick(e));

        if (dom.plateSuggestions) {
            dom.plateSuggestions.addEventListener('click', (e) => {
                const item = e.target.closest('.suggestion-item');
                if (item) {
                    dom.searchTermInput.value = item.dataset.plate;
                    dom.searchTermInput.dispatchEvent(new Event('input', { bubbles: true }));
                    dom.plateSuggestions.classList.remove('visible');
                }
            });
        }

        window.addEventListener('click', (e) => {
            if (dom.searchTermInput && !dom.searchTermInput.contains(e.target) && dom.plateSuggestions && !dom.plateSuggestions.contains(e.target)) {
                dom.plateSuggestions.classList.remove('visible');
            }
        });

        // =================================================================================
        // SỬA LỖI CHÍ MẠNG: SỬ DỤNG EVENT DELEGATION CHO TOÀN BỘ CỘT HÀNH ĐỘNG
        // Gắn listener vào container cha (#action-column) để không bao giờ bị mất
        // khi các phần tử con (nút bấm, form) được render lại.
        // =================================================================================
        if (dom.actionColumn) {
            dom.actionColumn.addEventListener('click', (e) => {
                const actionButton = e.target.closest('.action-button[data-action]');
                const imageButton = e.target.closest('[data-action="view-image"]');
                const viewTicketButton = e.target.closest('[data-action="view-ticket"]');
                // NÂNG CẤP: Thêm handler cho thẻ thông tin có thể thu gọn
                const toggleInfoButton = e.target.closest('[data-action="toggle-vehicle-info"]');

                if (actionButton) {
                    Handlers.handleActionClick(e, actionButton); // Truyền cả nút bấm vào handler
                }
                if (imageButton) {
                    UI.showModal('image-viewer', { imageUrl: imageButton.dataset.imageUrl, plate: imageButton.dataset.plate });
                } else if (viewTicketButton) {
                    Handlers.processViewTicket();
                }

                if (toggleInfoButton) {
                    Handlers.handleToggleVehicleInfo(toggleInfoButton);
                }

                // SỬA LỖI: Xử lý nút quay lại từ giao diện vé
                const backToFormButton = e.target.closest('[data-action="back-to-form"]');
                if (backToFormButton) {
                    if (dom.ticketViewContainer) dom.ticketViewContainer.classList.add('is-hidden');
                    if (dom.actionColumn) dom.actionColumn.classList.remove('is-hidden');
                    return; // Stop propagation
                }
            });

            // EMERGENCY FIX: Add specific listener for ticket view container as fallback
            if (dom.ticketViewContainer) {
                dom.ticketViewContainer.addEventListener('click', (e) => {
                    const backBtn = e.target.closest('[data-action="back-to-form"]');
                    if (backBtn) {
                        dom.ticketViewContainer.classList.add('is-hidden');
                        dom.actionColumn.classList.remove('is-hidden');
                    }
                });
            }
        }


        if (dom.modalContainer) dom.modalContainer.addEventListener('click', (e) => Handlers.handleModalClick(e));

        // Nâng cấp: Thêm trình nghe sự kiện cho widget người dùng
        if (dom.userProfileWidget) {
            dom.userProfileWidget.addEventListener('click', (e) => {
                const logoutButton = e.target.closest('[data-action="logout"]');
                if (logoutButton) Handlers.handleLogout();
            });
        }
    },

    // =========================================================================
    // MODULE 7.5: LOGIC XỬ LÝ VỊ TRÍ & ĐỒNG BỘ
    // =========================================================================
    async determineLocation(forceShowModal = false, locationIdFromUrl = null) {
        const AUTO_SELECT_RADIUS_KM = 0.1;
        const locations = state.locations || [];
        if (locations.length === 0) return UI.showToast('Lỗi cấu hình: Không có bãi xe.', 'error');
        if (locationIdFromUrl) {
            const found = locations.find(l => l.id === locationIdFromUrl);
            if (found) return this.selectLocation(found, false); // Không lưu vào localStorage
        }
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
            UI.showModal('location', { locations: locations.map(l => ({ ...l, distance: -1 })) });
        }
    },

    selectLocation(location, shouldSave = true) {
        state.currentLocation = location;
        if (shouldSave) {
            // Cập nhật URL thay vì lưu vào localStorage
            const url = new URL(window.location);
            url.searchParams.set('locationId', location.id);
            window.history.pushState({}, '', url);
        }
        UI.showToast(`Đã chọn bãi đỗ xe: ${location.name}`, 'success');
        UI.closeModal();
        // SỬA LỖI: Không gọi lại startApp() để tránh vòng lặp vô hạn.
        // Thay vào đó, chỉ cần tải dữ liệu cho bãi xe vừa chọn.
        this.fetchData();
        this.fetchWeather();
        this.setupRealtimeListeners();
    },

    async startApp() {
        try {
            // Bước 1: Luôn tải danh sách các bãi đỗ trước
            await Api.fetchLocations();

            // Bước 2: Tải trạng thái từ localStorage (nếu có)
            this.loadStateFromLocalStorage();

            // Bước 3: Xác định vị trí làm việc
            const urlParams = new URLSearchParams(window.location.search);
            const locationIdFromUrl = urlParams.get('locationId');
            const locationFromUrl = locationIdFromUrl ? state.locations.find(l => l.id === locationIdFromUrl) : null;

            if (locationFromUrl) {
                this.selectLocation(locationFromUrl, false);
            } else if (!state.currentLocation) {
                await this.determineLocation();
            }

            // Bước 4: Nếu đã có vị trí, tải dữ liệu và render giao diện
            if (!state.currentLocation) {
                // Nếu sau tất cả các bước vẫn không có vị trí, dừng lại.
                console.log("Chưa chọn vị trí, dừng khởi tạo.");
                return;
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

            // CẢI TIẾN: Xây dựng lại Map tra cứu nhanh
            state.vehicleMap.clear();
            vehicles.forEach(v => {
                // SỬA LỖI: Chỉ thêm vào map nếu chưa tồn tại.
                // Vì danh sách đã được sắp xếp theo thời gian giảm dần,
                // bản ghi đầu tiên gặp phải cho một biển số sẽ là bản ghi mới nhất.
                if (!state.vehicleMap.has(v.plate)) {
                    state.vehicleMap.set(v.plate, v);
                }
            });

            // ĐỒNG BỘ LẠI currentLocation NẾU BÃI ĐỖ ĐÃ BỊ SỬA TÊN / CẤU HÌNH TỪ ADMIN
            if (state.currentLocation?.id) {
                const updatedLoc = locations.find(l => l.id === state.currentLocation.id);
                if (updatedLoc) {
                    state.currentLocation = updatedLoc;
                }
            }

            // SỬA LỖI: Cập nhật lại state.selectedVehicle từ danh sách mới
            // Điều này ngăn chặn việc UI bị reset (và modal bị đóng) khi auto-refresh chạy
            if (state.selectedPlate) {
                const refreshedVehicle = state.vehicles.find(v => v.plate === state.selectedPlate && v.status === 'Đang gửi');
                if (refreshedVehicle) {
                    state.selectedVehicle = { data: refreshedVehicle, status: 'parking' };
                } else if (!state.selectedVehicle || state.selectedVehicle.status !== 'new') {
                    // Nếu không tìm thấy xe đang gửi, và không phải đang nhập xe mới -> Reset
                    // (Nhưng nếu đang nhập xe mới, giữ nguyên để không mất dữ liệu form)
                    if (state.filterTerm === state.selectedPlate) { // Chỉ reset nếu đang filter theo biển số này
                        // state.selectedVehicle = null; // Tạm thời disable reset để tránh nháy
                    }
                }
            }

            if (state.isOnline) this.saveStateToLocalStorage();
        } catch (error) {
            UI.showToast(error.message, 'error');
            if (!state.isOnline) console.log("Offline: Using local data.");
            else { state.vehicles = []; state.alerts = {}; }
        } finally {
            state.isLoading = false;
            UI.renderApp();
            if (!isSilent) {
                UI.showDataSyncIndicator(); // Hiển thị chỉ báo khi tải xong
            }
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
            // KHÔNG LƯU currentLocation nữa để tránh xung đột
            const stateToSave = {
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
                // SỬA: Không khôi phục currentDate để luôn mặc định là hôm nay
                /*
                if (parsedState.currentDate) {
                    state.currentDate = new Date(parsedState.currentDate);
                    // Update date picker text if exists
                    const dateDisplay = document.getElementById('current-date');
                    if (dateDisplay) {
                        dateDisplay.textContent = Utils.formatDate(state.currentDate);
                    }
                }
                */
                // Chỉ tải các trạng thái không phụ thuộc vào bãi xe
                if (parsedState.vehicles) state.vehicles = parsedState.vehicles;
                if (parsedState.alerts) state.alerts = parsedState.alerts;
                if (parsedState.syncQueue) state.syncQueue = parsedState.syncQueue;
                return true;
            }
        } catch (e) {
            console.error("Error loading state from localStorage", e);
            localStorage.removeItem('appState');
        }
        return false;
    },

    handleLogout() {
        localStorage.removeItem('staffInfo');
        this.renderUserProfile(); // Cập nhật lại giao diện widget
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

    setupRealtimeListeners() {
        if (!state.isOnline) {
            console.log("Offline mode: Skipping realtime listener setup.");
            return;
        }

        // SỬA LỖI: Xóa kênh cũ trước khi tạo kênh mới để tránh listener bị trùng lặp khi đổi bãi xe.
        if (state.realtimeChannel) {
            db.removeChannel(state.realtimeChannel);
            state.realtimeChannel = null;
            console.log('Realtime: Đã xóa kênh lắng nghe cũ.');
        }

        if (!state.currentLocation?.id) {
            console.log("Realtime: Chưa chọn bãi xe, bỏ qua việc lắng nghe.");
            return;
        }

        // SỬA LỖI: Sử dụng lại kênh chung để nhận tín hiệu broadcast từ admin.
        const channel = db.channel('he-thong-trong-xe-realtime');
        state.realtimeChannel = channel; // Lưu lại kênh hiện tại

        channel
            // 1. Lắng nghe thay đổi trực tiếp từ bảng transactions
            .on(
                'postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'transactions',
                // SỬA LỖI: Chỉ lắng nghe các thay đổi thuộc về bãi xe hiện tại.
                filter: `location_id=eq.${state.currentLocation.id}`
            },
                (payload) => {
                    console.log('Realtime: Phát hiện thay đổi trên bảng transactions.', payload);
                    const handleTransactionChange = (record) => {
                        const index = state.vehicles.findIndex(v => v.unique_id === record.unique_id);

                        if (payload.eventType === 'INSERT') {
                            if (index === -1) {
                                state.vehicles.unshift(record);
                                state.vehicleMap.set(record.plate, record); // Cập nhật Map
                                UI.renderVehicleList(); // Vẽ lại toàn bộ danh sách để chèn mục mới
                            }
                        } else if (payload.eventType === 'UPDATE') {
                            if (index > -1) {
                                // Cập nhật state
                                Object.assign(state.vehicles[index], record);
                                state.vehicleMap.set(record.plate, state.vehicles[index]); // Cập nhật Map
                                // "PHẪU THUẬT" DOM, KHÔNG RENDER LẠI TOÀN BỘ
                                // SỬA LỖI: Gọi hàm cập nhật giao diện cho xe đã rời bãi
                                const nodeToUpdate = dom.vehicleListContainer.querySelector(`[data-id="${record.unique_id}"]`);
                                if (nodeToUpdate) UI.updateVehicleItemDOM(nodeToUpdate, record);
                            }
                        } else if (payload.eventType === 'DELETE') {
                            if (index > -1) {
                                const oldRecord = state.vehicles[index];
                                state.vehicles.splice(index, 1); // Xóa khỏi state
                                state.vehicleMap.delete(oldRecord.plate); // Cập nhật Map
                                const nodeToRemove = dom.vehicleListContainer.querySelector(`[data-id="${oldRecord.unique_id}"]`);
                                if (nodeToRemove) nodeToRemove.remove(); // Xóa khỏi DOM
                            }
                        }
                    };

                    // Supabase gửi cả `new` và `old` cho UPDATE và DELETE
                    const record = payload.new || payload.old;
                    if (record) {
                        handleTransactionChange(record);
                    }
                    // Vẽ lại các thành phần bị ảnh hưởng mà không tải lại toàn bộ trang
                    UI.renderDashboard(); // Bảng tin nhanh vẫn cần cập nhật
                    UI.showDataSyncIndicator();
                }
            )
            // 2. Lắng nghe thay đổi trên bảng security_alerts
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'security_alerts'
                },
                (payload) => {
                    console.log('Realtime: Phát hiện thay đổi trên bảng security_alerts.', payload);
                    // Chỉ cần tải lại cảnh báo và render lại giao diện là đủ
                    Api.fetchAlerts().then(alerts => {
                        state.alerts = alerts;
                        UI.renderApp();
                        UI.showDataSyncIndicator();
                    });
                }
            )
            // 3. Lắng nghe thay đổi trên bảng locations (cấu hình bãi đỗ)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'locations'
                },
                (payload) => {
                    console.log('Realtime: Phát hiện thay đổi trên bảng locations.', payload);
                    Api.fetchLocations().then(locations => {
                        state.locations = locations;
                        if (state.currentLocation?.id) {
                            const updatedLoc = locations.find(l => l.id === state.currentLocation.id);
                            if (updatedLoc) {
                                state.currentLocation = updatedLoc;
                            }
                        }
                        UI.renderApp();
                        UI.showDataSyncIndicator();
                    });
                }
            )
            // 4. Lắng nghe tín hiệu broadcast tổng quát
            .on(
                'broadcast',
                {
                    event: 'data_changed'
                },
                (payload) => {
                    console.log('Realtime: Nhận tín hiệu broadcast.', payload);
                    this.fetchData(true);
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') console.log('✅ Realtime: Đã kết nối và sẵn sàng nhận tín hiệu!');
            });
    },

    applySavedTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        dom.themeCheckbox.checked = savedTheme === 'dark';
        Handlers.handleThemeChange();
    },

    updateClock() {
        if (dom.clockWidget) {
            dom.clockWidget.textContent = Utils.getSyncedTime().toLocaleTimeString('vi-VN');
        }
    },

    updateLiveDurationsAndFees() {
        document.querySelectorAll('.live-duration').forEach(el => {
            el.textContent = Utils.calculateDuration(el.dataset.starttime);
        });
        document.querySelectorAll('.live-fee').forEach(el => {
            const isVIP = el.dataset.isvip === 'true';
            const vehicleId = el.closest('[data-id]')?.dataset.id;
            const vehicleData = state.vehicles.find(v => v.unique_id === vehicleId);
            if (vehicleData) el.textContent = Utils.formatCurrency(FeeCalculator.calculate(vehicleData, Utils.getSyncedTime(), state.currentLocation)) + 'đ';
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
    },

    // NÂNG CẤP: Đồng bộ thời gian từ API quốc tế
    async syncTime() {
        try {
            const response = await fetch('https://worldtimeapi.org/api/timezone/Asia/Ho_Chi_Minh');
            const data = await response.json();
            const serverTime = new Date(data.utc_datetime).getTime();
            state.serverTimeOffset = serverTime - Date.now();
            console.log('✅ Đã đồng bộ thời gian. Offset:', state.serverTimeOffset, 'ms');
        } catch (error) {
            console.warn('⚠️ Lỗi đồng bộ thời gian, sử dụng giờ thiết bị:', error);
            state.serverTimeOffset = 0;
        }
    },

    async init() {
        console.log("Khởi động ứng dụng...");

        // SỬA LỖI: Đồng bộ thời gian ngay khi khởi động
        await this.syncTime();

        configPromise.then(() => {
            this.setupEventListeners();
            this.applySavedTheme();
            this.updateClock();

            // Khởi tạo các vòng lặp cập nhật
            setInterval(() => this.updateClock(), 1000); // Đồng hồ
            setInterval(() => this.updateLiveDurationsAndFees(), 1000); // Live update
            setInterval(() => Api.processSyncQueue(), 30000); // Sync queue mỗi 30s

            window.addEventListener('online', () => this.handleConnectionChange && this.handleConnectionChange(true));
            window.addEventListener('offline', () => this.handleConnectionChange && this.handleConnectionChange(false));

            // KHÔI PHỤC & CẢI TIẾN: Tự động đồng bộ dữ liệu theo chu kỳ
            const refreshIntervalMs = (APP_CONFIG.autoRefreshInterval || 30000);
            setInterval(async () => {
                if (!state.isOnline || isBackgroundRefreshing) return;
                try {
                    isBackgroundRefreshing = true;
                    await this.fetchData(true);
                } finally {
                    isBackgroundRefreshing = false;
                }
            }, refreshIntervalMs);

            this.startApp();
        });
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
            App.setupEventListeners();
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
// Thêm hàm này vào tệp main.js của bạn
// Gán hàm này vào đối tượng window để mã trong index.html có thể gọi được
window.updateFeeModeDisplay = UI.updateFeeModeDisplay.bind(UI);
window.App = App;
