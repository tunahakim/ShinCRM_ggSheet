<!-- split-doc-source: 06. FBM INTEGRATION REFERENCE (Tài liệu tích hợp FBM).md -->
<!-- split-doc-headings: ## Chương 2. Xác thực và quản lý phiên -->
<!-- split-doc-lines: 187-544 -->

> Nội dung bên dưới được trích nguyên văn từ tài liệu gốc. Chỉ phần header này được thêm để định tuyến sau khi tách docs.
## Chương 2. Xác thực và quản lý phiên

### 2.1 Tổng quan luồng đăng nhập

Quá trình đăng nhập FBM gồm 4 bước tuần tự. Mỗi bước phụ thuộc kết quả của bước trước. Cookie phiên (`ASP.NET_SessionId`) phải được duy trì xuyên suốt cả 4 bước. Sau khi đăng nhập thành công, cần thêm 1-2 bước trích xuất thông tin phục vụ các API sau này.

```
Bước 1: GET  Login.aspx           → Nhận cookie phiên + salt
Bước 2: POST Login.aspx/GetEntityData  → Nhận tên database
Bước 3: POST Login.aspx/GetUnitData    → Nhận mã đơn vị
Bước 4: POST Login.aspx/Login          → Đăng nhập (gửi hash mật khẩu)
Bước 5: GET  zccrAccount.aspx          → Trích xuất userId + cookie payload
Bước 6: POST GetDirViewPage            → Lấy mã authorized (thay đổi mỗi phiên)
```

### 2.2 Bước 1 — Lấy cookie phiên và salt

**Endpoint:** `GET /Main/Login.aspx`

Mục đích là khởi tạo phiên làm việc trên server và nhận salt dùng để hash mật khẩu. Gửi HTTP GET đơn giản tới trang đăng nhập, không cần header đặc biệt.

**Response:** Server trả về trang HTML login (khoảng 21.593 bytes) kèm header `Set-Cookie` chứa `ASP.NET_SessionId`. Bên trong HTML có đoạn JavaScript nhúng chứa salt — một chuỗi ngẫu nhiên 12 ký tự hex, thay đổi mỗi lần tải trang.

**Cách trích xuất salt từ HTML:** Salt được nhúng trong mã JavaScript dạng `eval`. Có thể xuất hiện ở 2 dạng. Dạng chính dùng Unicode escape: tìm pattern `u0027([a-f0-9]{4,})...u0027+...u0027([a-f0-9]{4,})` trong HTML, salt = nhóm 1 nối nhóm 2. Dạng phụ dùng dấu nháy đơn trực tiếp: tìm pattern `'([a-f0-9]{4,})' + '([a-f0-9]{4,})'`. Ví dụ: regex bắt được nhóm 1 là `6c6dd4` và nhóm 2 là `446a2d`, salt cuối cùng là `6c6dd4446a2d`.

**Vai trò của salt:** Salt là cơ chế chống tấn công replay. Mỗi lần tải trang login, FBM tạo salt mới, khiến hash mật khẩu khác nhau mỗi lần đăng nhập.

### 2.3 Bước 2 — Lấy thông tin cơ sở dữ liệu

**Endpoint:** `POST /Main/Login.aspx/GetEntityData`

**Request Headers:**
```
Cookie: ASP.NET_SessionId=<giá trị từ bước 1>
Content-Type: application/json; charset=UTF-8
Referer: https://fbo.com.vn:8888/Main/Login.aspx
```

**Request Body:** `{}` (JSON object rỗng — bắt buộc phải gửi `{}`, không được gửi body rỗng).

**Response:** Server trả về `{ "d": [...] }` chứa danh sách database. Response có thể ở ba dạng: mảng hai chiều `[["01", "Fast FBM Online", "FHN_CRM_App"]]` (lấy phần tử cuối của mảng con), mảng chuỗi `["FHN_CRM_App"]` (lấy phần tử chứa `_`), hoặc mảng object `[{ "Ma_DL": "FHN_CRM_App" }]`. Giá trị mặc định (fallback) là `"FHN_CRM_App"`.

Server có thể trả thêm cookie mới trong `Set-Cookie`, cần ghép với cookie hiện có.

### 2.4 Bước 3 — Lấy thông tin đơn vị

**Endpoint:** `POST /Main/Login.aspx/GetUnitData`

**Request Headers:** Giống bước 2, cookie đã cập nhật nếu bước 2 trả thêm cookie mới.

**Request Body:**
```json
{
  "u": "<username>",
  "d": "<database>"
}
```

Trong đó `u` là tên đăng nhập FBM (ví dụ `"anhlt"`), `d` là tên database từ bước 2 (ví dụ `"FHN_CRM_App"`).

**Response:** Tương tự bước 2, trả `{ "d": [...] }` chứa danh sách đơn vị. Cũng có ba dạng response. Giá trị mặc định (fallback) là `"CTY"`.

### 2.5 Bước 4 — Đăng nhập chính thức

**Endpoint:** `POST /Main/Login.aspx/Login`

**Thuật toán hash mật khẩu:** FBM sử dụng hash hai lần MD5 kết hợp salt. Lần 1: `hash1 = MD5(mật_khẩu_gốc)`. Lần 2: `hash2 = MD5(salt + hash1)`. Ví dụ: `MD5("1234567a@")` = `"5b90b0b35f1a601ef0e5d294a5c7e3ce"`, rồi `MD5("6c6dd4446a2d" + "5b90b0b35f1a601ef0e5d294a5c7e3ce")` cho ra hash cuối cùng.

**Request Body:**
```json
{
  "user": "<username>",
  "password": "<hash2>",
  "database": "<database>",
  "unit": "<unit>",
  "language": "v",
  "value": "<salt>",
  "force": true,
  "storage": true
}
```

Giải thích: `user` là tên đăng nhập. `password` là hash hai lần MD5. `database` từ bước 2. `unit` từ bước 3. `language` luôn `"v"`. `value` là salt gốc từ bước 1, gửi lại để server xác minh. `force` = `true` để ép đăng nhập ngay cả khi tài khoản đang có phiên khác (FBM chỉ cho phép 1 session tại 1 thời điểm). `storage` = `true` để server lưu phiên.

**Response thành công:** `{ "d": true }`. **Thất bại:** `{ "d": null }` hoặc `{ "d": false }`.

Server có thể trả thêm cookie xác thực trong `Set-Cookie`. Cookie cuối cùng dùng cho mọi request sau là kết quả ghép cookie từ bước 1 (session) và bước 4 (auth, nếu có).

### 2.6 Trích xuất userId và cookie payload

Sau khi đăng nhập thành công, cần truy cập trang quản lý khách hàng để lấy hai thông tin quan trọng.

**Endpoint:** `GET /Main/zccrAccount.aspx`

**Request Headers:**
```
Cookie: <fullCookie từ quá trình login>
Referer: https://fbo.com.vn:8888/Default.aspx
```

**Response:** HTML chứa JavaScript khởi tạo. Bên trong có chuỗi cookie payload nhúng dưới dạng `"cookie":"<giá_trị>"`.

**Cookie payload** là một chuỗi có cấu trúc cố định, ví dụ `"500020372f578FHN_CRM_App"`. Cấu trúc gồm 4 phần nối liền: prefix (4 ký tự, thay đổi mỗi lần login), userId (3-5 chữ số, mã nhân viên), hash (5 ký tự hex, thay đổi mỗi lần login), database name (chuỗi cố định). Cookie payload này được gửi trong trường `"cookie"` của JSON body khi gọi API — đây KHÔNG phải HTTP cookie header mà là một trường trong payload.

**Thuật toán trích xuất userId:** Bước 1: tìm vị trí tên database trong chuỗi, cắt bỏ phần database ở cuối (ví dụ `"500020372f578FHN_CRM_App"` → `"500020372f578"`). Bước 2: bỏ 4 ký tự đầu (prefix) và 5 ký tự cuối (hash), phần còn lại là userId (ví dụ `"500020372f578"` → bỏ `"5000"` và `"2f578"` → còn `"2037"`).

### 2.7 Lấy mã authorized

Mã `authorized` là giá trị phân quyền do FBM server cấp cho mỗi phiên đăng nhập. Mã này bắt buộc khi thực hiện các thao tác tạo mới, sửa, xóa dữ liệu. Mã thay đổi mỗi lần đăng nhập (hoặc mỗi lần reload trang), nên cần lấy lại sau mỗi lần login.

Mỗi controller có mã authorized riêng. ShinCRM cần lấy ít nhất 2 mã: một cho khách hàng (`zccrAccount`), một cho hoạt động (`zccrAccountTask`).

**Điều kiện quan trọng:** Request lấy authorized phải gửi `viewPage: false` và `authorized: null`. Nếu gửi `viewPage: true` hoặc gửi kèm mã authorized cũ, server sẽ không trả authorized mới.

**Thời điểm lấy:** Ngay sau khi hoàn thành bước 5 (trích xuất userId và cookie payload). Chỉ cần lấy 1 lần cho mỗi phiên đăng nhập, dùng cho toàn bộ thao tác CRUD trong phiên đó.

#### 2.7.1 Lấy authorized cho zccrAccount (khách hàng)

**Endpoint:** `POST /AppService/FastBusiness.ReportExtenderService.asmx/GetDirViewPage`

**Request Headers:**
```
Cookie: <fullCookie từ quá trình login>
Content-Type: application/json; charset=UTF-8
Referer: https://fbo.com.vn:8888/Main/zccrAccount.aspx
```

**Request Body:**
```json
{
  "type": 0,
  "parentType": "Dir",
  "firstView": false,
  "searchMode": false,
  "viewPage": false,
  "authorized": null,
  "action": "New",
  "actionID": null,
  "values": [],
  "vars": [
    {"Name": "recordID", "Type": "String", "Value": ""},
    {"Name": "viewPageMode", "Type": "Boolean"},
    {"Name": "viewParentController", "Type": "String", "Value": ""}
  ],
  "memvars": [],
  "language": "v",
  "controller": "zccrAccount",
  "viewId": null,
  "gridController": "zccrAccount",
  "gridViewId": null,
  "cookie": "<fbmPayloadCookie>"
}
```

**Giải thích các trường then chốt:**

`viewPage: false` — bắt buộc phải là `false` để server trả authorized. Nếu gửi `true`, server coi là request tiếp theo (đã có authorized) và không trả nữa.

`authorized: null` — bắt buộc phải là `null` để thông báo cho server rằng client chưa có mã authorized.

`action: "New"` — dùng action New cho đơn giản. Action Edit cũng trả authorized nhưng yêu cầu `values` chứa stt_rec_kh hợp lệ.

`values: []` — mảng rỗng. Không cần biết trước bất kỳ record nào.

`vars` — 3 phần tử cố định cho zccrAccount: `recordID`, `viewPageMode`, `viewParentController`.

**Response mẫu (trích phần quan trọng):**
```json
{
  "d": {
    "Row": null,
    "Bugs": null,
    "Authorized": "1111.440",
    "ClientScript": "this._editkh ='0';this._ma_kh_auto ='ALT00490';..."
  }
}
```

**Cách xử lý response:**

Nếu `Bugs` là `null` và `Authorized` không phải `null`: thành công. Lưu giá trị `Authorized` (ví dụ `"1111.440"`) để dùng cho toàn bộ thao tác CRUD khách hàng trong phiên này.

Nếu `Bugs` không phải `null`: kiểm tra `Bugs.Message`. Nếu chứa `"$NotAuthorized"`, có thể do session chưa được khởi tạo đúng — thử reload lại từ bước 5.

**Lưu ý:** Response cũng chứa `_ma_kh_auto` trong `ClientScript` — đây là mã KH tự sinh tiếp theo. Tuy nhiên mã này chưa dùng ngay ở bước lấy authorized; nó sẽ được lấy lại ở bước tạo KH mới (xem Chương 4.5).

#### 2.7.2 Lấy authorized cho zccrAccountTask (hoạt động)

**Endpoint:** Cùng endpoint `GetDirViewPage`.

**Request Body:**
```json
{
  "type": 0,
  "parentType": "Dir",
  "firstView": false,
  "searchMode": false,
  "viewPage": false,
  "authorized": null,
  "action": "New",
  "actionID": null,
  "values": [],
  "vars": [
    {"Name": "recordID", "Type": "String", "Value": ""},
    {"Name": "viewPageMode", "Type": "Boolean", "Value": false}
  ],
  "memvars": [],
  "language": "v",
  "controller": "zccrAccountTask",
  "viewId": null,
  "gridController": "zccrAccountTask",
  "gridViewId": null,
  "cookie": "<fbmPayloadCookie>"
}
```

**Điểm khác biệt so với zccrAccount:**

`controller` và `gridController` là `"zccrAccountTask"` thay vì `"zccrAccount"`.

`vars` chỉ có 2 phần tử (không có `viewParentController`), và `viewPageMode` có thêm `"Value": false`.

**Response mẫu:**
```json
{
  "d": {
    "Bugs": null,
    "Authorized": "1.9c3"
  }
}
```

Lưu giá trị `"1.9c3"` để dùng cho toàn bộ thao tác CRUD hoạt động trong phiên này.

#### 2.7.3 Cấu trúc mã authorized

Mã authorized gồm 2 phần cách nhau bởi dấu chấm. Phần trước dấu chấm biểu thị mức quyền: `"1111"` cho zccrAccount (đầy đủ quyền CRUD), `"1"` cho zccrAccountTask (cấu trúc quyền đơn giản hơn). Phần sau dấu chấm là hash thay đổi mỗi phiên (ví dụ `"440"`, `"9c3"`, `"37a"`).

ShinCRM không cần giải mã cấu trúc này — chỉ cần lưu nguyên chuỗi và gửi lại trong các request CRUD.

#### 2.7.4 Tóm tắt luồng lấy authorized

```
Sau khi login + lấy cookie payload (bước 1-5):

    ┌─ Request 1: GetDirViewPage
    │  controller = "zccrAccount"
    │  viewPage = false, authorized = null
    │  values = []
    │  → Nhận authorized_kh = "1111.440"
    │
    ├─ Request 2: GetDirViewPage
    │  controller = "zccrAccountTask"
    │  viewPage = false, authorized = null
    │  values = []
    │  → Nhận authorized_task = "1.9c3"
    │
    ═══ Sẵn sàng thao tác CRUD ═══
    │
    ├─ Tạo/Sửa/Xóa KH  → gửi authorized = authorized_kh
    └─ Tạo/Sửa/Xóa HĐ  → gửi authorized = authorized_task
```

### 2.8 Quản lý phiên (Session Management)

**Thời gian sống của session:** Cookie `ASP.NET_SessionId` hết hạn sau một khoảng thời gian không hoạt động, nhưng thời gian này không cố định — dao động từ 30 phút đến hơn 1 tiếng rưỡi tùy thời điểm. ShinCRM không nên dựa vào timer cố định để quyết định re-login.

**Session không bind vào IP:** Đã test xác nhận: cùng một cookie session có thể gửi request thành công từ nhiều IP khác nhau (WiFi thường và WiFi 4G) mà không bị hủy. FBM server chỉ kiểm tra cookie hợp lệ, không kiểm tra IP nguồn khớp với IP lúc login. Phiên trên trình duyệt vẫn hoạt động bình thường khi có request từ IP khác dùng cùng cookie.

**Session chỉ bị hủy khi login mới:** Session cũ chỉ bị invalidate khi có lệnh `Login.aspx/Login` với `force: true` tạo session mới. Nếu không ai gọi Login, session tồn tại cho đến khi tự hết hạn do không hoạt động.

**Ý nghĩa cho kiến trúc ShinCRM:**

Chrome Extension lấy cookie session từ trình duyệt đang mở FBM, gửi cho ShinCRM backend. Supabase đóng gói request, Worker Node.js dùng cookie đó để gửi request đến FBM — hoạt động song song với trình duyệt mà không gây xung đột. Worker KHÔNG CẦN login riêng khi có cookie tươi từ Extension. Điều này giảm rủi ro hủy session lẫn nhau giữa ShinCRM và FBM web.

**Chiến lược quản lý session cho ShinCRM:**

Cách 1 — Phòng thủ trong mỗi response (BẮT BUỘC): Sau mỗi response từ FBM, kiểm tra xem body có chứa `"Login.aspx"` hoặc HTTP status 401/403 không. Nếu có, session đã hết hạn — thông báo cho Extension lấy cookie mới (nếu user đang mở FBM) hoặc yêu cầu user mở FBM để tạo session mới.

Cách 2 — Heartbeat nhẹ trước batch thao tác (KHUYẾN NGHỊ): Trước mỗi đợt đồng bộ (không phải mỗi request đơn lẻ), gửi `GET /Default.aspx` với cookie hiện có. Nếu response trả HTML bình thường (không redirect) thì session còn sống. Nếu redirect về Login.aspx thì cần cookie mới.

Cách 3 — Timer gợi ý (PHỤ): Vẫn giữ bộ đếm thời gian nội bộ. Nếu đã quá 25 phút kể từ request cuối cùng thành công, chủ động gửi heartbeat kiểm tra trước khi thực hiện thao tác. Đây chỉ là gợi ý, không phải căn cứ chính — timer có thể sai vì session timeout không cố định.

Cách 4 — Server-login khẩn cấp (FALLBACK CÓ KIỂM SOÁT): Chỉ dùng khi cookie đã xác nhận hết hạn, Extension không hoạt động hoặc `cookie_updated_at` quá cũ, và config/admin cho phép fallback. Vì login với `force: true` có thể hủy phiên FBM đang mở trên trình duyệt, không được tự login khi vừa có cookie tươi từ Extension.

**Luồng xử lý khi session hết hạn:**

```
Request đến FBM
    │
    ├─ Response OK → tiếp tục bình thường
    │
    └─ Response chứa "Login.aspx" hoặc 401/403
         │
         ├─ Extension đang hoạt động?
         │   ├─ Có → Extension lấy cookie mới từ trình duyệt
         │   │        → gửi cookie mới cho backend
         │   │        → retry request vừa thất bại
         │   │
         │   └─ Không → ghi log "session hết hạn"
         │              → thông báo user qua Telegram (Phase 3)
         │              → đưa request vào hàng chờ
         │              → chờ user mở FBM trên trình duyệt
         │
         └─ Worker cần cookie mới
              → ưu tiên chờ Extension gửi cookie
              → nếu Extension stale + admin bật fallback khẩn cấp
                thì Edge Function mới được server-login
              → KHÔNG tự login khi còn cookie tươi từ Extension
```

### 2.9 Sơ đồ luồng hoàn chỉnh

```
[ShinCRM / Extension / Worker]
    │
    ├── 1. GET /Main/Login.aspx ──────────────────► [FBM Server]
    │      ◄── HTML + Set-Cookie: ASP.NET_SessionId
    │          + Salt trong JS: eval('xxxx'+'yyyy')
    │
    ├── 2. POST /Main/Login.aspx/GetEntityData ───► [FBM Server]
    │      Body: {}
    │      ◄── {"d":[["01","Fast FBM","FHN_CRM_App"]]}
    │
    ├── 3. POST /Main/Login.aspx/GetUnitData ─────► [FBM Server]
    │      Body: {"u":"anhlt","d":"FHN_CRM_App"}
    │      ◄── {"d":[["CTY","Công ty","Company"]]}
    │
    ├── 4. POST /Main/Login.aspx/Login ───────────► [FBM Server]
    │      Body: {user, password:MD5(salt+MD5(pw)), ...}
    │      ◄── {"d":true} + optional Set-Cookie
    │
    ├── 5. GET /Main/zccrAccount.aspx ────────────► [FBM Server]
    │      ◄── HTML chứa "cookie":"<payloadCookie>"
    │          → Trích xuất userId + payloadCookie
    │
    ├── 6. POST GetDirViewPage ───────────────────► [FBM Server]
    │      {action:"New", firstView:false, type:0,
    │       viewPage:false, authorized:null, values:[], controller:"zccrAccount"}
    │      ◄── {"d":{"Authorized":"1111.37a", ...}}
    │
    │   ═══ Phiên đăng nhập sẵn sàng ═══
    │
    ├── POST GetGridViewPage ─────────────────────► [FBM Server]
    │      {controller:"zccrAccount", filter:[...],
    │       cookie:"<payloadCookie>", ...}
    │      ◄── {"d":{"TotalRowCount":N, "Rows":[...]}}
    │
    └── POST GetDirViewPage ──────────────────────► [FBM Server]
           {action:"New"/"Edit"/"Delete",
            authorized:"1111.37a", ...}
           ◄── {"d":{"Bugs":null, ...}}  (thành công)
```

---



