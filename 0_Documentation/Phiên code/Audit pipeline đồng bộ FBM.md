# Audit pipeline đồng bộ FBM

Ngày rà: 2026-09-14.

Phạm vi: toàn bộ pipeline thuộc module đồng bộ FBM đi qua Sidebar, GAS Web App relay, Extension và tab FBM. Tài liệu này là hồ sơ đối chiếu trong phiên code, không thay thế các quyết định nghiệp vụ ở `00. Tài liệu chính thức/09. Đồng bộ FBM/`.

Quy ước kết luận: `ĐÚNG` là code hiện tại khớp tài liệu và có test phù hợp; `SAI` là có mâu thuẫn xác định được; `THIẾU BẰNG CHỨNG` là hình dạng code hợp lý nhưng chưa được fixture, GAS DEV hoặc live chứng minh; `KHÔNG HOÀN CHỈNH` là có một phần đúng và một phần còn hở.

## Hợp đồng chung của mọi pipeline

Mọi request FBM phải đi theo đúng vòng sau:

```text
Nguồn kích hoạt
  -> GAS kiểm tra công tắc, điều kiện trước, lock và state
  -> GAS ghi cursor + activeRequestId rồi cấp đúng một request hoàn chỉnh
  -> Sidebar hoặc Service Worker chuyển nguyên envelope
  -> Extension tìm tab FBM sau khi đã có envelope
  -> Executor chỉ thay token/capture theo chỉ dẫn generic của GAS rồi fetch
  -> Extension trả response thô cùng requestId
  -> GAS kiểm reservation, parse response, ghi state/Sheet/Log
  -> GAS cấp đúng một request kế tiếp hoặc request:null
```

Ranh giới bắt buộc:

| Thành phần | Được làm | Không được làm |
| --- | --- | --- |
| GAS | Giữ state, cursor, hash, conflict, lock, retry; dựng request; quyết định bước kế; đọc/ghi Sheet qua cửa chuẩn | Không tự gọi FBM |
| Extension | Tìm tab, chuyển envelope, fetch trong tab, capture/project theo chỉ dẫn generic, giữ vault đăng nhập theo ngoại lệ bảo mật | Không biết endpoint/shape/nghiệp vụ, không tự chọn mode/cursor/retry/bước kế |
| Sidebar | Gửi command, chuyển envelope thủ công, hiển thị DTO | Không giữ state nghiệp vụ, không dựng request, không tự quyết conflict |
| Trigger/alarm | Chỉ đánh thức và hỏi GAS | Không tự phát request FBM hoặc tự mở phiên ghi |

Code nền của vòng này nằm ở `FbmSync.controlDispatch`, `FbmSync.nextEnvelope`, `fbmSyncLoop`, `service_worker.sendToFbmTab`, `executor.execute` và `FbmSync.continue`.

Kết luận chung: ranh giới tổng thể đã được dựng đúng, nhưng chưa thể coi module ổn định vì các nhánh tiếp tục pipeline không dùng cùng một bộ xử lý response. Phiên thủ công đi qua `FbmSync.continue`; heartbeat nền lại có bộ xử lý riêng và hiện không chuyển response của phiên quét vào `FbmSync.continue`.

## Nhóm A - Kết nối và nhận diện

### A1. Bắt tay Sidebar và tự cập nhật relay

Trigger: Sidebar mở hoặc Extension có `sessionId` mới.

Pipeline chuẩn:

1. Sidebar bắt tay với bridge bằng nonce và Spreadsheet ID.
2. Bridge trả ACK có `sessionId`.
3. Sidebar gọi `fbmGetRelayConfig`; GAS lấy URL deployment hiện tại, khóa relay và Spreadsheet ID thực tế.
4. Sidebar gửi `CRM_FBM_CONFIG`; Extension probe URL mới trước khi lưu.
5. Probe đạt thì Extension ghi đè nguyên tử `fbmWebAppUrl`, `fbmSyncKey`, `fbmSpreadsheetId`; URL hỏng không được ghi đè URL đang dùng.

Đối chiếu code: `client/link/sheetLink.html:101-133`, `client/sync/fbmSync.html:70-145`, `fbm_sync/transport/EntryPoints.js:80-108`, `content_scripts/bridge/iframe_bridge.js:110-124`, `background/service_worker.js:392-405`.

Kết luận: `ĐÚNG` về thiết kế. Còn cần live chứng minh việc Sidebar deployment trả đúng URL sau mỗi lần đổi deployment; nâng revision trên cùng deployment thì URL phải giữ nguyên, đây không phải lỗi.

### A2. Probe riêng Extension -> GAS

Trigger: `fbmRelayProbe()` hoặc thao tác kiểm tra kết nối.

Pipeline chuẩn: Extension đọc relay config -> POST `kind: probe` -> GAS xác thực key và Spreadsheet ID -> trả DTO `RELAY_PROBE_OK` -> Extension lưu chẩn đoán tối thiểu, không tìm tab FBM.

Đối chiếu code: `service_worker.js:227-249`, `EntryPoints.js:112-123`, `EntryPoints.js:165-191`.

Kết luận: `ĐÚNG`; đã có bằng chứng live probe thành công.

### A3. Tự động điền nhận diện tài khoản

Trigger: nút `Tự động điền - Kiểm tra`.

Pipeline chuẩn theo fixture hiện có:

1. Sidebar gọi `fbmStartIdentityProbe` với `mode:check`, `scan:identity_probe`.
2. GAS chạy preflight chỉ đọc, tạo state `checking_session`, cursor `authorize_customer`.
3. GAS cấp `GetDirViewPage`, controller `zccrAccount`, `viewPage:false`, `authorized:null`.
4. Extension lấy payload cookie từ HTML theo chỉ dẫn GAS, gửi request trong tab FBM và trả response thô.
5. Sidebar phải gọi `fbmContinueSync`; GAS lấy `Authorized`, lưu payload cookie/userId nếu có và chuyển cursor sang `identity_user_grid`.
6. GAS cấp `GetGridViewPage`, controller `User`, `type:0`, `count:10`.
7. GAS nối cột theo AliasName, lấy `id`, `name`, `ten`, ghi `metadata.identityProbe` và kết thúc.
8. Sidebar chỉ điền bản nháp Spreadsheet ID, mã user, tên tài khoản; không tự lưu.

Đối chiếu code: `PullFlow.js:5-79`, `PullFlow.js:101-139`, `PullFlow.js:250-400`, `GridRead.js:66-78`, `GridRead.js:230-245`, `client/sync/fbmSync.html:506-540`.

Fixture: `Nghiên cứu FBM/RequestFBM/Lấy thông tin người dùng FBM.txt` chứng minh controller `User` trả đúng ba trường, nhưng fixture được bắt từ `Main/user.aspx` trong khi executor hiện chạy ở tab `Main/zccrAccount.aspx`. Tài liệu kiến trúc nói FBM kiểm Referer ở mọi POST; khác biệt này chưa được live chứng minh.

Hiện tượng 2026-09-14: FBM chỉ nhận request ở bước 3, không có request bước 6. Vì vậy pipeline thực tế đang đứt trong đoạn bước 4 -> 5 -> 6. Code Sidebar đáng ra luôn gọi `fbmContinueSync` sau response, nên chưa được phép kết luận “đã đọc xong”.

Khoảng hở chẩn đoán: `fbmSyncProjectFormResponse` chỉ giảm response cho `customer_edit_open`/`activity_edit_open`, không giảm response `authorize`; response form lớn được đưa nguyên qua `google.script.run`. Chưa có test tích hợp chứng minh response authorize thật đi trọn Sidebar -> GAS -> request User.

Kết luận: `KHÔNG HOÀN CHỈNH`; request đầu đúng, request User có fixture, nhưng toàn vòng thật chưa đạt và trace hiện chưa đủ chỉ ra chính xác response mất ở bridge, callback GAS hay parser.

### A4. Kiểm tra liên kết tài khoản với dữ liệu Customer đã có

Trigger: thao tác kiểm tra liên kết sau khi đã có nhận diện.

Pipeline chuẩn: authorize Customer -> full grid Customer theo `stt_rec_kh` -> GAS so các FBM ID local đang hoạt động -> thống kê `matched/total/missing` và mẫu giới hạn -> không ghi Sheet, không gọi Activity, không ghi FBM.

Đối chiếu code: `Identity.js:60-109`, `PullFlow.js:123-129`, `PullFlow.js:420-434`, `GridRead.js:91-95`.

Kết luận: `ĐÚNG` về code offline; `THIẾU BẰNG CHỨNG` live cho paging lớn và tài khoản thật.

### A5. Lưu liên kết nhận diện

Trigger: nút `Lưu thông tin`.

Pipeline chuẩn: Sidebar gửi ba giá trị -> GAS kiểm đủ, kiểm Spreadsheet ID thực tế, chặn đổi binding khi còn dữ liệu FBM liên kết -> lưu `FBM_SYNC_BINDING_V1` -> đọc lại DTO.

Đối chiếu code: `Identity.js:16-28`, `FbmSyncService.js:52-53`, `client/sync/fbmSync.html:550-573`.

Kết luận: `KHÔNG HOÀN CHỈNH`. GAS lưu `userId` và `accountName` nhưng không lưu username `name`; pipeline probe có đọc username rồi bỏ khỏi DTO/binding. Vì vậy chưa thể đối chiếu username credential với username phiên như yêu cầu bảo mật.

### A6. Lưu credential mã hóa

Trigger: nút lưu thông tin đăng nhập.

Pipeline chuẩn: Sidebar gửi bản rõ thẳng sang Extension -> Extension mã hóa AES-GCM và giữ key trong vault local -> GAS chỉ nhận envelope, credentialRef và metadata công khai -> password bị xóa khỏi UI.

Đối chiếu code: `service_worker.js:105-143`, `AutoLogin.js:9-54`, `client/sync/fbmSync.html:584-609`.

Kết luận: `ĐÚNG` theo ngoại lệ bảo mật 09.06; cần live kiểm tra xóa password và mất vault sau khi xóa/reload profile.

### A7. Đăng nhập thử

Trigger: nút `Đăng nhập thử`.

Pipeline chuẩn: GAS cấp login envelope test-only khi công tắc bật và cấu hình hợp lệ -> Extension giải mã nội bộ -> gọi GetEntityData, GetUnitData, Login với `force:false`, rồi đọc trang Customer -> GAS xác nhận login -> phải đối chiếu username, userId, tên đầy đủ và Spreadsheet ID với binding trước khi coi đạt.

Đối chiếu code: `AutoLogin.js:99-116`, `executor.js:108-133`, `service_worker.js:137-143`, phần UI login trong `client/sync/fbmSync.html`.

Kết luận: `SAI`. `loginTestResult` mới kiểm response login/session, chưa chạy chuỗi authorize/User để đối chiếu đầy đủ nhận diện đã lưu; username do probe đọc cũng chưa được giữ trong binding.

### A8. Auto-login khi hết phiên

Trigger: GAS phân loại response là `SESSION_EXPIRED`, hoặc heartbeat xác định không có phiên sử dụng được.

Pipeline chuẩn: GAS kiểm công tắc tổng, auto-login enabled/configured và mốc 30 phút -> cấp đúng một login envelope -> Extension login mềm `force:false` -> GAS ghi thành công/thất bại -> thành công dựng lại request từ cursor trước đó; thất bại chờ 30 phút, không thử dồn.

Đối chiếu code: `AutoLogin.js:56-139`, `PullFlow.js:293-318`, `Scheduler.js:105-122`, `executor.js:108-133`.

Kết luận: `KHÔNG HOÀN CHỈNH`. Throttle và `force:false` đúng. Trạng thái khởi đầu `session.cookie` rỗng chưa phân biệt “GAS chưa từng biết cookie nhưng tab đang đăng nhập” với “đã xác nhận logout”; heartbeat có thể chọn auto-login trước khi thử capture phiên hợp lệ trên tab, trái mục tiêu không làm gián đoạn phiên đang dùng nơi khác.

## Nhóm B - Phiên thủ công và chiều đọc

### B1. Kiểm tra an toàn

Trigger: chọn `Kiểm tra an toàn`.

Pipeline chuẩn: preflight -> authorize Customer/Activity -> nạp lookup Category -> đọc dữ liệu cần kiểm -> nối theo AliasName -> tính hash/đối soát và preview -> không ghi Sheet dữ liệu, không ghi FBM.

Đối chiếu code: `Preflight.js`, `PullFlow.js`, `CategoryGate.js`, `Fingerprint.js`, `Report.js`.

Kết luận: `KHÔNG HOÀN CHỈNH`. Nhánh `check` không ghi dữ liệu là đúng, nhưng cuối mọi lượt check Sidebar tự gọi `fbmAuditAltState`; audit hardcode phạm vi DEV `ALT00010` bị trộn vào pipeline sản phẩm và từng tạo các dòng FAIL khó hiểu dù lượt check đã hoàn tất.

### B2. Lấy từ FBM -> ShinCRM

Trigger: mode `read`.

Pipeline chuẩn: preflight -> authorize hai controller -> lookup Category -> pull Customer -> pull Activity -> đối soát ba chiều -> ghi tạo/cập nhật Sheet qua WriteGate -> đánh dấu conflict/vắng mặt -> tuyệt đối không cấp request ghi FBM.

Đối chiếu code: `PullFlow.js:81-98` gọi `writeEnabled(mode)`; `TransportCore.js:16-24` chỉ trả true cho `write/push` và còn phụ thuộc cờ `FBM_SYNC_ALLOW_WRITES`.

Kết luận: `SAI P0`. `mode:read` hiện chỉ preview và tăng `skipped`, không ghi ShinCRM. Đây là mâu thuẫn trực tiếp với tên UI và tài liệu 09.08.

### B3. Pull Customer full

Trigger: phiên read/write hoặc kỳ Customer nền.

Pipeline chuẩn: request đầu `type:0` để lấy AliasName, count đủ lớn -> loại TMP -> nối ID/mã/MST theo luật -> so ba chiều -> ghi từng lát -> phân trang theo composite cursor -> cuối full scan chỉ đánh dấu vắng, không suy ra xóa.

Đối chiếu code: `GridRead.js:38-65`, `PullFlow.js:142-155`, `PullFlow.js:420-447`, `Pull.js`, `Identity.js:128-151`.

Kết luận: `KHÔNG HOÀN CHỈNH`. Ghép cột theo tên và logic identity đúng; tác động ghi Sheet bị vô hiệu trong mode read. `metadata.seen` của toàn kỳ còn được giữ chung trong một property lớn, có nguy cơ vượt giới hạn khi mở rộng khỏi ALT00010.

### B4. Pull Activity theo từng Customer

Trigger: sau mỗi trang Customer trong full pull.

Pipeline chuẩn: với từng `stt_rec_kh`, gọi Activity grid `externalKey stt_rec` -> request đầu `type:0`, trang sau `type:1` -> nối Customer cha -> bỏ TMP/ngừng đồng bộ -> so hash và ghi từng lát -> trở lại trang Customer tiếp theo.

Đối chiếu code: `GridRead.js:96-100`, `PullFlow.js:157-165`, `PullFlow.js:449-485`, `Identity.js:160-199`.

Kết luận: `KHÔNG HOÀN CHỈNH`; orchestration đúng ở mức code, nhưng mode read không ghi Sheet và chưa có live paging nhiều Customer.

### B5. Nạp lần đầu và baseline

Trigger: Spreadsheet trắng hoặc chưa có FBM ID.

Pipeline chuẩn: Category -> Customer -> Activity -> chỉ ghi baseline khi hai bên thực tế khớp; file đã có dữ liệu/FBM ID phải qua binding để tránh nhân bản.

Đối chiếu code: preflight identity, `Pull.pullWrite`, `Fingerprint.threeWay`, `Identity.findCustomerByIdentity`.

Kết luận: `THIẾU BẰNG CHỨNG`. Các mảnh logic có tồn tại nhưng chưa có một test tích hợp end-to-end từ file trắng đến baseline ổn định; lỗi mode read khiến pipeline chuẩn hiện không thể hoàn thành.

### B6. Đối soát vắng mặt và tombstone

Trigger: kết thúc full Customer hoặc bulk Activity.

Pipeline chuẩn: bản ghi active có FBM ID nhưng vắng -> ghi `không thấy bên FBM`, khóa khỏi tự ghi, không đổi trạng thái record; dòng deleted có FBM ID là tombstone; không bao giờ tự gửi Delete tới FBM.

Đối chiếu code: `Identity.markMissingAfterFullScan`, `GridRead.activityBulkMissing`, `PushCandidates`, không có Delete builder.

Kết luận: `KHÔNG HOÀN CHỈNH`. Luật không xóa đúng, nhưng `markMissingAfterFullScan` chỉ chạy khi `state.mode === 'write'`; mode read chuẩn lẽ ra mới là chiều ghi trạng thái về Sheet. Vì vậy cờ vắng mặt không được ghi trong phiên lấy về.

## Nhóm C - Scheduler và phiên nền

### C1. Trigger GAS chỉ ghi lịch

Trigger: `fbmHeartbeatTrigger` 5 phút, `fbmCustomerScanTrigger` 60 phút, `fbmActivityScanTrigger` 30 phút và supervisor 1 phút.

Pipeline chuẩn: trigger kiểm công tắc/due/lock -> chỉ ghi `scheduledScan` và mốc tiếp theo -> không gọi FBM; Extension alarm là phía chủ động hỏi relay.

Đối chiếu code: `Scheduler.js:8-55`, `Scheduler.js:246-255`, `service_worker.js:484-493`.

Kết luận: `ĐÚNG` về ranh giới. Cần rà lại việc có cả GAS trigger heartbeat và Chrome alarm 5 phút để bảo đảm chúng không tạo hai nguồn trạng thái khó hiểu; reservation hiện chặn request chồng.

### C2. Heartbeat 5 phút

Trigger: Chrome alarm hoặc lệnh manual/sidebar_open.

Pipeline chuẩn: Extension POST `heartbeat_request` trước -> GAS kiểm master/background/reservation/state -> chỉ khi GAS cấp envelope mới tìm tab FBM -> executor gọi Customer grid count 1 -> Extension nộp `kind:heartbeat` -> GAS xác nhận response có shape Customer, cập nhật session/TotalRowCount -> nếu có lịch đến hạn thì GAS mở pipeline nền và cấp request tiếp.

Đối chiếu code: `service_worker.js:271-324`, `Scheduler.js:86-209`, `GridRead.js:80-89`.

Kết luận: `SAI P0`. Khi heartbeat mở một phiên quét và cấp request `authorize`, response kế tiếp vẫn đi vào `fbmSyncHeartbeatLocked`; hàm này không gọi `FbmSync.continue(rawResponse)` cho cursor của pipeline. Nó chỉ gọi `requestForCursor(state)`, vì vậy cursor `authorize_customer` không tiến và có thể cấp lại authorize cho tới hop limit.

Sai lệch phụ: GAS chặn ngay khi `session.cookie` rỗng, nên tab FBM đang đăng nhập nhưng GAS chưa capture cookie có thể không được gửi heartbeat để xác nhận; hệ chuyển sang auto-login/chờ login quá sớm.

### C3. Kỳ Customer 60 phút

Trigger: marker `scheduledScan=customer` hoặc heartbeat thấy TotalRowCount đổi.

Pipeline chuẩn: heartbeat kết thúc -> GAS start read background -> authorize -> lookup -> full Customer -> Activity cần thiết -> ghi Sheet từng lát -> request:null khi hết slice, lượt alarm sau tiếp tục đúng cursor.

Đối chiếu code: `Scheduler.js:180-209`, `PullFlow.start`, `PullFlow.continue`, `TransportCore.limitRelayResult`.

Kết luận: `SAI P0`. Ngoài lỗi heartbeat không gọi continue, khi đạt hop limit GAS thu hồi activeRequestId nhưng giữ phase/run active. Lượt `heartbeat_request` sau trả `SYNC_ALREADY_RUNNING` thay vì dựng request từ cursor, nên phiên dài không có đường tiếp tục tin cậy.

### C4. Activity bulk 8 giờ

Trigger: lịch Activity bulk.

Pipeline chuẩn: authorize -> grid Activity không externalKey -> nhiều lát, giữ tập ID đã thấy -> phát hiện sửa và vắng/hard-delete tiềm năng -> sau bulk chạy catch-up và rotation.

Đối chiếu code: `PullFlow.beginActivityBulkPull`, `PullFlow.activityBulkNext`, `GridRead.activityBulkRequest`.

Kết luận: `SAI P0` khi chạy thật. Count hiện là 100 với khoảng 171 nghìn dòng, cần hơn 1.700 request; pipeline chắc chắn chạm hop limit nhưng cơ chế resume nền hiện bị chặn như C3. `seenIds` của toàn bộ Activity được nhét vào state JSON duy nhất, không phù hợp giới hạn `DocumentProperties`.

### C5. Activity catch-up theo ngay_gd

Trigger: kết thúc bulk hoặc lịch Activity.

Pipeline chuẩn: tính max workDate chỉ từ Activity đã có FBM ID -> đọc Customer có `ngay_gd` mới hơn -> với từng Customer gọi Activity externalKey -> không thay thế rotation.

Đối chiếu code: `GridRead.js:138-173`, các cursor `activity_catchup_customer_grid` trong `PullFlow.js`.

Kết luận: `SAI`. `activityLocalMaxDate()` hiện lấy mọi Activity local, không lọc điều kiện “đã có FBM ID”; một Activity nội bộ ngày tương lai có thể che toàn bộ phát sinh thật. Ngoài ra pipeline chịu lỗi resume/state như C3.

### C6. Activity rotation 30 Customer mỗi 30 phút

Trigger: lịch rotation.

Pipeline chuẩn: đọc 30 Customer theo cursor bền -> quét Activity từng Customer -> lưu vị trí kế; hết danh sách quay đầu; đây là lớp bắt Activity tạo lùi ngày bắt buộc.

Đối chiếu code: `GridRead.js:176-205`, cursor rotation trong `PullFlow.js`.

Kết luận: `KHÔNG HOÀN CHỈNH`; logic cursor tồn tại nhưng phụ thuộc cơ chế resume nền đang sai và chưa có live chứng minh vòng qua cuối danh sách.

### C7. Chuyển quyền phiên nền -> thủ công

Trigger: người dùng bấm chạy khi phiên nền đang hoạt động.

Pipeline chuẩn: GAS ghi `manualPending`, nhận xong response đang bay, không cấp request nền kế, đưa state về idle rồi Sidebar mở phiên thủ công; không có hai phiên song song.

Đối chiếu code: `PullFlow.js:15-32`, `PullFlow.js:285-290`, `client/sync/fbmSync.html:671-694`.

Kết luận: `ĐÚNG` về ý tưởng và test offline; cần live với request đang bay. Vòng chờ Sidebar tối đa 60 giây là chính sách UI riêng, cần hiển thị lỗi rõ nếu nền không nhả.

## Nhóm D - Chiều đẩy và hai chiều

### D1. Đẩy từ ShinCRM -> FBM

Trigger: mode `push`.

Pipeline chuẩn: preflight/candidate server-side -> nếu vượt ngưỡng thì chờ chấp thuận -> authorize hai controller -> lookup Category -> Customer trước Activity -> mỗi record qua cổng permission/category/owner/lock -> ghi -> đọc xác nhận -> baseline.

Đối chiếu code: `Preflight.js`, `PullFlow.start`, `PullFlow.beginCustomerPull`, `PushFlow.nextPushRequest`.

Kết luận: `SAI P0`. Tài liệu/UI đã bỏ checkbox “Cho phép ghi thật”, nhưng backend vẫn yêu cầu property ẩn `FBM_SYNC_ALLOW_WRITES=true`. Không còn luồng UI nào bật cờ này, nên push có thể bị khóa vĩnh viễn hoặc phụ thuộc trạng thái cũ/thao tác thủ công ngoài thiết kế.

### D2. Đồng bộ hai chiều

Trigger: mode `write`.

Pipeline chuẩn: pull và ghi ShinCRM trước -> dừng nếu conflict -> sau đó push Customer rồi Activity -> không ghi FBM trước khi pull/đối soát xong.

Đối chiếu code: `PullFlow.js:420-485`, `PushFlow.js`.

Kết luận: `KHÔNG HOÀN CHỈNH`. Thứ tự pull trước push đúng, nhưng quyền ghi Sheet và quyền ghi FBM bị gộp trong `writeEnabled`; cờ ẩn làm cả pipeline phụ thuộc một điều kiện UI đã loại bỏ.

### D3. Chấp thuận phiên push lớn

Trigger: candidate count lớn hơn cấu hình ngưỡng.

Pipeline chuẩn: GAS đếm candidate -> trả request:null + `awaiting_approval` -> UI hiện preview giới hạn -> người dùng chấp thuận -> GAS mới cấp request FBM đầu tiên.

Đối chiếu code: `PullFlow.js:62-74`, `EntryPoints.js:10-24`, `ControlPort.controlNotification`.

Kết luận: `KHÔNG HOÀN CHỈNH`. Cổng GAS có tồn tại; preview candidate thực tế chưa được chứng minh đầy đủ và cờ ghi ẩn vẫn là điều kiện ngoài UX đã chốt.

### D4. Customer create

Pipeline chuẩn: mở form New lấy `_ma_kh_auto` -> kiểm prefix/length -> gửi save -> lấy `stt_rec_kh/ma_kh` -> ghi trạng thái chờ xác nhận -> mở Edit đúng ID -> so hash -> mới ghi baseline.

Đối chiếu code: `RequestBuilders.customerCreateOpenRequest/customerCreateRequest`, `PushFlow.continuePush`, `PushFlow.markPushResult`, `PushFlow.finishPushVerification`.

Kết luận: `ĐÚNG` ở mức builder/test offline; `THIẾU BẰNG CHỨNG` live. Không được chạy ghi thật trước khi các P0 chung được sửa.

### D5. Customer edit

Pipeline chuẩn: mở Edit lấy đầy đủ OldValue -> dựng save -> gửi -> ghi pending hash -> mở Edit xác nhận -> baseline hoặc conflict/not-applied.

Đối chiếu code: `RequestBuilders.customerEditOpenRequest/customerEditRequest`, `PushFlow.continuePush`.

Kết luận: `ĐÚNG` ở mức fixture/test; `THIẾU BẰNG CHỨNG` live với ALT00010.

### D6. Activity create

Pipeline chuẩn: chỉ sau Customer cha có FBM code và được phép -> gửi New có marker -> lấy ID -> đọc lại Edit -> xác nhận hash/baseline.

Đối chiếu code: `CategoryGate.activityParentReady`, `RequestBuilders.activityCreateRequest`, `PushFlow`.

Kết luận: `ĐÚNG` ở mức fixture/test; `THIẾU BẰNG CHỨNG` live.

### D7. Activity edit

Pipeline chuẩn: mở Edit lấy OldValue và owner -> owner phải khớp tài khoản cấu hình -> dựng save -> gửi -> đọc xác nhận -> baseline.

Đối chiếu code: `RequestBuilders.activityEditOpenRequest/activityEditRequest`, `PushFlow.js:329-350`.

Kết luận: `KHÔNG HOÀN CHỈNH`. Luồng hai bước đúng; phép so owner trong code dùng `trim().toLowerCase()` trong khi tài liệu nhận diện yêu cầu đối chiếu tuyệt đối cho thông tin tài khoản. Cần chốt rõ owner là cổng nào và dùng đúng luật tương ứng trước live.

### D8. Đọc xác nhận sau push

Trigger: response save thành công.

Pipeline chuẩn: lưu `hPUSH` nhỏ trong DocumentProperties -> mở lại đúng record -> nối đủ field -> nếu hFBM=hPUSH mới xác nhận baseline; nếu FBM không đổi thì `đẩy không ăn`; nếu khác thì conflict; lỗi đọc không tự gửi lại write.

Đối chiếu code: `State.pendingPush*`, `PushFlow.markPushResult`, `PushFlow.finishPushVerification`, `PushFlow.continueAfterPushVerificationError`.

Kết luận: `ĐÚNG` về thiết kế và test offline; cần live.

### D9. Khôi phục Customer create mất response

Pipeline chuẩn: không phát lại New -> đọc Customer bằng filter MST contains, xác minh đúng MST + mã tự sinh + hash -> chỉ khi duy nhất mới vá ID/baseline; không rõ thì dừng.

Đối chiếu code: `PushFlow.customerCreateRecoveryRequest/finishCustomerCreateRecovery`.

Kết luận: `ĐÚNG` về fail-closed và test offline; cần live transport-failure giả lập, không cần cố gây mất mạng khi ghi thật.

### D10. Retry nhóm push lỗi

Trigger: người dùng chủ động mở lại nhóm lỗi sau khi sửa dữ liệu.

Pipeline chuẩn: GAS chỉ đặt lại trạng thái các record còn tồn tại; không gửi request ngay; kỳ sau dựng candidate theo hash mới.

Đối chiếu code: `EntryPoints.js:52-77`, `PushCandidates.js`.

Kết luận: `ĐÚNG` về ý tưởng; state lỗi đang lưu trong property chung có nguy cơ kích thước và mất dữ liệu như nhóm state bên dưới.

## Nhóm E - Conflict, lock, lỗi và dừng

### E1. Ghi nhận conflict

Trigger: phép so ba chiều thấy ShinCRM và FBM cùng đổi.

Pipeline chuẩn: ghi conflict bền vững, khóa đúng record, không cập nhật baseline, dừng chiều đẩy, UI chỉ tải một trang nhỏ.

Đối chiếu code: `Conflict.rememberConflict`, `State.stateWrite`, `Report.statusMetadata`.

Kết luận: `SAI P0`. State cắt danh sách còn 100 conflict nhưng không giải phóng lock của các conflict bị cắt. Record bị rơi khỏi queue vẫn có thể bị khóa vĩnh viễn. Mỗi item còn giữ cả `shinRecord` và `fbmRecord`, nên 100 item cũng có nguy cơ vượt trần một Document Property.

### E2. Giải quyết conflict

Pipeline chuẩn: người dùng chọn FBM/ShinCRM/tự nhập theo field -> GAS đọc lại FBM và đọc local mới nhất -> nếu FBM đổi thì cập nhật conflict và yêu cầu xem lại -> nếu không đổi mới chốt qua WriteGate -> nhả lock.

Đối chiếu code: `Conflict.prepareConflictResolution`, `Conflict.confirmConflict`, `Conflict.resolveConflict`, `client/sync/fbmSync.html:441-460`.

Kết luận: `SAI P0`. `confirmConflict` không gắn/kiểm `activeRequestId`, nên response cũ sau cancel có thể được dùng. `controlDispatch('resolve_conflict')` còn cho phép gọi `resolveConflict` trực tiếp, bỏ qua đọc lại FBM; điều này vi phạm pipeline chuẩn dù UI hiện dùng prepare/confirm.

### E3. Khóa form người dùng và khóa sync

Trigger: người dùng mở/đóng form hoặc sync chọn candidate.

Pipeline chuẩn: form tạo user lock; sync hoãn record đang sửa; save form kiểm revision; conflict/push lock bền; chỉ nhả đúng lock sở hữu.

Đối chiếu code: `RecordLocks.js`, `State.lockRecord/unlockRecord`, `PushFlow.nextPushRequest/releasePushLock`.

Kết luận: `KHÔNG HOÀN CHỈNH`. Luồng cơ bản đúng, nhưng lock nằm trong state property chung và chịu lỗi orphan của E1; `statusView` còn trả toàn bộ `locks` sang Sidebar dù DTO không cần dữ liệu nội bộ này.

### E4. Lỗi transport ở phiên thủ công

Pipeline chuẩn: lỗi tab/timeout/HTTP chỉ kết luận transport, không suy ra logout trừ dấu hiệu session rõ; request đọc có thể retry giới hạn; request ghi không được tự phát lại; GAS giữ dấu vết và cursor an toàn.

Đối chiếu code: `Protocol.classifyFailure`, `TransportCore.retryRead`, `client/sync/fbmSync.html:715-767`, `State.recoverStaleRun`.

Kết luận: `KHÔNG HOÀN CHỈNH`. Phân loại và không retry write đúng; timeout callback Sidebar chỉ log/cancel cục bộ, còn đường báo transport failure có reservation rõ mới được triển khai đầy đủ cho heartbeat/background, chưa thống nhất cho phiên thủ công.

### E5. Lỗi transport ở heartbeat/background

Pipeline chuẩn: không có tab/executor lỗi -> Extension nộp `transport_failure` kèm requestId -> GAS chỉ thu hồi đúng reservation, giữ cursor -> không retry mù.

Đối chiếu code: `service_worker.relayHeartbeatTransportFailure`, `Scheduler.fbmSyncHeartbeatTransportFailure`, `ControlPort transport_failure`.

Kết luận: `ĐÚNG` về reservation riêng; vẫn bị chặn bởi lỗi continuation C2/C3.

### E6. Response cũ, cancel và công tắc tổng

Pipeline chuẩn: mọi response phải khớp activeRequestId; cancel/tắt không thể thu hồi request đang bay nhưng response chỉ được dùng để đóng lát, không cấp request tiếp; tắt tổng giữ state/cursor; bật lại không tự ghi.

Đối chiếu code: `PullFlow.continue`, `EntryPoints.fbmSyncCancel`, `TransportCore.nextEnvelope`, `ControlPort`.

Kết luận: `SAI`. Kiểm stale response trong `continue` đúng, nhưng khi master tắt `continue` xóa `runId`, cursor và activeRequestId trước khi xử response, trái tài liệu “giữ state/cursor”. Cancel cũng xóa cursor ngay; với request write đang bay điều này làm mất ngữ cảnh xác nhận và đẩy state vào tình huống không biết FBM đã ghi hay chưa.

### E7. Supervisor phiên treo

Trigger: GAS trigger mỗi phút.

Pipeline chuẩn: chỉ đọc state; quá hạn thì chuyển error, không phát lại request; push_wait giữ khóa/ngữ cảnh để người dùng xử lý.

Đối chiếu code: `Scheduler.supervise`, `State.recoverStaleRun`.

Kết luận: `ĐÚNG` về nguyên tắc fail-closed; cần bổ sung test tích hợp với cancel/master off và pending push để tránh hai bộ recovery cho kết quả khác nhau.

### E8. Công tắc tổng và công tắc nền

Pipeline chuẩn: master off chặn mọi request mới, auto-login và conflict action nhưng giữ state; background off chỉ chặn alarm/nền, phiên thủ công vẫn chạy.

Đối chiếu code: `TransportCore.masterEnabled`, `Scheduler.backgroundEnabled`, `ControlPort` và UI schema.

Kết luận: `KHÔNG HOÀN CHỈNH`. Cổng đầu vào có đủ; xử lý request đang bay sai như E6. Mặc định code và tài liệu đều đang coi property chưa có là bật dù comment trong `TransportCore.js` ghi “mặc định tắt”, cần sửa comment để không tạo hai cách hiểu.

### E9. Xoay khóa relay

Trigger: người dùng xác nhận đổi kết nối.

Pipeline chuẩn: GAS đổi key dưới ScriptLock -> Sidebar chuyển config mới -> Extension probe và ACK -> chỉ sau ACK UI báo thành công.

Đối chiếu code: `EntryPoints.fbmSyncRotateRelayKey`, `client/sync/fbmSync.html`, `service_worker.configureRelay`.

Kết luận: `ĐÚNG` về code; cần live xác nhận trường hợp probe URL mới thất bại không làm mất config cũ.

## Nhóm F - State, DTO, UI và log dùng chung

### F1. State/cursor qua nhiều lát

Chuẩn: state/cursor nhỏ và bền; không giữ toàn bộ sản phẩm công việc lớn trong RAM hoặc một property; mọi lát có đường tiếp tục sau MV3/GAS dừng.

Kết luận: `SAI P0`. `FBM_SYNC_STATE_V1` hiện chứa `seen.customer`, `seen.activity`, `activityBulkSeen`, tới 100 full conflict record, push failures/details và preview trong một JSON. Tập ID của khoảng 171 nghìn Activity chắc chắn không phù hợp một Document Property. Đây không chỉ là tối ưu; nó làm pipeline bulk không thể mở rộng production.

### F2. DTO Sidebar

Chuẩn: chỉ trả phase/count/preview giới hạn/conflict đang xem/lỗi; không trả lock, lookup, cookie, OldValue hoặc payload.

Kết luận: `KHÔNG HOÀN CHỈNH`. `statusMetadata` đã giới hạn conflict/failure, nhưng `statusView` vẫn trả toàn bộ `locks`; API phân trang conflict/log thực sự chưa thấy trong cổng service, nên UI 10.000 bản ghi hiện mới là mô phỏng trên một mảng giới hạn chứ chưa phải truy vấn trang server-side.

### F3. Log

Chuẩn: chỉ GAS ghi; một dòng tổng kết kỳ và dòng lỗi/conflict/bỏ qua; không log cookie/authorized/payload; recordId rỗng cho sự kiện tổng hợp.

Kết luận: `SAI`. `Report.logStatus` dùng `ALT00010` làm recordId mặc định cho mọi status tổng hợp, khiến log phiên bị hiểu thành log của một Customer thật. Cần để rỗng nếu không có `current`.

### F4. UI orchestration

Chuẩn: UI chỉ vẽ DTO và chuyển command/request; mọi lỗi async phải hiển thị; pipeline chỉ hiện khi chạy; tự điền không tự lưu.

Kết luận: `KHÔNG HOÀN CHỈNH`. UI chính đã theo schema/block và thao tác identity chỉ điền draft. Tuy nhiên `fbmSyncLoop` tự chạy `fbmAuditAltState` sau mọi mode check/read, trộn công cụ nghiệm thu DEV vào hành vi sản phẩm; loop thủ công, loop heartbeat và loop background là ba implementation khác nhau nên đã lệch logic.

## Danh sách lỗi theo thứ tự sửa

### P0 - phải sửa trước mọi live test

1. Tách `canWriteSheet(mode)` khỏi `canWriteFbm(mode)`; `read` phải ghi Sheet, `check` không ghi đâu, `push` chỉ ghi FBM, `write` ghi cả hai theo thứ tự pull trước push.
2. Hợp nhất bộ xử lý continuation: response của request pipeline nền phải đi qua cùng `FbmSync.continue`, không xử như heartbeat. Heartbeat chỉ xử response có cursor/request kind heartbeat.
3. Làm đường resume sau hop limit: alarm sau phải dựng request từ cursor active đã thu hồi reservation, không trả `SYNC_ALREADY_RUNNING` mãi.
4. Thiết kế lại state lớn: không giữ tập 171 nghìn ID, full conflict record và các map không giới hạn trong một Document Property.
5. Sửa conflict queue/lock: không được cắt conflict mà giữ lock; mọi confirm phải có reservation; bỏ cổng chốt trực tiếp không reread.
6. Bỏ hoàn toàn property/cổng `FBM_SYNC_ALLOW_WRITES` đã bị UI/tài liệu loại; an toàn ghi FBM phải đến từ master + mode + preflight + approval + cổng record.
7. Sửa semantics cancel/master off cho request đang bay, đặc biệt push_wait; giữ đủ ngữ cảnh để xác nhận, không xóa cursor mù.

### P1 - sửa trước nghiệm thu end-to-end

1. Hoàn chỉnh identity binding với username và đối chiếu login test đủ username/userId/full name/Spreadsheet ID.
2. Chốt cách probe phiên khi GAS chưa biết cookie nhưng tab đang đăng nhập; không auto-login chỉ vì state server rỗng.
3. Giảm response authorize theo chỉ dẫn GAS hoặc endpoint DTO phù hợp; thêm test tích hợp response authorize thật -> request User.
4. Sửa Activity catch-up chỉ tính max workDate của Activity có FBM ID.
5. Bỏ `ALT00010` khỏi recordId log tổng hợp và tách audit DEV khỏi loop sản phẩm.
6. Bổ sung API phân trang server-side thật cho conflict/lỗi/log; không dựa vào state array giới hạn.
7. Loại `locks` khỏi DTO Sidebar và rà toàn bộ metadata công khai.

### P2 - bằng chứng cần hoàn tất sau khi P0/P1 xanh

1. GAS DEV từng entrypoint với `--push`, gồm continuation identity, continuation heartbeat->background, resume hop limit và conflict stale response.
2. Live chỉ đọc với tab FBM: identity hai request, heartbeat logged-in, logged-out, mất tab, timeout và auto-login throttle.
3. Live ALT00010: pull ghi Sheet, idempotency, Customer edit, Activity create/edit và read-back; không chạy Delete.
4. Chỉ sau các bằng chứng trên mới gỡ `FBM_SYNC_TEST_CUSTOMER_CODE` và thử dữ liệu lớn.

## Kết luận về request đang thấy

Request `GetDirViewPage` mà người dùng gửi là bước authorize Customer hợp lệ, không phải request thừa và không phải heartbeat Customer. Nó phải tạo ra request `GetGridViewPage controller:User` trong cùng thao tác tự điền. Việc chỉ có đúng một request chứng minh pipeline chưa qua được ranh giới continuation đầu tiên.

Không được yêu cầu người dùng lặp thử mù. Lượt chẩn đoán kế tiếp chỉ cần lấy bốn dấu không nhạy cảm của đúng requestId: `bridge_response_sent`, `gas_entered/fbmContinueSync`, `gas_returned` hoặc `gas_failed`, và HTTP status/độ dài response authorize. Không lưu hoặc gửi cookie, Authorized hay body thật vào Log.

## Đợt đối chiếu toàn pipeline sau khi sửa bridge

Phần này là snapshot có hiệu lực sau các revision GAS DEV `@268` đến `@273`; các kết luận cũ ở trên chỉ giữ để truy vết phát hiện và không dùng để đánh giá code hiện tại.

### Pipeline chuẩn và đối chiếu code

| Pipeline | Chuỗi người dùng/trigger nhìn thấy | Các bước GAS | Vai trò Extension | Trạng thái hiện tại |
| --- | --- | --- | --- | --- |
| Bắt tay relay | Mở Sidebar -> nhận cấu hình -> probe | Lấy URL, key, Spreadsheet ID thực tế; kiểm key/ID | Lưu config nguyên tử sau probe thành công | Đúng; probe live đã đạt |
| Probe relay | `fbmRelayProbe()` | Trả DTO `RELAY_PROBE_OK`; không state/FBM | POST relay, ghi chẩn đoán tối thiểu | Đúng |
| Tự điền nhận diện | Tài khoản FBM -> Tự động điền - Kiểm tra | Preflight -> authorize Customer -> đọc Authorized -> cấp User grid -> trả draft DTO | Chuyển request/response thô | Đã sửa lỗi P0 trace; cần live xác nhận User grid |
| Kiểm tra liên kết | Bấm Kiểm tra sau khi có binding | Authorize -> quét Customer -> đối chiếu dòng có FBM ID -> trả n/N và mẫu | Chuyển grid request/response | Code offline đúng; live paging chưa có bằng chứng |
| Lưu binding | Bấm Lưu thông tin | Kiểm Spreadsheet ID, userId, username, accountName -> ghi binding | Gửi giá trị người dùng xác nhận | Đúng với username đã đưa vào |
| Lưu credential | Nhập credential -> Lưu mã hóa | Chỉ nhận credentialRef/envelope, không password rõ | AES-GCM/vault local; không gửi password lên GAS | Đúng theo 09.06 |
| Đăng nhập thử | Bấm Đăng nhập thử | Cấp login envelope -> authorize -> User -> đối chiếu binding | Adapter login duy nhất, `force:false` | Chưa live; code đã có chuỗi đối chiếu |
| Auto-login | Heartbeat phát hiện session expired | Kiểm throttle 30 phút -> cấp login -> authorize/User -> resume cursor | Chạy adapter login theo envelope | Có throttle/force:false; cần test logout thực |
| Kiểm tra an toàn | Chọn Kiểm tra an toàn | Preflight -> session -> Category -> pull/đối soát preview -> không ghi | Chuyển request đọc | Đúng nguyên tắc; không tự audit ALT00010 |
| Lấy FBM -> ShinCRM | Chọn Lấy từ FBM -> ShinCRM | Preflight -> authorize -> Category -> Customer -> Activity -> reconcile -> WriteGate Sheet -> missing marker | Chuyển envelope | Đã tách quyền ghi Sheet; cần GAS DEV/end-to-end |
| Đẩy ShinCRM -> FBM | Chọn Đẩy -> approve nếu vượt ngưỡng | Preflight -> candidate -> record gate -> form -> save -> read-back -> baseline | Chuyển request ghi và response thô | Offline có; chưa live ghi |
| Hai chiều | Chọn Đồng bộ hai chiều | Pull hoàn tất -> conflict/missing -> chỉ push candidate đủ điều kiện | Chuyển envelope theo GAS | Thứ tự đúng; còn bằng chứng push |
| Customer pull | Trong pull hoặc baseline | type 0 metadata -> type 1 cursor composite -> AliasName -> reconcile -> WriteGate | Fetch theo envelope | Logic có; paging nhiều trang chưa live |
| Activity theo Customer | Sau mỗi trang Customer | Customer page -> Activity type 0/1 theo `stt_rec` -> nối cha -> ghi -> quay Customer | Fetch theo envelope | Logic có; chưa live nhiều Customer |
| Activity bulk | Scheduler hoặc DEV runner | type 0/1 bulk -> bitmap GAS -> WriteGate mỗi lát -> missing status | Fetch theo envelope | Còn rà WriteGate nhiều lần trong `writeActivityBulkMissing` |
| Catch-up/rotation | Scheduler theo mốc ngày hoặc 30 Customer | Tính mốc Activity có FBM ID -> Customer -> Activity -> lưu cursor xoay | Fetch theo envelope | Đã lọc FBM ID; chưa live |
| Customer create/edit | Candidate push | Record gate -> form OldValue -> save -> verify -> baseline | Chuyển request nguyên văn | Offline đúng; chưa live |
| Activity create/edit | Candidate push | Owner gate -> form -> save -> verify -> baseline | Chuyển request nguyên văn | Còn rà owner absolute match |
| Conflict | Tab Kết quả -> một record | Prepare -> đọc lại FBM -> kiểm hash/reservation -> confirm choice/manual | Chuyển request refresh | Đã bỏ resolve trực tiếp; kho queue/phân trang còn thiếu |
| Failure/retry | Tab Lỗi -> Retry | GAS ghi failure/hash -> user retry -> candidate pending | Chuyển theo envelope GAS cấp | Ý tưởng đúng; map state còn nguy cơ quá lớn |
| Cancel/master off | Bấm Dừng hoặc tắt công tắc | Giữ request bay -> nhận response -> không cấp request tiếp; resume khi user chọn | Không tự retry | Có cancelPending; cần test request ghi đang bay |
| Heartbeat nền | Alarm 5 phút | Request heartbeat -> GAS kiểm công tắc/session -> heartbeat FBM -> GAS quyết định scan/login/request tiếp | Chỉ fetch envelope, không dựng request | Đã gộp một pipeline; còn GAS DEV/live |
| Kết quả/log | Mở Kết quả & xử lý | Query DTO theo trang; không trả state nội bộ/payload | Không tham gia | Còn thiếu API phân trang server-side |

### Lỗi request `GetDirViewPage` đã xác định

Request `GetDirViewPage/zccrAccount` là bước authorize đúng. Trước khi sửa, bridge ghi trace `bridge_response_sent` với `requestId` là ID waiter của Sidebar. GAS lấy trace cuối để đối chiếu reservation, nên trả `STALE_RESPONSE` và không cấp `GetGridViewPage/User`. Bridge hiện ghi ID này thành `clientRequestId`; `requestId` GAS trong executor trace được giữ nguyên. Test hồi quy đã thêm trong `tests/cases/fbmSync/Orchestration.js` và `tests/cases/extensionBridge.js`.

### Snapshot kiểm thử

- `node tests/run.js`: `1294/1294` đạt.
- `node tests/gas.js fbmStartIdentityProbe --push`: revision `@268` dựng request authorize đúng endpoint/controller; các entrypoint heartbeat/continue/transport-failure/status đã được đẩy và chạy lần lượt tới `@273`.
- Chưa đánh dấu live identity hoàn tất: còn phải quan sát request `GetGridViewPage` controller `User` sau response authorize.

### Việc còn lại trước khi yêu cầu chủ dự án test live

1. Gộp mỗi lần `writeActivityBulkMissing` trong một invocation thành một WriteGate/khóa hoặc continuation nội bộ an toàn.
2. Không ghi Customer và Activity qua hai WriteGate trong cùng invocation; tạo continuation GAS riêng.
3. Tách conflict/failure/pending push/locks và tập ID lớn khỏi state JSON; thêm API phân trang server-side.
4. Hoàn thiện continuation opaque cho các chặng ghi nội bộ; Extension không biết cursor nghiệp vụ.
5. Chạy các entrypoint GAS DEV heartbeat/continue/status và kiểm tra deployment relay sau khi commit nhóm thay đổi.
