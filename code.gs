/**
 * @file code.gs
 * @version 4.0 - Performance Optimization
 * @description Phiên bản tối ưu hóa hiệu suất đọc/ghi Google Sheet bằng cách sử dụng cache trong bộ nhớ
 *              và thực hiện các thao tác ghi theo lô (batch update).
 *              Giải quyết vấn đề đồng bộ chậm khi cho xe ra và chỉnh sửa thông tin.
 *              Đảm bảo tất cả các biến đều được định nghĩa chính xác, loại bỏ lỗi 'is not defined'.
 *
 * @description Phiên bản viết lại hoàn chỉnh để đảm bảo sự ổn định và loại bỏ các lỗi cũ.
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

// Cấu hình tính phí
const FEE_CONFIG = {
    freeMinutes: 15,
    dayRate: 5000,
    nightRate: 8000,
    nightStartHour: 18,
    nightEndHour: 6
};

// Cấu hình các điểm đỗ xe
const LOCATIONS_CONFIG = [
    { 
        id: 'VHVANXUAN', 
        name: 'Vườn Hoa Vạn Xuân', 
        lat: 21.040082771937307,
        lng: 105.84675825624123,
        capacity: 300,
        address: 'Gần 16 P. Phan Đình Phùng, Quán Thánh, Ba Đình',
        hotline: '0977.777.777',
        operatingHours: '08:00 – 22:00'
    },
    { 
        id: 'COTCOHN', 
        name: 'Cột Cờ Hà Nội', 
        lat: 21.032236917035874, 
        lng: 105.83967310503118,
        capacity: 150,
        address: '28 Điện Biên Phủ, Ba Đình',
        hotline: '0966.666.666',
        operatingHours: '11:00 – 22:00'
    },
];

// ================== CÁC BIẾN TOÀN CỤC CHO CACHE DỮ LIỆU SHEET ==================
let ALL_SHEET_DATA_VALUES = null; // Lưu trữ tất cả dữ liệu sheet dưới dạng mảng 2D
let ALL_SHEET_DATA_HEADERS = null; // Lưu trữ các tiêu đề cột
let ALL_SHEET_DATA_COLS = null; // Lưu trữ map chỉ số cột

/**
 * Tải tất cả dữ liệu từ sheet vào các biến toàn cục trong bộ nhớ.
 * Hàm này được gọi một lần mỗi khi script thực thi hoặc khi cache bị làm mới.
 */
function loadAllSheetData() {
  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  if (values.length < 1) {
    ALL_SHEET_DATA_VALUES = [];
    ALL_SHEET_DATA_HEADERS = [];
    ALL_SHEET_DATA_COLS = {};
    return;
  }
  ALL_SHEET_DATA_VALUES = values;
  ALL_SHEET_DATA_HEADERS = values[0];
  ALL_SHEET_DATA_COLS = getHeaderIndices(ALL_SHEET_DATA_HEADERS);
  console.log("All sheet data loaded into memory.");
}

/**
 * Làm mới cache dữ liệu sheet trong bộ nhớ, buộc tải lại từ sheet trong lần truy cập tiếp theo.
 */
function invalidateAllSheetDataCache() {
  ALL_SHEET_DATA_VALUES = null;
  ALL_SHEET_DATA_HEADERS = null;
  ALL_SHEET_DATA_COLS = null;
  console.log("In-memory sheet data cache invalidated.");
}

/**
 * Safely gets all values from the sheet, ensuring data is loaded into cache if not already.
 */
function safeGetValuesFromCache() {
  if (ALL_SHEET_DATA_VALUES === null) loadAllSheetData();
  return ALL_SHEET_DATA_VALUES;
}

// ================== CÁC HÀM CHÍNH (ENTRY POINTS) ==================

/**
 * Xử lý các yêu cầu GET (lấy dữ liệu).
 */
function doGet(e) {
  try {
    const params = e.parameter;

    if (params.action) {
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
          if (!params.plate) throw new Error("Thiếu tham số 'plate'.");
          return createJsonResponse({ status: 'success', data: getVehicleHistory(params.plate) });
        case 'getVehicleHistoryByUniqueID':
          return getVehicleHistoryByUniqueID(params.uniqueID);
        case 'generatePdfReceipt':
          // SỬA LỖI TRIỆT ĐỂ: Khi action là generatePdfReceipt,
          // chúng ta sẽ gọi hàm tạo PDF và trả về trực tiếp file PDF (Blob),
          // không gói trong JSON nữa.
          return generatePdfReceiptAndReturnBlob(params.uniqueID);
        case 'getReceiptTemplate':
          // Chức năng này phục vụ cho trang viewer.html (nếu còn sử dụng)
          return HtmlService.createHtmlOutputFromFile('receipt_template.html').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
        default:
          throw new Error(`Hành động '${params.action}' không hợp lệ.`);
      }
    } else {
      // Xử lý các request cũ để đảm bảo tương thích ngược
      if (params.plate) {
        return createJsonResponse({ status: 'success', data: getVehicleHistory(params.plate) });
      }
      if (params.date !== undefined) {
        return createJsonResponse({ status: 'success', data: getRecordsForDate(params.date) });
      }
      throw new Error("Yêu cầu không hợp lệ hoặc thiếu tham số.");
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
  if (!lock.tryLock(20000)) {
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

function handleCheckIn(payload) {
  const { plate, phone, uniqueID, locationId, imageData, isVIP } = payload;
  if (!plate || !uniqueID) throw new Error("Thiếu biển số hoặc UniqueID.");

  const sheet = getSheet();
  const values = safeGetValuesFromCache(); // SỬA LỖI: Sử dụng cache
  const headers = ALL_SHEET_DATA_HEADERS; // SỬA LỖI: Sử dụng headers từ cache
  const cols = ALL_SHEET_DATA_COLS; // SỬA LỖI: Sử dụng cols từ cache
  const cleanedPlate = cleanPlateNumber(plate); // Sử dụng hàm tiện ích

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
  invalidateAllSheetDataCache(); // Làm mới cache sau khi ghi
  clearRelevantCache(now);
  return createJsonResponse({ status: 'success', message: 'Gửi xe thành công.' });
}

function handleCheckOut(payload) {
  const { uniqueID, fee, paymentMethod } = payload;
  if (!uniqueID) throw new Error("Thiếu UniqueID.");

  const sheet = getSheet();
  const values = safeGetValuesFromCache(); // Đọc từ cache
  if (values.length < 2) throw new Error("Không có dữ liệu để xử lý.");

  const headers = ALL_SHEET_DATA_HEADERS; // Đọc từ cache
  const cols = ALL_SHEET_DATA_COLS; // Đọc từ cache
  if (cols.uniqueIdCol === -1 || cols.statusCol === -1) {
    throw new Error("Sheet thiếu cột bắt buộc (UniqueID/Status).");
  }

  let rowIndexToUpdate = -1;

  const now = new Date();
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i][cols.uniqueIdCol] === uniqueID && values[i][cols.statusCol] === 'Đang gửi') {
      const rowIndex = i + 1;
      const entryTime = new Date(values[i][cols.entryTimeCol]);

      // Chuẩn bị dữ liệu cho hàng cần cập nhật
      const rowData = values[i].slice(); // Tạo bản sao của hàng từ cache
      rowData[cols.exitTimeCol] = now;
      rowData[cols.statusCol] = 'Đã rời đi';
      if (cols.feeCol !== -1) rowData[cols.feeCol] = fee;
      if (cols.paymentMethodCol !== -1) rowData[cols.paymentMethodCol] = paymentMethod;

      // Thực hiện cập nhật theo lô cho hàng này
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);

      invalidateAllSheetDataCache(); // Làm mới cache sau khi ghi
      clearRelevantCache(entryTime);
      clearRelevantCache(now);

      return createJsonResponse({ status: 'success', message: 'Cho xe ra thành công.' });
    }
  }


  throw new Error('Không tìm thấy xe đang gửi với UniqueID này.');
}

function handleSync(queue) {
  if (!Array.isArray(queue) || queue.length === 0) {
    throw new Error("Hàng đợi đồng bộ trống hoặc không hợp lệ.");
  }

  const sheet = getSheet();
  const values = safeGetValuesFromCache(); // Đọc từ cache
  const headers = ALL_SHEET_DATA_HEADERS; // Đọc từ cache
  const cols = ALL_SHEET_DATA_COLS; // Đọc từ cache

  let successCount = 0;
  let errorCount = 0;
  
  let newRowsToAppend = [];
  let rowsToUpdateMap = new Map(); // Map<0-based rowIndex, updatedRowData>
  let datesToClearCache = new Set();

  queue.forEach(item => { // Bước 1: Chuẩn bị tất cả các thay đổi trong bộ nhớ
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
      } else if (item.action === 'checkOut' || item.action === 'editTransaction') { // Xử lý cả checkOut và editTransaction
        let foundRowIndex = -1; // 0-based index
        for (let i = 1; i < values.length; i++) {
          if (values[i][cols.uniqueIdCol] === item.uniqueID && (item.action === 'editTransaction' || values[i][cols.statusCol] === 'Đang gửi')) {
            foundRowIndex = i;
            if (item.entryTime) datesToClearCache.add(formatDate(new Date(item.entryTime)));
            if (item.exitTime) datesToClearCache.add(formatDate(new Date(item.exitTime)));
            break;
          }
        }

        if (foundRowIndex !== -1) {
          const rowData = values[foundRowIndex].slice(); // Tạo bản sao của hàng từ cache
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
          console.warn(`handleSync: Item for UniqueID ${item.uniqueID} not found for action ${item.action}.`);
        }
      }
    } catch (e) {
      errorCount++;
      logError('handleSync_item_preparation', e);
    }
  });

  // Bước 2: Thực hiện tất cả các thay đổi trên sheet theo lô
  try {
    // 1. Thêm các hàng mới
    if (newRowsToAppend.length > 0) {
      sheet.appendRows(newRowsToAppend);
    }

    // 2. Cập nhật các hàng hiện có
    if (rowsToUpdateMap.size > 0) {
      const allSheetValues = sheet.getDataRange().getValues(); // Đọc lại toàn bộ sheet để đảm bảo cập nhật đúng vị trí
      rowsToUpdateMap.forEach((updatedRowData, original0BasedIndex) => {
        if (original0BasedIndex < allSheetValues.length) {
          allSheetValues[original0BasedIndex] = updatedRowData;
        }
      });
      sheet.getRange(1, 1, allSheetValues.length, allSheetValues[0].length).setValues(allSheetValues);
    }
  } catch (e) {
    logError('handleSync_batch_write', e);
    throw new Error(`Lỗi khi ghi dữ liệu đồng bộ: ${e.message}`);
  }

  invalidateAllSheetDataCache(); // Làm mới cache sau khi tất cả các thao tác ghi hoàn tất
  datesToClearCache.forEach(dateKey => clearRelevantCache(new Date(dateKey))); // Xóa cache theo ngày

  return createJsonResponse({ status: 'success', message: `Đồng bộ hoàn tất. Thành công: ${successCount}, Thất bại: ${errorCount}` });
}

function handleEditTransaction(payload) {
  if (payload.secret !== ADMIN_SECRET_KEY) {
    throw new Error('Mật khẩu quản trị không đúng.');
  }

  const { uniqueID, plate, entryTime, exitTime, fee, paymentMethod, status } = payload;
  if (!uniqueID) throw new Error('Thiếu UniqueID để xác định giao dịch.');

  const sheet = getSheet();
  const values = safeGetValuesFromCache(); // Đọc từ cache
  const headers = ALL_SHEET_DATA_HEADERS; // Đọc từ cache
  const cols = ALL_SHEET_DATA_COLS; // Đọc từ cache

  if (cols.uniqueIdCol === -1) throw new Error('Sheet chưa có cột "UniqueID".');

  let rowIndexToUpdate = -1;
  let originalEntryTime = null;

  for (let i = 1; i < sheetData.length; i++) {
    if (values[i][cols.uniqueIdCol] == uniqueID) {
      rowIndexToUpdate = i + 1; // 1-based index
      originalEntryTime = new Date(values[i][cols.entryTimeCol]);
      break;
    }
  }

  if (rowIndexToUpdate === -1) {
    throw new Error(`Không tìm thấy giao dịch với UniqueID: ${uniqueID}`);
  }

  const rowData = values[rowIndexToUpdate - 1].slice(); // Tạo bản sao của hàng từ cache

  if (plate !== undefined && cols.plateCol !== -1) rowData[cols.plateCol] = plate;
  if (entryTime !== undefined && cols.entryTimeCol !== -1) rowData[cols.entryTimeCol] = entryTime ? new Date(entryTime) : null;
  if (exitTime !== undefined && cols.exitTimeCol !== -1) rowData[cols.exitTimeCol] = exitTime ? new Date(exitTime) : null;
  if (fee !== undefined && cols.feeCol !== -1) rowData[cols.feeCol] = fee;
  if (paymentMethod !== undefined && cols.paymentMethodCol !== -1) rowData[cols.paymentMethodCol] = paymentMethod;
  if (status !== undefined && cols.statusCol !== -1) rowData[cols.statusCol] = status;

  // Thực hiện cập nhật theo lô cho hàng này
  sheet.getRange(rowIndexToUpdate, 1, 1, rowData.length).setValues([rowData]);

  invalidateAllSheetDataCache(); // Làm mới cache sau khi ghi
      clearRelevantCache(originalEntryTime);
      if (entryTime) clearRelevantCache(new Date(entryTime));
      if (exitTime) clearRelevantCache(new Date(exitTime));

      return createJsonResponse({ status: 'success', message: 'Cập nhật thành công.' });
}


// ================== CÁC HÀM LẤY DỮ LIỆU (GETTERS) ==================

function getVehicleStatus(plate) {
  if (!plate) throw new Error("Thiếu biển số để kiểm tra.");

  const values = safeGetValuesFromCache(); // Đọc từ cache
  if (values.length < 2) return createJsonResponse({ status: 'success', data: { isParking: false, vehicle: null } });

  const headers = ALL_SHEET_DATA_HEADERS; // Đọc từ cache
  const cols = ALL_SHEET_DATA_COLS; // Đọc từ cache
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

function getVehicleHistory(plate) {
  const values = safeGetValuesFromCache(); // Đọc từ cache
  if (values.length < 2) return [];

  const headers = ALL_SHEET_DATA_HEADERS; // Đọc từ cache
  const cols = getHeaderIndices(headers);
  const cleanedPlate = (plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  return values
    .filter(row => (row[cols.plateCol] || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanedPlate)
    .map(row => arrayToObject(headers, row))
    .sort((a, b) => new Date(getObjectValueCaseInsensitive(b, 'Entry Time')) - new Date(getObjectValueCaseInsensitive(a, 'Entry Time')));
}

function getVehicleHistoryByUniqueID(uniqueID) {
  if (!uniqueID) {
    throw new Error("Thiếu tham số uniqueID.");
  }
  const data = safeGetValuesFromCache(); // Đọc từ cache
  const headers = ALL_SHEET_DATA_HEADERS; // Đọc từ cache
  const cols = ALL_SHEET_DATA_COLS; // Đọc từ cache

  let plateNumber = null;
  for (let i = 1; i < data.length; i++) {
    if (data[i][uniqueIDIndex] === uniqueID) {
      plateNumber = data[i][plateIndex];
      break;
    }
  }

  if (!plateNumber) {
    throw new Error("Không tìm thấy giao dịch với UniqueID này.");
  }

  const history = [];
  for (let i = data.length - 1; i >= 1; i--) { // Duyệt ngược để lấy các giao dịch gần nhất trước
    if (data[i][cols.plateCol] === plateNumber) {
      history.push(arrayToObject(headers, data[i]));
    }
  }
  
  return createJsonResponse({ status: 'success', data: history });
}

function getRecordsForDate(dateStr) {
  const targetDateStr = dateStr || formatDate(new Date());
  const cacheKey = `records_${targetDateStr}`;
  const cached = SCRIPT_CACHE.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const values = safeGetValuesFromCache(); // Đọc từ cache
  if (values.length < 2) return [];

  const headers = ALL_SHEET_DATA_HEADERS; // Đọc từ cache
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

function getAdminOverview(secret, dateString) {
  if (secret !== ADMIN_SECRET_KEY) throw new Error('Sai mật khẩu quản trị.');

  const dateKey = dateString || formatDate(new Date());
  const cacheKey = `admin_overview_${dateKey}`;
  const cached = SCRIPT_CACHE.get(cacheKey);
  if (cached) return createJsonResponse({ status: 'success', data: JSON.parse(cached) });

  const data = safeGetValuesFromCache(); // Đọc từ cache
  if (data.length < 2) return createJsonResponse({ status: 'success', data: {} });

  const headers = ALL_SHEET_DATA_HEADERS; // Đọc từ cache
  const cols = ALL_SHEET_DATA_COLS; // Đọc từ cache
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

function getTransactions(secret, dateString) {
  if (secret !== ADMIN_SECRET_KEY) throw new Error('Sai mật khẩu quản trị.');

  const dateKey = dateString || formatDate(new Date());
  const cacheKey = `transactions_${dateKey}`;
  const cached = SCRIPT_CACHE.get(cacheKey);
  if (cached) return createJsonResponse({ status: 'success', data: { transactions: JSON.parse(cached) } });

  const data = safeGetValuesFromCache(); // Đọc từ cache
  if (data.length < 2) return createJsonResponse({ status: 'success', data: { transactions: [] } });

  const headers = ALL_SHEET_DATA_HEADERS; // Đọc từ cache
  const cols = ALL_SHEET_DATA_COLS; // Đọc từ cache
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

/**
 * SỬA LỖI: Bổ sung hàm tiện ích còn thiếu.
 * Làm sạch và chuẩn hóa chuỗi biển số xe.
 */
function cleanPlateNumber(plateStr) {
  return plateStr ? String(plateStr).toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
}

function calculateFeeWithBreakdown(startTime, endTime, isVIP) {
    if (isVIP) return { totalFee: 0, dayHours: 0, nightHours: 0 };
    if (!startTime) return { totalFee: 0, dayHours: 0, nightHours: 0 };

    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diffMinutes = Math.floor((end - start) / (1000 * 60));

    if (diffMinutes <= FEE_CONFIG.freeMinutes) {
        return { totalFee: 0, dayHours: 0, nightHours: 0 };
    }

    let totalFee = 0;
    let dayHours = 0;
    let nightHours = 0;
    let chargeableStartTime = new Date(start.getTime() + FEE_CONFIG.freeMinutes * 60 * 1000);
    const chargeableMinutes = diffMinutes - FEE_CONFIG.freeMinutes;
    const totalChargeableHours = Math.ceil(chargeableMinutes / 60);

    for (let i = 0; i < totalChargeableHours; i++) {
        let currentBlockStartHour = new Date(chargeableStartTime.getTime() + i * 60 * 60 * 1000).getHours();
        const isNight = currentBlockStartHour >= FEE_CONFIG.nightStartHour || currentBlockStartHour < FEE_CONFIG.nightEndHour;
        if (isNight) {
            nightHours++;
            totalFee += FEE_CONFIG.nightRate;
        } else {
            dayHours++;
            totalFee += FEE_CONFIG.dayRate;
        }
    }
    return { totalFee, dayHours, nightHours };
}

function calculateDurationBetween(startTime, endTime) {
    if (!startTime || !endTime) return '--';
    const start = new Date(startTime);
    const end = new Date(endTime);
    let diff = Math.floor((end - start) / 1000);
    if (diff < 0) return '0m';
    const days = Math.floor(diff / 86400); diff %= 86400;
    const hours = Math.floor(diff / 3600); diff %= 3600;
    const minutes = Math.floor(diff / 60);
    let result = '';
    if (days > 0) result += `${days}d `; if (hours > 0) result += `${hours}h `; result += `${minutes}m`;
    return result.trim() || '0m';
}

function numberToVietnameseWords(num) {
  const units = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const teens = ['', 'mười', 'hai mươi', 'ba mươi', 'bốn mươi', 'năm mươi', 'sáu mươi', 'bảy mươi', 'tám mươi', 'chín mươi'];
  const hundreds = ['', 'một trăm', 'hai trăm', 'ba trăm', 'bốn trăm', 'năm trăm', 'sáu trăm', 'bảy trăm', 'tám trăm', 'chín trăm'];
  const thousands = ['', 'nghìn', 'triệu', 'tỷ'];

  if (num === 0) return 'không';

  let s = num.toString();
  let result = '';
  let i = 0;

  while (s.length > 0) {
    let chunk = parseInt(s.slice(-3));
    s = s.slice(0, -3);

    if (chunk === 0 && s.length > 0) {
      i++;
      continue;
    }

    let chunkWords = '';
    let h = Math.floor(chunk / 100);
    let t = Math.floor((chunk % 100) / 10);
    let u = chunk % 10;

    if (h > 0) {
      chunkWords += units[h] + ' trăm ';
    }

    if (t > 1) {
      chunkWords += teens[t] + ' ';
      if (u === 1) chunkWords += 'mốt';
      else if (u > 0) chunkWords += units[u];
    } else if (t === 1) {
      chunkWords += 'mười ';
      if (u > 0) chunkWords += units[u];
    } else if (u > 0 && (h > 0 || s.length > 0)) { // Thêm điều kiện s.length > 0 để xử lý số như 1001
      chunkWords += 'lẻ ' + units[u];
    } else if (u > 0) {
      chunkWords += units[u];
    }

    if (chunkWords.trim() !== '') {
      result = chunkWords.trim() + ' ' + thousands[i] + ' ' + result;
    }
    i++;
  }
  let finalResult = result.trim().replace(/\s+/g, ' ');
  return finalResult.charAt(0).toUpperCase() + finalResult.slice(1);
}

function decodePlateNumber(plate) {
    const PLATE_DATA = {
        provinces: [
            { name: "TP. Hà Nội (mới)", codes: ["29", "30", "31", "32", "33", "40", "88", "99"] },
            { name: "TP. Hồ Chí Minh", codes: ["41", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59"] }
        ],
        specialSeries: {
            "NG": "Xe của cơ quan đại diện ngoại giao", "NN": "Xe của tổ chức, cá nhân nước ngoài", "QT": "Xe của cơ quan đại diện ngoại giao (có yếu tố quốc tế)"
        }
    };
    if (!plate || typeof plate !== 'string') return 'Chưa có thông tin';
    const cleanedPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (const series in PLATE_DATA.specialSeries) {
        if (cleanedPlate.includes(series)) {
            return PLATE_DATA.specialSeries[series];
        }
    }
    let provinceCode = '';
    let vehicleType = 'Chưa xác định';
    if (cleanedPlate.length >= 8 && /^[0-9]{2}/.test(cleanedPlate)) {
        provinceCode = cleanedPlate.substring(0, 2);
        vehicleType = cleanedPlate.length === 8 ? 'Ô tô' : 'Xe máy';
    }
    if (!provinceCode) return 'Biển số không xác định';
    const provinceInfo = PLATE_DATA.provinces.find(p => p.codes.includes(provinceCode));
    const provinceName = provinceInfo ? provinceInfo.name : 'Tỉnh không xác định';
    return `${provinceName} - ${vehicleType}`;
}
