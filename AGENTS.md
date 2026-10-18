# Quy tắc làm việc với dự án ShinCRM

Tệp này là quy tắc làm việc cho người và AI viết code trong repo. Nguồn chuẩn duy nhất của quy tắc nền là `0_Documentation/00. Tài liệu chính thức/01. Quy chuẩn nền ShinCRM.md`; mục 2 dưới đây chỉ nhắc những điều phải nhớ mỗi lần viết code, khi có chỗ vênh thì tài liệu 01 thắng và phải sửa tệp này cho khớp.

Tệp này chỉ chứa quy tắc áp cho mọi phiên. Quy tắc riêng một loại phiên nằm ở mục 3 và chỉ đọc khi phiên chạm đến loại đó.

## 1. Phiên đang làm

- Phiên đang mở: sửa vi phạm luật thao tác đắt, branch `feature/expensive-ops`. Tiến độ duy nhất nằm ở `0_Documentation/Phiên code/[Đang xử lý] 2026.10.14 Vi phạm luật thao tác đắt.md`; chặng Cửa bản ghi và sổ bận theo dõi riêng ở `0_Documentation/Phiên code/[Đang xử lý] 2026.10.18 Cửa bản ghi và sổ bận.md`. Mục nào chi phí chưa rõ thì đo trên GAS DEV trước khi sửa và ghi số đo vào mục; mục sai về kiến trúc thì đọc code là biết, không đo.
- Việc kế tiếp nằm trong các tệp `[Chờ xử lý]` ở `0_Documentation/Phiên code/`. Mở phiên cho một tệp thì tạo branch riêng từ `main`, ghi mục tiêu phiên vào mục này và trỏ về tệp đó.
- Hồ sơ phiên đã xong và đã gộp vào `main` là các tệp `[Đã xử lý]` trong `0_Documentation/Phiên code/`; chỉ đọc khi cần tra lại.
- ShinCRM độc lập đã xong phần chính. Không tự mở rộng sang bot tra cứu, Zalobot hoặc nạp 1.700 khách thật khi checklist chưa cho phép.

## 2. Nguyên tắc nền khi viết code

- **Dựng kiến trúc để lỗi không có đường xảy ra, thay vì viết code bắt lỗi.** Đây là nguyên tắc quan trọng nhất. Áp mạnh nhất ở nơi định nghĩa trường (Schema), cửa ghi ra hệ ngoài (FBM...) và mọi chỗ quan trọng khác (state nghiệp vụ, dữ liệu khách, hash, quyết định ghi); chỉ những chỗ ít quan trọng mới được làm ở mức đủ tốt, không cầu toàn. **[RÀNG BUỘC CỨNG]**
- **Một việc một công cụ, một công cụ một việc.** Mỗi việc chỉ có đúng một công cụ làm, viết một lần ở một chỗ; mỗi công cụ chỉ làm đúng một việc. Trước khi viết bất kỳ thứ gì (hàm, component, hằng số, config, đoạn logic) phải tìm xem repo đã có thứ tương tự chưa: có thì dùng lại hoặc mở rộng, chưa có thì tạo ở đúng vị trí dùng chung, không viết tại chỗ dùng. **[RÀNG BUỘC CỨNG]**
- **Tiến trình là người điều phối gọi công cụ, công cụ trao nhau bằng dữ liệu.** Công cụ làm đúng một việc (đọc, kiểm, tính hoặc ghi) và không tự gọi công cụ khác loại: hàm kiểm không tự đọc Sheet, hàm ghi không tự kiểm. Người điều phối không biết cách làm việc nào, chỉ biết cần những công cụ nào và gọi theo thứ tự; đầu ra của công cụ trước là đầu vào của công cụ sau. Đọc – kiểm – ghi cần nhất quán thì người điều phối gọi cả ba trong cùng một lần cầm khóa. Không công cụ nào được dựa vào việc một công cụ khác "chắc đã chạy trước"; cái gì nó cần thì phải được truyền vào hoặc đọc qua đúng cổng của nơi sở hữu. "Một việc" là một trách nhiệm có nghĩa nghiệp vụ, không phải băm mỗi dòng thành một hàm. **[RÀNG BUỘC CỨNG]**
- **Tiến trình lớn ghép từ tiến trình nhỏ.** Người điều phối được gọi người điều phối khác như gọi một công cụ. Chỗ nào cần đúng một tiến trình đã có thì gọi hàm điều phối của tiến trình đó, không tự chọn và xếp lại các công cụ. **[RÀNG BUỘC CỨNG]**
- **Không có lỗi im lặng.** Mọi lỗi ở mọi phần của repo phải được báo rõ cho người dùng và ghi vào Sheet `Log`. Không che lỗi bằng `catch` rỗng, trả `null`/giá trị mặc định hay chỉ ghi console. Log và thông báo không được chứa cookie, mật khẩu, token, `authorized` hoặc payload nhạy cảm.
- **Mỗi state và mỗi quyết định chỉ có một nơi sở hữu.** Mọi thay đổi state đi qua cổng hoặc hợp đồng đã quy định, không có đường tắt.
- **Tách ba lớp:** thu thập và truyền tin; xử lý nghiệp vụ và state; hiển thị. Module chỉ làm trong ranh giới trách nhiệm của mình; giao tiếp giữa các module có điều kiện, tối thiểu, không thao tác thừa.
- **Đúng và nhất quán trước.** Cache hay dữ liệu cục bộ không thay được nguồn sự thật.
- **Thao tác đắt tối ưu theo chi phí thật, không theo cảm giác.** Thao tác đắt là thứ có giá cố định mỗi lần (gọi GAS mất khoảng 2–3 giây đường truyền, gọi FBM, đọc/ghi Sheet, đọc/ghi DocumentProperties, hạn mức nền tảng) hoặc tốn token. Làm theo thứ tự: không làm khi kết quả không được dùng; không làm lại thứ đã có trong cùng lần gọi; gom nhiều việc vào một lần (một lần gọi GAS xử lý nhiều khách, một lần đọc cả Sheet, ghi một lần cuối lời gọi). Chi phí chưa rõ nằm ở đâu thì đo trước; sai về kiến trúc thì đọc là biết, không cần đo. Tối ưu không được đổi lấy dữ liệu sai hay lỗi im lặng.

## 3. Quy tắc riêng theo loại phiên

Thư mục `0_Documentation/Quy tắc theo loại phiên/`. Phiên chạm đến loại nào thì đọc đúng tệp đó; phiên không chạm thì không đọc, kể cả tài liệu nghiệp vụ của loại đó (ví dụ phiên không làm đồng bộ FBM thì không đọc tài liệu 09 và hồ sơ FBM, vì chúng rất dài và tốn token).

- `Đồng bộ FBM.md`: phiên chạm luồng đồng bộ FBM (GAS `fbm_sync`, Extension phía FBM, checklist, tài liệu 09).
- `UI và Schema.md`: phiên chạm giao diện Sidebar, screen schema, component hoặc CSS.

Quy tắc mới chỉ áp cho một loại phiên thì ghi vào tệp của loại đó (hoặc tạo tệp mới và thêm một dòng ở đây), không ghi vào `AGENTS.md`.

## 4. Ranh giới Sheet – Extension – Sidebar – GAS

- **Extension** chỉ quan sát và chuyển dữ liệu thô từ Sheet hoặc máy tính. Với FBM, nó chỉ tìm tab FBM, gọi `fetch` và trả response thô. Không xử lý nghiệp vụ, không quyết định reload.
- **Sidebar** điều phối phía trình duyệt: giữ RAM và giao diện, chọn thời điểm gọi GAS, khởi chạy và hiển thị. Không tự thay quyết định nghiệp vụ.
- **GAS** sở hữu state nghiệp vụ, cursor, hash, conflict và mọi quyết định nghiệp vụ, kể cả dirty, reload, payload và render.

## 5. Đọc tài liệu trước khi làm

- Trước khi đọc code, viết test hoặc sửa tệp, phải xác định và đọc tài liệu chính thức, checklist và hợp đồng liên quan trực tiếp đến nhiệm vụ. Không suy ra yêu cầu từ code. Chưa biết cần đọc gì thì tìm mục lục trước.
- Tài liệu 01 (Quy chuẩn nền): đầu mỗi phiên chỉ đọc phần liên quan; đọc toàn bộ khi đổi kiến trúc lõi, Schema, ranh giới module hoặc phải xử lý mâu thuẫn tài liệu.
- Chỉ đọc tệp khi dòng code sắp viết cần đến nó; không quét cả codebase để chuẩn bị. Quy tắc đọc ít này áp cho việc chuẩn bị, không áp cho việc tìm gốc lỗi: sửa lỗi hay vi phạm thì phải đọc trọn tiến trình chứa nó (người điều phối và các công cụ nó gọi) và tìm tiến trình, công cụ đã có làm việc tương tự trước khi đề xuất. Đọc một hàm rồi sửa trong hàm đó là đường dẫn tới sửa bề mặt.
- Sau khi ngữ cảnh bị nén: chỉ đọc lại tệp tiến độ của phiên đang mở, tệp quy tắc theo loại phiên và tài liệu thuộc phạm vi đang làm, rồi tiếp tục từ dòng `[ ]` đầu tiên.
- Tài liệu trong phạm vi đang làm đã lỗi thời hoặc mâu thuẫn với quyết định mới của chủ dự án thì phải sửa nó trong cùng nhóm thay đổi; không giữ quy tắc cũ chỉ vì tài liệu còn đó.
- Không viết bản tóm tắt lặp lại quy tắc nền ở nơi khác. Tài liệu điều hướng (nếu có) chỉ trỏ đến nguồn chuẩn, không chứa quyết định nghiệp vụ.

## 6. Làm việc với chủ dự án

- Trao đổi bằng tiếng Việt. Chủ dự án làm bán hàng, tự học code và sẽ tự tiếp quản dự án: giải thích lý do và cạm bẫy bằng lời dễ hiểu; thuật ngữ tiếng Anh kèm nghĩa tiếng Việt trong ngoặc khi cần.
- Được phép và phải phản biện: nói rõ mâu thuẫn hoặc điểm chưa hợp lý. Quyết định quan trọng phải đưa cho chủ dự án biết trước khi ghi vào code hoặc tài liệu.
- Mọi phương án sửa đưa cho chủ dự án phải ghi đủ ba phần, thiếu phần nào là chưa đối chiếu và chưa được trình: (a) gốc lỗi là gì, nằm ở kiến trúc nào, không phải triệu chứng; (b) tiến trình hoặc công cụ nào đã có làm việc tương tự và phương án dùng lại nó thế nào; (c) bảng đối chiếu từng quy tắc **[RÀNG BUỘC CỨNG]** ở mục 2 với cách phương án đáp ứng, riêng nguyên tắc "lỗi không có đường xảy ra" phải nói rõ đường nào bị bịt bằng kiến trúc và chỗ nào chỉ còn phép kiểm (kèm lý do không bịt được). Phép kiểm sau khi đã có thể sai không thay được kiến trúc.
- Tự làm liên tục những mục chỉ cần code, test offline hoặc GAS DEV. Đến mục cần người dùng thao tác hoặc kiểm tra dữ liệu thật thì dừng và ghi rõ người dùng cần làm gì.
- Khi chủ dự án vắng mặt: ghi điểm mơ hồ vào `0_Documentation/Phiên code/Câu hỏi đêm.md`, chọn phương án an toàn nhất và ghi rõ đó là lựa chọn tạm để làm tiếp. Có câu trả lời rồi thì xóa hẳn mục hỏi; lịch sử đã nằm trong Git.
- Mỗi kết quả chỉ báo cáo một lần; các lượt sau trỏ đến tài liệu hoặc commit đã ghi, không chép lại bảng số liệu cũ.
- Trả lời xong, hoặc phải dừng vì cần người dùng giúp, thì phát tiếng chuông thông báo.

## 7. Viết code

- Mỗi tệp code làm một nhiệm vụ; chỉ tách tệp theo ranh giới trách nhiệm, không tách theo số dòng. Thêm tệp hoặc thư mục code thì cập nhật `0_Documentation/Phiên code/Cây thư mục code.md` trong cùng lượt.
- Docstring ngắn, chỉ nói lý do, cạm bẫy và ranh giới mà đọc code không thấy; không kể lại code.
- Tệp phía trình duyệt có đuôi `.html`, bọc trong `<script>` hoặc `<style>`. Trên Google Apps Script tên tệp là cả đường dẫn, nên `include()` phải dùng đường dẫn đầy đủ.

## 8. Kiểm thử và chạy thử

- Sau mỗi thay đổi code chạy `node tests/run.js`, chỉ đọc phần tổng kết hoặc lỗi. Chạy bộ đầy đủ trước mốc bàn giao hoặc khi đổi hợp đồng dùng chung; ngoài các mốc đó vẫn chạy nếu chi phí thời gian hợp lý.
- Bắt buộc viết test cho nhánh có thể hỏng âm thầm, mở nhầm dữ liệu, ghi đè âm thầm, tạo trùng hoặc tốn hạn mức. Chi tiết nhỏ mà chủ dự án nghiệm thu được ngay trên Sheet DEV thì không cần test riêng.
- Nghiệm thu GAS bằng `node tests/gas.js <tên-hàm> --push`; thiếu `--push` là đang chạy bản cũ. Hàm dò mới phải có trong `DEV_RUNNER_ALLOWED`.
- Chỉ thử trên Sheet DEV hoặc tệp trắng, không chạm Sheet có dữ liệu khách thật.
- Code Extension chính thức nằm trong `2_ShinCRM_Extension/`; không sửa Extension đang chạy ngoài repo. Chủ dự án tự tải lại Extension sau mỗi commit Extension.
- Trước khi đưa dữ liệu thật vào production: xóa `server/dev/`, deployment DEV và tệp cấu hình chạy thử, tắt chia sẻ bằng liên kết, tắt `LOG_TRACE`.

## 9. Tài liệu

- Không xuống dòng cứng (hard wrap) trong tài liệu, docstring hay nội dung commit.
- Tệp mới trong `0_Documentation/Phiên code/` đặt tiền tố ngày `YYYY.MM.DD ` (ví dụ `2026.10.06 Kế hoạch ...md`) để phân biệt tệp mới và cũ. Khi phiên đổi trạng thái thì thêm hoặc đổi tiền tố `[Chờ xử lý]`, `[Đang xử lý]`, `[Đã xử lý]` trước ngày.
- Việc đã xong thì xóa hẳn khỏi tài liệu, trừ checklist tick tiến độ; không giữ mục "đã xong" làm lịch sử.

## 10. Git

- Commit ngay khi xong một nhóm mục liên quan; tách lõi GAS, Category, Extension/Sidebar, test và tài liệu thành các commit có chủ đề rõ khi hợp lý.
- Mỗi commit cập nhật checklist tương ứng (nếu có) và `Cây thư mục code.md` khi có tệp hoặc thư mục code mới.
- Tiêu đề và mô tả commit viết tiếng Việt có dấu, ngắn gọn, không xuống dòng cứng; mỗi ý trong mô tả là một dòng.
- Giữ nguyên thay đổi có sẵn của chủ dự án; không đưa tệp không liên quan vào commit.
