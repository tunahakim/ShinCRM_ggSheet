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
- [ ] Trình phương án ba phần, chờ duyệt
