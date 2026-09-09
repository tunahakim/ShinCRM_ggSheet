# Zalobot tra cứu ShinCRM (kiến trúc Google Sheet)

Tài liệu này cô đọng kết quả đọc các tệp `.txt` trong thư mục nghiên cứu Zalobot cũ và chuyển chúng sang kiến trúc hiện tại. Bản cũ là một ứng dụng Termux + proxy + FBM; bản mới dùng Zalo làm giao diện văn bản và Google Sheet ShinCRM làm nguồn dữ liệu. Bot được phép đọc và ghi, nhưng không có mini app, nút inline hay callback như Telegram.

## Kết luận kiến trúc

```text
Zalo Platform
    -> webhook relay (kiểm tra header secret)
    -> GAS doPost (kiểm tra khóa nội bộ của relay)
    -> kiểm tra request, quyền và trạng thái hội thoại theo chat_id
    -> BotQuery đọc Customer/Activity từ Google Sheet
    -> BotFormatter tạo tin nhắn chữ, menu số hoặc bản xem trước
    -> BotWrite gọi WriteGate/DeleteGate khi người dùng xác nhận
    -> Zalo Bot API (sendMessage)
```

Bot không ghi trực tiếp bằng `SpreadsheetApp`. Mọi thay đổi nghiệp vụ phải đi qua cửa ghi chung của ShinCRM để dùng cùng khóa, kiểm tra, cấp mã, định dạng và đọc lại sau khi ghi.

## Những gì giữ lại từ code cũ

- Mô hình `doPost` nhận sự kiện `message.text.received`, bỏ qua hoặc trả lời ngắn với loại tin nhắn không hỗ trợ.
- Command Router: bảng lệnh ánh xạ tới handler, thêm lệnh không phải sửa một chuỗi `if` dài.
- Lệnh tra cứu `/sdt`, `/mst`, `/ten`, `/mkh` và tra cứu tự do khi người dùng không gõ tiền tố.
- Ba nhánh hiển thị: không có kết quả, một kết quả (kèm hoạt động gần đây), nhiều kết quả (danh sách để thu hẹp tiếp).
- Giới hạn số bản ghi và tách tin nhắn theo giới hạn Zalo 2.000 ký tự; không cắt giữa dữ liệu quan trọng nếu có thể tránh.
- `sendMessage`, `sendMessages`, `sendTyping`, `setWebhook` và log lỗi tập trung. Token phải nằm trong Script Properties hoặc vùng triển khai bí mật, không nằm trong mã nguồn.

## Những gì loại bỏ hoàn toàn

| Phần của bản cũ | Lý do không mang sang |
| --- | --- |
| `FBMAuth`, `FBMQuery`, MD5/salt, cookie và `Sessions` | Không còn gọi FBM, không cần đăng nhập theo người dùng và không được lưu mật khẩu/cookie. |
| `callFBMViaProxy`, Cloudflare Tunnel, Termux, `curl` | Không có máy trung gian; GAS đọc trực tiếp Google Sheet. |
| `stt_rec`, mapping chỉ số hàng của FBM, escape dấu `/` | Đây là hợp đồng riêng của API FBM, không tồn tại trong ShinCRM. |
| `/login`, `/logout`, tự đăng nhập lại, scheduler | Không có phiên FBM. Quyền bot dùng allowlist `chat_id`, không dùng mật khẩu gửi qua Zalo. |
| Các token, URL triển khai, tài khoản và mật khẩu xuất hiện trong tệp cũ | Là bí mật đã lộ trong tài liệu; không sao chép. Token cũ cần được thu hồi nếu còn hiệu lực. |

## Hợp đồng dữ liệu hiện tại

Nguồn chuẩn là `1_ShinCRM_GAS/server/data/DataSchema.js`, không phải tên hay vị trí cột viết tay trong bot.

- `Customer`: sheet có ba hàng đầu là phần tiêu đề, dữ liệu bắt đầu từ hàng 4. Đọc theo mã cột ở hàng 1 qua `readColumnMap`; không giả định cột A/B/C.
- Trường tra cứu chính: `id`, `companyName`, `taxNumber`, `phone`, `contactPerson`, `searchAliases`. Chỉ trả bản ghi có `recordStatus = active` và có `id`.
- `Activity`: nối với khách bằng `customerId`; chỉ lấy bản ghi `active` của khách đã chọn, sắp xếp hoạt động mới trước theo `workDate` rồi `createdAt` và giới hạn số dòng.
- Dạng đọc nên tái sử dụng `entityReadAll`/`entityReadRange` để nhận `{ fields, rows }`. Khi dựng object để tìm kiếm, ánh xạ theo tên trong `fields`, không dùng chỉ số cố định.
- Chuẩn hóa từ khóa bằng `normalizeText` hiện tại (bỏ dấu, gộp khoảng trắng, chữ thường). Không tự ý bỏ dấu chấm/gạch của mã số thuế hay số điện thoại nếu chưa có ca kiểm thử chứng minh an toàn; bổ sung chỉ mục chữ số riêng chỉ khi có nhu cầu rõ ràng.

## Luồng xử lý một tin nhắn

1. `doPost` parse JSON, kiểm tra có `event_name`, `message.chat.id` và nội dung hợp lệ; request sai chỉ trả JSON lỗi chung và ghi log kỹ thuật.
2. Kiểm tra quyền trước khi đọc dữ liệu. Bản triển khai đầu tiên mặc định **fail closed**: chỉ `chat_id` trong allowlist mới được tra cứu. Cách lưu allowlist (Config hay Script Properties) cần chốt trước khi code.
3. Router nhận `/help`, `/sdt`, `/mst`, `/ten`, `/mkh`; mọi văn bản khác là tìm tự do. Không còn nhánh đăng nhập FBM.
4. `BotQuery` đọc `Customer` một lần, lọc theo các trường tra cứu và loại trùng theo `id`. Với đúng một khách, đọc `Activity` và lọc theo `customerId`.
5. `BotFormatter` tạo tin nhắn thuần văn bản, giới hạn số khách/hoạt động theo cấu hình. Dữ liệu rỗng hiển thị bằng nhãn dễ hiểu; không đưa mã cột `@...` vào tin nhắn.
6. Gửi từng tin qua Zalo API. Lỗi API không làm lộ chi tiết kỹ thuật cho người dùng; ghi `source = bot` và trả thông báo thử lại.

## Hội thoại văn bản nhiều bước

Webhook không giữ được biến giữa hai tin nhắn, nên cần `BotState` lưu theo `chat_id` trong `PropertiesService` (kèm `LockService`), hoặc một sheet trạng thái riêng nếu sau này cần xem thủ công. Không lưu cả bản sao khách; chỉ lưu mã và bản nháp nhỏ.

Trạng thái tối thiểu:

```text
IDLE
  -> CHOOSE_CUSTOMER      (đang có danh sách ứng viên)
  -> VIEW_CUSTOMER        (đang xem một khách)
  -> CHOOSE_FIELD         (đang chọn trường cần sửa)
  -> ENTER_VALUE          (đang chờ giá trị mới)
  -> CONFIRM_SAVE         (đang chờ LƯU hoặc HỦY)
  -> IDLE
```

State gồm `chatId`, `mode`, danh sách `candidateIds`, `selectedId`, `entity`, `field`, `draft`, dấu vân tay bản ghi lúc mở, `updatedAt` và thời điểm hết hạn. TTL đề xuất 15 phút; hết hạn thì xóa state và yêu cầu tìm lại.

Ví dụ luồng sửa khách:

1. Người dùng gửi `Nguyễn Ánh`. Bot trả danh sách hoặc một khách, mỗi lựa chọn có số thứ tự và mã khách.
2. Người dùng gửi `1`. Router hiểu đây là chọn ứng viên vì state đang là `CHOOSE_CUSTOMER`, không hiểu là một truy vấn số.
3. Bot trả chi tiết và menu chữ: `Sửa: 1 Tên công ty, 2 MST, 3 Điện thoại, 0 Hủy`.
4. Người dùng gửi `3`; bot chuyển sang `ENTER_VALUE` và chỉ rõ đang chờ số điện thoại mới.
5. Người dùng gửi giá trị mới; bot hiển thị bản xem trước `cũ -> mới` và yêu cầu gõ chính xác `LƯU` hoặc `HỦY`.
6. Khi nhận `LƯU`, bot đọc lại bản ghi theo `selectedId`, kiểm tra bản ghi chưa bị xóa và phát hiện nếu người khác vừa sửa. Sau đó gửi bản ghi một phần theo tên trường tới `writeGateSave` với nguồn `bot`.
7. Chỉ khi cửa ghi trả `ok: true` và dòng đọc lại thành công thì bot mới báo đã lưu, xóa state và hiển thị dữ liệu mới. Lỗi kiểm tra giữ bản nháp để người dùng sửa lại.

Số thứ tự chỉ có nghĩa trong state hiện tại. Tin `1` ở `IDLE` là từ khóa tìm kiếm; tin `1` ở `CHOOSE_FIELD` là tên trường. `/huy` luôn xóa state và không ghi gì. Không dùng Markdown button, `callback_query`, URL mini app hoặc giả định người dùng có thể gửi loại sự kiện khác văn bản.

## Ghi qua cửa chung

- Mở rộng `WRITE_GATE_SOURCES` thêm `bot`. Nguồn `bot` dùng đúng các kiểm tra của nguồn `user` (`required`, `unique`, `validate`, SELECT, kiểu dữ liệu), không được là đường tắt.
- `writeGateBuild` phải coi `bot` là nguồn người dùng khi kiểm tra giá trị; log vẫn ghi nguồn thật là `bot`.
- `BotWriteService` gọi `runEntryPoint(..., 'bot', ...)`, dựng `{ entity, records: [record], source: 'bot' }` và gọi `writeGateSave`. Không gọi `setValue`, `appendRow` hay sửa `recordStatus` trực tiếp.
- Khi sửa, bản ghi gửi lên chỉ gồm `id` và trường người dùng vừa xác nhận. Cửa ghi đọc hàng hiện tại và giữ nguyên mọi trường không gửi.
- Khi thêm hoạt động, `customerId` phải lấy từ `selectedId` đã xác minh ở server, không nhận mã khách tùy ý từ tin nhắn. Chức năng thêm mới nên làm sau khi luồng sửa đã ổn định.
- Xóa chỉ triển khai sau; nếu có thì phải là lệnh riêng, xem trước, yêu cầu xác nhận lần hai và gọi `deleteRecords`/`DeleteGate`, không xóa dòng trực tiếp.

## Quy ước hội thoại

Đây là giao diện chữ nên mỗi tin nhắn chỉ có một ý nghĩa theo trạng thái hiện tại. Người dùng luôn có thể gửi `/huy` để bỏ bản nháp và `/help` để xem lại cách dùng. Bot không chờ nút bấm, không nhận `callback_query` và không mở mini app.

| Trạng thái | Số được hiểu là |
| --- | --- |
| `IDLE` | Từ khóa tìm kiếm, không phải lựa chọn. |
| `CHOOSE_CUSTOMER` | Số thứ tự khách trong danh sách hiện tại, hoặc mã khách đầy đủ. |
| `VIEW_CUSTOMER` | Lệnh trong menu khách: sửa, thêm hoạt động, xem hoạt động, xóa. |
| `CHOOSE_FIELD` | Số thứ tự trường cần sửa. |
| `ENTER_VALUE` | Giá trị mới của trường vừa chọn. |
| `CONFIRM_SAVE` | Chỉ `LƯU`, `HỦY` hoặc `ĐỔI`. |
| `LIST_ACTIVITY` | Số thứ tự hoạt động hiện tại. |
| `VIEW_ACTIVITY` | Sửa hoặc xóa hoạt động. |

State phải lưu `message_id` cuối đã xử lý để webhook gửi lặp không ghi hai lần. Mỗi state có `expiresAt` (đề xuất 15 phút); state quá hạn bị xóa và bot yêu cầu tìm lại.

## Pipeline 1: Nhận và xác thực tin

**Đầu vào:** Zalo gửi POST JSON có `result.event_name`, `result.message.from`, `result.message.chat`, `message.text`, `message_id`, `date` và header `X-Bot-Api-Secret-Token`.

1. Relay kiểm tra HTTPS, header secret và kích thước body. Sai secret trả HTTP 403, không chuyển tiếp.
2. Relay bọc event hợp lệ trong envelope có khóa nội bộ ở body rồi POST tới GAS. GAS kiểm tra khóa đó trước khi lấy event.
3. GAS bỏ qua `message_id` đã xử lý, từ chối `chat_type = GROUP` ở bản đầu và kiểm tra `chat_id` trong allowlist đọc/ghi.
4. Chỉ `message.text.received` đi vào router. Ảnh, sticker, voice và event không hỗ trợ không được đọc sheet.

**Phản hồi:**

```text
Chat ngoài allowlist:
Bạn chưa được cấp quyền sử dụng ShinCRM Bot.

Chat nhóm:
ShinCRM Bot hiện chỉ hoạt động trong cuộc trò chuyện cá nhân.

Tin ảnh/voice/sticker:
Bot hiện chỉ xử lý tin nhắn văn bản.
```

Request sai secret không trả tin nhắn Zalo; relay trả HTTP 403. Request đúng secret nhưng JSON sai chỉ ghi log lỗi và trả JSON lỗi chung, không để webhook tự lặp vô hạn.

## Pipeline 2: Trợ giúp và hủy

**Đầu vào:** `/help` ở bất kỳ trạng thái nào. Bot không đổi state hiện tại.

**Phản hồi đề xuất:**

```text
ShinCRM Bot

TRA CỨU
/sdt <số điện thoại>
/mst <mã số thuế>
/ten <tên công ty>
/mkh <mã khách>
Hoặc gửi trực tiếp từ khóa.

THAO TÁC
1  Chọn mục theo số bot hiển thị
/them khach  Tạo khách mới
/huy         Hủy thao tác hiện tại
LƯU          Xác nhận ghi khi bot yêu cầu
```

**Đầu vào:** `/huy`.

**Phản hồi:** `Đã hủy thao tác. Dữ liệu nháp chưa được ghi.` State chuyển về `IDLE`, không gọi cửa ghi.

## Pipeline 3: Tìm khách

**Đầu vào ở `IDLE`:** văn bản tự do, `/sdt ...`, `/mst ...`, `/ten ...` hoặc `/mkh ...`.

1. Router tách tiền tố và từ khóa; từ khóa rỗng trả hướng dẫn, không đọc sheet.
2. `BotQuery` đọc `Customer` theo `DATA_SCHEMA`, ánh xạ cột bằng hàng 1, chuẩn hóa bằng `normalizeText`, bỏ `recordStatus = deleted` và bỏ hàng không có `id`.
3. Tìm chứa trong các trường được phép. Lệnh có tiền tố chỉ tìm đúng trường; tìm tự do dùng thứ tự ưu tiên theo loại từ khóa rồi loại trùng theo `id`.
4. Giới hạn số ứng viên. Không tự động mở khách chỉ vì có đúng một kết quả; luôn yêu cầu người dùng gửi số `1`.

**Không có kết quả:**

```text
Không tìm thấy khách với từ khóa: "abc".
Thử /sdt, /mst, /ten hoặc /mkh để thu hẹp tìm kiếm.
```

State vẫn là `IDLE`.

**Có đúng một kết quả:**

```text
Tìm thấy 1 khách:

1. KH000123 - Công ty ABC
   MST: 0101234567 | SĐT: 0901234567

Gửi 1 để mở khách này hoặc /huy để hủy.
```

State chuyển thành `CHOOSE_CUSTOMER`, lưu `candidateIds = [KH000123]` và dấu vân tay bản ghi.

**Có nhiều kết quả:**

```text
Tìm thấy 8 khách, hiển thị 8:

1. KH000123 - Công ty ABC - 0901234567
2. KH000124 - Công ty ABD - 0901234568
...

Gửi số thứ tự hoặc mã khách để mở. Gửi /huy để hủy.
```

State chuyển thành `CHOOSE_CUSTOMER`, chỉ lưu mã khách và thời hạn, không lưu cả hàng dữ liệu.

## Pipeline 4: Chọn và xem khách

**Đầu vào ở `CHOOSE_CUSTOMER`:** số thứ tự hoặc mã khách trong danh sách.

- Hợp lệ: server kiểm tra mã vẫn tồn tại và `active`, đọc lại bản ghi theo mã, rồi chuyển `VIEW_CUSTOMER`.
- Không hợp lệ: `Lựa chọn không hợp lệ. Hãy gửi số trong danh sách hoặc mã khách đầy đủ.` State không đổi.
- State hết hạn hoặc mã đã bị xóa: `Danh sách đã hết hạn hoặc khách vừa thay đổi. Hãy tìm lại từ đầu.` rồi xóa state.

**Phản hồi xem khách:**

```text
KH000123 - Công ty ABC
Mã số thuế: 0101234567
Điện thoại: 0901234567
Email: abc@example.com
Địa chỉ: Hà Nội
Người liên hệ: Nguyễn Văn A
Nhóm khách: Doanh nghiệp
Sản phẩm: Phần mềm
Nguồn khách: Giới thiệu
Xác thực: Đã xác thực
Ghi chú: ...

Chọn thao tác:
1. Sửa thông tin khách
2. Thêm hoạt động
3. Xem hoạt động
4. Xóa khách
0. Quay lại danh sách
```

State là `VIEW_CUSTOMER`, giữ `selectedId = KH000123` và dấu vân tay đọc lại.

## Pipeline 5: Sửa khách

**Đầu vào ở `VIEW_CUSTOMER`:** `1`.

**Phản hồi:** bot hiển thị menu trường theo tên, không hiển thị mã `@...`:

```text
Sửa khách KH000123. Gửi số trường:
1 Tên công ty (*)       2 Mã số thuế
3 Điện thoại             4 Email
5 Địa chỉ                6 Tỉnh thành
7 Website                8 Người liên hệ
9 Công ty mẹ             10 Nhóm khách
11 Sản phẩm              12 Nguồn khách (*)
13 Xác thực (*)          14 Ngày đóng thầu
15 Ghi chú               16 Từ khóa tìm kiếm
17 Cho phép đẩy FBM (*)  0 Quay lại
```

State chuyển thành `CHOOSE_FIELD`.

**Đầu vào ở `CHOOSE_FIELD`:** ví dụ `3`.

**Phản hồi:** `Điện thoại hiện tại: 0901234567. Gửi số điện thoại mới, hoặc /huy để bỏ.` State chuyển thành `ENTER_VALUE` với `field = phone`.

**Đầu vào ở `ENTER_VALUE`:** giá trị mới.

- Nếu sai kiểu ngày/số, thiếu giá trị bắt buộc hoặc SELECT không thuộc `Category`, bot trả lý do và giữ nguyên `ENTER_VALUE`.
- Nếu hợp lệ, bot không ghi ngay mà chuyển `CONFIRM_SAVE`.

**Phản hồi xem trước:**

```text
Xem trước thay đổi KH000123:
Điện thoại: 0901234567 -> 0987654321

Gửi LƯU để ghi, ĐỔI để chọn trường khác, hoặc HỦY để bỏ bản nháp.
```

**Đầu vào ở `CONFIRM_SAVE`:** `LƯU`.

1. Bot đọc lại `selectedId`, kiểm tra bản ghi còn `active` và so sánh dấu vân tay. Nếu người khác vừa sửa cùng trường, bot dừng và yêu cầu tìm lại.
2. `BotWriteService` gửi `{ id: 'KH000123', phone: '0987654321' }` tới `writeGateSave` với `source = 'bot'`.
3. `WriteGate` khóa tài liệu, kiểm tra, ghi đúng cột, `flush`, đọc lại và trả bản ghi đầy đủ.

**Phản hồi thành công:**

```text
Đã lưu khách KH000123.
Điện thoại hiện tại: 0987654321
Gửi 1 để sửa tiếp, 2 để thêm hoạt động, 3 để xem hoạt động, hoặc /huy.
```

State về `VIEW_CUSTOMER`; bản nháp bị xóa.

**Phản hồi lỗi:** `Chưa lưu được: [lý do dễ hiểu]. Bản nháp vẫn còn, gửi giá trị khác hoặc HỦY.` Không báo stack trace và không ghi nửa chừng.

## Pipeline 6: Thêm khách mới

**Đầu vào ở `IDLE`:** `/them khach`.

**Phản hồi:**

```text
Tạo khách mới. Các trường có (*) là bắt buộc.
Gửi số trường để nhập:
1 Tên công ty (*)  2 Mã số thuế  3 Điện thoại  4 Email
5 Địa chỉ          6 Tỉnh thành  7 Website     8 Người liên hệ
9 Công ty mẹ       10 Nhóm khách 11 Sản phẩm   12 Nguồn khách (*)
13 Xác thực (*)     14 Ngày đóng thầu 15 Ghi chú 16 Từ khóa tìm kiếm
17 Cho phép đẩy FBM (*)

Khi đủ trường bắt buộc, gửi LƯU để xem trước và ghi. Gửi /huy để bỏ.
```

State là `CHOOSE_FIELD` với `entity = customer`, `isNew = true`, bản nháp có `id = ''`. Mỗi trường nhập xong quay lại menu và hiển thị dấu `đã nhập`. `-` nghĩa là để trống ở trường không bắt buộc; không cho bỏ qua trường bắt buộc.

Khi nhận `LƯU`, bot gửi bản nháp qua `writeGateSave`. Cửa ghi tự cấp `id`, `createdAt`, `recordStatus = active`, kiểm tra required/unique/SELECT và trả dòng đọc lại.

**Phản hồi thành công:**

```text
Đã tạo khách KH000456 - Công ty XYZ.
Gửi 1 để xem/sửa khách, 2 để thêm hoạt động, hoặc /huy.
```

Nếu thiếu hoặc sai trường, bot liệt kê đúng trường cần sửa; không cấp mã trước khi mọi kiểm tra đạt.

## Pipeline 7: Xem hoạt động của khách

**Đầu vào ở `VIEW_CUSTOMER`:** `3`.

Bot đọc `Activity`, lọc `customerId = selectedId` và `recordStatus = active`, sắp xếp `workDate`/`createdAt` mới trước, rồi trả:

```text
Hoạt động của KH000123 (3):

1. ACT000901 | 09/09/2026 | Gọi điện
   Đã trao đổi nhu cầu phần mềm...
2. ACT000877 | 05/09/2026 | Gửi báo giá
   ...
3. ACT000860 | 01/09/2026 | Chăm sóc
   ...

Gửi số để mở hoạt động, 0 để quay lại khách.
```

State là `LIST_ACTIVITY`, lưu danh sách `activityIds`. Không tìm hoạt động theo số dòng sheet.

**Không có hoạt động:** `Khách KH000123 chưa có hoạt động nào. Gửi 2 để thêm hoạt động hoặc 0 để quay lại.`

## Pipeline 8: Thêm hoạt động

**Đầu vào ở `VIEW_CUSTOMER`:** `2`.

Bot tạo bản nháp `entity = activity`, gắn `customerId` từ state server và hiển thị:

```text
Thêm hoạt động cho KH000123. Chọn trường:
1 Ngày làm việc (*)  2 Công việc (*)  3 Nội dung (*)
4 Sản phẩm (*)       5 Người nhập liệu 6 Giá trị hợp đồng
7 Ưu tiên            8 Hạn xử lý      9 Cho phép đẩy FBM (*)
0 Quay lại
```

Mỗi trường đi qua `CHOOSE_FIELD` -> `ENTER_VALUE`. Ngày dùng dạng `dd/MM/yyyy` hoặc `dd/MM/yyyy HH:mm` theo precision; số dùng khuôn số của cửa ghi; SELECT chỉ nhận giá trị có trong `Category`.

Khi đủ trường bắt buộc, bot trả xem trước:

```text
Hoạt động mới của KH000123:
Ngày: 09/09/2026
Công việc: Gọi điện
Nội dung: Đã trao đổi nhu cầu phần mềm
Sản phẩm: Phần mềm

Gửi LƯU để ghi hoặc HỦY để bỏ.
```

`BotWriteService` gửi `customerId` do server gắn, không nhận mã khách mới từ tin nhắn. `WriteGate` tự cấp `id`, `createdAt`, đặt `recordStatus = active` và trả lại hoạt động đã ghi.

**Phản hồi thành công:** `Đã lưu hoạt động ACT000901 cho KH000123.` State về `VIEW_CUSTOMER`.

## Pipeline 9: Chọn và sửa hoạt động

**Đầu vào ở `LIST_ACTIVITY`:** số thứ tự hoạt động.

Bot đọc lại theo `activityId` và trả:

```text
ACT000901 - KH000123
Ngày làm việc: 09/09/2026
Công việc: Gọi điện
Nội dung: Đã trao đổi nhu cầu phần mềm
Sản phẩm: Phần mềm
Người nhập liệu: Nguyễn Văn A

1. Sửa hoạt động
2. Xóa hoạt động
0. Quay lại danh sách
```

**Đầu vào:** `1` chuyển sang menu trường của Activity (`workDate`, `taskType`, `content`, `product`, `enteredBy`, `contractValue`, `priority`, `dueAt`, `allowFbmPush`), sau đó dùng cùng chuỗi `CHOOSE_FIELD` -> `ENTER_VALUE` -> `CONFIRM_SAVE` như sửa khách. Bản ghi gửi tới cửa ghi chỉ gồm `id` và trường đã đổi; `customerId` không cho người dùng sửa.

## Pipeline 10: Xóa có xác nhận

**Đầu vào ở `VIEW_CUSTOMER`:** `4`. Bot cảnh báo trước:

```text
Bạn sắp xóa khách KH000123 - Công ty ABC.
Hoạt động của khách không tự động bị xóa liên đới.
Để tiếp tục, gõ chính xác: XÓA KH000123
Gõ HỦY để bỏ.
```

Đúng câu xác nhận mới gọi `deleteRecords('customer', ['KH000123'])`/`DeleteGate`. Không hỗ trợ xóa hàng loạt từ Zalo. Phản hồi tùy kết quả cửa xóa:

- Xóa được: `Đã xóa khách KH000123.`
- Chỉ xóa mềm: `Khách KH000123 đã được đánh dấu đã xóa; không xóa hẳn vì còn ràng buộc.`
- Mã biến mất hoặc lỗi khóa: `Chưa xóa được. Hãy tìm lại khách rồi thử lại.`

**Đầu vào ở `VIEW_ACTIVITY`:** `2`. Bot yêu cầu `XÓA ACT000901`, rồi gọi `DeleteGate` cho đúng một hoạt động. Không có hoàn tác qua Zalo ở bản đầu; muốn phục hồi dùng công cụ quản trị đã có của ShinCRM.

## Pipeline 11: Lỗi, hết hạn và gửi lặp

| Tình huống | Bot trả về | Hành động dữ liệu |
| --- | --- | --- |
| Tin không hiểu trong menu | `Mình chưa hiểu lựa chọn. Gửi số đang hiển thị hoặc /huy.` | Không đọc/ghi thêm. |
| State hết hạn | `Phiên thao tác đã hết hạn. Hãy tìm lại khách từ đầu.` | Xóa state. |
| Bản ghi vừa bị người khác sửa | `Dữ liệu đã thay đổi trong lúc bạn nhập. Hãy tìm lại rồi sửa tiếp.` | Không ghi. |
| WriteGate báo sai trường | `Chưa lưu được: ...` | Không ghi hoặc ghi nửa chừng; giữ bản nháp. |
| Document lock bận | `ShinCRM đang có người lưu. Vui lòng thử lại sau.` | Không ghi. |
| Zalo API lỗi `ok = false` | `Bot chưa gửi được phản hồi. Vui lòng thử lại.` | Log `description/error_code`, không lộ chi tiết. |
| Cùng `message_id` gửi lại | Không gửi thêm tin và không chạy lại lệnh. | Idempotent (chống ghi lặp). |

## Các điểm cần duyệt trước khi code

| Điểm | Đề xuất an toàn hiện tại |
| --- | --- |
| Webhook | Dùng relay kiểm tra `X-Bot-Api-Secret-Token`, rồi chuyển envelope vào GAS. |
| Quyền | Allowlist đọc và allowlist ghi tách nhau; ngoài danh sách ghi thì chỉ tra cứu. |
| State | `PropertiesService` + `LockService`, lưu mã/bản nháp nhỏ, TTL 15 phút. |
| Ghi khách | Cho sửa trường và thêm khách mới qua `WriteGate`, không ghi trực tiếp. |
| Ghi hoạt động | Cho thêm/sửa một hoạt động đã gắn khách; mã khách chỉ do server lấy từ state. |
| Xóa | Một bản ghi mỗi lần, xác nhận bằng câu `XÓA <loại> <mã>`, gọi `DeleteGate`; chưa có hoàn tác qua bot. |
| Nhóm chat | Từ chối `GROUP` ở bản đầu để tránh lộ dữ liệu và nhầm người thao tác. |

## Hành vi trả lời

- `/help`: cú pháp bốn lệnh và ví dụ ngắn.
- Không có kết quả: nêu từ khóa và gợi ý dùng lệnh theo trường cụ thể.
- Một kết quả: mã khách, tên công ty, mã số thuế, điện thoại, người liên hệ; phía dưới là tối đa `BOT_MAX_ACTIVITIES` hoạt động gần đây.
- Nhiều kết quả: hiển thị tối đa `BOT_MAX_RESULTS`, mỗi dòng phải có mã khách và tên; hướng dẫn nhập `/mkh <mã>` để thu hẹp.
- Tin nhắn dài phải tách ở ranh giới khách/hoạt động. Nếu một mục đơn lẻ vượt giới hạn thì cắt phần ghi chú dài và ghi rõ đã rút gọn.

## Kết nối Zalo theo tài liệu chính thức

- Mọi API gọi tới `https://bot-api.zaloplatforms.com/bot${BOT_TOKEN}/${functionName}` qua HTTPS. `getMe` dùng kiểm tra token; tên phương thức phân biệt hoa thường.
- API hỗ trợ GET và POST cùng các dạng tham số query string, form, JSON và multipart. Dùng GET cho truy xuất, POST cho gửi/cập nhật; bot của ta gửi `sendMessage` bằng POST JSON.
- Mọi phản hồi là JSON gồm `ok`, `result`, `description`, `error_code`. `ok = false` phải được ghi log và chuyển thành câu lỗi chung.
- Webhook là POST JSON với header `X-Bot-Api-Secret-Token`. Phải so sánh chính xác header này trước khi parse và xử lý `result`; thiếu hoặc sai trả HTTP 403.
- Các sự kiện tối thiểu cần xử lý là `message.text.received`; các sự kiện ảnh/sticker/không hỗ trợ chỉ trả lời rằng bot nhận văn bản.

## Điểm chặn khi dùng GAS làm webhook

Event object của web app Google Apps Script có `postData`, `parameter` và `queryString`, nhưng không expose (công khai) HTTP request headers. Vì vậy `doPost(e)` không thể tự đọc `X-Bot-Api-Secret-Token` mà Zalo bắt buộc gửi; gọi Zalo thẳng vào URL `/exec` sẽ không đáp ứng được xác thực chính thức.

Phương án an toàn tạm thời là một webhook relay (Cloudflare Worker, Cloud Run hoặc dịch vụ HTTPS tương đương):

1. Relay nhận POST từ Zalo, kiểm tra chính xác `X-Bot-Api-Secret-Token`, sai thì trả 403.
2. Relay chỉ chuyển tiếp JSON hợp lệ tới GAS trong một envelope (gói bọc) có khóa nội bộ mới ở body; khóa này được so sánh trước khi lấy event bên trong, không đưa lên URL.
3. GAS kiểm tra khóa nội bộ, sau đó mới chạy state, query và WriteGate. URL GAS không đăng ký trực tiếp với Zalo.

Không dùng secret Zalo trong query string và không coi URL khó đoán là thay thế cho header. Nền tảng relay là quyết định hạ tầng cần chốt trước khi viết `BotEntry`; phần nghiệp vụ bot vẫn chỉ đọc/ghi Google Sheet.

## An toàn và quan sát

- Không đặt bot token, secret webhook, allowlist hoặc dữ liệu xác thực trong tệp `.js` đã commit. Không ghi password, cookie, token hay toàn bộ payload tin nhắn vào `Log`.
- `X-Bot-Api-Secret-Token` phải được kiểm tra trước khi xử lý theo đúng tài liệu Zalo. Nếu `doPost(e)` của GAS không đọc được header trong triển khai thực tế, phải chặn triển khai và dùng một lớp nhận webhook có thể kiểm tra header; không hạ xuống chỉ dựa vào URL `/exec`.
- Dùng `LogGate` hiện tại; thêm nguồn `bot` vào danh mục `LOG_TRACE` khi triển khai. Mặc định tắt log chi tiết, chỉ bật tạm trên Sheet DEV.
- Không trả stack trace, tên sheet, chỉ số hàng/cột hoặc thông tin quyền truy cập cho Zalo.
- Giới hạn kích thước từ khóa và số dòng đọc để một tin nhắn không làm vượt thời gian chạy Apps Script. Khi vượt giới hạn, trả thông báo thu hẹp từ khóa thay vì đọc thêm vô hạn.

## Ranh giới tệp dự kiến khi code

- `server/bot/BotEntry.js`: `doPost`, router và handler; không chứa truy vấn sheet.
- `server/bot/BotAccess.js`: đọc allowlist và kiểm tra request; fail closed.
- `server/bot/BotState.js`: lưu trạng thái hội thoại theo `chat_id`, TTL, khóa và chống xử lý lặp.
- `server/bot/BotQuery.js`: đọc schema, tìm khách, lấy hoạt động và đọc lại bản ghi; chỉ đọc.
- `server/bot/BotFormat.js`: định dạng kết quả và tách tin nhắn; không gọi `SpreadsheetApp`.
- `server/bot/BotWriteService.js`: chuyển bản nháp đã xác nhận sang `WriteGate`/`DeleteGate`.
- `server/bot/ZaloApi.js`: gọi API Zalo và che lỗi; token lấy từ cấu hình bí mật.

Tên tệp chỉ là đề xuất để chuẩn bị code; khi tạo thật phải cập nhật `0_Documentation/Phiên code/Cây thư mục code.md` trong cùng lượt.

## Kiểm thử trước khi dùng thật

- Offline: parser lệnh, state transition, hết hạn, `/huy`, tin số trong từng trạng thái, ứng viên cũ, tin gửi lặp, chuẩn hóa tìm kiếm và nhánh 0/1/n.
- Offline cửa ghi: `bot` không bypass kiểm tra, bản ghi một phần không xóa trường khác, giá trị sai không ghi, và mã khách không thuộc state bị từ chối.
- Google DEV: đổi thứ tự cột vẫn đọc/ghi đúng, khách `deleted` không xuất hiện, sheet rỗng không lỗi, ghi xong đọc lại đúng và chỉ có dữ liệu dự kiến cùng `Log` thay đổi.
- Webhook: request thiếu trường, event không hỗ trợ, chat ngoài allowlist, không có quyền ghi, lỗi Zalo API và từ khóa chứa ký tự đặc biệt đều fail closed.
- Chỉ đăng ký webhook và thử gửi tin sau khi thay token/secret mẫu bằng giá trị bí mật của môi trường DEV; không dùng dữ liệu khách thật trong giai đoạn này.

## Nguồn đã đối chiếu

- Code cũ: `Main.txt`, `SearchLogic.txt`, `Formatter.txt`, `ZaloAPI.txt`, `LogService.txt`, `FBMAuth.txt`, `FBMQuery.txt`, `SessionManager.txt`.
- Code hiện tại: `server/data/DataSchema.js`, `server/data/SheetLayout.js`, `server/sheet/EntityRead.js`, `server/sheet/SheetIo.js`, `server/gate/WriteGate.js`, `server/gate/DeleteGate.js`, `server/service/SaveService.js`, `server/util/TextNormalize.js`.
