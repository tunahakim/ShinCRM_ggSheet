# Nghiên cứu nguyên nhân bất thường phiên đồng bộ FBM

## Phạm vi

Tài liệu này đối chiếu ba quan sát của chủ dự án với code hiện tại trong repo. Đây là phân tích nguyên nhân, không phải kết luận rằng mọi bản ghi của phiên live đã được ghi hay chưa. Những điểm cần log live để phân biệt được ghi rõ ở cuối tài liệu.

## Kết luận ngắn

1. Số dòng Log khác nhau khi chỉ mở màn hình đồng bộ là kết quả của nhiều lời gọi GAS chạy đồng thời, số hàm lồng nhau thay đổi theo state, cơ chế trace ghi cặp bắt đầu/kết thúc cho nhiều hàm và cửa `flushLog()` không có khóa toàn cục khi nhiều invocation cùng ghi Sheet. Đây không phải là một định mức cố định cho một lần click.
2. Log tăng liên tục tới hàng 5.000 khi chạy pull là hành vi được giải thích trực tiếp bởi `LOG_TRACE = all`, trace từng hàm và `pull_record` cho từng bản ghi, cộng với cơ chế cắt các dòng cũ khi vượt `SETTINGS.LOG_MAX_ROWS = 5000`.
3. Thông báo `Máy chủ không phản hồi hàm fbmContinueSync sau 30000 ms` là timeout của Sidebar tại `callServer()`, không phải timeout nghiệp vụ 120 giây của vòng chờ riêng. `fbmContinueSync` có thể vẫn đang chạy ở GAS sau khi Sidebar đã bỏ cuộc.
4. Các khối Pipeline biến mất vì nhánh lỗi của Sidebar dựng status mới chỉ có `phase`, `label`, `message`, `lastError`, `counts: {}`; không có `runId` hoặc snapshot pipeline. Renderer có điều kiện giữ chi tiết lỗi chỉ khi status lỗi có `runId`.
5. Các số 0 ở tab Tổng quan là số 0 của status lỗi do Sidebar tự dựng, không chứng minh server đã xử lý 0 bản ghi.
6. Việc Customer và Activity vẫn trống sau phiên pull chỉ có thể chốt bằng log thực tế xem `fbmContinueSync` đã tới `writeGateSave` chưa, `writeGateSave` trả gì và invocation có hoàn tất sau timeout hay không.

## Bổ sung 2026-09-22: nguyên nhân gốc làm Log phình thành hàng chục hoặc hàng trăm nghìn dòng

Kết luận trước nói “trace từng hàm” nhưng chưa chỉ ra độ lớn của lỗi. Cơ chế hiện hành là sai cấp độ: nó tự bọc mọi phương thức `FbmSync` bằng `functionTraceEnsure()` và tạo một dòng lúc bắt đầu, một dòng lúc thành công/lỗi cho **mỗi lần gọi**, kể cả hàm hạ tầng được gọi trong vòng lặp như `hash`, `stateRead`, `stateWrite`, `readLocal`, `pushPermission`, `logPullRecord`. Xem `1_ShinCRM_GAS/fbm_sync/diagnostic/Trace.js:160-350`.

Đây là số lần chạy, không phải số loại hàm. Chỉ riêng chiều đẩy có chuỗi sau:

1. `nextPushRequest()` gọi `pushCandidates(entity)` để chọn record tiếp theo.
2. `pushCandidates()` quét toàn bộ record local của entity, và tính `hash()` cho từng record đủ điều kiện.
3. Sau khi một record được FBM xác nhận, `nextPushRequest()` lại chạy và quét lại toàn bộ danh sách để chọn record tiếp theo.

Xem `1_ShinCRM_GAS/fbm_sync/transport/PushFlow.js:243-292` và `1_ShinCRM_GAS/fbm_sync/write/PushCandidates.js:49-106`.

Nếu có `N` record đủ điều kiện và `K` record được đẩy, `hash()` bị gọi gần `N × K` lần chỉ từ cách chọn ứng viên. Vì wrapper ghi hai dòng cho một lời gọi hash, riêng `hash` sinh gần `2 × N × K` dòng. Ví dụ 1.000 record và 100 ứng viên đã là gần 200.000 dòng `hash`, chưa tính các hàm khác. Chiều pull cũng có cùng kiểu nhân dòng: `pullWrite()` duyệt từng record và gọi nhiều hàm lồng nhau cho mỗi record; wrapper ghi hai dòng cho từng lời gọi trong vòng lặp. Xem `1_ShinCRM_GAS/fbm_sync/reconcile/Pull.js:29-204`.

Đây là nguyên nhân trực tiếp, chắc chắn từ code, của Log mất giá trị chẩn đoán và làm chậm sync. Việc bật `LOG_TRACE = all` còn mở rộng vấn đề sang các nguồn ngoài `fbm_sync`, nhưng nguyên nhân lớn nhất trong phiên đồng bộ là dynamic function tracing nêu trên.

## Quyết định mới của chủ dự án: Log theo bước nghiệp vụ, không theo hàm kỹ thuật

Chủ dự án đã chốt đổi yêu cầu: chỉ ghi cặp bắt đầu/kết thúc của bước nghiệp vụ lớn. Ví dụ bắt buộc: `Bắt đầu tính hash ShinCRM` và `Hoàn thành tính hash ShinCRM - Kết quả: có X bản ghi khác baseline, Y bản ghi giống baseline...`.

Thiết kế thay thế phải có các tính chất sau:

- Bỏ hoàn toàn cơ chế tự bọc mọi hàm ở GAS và Sidebar; không log `hash`, `stateRead`, `stateWrite`, renderer hoặc helper theo từng lần gọi.
- Mỗi bước có tối đa một cặp bắt đầu/kết thúc cho một `runId`; lỗi của bước ghi một dòng kết thúc lỗi thay cho dòng thành công.
- Kết quả kết thúc là tổng hợp thực tế của bước: số record đã đọc, mới, cập nhật, không đổi, pending, conflict, bỏ qua, lỗi, số lần ghi Sheet và thời lượng. Không dùng dữ liệu mẫu.
- Payload FBM/GAS tiếp tục chỉ tóm tắt; cookie, password, token và `authorized` không bao giờ được đưa vào Log.
- Chỉ giữ trace 24 mốc kỹ thuật trong `DocumentProperties` để chẩn đoán timeout; trace này không tạo một dòng Sheet Log cho từng hàm.

Các bước cần ghi gồm: khởi tạo phiên; preflight/tính hash ứng viên ShinCRM; kiểm tra phiên FBM; đăng nhập tự động khi thực sự xảy ra; xác minh nhận diện; nạp Category; đọc Customer FBM; đối soát và ghi Customer; đọc Activity FBM; đối soát và ghi Activity; quét và đẩy ứng viên ShinCRM; đọc xác nhận sau ghi; tổng kết hoặc dừng/lỗi phiên. Một bước lặp theo nhiều trang chỉ có một cặp tổng hợp cho toàn bước, không một cặp cho mỗi trang hoặc mỗi record.

## Quan sát 1: mở màn hình đồng bộ tạo số dòng Log khác nhau

### Chuỗi code được kích hoạt

- `syncPanelToggle()` bật module, dựng màn hình ban đầu rồi gọi đồng thời `fbmSyncStatusOnce(true)`, `fbmSyncLoadIdentityStatus()` và `fbmSyncLoadSettings()` bằng `Promise.all`. Sau khi cả ba hoàn thành, nó gọi tiếp `fbmSyncLoadLoginStatus()`. Xem `1_ShinCRM_GAS/client/sync/fbmSync.html:133-153`.
- Ba lời gọi đầu tương ứng với các entry point `fbmGetSyncStatus`, `fbmGetIdentityStatus` và `fbmGetSyncSettings`; mỗi entry point đi qua `runEntryPoint`. Xem `1_ShinCRM_GAS/server/service/FbmSyncService.js:28-53`.
- `runEntryPoint()` cài function trace cho invocation FBM, ghi trace vào lúc bắt đầu và kết thúc, rồi luôn gọi `flushLog()` trong `finally`. Xem `1_ShinCRM_GAS/server/entry/EntryPoint.js:21-55` và `1_ShinCRM_GAS/fbm_sync/diagnostic/Trace.js:302-350`.
- Khi `LOG_TRACE` phủ nguồn `fbm_sync`, mọi phương thức `FbmSync` được gọi trong invocation được bọc bởi cặp `function_started` và `function_succeeded` hoặc `function_failed`. Mỗi cặp có thể tạo hai dòng Log. Xem `1_ShinCRM_GAS/fbm_sync/diagnostic/Trace.js:160-185` và `302-334`.
- `flushLog()` lấy `sheet.getLastRow() + 1` làm hàng bắt đầu và ghi cả lô bằng `setValues`. Nó không dùng khóa chung cho việc đọc `getLastRow()` và ghi lô. Chính docstring của code ghi nhận rủi ro hai invocation tính cùng một hàng đích và làm mất dòng của nhau. Xem `1_ShinCRM_GAS/server/log/LogGate.js:272-300`.
- Khi `LOG_TRACE` phủ nguồn, trace được đẩy vào `LOG_BUFFER` và có thể tự `flushLog()` khi buffer đạt `SETTINGS.LOG_TRACE_BUFFER`; entry point lại flush thêm ở `finally`. Xem `1_ShinCRM_GAS/server/log/LogGate.js:84-110` và `1_ShinCRM_GAS/server/entry/EntryPoint.js:48-55`.

### Nguyên nhân chính xác

Một lần click mở màn hình không phải là một lời gọi đơn lẻ. Nó tạo ít nhất ba invocation GAS song song, rồi một invocation login nối tiếp; mỗi invocation có số hàm con khác nhau tùy state hiện tại. Các invocation cùng ghi Sheet Log nhưng cửa flush không khóa hàng đích. Vì vậy tổng dòng thực tế phụ thuộc vào thứ tự hoàn thành, số hàm đã chạy, có/không có nhánh khôi phục state và việc các lô trace có đụng nhau hay không. Các mốc 162, 230 và 196 là ba kết quả khác nhau của cùng cơ chế này, không phải số dòng được thiết kế cố định.

Khi bấm mũi tên quay về màn hình chính, code chỉ đóng module/khôi phục UI; không có lời gọi đồng bộ tương ứng nên không có dòng Log mới. Lần mở kế tiếp lại chạy chuỗi status/identity/settings/login nói trên.

## Quan sát 2: Log tăng liên tục tới 5.000 trong phiên pull

### Vì sao có rất nhiều dòng

- Giới hạn Sheet Log hiện là `SETTINGS.LOG_MAX_ROWS = 5000`. Khi vượt giới hạn, `logTrimRows()` xóa các dòng cũ ở đầu vùng dữ liệu. Xem `1_ShinCRM_GAS/server/config/Settings.js:34` và `1_ShinCRM_GAS/server/log/LogGate.js:314-319`.
- `FbmSync.logPullRecord()` ghi một sự kiện `pull_record` cho từng record Customer/Activity, gồm trạng thái trước/sau và lý do. Xem `1_ShinCRM_GAS/fbm_sync/reconcile/Pull.js:15-24`.
- `FbmSync.pullWrite()` duyệt từng record, gọi `logPullRecord()` ở mọi nhánh: tạo mới, cập nhật, không đổi, pending, conflict, bỏ qua, lỗi và các nhánh liên kết. Cuối lô nó gọi `writeGateSave()` nếu có bản ghi cần ghi. Xem `1_ShinCRM_GAS/fbm_sync/reconcile/Pull.js:29-204`.
- Với `LOG_TRACE = all`, trace function còn ghi bắt đầu/kết thúc cho các hàm FbmSync; payload dài chỉ được tóm tắt bằng type/length/hash theo `traceFunctionShape()`, không phải nguyên văn payload. Xem `1_ShinCRM_GAS/fbm_sync/diagnostic/Trace.js:220-350`.

Do đó số dòng Log là tổng của trace hàm, trace biên GAS/Sidebar, sự kiện từng record và các dòng trạng thái. Khi tổng vượt 5.000, hệ xóa dòng cũ nên người dùng nhìn thấy hàng cuối liên tục bị cập nhật và các hàng đầu biến mất. Đây giải thích hiện tượng “ghi tới giới hạn 5000 dòng và update/xóa liên tục”; không có bằng chứng đây là một vòng lặp vô hạn chỉ từ quan sát màn hình.

## Quan sát 2 và 3: timeout, Pipeline biến mất, số liệu 0 và Sheet không có record

### Timeout thực tế là ở Sidebar

- `callServer()` đặt bộ hẹn giờ `CALL_SERVER_TIMEOUT_MS = 30000` và tự reject bằng đúng thông báo `Máy chủ không phản hồi hàm <tên hàm> sau 30000 ms.` nếu callback GAS chưa về. Xem `1_ShinCRM_GAS/client/util/serverCall.html:26-40`.
- Vòng `fbmSyncContinueServer()` cũng có một timeout chẩn đoán riêng 120 giây, nhưng callback `callServer('fbmContinueSync', ...)` nằm trong cùng vòng và sẽ reject ngay ở mốc 30 giây trước khi mốc 120 giây có cơ hội phát huy. Xem `1_ShinCRM_GAS/client/sync/fbmSync.html:1411-1461`.
- Vì vậy thông báo quan sát được xác định là timeout client của `google.script.run`; nó không chứng minh `fbmContinueSync` đã dừng ở server. Invocation GAS có thể còn đang đọc/ghi Sheet hoặc flush Log sau khi Sidebar đã báo lỗi.

### Vì sao các khối Pipeline biến mất

- Khi `fbmSyncRun()` gặp lỗi thông thường, code gọi `fbmLogSyncError`, có thể gọi `fbmCancelSync`, rồi dựng status mới dạng `{ label: 'Lỗi', phase: 'error', message, lastError, counts: {} }`. Nhánh này không chép `runId`, `pipeline`, `metadata`, cursor hoặc counts cũ. Xem `1_ShinCRM_GAS/client/sync/fbmSync.html:1523-1538`.
- Renderer chỉ dựng các khối chi tiết khi `fbmSyncRunHasSnapshot(status)` trả true. Với `phase === 'error'`, điều kiện giữ snapshot là phải có `status.runId`; nếu thiếu thì `fbmSyncRunDetailsBlocks()` trả mảng rỗng. Xem `1_ShinCRM_GAS/client/sync/screens/run.html:31-34` và `57-63`.
- Vì status lỗi mới không có `runId`, vùng Pipeline và live status bị render thành rỗng. Card chọn loại đồng bộ vẫn còn vì nó thuộc phần tĩnh của màn hình. Đây là nguyên nhân trực tiếp của việc các khối “Pipeline đang chạy” biến mất.

### Vì sao Tổng quan hiển thị Đã xử lý 0, thành công 0...

Status lỗi do client dựng có `counts: {}`. Bộ render dùng các giá trị thiếu như 0, nên tab Tổng quan hiển thị 0 cho mọi bộ đếm. Đây là số mặc định của DTO lỗi, không phải kết quả đọc từ state GAS.

### Vì sao Customer/Activity không có bản ghi

Code pull có đường ghi đúng: `pullWrite()` gom `writes` và `statusWrites`, rồi gọi `writeGateSave({ entity, records: allWrites, source: 'pull', ... })`. Nếu record FBM mới hoặc chỉ FBM thay đổi và qua được các cổng Category/identity, nó được đưa vào `writes`; nếu bị conflict, pending, unknown category hoặc lỗi thì chỉ ghi trạng thái hoặc bỏ qua. Xem `1_ShinCRM_GAS/fbm_sync/reconcile/Pull.js:121-204`.

Từ ba quan sát hiện tại chưa thể chọn chính xác một trong các trường hợp sau:

- `fbmContinueSync` timeout trước khi tới `pullWrite()`/`writeGateSave`;
- `writeGateSave` được gọi nhưng trả `ok: false`;
- đã ghi một phần rồi invocation bị cắt hoặc Sidebar kiểm tra quá sớm;
- FBM trả dữ liệu nhưng bị chặn bởi Category, ngày Activity, liên kết Customer, khóa người dùng hoặc conflict.

Log live phải được lọc theo cùng `runId` và đọc theo thứ tự: `function_started` của `fbmContinueSync`, `fbm_response_received`, các `pull_record`, `writeGateSave` (input/output đã được che/tóm tắt theo chính sách), `function_succeeded`/`function_failed` của `fbmContinueSync`, rồi `client_timeout` hoặc `client_gas_failure`. Chỉ khi có chuỗi này mới chốt được điểm dừng thực sự.

## Tab FBM đóng và auto-login

Auto-login và tự mở tab là hai cài đặt khác nhau. `sessionGatePolicy()` trả riêng `autoLogin` và `autoOpenTab`; `TransportCore` chỉ thêm `meta.openFbmContext` khi `autoOpenTab === true`. Xem `1_ShinCRM_GAS/fbm_sync/transport/TransportCore.js:54-60` và `458-463`.

Extension chỉ tự tạo tab khi request có `openFbmContext`; nếu không có tab và không có chỉ dẫn này, nó trả `FBM_TAB_NOT_FOUND`. Xem `2_ShinCRM_Extension/background/service_worker.js:48-70` và `541-544`. Vì vậy giả định “đã bật auto-login” tự nó chưa đủ để kết luận tab FBM sẽ được mở. Nếu phiên live không bật `autoOpenTab`, phải xem log `FBM_TAB_NOT_FOUND` để xác định đây có phải nhánh lỗi đầu tiên hay không.

## Xác minh lại ngày 2026-10-01

- Chạy `node tests/run.js` từ working tree hiện tại, bộ kiểm thử dừng với exit code `1` tại `tests/cases/fbmSync/Pull.js:227`.
- Lỗi cụ thể: `TypeError: Cannot read properties of undefined (reading 'action')` vì fixture vẫn tìm log `action === 'conflict'` từng record, trong khi code hiện tại đã bỏ loại log này để chuyển sang tổng hợp theo bước.
- Đây là lỗi không đồng bộ giữa hợp đồng test và policy Log mới, nhưng không được chỉ sửa test cho xanh: trước khi tick đạt phải chốt bằng chứng thay thế rằng conflict vẫn được ghi vào Sheet `Log` ngay khi phát hiện, kể cả khi phiên chưa tới trạng thái kết thúc.
- Chưa sửa code nghiệp vụ hoặc test trong lần xác minh này.

## Cách đọc log phiên kế tiếp

1. Lấy `runId` của phiên và loại bỏ các dòng của lần mở Sidebar trước đó.
2. Tìm `function_started` của `GAS.fbmContinueSync` và đối chiếu `requestId`/phase/cursor.
3. Kiểm tra có `fbm_response_received` hay không; nếu không có thì lỗi nằm ở relay/tab/FBM trước khi GAS xử lý response.
4. Kiểm tra `pull_record` để biết từng record bị synced, pending, conflict, skipped hay error.
5. Kiểm tra `writeGateSave` và output `ok`, số record ghi; đây là bằng chứng duy nhất cho cửa ghi Sheet.
6. Kiểm tra `function_succeeded` hoặc `function_failed` của `GAS.fbmContinueSync`, sau đó đối chiếu `client_timeout`/`client_gas_failure` và status cuối Sidebar.

## Cập nhật thực thi 2026-09-22: chuẩn đọc Log sau khi bỏ trace theo hàm

Phần "Cách đọc log phiên kế tiếp" ở trên mô tả cơ chế cũ và không còn là hướng dẫn áp dụng sau thay đổi này. `function_started`, `function_succeeded`, `pull_record` và `push_record` bị loại khỏi Sheet `Log`: chúng là dấu vết kỹ thuật lặp theo từng lần gọi hoặc từng bản ghi, nên làm che mất sự kiện cần chẩn đoán.

Từ nay, mỗi `runId` chỉ có một cặp mở/đóng cho mỗi bước nghiệp vụ có thực sự tham gia. Các bước gồm: phiên đồng bộ, tính hash ShinCRM/preflight, kiểm tra phiên FBM, đăng nhập tự động (chỉ khi thực sự xảy ra), nạp Category, đọc và đối soát Customer, đọc và đối soát Activity, và quét/đẩy Customer hoặc Activity khi chiều đẩy được chạy. Dòng kết thúc ghi tổng số thực tế đã nhận, ghi Sheet, bỏ qua, xung đột, lỗi và số ứng viên; không có mẫu dữ liệu và không có payload/cookie/mật khẩu/token/`authorized`.

Khi cần chẩn đoán timeout callback, lọc `Log` theo `Kỳ` (`runId`) trước, đọc bước nghiệp vụ cuối chưa có dòng kết thúc hoặc có dòng kết thúc lỗi, rồi đối chiếu 24 mốc kỹ thuật giới hạn trong `FBM_SYNC_TRACE_V1`. Các mốc kỹ thuật đó không được ghi thành dòng Sheet. Vì số cặp log không phụ thuộc số Customer/Activity hay số trang, một phiên đầy đủ chỉ còn vài chục dòng thay vì tăng lên hàng nghìn hay hàng trăm nghìn dòng.
