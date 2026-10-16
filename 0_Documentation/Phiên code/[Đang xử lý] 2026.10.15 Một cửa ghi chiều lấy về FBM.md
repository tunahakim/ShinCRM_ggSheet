# Một cửa ghi chiều lấy về FBM

Làm sau khi `[Đã xử lý] 2026.10.15 Chuỗi đồng bộ nền và vòng xoay giao dịch.md` đã xong và gộp vào `main`: phiên này dựa trên bước đếm khách, chuỗi và cursor của phiên đó. Làm sau phiên `[Đã xử lý] 2026.10.16 Luật chung nạp lại RAM và vẽ lại view.md` (chủ dự án đồng ý thứ tự 2026-10-16) để lúc nghiệm thu Sheet đã cập nhật theo lô đúng luật mới.

## Quyết định của chủ dự án

- 2026-10-15: mô hình "một bên phát hiện, một bên đọc chi tiết rồi mới sửa"; một cửa ghi duy nhất là đọc chi tiết khách theo lô `BUDGET.activityBatchCustomers`; chấp nhận tốn thêm request, không đặt trần số khách.
- 2026-10-16: danh sách khách cần đọc chi tiết chỉ sống trong một lượt, đánh theo mã FBM `stt_rec_kh` (khách mới chưa có số CUS); lượt sau xóa hết của lượt trước; chỉ cursor Vòng xoay giữ qua lượt. Bỏ ý cũ "không bị xóa khi mở lượt mới".
- 2026-10-16: Vòng xoay giữ đi theo khách trên Sheet; cursor chỉ tiến sau khi lô đã đọc chi tiết và ghi xong.
- 2026-10-16: không có ngoại lệ ghi: mọi lần ghi ở chiều lấy về, kể cả cờ, do cửa ghi làm ở bước ghi của lô; tốn thêm request còn hơn thêm đường ghi.
- 2026-10-16: danh sách đọc gồm hai danh sách sau một cổng: theo ShinCRM (dãy bit theo số CUS) và theo FBM (JSON `stt_rec_kh`, cho khách chưa có trên Sheet).
- 2026-10-16: bước "Tra mã khách không lọc quyền" nằm trong cửa ghi, mỗi request một mã, chỉ trả ra `stt_rec_kh`: hỏi chủ giao dịch vắng (lọc `sysevents` theo id) và kiểm tra khách vắng còn tồn tại. Chủ dự án đã thử hỏi chủ trên FBM thật với `ALT00010`: id thật trả đúng một khách, id không có trả rỗng.
- 2026-10-16: trạng thái mới "đã chuyển cho người khác" dùng chung cho khách và giao dịch; giữ nội dung, đóng băng chiều đẩy, vẫn được xét lại khi khách đọc lại.
- 2026-10-16: giao dịch đổi khách cha thì nối sang khách mới theo `stt_rec_kh` của khách được đọc, không qua `ma_kh`, và đưa khách cha cũ vào danh sách đọc của lượt.
- 2026-10-16: request đọc khách thiếu mã người dùng thì không dựng; chỉ hàm "Tra mã khách không lọc quyền" được bỏ điều kiện quyền.
- 2026-10-16: không cần đo số request trước và sau.
- Chế độ `Kiểm tra` chạy cùng đường nhưng cửa ghi chỉ xem trước, không ghi Sheet.

## Các đường đang ghi thẳng vào Sheet ở chiều lấy về (trước thay đổi)

| Đường | Ghi gì | Chỗ thay thế |
|---|---|---|
| Trang danh sách khách | Thông tin khách mới, khách sửa | Chỉ đánh dấu khách mới, sửa, vắng, lệch giao dịch cuối vào danh sách đọc chi tiết |
| Lô đọc giao dịch theo khách (lớp 2, 3, Vòng xoay, Quét toàn bộ) | Giao dịch mới, sửa | Thành cửa ghi duy nhất, thêm request đọc thông tin khách của lô |
| Lấy toàn bộ giao dịch và đọc lại theo id khi chia khoảng | Giao dịch đã biết bị sửa, khách cha theo Sheet | Chỉ đánh dấu khách cha theo Sheet, cả giao dịch sửa lẫn vắng; bỏ đọc lại theo id |
| Gắn cờ "không thấy" sau danh sách khách và sau lớp 1 | Cờ khách, cờ giao dịch | Mọi cờ ở bước ghi của cửa ghi, sau bước tra mã khách không lọc quyền |

Ngoài phạm vi, giữ nguyên: lệnh chốt và lệnh bỏ của chế độ xử lý xung đột, nút mở lại bản ghi đẩy lỗi.

## Việc cần làm

- [ ] Viết lại tài liệu trước khi code: 09/02 Phần 8, 09/04 Phần 6 và "Luật ghi ở chiều lấy về", 09/05 Phần 9 và Phần 10, câu liên quan ở 09/01 và 09/08, chương 16 Nghiên cứu FBM. Trình chủ dự án duyệt trước khi code.
- [ ] [Tự động] Danh sách đọc của lượt: cổng duy nhất nhận `stt_rec_kh`, khách có CUS vào dãy bit, khách chưa có vào danh sách FBM; dãy bit "đã đọc trong lượt" và ghi chú "giao dịch chờ nối" cùng sống trong lượt; mở lượt và kết thúc lượt đều xóa; mỗi khách tối đa một lần mỗi lượt. Test: lượt hỏng giữa chừng thì lượt sau không còn mã, ghi chú nào của lượt cũ; khách tạo dòng giữa lượt không bị coi là đã đánh dấu; khách đã đọc thêm lại thì danh sách không đổi.
- [ ] [Tự động] Danh sách toàn bộ khách chỉ đánh dấu, không ghi Sheet. Test: lượt chỉ có trang danh sách khách thì số lần qua cửa ghi bằng 0 cho tới khi cửa đọc chi tiết chạy.
- [ ] [Tự động] Lớp 1 chỉ đánh dấu khách cha theo Sheet cho giao dịch sửa và giao dịch vắng; bỏ đọc lại theo id. Test: lớp 1 thấy giao dịch sửa hoặc vắng thì không ghi Sheet, không gửi request tra mã, chỉ thêm khách cha vào danh sách.
- [ ] [Tự động] Cửa ghi bốn bước đọc, đối chiếu, tra mã, ghi; một lần ghi cho cả lô, khách trước giao dịch. Test: khách mới trong danh sách FBM được tạo dòng cùng giao dịch; không có lần ghi Sheet nào trước bước ghi của lô.
- [ ] [Tự động] Request đọc khách thiếu mã người dùng thì không dựng. Test: mã người dùng rỗng thì không có request nào gửi lên Extension, Sidebar và Log báo "thiếu mã người dùng FBM".
- [ ] [Tự động] "Tra mã khách không lọc quyền" là hàm dựng riêng; bộ đọc kết quả chỉ trả `stt_rec_kh`; id không toàn chữ số hoặc `stt_rec_kh` sai định dạng thì không dựng. Test: response có `ten_kh` thì kết quả không chứa `ten_kh`; id `1' or '1` không sinh request.
- [ ] [Tự động] Khách vắng ở cửa ghi theo bảng 09/05 Phần 9 "Vắng mặt và chuyển quyền". Test: kiểm tra tồn tại ra khách thì khách và mọi giao dịch của khách mang "đã chuyển cho người khác"; ra rỗng thì "không thấy bên FBM"; request lỗi thì không gắn cờ, Sidebar và Log báo.
- [ ] [Tự động] Giao dịch vắng và đổi khách cha theo bảng 09/05 Phần 9. Test: ba thứ tự đọc A trước, B trước, cùng lô đều ra X nối sang B, cùng số `ACT-…`, "đã đồng bộ", không dòng trùng, A vào danh sách đọc; B ngoài quyền thì X mang "đã chuyển cho người khác" và giữ dưới A; hỏi chủ ra A hoặc ra B đã đọc mà không có X thì không ghi và Log `activity_owner_mismatch`; lượt hỏng trước lô chứa B thì X giữ trạng thái cũ.
- [ ] [Tự động] Khách cha của giao dịch nối theo `stt_rec_kh`, không qua `ma_kh`.
- [ ] [Tự động] Trạng thái "đã chuyển cho người khác" có trong tập `@CUS_SYNC_TT`, `@ACT_SYNC_TT` và ô kết quả Sidebar. Test: Schema từ chối giá trị ngoài 12 giá trị của 09/05 Phần 10.
- [ ] [Tự động] Đóng băng chiều đẩy cho bản ghi mang "không thấy bên FBM" hoặc "đã chuyển cho người khác", và giao dịch của khách mang hai trạng thái đó (code hiện vẫn đẩy bản ghi "không thấy bên FBM" khi bị sửa). Test: sửa nội dung bản ghi mang một trong hai trạng thái thì không vào danh sách đẩy, preflight báo lý do.
- [ ] [Tự động] Hai trạng thái trên được xét lại khi khách đọc lại. Test: khách mang "đã chuyển cho người khác" mà lần đọc có quyền trả về thì trở lại "đã đồng bộ".
- [ ] [Tự động] Vòng xoay đi qua cửa đọc chi tiết; cursor tiến sau khi ghi xong lô.
- [ ] [Cần kiểm chứng thật] Kiểm tra khách còn tồn tại theo `stt_rec_kh`, không kèm điều kiện quyền, với `A000050753` trả một dòng và mã không có thật trả rỗng (chủ dự án chạy trên DevTools, chỉ đọc).
- [ ] [Cần kiểm chứng thật] Request không kèm điều kiện quyền có trả khách đang thuộc quyền tài khoản khác không (chương 16 mục 16.7). Đụng khách ngoài `ALT00010` nên chỉ chạy khi chủ dự án quyết; chưa kiểm thì ca chuyển cho người khác rơi về "không thấy bên FBM", an toàn.
- [ ] `node tests/run.js` đạt; đẩy GAS DEV; chủ dự án nghiệm thu trên Sheet DEV; đổi tên tệp sang `[Đã xử lý]`.
