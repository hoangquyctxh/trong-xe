/**
 * =========================================================================
 * HỆ THỐNG QUẢN LÝ XE TÌNH NGUYỆN - PHIÊN BẢN 5.0 (FINAL)
 * Tác giả: Nguyễn Cao Hoàng Quý (Được hỗ trợ bởi Gemini Code Assist)
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
        datePicker: document.getElementById('date-picker'),
        themeCheckbox: document.getElementById('theme-checkbox'),
        clockWidget: document.getElementById('clock-widget'),
        weatherWidget: document.getElementById('weather-widget'),
        
        // Main Form
        searchTermInput: document.getElementById('search-term'),
        micBtn: document.getElementById('mic-btn'),
        scanQrBtn: document.getElementById('scan-qr-btn'),
        formNewVehicle: document.getElementById('form-new-vehicle'),
        phoneNumberInput: document.getElementById('phone-number'),
        plateSuggestions: document.getElementById('plate-suggestions'), // MỚI
        isVipCheckbox: document.getElementById('is-vip-checkbox'),
        actionButtonsContainer: document.getElementById('action-buttons-container'),

        // Info Panel
        vehicleInfoPanel: document.getElementById('vehicle-info-panel'),
        selectedVehicleAlert: document.getElementById('selected-vehicle-alert'),
        infoDetailsGrid: document.getElementById('info-details-grid'),
        infoHistoryList: document.getElementById('info-history-list'),

        // Dashboard
        dashboardGrid: document.getElementById('dashboard-grid'),
        statusPieChartCanvas: document.getElementById('status-pie-chart'), // MỚI

        // Vehicle List
        listTitle: document.getElementById('list-title'),
        filterInput: document.getElementById('filter-input'),
        vehicleListContainer: document.getElementById('vehicle-list-container'),
        paginationControls: document.getElementById('pagination-controls'), // MỚI

        // Modals & Toasts
        modalContainer: document.getElementById('modal-container'),
        toastContainer: document.getElementById('toast-container'),
        globalAlertStrip: document.getElementById('global-alert-strip'),

        // MỚI: Các phần tử cho màn hình chờ
        idleScreen: document.getElementById('idle-screen'),
        adVideoPlayer: document.getElementById('ad-video-player'),
    };
    const state = {
        locations: [], // MỚI: Lưu trữ danh sách bãi đỗ từ DB
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
        // MỚI: Trạng thái cho phân trang
        currentPage: 1,
        itemsPerPage: 15, // Số xe hiển thị trên mỗi trang
        cameraStream: null,
        scanAnimation: null,
        statusPieChart: null, // MỚI: Biến để lưu trữ instance của biểu đồ tròn
        // MỚI: Trạng thái cho màn hình chờ
        idleTimer: null,
        adVideoIndex: 0,
        isIdle: false,
    };

    // =========================================================================
    // MODULE 2: API SERVICES - GIAO TIẾP VỚI SUPABASE & GOOGLE SCRIPT
    // =========================================================================
    const Api = {
        async fetchVehiclesForDate(date) {
            const dateStr = date.toISOString().slice(0, 10);
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

        // SỬA LỖI: Hàm checkIn giờ sẽ nhận uniqueID được tạo sẵn cho trường hợp thu phí trước
        async checkIn(plate, phone, isVIP, prePayment = null, providedUniqueID = null) {
            const uniqueID = providedUniqueID || ('_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36));
            const entryTime = new Date();
            const transactionData = {
                plate, phone, is_vip: isVIP,
                unique_id: uniqueID,
                location_id: state.currentLocation.id,
                entry_time: entryTime.toISOString(),
                status: 'Đang gửi',
                // NÂNG CẤP: Ghi nhận thông tin thanh toán trước nếu có
                fee: prePayment ? prePayment.fee : null,
                payment_method: prePayment ? prePayment.method : null,
            };
            const { error } = await db.from('transactions').insert([transactionData]);
            if (error) throw new Error(`Lỗi check-in: ${error.message}. Xe [${plate}] có thể đã tồn tại trong bãi.`);
            return transactionData;
        },

        async checkOut(uniqueID, fee, paymentMethod) {
            const { error } = await db.from('transactions').update({
                exit_time: new Date().toISOString(),
                status: 'Đã rời bãi',
                fee, payment_method: paymentMethod
            }).eq('unique_id', uniqueID); // SỬA LỖI: Bỏ .eq('status', 'Đang gửi') để đảm bảo luôn checkout được
            if (error) throw new Error(`Lỗi check-out: ${error.message}. Giao dịch có thể đã được xử lý.`);
            return true;
        },
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
            this.renderHeader();
            this.renderActionButtons();
            this.renderVehicleInfoPanel();
            this.renderDashboard();
            this.renderVehicleList();
        },

        renderHeader() {
            // NÂNG CẤP TOÀN DIỆN: Hiển thị tên sự kiện và trạng thái thu phí
            let headerText = state.currentLocation?.name || 'Chưa xác định';
            
            if (state.currentLocation?.event_name) {
                headerText += ` - <strong style="color: var(--primary-accent);">${state.currentLocation.event_name}</strong>`;
            }

            // Hiển thị loại hình thu phí
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

            dom.locationSubtitle.innerHTML = `${headerText} `; // Sử dụng innerHTML để render các thẻ HTML

            dom.datePicker.value = state.currentDate.toISOString().slice(0, 10);
            dom.listTitle.textContent = `Danh sách xe ngày ${state.currentDate.toLocaleDateString('vi-VN')}`;
            dom.changeLocationBtn.hidden = !state.currentLocation;
        },

        // MỚI: Hàm render danh sách gợi ý
        renderSuggestions(term) {
            if (!term || term.length < 2) {
                dom.plateSuggestions.classList.remove('visible');
                return;
            }

            const suggestions = state.vehicles
                .filter(v => v.plate.toUpperCase().startsWith(term.toUpperCase()))
                .map(v => v.plate)
                .filter((value, index, self) => self.indexOf(value) === index) // Lọc các biển số trùng lặp
                .slice(0, 5); // Giới hạn 5 gợi ý

            dom.plateSuggestions.innerHTML = suggestions.map(s => `<div class="suggestion-item" data-plate="${s}">${s}</div>`).join('');
            dom.plateSuggestions.classList.toggle('visible', suggestions.length > 0);
        },

        renderActionButtons() {
            let buttonsHtml = '';
            if (state.selectedVehicle) {
                const alert = state.alerts[state.selectedPlate];
                let alertHtml = '';
                let isDisabled = false;

                // NÂNG CẤP: Hiển thị cảnh báo ngay trên nút bấm
                if (alert && (state.selectedVehicle.status === 'parking' || state.selectedVehicle.status === 'new')) {
                    alertHtml = `
                        <div class="action-alert-box alert-${alert.level}">
                            <div class="action-alert-header">
                                <svg class="alert-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                Cảnh báo với xe ${state.selectedPlate}
                            </div>
                            <div class="action-alert-reason">${alert.reason || 'Không có lý do cụ thể.'}</div>
                        </div>
                    `;
                    if (alert.level === 'block') {
                        isDisabled = true;
                    }
                }

                switch (state.selectedVehicle.status) {
                    case 'new':
                        buttonsHtml = alertHtml + Templates.checkInButton();
                        break;
                    case 'parking':
                        buttonsHtml = alertHtml + Templates.checkOutButton(isDisabled);
                        break;
                    case 'departed':
                        buttonsHtml = Templates.reprintButton();
                        break;
                    case 'parking_remote':
                        buttonsHtml = '';
                        break;
                }
            }
            dom.actionButtonsContainer.innerHTML = buttonsHtml;
        },

        renderVehicleInfoPanel() {
            if (!state.selectedVehicle) {
                dom.vehicleInfoPanel.hidden = true;
                return;
            }
            dom.vehicleInfoPanel.hidden = false;
            const { data, status } = state.selectedVehicle;            
            dom.selectedVehicleAlert.hidden = true; // NÂNG CẤP: Đã di chuyển cảnh báo lên khu vực nút bấm

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
            } else if (status === 'departed') {
                detailsHtml = `
                    ${Templates.infoItem('Trạng thái', '<span class="status-badge departed">Đã rời bãi</span>')}
                    ${Templates.infoItem('Giờ vào', Utils.formatDateTime(data.entry_time))}
                    ${Templates.infoItem('Giờ ra', Utils.formatDateTime(data.exit_time))}
                    ${Templates.infoItem('Tổng thời gian', Utils.calculateDuration(data.entry_time, data.exit_time))}
                    ${Templates.infoItem('Phí đã trả', `<strong>${Utils.formatCurrency(data.fee)}đ</strong>`)}
                    ${Templates.infoItem('SĐT', Utils.formatPhone(data.phone))}
                `;
            }
            detailsHtml += Templates.infoItem('Nhận dạng', Utils.decodePlate(state.selectedPlate));
            dom.infoDetailsGrid.innerHTML = detailsHtml;

            Api.fetchHistory(state.selectedPlate).then(history => {
                dom.infoHistoryList.innerHTML = history.length > 0
                    ? history.map(Templates.historyItem).join('')
                    : '<li>Chưa có lịch sử.</li>';
            }).catch(err => {
                dom.infoHistoryList.innerHTML = `<li>Lỗi tải lịch sử.</li>`;
                console.error(err);
            });
        },

        renderDashboard() {
            const parkingVehicles = state.vehicles.filter(v => v.status === 'Đang gửi');
            const departedVehicles = state.vehicles.filter(v => v.status === 'Đã rời bãi');
            const activeAlertCount = Object.keys(state.alerts).length; // Đếm số cảnh báo đang hoạt động
            const totalToday = state.vehicles.length;
            const longestParking = parkingVehicles.length > 0 
                ? parkingVehicles.reduce((a, b) => new Date(a.entry_time) < new Date(b.entry_time) ? a : b)
                : null;
            
            // NÂNG CẤP: Tích hợp biểu đồ nhỏ vào thẻ "Xe hiện tại"
            // NÂNG CẤP: Thêm thẻ thống kê cảnh báo
            const statItemsHtml = `
                ${Templates.statItemWithChart('Xe hiện tại', parkingVehicles.length, 'current-vehicles-chart')}
                ${Templates.statItem('Tổng lượt trong ngày', totalToday)}
                ${Templates.statItem('Xe gửi lâu nhất', longestParking ? `<span class="live-duration" data-starttime="${longestParking.entry_time}">${Utils.calculateDuration(longestParking.entry_time)}</span>` : '--')}
            `;
            
            dom.dashboardGrid.innerHTML = statItemsHtml;

            // Sau khi HTML được chèn, lấy tham chiếu đến canvas của biểu đồ nhỏ
            const chartCanvas = document.getElementById('current-vehicles-chart');

            // Cập nhật hoặc tạo biểu đồ vành khuyên (doughnut)
            const chartData = {
                labels: ['Đang gửi', 'Còn lại'],
                datasets: [{
                    data: [parkingVehicles.length, Math.max(0, totalToday - parkingVehicles.length)],
                    // NÂNG CẤP: Màu sắc mới cho biểu đồ nhỏ
                    backgroundColor: ['var(--youth-union-blue)', 'var(--border-color)'],
                    borderColor: 'var(--bg-card)', // Thêm viền trắng để tách các phần
                    borderWidth: 2,
                    cutout: '70%', // Làm cho biểu đồ thành dạng vành khuyên
                }]
            };

            if (chartCanvas) {
                // Hủy biểu đồ cũ nếu có để tránh lỗi memory leak
                if (state.statusPieChart) {
                    state.statusPieChart.destroy();
                }
                
                state.statusPieChart = new Chart(chartCanvas, {
                    type: 'doughnut', // Sử dụng loại biểu đồ doughnut
                    data: chartData,
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false, 
                        plugins: { 
                            legend: { display: false }, // Ẩn chú thích
                            tooltip: { enabled: false } // Tắt tooltip cho gọn
                        } 
                    }
                });
            }
        },

        renderVehicleList() {
            // NÂNG CẤP: Logic phân trang
            const filteredVehicles = state.vehicles.filter(v => {
                const term = state.filterTerm.toUpperCase();
                if (!term) return true;
                return v.plate.toUpperCase().includes(term) || v.phone?.includes(term);
            });

            // Tính toán các biến phân trang
            const totalItems = filteredVehicles.length;
            const totalPages = Math.ceil(totalItems / state.itemsPerPage);
            if (state.currentPage > totalPages && totalPages > 0) {
                state.currentPage = totalPages; // Đảm bảo trang hiện tại không vượt quá tổng số trang
            }
            const startIndex = (state.currentPage - 1) * state.itemsPerPage;
            const endIndex = startIndex + state.itemsPerPage;
            const paginatedVehicles = filteredVehicles.slice(startIndex, endIndex);

            if (state.isLoading) {
                dom.vehicleListContainer.innerHTML = Array(5).fill(Templates.skeletonItem()).join('');
                dom.paginationControls.innerHTML = ''; // Ẩn phân trang khi đang tải
                return;
            }
            if (paginatedVehicles.length === 0) {
                dom.vehicleListContainer.innerHTML = Templates.emptyState('Không có xe nào trong danh sách.');
                dom.paginationControls.innerHTML = ''; // Ẩn phân trang khi không có xe
                return;
            }
            dom.vehicleListContainer.innerHTML = paginatedVehicles.map(v => Templates.vehicleItem(v, state.alerts)).join('');
            
            // "Vẽ" các nút điều khiển phân trang
            this.renderPagination(totalPages, state.currentPage);
        },

        // MỚI: Hàm render các nút điều khiển phân trang
        renderPagination(totalPages, currentPage) {
            if (totalPages <= 1) {
                dom.paginationControls.innerHTML = '';
                return;
            }

            let paginationHtml = `<button class="pagination-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>&laquo; Trước</button>`;
            
            // Logic hiển thị số trang (ví dụ đơn giản)
            for (let i = 1; i <= totalPages; i++) {
                // Nâng cao hơn có thể thêm dấu "..." nếu có quá nhiều trang
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
                case 'receipt':
                    modalHtml = Templates.receiptModal(data);
                    break;
                case 'checkInReceipt':
                    // NÂNG CẤP TOÀN DIỆN: Giao diện vé điện tử "Premium" mới
                    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data.unique_id)}`;
                    const content = `
                        <div class="eticket-wrapper" id="printable-checkin-receipt">
                            <div class="eticket-header">
                                <img src="https://cdn.haitrieu.com/wp-content/uploads/2021/11/Logo-Doan-Thanh-NIen-Cong-San-Ho-Chi-Minh-1.png" alt="Logo Đoàn Thanh niên">
                                <h3>${APP_CONFIG.organizationName || 'ĐOÀN TNCS HỒ CHÍ MINH'}</h3>
                            </div>
                            <div class="eticket-body">
                                <div class="eticket-main">
                                    <div class="eticket-qr">
                                        <img src="${qrApiUrl}" alt="Mã QR để lấy xe">
                                    </div>
                                    <div class="eticket-plate">${data.plate}</div>
                                    <p class="eticket-instruction">Quét mã QR này tại cổng ra để lấy xe</p>
                                </div>
                                <div class="eticket-stub">
                                    <div class="eticket-stub-item"><span>Bãi đỗ</span><strong>${state.currentLocation?.name || 'N/A'}</strong></div>
                                    <div class="eticket-stub-item"><span>Giờ vào</span><strong>${Utils.formatDateTime(data.entry_time)}</strong></div>
                                    <div class="eticket-stub-item"><span>Mã vé</span><strong>${data.unique_id}</strong></div>
                                </div>
                            </div>
                        </div>`;
                    const footer = `<button class="action-button btn--secondary" data-action="close-modal">Đóng</button><button class="action-button btn--reprint" data-action="print-checkin-receipt"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"/></svg><span>In vé</span></button>`;
                    modalHtml = Templates.modal('Gửi xe thành công', content, footer, '420px');
                    break;
                // NÂNG CẤP: Thêm case cho modal cảnh báo toàn cục
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
        
        // NÂNG CẤP: Hàm hiển thị modal cảnh báo toàn cục
        showGlobalAlertModal(alert) {
            if (!alert || !alert.plate) return; // SỬA LỖI: Kiểm tra kỹ hơn để tránh lỗi
            const title = 'Cảnh báo an ninh'; // NÂNG CẤP: Đồng nhất tiêu đề
            const modalHtml = Templates.globalAlertModal(title, alert.plate, alert.reason, alert.level);
            this.showModal('global-alert', { html: modalHtml }); // SỬA LỖI: Dùng `this.showModal` thay vì `UI.showModal`
        },
    };

    // =========================================================================
    // MODULE 4: TEMPLATES - CÁC MẪU HTML
    // =========================================================================
    const Templates = {
        checkInButton: () => `<button type="button" class="action-button btn--check-in" data-action="check-in"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg><span>Xác nhận Gửi xe</span></button>`,
        checkOutButton: (disabled = false) => `<button type="button" class="action-button btn--check-out" data-action="check-out" ${disabled ? 'disabled' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg><span>${disabled ? 'XE ĐANG BỊ CHẶN' : 'Xác nhận Lấy xe'}</span></button>`,
        reprintButton: () => `<button type="button" class="action-button btn--reprint" data-action="reprint"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg><span>Xem & In lại Biên lai</span></button>`,

        infoItem: (label, value) => `<div class="info-item"><span class="label">${label}</span><span class="value">${value}</span></div>`,
        
        historyItem: (entry) => {
            return `<li><div class="history-item"><div><div>Vào: ${Utils.formatDateTime(entry.entry_time)}</div><div>Ra: ${Utils.formatDateTime(entry.exit_time)}</div><div><strong>Thời gian: ${Utils.calculateDuration(entry.entry_time, entry.exit_time)}</strong></div></div></div></li>`;
        },
        statItem: (label, value) => `<div class="stat-item"><div class="label">${label}</div><div class="value">${value}</div></div>`,
        statItemWithChart: (label, value, canvasId) => `<div class="stat-item"><div class="label">${label}</div><div class="value">${value}</div><div class="stat-item-chart-wrapper"><canvas id="${canvasId}"></canvas></div></div>`,
        vehicleItem: (v, alerts) => {
            const alert = alerts[v.plate];
            let alertClass = '';
            let alertIcon = ''; // NÂNG CẤP: Thêm biến cho icon cảnh báo
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
            // NÂNG CẤP: Chỉ áp dụng max-width trên màn hình lớn hơn 600px để tránh tràn trên di động
            const style = window.innerWidth > 600 ? `style="max-width: ${maxWidth};"` : '';
            return `<div class="modal-overlay"><div class="modal-content" ${style}><div class="modal-header"><h2>${title}</h2><button class="modal-close-btn" data-action="close-modal">&times;</button></div><div class="modal-body">${content}</div><div class="modal-footer">${footer}</div></div></div>`;
        },

        locationModal(locations) {
            const locationItems = locations.map((loc, index) => {
                const isRecommended = index === 0 && loc.distance > -1 && loc.distance < 1;
                return `<div class="location-card ${isRecommended ? 'recommended' : ''}" data-action="select-location" data-location-id="${loc.id}">${isRecommended ? '<div class="recommended-badge">Gần nhất</div>' : ''}<div class="location-card-header"><h3>${loc.name}</h3>${loc.distance > -1 ? `<span class="distance-tag">~${(loc.distance * 1000).toFixed(0)}m</span>` : ''}</div><div class="location-card-body"><div class="location-detail"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg><span>${loc.address || 'Chưa có địa chỉ'}</span></div><div class="location-detail"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg><span>${loc.operatingHours || 'Hoạt động 24/7'}</span></div></div></div>`}).join('');
            const title = locations.some(l => l.distance > -1) ? 'Gợi ý Bãi đỗ xe gần bạn' : 'Vui lòng chọn Bãi đỗ xe';
            const content = `<p class="modal-subtitle">Hệ thống đã tự động sắp xếp các bãi xe theo thứ tự từ gần đến xa để bạn tiện lựa chọn.</p><div class="location-card-list">${locationItems}</div>`;
            return this.modal(title, content, '<button class="action-button btn--secondary" data-action="close-modal">Đóng</button>', '600px');
        },

        // NÂNG CẤP: Template cho modal cảnh báo toàn cục
        globalAlertModal(title, plate, reason, level) {
            // NÂNG CẤP: Giao diện mới với ô màu chứa biển số
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

        confirmationModal({ title, plate, reason, type }) {
            const isVip = type === 'vip';
            const icon = isVip ? `<svg class="priority-icon" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z"/></svg>` : `<svg class="priority-icon" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m14 9-4 4h4v4"/></svg>`;
            const passTitle = isVip ? 'XE ƯU TIÊN' : 'MIỄN PHÍ QUA CỔNG';
            const content = `<div class="priority-pass-wrapper ${isVip ? 'vip' : 'free'}"><div class="priority-pass-icon-area">${icon}</div><div class="priority-pass-details"><h3 class="priority-pass-title">${passTitle}</h3><div class="priority-pass-plate">${plate}</div><p class="priority-pass-reason">Lý do: <strong>${reason}</strong></p><p class="priority-pass-confirm-text">Xác nhận cho xe ra khỏi bãi?</p></div></div>`;
            const footer = `<button class="action-button btn--secondary" data-action="confirm-no">Hủy bỏ</button><button class="action-button ${isVip ? 'btn--reprint' : 'btn--check-in'}" data-action="confirm-yes"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>Xác nhận</span></button>`;
            return this.modal(title, content, footer, '400px');
        },

        receiptModal({ vehicle, fee, paymentMethod }) {
            const exitTime = new Date();
            const entryTime = new Date(vehicle.entry_time);
            const feeDetails = AdvancedUtils.calculateFeeWithBreakdown(entryTime, exitTime, vehicle.is_vip);
            const feeBreakdownHtml = (feeDetails.dayHours > 0 || feeDetails.nightHours > 0) ? `<div class="receipt-breakdown"><h4>Diễn giải tính phí</h4><div class="breakdown-item"><span>Giờ ban ngày (${Utils.formatCurrency(APP_CONFIG.fee.dayRate)}đ/h)</span><span>${feeDetails.dayHours} giờ</span></div><div class="breakdown-item"><span>Giờ ban đêm (${Utils.formatCurrency(APP_CONFIG.fee.nightRate)}đ/h)</span><span>${feeDetails.nightHours} giờ</span></div></div>` : '';
            const content = `<div class="receipt-wrapper" id="printable-receipt"><div class="receipt-header"><img src="https://cdn.haitrieu.com/wp-content/uploads/2021/11/Logo-Doan-Thanh-NIen-Cong-San-Ho-Chi-Minh-1.png" alt="Logo"><div class="receipt-org"><strong>ĐOÀN TNCS HỒ CHÍ MINH PHƯỜNG BA ĐÌNH</strong><span>${state.currentLocation?.name || ''}</span></div></div><h2 class="receipt-title">BIÊN LAI THANH TOÁN</h2><div class="receipt-info-grid"><div class="receipt-info-item"><span>Biển số xe</span><strong class="plate">${vehicle.plate}</strong></div><div class="receipt-info-item"><span>Giờ vào</span><strong>${Utils.formatDateTime(vehicle.entry_time)}</strong></div><div class="receipt-info-item"><span>Giờ ra</span><strong>${Utils.formatDateTime(exitTime)}</strong></div><div class="receipt-info-item"><span>Tổng thời gian</span><strong>${Utils.calculateDuration(entryTime, exitTime)}</strong></div></div>${feeBreakdownHtml}<div class="receipt-total"><div class="receipt-total-item"><span>Phương thức TT</span><strong>${paymentMethod}</strong></div><div class="receipt-total-item"><span>TỔNG CỘNG</span><strong class="final-fee">${Utils.formatCurrency(fee)}<span>đ</span></strong></div></div><div class="receipt-thankyou">Cảm ơn đã sử dụng dịch vụ!</div></div>`;
            const footer = `<button class="action-button btn--secondary" data-action="close-modal">Đóng</button><button class="action-button btn--reprint" data-action="print-receipt" data-plate="${vehicle.plate}" data-unique-id="${vehicle.unique_id}" data-entry-time="${vehicle.entry_time}" data-exit-time="${exitTime.toISOString()}" data-fee="${fee}" data-payment-method="${paymentMethod}" data-is-vip="${vehicle.is_vip}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"/></svg><span>In biên lai</span></button>`;
            return this.modal('Giao dịch hoàn tất', content, footer, '500px');
        },
    };

    // =========================================================================
    // MODULE 5: UTILITIES - CÁC HÀM TIỆN ÍCH
    // =========================================================================
    const Utils = {
        formatDateTime: (d) => d ? new Date(d).toLocaleString('vi-VN') : '--',
        formatCurrency: (n) => new Intl.NumberFormat('vi-VN').format(n || 0),
        formatPhone: (p) => p || 'Chưa có',
        cleanPlate: (p) => p ? p.toUpperCase().replace(/[^A-Z0-9]/g, '') : '',
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
            // NÂNG CẤP TOÀN DIỆN: Tính phí dựa trên chính sách của từng bãi đỗ
            const policyType = state.currentLocation?.fee_policy_type || 'free';
            const config = APP_CONFIG.fee;
            const locationConfig = state.currentLocation || {}; // Phí tùy chỉnh của bãi đỗ

            // Trường hợp miễn phí
            if (!config.enabled || isVIP || !startTime || policyType === 'free') {
                return 0;
            }

            // SỬA LỖI LOGIC NGHIÊM TRỌNG: Xử lý đúng cho cả thu phí trước và cập nhật động
            if (endTime === null) {
                const collectionPolicy = state.currentLocation?.fee_collection_policy || 'post_paid';
                // Chỉ trả về phí cố định nếu là chính sách THU PHÍ TRƯỚC
                if (collectionPolicy === 'pre_paid') {
                    if (policyType === 'per_entry') {
                        return locationConfig.fee_per_entry ?? config.entryFee ?? 0;
                    }
                    if (policyType === 'daily') {
                        return locationConfig.fee_daily ?? config.dailyFee ?? 0;
                    }
                    // Với loại hình "Theo giờ", không thể tính phí trước, trả về 0
                    return 0;
                }
                // Nếu không phải thu phí trước (tức là đang cập nhật động), thì coi endTime là hiện tại và tiếp tục tính toán bên dưới
            }

            const diffMinutes = Math.floor((new Date(endTime || new Date()) - new Date(startTime)) / (1000 * 60));
            if (diffMinutes <= config.freeMinutes) return 0;

            switch (policyType) {
                case 'per_entry':
                    return locationConfig.fee_per_entry ?? config.entryFee ?? 0;

                case 'daily':
                    const totalDays = Math.ceil((diffMinutes - config.freeMinutes) / (60 * 24));
                    const dailyFee = locationConfig.fee_daily ?? config.dailyFee ?? 0;
                    return dailyFee * Math.max(1, totalDays);

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
            const cleaned = Utils.cleanPlate(plate);
            const province = PLATE_DATA.provinces.find(p => p.codes.includes(cleaned.substring(0, 2)));
            return province ? province.name : 'Không xác định';
        },
        getLocationNameById: (id) => {
            if (!id || typeof LOCATIONS_CONFIG === 'undefined') return 'Không rõ';
            const location = state.locations.find(l => l.id === id);
            return location ? location.name : 'Không rõ';
        },
        getDistance: (lat1, lon1, lat2, lon2) => {
            const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
        },
        /**
         * TỐI ƯU HÓA TỐC ĐỘ: Nén ảnh trước khi xử lý.
         * Giảm kích thước ảnh xuống một mức hợp lý để tăng tốc độ đóng dấu và tải lên.
         * @param {string} base64Str - Chuỗi base64 của ảnh gốc.
         * @param {number} maxWidth - Chiều rộng tối đa mong muốn.
         * @returns {Promise<string>} - Chuỗi base64 của ảnh đã được nén.
         */
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
        async handleDateChange(e) {
            state.currentDate = new Date(e.target.value);
            App.saveStateToLocalStorage();
            await App.fetchData();
        },

        handleFilterChange(e) {
            state.filterTerm = e.target.value;
            state.currentPage = 1; // Reset về trang 1 khi lọc
            UI.renderVehicleList();
        },

        async handleSearchTermChange(e) {
            const plate = Utils.cleanPlate(e.target.value);
            state.selectedPlate = plate;

            if (plate.length < 4) {
                state.selectedVehicle = null;
                UI.renderActionButtons();
                UI.renderVehicleInfoPanel();
                UI.renderSuggestions(''); // MỚI: Ẩn gợi ý
                return;
            }

            const foundParking = state.vehicles.find(v => v.plate === plate && v.status === 'Đang gửi');
            if (foundParking) {
                state.selectedVehicle = { data: foundParking, status: 'parking' };
                UI.renderActionButtons();
                // NÂNG CẤP: Hiển thị modal cảnh báo toàn cục nếu có
                const alert = state.alerts[plate];
                if (alert) UI.showGlobalAlertModal(alert);
                UI.renderVehicleInfoPanel();
                return;
            }

            const foundDeparted = state.vehicles.find(v => v.plate === plate && v.status === 'Đã rời bãi');
            if (foundDeparted) {
                state.selectedVehicle = { data: foundDeparted, status: 'departed' };
                UI.renderActionButtons();
                UI.renderVehicleInfoPanel();
                return;
            }

            try {
                const globalVehicle = await Api.findVehicleGlobally(plate);
                if (globalVehicle) {
                    state.selectedVehicle = { data: globalVehicle, status: 'parking_remote' };
                } else {
                    state.selectedVehicle = { data: null, status: 'new' };
                }
            } catch (error) {
                UI.showToast(error.message, 'error');
                state.selectedVehicle = { data: null, status: 'new' };
            } finally {
                UI.renderActionButtons();
                UI.renderVehicleInfoPanel();
                // MỚI: Hiển thị gợi ý dựa trên những gì người dùng đang gõ
                // Chỉ hiển thị khi xe chưa được tìm thấy (trạng thái 'new' hoặc 'parking_remote')
                if (state.selectedVehicle?.status === 'new' || state.selectedVehicle?.status === 'parking_remote') UI.renderSuggestions(plate);
            }
        },

        // MỚI: Hàm xử lý khi click vào nút phân trang
        handlePaginationClick(e) {
            const button = e.target.closest('.pagination-btn');
            if (!button || button.disabled) return;

            const newPage = parseInt(button.dataset.page, 10);
            state.currentPage = newPage;
            UI.renderVehicleList(); // "Vẽ" lại danh sách xe cho trang mới
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
            if (!['check-in', 'check-out', 'reprint'].includes(action)) {
                return;
            }

            if (state.isProcessing) return;
            
            state.isProcessing = true;
            button.disabled = true;
            button.innerHTML = '<span>Đang xử lý...</span>';
            
            try {
                switch (action) {
                    case 'check-in':
                        await this.processCheckIn();
                        break;
                    case 'check-out':
                        await this.processCheckOut();
                        break;
                    case 'reprint':
                        this.processReprint();
                        state.isProcessing = false;
                        UI.renderActionButtons();
                        break;
                }
            } catch (error) {
                UI.showToast(error.message, 'error');
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

            const phone = dom.phoneNumberInput.value.trim();
            const isVIP = dom.isVipCheckbox.checked;

            const feeCollectionPolicy = state.currentLocation?.fee_collection_policy || 'post_paid';
            const feePolicyType = state.currentLocation?.fee_policy_type || 'free';

            let newTransaction; // Biến để lưu giao dịch mới tạo

            // Kịch bản 1: Bãi đỗ có chính sách "Miễn phí" (feePolicyType === 'free')
            if (feePolicyType === 'free') {
                const reason = isVIP ? 'Khách VIP' : 'Miễn phí';
                newTransaction = await Api.checkIn(plate, phone, isVIP, { fee: 0, method: reason });
                UI.showToast(`Xe ${plate} đã được gửi miễn phí.`, 'success');
                UI.showModal('checkInReceipt', newTransaction); // Hiển thị vé điện tử
            }
            // Kịch bản 2: Bãi đỗ yêu cầu "Thu phí trước" (pre_paid)
            else if (feeCollectionPolicy === 'pre_paid') {
                const calculatedFee = Utils.calculateFee(new Date(), null, isVIP);

                // Kịch bản 2a: Phí > 0, cần thanh toán qua modal
                if (calculatedFee > 0) {
                    // SỬA LỖI: Tạo uniqueID trước khi hiển thị modal thanh toán
                    const uniqueID = '_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

                    const paymentResult = await new Promise((resolve) => {
                        const vehicleDataForPayment = { plate, entry_time: new Date().toISOString(), unique_id: uniqueID };
                        UI.showModal('payment', { fee: calculatedFee, vehicle: vehicleDataForPayment });
                        const modalClickHandler = (e) => {
                            const action = e.target.closest('[data-action]')?.dataset.action;
                            if (action === 'complete-payment') {
                                const method = e.target.closest('[data-method]')?.dataset.method;
                                dom.modalContainer.removeEventListener('click', modalClickHandler);
                                resolve({ fee: calculatedFee, method });
                            } else if (action === 'close-modal' || e.target.classList.contains('modal-overlay')) {
                                dom.modalContainer.removeEventListener('click', modalClickHandler);
                                resolve(null); // Người dùng hủy thanh toán
                            }
                        };
                        dom.modalContainer.addEventListener('click', modalClickHandler);
                    });

                    if (!paymentResult) throw new Error('Đã hủy thao tác gửi xe.'); // Nếu người dùng hủy, dừng quá trình
                    
                    // SỬA LỖI: Truyền uniqueID đã tạo vào hàm checkIn
                    // Lưu ý: Hàm checkIn cần được điều chỉnh để nhận và sử dụng uniqueID này
                    newTransaction = await Api.checkIn(plate, phone, isVIP, paymentResult, uniqueID);
                    UI.showToast(`Đã thu phí trước ${Utils.formatCurrency(paymentResult.fee)}đ cho xe ${plate}.`, 'success');
                    UI.showModal('checkInReceipt', newTransaction); // Hiển thị vé điện tử
                }
                // Kịch bản 2b: Phí = 0 (do VIP, hoặc miễn phí theo chính sách bãi đỗ)
                else {
                    const reason = isVIP ? 'Khách VIP' : 'Miễn phí';
                    newTransaction = await Api.checkIn(plate, phone, isVIP, { fee: 0, method: reason });
                    UI.showToast(`Xe ${plate} đã được gửi miễn phí (thu phí trước).`, 'success');
                    UI.showModal('checkInReceipt', newTransaction); // Hiển thị vé điện tử
                }
            }
            // Kịch bản 3: Bãi đỗ yêu cầu "Thu phí sau" (post_paid - mặc định)
            else { // feeCollectionPolicy === 'post_paid'
                newTransaction = await Api.checkIn(plate, phone, isVIP);
                UI.showModal('checkInReceipt', newTransaction); // Hiển thị vé điện tử
            }

            // Reset form và tải lại dữ liệu sau khi hoàn tất
            dom.searchTermInput.value = ''; 
            dom.searchTermInput.dispatchEvent(new Event('input', { bubbles: true })); 
            await App.fetchData(true);
        },

        async processCheckOut() {
            const vehicle = state.selectedVehicle?.data;
            if (!vehicle) throw new Error('Không có thông tin xe để lấy ra.');

            const alert = state.alerts[vehicle.plate];
            if (alert?.level === 'block') {
                throw new Error(`XE BỊ CHẶN: ${alert.reason}`);
            }

            // NÂNG CẤP: Kiểm tra xem xe đã thanh toán trước chưa (fee không phải là null)
            if (vehicle.fee !== null && vehicle.payment_method) { // Kiểm tra fee !== null để bao gồm cả trường hợp phí 0đ đã được ghi nhận
                // SỬA LỖI TRIỆT ĐỂ: Chỉ hiển thị modal xác nhận, KHÔNG checkout ngay.
                // Việc checkout sẽ được xử lý bởi processConfirmation() khi người dùng nhấn nút trong modal.
                UI.showModal('confirmation', { title: 'Xác nhận cho xe ra', plate: vehicle.plate, reason: 'Đã thanh toán trước', type: 'free' });
                
                return; // Kết thúc sớm quy trình
            }

            const isVIP = vehicle.is_vip;
            const fee = Utils.calculateFee(vehicle.entry_time, null, isVIP);

            if (fee > 0) {
                UI.showModal('payment', { fee, vehicle });
            } else {
                const reason = isVIP ? 'Khách VIP' : 'Miễn phí';
                const type = isVIP ? 'vip' : 'free';
                try {
                    // SỬA LỖI TRIỆT ĐỂ: Chỉ hiển thị modal. Việc xử lý sẽ được thực hiện
                    // bởi handleModalClick khi người dùng nhấn nút trong modal.
                    UI.showModal('confirmation', { title: 'Xác nhận Miễn phí', plate: vehicle.plate, reason, type });
                    
                } catch (error) {
                    if (error.message !== 'User cancelled') UI.showToast(error.message, 'error');
                    state.isProcessing = false;
                    UI.renderActionButtons();
                    UI.closeModal();
                }
            }
        },

        processReprint() {
            const vehicle = state.selectedVehicle?.data;
            if (!vehicle || state.selectedVehicle.status !== 'departed') {
                UI.showToast('Chức năng này chỉ dành cho xe đã rời bãi.', 'error');
                return;
            }

            const fee = vehicle.fee || 0;
            const exitTime = new Date(vehicle.exit_time);
            const entryTime = new Date(vehicle.entry_time);
            const feeDetails = AdvancedUtils.calculateFeeWithBreakdown(entryTime, exitTime, vehicle.is_vip);
            
            const params = new URLSearchParams({
                orgName: 'ĐOÀN TNCS HỒ CHÍ MINH PHƯỜNG BA ĐÌNH',
                orgAddress: '68 Nguyễn Thái Học, Phường Ba Đình, Thành phố Hà Nội',
                taxId: '0123456789',
                orgHotline: state.currentLocation?.hotline || 'Đang cập nhật',
                exitDate: exitTime.getDate(), exitMonth: exitTime.getMonth() + 1, exitYear: exitTime.getFullYear(),
                uniqueID: vehicle.unique_id, plate: vehicle.plate, vehicleType: Utils.decodePlate(vehicle.plate),
                entryTimeDisplay: Utils.formatDateTime(vehicle.entry_time),
                exitTimeDisplay: Utils.formatDateTime(vehicle.exit_time),
                duration: Utils.calculateDuration(vehicle.entry_time, vehicle.exit_time),
                feeDisplay: Utils.formatCurrency(fee), feeInWords: AdvancedUtils.numberToWords(fee),
                dayHours: feeDetails.dayHours, nightHours: feeDetails.nightHours,
                dayRateFormatted: Utils.formatCurrency(APP_CONFIG.fee.dayRate) + 'đ', nightRateFormatted: Utils.formatCurrency(APP_CONFIG.fee.nightRate) + 'đ',
                paymentMethod: vehicle.payment_method, freeMinutes: APP_CONFIG.fee.freeMinutes,
            });
            window.open(`receipt_viewer.html?${params.toString()}`, '_blank');
        },

        handleModalClick(e) {
            const target = e.target;
            const action = target.closest('[data-action]')?.dataset.action;

            if (action === 'select-location') {
                const locationId = target.closest('.location-card').dataset.locationId;
                const location = state.locations.find(l => l.id === locationId);
                if (location) App.selectLocation(location);
            }

            // SỬA LỖI TRIỆT ĐỂ: Xử lý trực tiếp hành động xác nhận từ modal
            if (action === 'confirm-yes') {
                this.processConfirmation();
            }

            // SỬA LỖI: Xử lý nút "Hủy bỏ" trên modal xác nhận
            if (action === 'confirm-no') {
                UI.closeModal();
                return; // Dừng xử lý để không bị xung đột với các sự kiện khác
            }

            if (action === 'complete-payment') {
                // Logic này giờ được xử lý cục bộ trong processCheckIn và processCheckOut
                // để tránh xung đột. Sự kiện click vẫn được lắng nghe nhưng hàm xử lý
                // sẽ được định nghĩa tại nơi gọi modal.
                return;
            }

            if (action === 'print-receipt') {
                const button = target.closest('[data-action="print-receipt"]');
                if (!button || !button.dataset.plate) return;
                const data = button.dataset;
                const locationConfig = state.currentLocation || {};
                const config = APP_CONFIG.fee;
                const fee = parseFloat(data.fee) || 0;
                const exitTime = new Date(data.exitTime);
                const entryTime = new Date(data.entryTime);
                const isVip = data.isVip === 'true';
                const feeDetails = AdvancedUtils.calculateFeeWithBreakdown(entryTime, exitTime, isVip);
                const dayRate = locationConfig.fee_hourly_day ?? config.dayRate;
                const nightRate = locationConfig.fee_hourly_night ?? config.nightRate;

                const params = new URLSearchParams({
                    orgName: 'ĐOÀN TNCS HỒ CHÍ MINH PHƯỜNG BA ĐÌNH',
                    orgAddress: '68 Nguyễn Thái Học, Phường Ba Đình, Thành phố Hà Nội',
                    taxId: '0123456789',
                    orgHotline: locationConfig.hotline || 'Đang cập nhật',
                    exitDate: exitTime.getDate(), exitMonth: exitTime.getMonth() + 1, exitYear: exitTime.getFullYear(),
                    uniqueID: data.uniqueId, plate: data.plate, vehicleType: Utils.decodePlate(data.plate),
                    entryTimeDisplay: Utils.formatDateTime(entryTime),
                    exitTimeDisplay: Utils.formatDateTime(exitTime),
                    duration: Utils.calculateDuration(entryTime, exitTime),
                    feeDisplay: Utils.formatCurrency(fee), feeInWords: AdvancedUtils.numberToWords(fee),
                    dayHours: feeDetails.dayHours, nightHours: feeDetails.nightHours,
                    dayRateFormatted: Utils.formatCurrency(dayRate) + 'đ', nightRateFormatted: Utils.formatCurrency(nightRate) + 'đ',
                    paymentMethod: data.paymentMethod, freeMinutes: APP_CONFIG.fee.freeMinutes,
                });
                window.open(`receipt_viewer.html?${params.toString()}`, '_blank');
            }

            if (action === 'print-checkin-receipt') {
                const checkinReceiptContent = document.getElementById('printable-checkin-receipt');
                if(checkinReceiptContent) Utils.printElement(checkinReceiptContent, `VeGuiXe_${state.selectedPlate}`);
            }
        },

        // HÀM MỚI: Xử lý logic sau khi người dùng xác nhận cho xe ra (miễn phí/VIP)
        async processConfirmation() {
            const vehicle = state.selectedVehicle?.data;
            if (!vehicle) return;

            const reason = vehicle.is_vip ? 'Khách VIP' : 'Miễn phí';
            try {
                await Api.checkOut(vehicle.unique_id, 0, reason);
                UI.showToast(`Đã cho xe ${vehicle.plate} ra (${reason}).`, 'success');
            } catch (error) {
                UI.showToast(`Lỗi checkout: ${error.message}`, 'error');
            } finally {
                UI.closeModal();
                dom.searchTermInput.value = '';
                dom.searchTermInput.dispatchEvent(new Event('input', { bubbles: true }));
                await App.fetchData(true);
            }
        },

        async processPayment(paymentMethod) {
            const vehicle = state.selectedVehicle?.data;
            const fee = Utils.calculateFee(vehicle.entry_time, null, vehicle.is_vip);
            if (!paymentMethod) {
                UI.showToast('Lỗi: Không xác định được phương thức thanh toán.', 'error');
                return;
            }
        
            try {
                await Api.checkOut(vehicle.unique_id, fee, paymentMethod);
                UI.showPaymentConfirmation('success', 'Thanh toán thành công!');
                setTimeout(() => {
                    UI.closeModal();
                    setTimeout(() => {
                        // Cần tạo một đối tượng vehicle tạm thời vì checkout đã xảy ra
                        const tempVehicleData = { ...vehicle, exit_time: new Date().toISOString() };
                        UI.showModal('receipt', { vehicle: tempVehicleData, fee, paymentMethod });
                    }, 350);
                }, 1500);
            } catch (error) {
                UI.showToast(`Lỗi checkout: ${error.message}`, 'error');
            } finally {
                dom.searchTermInput.value = '';
                dom.searchTermInput.dispatchEvent(new Event('input', { bubbles: true }));
                await App.fetchData(true);
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
                const transcript = e.results[0][0].transcript;
                dom.searchTermInput.value = transcript;
                dom.searchTermInput.dispatchEvent(new Event('input', { bubbles: true }));
            };
            recognition.onend = () => dom.micBtn.classList.remove('active');
            recognition.start();
        },

        async openQrScanner() {
            if (!('mediaDevices' in navigator)) return UI.showToast('Trình duyệt không hỗ trợ camera.', 'error');
            UI.showModal('qr-scanner');
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                state.cameraStream = stream;
                const video = document.getElementById('camera-feed');
                if (video) {
                    video.srcObject = stream;
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
                
                // NÂNG CẤP TOÀN DIỆN: Quét liên tục và hiển thị phản hồi trực tiếp
                if (code && code.data && !state.isProcessing) { // SỬA LỖI: Đảm bảo isProcessing được kiểm tra
                    cancelAnimationFrame(state.scanAnimation); // Dừng quét ngay khi có kết quả
                    
                    // Xử lý checkout và hiển thị phản hồi
                    Handlers.processQrCheckout(code.data).then(vehiclePlate => { // SỬA LỖI: Gọi đúng hàm Handlers.processQrCheckout
                        if (vehiclePlate) {
                            // Hiển thị phản hồi thành công ngay trên màn hình quét
                            const feedbackOverlay = document.querySelector('.scanner-feedback-overlay');
                            const feedbackPlate = document.querySelector('.feedback-plate');
                            if (feedbackOverlay && feedbackPlate) {
                                feedbackPlate.textContent = vehiclePlate;
                                feedbackOverlay.classList.add('active');
                            }
                        }
                        // Sau 2 giây, ẩn phản hồi và tiếp tục quét
                        setTimeout(() => {
                            const feedbackOverlay = document.querySelector('.scanner-feedback-overlay');
                            if (feedbackOverlay) feedbackOverlay.classList.remove('active');
                            state.scanAnimation = requestAnimationFrame(() => this.tickQrScanner());
                        }, 2000);
                    });

                    return; // Thoát khỏi vòng lặp
                }
            }
            state.scanAnimation = requestAnimationFrame(() => this.tickQrScanner());
        },

        // HÀM MỚI: Xử lý checkout tự động khi quét QR
        processQrCheckout: async function(uniqueID) {
            if (state.isProcessing) return null;
            state.isProcessing = true;
            
            const vehicle = state.vehicles.find(v => v.unique_id === uniqueID && v.status === 'Đang gửi');
            if (!vehicle) {
                state.isProcessing = false;
                UI.showToast('Mã QR không hợp lệ hoặc xe đã rời bãi.', 'error');
                return null;
            }
    
            const alert = state.alerts[vehicle.plate];
            if (alert?.level === 'block') {
                state.isProcessing = false;
                UI.showToast(`XE BỊ CHẶN: ${alert.reason}`, 'error');
                return null;
            }
    
            const fee = Utils.calculateFee(vehicle.entry_time, null, vehicle.is_vip);
    
            if (fee > 0) {
                const paymentResult = await new Promise((resolve) => {
                    UI.showModal('payment', { fee, vehicle });
                    const modalClickHandler = (e) => {
                        const action = e.target.closest('[data-action]')?.dataset.action;
                        if (action === 'complete-payment') {
                            const method = e.target.closest('[data-method]')?.dataset.method;
                            dom.modalContainer.removeEventListener('click', modalClickHandler);
                            resolve({ fee, method });
                        } else if (action === 'close-modal' || e.target.classList.contains('modal-overlay')) {
                            dom.modalContainer.removeEventListener('click', modalClickHandler);
                            resolve(null);
                        }
                    };
                    dom.modalContainer.addEventListener('click', modalClickHandler);
                });
    
                if (!paymentResult) {
                    UI.showToast('Đã hủy thao tác thanh toán.', 'error');
                } else {
                    // SỬA LỖI: Tự xử lý checkout tại đây thay vì gọi hàm chung
                    await Api.checkOut(vehicle.unique_id, paymentResult.fee, paymentResult.method);
                    UI.showToast(`Thanh toán thành công cho xe ${vehicle.plate}.`, 'success');
                    await App.fetchData(true);
                }
                UI.closeModal(); // Đóng modal thanh toán sau khi hoàn tất
            } else {
                const reason = vehicle.is_vip ? 'Khách VIP' : 'Miễn phí';
                await Api.checkOut(vehicle.unique_id, 0, reason);
                UI.showToast(`Đã cho xe ${vehicle.plate} ra (${reason}).`, 'success');
                await App.fetchData(true);
            }
            state.isProcessing = false;
            return vehicle.plate;
        },
    };

    // =========================================================================
    // MODULE 7: APP INITIALIZATION - KHỞI TẠO ỨNG DỤNG
    // =========================================================================
    const App = {
        init() {
            dom.micBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`; // ... (các sự kiện khác)
            dom.scanQrBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`;

            this.setupEventListeners();
            this.applySavedTheme();
            this.updateClock();
            setInterval(this.updateClock, 1000);
            setInterval(this.updateLiveDurationsAndFees, 30000); // NÂNG CẤP: Gọi hàm cập nhật phí và thời gian
            
            // NÂNG CẤP: Tải danh sách bãi đỗ trước khi xác định vị trí
            Api.fetchLocations().then(() => {
                if (this.loadStateFromLocalStorage()) {
                    this.determineLocation();
                } else {
                    this.determineLocation(true);
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
            
            // MỚI: Gắn sự kiện để reset màn hình chờ
            dom.actionButtonsContainer.addEventListener('click', (e) => Handlers.handleActionClick(e));
            dom.vehicleListContainer.addEventListener('click', (e) => {
                const item = e.target.closest('.vehicle-item');
                if (item) Handlers.handleVehicleItemClick(item);
            });
            // SỬA LỖI: Gắn sự kiện cho phân trang
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
            // MỚI: Ẩn gợi ý khi click ra ngoài
            window.addEventListener('click', (e) => {
                if (!dom.searchTermInput.contains(e.target) && !dom.plateSuggestions.contains(e.target)) {
                    dom.plateSuggestions.classList.remove('visible');
                }
            });
            dom.modalContainer.addEventListener('click', (e) => Handlers.handleModalClick(e));
        },
        
        // MỚI: Gắn các sự kiện toàn cục để phát hiện tương tác
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
                UI.showModal('location', { locations: sortedLocations }); // Sửa lỗi tên biến
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

            UI.renderApp();
            this.fetchWeather();
            this.fetchData();
            this.setupRealtimeListeners();
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
                this.saveStateToLocalStorage();
            } catch (error) {
                UI.showToast(error.message, 'error');
                state.vehicles = [];
                state.alerts = {};
            } finally {
                state.isLoading = false;
                UI.renderApp();
            }
        },

        saveStateToLocalStorage() {
            try {
                const stateToSave = {
                    currentLocation: state.currentLocation,
                    currentDate: state.currentDate.toISOString(),
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
                        return true;
                    }
                }
            } catch (e) {
                console.error("Error loading state from localStorage", e);
            }
            return false;
        },

        setupRealtimeListeners() {
            const mainChannel = db.channel('main-app-db-changes');
            mainChannel
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'transactions'
                }, () => {
                    console.log('Realtime: Giao dịch thay đổi. Tải lại dữ liệu...');
                    this.fetchData(true); // Tải lại dữ liệu trong im lặng
                })
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'security_alerts',
                }, async (payload) => {
                    console.log('Realtime: Cảnh báo an ninh thay đổi.', payload);

                    // NÂNG CẤP TOÀN DIỆN: Hiển thị modal cảnh báo và xử lý các loại sự kiện
                    let alertData = null;
                    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                        alertData = payload.new;
                        UI.showGlobalAlertModal(alertData); // Hiển thị modal ngay lập tức
                    } else if (payload.eventType === 'DELETE') {
                        alertData = payload.old; // Lấy dữ liệu cũ để biết xe nào vừa được gỡ cảnh báo
                        UI.showToast(`Cảnh báo cho xe ${alertData.plate} đã được gỡ bỏ.`, 'success');
                    }

                    // Tải lại dữ liệu nền và cập nhật giao diện nếu xe đang được chọn
                    this.fetchData(true).then(() => {
                        // Nếu xe đang được chọn trùng với xe bị ảnh hưởng (thêm, sửa, hoặc xóa)
                        // thì "vẽ" lại khu vực nút bấm để cập nhật trạng thái (vô hiệu hóa hoặc kích hoạt lại).
                        if (state.selectedVehicle && alertData && state.selectedVehicle.data.plate === alertData.plate) {
                            UI.renderActionButtons();
                            UI.renderVehicleInfoPanel();
                        }
                    });
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('✅ Đã kết nối Realtime thành công đến các bảng!');
                    }
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

        // NÂNG CẤP: Hàm này giờ sẽ cập nhật cả thời gian và phí gửi xe
        updateLiveDurationsAndFees() {
            document.querySelectorAll('.live-duration').forEach(el => {
                el.textContent = Utils.calculateDuration(el.dataset.starttime);
            });
            // NÂNG CẤP: Thêm logic cập nhật phí
            document.querySelectorAll('.live-fee').forEach(el => {
                const isVIP = el.dataset.isvip === 'true';
                el.textContent = Utils.formatCurrency(Utils.calculateFee(el.dataset.starttime, null, isVIP)) + 'đ';
            });
        },

        async fetchWeather() {
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
                dom.adVideoPlayer.addEventListener('ended', this.playNextVideo);
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

    // Cập nhật App object để gọi các hàm mới
    App.resetIdleTimer = () => {
        if (state.isIdle) IdleScreenManager.deactivate();
        clearTimeout(state.idleTimer);
        state.idleTimer = setTimeout(() => IdleScreenManager.activate(), IdleScreenManager.IDLE_TIMEOUT);
    };

    // Let's go!
    App.init();
    IdleScreenManager.init(); // Khởi tạo trình quản lý màn hình chờ
});
