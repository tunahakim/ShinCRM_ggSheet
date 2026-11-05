# Câu hỏi đêm

ĐẶC BIỆT QUAN TRỌNG: ĐÂY KHÔNG PHẢI TÀI LIỆU LƯU TRỮ LÂU DÀI, CÁI GÌ XỬ LÝ ĐƯỢC RỒI THÌ XÓA ĐI NGAY, XÓA HẲN, KHÔNG DẤU VẾT. KHÔNG ĐƯỢC ĐỂ FILE NÀY PHÌNH TO

Nơi ghi những chỗ tài liệu không nói rõ mà phiên code gặp phải lúc chủ dự án không có mặt. Luật xử lý là **Phương án A**: ghi câu hỏi vào đây, chọn cách an toàn nhất để đi tiếp, ghi rõ đã chọn gì. Chủ dự án đọc rồi trả lời; câu nào trả lời xong thì xóa hẳn khỏi đây và mang câu trả lời vào tài liệu thiết kế hoặc code.

Cách viết một mục: một đầu đề ngắn, rồi tối đa vài câu.

## Đang mở

### Thu hẹp bảng khóa Block: `elements` và `label` không còn là khóa chung

Phép kiểm mới `tests/cases/blockKeys.js` bắt được bốn cặp vai–khóa mà bản khai nhận rồi bỏ đi: `label` trên `box`, `card`, `row`, `text`. Tự quyết: dời `elements` xuống ba vai chứa con và `label` xuống bốn vai có chữ, nên `Card({ label: 'GHI CHÚ' })` từ nay hét lên và chỉ dẫn sang `title`. Không dòng khai nào trong code hiện tại bị ảnh hưởng. Đã thêm một câu về luật phạm vi vào tài liệu 04 Phần 4.

### Máy chạy nền (B6): các lựa chọn tạm

Tự quyết khi làm B6, chủ dự án xem lại: (1) tắt công tắc tổng hoặc lịch nền thì mọi máy tắt chuông, bật lại thì Sidebar đánh thức máy đang mở; (2) chưa giao máy nào thì không máy nào tự nhận, kể cả khi bật "Tự nhận máy nền"; (3) người dùng dừng lượt nền thì kết quả tiến trình ghi là bỏ (`dropped`), không tính lỗi để dời giờ thử lại; (4) Giữ phiên tốn hai request mỗi lần (dò phiên rồi đếm khách); (6) Sidebar mở gửi cấu hình relay không đổi thì Extension chỉ đặt lại chuông, không hỏi GAS (cấu hình mới mới hỏi); (7) Sidebar ở máy không chở lượt hỏi GAS mỗi 60 giây (dùng lại `FBM_SYNC_RUN_SILENCE_MS`); (8) máy chưa cài Extension chỉ báo trong card máy nền, không ghi Log vì không phải lỗi.
