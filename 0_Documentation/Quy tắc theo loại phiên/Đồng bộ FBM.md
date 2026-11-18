# Quy tắc riêng phiên đồng bộ FBM

Chỉ đọc tệp này khi phiên có chạm luồng đồng bộ FBM (code GAS `fbm_sync`, Extension phía FBM, checklist hay tài liệu 09). Quy tắc chung toàn repo nằm ở `AGENTS.md`; tệp này chỉ thêm phần riêng, không nhắc lại.

## Đọc tài liệu

- Đọc `0_Documentation/00. Tài liệu chính thức/09. Đồng bộ FBM/00. Mục lục và phạm vi.md`, các chuyên đề 09 liên quan trực tiếp, checklist của phiên và `0_Documentation/Phiên code/Câu hỏi đêm.md`; không đọc toàn bộ 09 khi việc không cần. Sau khi ngữ cảnh bị nén thì đọc lại đúng các tài liệu thuộc phạm vi đang làm.
- Hồ sơ FBM cũ nằm ở `Phiên code/Lưu trữ chờ dọn/`, chỉ tìm đúng mục cần (mã G hoặc FBM-xxx), cấm đọc cả tệp: `2026.10.06 Kế hoạch sửa lỗi FBM sau audit.md`, `Checklist rà soát đồng bộ FBM trước vận hành thật.md` (ma trận luồng F/E), `Audit pipeline đồng bộ FBM.md`.

## Lỗi và dữ liệu nhạy cảm

- Lỗi trong luồng đồng bộ, kể cả lỗi mạng và lỗi xảy ra khi Sidebar đang đóng, phải vừa báo ở Sidebar vừa ghi vào Sheet `Log`; thiếu một trong hai thì use case chưa đạt và không được tick checklist.
- Mật khẩu FBM và envelope đăng nhập không được xuất hiện trong Log, Trace, thông báo lỗi Sidebar hay fixture test; phải có ít nhất một kiểm thử tự động chốt luật này.

## Checklist rà soát đồng bộ FBM

- Hồ sơ đợt refactor đồng bộ FBM (đã xong, đã gộp vào `main`) ở `0_Documentation/Phiên code/[Đã xử lý] 2026.10.22 Refactor đồng bộ FBM/`; chỉ đọc khi cần tra lại, việc mới ghi vào Todo.
- Checklist dựng từ tài liệu 09 và `tests/contracts/fbmSyncPipeline.js`, không suy ra từ code. Mục nào tả bằng tên hàm nội bộ thay vì hành vi người dùng thấy được là sai gốc, phải viết lại.
- Checklist phủ cả nhánh thành công lẫn nhánh thất bại. Lỗi nhóm theo lớp xử lý, không theo nguyên nhân: mọi lỗi mạng (DNS, TLS, timeout, đứt kết nối) quy về một lớp ở cổng request chung và chỉ cần một ca đại diện. Mỗi nguyên nhân đi một đường xử lý riêng là lỗi kiến trúc phải sửa, không phải lý do viết thêm test. Các lớp phải tách riêng vì đường xử lý khác nhau: transport, HTTP/parse, đăng nhập/session, hạn mức và giới hạn nền tảng, conflict, ghi/đối soát.
- Mỗi bước chỉ mang đúng một nhãn `[Tự động]` hoặc `[Cần kiểm chứng thật]`. Cấm nhãn gộp kiểu `[Kết hợp]`; bước có cả hai phần thì tách thành hai dòng con.
- Chỉ tick `[x]` khi trỏ được tới tên test cụ thể kiểm đúng nhánh đó. Test có sẵn chỉ được làm bằng chứng nếu nó kiểm đúng nhánh đang xét, không phải chỉ vì cùng chủ đề.
- Kết quả mong đợi phải cụ thể đến mức có thể sai được: nêu giá trị, trạng thái hoặc tên tài liệu và mục cụ thể. Cấm viết "hoạt động đúng" hay "theo hợp đồng".

## Kiến trúc đồng bộ FBM

- Kiến trúc đích và lý do nằm ở mục 11 (K1–K10) của `0_Documentation/Phiên code/[Đã xử lý] 2026.10.22 Refactor đồng bộ FBM/2. Thiết kế đích.md`; tài liệu 09 mô tả hành vi theo kiến trúc đó. Sửa luồng đồng bộ mà lệch K1–K10 thì phải trình chủ dự án trước.
- Mọi thay đổi state FBM đi qua `FbmSync.controlDispatch` (`fbm_sync/control/ControlPort.js`); thêm lệnh là thêm một dòng vào bảng `FbmSync.COMMANDS`, không mở đường gọi thẳng từ Sidebar hay relay.
- Luật kiến trúc của mã đồng bộ FBM được chốt bằng luật tĩnh ở `tests/cases/fbmSync/StaticRules.js` (đọc/ghi state và `logEvent` chỉ ở người điều phối, phase cuối chỉ trong `runClose`, baseline chỉ ở công cụ áp kết quả, ghi kho chỉ qua cổng kho, không dò hàm bằng `typeof`, không lỗi im lặng, không số nghiệp vụ cứng, Extension không rẽ nhánh theo loại việc). Danh sách ngoại lệ ở đó chỉ được giảm; vi phạm mới thì sửa code, không thêm ngoại lệ.
- Hàm khai trong `fbm_sync/`, `client/sync/` và Extension mà không mã chạy thật nào gọi bị `tests/cases/fbmSync/UnusedFunctions.js` bắt; hàm chết thì xóa, không có ngoại lệ, test gọi nó không tính là dùng.
- Test của luồng đồng bộ FBM dựng hộp qua khung `tests/lib/fbm/` và `tests/lib/gas/`, không tự dựng sandbox trong tệp ca (`tests/cases/testRules.js`, `tests/cases/fileSize.js`).

## Chạy thử trên FBM thật

- FBM thật chỉ dùng `ALT00010` và không gửi request xóa; ghi thật chỉ chạy sau khi chủ dự án bật rõ cả chế độ lẫn cờ an toàn.
- Đến bước cần người dùng giữ tab FBM, đăng nhập, bấm ghi thật hoặc kiểm tra dữ liệu live thì dừng và ghi rõ người dùng cần làm gì.

## Nghiêm cấm

- Cấm sửa tài liệu trong `0_Documentation/Nghiên cứu FBM/`, trừ khi chủ dự án yêu cầu rõ trong phiên; khi đó chỉ sửa đúng phần được yêu cầu. Kết quả nghiên cứu mới (request thử trên FBM thật) ghi thành chương mới và thêm vào mục lục `README.md` của thư mục đó.
- Cấm sửa nội dung fixture trong `0_Documentation/Nghiên cứu FBM/RequestFBM/`.
