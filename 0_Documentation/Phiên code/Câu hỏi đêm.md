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

**Đang chọn: engine giữ đúng bốn việc thuần chuỗi** (thoát ký tự, dịch `spatialConfig`, dựng chuỗi đệ quy, `renderTarget`), còn menu và phép đo sang `client/ui/menu.html` và `client/ui/collapse.html`. Lý do: hai việc kia phải chạm DOM và phải chạy *sau* khi chuỗi đã gán, còn nửa dựng chuỗi thì không chạm DOM nên bộ kiểm offline gọi được hàm thật. Engine để lại đúng hai đường nối: `data-menu="<khóa>"` với mảng mục menu gửi kèm trong `RENDER_INDEX.menus`, và `data-collapse="<số dòng>"` trên phần tử bị chặn chiều cao. Không có JSON nào nằm trong thuộc tính HTML.

### 2.2. Hình dạng bối cảnh render là hợp đồng riêng của engine

Tài liệu không nói engine lấy giá trị của một trường từ đâu. **Đang chọn: `{entity, records, screen}` truyền vào từ ngoài**, không đọc `Store`. Hai lý do: bản nháp trong `formStack` không bao giờ vào `Store` nên đọc `Store` sẽ vẽ ra số cũ; và một bản ghi truyền vào giữ được engine kiểm được offline.

### 2.3. `overflow: "collapse"` đi cùng `maxHeight` thì `maxHeight` thắng

Hai tham số cùng nói về chiều cao lúc thu gọn mà tài liệu không nói cái nào thắng. **Đang chọn: `maxHeight` là trần thu gọn, `collapsedLines` chỉ là phương án dự bị khi không khai trần** (mặc định 3 dòng, tính bằng `calc(N * var(--shin-line-height))`). Đọc thế thì thẻ ghi chú ở màn `view` chạy đúng như dòng schema của nó viết.

### 2.4. `infoBar: true` nghĩa là vẽ slot `infoBarContent`

Tài liệu khai `infoBar` là cờ bật/tắt mà không nói vùng đó lấy nội dung ở đâu. **Đang chọn: bật thì engine gọi slot tên `infoBarContent` trong `SLOTS`**, tắt thì vùng 3 mang `hidden`.

### 2.5. Ô chỉ đọc mang thêm `data-readonly="1"`

Chỉ-đọc hiện ra ba dạng khác nhau trong HTML: `<input readonly>`, `<textarea readonly>`, và `<span class="shin-badge">` không phải ô nhập. Bộ thu thập lúc lưu mà phải nhận cả ba dạng thì thành ba luật. **Đang chọn: mọi ô chỉ đọc mang thêm `data-readonly="1"`** để bộ thu thập chỉ cần một luật. Ô nào cũng mang `data-field` đủ đường dẫn, kể cả ô chỉ đọc — lọc bằng `data-readonly`, không lọc bằng việc có hay không có `data-field`.

## 3. Bảng khai bố cục và ba núm chọn — mười một chỗ tự quyết

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

Tài liệu 04 Phần 4B nói mục con vẽ dấu tích "theo trạng thái đang nhớ của công tắc đó" mà không nói đọc ở đâu. **Đã chốt và đã dựng: `client/ui/menu.html` đọc `Prefs`**, không gọi máy chủ và không đọc `UserProperties`. `Prefs` là bản sao trong RAM của đúng kho đó, và nó đã đúng ngay từ lượt nạp đầu tiên.

### 3.11. Menu tra từ tên hành động sang tên núm chọn bằng một bảng tường minh

Mục con của menu chỉ khai `action`, còn dấu tích phải đọc `Prefs` theo *tên núm*. Hai tên đó không trùng nhau: `toggleFollowSelection` → `followSelection` thì cắt chữ `toggle` là ra, nhưng `setActivityView` → `activityView` thì không, vì `set` cắt xong còn `ActivityView` chứ không phải `activityView`. **Đang chọn: một bảng `MENU_PREF_BY_ACTION` ba dòng trong `menu.html`.** Đổi lại là có thêm một chỗ phải sửa khi sinh núm thứ tư — nhưng một luật cắt chữ đúng hai phần ba là luật sẽ sai lặng lẽ đúng vào lúc đó, mà cái sai của nó là "dấu tích không hiện", loại lỗi người dùng khó gọi tên. Tên núm vẫn do `PREFS_DEFAULTS` giữ, bảng này chỉ nối hai bên.

### 3.10. Giá trị lạ trong `UserProperties` rơi về ngầm định, kể cả với công tắc bật tắt

Trước khi sửa, nhánh đọc núm nhiều nấc trả về ngầm định khi gặp giá trị lạ, còn nhánh công tắc bật tắt thì mọi thứ không phải `'true'` đều thành `false` — kể cả chuỗi rác. **Đang chọn: cả hai nhánh rơi về ngầm định**, để luật phát biểu được thành một câu. Đổi lại là một chuỗi rác trong `prefFollowSelection` bây giờ cho ra `true` chứ không phải `false`. Chấp nhận được vì `userPrefsWrite` kiểm trước khi ghi, nên giá trị lạ chỉ vào được kho đó nếu có người sửa tay `UserProperties`; và cả hai núm này chỉ đổi *khi nào* vẽ, không đổi dữ liệu nào, nên không có giá trị nào là chiều nguy hiểm. **Đây là chỗ tôi sửa hành vi code đang chạy, không phải chỗ tôi khai thêm luật mới** — nếu chủ dự án muốn công tắc rơi về `false` thì nói một câu là đổi lại được.

## 4. Màn xem khách — sáu chỗ tự quyết

Sáu chỗ gặp khi dựng `client/screen/viewScreen.html` ngày 06/09/2026. Năm chỗ đầu đã chọn xong và code đang chạy theo; chỗ thứ sáu là việc chưa dựng, ghi ra để lúc dựng không phải quyết lại.

### 4.1. Đổi khách thì vẽ lại CẢ màn, không vẽ lại riêng card lịch sử

Tài liệu 04:94 nói "danh sách lịch sử làm việc đổi khi chọn khách khác", đọc thẳng thì thành `renderTarget` một card. Nhưng khối thông tin chung và card ghi chú cũng đổi theo khách — vẽ lại một trong ba thì hai cái kia đứng ở dữ liệu khách cũ, mà đó là kiểu hỏng người dùng tin theo chứ không nhận ra. **Đang chọn: `renderScreen` cả màn.** Không đắt hơn đáng kể vì bốn chuỗi vẫn dựng trong bộ nhớ rồi gán một lượt, tức luật chống nháy vẫn nguyên. `renderTarget` riêng card lịch sử vẫn dùng, nhưng chỉ cho hai đường thật của nó: đổi nấc xem, và nạp xong gói giao dịch.

### 4.2. Đang mở form thì đổi khách chỉ đổi số, không vẽ

`screenState.html:32` nói rõ cấm hay cho phép đổi khách lúc đang gõ dở là quyết định của hành động. Bản nháp chỉ cất được khi có bộ thu thập, mà bộ thu thập thuộc chặng 1.4. **Đang chọn: `screenViewSetCustomer` cập nhật `currentCustomerId` rồi trả `null` không vẽ gì.** Hệ quả phải ghi ra: khối thông tin chung đứng ở khách cũ suốt thời gian form còn mở, và người dùng thấy tên một khách trong khi form sẽ lưu vào khách khác. Khi có bộ thu thập ở chặng 1.4 thì đường đúng là cất nháp rồi vẽ lại — lúc đó xóa hẳn cách tạm này.

### 4.3. Mã khách không tra ra bản ghi thì để lỗi bay lên, không đổi thành rỗng

Tôi viết `screenViewCustomer` trả `null` cho mã không còn trong RAM, lấy lý do là ca thật sau một lượt nạp lại mà khách đã bị xóa hẳn. Sai: tài liệu 05 Phần 9 **`[RÀNG BUỘC CỨNG]`** chọn hướng ngược lại, và lý do của nó đúng hơn lý do của tôi — trả về rỗng thì màn hiện một khách trắng và người dùng tưởng khách mất dữ liệu, thay vì biết bản đồ dòng đã cũ. **Đang chọn: chỉ trả `null` khi chưa chọn khách nào; có mã mà tra không ra thì để lỗi bay lên.**

Chỗ này để lại một việc thật cho chặng sau: mã khách đang xem trỏ tới một khách vừa bị xóa hẳn khỏi sheet thì lượt vẽ kế tiếp sẽ nổ. Người có thẩm quyền dọn là `reloadAll` — nó là chỗ duy nhất RAM đổi cả khối, nên một phép kiểm ở đó rẻ hơn một phép kiểm ở mọi lượt vẽ. Tài liệu 05:173 cũng xếp luật này về phía tài liệu làm mới dữ liệu.

### 4.4. Trình tự khởi động vẽ màn xem, `statusLoadSummary` không có nút nào gọi

`sidebarBoot()` từng kết thúc bằng `statusLoadSummary(...)`, và `statusScreen.html` tự nói hai lần rằng màn tóm tắt này là màn tạm. **Đã đổi: khởi động vẽ màn xem.**

Còn lại câu hỏi màn tóm tắt đi đâu. Tài liệu mục tiêu ghi là cho nó một mục menu, nhưng làm vậy phải thêm tên thứ mười bảy vào bảng `ACTIONS`, mà mười sáu tên là **`[RÀNG BUỘC CỨNG]`** của tài liệu 04 Phần 7 và đang bị bộ kiểm ghim đúng con số. **Đang chọn đường không thêm hành động nào:** `sidebarBoot` cất bản tóm tắt vào `BOOT_LAST_SUMMARY`, `bootShowSummary()` gọi được từ console lúc nghiệm thu, và phần duy nhất mà người dùng thật cần thấy — danh sách cảnh báo cùng danh sách phép kiểm bị bỏ qua — thì `bootTellProblems` đưa vào `alert` **chỉ khi có**. Lượt nạp sạch thì mở thẳng vào màn xem, không gì chắn đường.

Chỗ này cần chủ dự án chốt, vì nó đổi một dòng của tài liệu mục tiêu và vì nó là thứ người dùng nhìn thấy: giữ đường console, hay chấp nhận tên thứ mười bảy để có một mục menu thật?

### 4.5. Thứ tự dựng chặng 1.3 đổi so với tài liệu mục tiêu

`Mục tiêu ShinCRM độc lập.md` xếp `actions.html` trước. Nhưng phần lớn trong 16 thân hàm của `ACTIONS` phải gọi vào `viewScreen`/`formScreen`, nên dựng bảng trước là dựng 16 cái vỏ rỗng không kiểm được. **Đang chọn thứ tự: `viewScreen` → `formScreen` → `actions` → bộ phát click → `menu` + `collapse` → hộp tìm kiếm và các nếp bàn phím → phép kiểm `UI_SCHEMA` vào `schemaCheck`.** Thứ tự trong một chặng không phải luật có trong tài liệu thiết kế, nên đây là chỗ được phép tự sắp.

### 4.6. Hộp tìm kiếm không phải một `field`, nên chưa biết nó ở đâu

`Sidebar.html:32` nói hộp tìm kiếm thuộc vùng header. Nhưng `Block` không có vai `input`, `screenBar` chỉ sinh ra `Button` và `Icon`, và hộp tìm kiếm không phải một trường của `DATA_SCHEMA` nên không dựng bằng `Field` được. Thêm nữa tài liệu 04:94 đòi danh sách gợi ý vẽ lại theo từng chữ gõ **mà không mất con trỏ**, tức thẻ `input` phải nằm *ngoài* vùng bị vẽ lại.

Ba đường: thêm vai thứ chín cho `Block`; hoặc coi hộp tìm kiếm là đồ khung cố định trong `Sidebar.html` (giống `sidebar-progress`) do một tệp `client/ui/search.html` chạm DOM điều khiển, cùng loại với `menu.html` và `collapse.html`; hoặc một `Block` bọc mà slot của nó sinh ra thẻ `input`. **Chưa chọn** — để lại tới bước dựng hộp tìm kiếm, vì hai bước trước nó không phụ thuộc câu trả lời. Nghiêng về đường thứ hai: nó giữ được luật con trỏ mà không phải nới hình dạng `Block` cho một trường hợp duy nhất.

## 5. Ba màn form — năm chỗ tự quyết

### 5.1. Cờ thêm-mới thay cho phép đọc `record.id`

Tài liệu 04:123 viết "rỗng là thêm mới, có mã là sửa". Câu đó sai từ lúc `DATA_SCHEMA` khai `id` có ngầm định `nextCustomerCode`/`nextActivityCode`: bản ghi của form thêm **đã** mang mã xem trước, nên đọc `record.id` thì mọi form thêm đều đề chữ "Sửa". Bọ này đã thật sự nổ ra trong bộ kiểm, không phải suy đoán. **Đã sửa tài liệu 04** và khung ngăn xếp mang thêm cờ `themMoi`, đặt bởi hai cửa riêng `screenStateOpenForm` (sửa) và `screenStateOpenFormNew` (thêm) chứ không bởi một tham số thứ năm.

### 5.2. Dấu ô kế tục do engine đánh, và danh sách kế tục sống trong ngăn xếp

Tài liệu 03 dòng 96 giao đúng việc này cho engine, và tài liệu 04 Phần 6 **`[RÀNG BUỘC CỨNG]`** cấm mọi tệp ngoài engine đổi lớp CSS. **Đang chọn:** `renderScreen` nhận thêm khóa `carried` trong bối cảnh, `renderFieldCarried` so cả tên thực thể để `customer.note` trên form giao dịch không ăn dấu vì trùng tên, và danh sách kế tục nằm trong khung ngăn xếp cùng bản nháp — có thế nó mới sống qua một form lồng.

### 5.3. Tiêu đề form vào vùng header, chèn trước mục căn phải đầu tiên

Không tài liệu nào cho tiêu đề form một chỗ đứng. Code cũ đặt nó bên trái một dải dính đầu màn, ✕ và ✓ bên phải. **Đang chọn: dựng đúng lại nếp đó** — `formScreen` chèn một `Text` mang lớp `shin-form-title` vào `man.header` ngay trước mục đầu tiên có `align === 'right'`, ra `[✕][tiêu đề][✓]`. Chèn lúc vẽ chứ không khai trong `UI_SCHEMA` vì tiêu đề phụ thuộc bản ghi đang mở. `Text` không nhận khóa `align`, nên tiêu đề nằm trái và `margin-left: auto` của nút ✓ tự đẩy nó sang phải.

### 5.4. `screenFormRender` trả về `focusId` chứ không tự gọi `focus`

Đặt con trỏ vào ô nhập đầu tiên là việc phải làm, nhưng gọi `focus` thì tệp màn phải chạm DOM, mà khung giả của bộ kiểm cố tình chỉ có ba khả năng nên tệp sẽ nổ ngay ở đó. **Đang chọn: tính ra id rồi trả về**, việc gọi `focus` thuộc tệp nghe click — tệp duy nhất ngoài engine được phép chạm DOM. Id tính bằng đúng `renderFieldId` và `renderFieldReadonly` của engine, không chép lại công thức sang tệp thứ hai.

### 5.5. Ba lớp CSS mà `UI_SCHEMA` gọi tên nhưng chưa ai viết

`shin-save-wide` và `shin-note-tall` được `UI_SCHEMA` gọi từ đầu mà không có một dòng CSS nào trong repo. **Đang chọn:** viết chúng cùng `shin-form-title` và `shin-carried` vào `<style>` riêng của `formScreen.html`, theo đúng luật ở `Sidebar.html:18` — style chết cùng màn thì ở cùng màn. Nút lưu ở ba màn form được thêm `shin-primary` vào `className` để đúng màu nút chính của bản cũ, vì `shin-save-wide` chỉ nên lo bề rộng.

## 6. Bảng mười sáu hành động — bốn chỗ tự quyết

### 6.1. Chữ ký `(payload) => void` của tài liệu 04:104 đã hẹp hơn thực tế

Tài liệu 04 dòng 104 viết mỗi hành động là `(payload) => void`. Không đúng nữa: `cancelForm` và bốn cửa mở form phải trả `focusId` ra ngoài để bên nghe click đặt con trỏ — chính là điều mục 5.4 chốt — còn ba núm chọn trả `Promise` để bên gọi bắt được lượt gửi thất bại. Trả `void` thì hai việc đó buộc phải làm bên trong thân hàm, tức mười sáu thân hàm đều chạm DOM và bộ kiểm offline mất luôn khả năng gọi chúng.

**Đã chốt và đã sửa tài liệu 04 thành `(payload) => phần dư`**, kèm một đoạn nói phần dư gồm những gì: một object mang `focusId`, một `Promise`, hoặc cả hai, hoặc không gì cả. Bộ phát click đã dựng và nó ăn đúng hai hình dạng đó — `focusId` thì đặt con trỏ, `Promise` thì bắt cả nhánh chối — nên không còn hình dạng thứ ba nào bị bỏ rơi.

### 6.2. Sáu hành động của chặng sau ném lỗi có tên, không để thân rỗng

Sáu trong mười sáu tên thuộc chặng 1.4 và 1.5: `saveForm`, `deleteSelectedActivities`, `deleteActivity`, `undoDelete`, `renderActiveViewSheet`, cộng `toggleSearchPanel` còn nằm trong chặng này nhưng sau bảng. Để thân rỗng thì bấm nút không có gì xảy ra — đúng cái hỏng mà tài liệu 04 Phần 7 lập ra để chống, và là cái hỏng tệ nhất với người dùng không phải lập trình viên. Bỏ tên khỏi bảng thì phép kiểm khởi động đỏ vì `UI_SCHEMA` đã khai đủ mười sáu tên.

**Đang chọn: `actionsChuaDung(viec, chang)` ném một câu tiếng người có tên việc và số chặng.** Tên có mặt nên phép kiểm khởi động xanh, mà bấm vào thì hiện ra "chưa dựng, thuộc chặng 1.4" chứ không im lặng. Sáu chỗ này là sáu dòng phải xóa ở chặng tương ứng, và bộ kiểm ghim đúng con số sáu để không ai kịp quên.

### 6.3. Phép kiểm tên lúc khởi động ở `schemaCheck.html`, và nó gọi ngược lên tệp nhúng sau

Tài liệu mục tiêu xếp phép kiểm tên vào cùng gạch đầu dòng với `actions.html`. Nhưng đặt nó trong `actions.html` thì phải chép lại ba thứ: lối viết tắt `{group, rows}` của `screenBuild`, cách `screenBar` bung `titleActions`, và luật đường dẫn trường của `renderFieldPath`. Ba bản chép ấy sẽ lệch, và lệch theo hướng tệ nhất — bộ kiểm xanh còn sidebar thật thì đỏ.

**Đang chọn: `schemaCheckUi` trong `client/schema/schemaCheck.html`**, dùng lại đúng ba hàm của engine. Cái giá là `schemaCheck.html` gọi hàm của hai tệp nhúng **sau** nó. Chạy được vì lời gọi xảy ra lúc khởi động chứ không lúc nạp tệp, và đã ghi vào docstring của tệp kèm điều kiện kèm theo: **không được gọi `checkSchema` ở tầng ngoài cùng của một thẻ `<script>`**.

### 6.4. `ingestCore` che ba bảng giao diện bằng `typeof`, và bộ kiểm giữ chỗ hở đó

Nối phép kiểm mới vào `checkSchema` nghĩa là `ingestCore` phải đưa `UI_SCHEMA`, `ACTIONS`, `SLOTS` vào. Nhưng `tests/lib/dung-client.js` cố ý chỉ nạp sáu tệp tầng dữ liệu, nên `ramStore.js` gọi `ingestCore` là nổ `ReferenceError`. Hai đường: nhồi năm tệp giao diện vào hộp cát tầng dữ liệu, hoặc để `ingestCore` chịu được cảnh thiếu bảng.

**Đang chọn đường thứ hai:** ba biểu thức `typeof … === 'undefined' ? null : …`, và `checkSchema` tự khai vào `skipped` là đã bỏ qua. Đường thứ nhất phá mất câu mà hộp cát tầng dữ liệu đang chứng minh — rằng sáu tệp ấy chạy được khi không có DOM.

Chỗ hở kèm theo: một sidebar thật quên một dòng `include` thì phép kiểm cũng bị bỏ qua trong im lặng. Bịt bằng hai phép kiểm offline chứ không bằng code chạy, và cả hai đã dựng: `tests/cases/schemaCheck.js` gọi `checkSchema` với đủ bốn bảng thật rồi đòi `skipped` chỉ còn ba dòng không có tên `UI_SCHEMA`, còn `tests/cases/namespace.js` soi danh sách `include` của `Sidebar.html` phải phủ đúng mọi tệp `client/` và không dòng nào trỏ vào chỗ trống.

## 7. Chặng 1.3 — soi bố cục ở 300 pixel

### 7.1. Bản xem tại máy sinh dữ liệu của chính nó, không chép dữ liệu thật về

Prompt bàn giao đề nghị một hàm dò mới trong `server/dev/`, một vòng gọi qua mạng, một tệp JSON ảnh chụp dữ liệu Sheet DEV thật, kèm một dòng `.gitignore` và một dòng danh sách trắng cho `tests/gas.js`. Không cần tới bốn thứ đó: `tests/lib/dung-hop.js` đã chạy được `loadCore()` thật trên một tệp Sheet giả ngay tại máy — `tests/cases/ramStore.js` làm đúng vậy.

**Đã chọn: `tests/preview.js` tự dựng hộp cát rồi tự sinh gói nạp.** Không mạng, không cửa dò, không tệp nào nằm ngoài git, và **không một ô nào của khách thật rời khỏi Google**. Giá phải trả là tên công ty và ghi chú do người viết bịa ra, trả bằng cách viết chúng dài đúng như thật: một ghi chú 355 ký tự, một địa chỉ 69 ký tự, mười hai tên công ty dài.

Bốn điều bản xem này **không** nói được, ghi lại để đừng ai tin nó quá: CSS của chính Google rót vào iframe sidebar, phông của máy khác, độ trễ thật của `google.script.run`, và đường chặn vì vượt trần ngân sách ô.

### 7.2. Món nợ ca kiểm cho `dispatch`, `menu`, `collapse` — bỏ, không hoãn

`Mục tiêu ShinCRM độc lập.md` từng ghi món nợ "một DOM giả tối thiểu đủ để gọi `dispatchPayload`, `menuMark`, `menuItemElement` và ba nấc của `collapseApply`".

**Đã chọn: bỏ hẳn món nợ đó.** Bản xem tại máy chạy đúng ba tệp ấy trên DOM thật của Chrome mỗi lần mở, và nó vừa bắt được hai lỗi mà một DOM giả ba khả năng không bao giờ bắt được — xem mục 7.3. Một DOM giả chỉ chứng minh code khớp với cái giả.

### 7.3. Control thứ tám `readText`, vì card GHI CHÚ không bao giờ thu gọn được

Tài liệu 03 Phần 8 khai card GHI CHÚ của màn xem bằng `Field({ field: "customer.note", readonly: true })`, và `note` có `type: 'TEXT'` nên engine suy ra control `text` — một ô nhập **một dòng**. Đo trên bản xem: khối chỉ cao 71 pixel trong khi trần là 160, nên `collapseApply` luôn chọn nấc `fit` và nút "Xem thêm" chưa từng hiện lần nào. Một ghi chú 355 ký tự nằm gọn trong một dòng ô nhập, người dùng đọc được chừng 35 ký tự đầu.

Đây là tài liệu tự mâu thuẫn: chính tài liệu 03 Phần 7 viết "`note` là `TEXT` nhưng phải là ô nhiều dòng", mà ví dụ ở Phần 8 lại khai cụt.

**Đã chọn: thêm control thứ tám `readText`** — vẽ ra `div` chữ trơn, cao theo nội dung, `white-space: pre-wrap` để giữ các lần xuống dòng người dùng đã gõ. Nó **luôn** chỉ đọc bất kể bản khai có đặt cờ hay không, vì nó không có đường gõ và vì bộ thu thập lúc lưu phải chắc chắn bỏ qua nó thay vì đọc ra chuỗi rỗng rồi xóa mất ghi chú cũ. Đã sửa cả tài liệu 03: thêm một dòng vào bảng control và sửa ví dụ ở Phần 8. Không chọn `control: 'textarea'` vì ô nhiều dòng vẫn cao cố định `rows="3"` nên trần card vẫn không bị chạm, và hai cơ chế cuộn lồng nhau.

Sau khi sửa, ba ca đo đúng cả ba: ghi chú 355 ký tự thì ghim 160 pixel và hiện nút, ghi chú 31 ký tự thì cao 45 pixel và **không** có nút — đúng `[RÀNG BUỘC CỨNG]` tài liệu 04 Phần 5 — còn ghi chú rỗng thì hiện chữ nhạt "(chưa có)".

### 7.4. Nhãn nút thu gọn bỏ con số dòng

Nút cũ ghi "Xem thêm — đang thu gọn còn 3 dòng", số 3 lấy từ `data-collapse`. Nhưng mục 2.3 đã chốt `maxHeight` thắng `collapsedLines`, và card GHI CHÚ khai `maxHeight: '160px'`, nên con số kia sai đúng ở ca duy nhất đang chạy thật: ghim 160 pixel mà lại đi khoe "còn 3 dòng".

**Đã chọn: nhãn còn hai chữ "Xem thêm".** Ngắn hơn, và không nói một con số mà nó không giữ được.

### 7.5. Combobox không có mũi tên sổ xuống

Ký tự `▾` ở cỡ 11 pixel trên phông Segoe UI ra một cái gạch ngang, nhìn thành dấu trừ nằm sát chữ trong ô; vẽ tam giác bằng `border` thì hình đúng nhưng vẫn phải nới chừa phải lên 24 pixel để chữ không chạy vào dưới nó. Trên một sidebar rộng khoảng 300 pixel, 24 pixel là ba bốn chữ — mà mấy chữ cuối của tên công ty mới là thứ phân biệt hai khách trùng đầu tên.

**Đã chọn: bỏ hẳn mũi tên và bỏ luôn khoảng chừa, bù lại bằng phép con trỏ vào ô là tự bung danh sách.** Lấy nguyên nếp của bản cũ. Người dùng không mất đường mở nào, còn `.shin-caret` thì vẫn ở lại cho nút menu — chỗ đó mũi tên là dấu duy nhất cho biết bấm vào sẽ có menu bung ra.

### 7.6. Cú dán khối neo vào ô tên công ty, không phải ô mã khách

Bản cũ neo cú dán vào ô `n-code` vì lúc đó mã khách gõ tay được. Bản này khai `customer.id` là `readonly` với `default: 'nextCustomerCode'` — mã do máy chủ cấp, dán vào ô đó không có tác dụng gì.

**Đã chọn: neo vào ô tên công ty, và nếu dòng đầu của khối trông như một mã khách thì bỏ dòng đó.** Nếp tay của chủ dự án là chép nguyên một hàng bắt đầu bằng mã khách, nên phép bỏ dòng đầu giữ cho nếp tay đó vẫn xếp đúng cột. Mẫu nhận dạng: hai tới bốn chữ in hoa, gạch ngang, rồi từ ba số.

**Điểm còn mơ hồ, chờ mắt chủ dự án:** thứ tự năm cột của khối dán đang là tên công ty, mã số thuế, người liên hệ, số điện thoại, thư điện tử — lấy theo bản cũ. Nếu nếp chép thật khác thì sửa đúng một mảng `INPUTS_PASTE_FIELDS` trong `client/ui/inputs.html`.
