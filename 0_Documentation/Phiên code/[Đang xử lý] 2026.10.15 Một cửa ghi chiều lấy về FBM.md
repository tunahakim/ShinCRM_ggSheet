# Một cửa ghi chiều lấy về FBM

Làm sau khi `[Đã xử lý] 2026.10.15 Chuỗi đồng bộ nền và vòng xoay giao dịch.md` đã xong và gộp vào `main`: phiên này dựa trên bước đếm khách, chuỗi và cursor của phiên đó. Làm sau phiên `[Đã xử lý] 2026.10.16 Luật chung nạp lại RAM và vẽ lại view.md` (chủ dự án đồng ý thứ tự 2026-10-16) để lúc nghiệm thu Sheet đã cập nhật theo lô đúng luật mới.

## Quyết định của chủ dự án

- 2026-10-15: mô hình "một bên phát hiện, một bên đọc chi tiết rồi mới sửa"; một cửa ghi duy nhất là đọc chi tiết khách theo lô `BUDGET.activityBatchCustomers`; chấp nhận tốn thêm request, không đặt trần số khách.
- 2026-10-16: danh sách khách cần đọc chi tiết chỉ sống trong một lượt, đánh theo mã FBM `stt_rec_kh` (khách mới chưa có số CUS); lượt sau xóa hết của lượt trước; chỉ cursor Vòng xoay giữ qua lượt. Bỏ ý cũ "không bị xóa khi mở lượt mới".
- 2026-10-16: Vòng xoay giữ đi theo khách trên Sheet; cursor chỉ tiến sau khi lô đã đọc chi tiết và ghi xong.
- 2026-10-16: giao dịch vắng đi qua bước "Hỏi chủ giao dịch" (grid khách lọc `stt_rec_kh in (select stt_rec from sysevents where id in (...))`) thay cho đọc lại theo id. Chủ dự án đã thử trên FBM thật với `ALT00010`: id thật trả đúng một khách, id không có trả rỗng.
- 2026-10-16: khách cha của giao dịch nối theo `stt_rec_kh` của khách được đọc, không qua `ma_kh`.
- 2026-10-16: không cần đo số request trước và sau.
- Chế độ `Kiểm tra` chạy cùng đường nhưng cửa ghi chỉ xem trước, không ghi Sheet.

## Các đường đang ghi thẳng vào Sheet ở chiều lấy về (trước thay đổi)

| Đường | Ghi gì | Chỗ thay thế |
|---|---|---|
| Trang danh sách khách | Thông tin khách mới, khách sửa | Chỉ đánh dấu khách mới, sửa, vắng, lệch giao dịch cuối vào danh sách đọc chi tiết |
| Lô đọc giao dịch theo khách (lớp 2, 3, Vòng xoay, Quét toàn bộ) | Giao dịch mới, sửa | Thành cửa ghi duy nhất, thêm request đọc thông tin khách của lô |
| Lấy toàn bộ giao dịch và đọc lại theo id khi chia khoảng | Giao dịch đã biết bị sửa, khách cha theo Sheet | Chỉ đánh dấu khách cha; giao dịch vắng sang hỏi chủ; bỏ đọc lại theo id |
| Gắn cờ "không thấy" sau danh sách khách và sau lớp 1 | Cờ khách, cờ giao dịch | Cờ khách ở cửa ghi khi lô không trả khách về; cờ giao dịch sau hỏi chủ |

Ngoài phạm vi, giữ nguyên: lệnh chốt và lệnh bỏ của chế độ xử lý xung đột, nút mở lại bản ghi đẩy lỗi.

## Việc cần làm

- [ ] Viết lại tài liệu trước khi code: 09/02 Phần 3 và Phần 8, 09/04 "Một fingerprint duy nhất" và "Luật ghi ở chiều lấy về", 09/05 Phần 9, câu liên quan ở 09/01. Trình chủ dự án duyệt trước khi code.
- [ ] [Tự động] Danh sách đọc chi tiết của lượt theo mã FBM, cắt mảnh trong DocumentProperties; mở lượt và kết thúc lượt đều xóa; mỗi khách tối đa một lần mỗi lượt. Test: lượt hỏng giữa chừng thì lượt sau không còn mã nào của lượt cũ.
- [ ] [Tự động] Danh sách khách toàn bộ chỉ đánh dấu, không ghi Sheet. Test: lượt chỉ có trang danh sách khách thì số lần qua cửa ghi bằng 0 cho tới khi cửa đọc chi tiết chạy.
- [ ] [Tự động] Cửa đọc chi tiết: một request khách lọc theo lô `stt_rec_kh` cộng một request giao dịch mỗi khách; ghi khách trước giao dịch. Test: khách trong lô mà FBM không trả về bị gắn cờ "không thấy bên FBM"; khách mới được tạo dòng.
- [ ] [Tự động] Lớp 1 chỉ đánh dấu khách cha và đưa giao dịch vắng sang hỏi chủ; bỏ đọc lại theo id. Test: lớp 1 thấy giao dịch sửa thì không ghi Sheet ở bước lớp 1, ghi ở lần đọc chi tiết.
- [ ] [Tự động] Hỏi chủ giao dịch gom nhiều id một request, id phải toàn chữ số. Test: giao dịch chuyển từ khách A sang khách B được nối sang B, không tạo dòng trùng, không gắn cờ vắng cho A; lô hỏi chủ có khách đọc lỗi thì không gắn cờ giao dịch nào; request hỏi chủ lỗi thì không gắn cờ và báo Sidebar, Log.
- [ ] [Tự động] Khách cha của giao dịch nối theo `stt_rec_kh`, không qua `ma_kh`.
- [ ] [Tự động] Vòng xoay đi qua cửa đọc chi tiết; cursor tiến sau khi ghi xong lô.
- [ ] [Cần kiểm chứng thật] Gom nhiều id trong một request hỏi chủ trả đúng tập khách (chủ dự án chạy đoạn thử B5 trên DevTools).
- [ ] `node tests/run.js` đạt; đẩy GAS DEV; chủ dự án nghiệm thu trên Sheet DEV; đổi tên tệp sang `[Đã xử lý]`.
