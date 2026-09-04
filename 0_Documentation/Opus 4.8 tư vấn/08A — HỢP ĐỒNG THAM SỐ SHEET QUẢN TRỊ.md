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

Bộ lọc và bộ sắp xếp có đúng một hiện thân, chạy ở server trong `renderViewSheet`; sidebar không biết cú pháp lọc là gì. Giữa các cột là AND ngầm; trong một ô, các term khẳng định nối bằng OR, các term phủ định nối bằng AND, hai nhóm nối bằng AND — luật này khai cứng, không có núm vặn. Tập pattern khả dụng do `type` của cột quyết định, và thứ tự nhận pattern cố định. `<>` không đứng trước bốn toán tử so sánh. So sánh DATE luôn cắt cả hai vế về độ chi tiết người dùng gõ. Không có cơ chế escape ký tự. Điều kiện gõ ở cột `@ACT_...` lọc theo lần làm việc gần nhất còn sống, và không có cách nào gõ điều kiện để đưa một giao dịch đã xóa mềm lên sheet quản trị. Cột `@CUS_TT_BAN_GHI` không có đặc quyền gì trong ngôn ngữ này: nó là một cột `SELECT` thường, ô hàng 3 rỗng nghĩa là không lọc, và ngôn ngữ này **không có ngoại lệ nào về mặc định**. Cấu hình sắp xếp quét hết cột từ hàng 4, lấy mọi cặp đủ hai vế; cặp thiếu một vế im lặng bỏ qua, cặp gõ sai thì báo lỗi. `@CUS_MA_KH` giảm dần luôn là tie-break cuối cùng và người dùng không phải gõ. Ô rỗng luôn xếp cuối bất kể chiều sắp. Sắp xếp TEXT dùng locale `vi`. Gặp lỗi cú pháp thì không chạm sheet, gom mọi ô sai báo một lần, và câu báo phải nói được ô nào, gõ gì, sai gì, viết đúng thế nào. `normalizeText` phải cho kết quả giống hệt nhau ở client và server, kiểm bằng bảng ca chuẩn lúc khởi động.

## 3. Ranh giới phạm vi phiên

Trong phạm vi: ngữ pháp ba cấp của ô hàng 3; bảng pattern theo bốn kiểu dữ liệu; luật cắt độ chi tiết DATE; bốn từ khóa ngày tương đối; ngữ nghĩa lọc trên cột `Activity`; ma trận ca kiểm thử; cú pháp và ngữ nghĩa hai cột sắp xếp; chuỗi ba nấc và luật cứng nấc ba; tie-break cuối cùng; cách so sánh theo kiểu dữ liệu và vị trí ô rỗng; nội dung thông báo lỗi; bảng tra nhanh cho người dùng.

Ngoài phạm vi: mọi thứ dính FBM; kênh kỹ thuật hiển thị thông báo lỗi; thiết kế `renderViewSheet` và pipeline vẽ (thuộc Tài liệu 7); ba đường kích hoạt việc vẽ và công tắc tự động sắp xếp; trạng thái bẩn; giao thức Extension–sidebar; nội dung tin nhắn bot; CSS.

## 4. Điểm treo cố ý

Không giữ danh sách riêng ở đây. **`[NEO → lộ trình và checklist]`** Toàn bộ điểm treo của cả dự án nằm ở Phần 5 của tài liệu 00, chia ba nhóm, mỗi dòng mang theo tài liệu chủ và điều kiện mở lại.

## 5. Phụ thuộc

**Phiên này tiêu thụ:** bốn kiểu dữ liệu và hiến pháp đọc cột; ba hàng tiêu đề; năm tiền tố; danh sách cột hai sheet kho; chuỗi thời gian chuẩn `YYYY-MM-DD` và `YYYY-MM-DD HH:mm` theo giờ Việt Nam; thuộc tính `type` và `precision` trong `DATA_SCHEMA`; quy ước số đầu tên mục trong `Category`; hai giá trị `active` và `deleted` của `recordStatus`; `renderViewSheet` và ba đường kích hoạt việc vẽ ở Tài liệu 7; `searchIndex` và luật bỏ dấu chuyển thường ở Tài liệu 5; bốn khối hiện có của `Config`.

**Phiên này cung cấp cho tài liệu 10:** nội dung hai phần của thông báo lỗi và ràng buộc kênh; bảng tra nhanh để đưa vào tài liệu hướng dẫn người dùng; danh sách tệp mới phía server. Kênh đi của phần A và phần B đã chốt ở tài liệu 10 Phần 9.

**Phiên này cung cấp cho phiên FBM-Sync:** luật ghi sheet quản trị theo tiền tố `CUS_`/`ACT_`, nhờ đó cột đồng bộ kéo lên sheet quản trị được mà không sửa một dòng code lõi nào.


**Phiên này cung cấp cho mọi phiên sau:** `normalizeText` là hàm chuẩn hóa chuỗi duy nhất của hệ thống, mọi nơi cần so khớp chuỗi không phân biệt hoa thường và dấu đều gọi nó, cấm viết lại.

---

