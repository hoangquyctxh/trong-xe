// ===================================================================================
// HỆ THỐNG UPLOAD ẢNH XE LÊN GOOGLE DRIVE - PHIÊN BẢN 3.0
// Tác giả: Nguyễn Cao Hoàng Quý (Được hỗ trợ bởi Gemini Code Assist)
// Tương thích với hệ thống Quản lý xe phiên bản 4.0
//
// Chức năng:
// 1. Nhận dữ liệu ảnh (base64) và biển số từ client.
// 2. Tự động tạo thư mục lưu trữ theo ngày trên Google Drive.
// 3. Lưu ảnh với tên file chuẩn hóa.
// 4. Trả về ID của các file đã tải lên.
// ===================================================================================

// --- CẤU HÌNH ---
const ROOT_FOLDER_NAME = "VehicleImages"; // Đặt tên thư mục gốc bạn muốn lưu ảnh trên Google Drive

/**
 * Hàm chính xử lý các yêu cầu POST từ ứng dụng web.
 * Đây là điểm vào duy nhất của script.
 * @param {object} e - Đối tượng sự kiện chứa dữ liệu POST.
 * @returns {ContentService.TextOutput} - Phản hồi JSON cho client.
 */
function doPost(e) {
  try {
    // Phân tích dữ liệu JSON được gửi từ client
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;

    // Điều hướng đến hàm xử lý tương ứng dựa trên 'action'
    if (action === 'uploadImage') {
      // Dữ liệu mong đợi: requestData.imageData là một mảng các chuỗi base64
      //                 requestData.plate là biển số xe
      if (!requestData.imageData || !Array.isArray(requestData.imageData) || requestData.imageData.length === 0) {
        return createJsonResponse({ status: 'error', message: 'Không có dữ liệu ảnh nào được gửi lên.' });
      }
      
      const imageIds = uploadImages(requestData.imageData, requestData.plate);
      return createJsonResponse({ status: 'success', data: imageIds });
    }

    // Nếu không có action nào khớp
    return createJsonResponse({ status: 'error', message: 'Hành động không hợp lệ.' });

  } catch (error) {
    // Bắt các lỗi nghiêm trọng (ví dụ: JSON không hợp lệ, lỗi hệ thống)
    Logger.log('Lỗi nghiêm trọng trong doPost: ' + error.toString());
    return createJsonResponse({ status: 'error', message: 'Lỗi máy chủ: ' + error.toString() });
  }
}

/**
 * Xử lý việc tải một hoặc nhiều ảnh lên Google Drive.
 * @param {string[]} base64Images - Mảng các chuỗi dữ liệu ảnh base64.
 * @param {string} plate - Biển số xe để đặt tên file.
 * @returns {string[]} - Mảng các ID của các file đã được tạo trên Google Drive.
 */
function uploadImages(base64Images, plate) {
  const folder = getOrCreateDailyFolder();
  const uploadedFileIds = [];

  base64Images.forEach(base64Image => {
    try {
      // Tách loại mime và dữ liệu base64
      const parts = base64Image.split(',');
      const mimeType = parts[0].match(/:(.*?);/)[1];
      const base64Data = parts[1];

      // Giải mã base64 và tạo blob
      const decodedData = Utilities.base64Decode(base64Data);
      const blob = Utilities.newBlob(decodedData, mimeType);

      // Tạo tên file duy nhất
      const fileName = `${plate}_${new Date().getTime()}.jpg`;
      blob.setName(fileName);

      // Tạo file trong thư mục đã chỉ định
      const file = folder.createFile(blob);
      
      // BƯỚC QUAN TRỌNG NHẤT: Cấp quyền xem công khai cho file vừa tạo.
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      // Thêm ID của file vừa tạo vào mảng kết quả
      uploadedFileIds.push(file.getId());
      Logger.log(`Đã tải lên thành công file: ${fileName} (ID: ${file.getId()})`);

    } catch (err) {
      // Ghi lại lỗi của từng ảnh nhưng không làm dừng toàn bộ quá trình
      Logger.log(`Lỗi khi xử lý một ảnh cho biển số ${plate}: ${err.toString()}`);
    }
  });

  return uploadedFileIds;
}

/**
 * Lấy hoặc tạo thư mục lưu trữ cho ngày hôm nay.
 * Cấu trúc: ROOT_FOLDER_NAME / YYYY-MM-DD
 * @returns {Folder} - Đối tượng thư mục của ngày hôm nay.
 */
function getOrCreateDailyFolder() {
  const rootFolder = getOrCreateFolder(DriveApp, ROOT_FOLDER_NAME);
  
  const today = new Date();
  const year = today.getFullYear();
  const month = ('0' + (today.getMonth() + 1)).slice(-2);
  const day = ('0' + today.getDate()).slice(-2);
  const dailyFolderName = `${year}-${month}-${day}`;
  
  return getOrCreateFolder(rootFolder, dailyFolderName);
}

/**
 * Hàm tiện ích để lấy hoặc tạo một thư mục con trong một thư mục cha.
 * @param {Folder|DriveApp} parent - Thư mục cha hoặc DriveApp (cho thư mục gốc).
 * @param {string} folderName - Tên của thư mục cần lấy hoặc tạo.
 * @returns {Folder} - Đối tượng thư mục.
 */
function getOrCreateFolder(parent, folderName) {
  const folders = parent.getFoldersByName(folderName);
  if (folders.hasNext()) {
    // Thư mục đã tồn tại, trả về nó
    return folders.next();
  }
  // Thư mục chưa tồn tại, tạo mới và trả về
  return parent.createFolder(folderName);
}

/**
 * Tạo một đối tượng phản hồi JSON chuẩn hóa.
 * @param {object} data - Dữ liệu JavaScript cần chuyển thành JSON.
 * @returns {ContentService.TextOutput} - Đối tượng phản hồi có thể gửi về client.
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
