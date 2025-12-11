/**
 * =================================================================================
 * fee_calculator.js - Module tính phí gửi xe tập trung
 * =================================================================================
 *
 * MỤC ĐÍCH:
 * - Tách biệt hoàn toàn logic tính phí ra khỏi các file giao diện (main.js, admin.js,...).
 * - Đảm bảo một nguồn đáng tin cậy (single source of truth) cho việc tính toán.
 * - Dễ dàng kiểm thử, bảo trì và nâng cấp các quy tắc tính phí trong tương lai.
 *
 * CÁCH SỬ DỤNG:
 * 1. Chắc chắn rằng file này được tải sau `config.js`.
 * 2. Gọi hàm `FeeCalculator.calculate(startTime, endTime, isVIP, locationConfig, feeConfig)`
 *    với đầy đủ các tham số cần thiết.
 *
 * =================================================================================
 */

const FeeCalculator = {
    // 1. Cấu hình phí mặc định được tích hợp ngay trong module.
    config: {
        enabled: true,
        freeMinutes: 15,
        per_entry: 10000,
        daily: 30000,
        hourly_day: 5000,
        hourly_night: 8000,
        nightStartHour: 18,
        nightEndHour: 6
    },

    /**
     * Cập nhật cấu hình phí từ một nguồn bên ngoài (vd: config.js sau khi tải từ DB).
     * @param {object} newConfig - Đối tượng cấu hình phí mới.
     */
    updateConfig(newConfig) {
        if (newConfig) {
            this.config = { ...this.config, ...newConfig };
            console.log('✅ Cấu hình phí đã được cập nhật:', this.config);
        }
    },

    /**
     * Hàm tính phí gửi xe chính.
     * @param {object} transaction - Toàn bộ đối tượng giao dịch của xe.
     * @param {string | Date | null} endTime - Thời gian kết thúc gửi xe. Nếu là null, sẽ tính phí tạm tính đến hiện tại.
     * @param {object} locationConfig - Đối tượng cấu hình của bãi xe hiện tại (vd: state.currentLocation).
     * @returns {number} - Số tiền phí đã được tính toán.
     */
    calculate(transaction, endTime, locationConfig) {
        const startTime = transaction.entry_time;
        const isVIP = transaction.is_vip;
        let snapshot = transaction.fee_policy_snapshot;

        // BẢO VỆ: Parse snapshot nếu là string (do lỗi DB hoặc định dạng)
        if (snapshot && typeof snapshot === 'string') {
            try {
                snapshot = JSON.parse(snapshot);
            } catch (e) {
                console.error('Error parsing fee_policy_snapshot:', e);
                snapshot = null;
            }
        }

        // =================================================================================
        // LOGIC "ĐÓNG BĂNG" QUY TẮC PHÍ:
        // 1. Ưu tiên sử dụng "ảnh chụp" quy tắc phí đã lưu cùng giao dịch.
        // 2. Nếu không có, sử dụng quy tắc hiện tại của bãi xe (để tương thích ngược).
        // =================================================================================
        // KIỂM TRA HỢP LỆ: Snapshot phải có 'type' mới được coi là dùng được
        const isSnapshotValid = snapshot && snapshot.type;

        const policy = isSnapshotValid ? {
            type: snapshot.type,
            collection: snapshot.collection || 'post_paid',
            per_entry: Number(snapshot.per_entry || 0),
            daily: Number(snapshot.daily || 0),
            hourly_day: Number(snapshot.hourly_day || 0),
            hourly_night: Number(snapshot.hourly_night || 0),
        } : {
            type: locationConfig?.fee_policy_type || 'free',
            collection: locationConfig?.fee_collection_policy || 'post_paid',
            per_entry: locationConfig?.fee_per_entry ?? this.config.per_entry,
            daily: locationConfig?.fee_daily ?? this.config.daily,
            hourly_day: locationConfig?.fee_hourly_day ?? this.config.hourly_day,
            hourly_night: locationConfig?.fee_hourly_night ?? this.config.hourly_night,
        };

        const policyType = policy.type;

        // 1. Điều kiện miễn phí ban đầu
        if (!this.config.enabled || isVIP || !startTime || policyType === 'free' || !locationConfig) {
            return 0;
        }

        const effectiveEndTime = endTime ? new Date(endTime) : new Date();
        const start = new Date(startTime);

        // 2. Kịch bản tính phí trả trước (chỉ áp dụng khi xe VÀO)
        if (endTime === null && policy.collection === 'pre_paid') {
            switch (policyType) {
                case 'per_entry': return policy.per_entry;
                case 'daily': return policy.daily;
                default: return 0; // Không thu trước cho loại hình theo giờ
            }
        }

        // 3. Kịch bản tính phí khi xe ra hoặc tính phí tạm tính (post-paid)
        const end = effectiveEndTime;
        const durationMinutes = Math.max(0, (end - start) / 60000);

        // Quy tắc: Trong vòng X phút đầu thì miễn phí (Grace Period)
        if (durationMinutes <= this.config.freeMinutes) {
            return 0;
        }

        // Quy tắc THƯƠNG MẠI CHUẨN:
        // Nếu đã lố giờ miễn phí, tính tiền TỪ ĐẦU (phút 0).
        // Ví dụ: 16 phút -> tính tròn 1 tiếng.
        const chargeableStartTime = start;

        switch (policyType) {
            case 'per_entry':
                return policy.per_entry;
            case 'daily':
                const totalDays = Math.ceil(durationMinutes / (60 * 24));
                return policy.daily * Math.max(1, totalDays);
            case 'hourly':
                const dayRate = policy.hourly_day;
                const nightRate = policy.hourly_night;
                const nightStart = this.config.nightStartHour;
                const nightEnd = this.config.nightEndHour;

                let totalFee = 0;
                let cursor = new Date(chargeableStartTime);
                let minutesCovered = 0;

                // Vòng lặp tính phí theo từng block thời gian (Hybrid)
                while (minutesCovered < durationMinutes) {
                    let blockSize; // Phút
                    let feeRatio;  // Tỉ lệ giá (0.5 = 50%, 1.0 = 100%)

                    // LOGIC LAI (HYBRID):
                    // - Trong 60 phút đầu: Tính theo block 30 phút (50% giá).
                    // - Sau 60 phút: Tính theo block 60 phút (100% giá).
                    if (minutesCovered < 60) {
                        blockSize = 30;
                        feeRatio = 0.5;
                    } else {
                        blockSize = 60;
                        feeRatio = 1.0;
                    }

                    const hour = cursor.getHours();
                    const isNight = (hour >= nightStart || hour < nightEnd);

                    // Tính phí cho block hiện tại
                    // Giá = (Giá giờ) * (Tỉ lệ)
                    const currentRate = isNight ? nightRate : dayRate;
                    totalFee += currentRate * feeRatio;

                    // Tăng con trỏ thời gian
                    cursor.setMinutes(cursor.getMinutes() + blockSize);
                    minutesCovered += blockSize;
                }

                return totalFee;
            default:
                return 0;
        }
    }
};