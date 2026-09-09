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
