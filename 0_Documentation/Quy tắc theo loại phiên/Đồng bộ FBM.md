# Quy tắc riêng phiên đồng bộ FBM

Chỉ đọc tệp này khi phiên có chạm luồng đồng bộ FBM (code GAS `fbm_sync`, Extension phía FBM, checklist hay tài liệu 09). Quy tắc chung toàn repo nằm ở `AGENTS.md`; tệp này chỉ thêm phần riêng, không nhắc lại.

## Đọc tài liệu

- Đọc `0_Documentation/00. Tài liệu chính thức/09. Đồng bộ FBM/00. Mục lục và phạm vi.md`, các chuyên đề 09 liên quan trực tiếp, checklist của phiên và `0_Documentation/Phiên code/Câu hỏi đêm.md`; không đọc toàn bộ 09 khi việc không cần. Sau khi ngữ cảnh bị nén thì đọc lại đúng các tài liệu thuộc phạm vi đang làm.
- Các tệp quá nặng chỉ tìm đúng mục cần, cấm đọc cả tệp: `2026.10.06 Kế hoạch sửa lỗi FBM sau audit.md` (lưu trữ, chỉ tìm đúng mã G hoặc FBM-xxx), `Checklist rà soát đồng bộ FBM trước vận hành thật.md` (ma trận luồng F/E), `Audit pipeline đồng bộ FBM.md` (hồ sơ lưu trữ).

## Lỗi và dữ liệu nhạy cảm

- Lỗi trong luồng đồng bộ, kể cả lỗi mạng và lỗi xảy ra khi Sidebar đang đóng, phải vừa báo ở Sidebar vừa ghi vào Sheet `Log`; thiếu một trong hai thì use case chưa đạt và không được tick checklist.
- Mật khẩu FBM và envelope đăng nhập không được xuất hiện trong Log, Trace, thông báo lỗi Sidebar hay fixture test; phải có ít nhất một kiểm thử tự động chốt luật này.

## Checklist rà soát đồng bộ FBM

- Đợt sửa lỗi sau audit theo dõi tiến độ duy nhất ở `0_Documentation/Phiên code/2026.10.07 Kế hoạch sửa lỗi FBM sau audit.md` (việc còn mở và bảng lỗi FBM-xxx còn mở); sau khi ngữ cảnh bị nén chỉ đọc tệp này và tiếp tục từ dòng `[ ]` đầu tiên.
- Checklist dựng từ tài liệu 09 và `tests/contracts/fbmSyncPipeline.js`, không suy ra từ code. Mục nào tả bằng tên hàm nội bộ thay vì hành vi người dùng thấy được là sai gốc, phải viết lại.
- Checklist phủ cả nhánh thành công lẫn nhánh thất bại. Lỗi nhóm theo lớp xử lý, không theo nguyên nhân: mọi lỗi mạng (DNS, TLS, timeout, đứt kết nối) quy về một lớp ở cổng request chung và chỉ cần một ca đại diện. Mỗi nguyên nhân đi một đường xử lý riêng là lỗi kiến trúc phải sửa, không phải lý do viết thêm test. Các lớp phải tách riêng vì đường xử lý khác nhau: transport, HTTP/parse, đăng nhập/session, hạn mức và giới hạn nền tảng, conflict, ghi/đối soát.
- Mỗi bước chỉ mang đúng một nhãn `[Tự động]` hoặc `[Cần kiểm chứng thật]`. Cấm nhãn gộp kiểu `[Kết hợp]`; bước có cả hai phần thì tách thành hai dòng con.
- Chỉ tick `[x]` khi trỏ được tới tên test cụ thể kiểm đúng nhánh đó. Test có sẵn chỉ được làm bằng chứng nếu nó kiểm đúng nhánh đang xét, không phải chỉ vì cùng chủ đề.
- Kết quả mong đợi phải cụ thể đến mức có thể sai được: nêu giá trị, trạng thái hoặc tên tài liệu và mục cụ thể. Cấm viết "hoạt động đúng" hay "theo hợp đồng".

## Chạy thử trên FBM thật

- FBM thật chỉ dùng `ALT00010` và không gửi request xóa; ghi thật chỉ chạy sau khi chủ dự án bật rõ cả chế độ lẫn cờ an toàn.
- Đến bước cần người dùng giữ tab FBM, đăng nhập, bấm ghi thật hoặc kiểm tra dữ liệu live thì dừng và ghi rõ người dùng cần làm gì.

## Nghiêm cấm

- Cấm sửa tài liệu trong `0_Documentation/Nghiên cứu FBM/`, trừ khi chủ dự án yêu cầu rõ trong phiên; khi đó chỉ sửa đúng phần được yêu cầu. Kết quả nghiên cứu mới (request thử trên FBM thật) ghi thành chương mới và thêm vào mục lục `README.md` của thư mục đó.
- Cấm sửa nội dung fixture trong `0_Documentation/Nghiên cứu FBM/RequestFBM/`.
