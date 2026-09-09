# Zalo Bot

*Xây dựng tác nhân hội thoại thông minh cho Zalo*  
*Stable v2.5.0* | *AI Powered*

---

## Tổng quan

Zalo Bot là nền tảng mạnh mẽ giúp bạn xây dựng các tác nhân hội thoại thông minh có thể tương tác với hàng triệu người dùng Zalo. Với xử lý ngôn ngữ tự nhiên tích hợp, hỗ trợ media phong phú và tích hợp liền mạch với hệ sinh thái Zalo, bạn có thể tạo trải nghiệm bot hấp dẫn cho dịch vụ khách hàng, e-commerce, giải trí và nhiều hơn nữa.

* **Thiết lập nhanh:** Khởi chạy bot trong vài phút với SDK trực quan và tài liệu toàn diện.
* **AI Powered:** Tận dụng NLP nâng cao để hiểu ý định người dùng và cung cấp phản hồi thông minh.
* **Mở rộng dễ dàng:** Xử lý hàng triệu cuộc hội thoại đồng thời với hạ tầng mạnh mẽ.

### Tính năng chính

* **Hiểu ngôn ngữ tự nhiên:** NLP engine tích hợp để phân tích tin nhắn người dùng và trích xuất ý định.
* **Template tin nhắn phong phú:** Gửi văn bản, hình ảnh, video, nút bấm, carousel và nhiều hơn nữa.
* **Phần tử tương tác:** Quick reply, nút bấm và form cho tương tác người dùng liền mạch.
* **Tích hợp Webhook:** Thông báo sự kiện thời gian thực cho tin nhắn đến và hành động người dùng.
* **Quản lý ngữ cảnh người dùng:** Theo dõi trạng thái cuộc hội thoại và tùy chọn người dùng.

---

## Bắt đầu

### 1. Tạo Zalo Bot
Đầu tiên, tạo bot trong Zalo Bot Creator:
* Mở ứng dụng Zalo, tìm OA "Zalo Bot Manager"
* Chọn "Tạo bot" trong menu chat để mở "Zalo Bot Creator"
* Nhập tên bot (bắt đầu bằng tiền tố Bot) và thông tin cần thiết
* Nhận "Bot Token" gửi qua tin nhắn Zalo cho bạn

### 2. Cài đặt SDK
Cài đặt Zalo Bot SDK cho ngôn ngữ bạn muốn (Node.js, Python, Java):

```bash
npm install node-zalo-bot
```

### 3. Khởi tạo bot
Tạo instance bot cơ bản:

**index.js**
```javascript
const ZaloBot = require("node-zalo-bot");
const bot = new ZaloBot("YOUR_BOT_TOKEN", {
  polling: true,
});

// Xử lý tin nhắn đến
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  // Phản hồi lại tin nhắn
  bot.sendMessage(chatId, `Bạn vừa nói: ${msg.text}`);
});
```

### 4. Kiểm thử bot
Chạy bot và kiểm thử trong ứng dụng Zalo:

```bash
node index.js
```

> **Mẹo kiểm thử:** Chạy bot ở máy local rồi nhắn tin tới bot để kiểm thử qua cơ chế getUpdates/polling trước khi triển khai webhook.

---

## API Gửi tin nhắn

Gửi tin nhắn đến người dùng với nhiều loại nội dung bao gồm văn bản, hình ảnh, nút bấm và template.

### Tin nhắn văn bản cơ bản

`POST /bot<BOT_TOKEN>/sendMessage`

```javascript
await bot.sendMessage(chatId, "Xin chào! Tôi có thể giúp gì cho bạn?");
```

### Tham số

| Parameter | Type | Required | Mô tả |
| :--- | :--- | :--- | :--- |
| `chat_id` | string | Yes | ID của người nhận hoặc cuộc trò chuyện. |
| `text` | string | Yes | Nội dung văn bản của tin nhắn (1–2000 ký tự). |

---

# Tạo Bot

Để tạo Zalo Bot, vui lòng thực hiện theo hướng dẫn sau:

### Bước 1: Truy cập Zalo OA
* Mở ứng dụng Zalo
* Tìm kiếm OA **Zalo Bot Manager**
* Chọn **Tạo bot** trong menu cửa sổ chat để truy cập ứng dụng **Zalo Bot Creator**

### Bước 2: Thiết lập thông tin Bot
* Nhập tên Bot (bắt buộc bắt đầu bằng tiền tố Bot, ví dụ: Bot MyShop) và các thông tin cần thiết.
* Nhấn **Tạo Bot** để xác nhận
* Sau khi tạo thành công, hệ thống sẽ gửi:
  * Thông tin Bot
  * Bot Token qua tin nhắn cho tài khoản Zalo của bạn.

### Bước 3: Lập trình Bot
* Sử dụng Node.js, Python hoặc nền tảng không cần code (No-code) để tùy biến theo nhu cầu của bạn.
* Zalo Bot hỗ trợ 2 cơ chế giao tiếp để cập nhật thông tin:
  * **Long polling:** gửi yêu cầu định kỳ để lấy tin nhắn mới. Để bắt đầu chạy thử và phát triển Bot, hãy sử dụng API `getUpdates` ở máy local, sau đó nhắn tin đến Bot của bạn. Bạn sẽ nhận được tin nhắn và có thể `sendMessage` ngược lại cho người dùng.
  * **Webhook:** hệ thống Zalo sẽ gửi tin nhắn đến Webhook URL bạn đã thiết lập, tham khảo API `setWebhook`.

---

# Xác thực

Zalo sử dụng mô hình Bot Token xác thực và cho phép bot sử dụng API.

### Bot Token
Được cung cấp sau khi tạo bot thành công, Token này sẽ không hết hạn cho tới khi bạn chủ động reset. Token sẽ có dạng `12345689:abc-xyz` và được dùng để gọi tất cả các API với phương thức như sau:

```text
https://bot-api.zaloplatforms.com/bot${BOT_TOKEN}/functionName
```

> **MẸO**  
> Để cài đặt lại Bot Token, vui lòng truy cập **Zalo Bot Creator**, chọn thiết lập và làm theo hướng dẫn. Khi thay đổi thành công, hệ thống sẽ gửi Token mới cho bạn qua tin nhắn Zalo.

---

# Sử dụng API

Để gửi yêu cầu đến hệ thống Open APIs của Zalo Bot, bạn sử dụng Bot Token đã được cấp và làm theo hướng dẫn bên dưới.

### Định dạng URL
Tất cả các truy vấn đến Zalo Bot API **phải được thực hiện qua giao thức HTTPS** và có định dạng như sau:

```text
https://bot-api.zaloplatforms.com/bot<BOT_TOKEN>/<functionName>
```

*Ví dụ:*
```text
https://bot-api.zaloplatforms.com/bot123456789:abc123xyz/getMe
```

### Phương thức HTTP hỗ trợ
* GET
* POST

### Cách truyền tham số
Zalo Bot hỗ trợ cả 2 phương thức HTTP GET và POST cho tất cả các API, với các cách để truyền tham số như sau:
* **Chuỗi truy vấn URL (query string):** Ví dụ: `...?chat_id=123456&text=Hello`
* **application/x-www-form-urlencoded:** Dạng form tiêu chuẩn (dùng với POST đơn giản)
* **application/json:** Gửi payload dạng JSON-object
* **multipart/form-data:** Dùng khi cần **tải lên file** như ảnh, tài liệu,...

Tuy nhiên, bạn nên cân nhắc sử dụng phương thức **HTTP GET** cho các API dùng để **truy xuất dữ liệu** và **POST** cho các API **dùng để thay đổi** (ghi/cập nhật) thông tin dữ liệu.

### Phản hồi từ API
Phản hồi từ Zalo Bot API luôn là dạng **JSON-object**, gồm các trường thông tin chính sau:

| Trường | Ý nghĩa |
| :--- | :--- |
| `ok` | `true` nếu thành công, `false` nếu có lỗi |
| `result` | Dữ liệu trả về nếu thành công |
| `description` | Mô tả lỗi ngắn gọn (nếu có) |
| `error_code` | Mã lỗi hệ thống |

### Lưu ý
* Tất cả truy vấn gửi đến Zalo Bot API phải sử dụng encoding **UTF-8**.
* Các tên **API (method name)** có phân biệt chữ hoa và chữ thường.

---

# getMe

Sử dụng phương thức này để kiểm tra `Bot Token`, nếu token hợp lệ sẽ trả về các thông tin cơ bản về Bot của bạn.

* **URL**: `https://bot-api.zaloplatforms.com/bot${BOT_TOKEN}/getMe`
* **Method**: `POST`
* **Response Type**: `application/json`

### Sample code

**Nodejs**
```javascript
const axios = require('axios');
const entrypoint = `https://bot-api.zaloplatforms.com/bot${BOT_TOKEN}/getMe`;
const response = await axios.post(entrypoint, {});
```

### Parameters
Không yêu cầu tham số đi kèm.

### Sample response
```json
{
  "ok": true,
  "result": {
    "id": "1459232241454765289",
    "account_name": "bot.VDKyGxQvc",
    "account_type": "BASIC",
    "can_join_groups": false
  }
}
```

---

# Webhook

Zalo sẽ gửi các **HTTP Request** (phương thức POST) đến Webhook URL bạn đã thiết lập khi có tương tác từ người dùng hoặc các thay đổi liên quan tới Bot.

Tất cả các request sẽ được gửi kèm headers **X-Bot-Api-Secret-Token** với giá trị là `secret_token` bạn đã thiết lập trước đó, vui lòng xác thực lại token này trước khi xử lý để đảm bảo yêu cầu hợp lệ.

* **URL**: `https://your-webhookurl.com`
* **Method**: `POST`
* **Headers**: `X-Bot-Api-Secret-Token`
* **Request Type**: `application/json`

> **MẸO**  
> Nên thiết lập Webhook URL với domain sử dụng HTTPS để tăng tính bảo mật cho hệ thống của bạn. Xem hướng dẫn thiết lập tại [setWebhook](https://docs.zaloplatforms.com/docs/BOT/setWebhook).

> **KHÔNG NHẬN ĐƯỢC SỰ KIỆN NÀO?**  
> Trước khi liên hệ hỗ trợ, hãy gọi [testWebhook](https://docs.zaloplatforms.com/docs/BOT/testWebhook) để tự kiểm tra Webhook URL của bạn có đang truy cập được không, và xem gợi ý xử lý tương ứng.

---

### Sample code

**src/backend.ts**
```typescript
app.use(express.json());
const WEBHOOK_SECRET_TOKEN = 'your-secret-token';

app.post("/webhooks", async (req, res) => {
  const secretToken = req.headers["x-bot-api-secret-token"];
  if (secretToken !== WEBHOOK_SECRET_TOKEN) {
    return res.status(403).json({ message: "Unauthorized" });
  }
  let body = req.body;
  // Handle your logic at here
  res.json({ message: "Success" });
})
.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
```

---

### Parameters

Dữ liệu được gửi từ Zalo Server sẽ là dạng **JSON object**, gồm các trường thông tin chính sau:

| Trường | Ý nghĩa |
| :--- | :--- |
| `ok` | Luôn có giá trị `true` |
| `result` | Dữ liệu thông tin cho sự kiện, với từng loại sự kiện có được gửi kèm các trường thông tin tương ứng. |

---

### Result

| Trường | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `event_name` | String | true | Tên sự kiện, sẽ nhận một trong các giá trị sau:<br>• `message.text.received`: nhận được một tin nhắn văn bản.<br>• `message.image.received`: nhận được một tin nhắn dạng hình ảnh.<br>• `message.sticker.received`: nhận được một tin nhắn Sticker.<br>• `message.voice.received`: nhận được một tin nhắn thoại.<br>• `message.unsupported.received`: nhận được một tin nhắn chưa hỗ trợ xử lý. |
| `message` | String | false | Nếu là sự kiện có tin nhắn mới, bạn sẽ nhận được thông tin chi tiết về message. Tùy theo từng loại tin nhắn sẽ có thêm các trường thông tin tương ứng. Tham khảo bảng đặc tả bên dưới |

---

### Sample response

```json
{
  "ok": true,
  "result": {
    "message": {
      "from": {
        "id": "6ede9afa66b88fe6d6a9",
        "display_name": "Ted",
        "is_bot": false
      },
      "chat": {
        "id": "6ede9afa66b88fe6d6a9",
        "chat_type": "PRIVATE"
      },
      "text": "Xin chào",
      "message_id": "2d758cb5e222177a4e35",
      "date": 1750316131602
    },
    "event_name": "message.text.received"
  }
}
```

---

### Message

| Trường | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `from` | JSON object | true | Thông tin người gửi tin nhắn |
| `chat` | JSON object | true | Thông tin cuộc trò chuyện. Trong đó `chat_type` sẽ là một trong các giá trị:<br>• `PRIVATE`: cuộc hội thoại cá nhân.<br>• `GROUP`: cuộc hội thoại với nhóm (Beta).<br>Sử dụng `chat.id` để gửi tin nhắn phản hồi tới cuộc trò chuyện. |
| `text` | String | false | Nội dung của tin nhắn văn bản |
| `photo` | String | false | Đường dẫn hình ảnh của tin nhắn hình ảnh |
| `caption` | String | false | Nội dung văn bản được gửi kèm tin nhắn hình ảnh |
| `sticker` | String | false | Truyền vào stricker lấy từ nguồn: `https://stickers.zaloapp.com/`. Vui lòng xem video hướng dẫn tại đây: `https://vimeo.com/649330161` |
| `url` | String | false | Đường dẫn của sticker |
| `voice_url` | String | false | Đường dẫn tệp âm thanh của tin nhắn thoại |

> **CẢNH BÁO**  
> Trường hợp tài khoản người gửi tin nhắn thuộc nhóm đối tượng đặc biệt (bao gồm nhưng không giới hạn: trẻ em, người khuyết tật, người không biết chữ,...), thay vì nhận nội dung tin nhắn, hệ thống của bạn sẽ nhận được sự kiện webhook `message.unsupported.received`, nhằm đảm bảo việc xử lý dữ liệu tuân thủ quy định pháp luật hiện hành.

---

# Hướng dẫn xây dựng trợ lý cá nhân với OpenClaw

Dưới đây là hướng dẫn xây dựng trợ lý cá nhân My ClawBot kết nối OpenClaw

## Giới thiệu
* `@zalo-platforms/openclaw-zaloclawbot` là plugin giúp kết nối OpenClaw để tạo ra My ClawBot - trợ lý AI cá nhân hoạt động trực tiếp trên Zalo.
* Chỉ cần cài đặt plugin, quét mã QR bằng Zalo và xác nhận quyền truy cập, My ClawBot sẽ tự động được kết nối với OpenClaw của bạn.
* Sau khi hoàn tất, bạn có thể trò chuyện với My ClawBot ngay trên Zalo như một cuộc trò chuyện thông thường.

## Trước khi bắt đầu, hãy đảm bảo
* Đã cài đặt OpenClaw
* Đã hoàn thành bước `openclaw onboard`
* Đã cấu hình AI Provider (OpenAI, Claude, Gemini,...)

## Bước 1: Cài đặt Plugin
Cài đặt plugin từ npm:
```bash
npx -y @zalo-platforms/openclaw-zaloclawbot-cli install
```

## Bước 2: Tạo My ClawBot
* Sau khi cài đặt plugin hoàn tất, màn hình terminal sẽ hiển thị QR Code đăng nhập.
* Mở ứng dụng Zalo để quét mã QR được hiển thị từ plugin.
* Nhấn **Tạo My ClawBot** để cho phép plugin:
  * Tạo My ClawBot cho tài khoản của bạn
  * Kết nối My ClawBot với OpenClaw
  * Đồng bộ các thiết lập cần thiết

## Bước 3: Chat với My ClawBot
* Sau khi kết nối thành công, My ClawBot sẽ xuất hiện trong danh sách chat Zalo của bạn.

---

# Bảng mã lỗi

Bảng mô tả mã lỗi có thể phát sinh khi sử dụng các APIs của hệ thống. Với các trường hợp lỗi, vui lòng tham khảo thông tin trong trường `description` trong dữ liệu nhận được để biết thêm chi tiết.

| Mã lỗi | Ý nghĩa |
| :--- | :--- |
| 400 | Bad request - sai đường dẫn hoặc API Name không hợp lệ |
| 401 | Unauthorized - Token đã hết hạn hoặc không hợp lệ |
| 403 | Internal server error |
| 404 | Not found - Yêu cầu truy cập không lệ |
| 408 | Request timeout - Quá thời gian xử lý cho phép |
| 429 | Quota exceeded - Vượt quá giới hạn sử dụng API cho phép |
