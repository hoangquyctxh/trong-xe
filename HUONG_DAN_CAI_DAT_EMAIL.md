# HƯỚNG DẪN CÀI ĐẶT HỆ THỐNG GỬI BIÊN LAI TỰ ĐỘNG (V2.0)

Hướng dẫn này giúp bạn thiết lập tính năng gửi biên lai qua Email sử dụng Google Apps Script, Google Docs (Template) và Google Sheets (Log).

---

## BƯỚC 1: CHUẨN BỊ FILE GOOGLE DOCS (TEMPLATE)

1.  Tạo một file Google Docs mới (hoặc dùng file mẫu có sẵn).
2.  Thiết kế nội dung biên lai theo ý muốn (Logo, Bảng giá, Tiêu đề...).
3.  Tại những vị trí muốn điền dữ liệu tự động, hãy nhập các **Biến số** sau đây (chính xác từng ký tự):

| Biến số (Nhập vào Doc) | Ý nghĩa dữ liệu sẽ được điền vào |
| :--- | :--- |
| Biến số (Trong Google Doc) | Ý nghĩa & Định dạng (Chuẩn Việt Nam) |
| :--- | :--- |
| **THÔNG TIN CƠ BẢN** | |
| `{{plate}}` | \tBiển số xe (VD: **30A-123.45**) |
| `{{vehicle_type}}` | \tLoại xe (VD: Ô tô / Xe máy) |
| `{{entry_time}}` | \tGiờ vào (VD: 14:30 14/12/2025) |
| `{{exit_time}}` | \tGiờ ra (VD: 17:45 14/12/2025) |
| `{{duration}}` | \tThời gian gửi (VD: 3 giờ 15 phút) |
| **TÀI CHÍNH & THANH TOÁN** | |
| `{{fee}}` | \tTổng phí (VD: **50.000 đ**) |
| `{{fee_words}}` | \tSố tiền bằng chữ (VD: *Năm mươi nghìn đồng*) |
| `{{payment_method}}` | \tHình thức (VD: Tiền mặt / CK) |
| `{{fee_details}}` | \t**CHI TIẾT TÍNH PHÍ** (Rất quan trọng):<br>- Hiển thị trọn vẹn cách tính toán như trên web.<br>- Bao gồm: *Giờ ban ngày/đêm, Số block, Phụ phí, Quy định áp dụng*.<br>- **Lưu ý:** Dành một khoảng trống rộng trong Doc cho biến này vì nó sẽ xuống dòng nhiều. |
| `{{vat_rate}}` | \tThuế suất GTGT (VD: 8% hoặc 10%) |
| `{{pre_tax_fee}}` | \tGiá trước thuế |
| `{{tax_amount}}` | \tTiền thuế |
| `{{payment_method}}` | \tHình thức (VD: Tiền mặt / Chuyển khoản ACBBank) |
| `{{transaction_ref}}` | \tMã giao dịch ngân hàng (nếu có) |
| `{{payment_status}}` | \tTrạng thái (VD: ĐÃ THANH TOÁN) |
| **QUẢN LÝ & ĐỐI SOÁT** | |
| `{{ticket_id}}` | \tMã vé hệ thống (VD: TICKET-123456) |
| `{{invoice_serial}}` | \tKý hiệu/Mẫu số hóa đơn (nếu có) |
| `{{staff_name}}` | \tNhân viên thu ngân |
| `{{shift_id}}` | \tCa làm việc (VD: Ca Sáng - 14/12) |
| `{{location}}` | \tTên bãi xe |
| **KHÁCH HÀNG (Doanh nghiệp)** | |
| `{{customer_name}}` | \tTên khách hàng |
| `{{company_name}}` | \tTên công ty/đơn vị |
| `{{tax_code}}` | \tMã số thuế khách hàng |
| `{{customer_address}}` | \tĐịa chỉ khách hàng |
| **KHÁC** | |
| `{{qr_link}}` | \tLink tra cứu vé online |
| `{{qr_code_img}}` | \t**HÌNH ẢNH** Mã QR (Hệ thống sẽ tự chèn ảnh vào đây) |
| `{{issue_date}}` | \tNgày xuất (VD: 14/12/2025) |
| `{{notes}}` | \tGhi chú |

> **Lưu ý quan trọng:** Lấy ID của file Google Doc này.
> ID nằm trên thanh địa chỉ URL: `docs.google.com/document/d/[ID_CỦA_FILE]/edit`
> Copy đoạn ID này để dùng cho Bước 3.

---

## BƯỚC 1.5: GỢI Ý CẤU TRÚC BIÊN LAI CHUẨN (MỚI)

Để biên lai chuyên nghiệp và đầy đủ nhất, bạn nên bổ sung các mục sau vào mẫu (như hình bạn đã làm nhưng thêm vào):

**II. Chi tiết phí (Bổ sung)**
*   Tổng phí: `{{fee}}`
*   **Bằng chữ:** `{{fee_words}}` (Rất quan trọng cho văn bản tài chính)
*   **Hình thức thanh toán:** `{{payment_method}}`
*   Chi tiết cách tính: `{{fee_details}}`

**III. Thông tin bãi xe (Bổ sung)**
*   Hotline hỗ trợ: `{{hotline}}`

**IV. Tra cứu trực tuyến (Mới)**
*   Quét mã QR để xem chi tiết vé điện tử:
    `{{qr_code_img}}`
*(Biến này sẽ tự động hiện ra ảnh mã QR)*

---

## BƯỚC 2: CHUẨN BỊ GOOGLE SHEET (LOG) VÀ THƯ MỤC

1.  Tạo một Google Sheet mới (Đặt tên là "Logs Gửi Xe" chẳng hạn). Lấy **ID của Sheet** trên URL.
2.  Tạo một Thư mục (Folder) trên Google Drive để chứa các file PDF biên lai được tạo ra. Lấy **ID của Folder** trên URL.

---

## BƯỚC 3: CÀI ĐẶT GOOGLE APPS SCRIPT

1.  Truy cập [script.google.com](https://script.google.com).
2.  Tạo dự án mới (New Project).
3.  Xóa hết code cũ trong file `Code.gs`.
4.  Copy toàn bộ nội dung từ file `google_apps_script.js` (đã cung cấp kèm theo) và dán vào.
5.  **CẤU HÌNH:** Tìm đến phần đầu của script và điền 3 ID bạn vừa lấy được ở trên vào 3 dòng đầu tiên:

```javascript
const TEMPLATE_DOC_ID = 'Paste_ID_Doc_Vào_Đây';
const DESTINATION_FOLDER_ID = 'Paste_ID_Folder_Vào_Đây';
const LOG_SHEET_ID = 'Paste_ID_Sheet_Vào_Đây';
```

6.  Lưu lại (Ctrl + S).

---

## BƯỚC 4: TRIỂN KHAI (DEPLOY)

1.  Nhấn nút **Deploy** (Triển khai) -> **New deployment** (Tùy chọn mới).
2.  Chọn loại (Select type): **Web app**.
3.  Điền thông tin:
    *   **Description:** "API Gửi Biên Lai V2"
    *   **Execute as:** Me (Tôi - email của bạn).
    *   **Who has access:** Anyone (Bất kỳ ai). *Quan trọng: Phải chọn Anyone để web app gọi được API.*
4.  Nhấn **Deploy**.
5.  Cấp quyền truy cập (Review Permissions) -> Chọn tài khoản Google -> Advanced (Nâng cao) -> Go to ... (unsafe) -> Allow.
6.  Copy **Web App URL** (có dạng `https://script.google.com/macros/s/.../exec`).

---

## BƯỚC 5: CẬP NHẬT VÀO WEB APP

1.  Mở file cấu hình của Web App (`config.js` hoặc nơi chứa `APP_CONFIG`).
2.  Thay thế `googleScriptUrl` cũ bằng URL mới bạn vừa copy.

**Xong!** Hệ thống giờ đây sẽ tự động tạo biên lai PDF chuyên nghiệp theo mẫu bạn thiết kế và gửi email cho khách.
