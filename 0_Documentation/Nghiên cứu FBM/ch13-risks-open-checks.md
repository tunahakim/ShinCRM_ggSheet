<!-- split-doc-source: 06. FBM INTEGRATION REFERENCE (Tài liệu tích hợp FBM).md -->
<!-- split-doc-headings: ## Chương 13. Giới hạn, rủi ro và danh sách cần kiểm chứng -->
<!-- split-doc-lines: 2465-2523 -->

> Nội dung bên dưới được trích nguyên văn từ tài liệu gốc. Chỉ phần header này được thêm để định tuyến sau khi tách docs.
## Chương 13. Giới hạn, rủi ro và danh sách cần kiểm chứng

### 13.1 Giới hạn kỹ thuật

**Chặn IP nước ngoài:** FBM server chỉ chấp nhận kết nối từ IP Việt Nam. Mọi request phải đi qua Worker Node.js chạy ở mạng Việt Nam. Chrome Extension chỉ lấy cookie từ trình duyệt user; Supabase Edge Functions (chạy trên cloud nước ngoài) không thể gọi trực tiếp đến FBM.

**Session không bind IP nhưng chỉ cho 1 lệnh login tại 1 thời điểm:** FBM cho phép cùng một session hoạt động từ nhiều IP khác nhau — đã test xác nhận. Tuy nhiên, nếu có lệnh Login mới (với `force: true`), session cũ bị hủy ngay lập tức. Điều này có nghĩa: nhiều thiết bị có thể DÙNG CHUNG session (qua cookie), nhưng chỉ 1 thiết bị được ĐĂNG NHẬP. Worker không tự login nếu Extension vừa gửi cookie tươi; server-login chỉ là fallback khi cookie hết hạn.

**Thời gian session không cố định:** Session có thể tồn tại từ 30 phút đến hơn 1 tiếng rưỡi. ShinCRM phải dùng cơ chế phòng thủ (kiểm tra response) thay vì timer cố định.

**Không có REST API chính thức:** Toàn bộ API được reverse-engineer từ traffic thực tế. FBM có thể thay đổi cấu trúc API khi nâng cấp mà không báo trước.

**JSON body phải escape `/`:** Mọi ký tự `/` phải thành `\/`. Nếu không, HTTP 500. Escape thực hiện ở request packager phía Supabase, không phải trong Worker.

**Filter chỉ hỗ trợ contains:** Toán tử duy nhất xác nhận được là `**` (LIKE '%...%'). Không có exact match operator — cần verify thủ công sau khi nhận kết quả.

### 13.2 Rủi ro vận hành

**Rủi ro bị khóa tài khoản:** FBM là hệ thống nội bộ, không thiết kế cho API automation. Nếu gửi quá nhiều request trong thời gian ngắn, có khả năng bị phát hiện và khóa tài khoản. Khuyến nghị: giữ khoảng cách tối thiểu 500ms-1s giữa các request, không gửi quá 60 request/phút, sync incremental thay vì full sync mỗi lần.

**Rủi ro mất session khi user dùng FBM:** Nếu user đang dùng FBM web trên trình duyệt mà ShinCRM cũng login cùng tài khoản, phiên FBM web sẽ bị hủy. Chrome Extension giải quyết vấn đề này bằng cách dùng chính session của trình duyệt thay vì tạo session riêng.

**Rủi ro thay đổi cấu trúc API:** Khi FBM nâng cấp, thứ tự cột trong Rows có thể thay đổi. ShinCRM nên có cơ chế phát hiện (so sánh ViewPage.Fields từ response type=0 với mapping đã lưu) và cảnh báo.

### 13.3 Lưu ý về dữ liệu FBM

**Nguyên tắc chung:** Dữ liệu lấy từ FBM giữ nguyên khi đồng bộ về ShinCRM, không tự động sửa hay "làm sạch". Các trường hợp dữ liệu không chuẩn (MST chứa SĐT, tên KH là tên cá nhân, v.v.) là thực tế sử dụng trên FBM — ShinCRM lưu trữ đúng như vậy.

**Tên KH dạng cá nhân:** Nhiều KH có `ten_kh` dạng "Ms Uyên 0369662506", "chị Thảo - 0825070802". Đây không nhất thiết là KH cá nhân — có thể là KH doanh nghiệp đang ở giai đoạn tham khảo, chưa cung cấp thông tin công ty. ShinCRM xử lý phân loại KH theo logic riêng (xem Tài liệu 2 — Domain Specification), không dựa vào format tên trên FBM.

**Email `<autoit>`:** Giá trị `<autoit>` trong trường email là nhãn đánh dấu do người dùng tự gán cho KH crawl về. ShinCRM không được block sync vì giá trị này, nhưng không ghi vào field email chính nếu schema đang giới hạn email hợp lệ; lưu trong raw data/warning để user xử lý.

**MST/CCCD không chuẩn:** FBM cho phép `ma_so_thue` dài hơn hoặc chứa dữ liệu bẩn. Khi sync về ShinCRM, chỉ map vào `tax_code`/`id_card_number` nếu hợp lệ với constraint ShinCRM (`tax_code` tối đa 14, `id_card_number` tối đa 12). Giá trị không hợp lệ hoặc quá dài lưu trong raw data/staging warning, không insert vào field constrained.

**Space đầu trong tên:** Một số giá trị text có space ở đầu. ShinCRM nên trim khi hiển thị nhưng giữ nguyên khi đồng bộ ngược lên FBM.

**Ngày null placeholder:** `/Date(-2209014000000)/` (1899-12-30) và `/Date(915123600000)/` (1999-01-01) cần coi là null khi xử lý nghiệp vụ trên ShinCRM.

**Mã số thuế:** FBM chặn trùng MST cho MỌI giá trị, không có ngoại lệ nào được xác nhận.

### 13.4 Quy tắc mặc định và điểm cần kiểm chứng thấp

Các điểm dưới đây không chặn triển khai adapter Phase 2. Khi chưa có dữ liệu kiểm chứng bổ sung, AI coding áp dụng quy tắc mặc định bên dưới và ghi log WARN nếu response FBM khác mẫu.

**Quy tắc mặc định khi triển khai Phase 2:**

- Mã KH tự sinh (`_ma_kh_auto`): chỉ gọi API mở form ngay trước khi lưu KH, không gọi để giữ chỗ mã. Nếu lưu thất bại, bỏ mã đó và mở form lại ở lần retry để lấy mã mới.
- Bảng con `chiasekh` và `crlhkh` trong payload tạo KH: gửi đúng dạng mẫu `Modified: 0, Items: []` trong Phase 2. Không tự thêm dữ liệu vào hai bảng con này cho đến khi ShinCRM hỗ trợ chia sẻ KH hoặc đồng bộ NLH phụ.
- Danh mục đầy đủ trạng thái hoạt động (`status` trên `zccrAccountTask`): khi chưa có mapping danh mục đầy đủ, luôn lưu mã gốc vào `fbm_status`; nếu cần tạo activity từ import thủ công mà không map được thì dùng default `COMPLETED` như Chương 14.2.
- `fileticket` khi tạo hoạt động mới: gửi rỗng trong Phase 2. Chỉ kiểm chứng thêm khi ShinCRM hỗ trợ upload file đính kèm vào hoạt động.

**Điểm kiểm chứng ưu tiên thấp:** Các quy tắc trên cần test lại khi mở rộng Phase 2 beyond adapter cơ bản, nhưng không được để AI coding dừng triển khai vì thiếu câu trả lời tại đây.

**Đã kiểm chứng xong (xóa khỏi danh sách):**

`values: []` khi lấy authorized — hoạt động bình thường với `viewPage: false`. Mã quốc gia mặc định — xác nhận `"VN"`. Cơ chế lấy authorized mới — xác nhận hoạt động ở Chương 2.7. Session cross-IP — xác nhận hoạt động, session không bind IP.

---

