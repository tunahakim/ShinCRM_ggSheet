# Zalobot tra cứu và thêm giao dịch ShinCRM

Tài liệu này chuyển kết quả đọc code Termux/Zalo/FBM cũ sang kiến trúc ShinCRM hiện tại. Người dùng chat trực tiếp với Zalo Bot bằng văn bản thuần túy. Bot chỉ đọc và ghi Google Sheet ShinCRM; bot không gọi FBM trong lúc chat, không mở mini app, không có nút inline và không có callback như Telegram.

Các đoạn phản hồi mẫu dưới đây chốt cấu trúc, state và lệnh mà Bot phải hiểu; câu chữ chi tiết có thể tinh chỉnh ở bước thiết kế nội dung sau.

## Phạm vi v1

Bot chỉ có ba nghiệp vụ:

1. Tìm khách hàng.
2. Xem thông tin khách và lịch sử giao dịch.
3. Thêm một giao dịch mới cho khách đang xem.

Bot không sửa thông tin khách, không sửa giao dịch đã ghi, không xóa dữ liệu và không tạo khách mới. Nếu nhập sai giao dịch sau khi đã lưu, bản đầu không có đường sửa qua Zalo; cần sửa bằng công cụ ShinCRM khác hoặc chốt riêng một phiên sau.

Trong tài liệu này, “giao dịch” là một dòng của sheet `Activity`. “Mã khách FBM” là trường `ma_kh` mà FBM hiển thị cho người dùng, được lưu tại cột đồng bộ `@CUS_MA_KH_FBM` (tên logic `fbmCustomerCode`) trong Google Sheet. Đây không phải mã nội bộ ShinCRM `@CUS_MA_KH`.

## Cách người dùng tương tác

Người dùng chỉ mở cuộc trò chuyện cá nhân với Bot trên Zalo và gửi tin nhắn văn bản. Không cần đăng nhập FBM, không cần gửi mật khẩu, không cần gọi URL webhook và không cần thao tác relay. Relay/webhook là phần hạ tầng chạy phía sau để chuyển tin Zalo vào ứng dụng.

Mỗi tin nhắn được hiểu theo trạng thái hiện tại của cuộc trò chuyện. Vì Zalo chỉ gửi văn bản, bot luôn trả lại hướng dẫn chữ và số thứ tự để người dùng gửi tin tiếp theo. Khi đang xem khách hoặc danh sách khách, người dùng chỉ cần gửi giá trị tìm kiếm mới; bot bỏ ngữ cảnh cũ và tìm ngay, không cần gửi `0` hay `.huy` trước.

## Lệnh và quy ước chung

| Tin nhắn | Ý nghĩa |
| --- | --- |
| `.help` | Xem hướng dẫn sử dụng ở mọi trạng thái; không hủy state hiện tại. |
| `.huy` | Hủy state hiện tại, xóa bản nháp nếu có và về trạng thái chờ tìm kiếm. |
| `.sdt 0984333222` | Tìm theo số điện thoại. |
| `.mst 0101234567` | Tìm theo mã số thuế. |
| `.ten Công ty ABC` | Tìm theo tên công ty hoặc tên liên quan. |
| `.mkh ALT00490` | Tìm chính xác theo mã khách FBM `ma_kh`, lấy từ `@CUS_MA_KH_FBM` trong Google Sheet. |
| Văn bản không có tiền tố | Tìm tự do trong các trường được phép; số điện thoại, MST và tên được nhận diện theo nội dung. |

Tiền tố dùng dấu chấm, không dùng dấu gạch chéo. Lệnh không phân biệt chữ hoa/chữ thường; bot bỏ khoảng trắng thừa nhưng không tự ý bỏ dấu chấm hoặc gạch trong MST/SĐT nếu chưa có quy tắc kiểm thử tương ứng. Lệnh tìm `.sdt`, `.mst`, `.ten` và `.mkh` luôn bắt đầu một lượt tìm mới, kể cả khi người dùng đang chọn khách hoặc đang chờ nhập giao dịch; bản nháp chờ nhập khi đó bị hủy vì chưa ghi gì. `.help` chỉ đọc hướng dẫn và giữ nguyên state, còn `.huy` xóa state.

Tin chỉ gồm chữ số được xử lý theo state để không nhầm số điện thoại với số thứ tự:

| State | Tin chỉ gồm chữ số |
| --- | --- |
| `IDLE` | Luôn là từ khóa tìm tự do, kể cả `1`, `098933` hoặc MST dạng số. |
| `CHOOSE_CUSTOMER` | Chỉ chuỗi số nguyên từ `1` đến số thứ tự đang hiển thị (tối đa `10`) mới chọn khách. Chuỗi có số `0` đầu hoặc vượt phạm vi được tìm như từ khóa; muốn chắc chắn tìm số thì dùng `.sdt`. |
| `VIEW_CUSTOMER` | `1` xem trang giao dịch cũ hơn, `9` nhảy tới tối đa 10 giao dịch cuối cùng còn lại, `2` bắt đầu thêm giao dịch. Chỉ nhận `1`/`9` khi còn giao dịch chưa xem; số khác là từ khóa tìm khách mới. Số điện thoại/MST ngắn hoặc không rõ ý nên dùng `.sdt`/`.mst`. |
| `ADD_TRANSACTION` | Tin không có tiền tố là nội dung và được lưu ngay; lệnh có dấu chấm được phân tích trước theo quy tắc ở trên. |

## Trạng thái hội thoại

```text
IDLE
  -> CHOOSE_CUSTOMER       (có nhiều khách trùng từ khóa)
  -> VIEW_CUSTOMER         (đang xem một khách và các giao dịch)
  -> ADD_TRANSACTION       (đang nhập giao dịch mới)
  -> VIEW_CUSTOMER
```

State được lưu theo `chat_id`, chỉ giữ mã khách nội bộ, mã giao dịch đang xem, bản nháp nhỏ và mốc hết hạn; không lưu cả bản sao hàng dữ liệu. TTL (thời gian sống) được chọn theo mức rủi ro của từng state: `5 phút` cho `CHOOSE_CUSTOMER` và `VIEW_CUSTOMER`, `15 phút` cho `ADD_TRANSACTION`. Đây là quy ước của ứng dụng, không phải giới hạn do Zalo áp đặt. State hết hạn được dọn khi có tin tiếp theo, không gửi tin nhắc tự động.

## Pipeline 1: Tìm khách hàng

### Đầu vào

Ở trạng thái `IDLE`, người dùng gửi một trong các tin sau:

```text
.sdt 0984333222
.mst 0101234567
.ten Công ty ABC
.mkh ALT00490
Nguyễn Ánh
```

### Cách bot xử lý

1. Router nhận tiền tố dấu chấm. Tiền tố `.sdt`, `.mst`, `.ten` chỉ tìm đúng trường tương ứng; `.mkh` tìm đúng `fbmCustomerCode`/`@CUS_MA_KH_FBM`.
2. Khi không có tiền tố, Bot dùng cùng phép tìm của sidebar: lấy toàn bộ trường khách đang có cờ `searchable`, chuẩn hóa bằng cùng `normalizeText`, cắt tin thành các mẩu theo khoảng trắng và chỉ nhận khách chứa đủ mọi mẩu. Cụm trong dấu ngoặc kép phải xuất hiện liền nhau; thứ tự các mẩu không quan trọng.
3. Danh sách trường không được khai riêng cho Bot. Bot và sidebar phải đọc cùng một bảng khai; khi anh thêm cờ `searchable` cho một cột ở sidebar, cột đó tự trở thành trường tìm được qua tin tự do của Bot trong lượt triển khai tương ứng.
4. Bot đọc dữ liệu khách từ Google Sheet theo schema và header hàng 1, không dùng số thứ tự cột cố định. Mã nội bộ `@CUS_MA_KH` chỉ dùng để nối sang `Activity`, không thay cho mã FBM hiển thị.
5. Bot loại trùng theo mã nội bộ ShinCRM và giữ thứ tự kết quả theo cùng luật của sidebar; giới hạn hiển thị trên Zalo chỉ là giới hạn giao diện, không đổi phép so khớp. V1 chỉ cho mở khách `active`; khách `deleted` không được dùng để thêm giao dịch.

### Không có kết quả

```text
Không tìm thấy khách với từ khóa: "abc".
Thử .sdt, .mst, .ten hoặc .mkh để thu hẹp tìm kiếm.
Gõ .help để xem cú pháp.
```

State vẫn là state chờ tìm kiếm; không đọc thêm và không ghi dữ liệu. Footer của nhánh tìm kiếm chỉ cần nhắc `.help`; `.huy` vẫn được chấp nhận nhưng không cần lặp lại trong mọi tin.

### Có đúng một khách

Bot tự mở khách ngay, không bắt người dùng gửi thêm `1`. Bot trả thông tin khách và trang giao dịch mới nhất trong cùng phản hồi. Số hiển thị là số thực tế vừa xếp được vào tin, không cố định là 10:

```text
Khách hàng
Mã khách FBM: ALT00490
Tên công ty: Công ty ABC
Mã số thuế: 0101234567
Điện thoại: 0984333222
Người liên hệ: Nguyễn Văn A

Đang hiển thị 10/23 GD gần nhất:
1. ACT-000901 | 09/09/2026 | Gọi điện
   Đã trao đổi nhu cầu phần mềm.
2. ACT-000877 | 05/09/2026 | Gửi báo giá
   Đã gửi báo giá lần một.
...
10. ACT-000801 | 20/08/2026 | Chăm sóc
   Đã xác nhận nhu cầu.

Gõ 1 để xem tiếp các GD cũ hơn.
Gõ 9 để xem tối đa 10 GD cuối cùng còn lại.
Gõ 2 để thêm giao dịch mới.
Gửi từ khóa mới để tìm khách khác. Gõ .help để xem cú pháp.
```

State chuyển thành `VIEW_CUSTOMER`, lưu `selectedCustomerId` là mã nội bộ ShinCRM và điểm cuối của trang giao dịch hiện tại. Người dùng không cần biết hoặc nhập mã nội bộ này.

Nếu `n = N`, toàn bộ lịch sử đã hiển thị trong tin đầu và bot không thêm dòng hướng dẫn `1` hoặc `9`. Nếu `n < N`, bot hiển thị cả hai lệnh để người dùng đi từng trang hoặc nhảy thẳng tới tối đa 10 giao dịch cuối cùng chưa xem.

`N` là tổng số giao dịch đang hoạt động của khách tại thời điểm tìm; `n` là số giao dịch vừa hiển thị trong tin hiện tại. Nếu khách không có giao dịch:

```text
Khách này chưa có giao dịch nào.
Gõ 2 để thêm giao dịch mới.
Gửi từ khóa mới để tìm khách khác. Gõ .help để xem cú pháp.
```

### Tìm khách tiếp tục khi đang xem

Người dùng không phải quay về bằng `0` hoặc hủy rồi mới tìm lại. Ở `VIEW_CUSTOMER` hoặc `CHOOSE_CUSTOMER`, chỉ cần gửi giá trị mới, ví dụ `Công ty XYZ`, `.sdt 0912...` hoặc `.mkh ALT00502`; Bot bỏ ngữ cảnh xem hiện tại và chạy Pipeline 1 từ đầu. Trong `CHOOSE_CUSTOMER`, chỉ số nguyên đúng với một thứ tự đang hiển thị mới là lựa chọn; `098933` và các chuỗi số dài hơn 10 được tìm như từ khóa. Nếu muốn tìm số ngắn có thể trùng số thứ tự, dùng `.sdt` để nói rõ ý định.

### Có nhiều khách

```text
Đang hiển thị 10/37 khách tìm thấy (tối đa 10 khách):

1. ALT00490 - Công ty ABC - 0984333222
2. ALT00491 - Công ty ABD - 0984333223
3. ALT00502 - Công ty XYZ - 0912345678
4. ALT00503 - Công ty MNO - 0912345679
5. ALT00504 - Công ty PQR - 0912345680
6. ALT00505 - Công ty STU - 0912345681
7. ALT00506 - Công ty VWX - 0912345682
8. ALT00507 - Công ty YZA - 0912345683
9. ALT00508 - Công ty BCD - 0912345684
10. ALT00509 - Công ty EFG - 0912345685

Gửi số thứ tự để mở khách. Gõ từ khóa dài hơn hoặc gửi `.help` để tìm chính xác hơn.
Gõ .help để xem cú pháp.
```

State chuyển thành `CHOOSE_CUSTOMER`, chỉ lưu danh sách mã nội bộ tương ứng và thời hạn. Tin `1` lúc này là chọn khách thứ nhất; sau khi chọn, bot trả thông tin khách và trang giao dịch gần nhất như nhánh một kết quả. Nếu gửi một từ khóa khác thay vì số thứ tự hợp lệ, Bot bỏ danh sách cũ và tìm lại ngay. Không có phân trang danh sách khách trong v1; khi có hơn 10 kết quả, bot chỉ hiện 10 kết quả đầu và yêu cầu người dùng thu hẹp từ khóa.

### Lựa chọn không hợp lệ

```text
Không nhận ra lựa chọn. Hãy gửi số thứ tự đang hiển thị hoặc gửi một từ khóa mới để tìm lại.
Gõ .help để xem cú pháp.
```

State không đổi. Nếu danh sách đã hết hạn hoặc khách vừa bị đánh dấu đã xóa, bot yêu cầu tìm lại từ đầu.

## Pipeline 2: Xem tiếp lịch sử giao dịch

### Đầu vào

Ở trạng thái `VIEW_CUSTOMER`, sau khi đã hiện một trang lịch sử và trang đó còn giao dịch chưa xem, người dùng có hai lựa chọn: gửi `1` để lấy trang kế tiếp theo thứ tự cũ dần, hoặc gửi `9` để nhảy tới tối đa 10 giao dịch cuối cùng còn lại. Trong danh sách sắp xếp mới nhất trước, “cuối cùng” là các giao dịch cũ nhất ở cuối danh sách.

### Cách bot xử lý

1. Bot đọc lại các dòng `Activity` thuộc `selectedCustomerId`, chỉ lấy `recordStatus = active`.
2. Các dòng được sắp xếp mới trước theo `workDate`, sau đó `createdAt` và mã giao dịch để thứ tự ổn định.
3. Với `1`, bot dựng trang từ giao dịch cuối trang trước theo thứ tự cũ dần. Với `9`, bot lấy tối đa 10 giao dịch ở cuối phần chưa xem, có thể bỏ qua các giao dịch ở giữa để đi thẳng tới cuối lịch sử. Mỗi trang dừng sớm khi tổng tin nhắn sắp chạm giới hạn 2.000 ký tự của Zalo; phần hướng dẫn cuối tin cũng tính vào giới hạn này. Vì vậy một trang có thể chỉ có 3, 6 hoặc 10 giao dịch tùy độ dài nội dung.
4. Bot không cắt giữa một giao dịch. Nếu nội dung một giao dịch quá dài, bot rút gọn phần nội dung và ghi rõ `[nội dung đã rút gọn vì giới hạn tin nhắn]`.
5. State lưu điểm cuối `(workDate, activityId)` thay vì lưu cả danh sách, nên tin nhắn thêm giao dịch mới không làm Bot ghi đè dữ liệu cũ. Nếu trang hiện tại đã là trang cuối thì không hiển thị hướng dẫn gửi `1` hoặc `9` nữa.

### Phản hồi khi còn giao dịch

```text
Đang hiển thị 6/23 GD cũ hơn của ALT00490 (tối đa 10 GD, giới hạn tin Zalo 2.000 ký tự)

11. ACT-000790 | 18/08/2026 | Tư vấn
    Đã trao đổi phạm vi triển khai.
...
16. ACT-000650 | 01/07/2026 | Gọi điện
    Chưa liên hệ được.

Gõ 1 để xem tiếp các GD cũ hơn.
Gõ 9 để xem tối đa 10 GD cuối cùng còn lại.
Gõ 2 để thêm giao dịch mới.
Gửi từ khóa mới để tìm khách khác. Gõ .help để xem cú pháp.
```

Số thứ tự hiển thị tiếp tục tăng theo trang để người dùng dễ theo dõi. `1` lấy tối đa 10 giao dịch cũ hơn theo thứ tự; `9` nhảy tới tối đa 10 giao dịch ở cuối phần chưa xem. Số thực tế có thể ít hơn do giới hạn ký tự. Chỉ hiển thị hướng dẫn `1` và `9` khi vẫn còn giao dịch chưa xem. Mã `ACT-...` chỉ là mã giao dịch hiển thị, không phải số dòng sheet.

### Phản hồi khi đã hết

```text
Đã hiển thị hết lịch sử giao dịch của ALT00490.
Gõ 2 để thêm giao dịch mới hoặc gửi từ khóa mới để tìm khách khác.
Gõ .help để xem cú pháp.
```

Ở trang cuối, bot không hiện `1` hoặc `9`. Nếu người dùng vẫn gửi một trong hai số này, bot chỉ báo đã hết lịch sử và giữ nguyên khách đang xem; muốn tìm số điện thoại hoặc MST thì dùng `.sdt` hoặc `.mst` để không bị hiểu là lệnh phân trang.

Bot không có luồng sửa hoặc xóa giao dịch từ màn hình này.

## Pipeline 3: Thêm giao dịch mới

### Bắt đầu

Ở trạng thái `VIEW_CUSTOMER`, người dùng gửi `2`. Bot gắn giao dịch mới vào khách đang xem và chỉ yêu cầu nội dung công việc:

```text
Thêm giao dịch cho ALT00490 - Công ty ABC.
Hãy gửi nội dung công việc bằng một tin nhắn.
Tin nhắn tiếp theo sẽ được lưu ngay.
Gõ .help để xem cú pháp | .huy để hủy nhập.
```

### Nhập và lưu ngay

Ở trạng thái `ADD_TRANSACTION`, tin nhắn văn bản tiếp theo được coi là `content`. Người dùng gửi nội dung đồng nghĩa với xác nhận lưu; bot không hỏi ngày, công việc, sản phẩm hay các trường phụ và không có bước `LƯU` lần hai.

Các giá trị ngầm định đề xuất:

| Trường Activity | Giá trị khi ghi từ Bot |
| --- | --- |
| `customerId` | Mã nội bộ của khách đang xem, do server gắn; người dùng không được thay đổi. |
| `content` | Nguyên văn tin nhắn người dùng gửi, sau khi chuẩn hóa xuống dòng. |
| `workDate` | Ngày hiện tại theo múi giờ của ShinCRM. |
| `taskType` | Giá trị mặc định riêng cho Bot, phải có trong `@CAT_CONG_VIEC`; đề xuất thêm giá trị `Ghi nhận qua Zalo` và khai làm mặc định. |
| `product` | Kế thừa sản phẩm của khách; nếu khách chưa có thì dùng `Chưa xác định` nếu danh mục cho phép, hoặc chốt nới required cho riêng nguồn `bot`. |
| `enteredBy` | Tên hiển thị Zalo nếu khớp danh mục người nhập liệu; nếu không khớp thì để trống. |
| `contractValue` | Để trống. |
| `priority` | Kế thừa ưu tiên gần nhất nếu có, nếu không thì để trống. |
| `dueAt` | Để trống. |
| `allowFbmPush` | Mặc định `Chưa cho phép` để Bot không tự đẩy dữ liệu sang FBM. |
| `id`, `createdAt`, `recordStatus` | Cửa ghi tự cấp hoặc tự đặt theo schema. |

Hiện `taskType`, `product` và `allowFbmPush` đang khai `required` trong `DataSchema`. Đề xuất an toàn là thêm các giá trị danh mục `Ghi nhận qua Zalo` và `Chưa xác định`, rồi dùng chúng làm mặc định khi ghi từ Bot. Nếu không muốn thêm danh mục, cần chốt thay đổi luật bắt buộc cho riêng nguồn `bot`; không được bỏ qua kiểm tra bằng một đường ghi riêng.

Ví dụ:

```text
Người dùng: Khách đã xác nhận mẫu thép, chờ gửi báo giá.
Bot: Đã thêm giao dịch ACT-000901 cho ALT00490 - Công ty ABC.
     Ngày: 09/09/2026 | Công việc: [mặc định Bot]
     Gõ .help để xem cú pháp.
```

Bot gọi cửa ghi chung của ShinCRM với `source = bot`. Cửa ghi kiểm tra giá trị ngầm định, khóa tài liệu, ghi một lần, đọc lại và chỉ báo thành công khi giao dịch thực sự tồn tại. Bot không gọi `setValue` hoặc `appendRow` trực tiếp.

Nếu nội dung rỗng hoặc giá trị ngầm định không hợp lệ, không ghi gì:

```text
Chưa thêm được giao dịch vì nội dung đang trống hoặc cấu hình mặc định chưa hợp lệ.
Hãy gửi lại nội dung sau khi sửa, hoặc .huy để hủy nhập.
Gõ .help để xem cú pháp | .huy để hủy nhập.
```

Sau khi ghi thành công, state quay về `VIEW_CUSTOMER`; giao dịch mới được đưa lên đầu trang lịch sử khi Bot đọc lại.

### Đổi khách trong lúc đang chờ nội dung

Trong `ADD_TRANSACTION`, mọi tin không có tiền tố đều là nội dung và sẽ lưu ngay. Nếu muốn tìm khách khác trước khi gửi nội dung, người dùng gửi trực tiếp một lệnh tìm có dấu chấm như `.sdt ...`, `.mst ...`, `.ten ...` hoặc `.mkh ...`; Bot hủy trạng thái chờ rỗng rồi chạy Pipeline 1, không cần gửi `.huy`. `.help` chỉ mở hướng dẫn và vẫn giữ bước chờ nhập; `.huy` hủy bước chờ. Nếu đã gửi nội dung và giao dịch đã lưu thì chỉ cần gửi từ khóa mới như bình thường để mở khách khác.

## Footer theo ngữ cảnh

Mọi phản hồi nghiệp vụ đều có một dòng hướng dẫn ngắn ở cuối, nhưng không lặp `.huy` ở những state không có bản nháp cần hủy:

| State sau khi trả lời | Footer mặc định |
| --- | --- |
| `IDLE`, `CHOOSE_CUSTOMER`, `VIEW_CUSTOMER` | `Gõ .help để xem cú pháp.` |
| `ADD_TRANSACTION` | `Gõ .help để xem cú pháp \| .huy để hủy nhập.` |
| Phản hồi của `.huy` | `Gõ .help để xem cú pháp.` |
| Phản hồi của `.help` | Không nối thêm footer; chính nội dung trợ giúp đã là hướng dẫn đầy đủ. |

Các dòng hành động cụ thể (ví dụ `Gõ 1`, `Gõ 9`, `Gõ 2`, hoặc `Gửi từ khóa mới`) đặt ngay trước footer. `.huy` vẫn được chấp nhận ở mọi state, kể cả `VIEW_CUSTOMER`, nhưng không cần quảng cáo trong mọi tin. Sau khi Bot đã báo ghi thành công, `.huy` không hoàn tác giao dịch.

## Giới hạn 2.000 ký tự của Zalo

API `sendMessage` nhận phần `text` dài từ 1 đến 2.000 ký tự. V1 nên coi một phản hồi logic là một tin nhắn duy nhất để thứ tự dễ hiểu và tránh trường hợp tin thứ hai gửi thất bại. Không tự tách một trang lịch sử thành nhiều tin ở giữa luồng.

Bộ dựng tin phải tính độ dài trước khi gọi API và chừa chỗ cho tiêu đề, các dòng hành động, footer và dấu xuống dòng. Quy tắc dựng trang:

1. Đọc tổng số giao dịch `N` hoặc tổng số khách `N` trước khi dựng phần danh sách.
2. Thêm từng khách/giao dịch theo đúng thứ tự tìm kiếm hoặc lịch sử cho tới khi thêm mục tiếp theo sẽ vượt 2.000 ký tự; `n` là số mục thực sự đã hiển thị và phải ghi rõ theo dạng `n/N`.
3. Không cắt giữa mã, ngày, loại công việc hoặc giữa hai mục. Nếu nội dung một giao dịch quá dài, chỉ rút gọn trường nội dung và thêm dấu hiệu `[nội dung đã rút gọn]`; các trường nhận diện giao dịch vẫn phải còn.
4. Nếu tên khách, địa chỉ hoặc trường hiển thị khác quá dài, rút gọn giá trị đó theo cùng nguyên tắc. Không được cắt mất footer hoặc dòng hướng dẫn hành động.
5. Với lịch sử, chỉ hiện `Gõ 1 để xem tiếp các GD cũ hơn` và `Gõ 9 để xem tối đa 10 GD cuối cùng còn lại` khi vẫn còn mục chưa hiển thị. Nếu toàn bộ `N` giao dịch đã nằm trong các trang đã xem thì bỏ cả hai dòng này.

Nếu nội dung quá dài khiến trang chỉ hiện được 3 hoặc 6 giao dịch, đó là kết quả hợp lệ và phải thể hiện bằng `n/N`; người dùng gửi `1` để lấy trang kế tiếp. Việc gửi nhiều tin hoặc cho người dùng tự chọn số lượng chỉ nên xem xét ở phiên sau khi đã đo giới hạn tốc độ và lỗi API thực tế.

## Lệnh trợ giúp và hủy

### `.help`

`.help` có thể gửi ở bất kỳ trạng thái nào và không làm mất state hiện tại. Phản hồi đề xuất:

```text
ShinCRM Bot

TÌM KHÁCH
.sdt <số điện thoại>
.mst <mã số thuế>
.ten <tên công ty>
.mkh <mã khách FBM>
Hoặc gửi trực tiếp từ khóa.

SAU KHI MỞ KHÁCH
1  Xem trang giao dịch cũ hơn (khi còn dữ liệu)
9  Nhảy tới tối đa 10 giao dịch cuối cùng còn lại (khi còn dữ liệu)
2  Thêm giao dịch mới
Gửi từ khóa mới để tìm khách khác

.huy  Hủy thao tác hiện tại

.help không hủy bước đang làm; .sdt, .mst, .ten, .mkh là tìm mới và sẽ thay thế state hiện tại.
```

### `.huy`

`.huy` luôn có hiệu lực, kể cả khi đang chờ nội dung giao dịch hoặc đang chọn khách:

```text
Đã hủy thao tác. Không có dữ liệu nào được ghi.
Gõ .help để xem cú pháp.
```

State bị xóa và trở về `IDLE`.

## Luồng nền: Bot nhận tin nhắn (người dùng không phải thao tác)

Pipeline này chỉ giải thích vì sao tin nhắn chat trực tiếp đến được bot; người dùng không gọi webhook và không nhìn thấy relay.

1. Người dùng gửi văn bản trong cuộc trò chuyện cá nhân với Zalo Bot.
2. Zalo Platform gửi sự kiện `message.text.received` tới địa chỉ webhook đã đăng ký.
3. Relay kiểm tra secret header của Zalo, kích thước body và JSON, đưa event vào hàng chờ xử lý rồi trả HTTP `2xx` ngay. Tài liệu Zalo không công bố một con số timeout cố định cho webhook; `testWebhook` chỉ cảnh báo endpoint quá chậm là `webhook.err.unreachable` và khuyên trả `2xx` trước rồi xử lý bất đồng bộ.
4. Worker gọi GAS để kiểm tra `chat_id`, chống xử lý lặp theo `message_id`, lấy state rồi chuyển tin cho router của ba pipeline nghiệp vụ.
5. Ảnh, sticker, voice, nhóm chat hoặc event không hỗ trợ không được đọc/ghi sheet. Bot trả lời ngắn:

```text
Bot hiện chỉ xử lý tin nhắn văn bản trong cuộc trò chuyện cá nhân.
Gõ .help để xem cú pháp.
```

6. Worker/GAS gọi Zalo Bot API `sendMessage` để trả kết quả. Nếu API lỗi, người dùng chỉ thấy thông báo thử lại; chi tiết lỗi nằm trong log kỹ thuật.

Google Apps Script không expose HTTP header trong `doPost(e)`, và mỗi lượt thực thi Apps Script có trần 6 phút. Hai giới hạn này không phải thời gian chờ hội thoại: relay phải trả `2xx` nhanh, còn GAS xử lý phía sau trong từng lượt ngắn. Đây là chi tiết hạ tầng, không làm thay đổi việc người dùng chat trực tiếp với Bot.

Zalo có tham số `timeout = 30` giây trong API `getUpdates`, nhưng đó là thời gian chờ của long polling khi phát triển local; bản webhook production này không dùng `getUpdates`, nên không lấy 30 giây làm TTL state hoặc thời gian chờ người dùng.

## Thời gian chờ state

TTL (thời gian sống) tính từ tin nhắn cuối cùng theo từng state:

| State | TTL | Khi hết hạn |
| --- | --- | --- |
| `CHOOSE_CUSTOMER` | 5 phút | Bỏ danh sách cũ; tin tìm kiếm kế tiếp được xử lý như lượt mới. |
| `VIEW_CUSTOMER` | 5 phút | Bỏ khách/cursor cũ; tin tìm kiếm kế tiếp được xử lý như lượt mới. |
| `ADD_TRANSACTION` | 15 phút | Không được ghi tin văn bản đến sau thời hạn vào khách cũ; yêu cầu tìm lại khách. |

Đây là TTL do ứng dụng chọn để tránh giữ nhầm khách hoặc bản nháp quá lâu; không phải timeout của Zalo và cũng không phải 6 phút runtime của GAS.

Bot không dùng trigger hoặc tin nhắn hẹn giờ để báo state hết hạn. Cách đó vừa tốn lượt gọi vừa có thể gửi thông báo muộn khi người dùng đã chuyển việc. Khi người dùng gửi tin tiếp theo, Bot dọn state quá hạn theo nguyên tắc:

- Nếu tin là `.sdt`, `.mst`, `.ten`, `.mkh` hoặc một từ khóa tìm tự do trong trạng thái xem khách, Bot coi đó là lượt tìm mới và xử lý ngay.
- Nếu tin là `1`, `9` hoặc `2` mà không còn khách đang xem, Bot trả `Phiên thao tác đã hết hạn. Hãy gửi từ khóa mới để tìm khách.` rồi kèm footer.
- Nếu đang ở bước chờ nội dung giao dịch mà state hết hạn, tin văn bản kế tiếp không được tự động ghi vào khách cũ. Bot báo phiên đã hết hạn và yêu cầu tìm lại khách; người dùng không mất dữ liệu nào vì nội dung chưa được nhận.

## Dữ liệu và ranh giới đọc/ghi

- Customer được đọc theo `DATA_SCHEMA` và header hàng 1; không giả định cột A/B/C.
- Phần tìm tự do phải dùng cùng luật với `client/ram/store.html`: `storeHaystack`, `storeSearchTokens` và `Store.searchCustomers`; không viết một bộ tách từ hoặc chuẩn hóa thứ hai chỉ dành cho Bot.
- Tìm `.mkh` đọc trường đồng bộ `fbmCustomerCode`/`@CUS_MA_KH_FBM`; bot không gọi FBM để tìm realtime. Nếu cột này rỗng, `.mkh` không thể tìm ra khách cho tới khi đồng bộ bổ sung dữ liệu.
- Activity nối với khách bằng mã nội bộ `@ACT_MA_KH`, chỉ lấy dòng `active`, sắp xếp mới trước và phân trang theo hai trần: tối đa 10 giao dịch và tối đa 2.000 ký tự mỗi tin sau khi đã chừa phần hướng dẫn cuối tin.
- Khi thêm Activity, `customerId` được server lấy từ khách đang mở; không tin mã khách do người dùng tự chèn trong nội dung chat.
- Ghi mới đi qua `WriteGate` với nguồn `bot` và dùng toàn bộ kiểm tra giống nguồn người dùng. Bot không sửa cột đồng bộ FBM và không đẩy giao dịch sang FBM trong lúc ghi.
- Allowlist đọc và allowlist ghi tách riêng. Người có quyền đọc nhưng không có quyền ghi vẫn xem được khách và lịch sử nhưng khi gửi `2` sẽ nhận thông báo không có quyền thêm giao dịch.

## Các điểm cần duyệt trước khi code

| Điểm | Đề xuất trong bản này |
| --- | --- |
| Phạm vi nghiệp vụ | Chỉ tìm khách, xem lịch sử và thêm giao dịch; không sửa/xóa khách hoặc giao dịch. |
| Cú pháp | Dùng `.sdt`, `.mst`, `.ten`, `.mkh`, `.help`, `.huy`; không dùng `/`. |
| Mã `.mkh` | Tìm theo `ma_kh` FBM trong `@CUS_MA_KH_FBM`, không tìm theo mã nội bộ Google Sheet. |
| Tìm tự do | Dùng đúng bộ trường `searchable`, chuẩn hóa và phép khớp token như sidebar; thêm trường ở sidebar thì Bot dùng được sau khi triển khai bản khai mới. |
| Một kết quả | Tự mở khách và hiện trang giao dịch gần nhất ngay; tiêu đề ghi `n/N`, số giao dịch thực tế tùy độ dài tin, không cam kết luôn là 10. |
| Nhiều kết quả | Tiêu đề ghi `n/N khách tìm thấy`, chỉ hiện tối đa 10 khách; không phân trang, yêu cầu thu hẹp từ khóa nếu cần. |
| Xem tiếp | Gửi `1` để lấy tối đa 10 giao dịch cũ hơn hoặc `9` để nhảy tới tối đa 10 giao dịch cuối cùng còn lại; chỉ hiện và nhận hai lệnh này khi vẫn còn dữ liệu. |
| Tìm liên tục | Khi đang xem khách/danh sách, gửi từ khóa mới là tìm ngay; không cần `0` hoặc `.huy`. |
| Thêm giao dịch | Gửi `2`, sau đó gửi nội dung; tin nội dung được lưu ngay với các giá trị ngầm định. Không có bước sửa giao dịch đã ghi. |
| Lệnh trong lúc nhập | `.help` giữ nguyên bước chờ; `.huy` hủy; `.sdt`/`.mst`/`.ten`/`.mkh` hủy bước chờ rỗng và tìm khách mới ngay. |
| Giá trị ngầm định bắt buộc | Đề xuất thêm `Ghi nhận qua Zalo` vào `@CAT_CONG_VIEC` và `Chưa xác định` vào `@CAT_SAN_PHAM`; cần anh duyệt trước khi code. |
| Kênh webhook | Người dùng chat trực tiếp; relay chỉ là lớp nền để kiểm tra secret, xếp hàng và trả `2xx` nhanh trước khi GAS xử lý. |
| Footer | Footer theo state; `.huy` chỉ hiện khi đang có bước chờ cần hủy, và luôn tính vào giới hạn 2.000 ký tự. |
| State | Lưu theo `chat_id`, TTL 5 phút cho chọn/xem khách và 15 phút cho nhập giao dịch; dọn khi có tin tiếp theo, không gửi tin hết hạn tự động và chống chạy lặp theo `message_id`. |

## Kiểm thử trước khi dùng thật

- Tìm `.sdt`, `.mst`, `.ten`, `.mkh` với 0, 1 và nhiều kết quả; kiểm tra `.mkh` chỉ khớp `@CUS_MA_KH_FBM`.
- Tìm tự do bằng một và nhiều mẩu, cụm trong ngoặc kép, tất cả trường đang cờ `searchable`, và xác nhận thêm cột `searchable` ở sidebar thì Bot tìm được.
- Ở `CHOOSE_CUSTOMER`, kiểm tra `1` chọn đúng khách, còn `098933`, `01` và số vượt phạm vi 1–10 được tìm như từ khóa; ở `VIEW_CUSTOMER`, kiểm tra `1` phân trang, `2` thêm giao dịch và số điện thoại mới không bị nuốt thành lệnh.
- Một khách có 0, 1, 10 và hơn 10 giao dịch với nội dung ngắn/dài; kiểm tra tiêu đề `n/N`, gửi `1` nhiều lần, gửi `9` để nhảy tới cuối và kiểm tra số dòng thay đổi theo giới hạn 2.000 ký tự, không trùng hoặc bỏ sót dữ liệu.
- Thêm giao dịch bằng đúng một tin nội dung, kiểm tra giá trị ngầm định, nội dung rỗng, lỗi cửa ghi và hủy trạng thái chờ bằng `.huy`.
- Đang xem khách gửi từ khóa mới phải tìm ngay; đang chờ nội dung gửi `.sdt`/`.mst`/`.ten`/`.mkh` phải chuyển tìm khách mà không ghi nhầm tin lệnh thành nội dung.
- Kiểm tra `.help` giữ nguyên state, `.huy` xóa state, TTL 5 phút cho chọn/xem và 15 phút cho chờ nội dung; không có tin nhắn tự động khi TTL hết.
- Dựng tin sát 2.000 ký tự, xác nhận footer và dòng hành động không bị cắt, mục giao dịch không bị cắt giữa chừng, và nội dung dài được đánh dấu rút gọn.
- Người chỉ có quyền đọc không thể thêm giao dịch; người có quyền ghi chỉ ghi được Activity cho khách đã chọn.
- Đổi thứ tự cột Google Sheet vẫn tìm và ghi đúng theo header; khách hoặc giao dịch `deleted` không xuất hiện.
- Webhook thiếu secret, event không phải văn bản, chat nhóm, tin gửi lặp và lỗi Zalo API đều fail closed (đóng an toàn).
- Chỉ thử trên Sheet DEV hoặc tệp trắng; không dùng token thật trong tài liệu và không thử trên dữ liệu khách thật.

## Nguồn đã đối chiếu

- Code cũ trong thư mục này: `Main.txt`, `SearchLogic.txt`, `Formatter.txt`, `ZaloAPI.txt`, `LogService.txt`, `FBMAuth.txt`, `FBMQuery.txt`, `SessionManager.txt`, `Utils.txt`, `Config.txt`, `z_setWebhook.txt`.
- Code hiện tại: `server/data/DataSchema.js`, `fbm_sync/SyncSchema.js`, `server/sheet/EntityRead.js`, `server/sheet/SheetIo.js`, `server/gate/WriteGate.js`, `server/gate/DeleteGate.js`, `server/service/SaveService.js`, `server/util/TextNormalize.js`.
- Tài liệu Zalo Bot đã đọc: [Tài liệu zalobot do chính Zalo phát hành.md](Tài liệu zalobot do chính Zalo phát hành.md), cùng các mục `/docs/BOT`, `/docs/BOT/create_bot`, `/docs/BOT/authorize`, `/docs/BOT/call_api`, `/docs/BOT/apis/getMe`, `/docs/BOT/webhook`, `/docs/BOT/best-practices/build-personal-assistant-with-open-claw`, `/docs/BOT/error_code`.
