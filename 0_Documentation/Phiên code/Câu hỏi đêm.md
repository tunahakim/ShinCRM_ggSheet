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

## 2. Bộ máy render — năm chỗ tài liệu 04 không nói rõ

Năm chỗ gặp khi dựng `client/ui/renderEngine.html` ngày 05/09/2026. Cả năm đã chọn cách an toàn và code đang chạy theo cách đã chọn; ghi ra đây để chủ dự án xem lại chứ không phải để chờ.

### 2.1. Menu sổ xuống và phép đo thu gọn để ở tệp khác, không nhồi vào engine

Tài liệu 04 xếp cả bốn việc — dựng chuỗi, mở menu (Phần 4B), đo chiều cao để quyết có thu gọn hay không (Phần 5), vẽ lại một vùng (Phần 6) — vào cùng một mục "bộ máy render", nên đọc thẳng thì thành một tệp làm bốn việc.

**Đang chọn: engine giữ đúng bốn việc thuần chuỗi** (thoát ký tự, dịch `spatialConfig`, dựng chuỗi đệ quy, `renderTarget`), còn menu và phép đo sang `client/ui/menu.html` và `client/ui/collapse.html` — hai tệp chưa dựng. Lý do: hai việc kia phải chạm DOM và phải chạy *sau* khi chuỗi đã gán, còn nửa dựng chuỗi thì không chạm DOM nên bộ kiểm offline gọi được hàm thật. Engine để lại đúng hai đường nối: `data-menu="<khóa>"` với mảng mục menu gửi kèm trong `RENDER_INDEX.menus`, và `data-collapse="<số dòng>"` trên phần tử bị chặn chiều cao. Không có JSON nào nằm trong thuộc tính HTML.

### 2.2. Hình dạng bối cảnh render là hợp đồng riêng của engine

Tài liệu không nói engine lấy giá trị của một trường từ đâu. **Đang chọn: `{entity, records, screen}` truyền vào từ ngoài**, không đọc `Store`. Hai lý do: bản nháp trong `formStack` không bao giờ vào `Store` nên đọc `Store` sẽ vẽ ra số cũ; và một bản ghi truyền vào giữ được engine kiểm được offline.

### 2.3. `overflow: "collapse"` đi cùng `maxHeight` thì `maxHeight` thắng

Hai tham số cùng nói về chiều cao lúc thu gọn mà tài liệu không nói cái nào thắng. **Đang chọn: `maxHeight` là trần thu gọn, `collapsedLines` chỉ là phương án dự bị khi không khai trần** (mặc định 3 dòng, tính bằng `calc(N * var(--shin-line-height))`). Đọc thế thì thẻ ghi chú ở màn `view` chạy đúng như dòng schema của nó viết.

### 2.4. `infoBar: true` nghĩa là vẽ slot `infoBarContent`

Tài liệu khai `infoBar` là cờ bật/tắt mà không nói vùng đó lấy nội dung ở đâu. **Đang chọn: bật thì engine gọi slot tên `infoBarContent` trong `SLOTS`**, tắt thì vùng 3 mang `hidden`.

### 2.5. Ô chỉ đọc mang thêm `data-readonly="1"`

Chỉ-đọc hiện ra ba dạng khác nhau trong HTML: `<input readonly>`, `<textarea readonly>`, và `<span class="shin-badge">` không phải ô nhập. Bộ thu thập lúc lưu mà phải nhận cả ba dạng thì thành ba luật. **Đang chọn: mọi ô chỉ đọc mang thêm `data-readonly="1"`** để bộ thu thập chỉ cần một luật. Ô nào cũng mang `data-field` đủ đường dẫn, kể cả ô chỉ đọc — lọc bằng `data-readonly`, không lọc bằng việc có hay không có `data-field`.
