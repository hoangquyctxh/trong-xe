/**
 * @file Security.gs
 * @description Tệp chuyên xử lý các chức năng liên quan đến cảnh báo an ninh.
 *              Các hàm trong tệp này được gọi từ Code.gs.
 */

// =================================================================================
// CÁC HÀM XỬ LÝ CẢNH BÁO AN NINH (SECURITY ALERTS)
// =================================================================================

/**
 * Lấy danh sách tất cả các cảnh báo đang hoạt động từ sheet SecurityAlerts.
 * @returns {ContentService} JSON response chứa đối tượng các cảnh báo.
 */
function getActiveAlerts() {
  try {
    // Hàm getSheetByName() được định nghĩa trong Code.gs nhưng có thể gọi được từ đây.
    const sheet = getSheetByName(CONFIG.SHEET_NAMES.SECURITY_ALERTS);
    if (!sheet) {
      console.warn("Sheet 'SecurityAlerts' không tồn tại. Trả về danh sách rỗng.");
      return createJsonResponse({ status: 'success', data: {} });
    }
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return createJsonResponse({ status: 'success', data: {} });
    }
    const headers = data.shift();
    const plateIndex = headers.indexOf('Plate');
    const reasonIndex = headers.indexOf('Reason');
    const levelIndex = headers.indexOf('Level');

    if (plateIndex === -1) throw new Error("Sheet 'SecurityAlerts' phải có cột 'Plate'.");

    const alerts = data.reduce((obj, row) => {
      const plate = row[plateIndex];
      if (plate) {
        obj[plate.toString().toUpperCase()] = {
          reason: row[reasonIndex] || '',
          level: row[levelIndex] || 'warning'
        };
      }
      return obj;
    }, {});

    return createJsonResponse({ status: 'success', data: alerts });
  } catch (e) {
    console.error(`Lỗi getActiveAlerts: ${e.message}`);
    return createJsonResponse({ status: 'error', message: 'Lỗi khi lấy danh sách cảnh báo: ' + e.message });
  }
}

/**
 * Thêm hoặc cập nhật một cảnh báo vào sheet SecurityAlerts.
 * @param {object} payload - Dữ liệu cảnh báo { plate, reason, level }.
 * @returns {ContentService} JSON response về kết quả.
 */
function addOrUpdateAlert(payload) {
  const { plate, reason, level } = payload;
  if (!plate) throw new Error("Thiếu thông tin 'plate' để tạo cảnh báo.");

  const sheet = getSheetByName(CONFIG.SHEET_NAMES.SECURITY_ALERTS, true); // true = tạo nếu chưa có
  const data = sheet.getDataRange().getValues();
  const plateIndex = data[0].indexOf('Plate');
  const rowIndex = data.findIndex(row => row[plateIndex] && row[plateIndex].toString().toUpperCase() === plate.toUpperCase());

  const newRow = [plate.toUpperCase(), reason, level, new Date()];

  if (rowIndex > 0) { // Cập nhật cảnh báo đã có
    sheet.getRange(rowIndex + 1, 1, 1, newRow.length).setValues([newRow]);
  } else { // Thêm cảnh báo mới
    sheet.appendRow(newRow);
  }
  return createJsonResponse({ status: 'success', message: 'Đã cập nhật cảnh báo.' });
}

/**
 * Xóa một cảnh báo khỏi sheet SecurityAlerts.
 * @param {object} payload - Dữ liệu cảnh báo { plate }.
 * @returns {ContentService} JSON response về kết quả.
 */
function removeAlert(payload) {
  const { plate } = payload;
  if (!plate) throw new Error("Thiếu thông tin 'plate' để xóa cảnh báo.");

  const sheet = getSheetByName(CONFIG.SHEET_NAMES.SECURITY_ALERTS);
  if (!sheet) return createJsonResponse({ status: 'not_found', message: 'Sheet cảnh báo không tồn tại.' });

  const data = sheet.getDataRange().getValues();
  const plateIndex = data[0].indexOf('Plate');
  const rowIndex = data.findIndex(row => row[plateIndex] && row[plateIndex].toString().toUpperCase() === plate.toUpperCase());

  if (rowIndex > 0) {
    sheet.deleteRow(rowIndex + 1);
    return createJsonResponse({ status: 'success', message: 'Đã xóa cảnh báo.' });
  } else {
    return createJsonResponse({ status: 'not_found', message: 'Không tìm thấy cảnh báo để xóa.' });
  }
}
