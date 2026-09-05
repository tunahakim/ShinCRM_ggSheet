# Câu hỏi đêm

Nơi ghi những chỗ tài liệu không nói rõ mà phiên code gặp phải lúc chủ dự án không có mặt. Luật xử lý là **Phương án A**: ghi câu hỏi vào đây, chọn cách an toàn nhất để đi tiếp, ghi rõ đã chọn gì. Chủ dự án đọc rồi trả lời; câu nào trả lời xong thì xóa hẳn khỏi đây và mang câu trả lời vào tài liệu thiết kế hoặc code.

## 1. Ba hành vi bàn phím của biểu mẫu — tài liệu 03 chưa nói tới

Tài liệu 00 Phần 175 tự chỉ ra chỗ thiếu này và bảo phải hỏi: `Enter` đi tiếp ô sau, `Tab` chọn mục trong danh sách gợi ý chứ không nhảy ô, và dán một cục văn bản thì tự điền nhiều ô.

Vướng ở chỗ: `SLOTS` và `ACTIONS` của tài liệu 04 nói về việc bấm chuột vào một chỗ có tên, chứ không có khái niệm "phím nào đang được bấm ở ô nào". Nhận ba hành vi này nghĩa là thêm một đường thứ tư vào bộ máy render, mà tài liệu 04 chốt cứng là chỉ có ba đường.

**Đang tạm chọn:** chặng 1.3 dựng biểu mẫu với hành vi bàn phím mặc định của trình duyệt — `Tab` nhảy ô, `Enter` không làm gì. Không tự thêm đường thứ tư vào bộ máy render. Ba hành vi trên để dành thành một việc riêng sau khi biểu mẫu đã chạy, vì sửa hành vi bàn phím trên biểu mẫu đã có thì dễ, còn dựng sai kiến trúc rồi tháo ra thì đắt.

**Câu hỏi cho chủ dự án:** ba hành vi này là "có thì tốt" hay "không có thì không dùng được"? Nếu là loại thứ hai thì nói sớm, vì nó đổi cách dựng `client/ui/actions`.

## 2. Đuôi tệp phía client

Đã ghi ở `Mục tiêu chặng 1.1 và 1.2.md`, mục "Đuôi tệp phía client". Cần một câu đồng ý để sửa tài liệu 04 Phần 10.

**Đang tạm chọn:** dùng `.html`, vì `.js` đã thử và không chạy được trên Apps Script.
