# Checklist triển khai Reload RAM và Sheet quản trị

> Checklist này triển khai `07A. Hợp đồng Reload RAM và Sheet quản trị.md`. Chưa được đánh dấu `[x]` nếu chưa có bằng chứng từ test offline, GAS DEV hoặc nghiệm thu thao tác trên Sheet DEV. Không dùng Sheet có dữ liệu khách thật.

## Quy ước bằng chứng

- `[ ]` Chưa làm hoặc chưa có bằng chứng.
- `[x]` Đã làm và có đường dẫn test/commit hoặc kết quả GAS DEV kèm theo.
- Mỗi mục phải ghi một kết quả quan sát được, không chỉ ghi “đã sửa code”.
- Mọi mục có chữ “live” chỉ hoàn thành sau khi chủ dự án tự giữ tab FBM/Sheet DEV và xác nhận thao tác.

## Slice R0 — Chốt hợp đồng và phạm vi

### Tài liệu nguồn

- [x] Đọc và đối chiếu `07A. Hợp đồng Reload RAM và Sheet quản trị.md` với ma trận đã chốt trong trao đổi (hợp đồng và checklist đã cập nhật).
- [x] Xác nhận bốn sheet mặc định là `Customer`, `Activity`, `Category`, `Config` (test hộp cát và `Settings`).
- [x] Xác nhận mọi sheet tên bắt đầu bằng `!` là sheet quản trị (`Triggers`/`ViewSheetRenderer`).
- [x] Xác nhận `full core` luôn gọi lại `loadCore`, dựng lại Store/Schema/Category/Config và chỉ mục tìm kiếm (test bootstrap/refresh).
- [x] Xác nhận reload đúng mã phải trả cả mã không còn tồn tại để client xóa khỏi RAM (test `loadService.js`, `refresh.js`).
- [x] Xác nhận GAS là nơi duy nhất phân loại cột `@` hợp lệ (test `triggers.js`, hợp đồng 07A).
- [x] Xác nhận mọi view đều được vẽ lại khi nguồn Customer/Activity đổi; phiên đầu không suy dependency riêng từng view (test `triggers.js`, `viewRenderer.js`).
- [x] Xác nhận pull, push, retry, verify, baseline, conflict, missing và background đều phải qua tín hiệu chung sau ghi thành công (test `reloadGates.js`, checklist Slice 0 FBM).
- [x] Xác nhận `ReloadDecision` là module quyết định chung; module nhận input đầy đủ và trả quyết định riêng cho RAM, view và signal, không tự ghi hay tự vẽ (test `reloadDecision.js`, `writeGateAudit.js`).
- [x] Xác nhận code hiện tại không có một cờ toàn cục tên `sidebarDirty`; bản nháp Sidebar nằm theo form ở `ScreenState.formStack[].draft` và các state draft riêng của màn đồng bộ (audit code và hợp đồng 07A).
- [x] Xác nhận `localDraft` chỉ là input tùy chọn do Sidebar truyền khi cần bảo vệ bản nháp, không được ghi vào `DocumentProperties` và không làm chậm render server-side (test `reloadDecision.js`).

### Quyết định không được thay đổi khi đang code

- [x] Không dùng sheet quản trị làm nguồn sự thật (test `viewRenderer.js`).
- [x] Không đọc ngược dữ liệu từ hàng 4 trở xuống của sheet quản trị về Customer/Activity (test `viewRenderer.js`).
- [x] Không để Extension tự đọc hàng 1 hoặc hàng 3 để quyết định cột hợp lệ (hợp đồng 07A và đường GAS `Triggers`).
- [x] Không xóa dirty state dùng chung chỉ vì một Sidebar đã đọc hoặc đã reload (revision guard trong `dirtyState.js`).
- [x] Không coi ghi trạng thái đồng bộ là “không đổi nội dung” để bỏ qua reload (test status trong `reloadGates.js`).
- [x] Không để GAS chờ Sidebar, Extension hoặc focus của người dùng trước khi vẽ sheet quản trị (test `triggers.js`, `reloadGates.js`).

## Slice R1 — ReloadState bền vững trên GAS

### Hình dạng và khóa

- [x] Có khóa revision tăng đơn điệu trong `DocumentProperties` (test `reloadGates.js`, `dirtyState.js`).
- [x] Có khóa changedAt ghi epoch milliseconds cùng revision (test `dirtyState.js`, hàm `probeDirtyState`).
- [x] Có danh sách mã Customer/Activity bẩn, hợp nhất không trùng và có giới hạn kích thước (test `dirtyState.js`, `loadService.js`).
- [x] Có cờ dirty Category riêng (test `dirtyState.js`, `loadService.js`).
- [x] Có cờ dirty Config riêng (test `dirtyState.js`, `reloadGates.js`).
- [x] Có cờ dirty Schema riêng cho hàng 1 bốn sheet mặc định (test `triggers.js`).
- [x] Có cờ `allCore` để bắt buộc full core (test `dirtyState.js`, `reloadDecision.js`).
- [x] Có cờ `allViews` để bắt buộc vẽ toàn bộ view (test `viewRenderer.js`, `reloadGates.js`).
- [x] Có danh sách view bẩn để tương thích và chẩn đoán từng sheet (test `dirtyState.js`, `viewRenderer.js`).
- [ ] Giữ alias cũ trong giai đoạn chuyển tiếp nhưng không để alias làm mất scope mới.

### Tính nguyên tử và phục hồi

- [x] Một lần phát tín hiệu chỉ tăng revision một lần (test `reloadGates.js`: batch nhiều mã).
- [x] Nhiều mã trong cùng signal được hợp nhất trước khi ghi thuộc tính (test `dirtyState.js`, `reloadGates.js`).
- [x] Danh sách vượt ngưỡng chuyển sang `allCore`, xóa danh sách mã và không phình thuộc tính (test `dirtyState.js`).
- [x] Đọc thuộc tính hỏng trả về trạng thái an toàn, không làm sập phản hồi Sidebar (test `dirtyState.js`).
- [x] Lượt reload ghi nhớ revision bắt đầu (guard `LoadService.js`/renderer, test `dirtyState.js`).
- [x] Nếu revision đổi trong lúc reload, lượt cũ không xóa cờ của lượt mới (test `dirtyState.js`, revision-guard renderer).
- [x] Xóa cờ chỉ xảy ra sau khi đọc/vẽ thành công (renderer giữ cờ khi lỗi).
- [x] Lỗi ghi không xóa dirty state cũ (test `reloadGates.js`).
- [x] Có hàm nghiệm thu in revision, changedAt và từng scope (`probeDirtyState`, `probeTriggerState`).

### Kiểm thử offline R1

- [x] Sheet mới trả ReloadState rỗng, revision hợp lệ (test `dirtyState.js`).
- [x] JSON hỏng trong khóa danh sách không làm `reloadStateRead` ném lỗi (test `dirtyState.js`; parser dùng chung cho mọi scope).
- [x] Đánh dấu lặp cùng một mã chỉ giữ một mã (test `dirtyState.js`).
- [x] Đánh dấu vượt ngưỡng chuyển đúng sang full core (test `dirtyState.js`).
- [x] Đánh dấu Category không bật nhầm Config khi DTO mới cần phân biệt (test `loadService.js`).
- [x] Đánh dấu Schema luôn bật full core và allViews (test `reloadDecision.js`, `triggers.js`).
- [x] Đọc ReloadState không xóa dữ liệu thuộc tính (test `dirtyState.js`).
- [ ] Hai hộp cát đọc cùng một revision không làm hộp thứ hai mất tín hiệu.
- [x] Revision mới phát sinh trong lúc clear không bị xóa (test `dirtyState.js`).

## Slice R2 — GAS phân loại onEdit

### Bốn sheet mặc định

- [x] Hàng 1 Customer đổi mã `@` tạo schema + allCore + allViews (test `triggers.js`).
- [x] Hàng 1 Activity đổi mã `@` tạo schema + allCore + allViews (test `triggers.js`).
- [x] Hàng 1 Category đổi mã `@` tạo schema + allCore + allViews (test `triggers.js`).
- [x] Hàng 1 Config đổi mã `@` tạo schema + allCore + allViews (test `triggers.js`).
- [x] Hàng 2 chỉ đổi nhãn không tạo dirty (test `triggers.js`).
- [x] Hàng 3 chỉ là ghi chú và không tạo dirty (test `triggers.js`).
- [x] Hàng dữ liệu Customer dưới cột schema hợp lệ ghi đúng mã bản ghi (test `triggers.js`).
- [x] Hàng dữ liệu Activity dưới cột schema hợp lệ ghi đúng mã bản ghi (test `triggers.js`).
- [x] Hàng dữ liệu Customer/Activity dưới cột thường không tạo dirty (test `triggers.js`).
- [x] Sửa một vùng nhiều hàng nhiều cột chỉ gom các mã hợp lệ, bỏ mã rỗng (chuẩn hóa scope trong `ReloadDecision`/`DirtyState`, test `reloadDecision.js`, `dirtyState.js`).
- [x] Category hàng dữ liệu tạo dirtyCategory + allViews (test `triggers.js`).
- [x] Config hàng dữ liệu tạo dirtyConfig + allViews (test `triggers.js`).

### Sheet quản trị

- [x] Đổi hàng 1 của một view gọi vẽ toàn bộ view (test `triggers.js`).
- [x] Thêm mã `@` vào hàng 1 gọi vẽ toàn bộ view (đường row 1 của `triggers.js`).
- [x] Đổi `@A` thành `@B` gọi vẽ toàn bộ view (đường row 1 bảo thủ của `Triggers.js`).
- [x] Đổi mã `@` thành giá trị thường gọi vẽ toàn bộ view (đường row 1 bảo thủ của `Triggers.js`).
- [x] Xóa mã ở hàng 1 gọi vẽ toàn bộ view (đường row 1 bảo thủ của `Triggers.js`).
- [x] Sửa hàng 3 dưới cột `@CUS_`/`@ACT_` hợp lệ gọi vẽ toàn bộ view (test `triggers.js`).
- [x] Sửa hàng 3 dưới cột thường không gọi vẽ (test `triggers.js`).
- [x] Sửa hàng 4 trở xuống không đọc ngược và không tự vẽ (test `viewRenderer.js`).
- [x] Ngoại lệ được kiểm: hàng 4 trở xuống của `@VIEW_SORT_COL`/`@VIEW_SORT_LEVEL` là cấu hình sắp xếp nên vẫn vẽ toàn bộ view; cột dữ liệu CRM từ hàng 4 trở xuống không vẽ (test `triggers.js`, `viewRenderer.js`).
- [x] Mã `@VIEW_` hoặc mã không hợp lệ không bị coi là cột dữ liệu để reload RAM (test `reloadDecision.js`, `triggers.js`).
- [ ] Trigger installable được cài và không tạo bản sao khi chạy lại hàm cài.
- [ ] Trigger script ghi view không tự tạo vòng lặp onEdit.

### Kiểm thử offline R2

- [x] Bổ sung ca cho cả bốn hàng 1 mặc định (test `triggers.js`).
- [x] Bổ sung ca hàng 2 và hàng 3 mặc định (test `triggers.js`).
- [x] Bổ sung ca cột hợp lệ/không hợp lệ ở Customer và Activity (test `triggers.js`, `reloadDecision.js`).
- [x] Bổ sung ca view hàng 1, hàng 3 cột `@` và hàng 3 cột thường (test `triggers.js`).
- [x] Kiểm số lần gọi renderer là một lượt vẽ toàn bộ, không chỉ view đang active (test `triggers.js`, `viewRenderer.js`).

## Slice R3 — Cổng ghi chung và đồng bộ FBM

### `writeGateSave`

- [x] Sau `flush` và đọc lại thành công, phát signal cho mọi id trong batch; signal được ghi trong document lock và renderer chạy sau khi nhả khóa.
- [x] Signal chạy cho `source: user`.
- [x] Signal chạy cho `source: pull`.
- [x] Signal chạy cho `source: push`; các call site trong `PushFlow` không còn gắn nhãn `pull`.
- [x] Signal chạy cho `source: background` không có Sidebar (test cửa ghi offline).
- [x] Batch Customer mới phát tín hiệu bằng mã vừa cấp.
- [x] Batch Activity mới phát tín hiệu bằng mã vừa cấp.
- [x] Batch chỉ ghi baseline phát tín hiệu.
- [x] Batch chỉ ghi sync status phát tín hiệu.
- [x] Batch chỉ ghi conflict/missing/retry/error phát tín hiệu.
- [x] Batch lỗi validation không phát tín hiệu thành công (test `reloadGates.js`).
- [x] Lỗi hạ tầng không xóa signal cũ (test renderer lỗi trong `reloadGates.js`).
- [x] Batch cấp mã làm đổi Config phát `config + allCore + allViews`, RAM dùng `fullCore` và không giữ counter cũ (test `reloadGates.js`).
- [x] `fbmEnsureSyncColumns` ghi thêm mã cột bằng GAS phải khóa, flush và phát `schema` + `allCore` + `allViews`, kể cả khi Sidebar đóng.

### Cửa xóa và đường ghi đặc biệt

- [x] Xóa mềm phát signal cho mã bị đổi trạng thái.
- [x] Xóa hẳn phát signal cho mã đã biến mất để client xóa khỏi Store.
- [x] Không có đường mutator Customer/Activity ngoài cổng ghi hoặc cửa xóa đã phát signal (audit tĩnh quét cả ghi giá trị/công thức/ghi chú/định dạng và thao tác cấu trúc).
- [x] Pull dùng signal chung, không tự thao tác JSON dirty riêng (đã bỏ đánh dấu lặp sau `writeGateSave`).
- [x] Push dùng signal chung, không bỏ qua vì chỉ đổi trạng thái.
- [x] Background dùng signal chung dù Sidebar đóng.

### Kiểm kê mọi đường ghi xuống Sheet

- [x] Đối chiếu toàn bộ lệnh ghi trong `1_ShinCRM_GAS` với bảng phân loại ở Tài liệu 06 Phần 8 (test tĩnh `writeGateAudit.js`).
- [x] Xác nhận `WriteGate.js` và `DeleteGate.js` là hai cửa public duy nhất cho dữ liệu bản ghi `Customer` và `Activity`.
- [x] Xác nhận `IdGate.js` chỉ được gọi từ `WriteGate` trong cùng document lock; không có entry point runtime độc lập cấp mã hoặc ghi bộ đếm.
- [x] Xác nhận mọi hậu xử lý sau ghi bản ghi, xóa, Config và schema đều đi qua `WriteCommit.js` (test tĩnh + commit `c01b277`).
- [x] Xác nhận `ConfigSheetSetup.js` có ranh giới riêng cho setup/migration và đường runtime reset Config; đường runtime phát signal Config sau flush thành công.
- [x] Xác nhận `fbm_sync/SyncSchema.js` là cửa schema riêng, không bị nhầm là cửa ghi bản ghi; thêm cột sync phát `schema + allCore + allViews`.
- [x] Xác nhận `ViewSheetRenderer.js` là writer đầu ra có kiểm soát; chỉ xóa cờ view sau khi ghi và flush thành công, không tạo dirty bản ghi nguồn.
- [x] Xác nhận `ViewSheetSetup.js` và `SetupSheets.js` chỉ phục vụ cấu trúc/khởi tạo, không được gọi để ghi dữ liệu nghiệp vụ trong runtime.
- [x] Xác nhận `LogGate.js` là cửa hạ tầng độc lập; ghi `Log` không làm tăng revision dữ liệu nghiệp vụ và không gọi vòng lại `WriteCommit`.
- [x] Xác nhận `SheetIo.js` chỉ đọc; `SheetIoProbe.js` và toàn bộ `server/dev/*` chỉ chứa probe/DEV, có allowlist rõ và không được coi là đường runtime production.
- [x] Thêm kiểm thử tĩnh quét writer runtime, báo đỏ khi xuất hiện thao tác ghi ngoài allowlist hoặc thêm file writer chưa được phân loại.
- [x] Allowlist không còn bỏ sót biến thể mutator phổ biến (`setValues`, `clearContents`, `setNotes`, định dạng, nới/co lưới, tạo/xóa sheet); thêm writer hoặc biến thể mới phải làm bộ kiểm đỏ cho tới khi được phân loại.
- [x] Các cửa ghi nguồn, Config và schema fail-fast trước khi ghi nếu thiếu `WriteCommit`/`ReloadDecision`/`DirtyState`; không chấp nhận ghi thành công nhưng không phát signal.
- [x] Xác nhận `SheetColumnWriter.js` không còn tồn tại và không còn caller runtime; đây là helper mồ côi của CategorySync cũ, không phải một cửa cần gom vào `WriteGate`.
- [x] Ghi kết quả audit (danh sách file, hàm, sheet bị chạm và lý do ngoại lệ) vào commit `a3dd857`.

### Kiểm thử offline R3

- [x] Save user cập nhật dirty records và allViews (test `reloadGates.js`).
- [x] Delete soft cập nhật dirty records và allViews (test `reloadGates.js`).
- [x] Delete hard cập nhật dirty records và allViews (test `reloadGates.js`).
- [x] Pull nội dung cập nhật dirty records (test `reloadGates.js`).
- [x] Push success cập nhật dirty records (test `reloadGates.js`).
- [x] Push verify/error/conflict/missing cập nhật dirty records (test ghi trạng thái qua `WriteGate` trong `reloadGates.js`).
- [x] Ghi thất bại giữ nguyên dirty state trước đó (test `reloadGates.js`).
- [x] Kiểm một batch nhiều mã chỉ tăng một revision, hợp nhất mã và không trùng mã (test `reloadGates.js`).

## Slice R4 — API reload theo scope

### `reloadRecords`

- [x] API nhận mảng mã và chuẩn hóa chuỗi, loại mã trùng (test `loadService.js`: scope có khoảng trắng/mã lặp).
- [x] API đọc đúng Customer được yêu cầu (test `loadService.js`: chỉ trả `KH-SCOPE-1`).
- [x] API đọc Activity được yêu cầu (test `loadService.js`: trả `GD-SCOPE-2`).
- [x] API kéo theo mọi Activity của Customer bị ảnh hưởng (test `loadService.js`: kéo cả `GD-SCOPE-1` và `GD-SCOPE-2`).
- [x] API trả danh sách mã Customer bị ảnh hưởng (test `loadService.js`: `affectedCustomerIds`).
- [x] API trả dấu hiệu record đã biến mất để client remove (test `loadService.js`: `KH-MISSING`).
- [x] API không trả dữ liệu thừa của toàn bộ kho khi scope nhỏ (test `loadService.js`: không có `KH-SCOPE-2`/`GD-OTHER`).
- [x] API nhận expected revision và không clear nếu revision đã đổi (test `loadService.js`: revision 9, expected 8 giữ `dirtyRecords`).
- [x] API fallback full core khi mã không xác định, scope lỗi hoặc vượt ngưỡng (test `loadService.js`: scope rỗng/vượt trần).
- [x] API trả ReloadState mới nhất trong mọi nhánh thành công (test `loadService.js`: scope, stale và fullCore đều có `reload`).

### Category và Config

- [x] Có API reload Category riêng (entrypoint `reloadCategory`, test `loadService.js`).
- [x] Category reload thành công xóa đúng dirtyCategory, không xóa cờ mới (test `loadService.js`: `category=false`, `config=false`).
- [x] Có API reload Config hoặc trả yêu cầu full core rõ ràng (entrypoint `reloadConfig`, trả `reloadMode: 'fullCore'`, test `loadService.js`).
- [x] Config reload không làm Schema/Config defaults trong RAM lệch nhau (Config luôn yêu cầu full core, test `loadService.js`).
- [x] Đổi schema luôn fallback full core (test `reloadDecision.js`: schema có `ram.mode: 'fullCore'`; test `reloadGates.js`: signal `allCore`).
- [x] Có API `getReloadState` dùng khi nhận event, lúc mở Sidebar và tại các điểm kiểm tra tự nhiên (test `loadService.js`, `selectionPoll.js`).
- [x] Có event reload tức thời qua kênh Extension/Sidebar; event chỉ là tín hiệu đánh thức, không phải nguồn dữ liệu (test `selectionPoll.js`).
- [x] Có API render toàn bộ managed views và trả kết quả từng sheet (test `viewRenderer.js`).

### Nút thủ công

- [x] `Nạp lại toàn bộ` gọi full core (action `reloadAll`, test `actions.js`).
- [x] `Nạp lại sheet hiện tại` nhận đúng sheet active từ GAS (API `reloadCurrentSheet`, test `loadService.js`).
- [x] Current Customer reload đúng scope Customer (API `reloadCustomer`, test `loadService.js`, `refresh.js`).
- [x] Current Activity reload đúng scope Activity (API `reloadActivity`, test `loadService.js`, `refresh.js`).
- [x] Current Category reload đúng scope Category (API `reloadCategory`, test `loadService.js`).
- [x] Current Config dùng full core an toàn (API `reloadConfig`, test `loadService.js`).
- [x] Current managed view vẽ lại theo chính sách và đối chiếu allViews (API `reloadCurrentSheet`, test `loadService.js`).
- [x] Có bốn lệnh nạp sheet cụ thể Customer/Activity/Category/Config (UI schema và test `actions.js`).
- [x] Menu không mở thêm đường ghi dữ liệu ngoài API đã có (các action chỉ gọi API đọc/reload).

## Slice R5 — Client event reload, debounce và cập nhật Store

### Theo dõi revision

- [x] Sidebar đăng ký listener event reload trước khi nạp core để không bỏ event sớm, chỉ kích hoạt xử lý sau khi `SHEET_LINK_RAM_READY=true` (test `selectionPoll.js`).
- [x] Sidebar kiểm tra ReloadState lúc mở lại qua gói `loadCore` (test `loadService.js`: mọi gói core mang `reload`).
- [x] Sidebar kiểm tra sau mỗi lời gọi máy chủ qua `sheetLinkObserveReloadPayload` (không áp dụng đệ quy cho `getReloadState`/`reloadRecords`).
- [x] Sidebar kiểm tra khi lấy focus/tab hiện lại qua các điểm đánh thức tự nhiên của `selectionPoll` (test `selectionPoll.js`).
- [x] Không có timer polling ReloadState trong luồng bình thường; chỉ có debounce một lần sau edit và kiểm tra tại điểm tự nhiên (test `selectionPoll.js`).
- [x] Event reload không tạo vòng chồng khi request trước chưa xong (guard `SHEET_LINK_DATA_PENDING`/`SHEET_LINK_RELOAD_CHECKING`, test `selectionPoll.js`).
- [x] Event lỗi không làm Sidebar treo; lỗi chỉ cảnh báo và lần event/điểm kiểm tra sau vẫn chạy (handler `CRM_RELOAD`, test `selectionPoll.js`).
- [x] `lastSeenRevision` chỉ sống trong Sidebar, không ghi đè DocumentProperties.

### Debounce sửa tay

- [x] `onEdit` đầu tiên không reload ngay nếu người dùng còn ở Customer/Activity; chỉ đặt timer khi context kết thúc edit.
- [x] Mỗi edit mới reset mốc chờ ba giây (`sheetLinkScheduleDirtyCheck` hủy timer cũ trước khi đặt timer mới).
- [x] Hết ba giây từ edit cuối gọi một lượt kiểm tra/reload.
- [x] Nhiều mã trong khoảng chờ được hợp nhất ở `ReloadState`/`reloadRecords` trước khi đọc.
- [x] Request đang bay không bị gọi trùng (`SHEET_LINK_DATA_PENDING` và `SHEET_LINK_RELOAD_CHECKING`).
- [x] Rời Customer/Activity trước ba giây gọi reload ngay và hủy timer debounce còn lại.
- [x] Rời sheet khi không có dirty không gọi reload dữ liệu thừa sau lượt kiểm tra (API trả `null`).
- [ ] Sửa cột không hợp lệ không khởi động debounce (Extension không được tự phân loại cột; GAS sẽ trả scope rỗng, cần nghiệm thu/điểm giao tiếp riêng).

### Cập nhật RAM

- [x] Customer còn tồn tại được upsert bằng bản ghi máy chủ trả về (test `refresh.js`).
- [x] Customer biến mất được remove (test `refresh.js`).
- [x] Activity còn tồn tại được upsert (test `refresh.js`).
- [x] Activity biến mất được remove (test `refresh.js`).
- [x] Activity của Customer bị ảnh hưởng được tính lại danh sách (server trả trọn Activity của Customer, test `loadService.js`).
- [x] Search index được cập nhật sau upsert/remove (đường `Store.upsertRecord`/`removeRecord`, test `refresh.js` và `ramStore.js`).
- [x] Màn hiện tại được vẽ lại sau reload (test `refresh.js`).
- [x] Full core dựng lại Schema, Category, Config và search index từ đầu (đường `refreshFullCore`, test bootstrap/load).
- [x] Reload Category cập nhật danh mục SELECT đang dùng (test `refresh.js`).
- [x] Config đổi làm client dùng cấu hình mới, không giữ bản cũ (Config luôn chuyển `fullCore`, test `loadService.js`).

### Kiểm thử offline R5

- [x] Ca nhiều edit chỉ gọi `reloadRecords` một lần (test `selectionPoll.js`).
- [x] Ca rời sheet trước đủ ba giây gọi reload ngay (test `selectionPoll.js`).
- [x] Ca revision đổi trong lúc request bay không mất mã mới (bounded follow-up trong `refresh.html`, test `selectionPoll.js`).
- [x] Ca event đang bay không tạo Promise thứ hai (test `selectionPoll.js`).
- [x] Ca record biến mất xóa đúng Store và search index (test `refresh.js`, `ramStore.js`).
- [x] Ca full core sau schema đổi xóa Store cũ trước khi ingest (test `refresh.js`, `reloadDecision.js`).
- [x] Ca Category đổi cập nhật dropdown (test `refresh.js`).
- [x] Ca Config đổi cập nhật default/counter/sort qua chỉ thị full core (test `refresh.js`; server không vá từng khối để tránh lệch).
- [x] Ca Sidebar không có bản nháp nhận quyết định `reload` theo scope (test `reloadDecision.js`).
- [x] Ca Sidebar có bản nháp đúng mã nhận quyết định bảo vệ bản nháp (`defer` hoặc yêu cầu xác nhận), không bị đè RAM âm thầm (test `reloadDecision.js`).
- [x] Ca Sidebar có bản nháp không liên quan vẫn reload được mã khác trong cùng signal (test `reloadDecision.js`).
- [x] Ca `localDraft` không ảnh hưởng quyết định GAS render toàn bộ view (test `reloadDecision.js`).

## Slice R6 — Vẽ toàn bộ sheet quản trị

### Đường chạy độc lập với Sidebar

- [x] `onEdit` hợp lệ ở Customer/Activity đánh dấu allViews và gọi render server-side khi chính sách cho phép (test `triggers.js`).
- [x] Module `ReloadDecision` được gọi với input đầy đủ trước khi trigger/cửa ghi thực thi signal hoặc render (test `reloadDecision.js`, `writeGateAudit.js`).
- [x] Lượt render không nhận Sidebar state vẫn trả quyết định render toàn bộ view bình thường (test `viewRenderer.js`).
- [x] Pull thành công gọi render server-side khi chính sách cho phép dù Sidebar đóng (test `reloadGates.js`).
- [x] Push thành công gọi render server-side khi chính sách cho phép dù Sidebar đóng (test `reloadGates.js`).
- [x] Baseline/conflict/missing/retry/status chỉ đổi trạng thái vẫn gọi render server-side (test `reloadGates.js`).
- [x] Sheet quản trị đang active hay không không ảnh hưởng việc render (test `viewRenderer.js`, `triggers.js`).
- [x] Spreadsheet có mở Sidebar hay không không ảnh hưởng việc render (test `triggers.js`).
- [x] Khi chính sách tắt, server không render nhưng giữ allViews bền vững (test `viewRenderer.js`).
- [x] Khi chính sách bật lại, một lệnh server-side render toàn bộ view được gọi ngay, không chờ Sidebar (test `viewRenderer.js`).
- [x] Lỗi một view giữ cờ của view lỗi và không xóa allViews khi chưa hoàn tất (test `viewRenderer.js`).

### Renderer

- [x] Có hàm `renderAllManagedViews` duyệt mọi sheet `!` và trả kết quả từng sheet (test `viewRenderer.js`).
- [x] Nguồn Customer/Activity đổi thì renderer không chỉ vẽ sheet active (test `triggers.js`).
- [x] Hàng 1 view đổi thì renderer vẽ toàn bộ view (test `triggers.js`).
- [x] Hàng 3 hợp lệ đổi thì renderer vẽ toàn bộ view (test `triggers.js`).
- [x] Hàng 3 cột thường không vẽ (test `triggers.js`, `selectionPoll.js`).
- [x] View lỗi filter/sort giữ dữ liệu cũ của chính view lỗi (test `viewRenderer.js`).
- [x] Cờ view lỗi vẫn còn sau lỗi (test `viewRenderer.js`).
- [x] View vẽ thành công xóa đúng cờ của view đó (test `viewRenderer.js`).
- [x] Toàn bộ lượt vẽ thành công xóa `allViews` (test `viewRenderer.js`).
- [x] Lượt vẽ không đọc ngược hàng 4 trở xuống làm nguồn sự thật (test `viewRenderer.js`).
- [x] Renderer vẫn dùng latest Activity còn sống (test `viewRenderer.js`: Activity deleted bị bỏ qua).
- [x] Renderer phủ lại cả dòng dữ liệu cũ thừa (test `viewRenderer.js`).

### Chính sách tự động

- [x] `autoRenderView=true` thì signal dữ liệu gọi vẽ toàn bộ view (test `reloadGates.js`, `triggers.js`).
- [x] `autoRenderView=false` thì vẫn giữ allViews (test `viewRenderer.js`).
- [x] Bật lại auto render lập tức đối chiếu dirty và vẽ toàn bộ view (test `viewRenderer.js`).
- [x] Tắt auto render không làm RAM giữ bản ghi cũ (test `reloadGates.js`, `refresh.js`).
- [x] Lệnh thủ công vẫn vẽ dù auto render tắt (đường `policyBypass`, test `viewRenderer.js`, `triggers.js`).
- [ ] Hai user/sidebar có prefs khác nhau không xóa dirty dùng chung sai cách.

### Kiểm thử offline R6

- [x] Hai view cùng nguồn đều được vẽ sau một ghi Customer (test `triggers.js`).
- [x] View không active vẫn được vẽ (test `viewRenderer.js`, `triggers.js`).
- [x] View có filter đổi vẫn vẽ (test `viewRenderer.js`).
- [x] View có sort chung Config đổi vẫn vẽ (test `viewRenderer.js`).
- [x] Một view lỗi không làm cờ của view khác bị xóa nhầm (test `viewRenderer.js`).
- [x] Bật lại công tắc sau khi tắt làm mọi view cập nhật (test `viewRenderer.js`).

## Slice R7 — Tài liệu, test và triển khai

- [x] Cập nhật `07A` khi có thay đổi hợp đồng, không ghi quyết định mới rải ở tài liệu khác (bảng API reload thủ công và đường view hiện tại).
- [x] Cập nhật tài liệu 05, 05A và 07 khi đổi tên API hoặc bất biến (API scope, hậu xử lý reload, renderer toàn bộ view).
- [x] Cập nhật mục liên quan trong `Checklist đồng bộ FBM.md` (Slice 0, tín hiệu sau ghi).
- [ ] Cập nhật `Cây thư mục code.md` nếu thêm tệp code.
- [x] Thêm ca test vào `tests/cases/dirtyState.js` (revision, scope, JSON hỏng và guard clear đã có).
- [x] Thêm ca test vào `tests/cases/triggers.js` (bốn sheet mặc định, vùng hợp lệ/không hợp lệ và toàn bộ view).
- [x] Thêm ca test vào `tests/cases/refresh.js` (entity và Config full core).
- [x] Thêm ca test cho cổng ghi/pull/push/background (gồm status push trong `reloadGates.js`).
- [x] Chạy `node tests/run.js`: `1556` đạt, `0` không đạt.
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
