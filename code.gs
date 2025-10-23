/**
 * @file code.gs
 * @version 21.0 - Final Stable & Optimized Version
 * @description Phiên bản được tái cấu trúc toàn diện, tối ưu hóa hiệu suất và sửa các lỗi tiềm ẩn.
 * Hệ thống xử lý dữ liệu xe, tích hợp tính năng VIP, lưu ảnh, trang quản trị ổn định và cơ chế cache thông minh.
 */

// ================== CẤU HÌNH QUAN TRỌNG ==================
const SHEET_ID = '1uYWrFvS_6L-iIVv4eyJSL8i2tb9GGPJmE8dGIbHsor4'; // ID Google Sheet của bạn
const SHEET_NAME = 'Sheet1'; // Tên trang tính
const IMAGE_FOLDER_ID = '10_RCBR7UZh-WX59rpHjwQuZSqpcrL8pH'; // ID thư mục ảnh trên Drive
const ADMIN_SECRET_KEY = "admin123"; // Mật khẩu bảo vệ trang quản trị.
const GEMINI_API_KEY = "AIzaSyDbcSZTvvcfc_bbZhpapT_H3Jj7clfrb3w"; // API Key cho tính năng AI Insights

// Cấu hình Cache
const CACHE_EXPIRATION_SECONDS = 300; // Dữ liệu sẽ được cache trong 5 phút
const SCRIPT_CACHE = CacheService.getScriptCache();

// ================== CÁC HÀM CHÍNH (doGet, doPost) ==================

function doGet(e) {
  const params = e.parameter;
  try {
    switch (params.action) {
      case 'getAdminOverview':
        return getAdminOverview(params.secret, params.date || null);
      case 'getTransactions':
        return getTransactions(params.secret, params.date || null);
      case 'getVehicleStatus':
        return getVehicleStatus(params.plate);
      case 'getVehicles': // Action mới được sử dụng bởi index.html
        return createJsonResponse({ status: 'success', data: getRecordsForDate(params.date) });
      default:
        // Xử lý các request cũ hơn (nếu cần)
        if (params.plate) return createJsonResponse({ status: 'success', data: getVehicleHistory(params.plate) });
        if (params.date) return createJsonResponse({ status: 'success', data: getRecordsForDate(params.date) });
        
        throw new Error("Yêu cầu không hợp lệ hoặc thiếu tham số 'action'.");
    }
  } catch (error) {
    logError('doGet', error);
    return createJsonResponse({ status: 'error', message: `Lỗi xử lý yêu cầu: ${error.message}` });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  const lockAcquired = lock.tryLock(20000); // Thử khóa trong 20 giây
  if (!lockAcquired) {
    return createJsonResponse({ status: 'error', message: 'Máy chủ đang bận, vui lòng thử lại sau giây lát.' });
  }

  try {
    const payload = JSON.parse(e.postData.contents);

    switch (payload.action) {
      case 'checkIn':
        return handleCheckIn(payload);
      case 'checkOut':
        return handleCheckOut(payload);
      case 'editTransaction':
        return handleEditTransaction(payload);
      case 'saveConfig':
        return handleSaveConfig(payload);
      case 'sync':
        return handleSync(payload.queue);
      default:
        throw new Error(`Hành động '${payload.action}' không được hỗ trợ.`);
    }
  } catch (error) {
    logError('doPost', error);
    return createJsonResponse({ status: 'error', message: `Lỗi máy chủ: ${error.message}` });
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

// ================== CÁC HÀM XỬ LÝ HÀNH ĐỘNG ==================

/* -------------------------
   Helper: Lấy dữ liệu an toàn (chỉ đến lastRow)
   ------------------------- */
function safeGetValues(sheet) {
  const lastRow = Math.max(1, sheet.getLastRow());
  const lastCol = Math.max(1, sheet.getLastColumn());
  if (lastRow < 1) return [];
  return sheet.getRange(1, 1, lastRow, lastCol).getValues();
}

/* -------------------------
   Helper: Tìm index bản ghi mới nhất theo biển (quét cột Plate từ dưới lên)
   Trả về index dòng (1-based) nếu tìm thấy, -1 nếu không có
   ------------------------- */
function findLastRowIndexByPlate(sheet, cols, cleanedPlate) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const plateRange = sheet.getRange(2, cols.plateCol + 1, lastRow - 1, 1).getValues();
  for (let i = plateRange.length - 1; i >= 0; i--) {
    const recordPlate = (plateRange[i][0] || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (recordPlate === cleanedPlate) {
      return i + 2; // convert to sheet row index
    }
  }
  return -1;
}

function handleCheckIn(payload) {
  const { plate, phone, uniqueID, locationId, imageData, isVIP } = payload;
  if (!plate || !uniqueID) {
    throw new Error("Thiếu biển số hoặc UniqueID.");
  }

  const sheet = getSheet();
  const values = safeGetValues(sheet);
  if (!values || values.length === 0) {
    throw new Error("Bảng tính trống hoặc không thể đọc dữ liệu.");
  }
  const headers = values[0];
  const cols = getHeaderIndices(headers);
  const cleanedPlate = (plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Tìm bản ghi gần nhất cho biển số (nếu đang gửi => chặn)
  const existingRowIndex = findLastRowIndexByPlate(sheet, cols, cleanedPlate);
  if (existingRowIndex !== -1) {
    const statusCell = sheet.getRange(existingRowIndex, cols.statusCol + 1).getValue();
    if (statusCell === 'Đang gửi') {
      throw new Error(`Xe [${plate}] đang ở trong bãi.`);
    }
  }

  const now = new Date();
  const imageUrl = processAndSaveImage(imageData, plate);

  // Ghi bằng appendRow (đơn giản, đảm bảo Date object đúng)
  sheet.appendRow([
    now,
    formatDate(now),
    plate.toUpperCase(),
    phone || '',
    now,
    '',
    'Đang gửi',
    uniqueID,
    locationId || '',
    imageUrl || '',
    isVIP ? 'Có' : 'Không',
    '', // Fee
    ''  // PaymentMethod
  ]);

  // Xóa cache liên quan
  clearRelevantCache(now);

  return createJsonResponse({ status: 'success', message: 'Gửi xe thành công.' });
}

/* -------------------------
   Cập nhật handleCheckOut: quét từ dưới lên, cập nhật bằng setValue cho từng ô (ổn định)
   ------------------------- */
function handleCheckOut(payload) {
  const { uniqueID, fee, paymentMethod } = payload;
  if (!uniqueID) {
    throw new Error("Thiếu UniqueID.");
  }

  const sheet = getSheet();
  const values = safeGetValues(sheet);
  if (!values || values.length < 2) {
    throw new Error("Không có dữ liệu giao dịch để xử lý.");
  }
  const headers = values[0];
  const cols = getHeaderIndices(headers);
  if (cols.uniqueIdCol === -1 || cols.statusCol === -1) {
    throw new Error("Sheet thiếu cột bắt buộc (UniqueID/Status).");
  }

  const now = new Date();
  // Quét từ dưới lên để tìm bản ghi đang gửi với UniqueID
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i][cols.uniqueIdCol] === uniqueID && values[i][cols.statusCol] === 'Đang gửi') {
      const rowIndex = i + 1; // 1-based
      const entryTime = values[i][cols.entryTimeCol] ? new Date(values[i][cols.entryTimeCol]) : now;

      sheet.getRange(rowIndex, cols.exitTimeCol + 1).setValue(now);
      sheet.getRange(rowIndex, cols.statusCol + 1).setValue('Đã rời đi');
      if (cols.feeCol !== -1) sheet.getRange(rowIndex, cols.feeCol + 1).setValue(fee);
      if (cols.paymentMethodCol !== -1) sheet.getRange(rowIndex, cols.paymentMethodCol + 1).setValue(paymentMethod);

      // Clear cache 2 ngày liên quan
      clearRelevantCache(entryTime);
      clearRelevantCache(now);

      return createJsonResponse({ status: 'success', message: 'Cho xe ra thành công.' });
    }
  }

  throw new Error('Không tìm thấy xe đang gửi với UniqueID này.');
}

/* -------------------------
   Cập nhật getVehicleStatus để tránh đọc dữ liệu quá lớn (dùng safeGetValues)
   Trả object vehicle đầy đủ khi đang gửi (đã có trước)
   ------------------------- */
function getVehicleStatus(plate) {
  if (!plate) {
    throw new Error("Thiếu biển số để kiểm tra.");
  }

  const sheet = getSheet();
  const values = safeGetValues(sheet);
  if (!values || values.length < 1) {
    return createJsonResponse({ status: 'success', data: { isParking: false, vehicle: null } });
  }
  const headers = values[0];
  const cols = getHeaderIndices(headers);
  if (cols.plateCol === -1 || cols.statusCol === -1) {
    throw new Error("Sheet thiếu cột Plate hoặc Status.");
  }

  const cleanedPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Quét từ dưới lên để lấy bản ghi mới nhất
  for (let i = values.length - 1; i >= 1; i--) {
    const recordPlate = (values[i][cols.plateCol] || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (recordPlate === cleanedPlate) {
      const isParking = values[i][cols.statusCol] === 'Đang gửi';
      const vehicle = isParking ? arrayToObject(headers, values[i]) : null;
      return createJsonResponse({ status: 'success', data: { isParking: isParking, vehicle: vehicle } });
    }
  }
  return createJsonResponse({ status: 'success', data: { isParking: false, vehicle: null } });
}

/* -------------------------
   Cập nhật getRecordsForDate: kiểm tra dateStr, bảo vệ null, dùng cache an toàn
   ------------------------- */
function getRecordsForDate(dateStr) {
  const targetDateStr = dateStr && String(dateStr).trim() ? String(dateStr).trim() : formatDate(new Date());
  const cacheKey = `records_${targetDateStr}`;
  const cached = SCRIPT_CACHE.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const sheet = getSheet();
  const values = safeGetValues(sheet);
  if (!values || values.length < 2) {
    SCRIPT_CACHE.put(cacheKey, JSON.stringify([]), CACHE_EXPIRATION_SECONDS);
    return [];
  }
  const headers = values.shift(); // remove header row

  const dateParts = targetDateStr.split('-');
  if (dateParts.length !== 3) {
    throw new Error("Date format phải là yyyy-MM-dd");
  }
  const targetDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
  const spreadsheetTimeZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const startOfDay = new Date(Utilities.formatDate(targetDate, spreadsheetTimeZone, "yyyy-MM-dd'T'00:00:00"));
  const endOfDay = new Date(Utilities.formatDate(targetDate, spreadsheetTimeZone, "yyyy-MM-dd'T'23:59:59"));

  const records = values
    .map(row => arrayToObject(headers, row))
    .filter(record => {
      const entryValue = getObjectValueCaseInsensitive(record, 'Entry Time');
      if (!entryValue) return false;
      const entryTime = new Date(entryValue);
      const exitValue = getObjectValueCaseInsensitive(record, 'Exit Time');
      const exitTime = exitValue ? new Date(exitValue) : null;
      const statusValue = getObjectValueCaseInsensitive(record, 'Status');

      const enteredToday = entryTime >= startOfDay && entryTime <= endOfDay;
      const stillPresentFromBefore = entryTime < startOfDay && (statusValue === 'Đang gửi' || (exitTime && exitTime >= startOfDay));
      return enteredToday || stillPresentFromBefore;
    });

  SCRIPT_CACHE.put(cacheKey, JSON.stringify(records), CACHE_EXPIRATION_SECONDS);
  return records;
}

/* -------------------------
   Cập nhật processAndSaveImage: an toàn, trả về file.getUrl() nếu có
   ------------------------- */
function processAndSaveImage(imageData, plate) {
  if (!imageData || !IMAGE_FOLDER_ID || IMAGE_FOLDER_ID === 'ID_THU_MUC_GOOGLE_DRIVE_CUA_BAN') {
    return "";
  }
  try {
    // Nếu imageData đã là URL (từ client offline), trả về trực tiếp
    if (typeof imageData === 'string' && imageData.indexOf('http') === 0) return imageData;

    const imageObject = typeof imageData === 'string' ? JSON.parse(imageData) : imageData;
    if (!imageObject || !imageObject.data) return "";
    const decodedImage = Utilities.base64Decode(imageObject.data);
    const blob = Utilities.newBlob(decodedImage, imageObject.mimeType || 'image/jpeg', `${plate}_${new Date().getTime()}.jpg`);
    const imageFolder = DriveApp.getFolderById(IMAGE_FOLDER_ID);
    const file = imageFolder.createFile(blob);
    // Trả về url file Drive (an toàn)
    return file.getUrl();
  } catch (imgError) {
    logError('processAndSaveImage', imgError);
    return "";
  }
}

/* -------------------------
   Cập nhật clearRelevantCache: bảo vệ khóa khi removeAll
   ------------------------- */
function clearRelevantCache(date) {
  try {
    const dateKey = formatDate(date);
    const keys = [`admin_overview_${dateKey}`, `transactions_${dateKey}`, `records_${dateKey}`];
    SCRIPT_CACHE.removeAll(keys);
  } catch (e) {
    logError('clearRelevantCache', e);
  }
}

// ================== CÁC HÀM XỬ LÝ HÀNH ĐỘNG ==================

function handleSync(queue) {
  if (!Array.isArray(queue) || queue.length === 0) {
    throw new Error("Hàng đợi đồng bộ trống hoặc không hợp lệ.");
  }

  const sheet = getSheet();
  let successCount = 0;
  let errorCount = 0;

  queue.forEach(item => {
    try {
      const timestamp = new Date(item.timestamp);
      if (item.action === 'checkIn') {
        const imageUrl = processAndSaveImage(item.imageData, item.plate);
        sheet.appendRow([
          timestamp, formatDate(timestamp), item.plate.toUpperCase(), item.phone || '',
          timestamp, '', 'Đang gửi', item.uniqueID, item.locationId || '',
          imageUrl, item.isVIP ? 'Có' : 'Không',
          '', ''
        ]);
        successCount++;
        clearRelevantCache(timestamp);
      } else if (item.action === 'checkOut') {
        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const cols = getHeaderIndices(headers);
        let found = false;
        for (let i = data.length - 1; i > 0; i--) {
          if (data[i][cols.uniqueIdCol] === item.uniqueID && data[i][cols.statusCol] === 'Đang gửi') {
            const entryTime = new Date(data[i][cols.entryTimeCol]);
            sheet.getRange(i + 1, cols.exitTimeCol + 1).setValue(timestamp);
            sheet.getRange(i + 1, cols.statusCol + 1).setValue('Đã rời đi');
            sheet.getRange(i + 1, cols.feeCol + 1).setValue(item.fee);
            sheet.getRange(i + 1, cols.paymentMethodCol + 1).setValue(item.paymentMethod);
            found = true;
            clearRelevantCache(entryTime);
            clearRelevantCache(timestamp);
            break;
          }
        }
        if (found) successCount++;
        else errorCount++;
      }
    } catch (e) {
      errorCount++;
      logError('handleSync_item', e);
    }
  });

  return createJsonResponse({ status: 'success', message: `Đồng bộ hoàn tất. Thành công: ${successCount}, Thất bại: ${errorCount}` });
}

function handleEditTransaction(payload) {
  if (payload.secret !== ADMIN_SECRET_KEY) {
    return createJsonResponse({ status: 'error', message: 'Mật khẩu quản trị không đúng.' });
  }

  const { uniqueID, plate, entryTime, exitTime, fee, paymentMethod, status } = payload;
  if (!uniqueID) {
    return createJsonResponse({ status: 'error', message: 'Thiếu UniqueID để xác định giao dịch.' });
  }

  const sheet = getSheet();
  const sheetData = sheet.getDataRange().getValues();
  const headers = sheetData[0];
  const cols = getHeaderIndices(headers);

  if (cols.uniqueIdCol === -1) {
    return createJsonResponse({ status: 'error', message: 'Sheet chưa có cột "UniqueID".' });
  }

  for (let i = 1; i < sheetData.length; i++) {
    if (sheetData[i][cols.uniqueIdCol] == uniqueID) {
      const rowToUpdate = i + 1;
      const originalEntryTime = new Date(sheetData[i][cols.entryTimeCol]);

      if (plate !== undefined && cols.plateCol !== -1) sheet.getRange(rowToUpdate, cols.plateCol + 1).setValue(plate);
      if (entryTime !== undefined && cols.entryTimeCol !== -1) sheet.getRange(rowToUpdate, cols.entryTimeCol + 1).setValue(entryTime ? new Date(entryTime) : '');
      if (exitTime !== undefined && cols.exitTimeCol !== -1) sheet.getRange(rowToUpdate, cols.exitTimeCol + 1).setValue(exitTime ? new Date(exitTime) : '');
      if (fee !== undefined && cols.feeCol !== -1) sheet.getRange(rowToUpdate, cols.feeCol + 1).setValue(fee);
      if (paymentMethod !== undefined && cols.paymentMethodCol !== -1) sheet.getRange(rowToUpdate, cols.paymentMethodCol + 1).setValue(paymentMethod);
      if (status !== undefined && cols.statusCol !== -1) sheet.getRange(rowToUpdate, cols.statusCol + 1).setValue(status);

      SpreadsheetApp.flush();

      // Xóa cache của ngày cũ và ngày mới (nếu có thay đổi)
      clearRelevantCache(originalEntryTime);
      if (entryTime) clearRelevantCache(new Date(entryTime));
      if (exitTime) clearRelevantCache(new Date(exitTime));

      return createJsonResponse({ status: 'success', message: 'Cập nhật thành công.' });
    }
  }

  return createJsonResponse({ status: 'error', message: `Không tìm thấy giao dịch với UniqueID: ${uniqueID}` });
}

function handleSaveConfig(payload) {
  const secret = payload.secret;
  const newConfig = payload.config;

  if (secret !== ADMIN_SECRET_KEY) {
    return createJsonResponse({ status: 'error', message: 'Mật khẩu quản trị không đúng.' });
  }
  if (!newConfig) {
    return createJsonResponse({ status: 'error', message: 'Dữ liệu cấu hình không hợp lệ.' });
  }

  saveSystemConfig(newConfig);
  return createJsonResponse({ status: 'success', message: 'Cấu hình đã được lưu thành công.' });
}

// ================== CÁC HÀM LẤY DỮ LIỆU (GET) ==================

function getVehicleStatus(plate) {
  if (!plate) {
    throw new Error("Thiếu biển số để kiểm tra.");
  }

  const sheet = getSheet();
  const values = safeGetValues(sheet);
  if (!values || values.length < 1) {
    return createJsonResponse({ status: 'success', data: { isParking: false, vehicle: null } });
  }
  const headers = values[0];
  const cols = getHeaderIndices(headers);
  if (cols.plateCol === -1 || cols.statusCol === -1) {
    throw new Error("Sheet thiếu cột Plate hoặc Status.");
  }

  const cleanedPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Quét từ dưới lên để lấy bản ghi mới nhất
  for (let i = values.length - 1; i >= 1; i--) {
    const recordPlate = (values[i][cols.plateCol] || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (recordPlate === cleanedPlate) {
      const isParking = values[i][cols.statusCol] === 'Đang gửi';
      const vehicle = isParking ? arrayToObject(headers, values[i]) : null;
      return createJsonResponse({ status: 'success', data: { isParking: isParking, vehicle: vehicle } });
    }
  }
  return createJsonResponse({ status: 'success', data: { isParking: false, vehicle: null } });
}

function getRecordsForDate(dateStr) {
  const targetDateStr = dateStr && String(dateStr).trim() ? String(dateStr).trim() : formatDate(new Date());
  const cacheKey = `records_${targetDateStr}`;
  const cached = SCRIPT_CACHE.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const sheet = getSheet();
  const values = safeGetValues(sheet);
  if (!values || values.length < 2) {
    SCRIPT_CACHE.put(cacheKey, JSON.stringify([]), CACHE_EXPIRATION_SECONDS);
    return [];
  }
  const headers = values.shift(); // remove header row

  const dateParts = targetDateStr.split('-');
  if (dateParts.length !== 3) {
    throw new Error("Date format phải là yyyy-MM-dd");
  }
  const targetDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
  const spreadsheetTimeZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const startOfDay = new Date(Utilities.formatDate(targetDate, spreadsheetTimeZone, "yyyy-MM-dd'T'00:00:00"));
  const endOfDay = new Date(Utilities.formatDate(targetDate, spreadsheetTimeZone, "yyyy-MM-dd'T'23:59:59"));

  const records = values
    .map(row => arrayToObject(headers, row))
    .filter(record => {
      const entryValue = getObjectValueCaseInsensitive(record, 'Entry Time');
      if (!entryValue) return false;
      const entryTime = new Date(entryValue);
      const exitValue = getObjectValueCaseInsensitive(record, 'Exit Time');
      const exitTime = exitValue ? new Date(exitValue) : null;
      const statusValue = getObjectValueCaseInsensitive(record, 'Status');

      const enteredToday = entryTime >= startOfDay && entryTime <= endOfDay;
      const stillPresentFromBefore = entryTime < startOfDay && (statusValue === 'Đang gửi' || (exitTime && exitTime >= startOfDay));
      return enteredToday || stillPresentFromBefore;
    });

  SCRIPT_CACHE.put(cacheKey, JSON.stringify(records), CACHE_EXPIRATION_SECONDS);
  return records;
}

/* -------------------------
   Cập nhật processAndSaveImage: an toàn, trả về file.getUrl() nếu có
   ------------------------- */
function processAndSaveImage(imageData, plate) {
  if (!imageData || !IMAGE_FOLDER_ID || IMAGE_FOLDER_ID === 'ID_THU_MUC_GOOGLE_DRIVE_CUA_BAN') {
    return "";
  }
  try {
    // Nếu imageData đã là URL (từ client offline), trả về trực tiếp
    if (typeof imageData === 'string' && imageData.indexOf('http') === 0) return imageData;

    const imageObject = typeof imageData === 'string' ? JSON.parse(imageData) : imageData;
    if (!imageObject || !imageObject.data) return "";
    const decodedImage = Utilities.base64Decode(imageObject.data);
    const blob = Utilities.newBlob(decodedImage, imageObject.mimeType || 'image/jpeg', `${plate}_${new Date().getTime()}.jpg`);
    const imageFolder = DriveApp.getFolderById(IMAGE_FOLDER_ID);
    const file = imageFolder.createFile(blob);
    // Trả về url file Drive (an toàn)
    return file.getUrl();
  } catch (imgError) {
    logError('processAndSaveImage', imgError);
    return "";
  }
}

/* -------------------------
   Cập nhật clearRelevantCache: bảo vệ khóa khi removeAll
   ------------------------- */
function clearRelevantCache(date) {
  try {
    const dateKey = formatDate(date);
    const keys = [`admin_overview_${dateKey}`, `transactions_${dateKey}`, `records_${dateKey}`];
    SCRIPT_CACHE.removeAll(keys);
  } catch (e) {
    logError('clearRelevantCache', e);
  }
}

// ================== CÁC HÀM LẤY DỮ LIỆU (GET) ==================

function getAdminOverview(secret, dateString) {
  if (secret !== ADMIN_SECRET_KEY) {
    return createJsonResponse({ status: 'error', message: 'Sai mật khẩu quản trị.' });
  }

  const dateKey = dateString || formatDate(new Date());
  const cacheKey = `admin_overview_${dateKey}`;
  const cached = SCRIPT_CACHE.get(cacheKey);
  if (cached) {
    return createJsonResponse({ status: 'success', data: JSON.parse(cached) });
  }

  try {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const cols = getHeaderIndices(headers);

    const targetDate = dateString ? new Date(dateString + "T00:00:00") : new Date();
    const targetDateStr = formatDate(targetDate);

    let totalRevenueForDate = 0;
    let totalVehiclesForDate = 0;
    let vehiclesCurrentlyParking = 0;
    const trafficByHour = Array(24).fill(0);
    const revenueByLocation = {};
    const vehiclesByLocation = {};

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const entryTime = new Date(row[cols.entryTimeCol]);
      const status = row[cols.statusCol];

      if (formatDate(entryTime) === targetDateStr) {
        const fee = parseFloat(row[cols.feeCol]) || 0;
        const locationId = row[cols.locationIdCol];

        totalVehiclesForDate++;
        if (fee > 0) totalRevenueForDate += fee;

        const entryHour = entryTime.getHours();
        trafficByHour[entryHour]++;

        if (locationId) {
          revenueByLocation[locationId] = (revenueByLocation[locationId] || 0) + fee;
          vehiclesByLocation[locationId] = (vehiclesByLocation[locationId] || 0) + 1;
        }
      }

      if (status === 'Đang gửi') {
        vehiclesCurrentlyParking++;
      }
    }

    const resultData = {
      totalRevenueForDate,
      totalVehiclesForDate,
      vehiclesCurrentlyParking,
      revenueByLocation,
      vehiclesByLocation,
      trafficByHour,
    };

    // Chỉ cache nếu không phải là ngày trong tương lai
    if (targetDate <= new Date()) {
      SCRIPT_CACHE.put(cacheKey, JSON.stringify(resultData), CACHE_EXPIRATION_SECONDS);
    }

    return createJsonResponse({ status: 'success', data: resultData });

  } catch (err) {
    logError("getAdminOverview", err);
    return createJsonResponse({ status: 'error', message: `Lỗi xử lý dữ liệu tổng quan: ${err.message}` });
  }
}

function getTransactions(secret, dateString) {
  if (secret !== ADMIN_SECRET_KEY) {
    return createJsonResponse({ status: 'error', message: 'Sai mật khẩu quản trị.' });
  }

  const dateKey = dateString || formatDate(new Date());
  const cacheKey = `transactions_${dateKey}`;
  const cached = SCRIPT_CACHE.get(cacheKey);
  if (cached) {
    return createJsonResponse({ status: 'success', data: { transactions: JSON.parse(cached) } });
  }

  try {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const cols = getHeaderIndices(headers);

    const targetDate = dateString ? new Date(dateString + "T00:00:00") : new Date();
    const targetDateStr = formatDate(targetDate);

    const transactions = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const entryTime = new Date(row[cols.entryTimeCol]);
      if (formatDate(entryTime) === targetDateStr) {
        transactions.push(arrayToObject(headers, row));
      }
    }

    transactions.sort((a, b) => new Date(b['Entry Time']) - new Date(a['Entry Time']));

    if (targetDate <= new Date()) {
      SCRIPT_CACHE.put(cacheKey, JSON.stringify(transactions), CACHE_EXPIRATION_SECONDS);
    }

    return createJsonResponse({ status: 'success', data: { transactions } });

  } catch (err) {
    logError("getTransactions", err);
    return createJsonResponse({ status: 'error', message: `Lỗi tải danh sách giao dịch: ${err.message}` });
  }
}

// ================== HÀM PHÂN TÍCH AI (GEMINI) ==================

function getAInsights(dataSummary) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.includes("YOUR_API_KEY")) {
    return "API Key cho AI chưa được cấu hình. Vui lòng cấu hình để sử dụng tính năng này.";
  }

  const prompt = `
    Bạn là một trợ lý quản lý bãi xe thông minh. Dựa vào dữ liệu JSON sau đây về hoạt động của các bãi xe trong một ngày, hãy đưa ra các phân tích và nhận định ngắn gọn, tập trung vào những điểm chính.
    Dữ liệu: ${JSON.stringify(dataSummary)}

    Hãy trả lời bằng tiếng Việt theo định dạng Markdown, bao gồm 3 phần:
    1.  **Tóm tắt chung:** Đưa ra 2-3 gạch đầu dòng tóm tắt những con số quan trọng nhất (tổng doanh thu, tổng lượt xe, xe đang gửi).
    2.  **Phân tích & Nhận định:** Đưa ra 2-3 gạch đầu dòng về các điểm nổi bật hoặc bất thường (ví dụ: giờ cao điểm, điểm đông nhất, điểm có doanh thu cao/thấp bất thường, so sánh với dữ liệu trung bình nếu có).
    3.  **Gợi ý:** Nếu thấy có điểm gì đáng chú ý, đưa ra một gợi ý ngắn gọn. Ví dụ: "Lưu lượng buổi trưa cao, có thể xem xét tăng cường nhân sự vào khung giờ này."

    Lưu ý: Giữ cho các nhận định thật ngắn gọn, đi thẳng vào vấn đề, hữu ích cho người quản lý.
  `;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }]
    })
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    if (result.candidates && result.candidates.length > 0) {
      return result.candidates[0].content.parts[0].text;
    }
    return "Trợ lý AI không có phản hồi. Có thể do nội dung không phù hợp.";
  } catch (e) {
    logError("getAInsights", e);
    return "Không thể kết nối đến trợ lý AI. Vui lòng kiểm tra lại cấu hình.";
  }
}

// ================== CÁC HÀM TIỆN ÍCH (UTILITY) ==================

function getSheet() {
  try {
    return SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  } catch (e) {
    throw new Error("Không thể mở Bảng tính. Vui lòng kiểm tra SHEET_ID và SHEET_NAME.");
  }
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function arrayToObject(headers, row) {
  return headers.reduce((acc, header, index) => {
    const value = row[index];
    // Chuyển đổi Date object thành chuỗi ISO để đảm bảo tính nhất quán khi JSON.stringify
    acc[header] = (value instanceof Date && !isNaN(value)) ? value.toISOString() : value;
    return acc;
  }, {});
}

function findHeaderIndex(headers, name) {
  const lowerCaseName = String(name).toLowerCase();
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i] || '';
    if (h !== undefined && h !== null && String(h).toLowerCase() === lowerCaseName) return i;
  }
  return -1;
}

function getHeaderIndices(headers) {
  return {
    plateCol: findHeaderIndex(headers, 'Plate'),
    statusCol: findHeaderIndex(headers, 'Status'),
    entryTimeCol: findHeaderIndex(headers, 'Entry Time'),
    exitTimeCol: findHeaderIndex(headers, 'Exit Time'),
    feeCol: findHeaderIndex(headers, 'Fee'),
    locationIdCol: findHeaderIndex(headers, 'LocationID'),
    paymentMethodCol: findHeaderIndex(headers, 'PaymentMethod'),
    uniqueIdCol: findHeaderIndex(headers, 'UniqueID')
  };
}

function getObjectValueCaseInsensitive(obj, key) {
  if (!obj || !key) return undefined;
  const lowerKey = key.toLowerCase();
  const objKey = Object.keys(obj).find(k => k.toLowerCase() === lowerKey);
  return objKey ? obj[objKey] : undefined;
}

function formatDate(date) {
  const spreadsheetTimeZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return Utilities.formatDate(date, spreadsheetTimeZone, 'yyyy-MM-dd');
}

function clearRelevantCache(date) {
  try {
    const dateKey = formatDate(date);
    const keys = [`admin_overview_${dateKey}`, `transactions_${dateKey}`, `records_${dateKey}`];
    SCRIPT_CACHE.removeAll(keys);
  } catch (e) {
    logError('clearRelevantCache', e);
  }
}


function logError(functionName, error) {
  console.error(`Lỗi trong hàm ${functionName}: ${error.message} tại ${error.stack}`);
}
