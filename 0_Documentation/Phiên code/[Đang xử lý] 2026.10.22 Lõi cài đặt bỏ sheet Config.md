# Bỏ sheet Config: lõi cài đặt

Branch `feature/config-core`. Tách từ mục 2 của `2026.10.17 Todo.md`.

## Bối cảnh

- Bối cảnh: chủ dự án đã chốt "sự thật chỉ nằm ở một nơi": bỏ hẳn sheet `Config`, mọi thứ người dùng chỉnh được chuyển vào Sidebar, lưu ở Document Properties. Yêu cầu chi tiết (4 khối của Config, cảnh báo 3 lớp, đường chữa cháy, thử nhân bản file có mang Document Properties không) ở `2026.10.07 Prompt Sonnet chuyển Config vào Sidebar.md`, kể cả mục "Bổ sung 2026-10-17". Mục V8 (Config đọc ba lần mỗi lượt `loadCore`) hoãn sang đây và tự hết khi bỏ sheet.
- Thay đổi so với tệp prompt (chốt 2026-10-21): tách đôi. Phiên này làm phần lõi: một bảng khai cài đặt duy nhất (tên, kiểu, giới hạn, mặc định, hướng dẫn), một cổng đọc/ghi qua bản đọc kho DocumentProperties của lần gọi, di chuyển dữ liệu một lần từ Config, xóa sheet Config, hàm GAS chạy tay để xem và sửa cài đặt. Màn Cài đặt làm ở phiên UI (mục 4) và vẽ từ bảng khai, không dựng trên UI cũ rồi viết lại.
- Lý do sau mục 1: hai mục không phụ thuộc nhau, đổi chỗ được; mục 1 chạm mọi phần của UI nên làm trước, mục này chỉ chạm một màn.

## Checklist

- [x] Đọc tệp prompt chuyển Config, tài liệu chính thức phần Config, tài liệu 01 phần liên quan
- [x] Đọc code: `Settings.js`, `ConfigParams.js`, `ConfigSheetSetup.js`, `ConfigRead.js`, chỗ đọc `@CFG_`, `SyncSettings.js`/`AccountSettings.js` (đã chuyển Config sang kho)
- [x] Đo `measureConfigReads` trước khi sửa (2026-10-22: lượt lạnh `configParams` 1487 ms gồm mở Sheet lần đầu; lượt ấm `configReadAll` 8–10 ms, `reloadConfig` 9–10 ms; đọc thật 1 lần mỗi lượt, còn lại dùng bản nhớ)
- [ ] Thử bản sao tệp Sheet DEV có mang DocumentProperties không (cần chủ dự án tạo bản sao, sau khi có hàm xem cài đặt)
- [x] Trình phương án ba phần. Chủ dự án duyệt 2026-10-22 (xem mục Thiết kế đã chốt)
- [x] Đọc toàn bộ tài liệu 01; đọc code mở form trống phía Sidebar và `FieldLogic` hai phía
- [x] Cổng cài đặt `server/settings/`: đọc, kiểm (thuần, nhận ngữ cảnh), ghi; bộ kiểu trường cố định
- [x] Bảng khai phần cài đặt của lõi: tham số vận hành; dữ liệu (cột tự thêm, ngầm định khi nhập trên Sidebar, sắp xếp chung)
- [x] Phần cài đặt của FBM trong `fbm_sync`: ngầm định khi kéo từ FBM (giá trị Xác thực)
- [x] Người điều phối `settingsSave` (khóa, đọc ngữ cảnh, kiểm, ghi, tín hiệu nạp lại) và `settingsReadAll` trả hợp đồng `config` cũ
- [x] Công cụ ngầm định dùng chung: kiểm giá trị bằng bộ kiểm của trường, bỏ giá trị lệch, phát/gỡ thông báo
- [x] `LOG_TRACE` đọc từ kho; cảnh báo đang bật thành thông báo
- [x] Thay mọi chỗ gọi `configGet`, `configParams`, `configReadAll`; bỏ `SETTINGS_CONFIG_CACHE`
- [x] Sidebar điền ngầm định đã kiểm vào form trống
- [x] Đường chữa cháy: `shinSettingsShow`, `shinLogTraceOff`
- [x] Hàm chạy tay `settingsMigrateFromConfig`: đọc, kiểm, ghi, đọc lại so, đủ mới xóa sheet; lỗi thì thông báo, không xóa
- [x] Gỡ code sheet Config: tệp `server/config/ConfigSheetSetup.js`, `ConfigParams.js`, `server/sheet/ConfigRead.js`, menu Khôi phục Config, phần Config ở dựng sheet, khung sheet, chính sách sheet, trigger, chọn ô, chẩn đoán, đường lùi `configGet` của FBM và `IdGate`
- [x] Hàm dò DEV: `LogTraceSwitch`, `ReloadMatrixProbe`, `ConfigReadProbe`, `FbmSyncFixture`
- [x] Test offline: cổng cài đặt, ngầm định (lệch thì không điền, có thông báo), di chuyển, quét mã không còn Config
- [x] Tài liệu chính thức: 00, 01, 02, 02A, 03, 05, 05A, 06, 07, 07A, 08, 08A, 10
- [x] Cập nhật `Cây thư mục code.md`
- [x] `node tests/run.js` xanh
- [x] GAS DEV: chạy di chuyển trên Sheet DEV, hàm dò cổng cài đặt `--push`
- [ ] Nhờ chủ dự án thử bản sao tệp mang DocumentProperties không
- [x] Ghi phần cần nghiệm thu trên Sidebar vào mục 4 Todo
- [ ] Commit, hỏi chủ dự án trước khi gộp vào `main`

## Thiết kế đã chốt (2026-10-22)

- Cổng cài đặt dùng chung không biết có những loại cài đặt nào. Mỗi module tự khai phần cài đặt của mình (thuần dữ liệu: tên phần, module sở hữu, khóa kho `SETTINGS:<phần>`, các trường với kiểu, giới hạn, mặc định, hướng dẫn, nguồn lựa chọn). Thêm cài đặt bot, Extension sau này chỉ là thêm một bảng khai.
- Ngầm định gắn với kênh nhập: ngầm định khi nhập trên Sidebar thuộc phần của lõi; ngầm định khi kéo từ FBM thuộc phần của FBM; sau này bot có phần riêng. Một công cụ áp ngầm định dùng chung, dữ liệu theo từng kênh.
- GAS kiểm ngầm định mỗi lần nạp bằng đúng bộ kiểm của trường (`FieldLogic`), nhận cả danh sách cố định lẫn Category; giá trị lệch bị bỏ khỏi gói và phát thông báo (tự hết khi khớp lại). Sidebar chỉ chép ngầm định đã kiểm vào form trống.
- Bảng giá trị "Cho phép đồng bộ FBM" giữ trong code (gắn hành vi đẩy/kéo), người dùng chỉ chọn giá trị điền sẵn qua ngầm định.
- Mỗi phần một khóa kho; di chuyển bằng hàm chạy tay một lần; bỏ menu Khôi phục Config; giữ tên khối `config` trong RAM Sidebar tới mục 4. Cài đặt FBM đang có chuyển về cổng chung ở chặng 3.
