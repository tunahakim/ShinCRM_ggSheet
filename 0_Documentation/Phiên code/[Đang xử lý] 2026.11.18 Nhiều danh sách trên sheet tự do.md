# Nhiều danh sách khách trên một sheet tự do

Mục tiêu: một sheet xem tự do (bảng Kanban) chứa nhiều danh sách đặt cạnh nhau, mỗi danh sách có cột mã riêng; nhấp ô nào cũng mở đúng khách của danh sách chứa ô đó. Làm trên branch `feature/fbm-audit` theo quyết định chủ dự án 2026-11-18.

Quyết định chủ dự án (2026-11-18): hàng 1 là hàng mã máy (`@CUS_MA_KH` / `@ACT_MA_KH`, có thể ẩn), tiêu đề cho người đọc đặt ở hàng 2–3; chỉ một luật, không xử lý riêng cột trống ngăn khối.

Luật duy nhất (chủ dự án chốt 2026-11-18): hàng 1 chỉ có một cột mã thì mọi ô dùng cột đó; có từ hai cột mã thì ô dùng cột mã gần nhất bên trái nó (kể cả chính nó), bên trái không có thì ô không thuộc khách nào. `@CUS_MA_KH` và `@ACT_MA_KH` ngang nhau, quyết định chỉ bằng vị trí. Nhiều cột mã chỉ áp cho sheet xem tự do; sheet `!` và sheet kho vẫn chỉ một cột mỗi mã, nhân đôi thì không đọc, ở cả GAS và Sidebar.

Vai trò dữ liệu: Extension đọc thô hàng 1 và các ô mã của hàng đang chọn (không đổi); Sidebar chọn cột đích từ hàng 1 Extension gửi và cột đang chọn, rồi lấy giá trị ô ở đúng cột đó; GAS (khi vắng Extension) áp cùng luật trên hàng 1 nó tự đọc.

- [x] GAS: `selectionFreeSheetColumn` nhận cột đang chọn, áp luật mới, bỏ luật "nhân đôi thì bỏ".
- [x] Sidebar: read plan sheet tự do giữ mọi cột mã ở hàng 1, không chỉ cột đầu tiên.
- [x] Sidebar: `sheetLinkSelectionCode` và `sheetLinkCustomerIdFromContext` chọn đúng một ô theo luật; thiếu ô ở cột đích (plan chưa kịp đổi) là chưa biết, không lấy ô khối khác.
- [x] Test GAS, Sidebar, và test hai nơi cho cùng kết quả trên cùng bộ ca.
- [x] Tài liệu 07 Phần 4A.
- [x] Sidebar: sheet `!` có mã nhân đôi thì plan bỏ mã đó, khớp GAS.
- [x] Nghiệm thu trên Sheet DEV (dựng bằng `devSeedFreeSheets`): Kanban C4, D5 (cột trống), F5, I4, J4 (ngoài mép phải) mở đúng khách, F6 (ô mã trống) báo hàng không có khách; Một cột thử A3 (trái mã), D4 (phải mã) mở đúng khách.
