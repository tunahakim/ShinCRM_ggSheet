# Checklist cảnh báo thay đổi chưa lưu Sidebar

Checklist này theo dõi một cơ chế chung cho mọi khối Sidebar có trường chỉnh sửa, trước mắt bao phủ form lõi và các khối cấu hình Sidebar FBM. Không đánh dấu nghiệm thu thật chỉ bằng test offline.

## 1. Quyết định đã chốt

- [x] Chỉ tạo `baseline` khi người dùng bấm `Sửa` hoặc `Thêm mới`; không tạo snapshot khi chỉ mở màn hình xem.
- [x] Chỉ so sánh đầy đủ khi người dùng bấm một `action` có nguy cơ làm mất bản nháp; không so sánh toàn bộ trường sau mỗi phím gõ.
- [x] Một action bên ngoài khối đang sửa phải bị chặn trước khi chạy; action dự định được giữ lại để chạy sau khi xử lý cảnh báo.
- [x] Trạng thái `đang sửa` là khóa chính: dù chưa đổi giá trị, mọi action ngoài card đang sửa vẫn bị chặn; không được mở đồng thời hai card.
- [x] Cảnh báo có đúng ba lựa chọn: `Lưu thay đổi`, `Bỏ thay đổi và tiếp tục`, `Tiếp tục sửa`.
- [x] `Tiếp tục sửa` đóng cảnh báo, ở lại khối hiện tại và giữ đánh dấu các trường đang khác `baseline`.
- [x] Chỉ tô màu sau lần cảnh báo đầu tiên; màu là trạng thái trình bày, không thay thế nguồn sự thật dirty.
- [x] Trường đã trở về đúng `baseline` được bỏ màu ở lần so sánh kế tiếp; không giữ tín hiệu cũ gây hiểu nhầm.
- [x] Lưu hoặc bỏ thay đổi thành công thì chuyển về chỉ xem, xóa `baseline`, bản nháp và danh sách trường khỏi RAM.
- [x] Đóng hẳn tab/trình duyệt chỉ dùng cảnh báo mặc định của trình duyệt nếu nền tảng cho phép; không dựng hộp tùy biến cho ca này.
- [x] Mật khẩu chỉ được coi là đã thay đổi khi ô mật khẩu của lượt sửa có giá trị; không đưa mật khẩu vào snapshot, log hoặc thông báo.

## 2. Cập nhật hợp đồng và hướng dẫn

- [x] Sửa Tài liệu 04 Phần 8 để thay quy tắc cũ “rời form chỉ cất bản nháp” bằng hợp đồng dirty guard.
- [x] Bổ sung Tài liệu 04 về thứ tự kiểm dirty, lưu, hủy, cập nhật RAM và chạy action đang chờ.
- [x] Bổ sung Tài liệu 09.08 về scope khối cấu hình FBM, ba lựa chọn cảnh báo và khóa action ngoài khối.
- [x] Ghi rõ presentation `changed` chỉ do lớp UI/resolver áp dụng, không khai class/CSS trong schema màn.
- [x] Ghi rõ ranh giới Sidebar draft và GAS state nghiệp vụ; không gửi từng phím gõ lên GAS.
- [x] Cập nhật kế hoạch sửa Sidebar FBM và checklist đồng bộ FBM để trỏ tới checklist này.

## 3. Lõi dirty guard dùng chung

- [x] Tạo một module client dùng chung làm chủ trạng thái hộp cảnh báo, action đang chờ và ba lựa chọn.
- [x] Có phép chuẩn hóa/so sánh an toàn cho text, số, boolean, select/menu và ngày.
- [x] Có API đọc dirty lazy: chỉ đọc/so sánh đầy đủ khi guard được gọi.
- [x] Dirty chỉ phục vụ tô màu và quyết định cảnh báo ở nút Hủy/X; không dùng dirty làm điều kiện duy nhất để khóa action ngoài card.
- [x] Có API `save`, `discard`, `continue` với khóa chống xử lý hai lần; `discard` thành công là quyết định bỏ nháp có hiệu lực và phải chạy action đang chờ dù lần đọc DOM cũ còn báo dirty.
- [x] Khi save/discard lỗi, giữ nguyên bản nháp, không chạy action đang chờ và báo lỗi rõ.
- [x] Khôi phục focus về control phù hợp sau khi đóng cảnh báo hoặc sau khi action tiếp tục.
- [ ] Không làm mất popup, mật khẩu đang nhập hoặc bản nháp do callback trạng thái đến muộn. (Còn cần nghiệm thu callback thật trên Sheet DEV.)

## 4. Form lõi ShinCRM

- [x] Dùng bản ghi lúc mở form làm baseline cho form sửa/thêm mới.
- [x] So sánh giá trị hiện tại với baseline qua bộ thu thập hiện có, không tạo bộ đọc DOM thứ hai cho nghiệp vụ.
- [x] Chặn `cancelForm`, mở form lồng, đổi khách, về màn xem, nạp lại và mở FBM khi form đang sửa; `cancelForm` sạch đi thẳng, dirty mới mở cảnh báo.
- [x] Cho `saveForm` đi thẳng vào luồng lưu; chỉ chạy action tiếp theo sau khi cửa ghi xác nhận thành công.
- [x] Bỏ draft khi chọn hủy thay đổi trước khi thực hiện action đang chờ.
- [x] Không cảnh báo khi người dùng chưa thay đổi gì hoặc đã đưa toàn bộ trường về baseline.

## 5. Các khối cấu hình FBM

- [x] Tính dirty theo từng key của `fbmSyncConfigEditor`, không tách cơ chế theo tên nghiệp vụ.
- [x] Bao phủ identity, login, account settings, module, relay, extension, background và login policy.
- [x] Chặn mở/sửa khối khác, menu ba chấm, chuyển màn hình, quay lại và các action ngoài khối khi khối hiện tại đang sửa, kể cả khi chưa dirty.
- [x] Cho action nội bộ cùng khối tiếp tục hoạt động theo hợp đồng; nút lưu hiện tại không tự mở thêm cảnh báo.
- [x] Lưu từ cảnh báo dùng đúng cổng save hiện có của từng key và xác nhận trạng thái đã về chỉ xem.
- [x] Bỏ thay đổi dùng đúng snapshot của editor, không gọi GAS nếu chỉ cần hủy bản nháp cục bộ.
- [x] Password không lộ trong snapshot/compare/log nhưng vẫn làm login dirty khi người dùng nhập.
- [ ] Callback GAS không ghi đè form đang sửa hoặc xóa màu dirty trước khi save/discard thành công. (Còn cần nghiệm thu callback thật trên Sheet DEV.)

## 6. Hiển thị và tương tác

- [x] Sidebar chỉ giữ host tĩnh; backdrop, nội dung và ba action của hộp cảnh báo được dựng bởi component Block dùng chung, không hardcode HTML modal trong Sidebar/controller.
- [x] Có style tập trung cho hộp cảnh báo và trạng thái trường changed; không thêm class vào screen schema.
- [x] Tô đúng những trường đang khác baseline sau lần cảnh báo đầu tiên.
- [x] Màu vẫn còn khi chọn `Tiếp tục sửa` và tự cập nhật khi người dùng sửa tiếp.
- [x] Xóa màu khi trường về baseline hoặc khi save/discard thành công.
- [x] Hỗ trợ nút đóng/Escape/vùng nền như `Tiếp tục sửa`, không âm thầm bỏ dữ liệu.
- [x] Khóa nút trong lúc save/discard async và không cho action chạy trùng.
- [x] Bảo đảm text, nút và focus không chồng lấn trên Sidebar hẹp.

## 7. Kiểm thử offline

- [x] Test compare: bằng nhau, khác một trường, nhiều trường, đổi rồi hoàn tác, giá trị rỗng và kiểu khác nhau nhưng cùng nghĩa.
- [x] Test modal: Save, Discard, Continue; action chờ chỉ chạy đúng một lần, gồm hồi quy provider còn dirty cũ sau discard và FBM discard thoát `editing` trước khi chạy action.
- [x] Test save/discard lỗi: dữ liệu và màu không bị xóa nhầm.
- [x] Test form lõi: cancel/open form lồng/đổi khách/reload bị chặn khi đang sửa, kể cả chưa dirty.
- [x] Test FBM: chuyển màn, menu, back, sửa khối khác và action nội bộ cùng khối.
- [x] Test FBM: card sạch vẫn khóa action ngoài, không mở đồng thời hai card; nút Hủy chỉ cảnh báo khi dirty.
- [x] Test password: dirty đúng nhưng không xuất hiện trong snapshot, log hoặc lỗi.
- [ ] Test callback snapshot không dựng lại control đang nhập và không mất highlight. (Còn cần nghiệm thu callback thật trên Sheet DEV.)
- [x] Test hợp đồng tĩnh: Sidebar host/include/boot, host không còn nút/nội dung modal hardcode, component renderer, guard form/FBM, mapping tám key, password và CSS changed không bị tháo trong phiên sau.
- [x] Chạy `node tests/run.js`: 1.713 phép đạt, 0 phép lỗi.

## 8. Nghiệm thu Sheet DEV và bàn giao

- [ ] Mở Sidebar trên Sheet DEV, vào từng khối cấu hình FBM, bấm Sửa rồi thay đổi trường.
- [ ] Kiểm tra màu chỉ xuất hiện sau khi thử rời khối và vẫn còn khi chọn Tiếp tục sửa.
- [ ] Kiểm tra Lưu thành công rồi chuyển màn hình đúng action ban đầu.
- [ ] Kiểm tra Bỏ thay đổi khôi phục dữ liệu, về chỉ xem và chuyển màn hình đúng action ban đầu.
- [ ] Kiểm tra Tiếp tục sửa không chuyển màn hình và không mất dữ liệu.
- [ ] Kiểm tra menu ba chấm, nút quay lại, sửa khối khác và đóng Sidebar không làm mất bản nháp.
- [ ] Kiểm tra cảnh báo mặc định khi đóng tab/trình duyệt theo giới hạn nền tảng.
- [ ] Chạy các entrypoint GAS DEV liên quan nếu có thay đổi hợp đồng server; không ghi thật FBM.
- [ ] Ghi rõ các bước chủ dự án cần giữ tab FBM/đăng nhập hoặc bấm ghi thật; dừng trước mốc đó.
- [x] Cập nhật cây thư mục code, checklist đồng bộ FBM và commit theo nhóm lõi/UI/test/tài liệu: `bebeae3`, `b5d0a3a`, `4145a90`, `c7592fa`.
