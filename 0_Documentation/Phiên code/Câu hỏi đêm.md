# Câu hỏi đêm

Nơi ghi những chỗ tài liệu không nói rõ mà phiên code gặp phải lúc chủ dự án không có mặt. Luật xử lý là **Phương án A**: ghi câu hỏi vào đây, chọn cách an toàn nhất để đi tiếp, ghi rõ đã chọn gì. Chủ dự án đọc rồi trả lời; câu nào trả lời xong thì xóa hẳn khỏi đây và mang câu trả lời vào tài liệu thiết kế hoặc code.

## 1. Phép đo ngân sách ô dựng sớm hơn tài liệu 00 xếp

Tài liệu 00 ghi rõ ở dòng của chặng 1.2: "Việc đo ngân sách ô không thuộc chặng này", và xếp nó vào Giai đoạn 3 ngay sau lượt nạp lần đầu từ FBM.

Phiên code đã làm lệch: dựng `server/sheet/CellBudget.js` và cắm phép đo vào đầu `loadCore`, vượt trần thì trả về `blocked` kèm bảng thủ phạm chứ không đọc dữ liệu tiếp.

Lý do chọn làm sớm: đường nạp cần một chỗ để dừng tử tế khi tệp đã quá ì. Không có nó thì lượt nạp trong một tệp quá lớn sẽ chết ở giữa đường, và người dùng thấy sidebar treo chứ không thấy nguyên nhân. Phép đo chỉ hỏi kích thước lưới, không đọc ô nào, nên nó gần như miễn phí — 21 phép kiểm trong `tests/cases/cellBudget.js` chứng minh cả điều đó.

**Câu hỏi cho chủ dự án:** giữ cái thước này ở chặng 1.2, hay tháo ra để đúng thứ tự tài liệu 00? Tháo thì mất khoảng 30 phút, không ảnh hưởng gì khác. Việc **đo trên khối lượng thật** thì vẫn nằm ở Giai đoạn 3 dù chọn đường nào.

## 2. Tên tham số `TRAN_SO_O` trong sheet `Config`

Trần số ô đọc từ khối tham số hệ thống của sheet `Config`. Tài liệu không đặt tên cho tham số này, nên phiên code tự chọn `TRAN_SO_O`, mặc định 500.000 ô khi chưa ai gõ.

**Câu hỏi:** giữ tên này hay đổi? Đổi bây giờ chỉ là sửa một chuỗi ở một chỗ, để lâu thì nó đã nằm trong sheet thật và trong tài liệu.

## 3. Con số `CHUNK_ROWS` — 1.000 hàng mỗi gói

Tài liệu 05 Phần 4 chỉ định tên hằng này mà không cho con số. Phiên code chọn tạm 1.000: một gói là một lệnh `getValues` đọc 1.000 hàng × 13 cột = 13.000 ô, thừa an toàn so với hạn mức của Apps Script; vài chục nghìn giao dịch thì cả lượt nạp nền tốn vài chục vòng gọi.

Vặn hai hướng đều có giá: gói lớn hơn thì ít vòng gọi hơn nhưng mỗi vòng tiến gần trần sáu phút; gói nhỏ hơn thì mỗi vòng nhẹ nhưng số vòng nhân lên, mà phần lớn thời gian một vòng là tiền đi đường chứ không phải tiền đọc ô.

**Câu hỏi:** để 1.000, hay chờ đo trên dữ liệu thật ở Giai đoạn 3 rồi chốt? Phép kiểm trong `tests/cases/settings.js` đang ghim con số này, nên đổi nó là đổi có chủ ý chứ không trôi dần.

## 4. `Sidebar.html` nằm trong `client/`, không nằm ở gốc

Tài liệu 04 Phần 10 ghi tệp này là `Sidebar.html`, tức ở gốc dự án. Phiên code đặt nó ở `client/Sidebar.html` cho khớp nguyên tắc "code client nằm trong `client/`", và vì tên tệp trên Google là cả đường dẫn nên nó thành `client/Sidebar` — đường dẫn này đã ghi trong `Menu.js`.

**Đang tạm chọn:** giữ trong `client/`. Đổi về gốc thì sửa hai chỗ: một dòng trong `Menu.js` và cột tên tệp ở tài liệu 04 Phần 10.

## 5. Tệp `styles.html` bị chẻ thành bốn tệp

Tài liệu 04 Phần 10 ghi một tệp `client/ui/styles.html` cho toàn bộ CSS. Phiên code chẻ thành `tokens.html` (biến CSS), `frame.html` (bố cục năm vùng), `progress.html` (dải tiến trình), `statusScreen.html` (ba màn không có form).

Lý do: một biến màu đổi thì cả giao diện đổi theo, còn bố cục năm vùng thì gần như không bao giờ đổi — hai thứ có tần suất sửa khác nhau thì để hai tệp. Tài liệu 04 Phần 10 đã sửa theo cách chẻ này.

**Câu hỏi:** đồng ý cách chẻ này không? Nếu thấy vụn quá thì gộp lại được, nhưng nên quyết trước khi chặng 1.3 thêm tệp style của form vào.

## 6. Nhánh git chưa đẩy lên GitHub

Nhánh `2026.08.26-Clade-code-tiep-tuc` đang đi trước `origin/main` khá nhiều commit và **chưa đẩy lên** lần nào. Phiên code không tự đẩy vì đẩy là việc ra ngoài máy.

**Câu hỏi:** đẩy nhánh này lên GitHub chưa? Chưa đẩy thì toàn bộ code chỉ nằm trên một ổ đĩa.
