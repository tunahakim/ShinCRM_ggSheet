# Luật chung nạp lại RAM và vẽ lại view

Làm sau khi `[Đã xử lý] 2026.10.15 Chuỗi đồng bộ nền và vòng xoay giao dịch.md` đã xong và gộp vào `main`, trước phiên `[Chờ xử lý] 2026.10.15 Một cửa ghi chiều lấy về FBM.md` (chủ dự án đồng ý thứ tự 2026-10-16). Phiên này đụng lõi Sidebar và GAS (`SelectionService`, `sheetLink`, `DirtyState`, `WriteCommit`, `Triggers`), nên mở branch mới từ `main`.

## Vì sao phải làm

Hiện trạng đọc được 2026-10-16 (07A dòng "Pull/push/background" và code):

- Ba nơi cùng quyết "nạp hay hoãn": GAS (dấu bẩn, `waitMs`), Sidebar tự đặt cờ `syncRunning` gửi lên, Sidebar tự chặn vẽ lại view lần nữa (`sheetLink.html` nhánh `applyView`).
- Cờ `syncRunning` chỉ đúng khi Sidebar tự điều khiển lượt (bấm tay). Lượt nền do Extension hỏi thẳng GAS nên cờ luôn `false`: mỗi lần GAS ghi Sheet trong lượt nền (mỗi bước có ghi, mỗi lô 50 khách) là RAM nạp lại và sheet `!` đang xem vẽ lại, trái 07A ("trong lúc lượt đồng bộ chạy thì hoãn").
- Mỗi lần áp payload Sidebar hiện lớp phủ chặn thao tác, nên nạp nền dồn dập làm Sidebar bị khóa liên tục.
- Bên ghi tự chọn độ trễ nạp (`recordsDebounceMs`, `recordsReadyAt` trong `DirtyState.js`): thời điểm nạp do bên ghi quyết chứ không do GAS.

## Quyết định của chủ dự án (2026-10-16)

Nguyên tắc nền áp dụng: "Một hành vi, một chỗ định nghĩa", "Mỗi state và mỗi quyết định chỉ có một nơi sở hữu duy nhất", "Đừng viết code để bắt lỗi — hãy dựng kiến trúc mà lỗi đó không có đường xảy ra".

1. **GAS quyết, Sidebar chỉ hỏi.** "Nạp ngay / không có gì" chỉ GAS quyết, từ state GAS giữ. Sidebar bỏ cờ `syncRunning`, bỏ `refreshDeferredBySync`, bỏ lời hỏi `sync-finished` và bỏ chỗ tự chặn vẽ lại view; GAS trả gì Sidebar áp nấy.
2. **Đơn vị thay đổi là một lần chạy GAS, không phải một lần ghi.** Một lần chạy là một lời gọi từ Sidebar, một lượt trigger sửa tay, một lần Extension trả response đồng bộ, một lời gọi API. Hàm ghi không được tự đánh dấu bẩn, chỉ bỏ mã bản ghi vừa đổi vào "giỏ thay đổi" trong bộ nhớ của lần chạy; cửa vào chung của GAS đổ giỏ một lần lúc lần chạy kết thúc (một dấu bẩn, một lần tăng revision). Ghi 40.000 ô, 200 dòng hay 1 khối trong một lần chạy đều chỉ ra một dấu bẩn. Luật này phủ mọi kênh sửa: sửa tay, Sidebar, đồng bộ tay, đồng bộ nền, API.
3. **Chỉ bản ghi đổi nội dung mới vào giỏ.** Ghi lại bản ghi y hệt cũ, ghi mốc kỹ thuật (hash, baseline), state đồng bộ, dòng Log, sổ đánh dấu của Vòng xoay, mốc số khách không vào giỏ. Phải có test chốt: lượt đồng bộ đọc thấy FBM không đổi gì thì không sinh dấu bẩn nào.
4. **Sidebar tự giới hạn bằng cấu trúc, không bằng hẹn giờ.** Không bao giờ có hai lời hỏi song song; tín hiệu đến lúc đang bận gộp thành đúng một lời hỏi kế tiếp (đã có, giữ nguyên). Nhịp nạp tối đa vì vậy bằng tốc độ một lời hỏi, không cần con số chờ lặng hay trần thời gian. Phương án "chờ lặng Q giây, trần M giây" và "khai báo thao tác còn tiếp" đã bàn và loại vì thêm độ trễ đoán bằng thời gian.
5. **Độ trễ trigger sửa tay là luật của kênh `/bind`, không phải luật nạp.** Tín hiệu `/bind` đến trước khi trigger kịp ghi dấu bẩn (đo 2,6–3,8 giây, docstring `CHANGE_SIGNAL_DELAYS_MS` ở `Settings.js`), nên lời hỏi chưa thấy revision tăng thì hỏi lại theo lịch trễ như hiện nay.
6. **Nạp nền chỉ hiện thanh loading, không dùng lớp phủ chặn.** Chỉ chặn khi người dùng đang chờ kết quả của chính thao tác mình vừa làm (ví dụ lưu form); kết quả đó trả ngay trong chính lời gọi ghi.
7. **Vẽ lại view luôn đi cùng lần áp RAM** (khi công tắc tự làm mới bật và đang đứng ở sheet `!` đó). Giữ bất biến 6 của 07A: Customer/Activity đổi thì mọi sheet `!` thành cũ; vế "chỉ vẽ khi giỏ có bản ghi thuộc view" đã loại (chủ dự án duyệt 2026-10-16) vì bản ghi có thể vừa rời khỏi view sau khi sửa, lọc trước/sau rất dễ sót, mà số lần vẽ đã bị giới hạn bằng cấu trúc.
8. **Bỏ chờ 3 giây sau lần sửa tay cuối** (`RELOAD_DECISION_DEBOUNCE_MS`, `recordsReadyAt`, `recordsDebounceMs`, `flushOnLeave`; chủ dự án duyệt 2026-10-16): lịch hỏi trễ của kênh `/bind` và cổng gom đã gom các lần sửa sát nhau. Hoãn chỉ còn một lý do: bảo vệ bản nháp Sidebar.

Kỳ vọng với đồng bộ sau khi có cả phiên này và phiên Một cửa ghi: chỉ mỗi lô của cửa ghi có bản ghi đổi mới sinh một lần nạp; ngày FBM không đổi gì thì cả chuỗi nền không nạp lần nào; kết thúc lượt không có lần nạp riêng.

## Việc cần làm

- [x] Viết lại 07A trước khi code (chủ dự án duyệt 2026-10-16; 07A bất biến 1a–1d, mục 3, ma trận dòng sửa tay/Sidebar/Pull, mục 6, 6.1; đồng bộ 05, 05A, 07): thay dòng "Pull/push/background" và mọi luật hoãn riêng lẻ bằng luật chung ở trên; sửa 09 nếu có đoạn nhắc hoãn nạp khi đồng bộ chạy. Trình chủ dự án duyệt trước khi code.
- [x] Liệt kê cửa vào GAS và chỗ đánh dấu bẩn (2026-10-16):
  - Cửa vào chung đã có: `runEntryPoint` (`server/entry/EntryPoint.js`), bọc lời gọi Sidebar (`LoadService`, `SaveService`, `SelectionService`, `UserPrefs`, `ViewSheetRenderer`, `ClientTiming`, `FbmSyncService`), trigger `shinOnEdit`/`shinOnChange`, menu, `doPost` relay Extension. Chưa rõ bọc: các hàm `fbm*` khai trong `fbm_sync/transport/EntryPoints.js` mà Sidebar gọi thẳng.
  - Mọi dấu bẩn đi qua `dirtyStateMarkSignal` → `dirtyStateBumpRevision` (`DirtyState.js`). Nguồn: `shinReloadDecision` (`Triggers.js`), `writeCommitAfterSuccess` (`WriteCommit.js`, gọi từ `WriteGate`, `DeleteGate`, `ConfigSheetSetup`, `SyncColumnSetup`), `dirtyStateRestoreFullReload` (`LoadService`). FBM gọi `FbmSync.sheetSave` nhiều lần trong một lần chạy (`Pull.js`, `Identity.js`, `Conflict.js`, `PushFlow.js`, `EntryPoints.js`), mỗi lần tăng revision riêng.
  - Cửa ghi không so giá trị cũ: mọi mã trong kế hoạch ghi đều được đánh dấu.
  - RAM chỉ giữ trường `DATA_SCHEMA` (`entityReadFields`); cột đồng bộ (`SYNC_SCHEMA`: `fbmId`, `fbmHash`, `syncStatus`...) không nằm trong RAM.
  - Chờ theo thời gian: `RELOAD_DECISION_DEBOUNCE_MS`, `waitMs`, `flushOnLeave`, `recordsDebounceMs` (`ReloadDecision.js`), `recordsReadyAt` (`DirtyState.js`), `waitMs`/`readyAt` (`SelectionService.js`), `sheetLinkScheduleDirtyCheck` (`sheetLink.html`).
  - Hoãn theo đồng bộ phía Sidebar: `refreshDeferredBySync` (`refresh.html`), `syncRunning`, nhánh `applyView`, `sheetLinkSyncFinished` (`sheetLink.html`), `fbmSyncSetRunning` (`fbmSync.html`), nhánh `request.syncRunning` (`SelectionService.js`).
  - Lớp phủ chặn khi áp payload nạp: `sheetLink.html` hai chỗ `sidebarBusyRun(..., { progress: true, block: true })`; chế độ thanh loading không chặn là `{ block: false, progress: true }`.
- [ ] [Tự động] Giỏ thay đổi: `runEntryPoint` mở giỏ đầu lần chạy và đổ một lần trong `finally` (kể cả khi lỗi sau khi đã ghi); `dirtyStateMarkDecision` chỉ bỏ vào giỏ; không có giỏ thì ném lỗi. Test: một lần chạy gọi cửa ghi nhiều lần chỉ tăng revision một lần; lỗi sau khi ghi vẫn tăng revision; đánh dấu ngoài lần chạy ném lỗi.
- [ ] [Tự động] Mọi hàm `fbm*` Sidebar gọi thẳng mà có ghi đều đi qua `runEntryPoint`.
- [ ] [Tự động] Chỉ bản ghi đổi giá trị ở trường `DATA_SCHEMA` mới vào giỏ: cửa ghi so giá trị trước khi đánh dấu; ghi chỉ cột đồng bộ hoặc ghi lại y hệt không tạo dấu. Test: lượt kéo FBM ghi lại bản ghi không đổi thì revision giữ nguyên.
- [ ] [Tự động] Bỏ chờ theo thời gian (server và client mục trên). Test: sửa tay Customer rồi hỏi ngay thì nạp, không `defer`; `defer` chỉ còn khi trùng bản nháp.
- [ ] [Tự động] Bỏ hoãn theo đồng bộ phía Sidebar và GAS (mục trên). Test: lời hỏi lúc lượt đồng bộ chạy vẫn nạp; Sidebar không gửi `syncRunning`.
- [ ] [Tự động] Áp payload nạp do tín hiệu dùng thanh loading không chặn. Test: payload từ lời hỏi tín hiệu gọi `sidebarBusyRun` với `block: false`.
- [ ] `node tests/run.js` đạt; đẩy GAS DEV; chủ dự án nghiệm thu trên Sheet DEV (chạy nền: Sheet đang xem cập nhật theo lô, chỉ có thanh loading, không lớp phủ); đổi tên tệp sang `[Đã xử lý]`.
