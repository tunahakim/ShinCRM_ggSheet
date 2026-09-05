# Câu hỏi đêm

Nơi ghi những chỗ tài liệu không nói rõ mà phiên code gặp phải lúc chủ dự án không có mặt. Luật xử lý là **Phương án A**: ghi câu hỏi vào đây, chọn cách an toàn nhất để đi tiếp, ghi rõ đã chọn gì. Chủ dự án đọc rồi trả lời; câu nào trả lời xong thì xóa hẳn khỏi đây và mang câu trả lời vào tài liệu thiết kế hoặc code.

## 1. Khung hình đầu tiên mất 7,6 giây, không phải 4 giây như tôi báo trước đó

Con số 3,5–4,2 giây tôi đưa hôm trước chỉ là phần máy chủ. Đo đủ cả hai đầu ngày 05/09/2026: **7.587 ms** tới lúc sidebar vẽ xong và tra cứu chạy được — máy chủ 4.892 ms cộng tiền đi đường 2.649 ms cho khối 680 KB.

`CHUNK_ROWS` không nằm trên đường này, nên vặn cỡ gói không làm nó nhanh hơn một phần nghìn giây. Trình tự là: `loadCore` trả về khách và danh mục → sidebar vẽ xong → gói giao dịch mới bắt đầu chạy nền.

Muốn nhanh hơn thì phải cắt vào chính 680 KB đó. Ba đường có thật:

- Bỏ cột không cần cho việc tra cứu ra khỏi gói `loadCore`, nạp nốt sau. Rẻ nhất nhưng phải biết màn hình dùng cột nào, tức phải xong chặng 1.3 mới nói được.
- Nạp khách cũng theo gói. Đổi lại là một khoảng thời gian mà tra cứu chỉ thấy một phần khách — tài liệu 05 cấm điều đó với `activity`, còn với `customer` thì chưa nói.
- Không làm gì.

**Đang chọn: không làm gì**, nhưng con số 7,6 giây đáng để chủ dự án nói lại. Bốn giây một lần mở sidebar thì không ai để ý; gần tám giây thì có. Nếu thấy chậm thì đường thứ nhất là đường nên đi, và nó phải chờ chặng 1.3 xong.
