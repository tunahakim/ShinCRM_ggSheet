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
- [ ] Test worker/executor với request thiếu, envelope hợp lệ, capture do GAS chỉ dẫn và response lớn.

## Kiểm thử và triển khai

- [x] Test offline sau đợt refactor hiện tại đạt `1241/1241`.
- [ ] Cập nhật test offline sau khi loại bỏ toàn bộ kiến thức FBM khỏi Extension.
- [ ] Chạy `node tests/run.js` đạt toàn bộ.
- [ ] Chạy nghiệm thu GAS DEV bằng `node tests/gas.js fbmSyncHeartbeatRequest --push` và các hàm relay liên quan.
- [ ] Tạo deployment DEV mới, cập nhật Sidebar lấy URL tự động, không cập nhật `chrome.storage` thủ công.
- [ ] Tải lại Extension và tab FBM; kiểm tra logged-in, logged-out, GAS timeout, không có tab, response lớn.
- [!] Live test chỉ thực hiện sau khi chủ dự án giữ tab FBM đăng nhập và xác nhận không ghi thật.

## Bàn giao

- [ ] Commit riêng lõi GAS, Extension bridge, test và tài liệu; cập nhật Checklist đồng bộ FBM.
- [ ] Báo rõ phần đã tự kiểm thử và thao tác chủ dự án phải làm; không đánh dấu hoàn tất khi chưa có kiểm tra live bắt buộc.
