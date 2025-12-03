document.addEventListener('DOMContentLoaded', () => {
    // Tái sử dụng Supabase client chung để tránh tạo nhiều GoTrueClient trong cùng browser
    const db = window.SUPABASE_DB || supabase.createClient(
        'https://mtihqbmlbtrgvamxwrkm.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10aWhxYm1sYnRyZ3ZhbXh3cmttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMTkwMDEsImV4cCI6MjA3NzU5NTAwMX0.hR5X8bp-XD2DfxUnvWF-yxVk4sFVW2zBunp5XXnIZ0Y'
    );

    const elements = {
        mainContent: document.getElementById('main-admin-content'),
        userProfileWidget: document.getElementById('user-profile-widget'),
        biometricStatus: document.getElementById('biometric-status'),
        registerBtn: document.getElementById('register-biometric-btn'),
        removeBtn: document.getElementById('remove-biometric-btn'),
        toastContainer: document.getElementById('toast-container'),
        // NÂNG CẤP: Các phần tử của form đổi PIN
        changePinForm: document.getElementById('change-pin-form'),
        currentPinInput: document.getElementById('current-pin'),
        newPinInput: document.getElementById('new-pin'),
        confirmNewPinInput: document.getElementById('confirm-new-pin'),
        savePinBtn: document.getElementById('save-pin-btn'),
        changePinErrorMsg: document.getElementById('change-pin-error-message'),
    };

    let currentUser = null;

    const showToast = (message, type = 'info') => {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`; // Dùng class từ admin.css

        // Đảm bảo `message` luôn là một chuỗi trước khi hiển thị.
        const messageText = (typeof message === 'object' && message.message) ? message.message : String(message);

        // ĐỒNG BỘ GIAO DIỆN: Thêm icon và tiêu đề cho toast giống trang admin
        const titles = { success: 'Thành công!', error: 'Lỗi!', info: 'Thông báo' };
        const icons = { success: '✅', error: '❌', info: 'ℹ️' };
        toast.innerHTML = `${icons[type] || ''} <strong>${titles[type] || ''}</strong> <span>${messageText}</span>`;

        elements.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'fadeOutToast 0.5s ease forwards';
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    };

    const checkSession = () => {
        const staffInfo = localStorage.getItem('staffInfo');
        if (!staffInfo) {
            window.location.href = 'index.html'; // Chuyển về trang đăng nhập
            return;
        }
        currentUser = JSON.parse(staffInfo);
        elements.mainContent.style.display = 'flex';
        renderUserProfile();
        updateBiometricStatus();
    };

    const renderUserProfile = () => {
        if (currentUser && elements.userProfileWidget) {
            elements.userProfileWidget.innerHTML = `
                <span class="user-name">Xin chào, ${currentUser.fullName}</span>
                <button class="logout-btn" title="Đăng xuất">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </button>
            `;
            elements.userProfileWidget.querySelector('.logout-btn').addEventListener('click', () => {
                localStorage.removeItem('staffInfo');
                window.location.href = 'index.html';
            });
        }
    };

    const updateBiometricStatus = async () => {
        try {
            // NÂNG CẤP: Kiểm tra xem trình duyệt có hỗ trợ sinh trắc học của thiết bị không
            const isBiometricSupported = await SimpleWebAuthnBrowser.platformAuthenticatorIsAvailable();
            if (!isBiometricSupported) {
                elements.biometricStatus.innerHTML = `
                    <span class="status-unregistered">Không được hỗ trợ</span>
                    <p>Thiết bị hoặc trình duyệt này không hỗ trợ đăng nhập bằng sinh trắc học (vân tay/khuôn mặt).</p>
                `;
                elements.registerBtn.style.display = 'none';
                elements.removeBtn.style.display = 'none';
                // Dừng hàm tại đây vì không cần kiểm tra thêm
                return;
            }

            const { data, error } = await db.from('staff_accounts')
                .select('webauthn_credential_id')
                .eq('username', currentUser.username)
                .single();

            if (error) throw error;

            if (data && data.webauthn_credential_id) {
                elements.biometricStatus.innerHTML = `
                    <span class="status-registered">Đã đăng ký</span>
                    <p>Bạn có thể sử dụng vân tay hoặc khuôn mặt để đăng nhập trên thiết bị này.</p>
                `;
                elements.registerBtn.style.display = 'none';
                elements.removeBtn.style.display = 'inline-flex';
            } else {
                elements.biometricStatus.innerHTML = `
                    <span class="status-unregistered">Chưa đăng ký</span>
                    <p>Bạn chưa thiết lập đăng nhập sinh trắc học cho tài khoản này.</p>
                `;
                elements.registerBtn.style.display = 'inline-flex';
                elements.removeBtn.style.display = 'none';
            }
        } catch (err) {
            elements.biometricStatus.innerHTML = `<span class="status-unregistered">Lỗi khi kiểm tra trạng thái.</span>`;
            console.error(err);
        }
    };

    const handleRegister = async () => {
        elements.registerBtn.disabled = true;
        elements.registerBtn.querySelector('span').textContent = 'Đang chờ xác thực...';

        try {
            // Bước 1: Tạo các tùy chọn đăng ký
            const options = {
                rp: { name: 'He thong Quan ly Bai xe' },
                user: {
                    id: new TextEncoder().encode(currentUser.username),
                    name: currentUser.username,
                    displayName: currentUser.fullName,
                },
                challenge: new Uint8Array(16).map(() => Math.floor(Math.random() * 256)), // Challenge ngẫu nhiên
                pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
                authenticatorSelection: {
                    authenticatorAttachment: 'platform', // Chỉ dùng sinh trắc học của thiết bị
                    userVerification: 'required',
                },
                timeout: 60000,
                attestation: 'none',
            };

            // Bước 2: Bắt đầu quá trình đăng ký trên trình duyệt
            const credential = await SimpleWebAuthnBrowser.startRegistration(options);

            // Bước 3: Chuyển đổi dữ liệu để lưu vào DB - SỬA LỖI TRIỆT ĐỂ
            // Lỗi trước đây là dùng credential.response.publicKey thay vì getPublicKey()
            // và không lấy getAuthenticatorData() và getClientDataJSON().
            const credentialID_base64 = SimpleWebAuthnBrowser.base64url.encode(credential.rawId);
            const publicKey_base64 = SimpleWebAuthnBrowser.base64url.encode(credential.response.getPublicKey());

            // Bước 4: Cập nhật thông tin vào Supabase
            const { error } = await db.from('staff_accounts')
                .update({
                    webauthn_credential_id: credentialID_base64,
                    webauthn_public_key: publicKey_base64,
                    webauthn_sign_count: 0
                })
                .eq('username', currentUser.username);

            if (error) throw error;

            showToast('Đăng ký sinh trắc học thành công!', 'success');
            updateBiometricStatus();

        } catch (err) {
            // HOÀN CHỈNH: Xử lý tất cả các loại lỗi từ thư viện WebAuthn.
            // Chuyển đổi đối tượng lỗi thành một chuỗi thông báo có ý nghĩa.
            let errorMessage = 'Đã xảy ra lỗi không xác định.';
            if (err.name === 'NotAllowedError') {
                errorMessage = 'Thao tác đã bị hủy bởi người dùng.';
                showToast(errorMessage, 'info');
            } else {
                // Lấy message từ lỗi hoặc chuyển cả object lỗi thành chuỗi để debug
                errorMessage = err.message || JSON.stringify(err);
                showToast(`Đăng ký thất bại: ${errorMessage}`, 'error');
                console.error('Lỗi đăng ký sinh trắc học:', err);
            }
        } finally {
            elements.registerBtn.disabled = false;
            elements.registerBtn.querySelector('span').textContent = 'Thiết lập Đăng nhập Sinh trắc học';
        }
    };

    const handleRemove = async () => {
        if (!confirm('Bạn có chắc chắn muốn hủy đăng ký sinh trắc học trên thiết bị này?')) {
            return;
        }

        elements.removeBtn.disabled = true;
        elements.removeBtn.querySelector('span').textContent = 'Đang hủy...';

        try {
            const { error } = await db.from('staff_accounts')
                .update({
                    webauthn_credential_id: null,
                    webauthn_public_key: null,
                    webauthn_sign_count: null
                })
                .eq('username', currentUser.username);

            if (error) throw error;

            showToast('Đã hủy đăng ký sinh trắc học thành công.', 'info');
            updateBiometricStatus();
        } catch (err) {
            // HOÀN CHỈNH: Cung cấp thông báo lỗi cụ thể hơn.
            showToast(`Hủy thất bại: ${err.message}`, 'error');
        } finally {
            elements.removeBtn.disabled = false;
            elements.removeBtn.querySelector('span').textContent = 'Hủy đăng ký trên thiết bị này';
        }
    };

    // NÂNG CẤP: Hàm xử lý đổi mã PIN
    const handleChangePin = async (event) => {
        event.preventDefault();
        const currentPin = elements.currentPinInput.value;
        const newPin = elements.newPinInput.value;
        const confirmNewPin = elements.confirmNewPinInput.value;

        elements.changePinErrorMsg.textContent = '';

        // 1. Kiểm tra đầu vào
        if (!currentPin || !newPin || !confirmNewPin) {
            return elements.changePinErrorMsg.textContent = 'Vui lòng điền đầy đủ các trường.';
        }
        if (newPin !== confirmNewPin) {
            return elements.changePinErrorMsg.textContent = 'Mã PIN mới và mã xác nhận không khớp.';
        }
        if (!/^\d{4,6}$/.test(newPin)) {
            return elements.changePinErrorMsg.textContent = 'Mã PIN mới phải là 4 đến 6 chữ số.';
        }

        elements.savePinBtn.disabled = true;
        elements.savePinBtn.textContent = 'Đang xử lý...';

        try {
            // HOÀN CHỈNH: Tăng cường bảo mật bằng cách xác thực PIN cũ trên server-side (thông qua Supabase).
            // 2. Xác thực mã PIN hiện tại
            const { data: staff, error: verifyError } = await db.from('staff_accounts')
                .select('id')
                .eq('username', currentUser.username)
                .eq('pin', currentPin)
                .single();

            if (verifyError || !staff) {
                throw new Error('Mã PIN hiện tại không đúng.');
            }

            // 3. Cập nhật mã PIN mới
            const { error: updateError } = await db.from('staff_accounts')
                .update({ pin: newPin })
                .eq('id', staff.id);

            if (updateError) {
                throw new Error(updateError.message);
            }

            showToast('Đổi mã PIN thành công!', 'success');
            elements.changePinForm.reset();

        } catch (err) {
            // HOÀN CHỈNH: Hiển thị thông báo lỗi thân thiện hơn.
            elements.changePinErrorMsg.textContent = `Lỗi: ${err.message}`;
        } finally {
            elements.savePinBtn.disabled = false;
            elements.savePinBtn.textContent = 'Lưu Mã PIN mới';
        }
    };

    // Gắn sự kiện
    elements.registerBtn.addEventListener('click', handleRegister);
    elements.removeBtn.addEventListener('click', handleRemove);
    elements.changePinForm.addEventListener('submit', handleChangePin);

    // Khởi chạy
    checkSession();
});