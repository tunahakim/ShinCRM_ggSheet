# Checklist việc còn lại — ShinCRM độc lập

Tệp này là bàn giao: liệt kê mọi việc còn phải làm để hết Giai đoạn 1 (chặng 1.2 tới 1.5) mà **không** gồm đồng bộ FBM và bot. Xong mục nào tick mục đó; chi tiết kỹ thuật của từng mục nằm ở tệp được dẫn, không chép lại vào đây. Cập nhật lần cuối 08/09/2026.

## Cách chạy và nghiệm thu

- Bộ kiểm offline (the offline test suite): `node tests/run.js` — phải xanh toàn bộ trước mọi commit.
- Trên Google thật: `node tests/gas.js <tên hàm> --push` — thiếu cờ `--push` thì Google im lặng chạy bản cũ, mọi kết luận thành vô nghĩa.
- Nguồn chuẩn thiết kế: `0_Documentation/Opus 4.8 tư vấn/` tài liệu 00 tới 08 cùng bốn hợp đồng. Tiến độ và quyết định các phiên: thư mục `0_Documentation/Phiên code/`.
- Kế hoạch chi tiết của nhóm Việc 2 và Việc 3: bản plan `joyful-wobbling-honey` của phiên 06–07/09/2026, đọc nó trước khi bấm vào nhóm đó.

## Nhóm 0 — Chốt lượt làm việc 08/09/2026 --> Đã thực hiện xong

- [x] Chủ dự án nghiệm thu dấu nháy đơn (quote prefix): lưu một khách từ sidebar rồi mở thanh công thức trên Sheet DEV, ô mã số thuế phải hiện `'…` còn ô tính hiện không dấu nháy. Code đã đẩy lên GAS ngày 08/09/2026, hàm `writeGateQuoteText` trong `1_ShinCRM_ggSheet/1_ShinCRM_GAS/server/gate/WriteGate.js`.
- [x] Chủ dự án nghiệm thu hộp tìm kiếm: mở hộp, gõ, vào form Sửa rồi quay ra — hộp hiện lại nguyên chữ đã gõ, bấm vào ô gõ là danh sách gợi ý hiện lại; hộp không nổi đè lên màn form; đóng hẳn chỉ bằng kính lúp hoặc Esc.
- [x] Xóa ba hàng probe 1704–1706 trên sheet Customer của Sheet DEV (ba hàng ghi thử dấu nháy, tên bắt đầu bằng `Test Cty`).
- [x] Xóa hàm `probeSeedQuoteRows` khỏi `1_ShinCRM_GAS/server/dev/DevRunner.js` và khỏi `DEV_RUNNER_ALLOWED` — phép probe đã hoàn thành vai trò, cửa dev chỉ giữ hàm còn dùng.
- [x] Commit tách nhóm phần đang bẩn trong cây làm việc: hộp tìm kiếm / dấu nháy đơn và hộp cát / tệp checklist này.

## Nhóm 1 — Nghiệm thu chặng 1.3 và 1.4 bằng mắt chủ dự án --> Đã thực hiện xong

- [x] Bấm hết `Checklist nghiệm thu 1.3 và 1.4.md` trên Sheet DEV. Hai lỗi chủ dự án đã báo đều sửa xong: thiếu dấu sao ở trường bắt buộc, và dropdown nhận giá trị ngoài danh mục.
- [x] Dọn hai ghi chép cũ trong mục "Chỗ nhìn thấy sai" của tệp checklist đó — thiếu dấu sao và dropdown ngoài danh mục — vì cả hai đã sửa bằng các commit `647223e`, `0d10d4c`, `78910a4`; để nguyên là biến tài liệu thành kho lịch sử.
- [x] Mục "Chỗ nhìn thấy sai" trống trơn trước khi sang nhóm sau. Lỗi hộp tìm kiếm tự đóng phát hiện ngày 08/09/2026 đã sửa, thuộc nhóm 0.

## Nhóm 2 — Cầu nối Extension và cơ chế bám ô đang chọn

Làm theo đúng thứ tự, mỗi mục một commit. Phía Extension chỉ sửa trong repo này; chủ dự án tự chép sang `D:\Program\0. Extension\MiniCRM_GoogleSheet` và tải lại — phiên code không chạm thư mục đó.

- [x] Extension bắn ảnh chụp trạng thái `CRM_CONTEXT` thay tin `CRM_TRIGGER`: đủ các trường sheet, gid, sheetName, cellRef thô, row/col/rowEnd/colEnd, selectionKind, cellText, isEditing, sheetTabs, at, seq. Hai tệp `2_ShinCRM_Extension/content_scripts/scout/sheet_scout.js` và `.../bridge/iframe_bridge.js`. Ghi vào docstring những thứ không đọc được vì lưới là canvas. Bản Extension đang chạy thật ngoài repo là V20.2 và có sẵn vá lỗi đổi tab — chỉ đọc nó để lấy nếp đó, không sửa nó.
- [x] Bịt hai lỗ an ninh của cầu nối: phía bridge chỉ bắt tay với origin googleusercontent nằm trong allowlist, đáp `CRM_HANDSHAKE_ACK` kèm đúng nonce, bỏ hẳn `'*'`; phía sidebar bỏ mọi tin sai nonce, sai spreadsheetId, hoặc sai origin.
- [x] Sidebar: tệp mới `client/link/sheetLink.html` kèm dòng include trong `Sidebar.html`; giải mã khách ba bước — cellText khớp dạng mã khách, rồi `Store.getCustomerIdByRow`, rồi không làm gì. Chọn ra mã thì đi qua `ACTIONS.setCurrentCustomer`, không dựng event bus. `bootstrap.html` gọi `sheetLinkSetSpreadsheetId(core.spreadsheetId)` sau `ingestCore`.
- [x] Nút sét thành icon riêng trên header màn xem, gộp làm một với `followSelection` và bỏ mục đó khỏi menu Khác; trạng thái nhớ ở UserProperties như mọi núm.
- [x] Máy chủ: `SelectionService` phân biệt `Customer`, `Activity`, sheet quản trị và sheet không thuộc kho; header, hàng trống và vùng không chắc chắn trả rỗng, không mở nhầm khách. `viewProbeSelection` và đường mở tệp bằng `shinOpenBook()` vẫn hoạt động.
- [x] Bắt tay có tiếng đáp: sidebar bắn `CRM_HANDSHAKE` mỗi giây kèm nonce, bridge đáp ACK ngay; ba nhịp không đáp thì kết luận vắng Extension. Không suy tình trạng sống từ việc im lặng của `CRM_CONTEXT`.
- [x] Nhịp dò hai bậc 2 giây và 6 giây, chỉ chạy khi công tắc bật và vắng Extension và tab đang hiện; bốn tín hiệu đánh thức kéo về bậc nhanh; bốn luật loại trừ của bộ đếm. Bốn tham số khai ở SETTINGS.
- [x] Đèn báo bốn trạng thái trên chính icon sét, cộng băng cảnh báo một dòng khi vắng Extension, có thời gian ân hạn ba giây lúc mở sidebar.
- [x] Đính vị trí ô đang chọn vào mọi phản hồi máy chủ — lưu, xóa, nạp lại đều đã chạm máy chủ nên không tốn thêm vòng nào.
- [x] Sửa tài liệu 07: Phần 2 thêm ngoại lệ polling duy nhất được nêu tên, Phần 3 bỏ câu "rơi về nút Nạp lại", Phần 6 thêm nút sét vào bảng núm nhớ.
- [x] Hai ca kiểm offline `tests/cases/selectionPoll.js` (quan trọng nhất: có ACK đều thì không gọi máy chủ lần nào kể cả khi sheet ngồi im hai phút) và `tests/cases/selectionService.js`, đăng ký vào `NHOM_CA` trong `tests/run.js`.
- [ ] Nghiệm thu Google: `node tests/gas.js viewProbeSelection --push`, đứng ở hàng khách phải ra đúng mã, đứng ở hàng 2 phải rỗng; ghi lại thời gian một vòng — quá một giây thì giãn nhịp dò.
- [ ] Chủ dự án chép Extension và bấm năm phép thử tay theo đúng thứ tự trong plan: chưa cài, cài rồi, ca ngồi im hai phút, tắt Extension giữa chừng, và thang bậc nhịp dò.

## Nhóm 3 — Chặng 1.5: làm mới dữ liệu và sheet quản trị

Nguồn chuẩn: tài liệu 07 (làm mới và sheet quản trị), 08 và 08A (ngôn ngữ lọc, sắp xếp và hợp đồng tham số). Đuôi tệp phía client theo nếp repo này là `.html`, không phải `.js` như bảng trong tài liệu 07 Phần 8.

- [x] Chiều ghi của DirtyState: đọc ghi trạng thái bẩn và ngưỡng chuyển sang cờ bẩn toàn bộ, tài liệu 07 Phần 2 và Phần 3. API hợp nhất/dedupe/ngưỡng đã có; trigger và đường làm mới vẫn nằm ở các mục bên dưới.
- [ ] Ngôn ngữ lọc và sắp xếp thành module riêng theo tài liệu 08 và hợp đồng 08A: ngữ pháp ba cấp ở hàng 3, bảng pattern bốn kiểu TEXT/SELECT/NUMBER/DATE, luật cắt độ chi tiết ngày, bốn từ khóa ngày tương đối, ngữ nghĩa Activity là lần gần nhất còn sống, hai cột sắp xếp cộng tie-break mã khách giảm dần và ô rỗng xếp cuối; sai cú pháp thì không chạm sheet và báo một lần đủ bốn ý ô nào, gõ gì, sai gì, viết đúng thế nào. `normalizeText` phía máy chủ phải giống hệt phía client.
- [ ] `server/view/ViewSheetRenderer`: lọc, sắp, ghi một sheet quản trị và dựng bản đồ dòng mới trong cùng lần gọi, tài liệu 07 Phần 4 — đủ bảy bước đọc kho, loại giao dịch đã xóa, ghép lần làm việc gần nhất còn sống, lọc hàng 3, sắp xếp, một lệnh `clearContent` cộng `setValues`, dựng rowMap; khách không có giao dịch vẫn hiện một dòng.
- [ ] `server/Triggers.gs`: `onEdit` dạng installable, `onOpen` dựng menu, hàm cài trigger — ba đường kích hoạt việc vẽ, tài liệu 07 Phần 5.
- [ ] Ba lệnh view trong menu Sheets của `server/entry/Menu.js`: vẽ lại sheet đang mở, vẽ lại tất cả, và `prepareViewSheet` idempotent (làm nhiều lần cũng như một).
- [ ] Công tắc tự động sắp xếp sheet, tài liệu 07 Phần 6.
- [ ] Client `client/ram/refresh.html`: xử lý khối trạng thái bẩn đính kèm phản hồi và gọi nạp lại đúng phần cần, tài liệu 07 Phần 8.
- [ ] Nối nút "Vẽ lại sheet quản trị" trên header vào việc vẽ thật — hiện nó cố ý báo "chưa dùng, chặng 1.5".
- [ ] Bản đồ dòng của sheet quản trị trong `LoadService`: thêm một khóa vào cấu trúc đang có, không đổi hình dạng.
- [ ] Hai món nợ kiểm thử ghi ở `Prompt chặng 1.4 và 1.5.md`: ca kiểm tự động cho nhánh dự phòng `bootChunkWithFallback` của chặng 1.2, và ba ca offline cho `dispatch.html`, `menu.html`, `collapse.html` — ba tệp này chưa có ca nào vì hộp cát client chưa có `document`.
- [ ] Nghiệm thu Google theo đúng câu chạy thử của chặng: gõ điều kiện lọc bằng dấu `!` trên sheet quản trị và thấy nó in ra đúng, sửa trên sheet thì sidebar nạp lại đúng phần cần.

## Nhóm 4 — Câu hỏi còn chờ chủ dự án duyệt

- [ ] Thu hẹp bảng khóa Block: `elements` và `label` không còn là khóa chung của mọi vai — quyết định tạm đã tự chọn và đã ghi vào tài liệu 04 Phần 4, chờ chủ dự án duyệt rồi xóa mục khỏi `Câu hỏi đêm.md`. Đây là mục mở duy nhất còn lại trong tệp đó.

--> Tôi chưa hiểu ý bạn, giải thích chi tiết giúp tôi

## Nhóm 5 — Cửa an toàn trước khi tệp Sheet mang dữ liệu thật

- [ ] Xóa thư mục `server/dev/` (DevRunner) khỏi repo và xóa bản triển khai web app của nó trên Google. Cửa này mở một địa chỉ web chạy code dưới quyền chủ tệp, nên nó không được tồn tại cùng dữ liệu khách hàng.

--> xóa nó thì có ảnh hưởng đến phiên đồng bộ FBM và bot tra cứu không?

- [ ] Ràng buộc tắt chia sẻ link của tệp Sheet: đã chốt ngày 06/09/2026 dời sang phiên đồng bộ FBM, không làm trong lượt này — ghi ở đây để người tiếp theo không tưởng nó bị quên.

## Ngoài phạm vi ShinCRM độc lập

Đồng bộ FBM (Giai đoạn 3), bot tra cứu (Giai đoạn 4), đo ngân sách ô sau lượt nạp lần đầu, và việc chuyển 1.700 khách thật sang tệp mới — cả bốn đều đứng sau cột mốc này và không mục nào ở trên được phép phình ra thành chúng.
