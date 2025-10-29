/**
 * @file code.gs
 * @version 2.6 - Professional PDF Receipt
 * @description Nâng cấp biên lai PDF: Thêm logo, chi tiết cách tính phí, cập nhật địa chỉ và hotline.
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

// ================== ĐỒNG BỘ CẤU HÌNH TÍNH PHÍ TỪ FRONTEND ==================
const FEE_CONFIG = {
    freeMinutes: 15,
    dayRate: 5000,
    nightRate: 8000,
    nightStartHour: 18,
    nightEndHour: 6
};


// ================== ĐỒNG BỘ CẤU HÌNH TỪ FRONTEND ==================
// SỬA LỖI: Sao chép cấu hình từ locations.js và plate_data.js vào backend
// để các hàm như generatePdfReceipt có thể sử dụng.

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

// ================== CÁC HÀM CHÍNH (ENTRY POINTS) ==================

/**
 * Xử lý các yêu cầu GET (lấy dữ liệu).
 */
function doGet(e) {
  try {
    const params = e.parameter;

    // --- SỬA LỖI NGHIÊM TRỌNG: Tái cấu trúc logic để xử lý cả request cũ và mới ---
    if (params.action) {
      // Xử lý các request mới có tham số 'action'
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
        case 'downloadPdfReceipt': // SỬA LỖI: Di chuyển vào đúng khối switch
          return generatePdfReceipt(params.uniqueID);
        default:
          throw new Error(`Hành động '${params.action}' không hợp lệ.`);
      }
    } else {
      // Xử lý các request cũ để đảm bảo tương thích ngược
      if (params.plate) {
        return createJsonResponse({ status: 'success', data: getVehicleHistory(params.plate) });
      }
      // Đây là request mặc định để tải dữ liệu cho trang index
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
 * Lấy lịch sử gửi xe của một biển số dựa trên UniqueID của một giao dịch.
 */
function getVehicleHistoryByUniqueID(uniqueID) {
  if (!uniqueID) {
    throw new Error("Thiếu tham số uniqueID.");
  }
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const plateIndex = headers.indexOf("Plate");
  const uniqueIDIndex = headers.indexOf("UniqueID");

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
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][plateIndex] === plateNumber) {
      history.push(arrayToObject(headers, data[i]));
    }
  }
  
  return createJsonResponse({ status: 'success', data: history });
}

/**
 * MỚI: Tạo biên lai PDF theo định dạng hóa đơn cơ bản.
 */
function generatePdfReceipt(uniqueID) {
  if (!uniqueID) throw new Error("Thiếu UniqueID để tạo biên lai PDF.");

  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const cols = getHeaderIndices(headers);

  let transaction = null;
  for (let i = 1; i < data.length; i++) {
    if (data[i][cols.uniqueIdCol] === uniqueID) {
      transaction = arrayToObject(headers, data[i]);
      break;
    }
  }

  if (!transaction) throw new Error(`Không tìm thấy giao dịch với UniqueID: ${uniqueID}`);

  const entryTime = new Date(transaction['Entry Time']);
  const exitTime = transaction['Exit Time'] ? new Date(transaction['Exit Time']) : new Date();
  const fee = parseFloat(transaction.Fee) || 0;
  const paymentMethod = transaction.PaymentMethod || 'Chưa xác định';
  const locationId = transaction.LocationID;
  const location = LOCATIONS_CONFIG.find(loc => loc.id === locationId);

  const orgName = "ĐOÀN TNCS HỒ CHÍ MINH PHƯỜNG BA ĐÌNH";
  const orgAddress = "68 Nguyễn Thái Học, Phường Ba Đình, Thành phố Hà Nội";
  const orgHotline = "Đang cập nhật";
  const taxId = "0123456789"; // Placeholder, bạn có thể thay đổi

  // NÂNG CẤP: Tính toán chi tiết phí
  const feeDetails = calculateFeeWithBreakdown(entryTime, exitTime, transaction.VIP === 'Có');
  let feeBreakdownHtml = '';
  if (feeDetails.dayHours > 0 || feeDetails.nightHours > 0) {
    feeBreakdownHtml = `<p style="font-size: 11px; color: #555; margin-top: 5px;"><i>(Diễn giải: ${feeDetails.dayHours > 0 ? `${feeDetails.dayHours} giờ ngày` : ''}${feeDetails.dayHours > 0 && feeDetails.nightHours > 0 ? ' + ' : ''}${feeDetails.nightHours > 0 ? `${feeDetails.nightHours} giờ đêm` : ''})</i></p>`;
  }

  const htmlTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <base target="_top">
      <style>
        body { font-family: 'Arial', sans-serif; margin: 0; padding: 20px; color: #333; font-size: 12px; display: flex; justify-content: center; }
        .container { width: 100%; max-width: 700px; border: 1px solid #ccc; padding: 20px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 20px; }
        .header img { width: 60px; height: auto; margin-bottom: 10px; }
        .header h1 { margin: 0; font-size: 18px; color: #0d47a1; }
        .header p { margin: 2px 0; font-size: 10px; }
        .title { text-align: center; font-size: 22px; font-weight: bold; margin: 20px 0; color: #0d47a1; }
        .invoice-info { display: flex; justify-content: space-between; margin-bottom: 15px; }
        .invoice-info div { width: 48%; }
        .invoice-info p { margin: 2px 0; }
        .section-title { font-weight: bold; margin-top: 15px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        table th, table td { border: 1px solid #eee; padding: 8px; text-align: left; }
        table th { background-color: #f5f5f5; font-weight: bold; }
        .total-row td { font-weight: bold; background-color: #f5f5f5; }
        .amount-in-words { margin-top: 10px; font-style: italic; }
        .footer { margin-top: 30px; display: flex; justify-content: space-around; text-align: center; }
        .footer div { width: 45%; }
        .footer p { margin: 5px 0; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img src="https://cdn.haitrieu.com/wp-content/uploads/2021/11/Logo-Doan-Thanh-NIen-Cong-San-Ho-Chi-Minh-1.png" alt="Logo">
          <h1>${orgName}</h1>
          <p>${orgAddress}</p>
          <p>Mã số thuế: ${taxId} | Hotline: ${orgHotline}</p>
        </div>

        <h2 class="title">BIÊN LAI THU TIỀN DỊCH VỤ</h2>
        <p class="text-center">Ngày ${exitTime.getDate()} tháng ${exitTime.getMonth() + 1} năm ${exitTime.getFullYear()}</p>

        <div class="invoice-info">
          <div>
            <p><strong>Số biên lai:</strong> ${transaction.UniqueID}</p>
            <p><strong>Biển số xe:</strong> ${transaction.Plate}</p>
            <p><strong>Loại xe:</strong> ${decodePlateNumber(transaction.Plate)}</p>
          </div>
          <div class="text-right">
            <p><strong>Giờ vào:</strong> ${entryTime.toLocaleString('vi-VN')}</p>
            <p><strong>Giờ ra:</strong> ${exitTime.toLocaleString('vi-VN')}</p>
            <p><strong>Tổng thời gian:</strong> ${calculateDurationBetween(entryTime, exitTime)}</p>
          </div>
        </div>

        <div class="section-title">Chi tiết dịch vụ</div>
        <table>
          <thead>
            <tr>
              <th>STT</th>
              <th>Nội dung</th>
              <th>Đơn vị</th>
              <th>Số lượng</th>
              <th>Đơn giá</th>
              <th>Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>Phí trông giữ xe</td>
              <td>Lượt</td>
              <td>1</td>
              <td>${fee.toLocaleString('vi-VN')}</td>
              <td>${fee.toLocaleString('vi-VN')}</td>
            </tr>
            <tr class="total-row">
              <td colspan="5" class="text-right">Tổng cộng:</td>
              <td>${fee.toLocaleString('vi-VN')}</td>
            </tr>
          </tbody>
        </table>

        ${feeBreakdownHtml}
        <p><strong>Số tiền bằng chữ:</strong> ${numberToVietnameseWords(fee)} đồng.</p>
        <p><strong>Phương thức thanh toán:</strong> ${paymentMethod}</p>

        <div class="footer">
          <div>
            <p><strong>Người nộp tiền</strong></p>
            <p>(Ký, ghi rõ họ tên)</p>
          </div>
          <div>
            <p><strong>Người thu tiền</strong></p>
            <p>(Ký, ghi rõ họ tên)</p>
            <p style="margin-top: 50px;">${orgName}</p>
          </div>
        </div>
        <p class="text-center" style="margin-top: 20px; font-size: 10px;">Cảm ơn Quý khách đã sử dụng dịch vụ!</p>
      </div>
    </body>
    </html>
  `;

  const blob = HtmlService.createHtmlOutput(htmlTemplate).getAs(MimeType.PDF);
  blob.setName(`BienLai_${uniqueID}.pdf`);

  return createJsonResponse({ status: 'success', data: Utilities.base64Encode(blob.getBytes()) });
}

/**
 * MỚI: Chuyển đổi số thành chữ tiếng Việt.
 * Hàm này được đơn giản hóa, chỉ hỗ trợ đến hàng tỷ.
 */
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
    } else if (u > 0 && h > 0) {
      chunkWords += 'lẻ ' + units[u];
    } else if (u > 0) {
      chunkWords += units[u];
    }

    if (chunkWords.trim() !== '') {
      result = chunkWords.trim() + ' ' + thousands[i] + ' ' + result;
    }
    i++;
  }
  return result.trim().replace(/\s+/g, ' ');
}

/**
 * MỚI: Tính phí và trả về chi tiết cách tính.
 */
function calculateFeeWithBreakdown(startTime, endTime, isVIP) {
    if (isVIP) return { totalFee: 0, breakdown: "Khách mời/VIP (Miễn phí)" };
    if (!startTime) return { totalFee: 0, breakdown: "Không có giờ vào" };

    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diffMinutes = Math.floor((end - start) / (1000 * 60));

    if (diffMinutes <= FEE_CONFIG.freeMinutes) {
        return { totalFee: 0, breakdown: `Miễn phí dưới ${FEE_CONFIG.freeMinutes} phút` };
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

// ================== SỬA LỖI: THÊM CÁC HÀM TIỆN ÍCH TỪ FRONTEND ==================

const PLATE_DATA = {
    provinces: [
        { name: "TP. Hà Nội (mới)", codes: ["29", "30", "31", "32", "33", "40", "88", "99"] },
        { name: "TP. Hồ Chí Minh", codes: ["41", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59"] },
        { name: "Tỉnh An Giang (mới)", codes: ["67", "66", "63"] },
        { name: "Tỉnh Bà Rịa - Vũng Tàu (mới)", codes: ["72", "39", "60"] },
        { name: "Tỉnh Bắc Giang (mới)", codes: ["98", "12"] },
        { name: "Tỉnh Bình Định (mới)", codes: ["77", "78"] },
        { name: "Tỉnh Bình Thuận (mới)", codes: ["86", "85"] },
        { name: "Tỉnh Cà Mau (mới)", codes: ["69", "94"] },
        { name: "TP. Cần Thơ (mới)", codes: ["65", "95", "83", "64"] },
        { name: "Tỉnh Đắk Lắk (mới)", codes: ["47", "48"] },
        { name: "Tỉnh Gia Lai (mới)", codes: ["81", "82"] },
        { name: "Tỉnh Hà Nam (mới)", codes: ["90", "35"] },
        { name: "Tỉnh Hà Tĩnh (mới)", codes: ["38", "73"] },
        { name: "Tỉnh Hải Dương (mới)", codes: ["34", "89"] },
        { name: "TP. Hải Phòng (mới)", codes: ["15", "16", "14"] },
        { name: "Tỉnh Hòa Bình (mới)", codes: ["28", "26"] },
        { name: "Tỉnh Khánh Hòa (mới)", codes: ["79", "92"] },
        { name: "Tỉnh Kiên Giang (mới)", codes: ["68", "93"] },
        { name: "Tỉnh Lào Cai (mới)", codes: ["24", "25"] },
        { name: "Tỉnh Lâm Đồng (mới)", codes: ["49", "61"] },
        { name: "Tỉnh Long An (mới)", codes: ["62", "70"] },
        { name: "Tỉnh Nam Định (mới)", codes: ["18", "17"] },
        { name: "Tỉnh Nghệ An (mới)", codes: ["37", "36"] },
        { name: "Tỉnh Phú Thọ (mới)", codes: ["19", "23"] },
        { name: "Tỉnh Quảng Nam (mới)", codes: ["92", "43"] },
        { name: "Tỉnh Quảng Ngãi (mới)", codes: ["76", "74"] },
        { name: "Tỉnh Thái Nguyên (mới)", codes: ["20", "97"] },
        { name: "Tỉnh Thừa Thiên Huế (mới)", codes: ["75", "74"] },
        { name: "Tỉnh Trà Vinh (mới)", codes: ["84", "71"] },
        { name: "Tỉnh Tuyên Quang (mới)", codes: ["22", "21"] },
        { name: "Tỉnh Yên Bái (mới)", codes: ["21", "27"] },
        { name: "Tỉnh Bến Tre", codes: ["71"] },
        { name: "Tỉnh Cao Bằng", codes: ["11"] },
        { name: "Tỉnh Điện Biên", codes: ["27"] }
    ],
    diplomaticSeries: {
        "001-010": "Tổ chức quốc tế", "011": "Đại sứ quán Afghanistan", "021": "Đại sứ quán Albania", "026": "Đại sứ quán Algérie", "031": "Đại sứ quán Angola",
        "041": "Đại sứ quán Argentina", "046": "Đại sứ quán Úc", "051": "Đại sứ quán Áo", "056": "Đại sứ quán Ấn Độ", "061": "Đại sứ quán Azerbaijan",
        "066": "Đại sứ quán Bangladesh", "071": "Đại sứ quán Belarus", "076": "Đại sứ quán Bỉ", "081": "Đại sứ quán Brasil", "086": "Đại sứ quán Brunei",
        "091": "Đại sứ quán Bulgaria", "096": "Đại sứ quán Campuchia", "101": "Đại sứ quán Canada", "106": "Đại sứ quán Chile", "111": "Đại sứ quán Colombia",
        "116": "Đại sứ quán Cuba", "121": "Đại sứ quán Cộng hòa Séc", "126": "Đại sứ quán Đan Mạch", "131": "Đại sứ quán Ai Cập", "136": "Đại sứ quán Phần Lan",
        "141": "Đại sứ quán Pháp", "146": "Đại sứ quán Đức", "156": "Đại sứ quán Hy Lạp", "161": "Đại sứ quán Guatemala", "166": "Đại sứ quán Hungary",
        "171": "Đại sứ quán Indonesia", "176": "Đại sứ quán Iran", "181": "Đại sứ quán Iraq", "186": "Đại sứ quán Ireland", "191": "Đại sứ quán Israel",
        "196": "Đại sứ quán Ý", "201": "Đại sứ quán Nhật Bản", "206": "Đại sứ quán Kazakhstan", "211": "Đại sứ quán Triều Tiên", "216": "Đại sứ quán Hàn Quốc",
        "221": "Đại sứ quán Kuwait", "226": "Đại sứ quán Lào", "231": "Đại sứ quán Liban", "236": "Đại sứ quán Libya", "241": "Đại sứ quán Malaysia",
        "246": "Đại sứ quán México", "251": "Đại sứ quán Mông Cổ", "256": "Đại sứ quán Maroc", "261": "Đại sứ quán Mozambique", "266": "Đại sứ quán Myanmar",
        "271": "Đại sứ quán Hà Lan", "276": "Đại sứ quán New Zealand", "281": "Đại sứ quán Nigeria", "286": "Đại sứ quán Na Uy", "291": "Đại sứ quán Oman",
        "296": "Đại sứ quán Pakistan", "301": "Đại sứ quán Palestine", "306": "Đại sứ quán Panama", "311": "Đại sứ quán Peru", "316": "Đại sứ quán Philippines",
        "321": "Đại sứ quán Ba Lan", "326": "Đại sứ quán Bồ Đào Nha", "331": "Đại sứ quán Qatar", "336": "Đại sứ quán România", "341": "Đại sứ quán Nga",
        "346": "Đại sứ quán Ả Rập Xê Út", "351": "Đại sứ quán Singapore", "356": "Đại sứ quán Slovakia", "361": "Đại sứ quán Nam Phi", "366": "Đại sứ quán Tây Ban Nha",
        "371": "Đại sứ quán Sri Lanka", "376": "Đại sứ quán Thụy Điển", "381": "Đại sứ quán Thụy Sĩ", "386": "Đại sứ quán Tanzania", "391": "Đại sứ quán Thái Lan",
        "396": "Đại sứ quán Timor-Leste", "406": "Đại sứ quán Thổ Nhĩ Kỳ", "411": "Đại sứ quán Ukraina", "416": "Đại sứ quán Các Tiểu vương quốc Ả Rập Thống nhất",
        "421": "Đại sứ quán Vương quốc Anh", "426": "Đại sứ quán Hoa Kỳ", "431": "Đại sứ quán Uruguay", "436": "Đại sứ quán Venezuela", "441": "Đại sứ quán Haiti",
        "446": "Đại sứ quán El Salvador", "451": "Đại sứ quán Úc (Lãnh sự)", "456": "Đại sứ quán Canada (Lãnh sự)", "461": "Đại sứ quán Trung Quốc (Lãnh sự)",
        "466": "Đại sứ quán Cuba (Lãnh sự)", "471": "Đại sứ quán Pháp (Lãnh sự)", "476": "Đại sứ quán Đức (Lãnh sự)", "481": "Đại sứ quán Hungary (Lãnh sự)",
        "486": "Đại sứ quán Ấn Độ (Lãnh sự)", "491": "Đại sứ quán Indonesia (Lãnh sự)", "496": "Đại sứ quán Nhật Bản (Lãnh sự)", "501": "Đại sứ quán Lào (Lãnh sự)",
        "506": "Đại sứ quán Malaysia (Lãnh sự)", "511": "Đại sứ quán New Zealand (Lãnh sự)", "516": "Đại sứ quán Ba Lan (Lãnh sự)", "521": "Đại sứ quán Hàn Quốc (Lãnh sự)",
        "526": "Đại sứ quán Nga (Lãnh sự)", "531": "Đại sứ quán Singapore (Lãnh sự)", "536": "Đại sứ quán Thụy Sĩ (Lãnh sự)", "541": "Đại sứ quán Thái Lan (Lãnh sự)",
        "546": "Đại sứ quán Vương quốc Anh (Lãnh sự)", "551": "Đại sứ quán Hoa Kỳ (Lãnh sự)", "600-799": "Tổ chức quốc tế phi chính phủ", "800-999": "Cơ quan thông tấn, báo chí nước ngoài"
    },
    specialSeries: {
        "NG": "Xe của cơ quan đại diện ngoại giao", "NN": "Xe của tổ chức, cá nhân nước ngoài", "QT": "Xe của cơ quan đại diện ngoại giao (có yếu tố quốc tế)",
        "CV": "Xe của chuyên viên tư vấn nước ngoài", "LD": "Xe của doanh nghiệp có vốn đầu tư nước ngoài", "DA": "Xe của các ban quản lý dự án nước ngoài",
        "CD": "Xe chuyên dùng của Công an", "KT": "Xe của doanh nghiệp quân đội", "RM": "Rơ moóc quân đội", "MK": "Máy kéo quân đội",
        "TĐ": "Xe máy chuyên dùng của quân đội", "HC": "Xe ô tô chuyên dùng của Công an"
    }
};

function cleanPlateNumber(plateStr) {
  return plateStr ? plateStr.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
}

function decodePlateNumber(plate) {
    if (!plate || typeof plate !== 'string' || typeof PLATE_DATA === 'undefined') return 'Chưa có thông tin';
    const cleanedPlate = cleanPlateNumber(plate);
    for (const series in PLATE_DATA.specialSeries) {
        if (cleanedPlate.includes(series)) {
            if (series === 'NG') {
                const diplomaticCode = parseInt(cleanedPlate.replace('NG', '').substring(0, 3), 10);
                if (!isNaN(diplomaticCode)) {
                    for (const range in PLATE_DATA.diplomaticSeries) {
                        if (range.includes('-')) {
                            const [start, end] = range.split('-').map(Number);
                            if (diplomaticCode >= start && diplomaticCode <= end) return PLATE_DATA.diplomaticSeries[range];
                        } else if (diplomaticCode === parseInt(range, 10)) return PLATE_DATA.diplomaticSeries[range];
                    }
                }
                return "Xe của cơ quan đại diện ngoại giao";
            }
            return PLATE_DATA.specialSeries[series];
        }
    }
    let provinceCode = '';
    let vehicleType = 'Chưa xác định';
    if (cleanedPlate.length === 9 && /^[0-9]{2}/.test(cleanedPlate)) {
        provinceCode = cleanedPlate.substring(0, 2);
        vehicleType = 'Xe máy';
    } else if (cleanedPlate.length === 8 && /^[0-9]{2}/.test(cleanedPlate)) {
        provinceCode = cleanedPlate.substring(0, 2);
        vehicleType = 'Ô tô';
    }
    if (!provinceCode) return 'Biển số không xác định';
    const provinceInfo = PLATE_DATA.provinces.find(p => p.codes.includes(provinceCode));
    const provinceName = provinceInfo ? provinceInfo.name : 'Tỉnh không xác định';
    return `${provinceName} - ${vehicleType}`;
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
