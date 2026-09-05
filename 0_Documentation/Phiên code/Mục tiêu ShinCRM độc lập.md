# Mục tiêu: ShinCRM độc lập

Đích của phiên code, chủ dự án chốt ngày 05/09/2026: **ShinCRM dùng được độc lập** — đủ tính năng theo bản thiết kế, chạy được cùng Extension mà không phụ thuộc gì khác. Chưa cần đồng bộ FBM, chưa cần bot. Chạy tới khi xong mới thôi.

Hai quyền kèm theo: tài liệu thiết kế có chỗ chưa chuẩn thì **được sửa tài liệu** rồi code theo bản đúng; điểm mơ hồ thì ghi vào `Câu hỏi đêm.md`, chọn phương án an toàn, chạy tiếp.

## Thế nào là xong

Hết Giai đoạn 1 của tài liệu 00 — tức chặng 1.2 nghiệm thu xong, cộng 1.3, 1.4, 1.5. Mốc "đã dùng được để đi bán hàng" là hết 1.4; 1.5 làm nốt vì nó thuộc bản thiết kế.

Ba điều kiện nghiệm thu, thiếu một là chưa xong:

1. Bộ kiểm offline `node tests/run.js` xanh hết.
2. Mỗi chặng nghiệm thu trên tệp Sheet DEV thật, không chỉ trên hộp cát.
3. Đối chiếu ngược lại tài liệu: mọi mục `[RÀNG BUỘC CỨNG]` của tài liệu 03, 04, 05, 06, 07 có chỗ trong code hoặc có lý do ghi lại vì sao không.

## Việc còn lại

**Chặng 1.2 — còn một việc:** nhánh dự phòng của thang gói (`bootChunkWithFallback` ở `client/ram/bootstrap.html`) chưa có đường kiểm tự động. Thang chính thì đã chạy thật rồi — lượt nạp trên Sheet DEV chia 10.000 giao dịch thành 5 gói. Nhánh dự phòng chỉ chạm tới khi một gói thật sự quá to, nên nó chờ một lượt nạp cố tình hạ cỡ gói xuống.

**Chặng 1.3 — vẽ được form.** Bộ máy giao diện đã đủ để bấm, đã có đường tự soi bố cục tại máy (`node tests/preview.js`), hộp tìm khách chạy được, và một lượt sửa bố cục theo bản kê nhận xét của chủ dự án ngày 06/09/2026. Còn đúng một việc:
- [ ] Nghiệm thu bằng mắt chủ dự án trên Sheet DEV thật: bấm hết mười lăm hành động, mở và đóng ba màn form, thử cả đường menu và đường thu gọn

**Chặng 1.4 — lưu được:** `client/save/saveFlow.html`, `server/gate/` cửa ghi, `server/FieldLogic`, xóa mềm và hoàn tác.

**Chặng 1.5 — làm mới và sheet quản trị:** `server/view/`, chiều ghi của `DirtyState`, `client/ram/refresh.html`, ngôn ngữ lọc của tài liệu 08.

**Extension — chỉ phần phục vụ chọn khách:** `2_ShinCRM_Extension/` đang là khung, chỉ `content_scripts/scout/sheet_scout.js` và `content_scripts/bridge/iframe_bridge.js` có nội dung thật, còn lại là tệp rỗng 12 dòng. Cần xong: bắt click ô trên sheet → `setCurrentCustomer`, và hai lỗ an ninh của bản cũ (không kiểm `event.origin`; `sidebarWindow` gán cho frame nào gửi `CRM_HANDSHAKE` trước mà không xác thực).

## Ngoài phạm vi

`fbm_sync`, `crawler`, `zalo_rpa` trong Extension và cả Giai đoạn 3, 4. Các tệp stub cứ để nguyên, không xóa và không viết nội dung.
