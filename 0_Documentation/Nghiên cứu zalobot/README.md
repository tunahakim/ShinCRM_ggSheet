# Zalobot tra cứu ShinCRM (kiến trúc Google Sheet)

Tài liệu này cô đọng kết quả đọc các tệp `.txt` trong thư mục nghiên cứu Zalobot cũ và chuyển chúng sang kiến trúc hiện tại. Bản cũ là một ứng dụng Termux + proxy + FBM; bản mới chỉ nhận câu hỏi từ Zalo và đọc dữ liệu đã có trong Google Sheet ShinCRM.

## Kết luận kiến trúc

```text
Zalo Platform
    -> webhook GAS (doPost)
    -> kiểm tra request, chat_id và lệnh
    -> BotQuery đọc Customer/Activity từ Google Sheet
    -> BotFormatter tạo một hoặc nhiều tin nhắn
    -> Zalo Bot API (sendMessage)
```

Bot là mặt đọc dữ liệu, không phải cửa ghi của ShinCRM. Bot không sửa `Customer`, `Activity`, `Category` hay `Config`; chỉ được ghi log qua cơ chế log dùng chung.

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

## Hành vi trả lời

- `/help`: cú pháp bốn lệnh và ví dụ ngắn.
- Không có kết quả: nêu từ khóa và gợi ý dùng lệnh theo trường cụ thể.
- Một kết quả: mã khách, tên công ty, mã số thuế, điện thoại, người liên hệ; phía dưới là tối đa `BOT_MAX_ACTIVITIES` hoạt động gần đây.
- Nhiều kết quả: hiển thị tối đa `BOT_MAX_RESULTS`, mỗi dòng phải có mã khách và tên; hướng dẫn nhập `/mkh <mã>` để thu hẹp.
- Tin nhắn dài phải tách ở ranh giới khách/hoạt động. Nếu một mục đơn lẻ vượt giới hạn thì cắt phần ghi chú dài và ghi rõ đã rút gọn.

## An toàn và quan sát

- Không đặt bot token, secret webhook, allowlist hoặc dữ liệu xác thực trong tệp `.js` đã commit. Không ghi password, cookie, token hay toàn bộ payload tin nhắn vào `Log`.
- `secret_token` khi đăng ký webhook phải được kiểm tra ở nơi GAS thực sự đọc được (header hoặc payload). Nếu môi trường GAS không cung cấp header đó, không coi việc đăng ký secret là đủ bảo vệ; allowlist vẫn bắt buộc.
- Dùng `LogGate` hiện tại; thêm nguồn `bot` vào danh mục `LOG_TRACE` khi triển khai. Mặc định tắt log chi tiết, chỉ bật tạm trên Sheet DEV.
- Không trả stack trace, tên sheet, chỉ số hàng/cột hoặc thông tin quyền truy cập cho Zalo.
- Giới hạn kích thước từ khóa và số dòng đọc để một tin nhắn không làm vượt thời gian chạy Apps Script. Khi vượt giới hạn, trả thông báo thu hẹp từ khóa thay vì đọc thêm vô hạn.

## Ranh giới tệp dự kiến khi code

- `server/bot/BotEntry.js`: `doPost`, router và handler; không chứa truy vấn sheet.
- `server/bot/BotAccess.js`: đọc allowlist và kiểm tra request; fail closed.
- `server/bot/BotQuery.js`: đọc schema, tìm khách, lấy hoạt động; chỉ đọc.
- `server/bot/BotFormat.js`: định dạng kết quả và tách tin nhắn; không gọi `SpreadsheetApp`.
- `server/bot/ZaloApi.js`: gọi API Zalo và che lỗi; token lấy từ cấu hình bí mật.

Tên tệp chỉ là đề xuất để chuẩn bị code; khi tạo thật phải cập nhật `0_Documentation/Phiên code/Cây thư mục code.md` trong cùng lượt.

## Kiểm thử trước khi dùng thật

- Offline: parser lệnh, chuẩn hóa tìm kiếm, lọc `deleted`, nối Activity, nhánh 0/1/n kết quả và tách tin nhắn 2.000 ký tự.
- Google DEV: đọc đúng mã cột dù đổi thứ tự cột, không trả khách đã xóa, sheet rỗng không lỗi, và không ghi gì ngoài `Log`.
- Webhook: request thiếu trường, event không hỗ trợ, chat ngoài allowlist, lỗi Zalo API và từ khóa chứa ký tự đặc biệt đều phải fail closed.
- Chỉ đăng ký webhook và thử gửi tin sau khi thay token/secret mẫu bằng giá trị bí mật của môi trường DEV; không dùng dữ liệu khách thật trong giai đoạn này.

## Nguồn đã đối chiếu

- Code cũ: `Main.txt`, `SearchLogic.txt`, `Formatter.txt`, `ZaloAPI.txt`, `LogService.txt`, `FBMAuth.txt`, `FBMQuery.txt`, `SessionManager.txt`.
- Code hiện tại: `server/data/DataSchema.js`, `server/data/SheetLayout.js`, `server/sheet/EntityRead.js`, `server/sheet/SheetIo.js`, `server/util/TextNormalize.js`.
