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

## 3. Bảng khai bố cục và ba núm chọn — mười chỗ tự quyết

Mười chỗ gặp khi dựng `uiSchema`, `slots`, `screenState`, `prefs`, `fieldLogic` và `UserPrefs` hai ngày 05–06/09/2026. Cả mười đã chọn xong, code và bộ kiểm đang chạy theo cách đã chọn; ghi ra đây vì chúng là quyết định của tôi, không phải câu chữ có sẵn trong tài liệu.

### 3.1. Vai thứ tám `Check`, và `pick` thành khóa chung của Block

Tài liệu 03 Phần 8 đòi dòng lịch sử có ô đánh dấu để chọn nhiều dòng, còn tài liệu 04 Phần 4 chỉ khai sáu hàm dựng và không hàm nào vẽ được ô đánh dấu. **Đang chọn: thêm hàm dựng thứ bảy `Check` mang vai thứ tám, và thêm `pick` vào danh sách khóa dùng được ở mọi vai** — vì dòng nào do slot sinh ra cũng phải mang mã bản ghi của chính nó, không riêng ô đánh dấu. `Check` **không** mang `data-field`, nên bộ thu thập lúc lưu không bao giờ thấy nó. Tài liệu 04 Phần 4 và Phần 10 đã sửa theo.

### 3.2. Hai công tắc bật tắt mặc định BẬT

Tài liệu nói rõ ngầm định của chế độ xem card lịch sử là `active` (tài liệu 03:284) nhưng không nói ngầm định của `followSelection` và `autoRenderView`. **Đang chọn: cả hai mặc định `true`.** Lý do: cả hai chỉ đổi *khi nào* vẽ, không đổi dữ liệu nào, nên bật là chiều tiện hơn mà không có rủi ro; và người mở sidebar lần đầu mà click ô trên sheet không thấy gì xảy ra thì sẽ tưởng hệ thống hỏng.

### 3.3. Khối núm chọn đi kèm gói `loadCore`, trừ đường bị chặn vì trần ô

Tài liệu 07 Phần 6 nói đọc ba núm "một lần lúc mở sidebar trong lượt nạp vốn đã có" mà không nói nó nằm ở khóa nào của gói. **Đang chọn: thêm khóa `prefs` vào gói `loadCore`**, và đường `blocked: 'cellBudget'` **cố ý không** mang nó — màn chặn không có núm nào để vặn, gửi thêm một khối là gửi thứ không ai đọc.

### 3.4. `Prefs` nằm ngoài `Store`, và đổi RAM trước khi máy chủ xác nhận

Tài liệu 05 Phần 7 khai hình dạng `Store` với đúng bảy thành viên. **Đang chọn: `Prefs` là biến toàn cục riêng, không nhét vào `Store`** — cùng lý do `Schema` và `SETTINGS` cũng ở ngoài: `Store` giữ dữ liệu, ba thứ kia là bảng khai và thói dùng. Thêm nữa, `prefsSet` **đổi RAM ngay rồi mới gửi lên máy chủ**, không đợi xác nhận: bấm một núm mà giao diện đợi một vòng gọi mới nhảy thì cảm giác là hệ thống chậm, còn việc ghi trượt thì lần mở sau đọc lại đúng giá trị cũ.

### 3.5. `setCurrentCustomer` là hàm thứ mười sáu của `ACTIONS`

Tài liệu 04 Phần 7 liệt kê 15 tên. Hộp gợi ý tìm khách sinh ra dòng bấm được, và mọi dòng bấm được phải trỏ tới một tên trong bảng. **Đang chọn: thêm `setCurrentCustomer`.** Cùng hàm này về sau là đường Extension gọi khi người dùng click một ô trên sheet, nên nó phải có tên trong bảng dù thế nào. Tài liệu 04 Phần 7 đã sửa theo.

### 3.6. `valueTextDate` — dạng ngày để đọc, khác dạng ngày để nuôi thẻ `input`

Tài liệu 04 Phần 10 khai `client/util/valueText.html` là chỗ đổi giá trị thành chữ "để đặt vào ô", tức chỉ nói chiều nuôi thẻ `input`. Card lịch sử thì cần `dd/mm/yyyy` cho người Việt đọc. **Đang chọn: hai hàm riêng trong cùng tệp** — `valueTextDateInput` giữ dạng máy đọc, `valueTextDate` cho chữ bày ra. Một hàm nhận thêm một cờ chọn dạng thì mỗi lời gọi phải đọc thêm một tham số mới biết nó đang trả về gì.

### 3.7. `client/style/slots.html` tách riêng khỏi `components.html`

Tài liệu 04 Phần 10 chỉ có `components.html` cho "các lớp mà renderEngine sinh ra". Các lớp của dòng lịch sử, hộp gợi ý và khối thông tin chung thì **không** do engine sinh ra — chúng do đúng một tệp là `client/ui/slots.html` sinh ra. **Đang chọn: một tệp CSS riêng**, để sửa hình thức dòng lịch sử thì không phải mở tệp giữ hình thức của mọi màn. Tài liệu 04 Phần 10 đã thêm dòng này.

### 3.8. Bốn câu chữ rỗng khác nhau trong danh sách giao dịch

Tài liệu không nói danh sách rỗng thì hiện gì. **Đang chọn: bốn câu cho bốn tình huống thật** — chưa chọn khách, đang nạp lịch sử, khách này chưa có giao dịch nào, và khách này không có giao dịch nào *đã xóa* (khi đang ở nấc "chỉ đã xóa"). Dùng chung một câu thì người dùng không phân biệt được "chưa nạp xong" với "khách này thật sự chưa có gì", và đó đúng là câu hỏi họ cần trả lời trước khi bấm tiếp.

### 3.9. Dấu tích và dấu radio của menu đọc từ `Prefs`

Tài liệu 04 Phần 4B nói mục con vẽ dấu tích "theo trạng thái đang nhớ của công tắc đó" mà không nói đọc ở đâu. **Đang chọn: `client/ui/menu.html` đọc `Prefs`**, không gọi máy chủ và không đọc `UserProperties`. `Prefs` là bản sao trong RAM của đúng kho đó, và nó đã đúng ngay từ lượt nạp đầu tiên. Tệp `menu.html` chưa dựng — ghi ra đây để lúc dựng không phải quyết lại.

### 3.10. Giá trị lạ trong `UserProperties` rơi về ngầm định, kể cả với công tắc bật tắt

Trước khi sửa, nhánh đọc núm nhiều nấc trả về ngầm định khi gặp giá trị lạ, còn nhánh công tắc bật tắt thì mọi thứ không phải `'true'` đều thành `false` — kể cả chuỗi rác. **Đang chọn: cả hai nhánh rơi về ngầm định**, để luật phát biểu được thành một câu. Đổi lại là một chuỗi rác trong `prefFollowSelection` bây giờ cho ra `true` chứ không phải `false`. Chấp nhận được vì `userPrefsWrite` kiểm trước khi ghi, nên giá trị lạ chỉ vào được kho đó nếu có người sửa tay `UserProperties`; và cả hai núm này chỉ đổi *khi nào* vẽ, không đổi dữ liệu nào, nên không có giá trị nào là chiều nguy hiểm. **Đây là chỗ tôi sửa hành vi code đang chạy, không phải chỗ tôi khai thêm luật mới** — nếu chủ dự án muốn công tắc rơi về `false` thì nói một câu là đổi lại được.
