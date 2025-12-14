/**
 * HỆ THỐNG GỬI BIÊN LAI TRÔNG XE TỰ ĐỘNG
 * Phiên bản: 2.0 (Cập nhật 14/12/2025)
 * Tính năng: Gửi email + File PDF đính kèm + Lưu log vào Google Sheet
 */

// =======================================================
// CẤU HÌNH (BẠN CẦN ĐIỀN THÔNG TIN VÀO ĐÂY)
// =======================================================

// 1. ID của Google Doc mẫu biên lai (Template)
const TEMPLATE_DOC_ID = '1kZvyq9V0omIbG161TNrKma9bqb_FEazsXYKBda1wgBA';
// (Ví dụ: 1xXXXXXXXXXX...)

// 2. ID của Thư mục chứa các biên lai đã tạo (Để tránh rác Drive)
const DESTINATION_FOLDER_ID = '17tSdiH6ycGJJtBAVt4pJYrTB2WS_EDiY';

// 3. ID của Google Sheet để lưu lịch sử (Sheet 1)
const LOG_SHEET_ID = '1e6IeTR3QPF8AojINshBIr-p95ysDN9OANu6iA0S37ps';
const SHEET_NAME = 'Logs'; // Tên tab trong Google Sheet

// =======================================================
// CODE XỬ LÝ (KHÔNG CẦN SỬA NẾU KHÔNG BIẾT VỀ CODE)
// =======================================================

function doGet(e) {
    return handleRequest(e);
}

function doPost(e) {
    const lock = LockService.getScriptLock();
    lock.tryLock(10000);

    try {
        const data = JSON.parse(e.postData.contents);

        // 1. Ghi log vào Google Sheet
        logToSheet(data);

        // 2. Tạo PDF từ Template
        const output = createReceiptPDF(data);

        // 3. Gửi Email
        sendEmail(data, output);

        // 4. Trả về kết quả thành công
        return ContentService.createTextOutput(JSON.stringify({ "result": "success", "message": "Email sent", "url": output.pdf.getUrl() }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        return ContentService.createTextOutput(JSON.stringify({ "result": "error", "error": error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    } finally {
        lock.releaseLock();
    }
}

function handleRequest(e) {
    // Fallback cho GET requests nếu cần thiết, hoặc trả về hướng dẫn
    return ContentService.createTextOutput(JSON.stringify({ "result": "ready", "message": "Service is running. Use POST to send data." }))
        .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Ghi dữ liệu vào Google Sheet
 */
function logToSheet(data) {
    try {
        const ss = SpreadsheetApp.openById(LOG_SHEET_ID);
        let sheet = ss.getSheetByName(SHEET_NAME);

        if (!sheet) {
            sheet = ss.insertSheet(SHEET_NAME);
            // Tạo header nếu sheet mới
            sheet.appendRow([
                "Thời gian", "Mã vé", "Biển số", "Loại xe",
                "Giờ vào", "Giờ ra", "Thời gian gửi", "Phí",
                "Trạng thái TT", "Email gửi tới"
            ]);
        }

        sheet.appendRow([
            new Date(),
            data.ticket_id || '',
            data.plate || '',
            data.vehicle_type || '',
            data.entry_time || '',
            data.exit_time || '',
            data.duration || '',
            data.fee || '',
            data.payment_status || '',
            data.email || ''
        ]);
    } catch (e) {
        console.error("Lỗi ghi Sheet: " + e.toString());
    }
}

/**
 * Tạo file PDF biên lai từ Template Google Doc
 */
function createReceiptPDF(data) {
    try {
        const templateFile = DriveApp.getFileById(TEMPLATE_DOC_ID);
        const destinationFolder = DriveApp.getFolderById(DESTINATION_FOLDER_ID);

        // Copy template ra file tạm
        const tempFileName = `BienLai_${data.plate}_${Date.now()}`;
        const tempFile = templateFile.makeCopy(tempFileName, destinationFolder);
        const tempDoc = DocumentApp.openById(tempFile.getId());
        const body = tempDoc.getBody();

        // 2.1. Chuẩn hóa dữ liệu (Format lại tiền tệ, ngày tháng)
        data.fee_formatted = formatCurrency(data.fee);
        data.fee_words = readMoney(data.fee); // Đọc số tiền bằng chữ
        data.entry_time_fmt = formatDateVN(data.entry_time);
        data.exit_time_fmt = formatDateVN(data.exit_time);
        data.issue_date_fmt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");

        // Thay thế các biến {{...}} bằng dữ liệu thật
        const replacements = {
            // --- THÔNG TIN CƠ BẢN ---
            '{{ticket_id}}': data.ticket_id,
            '{{plate}}': data.plate,
            '{{vehicle_type}}': data.vehicle_type,
            '{{entry_time}}': data.entry_time_fmt || data.entry_time,
            '{{exit_time}}': data.exit_time_fmt || data.exit_time,
            '{{duration}}': data.duration,

            // --- TÀI CHÍNH ---
            '{{fee}}': data.fee_formatted,
            '{{fee_words}}': data.fee_words,
            '{{vat_rate}}': data.vat_rate || '0%',
            '{{pre_tax_fee}}': data.pre_tax_fee ? formatCurrency(data.pre_tax_fee) : data.fee_formatted, // Fallback nếu ko tách thuế
            '{{tax_amount}}': data.tax_amount ? formatCurrency(data.tax_amount) : '0 đ',
            '{{payment_method}}': data.payment_method || 'Tiền mặt',
            '{{payment_status}}': data.payment_status || 'Đã thanh toán',
            '{{transaction_ref}}': data.transaction_ref || '---',
            '{{fee_details}}': data.fee_details,

            // --- QUẢN LÝ ---
            '{{location}}': data.location,
            '{{location_address}}': data.location_address,
            '{{hotline}}': data.hotline,
            '{{issue_date}}': data.issue_date_fmt,
            '{{staff_name}}': data.staff_name || 'Admin',
            '{{shift_id}}': data.shift_id || 'Hành chính',
            '{{invoice_serial}}': data.invoice_serial || '',

            // --- KHÁCH HÀNG DOANH NGHIỆP ---
            '{{customer_name}}': data.customer_name || 'Khách lẻ',
            '{{company_name}}': data.company_name || '',
            '{{tax_code}}': data.tax_code || '',
            '{{customer_address}}': data.customer_address || '',
            '{{customer_phone}}': data.customer_phone,

            // --- KHÁC ---
            '{{qr_link}}': data.qr_link || '',
            '{{notes}}': data.notes
        };

        for (const key in replacements) {
            body.replaceText(key, replacements[key] || '---');
        }

        // --- XỬ LÝ HÌNH ẢNH QR CODE ---
        if (data.qr_link) {
            try {
                // Tạo QR Code từ QuickChart API (hoặc API khác)
                // Lưu ý: encodeURIComponent để đảm bảo link an toàn
                const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(data.qr_link)}&size=300&margin=1`;
                const qrBlob = UrlFetchApp.fetch(qrUrl).getBlob();

                replaceTextWithImage(body, '{{qr_code_img}}', qrBlob);
            } catch (e) {
                console.error("Lỗi tạo ảnh QR: " + e.toString());
                body.replaceText('{{qr_code_img}}', '(Lỗi tải mã QR)');
            }
        } else {
            body.replaceText('{{qr_code_img}}', ''); // Xóa placeholder nếu không có link
        }

        tempDoc.saveAndClose();

        // Convert sang PDF
        const pdfBlob = tempFile.getAs(MimeType.PDF);
        const pdfFile = destinationFolder.createFile(pdfBlob);

        // Xóa file doc tạm để tiết kiệm bộ nhớ
        tempFile.setTrashed(true);

        return { pdf: pdfFile, data: data }; // Trả về cả data đã format

    } catch (e) {
        console.error("Lỗi tạo PDF: " + e.toString());
        throw new Error("Không thể tạo biên lai PDF. Vui lòng kiểm tra Template ID.");
    }
}
// ... (Helper functions)

function replaceTextWithImage(body, placeholder, imageBlob) {
    const found = body.findText(placeholder);
    if (found) {
        const element = found.getElement();
        const parent = element.getParent();

        // Tìm vị trí của text trong paragraph
        const textToReplace = element.asText();
        const startOffset = found.getStartOffset();
        const endOffset = found.getEndOffsetInclusive();

        // Xóa text placeholder
        textToReplace.deleteText(startOffset, endOffset);

        // Chèn ảnh vào vị trí đó (Lưu ý: insertInlineImage chèn vào đầu hoặc cuối element container)
        // Cách đơn giản nhất là chèn vào paragraph chứa text đó
        if (parent.getType() === DocumentApp.ElementType.PARAGRAPH) {
            const img = parent.asParagraph().insertInlineImage(0, imageBlob);
            img.setWidth(150).setHeight(150); // Set kích thước ảnh
        }
    }
}

/**
 * Gửi email kèm file PDF
 */
function sendEmail(rawData, pdfOutput) {
    if (!pdfOutput || !pdfOutput.data || !pdfOutput.pdf) {
        console.warn("sendEmail called with invalid arguments. Skipping.");
        return;
    }
    const data = pdfOutput.data;
    const file = pdfOutput.pdf;

    const subject = `Biên lai phí gửi xe - Biển số ${data.plate} - ${data.issue_date || 'Mới nhất'}`;

    // Nội dung email (HTML)
    const htmlBody = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #0065BD; padding: 20px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0; text-transform: uppercase; letter-spacing: 1px;">Biên Lai Gửi Xe</h2>
      </div>
      
      <div style="padding: 20px;">
        <p>Xin chào <strong>${data.customer_name || 'Quý khách'}</strong>,</p>
        <p>Hệ thống trân trọng gửi tới bạn thông tin chi tiết lượt gửi xe:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px 0; color: #666;">Biển số xe:</td>
            <td style="padding: 10px 0; text-align: right; font-weight: bold; font-size: 16px;">${data.plate}</td>
          </tr>
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px 0; color: #666;">Thời gian gửi:</td>
            <td style="padding: 10px 0; text-align: right;">${data.entry_time_fmt} - ${data.exit_time_fmt}</td>
          </tr>
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px 0; color: #666;">Tổng thời gian:</td>
            <td style="padding: 10px 0; text-align: right;">${data.duration}</td>
          </tr>
          <tr style="border-bottom: 2px solid #0065BD;">
            <td style="padding: 10px 0; color: #666; font-weight: bold;">Tổng tiền thanh toán:</td>
            <td style="padding: 10px 0; text-align: right; color: #d32f2f; font-weight: bold; font-size: 18px;">${data.fee_formatted}</td>
          </tr>
          <tr>
             <td colspan="2" style="padding: 5px 0; text-align: right; font-style: italic; color: #777; font-size: 13px;">(${data.fee_words})</td>
          </tr>
        </table>

         <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; font-size: 13px; color: #555;">
            <p style="margin: 0;"><strong>Hỗ trợ:</strong> ${data.hotline}</p>
            <p style="margin: 5px 0 0 0;"><strong>Địa chỉ:</strong> ${data.location_address}</p>
         </div>
      </div>
      
      <div style="background-color: #f1f3f4; padding: 15px; text-align: center; font-size: 12px; color: #888;">
        &copy; 2025 Đoàn Thanh niên Phường Ba Đình. All rights reserved.
      </div>
    </div>
  `;

    MailApp.sendEmail({
        to: data.email,
        subject: subject,
        htmlBody: htmlBody,
        attachments: [file.getAs(MimeType.PDF)],
        name: "Hệ thống Trông giữ xe (No-Reply)"
    });
}

// --- HELPER FUNCTIONS (ĐỊNH DẠNG VIỆT NAM) ---

function formatCurrency(amount) {
    if (!amount && amount !== 0) return '0 đ';
    // Nếu amount là string có chữ "đ" hoặc ",", thử parse
    const num = Number(String(amount).replace(/[^0-9.-]+/g, ""));
    if (isNaN(num)) return amount;
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
}

function formatDateVN(dateStr) {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr; // Nếu không parse được thì trả về nguyên gốc
        return Utilities.formatDate(date, "Asia/Ho_Chi_Minh", "HH:mm dd/MM/yyyy");
    } catch (e) {
        return dateStr;
    }
}

function readMoney(number) {
    if (!number) return 'Không đồng';
    const num = Number(String(number).replace(/[^0-9.-]+/g, ""));
    if (isNaN(num)) return 'Không đồng';
    if (num === 0) return 'Không đồng';

    // Format tiền tệ đơn giản kèm text
    return formatCurrency(num).replace('₫', 'đồng').replace(/\./g, ' ');
}
