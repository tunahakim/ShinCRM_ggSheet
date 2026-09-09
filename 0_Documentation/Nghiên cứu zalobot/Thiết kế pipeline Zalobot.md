# Zalobot tra cứu và thêm giao dịch ShinCRM

Tài liệu này chuyển kết quả đọc code Termux/Zalo/FBM cũ sang kiến trúc ShinCRM hiện tại. Người dùng chat trực tiếp với Zalo Bot bằng văn bản thuần túy. Bot chỉ đọc và ghi Google Sheet ShinCRM; bot không gọi FBM trong lúc chat, không mở mini app, không có nút inline và không có callback như Telegram.

## Phạm vi v1

Bot chỉ có ba nghiệp vụ:

1. Tìm khách hàng.
2. Xem thông tin khách và lịch sử giao dịch.
3. Thêm một giao dịch mới cho khách đang xem.

Bot không sửa thông tin khách, không sửa giao dịch đã ghi, không xóa dữ liệu và không tạo khách mới. Nếu nhập sai giao dịch sau khi đã lưu, bản đầu không có đường sửa qua Zalo; cần sửa bằng công cụ ShinCRM khác hoặc chốt riêng một phiên sau.

Trong tài liệu này, “giao dịch” là một dòng của sheet `Activity`. “Mã khách FBM” là trường `ma_kh` mà FBM hiển thị cho người dùng, được lưu tại cột đồng bộ `@CUS_MA_KH_FBM` (tên logic `fbmCustomerCode`) trong Google Sheet. Đây không phải mã nội bộ ShinCRM `@CUS_MA_KH`.

## Cách người dùng tương tác

Người dùng chỉ mở cuộc trò chuyện cá nhân với Bot trên Zalo và gửi tin nhắn văn bản. Không cần đăng nhập FBM, không cần gửi mật khẩu, không cần gọi URL webhook và không cần thao tác relay. Relay/webhook là phần hạ tầng chạy phía sau để chuyển tin Zalo vào ứng dụng.

Mỗi tin nhắn được hiểu theo trạng thái hiện tại của cuộc trò chuyện. Vì Zalo chỉ gửi văn bản, bot luôn trả lại hướng dẫn chữ và số thứ tự để người dùng gửi tin tiếp theo. Khi đang xem khách hoặc danh sách khách, một tin tìm kiếm mới luôn bắt đầu lượt tìm mới; không cần gửi `0` hay `.huy` trước.

## Lệnh và quy ước chung

| Tin nhắn | Ý nghĩa |
| --- | --- |
| `.help` | Xem hướng dẫn sử dụng ở mọi trạng thái. |
| `.huy` | Hủy thao tác đang làm, xóa bản nháp và về trạng thái chờ tìm kiếm. |
| `.sdt 0984333222` | Tìm theo số điện thoại. |
| `.mst 0101234567` | Tìm theo mã số thuế. |
| `.ten Công ty ABC` | Tìm theo tên công ty hoặc tên liên quan. |
| `.mkh ALT00490` | Tìm chính xác theo mã khách FBM `ma_kh`, lấy từ `@CUS_MA_KH_FBM` trong Google Sheet. |
| Văn bản không có tiền tố | Tìm tự do trong các trường được phép; số điện thoại, MST và tên được nhận diện theo nội dung. |

Tiền tố dùng dấu chấm, không dùng dấu gạch chéo. Lệnh không phân biệt chữ hoa/chữ thường; bot bỏ khoảng trắng thừa nhưng không tự ý bỏ dấu chấm hoặc gạch trong MST/SĐT nếu chưa có quy tắc kiểm thử tương ứng. Trong `VIEW_CUSTOMER`, chỉ `9` (xem giao dịch cũ hơn) và `2` (thêm giao dịch) là lệnh số; tin khác được coi là từ khóa tìm khách mới. Trong `ADD_TRANSACTION`, tin không có tiền tố là nội dung cần lưu, nên muốn chuyển sang khách khác thì gửi `.sdt`, `.mst`, `.ten` hoặc `.mkh`.

## Trạng thái hội thoại

```text
IDLE
  -> CHOOSE_CUSTOMER       (có nhiều khách trùng từ khóa)
  -> VIEW_CUSTOMER         (đang xem một khách và các giao dịch)
  -> ADD_TRANSACTION       (đang nhập giao dịch mới)
  -> VIEW_CUSTOMER
```

State được lưu theo `chat_id`, chỉ giữ mã khách nội bộ, mã giao dịch đang xem, bản nháp nhỏ và mốc hết hạn; không lưu cả bản sao hàng dữ liệu. Thời gian chờ của state là 15 phút kể từ tin nhắn cuối cùng; đây là quy ước của ứng dụng, không phải giới hạn do Zalo áp đặt. State hết hạn được dọn khi có tin tiếp theo, không gửi tin nhắc tự động.

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
Gõ .help để xem cú pháp | .huy để hủy thao tác.
```

State vẫn là `IDLE`; không đọc thêm và không ghi dữ liệu.

### Có đúng một khách

Bot tự mở khách ngay, không bắt người dùng gửi thêm `1`. Bot trả thông tin khách và trang giao dịch mới nhất trong cùng phản hồi (tối đa 10 giao dịch, nhưng có thể ít hơn vì giới hạn 2.000 ký tự của Zalo):

```text
Khách hàng
Mã khách FBM: ALT00490
Tên công ty: Công ty ABC
Mã số thuế: 0101234567
Điện thoại: 0984333222
Người liên hệ: Nguyễn Văn A

10 giao dịch gần nhất (ví dụ này đủ 10 vì nội dung ngắn):
1. ACT-000901 | 09/09/2026 | Gọi điện
   Đã trao đổi nhu cầu phần mềm.
2. ACT-000877 | 05/09/2026 | Gửi báo giá
   Đã gửi báo giá lần một.
...
10. ACT-000801 | 20/08/2026 | Chăm sóc
   Đã xác nhận nhu cầu.

Gửi 9 để xem tối đa 10 giao dịch cũ nhất còn lại.
Gửi 2 để thêm giao dịch mới.
Gửi từ khóa mới để tìm khách khác. Gõ .help để xem cú pháp | .huy để hủy thao tác.
```

State chuyển thành `VIEW_CUSTOMER`, lưu `selectedCustomerId` là mã nội bộ ShinCRM và điểm cuối của trang giao dịch hiện tại. Người dùng không cần biết hoặc nhập mã nội bộ này.

Nếu khách có dưới 10 giao dịch, bot ghi rõ số thực tế. Nếu không có giao dịch:

```text
Khách này chưa có giao dịch nào.
Gửi 2 để thêm giao dịch mới. Gửi từ khóa mới để tìm khách khác.
Gõ .help để xem cú pháp | .huy để hủy thao tác.
```

### Tìm khách tiếp tục khi đang xem

Người dùng không phải quay về bằng `0` hoặc hủy rồi mới tìm lại. Ở `VIEW_CUSTOMER` hoặc `CHOOSE_CUSTOMER`, chỉ cần gửi giá trị mới, ví dụ `Công ty XYZ`, `.sdt 0912...` hoặc `.mkh ALT00502`; Bot bỏ ngữ cảnh xem hiện tại và chạy Pipeline 1 từ đầu. Nếu từ khóa chỉ gồm chữ số và trùng với lệnh `2` hoặc `9`, hãy dùng `.sdt` để tránh bị hiểu là lệnh thao tác.

### Có nhiều khách

```text
Tìm thấy 3 khách:

1. ALT00490 - Công ty ABC - 0984333222
2. ALT00491 - Công ty ABD - 0984333223
3. ALT00502 - Công ty XYZ - 0912345678

Gửi số thứ tự để mở khách. Gõ .help để biết cú pháp tìm chính xác hơn.
Gõ .help để xem cú pháp | .huy để hủy thao tác.
```

State chuyển thành `CHOOSE_CUSTOMER`, chỉ lưu danh sách mã nội bộ tương ứng và thời hạn. Tin `1` lúc này là chọn khách thứ nhất; sau khi chọn, bot trả thông tin khách và trang giao dịch gần nhất như nhánh một kết quả. Nếu gửi một từ khóa khác thay vì số, Bot bỏ danh sách cũ và tìm lại ngay.

### Lựa chọn không hợp lệ

```text
Lựa chọn không hợp lệ. Hãy gửi số đang hiển thị hoặc gửi một từ khóa mới để tìm lại.
Gõ .help để xem cú pháp | .huy để hủy thao tác.
```

State không đổi. Nếu danh sách đã hết hạn hoặc khách vừa bị đánh dấu đã xóa, bot yêu cầu tìm lại từ đầu.

## Pipeline 2: Xem tiếp lịch sử giao dịch

### Đầu vào

Ở trạng thái `VIEW_CUSTOMER`, sau khi đã hiện trang đầu, người dùng gửi `9`.

### Cách bot xử lý

1. Bot đọc lại các dòng `Activity` thuộc `selectedCustomerId`, chỉ lấy `recordStatus = active`.
2. Các dòng được sắp xếp mới trước theo `workDate`, sau đó `createdAt` và mã giao dịch để thứ tự ổn định.
3. Bot dựng trang từ giao dịch cuối trang trước theo thứ tự cũ dần. Mỗi trang cố gắng lấy tối đa 10 giao dịch nhưng dừng sớm khi tổng tin nhắn sắp chạm giới hạn 2.000 ký tự của Zalo; footer cũng tính vào giới hạn này. Vì vậy một trang có thể chỉ có 3, 6 hoặc 10 giao dịch tùy độ dài nội dung.
4. Bot không cắt giữa một giao dịch. Nếu nội dung một giao dịch quá dài, bot rút gọn phần nội dung và ghi rõ `[nội dung đã rút gọn vì giới hạn tin nhắn]`.
5. State lưu điểm cuối `(workDate, activityId)` thay vì lưu cả danh sách, nên tin nhắn thêm giao dịch mới không làm Bot ghi đè dữ liệu cũ.

### Phản hồi khi còn giao dịch

```text
Trang giao dịch cũ hơn của ALT00490: 6 giao dịch (tối đa 10, giới hạn tin Zalo 2.000 ký tự)

11. ACT-000790 | 18/08/2026 | Tư vấn
    Đã trao đổi phạm vi triển khai.
...
16. ACT-000650 | 01/07/2026 | Gọi điện
    Chưa liên hệ được.

Gửi 9 để xem tối đa 10 giao dịch cũ nhất còn lại.
Gửi 2 để thêm giao dịch mới.
Gửi từ khóa mới để tìm khách khác.
Gõ .help để xem cú pháp | .huy để hủy thao tác.
```

Số thứ tự hiển thị tiếp tục tăng theo trang để người dùng dễ theo dõi. `9` lấy tối đa 10 giao dịch cũ nhất còn lại, nhưng số thực tế có thể ít hơn do giới hạn ký tự hoặc vì đã hết dữ liệu. Mã `ACT-...` chỉ là mã giao dịch hiển thị, không phải số dòng sheet.

### Phản hồi khi đã hết

```text
Đã hiển thị hết lịch sử giao dịch của ALT00490.
Gửi 2 để thêm giao dịch mới hoặc gửi từ khóa mới để tìm khách khác.
Gõ .help để xem cú pháp | .huy để hủy thao tác.
```

Bot không có luồng sửa hoặc xóa giao dịch từ màn hình này.

## Pipeline 3: Thêm giao dịch mới

### Bắt đầu

Ở trạng thái `VIEW_CUSTOMER`, người dùng gửi `2`. Bot gắn giao dịch mới vào khách đang xem và chỉ yêu cầu nội dung công việc:

```text
Thêm giao dịch cho ALT00490 - Công ty ABC.
Hãy gửi nội dung công việc bằng một tin nhắn.
Tin nhắn tiếp theo sẽ được lưu ngay.
Gõ .help để xem cú pháp | .huy để hủy thao tác.
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
     Gõ .help để xem cú pháp | .huy để hủy thao tác.
```

Bot gọi cửa ghi chung của ShinCRM với `source = bot`. Cửa ghi kiểm tra giá trị ngầm định, khóa tài liệu, ghi một lần, đọc lại và chỉ báo thành công khi giao dịch thực sự tồn tại. Bot không gọi `setValue` hoặc `appendRow` trực tiếp.

Nếu nội dung rỗng hoặc giá trị ngầm định không hợp lệ, không ghi gì:

```text
Chưa thêm được giao dịch vì nội dung đang trống hoặc cấu hình mặc định chưa hợp lệ.
Hãy gửi lại nội dung sau khi sửa, hoặc .huy để hủy thao tác.
Gõ .help để xem cú pháp | .huy để hủy thao tác.
```

Sau khi ghi thành công, state quay về `VIEW_CUSTOMER`; giao dịch mới được đưa lên đầu trang lịch sử khi Bot đọc lại.

### Đổi khách trong lúc đang chờ nội dung

Trong `ADD_TRANSACTION`, mọi tin không có tiền tố đều là nội dung và sẽ lưu ngay. Nếu muốn tìm khách khác trước khi gửi nội dung, người dùng gửi trực tiếp một lệnh tìm có dấu chấm như `.sdt ...`, `.mst ...`, `.ten ...` hoặc `.mkh ...`; Bot hủy trạng thái chờ rỗng rồi chạy Pipeline 1, không cần gửi `.huy`. Nếu đã gửi nội dung và giao dịch đã lưu thì chỉ cần gửi từ khóa mới như bình thường để mở khách khác.

## Footer bắt buộc

Mọi tin Bot gửi ra, gồm tin thành công, không tìm thấy, lỗi, danh sách nhiều khách và từng trang giao dịch, đều kết thúc bằng footer ngắn:

```text
Gõ .help để xem cú pháp | .huy để hủy thao tác.
```

Footer được tính vào giới hạn 2.000 ký tự của `sendMessage`. Bộ định dạng phải chừa sẵn số ký tự này trước khi thêm khách hoặc giao dịch vào một tin; không được cắt mất footer.

`.huy` chỉ hủy thao tác đang chờ hoặc đóng ngữ cảnh đang xem. Sau khi Bot đã báo ghi thành công, `.huy` không hoàn tác giao dịch.

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
9  Xem tối đa 10 giao dịch cũ nhất còn lại
2  Thêm giao dịch mới
Gửi từ khóa mới để tìm khách khác

.huy  Hủy thao tác hiện tại

Gõ .help để xem cú pháp | .huy để hủy thao tác.
```

### `.huy`

`.huy` luôn có hiệu lực, kể cả khi đang chờ nội dung giao dịch hoặc đang chọn khách:

```text
Đã hủy thao tác. Không có dữ liệu nào được ghi.
Gõ .help để xem cú pháp | .huy để hủy thao tác.
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
Gõ .help để xem cú pháp | .huy để hủy thao tác.
```

6. Worker/GAS gọi Zalo Bot API `sendMessage` để trả kết quả. Nếu API lỗi, người dùng chỉ thấy thông báo thử lại; chi tiết lỗi nằm trong log kỹ thuật.

Google Apps Script không expose HTTP header trong `doPost(e)`, và mỗi lượt thực thi Apps Script có trần 6 phút. Hai giới hạn này không phải thời gian chờ hội thoại: relay phải trả `2xx` nhanh, còn GAS xử lý phía sau trong từng lượt ngắn. Đây là chi tiết hạ tầng, không làm thay đổi việc người dùng chat trực tiếp với Bot.

Zalo có tham số `timeout = 30` giây trong API `getUpdates`, nhưng đó là thời gian chờ của long polling khi phát triển local; bản webhook production này không dùng `getUpdates`, nên không lấy 30 giây làm TTL state hoặc thời gian chờ người dùng.

## Thời gian chờ state

Thời gian chờ state của Bot là 15 phút kể từ tin nhắn cuối cùng. Đây là TTL (thời gian sống) do ta chọn để tránh giữ nhầm khách hoặc bản nháp quá lâu; không phải timeout của Zalo và cũng không phải 6 phút runtime của GAS.

Bot không dùng trigger hoặc tin nhắn hẹn giờ để báo state hết hạn. Cách đó vừa tốn lượt gọi vừa có thể gửi thông báo muộn khi người dùng đã chuyển việc. Khi người dùng gửi tin tiếp theo, Bot dọn state quá hạn theo nguyên tắc:

- Nếu tin là `.sdt`, `.mst`, `.ten`, `.mkh` hoặc một từ khóa tìm tự do trong trạng thái xem khách, Bot coi đó là lượt tìm mới và xử lý ngay.
- Nếu tin là `9` hoặc `2` mà không còn khách đang xem, Bot trả `Phiên thao tác đã hết hạn. Hãy gửi từ khóa mới để tìm khách.` rồi kèm footer.
- Nếu đang ở bước chờ nội dung giao dịch mà state hết hạn, tin văn bản kế tiếp không được tự động ghi vào khách cũ. Bot báo phiên đã hết hạn và yêu cầu tìm lại khách; người dùng không mất dữ liệu nào vì nội dung chưa được nhận.

## Dữ liệu và ranh giới đọc/ghi

- Customer được đọc theo `DATA_SCHEMA` và header hàng 1; không giả định cột A/B/C.
- Phần tìm tự do phải dùng cùng luật với `client/ram/store.html`: `storeHaystack`, `storeSearchTokens` và `Store.searchCustomers`; không viết một bộ tách từ hoặc chuẩn hóa thứ hai chỉ dành cho Bot.
- Tìm `.mkh` đọc trường đồng bộ `fbmCustomerCode`/`@CUS_MA_KH_FBM`; bot không gọi FBM để tìm realtime. Nếu cột này rỗng, `.mkh` không thể tìm ra khách cho tới khi đồng bộ bổ sung dữ liệu.
- Activity nối với khách bằng mã nội bộ `@ACT_MA_KH`, chỉ lấy dòng `active`, sắp xếp mới trước và phân trang theo hai trần: tối đa 10 giao dịch và tối đa 2.000 ký tự mỗi tin sau khi đã chừa footer.
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
| Một kết quả | Tự mở khách và hiện trang giao dịch gần nhất ngay; số giao dịch thực tế tùy độ dài tin, không cam kết luôn là 10. |
| Xem tiếp | Gửi `9` để lấy tối đa 10 giao dịch cũ nhất còn lại; gửi lặp lại cho tới khi hết. |
| Tìm liên tục | Khi đang xem khách/danh sách, gửi từ khóa mới là tìm ngay; không cần `0` hoặc `.huy`. |
| Thêm giao dịch | Gửi `2`, sau đó gửi nội dung; tin nội dung được lưu ngay với các giá trị ngầm định. Không có bước sửa giao dịch đã ghi. |
| Giá trị ngầm định bắt buộc | Đề xuất thêm `Ghi nhận qua Zalo` vào `@CAT_CONG_VIEC` và `Chưa xác định` vào `@CAT_SAN_PHAM`; cần anh duyệt trước khi code. |
| Kênh webhook | Người dùng chat trực tiếp; relay chỉ là lớp nền để kiểm tra secret, xếp hàng và trả `2xx` nhanh trước khi GAS xử lý. |
| Footer | Mọi tin đều chừa footer `.help` và `.huy`; footer được tính trong giới hạn 2.000 ký tự. |
| State | Lưu theo `chat_id`, TTL 15 phút, dọn khi có tin tiếp theo, không gửi tin hết hạn tự động và chống chạy lặp theo `message_id`. |

## Kiểm thử trước khi dùng thật

- Tìm `.sdt`, `.mst`, `.ten`, `.mkh` với 0, 1 và nhiều kết quả; kiểm tra `.mkh` chỉ khớp `@CUS_MA_KH_FBM`.
- Tìm tự do bằng một và nhiều mẩu, cụm trong ngoặc kép, tất cả trường đang cờ `searchable`, và xác nhận thêm cột `searchable` ở sidebar thì Bot tìm được.
- Một khách có 0, 1, 10 và hơn 10 giao dịch với nội dung ngắn/dài; gửi `9` nhiều lần và kiểm tra số dòng thay đổi theo giới hạn 2.000 ký tự, không trùng hoặc bỏ sót trang.
- Thêm giao dịch bằng đúng một tin nội dung, kiểm tra giá trị ngầm định, nội dung rỗng, lỗi cửa ghi và hủy trạng thái chờ bằng `.huy`.
- Đang xem khách gửi từ khóa mới phải tìm ngay; đang chờ nội dung gửi `.sdt`/`.mst`/`.ten`/`.mkh` phải chuyển tìm khách mà không ghi nhầm tin lệnh thành nội dung.
- Người chỉ có quyền đọc không thể thêm giao dịch; người có quyền ghi chỉ ghi được Activity cho khách đã chọn.
- Đổi thứ tự cột Google Sheet vẫn tìm và ghi đúng theo header; khách hoặc giao dịch `deleted` không xuất hiện.
- Webhook thiếu secret, event không phải văn bản, chat nhóm, tin gửi lặp và lỗi Zalo API đều fail closed (đóng an toàn).
- Chỉ thử trên Sheet DEV hoặc tệp trắng; không dùng token thật trong tài liệu và không thử trên dữ liệu khách thật.

## Nguồn đã đối chiếu

- Code cũ trong thư mục này: `Main.txt`, `SearchLogic.txt`, `Formatter.txt`, `ZaloAPI.txt`, `LogService.txt`, `FBMAuth.txt`, `FBMQuery.txt`, `SessionManager.txt`, `Utils.txt`, `Config.txt`, `z_setWebhook.txt`.
- Code hiện tại: `server/data/DataSchema.js`, `fbm_sync/SyncSchema.js`, `server/sheet/EntityRead.js`, `server/sheet/SheetIo.js`, `server/gate/WriteGate.js`, `server/gate/DeleteGate.js`, `server/service/SaveService.js`, `server/util/TextNormalize.js`.
- Tài liệu Zalo Bot đã đọc: [Tài liệu zalobot do chính Zalo phát hành.md](Tài liệu zalobot do chính Zalo phát hành.md), cùng các mục `/docs/BOT`, `/docs/BOT/create_bot`, `/docs/BOT/authorize`, `/docs/BOT/call_api`, `/docs/BOT/apis/getMe`, `/docs/BOT/webhook`, `/docs/BOT/best-practices/build-personal-assistant-with-open-claw`, `/docs/BOT/error_code`.
