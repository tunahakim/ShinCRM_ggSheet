# Quy tắc làm việc với dự án ShinCRM

## Mục tiêu và phạm vi

- Mục tiêu hiện tại là hoàn thành ShinCRM độc lập theo thiết kế; chưa làm đồng bộ FBM, bot tra cứu, chuyển 1.700 khách thật hoặc các việc ngoài checklist hiện hành.
- Đọc `CLAUDE.md` và checklist bàn giao ở đầu mỗi phiên; sau khi ngữ cảnh bị nén, đọc lại hai tệp này và `0_Documentation/Phiên code/Câu hỏi đêm.md`.
- Chỉ đọc tệp khi dòng code sắp viết cần đến nó; không quét cả codebase để chuẩn bị.

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

## Kiểm thử và an toàn

- Ưu tiên chạy các kiểm thử có sẵn sau khi thay đổi nếu chúng đơn giản và nhanh; chỉ đọc phần tổng kết hoặc lỗi để không đưa toàn bộ đầu ra vào ngữ cảnh. Không cần viết thêm kiểm thử cho các chi tiết nhỏ mà chủ dự án có thể nghiệm thu trực tiếp trên Sheet DEV, nhưng vẫn phải viết kiểm thử cho nhánh có thể hỏng âm thầm, mở nhầm dữ liệu hoặc tốn hạn mức. Chạy bộ đầy đủ trước mốc bàn giao hoặc khi thay đổi hợp đồng dùng chung; ngoài các mốc đó vẫn có thể chạy bộ có sẵn nếu chi phí thời gian hợp lý.
- Nghiệm thu Google thật bằng `node tests/gas.js <tên-hàm> --push`; thiếu `--push` là đang chạy bản cũ. Hàm dò mới phải có trong `DEV_RUNNER_ALLOWED`.
- Chỉ thử trên Sheet DEV hoặc tệp trắng, không chạm Sheet đang chứa dữ liệu khách thật.
- Trước khi đưa dữ liệu thật vào: xóa `server/dev/` và bản triển khai của nó, tắt chia sẻ bằng liên kết, và không chia sẻ tệp khi `LOG_TRACE` đang bật.
- Không sửa thư mục Extension đang chạy ngoài repo; chủ dự án tự chép code và tải lại Extension.

## Git

- Commit sớm sau khi xong một nhiệm vụ, tách client, server, test và tài liệu thành các commit có chủ đề rõ ràng khi hợp lý.
- Tiêu đề và mô tả commit viết tiếng Việt có dấu, ngắn gọn, không hard wrap.
- Bảo toàn thay đổi có sẵn của chủ dự án; không đưa tệp không liên quan vào commit.
