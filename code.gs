/**
 * @file Code.gs
 * @version 18.0 - Final Consolidated & Corrected Version
 * @description Hệ thống xử lý dữ liệu xe, tích hợp tính năng VIP, lưu ảnh và trang quản trị ổn định.
 */

// ================== CẤU HÌNH QUAN TRỌNG ==================
const SHEET_ID = '1uYWrFvS_6L-iIVv4eyJSL8i2tb9GGPJmE8dGIbHsor4'; // ID Google Sheet của bạn
const SHEET_NAME = 'Sheet1'; // Tên trang tính
const IMAGE_FOLDER_ID = '10_RCBR7UZh-WX59rpHjwQuZSqpcrL8pH'; // ID thư mục ảnh trên Drive
const ADMIN_SECRET_KEY = "admin123"; // Mật khẩu bảo vệ trang quản trị.
const GEMINI_API_KEY = "AIzaSyDbcSZTvvcfc_bbZhpapT_H3Jj7clfrb3w"; // API Key cho tính năng AI Insights

// ================== CÁC HÀM CHÍNH (doGet, doPost) ==================

function doGet(e) {
  const params = e.parameter;
  try {
    // NÂNG CẤP: Xử lý các action khác nhau
    switch (params.action) {
      case 'getAdminOverview':
        return getAdminOverview(params.secret, params.date || null);
      case 'getTransactions':
        return getTransactions(params.secret, params.date || null);
      case 'getAdminData': // Giữ lại để tương thích nếu cần, nhưng không còn được client sử dụng
        return getAdminData(params.secret, params.date || null);
      default:
        // Xử lý các request cũ hơn nếu không có action
        if (params.plate) {
          const history = getVehicleHistory(params.plate);
          return createJsonResponse({ status: 'success', data: history });
        }
        if (params.date) {
          const records = getRecordsForDate(params.date);
          return createJsonResponse({ status: 'success', data: records });
        }
        throw new Error("Yêu cầu không hợp lệ hoặc thiếu tham số 'action', 'plate', hoặc 'date'.");
    }
  } catch (error) {
    logError('doGet', error);
    return createJsonResponse({ status: 'error', message: error.message });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000); // Chờ tối đa 20 giây

  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    switch (action) {
      case 'checkIn':
        return handleCheckIn(payload);
      case 'checkOut':
        return handleCheckOut(payload);
      case 'editTransaction':
        return handleEditTransaction(payload, getSheet());
      case 'saveConfig':
        return handleSaveConfig(payload);
      case 'sync':
        return handleSync(payload.queue);
      default:
        throw new Error("Hành động không được hỗ trợ.");
    }
  } catch (error) {
    logError('doPost', error);
    return createJsonResponse({ status: 'error', message: `Lỗi máy chủ: ${error.message}` });
  } finally {
    lock.releaseLock();
  }
}

// ================== CÁC HÀM XỬ LÝ HÀNH ĐỘNG ==================

function handleCheckIn(payload) {
  const { plate, phone, uniqueID, locationId, imageData, isVIP } = payload;
  if (!plate || !uniqueID) throw new Error("Thiếu biển số hoặc ID duy nhất khi check-in.");

  const sheet = getSheet();
  const now = new Date();
  const imageUrl = processAndSaveImage(imageData, plate);

  sheet.appendRow([
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
    isVIP ? 'Có' : '',    // VIP
    '',                   // Fee (Để trống khi check-in)
    ''                    // PaymentMethod (Để trống khi check-in)
  ]);

  return createJsonResponse({ status: 'success', message: 'Check-in thành công.' });
}

function handleCheckOut(payload) {
  const { uniqueID, fee, paymentMethod } = payload;
  if (!uniqueID) throw new Error("Thiếu ID duy nhất khi check-out.");

  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const cols = getHeaderIndices(headers);

  if ([cols.uniqueIdCol, cols.statusCol, cols.exitTimeCol, cols.feeCol, cols.paymentMethodCol].includes(-1)) {
    throw new Error("Sheet thiếu các cột bắt buộc: UniqueID, Status, Exit Time, Fee, hoặc PaymentMethod.");
  }

  for (let i = data.length - 1; i > 0; i--) {
    if (data[i][cols.uniqueIdCol] === uniqueID && data[i][cols.statusCol] === 'Đang gửi') {
      sheet.getRange(i + 1, cols.exitTimeCol + 1).setValue(new Date());
      sheet.getRange(i + 1, cols.statusCol + 1).setValue('Đã rời đi');
      sheet.getRange(i + 1, cols.feeCol + 1).setValue(fee);
      sheet.getRange(i + 1, cols.paymentMethodCol + 1).setValue(paymentMethod);
      return createJsonResponse({ status: 'success', message: 'Check-out thành công.' });
    }
  }
  
  throw new Error('Không tìm thấy xe hoặc xe đã check-out.');
}

function handleSync(queue) {
  if (!Array.isArray(queue) || queue.length === 0) throw new Error("Hàng đợi đồng bộ trống hoặc không hợp lệ.");
  
  const sheet = getSheet();
  let successCount = 0;
  let errorCount = 0;

  queue.forEach(item => {
    try {
      if (item.action === 'checkIn') {
        const { plate, phone, uniqueID, locationId, imageData, isVIP, timestamp } = item;
        const entryTime = new Date(timestamp);
        const imageUrl = processAndSaveImage(imageData, plate);
        sheet.appendRow([
          entryTime, formatDate(entryTime), plate.toUpperCase(), phone || '', 
          entryTime, '', 'Đang gửi', uniqueID, locationId || '',
          imageUrl, isVIP ? 'Có' : '',
          '', ''
        ]);
        successCount++;
      } else if (item.action === 'checkOut') {
        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const cols = getHeaderIndices(headers);
        let found = false;
        for (let i = data.length - 1; i > 0; i--) {
          if (data[i][cols.uniqueIdCol] === item.plate && data[i][cols.statusCol] === 'Đang gửi') {
            sheet.getRange(i + 1, cols.exitTimeCol + 1).setValue(new Date(item.timestamp));
            sheet.getRange(i + 1, cols.statusCol + 1).setValue('Đã rời đi');
            sheet.getRange(i + 1, cols.feeCol + 1).setValue(item.fee);
            sheet.getRange(i + 1, cols.paymentMethodCol + 1).setValue(item.paymentMethod);
            found = true;
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

  return createJsonResponse({ status: 'success', message: `Đồng bộ hoàn tất. Thành công: ${successCount}, Lỗi: ${errorCount}` });
}

function handleEditTransaction(payload, sheet) {
  const secret = payload.secret || (payload.data && payload.data.secret);
  const data = payload.data || payload;
  if (secret !== ADMIN_SECRET_KEY) {
    return createJsonResponse({ status: 'error', message: 'Mật khẩu quản trị không đúng.' });
  }

  const uniqueID = data.uniqueId || data.UniqueID || data.uniqueID || payload.uniqueID || payload.uniqueId;
  if (!uniqueID) {
    return createJsonResponse({ status: 'error', message: 'Thiếu UniqueID để xác định giao dịch.' });
  }

  const sheetData = sheet.getDataRange().getValues();
  const headers = sheetData[0];
  const cols = getHeaderIndices(headers);

  if (cols.uniqueIdCol === -1) {
    return createJsonResponse({ status: 'error', message: 'Sheet chưa có cột UniqueID.' });
  }

  for (let i = 1; i < sheetData.length; i++) {
    if (sheetData[i][cols.uniqueIdCol] == uniqueID) {
      const rowToUpdate = i + 1;
      if (data.plate !== undefined && cols.plateCol !== -1) sheet.getRange(rowToUpdate, cols.plateCol + 1).setValue(data.plate);
      if (data.entryTime !== undefined && cols.entryTimeCol !== -1) sheet.getRange(rowToUpdate, cols.entryTimeCol + 1).setValue(data.entryTime ? new Date(data.entryTime) : '');
      if (data.exitTime !== undefined && cols.exitTimeCol !== -1) sheet.getRange(rowToUpdate, cols.exitTimeCol + 1).setValue(data.exitTime ? new Date(data.exitTime) : '');
      if (data.fee !== undefined && cols.feeCol !== -1) sheet.getRange(rowToUpdate, cols.feeCol + 1).setValue(data.fee);
      if (data.paymentMethod !== undefined && cols.paymentMethodCol !== -1) sheet.getRange(rowToUpdate, cols.paymentMethodCol + 1).setValue(data.paymentMethod);
      if (data.status !== undefined && cols.statusCol !== -1) sheet.getRange(rowToUpdate, cols.statusCol + 1).setValue(data.status);
      SpreadsheetApp.flush();
      return createJsonResponse({ status: 'success', message: 'Cập nhật thành công.' });
    }
  }

  return createJsonResponse({ status: 'error', message: 'Không tìm thấy giao dịch với UniqueID đã cho.' });
}

function handleSaveConfig(payload) {
  const secret = payload.secret;
  const newConfig = payload.config;

  if (secret !== ADMIN_SECRET_KEY) {
    return createJsonResponse({ success: false, message: 'Mật khẩu quản trị không đúng.' });
  }
  if (!newConfig) {
    return createJsonResponse({ success: false, message: 'Dữ liệu cấu hình không hợp lệ.' });
  }

  saveSystemConfig(newConfig);
  return createJsonResponse({ success: true, message: 'Cấu hình đã được lưu thành công.' });
}

// ================== CÁC HÀM LẤY DỮ LIỆU (GET) ==================

function getRecordsForDate(dateStr) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data.shift(); 

  const spreadsheetTimeZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const targetDate = new Date(dateStr + 'T00:00:00');
  const startOfDay = new Date(Utilities.formatDate(targetDate, spreadsheetTimeZone, "yyyy-MM-dd'T'00:00:00"));
  const endOfDay = new Date(Utilities.formatDate(targetDate, spreadsheetTimeZone, "yyyy-MM-dd'T'23:59:59"));

  const records = data.map(row => arrayToObject(headers, row)).filter(record => {
    const entryTimeValue = getObjectValueCaseInsensitive(record, 'Entry Time');
    if (!entryTimeValue) return false;
    
    const entryTime = new Date(entryTimeValue);
    const exitTimeValue = getObjectValueCaseInsensitive(record, 'Exit Time');
    const exitTime = exitTimeValue ? new Date(exitTimeValue) : null;
    const statusValue = getObjectValueCaseInsensitive(record, 'Status');
    
    const enteredToday = entryTime >= startOfDay && entryTime <= endOfDay;
    const stillPresentFromBefore = entryTime < startOfDay && (statusValue === 'Đang gửi' || (exitTime && exitTime >= startOfDay));

    return enteredToday || stillPresentFromBefore;
  });

  return records;
}

function getVehicleHistory(plate) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  const cleanedPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const history = data
    .map(row => arrayToObject(headers, row))
    .filter(record => {
        const recordPlate = getObjectValueCaseInsensitive(record, 'Plate');
        return recordPlate && recordPlate.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanedPlate;
    })
    .sort((a, b) => new Date(getObjectValueCaseInsensitive(b, 'Entry Time')) - new Date(getObjectValueCaseInsensitive(a, 'Entry Time')));

  return history;
}

// ================== HÀM XỬ LÝ TRANG QUẢN TRỊ ==================

function getAdminData(secret, dateString) {
  if (secret !== ADMIN_SECRET_KEY) {
    return createJsonResponse({ status: 'error', message: 'Sai mật khẩu quản trị.' });
  }

  try {
    const config = getSystemConfig();
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const targetDate = dateString ? new Date(dateString + "T00:00:00") : new Date();
    const targetDateStr = Utilities.formatDate(targetDate, "GMT+7", "yyyy-MM-dd");
    
    let totalRevenueToday = 0;
    let totalVehiclesToday = 0;
    let vehiclesCurrentlyParking = 0;
    const trafficByHour = Array(24).fill(0);
    const revenueByLocation = {};
    const vehiclesByLocation = {};
    const transactions = [];

    const cols = getHeaderIndices(headers);

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowDate = Utilities.formatDate(new Date(row[cols.entryTimeCol]), "GMT+7", "yyyy-MM-dd");
      const status = row[cols.statusCol];
      const fee = parseFloat(row[cols.feeCol]) || 0;
      const locationId = row[cols.locationIdCol];

      if (rowDate === targetDateStr) {
        const transaction = arrayToObject(headers, row);
        transactions.push(transaction);

        totalVehiclesToday++;
        if (fee > 0) totalRevenueToday += fee;

        const entryHour = new Date(row[cols.entryTimeCol]).getHours();
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

    let aiInsights = getAInsights({
      ngay_phan_tich: targetDateStr,
      tong_doanh_thu: totalRevenueToday,
      tong_luot_xe: totalVehiclesToday,
      so_xe_dang_gui: vehiclesCurrentlyParking,
      doanh_thu_theo_diem: revenueByLocation,
      luot_xe_theo_diem: vehiclesByLocation,
      luu_luong_theo_gio: trafficByHour.map((count, hour) => ({ gio: hour, luot: count })).filter(item => item.luot > 0)
    });

    return createJsonResponse({
      status: 'success',
      data: {
        totalRevenueToday,
        totalVehiclesToday,
        vehiclesCurrentlyParking,
        revenueByLocation,
        vehiclesByLocation,
        trafficByHour,
        transactions,
        aiInsights,
        config
      }
    });

  } catch (err) {
    logError("getAdminData", err);
    return createJsonResponse({ status: 'error', message: `Lỗi xử lý dữ liệu: ${err.message}` });
  }
}

function getAdminOverview(secret, dateString) {
  if (secret !== ADMIN_SECRET_KEY) {
    return createJsonResponse({ status: 'error', message: 'Sai mật khẩu quản trị.' });
  }

  try {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const targetDate = dateString ? new Date(dateString + "T00:00:00") : new Date();
    const targetDateStr = Utilities.formatDate(targetDate, "GMT+7", "yyyy-MM-dd");
    
    let totalRevenueToday = 0;
    let totalVehiclesToday = 0;
    let vehiclesCurrentlyParking = 0;
    const trafficByHour = Array(24).fill(0);
    const revenueByLocation = {};
    const vehiclesByLocation = {};

    const cols = getHeaderIndices(headers);

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const entryTime = new Date(row[cols.entryTimeCol]);
      const rowDate = Utilities.formatDate(entryTime, "GMT+7", "yyyy-MM-dd");
      const status = row[cols.statusCol];
      
      if (rowDate === targetDateStr) {
        const fee = parseFloat(row[cols.feeCol]) || 0;
        const locationId = row[cols.locationIdCol];

        totalVehiclesToday++;
        if (fee > 0) totalRevenueToday += fee;

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

    return createJsonResponse({
      status: 'success',
      data: {
        totalRevenueToday,
        totalVehiclesToday,
        vehiclesCurrentlyParking,
        revenueByLocation,
        vehiclesByLocation,
        trafficByHour,
      }
    });

  } catch (err) {
    logError("getAdminOverview", err);
    return createJsonResponse({ status: 'error', message: `Lỗi xử lý dữ liệu tổng quan: ${err.message}` });
  }
}

function getTransactions(secret, dateString) {
  if (secret !== ADMIN_SECRET_KEY) {
    return createJsonResponse({ status: 'error', message: 'Sai mật khẩu quản trị.' });
  }

  try {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const cols = getHeaderIndices(headers);
    
    const targetDate = dateString ? new Date(dateString + "T00:00:00") : new Date();
    const targetDateStr = Utilities.formatDate(targetDate, "GMT+7", "yyyy-MM-dd");
    
    const transactions = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowDate = Utilities.formatDate(new Date(row[cols.entryTimeCol]), "GMT+7", "yyyy-MM-dd");

      if (rowDate === targetDateStr) {
        transactions.push(arrayToObject(headers, row));
      }
    }

    transactions.sort((a, b) => new Date(b['Entry Time']) - new Date(a['Entry Time']));

    return createJsonResponse({
      status: 'success',
      data: {
        transactions
      }
    });

  } catch (err) {
    logError("getTransactions", err);
    return createJsonResponse({ status: 'error', message: `Lỗi tải danh sách giao dịch: ${err.message}` });
  }
}

// ================== HÀM PHÂN TÍCH AI (GEMINI) ==================

function getAInsights(dataSummary) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "DÁN_API_KEY_CỦA_BẠN_VÀO_ĐÂY") {
    return "API Key cho AI chưa được cấu hình. Vui lòng cấu hình để sử dụng tính năng này.";
  }

  const prompt = `
    Bạn là một trợ lý quản lý bãi xe thông minh. Dựa vào dữ liệu JSON sau đây về hoạt động của các bãi xe trong một ngày, hãy đưa ra các phân tích và nhận định ngắn gọn, tập trung vào những điểm chính.
    Dữ liệu: ${JSON.stringify(dataSummary)}

    Hãy trả lời bằng tiếng Việt theo định dạng Markdown, bao gồm 3 phần:
    1.  **Tóm tắt chung:** Đưa ra 2-3 gạch đầu dòng tóm tắt những con số quan trọng nhất (tổng doanh thu, tổng lượt xe, xe đang gửi).
    2.  **Phân tích & Nhận định:** Đưa ra 2-3 gạch đầu dòng về các điểm nổi bật hoặc bất thường (ví dụ: giờ cao điểm, điểm đông nhất, điểm có doanh thu cao/thấp bất thường, so sánh với dữ liệu trung bình nếu có).
    3.  **Gợi ý (nếu có):** Nếu thấy có điểm gì đáng chú ý, đưa ra một gợi ý ngắn gọn. Ví dụ: "Lưu lượng buổi trưa cao, có thể xem xét tăng cường nhân sự vào khung giờ này."

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
    return result.candidates[0].content.parts[0].text;
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
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function arrayToObject(headers, row) {
  return headers.reduce((acc, header, index) => {
    const value = row[index];
    if (value instanceof Date && !isNaN(value)) {
      acc[header] = value.toISOString();
    } else {
      acc[header] = value;
    }
    return acc;
  }, {});
}

function findHeaderIndex(headers, name) {
  const lowerCaseName = String(name).toLowerCase();
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
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
    const lowerKey = key.toLowerCase();
    const objKey = Object.keys(obj).find(k => k.toLowerCase() === lowerKey);
    return objKey ? obj[objKey] : undefined;
}

function formatDate(date) {
  const spreadsheetTimeZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return Utilities.formatDate(date, spreadsheetTimeZone, 'yyyy-MM-dd');
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
    adVideos: ["https://pub-e8b9f290d56545b29e32c494b6ec8f86.r2.dev/video_20251019_222646.mp4"]
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
    'Status', 'UniqueID', 'LocationID', 'ImageUrl', 'VIP', 'Fee', 'PaymentMethod'
  ];
  sheet.appendRow(headers);
  sheet.getRange("A1:M1").setFontWeight("bold");
  sheet.setFrozenRows(1);
  SpreadsheetApp.flush();
  return ContentService.createTextOutput("Bảng tính đã được thiết lập thành công với các cột Fee và PaymentMethod.");
}

function createDashboard() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const dataSheetName = SHEET_NAME;
    const dashboardSheetName = 'Dashboard';
    const dataColor = '#e0e0e0';
    const headerColor = '#4285F4';
    const titleColor = '#ffffff';
    const cardHeaderColor = '#f3f3f3';

    let dashboardSheet = ss.getSheetByName(dashboardSheetName);
    if (dashboardSheet) {
      ss.deleteSheet(dashboardSheet);
    }
    dashboardSheet = ss.insertSheet(dashboardSheetName, 0);
    dashboardSheet.clear();
    dashboardSheet.setFrozenRows(2);
    dashboardSheet.setColumnWidths(1, 10, 120);

    dashboardSheet.getRange('A1:J1').merge().setValue('BÁO CÁO TỔNG QUAN SỰ KIỆN')
      .setBackground(headerColor).setFontColor(titleColor).setFontSize(18).setFontWeight('bold')
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    dashboardSheet.getRange('A2:J2').setBackground(headerColor);

    const kpiCard = (range, title, formula, numberFormat) => {
      const titleRange = dashboardSheet.getRange(range.getRow(), range.getColumn(), 1, range.getNumColumns());
      const valueRange = dashboardSheet.getRange(range.getRow() + 1, range.getColumn(), 1, range.getNumColumns());
      
      titleRange.merge().setValue(title).setBackground(cardHeaderColor).setFontWeight('bold').setHorizontalAlignment('center');
      valueRange.merge().setFormula(formula).setFontSize(24).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
      if (numberFormat) valueRange.setNumberFormat(numberFormat);
      
      dashboardSheet.getRange(range.getA1Notation()).setBorder(true, true, true, true, true, true, dataColor, SpreadsheetApp.BorderStyle.SOLID);
    };

    kpiCard(dashboardSheet.getRange('A4:B5'), 'Tổng Doanh Thu', `=SUM('${dataSheetName}'!L:L)`, '#,##0"đ"');
    kpiCard(dashboardSheet.getRange('C4:D5'), 'Tổng Lượt Xe', `=COUNTA('${dataSheetName}'!C2:C)`, '#,##0');
    kpiCard(dashboardSheet.getRange('E4:F5'), 'Xe Đang Gửi', `=COUNTIF('${dataSheetName}'!G:G; "Đang gửi")`, '#,##0');
    kpiCard(dashboardSheet.getRange('G4:H5'), 'Lượt Xe VIP', `=COUNTIF('${dataSheetName}'!K:K; "Có")`, '#,##0');

    const dataAreaStartCol = 12;
    dashboardSheet.getRange(1, dataAreaStartCol).setValue("VÙNG DỮ LIỆU CHO BIỂU ĐỒ").setFontWeight('bold');

    dashboardSheet.getRange(2, dataAreaStartCol).setValue("Doanh thu theo Ngày").setFontWeight('bold').setBackground(cardHeaderColor);
    dashboardSheet.getRange(3, dataAreaStartCol).setFormula(`=QUERY('${dataSheetName}'!A:M; "SELECT B, SUM(L) WHERE L IS NOT NULL GROUP BY B ORDER BY B ASC LABEL B 'Ngày', SUM(L) 'Doanh thu'"; 1)`);

    dashboardSheet.getRange(2, dataAreaStartCol + 2).setValue("Doanh thu theo Điểm trực").setFontWeight('bold').setBackground(cardHeaderColor);
    dashboardSheet.getRange(3, dataAreaStartCol + 2).setFormula(`=QUERY('${dataSheetName}'!A:M; "SELECT I, SUM(L) WHERE K IS NULL AND L > 0 GROUP BY I LABEL I 'Điểm trực', SUM(L) 'Doanh thu'"; 1)`);

    dashboardSheet.getRange(2, dataAreaStartCol + 4).setValue("Phương thức thanh toán").setFontWeight('bold').setBackground(cardHeaderColor);
    dashboardSheet.getRange(3, dataAreaStartCol + 4).setFormula(`=QUERY('${dataSheetName}'!A:M; "SELECT M, COUNT(M) WHERE M IS NOT NULL GROUP BY M LABEL M 'Phương thức', COUNT(M) 'Số lượt'"; 1)`);

    const dataSheet = ss.getSheetByName(dataSheetName);
    if (dataSheet.getRange('N1').getValue() !== 'Hour') {
        dataSheet.getRange('N1').setValue('Hour').setFontWeight('bold');
        dataSheet.getRange('N2').setFormula('=IF(ISBLANK(E2), "", HOUR(E2))');
        const lastRow = dataSheet.getLastRow();
        if (lastRow > 2) dataSheet.getRange('N2').copyTo(dataSheet.getRange(`N3:N${lastRow}`));
    }
    dashboardSheet.getRange(2, dataAreaStartCol + 6).setValue("Lượt xe vào theo Giờ").setFontWeight('bold').setBackground(cardHeaderColor);
    dashboardSheet.getRange(3, dataAreaStartCol + 6).setFormula(`=QUERY('${dataSheetName}'!A:N; "SELECT N, COUNT(N) WHERE N IS NOT NULL GROUP BY N ORDER BY N ASC LABEL N 'Giờ', COUNT(N) 'Số lượt xe'"; 1)`);

    SpreadsheetApp.flush();

    const chartOptions = {
      'titleTextStyle': { 'color': '#444', 'fontSize': 14, 'bold': true },
      'legend': { 'position': 'bottom' },
      'hAxis': { 'textStyle': { 'color': '#555' } },
      'vAxis': { 'textStyle': { 'color': '#555' } },
      'backgroundColor': '#ffffff'
    };

    let dailyRevenueBuilder = dashboardSheet.newChart().asLineChart()
      .addRange(dashboardSheet.getRange(3, dataAreaStartCol, 10, 2).getDataRegion())
      .setOption('title', 'BIỂU ĐỒ DOANH THU THEO NGÀY')
      .setOption('curveType', 'function')
      .setOption('pointSize', 5);
    for (const option in chartOptions) { dailyRevenueBuilder.setOption(option, chartOptions[option]); }
    dashboardSheet.insertChart(dailyRevenueBuilder.setPosition(7, 1, 0, 0).build());

    let locationRevenueBuilder = dashboardSheet.newChart().asColumnChart()
      .addRange(dashboardSheet.getRange(3, dataAreaStartCol + 2, 10, 2).getDataRegion())
      .setOption('title', 'SO SÁNH DOANH THU CÁC ĐIỂM TRỰC');
    for (const option in chartOptions) { locationRevenueBuilder.setOption(option, chartOptions[option]); }
    dashboardSheet.insertChart(locationRevenueBuilder.setPosition(7, 6, 0, 0).build());

    let paymentMethodBuilder = dashboardSheet.newChart().asPieChart()
      .addRange(dashboardSheet.getRange(3, dataAreaStartCol + 4, 10, 2).getDataRegion())
      .setOption('title', 'TỶ LỆ PHƯƠNG THỨC THANH TOÁN')
      .setOption('pieHole', 0.4);
    for (const option in chartOptions) { paymentMethodBuilder.setOption(option, chartOptions[option]); }
    dashboardSheet.insertChart(paymentMethodBuilder.setPosition(24, 1, 0, 0).build());

    let peakHourBuilder = dashboardSheet.newChart().asColumnChart()
      .addRange(dashboardSheet.getRange(3, dataAreaStartCol + 6, 25, 2).getDataRegion())
      .setOption('title', 'PHÂN TÍCH GIỜ CAO ĐIỂM (XE VÀO)');
    for (const option in chartOptions) { peakHourBuilder.setOption(option, chartOptions[option]); }
    dashboardSheet.insertChart(peakHourBuilder.setPosition(24, 6, 0, 0).build());

    dashboardSheet.hideColumns(dataAreaStartCol, 8);
    dashboardSheet.activate();
    SpreadsheetApp.getUi().alert('Trang Dashboard đã được thiết kế lại thành công!');

  } catch (e) {
    Logger.log(`Lỗi khi tạo Dashboard: ${e.message}\n${e.stack}`);
    SpreadsheetApp.getUi().alert(`Đã xảy ra lỗi khi tạo Dashboard: ${e.message}`);
  }
}
