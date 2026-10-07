# Câu hỏi đêm

ĐẶC BIỆT QUAN TRỌNG: ĐÂY KHÔNG PHẢI TÀI LIỆU LƯU TRỮ LÂU DÀI, CÁI GÌ XỬ LÝ ĐƯỢC RỒI THÌ XÓA ĐI NGAY, XÓA HẲN, KHÔNG DẤU VẾT. KHÔNG ĐƯỢC ĐỂ FILE NÀY PHÌNH TO

Nơi ghi những chỗ tài liệu không nói rõ mà phiên code gặp phải lúc chủ dự án không có mặt. Luật xử lý là **Phương án A**: ghi câu hỏi vào đây, chọn cách an toàn nhất để đi tiếp, ghi rõ đã chọn gì. Chủ dự án đọc rồi trả lời; câu nào trả lời xong thì xóa hẳn khỏi đây và mang câu trả lời vào tài liệu thiết kế hoặc code.

Cách viết một mục: một đầu đề ngắn, rồi tối đa vài câu.

## Đang mở

### Thu hẹp bảng khóa Block: `elements` và `label` không còn là khóa chung

Phép kiểm mới `tests/cases/blockKeys.js` bắt được bốn cặp vai–khóa mà bản khai nhận rồi bỏ đi: `label` trên `box`, `card`, `row`, `text`. Tự quyết: dời `elements` xuống ba vai chứa con và `label` xuống bốn vai có chữ, nên `Card({ label: 'GHI CHÚ' })` từ nay hét lên và chỉ dẫn sang `title`. Không dòng khai nào trong code hiện tại bị ảnh hưởng. Đã thêm một câu về luật phạm vi vào tài liệu 04 Phần 4.

### Bỏ nạp danh mục FBM ở chiều Lấy: chiều Lấy thực ra có dùng kết quả nạp

Kế hoạch refactor 2A điểm 12 giả định kết quả nạp danh mục FBM chỉ chiều đẩy dùng. Thực tế `validateIncomingCategories` (chiều Lấy) chặn giao dịch/khách kéo về khi mã danh mục của nó có tên trên FBM khác tên trong Category (FBM đổi tên danh mục, ví dụ "Gọi điện" thành "Gọi"); test "nhóm 1.3: chiều Lấy hiện có dùng kết quả nạp danh mục" chốt hành vi này. Bỏ nạp thì bản ghi đó sẽ được kéo về bình thường, Sheet giữ tên cũ theo mã (dữ liệu vẫn đúng theo mã; lệch tên chỉ lộ ra khi đẩy, vì chiều đẩy vẫn nạp và chặn). Cần chủ dự án chọn: (a) chấp nhận đổi hành vi, bỏ nạp ở chiều Lấy để tiết kiệm khoảng 25–35 giây mỗi lượt; (b) giữ nạp như hiện tại. Tạm chọn (b) vì checklist yêu cầu test chứng minh "chiều Lấy không dùng" phải đạt trước khi bỏ; nhóm 1.3 dừng, đi tiếp nhóm 1.4. Ghi chú thêm: "Chiều đẩy chỉ nạp danh mục bản ghi cần, gom một lần gọi GAS" cần đổi hợp đồng GAS–Extension (gửi nhiều request một lần), nên để sang đợt 3.
