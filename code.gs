/**
 * @file code.gs
 * @version 2.2 - Rewritten & Stabilized
 * @description Phiên bản được viết lại hoàn toàn để đảm bảo sự ổn định, rõ ràng và loại bỏ các lỗi cú pháp.
 * Hệ thống giữ nguyên toàn bộ logic xử lý dữ liệu xe, VIP, lưu ảnh, trang quản trị và cache.
 * Tác giả: Nguyễn Cao Hoàng Quý (Được hỗ trợ bởi Gemini Code Assist)
 */

// ================== CẤU HÌNH HỆ THỐNG ==================
const SHEET_ID = '1uYWrFvS_6L-iIVv4eyJSL8i2tb9GGPJmE8dGIbHsor4';
const SHEET_NAME = 'Sheet1';
const IMAGE_FOLDER_ID = '10_RCBR7UZh-WX59rpHjwQuZSqpcrL8pH';
const ADMIN_SECRET_KEY = "admin123";

// Cấu hình Cache
const CACHE_EXPIRATION_SECONDS = 300; // 5 phút
const SCRIPT_CACHE = CacheService.getScriptCache();

// ================== CÁC HÀM CHÍNH (ENTRY POINTS) ==================

/**
 * Xử lý các yêu cầu GET (lấy dữ liệu).
 */
function doGet(e) {
  try {
    const params = e.parameter;
    switch (params.action) {
      case 'getAdminOverview':
        return getAdminOverview(params.secret, params.date);
      case 'getTransactions':
        return getTransactions(params.secret, params.date);
      case 'getVehicleStatus':
        return getVehicleStatus(params.plate);
      case 'getVehicles':
        return createJsonResponse({ status: 'success', data: getRecordsForDate(params.date) });
      default:
        // Xử lý các request cũ để tương thích
        if (params.plate) {
          return createJsonResponse({ status: 'success', data: getVehicleHistory(params.plate) });
        }
        throw new Error("Yêu cầu không hợp lệ hoặc thiếu tham số 'action'.");
    }
  } catch (error) {
    logError('doGet', error);
    return createJsonResponse({ status: 'error', message: `Lỗi xử lý yêu cầu: ${error.message}` });
  }
}

/**
 * Xử lý các yêu cầu POST (ghi dữ liệu).
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) { // Thử khóa trong 20 giây
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
      case 'sync':
        return handleSync(payload.queue);
      default:
        throw new Error(`Hành động '${payload.action}' không được hỗ trợ.`);
    }
  } catch (error) {
    logError('doPost', error);
    return createJsonResponse({ status: 'error', message: `Lỗi máy chủ: ${error.message}` });
  } finally {
    lock.releaseLock();
  }
}

// ================== CÁC HÀM XỬ LÝ HÀNH ĐỘNG (HANDLERS) ==================

/**
 * Xử lý cho xe vào bãi.
 */
function handleCheckIn(payload) {
  const { plate, phone, uniqueID, locationId, imageData, isVIP } = payload;
  if (!plate || !uniqueID) throw new Error("Thiếu biển số hoặc UniqueID.");

  const sheet = getSheet();
  const values = safeGetValues(sheet);
  const headers = values[0] || [];
  const cols = getHeaderIndices(headers);
  const cleanedPlate = (plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Kiểm tra xem xe có đang ở trong bãi không
  for (let i = values.length - 1; i >= 1; i--) {
    const recordPlate = (values[i][cols.plateCol] || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (recordPlate === cleanedPlate && values[i][cols.statusCol] === 'Đang gửi') {
      throw new Error(`Xe [${plate}] đã có trong bãi.`);
    }
  }

  const now = new Date();
  const imageUrl = processAndSaveImage(imageData, plate);

  sheet.appendRow([
    now,
    formatDate(now),
    plate.toUpperCase(),
    phone || '',
    now,
    '', // Exit Time
    'Đang gửi',
    uniqueID,
    locationId || '',
    imageUrl || '',
    isVIP ? 'Có' : 'Không',
    '', // Fee
    ''  // PaymentMethod
  ]);

  clearRelevantCache(now);
  return createJsonResponse({ status: 'success', message: 'Gửi xe thành công.' });
}

/**
 * Xử lý cho xe ra khỏi bãi.
 */
function handleCheckOut(payload) {
  const { uniqueID, fee, paymentMethod } = payload;
  if (!uniqueID) throw new Error("Thiếu UniqueID.");

  const sheet = getSheet();
  const values = safeGetValues(sheet);
  if (values.length < 2) throw new Error("Không có dữ liệu để xử lý.");

  const headers = values[0];
  const cols = getHeaderIndices(headers);
  if (cols.uniqueIdCol === -1 || cols.statusCol === -1) {
    throw new Error("Sheet thiếu cột bắt buộc (UniqueID/Status).");
  }

  const now = new Date();
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i][cols.uniqueIdCol] === uniqueID && values[i][cols.statusCol] === 'Đang gửi') {
      const rowIndex = i + 1;
      const entryTime = new Date(values[i][cols.entryTimeCol]);

      sheet.getRange(rowIndex, cols.exitTimeCol + 1).setValue(now);
      sheet.getRange(rowIndex, cols.statusCol + 1).setValue('Đã rời đi');
      if (cols.feeCol !== -1) sheet.getRange(rowIndex, cols.feeCol + 1).setValue(fee);
      if (cols.paymentMethodCol !== -1) sheet.getRange(rowIndex, cols.paymentMethodCol + 1).setValue(paymentMethod);

      clearRelevantCache(entryTime);
      clearRelevantCache(now);

      return createJsonResponse({ status: 'success', message: 'Cho xe ra thành công.' });
    }
  }

  throw new Error('Không tìm thấy xe đang gửi với UniqueID này.');
}

/**
 * Xử lý đồng bộ các hành động offline.
 */
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
          imageUrl, item.isVIP ? 'Có' : 'Không', '', ''
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
        if (found) successCount++; else errorCount++;
      }
    } catch (e) {
      errorCount++;
      logError('handleSync_item', e);
    }
  });

  return createJsonResponse({ status: 'success', message: `Đồng bộ hoàn tất. Thành công: ${successCount}, Thất bại: ${errorCount}` });
}

/**
 * Xử lý chỉnh sửa một giao dịch bởi admin.
 */
function handleEditTransaction(payload) {
  if (payload.secret !== ADMIN_SECRET_KEY) {
    throw new Error('Mật khẩu quản trị không đúng.');
  }

  const { uniqueID, plate, entryTime, exitTime, fee, paymentMethod, status } = payload;
  if (!uniqueID) throw new Error('Thiếu UniqueID để xác định giao dịch.');

  const sheet = getSheet();
  const sheetData = sheet.getDataRange().getValues();
  const headers = sheetData[0];
  const cols = getHeaderIndices(headers);

  if (cols.uniqueIdCol === -1) throw new Error('Sheet chưa có cột "UniqueID".');

  for (let i = 1; i < sheetData.length; i++) {
    if (sheetData[i][cols.uniqueIdCol] == uniqueID) {
      const rowToUpdate = i + 1;
      const originalEntryTime = new Date(sheetData[i][cols.entryTimeCol]);

      if (plate !== undefined && cols.plateCol !== -1) sheet.getRange(rowToUpdate, cols.plateCol + 1).setValue(plate);
      if (entryTime !== undefined && cols.entryTimeCol !== -1) sheet.getRange(rowToUpdate, cols.entryTimeCol + 1).setValue(entryTime ? new Date(entryTime) : null);
      if (exitTime !== undefined && cols.exitTimeCol !== -1) sheet.getRange(rowToUpdate, cols.exitTimeCol + 1).setValue(exitTime ? new Date(exitTime) : null);
      if (fee !== undefined && cols.feeCol !== -1) sheet.getRange(rowToUpdate, cols.feeCol + 1).setValue(fee);
      if (paymentMethod !== undefined && cols.paymentMethodCol !== -1) sheet.getRange(rowToUpdate, cols.paymentMethodCol + 1).setValue(paymentMethod);
      if (status !== undefined && cols.statusCol !== -1) sheet.getRange(rowToUpdate, cols.statusCol + 1).setValue(status);

      SpreadsheetApp.flush();

      clearRelevantCache(originalEntryTime);
      if (entryTime) clearRelevantCache(new Date(entryTime));
      if (exitTime) clearRelevantCache(new Date(exitTime));

      return createJsonResponse({ status: 'success', message: 'Cập nhật thành công.' });
    }
  }

  throw new Error(`Không tìm thấy giao dịch với UniqueID: ${uniqueID}`);
}


// ================== CÁC HÀM LẤY DỮ LIỆU (GETTERS) ==================

/**
 * Lấy trạng thái của một xe (đang gửi hay không).
 */
function getVehicleStatus(plate) {
  if (!plate) throw new Error("Thiếu biển số để kiểm tra.");

  const values = safeGetValues(getSheet());
  if (values.length < 2) return createJsonResponse({ status: 'success', data: { isParking: false, vehicle: null } });

  const headers = values[0];
  const cols = getHeaderIndices(headers);
  const cleanedPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');

  for (let i = values.length - 1; i >= 1; i--) {
    const recordPlate = (values[i][cols.plateCol] || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (recordPlate === cleanedPlate) {
      const isParking = values[i][cols.statusCol] === 'Đang gửi';
      const vehicle = isParking ? arrayToObject(headers, values[i]) : null;
      return createJsonResponse({ status: 'success', data: { isParking, vehicle } });
    }
  }
  return createJsonResponse({ status: 'success', data: { isParking: false, vehicle: null } });
}

/**
 * Lấy lịch sử gửi xe của một biển số.
 */
function getVehicleHistory(plate) {
  const values = safeGetValues(getSheet());
  if (values.length < 2) return [];

  const headers = values.shift();
  const cols = getHeaderIndices(headers);
  const cleanedPlate = (plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  return values
    .filter(row => (row[cols.plateCol] || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanedPlate)
    .map(row => arrayToObject(headers, row))
    .sort((a, b) => new Date(getObjectValueCaseInsensitive(b, 'Entry Time')) - new Date(getObjectValueCaseInsensitive(a, 'Entry Time')));
}

/**
 * Lấy danh sách các xe trong một ngày cụ thể (bao gồm cả xe từ ngày cũ còn gửi).
 */
function getRecordsForDate(dateStr) {
  const targetDateStr = dateStr || formatDate(new Date());
  const cacheKey = `records_${targetDateStr}`;
  const cached = SCRIPT_CACHE.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const values = safeGetValues(getSheet());
  if (values.length < 2) return [];

  const headers = values.shift();
  const spreadsheetTimeZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const startOfDay = new Date(Utilities.formatDate(new Date(targetDateStr + 'T00:00:00'), spreadsheetTimeZone, "yyyy-MM-dd'T'00:00:00"));
  const endOfDay = new Date(Utilities.formatDate(new Date(targetDateStr + 'T00:00:00'), spreadsheetTimeZone, "yyyy-MM-dd'T'23:59:59"));

  const records = values
    .map(row => arrayToObject(headers, row))
    .filter(record => {
      const entryTime = new Date(getObjectValueCaseInsensitive(record, 'Entry Time'));
      if (isNaN(entryTime)) return false;
      const exitTime = getObjectValueCaseInsensitive(record, 'Exit Time') ? new Date(getObjectValueCaseInsensitive(record, 'Exit Time')) : null;
      const status = getObjectValueCaseInsensitive(record, 'Status');

      const enteredToday = entryTime >= startOfDay && entryTime <= endOfDay;
      const stillPresentFromBefore = entryTime < startOfDay && (status === 'Đang gửi' || (exitTime && exitTime >= startOfDay));
      return enteredToday || stillPresentFromBefore;
    });

  SCRIPT_CACHE.put(cacheKey, JSON.stringify(records), CACHE_EXPIRATION_SECONDS);
  return records;
}

/**
 * Lấy dữ liệu tổng quan cho trang quản trị.
 */
function getAdminOverview(secret, dateString) {
  if (secret !== ADMIN_SECRET_KEY) throw new Error('Sai mật khẩu quản trị.');

  const dateKey = dateString || formatDate(new Date());
  const cacheKey = `admin_overview_${dateKey}`;
  const cached = SCRIPT_CACHE.get(cacheKey);
  if (cached) return createJsonResponse({ status: 'success', data: JSON.parse(cached) });

  const data = safeGetValues(getSheet());
  if (data.length < 2) return createJsonResponse({ status: 'success', data: {} });

  const headers = data[0];
  const cols = getHeaderIndices(headers);
  const targetDateStr = dateKey;

  let totalRevenueForDate = 0, totalVehiclesForDate = 0, vehiclesCurrentlyParking = 0;
  const trafficByHour = Array(24).fill(0);
  const revenueByLocation = {}, vehiclesByLocation = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const entryTime = new Date(row[cols.entryTimeCol]);

    if (formatDate(entryTime) === targetDateStr) {
      const fee = parseFloat(row[cols.feeCol]) || 0;
      const locationId = row[cols.locationIdCol];
      totalVehiclesForDate++;
      if (fee > 0) totalRevenueForDate += fee;
      trafficByHour[entryTime.getHours()]++;
      if (locationId) {
        revenueByLocation[locationId] = (revenueByLocation[locationId] || 0) + fee;
        vehiclesByLocation[locationId] = (vehiclesByLocation[locationId] || 0) + 1;
      }
    }
    if (row[cols.statusCol] === 'Đang gửi') {
      vehiclesCurrentlyParking++;
    }
  }

  const resultData = {
    totalRevenueForDate, totalVehiclesForDate, vehiclesCurrentlyParking,
    revenueByLocation, vehiclesByLocation, trafficByHour,
  };

  if (new Date(dateKey) <= new Date()) {
    SCRIPT_CACHE.put(cacheKey, JSON.stringify(resultData), CACHE_EXPIRATION_SECONDS);
  }
  return createJsonResponse({ status: 'success', data: resultData });
}

/**
 * Lấy danh sách giao dịch chi tiết cho trang quản trị.
 */
function getTransactions(secret, dateString) {
  if (secret !== ADMIN_SECRET_KEY) throw new Error('Sai mật khẩu quản trị.');

  const dateKey = dateString || formatDate(new Date());
  const cacheKey = `transactions_${dateKey}`;
  const cached = SCRIPT_CACHE.get(cacheKey);
  if (cached) return createJsonResponse({ status: 'success', data: { transactions: JSON.parse(cached) } });

  const data = safeGetValues(getSheet());
  if (data.length < 2) return createJsonResponse({ status: 'success', data: { transactions: [] } });

  const headers = data[0];
  const cols = getHeaderIndices(headers);
  const targetDateStr = dateKey;
  const transactions = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[cols.entryTimeCol] && formatDate(new Date(row[cols.entryTimeCol])) === targetDateStr) {
      transactions.push(arrayToObject(headers, row));
    }
  }

  transactions.sort((a, b) => new Date(getObjectValueCaseInsensitive(b, 'Entry Time')) - new Date(getObjectValueCaseInsensitive(a, 'Entry Time')));

  if (new Date(dateKey) <= new Date()) {
    SCRIPT_CACHE.put(cacheKey, JSON.stringify(transactions), CACHE_EXPIRATION_SECONDS);
  }
  return createJsonResponse({ status: 'success', data: { transactions } });
}


// ================== CÁC HÀM TIỆN ÍCH (UTILITIES) ==================

function getSheet() {
  try {
    return SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  } catch (e) {
    throw new Error("Không thể mở Bảng tính. Vui lòng kiểm tra SHEET_ID và SHEET_NAME.");
  }
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function safeGetValues(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return [];
  const lastCol = sheet.getLastColumn();
  return sheet.getRange(1, 1, lastRow, Math.max(1, lastCol)).getValues();
}

function arrayToObject(headers, row) {
  return headers.reduce((acc, header, index) => {
    const value = row[index];
    acc[header] = (value instanceof Date && !isNaN(value)) ? value.toISOString() : value;
    return acc;
  }, {});
}

function findHeaderIndex(headers, name) {
  const lowerCaseName = String(name).toLowerCase();
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i]).toLowerCase() === lowerCaseName) return i;
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
  return Utilities.formatDate(date, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

function processAndSaveImage(imageData, plate) {
  if (!imageData || !IMAGE_FOLDER_ID) return "";
  try {
    if (typeof imageData === 'string' && imageData.startsWith('http')) return imageData;
    const imageObject = typeof imageData === 'string' ? JSON.parse(imageData) : imageData;
    if (!imageObject || !imageObject.data) return "";

    const decodedImage = Utilities.base64Decode(imageObject.data);
    const blob = Utilities.newBlob(decodedImage, imageObject.mimeType || 'image/jpeg', `${plate}_${new Date().getTime()}.jpg`);
    const imageFolder = DriveApp.getFolderById(IMAGE_FOLDER_ID);
    const file = imageFolder.createFile(blob);
    return file.getUrl();
  } catch (imgError) {
    logError('processAndSaveImage', imgError);
    return "";
  }
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
