# Kế hoạch tách tệp lớn và dựng khung test chung

Thực hiện mục "Tệp phình to" và "Tách tệp test theo trách nhiệm" ở mục 3 của `2026.10.17 Todo.md`. Làm trên branch riêng cắt từ `feature/fbm-audit`, song song với B4 của phiên refactor đồng bộ FBM.

Nguyên tắc chủ dự án chốt 2026-11-01: test cũng phải tuân thủ mọi nguyên tắc ở `AGENTS.md` mục 2 như code chạy thật. Gặp lỗi thì sửa tận gốc hệ thống, không vá từng chỗ.

## 1. Số đo

Đo ngày 2026-11-01 trên mọi tệp `.js`, `.html`, `.css` trong `1_ShinCRM_GAS/`, `2_ShinCRM_Extension/`, `tests/` (324 tệp). Ngưỡng dấu hiệu: trên 20 KB hoặc trên 200 dòng. Có 94 tệp vượt (56 code, 38 test), khớp lần đo thử 2026-10-30.

| Nhóm | Nghĩa | Số tệp |
|---|---|---|
| 1 | làm ở phiên này | 6 tệp vượt ngưỡng, cộng khung test chung (mục 4.1) và dọn `server/dev/` (mục 4.4) |
| 2 | bước B đang hoặc sẽ viết lại tệp đó thì tự tách, dùng khung chung của mục 4.1 | 40 |
| 3 | phiên làm lại UI Sidebar (Todo mục 4) | 8 |
| 4 | giữ: to nhưng chỉ làm một việc | 40 |
| 5 | chỉ dài vì dòng `check(...)` dài | không tệp nào ngoài nhóm 2; có công cụ dùng chung (mục 4.5) |

## 2. Gốc lỗi

- Code: một tệp gánh nhiều trách nhiệm, người điều phối và công cụ nằm chung (`fbmSync.html` khoảng 12 việc; `State.js` gánh ô lượt, sổ đã thấy, kho đẩy, theo dõi request).
- Test: thiếu chỗ đặt khung dùng chung và không có luật nào bắt dùng nó, nên mỗi tệp ca tự dựng lại môi trường giả của mình. Hậu quả không chỉ là dài, mà là các môi trường giả lệch nhau và lệch môi trường thật, tức test có thể xanh trên một thế giới không tồn tại. Bằng chứng đo được khi quét:
  - Kho DocumentProperties giả bị dựng lại khoảng 36 lần ở 12 tệp test FBM, cộng hai bản ở `tests/lib/` (`gas-stubs.js`, `load-gas.js`). Các bản trả khác nhau: `data[key] || null` (chuỗi rỗng đã lưu thành `null`), `() => ''` (khóa chưa có trả chuỗi rỗng thay vì `null`), có bản thiếu `deleteProperty` nên `load-gas.js` phải vá "thiếu thì ghi chuỗi rỗng". Đây là vá triệu chứng của một khung giả không đủ.
  - Bộ nạp tệp Extension bị viết 8 lần với tên khác nhau: nạp executor 4 bản (`executorNap`, `executorSession`, `executorWith`, một bản trong `extensionBridge.js`), service worker 2 bản (`workerNap`, `workerHarness`), cầu nối 2 bản (`napBridge`, `bridgeNap`). Các bản khác nhau ở biến toàn cục có sẵn (`Uint8Array`, `btoa`) và ở phiên bản manifest: có bản gõ cứng `'22.0'`, có bản đọc manifest thật. Phép kiểm khớp phiên bản giao thức vì vậy chạy trên hai giả định khác nhau.
  - "Một lần gọi" bị viết ba kiểu: `trongLanChay` ở `tests/lib/load-gas.js` chỉ mở sổ thay đổi, `trongLanGoi` chép ở `sheetReadCopy.js` và `sheetTiers.js` mở thêm DocumentStore, còn cửa vào thật `runEntryPoint` (`server/entry/EntryPoint.js`) mở cả hai và còn ghi Log, gỡ lỗi cũ. Test dùng bản lib đang kiểm một lời gọi không có bộ đệm DocumentProperties, khác thật.
  - Danh sách tệp client phải nạp bị gõ tay ở 40 lời gọi `napClient` trong 22 tệp, trong khi thứ tự thật là các dòng `include()` của `client/Sidebar.html`; danh sách gõ tay lệch dần với Sidebar thật mà không ai biết.
  - Khung `require` chéo giữa tệp ca: `Workflow.js` lấy `taoBoTest` của `Sidebar.js`, `ScanJob.js` và `ActivityScan.js` lấy khung của `Workflow.js`/`ScanJob.js`.
- Hàm dò DEV: không có quy tắc dọn, nên đo một lần xong vẫn nằm lại. Kiểm kê: 38 hàm (31 có trong `DEV_RUNNER_ALLOWED`) chỉ phục vụ phép đo đã ghi số, 7 tệp chỉ chứa những hàm đó; 2 tên trong `DEV_RUNNER_ALLOWED` không còn định nghĩa (`renderAllManagedViews`, `renderAllManagedViewsIfAllowed`); `fbmPerfWrap` bỏ qua im lặng 3 tên hàm đã mất trong danh sách bọc (lỗi im lặng); `reloadMatrixProbe` còn hai phép so kết quả kiểu `renderAllManagedViews` đã xóa.
- Chung cho cả ba: không có phép kiểm nào chặn tệp phình thêm hay khung bị chép lại, nên việc này tái diễn.

## 3. Thứ đã có để dùng lại

- Mẫu "danh sách ngoại lệ chỉ được co lại": `compareExceptions` ở `tests/cases/fbmSync/StaticRules.js` (đã xuất ra ngoài), mẫu `tests/cases/writeGateAudit.js`.
- `tests/lib/strip-comments.js` (bỏ chú thích trước khi quét mã).
- Cửa vào thật `runEntryPoint` làm "một lần gọi" cho test thay vì viết lại begin/end.
- Thứ tự `include()` trong `client/Sidebar.html` làm nguồn danh sách tệp client.
- `client/../manifest.json` của Extension làm nguồn phiên bản cho Chrome giả.
- Khung sẵn có ở `tests/lib/`: `dung-hop.js` (hộp máy chủ, bảng tệp máy chủ), `dung-client.js`, `dom-gia.js`, `fake-sheet.js`, `gas-stubs.js`.

## 4. Việc làm ở phiên này

### 4.1 Khung test chung (chỉ tạo tệp mới trong `tests/lib/`)

Trước khi gom, mỗi khung được so từng bản chép; bản lệch ghi rõ khác ở đâu, vì sao, và nếu lệch vì lỗi thì ghi là lỗi. Kết quả so đã làm ở mục 2 và bảng dưới; khi viết từng khung sẽ so lại đầy đủ thân hàm.

| Tệp mới | Thay cho | Hành vi chuẩn chọn theo |
|---|---|---|
| `tests/lib/fake-properties.js` | ~36 kho DocumentProperties/ScriptProperties dựng tay, hai bản ở `gas-stubs.js` và `load-gas.js` | hành vi `PropertiesService` thật: khóa chưa có trả `null`, giá trị lưu thành chuỗi, đủ `getProperty`, `getProperties`, `setProperty`, `setProperties`, `deleteProperty`, `deleteAllProperties`, đếm số lần đọc và ghi. Riêng chuỗi rỗng đã lưu đọc lại ra gì thì đo một lần trên GAS DEV bằng hàm dò ở `server/dev/` rồi mới chốt. |
| `tests/lib/ext/chrome-gia.js` | các `chrome: {...}` dựng tay | Chrome giả có `runtime`, `tabs`, `storage`, `alarms`, `scripting` theo tùy chọn; `getManifest` đọc `manifest.json` thật |
| `tests/lib/ext/nap-extension.js` | 8 bộ nạp Extension | một hàm nạp mỗi tệp (`napBridge`, `napScout`, `napWorker`, `napExecutor`, `napLiveModelReader`), đường dẫn tệp khai một chỗ, cùng một bộ biến toàn cục |
| `tests/lib/fbm/tra-loi.js` | `gridResponse`, `row`, `fbmResponse`, `relayResponse`, `gateItemReply` ở `Workflow.js` | response FBM và relay giả, dữ liệu thuần, không đụng hộp GAS |
| `tests/lib/sidebar-gia.js` | 40 danh sách `napClient` gõ tay, `taoBoTest` của `Sidebar.js` và `unsavedChanges.js`, phần nạp của `dungCanh` ở `actions.js`, `formScreen.js`, `viewScreen.js` | danh sách tệp đọc từ các dòng `include()` của `client/Sidebar.html`, cho chọn tập con; DOM từ `dom-gia.js` |
| `tests/lib/lan-goi.js` | `trongLanGoi` (2 bản), `trongLanChay` của `load-gas.js` | gọi `runEntryPoint` thật. Đổi khung có thể làm đỏ những ca đang xanh nhờ khung lệch; ca nào đỏ là phát hiện, sửa tận gốc chứ không nới khung. |
| `tests/lib/log-doc.js` | `docLog` ở `entryPoint.js`, `logGate.js`, `noticeGate.js` | ba bản khác nhau ở hai điểm: có bản gọi `flushLog` trước, có bản nối cột bằng `|`. Bản chung trả hàng thô, tham số `flush`; người gọi tự nối |
| `tests/lib/mau-ban-ghi.js` | `ghiKhach`, `ghiGiaoDich` (`loadService.js`, `ramStore.js`) | bản của `ramStore.js` là tập trên (thêm MST, tình trạng, ô tìm kiếm), dùng bản đó |
| `tests/lib/schema-node.js` | `moiNode` (`slots.js`, `uiSchema.js`, giống hệt) | giữ nguyên thân hàm |
| `tests/lib/khung-chung.js` | `nghi` (`RelayLoop.js`, `SidebarDrive.js`, giống hệt), `loi` (`Control.js`, `RunPickup.js`, giống hệt) | giữ nguyên thân hàm |

- Tên thật khi làm (khung xếp vào thư mục con theo trách nhiệm): kho giả `tests/lib/gas/kho-thuoc-tinh.js`, một lần gọi `tests/lib/gas/lan-goi.js`, đọc Log `tests/lib/gas/doc-log.js`, bản ghi mẫu `tests/lib/gas/mau-ban-ghi.js`, nạp Sidebar `tests/lib/sidebar/nap-sidebar.js`, `schema-node.js` ở `tests/lib/sidebar/`, nạp Extension `tests/lib/ext/nap-extension.js`. Chưa dựng vì chỉ tệp ca FBM dùng: `ext/chrome-gia.js`, `fbm/tra-loi.js`, `khung-chung.js` (`nghi`, `loi`); B4 dựng khi tách tệp của mình (dòng việc ở checklist refactor FBM).
- Trùng tên nhưng là việc khác, không gộp, chỉ ghi lại: `dungCanh` (7 tệp dựng 7 cảnh khác nhau; phần nạp client đi qua `sidebar-gia.js`), `taoHop` (4 bản, 3 bản chung khuôn "Sheet giả 4 bảng + một khách" nhưng khác dữ liệu), `banSao`, `dem`, `dungDay`, `giaoDich`, `quaCau`, `taoBoTest`. `noiNen` hai bản khác có chủ ý: bản ở `AutoLogin.js` đi qua `publicResult` để kiểm cửa ra; thuộc hộp GAS FBM nên để B4.
- Số đo DEV 2026-11-01 (`probePropertiesBehavior`): khóa chưa có trả `null` và không có trong `getProperties`; chuỗi rỗng đã lưu đọc lại là `""` (cả `getProperty` lẫn `getProperties`); số `5` đọc lại là chuỗi `"5.0"`. Kho giả `gas/kho-thuoc-tinh.js` theo đúng ba điều này; số chưa đo (số lẻ, số từ 1e7) thì kho giả ném lỗi chứ không đoán.
- Mỗi khung có tệp test riêng ở `tests/cases/lib/` (ví dụ kho giả trả `null` cho khóa chưa có, Chrome giả trả đúng phiên bản manifest, `sidebar-gia` nạp đúng thứ tự `include()`).
- Chưa xóa bản chép trong các tệp test B4 đang sửa. Các tệp test không thuộc B4 (danh sách ở mục 4.3) chuyển sang khung chung ngay trong phiên này.
- Ranh giới với B4: `tests/lib/load-gas.js` và hộp GAS FBM (`workflowGas`, `noiNen`, `capPhienThu`, `giuBanGhi`, `datUngVienDay`...) vẫn do B4 tách như đã định; phiên này không sửa `load-gas.js`. Khung mới không phụ thuộc hộp GAS FBM, B4 dùng chúng khi dựng hộp của mình: kho giả từ `fake-properties.js`, response giả từ `fbm/tra-loi.js`, Extension từ `ext/`.

### 4.2 Luật tĩnh cho test

Tệp mới `tests/cases/testRules.js`, dùng lại `compareExceptions` (gọi từ `StaticRules.js`, không chép). Mỗi luật có danh sách ngoại lệ ghi các chỗ hiện có, chỉ được co lại:

1. Tên hàm xuất từ `tests/lib/` không được định nghĩa lại trong `tests/cases/`.
2. Chỉ `tests/lib/` được dựng môi trường giả: `vm.createContext`/`vm.runInContext`, `getDocumentProperties`/`getScriptProperties` giả, `chrome:` giả, `napClient(` với danh sách tay. Luật này bắt cả bản chép đổi tên, thứ luật 1 không bắt được.
3. Tệp ca không `require` tệp ca khác; khung dùng chung phải ở `tests/lib/`.

Ca kiểm chính các luật: mã mẫu vi phạm trong bộ nhớ phải đỏ.

### 4.3 Tách nhóm 1

- `1_ShinCRM_GAS/server/log/LogGate.js` thành `LogMask.js` (che bí mật, công cụ tính thuần mà `NoticeGate.js` đã dùng và đã có test riêng `tests/cases/logMask.js`), `LogSheet.js` (thao tác Sheet `Log`) và `LogGate.js` (bộ đệm, định dạng dòng, người điều phối `flushLog`, `probeLogGate`). Thêm hai tệp vào bảng tệp máy chủ ở `tests/lib/dung-hop.js`.
- `tests/cases/viewRenderer.js` thành `tests/cases/view/viewSheetRenderer.js`, `viewLedger.js`, `viewTabTint.js`.
- `tests/cases/selectionPoll.js` thành `tests/cases/link/selectionPoll.js`, `changeSignal.js`, `viewSync.js`.
- Các tệp test không thuộc B4 chuyển sang khung chung trong cùng lượt: `actions.js`, `formScreen.js`, `viewScreen.js`, `unsavedChanges.js`, `slots.js`, `uiSchema.js`, `entryPoint.js`, `logGate.js`, `noticeGate.js`, `loadService.js`, `ramStore.js`, `sheetReadCopy.js`, `sheetTiers.js`, `columnFormat.js`, `creatorField.js`, `dirtyState.js`, `documentStore.js`, `reloadGates.js`, `selectionService.js`, `settings.js`, `triggers.js`, `gas-stubs.js`, cùng những tệp còn `napClient` tay ngoài vùng B4. Danh sách đúng lấy từ kết quả luật 4.2 lúc làm.
- Cắt bằng script theo khoảng dòng, không gõ lại nội dung. Số phép kiểm đạt không được giảm (2.924 trước khi làm); nếu đổi khung làm lộ ca đỏ thì dừng và trình gốc lỗi.

### 4.4 Dọn và tách `server/dev/` (không có `client/dev/`)

- Xóa 38 hàm đo một lần đã ghi số đo (31 tên bỏ khỏi `DEV_RUNNER_ALLOWED`), trong đó xóa trọn 7 tệp: `MeasureChunk.js`, `MeasureLog.js`, `ReloadJournalProbe.js`, `ReloadRefactorProbe.js`, `SaveBreakdownProbe.js`, `SheetReadGapProbe.js`, `ViewRenderProbe.js`. Bỏ 2 tên mất định nghĩa khỏi `DEV_RUNNER_ALLOWED`. Sửa các chú thích còn nhắc tên đã xóa (`tests/gas.js`, `tests/cases/logGate.js`, `server/config/Settings.js`).
- `FbmPerfProbe.js` tách thành `FbmPerfProbe.js` (bộ bọc đo, bật/tắt, báo cáo), `FbmPerfScope.js` (dựng và gỡ dữ liệu đo) và `FbmPayloadProbe.js` (đo cỡ gói); `fbmPerfOn` và lúc mở phiên đo ném lỗi khi danh sách bọc có tên không còn, bỏ 3 tên đã mất và các mốc Sidebar không có nơi phát (`fbmSyncClientTrace` không được gọi ở đâu).
- `FbmSyncFixture.js` tách phần chạy nền thử sang `FbmSyncBackgroundProbe.js`; xóa phần sửa dữ liệu một lần (`fbmRepairFalseMissing*`). Mọi hàm đo FBM bị xóa đều đã có số đo ghi trong tài liệu (nơi ghi nằm trong mô tả commit). Các tệp FBM ở `server/dev/` để phẳng, chưa vào thư mục con, vì `tests/cases/fbmSync/Workflow.js` của B4 nạp `server/dev/FbmSyncStateProbe.js` theo đường dẫn.
- `ReloadMatrixProbe.js`: tách thành `server/dev/reload/` (`ReloadProbeKit.js` đồ dùng chung, `ReloadMatrixProbe.js`, `ReloadPayloadProbe.js`). Hai phép so cũ chờ `shinOnEdit` vẽ ngay và trả `rendered`; thiết kế hiện tại chỉ gắn cờ `controls` trong sổ vẽ cho đúng sheet bị sửa, lượt vẽ chạy sau. Đã đổi hai ca sang kiểm quyết định `view-control` đúng một sheet và cờ `controls` bật từ tắt; còn chạy `node tests/gas.js reloadMatrixProbe --push` trên DEV.
- Hàm dò không tài liệu nào nhắc: chủ dự án quyết giữ và mô tả mọi hàm dò trong bảng `2026.11.01 Hàm dò DEV.md`; xóa `smokeDiag`, `viewProbeCreateSheet`, `viewProbeCreateRender`, `viewProbeAutoRender` (lý do trong commit). Luật `tests/cases/devProbes.js` đỏ khi bảng và `DEV_RUNNER_ALLOWED` lệch nhau hoặc dòng trỏ tới hàm không có. Các hàm FBM dựng dữ liệu thử xét xóa sau khi B4 xong.
- Ba hàm dò DEV (`probeLogGate`, `reloadMatrixProbe`, `probePropertiesBehavior`) chỉ chạy sau khi branch này gộp vào `feature/fbm-audit` và chủ dự án cho phép: worktree này thiếu commit mới của B4, đẩy từ đây sẽ ghi đè code B4 trên DEV.
- Phát hiện ngoài `server/dev/`: `runEntryPoint` (`server/entry/EntryPoint.js`, mã chạy thật) dò `typeof devPerfBegin === 'function'`, tức mã chạy thật biết tên hàm dev. Ghi vào danh mục dọn trước production; không sửa ở phiên này vì là cửa vào lõi.

### 4.5 Công cụ xuống dòng `check`

`tests/tools/wrapChecks.js`: đọc một tệp test, xuống dòng các lệnh `check(` dài theo ba phần (sổ và nhãn, giá trị nhận, giá trị mong đợi), không đổi gì khác. Mỗi bước B chạy một lệnh cho tệp test của mình. Ở phiên này chỉ chạy trên tệp test do phiên này tạo hoặc sửa. Ngưỡng độ dài dòng đặt ở đầu tệp công cụ.

### 4.6 Phép kiểm cỡ tệp

- Tệp mới `tests/cases/fileSize.js`, luật toàn repo. Phạm vi: `1_ShinCRM_GAS/` (kể cả `server/dev/`), `2_ShinCRM_Extension/`, `tests/` (kể cả `tests/lib/`, `tests/tools/`, `tests/contracts/`). Ngưỡng 20 KB và 200 dòng, khai một chỗ ở đầu tệp.
- Mỗi ngoại lệ: đường dẫn, số dòng và byte đo lúc ghi (làm trần), nhóm (`B4`, `B12`, `UI`, `giữ`, `dev`...) và lý do một câu. Tệp dev nhóm `dev` có trần cố định; hàm dò mới phải vào tệp đúng chủ đề chứ không dồn vào tệp đang mở.
- Đỏ khi: tệp vượt ngưỡng không có trong danh sách; tệp trong danh sách đã về dưới ngưỡng (xóa dòng); tệp trong danh sách lớn hơn trần (tách ra, hoặc nâng trần kèm lý do để người duyệt thấy).
- Ca kiểm chính phép kiểm bằng danh sách giả trong bộ nhớ.

### 4.7 Ghi việc cho các bước sau

- Checklist refactor FBM, thêm vào dòng "tách test" của B4, B6, B7, B8, B9, B11, B12: tệp test nào bước đó tách thì chuyển sang khung `tests/lib/`, xóa bản chép trong tệp đó và hạ danh sách ngoại lệ của `testRules.js` và `fileSize.js`. Riêng B4: tách `load-gas.js` (bộ nạp với hộp GAS FBM), xóa `trongLanChay` và bản kho giả trong đó, chuyển `compareExceptions` và `stripComments` của `StaticRules.js` về `tests/lib/`.
- Todo mục 3 và mục 4: phiên UI chuyển test Sidebar sang `sidebar-gia.js`, xóa bản chép, xử lý chép lặp `sheetLinkColumnLetters`/`selectionColumnLetters` và `sheetLinkIsFreeSheet`/`selectionIsFreeSheet` (một nơi tính, ví dụ GAS gửi sẵn kết quả).

## 5. Bảng đối chiếu quy tắc cứng

### 5.1 Với code

| Quy tắc | Cách đáp ứng |
|---|---|
| Lỗi không có đường xảy ra | Đường để tệp phình bị bịt bằng `fileSize.js`: tệp vượt ngưỡng không tên là đỏ, tệp đã quá to lớn thêm là đỏ. `fbmPerfWrap` ném lỗi khi tên hàm không có, thay cho bỏ qua im lặng. Không bịt được bằng máy: tệp nhỏ mà vẫn lẫn hai việc; chỉ người duyệt thấy, vì ngưỡng chỉ là dấu hiệu. |
| Một việc một công cụ | `LogMask.js` là nơi duy nhất che bí mật cho cả Log và thông báo; xóa hàm dò trùng việc với `fbmPerfReport`. |
| Người điều phối gọi công cụ | `flushLog` lấy bộ đệm, gọi định dạng, gọi `LogSheet` ghi; `LogSheet` không đọc bộ đệm, `LogMask` không biết Sheet. |
| Tiến trình lớn ghép từ tiến trình nhỏ | Không đổi tiến trình nào; chỉ chuyển hàm sang tệp khác, tên và lời gọi giữ nguyên. |

### 5.2 Với test

| Quy tắc | Cách đáp ứng |
|---|---|
| Lỗi không có đường xảy ra | Đường "tự dựng môi trường giả trong tệp ca" bị bịt bằng luật 2 của `testRules.js` (bắt theo dấu hiệu dựng hộp, bắt được cả bản đổi tên); đường "chép khung trùng tên" bị bịt bằng luật 1; đường "lấy khung từ tệp ca khác" bị bịt bằng luật 3. Môi trường giả lệch thật bị bịt bằng cách lấy từ nguồn thật: danh sách tệp client đọc từ `Sidebar.html`, phiên bản Extension đọc từ `manifest.json`, "một lần gọi" gọi `runEntryPoint` thật. Chỉ còn phép kiểm: hành vi của kho giả so với `PropertiesService` thật (không chạy được Google trong Node), nên đo một lần trên DEV và khóa bằng test của khung. |
| Một việc một công cụ | Mỗi môi trường giả có đúng một bản ở `tests/lib/`; một công cụ xuống dòng `check` cho mọi bước. |
| Người điều phối gọi công cụ | Tệp ca là người điều phối: dựng môi trường bằng khung, gọi hàm thật, so kết quả. Khung chỉ dựng, không tự chạy ca hay tự kiểm; khung FBM dữ liệu thuần không tự nạp hộp GAS. |
| Tiến trình lớn ghép từ tiến trình nhỏ | Test cần "một lần gọi" thì gọi đúng tiến trình `runEntryPoint`, không tự xếp lại begin/end; test hành trình dựng Sidebar giả bằng `sidebar-gia.js` chứ không tự xếp danh sách tệp. |
| Không có lỗi im lặng | Kho giả thiếu phương thức thì ném lỗi rõ tên phương thức, không vá bằng ghi chuỗi rỗng như `load-gas.js` đang làm. |

## 6. Bảng 94 tệp

Cột cuối là các trách nhiệm đang lẫn trong tệp; bước B hoặc phiên UI mở tệp nào thì đọc dòng của tệp đó trước khi tách.

| Tệp | KB | Dòng | Nhóm | Ai làm | Trách nhiệm / lý do |
|---|---|---|---|---|---|
| `tests/cases/selectionPoll.js` | 62 | 764 | 1 | phiên này | 3 module: selectionPoll, changeSignal, đồng bộ sheet quản trị của sheetLink |
| `GAS/server/dev/FbmPerfProbe.js` | 33 | 402 | 1 | phiên này (hỏi B4 trước) | bộ bọc đo + dữ liệu thiết lập đo + 5 phép đo một lần (xóa); danh sách bọc có 3 tên đã mất |
| `tests/cases/viewRenderer.js` | 28 | 409 | 1 | phiên này | 3 module server/view: ViewSheetRenderer, ViewLedger, ViewTabTint |
| `GAS/server/log/LogGate.js` | 27 | 456 | 1 | phiên này | bộ đệm Log, che bí mật (công cụ dùng chung với NoticeGate), ghi/dọn Sheet Log |
| `GAS/server/dev/ReloadMatrixProbe.js` | 22 | 361 | 1 | phiên này | ma trận reload + reloadPayloadProbe; hai phép so còn đối chiếu hàm đã xóa |
| `GAS/server/dev/FbmSyncFixture.js` | 21 | 255 | 1 | phiên này (hỏi B4 trước) | dữ liệu thử + chạy nền thử + sửa dữ liệu một lần (xóa) |
| `GAS/client/sync/fbmSync.html` | 131 | 1675 | 2 | B12 | ~12 trách nhiệm: áp trạng thái, cầu nối relay, giữ nháp, vẽ, lắp sự kiện, RPC Extension, xung đột, danh tính, lưu cấu hình, kết nối, lệnh vận hành |
| `tests/cases/fbmSync/Workflow.js` | 130 | 1401 | 2 | B4 (rồi B8/B9) | kiểm ~10 module GAS + executor + service worker; khung dựng hộp dùng chéo |
| `tests/cases/fbmSync/Sidebar.js` | 104 | 1007 | 2 | B12 | kiểm 7 màn đồng bộ; khung taoBoTest dùng chéo |
| `tests/cases/extensionBridge.js` | 102 | 993 | 2 | B4 (tab FBM) | kiểm bridge, scout, service worker, executor + quét chữ GAS/Sidebar |
| `tests/cases/fbmSync/AutoLogin.js` | 76 | 501 | 2 | B11 (B4 chạm cổng phiên) | gần một module; dài vì check dài (TB 155 ký tự/dòng) |
| `tests/cases/fbmSync/Orchestration.js` | 73 | 527 | 2 | B4/B6 | nhiều module: heartbeat, scheduler, status, PropertyBuffer; check dài |
| `tests/cases/fbmSync/ProductionMatrix.js` | 68 | 709 | 2 | B4/B8/B9 | ma trận FBM-0xx: cursor, lỗi kéo/đẩy, xung đột, hash |
| `tests/cases/fbmSync/Push.js` | 65 | 523 | 2 | B9 | một tiến trình đẩy; check dài |
| `tests/cases/fbmSync/Pull.js` | 64 | 524 | 2 | B8 | nhiều khía cạnh kéo; check dài |
| `Ext/background/service_worker.js` | 59 | 838 | 2 | B4/B6/B11 | điều khiển tab, kho credential, gọi relay, vòng relay, đăng ký sự kiện |
| `GAS/fbm_sync/state/State.js` | 52 | 569 | 2 | B4 | ô lượt, sổ đã thấy, kho đẩy, theo dõi request, vòng đời lượt |
| `GAS/fbm_sync/transport/PushFlow.js` | 52 | 604 | 2 | B9 | xác minh sau ghi, lỗi đẩy, điều phối chặng đẩy |
| `GAS/fbm_sync/transport/PullFlow.js` | 50 | 661 | 2 | B4 khung, B8 | mở lượt, quét khách, continueStep |
| `GAS/fbm_sync/transport/TransportCore.js` | 42 | 572 | 2 | B4 | cờ, cổng phiên, phát phong bì |
| `GAS/fbm_sync/state/Scheduler.js` | 37 | 450 | 2 | B6 | lịch nền, chọn việc đến hạn, chuỗi + heartbeat |
| `GAS/fbm_sync/auth/AutoLogin.js` | 34 | 416 | 2 | B11 | cấu hình đăng nhập + chính sách + luồng cursor |
| `GAS/server/gate/WriteGate.js` | 34 | 519 | 2 | B8 (L3 cửa ghi) | một cửa ghi; công cụ kiểm nằm chung người điều phối |
| `Ext/content_scripts/fbm_sync/executor.js` | 31 | 394 | 2 | B11 | md5, đăng nhập, đọc/cắt response, executor |
| `tests/cases/fbmSync/RelayLoop.js` | 30 | 361 | 2 | B4/B6 | 3 module Extension |
| `tests/cases/fbmSync/ScanJob.js` | 30 | 340 | 2 | B8 | một module; dài vì dựng hộp |
| `tests/cases/fbmSync/UserJourneys.js` | 30 | 342 | 2 | B12 | hành trình Sidebar |
| `GAS/fbm_sync/transport/ActivityBatch.js` | 27 | 322 | 2 | B8 | một việc (lô giao dịch) |
| `GAS/client/sync/screens/settings.html` | 27 | 204 | 2 | B12 | một màn; dài vì dòng dày (TB 136 ký tự/dòng) |
| `GAS/fbm_sync/read/ActivityLayers.js` | 25 | 322 | 2 | B8 | các lớp quét giao dịch |
| `GAS/fbm_sync/reconcile/Identity.js` | 25 | 307 | 2 | B7/B11 | liên kết tài khoản, kiểm danh tính, dựng record |
| `tests/cases/fbmSync/StaticRules.js` | 24 | 395 | 2 | B4 (luật 1, 9) | một việc; chép lại stripComments của tests/lib |
| `GAS/fbm_sync/read/GridRead.js` | 23 | 305 | 2 | B8 | đọc lưới FBM |
| `GAS/client/sync/fbmSyncConfigEditor.html` | 23 | 405 | 2 | B12 | trình soạn cấu hình + so username + báo chưa lưu |
| `tests/cases/fbmSync/Preflight.js` | 22 | 184 | 2 | B7/B9 | một module; chỉ dài vì check dài |
| `GAS/fbm_sync/reconcile/Pull.js` | 22 | 262 | 2 | B8 | một người điều phối pullWrite |
| `GAS/fbm_sync/reconcile/Conflict.js` | 22 | 243 | 2 | B9 | một việc |
| `GAS/fbm_sync/report/Report.js` | 21 | 230 | 2 | B12 (statusViewBuild) | nhãn, statusView, ghi issue, preview |
| `GAS/fbm_sync/diagnostic/Trace.js` | 19 | 285 | 2 | B4 | vết kỹ thuật + bước nghiệp vụ |
| `tests/lib/load-gas.js` | 19 | 276 | 2 | B4 (khung test FBM) | loader lẫn giả phiên FBM, ứng viên đẩy |
| `GAS/fbm_sync/control/ControlPort.js` | 18 | 245 | 2 | B4 | một việc: cổng lệnh |
| `tests/cases/fbmSync/FunctionTrace.js` | 18 | 209 | 2 | B4 | kiểm Trace |
| `GAS/fbm_sync/write/PushCandidates.js` | 16 | 220 | 2 | B7/B9 | ứng viên đẩy |
| `tests/cases/fbmSync/Components.js` | 16 | 243 | 2 | B12 | quét component Sidebar đồng bộ |
| `GAS/fbm_sync/reconcile/CategoryGate.js` | 15 | 233 | 2 | B7 | một việc |
| `GAS/server/state/DocumentStore.js` | 15 | 238 | 2 | B10 | khóa + đệm DocumentProperties |
| `tests/cases/unsavedChanges.js` | 52 | 712 | 3 | Todo mục 4 | một chủ đề, nhiều module phụ (adapter FBM, saveFlow, hộp quyết định) |
| `GAS/client/ui/renderEngine.html` | 40 | 656 | 3 | Todo mục 4 | tự chia 4 việc: thoát ký tự, spatial, dựng chuỗi, gắn DOM |
| `GAS/client/link/sheetLink.html` | 38 | 693 | 3 | Todo mục 4 | cầu nối Extension, read plan, điều phối reload, áp ngữ cảnh |
| `GAS/client/style/components.html` | 34 | 649 | 3 | Todo mục 4 | CSS 5 nhóm component |
| `tests/cases/renderEngine.js` | 29 | 411 | 3 | Todo mục 4 | renderEngine + combo/picker + quét innerHTML |
| `GAS/client/ui/unsavedChanges.html` | 17 | 355 | 3 | Todo mục 4 | cảnh báo chưa lưu + hộp quyết định dùng chung |
| `GAS/client/save/saveFlow.html` | 14 | 262 | 3 | Todo mục 4 | luồng lưu form |
| `GAS/client/ram/bootstrap.html` | 14 | 255 | 3 | Todo mục 4 | khởi động Sidebar |
| `Ext/content_scripts/model/live_model_reader.js` | 23 | 485 | 4 | giữ | một người điều phối đọc model Sheets |
| `tests/lib/fake-sheet.js` | 23 | 464 | 4 | giữ | một việc: Sheet giả |
| `tests/cases/selectionService.js` | 22 | 336 | 4 | giữ | một module |
| `GAS/server/service/LoadService.js` | 22 | 410 | 4 | giữ | một việc: nạp dữ liệu cho Sidebar |
| `GAS/server/view/ViewSheetRenderer.js` | 21 | 395 | 4 | giữ | một việc: vẽ sheet quản trị |
| `tests/cases/loadService.js` | 18 | 281 | 4 | giữ | một module |
| `tests/cases/logGate.js` | 18 | 241 | 4 | giữ | kiểm cửa Log; chỉ sửa đường nạp khi tách LogGate.js |
| `tests/cases/liveModelReader.js` | 17 | 305 | 4 | giữ | một module |
| `tests/preview.js` | 17 | 254 | 4 | giữ | công cụ xem Sidebar, một việc |
| `GAS/client/ram/store.html` | 17 | 300 | 4 | giữ | kho RAM |
| `tests/cases/triggers.js` | 16 | 288 | 4 | giữ | một module |
| `GAS/server/sheet/EntityRead.js` | 16 | 277 | 4 | giữ | đọc thực thể |
| `tests/cases/actions.js` | 16 | 289 | 4 | giữ | một module |
| `GAS/client/ui/uiBuilder.html` | 16 | 264 | 4 | giữ | bộ dựng Block |
| `GAS/server/service/SelectionService.js` | 16 | 316 | 4 | giữ (trùng hàm, xem mục 6) | dò chọn + read plan |
| `tests/cases/sheetReadCopy.js` | 15 | 255 | 4 | giữ | một module |
| `tests/cases/ramStore.js` | 15 | 237 | 4 | giữ | một module |
| `tests/cases/sheetTiers.js` | 15 | 216 | 4 | giữ | một module |
| `tests/cases/uiBuilder.js` | 15 | 205 | 4 | giữ | hai module gần nhau, nhỏ |
| `tests/cases/slots.js` | 14 | 209 | 4 | giữ | một module |
| `tests/cases/formScreen.js` | 14 | 213 | 4 | giữ | một module |
| `tests/cases/schemaCheck.js` | 14 | 213 | 4 | giữ | một module |
| `GAS/server/sheet/SheetReadCopy.js` | 14 | 243 | 4 | giữ | cổng đọc Sheet có đệm |
| `tests/cases/uiSchema.js` | 14 | 238 | 4 | giữ | một module |
| `tests/cases/domUi.js` | 14 | 237 | 4 | giữ | một module |
| `GAS/client/ui/popupList.html` | 13 | 317 | 4 | giữ | popup nổi |
| `Ext/content_scripts/bridge/iframe_bridge.js` | 13 | 235 | 4 | giữ | cầu postMessage |
| `GAS/server/state/DirtyState.js` | 13 | 202 | 4 | giữ | state dirty |
| `GAS/server/Triggers.js` | 13 | 228 | 4 | giữ | trigger Sheet |
| `GAS/server/dev/SeedFake.js` | 12 | 239 | 4 | giữ (dev) | một việc: dữ liệu giả; hàm còn dùng |
| `GAS/server/state/ReloadDecision.js` | 12 | 237 | 4 | giữ | quyết định reload |
| `GAS/client/ui/actions.html` | 11 | 237 | 4 | giữ | bảng hành động |
| `GAS/client/schema/schemaCheck.html` | 11 | 225 | 4 | giữ | kiểm schema |
| `GAS/client/ram/refresh.html` | 11 | 226 | 4 | giữ | áp reload vào RAM |
| `GAS/client/link/selectionPoll.html` | 11 | 254 | 4 | giữ | bộ thăm dò chọn |
| `GAS/client/ui/screenBuild.html` | 10 | 207 | 4 | giữ | dựng màn |
| `GAS/client/style/frame.html` | 10 | 225 | 4 | giữ | CSS khung |
| `GAS/client/ui/combo.html` | 9 | 201 | 4 | giữ | ô gõ-để-lọc |
| `tests/lib/dom-gia.js` | 9 | 203 | 4 | giữ | DOM giả |
| `Ext/content_scripts/scout/sheet_scout.js` | 9 | 228 | 4 | giữ | trinh sát Sheet |

## 7. Checklist

- [x] Đo kích thước, xem cấu trúc 94 tệp, xếp nhóm; so các bản chép khung test; kiểm kê `server/dev/`.
- [x] Chủ dự án duyệt kế hoạch.
- [x] Chạy hàm dò `probePropertiesBehavior` trên DEV (đã viết, commit 746a83ec) sau khi gộp vào `feature/fbm-audit` và chủ dự án cho phép; ghi số đo vào mục 4.1.
- [x] Khung `tests/lib/` (mục 4.1) và test của từng khung ở `tests/cases/lib/`; test; commit.
- [x] `tests/cases/testRules.js` (mục 4.2) với danh sách ngoại lệ hiện có; test; commit.
- [x] Chuyển các tệp test ngoài vùng B4 sang khung chung, hạ ngoại lệ; mọi ca lộ đỏ thì dừng trình gốc lỗi; commit.
- [x] Tách `LogGate.js`; test; commit.
- [x] Chạy `probeLogGate` trên DEV sau khi gộp vào `feature/fbm-audit` và chủ dự án cho phép. Kết quả 2026-11-01: 8 phép đạt (nhả 3 dòng bằng 1 lệnh ghi, che bí mật, lượt lỗi nhả kèm vết, dọn sạch).
- [x] Tách `viewRenderer.js`, `selectionPoll.js`; test; commit.
- [x] Dọn phần không FBM của `server/dev/` (7 tệp, 2 hàm ở `ViewProbe.js`, 22 tên ở `DEV_RUNNER_ALLOWED`); tách `ReloadMatrixProbe.js`, sửa hai phép so; commit.
- [x] Chạy `reloadMatrixProbe` trên DEV sau khi gộp vào `feature/fbm-audit` và chủ dự án cho phép. Kết quả 2026-11-01: lần đầu hỏng ở "Sheet quản trị hàng 1 cột thường không vẽ" (revision tăng), bốn lần sau đạt đủ 15 phép; phép này đã không đổi khi tách nên không do tách. Chưa rõ gốc; thông báo lỗi nay mang mục sổ vẽ của sheet để lần hỏng sau đọc ra sheet có đang ở trạng thái lỗi không (sheet lỗi thì sửa ô nào cũng gắn cờ ô điều khiển).
- [x] Tệp FBM ở `server/dev/` (mục 4.4: xóa 11 hàm đo một lần, tách `FbmPerfProbe.js` và `FbmSyncFixture.js`, bộ bọc đo ném lỗi khi tên mất); test; commit.
- [x] Bảng `2026.11.01 Hàm dò DEV.md` cho mọi tên trong `DEV_RUNNER_ALLOWED`, công cụ `tests/lib/quet/bang-md.js`, luật `tests/cases/devProbes.js`; test; commit.
- [x] `tests/tools/wrapChecks.js`; chạy trên tệp test của phiên này; commit.
- [x] `tests/cases/fileSize.js`; test; commit.
- [x] Ghi dòng việc vào checklist refactor FBM và Todo mục 3, mục 4 (mục 4.7); cập nhật `Cây thư mục code.md`; đổi tiền tố tệp này.
