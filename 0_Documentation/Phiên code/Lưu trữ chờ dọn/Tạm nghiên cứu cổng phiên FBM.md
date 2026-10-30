# Tạm nghiên cứu cổng phiên FBM

Tài liệu tạm chỉ dùng trong phiên "Đưa tự đăng nhập FBM vào mọi luồng qua một cổng duy nhất". Đây là bản ghi khảo sát Bước 1 để không phải đọc lại toàn bộ code sau khi ngữ cảnh bị nén. Không được dùng tài liệu này làm nguồn chuẩn nghiệp vụ và không được đưa mật khẩu, cookie, envelope hay payload FBM vào đây.

## Trạng thái khảo sát

- Đã đọc các tài liệu 09 liên quan, 09A và 10/10A theo phạm vi phiên.
- Đã sửa code, mở rộng test và chạy `node tests/run.js`; lượt gần nhất đạt 1811/1811.
- Không đọc, không sửa, không tick `Checklist rà soát đồng bộ FBM trước vận hành thật.md`.
- Checklist tiến độ của phiên này là `Checklist cổng phiên FBM.md`.

## Hợp đồng phải giữ

- GAS là nơi quyết định state, cursor, phiên, retry, mở tab và request; Extension chỉ thi hành envelope GAS cấp.
- Việc đảm bảo phiên phải nằm trong cổng phát request chung; luồng nghiệp vụ không được gọi hoặc biết logic đăng nhập.
- Kiểm phiên phải đọc state đã có, không gửi request thăm dò trước mỗi lượt.
- Khi response cho biết hết phiên, tự đăng nhập tối đa một lần cho các request đọc/kiểm tra; không tự gửi lại request ghi vì response ghi có thể đã tới FBM.
- Có tab nhưng đăng xuất: nếu chính sách cho phép thì đăng nhập rồi thử lại đúng một lần; nếu không thì fail-closed.
- Không có tab: chỉ khi GAS cấp `meta.openFbmContext` theo chính sách mới cho phép Extension mở URL GAS cấp; tắt chính sách thì chặn.
- Mọi thất bại phải đặt state có thông báo dễ hiểu để Sidebar hiển thị và phải có dòng lỗi ở Sheet `Log`; không được nuốt lỗi mạng, lỗi tab, lỗi relay hay lỗi login.
- Log/Trace/thông báo không được chứa password, cookie, envelope, `authorized` hoặc payload nhạy cảm.

## Logic đăng nhập hiện có

### GAS giữ chính sách và state

Tệp duy nhất sở hữu chính sách và điều phối login là `1_ShinCRM_GAS/fbm_sync/auth/AutoLogin.js`.

- `loginConfigRead`, `loginConfigPolicySave`, `loginConfigSetEnabled` đọc/ghi một kho cấu hình; Sidebar chỉ nhận metadata công khai.
- `autoLoginCanAttempt` kiểm tra công tắc tổng, chính sách login, credential đã cấu hình và thời điểm retry gần nhất.
- `autoLoginMarkAttempt`, `autoLoginMarkSuccess`, `autoLoginMarkFailure` giữ chu kỳ thử lại hữu hạn; mặc định 30 phút.
- `beginAutoLogin` lưu cursor lỗi vào `resumeCursor`, chuyển state sang `checking_session`, đánh dấu phiên hết hạn và dựng request login.
- `loginAdapterContinue` xác nhận response login, rồi bắt buộc authorize Customer và đọc User để đối chiếu identity trước khi khôi phục cursor.
- `loginRequest` chỉ dựng request login; `TransportCore.nextEnvelope` mới là nơi thêm `meta.openFbmContext` theo policy chung cho mọi request.

### Extension chỉ thi hành login

`2_ShinCRM_Extension/content_scripts/fbm_sync/executor.js` là nơi duy nhất thực hiện các fetch login FBM. Request có `meta.kind === 'login'` đi vào `executeLogin`; các request khác chỉ fetch nguyên văn envelope GAS cấp. Logic này không được sao chép sang cổng mới.

## Cổng phát request hiện có

`1_ShinCRM_GAS/fbm_sync/transport/TransportCore.js`, hàm `FbmSync.nextEnvelope(request)`, hiện làm các việc sau:

- kiểm tra công tắc tổng và trạng thái hủy;
- kiểm tra endpoint;
- sinh `requestId`, trace, transport capture/replacement;
- ghi reservation `activeRequestId` và deadline;
- gọi duy nhất `FbmSync.protocol.request(...)` để tạo envelope gửi Extension.

Cổng này chưa đọc `state.session` để quyết định phiên hợp lệ, chưa gọi `beginAutoLogin`, chưa xử lý chính sách no-tab và chưa ghi lỗi cổng một cách thống nhất. Đây là vị trí ứng viên duy nhất cho session gate.

## Ma trận đường phát request

| Luồng | Cửa vào và nơi dựng request | Có qua `nextEnvelope` | Hiện có biết login ở luồng không | Ghi nhận khảo sát |
|---|---|---:|---:|---|
| Đọc thủ công Customer/Activity | Sidebar `fbmStartSync` → `ControlPort` → `PullFlow` | Có | Không trực tiếp lúc bắt đầu; `PullFlow.continue` gọi login khi nhận `SESSION_EXPIRED` | Cần chuyển quyết định login về cổng |
| Ghi thủ công hoặc hai chiều | `fbmStartSync`/`fbmApprovePush` → `PushFlow`/`PullFlow` | Có | `PullFlow` có nhánh hết phiên; request ghi đang chờ (`push_wait`) cố ý không tự login/retry | Không được phát lại request ghi |
| Kiểm tra liên kết/nhận diện | `fbmStartIdentityCheck`, `fbmStartIdentityProbe` → `EntryPoints`/`PullFlow` | Có | Dùng continuation chung; có thể chạm nhánh login khi đọc trả hết phiên | Phải dùng cùng gate |
| Mở lại conflict | `fbmPrepareConflictResolution` → `Conflict.js` | Có | Không tự gọi login | Phải chặn trước khi đọc lại nếu phiên không hợp lệ |
| Retry/resume cursor | `PullFlow` và `Scheduler.requestForCursor` | Có | `Scheduler` tự gọi `beginAutoLogin` khi `session.expired` | Đây là một trong hai điểm vi phạm kiến trúc |
| Login test người dùng bấm | `fbmStartLoginTest` → `AutoLogin.loginTestRequest` | Có | Đây là luồng chức năng login được phép biết login | Không áp dụng auto-login lồng nhau; cổng cần bypass có chủ đích cho request login |
| Heartbeat nền lượt đầu | Extension alarm/startup → `heartbeat_request` → `fbmSyncHeartbeatRequest`/`Scheduler` | Có | `Scheduler` tự gọi `beginAutoLogin` khi state hết phiên | Cần cổng quyết định; Extension chỉ hỏi GAS |
| Continuation nền | Extension gửi `heartbeat` hoặc `background_sync` → GAS `continue` | Có | `PullFlow` có nhánh gọi login sau `SESSION_EXPIRED` | Phải dùng cùng reservation/lock |
| Request login/authorize/identity sau login | `AutoLogin.loginAdapterContinue` | Có | Logic login ở đúng owner `AutoLogin.js` | Cần bypass nội bộ để tránh cổng gọi login đệ quy |

Kết quả quét toàn repo: chưa thấy `FbmSync.protocol.request(...)` ngoài `TransportCore.js`; các builder trong `GridRead.js` và `RequestBuilders.js` chỉ dựng object, không gửi mạng. Các `sendToFbmTab`/`fetch` ở Extension là tầng thi hành bắt buộc, không phải đường GAS phát request nghiệp vụ đi vòng.

## Hiện trạng theo cây quyết định

### Phiên được xem là hợp lệ

- State có `session.expired === false`; các request vẫn được cấp envelope.
- Đây là kiểm tra rẻ nhưng hiện nằm rải rác ở scheduler/continuation, chưa phải điều kiện bắt buộc trong `nextEnvelope`.
- Chưa có trường state thống nhất để GAS biết trạng thái tab có tồn tại; no-tab hiện chỉ được biết sau khi Extension dò tab.

### Có tab nhưng đã đăng xuất

- Khi response bị phân loại `SESSION_EXPIRED`, `PullFlow.continue` hoặc `Scheduler` có thể gọi `beginAutoLogin`.
- Auto-login có throttle `retryMinutes`, lưu cursor và xác minh identity sau login.
- Chưa có một handler duy nhất cho mọi luồng; request read/manual và heartbeat nền đi qua các nhánh khác nhau.

### Không cho phép tự đăng nhập

- `autoLoginCanAttempt` có thể trả `AUTO_LOGIN_NOT_CONFIGURED`, `AUTO_LOGIN_RETRY_DISABLED`, `AUTO_LOGIN_THROTTLED` hoặc `SYNC_DISABLED`.
- Scheduler chuyển state `paused` và không cấp request khi đã biết `session.expired`.
- `nextEnvelope` hiện không tự chặn khi chính sách tắt; các luồng không đi qua scheduler có thể đã dựng envelope trước khi bị Extension từ chối.

### Không có tab

- `service_worker.ensureFbmTab` tìm tab FBM; chỉ mở tab khi request chứa `meta.openFbmContext` do GAS cấp.
- Heartbeat nền có đường báo `FBM_TAB_NOT_FOUND` về GAS qua `fbmSyncHeartbeatTransportFailure`.
- Sidebar trực tiếp nhận lỗi từ `FBM_EXECUTE_REQUEST`, gọi `fbmReportSyncTransportFailure`, rồi Promise bị reject để Sidebar vẽ lỗi.
- Request nghiệp vụ Sidebar thường không mang `openFbmContext`; vì vậy hiện tại no-tab được phát hiện sau khi GAS đã cấp envelope, chưa đạt fail-closed tại cổng.

## Ba bảo đảm bắt buộc: đã có và còn thiếu

| Bảo đảm | Đã có | Còn thiếu/cần chứng minh |
|---|---|---|
| Nhiều luồng cùng phát hiện hết phiên chỉ chạy một login | Scheduler chặn `activeRequestId`/cursor login trong 120 giây; GAS có orchestration lock theo từng lệnh | Chưa có session gate chung cho manual, heartbeat, conflict và login test; chưa có test đồng thời chứng minh chỉ một tiến trình ở mọi đường |
| Login thất bại thử lại theo chu kỳ hữu hạn | `retryMinutes`, `lastAttemptAt`, `nextRetryAt`, `lastError`; mặc định 30 phút | Chưa có một nơi duy nhất quyết định retry cho mọi luồng; cần test thất bại liên tiếp và bảo đảm không loop vô hạn |
| Chính sách tắt thì fail-closed tại cổng | Scheduler không cấp login khi `autoLoginCanAttempt` bị chặn; `masterEnabled` đã chặn envelope | `nextEnvelope` chưa kiểm tra policy login/session; request manual/conflict có thể đi tới Extension trước khi bị phát hiện |

## Logging và thông báo lỗi hiện có

- Sidebar có `fbmSyncPaintError` và `fbmSyncLogClientError`; lỗi Promise transport được gửi về GAS qua `fbmLogSyncError` hoặc `fbmReportSyncTransportFailure`.
- GAS `runEntryPoint` ghi lỗi exception vào Sheet `Log`, flush và ném lại cho `withFailureHandler`; `FbmSync.logTransportError` tạo status lỗi và log `fbm_sync`.
- `fbmSyncHeartbeatTransportFailure` và nhánh `doPost` nền cập nhật state lỗi nhưng hiện không tự gọi `FbmSync.logStatus`; khi Sidebar đóng không có bằng chứng mọi transport failure nền đã có dòng `Log`.
- No-tab Sidebar có thể được vẽ lỗi sau khi reject, nhưng cần test xác nhận cả thông báo dễ hiểu và dòng `Log` cùng mã lỗi.
- `fbmSyncPaintError` hiện chỉ log client qua một lần gọi dedupe theo message; cần kiểm tra lỗi cổng không bị dedupe sai làm mất một lần log nghiệp vụ khác.

## Test hiện có và khoảng trống

Đã có một phần kiểm tra offline:

- `tests/cases/fbmSync/AutoLogin.js`: cấu hình envelope, retry throttle, giữ/khôi phục cursor, login/identity flow, heartbeat auto-login và một số failure.
- `tests/cases/fbmSync/Orchestration.js`: reservation, heartbeat, stale response, `SESSION_EXPIRED`, transport failure `FBM_TAB_NOT_FOUND`, master switch và các continuation.
- `tests/cases/extensionBridge.js`: một điểm gửi request của worker, auto-open tab, executor login, relay heartbeat, lỗi no-tab/bridge và trace.
- `tests/cases/fbmSync/Sidebar.js`: một phần render/status/error client.

Chưa có bằng chứng đầy đủ cho:

- gate chặn trước phát request khi state phiên hết hạn ở mọi entry point;
- ba nhánh cây quyết định trong cùng một cổng (valid, expired, no-tab) với bật/tắt từng chính sách;
- login concurrency giữa manual và background;
- login failure hiển thị Sidebar và ghi Sheet `Log` trong cùng ca;
- relay/network timeout nền được ghi Sheet `Log` và hiển thị khi Sidebar đang mở hoặc mở lại;
- source scan rằng ngoài `nextEnvelope` không còn GAS path phát request, và ngoài owner login không tệp nào nhắc đến login;
- bypass nội bộ cho request `login`/`authorize` để gate không đệ quy.

## Bug kiến trúc cần báo riêng, chưa vá

1. `PullFlow.js` gọi `beginAutoLogin` trực tiếp khi nhận `SESSION_EXPIRED`.
2. `Scheduler.js` gọi `beginAutoLogin` trực tiếp khi `state.session.expired`.
3. `TransportCore.nextEnvelope` chưa là session gate thực sự; no-tab của Sidebar chỉ bị phát hiện sau khi envelope đã được cấp.
4. No-tab auto-open hiện chỉ được gắn cho login/heartbeat; request nghiệp vụ khác không có chỉ dẫn GAS cấp để Extension mở tab.
5. Nhánh login/authorize/identity hiện cũng đi qua `nextEnvelope`; nếu gate gọi login mà không có loại request nội bộ/bypass rõ ràng sẽ tạo đệ quy.

Không phát hiện đường GAS gọi `protocol.request` đi vòng. `executeLogin` và `sendToFbmTab` ở Extension là ngoại lệ thi hành được hợp đồng, không phải bypass của luồng nghiệp vụ GAS.

## Xung đột ràng buộc đã được giải quyết

Mục tiêu yêu cầu `PullFlow.js` và `Scheduler.js` không còn gọi/nhắc login, còn ràng buộc số tệp flow bằng không được hiểu là không thêm logic đăng nhập mới vào flow. Chủ dự án đã duyệt sửa tối thiểu hai tệp này chỉ để gỡ tham chiếu và chuyển trách nhiệm về cổng:

- `PullFlow.js` dùng hook chung do cổng cung cấp, không chứa chữ hoặc logic login.
- `Scheduler.js` dùng kết quả cổng chung, không chứa chữ hoặc logic login.

## Đề xuất sau khi được duyệt

- Đặt session gate và trạng thái lỗi chung ở `TransportCore.js`, đọc state/config qua owner hiện có.
- Giữ nguyên thuật toán login trong `AutoLogin.js` và executor; chỉ gọi `beginAutoLogin` qua adapter của cổng.
- Cổng cấp token nội bộ cho request login do chính cổng khởi động; không có cờ bypass từ caller.
- Chuyển toàn bộ lỗi gate thành state có message an toàn, `FbmSync.logStatus` vào Sheet `Log`, và DTO để Sidebar hiển thị; không gửi secret vào bất kỳ kênh nào.
- Mở rộng test hiện có trong `tests/cases/fbmSync/AutoLogin.js`, `Orchestration.js`, `Sidebar.js` và `tests/cases/extensionBridge.js`; không tạo test file mới nếu không cần.
- Chạy `node tests/run.js`, sau đó quét mã nguồn hai điều kiện: chỉ cổng chung phát request FBM và chỉ owner login được tham chiếu login.

## Cập nhật sau khi được duyệt và triển khai

- Checklist đã bỏ A, B, C và phần E nghiệp vụ; giữ D, F, G, H, thêm regression đọc/ghi khi session hợp lệ. Mỗi ca lỗi yêu cầu Sidebar và Sheet `Log` cùng xuất hiện.
- `TransportCore.js` hiện là session gate: đọc `state.session.expired` không probe; tự khởi động owner login; cấp token nội bộ trong `state.metadata.sessionGate` để request login không đệ quy; tự thêm hoặc gỡ `openFbmContext` theo policy chung cho mọi request.
- `PullFlow.js` chỉ còn hook chung `continueSessionGate`/`sessionGateHandleFailure`, không còn chữ hoặc tham chiếu login. `Scheduler.js` cũng không còn chữ hoặc tham chiếu login; heartbeat dùng cùng cổng.
- `AutoLogin.js` vẫn là owner duy nhất của thuật toán đăng nhập và tiếp tục xử lý ba response login qua hook của cổng. Các thất bại login/identity được ghi log ngay cả khi đi qua relay nền.
- `fbmSyncHeartbeatTransportFailure` dùng cùng handler cho Sidebar và nền: fail-closed, ghi Log/flush, và retry no-tab đúng một lần khi policy auto-open bật. Policy tắt kết thúc lỗi ngay.
- Sidebar tiếp tục request retry do GAS cấp, không tự quyết policy; bỏ dedupe vĩnh viễn của `fbmSyncLogClientError` để cùng message ở hai thời điểm vẫn ghi đủ dòng.
- Extension nền tìm lại tab cho mọi request continuation và xử lý request retry do GAS cấp; không tự suy ra policy hay URL.
- HTTP 401 được phân loại là `SESSION_EXPIRED` và đi vào cùng session gate; heartbeat cũng dùng gate này và ghi log trước khi thử đăng nhập lại.
- Exception nội bộ của cổng thu hồi reservation, chuyển state lỗi, ghi log an toàn và không đưa chi tiết nhạy cảm ra ngoài.
- Relay nền khi mất mạng không tự gọi lại vô hạn; kết thúc hữu hạn với mã `GAS_RELAY_FAILED`. Sidebar chỉ đánh dấu transport đã báo cáo khi GAS thực sự nhận được.
- Test đã mở rộng trong `AutoLogin.js`, `Sidebar.js`, `extensionBridge.js`; lượt gần nhất `node tests/run.js` đạt 1811/1811.
