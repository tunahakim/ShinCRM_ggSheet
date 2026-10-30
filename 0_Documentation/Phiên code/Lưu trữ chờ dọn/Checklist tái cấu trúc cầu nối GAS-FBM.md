# Checklist tái cấu trúc cầu nối GAS-FBM

Mục tiêu của đợt này: toàn bộ nghiệp vụ FBM, request, response projection, cursor, trạng thái phiên và quyết định dừng/chạy nằm ở GAS. Extension chỉ làm cầu nối: nhận envelope do GAS cấp, gửi nguyên request vào tab FBM, nhận response và trả lại cho GAS. Extension không tự dựng request, không tự chọn bước, không tự parse nghiệp vụ và không tự đặt giới hạn số lượt.

Quy ước trạng thái: `[ ]` chưa làm, `[~]` đang làm, `[x]` đã kiểm thử offline, `[!]` cần chủ dự án quyết định hoặc kiểm tra live.

## Ranh giới kiến trúc

- [x] Đọc lại quy chuẩn nền, mục lục 09, kiến trúc/giao thức, nhịp pipeline, bảo mật kết nối và bộ máy render.
- [x] Agent độc lập đã rà đúng phạm vi tài liệu 09 và nghiên cứu FBM cần thiết: 09.01/09.02/09.06/09A, `ch02-auth-session.md`, fixture Login và Customer; không quét toàn bộ thư mục nghiên cứu.
- [x] Chốt GAS là nơi dựng request hoàn chỉnh và quyết định có cấp request hay không.
- [x] Chốt Extension không có fallback request FBM; không có envelope thì không gọi tab.
- [x] Heartbeat đã có cổng `heartbeat_request`: GAS cấp envelope, worker chuyển request, response quay lại GAS.
- [x] Executor không còn tự dựng `HEARTBEAT_URL`/Customer payload.
- [x] Bỏ giới hạn số lượt heartbeat/background hardcode trong Extension; GAS quyết định trả request tiếp hay `null`.
- [x] Capture response generic nhận chỉ dẫn từ GAS qua `meta.transport`, không hardcode tên trường trong bộ lọc generic.
- [ ] Rà và loại bỏ mọi endpoint/path/operation/entity/record nghiệp vụ còn sót trong Extension.
- [ ] Rà và loại bỏ mọi quyết định mode, scan, cursor, retry, session, conflict và auto-login khỏi Extension.
- [x] Giữ đúng ngoại lệ bảo mật đã chốt ở 09.06: Extension mã hóa/giải mã credential nội bộ và thực hiện adapter login; GAS chỉ giữ envelope, điều phối trạng thái và quyết định khi nào được thử.

### Ràng buộc đã xác nhận sau khi rà tài liệu

- [x] Mỗi alarm chỉ hỏi GAS trước; GAS trả `request: null` khi relay lỗi, đồng bộ tắt, chưa có tab/phiên, chưa tới hạn thử login hoặc cần chờ người dùng. Extension không được tìm tab hay gửi FBM trong các trường hợp đó.
- [x] Hết phiên không xóa alarm vật lý; GAS chuyển trạng thái chờ đăng nhập và chỉ cấp login envelope tối đa một lần mỗi 30 phút. Đăng nhập dùng `force:false`; nếu FBM báo phiên đang được sử dụng thì giữ trạng thái chờ, không thử dồn.
- [x] Không tự suy diễn heartbeat từ `Default.aspx`; request heartbeat phải do GAS dựng theo hợp đồng module Customer hiện hành.
- [ ] Thống nhất lại hợp đồng projection/capture generic giữa 09.01 và 09A; trong thời gian chờ, response không có chỉ dẫn phải được chuyển nguyên văn.

### Ranh giới credential đã chốt theo tài liệu 09.06

Credential là ngoại lệ bảo mật duy nhất của cầu nối: Extension giữ vault và giải mã nội bộ để adapter login hoạt động; GAS không nhận password bản rõ, chỉ giữ envelope và điều phối thời điểm thử. Không được mở rộng ngoại lệ này sang nghiệp vụ đồng bộ, cursor, hash, conflict hoặc quyết định request.

## GAS và relay

- [x] GAS có request heartbeat tối thiểu do `FbmSync` dựng và kiểm tra công tắc/phiên trước khi cấp.
- [x] Relay `doPost` phân biệt `heartbeat_request`, `heartbeat`, `background_sync` và trả DTO gọn.
- [ ] GAS cấp projection/capture instruction cho từng request cần giảm response lớn.
- [ ] GAS là nơi đặt giới hạn batch/hop và trả `request: null` khi kết thúc; không để worker tự đoán.
- [ ] GAS DEV có entrypoint và test cho request envelope, response raw, projection, session expired và relay lỗi.

## Extension bridge

- [x] Worker không gửi FBM khi GAS timeout, lỗi hoặc không cấp request.
- [x] Executor chuyển `bodyText` nguyên văn do GAS dựng.
- [x] Executor xử lý transport chung: timeout, gzip/text response, capture theo chỉ dẫn; adapter login là ngoại lệ bảo mật được 09.06 chốt.
- [x] Không chuyển password hoặc khóa giải mã lên GAS; login adapter không được mở rộng thành nơi giữ state/cursor/quyết định nghiệp vụ.
- [ ] Bridge không log/trace operation, entity, recordId, endpoint hoặc payload nghiệp vụ.
- [ ] Bridge chỉ lưu chẩn đoán transport tối thiểu, không lưu cookie/mật khẩu/payload.
- [x] Test worker/executor với request thiếu, envelope hợp lệ, capture do GAS chỉ dẫn và response lớn; bổ sung kiểm tra bridge không ghi đè `requestId` GAS.

## Kiểm thử và triển khai

- [x] Test offline sau đợt refactor hiện tại đạt `1295/1295`.
- [x] Cập nhật test offline sau khi loại bỏ toàn bộ kiến thức FBM khỏi Extension.
- [x] Chạy `node tests/run.js` đạt toàn bộ.
- [~] Đã chạy `fbmStartIdentityProbe`, `fbmSyncHeartbeatRequest`, `fbmSyncHeartbeat`, `fbmSyncContinue`, `fbmSyncHeartbeatTransportFailure` và `fbmSyncStatus` với `--push` tới revision `@274`; còn cần reset state DEV và hoàn tất các case continuation có reservation thật.
- [x] Tạo/cập nhật deployment DEV `@268`; Sidebar lấy URL tự động, không cập nhật `chrome.storage` thủ công.
- [ ] Tải lại Extension và tab FBM; kiểm tra logged-in, logged-out, GAS timeout, không có tab, response lớn.
- [!] Live test chỉ thực hiện sau khi chủ dự án giữ tab FBM đăng nhập và xác nhận không ghi thật.

## Bàn giao

- [ ] Commit riêng lõi GAS, Extension bridge, test và tài liệu; cập nhật Checklist đồng bộ FBM.
- [ ] Báo rõ phần đã tự kiểm thử và thao tác chủ dự án phải làm; không đánh dấu hoàn tất khi chưa có kiểm tra live bắt buộc.

## Đợt audit toàn pipeline 2026-09-14

Nguồn đối chiếu chi tiết: `0_Documentation/Phiên code/Audit pipeline đồng bộ FBM.md`.

- [x] Liệt kê và đối chiếu toàn bộ pipeline kết nối, nhận diện, pull, scheduler, push, conflict, recovery, state, DTO và UI với tài liệu 09 và code hiện tại.
- [x] P0: tách quyền ghi Sheet khỏi quyền ghi FBM; mode `read` phải ghi ShinCRM nhưng không ghi FBM.
- [ ] P0: đưa response của pipeline nền qua `FbmSync.continue`; không lặp cursor authorize trong `fbmSyncHeartbeatLocked`.
- [ ] P0: tiếp tục đúng cursor sau hop limit thay vì trả `SYNC_ALREADY_RUNNING` ở alarm kế.
- [ ] P0: thay nơi lưu tập ID lớn, conflict và failure map; không để một `DocumentProperty` giữ state có thể vượt giới hạn.
- [ ] P0: không cắt conflict rồi giữ lock; mọi chốt conflict phải có reservation và đọc lại, bỏ đường resolve trực tiếp.
- [x] P0: bỏ cờ ẩn `FBM_SYNC_ALLOW_WRITES` đã bị tài liệu/UI loại.
- [ ] P0: giữ ngữ cảnh request đang bay khi cancel/master off, đặc biệt `push_wait`; response cũ không được tiếp tục pipeline.
- [x] P1: giữ và đối chiếu username trong identity binding/login test cùng userId, tên đầy đủ và Spreadsheet ID.
- [ ] P1: phân biệt state chưa biết cookie với phiên đã xác nhận logout; không auto-login chỉ vì GAS chưa capture cookie.
- [~] P1: giảm response authorize và test tích hợp response thật từ Sidebar qua GAS đến request `controller:User`; đã sửa lỗi trace bridge và thêm lớp bỏ qua trace `bridge_*`, còn chờ live xác nhận request User.
- [x] P1: Activity catch-up chỉ lấy mốc từ Activity đã có FBM ID.
- [ ] P1: bỏ `ALT00010` khỏi recordId log tổng hợp và không tự chạy audit DEV sau mọi phiên check/read.
- [ ] P1: bổ sung phân trang server-side thật cho conflict/lỗi/log và loại locks khỏi DTO Sidebar.
- [!] Chỉ gọi chủ dự án test lại sau khi toàn bộ P0, test offline và GAS DEV liên quan đã đạt.

### Kế hoạch thực thi sau audit

Đây là danh sách tiến độ chuẩn của đợt sửa hiện tại. Phần audit phía trên chỉ ghi phát hiện; trạng thái hoàn thành chỉ lấy theo các mã dưới đây để tránh hai dấu tick mâu thuẫn sau khi ngữ cảnh hội thoại bị nén. Mỗi mục chỉ được đổi sang `[x]` khi code, test hồi quy trực tiếp và toàn bộ test offline đều đạt; mục chạm hợp đồng GAS còn phải có GAS DEV `--push` đạt trước khi tick.

#### P0 — Chặn sai dữ liệu, kẹt phiên hoặc mất khả năng xử lý

- [x] `P0-01` Bỏ khóa lồng `transport_failure`: cổng điều phối chỉ lấy `orchestrationLock` đúng một lần và có test chứng minh không tự deadlock.
- [x] `P0-02` Hợp nhất continuation nền: response đầu của heartbeat chỉ do handler heartbeat xử lý; request tiếp theo của cursor phiên nền phải nộp qua command `continue` và `FbmSync.continue`, relay dùng đúng `kind: "background_sync"`. Test offline `1287/1287`; GAS DEV `fbmSyncHeartbeatRequest` đạt `@263`, `fbmSyncHeartbeat` và `fbmSyncContinue` fail-closed `STALE_RESPONSE` ở `@264–@265` khi không có reservation.
- [x] `P0-03` Tiếp tục đúng cursor sau khi hết giới hạn hop/lát; alarm kế tiếp không được mắc vĩnh viễn ở `SYNC_ALREADY_RUNNING` và Extension không tự đặt giới hạn nghiệp vụ. Test offline chứng minh alarm dựng lại request từ cursor đã lưu.
- [x] `P0-04` Thay bitmap `seen` theo vị trí mảng bằng khóa nhận diện bền vững và cố định phạm vi kỳ quét, để thêm/xóa/sắp xếp dòng giữa kỳ không làm đánh dấu nhầm hoặc kết luận nhầm bản ghi mới là vắng mặt. Bitmap dùng đúng phần số sáu chữ số của mã nội bộ `CUS-/ACT-`, kiểm namespace theo scope, fail-closed với mã cũ/lạ/sai scope, lưu `HIGH_WATER` ngay trước request đầu tiên và coi cả scope rỗng là ngoài phạm vi. Record mới từ kết quả WriteGate được đánh dấu lại. Test offline bao phủ đổi thứ tự, record mới, scope rỗng, mã cũ, mã không số, mã thiếu sáu chữ số và sai namespace; toàn bộ `1292/1292` đạt.
- [ ] `P0-05` Thay mảng conflict bị cắt ở 100 bằng kho bền có phân trang; mọi conflict còn tồn tại phải còn truy vấn và xử lý được, không để lock mồ côi.
- [ ] `P0-06` Tách conflict, failure, pending push, lock và tập ID lớn khỏi JSON state chung; không tạo state mới trong `ScriptProperties` và không để một `DocumentProperty` vượt quota.
- [ ] `P0-07` Buộc mọi quyết định conflict đi qua reservation, đọc lại FBM và kiểm response còn hiệu lực; bỏ cổng resolve trực tiếp có thể chốt từ dữ liệu cũ.
- [ ] `P0-08` Tách `canWriteSheet(mode)` khỏi `canWriteFbm(mode)` và bỏ cờ ẩn `FBM_SYNC_ALLOW_WRITES`; mode `read` được ghi ShinCRM nhưng tuyệt đối không ghi FBM.
- [ ] `P0-09` Giữ đủ ngữ cảnh request đang bay khi cancel hoặc tắt công tắc tổng, đặc biệt `push_wait`; response cũ chỉ được đóng lát an toàn và không được cấp request kế tiếp.
- [~] `P0-10` Bổ sung test trực tiếp cho hơn 100 conflict, thay đổi thứ tự record trong kỳ, record mới trong phép quét vắng mặt, hop limit, khóa lồng và transport failure của phiên thủ công. Đã có test thứ tự record, record mới, hop limit và khóa lồng; còn test conflict >100 và transport failure phiên thủ công.

#### P1 — Hợp nhất cổng điều phối và hoàn tất hợp đồng công khai

- [x] `P1-01` Làm `statusView` thuần đọc; chuyển stale recovery sang supervisor hoặc command có khóa để API `status` không đua state với continuation và đường báo `BUSY` không ghi ngầm. Test offline chứng minh status không tự ghi stale state.
- [ ] `P1-02` Đưa mọi entrypoint DEV/compat có thay đổi state qua wrapper chính thức, cùng cổng khóa và cùng luật công tắc tổng; dọn whitelist DEV đã lỗi thời.
- [ ] `P1-03` Đối chiếu tuyệt đối identity bằng Spreadsheet ID, userId, tên đầy đủ và username; thao tác đọc trạng thái không được tự nâng cấp hoặc lưu binding chưa được người dùng xác nhận.
- [ ] `P1-04` Phân biệt trạng thái GAS chưa biết cookie với phiên đã xác nhận logout; không kích hoạt auto-login chỉ vì state server chưa capture cookie.
- [ ] `P1-05` Giảm response authorize theo chỉ dẫn generic của GAS và có test tích hợp response authorize thật từ Sidebar qua GAS đến request `controller:User`.
- [ ] `P1-06` Activity catch-up chỉ lấy mốc từ Activity đã có FBM ID.
- [ ] `P1-07` Bỏ `ALT00010` khỏi recordId log tổng hợp và tách audit DEV khỏi loop sản phẩm.
- [x] `P1-08` Chỉ giữ một implementation relay continuation cho pipeline nền; đã loại `fbmRunBackgroundSync` và listener `FBM_BACKGROUND_SYNC` khỏi Extension. Nhịp nền duy nhất đi qua heartbeat rồi `background_sync` continuation do GAS cấp.
- [ ] `P1-09` Hoàn thiện transport failure thủ công, API phân trang server-side thật cho conflict/lỗi/log và loại lock/state nội bộ khỏi DTO Sidebar.
- [ ] `P1-10` Rà toàn bộ Extension và xóa endpoint, operation, entity, recordId, mode, cursor, retry, session, conflict hoặc quyết định nghiệp vụ còn hardcode; giữ duy nhất adapter login/vault theo ngoại lệ bảo mật đã chốt.

#### P2 — Bằng chứng và bàn giao trước live

- [ ] `P2-01` Sau mỗi nhóm thay đổi, chạy test liên quan rồi chạy `node tests/run.js`; ghi số test thật và commit tương ứng vào checklist.
- [~] `P2-02` Đã chạy các entrypoint GAS DEV relay/identity/heartbeat/status bằng `--push` tới `@274`; còn thiếu case continuation nền có reservation, resume hop limit và conflict stale response trên state DEV sạch.
- [ ] `P2-03` Tạo/cập nhật deployment DEV và chứng minh Sidebar tự chuyển relay config sang Extension; không yêu cầu cập nhật `chrome.storage` thủ công.
- [ ] `P2-04` Cập nhật tài liệu chính thức/checklist bị code mới làm lỗi thời, cây thư mục nếu có thêm tệp, rồi commit theo nhóm GAS, Extension, test và tài liệu.
- [!] `P2-05` Chỉ yêu cầu chủ dự án giữ tab FBM để nghiệm thu logged-in, logged-out, mất tab, timeout, response lớn và live `ALT00010` sau khi toàn bộ `P0-*`, `P1-*` và bằng chứng tự động tương ứng đã đạt.
