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

Mỗi tin nhắn được hiểu theo trạng thái hiện tại của cuộc trò chuyện. Vì Zalo chỉ gửi văn bản, bot luôn trả lại hướng dẫn chữ và số thứ tự để người dùng gửi tin tiếp theo.

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

Tiền tố dùng dấu chấm, không dùng dấu gạch chéo. Lệnh không phân biệt chữ hoa/chữ thường; bot bỏ khoảng trắng thừa nhưng không tự ý bỏ dấu chấm hoặc gạch trong MST/SĐT nếu chưa có quy tắc kiểm thử tương ứng.

## Trạng thái hội thoại

```text
IDLE
  -> CHOOSE_CUSTOMER       (có nhiều khách trùng từ khóa)
  -> VIEW_CUSTOMER         (đang xem một khách và các giao dịch)
  -> ADD_TRANSACTION       (đang nhập giao dịch mới)
  -> CONFIRM_TRANSACTION   (đang duyệt bản xem trước để ghi)
  -> VIEW_CUSTOMER
```

State được lưu theo `chat_id`, chỉ giữ mã khách nội bộ, mã giao dịch đang xem, bản nháp nhỏ và mốc hết hạn; không lưu cả bản sao hàng dữ liệu. TTL đề xuất là 15 phút. State hết hạn thì bot yêu cầu tìm lại khách.

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
2. Với tin tự do, bot thử các trường tìm kiếm đã cho phép: mã khách FBM, tên công ty, MST, điện thoại, người liên hệ và từ khóa phụ.
3. Bot đọc dữ liệu khách từ Google Sheet theo schema và header hàng 1, không dùng số thứ tự cột cố định. Chỉ hàng có `recordStatus = active` và mã nội bộ `@CUS_MA_KH` mới được đưa vào kết quả.
4. Bot loại trùng theo mã nội bộ ShinCRM. Mã nội bộ chỉ dùng để nối sang `Activity`, không thay cho mã FBM hiển thị.

### Không có kết quả

```text
Không tìm thấy khách với từ khóa: "abc".
Thử .sdt, .mst, .ten hoặc .mkh để thu hẹp tìm kiếm.
```

State vẫn là `IDLE`; không đọc thêm và không ghi dữ liệu.

### Có đúng một khách

Bot tự mở khách ngay, không bắt người dùng gửi thêm `1`. Bot trả thông tin khách và tối đa 10 giao dịch mới nhất trong cùng phản hồi (có thể tách thành nhiều tin nếu vượt giới hạn Zalo):

```text
Khách hàng
Mã khách FBM: ALT00490
Tên công ty: Công ty ABC
Mã số thuế: 0101234567
Điện thoại: 0984333222
Người liên hệ: Nguyễn Văn A

10 giao dịch gần nhất:
1. ACT-000901 | 09/09/2026 | Gọi điện
   Đã trao đổi nhu cầu phần mềm.
2. ACT-000877 | 05/09/2026 | Gửi báo giá
   Đã gửi báo giá lần một.
...
10. ACT-000801 | 20/08/2026 | Chăm sóc
   Đã xác nhận nhu cầu.

Gửi 1 để xem 10 giao dịch cũ hơn.
Gửi 2 để thêm giao dịch mới.
Gửi 0 để tìm khách khác hoặc .huy để kết thúc.
```

State chuyển thành `VIEW_CUSTOMER`, lưu `selectedCustomerId` là mã nội bộ ShinCRM và điểm cuối của trang giao dịch hiện tại. Người dùng không cần biết hoặc nhập mã nội bộ này.

Nếu khách có dưới 10 giao dịch, bot ghi rõ số thực tế. Nếu không có giao dịch:

```text
Khách này chưa có giao dịch nào.
Gửi 2 để thêm giao dịch mới hoặc 0 để tìm khách khác.
```

### Có nhiều khách

```text
Tìm thấy 3 khách:

1. ALT00490 - Công ty ABC - 0984333222
2. ALT00491 - Công ty ABD - 0984333223
3. ALT00502 - Công ty XYZ - 0912345678

Gửi số thứ tự để mở khách. Gửi .mkh <mã FBM> để tìm chính xác hoặc .huy để hủy.
```

State chuyển thành `CHOOSE_CUSTOMER`, chỉ lưu danh sách mã nội bộ tương ứng và thời hạn. Tin `1` lúc này là chọn khách thứ nhất; sau khi chọn, bot trả thông tin khách và 10 giao dịch gần nhất như nhánh một kết quả.

### Lựa chọn không hợp lệ

```text
Lựa chọn không hợp lệ. Hãy gửi số đang hiển thị hoặc mã khách FBM đầy đủ.
```

State không đổi. Nếu danh sách đã hết hạn hoặc khách vừa bị đánh dấu đã xóa, bot yêu cầu tìm lại từ đầu.

## Pipeline 2: Xem tiếp lịch sử giao dịch

### Đầu vào

Ở trạng thái `VIEW_CUSTOMER`, sau khi đã hiện trang đầu, người dùng gửi `1`.

### Cách bot xử lý

1. Bot đọc lại các dòng `Activity` thuộc `selectedCustomerId`, chỉ lấy `recordStatus = active`.
2. Các dòng được sắp xếp mới trước theo `workDate`, sau đó `createdAt` và mã giao dịch để thứ tự ổn định.
3. Bot lấy 10 dòng cũ hơn giao dịch cuối trang trước. State lưu điểm cuối `(workDate, activityId)` thay vì lưu cả danh sách, nên tin nhắn thêm giao dịch mới không làm bot ghi đè dữ liệu cũ.

### Phản hồi khi còn giao dịch

```text
10 giao dịch tiếp theo của ALT00490:

11. ACT-000790 | 18/08/2026 | Tư vấn
    Đã trao đổi phạm vi triển khai.
...
20. ACT-000650 | 01/07/2026 | Gọi điện
    Chưa liên hệ được.

Gửi 1 để xem tiếp 10 giao dịch cũ hơn.
Gửi 2 để thêm giao dịch mới.
Gửi 0 để quay lại tìm khách.
```

Số thứ tự hiển thị tiếp tục tăng theo trang để người dùng dễ theo dõi; mã `ACT-...` chỉ là mã giao dịch hiển thị, không phải số dòng sheet.

### Phản hồi khi đã hết

```text
Đã hiển thị hết lịch sử giao dịch của ALT00490.
Gửi 2 để thêm giao dịch mới hoặc 0 để tìm khách khác.
```

Bot không có luồng sửa hoặc xóa giao dịch từ màn hình này.

## Pipeline 3: Thêm giao dịch mới

### Bắt đầu

Ở trạng thái `VIEW_CUSTOMER`, người dùng gửi `2`. Bot gắn giao dịch mới vào khách đang chọn; người dùng không được tự gửi mã khách khác trong bản nháp.

```text
Thêm giao dịch cho ALT00490 - Công ty ABC.
Các trường có (*) là bắt buộc. Gửi số trường để nhập:

1. Ngày làm việc (*)
2. Công việc (*)
3. Nội dung công việc (*)
4. Sản phẩm (*)
5. Người nhập liệu
6. Giá trị hợp đồng
7. Ưu tiên
8. Hạn xử lý
9. Cho phép đẩy FBM (*)
0. Quay lại

Gửi .huy để hủy thao tác.
```

### Nhập từng trường

Bot chuyển sang `ADD_TRANSACTION`, hỏi giá trị theo trường người dùng chọn. Trường SELECT phải nhận một giá trị có trong danh mục `Category`; ngày nhận `dd/MM/yyyy` hoặc từ khóa `hôm nay`; số tiền nhận định dạng số theo cửa ghi. Trường không bắt buộc có thể gửi `-` để để trống. Trường bắt buộc không được bỏ qua.

Ví dụ:

```text
Người dùng: 1
Bot: Ngày làm việc hiện tại: 09/09/2026. Gửi ngày mới dạng dd/MM/yyyy hoặc - để dùng hôm nay.
Người dùng: 09/09/2026
Bot: Đã nhận ngày làm việc. Chọn trường tiếp theo: 1 ngày, 2 công việc, 3 nội dung, ...

Người dùng: 2
Bot: Chọn công việc: Gọi điện, Gửi báo giá, Họp, ...
Người dùng: Gọi điện
Bot: Đã nhận công việc. Chọn trường tiếp theo.
```

Sau mỗi trường, bot hiển thị danh sách trường và đánh dấu trường đã nhập. Người dùng có thể gửi lại số trường để thay đổi bản nháp trước khi lưu; đây chỉ là sửa bản nháp chưa ghi, không phải sửa giao dịch đã tồn tại.

### Xem trước và xác nhận

Khi đủ bốn trường bắt buộc, người dùng gửi `LƯU`. Bot chưa ghi ngay ở bước nhập cuối mà hiển thị bản xem trước:

```text
Xem trước giao dịch mới cho ALT00490:
Ngày làm việc: 09/09/2026
Công việc: Gọi điện
Nội dung: Đã trao đổi nhu cầu phần mềm.
Sản phẩm: Phần mềm
Người nhập liệu: Nguyễn Văn A
Giá trị hợp đồng: -
Ưu tiên: Bình thường
Hạn xử lý: -
Cho phép đẩy FBM: Chưa cho phép

Gửi LƯU lần nữa để ghi giao dịch.
Gửi ĐỔI để quay lại chọn trường.
Gửi .huy để bỏ bản nháp.
```

Hai lần xác nhận `LƯU` giúp tránh ghi nhầm khi đang chat nhanh. Nếu giá trị sai kiểu, thiếu bắt buộc hoặc không có trong danh mục, bot báo đúng trường lỗi và giữ nguyên bản nháp:

```text
Chưa nhận được giá trị. Trường "Ngày làm việc" cần dạng dd/MM/yyyy.
Bản nháp vẫn còn, hãy gửi lại giá trị hoặc .huy để hủy.
```

### Ghi thành công

Bot gọi cửa ghi chung của ShinCRM với `source = bot`. Cửa ghi tự cấp mã giao dịch, ngày nhập liệu, tình trạng bản ghi và kiểm tra toàn bộ luật required/SELECT/kiểu dữ liệu; bot không gọi `setValue` hoặc `appendRow` trực tiếp.

```text
Đã thêm giao dịch ACT-000901 cho ALT00490 - Công ty ABC.

Gửi 1 để xem 10 giao dịch cũ hơn.
Gửi 2 để thêm giao dịch tiếp theo.
Gửi 0 để tìm khách khác.
```

State quay về `VIEW_CUSTOMER` và điểm đầu lịch sử được đọc lại để giao dịch vừa thêm xuất hiện trong trang mới nhất.

### Ghi thất bại

```text
Chưa thêm được giao dịch: giá trị "Công việc" không có trong danh mục.
Bản nháp vẫn còn, hãy gửi giá trị khác hoặc .huy để hủy.
```

Bot không báo stack trace, tên sheet, số dòng hay chi tiết quyền truy cập. Không có trường hợp ghi nửa chừng được coi là thành công.

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
1  Xem 10 giao dịch cũ hơn
2  Thêm giao dịch mới
0  Tìm khách khác

.huy  Hủy thao tác hiện tại
```

### `.huy`

`.huy` luôn có hiệu lực, kể cả khi đang nhập giao dịch hoặc đang chọn khách:

```text
Đã hủy thao tác. Không có dữ liệu nào được ghi.
```

State bị xóa và trở về `IDLE`.

## Luồng nền: Bot nhận tin nhắn (người dùng không phải thao tác)

Pipeline này chỉ giải thích vì sao tin nhắn chat trực tiếp đến được bot; người dùng không gọi webhook và không nhìn thấy relay.

1. Người dùng gửi văn bản trong cuộc trò chuyện cá nhân với Zalo Bot.
2. Zalo Platform gửi sự kiện `message.text.received` tới địa chỉ webhook đã đăng ký.
3. Lớp nhận tin kiểm tra secret header của Zalo, kích thước body và JSON; GAS kiểm tra thêm khóa nội bộ nếu có relay.
4. Bot kiểm tra `chat_id`, chống xử lý lặp theo `message_id`, lấy state rồi chuyển tin cho router của ba pipeline nghiệp vụ.
5. Ảnh, sticker, voice, nhóm chat hoặc event không hỗ trợ không được đọc/ghi sheet. Bot trả lời ngắn:

```text
Bot hiện chỉ xử lý tin nhắn văn bản trong cuộc trò chuyện cá nhân.
```

6. Bot gọi Zalo Bot API `sendMessage` để trả kết quả. Nếu API lỗi, người dùng chỉ thấy thông báo thử lại; chi tiết lỗi nằm trong log kỹ thuật.

Google Apps Script không expose HTTP header trong `doPost(e)`. Vì vậy, nếu triển khai webhook bằng GAS, cần một relay HTTPS (Cloudflare Worker, Cloud Run hoặc dịch vụ tương đương) kiểm tra `X-Bot-Api-Secret-Token` rồi chuyển event vào GAS bằng khóa nội bộ. Đây là chi tiết hạ tầng, không làm thay đổi việc người dùng chat trực tiếp với Bot.

## Dữ liệu và ranh giới đọc/ghi

- Customer được đọc theo `DATA_SCHEMA` và header hàng 1; không giả định cột A/B/C.
- Tìm `.mkh` đọc trường đồng bộ `fbmCustomerCode`/`@CUS_MA_KH_FBM`; bot không gọi FBM để tìm realtime. Nếu cột này rỗng, `.mkh` không thể tìm ra khách cho tới khi đồng bộ bổ sung dữ liệu.
- Activity nối với khách bằng mã nội bộ `@ACT_MA_KH`, chỉ lấy dòng `active`, sắp xếp mới trước và phân trang 10 dòng.
- Khi thêm Activity, `customerId` được server lấy từ khách đang mở; không tin mã khách do người dùng tự chèn trong nội dung chat.
- Ghi mới đi qua `WriteGate` với nguồn `bot` và dùng toàn bộ kiểm tra giống nguồn người dùng. Bot không sửa cột đồng bộ FBM và không đẩy giao dịch sang FBM trong lúc ghi.
- Allowlist đọc và allowlist ghi tách riêng. Người có quyền đọc nhưng không có quyền ghi vẫn xem được khách và lịch sử nhưng khi gửi `2` sẽ nhận thông báo không có quyền thêm giao dịch.

## Các điểm cần duyệt trước khi code

| Điểm | Đề xuất trong bản này |
| --- | --- |
| Phạm vi nghiệp vụ | Chỉ tìm khách, xem lịch sử và thêm giao dịch; không sửa/xóa khách hoặc giao dịch. |
| Cú pháp | Dùng `.sdt`, `.mst`, `.ten`, `.mkh`, `.help`, `.huy`; không dùng `/`. |
| Mã `.mkh` | Tìm theo `ma_kh` FBM trong `@CUS_MA_KH_FBM`, không tìm theo mã nội bộ Google Sheet. |
| Một kết quả | Tự mở khách và hiện tối đa 10 giao dịch mới nhất ngay. |
| Xem tiếp | Gửi `1` để lấy 10 giao dịch cũ hơn; gửi lặp lại cho tới khi hết. |
| Thêm giao dịch | Gửi `2`, nhập từng trường, xác nhận `LƯU` hai lần; ghi vào `Activity` qua `WriteGate`. |
| Kênh webhook | Người dùng chat trực tiếp; relay chỉ là lớp nền để kiểm tra secret trước khi vào GAS. |
| State | Lưu theo `chat_id`, TTL 15 phút, chống chạy lặp theo `message_id`. |

## Kiểm thử trước khi dùng thật

- Tìm `.sdt`, `.mst`, `.ten`, `.mkh` với 0, 1 và nhiều kết quả; kiểm tra `.mkh` chỉ khớp `@CUS_MA_KH_FBM`.
- Một khách có 0, 1, 10 và hơn 10 giao dịch; gửi `1` nhiều lần và kiểm tra không trùng hoặc bỏ sót trang.
- Thêm giao dịch đủ/thiếu trường bắt buộc, sai ngày, sai số, sai SELECT và hủy bằng `.huy`.
- Người chỉ có quyền đọc không thể thêm giao dịch; người có quyền ghi chỉ ghi được Activity cho khách đã chọn.
- Đổi thứ tự cột Google Sheet vẫn tìm và ghi đúng theo header; khách hoặc giao dịch `deleted` không xuất hiện.
- Webhook thiếu secret, event không phải văn bản, chat nhóm, tin gửi lặp và lỗi Zalo API đều fail closed (đóng an toàn).
- Chỉ thử trên Sheet DEV hoặc tệp trắng; không dùng token thật trong tài liệu và không thử trên dữ liệu khách thật.

## Nguồn đã đối chiếu

- Code cũ trong thư mục này: `Main.txt`, `SearchLogic.txt`, `Formatter.txt`, `ZaloAPI.txt`, `LogService.txt`, `FBMAuth.txt`, `FBMQuery.txt`, `SessionManager.txt`, `Utils.txt`, `Config.txt`, `z_setWebhook.txt`.
- Code hiện tại: `server/data/DataSchema.js`, `fbm_sync/SyncSchema.js`, `server/sheet/EntityRead.js`, `server/sheet/SheetIo.js`, `server/gate/WriteGate.js`, `server/gate/DeleteGate.js`, `server/service/SaveService.js`, `server/util/TextNormalize.js`.
- Tài liệu Zalo Bot đã đọc: [Tài liệu zalobot do chính Zalo phát hành.md](Tài liệu zalobot do chính Zalo phát hành.md), cùng các mục `/docs/BOT`, `/docs/BOT/create_bot`, `/docs/BOT/authorize`, `/docs/BOT/call_api`, `/docs/BOT/apis/getMe`, `/docs/BOT/webhook`, `/docs/BOT/best-practices/build-personal-assistant-with-open-claw`, `/docs/BOT/error_code`.
