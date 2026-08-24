# HỢP ĐỒNG 08A — THAM SỐ SHEET QUẢN TRỊ

## 1. Tên chính thức đã chốt

| Tên | Nghĩa, một câu |
|---|---|
| term (hạng tử) | Một mảnh của ô hàng 3 sau khi cắt theo dấu `;`, mang một pattern duy nhất. |
| pattern (mẫu) | Hình dạng nội dung của một term, ví dụ chứa, bằng đúng, khoảng; tập pattern khả dụng do `type` của cột quyết định. |
| `normalizeText` | Hàm chuẩn hóa chuỗi dùng chung cho bộ lọc và `searchIndex`: bỏ khoảng trắng thừa, chuyển thường, bỏ dấu tiếng Việt. |
| Luật cắt độ chi tiết (precision truncation) | So sánh DATE bằng cách cắt cả hai vế về độ dài chuỗi mà người dùng gõ. |
| Chuỗi ba nấc (sort spec chain) | Trình tự tìm cấu hình sắp xếp: hai cột `VIEW_` của sheet, rồi hai cột `CFG_` trong `Config`, rồi luật cứng trong code. |
| Cặp sắp xếp (sort pair) | Một hàng gồm `@VIEW_SORT_COL` và `@VIEW_SORT_LEVEL` cùng có giá trị; thiếu một vế thì cặp bị bỏ qua. |
| Tie-break cuối cùng | `@CUS_MA_KH` giảm dần, nối tự động vào cuối mọi cấu hình sắp xếp ở cả ba nấc. |
| `prepareViewSheet` | Lệnh menu do người dùng bấm, đặt Data Validation và cell note lên sheet quản trị; idempotent, không bao giờ ghi giá trị. |

## 2. Quy tắc bất biến, phiên sau không được vi phạm

Bộ lọc và bộ sắp xếp có đúng một hiện thân, chạy ở server trong `renderViewSheet`; sidebar không biết cú pháp lọc là gì. Giữa các cột là AND ngầm; trong một ô, các term khẳng định nối bằng OR, các term phủ định nối bằng AND, hai nhóm nối bằng AND — luật này khai cứng, không có núm vặn. Tập pattern khả dụng do `type` của cột quyết định, và thứ tự nhận pattern cố định. `<>` không đứng trước bốn toán tử so sánh. So sánh DATE luôn cắt cả hai vế về độ chi tiết người dùng gõ. Không có cơ chế escape ký tự. Điều kiện gõ ở cột `@ACT_...` lọc theo lần làm việc gần nhất còn sống. Cấu hình sắp xếp quét hết cột từ hàng 4, lấy mọi cặp đủ hai vế; cặp thiếu một vế im lặng bỏ qua, cặp gõ sai thì báo lỗi. `@CUS_MA_KH` giảm dần luôn là tie-break cuối cùng và người dùng không phải gõ. Ô rỗng luôn xếp cuối bất kể chiều sắp. Sắp xếp TEXT dùng locale `vi`. Gặp lỗi cú pháp thì không chạm sheet, gom mọi ô sai báo một lần, và câu báo phải nói được ô nào, gõ gì, sai gì, viết đúng thế nào. `normalizeText` phải cho kết quả giống hệt nhau ở client và server, kiểm bằng bảng ca chuẩn lúc khởi động.

## 3. Ranh giới phạm vi phiên

Trong phạm vi: ngữ pháp ba cấp của ô hàng 3; bảng pattern theo bốn kiểu dữ liệu; luật cắt độ chi tiết DATE; bốn từ khóa ngày tương đối; ngữ nghĩa lọc trên cột `Activity`; ma trận ca kiểm thử; cú pháp và ngữ nghĩa hai cột sắp xếp; chuỗi ba nấc và luật cứng nấc ba; tie-break cuối cùng; cách so sánh theo kiểu dữ liệu và vị trí ô rỗng; nội dung thông báo lỗi; bảng tra nhanh cho người dùng.

Ngoài phạm vi: mọi thứ dính FBM; kênh kỹ thuật hiển thị thông báo lỗi; thiết kế `renderViewSheet` và pipeline vẽ (thuộc Tài liệu 7); ba đường kích hoạt việc vẽ và công tắc tự động sắp xếp; trạng thái bẩn; giao thức Extension–sidebar; nội dung tin nhắn bot; CSS.

## 4. Điểm treo cố ý

| Điểm treo | Để dành cho phiên nào, để làm gì |
|---|---|
| Kênh hiển thị thông báo lỗi | **Phiên SOP.** Chốt đường đi cho phần A và phần B. Ràng buộc kế thừa: `SpreadsheetApp.getUi()` không dùng được trong trigger; `toast` **dùng được** trong installable `onEdit` và đó là đường đi của ca lỗi phổ biến nhất, nên nên hiện ngay tại đó; trigger theo thời gian thì không có kênh nào, lỗi phải cất lại và hiện ở lần tương tác kế tiếp |
| Núm vặn ẩn/hiện bản ghi `da_xoa` trên sheet quản trị | **Phiên FBM-Sync.** Hiện chưa tồn tại bản ghi `da_xoa` nào vì vắng module thì luôn xóa hẳn. Khi làm, phải trả lời ba câu kèm theo: khách `da_xoa` có hiện trong hộp tìm kiếm không, `taxNumber` của họ có còn chặn trùng không, activity `da_xoa` có được tính là lần gần nhất cho hai trường kế tục không |
| Từ khóa tuần, tháng, quý, năm cho lọc DATE | **Phiên nào có nhu cầu thật.** Thêm một từ khóa là thêm một dòng vào bảng giá trị, không phá cú pháp cũ. Nếu thêm `thisWeek` thì phải chốt tuần bắt đầu thứ Hai hay Chủ Nhật |
| OR giữa hai cột khác nhau | **Không xây.** Lối đi đã chốt là tạo thêm một sheet quản trị. Ghi ở đây để phiên sau không phát minh lại dưới tên khác |
| Cơ chế escape ký tự đặc biệt | **Không xây.** Lối đi vòng là bọc nháy kép hoặc lọc bằng đoạn khác |
| Cột gộp mọi giá trị hợp đồng của một khách ở `Customer` | **Chờ có nhu cầu thật.** Chủ dự án đang cân nhắc; nếu làm thì nó là cột TEXT ở `Customer`, dùng `*999*` để tìm, và không cần thêm gì vào ngôn ngữ lọc |

## 5. Phụ thuộc

**Phiên này tiêu thụ:** bốn kiểu dữ liệu và hiến pháp đọc cột; ba hàng tiêu đề; năm tiền tố; danh sách cột hai sheet kho; chuỗi thời gian chuẩn `YYYY-MM-DD` và `YYYY-MM-DD HH:mm` theo giờ Việt Nam; thuộc tính `type` và `precision` trong `DATA_SCHEMA`; quy ước số đầu tên mục trong `Category`; hai giá trị `dang_dung` và `da_xoa` của `recordStatus`; `renderViewSheet` và ba đường kích hoạt việc vẽ ở Tài liệu 7; `searchIndex` và luật bỏ dấu chuyển thường ở Tài liệu 5; bốn khối hiện có của `Config`.

**Phiên này cung cấp cho phiên SOP:** nội dung hai phần của thông báo lỗi và ràng buộc kênh; bảng tra nhanh để đưa vào tài liệu hướng dẫn người dùng; danh sách tệp mới phía server.

**Phiên này cung cấp cho phiên FBM-Sync:** luật ghi sheet quản trị theo tiền tố `CUS_`/`ACT_`, nhờ đó cột đồng bộ kéo lên sheet quản trị được mà không sửa một dòng code lõi nào; điểm treo núm vặn `da_xoa` kèm ba câu hỏi phải trả lời.

**Phiên này cung cấp cho mọi phiên sau:** `normalizeText` là hàm chuẩn hóa chuỗi duy nhất của hệ thống, mọi nơi cần so khớp chuỗi không phân biệt hoa thường và dấu đều gọi nó, cấm viết lại.

---

