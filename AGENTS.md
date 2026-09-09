# Quy tắc làm việc với dự án ShinCRM

## Mục tiêu và phạm vi

- Mục tiêu hiện tại của branch là hoàn thiện phiên đồng bộ FBM/ShinCRM theo `0_Documentation/Phiên code/Checklist đồng bộ FBM.md`. ShinCRM độc lập đã hoàn tất phần chính; không tự mở rộng sang bot tra cứu, Zalobot hoặc nạp 1.700 khách thật trước khi checklist cho phép.
- Đọc `CLAUDE.md`, checklist đồng bộ FBM và `0_Documentation/Phiên code/Câu hỏi đêm.md` ở đầu mỗi phiên; sau khi ngữ cảnh bị nén phải đọc lại ba tệp này.
- Chỉ đọc tệp khi dòng code sắp viết cần đến nó; không quét cả codebase để chuẩn bị.
- Tự thực hiện liên tục các mục chỉ cần code, test offline hoặc GAS DEV. Khi đến mục cần người dùng giữ tab FBM, đăng nhập, bấm ghi thật hoặc kiểm tra dữ liệu live thì dừng và ghi rõ thao tác cần người dùng làm.

## Làm việc với chủ dự án

- Trao đổi bằng tiếng Việt. Chủ dự án là người làm bán hàng, tự học code và sẽ tự tiếp quản dự án, nên giải thích lý do và cạm bẫy bằng ngôn ngữ dễ hiểu; thuật ngữ tiếng Anh cần kèm nghĩa tiếng Việt trong ngoặc khi cần.
- Được phép phản biện và phải nói rõ mâu thuẫn hoặc điểm chưa hợp lý. Quyết định quan trọng cần đưa ra để chủ dự án biết trước khi ghi vào code hoặc tài liệu.
- Khi chủ dự án vắng mặt, ghi điểm mơ hồ vào `0_Documentation/Phiên code/Câu hỏi đêm.md`, chọn phương án an toàn nhất và ghi rõ đó là lựa chọn tạm để tiếp tục. Khi đã có câu trả lời, xóa hẳn mục hỏi; lịch sử nằm trong Git.
- Mỗi kết quả chỉ báo cáo một lần; các lượt sau trỏ đến tài liệu hoặc commit đã ghi, không lặp lại bảng số liệu cũ.

## Tài liệu và code

- Không hard wrap (xuống dòng cứng) tài liệu, docstring hoặc nội dung commit. Mỗi ý trong mô tả commit là một dòng.
- Todo đã xong thì xóa hẳn nếu tài liệu đó không phải checklist tick tiến độ. Không giữ mục "đã xong" làm lịch sử.
- Docstring ngắn, chỉ giải thích lý do, cạm bẫy và ranh giới không đọc ra từ code; không kể lại code.
- Mỗi tệp code làm một nhiệm vụ. Chỉ tách tệp theo ranh giới trách nhiệm, không tách theo số dòng.
- Thêm tệp hoặc thư mục code thì cập nhật `0_Documentation/Phiên code/Cây thư mục code.md` trong cùng lượt.
- Tệp client phải có đuôi `.html`, bọc trong `<script>` hoặc `<style>`. Tên tệp trên Google Apps Script là cả đường dẫn, nên `include()` phải dùng đường dẫn đầy đủ.
- Giao diện dùng CSS thuần, SVG nội tuyến, không framework (khung thư viện). `spatialConfig` giữ các quyết định khoảng cách. Vẻ ngoài trong `9_Code_cu_tham_chieu/src/ui/Styles.html` là đặc tả hình thức; chỉ đọc code cũ, không sửa nó.
- GAS là nơi giữ state, cursor, hash, conflict và quyết định nghiệp vụ. Extension chỉ tìm tab FBM, gọi `fetch` và trả response thô; Sidebar chỉ khởi chạy và hiển thị.
- Không sửa nội dung fixture trong `0_Documentation/Phiên code/RequestFBM/`; không đưa cookie, mật khẩu, `authorized` hoặc payload nhạy cảm vào log.

## Kiểm thử và an toàn

- Ưu tiên chạy các kiểm thử có sẵn sau khi thay đổi nếu chúng đơn giản và nhanh; chỉ đọc phần tổng kết hoặc lỗi để không đưa toàn bộ đầu ra vào ngữ cảnh. Không cần viết thêm kiểm thử cho các chi tiết nhỏ mà chủ dự án có thể nghiệm thu trực tiếp trên Sheet DEV, nhưng vẫn phải viết kiểm thử cho nhánh có thể hỏng âm thầm, mở nhầm dữ liệu hoặc tốn hạn mức. Chạy bộ đầy đủ trước mốc bàn giao hoặc khi thay đổi hợp đồng dùng chung; ngoài các mốc đó vẫn có thể chạy bộ có sẵn nếu chi phí thời gian hợp lý.
- Chạy `node tests/run.js` sau thay đổi code; chỉ đọc phần tổng kết hoặc lỗi. Bổ sung test cho nhánh có thể mở nhầm dữ liệu, ghi đè âm thầm, tạo trùng hoặc tốn hạn mức.
- Nghiệm thu GAS bằng `node tests/gas.js <tên-hàm> --push`; thiếu `--push` là đang chạy bản cũ. Hàm dò mới phải có trong `DEV_RUNNER_ALLOWED`.
- Chỉ thử trên Sheet DEV hoặc tệp trắng, không chạm Sheet có dữ liệu khách thật. Live FBM chỉ dùng `ALT00010`, không gửi request xóa; ghi thật chỉ chạy sau khi chủ dự án bật rõ cả chế độ và cờ an toàn.
- Trước khi đưa dữ liệu thật vào production: xóa `server/dev/`, deployment DEV và tệp cấu hình chạy thử, tắt chia sẻ bằng liên kết và tắt `LOG_TRACE`.
- Không sửa Extension đang chạy ngoài repo; code chính thức nằm trong `2_ShinCRM_Extension/`, chủ dự án tự tải lại sau mỗi commit Extension.

## Git

- Commit ngay khi hoàn thành một nhóm mục liên quan trong checklist; tách lõi GAS, Category, Extension/Sidebar, test và tài liệu thành các commit có chủ đề rõ ràng khi hợp lý.
- Mỗi commit phải cập nhật checklist tương ứng; thêm tệp hoặc thư mục code thì cập nhật `0_Documentation/Phiên code/Cây thư mục code.md` trong cùng nhóm công việc.
- Tiêu đề và mô tả commit viết tiếng Việt có dấu, ngắn gọn, không hard wrap.
- Bảo toàn thay đổi có sẵn của chủ dự án; không đưa tệp không liên quan vào commit.
