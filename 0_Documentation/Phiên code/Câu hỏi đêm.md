# Câu hỏi đêm

Nơi ghi những chỗ tài liệu không nói rõ mà phiên code gặp phải lúc chủ dự án không có mặt. Luật xử lý là **Phương án A**: ghi câu hỏi vào đây, chọn cách an toàn nhất để đi tiếp, ghi rõ đã chọn gì. Chủ dự án đọc rồi trả lời; câu nào trả lời xong thì xóa hẳn khỏi đây và mang câu trả lời vào tài liệu thiết kế hoặc code.

## 1. `CHUNK_ROWS` — điều kiện trong câu trả lời của chủ dự án đã đo ra là sai

Chủ dự án trả lời: *"Nếu load 10000 dòng cũng như 1000 dòng thì để 10000 dòng cũng được, có cơ chế fallback xuống 2000 dòng nếu load 10000 dòng lỗi"*. Câu này có một chữ **nếu**, và phép đo lại trên dữ liệu giả có thật cho thấy chữ nếu đó không thành: 10.000 hàng **không** bằng 1.000 hàng, nó chậm hơn cả hai.

Phép đo cũ chạy trên sheet rỗng, tự ghi hàng giả rồi tự xóa ngay, và kết luận "lệch rất ít" của nó là **sai**. Hàng giả lúc ấy nội dung ngắn, và cả tệp chỉ có sheet `Activity` có dữ liệu. Phép đo bây giờ đọc 1.700 khách và 10.000 giao dịch đang nằm thật trên sheet, mọi ô đều có dữ liệu, và không ghi một ô nào.

| Cỡ gói | Lượt 1 | Lượt 2 | So với 2.000 |
|---|---|---|---|
| 1.000 | 21,4 s | 48,0 s | chậm hơn 32–41 phần trăm |
| 2.000 | **16,2 s** | **34,0 s** | nhanh nhất cả hai lượt |
| 5.000 | 19,9 s | 39,2 s | chậm hơn 15–23 phần trăm |
| 10.000 | 27,0 s | 51,0 s | chậm hơn 50–66 phần trăm |

Hai lượt cách nhau ít phút. Con số tuyệt đối lượt sau chậm gấp đôi lượt trước — Google không hứa gì về tốc độ, và đó là lý do chỉ đọc **hình dáng** trong cùng một lượt. Hình dáng thì giống nhau ở cả hai lượt: đường cong hình chữ U, đáy ở 2.000.

Hai đầu đắt vì hai lý do khác nhau. Gói nhỏ trả tiền cho số vòng gọi. Gói lớn trả tiền cho việc Google phải dựng một khối kết quả 2,2 MB trong một lượt, và chi phí đó không tăng theo đường thẳng.

**Đã làm: đặt 2.000, và vẫn dựng đường lùi như chủ dự án yêu cầu** — bậc thang 2.000 → 500 → 200. Gói nào thất bại thì gọi lại **đúng con trỏ đó** với cỡ nhỏ hơn, hết bậc mới ném lỗi. Đường lùi vẫn cần dù 2.000 đã đo là an toàn, vì phép đo nói lên chi phí trung bình còn thứ giết một lượt nạp là ca xấu nhất: một giao dịch có ô ghi chú vài nghìn chữ làm gói chứa nó nặng gấp nhiều lần gói thường.

**Cần chủ dự án xác nhận:** giữ 2.000, hay vẫn muốn 10.000 dù đo được là chậm hơn. Đổi thì sửa `SETTINGS.CHUNK_ROWS` ở `server/config/Settings.js` và con số ghim ở `tests/cases/settings.js`. Đọc mục 3 trước khi quyết — phép đo trên chỉ tính phần máy chủ, và phần còn lại có thể xóa gần hết khoảng cách giữa hai lựa chọn.

## 2. Câu hỏi "chọn thế nào thì hiển thị lên sidebar nhanh nhất" — cỡ gói không phải câu trả lời

`CHUNK_ROWS` **không** nằm trên đường vẽ khung hình đầu tiên. Trình tự khởi động là: `loadCore` trả về khách và danh mục → sidebar vẽ xong và tra cứu chạy được → gói giao dịch mới bắt đầu chạy nền. Đổi cỡ gói không làm khung hình đầu tiên tới sớm hơn một phần nghìn giây; nó chỉ đổi tổng thời gian nạp nền và độ mịn của dải tiến trình.

Đo được trên tệp DEV với dữ liệu giả đầy đủ:

- **Tới khung hình đầu tiên: 3,5–4,2 giây.** Payload 680 KB, gồm 1.700 khách, 9 danh mục, bảng khai, bảng tra hàng.
- **Nạp nền xong hết: khoảng 27 giây** cho 10.000 giao dịch, 5 gói.

Muốn khung hình đầu tiên nhanh hơn thì phải cắt vào chính 680 KB đó, không phải vặn cỡ gói. Ba đường có thật, chưa làm, chưa hỏi:

- Bỏ cột không cần cho việc tra cứu ra khỏi gói `loadCore`, nạp nốt sau. Rẻ nhất nhưng phải biết màn hình dùng cột nào, tức phải xong chặng 1.3 mới nói được.
- Nạp khách cũng theo gói. Đổi lại là một khoảng thời gian mà tra cứu chỉ thấy một phần khách — tài liệu 05 cấm điều đó với `activity`, còn với `customer` thì chưa nói.
- Không làm gì. 4 giây một lần mở sidebar cho 1.700 khách là con số dùng được.

**Đang chọn: không làm gì**, và ghi lại ở đây để chủ dự án biết có ba đường.

## 3. Cột thời gian trong sheet `Log` đọc ra một nửa sự thật — đã dựng đồng hồ đủ, còn chờ một lượt mở sidebar

Chủ dự án chờ 30 giây tới 1 phút, sheet `Log` ghi 3–4 giây. Không con số nào trong đó sai, nhưng cả bảng nói sai chuyện: `loadCore.ms` là thời gian tính toán bên trong **một** lời gọi, `msGoiCuoi` là gói **cuối** trong năm gói. Cả hai đều không thấy tiền đi đường của `google.script.run`, không thấy trình duyệt bung khối 680 KB, và không cộng sáu vòng lại thành một con số.

Thời gian thật vẫn nằm trong bảng log cũ, ở cột `Lúc`: khoảng cách giữa dòng `loadCore` và dòng `loadActivityChunk` của cùng lượt là 22, 29, 44 và 33 giây. Cộng thêm phần `loadCore` tự báo thì cả lượt là 26 đến 74 giây — đúng khoảng chủ dự án cảm nhận.

Máy chủ không đo được phần còn lại, vì chỉ trình duyệt thấy được cả hai đầu một vòng gọi. Nay sidebar tự đo và ghi một dòng `sidebarBoot` gồm năm con số: tổng, tới khung hình đầu tiên, máy chủ tính toán, tiền đi đường, trình duyệt bung và vẽ. Ba con số sau cộng lại bằng tổng.

**Cần chủ dự án mở sidebar một lượt** rồi gửi lại dòng `sidebarBoot`. Con số `msDiDuongMoiVong` trong đó là thứ chốt được mục 1. Ước lượng thô từ bốn dòng log cũ là 2–3 giây mỗi vòng, và nếu đúng khoảng đó thì phép cộng ra thế này:

| | Vòng gọi | Máy chủ tính toán | Tiền đi đường ước tính | Cộng |
|---|---|---|---|---|
| Gói 2.000 | 6 | 16,2 s | 12–18 s | 28–34 s |
| Gói 10.000 | 2 | 27,0 s | 4–6 s | 31–33 s |

Tức hai bên gần bằng nhau, không phải "2.000 nhanh hơn 50 phần trăm" như phép đo phía máy chủ một mình nói. Phần thắng 10,8 giây của gói 2.000 gần như bị bốn vòng gọi thêm ăn hết. Đây là lý do con số 2.000 vẫn là chốt tạm: nó không sai, nhưng nó cũng không hơn 10.000 đủ nhiều để đáng bỏ qua ca xấu nhất mà gói to gặp phải.
