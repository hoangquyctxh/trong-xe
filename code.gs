/**
 * @file Code.gs
 * @version 6.1 - Final Consolidated Version
 * @description Phiên bản tổng hợp cuối cùng, chứa logic nghiệp vụ cốt lõi và các hàm điều phối yêu cầu.
 *              Tệp này gọi các hàm chuyên biệt từ các tệp khác như Security.gs.
 *              Đã bao gồm đầy đủ các hàm từ phiên bản gốc và các tối ưu hóa hiệu suất.
 * Tác giả: Nguyễn Cao Hoàng Quý (Được hỗ trợ bởi Gemini Code Assist)
 */

// =================================================================================
// 1. KHU VỰC CẤU HÌNH TRUNG TÂM
// Vui lòng chỉnh sửa các giá trị trong phần này cho phù hợp với hệ thống của bạn.
// =================================================================================

const CONFIG = {
  // ID của file Google Sheets. Lấy từ URL, ví dụ: .../d/SHEET_ID_CUA_BAN/edit
  SHEET_ID: "1uYWrFvS_6L-iIVv4eyJSL8i2tb9GGPJmE8dGIbHsor4",

  // Tên các trang tính (sheet) trong file Google Sheets của bạn.
  // Quan trọng: Tên ở đây phải TRÙNG KHỚP 100% với tên bạn đặt trong file Google Sheets.
  SHEET_NAMES: {
    TRANSACTIONS: "Transactions",    // Sheet chứa lịch sử giao dịch xe
    SECURITY_ALERTS: "SecurityAlerts" // Sheet chứa các cảnh báo an ninh
  },

  // ID của thư mục trên Google Drive để lưu ảnh chụp (nếu có).
  IMAGE_FOLDER_ID: "10_RCBR7UZh-WX59rpHjwQuZSqpcrL8pH",

  // Mật khẩu để truy cập trang quản trị.
  ADMIN_SECRET_KEY: "admin123",

  // Cấu hình thời gian cache dữ liệu để tăng tốc độ. (300 giây = 5 phút)
  CACHE_EXPIRATION_SECONDS: 300,
};

// =================================================================================
// 2. CÁC HÀM CHÍNH (ENTRY POINTS) - KHÔNG CẦN CHỈNH SỬA
// =================================================================================

const SCRIPT_CACHE = CacheService.getScriptCache();
const SCRIPT_LOCK = LockService.getScriptLock();

/**
 * Xử lý các yêu cầu GET (lấy dữ liệu).
 * @param {object} e - Đối tượng sự kiện từ Google Apps Script.
 * @returns {ContentService} - Dữ liệu trả về dưới dạng JSON.
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
      case 'getVehicleHistoryByPlate':
        return getVehicleHistoryByPlate(params.plate);
      case 'getVehicleHistoryByUniqueID':
        return getVehicleHistoryByUniqueID(params.uniqueID);
      // Điều hướng đến hàm trong Security.gs
      case 'getActiveAlerts':
        return getActiveAlerts();
      default:
        throw new Error(`Hành động GET '${params.action}' không hợp lệ.`);
    }
  } catch (error) {
    console.error(`Lỗi trong doGet: ${error.message}\nStack: ${error.stack}`);
    return createJsonResponse({ status: 'error', message: `Lỗi xử lý yêu cầu: ${error.message}` });
  }
}

/**
 * Xử lý các yêu cầu POST (ghi dữ liệu).
 * @param {object} e - Đối tượng sự kiện từ Google Apps Script.
 * @returns {ContentService} - Kết quả xử lý dưới dạng JSON.
 */
function doPost(e) {
  if (!SCRIPT_LOCK.tryLock(20000)) { // Chờ tối đa 20 giây
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
      // Điều hướng đến các hàm trong Security.gs
      case 'addOrUpdateAlert':
        return addOrUpdateAlert(payload);
      case 'removeAlert':
        return removeAlert(payload);
      default:
        throw new Error(`Hành động POST '${payload.action}' không được hỗ trợ.`);
    }
  } catch (error) {
    console.error(`Lỗi trong doPost: ${error.message}\nStack: ${error.stack}`);
    return createJsonResponse({ status: 'error', message: `Lỗi máy chủ: ${error.message}` });
  } finally {
    SCRIPT_LOCK.releaseLock();
  }
}

// =================================================================================
// 3. CÁC HÀM XỬ LÝ GIAO DỊCH (CHECK-IN, CHECK-OUT, EDIT...)
// Đây là nơi chứa các hàm logic nghiệp vụ chính.
// =================================================================================

function handleCheckIn(payload) {
  const { plate, phone, uniqueID, locationId, imageData, isVIP } = payload;
  if (!plate || !uniqueID) throw new Error("Thiếu biển số hoặc UniqueID.");

  const sheet = getSheetByName(CONFIG.SHEET_NAMES.TRANSACTIONS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const cols = getHeaderIndices(headers);
  const cleanedPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');

  for (let i = values.length - 1; i >= 1; i--) {
    const recordPlate = (values[i][cols.plateCol] || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (recordPlate === cleanedPlate && values[i][cols.statusCol] === 'Đang gửi') {
      throw new Error(`Xe [${plate}] đã có trong bãi.`);
    }
  }

  const now = new Date();
  const imageUrl = processAndSaveImage(imageData, plate);

  sheet.appendRow([
    now, formatDate(now), plate.toUpperCase(), phone || '', now, '', 'Đang gửi', uniqueID,
    locationId || '', imageUrl || '', isVIP ? 'Có' : 'Không', '', ''
  ]);
  
  clearRelevantCache(now);
  return createJsonResponse({ status: 'success', message: 'Gửi xe thành công.' });
}

function handleCheckOut(payload) {
  const { uniqueID, fee, paymentMethod } = payload;
  if (!uniqueID) throw new Error("Thiếu UniqueID.");

  const sheet = getSheetByName(CONFIG.SHEET_NAMES.TRANSACTIONS);
  const values = sheet.getDataRange().getValues();
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

function handleEditTransaction(payload) {
  if (payload.secret !== CONFIG.ADMIN_SECRET_KEY) {
    throw new Error('Mật khẩu quản trị không đúng.');
  }

  const { uniqueID, plate, entryTime, exitTime, fee, paymentMethod, status } = payload;
  if (!uniqueID) throw new Error('Thiếu UniqueID để xác định giao dịch.');

  const sheet = getSheetByName(CONFIG.SHEET_NAMES.TRANSACTIONS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const cols = getHeaderIndices(headers);

  if (cols.uniqueIdCol === -1) throw new Error('Sheet chưa có cột "UniqueID".');

  let rowIndexToUpdate = -1;
  let originalEntryTime = null;

  for (let i = 1; i < values.length; i++) {
    if (values[i][cols.uniqueIdCol] == uniqueID) {
      rowIndexToUpdate = i + 1; // 1-based index
      originalEntryTime = new Date(values[i][cols.entryTimeCol]);
      break;
    }
  }

  if (rowIndexToUpdate === -1) {
    throw new Error(`Không tìm thấy giao dịch với UniqueID: ${uniqueID}`);
  }

  const rowData = values[rowIndexToUpdate - 1].slice();

  if (plate !== undefined && cols.plateCol !== -1) rowData[cols.plateCol] = plate;
  if (entryTime !== undefined && cols.entryTimeCol !== -1) rowData[cols.entryTimeCol] = entryTime ? new Date(entryTime) : null;
  if (exitTime !== undefined && cols.exitTimeCol !== -1) rowData[cols.exitTimeCol] = exitTime ? new Date(exitTime) : null;
  if (fee !== undefined && cols.feeCol !== -1) rowData[cols.feeCol] = fee;
  if (paymentMethod !== undefined && cols.paymentMethodCol !== -1) rowData[cols.paymentMethodCol] = paymentMethod;
  if (status !== undefined && cols.statusCol !== -1) rowData[cols.statusCol] = status;

  sheet.getRange(rowIndexToUpdate, 1, 1, rowData.length).setValues([rowData]);

  clearRelevantCache(originalEntryTime);
  if (entryTime) clearRelevantCache(new Date(entryTime));
  if (exitTime) clearRelevantCache(new Date(exitTime));

  return createJsonResponse({ status: 'success', message: 'Cập nhật thành công.' });
}

function handleSync(queue) {
  if (!Array.isArray(queue) || queue.length === 0) {
    throw new Error("Hàng đợi đồng bộ trống hoặc không hợp lệ.");
  }

  const sheet = getSheetByName(CONFIG.SHEET_NAMES.TRANSACTIONS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const cols = getHeaderIndices(headers);

  let successCount = 0;
  let errorCount = 0;
  
  let newRowsToAppend = [];
  let rowsToUpdateMap = new Map();
  let datesToClearCache = new Set();

  queue.forEach(item => {
    try {
      const timestamp = new Date(item.timestamp);
      datesToClearCache.add(formatDate(timestamp));

      if (item.action === 'checkIn') {
        const imageUrl = processAndSaveImage(item.imageData, item.plate);
        newRowsToAppend.push([
          timestamp, formatDate(timestamp), item.plate.toUpperCase(), item.phone || '',
          timestamp, '', 'Đang gửi', item.uniqueID, item.locationId || '',
          imageUrl, item.isVIP ? 'Có' : 'Không', '', ''
        ]);
        successCount++;
      } else if (item.action === 'checkOut' || item.action === 'editTransaction') {
        let foundRowIndex = -1;
        for (let i = 1; i < values.length; i++) {
          if (values[i][cols.uniqueIdCol] === item.uniqueID && (item.action === 'editTransaction' || values[i][cols.statusCol] === 'Đang gửi')) {
            foundRowIndex = i;
            if (item.entryTime) datesToClearCache.add(formatDate(new Date(item.entryTime)));
            if (item.exitTime) datesToClearCache.add(formatDate(new Date(item.exitTime)));
            break;
          }
        }

        if (foundRowIndex !== -1) {
          const rowData = values[foundRowIndex].slice();
          if (item.action === 'checkOut') {
            rowData[cols.exitTimeCol] = timestamp;
            rowData[cols.statusCol] = 'Đã rời đi';
            if (cols.feeCol !== -1) rowData[cols.feeCol] = item.fee;
            if (cols.paymentMethodCol !== -1) rowData[cols.paymentMethodCol] = item.paymentMethod;
          } else if (item.action === 'editTransaction') {
            if (item.plate !== undefined && cols.plateCol !== -1) rowData[cols.plateCol] = item.plate;
            if (item.entryTime !== undefined && cols.entryTimeCol !== -1) rowData[cols.entryTimeCol] = item.entryTime ? new Date(item.entryTime) : null;
            if (item.exitTime !== undefined && cols.exitTimeCol !== -1) rowData[cols.exitTimeCol] = item.exitTime ? new Date(item.exitTime) : null;
            if (item.fee !== undefined && cols.feeCol !== -1) rowData[cols.feeCol] = item.fee;
            if (item.paymentMethod !== undefined && cols.paymentMethodCol !== -1) rowData[cols.paymentMethodCol] = item.paymentMethod;
            if (item.status !== undefined && cols.statusCol !== -1) rowData[cols.statusCol] = item.status;
          }
          rowsToUpdateMap.set(foundRowIndex, rowData);
          successCount++;
        } else {
          errorCount++;
        }
      }
    } catch (e) {
      errorCount++;
      console.error(`Lỗi xử lý item trong handleSync: ${e.message}`);
    }
  });

  try {
    if (newRowsToAppend.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newRowsToAppend.length, newRowsToAppend[0].length).setValues(newRowsToAppend);
    }
    if (rowsToUpdateMap.size > 0) {
      const allSheetValues = sheet.getDataRange().getValues();
      rowsToUpdateMap.forEach((updatedRowData, original0BasedIndex) => {
        if (original0BasedIndex < allSheetValues.length) {
          allSheetValues[original0BasedIndex] = updatedRowData;
        }
      });
      sheet.getRange(1, 1, allSheetValues.length, allSheetValues[0].length).setValues(allSheetValues);
    }
  } catch (e) {
    throw new Error(`Lỗi khi ghi dữ liệu đồng bộ: ${e.message}`);
  }

  datesToClearCache.forEach(dateKey => clearRelevantCache(new Date(dateKey)));

  return createJsonResponse({ status: 'success', message: `Đồng bộ hoàn tất. Thành công: ${successCount}, Thất bại: ${errorCount}` });
}

// =================================================================================
// 4. CÁC HÀM LẤY DỮ LIỆU (GETTERS)
// Các hàm này chỉ đọc dữ liệu và thường sử dụng cache để tăng tốc.
// =================================================================================

function getVehicleStatus(plate) {
  if (!plate) throw new Error("Thiếu biển số để kiểm tra.");

  const values = getSheetByName(CONFIG.SHEET_NAMES.TRANSACTIONS).getDataRange().getValues();
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

function getVehicleHistoryByPlate(plate) {
  const sheet = getSheetByName(CONFIG.SHEET_NAMES.TRANSACTIONS);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return createJsonResponse({ status: 'success', data: [] });

  const headers = values.shift();
  const cols = getHeaderIndices(headers);
  const cleanedPlate = (plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  const history = values
    .filter(row => (row[cols.plateCol] || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanedPlate)
    .map(row => arrayToObject(headers, row))
    .sort((a, b) => new Date(getObjectValueCaseInsensitive(b, 'Entry Time')) - new Date(getObjectValueCaseInsensitive(a, 'Entry Time')));
    
  return createJsonResponse({ status: 'success', data: history });
}

function getVehicleHistoryByUniqueID(uniqueID) {
  if (!uniqueID) {
    throw new Error("Thiếu tham số uniqueID.");
  }
  const sheet = getSheetByName(CONFIG.SHEET_NAMES.TRANSACTIONS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const cols = getHeaderIndices(headers);
  for (let i = 1; i < data.length; i++) {
    if (data[i][cols.uniqueIdCol] === uniqueID) {
      const history = [arrayToObject(headers, data[i])];
      return createJsonResponse({ status: 'success', data: history });
    }
  }
  return createJsonResponse({ status: 'success', data: [] });
}

function getRecordsForDate(dateStr) {
  const targetDateStr = dateStr || formatDate(new Date());
  const cacheKey = `records_${targetDateStr}`;
  const cached = SCRIPT_CACHE.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const values = getSheetByName(CONFIG.SHEET_NAMES.TRANSACTIONS).getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0];
  const spreadsheetTimeZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const startOfDay = new Date(Utilities.formatDate(new Date(targetDateStr + 'T00:00:00'), spreadsheetTimeZone, "yyyy-MM-dd'T'00:00:00"));
  const endOfDay = new Date(Utilities.formatDate(new Date(targetDateStr + 'T00:00:00'), spreadsheetTimeZone, "yyyy-MM-dd'T'23:59:59"));

  const records = values
    .slice(1) // Bỏ qua header
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

  SCRIPT_CACHE.put(cacheKey, JSON.stringify(records), CONFIG.CACHE_EXPIRATION_SECONDS);
  return records;
}

function getAdminOverview(secret, dateString) {
  if (secret !== CONFIG.ADMIN_SECRET_KEY) throw new Error('Sai mật khẩu quản trị.');

  const dateKey = dateString || formatDate(new Date());
  const cacheKey = `admin_overview_${dateKey}`;
  const cached = SCRIPT_CACHE.get(cacheKey);
  if (cached) return createJsonResponse({ status: 'success', data: JSON.parse(cached) });

  const data = getSheetByName(CONFIG.SHEET_NAMES.TRANSACTIONS).getDataRange().getValues();
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
    SCRIPT_CACHE.put(cacheKey, JSON.stringify(resultData), CONFIG.CACHE_EXPIRATION_SECONDS);
  }
  return createJsonResponse({ status: 'success', data: resultData });
}

function getTransactions(secret, dateString) {
  if (secret !== CONFIG.ADMIN_SECRET_KEY) throw new Error('Sai mật khẩu quản trị.');

  const dateKey = dateString || formatDate(new Date());
  const cacheKey = `transactions_${dateKey}`;
  const cached = SCRIPT_CACHE.get(cacheKey);
  if (cached) return createJsonResponse({ status: 'success', data: { transactions: JSON.parse(cached) } });

  const data = getSheetByName(CONFIG.SHEET_NAMES.TRANSACTIONS).getDataRange().getValues();
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
    SCRIPT_CACHE.put(cacheKey, JSON.stringify(transactions), CONFIG.CACHE_EXPIRATION_SECONDS);
  }
  return createJsonResponse({ status: 'success', data: { transactions } });
}

// =================================================================================
// 5. CÁC HÀM TIỆN ÍCH (UTILITIES)
// Các hàm nhỏ, tái sử dụng được, hỗ trợ cho các hàm nghiệp vụ.
// =================================================================================

/**
 * Lấy đối tượng Sheet theo tên. Tự động tạo sheet và header nếu chưa tồn tại.
 * @param {string} name - Tên của sheet cần lấy.
 * @param {boolean} createIfNotExist - Nếu true, sẽ tạo sheet nếu chưa có.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet|null} - Đối tượng sheet hoặc null.
 */
function getSheetByName(name, createIfNotExist = false) {
  // NÂNG CẤP: Luôn luôn tự động tạo sheet nếu nó không tồn tại.
  // Điều này giúp ngăn chặn lỗi "Cannot read properties of null" khi sheet chưa được tạo.
  createIfNotExist = true; 

  try {
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    let sheet = spreadsheet.getSheetByName(name);

    if (!sheet && createIfNotExist) {
      sheet = spreadsheet.insertSheet(name);
      if (name === CONFIG.SHEET_NAMES.TRANSACTIONS) {
        sheet.appendRow(["Timestamp", "Date", "Plate", "Phone", "Entry Time", "Exit Time", "Status", "UniqueID", "LocationID", "ImageURL", "VIP", "Fee", "PaymentMethod"]);
      } else if (name === CONFIG.SHEET_NAMES.SECURITY_ALERTS) {
        sheet.appendRow(["Plate", "Reason", "Level", "Timestamp"]);
      }
    }
    return sheet;
  } catch (e) {
    console.error(`Không thể mở Bảng tính hoặc Sheet '${name}'. Vui lòng kiểm tra SHEET_ID và tên Sheet. Lỗi: ${e.message}`);
    return null;
  }
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
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

function clearRelevantCache(date) {
  try {
    const dateKey = formatDate(date);
    const keys = [`admin_overview_${dateKey}`, `transactions_${dateKey}`, `records_${dateKey}`];
    SCRIPT_CACHE.removeAll(keys);
  } catch (e) {
    console.error(`Lỗi khi xóa cache: ${e.message}`);
  }
}

function processAndSaveImage(imageData, plate) {
  if (!imageData || !CONFIG.IMAGE_FOLDER_ID) return "";
  try {
    if (typeof imageData === 'string' && imageData.startsWith('http')) return imageData;
    const imageObject = typeof imageData === 'string' ? JSON.parse(imageData) : imageData;
    if (!imageObject || !imageObject.data) return "";

    const decodedImage = Utilities.base64Decode(imageObject.data);
    const blob = Utilities.newBlob(decodedImage, imageObject.mimeType || 'image/jpeg', `${plate}_${new Date().getTime()}.jpg`);
    const imageFolder = DriveApp.getFolderById(CONFIG.IMAGE_FOLDER_ID);
    const file = imageFolder.createFile(blob);
    return file.getUrl();
  } catch (imgError) {
    console.error(`Lỗi xử lý ảnh: ${imgError.message}`);
    return "";
  }
}
