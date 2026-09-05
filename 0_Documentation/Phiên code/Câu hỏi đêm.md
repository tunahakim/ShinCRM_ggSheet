# Câu hỏi đêm

Nơi ghi những chỗ tài liệu không nói rõ mà phiên code gặp phải lúc chủ dự án không có mặt. Luật xử lý là **Phương án A**: ghi câu hỏi vào đây, chọn cách an toàn nhất để đi tiếp, ghi rõ đã chọn gì. Chủ dự án đọc rồi trả lời; câu nào trả lời xong thì xóa hẳn khỏi đây và mang câu trả lời vào tài liệu thiết kế hoặc code.

## 1. Con số `CHUNK_ROWS` — chủ dự án trả lời bằng **ô**, mà hằng này đếm **hàng**

Chủ dự án chốt: "5.000 ô hoặc 10.000 ô đi, hoặc để lát nữa đo, bạn thử tạo dữ liệu giả để test xem gas xử lý và trả về có chênh lệch nhiều không, lệch nhiều thì để chunk nhỏ, còn lệch ít thì cứ để 5.000 ô - 10.000 ô."

**Chỗ lệch đơn vị cần chủ dự án biết trước khi đổi số.** `CHUNK_ROWS` đếm **hàng**, không đếm ô. Sheet `Activity` có 13 cột, nên con số 1.000 đang dùng tương đương **13.000 ô** một gói — tức là con số chủ dự án đưa ra (5.000–10.000 ô) **nhỏ hơn** mức đang chạy, không phải lớn hơn. Quy đổi: 5.000 ô ≈ 385 hàng, 10.000 ô ≈ 770 hàng.

Nên đây là hai câu khác nhau, và câu trả lời chỉ khớp một câu:

- Nếu ý là "đừng để gói to quá, cỡ 5.000–10.000 ô là đủ" → hạ `CHUNK_ROWS` về khoảng 400–800.
- Nếu ý là "nới gói lên cho ít vòng gọi" → phải tăng chứ không giảm, và con số phải viết theo hàng.

**Đang tạm giữ 1.000 hàng** cho tới khi có số đo, vì hạ xuống làm tăng số vòng gọi mà chưa có bằng chứng là cần.

**Phép đo sẽ chạy** đúng như chủ dự án yêu cầu: sinh dữ liệu giả trên tệp Sheet **mới trắng** (không chạm tệp đang dùng thật), đo thời gian một vòng `loadActivityChunk` ở vài cỡ gói, rồi xóa dữ liệu giả. Nếu thời gian mỗi vòng gần như không đổi khi gói to lên thì phần lớn chi phí là tiền đi đường, và lúc đó gói to là có lợi.
