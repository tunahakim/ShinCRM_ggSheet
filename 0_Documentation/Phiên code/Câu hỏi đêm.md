# Câu hỏi đêm

ĐẶC BIỆT QUAN TRỌNG: ĐÂY KHÔNG PHẢI TÀI LIỆU LƯU TRỮ LÂU DÀI, CÁI GÌ XỬ LÝ ĐƯỢC RỒI THÌ XÓA ĐI NGAY, XÓA HẲN, KHÔNG DẤU VẾT. KHÔNG ĐƯỢC ĐỂ FILE NÀY PHÌNH TO

Nơi ghi những chỗ tài liệu không nói rõ mà phiên code gặp phải lúc chủ dự án không có mặt. Luật xử lý là **Phương án A**: ghi câu hỏi vào đây, chọn cách an toàn nhất để đi tiếp, ghi rõ đã chọn gì. Chủ dự án đọc rồi trả lời; câu nào trả lời xong thì xóa hẳn khỏi đây và mang câu trả lời vào tài liệu thiết kế hoặc code.

Cách viết một mục: một đầu đề ngắn, rồi tối đa vài câu.

## Đang mở

### Ranh giới credential khi Extension phải mù tuyệt đối

Yêu cầu mới của chủ dự án là mọi xử lý FBM, gồm auto-login, nằm ở GAS; Extension chỉ là cầu nối HTTP. Tài liệu 09.06/09A hiện lại quy định Extension giữ vault và giải mã credential, nên hai quy tắc mâu thuẫn. Cần chọn một: (A) giữ vault nhưng chỉ cho phép primitive generic `secretBinding`/transform do GAS chỉ dẫn, không giữ kiến thức endpoint/nghiệp vụ; (B) chuyển khóa giải mã và orchestration login sang GAS, chấp nhận GAS có thể thấy bí mật trong thời gian xử lý; hoặc (C) bỏ auto-login, chỉ yêu cầu người dùng đăng nhập thủ công. Tạm thời không xóa adapter hiện tại để tránh làm hỏng auto-login trước khi có quyết định.

### Hợp đồng projection/capture

09.01 cho phép GAS gửi chỉ dẫn projection/capture generic để giảm response lớn, còn 09A diễn đạt Extension chỉ chuyển response nguyên văn. Tạm thời giữ nguyên văn khi không có chỉ dẫn; chỉ dùng primitive generic do GAS cấp và không hardcode tên field/nghiệp vụ trong Extension.

### Thu hẹp bảng khóa Block: `elements` và `label` không còn là khóa chung

Phép kiểm mới `tests/cases/blockKeys.js` bắt được bốn cặp vai–khóa mà bản khai nhận rồi bỏ đi: `label` trên `box`, `card`, `row`, `text`. Tự quyết: dời `elements` xuống ba vai chứa con và `label` xuống bốn vai có chữ, nên `Card({ label: 'GHI CHÚ' })` từ nay hét lên và chỉ dẫn sang `title`. Không dòng khai nào trong code hiện tại bị ảnh hưởng. Đã thêm một câu về luật phạm vi vào tài liệu 04 Phần 4.

