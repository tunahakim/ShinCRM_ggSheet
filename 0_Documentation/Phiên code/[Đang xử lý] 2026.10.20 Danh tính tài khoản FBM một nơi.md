# Danh tính tài khoản FBM một nơi

Cùng branch `feature/expensive-ops`. Chủ dự án duyệt 2026-10-20: làm cả ba bước, "một việc một nơi, một nơi một việc; điều phối gọi công cụ, trao nhau bằng dữ liệu".

## Gốc lỗi

Log DEV 2026-10-20 00:04:55: Giữ phiên ném "thiếu mã người dùng FBM nên không dựng request đọc khách". Lượt Vòng xoay lúc 00:00 mở lượt mới (`stateStart` xóa phiên, kể cả `session.userId`) rồi hỏng ở request đầu (`FBM_FETCH_TIMEOUT`), nên phiên không được xác minh lại. Giữ phiên không mở lượt và không qua bước kiểm tra phiên, nên dựng request đếm khách bằng mã người dùng còn lại trong phiên, lúc đó đã trống. Gốc kiến trúc: điều kiện quyền đọc khách lấy mã người dùng từ phiên (thứ do lượt khác để lại) thay vì từ nơi sở hữu danh tính là liên kết tài khoản; trường `owner` khi ghi đã lấy từ liên kết.

Việc viết lặp cùng mảng:

1. Đọc danh tính đã liên kết: `bindingAccountName`, `identityCheckTarget`, `loginExpectedIdentity` (bản sao fallback), `bindingRead()` gọi thẳng; `bindingRead` nuốt lỗi đọc/parse im lặng.
2. Tách mã người dùng từ chuỗi cookie: hai bản (`scriptSettings`, `applyTransportSession`).
3. Ghi "phiên đã xác minh danh tính": hai khối chép (`loginIdentityContinue`, nhánh `session_probe` của `continueRun`) và hai chỗ ghi lẻ (`authContinue`, `identity_user_grid`).
4. So danh tính với danh tính kỳ vọng: `identityStatus` và phép so tự viết trong `loginIdentityContinue`; `authContinue` so lần thứ hai sau khi `session_probe` đã so (cổng phát request buộc mọi `authorize` qua probe).

## Việc

- [x] Bước 1: một bộ đọc danh tính liên kết, lọc quyền khách theo liên kết.
  - [x] `FbmSync.identityNormalize(value)` (bốn trường, không trim, đối chiếu nguyên văn) và `FbmSync.boundIdentity()` ở `reconcile/Identity.js`; `bindingRead` đọc qua `documentPropertyJson` (hỏng thì báo, không trả `{}` im lặng). Bỏ `bindingAccountName`, `identityCheckTarget`, `loginExpectedIdentity`; bên gọi dùng hai hàm mới.
  - [x] `scriptSettings` lấy `userId`, `accountName` từ `boundIdentity()`; bỏ đoạn tách cookie. `owner` khi dựng giao dịch lấy qua `scriptSettings()` như PushFlow.
  - [x] Test: phiên trống mã nhưng liên kết có mã `7777` thì request đếm khách của Giữ phiên mang `GetCustomerValidate('7777')`; liên kết trống thì không dựng request (`FBM_USER_ID_MISSING`). Hộp cát không sửa đè `scriptSettings` nữa; chỉ cấp mã thử ở nguồn `boundIdentity` khi liên kết trống (`capLienKetThu`).
- [ ] Bước 2: một hàm ghi phiên đã xác minh, một hàm so danh tính.
  - [ ] `FbmSync.sessionIdentityVerify(state, identity)` ở `transport/TransportCore.js` cạnh `sessionIdentityClear`; `loginIdentityContinue`, nhánh `session_probe`, `identity_user_grid` gọi hàm này (nhánh `identity_user_grid` chỉ ghi giá trị, không đánh dấu đã xác minh: dùng tham số rõ).
  - [ ] `identityStatus(runtime, expected)` nhận danh tính kỳ vọng; `loginIdentityContinue` bỏ phép so riêng.
  - [ ] `authContinue` bỏ phép so lần hai và bỏ `extractSessionIdentity` nếu bước 3 xác nhận response xác thực không mang danh tính.
- [ ] Bước 3: đo trên GAS DEV.
  - [ ] Đối chiếu response xác thực (`viewPage:false`) với Nghiên cứu FBM ch02 2.7.1–2.7.2: chỉ có `Row`, `Bugs`, `Authorized`, `ClientScript`.
  - [ ] Hàm dò so mã tách từ cookie và mã phiên với mã liên kết (chỉ trả đúng/sai, không trả giá trị).
  - [ ] Quyết bản tách cookie còn lại theo số đo.
- [ ] Chạy `node tests/run.js`, đẩy DEV, kiểm Giữ phiên chạy được sau khi xóa mã trong phiên; cập nhật tài liệu 09 liên quan; commit từng bước.
