# Checklist triển khai Reload RAM và Sheet quản trị

> Checklist này triển khai `07A. Hợp đồng Reload RAM và Sheet quản trị.md`. Chưa được đánh dấu `[x]` nếu chưa có bằng chứng từ test offline, GAS DEV hoặc nghiệm thu thao tác trên Sheet DEV. Không dùng Sheet có dữ liệu khách thật.

## Quy ước bằng chứng

- `[ ]` Chưa làm hoặc chưa có bằng chứng.
- `[x]` Đã làm và có đường dẫn test/commit hoặc kết quả GAS DEV kèm theo.
- Mỗi mục phải ghi một kết quả quan sát được, không chỉ ghi “đã sửa code”.
- Mọi mục có chữ “live” chỉ hoàn thành sau khi chủ dự án tự giữ tab FBM/Sheet DEV và xác nhận thao tác.

## Slice R0 — Chốt hợp đồng và phạm vi

### Tài liệu nguồn

- [ ] Đọc và đối chiếu `07A. Hợp đồng Reload RAM và Sheet quản trị.md` với ma trận đã chốt trong trao đổi.
- [ ] Xác nhận bốn sheet mặc định là `Customer`, `Activity`, `Category`, `Config`.
- [ ] Xác nhận mọi sheet tên bắt đầu bằng `!` là sheet quản trị.
- [ ] Xác nhận `full core` luôn gọi lại `loadCore`, dựng lại Store/Schema/Category/Config và chỉ mục tìm kiếm.
- [ ] Xác nhận reload đúng mã phải trả cả mã không còn tồn tại để client xóa khỏi RAM.
- [ ] Xác nhận GAS là nơi duy nhất phân loại cột `@` hợp lệ.
- [ ] Xác nhận mọi view đều được vẽ lại khi nguồn Customer/Activity đổi; phiên đầu không suy dependency riêng từng view.
- [ ] Xác nhận pull, push, retry, verify, baseline, conflict, missing và background đều phải qua tín hiệu chung sau ghi thành công.
- [ ] Xác nhận `ReloadDecision` là module quyết định chung; module nhận input đầy đủ và trả quyết định riêng cho RAM, view và signal, không tự ghi hay tự vẽ.
- [ ] Xác nhận code hiện tại không có một cờ toàn cục tên `sidebarDirty`; bản nháp Sidebar nằm theo form ở `ScreenState.formStack[].draft` và các state draft riêng của màn đồng bộ.
- [ ] Xác nhận `localDraft` chỉ là input tùy chọn do Sidebar truyền khi cần bảo vệ bản nháp, không được ghi vào `DocumentProperties` và không làm chậm render server-side.

### Quyết định không được thay đổi khi đang code

- [ ] Không dùng sheet quản trị làm nguồn sự thật.
- [ ] Không đọc ngược dữ liệu từ hàng 4 trở xuống của sheet quản trị về Customer/Activity.
- [ ] Không để Extension tự đọc hàng 1 hoặc hàng 3 để quyết định cột hợp lệ.
- [ ] Không xóa dirty state dùng chung chỉ vì một Sidebar đã đọc hoặc đã reload.
- [ ] Không coi ghi trạng thái đồng bộ là “không đổi nội dung” để bỏ qua reload.
- [ ] Không để GAS chờ Sidebar, Extension hoặc focus của người dùng trước khi vẽ sheet quản trị.

## Slice R1 — ReloadState bền vững trên GAS

### Hình dạng và khóa

- [ ] Có khóa revision tăng đơn điệu trong `DocumentProperties`.
- [ ] Có khóa changedAt ghi epoch milliseconds cùng revision.
- [ ] Có danh sách mã Customer/Activity bẩn, hợp nhất không trùng và có giới hạn kích thước.
- [ ] Có cờ dirty Category riêng.
- [ ] Có cờ dirty Config riêng.
- [ ] Có cờ dirty Schema riêng cho hàng 1 bốn sheet mặc định.
- [ ] Có cờ `allCore` để bắt buộc full core.
- [ ] Có cờ `allViews` để bắt buộc vẽ toàn bộ view.
- [ ] Có danh sách view bẩn để tương thích và chẩn đoán từng sheet.
- [ ] Giữ alias cũ trong giai đoạn chuyển tiếp nhưng không để alias làm mất scope mới.

### Tính nguyên tử và phục hồi

- [ ] Một lần phát tín hiệu chỉ tăng revision một lần.
- [ ] Nhiều mã trong cùng signal được hợp nhất trước khi ghi thuộc tính.
- [ ] Danh sách vượt ngưỡng chuyển sang `allCore`, xóa danh sách mã và không phình thuộc tính.
- [ ] Đọc thuộc tính hỏng trả về trạng thái an toàn, không làm sập phản hồi Sidebar.
- [ ] Lượt reload ghi nhớ revision bắt đầu.
- [ ] Nếu revision đổi trong lúc reload, lượt cũ không xóa cờ của lượt mới.
- [ ] Xóa cờ chỉ xảy ra sau khi đọc/vẽ thành công.
- [ ] Lỗi ghi không xóa dirty state cũ.
- [ ] Có hàm nghiệm thu in revision, changedAt và từng scope.

### Kiểm thử offline R1

- [ ] Sheet mới trả ReloadState rỗng, revision hợp lệ.
- [ ] JSON hỏng trong từng khóa không làm `reloadStateRead` ném lỗi.
- [ ] Đánh dấu lặp cùng một mã chỉ giữ một mã.
- [ ] Đánh dấu vượt ngưỡng chuyển đúng sang full core.
- [ ] Đánh dấu Category không bật nhầm Config nếu DTO mới cần phân biệt.
- [ ] Đánh dấu Schema luôn bật full core và allViews.
- [ ] Đọc ReloadState không xóa dữ liệu thuộc tính.
- [ ] Hai hộp cát đọc cùng một revision không làm hộp thứ hai mất tín hiệu.
- [ ] Revision mới phát sinh trong lúc clear không bị xóa.

## Slice R2 — GAS phân loại onEdit

### Bốn sheet mặc định

- [ ] Hàng 1 Customer đổi mã `@` tạo schema + allCore + allViews.
- [ ] Hàng 1 Activity đổi mã `@` tạo schema + allCore + allViews.
- [ ] Hàng 1 Category đổi mã `@` tạo schema + allCore + allViews.
- [ ] Hàng 1 Config đổi mã `@` tạo schema + allCore + allViews.
- [ ] Hàng 2 chỉ đổi nhãn không tạo dirty.
- [ ] Hàng 3 chỉ là ghi chú và không tạo dirty.
- [ ] Hàng dữ liệu Customer dưới cột schema hợp lệ ghi đúng mã bản ghi.
- [ ] Hàng dữ liệu Activity dưới cột schema hợp lệ ghi đúng mã bản ghi.
- [ ] Hàng dữ liệu Customer/Activity dưới cột thường không tạo dirty.
- [ ] Sửa một vùng nhiều hàng nhiều cột chỉ gom các mã hợp lệ, bỏ mã rỗng.
- [ ] Category hàng dữ liệu tạo dirtyCategory + allViews.
- [ ] Config hàng dữ liệu tạo dirtyConfig + allViews.

### Sheet quản trị

- [ ] Đổi hàng 1 của một view gọi vẽ toàn bộ view.
- [ ] Thêm mã `@` vào hàng 1 gọi vẽ toàn bộ view.
- [ ] Đổi `@A` thành `@B` gọi vẽ toàn bộ view.
- [ ] Đổi mã `@` thành giá trị thường gọi vẽ toàn bộ view.
- [ ] Xóa mã ở hàng 1 gọi vẽ toàn bộ view.
- [ ] Sửa hàng 3 dưới cột `@CUS_`/`@ACT_` hợp lệ gọi vẽ toàn bộ view.
- [ ] Sửa hàng 3 dưới cột thường không gọi vẽ.
- [ ] Sửa hàng 4 trở xuống không đọc ngược và không tự vẽ.
- [ ] Ngoại lệ được kiểm: hàng 4 trở xuống của `@VIEW_SORT_COL`/`@VIEW_SORT_LEVEL` là cấu hình sắp xếp nên vẫn vẽ toàn bộ view; cột dữ liệu CRM từ hàng 4 trở xuống không vẽ.
- [ ] Mã `@VIEW_` hoặc mã không hợp lệ không bị coi là cột dữ liệu để reload RAM.
- [ ] Trigger installable được cài và không tạo bản sao khi chạy lại hàm cài.
- [ ] Trigger script ghi view không tự tạo vòng lặp onEdit.

### Kiểm thử offline R2

- [ ] Bổ sung ca cho cả bốn hàng 1 mặc định.
- [ ] Bổ sung ca hàng 2 và hàng 3 mặc định.
- [ ] Bổ sung ca cột hợp lệ/không hợp lệ ở Customer và Activity.
- [ ] Bổ sung ca view hàng 1, hàng 3 cột `@` và hàng 3 cột thường.
- [ ] Kiểm số lần gọi renderer là một lượt vẽ toàn bộ, không chỉ view đang active.

## Slice R3 — Cổng ghi chung và đồng bộ FBM

### `writeGateSave`

- [ ] Sau `flush` và đọc lại thành công, phát signal cho mọi id trong batch.
- [ ] Signal chạy cho `source: user`.
- [ ] Signal chạy cho `source: pull`.
- [x] Signal chạy cho `source: push`; các call site trong `PushFlow` không còn gắn nhãn `pull`.
- [x] Signal chạy cho `source: background` không có Sidebar (test cửa ghi offline).
- [ ] Batch Customer mới phát tín hiệu bằng mã vừa cấp.
- [ ] Batch Activity mới phát tín hiệu bằng mã vừa cấp.
- [ ] Batch chỉ ghi baseline phát tín hiệu.
- [ ] Batch chỉ ghi sync status phát tín hiệu.
- [ ] Batch chỉ ghi conflict/missing/retry/error phát tín hiệu.
- [ ] Batch lỗi validation không phát tín hiệu thành công.
- [ ] Lỗi hạ tầng không xóa signal cũ.
- [ ] Batch cấp mã làm đổi Config không để Config trong RAM giữ counter cũ mà không có đường xử lý.
- [x] `fbmEnsureSyncColumns` ghi thêm mã cột bằng GAS phải khóa, flush và phát `schema` + `allCore` + `allViews`, kể cả khi Sidebar đóng.

### Cửa xóa và đường ghi đặc biệt

- [ ] Xóa mềm phát signal cho mã bị đổi trạng thái.
- [ ] Xóa hẳn phát signal cho mã đã biến mất để client xóa khỏi Store.
- [ ] Không có đường `setValue` Customer/Activity ngoài cổng ghi hoặc cửa xóa đã phát signal.
- [ ] Pull dùng signal chung, không tự thao tác JSON dirty riêng.
- [x] Push dùng signal chung, không bỏ qua vì chỉ đổi trạng thái.
- [x] Background dùng signal chung dù Sidebar đóng.

### Kiểm thử offline R3

- [ ] Save user cập nhật dirty records và allViews.
- [ ] Delete soft cập nhật dirty records và allViews.
- [ ] Delete hard cập nhật dirty records và allViews.
- [ ] Pull nội dung cập nhật dirty records.
- [ ] Push success cập nhật dirty records.
- [ ] Push verify/error/conflict/missing cập nhật dirty records.
- [ ] Ghi thất bại giữ nguyên dirty state trước đó.
- [ ] Kiểm một batch nhiều mã chỉ tăng revision theo hợp đồng đã chốt và không trùng mã.

## Slice R4 — API reload theo scope

### `reloadRecords`

- [ ] API nhận mảng mã và chuẩn hóa chuỗi.
- [ ] API đọc đúng Customer được yêu cầu.
- [ ] API đọc Activity được yêu cầu.
- [ ] API kéo theo mọi Activity của Customer bị ảnh hưởng.
- [ ] API trả danh sách mã Customer bị ảnh hưởng.
- [ ] API trả dấu hiệu record đã biến mất để client remove.
- [ ] API không trả dữ liệu thừa của toàn bộ kho khi scope nhỏ.
- [ ] API nhận expected revision và không clear nếu revision đã đổi.
- [ ] API fallback full core khi mã không xác định, scope lỗi hoặc vượt ngưỡng.
- [ ] API trả ReloadState mới nhất trong mọi nhánh thành công.

### Category và Config

- [ ] Có API reload Category riêng.
- [ ] Category reload thành công xóa đúng dirtyCategory, không xóa cờ mới.
- [ ] Có API reload Config hoặc trả yêu cầu full core rõ ràng.
- [ ] Config reload không làm Schema/Config defaults trong RAM lệch nhau.
- [ ] Đổi schema luôn fallback full core.
- [ ] Có API `getReloadState` dùng khi nhận event, lúc mở Sidebar và tại các điểm kiểm tra tự nhiên.
- [ ] Có event reload tức thời qua kênh Extension/Sidebar; event chỉ là tín hiệu đánh thức, không phải nguồn dữ liệu.
- [ ] Có API render toàn bộ managed views và trả kết quả từng sheet.

### Nút thủ công

- [ ] `Nạp lại toàn bộ` gọi full core.
- [ ] `Nạp lại sheet hiện tại` nhận đúng sheet active từ GAS.
- [ ] Current Customer reload đúng scope Customer.
- [ ] Current Activity reload đúng scope Activity.
- [ ] Current Category reload đúng scope Category.
- [ ] Current Config dùng full core an toàn.
- [ ] Current managed view vẽ lại theo chính sách và đối chiếu allViews.
- [ ] Có bốn lệnh nạp sheet cụ thể Customer/Activity/Category/Config.
- [ ] Menu không mở thêm đường ghi dữ liệu ngoài API đã có.

## Slice R5 — Client event reload, debounce và cập nhật Store

### Theo dõi revision

- [ ] Sidebar đăng ký listener event reload sau khi core nạp xong.
- [ ] Sidebar kiểm tra ReloadState lúc mở lại.
- [ ] Sidebar kiểm tra sau mỗi lời gọi máy chủ.
- [ ] Sidebar kiểm tra khi lấy focus nếu kênh event vừa được phục hồi.
- [ ] Không có timer polling ReloadState trong luồng bình thường.
- [ ] Event reload không tạo vòng chồng khi request trước chưa xong.
- [ ] Event lỗi không làm Sidebar treo; lần event sau hoặc điểm kiểm tra tự nhiên vẫn xử lý.
- [ ] `lastSeenRevision` chỉ sống trong Sidebar, không ghi đè DocumentProperties.

### Debounce sửa tay

- [ ] `onEdit` đầu tiên không reload ngay nếu người dùng còn ở Customer/Activity.
- [ ] Mỗi edit mới reset mốc chờ ba giây.
- [ ] Hết ba giây từ edit cuối gọi một lượt reload.
- [ ] Nhiều mã trong khoảng chờ được hợp nhất.
- [ ] Request đang bay không bị gọi trùng.
- [ ] Rời Customer/Activity trước ba giây gọi reload ngay.
- [ ] Rời sheet khi không có dirty không gọi reload thừa.
- [ ] Sửa cột không hợp lệ không khởi động debounce.

### Cập nhật RAM

- [ ] Customer còn tồn tại được upsert bằng bản ghi máy chủ trả về.
- [ ] Customer biến mất được remove.
- [ ] Activity còn tồn tại được upsert.
- [ ] Activity biến mất được remove.
- [ ] Activity của Customer bị ảnh hưởng được tính lại danh sách.
- [ ] Search index được cập nhật sau upsert/remove.
- [ ] Màn hiện tại được vẽ lại sau reload.
- [ ] Full core dựng lại Schema, Category, Config và search index từ đầu.
- [ ] Reload Category cập nhật danh mục SELECT đang dùng.
- [ ] Config đổi làm client dùng cấu hình mới, không giữ bản cũ.

### Kiểm thử offline R5

- [ ] Ca nhiều edit chỉ gọi `reloadRecords` một lần.
- [ ] Ca rời sheet trước đủ ba giây gọi reload ngay.
- [ ] Ca revision đổi trong lúc request bay không mất mã mới.
- [ ] Ca event đang bay không tạo Promise thứ hai.
- [ ] Ca record biến mất xóa đúng Store và search index.
- [ ] Ca full core sau schema đổi xóa Store cũ trước khi ingest.
- [ ] Ca Category đổi cập nhật dropdown.
- [ ] Ca Config đổi cập nhật default/counter/sort.
- [ ] Ca Sidebar không có bản nháp nhận quyết định `reload` theo scope.
- [ ] Ca Sidebar có bản nháp đúng mã nhận quyết định bảo vệ bản nháp (`defer` hoặc yêu cầu xác nhận), không bị đè RAM âm thầm.
- [ ] Ca Sidebar có bản nháp không liên quan vẫn reload được mã khác trong cùng signal.
- [ ] Ca `localDraft` không ảnh hưởng quyết định GAS render toàn bộ view.

## Slice R6 — Vẽ toàn bộ sheet quản trị

### Đường chạy độc lập với Sidebar

- [ ] `onEdit` hợp lệ ở Customer/Activity đánh dấu allViews và gọi render server-side khi chính sách cho phép.
- [ ] Module `ReloadDecision` được gọi với input đầy đủ trước khi trigger/cửa ghi thực thi signal hoặc render.
- [ ] Lượt render không nhận Sidebar state vẫn trả quyết định render toàn bộ view bình thường.
- [ ] Pull thành công gọi render server-side khi chính sách cho phép dù Sidebar đóng.
- [ ] Push thành công gọi render server-side khi chính sách cho phép dù Sidebar đóng.
- [ ] Baseline/conflict/missing/retry/status chỉ đổi trạng thái vẫn gọi render server-side.
- [ ] Sheet quản trị đang active hay không không ảnh hưởng việc render.
- [ ] Spreadsheet có mở Sidebar hay không không ảnh hưởng việc render.
- [ ] Khi chính sách tắt, server không render nhưng giữ allViews bền vững.
- [ ] Khi chính sách bật lại, một lệnh server-side render toàn bộ view được gọi ngay, không chờ Sidebar.
- [ ] Lỗi một view giữ cờ của view lỗi và không xóa allViews khi chưa hoàn tất.

### Renderer

- [ ] Có hàm `renderAllManagedViews` duyệt mọi sheet `!`.
- [ ] Nguồn Customer/Activity đổi thì renderer không chỉ vẽ sheet active.
- [ ] Hàng 1 view đổi thì renderer vẽ toàn bộ view.
- [ ] Hàng 3 hợp lệ đổi thì renderer vẽ toàn bộ view.
- [ ] Hàng 3 cột thường không vẽ.
- [ ] View lỗi filter/sort giữ dữ liệu cũ của chính view lỗi.
- [ ] Cờ view lỗi vẫn còn sau lỗi.
- [ ] View vẽ thành công xóa đúng cờ của view đó.
- [ ] Toàn bộ lượt vẽ thành công xóa `allViews`.
- [ ] Lượt vẽ không đọc ngược hàng 4 trở xuống làm nguồn sự thật.
- [ ] Renderer vẫn dùng latest Activity còn sống.
- [ ] Renderer phủ lại cả dòng dữ liệu cũ thừa.

### Chính sách tự động

- [ ] `autoRenderView=true` thì signal dữ liệu gọi vẽ toàn bộ view.
- [ ] `autoRenderView=false` thì vẫn giữ allViews.
- [ ] Bật lại auto render lập tức đối chiếu dirty và vẽ toàn bộ view.
- [ ] Tắt auto render không làm RAM giữ bản ghi cũ.
- [ ] Lệnh thủ công vẫn vẽ dù auto render tắt.
- [ ] Hai user/sidebar có prefs khác nhau không xóa dirty dùng chung sai cách.

### Kiểm thử offline R6

- [ ] Hai view cùng nguồn đều được vẽ sau một ghi Customer.
- [ ] View không active vẫn được vẽ.
- [ ] View có filter đổi vẫn vẽ.
- [ ] View có sort chung Config đổi vẫn vẽ.
- [ ] Một view lỗi không làm cờ của view khác bị xóa nhầm.
- [ ] Bật lại công tắc sau khi tắt làm mọi view cập nhật.

## Slice R7 — Tài liệu, test và triển khai

- [ ] Cập nhật `07A` khi có thay đổi hợp đồng, không ghi quyết định mới rải ở tài liệu khác.
- [ ] Cập nhật tài liệu 05, 05A và 07 khi đổi tên API hoặc bất biến.
- [ ] Cập nhật mục liên quan trong `Checklist đồng bộ FBM.md`.
- [ ] Cập nhật `Cây thư mục code.md` nếu thêm tệp code.
- [ ] Thêm ca test vào `tests/cases/dirtyState.js`.
- [ ] Thêm ca test vào `tests/cases/triggers.js`.
- [ ] Thêm ca test vào `tests/cases/refresh.js`.
- [ ] Thêm ca test cho cổng ghi/pull/push/background.
- [ ] Chạy `node tests/run.js` và ghi tổng kết.
- [ ] Chạy test GAS DEV cho `getReloadState`, `reloadRecords`, `renderAllManagedViews` với `--push`.
- [ ] Chạy test GAS DEV khi không mở Sidebar và xác nhận view vẫn đổi sau ghi Customer/Activity.
- [ ] Kiểm tra log không chứa cookie, mật khẩu, token hoặc payload nhạy cảm.
- [ ] Chỉ thử dữ liệu thật ở Sheet DEV theo cờ an toàn đã chốt.
- [ ] Không sửa fixture trong `0_Documentation/Nghiên cứu FBM/`.
- [ ] Commit riêng tài liệu/checklist trước khi commit core code.
- [ ] Commit riêng core GAS, client Sidebar và test khi hợp lý.

## Slice R8 — Nghiệm thu trên Sheet DEV

- [ ] Mở Sidebar, ghi lại revision ban đầu.
- [ ] Sửa một ô Customer ở cột `@`, chờ ba giây, xác nhận Sidebar đổi.
- [ ] Sửa liên tiếp ít nhất năm ô Customer, xác nhận chỉ có một lượt reload sau edit cuối.
- [ ] Sửa một ô Activity rồi rời sheet trước ba giây, xác nhận reload ngay.
- [ ] Sửa hàng 2 Customer, xác nhận không reload.
- [ ] Sửa hàng 3 Customer, xác nhận không reload.
- [ ] Đổi hàng 1 Customer, xác nhận full core.
- [ ] Sửa Category, xác nhận danh mục Sidebar đổi.
- [ ] Sửa Config, xác nhận full core an toàn.
- [ ] Đứng ở một view, sửa hàng 3 dưới cột hợp lệ, xác nhận tất cả view được vẽ.
- [ ] Sửa hàng 3 dưới cột thường, xác nhận không vẽ.
- [ ] Lưu từ Sidebar, xác nhận Store và tất cả view đổi.
- [ ] Tắt auto render, lưu từ Sidebar, xác nhận view giữ cờ bẩn.
- [ ] Bật auto render lại, xác nhận tất cả view được vẽ ngay.
- [ ] Chạy pull FBM có ghi nội dung, xác nhận Sidebar/view đổi.
- [ ] Chạy push FBM có ghi trạng thái, xác nhận Sidebar/view đổi.
- [ ] Chạy trường hợp conflict/missing/retry, xác nhận vẫn reload và vẽ.
- [ ] Đóng Sidebar, chạy đồng bộ nền, mở lại Sidebar, xác nhận revision mới được xử lý.
- [ ] Mở hai Sidebar nếu môi trường cho phép, xác nhận Sidebar thứ hai không mất tín hiệu của Sidebar thứ nhất.
- [ ] Gây lỗi validation, xác nhận không mất dirty state thành công trước đó.
- [ ] Bấm từng lựa chọn Nạp lại toàn bộ, sheet hiện tại và bốn sheet cụ thể, đối chiếu kết quả.

## Slice R9 — Điều kiện đóng

- [ ] Không còn mục bắt buộc chưa có bằng chứng.
- [ ] Tài liệu ghi rõ không polling định kỳ trong luồng bình thường; chỉ có kiểm tra dự phòng khi mất kênh event.
- [ ] Không còn đường ghi Customer/Activity thành công nào không đi qua signal chung.
- [ ] Không còn client tự phân loại cột `@`.
- [ ] Không còn renderer chỉ vẽ view active sau signal dữ liệu.
- [ ] Không còn thao tác clear dirty không kiểm revision.
- [ ] Tổng kết test offline và GAS DEV được ghi vào commit bàn giao.
- [ ] Chủ dự án xác nhận nghiệm thu Sheet DEV cho các ca cần giữ tab hoặc đăng nhập.

---
