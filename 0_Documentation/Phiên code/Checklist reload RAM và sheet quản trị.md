# Checklist triển khai Reload RAM và Sheet quản trị

> Checklist này triển khai `07A. Hợp đồng Reload RAM và Sheet quản trị.md`. Chưa được đánh dấu `[x]` nếu chưa có bằng chứng từ test offline, GAS DEV hoặc nghiệm thu thao tác trên Sheet DEV. Không dùng Sheet có dữ liệu khách thật.

## Quy ước bằng chứng

- `[ ]` Chưa làm hoặc chưa có bằng chứng.
- `[x]` Đã làm và có đường dẫn test/commit hoặc kết quả GAS DEV kèm theo.
- Mỗi mục phải ghi một kết quả quan sát được, không chỉ ghi “đã sửa code”.
- Mọi mục có chữ “live” chỉ hoàn thành sau khi chủ dự án tự giữ tab FBM/Sheet DEV và xác nhận thao tác.

## Slice R0 — Chốt hợp đồng và phạm vi

### Tài liệu nguồn

- [x] Đọc và đối chiếu `07A. Hợp đồng Reload RAM và Sheet quản trị.md` với ma trận đã chốt; hợp đồng chỉ giữ bản tóm tắt, chi tiết đã chuyển sang Tài liệu 05, 05A, 07 và bản ghi quyết định triển khai.
- [x] Xác nhận bốn sheet mặc định là `Customer`, `Activity`, `Category`, `Config` (test hộp cát và `Settings`).
- [x] Xác nhận mọi sheet tên bắt đầu bằng `!` là sheet quản trị (`Triggers`/`ViewSheetRenderer`).
- [x] Xác nhận `full core` luôn gọi lại `loadCore`, dựng lại Store/Schema/Category/Config và chỉ mục tìm kiếm (test bootstrap/refresh).
- [x] Xác nhận reload đúng mã phải trả cả mã không còn tồn tại để client xóa khỏi RAM (test `loadService.js`, `refresh.js`).
- [x] Xác nhận GAS là nơi duy nhất phân loại cột `@` hợp lệ (test `triggers.js`, hợp đồng 07A).
- [x] Xác nhận mọi view đều được vẽ lại khi nguồn Customer/Activity đổi; phiên đầu không suy dependency riêng từng view (test `triggers.js`, `viewRenderer.js`).
- [x] Xác nhận pull, push, retry, verify, baseline, conflict, missing và background đều phải qua tín hiệu chung sau ghi thành công (test `reloadGates.js`, checklist Slice 0 FBM).
- [x] Xác nhận `ReloadDecision` là module quyết định chung; module nhận input đầy đủ và trả quyết định riêng cho RAM, view và signal, không tự ghi hay tự vẽ (hợp đồng 07A và bản ghi quyết định triển khai).
- [x] Xác nhận code hiện tại không có một cờ toàn cục tên `sidebarDirty`; bản nháp Sidebar nằm theo form ở `ScreenState.formStack[].draft` và các state draft riêng của màn đồng bộ (audit code và hợp đồng 07A).
- [x] Xác nhận `localDraft` chỉ là input tùy chọn do Sidebar truyền khi cần bảo vệ bản nháp, không được ghi vào `DocumentProperties` và không làm chậm render server-side (test `reloadDecision.js`).

### Quyết định không được thay đổi khi đang code

- [x] Không dùng sheet quản trị làm nguồn sự thật (test `viewRenderer.js`).
- [x] Không đọc ngược dữ liệu từ hàng 4 trở xuống của sheet quản trị về Customer/Activity (test `viewRenderer.js`).
- [x] Không để Extension tự đọc hàng 1 hoặc hàng 3 để quyết định cột hợp lệ; Extension chỉ gửi context/keydown, GAS quyết định (hợp đồng 07A và bản ghi quyết định triển khai).
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
- [x] Giữ alias cũ trong giai đoạn chuyển tiếp nhưng không để alias làm mất scope mới (DTO vẫn trả `reload` đầy đủ; test `loadService.js`).

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
- [x] Hai hộp cát đọc cùng một revision không làm hộp thứ hai mất tín hiệu (test `loadService.js`: hai sandbox dùng chung `DocumentProperties`, sandbox thứ hai vẫn nhận bản ghi sau lượt clear thứ nhất).
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
- [x] Trigger installable được cài và không tạo bản sao khi chạy lại hàm cài (test `triggers.js`: cài hai lần vẫn chỉ có `shinOnEdit` và `shinOnChange`, trigger khác được giữ nguyên).
- [x] Trigger script ghi view không tự tạo vòng lặp onEdit (test `triggers.js`: renderer không gọi ngược `shinOnEdit`).

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
- [x] Thiết kế và triển khai API một request `probeSelectionAndReload(input)`: trả context hiện tại, mã khách khi vị trí đổi, `ReloadState` và quyết định RAM; không bắt buộc chuỗi `probeSelectionCheap` → `probeSelectionFull` qua mạng (server `SelectionService.js`, test `selectionService.js`).
- [ ] Nâng `probeSelectionAndReload` thành cổng quyết định + thực thi reload: khi `defer` chỉ trả `waitMs`/`readyAt`; khi đủ thời gian phải trả payload reload trong chính response, không để Sidebar gọi API reload thứ hai.
- [x] GAS tự so `selectionContext` với `previousSelectionContext`; vị trí không đổi thì trả mã khách cũ và không đọc lại ô mã; vị trí đổi thì mới tra cột mã theo schema (test `selectionService.js`).
- [x] Response selection/reload chạy im lặng và luôn kèm `ReloadState`; không dùng producer `CRM_RELOAD` làm đường bắt buộc (server `SelectionService.js`, client request `silent`).
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

### Theo dõi revision và wake request

- [x] Sidebar giữ `previousSelectionContext`, `previousCustomerId`, `lastSeenRevision`, `localDraft` và các timer trong state của chính trang đó (client `sheetLink.html`).
- [x] Extension chỉ gửi context selection và hint `position`/`keydown`; bỏ hoàn toàn suy đoán `isEditing`, đọc thanh công thức và đường `true -> false` (Extension `sheet_scout.js`, test `extensionBridge.js`).
- [x] Sau một giây yên lặng kể từ hint cuối, Sidebar gọi một request kiểm tra im lặng; không bật progress bar cho request không reload (client `sheetLink.html`, test `selectionPoll.js`).
- [x] Sidebar không tự đọc hàng 1/hàng 3, không tự phân loại cột `@`, không tự chọn API reload (GAS `SelectionService`/`ReloadDecision`, test `selectionService.js`, `triggers.js`).
- [x] Request đang bay có guard, hint mới được giữ lại để xử lý sau và không tạo Promise chồng (test `selectionPoll.js`).
- [x] Lỗi wake request không làm Sidebar treo; lần hint/safety poll kế tiếp vẫn có thể chạy (client `sheetLink.html`/`selectionPoll.html`, test `selectionPoll.js`).
- [x] `lastSeenRevision` và context selection chỉ sống trong Sidebar, không ghi đè `DocumentProperties` dùng chung (client `sheetLink.html`, test `selectionPoll.js`).
- [x] Safety polling thưa theo `SETTINGS` được reset sau mọi request hỏi GAS thành công; không tạo request riêng khi fallback selection probe vừa chạy (client `selectionPoll.html`, test `selectionPoll.js`).

### Debounce sửa tay

- [x] GAS `onEdit` là nguồn sự thật duy nhất cho sửa tay; không cần Extension báo “kết thúc edit” (server `Triggers.js`, test `triggers.js`).
- [x] Mỗi signal Customer/Activity ghi `changedAt`; Sidebar chỉ reload RAM khi đủ ba giây từ `onEdit` cuối (server `DirtyState`/`ReloadDecision`, test `dirtyState.js`, `selectionPoll.js`).
- [x] Nhiều mã trong khoảng ba giây được hợp nhất ở `ReloadState`/`reloadRecords`, chỉ một lượt reload (test `dirtyState.js`, `selectionPoll.js`).
- [x] Rời Customer/Activity trước ba giây gọi reload ngay và hủy timer còn lại (test `selectionPoll.js`).
- [x] Sửa cột không hợp lệ không tạo signal và không đặt timer reload RAM (test `triggers.js`).
- [x] `waitMs` do GAS trả được dùng để chờ đúng phần thời gian còn thiếu, không tự tính lại từ suy đoán của Extension (server `ReloadDecision`, client `sheetLink.html`, test `selectionPoll.js`).
- [x] Không nhầm debounce wake một giây với debounce dữ liệu ba giây (tài liệu 05/05A/07, test `selectionPoll.js`).

### Cập nhật RAM

- [x] Có một request `probeSelectionAndReload` bên ngoài thay cho chuỗi RPC `probeSelectionCheap` → `probeSelectionFull` (client/server, test `selectionPoll.js`, `selectionService.js`).
- [x] Khi selection không đổi, GAS trả context/mã khách cũ và không đọc lại ô mã khách (test `selectionService.js`).
- [x] Khi selection đổi, GAS tự tra schema và đọc mã khách trong cùng request; Extension vẫn giữ đường live model cũ khi nó đang hoạt động (test `selectionService.js`, `extensionBridge.js`).
- [ ] Response selection/reload luôn kèm `ReloadState`, `decision`, `payload`, `observedRevision`, `processedRevision` và trạng thái còn bẩn; Sidebar không tự quyết định scope và chỉ áp dụng payload (server `SelectionService.js`, test `selectionService.js`).
- [x] Context Extension có `customerId` hợp lệ được áp dụng ngay cho màn hình chính trước các RPC kiểm tra dirty; RPC chạy nền không chặn nguồn-chọn cục bộ (client `sheetLink.html`, test `selectionPoll.js`).
- [x] Fallback polling vị trí 2 giây rồi 6 giây gộp luôn kiểm tra reload, không tạo request kiểm tra thứ hai (test `selectionPoll.js`).
- [x] Safety polling theo phút chạy im lặng, chỉ phục vụ RAM và không kích hoạt renderer view (client `selectionPoll.html`, test `selectionPoll.js`).
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

- [ ] Ca nhiều edit chỉ có một payload reload do GAS trả trong request sẵn sàng; không có chuỗi `probeSelectionAndReload` → `reloadRecords` từ Sidebar (test `selectionPoll.js`, `selectionService.js`).
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

- [x] `onEdit`, `onChange`, `WriteGate` và `DeleteGate` đều gọi `ReloadDecision` với input đầy đủ trước khi ghi signal/render (test `triggers.js`, `reloadGates.js`, audit cửa ghi).
- [x] GAS gọi renderer ngay sau signal khi `autoRenderView=true`, kể cả Sidebar đóng, Extension mất kết nối hoặc Spreadsheet đang ở sheet khác (test `triggers.js`, `reloadGates.js`, `viewRenderer.js`).
- [x] Khi `autoRenderView=false`, GAS giữ cờ view bền vững; khi bật lại, chính GAS đối chiếu cờ và vẽ toàn bộ ngay, không chờ Sidebar (test `viewRenderer.js`).
- [x] Không dùng safety polling của Sidebar làm điều kiện hoặc đường chính để vẽ sheet quản trị (server renderer/trigger, test `viewRenderer.js`).
- [x] `onChange` xử lý thêm/xóa hàng/cột/sheet theo scope bảo thủ và không thay thế `onEdit` cho sửa giá trị ô (server `Triggers.js`, test `triggers.js`).
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
- [x] Hai user/sidebar có prefs khác nhau không xóa dirty dùng chung sai cách (test `viewRenderer.js`: user tắt auto-render giữ cờ, user bật auto-render render và clear đúng sau khi thành công).

### Kiểm thử offline R6

- [x] Hai view cùng nguồn đều được vẽ sau một ghi Customer (test `triggers.js`).
- [x] View không active vẫn được vẽ (test `viewRenderer.js`, `triggers.js`).
- [x] View có filter đổi vẫn vẽ (test `viewRenderer.js`).
- [x] View có sort chung Config đổi vẫn vẽ (test `viewRenderer.js`).
- [x] Một view lỗi không làm cờ của view khác bị xóa nhầm (test `viewRenderer.js`).
- [x] Bật lại công tắc sau khi tắt làm mọi view cập nhật (test `viewRenderer.js`).

## Slice R7 — Tài liệu, test và triển khai

- [x] Cập nhật `07A` thành hợp đồng tóm tắt; các chi tiết được ghi ở tài liệu 05, 05A, 07 và bản ghi quyết định triển khai.
- [x] Cập nhật tài liệu 05, 05A và 07 theo thiết kế mới: GAS là nguồn sự thật, wake một giây, reload RAM ba giây, selection một request, safety polling thưa và renderer độc lập.
- [x] Ghi lại toàn bộ quyết định triển khai trong `Quyết định triển khai reload Sidebar.md` để không phụ thuộc context phiên chat.
- [x] Cập nhật mục liên quan trong `Checklist đồng bộ FBM.md` (Slice 0, tín hiệu sau ghi).
- [x] Đối chiếu `Cây thư mục code.md`: thêm `server/dev/ReloadMatrixProbe.js`; các module `ReloadDecision.js` và `DirtyState.js` đã có trong cây.
- [x] Thêm ca test vào `tests/cases/dirtyState.js` (revision, scope, JSON hỏng và guard clear đã có).
- [x] Thêm ca test vào `tests/cases/triggers.js` (bốn sheet mặc định, vùng hợp lệ/không hợp lệ, thêm/đổi/xóa mã hàng 1 và toàn bộ view).
- [x] Thêm ca test vào `tests/cases/refresh.js` (entity và Config full core).
- [x] Thêm ca test cho cổng ghi/pull/push/background (gồm status push trong `reloadGates.js`).
- [x] Loại bỏ hợp đồng và caller của `inspectEditReload`; thay bằng `probeSelectionAndReload` một request và `waitMs` do GAS quyết định (server/client/Extension, test `selectionService.js`, `selectionPoll.js`).
- [x] Bổ sung test offline cho selection không đổi/đổi, request im lặng, wake debounce một giây, safety polling và debounce dữ liệu ba giây (test `selectionService.js`, `selectionPoll.js`).
- [x] Chạy `node tests/run.js` sau khi sửa code; lần chạy chốt đạt `1585/1585`. Các tài liệu reload không còn trạng thái test thất bại.
- [x] Các probe GAS DEV cũ cho `getReloadState`, `reloadRecords`, `renderAllManagedViews` vẫn còn làm bằng chứng nền cho DirtyState/renderer; bằng chứng `inspectEditReload` không còn được coi là bằng chứng của thiết kế mới.
- [x] GAS DEV cài trigger installable ở `@374`; `probeTriggerState` xác nhận `shinOnEdit: true`, `shinOnChange: true` và không làm mất các trigger FBM đang có.
- [x] Chạy test GAS DEV khi không mở Sidebar và xác nhận view vẫn đổi sau ghi Customer/Activity: `viewProbeWriteRenderWithoutSidebar` đạt ở `@337`; view tạm nhận đúng mã Customer và ngày Activity sau từng lần `WriteGate`, rồi probe dọn sạch bản ghi và sheet tạm.
- [x] Bổ sung và chạy probe GAS DEV `reloadMatrixProbe` ở deployment `@370`: fixture nối sau dữ liệu DEV hiện có (5 Customer + 5 Activity), mô phỏng onEdit ở Customer/Activity/Category/Config và sheet quản trị, kiểm signal/debounce/view; tất cả ca đạt, 3/3 view được vẽ sau các thay đổi hợp lệ. Probe tự dọn fixture và khôi phục ô/thuộc tính; hậu kiểm dirty state được kiểm tra riêng sau probe.
- [x] Hậu kiểm `probeDirtyState` đạt ở deployment `@372`: `dirtyViewSheets` rỗng, `dirtyRecords` rỗng, `dirtyConfig=false`, `dirtyAll=false`.
- [x] `probeSelectionAndReload` đạt ở deployment `@373`: selection và ReloadState trả trong một request, không có signal mới thì decision `none`.
- [x] Sửa độ trễ đổi khách khi chuyển sheet: `sheetLink.html` áp dụng `customerId` cục bộ trước RPC dirty; test hồi quy nằm trong `selectionPoll.js`, commit `add8fd7`, GAS DEV `probeSelectionAndReload` đạt ở `@378`.
- [x] Kiểm tra log không chứa cookie, mật khẩu, token hoặc payload nhạy cảm bằng `tests/cases/logMask.js` và các ca DTO/log FBM; bộ kiểm chốt đạt `1585/1585`.
- [x] Chỉ thử dữ liệu ở Spreadsheet DEV `2026.09.05 - ShinCRM DEV` qua cổng DEV có token; không chạm Spreadsheet production.
- [x] Không sửa fixture trong `0_Documentation/Nghiên cứu FBM/`; `git diff` không có đường dẫn thuộc thư mục này.
- [x] Commit riêng tài liệu/checklist trước core code: `31a74ef`, `e1e98e2`.
- [x] Commit riêng core GAS, client Sidebar và test khi hợp lý: các commit nền `a73edec`, `d62427e`, `4cbcd6a`, cổng DEV `fec22e1`, nhóm lõi reload `933f308` và nhóm Sidebar/Extension `ab464fe`.

## Slice R8 — Nghiệm thu trên Sheet DEV

- [ ] Mở Sidebar, ghi lại revision ban đầu.
- [ ] Tải lại Extension về bản chỉ quan sát selection; xác nhận đường lấy `customerId` khi click vẫn hoạt động.
- [ ] Gõ phím trong Customer/Activity không có thay đổi giá trị: chỉ tạo wake hint, không tự tạo dirty và không tự reload.
- [ ] Mở ô, nhấn Enter rồi đóng không đổi: không có signal và không reload.
- [ ] Nhấn Esc hủy giá trị: không có signal và không reload.
- [ ] Nhập bằng thanh công thức, click sang ô khác: chỉ `onEdit` hợp lệ mới tạo signal; keydown không được coi là bằng chứng ghi.
- [ ] Kéo tự động điền: kiểm tra GAS xử lý vùng `onEdit` nếu Sheets phát event; không dựa vào Extension suy đoán.
- [ ] Sửa một ô Customer ở cột `@`, chờ ba giây, xác nhận Sidebar đổi.
- [ ] Đứng nguyên sheet sau một sửa: xác nhận wake request đến sau một giây nhưng RAM chỉ reload sau đủ ba giây từ `onEdit` cuối.
- [ ] Sửa liên tiếp ít nhất năm ô Customer, xác nhận chỉ có một lượt reload sau edit cuối.
- [ ] Sửa một ô Activity rồi rời sheet trước ba giây, xác nhận reload ngay.
- [ ] Sửa hàng 2 Customer, xác nhận không reload.
- [ ] Sửa hàng 3 Customer, xác nhận không reload.
- [ ] Đổi hàng 1 Customer, xác nhận full core.
- [ ] Sửa Category, xác nhận danh mục Sidebar đổi.
- [ ] Sửa Config, xác nhận full core an toàn.
- [ ] Không có Extension, đổi vị trí giữa hai ô: xác nhận chỉ một request selection, GAS đọc mã mới trong cùng response.
- [ ] Không có Extension, giữ nguyên vị trí qua nhiều lần probe: xác nhận GAS trả mã cũ và không đọc lại ô mã.
- [ ] Không có Extension, fallback probe kèm `ReloadState`: xác nhận không có request `cheap` rồi `full` thứ hai.
- [ ] Đợi safety polling đến hạn: xác nhận request chạy im lặng và chỉ reload khi revision thực sự đổi.
- [ ] Đứng ở một view, sửa hàng 3 dưới cột hợp lệ, xác nhận tất cả view được vẽ.
- [ ] Sửa hàng 3 dưới cột thường, xác nhận không vẽ.
- [ ] Lưu từ Sidebar, xác nhận Store và tất cả view đổi.
- [ ] Tắt auto render, lưu từ Sidebar, xác nhận view giữ cờ bẩn.
- [ ] Bật auto render lại, xác nhận tất cả view được vẽ ngay.
- [ ] Chạy pull FBM có ghi nội dung, xác nhận Sidebar/view đổi.
- [ ] Chạy push FBM có ghi trạng thái, xác nhận Sidebar/view đổi.
- [ ] Chạy trường hợp conflict/missing/retry, xác nhận vẫn reload và vẽ.
- [ ] Đóng Sidebar, chạy đồng bộ nền, mở lại Sidebar, xác nhận revision mới được xử lý.
- [ ] Đóng Sidebar, chạy đồng bộ nền, vẫn mở Spreadsheet ở sheet quản trị: xác nhận GAS vẽ view ngay mà không cần Sidebar.
- [ ] Mở hai Sidebar nếu môi trường cho phép, xác nhận Sidebar thứ hai không mất tín hiệu của Sidebar thứ nhất.
- [ ] Gây lỗi validation, xác nhận không mất dirty state thành công trước đó.
- [ ] Bấm từng lựa chọn Nạp lại toàn bộ, sheet hiện tại và bốn sheet cụ thể, đối chiếu kết quả.

## Slice R9 — Điều kiện đóng

- [ ] Không còn mục bắt buộc chưa có bằng chứng.
- [ ] Tài liệu và code thống nhất: không polling liên tục theo giây; chỉ có wake request sau debounce một giây, fallback selection probe gộp kiểm tra reload và safety polling thưa theo `SETTINGS` cho RAM. Sheet quản trị vẫn do GAS chủ động vẽ từ signal.
- [x] Không còn đường ghi Customer/Activity thành công nào không đi qua signal chung (test tĩnh `writeGateAudit.js`, test hành vi `reloadGates.js`).
- [x] Không còn client tự phân loại cột `@`; phân loại nằm ở GAS `Triggers`/`ReloadDecision` (test `triggers.js`, `reloadDecision.js`).
- [x] Không còn renderer chỉ vẽ view active sau signal dữ liệu; renderer duyệt toàn bộ sheet `!` (test `viewRenderer.js`, `triggers.js`).
- [x] Không còn thao tác clear dirty không kiểm revision (test `dirtyState.js`, `loadService.js`, `viewRenderer.js`).
- [x] Tổng kết test offline và GAS DEV đã được ghi vào checklist và các commit `18c319a`, `7ed2338`, `654e6ad`, `9c44734`.
- [ ] Chủ dự án xác nhận nghiệm thu Sheet DEV cho các ca cần giữ tab hoặc đăng nhập.

## Slice R10 — GAS latest-wins cho reload records

- [x] `reloadRecords` nhận biết `expectedRevision` đã cũ và hợp nhất danh sách `records` mới nhất từ `ReloadState` trước khi đọc Sheet.
- [x] Khi scope mới hơn yêu cầu full core, GAS trả `reloadMode=fullCore`, `processedRevision` và không để client tự suy ra scope.
- [x] Response ghi rõ `revisionMatched=false`/`supersededRevision` khi request cũ bị thay thế, nhưng dữ liệu trả về vẫn là scope mới nhất đã đọc.
- [x] Chỉ xóa dirty records khi revision dùng để đọc còn khớp; revision phát sinh trong lúc đọc vẫn được giữ lại cho lượt tiếp theo.
- [x] Test offline phủ ca request revision cũ nhưng dirty state có thêm mã mới (`tests/cases/loadService.js`).
- [x] Sidebar giữ wake kế tiếp như tín hiệu vận chuyển, gửi follow-up để GAS tự đọc `ReloadState` mới nhất; không tự gom mã hoặc tự quyết định scope.
- [x] Response selection GAS chỉ được áp dụng nếu context generation còn hiện hành; context mới từ Extension không bị response cũ ghi đè (`tests/cases/selectionPoll.js`).
- [x] Hint bàn phím có `keydown`, `beforeinput` và dự phòng `keyup` cho Delete/Backspace; Extension vẫn không kết luận ô đã sửa (`tests/cases/extensionBridge.js`).
- [x] Offline regression sau nhóm latest-wins đạt `1588/1588` (`node tests/run.js`).
- [x] GAS DEV deployment `@381`: `reloadMatrixProbe` đã đạt trên `@380`; sau guard revision đầu vào, `probeSelectionAndReload --push` vẫn trả đúng selection/ReloadState/decision.

## Slice R11 — GAS trả payload reload trong chính response Sidebar

- [x] Tách logic đọc record/category/full core thành hàm nội bộ có thể được gọi trong `probeSelectionAndReload` mà không tạo RPC thứ hai (`LoadService.js`, test `selectionService.js`).
- [x] Khi `reloadDecisionForState` trả `defer`, `probeSelectionAndReload` trả `waitMs`/`readyAt`, không đọc dữ liệu và không xóa dirty (test `selectionService.js`).
- [x] Khi đã đủ thời gian, `probeSelectionAndReload` tự nạp đúng scope và trả `payload` trong cùng response; Sidebar không gọi `reloadRecords`, `reloadCategory` hoặc `loadCore` để hoàn tất lượt đó (test `selectionPoll.js`).
- [x] Payload records bao phủ Customer, Activity liên quan, bản ghi biến mất và search index; payload full core bao phủ Schema, Config, Category, Customer và Activity (test `loadService.js`, `selectionService.js`).
- [x] Response luôn có `requestId`, `observedRevision`, `processedRevision`, `remainingRevision`, `revisionMatched`, `reload` và `decision` (`SelectionService.js`, test `selectionService.js`).
- [x] Dirty chỉ xóa sau khi GAS đã đọc payload thành công và revision khớp; signal phát sinh trong lúc đọc vẫn còn trong state mới (guard revision trong `LoadService.js`, test `loadService.js`).
- [x] Sidebar chỉ áp dụng payload có revision không thấp hơn revision đã nạp; response `defer` hoặc response cũ không được làm lùi timer/context/Store (test `selectionPoll.js`).
- [x] Sidebar chỉ giữ một timer `readyAt` và một wake đang chờ; nhiều response `defer` không tạo nhiều lượt reload hoặc timer chồng (`sheetLink.html`, test `selectionPoll.js`).
- [x] Test offline phủ năm lần sửa A–E cách nhau một giây: các response đầu không có payload, request sau `readyAt` trả một payload chứa toàn bộ A–E (`tests/cases/selectionService.js`).
- [x] Test offline phủ sửa F sau khi A–E đã xử lý: F tạo revision mới và được trả ở lượt riêng sau debounce của F (`tests/cases/selectionService.js`).
- [x] Test offline phủ F phát sinh trong lúc payload A–E đang được đọc: GAS không xóa F, response ghi `remainingRevision`, request kế tiếp nhận F (`tests/cases/selectionService.js`).
- [ ] Test offline phủ response lệch thứ tự: response cũ không ghi đè payload/revision mới.
- [ ] GAS DEV probe xác nhận `probeSelectionAndReload` trả payload khi state đã sẵn sàng và trả `defer` khi chưa đến `readyAt`.

---
