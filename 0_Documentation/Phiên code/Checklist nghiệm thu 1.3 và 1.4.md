# Checklist nghiệm thu 1.3 và 1.4

Cách dùng: mở Sheet DEV, mở sidebar ShinCRM, bật sẵn Console của trình duyệt (F12) vì vài mục yêu cầu nhìn Console. Mỗi dòng là một thao tác, ghi rõ **bấm đâu** và **phải thấy gì**; đạt thì tick `- [x]`, chưa làm thì để trống.

Phạm vi: checklist mô tả nguyên trạng giao diện **trên Google hôm nay** — trước Việc 2 và Việc 3. Hai điểm khác với bản kế hoạch, cần biết trước khi bấm:

- Header màn hình xem có **6 nút**, chưa có icon tia sét. Icon sét (bám theo ô đang chọn) sẽ đặt vào header giữa "Tìm khách" và "Vẽ lại sheet quản trị" ở lượt Việc 3.
- Menu "Khác" còn **2 mục**. Khi icon sét ra đời, mục "Bám theo ô đang chọn" rời khỏi menu này, menu còn 1 mục.

---

## 1. Chuẩn bị

- [x] Mở Sheet DEV, mở sidebar ShinCRM từ menu của Sheet.
- [x] Ghi lại thời gian từ lúc bấm mở đến lúc màn hình khách hàng đầu tiên hiện ra. Mốc so sánh của bản cũ: 42,6 giây. Số đo lần này: 49.889 giây.
- [x] Trong lúc chờ, vùng thông tin có chữ "Đang mở…", không có màn trắng trống trơn. --> Nó có các chữ sau: "Đang đo ngân sách ô và nạp lõi…", "Đang nạp giao dịch:..."
- [x] Màn xem hiện ra đủ: thanh thông tin khách hàng (tên công ty in đậm xanh, bốn ô mã khách/số thuế/liên hệ/điện thoại), card GHI CHÚ nền đỏ nhạt, card LỊCH SỬ LÀM VIỆC, header 6 nút.

## 2. Header màn hình xem (6 nút)

- [x] Trỏ chuột vào từng nút, đọc tooltip. Từ trái qua phải: "Tìm khách", "Vẽ lại sheet quản trị", "Nạp lại", "Khác", "Sửa khách" (nằm bên phải), "Thêm khách".
- [x] Bấm "Tìm khách" → bảng tìm hiện ra dưới header. Gõ một chữ cái có trong tên khách → danh sách gợi ý hiện; bấm một gợi ý → màn chuyển sang khách đó và bảng tìm tự đóng.
- [x] Bấm "Tìm khách" lần nữa → bảng tìm đóng.
- [x] Gõ một chuỗi vô nghĩa trong bảng tìm → thấy đúng chữ "Không có khách nào khớp."
- [x] Bấm "Vẽ lại sheet quản trị" → hiện thông báo rằng chức năng chưa dựng và thuộc chặng 1.5. **Đây là kết quả đúng, không phải lỗi.**
- [x] Bấm "Nạp lại" → màn vẽ lại và vẫn đứng ở đúng khách đang xem.
- [x] Bấm "Sửa khách" → form "Sửa Khách Hàng" điền sẵn giá trị của khách đang xem.
- [x] Bấm "Thêm khách" → form "Thêm Khách Hàng" với các ô trống.  --> Mô tả chi tiết: Khi tôi bấm thêm khách mới, nó tự động điền sẵn ở ô Mã khách và Ngày nhập liệu, không cho sửa.

## 3. Đường menu

Menu "Khác" (nút ba chấm trên header):

- [x] Bấm "Khác" → đúng 2 mục: "Bám theo ô đang chọn" và "Tự động sắp xếp sheet".
- [x] Bấm từng mục → dấu tích (✓) hiện bên trái; bấm lần nữa → tích biến mất.
- [x] Ghi nhận (không tính là lỗi): mục "Bám theo ô đang chọn" hôm nay **chỉ nhớ trạng thái bật/tắt**, bấm hàng trên Sheet thì sidebar chưa nhảy theo — đường nối thật nằm ở lượt Việc 2/3.

Menu "Đang xem" (card LỊCH SỬ LÀM VIỆC):

- [x] Bấm "Đang xem" → đúng 3 nấc: "Tất cả", "Chỉ còn dùng", "Chỉ đã xóa". Nấc đang chọn có chấm tròn (●), đổi nấc thì chấm theo.

Ba luật của mọi menu:

- [x] Đang mở một menu, bấm sang nút mở menu khác → menu cũ đóng ngay, menu mới mở. Không bao giờ có hai menu cùng mở.
- [x] Menu đang mở, bấm phím `Esc` → đóng.
- [x] Menu đang mở, bấm vào chỗ trống ngoài menu → đóng.

Nhớ ưu tiên (prefs):

- [x] Đặt tất cả các núm ngược với trạng thái hiện tại của chúng, đóng sidebar rồi mở lại → mọi mục menu vẫn giữ đúng tích/chấm như trước khi đóng, không về mặc định.

## 4. Ba màn form

Nguyên tắc chung: form nào cũng có header "Hủy" bên trái (dấu X), "Lưu" bên phải (dấu check), và một nút to cuối form. **Hai đường lưu phải cho cùng một kết quả.** Form nào cũng phải kiểm cả hai lượt: mở từ "thêm" (trống) và mở từ "sửa" (điền sẵn).

Form khách hàng:

- [x] Mở "Sửa khách" → tiêu đề "Sửa Khách Hàng", đủ ô, giá trị đúng của khách đang xem. Bấm "Hủy" → về màn xem, mọi thay đổi lỡ gõ bị bỏ.
- [x] Sửa tên công ty, bấm "Lưu" trên header → về màn xem, tên mới hiện ngay.
- [x] Mở lại, sửa tên lần nữa, bấm nút "LƯU DỮ LIỆU" cuối form → kết quả y hệt đường nút header.
- [x] Mở "Thêm khách" → tiêu đề "Thêm Khách Hàng", ô trống. Lưu một khách thử nghiệm mới → màn xem nhảy sang đúng khách vừa tạo.

Form giao dịch:

- [x] Bấm "Thêm" trên card LỊCH SỬ LÀM VIỆC → "Thêm Giao Dịch", ô `khách hàng` đã điền sẵn khách đang xem.
- [x] Điền nội dung, bấm "Lưu" header → dòng mới xuất hiện trên lịch sử.
- [x] Bấm bút chì trên một dòng giao dịch (trỏ chuột vào dòng mới thấy nút) → "Sửa Giao Dịch" điền sẵn. Đổi nội dung, lưu bằng nút "LƯU GIAO DỊCH" cuối form → dòng trên lịch sử đổi theo.
- [x] Nhìn cuối form giao dịch có khối ghi chú của khách,readonly; bấm vào nó → mở form ghi chú.

Form ghi chú:

- [x] Đường mở 1: bấm "Sửa" trên tiêu đề card GHI CHÚ → màn "Ghi Chú Khách Hàng".
- [x] Đường mở 2: bấm thẳng vào chữ ghi chú trên card → cũng đúng màn đó. --> không phải bấm thẳng vào chữ ghi chú, mà là bấm thẳng vào vùng màu đỏ chứa nội dung ghi chú hoặc vùng chứa chữ "Chưa có"
- [x] Sửa chữ, lưu bằng "Lưu" header → chữ mới hiện trên card, card giữ nền đỏ nhạt.
- [x] Sửa tiếp, lưu bằng nút "LƯU GHI CHÚ" cuối form → cùng kết quả.

## 5. Xóa và hoàn tác

- [x] Trỏ chuột vào một dòng lịch sử → bên phải dòng hiện hai nút: thùng rác (tooltip "Xóa giao dịch") và bút chì (tooltip "Sửa giao dịch"), bút chì nằm ngoài cùng. Đưa chuột ra khỏi dòng → hai nút ẩn đi.
- [x] Bấm thùng rác → dòng biến mất khỏi danh sách, một băng hiện ở đáy sidebar kèm nút "Hoàn tác".
- [x] Bấm "Hoàn tác" **trong vòng 5 giây** → dòng trở lại đúng chỗ cũ, băng biến mất.
- [x] Bấm thùng rác lần nữa rồi **để quá 5 giây không bấm gì** → băng tự biến mất, dòng vẫn ẩn trong "Tất cả".
- [x] Đổi "Đang xem" sang "Chỉ đã xóa" → đúng giao dịch vừa xóa hiện ra ở đó. Đổi sang "Chỉ còn dùng" → nó không có mặt. 
- [x] Quay lại "Tất cả" → dòng đó vẫn còn nguyên (xóa mềm chỉ là che đi, không mất dữ liệu). --> Vì chưa có các giá trị liên quan đến việc đồng bộ FBM nên nó đã xóa hẳn - Tôi test với 1 dòng có mã đồng bộ FBM (mã láo do tôi tự viết) --> nó vẫn xóa hẳn

## 6. Đường thu gọn

- [x] Tìm (hoặc tạo) một giao dịch có nội dung dài hơn 12 dòng → dòng đó bị cắt, cuối khối có nút "Xem thêm".
- [x] Bấm "Xem thêm" → khối mở ra hết nội dung, không cuộn; nút "Thu gọn" xuất hiện ở **cả đầu và cuối** khối.
- [x] Bấm "Thu gọn" (đầu hoặc cuối đều được) → khối về trạng thái cắt ngắn với "Xem thêm".
- [x] Một dòng giao dịch ngắn (không quá 12 dòng) → không có bất kỳ nút thu gọn nào.
- [x] Card GHI CHÚ dài thì cuộn trong khung của nó, không có nút "Xem thêm" — đây là hai kiểu khác nhau, đều đúng.

## Chỗ nhìn thấy sai

Ghi tự do mọi thứ mắt thấy lệch, không cần biết nguyên nhân. Đây là đầu vào cho lượt sửa giao diện tiếp theo.

- Ở sidebar, màn hình thêm mới, các trường bắt buộc không có dấu hiệu nhận biết (không có dấu * ở tên các trường bắt buộc)
- Ở sidebar, với các ô nhập liệu dạng menu thả xuống --> khi tôi nhập láo 1 giá trị không tồn tại trong sheet Category --> nó vẫn cho lưu --> Như thế là sai
- 
