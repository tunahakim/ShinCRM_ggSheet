# Câu hỏi đêm

ĐẶC BIỆT QUAN TRỌNG: ĐÂY KHÔNG PHẢI TÀI LIỆU LƯU TRỮ LÂU DÀI, CÁI GÌ XỬ LÝ ĐƯỢC RỒI THÌ XÓA ĐI NGAY, XÓA HẲN, KHÔNG DẤU VẾT. KHÔNG ĐƯỢC ĐỂ FILE NÀY PHÌNH TO

Nơi ghi những chỗ tài liệu không nói rõ mà phiên code gặp phải lúc chủ dự án không có mặt. Luật xử lý là **Phương án A**: ghi câu hỏi vào đây, chọn cách an toàn nhất để đi tiếp, ghi rõ đã chọn gì. Chủ dự án đọc rồi trả lời; câu nào trả lời xong thì xóa hẳn khỏi đây và mang câu trả lời vào tài liệu thiết kế hoặc code.

Cách viết một mục: một đầu đề ngắn, rồi tối đa vài câu.

## Đang mở

### Thu hẹp bảng khóa Block: `elements` và `label` không còn là khóa chung

Phép kiểm mới `tests/cases/blockKeys.js` bắt được bốn cặp vai–khóa mà bản khai nhận rồi bỏ đi: `label` trên `box`, `card`, `row`, `text`. Tự quyết: dời `elements` xuống ba vai chứa con và `label` xuống bốn vai có chữ, nên `Card({ label: 'GHI CHÚ' })` từ nay hét lên và chỉ dẫn sang `title`. Không dòng khai nào trong code hiện tại bị ảnh hưởng. Đã thêm một câu về luật phạm vi vào tài liệu 04 Phần 4.

### Nút tia sét của bản cũ: giữ ở menu hay đưa ra header

Bản cũ có nút tia sét ngay trên header, nhìn là biết đang bám theo ô đang chọn hay không. Bản mới nhét `toggleFollowSelection` vào menu `more`, nên trạng thái ẩn sau một cú bấm. Header còn chỗ cho nút thứ bảy ở khe 4 pixel. Tạm giữ nguyên trong menu để không dựng code chưa ai cần; chủ dự án chốt thì thêm glyph `bolt` vào `client/ui/icons.html` là xong.

### Đổi tên thư mục Extension đang chạy: không cần

Câu hỏi của chủ dự án *"Tại sao lại cần?"* — trả lời: không cần. Việc thật lúc chuyển sang extension mới là tắt hoặc xóa bản cũ trong `chrome://extensions`; đổi tên thư mục chỉ là cách chặn thừa để Chrome khỏi nạp lại. Không việc gì trong chặng 1.4 và 1.5 phụ thuộc vào nó.

### Ràng buộc tắt chia sẻ link: chuyển sang chặng đồng bộ FBM

Chủ dự án chốt mọi dữ liệu trên sheet đều là giả cho tới khi xong chặng đồng bộ FBM, kể cả activity. Nên ràng buộc "tắt quyền ai có link cũng sửa được trước khi có 1.700 khách thật" không thuộc chặng 1.4 nữa; nó thuộc chặng đồng bộ FBM và sẽ ghi ở đó. Ràng buộc còn hiệu lực ngay: xóa cả thư mục `server/dev/` trước khi có dữ liệu thật, và chạy `devLogTraceOff` trước lúc xóa.
