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

function handleCheckIn(payload) {
  const { plate, phone, uniqueID, locationId, imageData, isVIP } = payload;
  if (!plate || !uniqueID) {
    throw new Error("Thiếu biển số hoặc ID duy nhất khi gửi xe.");
  }

  // CHỐNG TRÙNG LẶP: Kiểm tra xem xe có đang ở trạng thái "Đang gửi" không
  const sheetForCheck = getSheet();
  const dataForCheck = sheetForCheck.getDataRange().getValues();
  const headersForCheck = dataForCheck[0];
  const colsForCheck = getHeaderIndices(headersForCheck);
  const cleanedPlate = (plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  for (let i = dataForCheck.length - 1; i > 0; i--) {
    const recordPlate = (dataForCheck[i][colsForCheck.plateCol] || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (recordPlate === cleanedPlate) {
      if (dataForCheck[i][colsForCheck.statusCol] === 'Đang gửi') {
        throw new Error(`Xe [${plate}] đã có trong bãi. Vui lòng kiểm tra lại.`);
      }
      break; // Tìm thấy bản ghi gần nhất (đã rời đi), không cần tìm nữa.
    }
  }

  const now = new Date();
  const imageUrl = processAndSaveImage(imageData, plate);

  // Ghi dữ liệu vào sheet
  sheetForCheck.appendRow([
    now,                  // Timestamp
    formatDate(now),      // Date
    plate.toUpperCase(),  // Plate
    phone || '',          // Phone
    now,                  // Entry Time
    '',                   // Exit Time
    'Đang gửi',           // Status
    uniqueID,             // UniqueID
    locationId || '',     // LocationID
    imageUrl,             // ImageUrl
    isVIP ? 'Có' : 'Không',// VIP
    '',                   // Fee (Để trống khi check-in)
    ''                    // PaymentMethod (Để trống khi check-in)
  ]);

  // Xóa cache liên quan
  clearRelevantCache(now);

  return createJsonResponse({ status: 'success', message: 'Gửi xe thành công.' });
}

function handleCheckOut(payload) {
  const { uniqueID, fee, paymentMethod } = payload;
  if (!uniqueID) {
    throw new Error("Thiếu ID duy nhất khi cho xe ra.");
  }

  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const cols = getHeaderIndices(headers);

  if ([cols.uniqueIdCol, cols.statusCol, cols.exitTimeCol, cols.feeCol, cols.paymentMethodCol].includes(-1)) {
    throw new Error("Sheet thiếu các cột bắt buộc: UniqueID, Status, Exit Time, Fee, hoặc PaymentMethod.");
  }

  const now = new Date();
  for (let i = data.length - 1; i > 0; i--) {
    if (data[i][cols.uniqueIdCol] === uniqueID && data[i][cols.statusCol] === 'Đang gửi') {
      const entryTime = new Date(data[i][cols.entryTimeCol]);
      sheet.getRange(i + 1, cols.exitTimeCol + 1).setValue(now);
      sheet.getRange(i + 1, cols.statusCol + 1).setValue('Đã rời đi');
      sheet.getRange(i + 1, cols.feeCol + 1).setValue(fee);
      sheet.getRange(i + 1, cols.paymentMethodCol + 1).setValue(paymentMethod);

      // Xóa cache liên quan đến ngày xe vào và ngày xe ra
      clearRelevantCache(entryTime);
      clearRelevantCache(now);

      return createJsonResponse({ status: 'success', message: 'Cho xe ra thành công.' });
    }
  }

  throw new Error('Không tìm thấy xe hoặc xe đã được cho ra trước đó.');
}

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
    throw new Error("Thiếu biển số xe để kiểm tra.");
  }

  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const cols = getHeaderIndices(headers);

  if (cols.plateCol === -1 || cols.statusCol === -1) {
    throw new Error("Sheet của bạn đang thiếu cột 'Plate' hoặc 'Status'.");
  }

  const cleanedPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Tìm từ dưới lên để có được bản ghi mới nhất của biển số xe này
  for (let i = data.length - 1; i > 0; i--) {
    const recordPlate = (data[i][cols.plateCol] || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (recordPlate === cleanedPlate) {
      // Tìm thấy xe, kiểm tra trạng thái
      const isParking = data[i][cols.statusCol] === 'Đang gửi';
      // SỬA LỖI: Trả về toàn bộ object xe nếu đang gửi, để màn hình chính có thể xử lý
      const vehicleData = isParking ? arrayToObject(headers, data[i]) : null;
      return createJsonResponse({ status: 'success', data: { isParking: isParking, vehicle: vehicleData } });
    }
  }

  // Nếu không tìm thấy xe trong toàn bộ lịch sử, xe đó chắc chắn chưa có trong bãi
  return createJsonResponse({ status: 'success', data: { isParking: false, vehicle: null } });
}

function getRecordsForDate(dateStr) {
  // TỐI ƯU: Sử dụng Cache
  const cacheKey = `records_${dateStr}`;
  const cached = SCRIPT_CACHE.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();

  const spreadsheetTimeZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  // Sửa lỗi: Đảm bảo dateStr được xử lý đúng múi giờ
  const dateParts = dateStr.split('-');
  const targetDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);

  const startOfDay = new Date(Utilities.formatDate(targetDate, spreadsheetTimeZone, "yyyy-MM-dd'T'00:00:00"));
  const endOfDay = new Date(Utilities.formatDate(targetDate, spreadsheetTimeZone, "yyyy-MM-dd'T'23:59:59"));

  const records = data.map(row => arrayToObject(headers, row)).filter(record => {
    const entryTimeValue = getObjectValueCaseInsensitive(record, 'Entry Time');
    if (!entryTimeValue) return false;

    const entryTime = new Date(entryTimeValue);
    const exitTimeValue = getObjectValueCaseInsensitive(record, 'Exit Time');
    const exitTime = exitTimeValue ? new Date(exitTimeValue) : null;
    const statusValue = getObjectValueCaseInsensitive(record, 'Status');

    // LOGIC ĐÚNG: Lấy xe vào trong ngày HOẶC xe từ ngày cũ nhưng vẫn đang gửi
    const enteredToday = entryTime >= startOfDay && entryTime <= endOfDay;
    const stillPresentFromBefore = entryTime < startOfDay && (statusValue === 'Đang gửi' || (exitTime && exitTime >= startOfDay));

    return enteredToday || stillPresentFromBefore;
  });

  // TỐI ƯU: Lưu kết quả vào cache trước khi trả về
  SCRIPT_CACHE.put(cacheKey, JSON.stringify(records), CACHE_EXPIRATION_SECONDS);

  return records;
}

function getVehicleHistory(plate) {
  if (!plate) return [];

  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  const cleanedPlate = (plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  const history = data
    .map(row => arrayToObject(headers, row))
    .filter(record => {
      const recordPlate = getObjectValueCaseInsensitive(record, 'Plate');
      return recordPlate && (recordPlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanedPlate;
    })
    .sort((a, b) => new Date(getObjectValueCaseInsensitive(b, 'Entry Time')) - new Date(getObjectValueCaseInsensitive(a, 'Entry Time')));

  return history;
}

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
  const dateKey = formatDate(date);
  SCRIPT_CACHE.removeAll([`admin_overview_${dateKey}`, `transactions_${dateKey}`, `records_${dateKey}`]);
}


function logError(functionName, error) {
  console.error(`Lỗi trong hàm ${functionName}: ${error.message} tại ${error.stack}`);
}

function processAndSaveImage(imageData, plate) {
  if (!imageData || !IMAGE_FOLDER_ID || IMAGE_FOLDER_ID === 'ID_THU_MUC_GOOGLE_DRIVE_CUA_BAN') {
    return "";
  }
  try {
    const imageObject = JSON.parse(imageData);
    const decodedImage = Utilities.base64Decode(imageObject.data);
    const blob = Utilities.newBlob(decodedImage, imageObject.mimeType, plate + '_' + new Date().getTime() + '.jpg');
    const imageFolder = DriveApp.getFolderById(IMAGE_FOLDER_ID);
    const file = imageFolder.createFile(blob);
    return "https://lh3.googleusercontent.com/d/" + file.getId();
  } catch (imgError) {
    logError('processAndSaveImage', imgError);
    return "Lỗi ảnh";
  }
}

function getSystemConfig() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const configJson = scriptProperties.getProperty('SYSTEM_CONFIG');
  if (configJson) {
    return JSON.parse(configJson);
  }
  return {
    fee: { freeMinutes: 15, dayRate: 5000, nightRate: 8000, nightStartHour: 18, nightEndHour: 6 },
    autoRefreshInterval: 5000,
    adVideos: []
  };
}

function saveSystemConfig(config) {
  PropertiesService.getScriptProperties().setProperty('SYSTEM_CONFIG', JSON.stringify(config));
}

// ================== CÁC HÀM THIẾT LẬP THỦ CÔNG ==================

function setupSheet() {
  const sheet = getSheet();
  sheet.clear();
  const headers = [
    'Timestamp', 'Date', 'Plate', 'Phone', 'Entry Time', 'Exit Time', 
    'Status', 'UniqueID', 'LocationID', 'ImageUrl', 'VIP', 'Fee', 'PaymentMethod', 'Hour'
  ];
  sheet.appendRow(headers);
  sheet.getRange("A1:M1").setFontWeight("bold");
  sheet.setFrozenRows(1);
  SpreadsheetApp.flush();
  return ContentService.createTextOutput("Bảng tính đã được thiết lập thành công với các cột Fee và PaymentMethod.");
}
