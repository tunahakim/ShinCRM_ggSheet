# Đối chiếu liên kết với hai nguồn FBM

Cùng branch `feature/expensive-ops`, nối tiếp tệp `[Đã xử lý] 2026.10.20 Danh tính tài khoản FBM một nơi.md`. Chủ dự án duyệt 2026-10-20 ("ok đồng ý, làm đến khi nào xong thì mới dừng lại").

## Quyết định của chủ dự án

- Trong cài đặt đồng bộ FBM, hệ thống chỉ được dùng tên đăng nhập và mật khẩu (để tự đăng nhập). Mọi thông số khai báo khác và liên kết tài khoản chỉ dùng để đối chiếu, không thay cho giá trị trích từ FBM.
- Liên kết tài khoản phải được đối chiếu với cả hai nơi trên FBM, khớp cả hai mới coi là đăng nhập đúng tài khoản. Hai nơi so với liên kết, không so với nhau:
  - nơi 1, grid User: mã người dùng, tên đăng nhập, tên đầy đủ;
  - nơi 2, HTML trang chính sau đăng nhập (Nghiên cứu FBM ch02): mã người dùng tách từ payload cookie, tên đầy đủ từ khối menu `"username":"…"`. Tên đăng nhập không có ở nơi này.
- Trang không có giá trị (tab đang ở trang Login, trang lỗi hoặc trang tải từ trước khi đăng nhập) thì GAS ra lệnh tải tab về trang khách hàng rồi đọc lại; Extension chỉ làm theo. Đọc lại vẫn thiếu, hoặc giá trị lệch, thì dừng và báo lỗi rõ.
- Cookie trong body request giữ như cũ: có thì gửi, không có thì để trống (FBM-037).

## Gốc lỗi

- Giữ phiên đọc dữ liệu khách (request đếm khách mang điều kiện quyền `GetCustomerValidate`) nhưng được xếp vào nhóm request hệ thống nên không qua probe. Lượt trước hỏng giữa chừng thì phiên chưa xác minh, Giữ phiên vẫn dựng request bằng danh tính còn sót.
- Bước 1 tệp trước lấy mã cho điều kiện quyền và `owner` từ liên kết: trái quyết định trên, vì liên kết là giá trị khai báo.
- Request đếm khách của Giữ phiên được dựng trước khi tới cổng phát request. Khi mã chỉ còn lấy từ phiên đã xác minh thì việc dựng phải chờ sau cổng.

## Việc

- [x] Mục 1: Giữ phiên qua cổng kiểm tra phiên.
  - [x] Cổng `nextEnvelope` (TransportCore): đổi danh sách miễn probe thành đúng ba loại `login`, `identity_user_grid`, `session_probe`; `heartbeat` và `authorize` phải qua probe khi phiên chưa xác minh.
  - [x] Thêm `FbmSync.cursorStartEnvelope()`, dùng lại `sessionGateResumeProbeRequest` đã có: phiên đã xác minh thì dựng request từ cursor (`requestForCursor`) rồi bọc, chưa xác minh thì cấp probe với cursor quay về là cursor hiện tại. Nhờ vậy request đọc khách không bao giờ được dựng trước khi phiên được xác minh.
  - [x] Scheduler: hai chỗ mở Giữ phiên (`chainStart('heartbeat')`, `fbmSyncHeartbeatRequest`) gọi `cursorStartEnvelope()` thay cho `nextEnvelope(sessionSystemRequest('heartbeat'))`.
  - [x] Vai trò dữ liệu: cursor `heartbeat` là đầu vào; probe xác minh phiên và ghi danh tính; nhánh probe trả cursor về `heartbeat` và dựng request đếm với mã của phiên.
- [x] Mục 2: danh tính nghiệp vụ lấy từ phiên đã xác minh.
  - [x] `FbmSync.sessionVerifiedIdentity(state)` cạnh `sessionIdentityVerify`: trả mã, tên đăng nhập, tên đầy đủ của phiên khi `sessionIdentityIsVerified`, ngược lại trả rỗng.
  - [x] `scriptSettings` lấy `userId`, `accountName` từ hàm trên; bỏ `catch` im lặng khi đọc state.
  - [x] Sửa thông điệp `FBM_USER_ID_MISSING` (GridRead) và thông điệp thiếu tên đầy đủ (PushFlow) theo nguồn mới; sửa docstring `scriptSettings` và `boundIdentity`.
  - [x] Hộp cát test: bỏ `capLienKetThu`, cấp mã thử ở nguồn `sessionVerifiedIdentity` (`capPhienThu`); các phép kiểm Giữ phiên cũ dựng phiên đã xác minh hoặc đổi kỳ vọng sang luồng probe trước.
  - [x] Sửa lỗi gặp trên đường: probe lần thử lại (`sessionGateHandleProbeFailure`) trả envelope trần thay vì `{ ok, request }`, nên bên gọi không thấy request kế tiếp.
- [x] Mục 3: so liên kết với giá trị trích từ trang.
  - [x] `payloadCookieTransport` cấp thêm capture `pageUserId` (nhóm mã giữa 4 ký tự đầu và 5 ký tự hex trước `FHN_CRM_App` của payload cookie) và `pageAccountName` (khối menu `"username":"…"`), cùng nguồn `page_html`. Pattern nằm ở GAS, Extension áp nguyên trạng.
  - [x] `FbmSync.pageIdentity(rawResponse)`: đọc hai capture từ response hiện tại, không lưu vào state.
  - [x] `FbmSync.pageIdentityCheck(expected, page, reloaded)` (Identity.js): hàm kiểm thuần dùng chung cho hai điểm xác minh (nhánh `session_probe` và `loginIdentityContinue`), so bằng `identityMismatches` sẵn có. Trả `ok`; `reload` (trang thiếu giá trị, chưa tải lại); `missing` (đã tải lại vẫn thiếu, nơi gọi dừng `FBM_PAGE_IDENTITY_MISSING`); `mismatch` (nơi gọi dừng `SESSION_IDENTITY_MISMATCH` hoặc `LOGIN_IDENTITY_MISMATCH` sẵn có).
  - [x] Liên kết trống (lượt đọc danh tính để tự điền liên kết, kiểm tra liên kết lần đầu) thì không có gì để so; chỉ so khi có liên kết hoặc bản nháp đăng nhập thử.
- [x] Mục 4: lệnh tải tab về trang khách hàng.
  - [x] GAS: kết quả `reload` thì đặt cờ `pageReloaded` trong cursor và phát lại đúng request vừa gửi kèm `meta.reloadFbmPage` (URL `/Main/zccrAccount.aspx`). Ngân sách cộng thêm thời gian chờ tab như `afterLoginUrl`.
  - [x] Extension `prepareFbmTab`: có `meta.reloadFbmPage` thì điều hướng tab tới đúng URL đó, chờ tải xong và có executor, rồi mới gửi request. Thêm `reloadFbmPage` vào hợp đồng, chép mã hợp đồng mới vào service worker.
- [x] Mục 5: test offline.
  - [x] Giữ phiên khi phiên chưa xác minh: request đầu là probe, sau probe là request đếm mang mã của grid User.
  - [x] Trang lệch liên kết: dừng `SESSION_IDENTITY_MISMATCH`, không có request đọc khách.
  - [x] Trang thiếu giá trị: phát lại probe kèm `reloadFbmPage`; vẫn thiếu thì dừng `FBM_PAGE_IDENTITY_MISSING`.
  - [x] Sau đăng nhập: trang khớp thì tiếp tục, trang lệch thì dừng.
  - [x] Extension: `prepareFbmTab` điều hướng tab khi có `reloadFbmPage`.
- [x] Mục 6: nghiệm thu DEV và tài liệu.
  - [x] Đẩy code lên GAS DEV (bản triển khai @970, relay @971).
  - [x] Hai pattern chạy trên HTML tab FBM thật (`/Main/zccrAccount.aspx`) ra đúng mã người dùng và tên đầy đủ.
  - [x] Sửa tài liệu 09/02 (nguồn mã người dùng) và 09/01 (mục "Xác minh tài khoản của phiên", bước 5 "Chuẩn bị tab FBM").
  - [x] Chủ dự án tải lại Extension (mã hợp đồng `e5476b1e7f9c`).
  - [x] HTTP 403 "Truy cập bị từ chối" (19:55–21:13, cả cửa chạy hàm lẫn relay nền nên Log trống) là do quyền của script hết hạn; chủ dự án cấp lại quyền thì chạy lại. Nghi do dự án Google Cloud `test-project-cho-claude-opus` đang ở chế độ Testing (Google hủy quyền sau 7 ngày); chủ dự án tự chuyển sang Production.
  - [x] Trên Sheet DEV: lượt nền 21:14 đi probe, so trang khớp rồi đọc khách, xong không lỗi; Giữ phiên 21:24 với phiên đã xác minh gửi thẳng request đếm, OK; Log không còn lỗi thiếu mã người dùng. Nhánh Giữ phiên khi phiên chưa xác minh chỉ có test offline, vì không dựng được trạng thái đó trên DEV mà không thêm công cụ.
