# Quy tắc làm việc với dự án ShinCRM

## Nguyên tắc nền toàn repo

- Một hành vi, một chỗ định nghĩa. Trước khi viết bất kỳ thứ gì — hàm, component, hằng số, config, hay đoạn logic — phải kiểm tra xem đã có thứ tương tự trong repo chưa. Nếu có — tái sử dụng hoặc mở rộng. Nếu chưa — tạo mới ở đúng vị trí chung, không viết inline tại chỗ dùng. [RÀNG BUỘC CỨNG]
- Đừng viết code để bắt lỗi — hãy dựng kiến trúc mà lỗi đó không có đường xảy ra. Nguyên tắc này áp mạnh nhất ở nơi định nghĩa trường (Schema) và cửa ghi ra hệ ngoài (FBM,...); những chỗ khác chỉ cần đủ tốt, không cầu toàn. [RÀNG BUỘC CỨNG]
- Mỗi state và mỗi quyết định chỉ có một nơi sở hữu duy nhất.
- Tách biệt rõ việc thu thập/truyền tin, xử lý nghiệp vụ/state và hiển thị.
- Module chỉ hoạt động trong đúng ranh giới trách nhiệm của mình.
- Mọi thay đổi state phải đi qua hợp đồng hoặc cổng được quy định; không có đường tắt.
- Giao tiếp giữa các module phải có điều kiện, tối thiểu và tránh thao tác thừa.
- Ưu tiên tính đúng và nhất quán; cache hoặc dữ liệu cục bộ không thay thế nguồn sự thật.

## Mục tiêu và phạm vi

- `D:\ShinCRM_ggSheet\0_Documentation\00. Tài liệu chính thức\01. Quy chuẩn nền ShinCRM.md` là nguồn chuẩn duy nhất của quy tắc nền. Đầu mỗi phiên chỉ đọc các phần liên quan đến công việc; chỉ đọc toàn bộ khi thay đổi kiến trúc lõi, Schema, ranh giới module hoặc xử lý mâu thuẫn tài liệu.
- Trước khi đọc code, viết test hoặc sửa tệp, phải xác định và đọc các tài liệu chính thức, checklist và hợp đồng liên quan trực tiếp đến nhiệm vụ; không được suy ra yêu cầu từ code. Nếu chưa biết cần đọc tài liệu nào, phải tìm mục lục trước.
- Không tạo bản tóm tắt lặp lại quy tắc nền ở nơi khác; tài liệu điều hướng (nếu có) chỉ được chỉ đến nguồn chuẩn và không được chứa quyết định nghiệp vụ.
- Nếu đang làm phiên khác không phải phiên đồng bộ FBM thì bỏ qua các tài liệu liên quan đến FBM, cấm được đọc vì các file đó cực kỳ dài và tốn token.
- Mục tiêu hiện tại của branch là rà soát module đồng bộ FBM trước vận hành thật theo `0_Documentation/Phiên code/Checklist rà soát đồng bộ FBM trước vận hành thật.md`. Phần code tính năng theo `0_Documentation/Phiên code/Checklist đồng bộ FBM.md` và phần cổng phiên FBM theo `0_Documentation/Phiên code/Checklist cổng phiên FBM.md` đã xong; hai checklist đó chỉ đọc để biết phạm vi, cấm tick và cấm sửa.
- ShinCRM độc lập đã hoàn tất phần chính; không tự mở rộng sang bot tra cứu, Zalobot hoặc nạp 1.700 khách thật trước khi checklist cho phép.
- Khi làm đồng bộ FBM, đọc `0_Documentation/00. Tài liệu chính thức/09. Đồng bộ FBM/00. Mục lục và phạm vi.md`, các chuyên đề 09 liên quan trực tiếp, checklist của phiên đang làm và `0_Documentation/Phiên code/Câu hỏi đêm.md`; không đọc toàn bộ 09 nếu công việc không cần. Sau khi ngữ cảnh bị nén thì đọc lại đúng các tài liệu thuộc phạm vi đang làm.
- Chỉ đọc tệp khi dòng code sắp viết cần đến nó; không quét cả codebase để chuẩn bị.
- Nếu tài liệu bắt buộc trong phạm vi đang làm đã lỗi thời hoặc mâu thuẫn với quyết định mới của chủ dự án, được phép và phải cập nhật tài liệu đó trong cùng nhóm thay đổi; không giữ quy tắc cũ chỉ vì tài liệu đang tồn tại.
- Tự thực hiện liên tục các mục chỉ cần code, test offline hoặc GAS DEV. Khi đến mục cần người dùng giữ tab FBM, đăng nhập, bấm ghi thật hoặc kiểm tra dữ liệu live thì dừng và ghi rõ thao tác cần người dùng làm.

## Quy tắc riêng phiên rà soát đồng bộ FBM

- Đợt sửa lỗi sau audit theo dõi tiến độ duy nhất ở `0_Documentation/Phiên code/2026.10.06 Kế hoạch sửa lỗi FBM sau audit.md` (kế hoạch G0–G8 và bảng lỗi FBM-xxx). Sau khi ngữ cảnh bị nén, chỉ đọc file này và tiếp tục từ dòng `[ ]` đầu tiên. Phần đã xong và lỗi đã đóng nằm ở `0_Documentation/Phiên code/2026.10.07 Lưu trữ kế hoạch sửa lỗi FBM.md`: chỉ tìm đúng mã G hoặc FBM-xxx khi cần, cấm đọc cả file. `Checklist rà soát đồng bộ FBM trước vận hành thật.md` (ma trận luồng F/E) và `Audit pipeline đồng bộ FBM.md` (hồ sơ lưu trữ) quá nặng: chỉ tìm đúng mục cần, cấm đọc cả file.
- Tệp tài liệu mới tạo trong `0_Documentation/Phiên code/` đặt tiền tố ngày `YYYY.MM.DD ` (ví dụ `2026.10.06 Kế hoạch ...md`) để phân biệt tệp mới và cũ.
- Checklist rà soát phải dựng từ tài liệu 09 và `tests/contracts/fbmSyncPipeline.js`, không được suy ra từ code. Mục nào mô tả bằng tên hàm nội bộ thay vì bằng hành vi người dùng quan sát được là sai gốc, phải viết lại.
- Checklist phải bao phủ cả nhánh thành công và nhánh thất bại. Lỗi được nhóm theo lớp xử lý chứ không theo nguyên nhân: mọi lỗi mạng (DNS, TLS, timeout, đứt kết nối) quy về một lớp tại cổng request chung và chỉ cần một ca đại diện. Nếu mỗi nguyên nhân lại đi một đường xử lý khác nhau thì đó là lỗi kiến trúc phải sửa, không phải lý do viết thêm test. Các lớp cần tách riêng vì đường xử lý khác nhau: transport, HTTP/parse, đăng nhập/session, hạn mức và giới hạn nền tảng, conflict, ghi/đối soát.
- Mỗi bước trong checklist chỉ mang đúng một nhãn `[Tự động]` hoặc `[Cần kiểm chứng thật]`. Cấm nhãn gộp kiểu `[Kết hợp]`; bước nào có cả hai phần thì tách thành hai dòng con.
- Chỉ đánh dấu `[x]` khi trỏ được tới tên test cụ thể kiểm đúng nhánh đó. Test có sẵn từ trước chỉ được dùng làm bằng chứng nếu nó kiểm đúng nhánh đang xét, không phải chỉ vì nó cùng chủ đề.
- Output kỳ vọng phải cụ thể đến mức có thể fail được. Cấm viết "hoạt động đúng" hoặc "theo hợp đồng"; phải nêu giá trị, trạng thái hoặc tên tài liệu và mục cụ thể.
- Không có lỗi im lặng. Mọi lỗi phát sinh trong luồng đồng bộ, kể cả lỗi mạng và lỗi phát sinh khi Sidebar đang đóng, phải được thông báo rõ cho người dùng ở Sidebar và ghi vào Sheet `Log`; thiếu một trong hai thì use case vẫn chưa đạt và không được tick checklist.
- Không che lỗi bằng `catch` rỗng, trả `null`/giá trị mặc định hoặc chỉ ghi console. Thông báo cho người dùng không được chứa cookie, mật khẩu, token, `authorized` hoặc payload nhạy cảm.
- Mật khẩu FBM và envelope đăng nhập không được xuất hiện trong Log, Trace, thông báo lỗi Sidebar hay fixture test. Phải có ít nhất một kiểm thử tự động chốt luật này.

## Nguyên tắc UI và Schema

- UI schema chỉ mô tả ý định và hành vi người dùng: cấu trúc, vùng/ID, nhãn, `action`, dữ liệu và trạng thái tương tác; không mô tả cách trình bày.
- Không đưa `className`, `rootClass`, `classes`, `*Class`, selector DOM, chuỗi CSS, `style` tự do hoặc token `primary/error/muted` vào screen schema.
- `action` là hợp đồng hành vi; không thêm `purpose` hay trường diễn giải trùng lặp khi `action` đã đủ nghĩa.
- Presentation (`variant`, `state`, `muted`...) được ánh xạ tập trung ở lớp UI/catalog/resolver; schema chỉ khai báo dữ liệu có nghĩa với người dùng.
- Dùng chung component khi cấu trúc và hành vi giống nhau; khác nhãn, dữ liệu, `action` hoặc callback thì truyền tham số, không tạo component theo tên nghiệp vụ.
- Mỗi quyết định presentation và mỗi trạng thái chỉ có một nơi sở hữu; không khai lại map/class và không ghép class trực tiếp ở controller.
- Chỉ giữ ngoại lệ ở renderer primitive, DOM nội bộ component, slot domain có stylesheet riêng và host tĩnh; ngoại lệ phải được ghi rõ và không chảy ngược vào schema.
- Mọi quy tắc schema/UI quan trọng phải có kiểm thử tự động để ngăn tái phạm, không chỉ dựa vào ghi nhớ hoặc review thủ công.

## Ranh giới Sheet–Extension–Sidebar–GAS

- Extension chỉ quan sát và truyền dữ liệu thô từ Sheet hoặc máy tính; không xử lý nghiệp vụ và không quyết định reload.
- Sidebar điều phối phía client, quản lý RAM/UI và thời điểm giao tiếp với GAS; không tự thay thế quyết định nghiệp vụ.
- GAS sở hữu state nghiệp vụ và quyết định dirty, reload, payload và render.

## Làm việc với chủ dự án

- Trao đổi bằng tiếng Việt. Chủ dự án là người làm bán hàng, tự học code và sẽ tự tiếp quản dự án, nên giải thích lý do và cạm bẫy bằng ngôn ngữ dễ hiểu; thuật ngữ tiếng Anh cần kèm nghĩa tiếng Việt trong ngoặc khi cần.
- Được phép phản biện và phải nói rõ mâu thuẫn hoặc điểm chưa hợp lý. Quyết định quan trọng cần đưa ra để chủ dự án biết trước khi ghi vào code hoặc tài liệu.
- Khi chủ dự án vắng mặt, ghi điểm mơ hồ vào `0_Documentation/Phiên code/Câu hỏi đêm.md`, chọn phương án an toàn nhất và ghi rõ đó là lựa chọn tạm để tiếp tục. Khi đã có câu trả lời, xóa hẳn mục hỏi; lịch sử nằm trong Git.
- Mỗi kết quả chỉ báo cáo một lần; các lượt sau trỏ đến tài liệu hoặc commit đã ghi, không lặp lại bảng số liệu cũ.
- Khi trả lời xong/ phải dừng lại vì cần người dùng hỗ trợ, phải phát ra tiếng chuông thông báo để người dùng nắm được

## Tài liệu và code

- Không hard wrap (xuống dòng cứng) tài liệu, docstring hoặc nội dung commit. Mỗi ý trong mô tả commit là một dòng.
- Todo đã xong thì xóa hẳn nếu tài liệu đó không phải checklist tick tiến độ. Không giữ mục "đã xong" làm lịch sử.
- Docstring ngắn, chỉ giải thích lý do, cạm bẫy và ranh giới không đọc ra từ code; không kể lại code.
- Mỗi tệp code làm một nhiệm vụ. Chỉ tách tệp theo ranh giới trách nhiệm, không tách theo số dòng.
- Thêm tệp hoặc thư mục code thì cập nhật `0_Documentation/Phiên code/Cây thư mục code.md` trong cùng lượt.
- Tệp client phải có đuôi `.html`, bọc trong `<script>` hoặc `<style>`. Tên tệp trên Google Apps Script là cả đường dẫn, nên `include()` phải dùng đường dẫn đầy đủ.
- Giao diện dùng CSS thuần, SVG nội tuyến, không framework (khung thư viện). `spatialConfig` giữ các quyết định khoảng cách. Vẻ ngoài trong `9_Code_cu_tham_chieu/src/ui/Styles.html` là đặc tả hình thức; chỉ đọc code cũ, không sửa nó.
- GAS là nơi giữ state, cursor, hash, conflict và quyết định nghiệp vụ. Extension chỉ tìm tab FBM, gọi `fetch` và trả response thô; Sidebar chỉ khởi chạy và hiển thị.
- Không sửa nội dung fixture trong `0_Documentation/Nghiên cứu FBM/RequestFBM/`; không đưa cookie, mật khẩu, `authorized` hoặc payload nhạy cảm vào log.

## Kiểm thử và an toàn

- Ưu tiên chạy các kiểm thử có sẵn sau khi thay đổi nếu chúng đơn giản và nhanh; chỉ đọc phần tổng kết hoặc lỗi để không đưa toàn bộ đầu ra vào ngữ cảnh. Không cần viết thêm kiểm thử cho các chi tiết nhỏ mà chủ dự án có thể nghiệm thu trực tiếp trên Sheet DEV, nhưng vẫn phải viết kiểm thử cho nhánh có thể hỏng âm thầm, mở nhầm dữ liệu hoặc tốn hạn mức. Chạy bộ đầy đủ trước mốc bàn giao hoặc khi thay đổi hợp đồng dùng chung; ngoài các mốc đó vẫn có thể chạy bộ có sẵn nếu chi phí thời gian hợp lý.
- Chạy `node tests/run.js` sau thay đổi code; chỉ đọc phần tổng kết hoặc lỗi. Bổ sung test cho nhánh có thể mở nhầm dữ liệu, ghi đè âm thầm, tạo trùng hoặc tốn hạn mức.
- Nghiệm thu GAS bằng `node tests/gas.js <tên-hàm> --push`; thiếu `--push` là đang chạy bản cũ. Hàm dò mới phải có trong `DEV_RUNNER_ALLOWED`.
- Chỉ thử trên Sheet DEV hoặc tệp trắng, không chạm Sheet có dữ liệu khách thật. Live FBM chỉ dùng `ALT00010`, không gửi request xóa; ghi thật chỉ chạy sau khi chủ dự án bật rõ cả chế độ và cờ an toàn.
- Trước khi đưa dữ liệu thật vào production: xóa `server/dev/`, deployment DEV và tệp cấu hình chạy thử, tắt chia sẻ bằng liên kết và tắt `LOG_TRACE`.
- Không sửa Extension đang chạy ngoài repo; code chính thức nằm trong `2_ShinCRM_Extension/`, chủ dự án tự tải lại sau mỗi commit Extension.

## Git

- Commit ngay khi hoàn thành một nhóm mục liên quan trong checklist (nếu có); tách lõi GAS, Category, Extension/Sidebar, test và tài liệu thành các commit có chủ đề rõ ràng khi hợp lý.
- Mỗi commit phải cập nhật checklist tương ứng (nếu có); thêm tệp hoặc thư mục code thì cập nhật `0_Documentation/Phiên code/Cây thư mục code.md` trong cùng nhóm công việc.
- Tiêu đề và mô tả commit viết tiếng Việt có dấu, ngắn gọn, không hard wrap.
- Bảo toàn thay đổi có sẵn của chủ dự án; không đưa tệp không liên quan vào commit.

## Nghiêm cấm:

- Cấm sửa tài liệu ở `D:\ShinCRM_ggSheet\0_Documentation\Nghiên cứu FBM`.
