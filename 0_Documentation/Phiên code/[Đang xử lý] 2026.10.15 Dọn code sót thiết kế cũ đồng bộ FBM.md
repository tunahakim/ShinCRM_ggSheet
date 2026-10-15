# Dọn code sót thiết kế cũ đồng bộ FBM

Branch `feature/fbm-legacy-cleanup`. Mục tiêu: gỡ code, khóa và nhánh còn sót từ các thiết kế đồng bộ FBM cũ (trigger hẹn giờ GAS, khóa lịch kiểu cũ, hai công tắc nền, handler Extension đời đầu), để mỗi hành vi chỉ còn một chỗ định nghĩa. Mỗi mục xóa đều phải grep xác nhận không còn nơi gọi (kể cả `DEV_RUNNER_ALLOWED`, client, Extension) trước khi xóa.

## Nhóm 0 — Trigger hẹn giờ GAS (đã xong)

- [x] Bỏ scheduler/supervisor bằng trigger hẹn giờ phía GAS; trigger cũ còn sót tự gỡ khi chạy lần kế (commit 6086f9b).
- [x] Test: trigger cũ tự gỡ, code đồng bộ không cài trigger hẹn giờ (commit a74c968).
- [x] Tài liệu 09/02 ghi GAS không cài trigger hẹn giờ (commit 423b3e0).
- [ ] [Cần kiểm chứng thật] Chủ dự án xem Executions: `fbmHeartbeatTrigger` không còn xuất hiện sau lần chạy kế, Sheet `Log` có dòng `legacy_trigger_removed`.

## Nhóm 1 — Xóa an toàn

- [x] Lịch nền chỉ còn một bộ khóa mốc (`FBM_SYNC_NEXT_CUSTOMER_FULL_SCAN`, `..._ACTIVITY_FULL_SCAN`, `..._DETAIL_SCAN`, `..._HEARTBEAT`); bỏ khóa cũ `FBM_SYNC_NEXT_CUSTOMER_SCAN`/`..._ACTIVITY_SCAN` và bí danh `customer`/`activity` trong cấu hình lịch (commit c032325, bf41ace).
- [x] Extension: bỏ handler `FBM_PING`/`FBM_EXECUTE` đời cũ (không V2) và `FBM_HEARTBEAT_NOW`; tăng version manifest 21.27; test `executor chi nghe kenh V2...`, `heartbeat chi chay theo alarm...` (commit b5b5bdc, 7ec4b45).
- [x] Bỏ hàm/hằng không ai gọi: `writeEnabled`, `saveStatus`, `retryRead`, `stateFinish`, `stateCount`, `getSyncStatus`, `LOCK_KEY`, `customerCreateAuthorizeRequest`, `AUTO_LOGIN_RETRY_MS`, `mergeLiveCategoryCell`, `categoryCompanionText`, `recalculateBaseline` (commit 7202878, d78802c). Giữ `GRID_FIELDS`: danh sách cột grid FBM dùng dựng fixture cho 6 test.
- [x] Bỏ entry point không ai gọi: `fbmSyncStartIdentityCheck`, `fbmSyncStartIdentityProbe`, `fbmSyncRecalculateBaseline`, `fbmSyncIdentityStatus`, `fbmSyncSaveIdentityBinding`, `fbmSaveLoginConfig`, `fbmHeartbeat`, `fbmSyncProtocolParse` (commit 7202878).
- [x] Sửa docstring lỗi thời còn nhắc "trigger 8 giờ" ở `EntryPoints.js` (commit 7202878).

## Nhóm 2 — Gộp và bỏ chuyển đổi dữ liệu cũ

- [x] Gộp hai công tắc lịch nền (`FBM_SYNC_BACKGROUND_ENABLED` và `enabled` trong lịch nền) thành một nơi lưu duy nhất là lịch nền; test `công tắc lịch nền chỉ một nơi lưu...` (commit c032325, bf41ace).
- [x] Bỏ chuyển đổi dạng dữ liệu cũ trong DocumentProperties: `SCOPE_LEGACY_LISTS`/`testMode` (SyncSettings), `pushFailuresMigrate` (State); đã dò Sheet DEV không còn dữ liệu dạng cũ (commit 1904f90, 8a78244). Giữ đường đọc `Config` cũ (khóa tiếng Việt ở AccountSettings, ngưỡng duyệt ở FbmFields): Sheet thật chưa chạy bản mới, 09/06 ghi đây là đường chuyển một lần.
- [x] Bỏ `BUDGET.readRetryLimit` và `retryCount`: hàm thử lại đọc chưa từng được nối vào luồng thật; 09/01 sửa lại cho đúng hành vi (lỗi đọc dừng lượt, báo Sidebar và Log, lượt sau chạy lại) (commit 1904f90).
- [x] Xóa 3 tệp DOM dự phòng rỗng của FBM (`fbm_sync/filler.js`, `scraper.js`, `selectors.js`) cùng commit Extension. Giữ `crawler/`, `zalo_rpa/`, `popup/`: đó là khung cho tính năng tương lai (Zalobot, cào dữ liệu), không phải sót từ thiết kế FBM cũ, ngoài phạm vi phiên này.

## Nhóm 3 — Tài liệu

- [x] 09/01: bảng các khóa DocumentProperties mà đồng bộ FBM dùng (tên khóa, tệp sở hữu, ý nghĩa).
- [x] 09/02: chỉ còn một công tắc lịch nền (08 không nói tới nơi lưu nên không cần sửa).

## Cần chủ dự án quyết

- [ ] Lớp 4 "vòng xoay giao dịch" (09/02 Phần 8) đang có hai bản cài đặt với hai con trỏ riêng: tiến trình nền `detail` (`FBM_SYNC_DETAIL_CURSOR_V1`, N khách mỗi lượt theo lịch) và vòng xoay 30 khách chạy kèm cuối mỗi lượt lấy giao dịch (`FBM_SYNC_ACTIVITY_ROTATION`, sau lớp bắt kịp). Tài liệu chỉ mô tả một vòng xoay theo lịch. Nếu bản chạy kèm là sót thiết kế cũ thì gỡ sẽ bớt khoảng 30 khách đọc giao dịch mỗi lượt; chưa gỡ vì đổi hành vi đọc FBM.

## Bàn giao

- [ ] `node tests/run.js` đạt toàn bộ; thử phá các test mới thấy đỏ rồi khôi phục.
- [ ] Đẩy GAS DEV (`node tests/gas.js smokeTest --push`).
- [ ] [Cần kiểm chứng thật] Chủ dự án tải lại Extension, mở Sheet DEV: công tắc "Bật lịch đồng bộ nền" bật/tắt có tác dụng, lượt nền vẫn chạy bình thường.
- [ ] Đổi tên tệp này sang `[Đã xử lý]`.
