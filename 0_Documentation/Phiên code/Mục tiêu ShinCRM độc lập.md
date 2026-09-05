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

**Chặng 1.3 — vẽ được form.** Thứ tự dưới đây thay cho thứ tự ở `Câu hỏi đêm.md` mục 4.5, vì lý do sau: mười sáu hành động chỉ bấm được sau khi lượt vẽ cuối của boot đổi sang màn xem — màn tóm tắt lượt nạp hiện tại không có nút `data-action` nào. Nên bộ phát click, hai nửa DOM và cú đổi boot phải đi liền một khối rồi nghiệm thu ngay, trước khi mở sang hộp tìm kiếm là việc lớn nhất còn lại.
- [ ] `client/ui/dispatch.html` — bộ phát click: một tai nghe đặt ở khung, tìm `[data-action]` gần nhất, gọi `ACTIONS[tên]`, đặt con trỏ theo `focusId` trả về, và đưa mọi lỗi ném ra — kể cả Promise bị chối — vào `alert()`
- [ ] `client/ui/menu.html` và `client/ui/collapse.html` — hai nửa chạm DOM mà engine cố ý không nhận, xem `Câu hỏi đêm.md` mục 2.1. Menu phải giữ một đường vào màn tóm tắt lượt nạp, vì sau cú đổi boot bên dưới nó không còn tự hiện nữa
- [ ] Đổi lượt vẽ cuối của `sidebarBoot()` từ `statusLoadSummary` sang `screenViewGo()`, thêm `screenViewDropStale()` ở `viewScreen.html` gọi ngay trước đó, và nối ba tệp mới vào danh sách `include` của `client/Sidebar.html`
- [ ] Nghiệm thu trên Sheet DEV thật, lần một: mở sidebar, bấm hết mười sáu hành động, mở và đóng ba màn form, thử cả đường menu và đường thu gọn
- [ ] Hộp tìm kiếm, và bê các nếp bàn phím của code cũ sang dạng `SLOTS`/`ACTIONS`: dán tự tách trường, dropdown, Enter nhảy ô, dọn số điện thoại
- [ ] Nghiệm thu trên Sheet DEV thật, lần hai, và soát ngược mọi `[RÀNG BUỘC CỨNG]` của tài liệu 04 cho phần giao diện

**Chặng 1.4 — lưu được:** `client/save/saveFlow.html`, `server/gate/` cửa ghi, `server/FieldLogic`, xóa mềm và hoàn tác.

**Chặng 1.5 — làm mới và sheet quản trị:** `server/view/`, chiều ghi của `DirtyState`, `client/ram/refresh.html`, ngôn ngữ lọc của tài liệu 08.

**Extension — chỉ phần phục vụ chọn khách:** `2_ShinCRM_Extension/` đang là khung, chỉ `content_scripts/scout/sheet_scout.js` và `content_scripts/bridge/iframe_bridge.js` có nội dung thật, còn lại là tệp rỗng 12 dòng. Cần xong: bắt click ô trên sheet → `setCurrentCustomer`, và hai lỗ an ninh của bản cũ (không kiểm `event.origin`; `sidebarWindow` gán cho frame nào gửi `CRM_HANDSHAKE` trước mà không xác thực).

## Ngoài phạm vi

`fbm_sync`, `crawler`, `zalo_rpa` trong Extension và cả Giai đoạn 3, 4. Các tệp stub cứ để nguyên, không xóa và không viết nội dung.
