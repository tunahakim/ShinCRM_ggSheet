# Câu hỏi đêm

Nơi ghi những chỗ tài liệu không nói rõ mà phiên code gặp phải lúc chủ dự án không có mặt. Luật xử lý là **Phương án A**: ghi câu hỏi vào đây, chọn cách an toàn nhất để đi tiếp, ghi rõ đã chọn gì. Chủ dự án đọc rồi trả lời; câu nào trả lời xong thì xóa hẳn khỏi đây và mang câu trả lời vào tài liệu thiết kế hoặc code.

## 1. Con số `CHUNK_ROWS` — đã đo xong, còn chờ chủ dự án chốt

Chủ dự án chốt luật: đo bằng dữ liệu giả, "lệch nhiều thì để chunk nhỏ, còn lệch ít thì cứ để 5.000 - 10.000", và đã đính chính đơn vị là **hàng**, không phải ô.

Phép đo là `server/dev/MeasureChunk.js`, chạy trên tệp Sheet đang dùng lúc sheet `Activity` còn rỗng: ghi 10.000 hàng giao dịch giả bằng một lệnh `setValues`, đọc hết ở từng cỡ gói đúng đường nạp thật (đi ngược từ hàng cuối lên), rồi xóa sạch hàng giả. Có chặn cứng ở đầu: sheet không rỗng thì ném lỗi và không ghi gì.

| Cỡ gói | Số vòng | Tổng ms | ms mỗi vòng | ms mỗi 1.000 hàng | KB mỗi gói |
|---|---|---|---|---|---|
| 1.000 | 10 | 12.433 | 1.243 | 1.243 | 190 |
| 5.000 | 2 | 13.148 | 6.574 | 1.315 | 952 |
| 10.000 | 1 | 11.610 | 11.610 | 1.161 | 1.902 |

**Kết quả: lệch rất ít.** Đọc cùng 10.000 hàng mất 11,6–13,1 giây bất kể chia thành 1 gói hay 10 gói. Tức là chi phí đọc ô gần như **toàn bộ tính theo hàng**, không có khoản tiền cố định đáng kể cho mỗi lệnh gọi. Lượt đo trước ở các cỡ 200/500/1.000/2.000 cho cùng hình dáng đó.

Một điều phép đo cũng cho thấy: con số tuyệt đối **không ổn định giữa hai lượt chạy**. Lượt trước đo được 3.300–4.500 ms mỗi 1.000 hàng, lượt này 1.200–1.300 ms, cùng một code và cùng một tệp. Nên thứ đáng tin ở đây là **hình dáng phẳng trong cùng một lượt**, không phải con số cụ thể.

**Vì "lệch ít" nên cỡ gói không mua được tốc độ.** Nó chỉ đổi ba thứ khác, và đây là chỗ cần chủ dự án quyết:

- **Số vòng qua cầu.** Mỗi vòng `google.script.run` có tiền đi đường riêng mà phép đo phía máy chủ không với tới được. Gói to thì ít vòng hơn, tiết kiệm được khoản đó.
- **Cỡ payload mỗi vòng.** Đây là chỗ đáng lo của con số 10.000: **1,9 MB một gói**. Cả chuỗi đó phải dựng ở phía Google, đi qua mạng, rồi bung ở trong trình duyệt, và bung xong thì trình duyệt giữ nguyên cả chuỗi trong bộ nhớ. Gói 5.000 hàng là 952 KB, cũng đã nặng. Gói 1.000 hàng là 190 KB.
- **Dải tiến trình.** Gói 10.000 hàng nghĩa là dải tiến trình nhảy một lần từ 0 lên 100 phần trăm — mất luôn lý do nó tồn tại.

**Đề nghị của phiên code: 2.000 hàng.** Nó cắt một nửa số vòng qua cầu so với 1.000, mà payload mỗi gói chỉ khoảng 380 KB, và với khối lượng thật thì dải tiến trình vẫn cập nhật nhiều lần. Lên 5.000 hay 10.000 chỉ tiết kiệm thêm vài vòng nữa mà phải đổi bằng payload cỡ 1–2 MB và bằng việc dải tiến trình hết tác dụng — trong khi phép đo cho thấy đổi như vậy **không nhanh hơn**.

**Đang giữ 1.000** cho tới khi chủ dự án chốt, vì đổi con số này là đổi có chủ ý và `tests/cases/settings.js` đang ghim nó.

**Phần chưa đo được và cần nói rõ:** tiền đi đường mỗi vòng, và thời gian trình duyệt bung một gói 1,9 MB. Cả hai nằm ở phía sidebar nên phải mở sidebar thật trên Google mới đo được, và lúc đó cần chủ dự án ngồi ở máy.
