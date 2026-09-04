<!-- split-doc-source: 06. FBM INTEGRATION REFERENCE (Tài liệu tích hợp FBM).md -->
<!-- split-doc-headings: ## Chương 5. Hoạt động / Lịch sử làm việc (zccrAccountTask) -->
<!-- split-doc-lines: 1195-1496 -->

> Nội dung bên dưới được trích nguyên văn từ tài liệu gốc. Chỉ phần header này được thêm để định tuyến sau khi tách docs.
## Chương 5. Hoạt động / Lịch sử làm việc (zccrAccountTask)

### 5.1 Tổng quan

Controller `zccrAccountTask` quản lý lịch sử hoạt động chăm sóc khách hàng — mỗi lần gọi điện, gặp mặt, gửi báo giá, gửi tài liệu đều được ghi thành một bản ghi hoạt động.

Bảng database gốc: `sysevents`. Khóa chính: `id` (số tự tăng, ví dụ `166386`). Liên kết với KH: qua trường `stt_rec` trong `externalKey` (giá trị = `stt_rec_kh` của KH). Sort mặc định: `end_date desc, datetime0 desc, id, line_nbr`.

Điểm khác biệt quan trọng so với zccrAccount: tạo hoạt động mới KHÔNG cần bước mở form trước (không cần lấy ID tự sinh), `authorized` dùng mã riêng (dạng `"1.xxx"`), xóa hoạt động là hard delete (biến mất hoàn toàn).

### 5.2 Cấu trúc grid — 11 cột

Khi gọi `GetGridViewPage` với `controller: "zccrAccountTask"`, mỗi dòng trong `Rows[]` là mảng 11 giá trị:

| Index | AliasName | Tiêu đề | Type | Visible | Ghi chú |
|-------|-----------|---------|------|---------|---------|
| 0 | `id` | _(ẩn)_ | String | Ẩn | PK, số tự tăng |
| 1 | `ten_loai` | Loại | String | Ẩn | VD: "Công việc" |
| 2 | `ten_cv` | Công việc | String | Có | VD: "Gọi điện chăm sóc", max 128 |
| 3 | `details` | Chi tiết CV | String | Có | Nội dung chi tiết, max 4000 |
| 4 | `start_date` | Ngày bắt đầu | DateTime | Ẩn | |
| 5 | `end_date` | Ngày phát sinh | DateTime | Có | Ngày làm việc thực tế |
| 6 | `ten_tt` | Trạng thái | String | Có | VD: "Hoàn thành", max 14 |
| 7 | `owner` | Người tạo | String | Có | Tên đầy đủ (VD: "Lê Tuấn Anh"), max 100 |
| 8 | `nguoi_sua` | Người sửa | String | Ẩn | Mã NV (VD: "ANHLT") |
| 9 | `datetime0` | _(ẩn)_ | DateTime | Ẩn | Ngày nhập liệu |
| 10 | `line_nbr` | _(ẩn)_ | Int32 | Ẩn | Số thứ tự trong ngày |

Lưu ý: `owner` chứa tên đầy đủ (VD: "Lê Tuấn Anh"), `nguoi_sua` chứa mã NV (VD: "ANHLT"). Đây là quy ước ngược với trực giác.

### 5.3 Cấu trúc form — 36 trường

Khi mở form chi tiết hoạt động (GetDirViewPage action Edit), response trả về `Row` gồm 45 giá trị. Khi lưu (tạo mới hoặc sửa), payload `memvars` gồm 36 trường.

**Các trường chính khi tạo/sửa hoạt động:**

| Tên trường | Tiêu đề | Bắt buộc | Ghi chú |
|-----------|---------|----------|---------|
| `id` | — | — | `0` khi tạo mới, ID thật khi sửa |
| `event_yn` | Loại | — | `0` = công việc (giá trị duy nhất quan sát được) |
| `text` | Tiêu đề | Không | Rỗng cho loại công việc |
| `ma_cv` | Công việc | **Có** | Dropdown crJob, gửi mã (VD: `"GD"`) |
| `assigned_name` | Người được giao | Không | |
| `muc_do` | Mức độ | — | `"2"` = bình thường |
| `start_date` | Ngày bắt đầu | **Có** | Format `/Date(ms)/` |
| `start_time` | Giờ bắt đầu | — | Format `"HH:mm"` |
| `end_date` | Ngày kết thúc | **Có** | Ngày làm việc thực tế, format `/Date(ms)/` |
| `end_time` | Giờ kết thúc | — | Format `"HH:mm"` |
| `ngay_nhac` | Ngày nhắc | Không | DateTime, nullable |
| `gio_nhac` | Giờ nhắc | Không | `"00:00"` |
| `full_day` | Cả ngày | — | Boolean |
| `details` | Nội dung | **Có** | Max 4000 ký tự |
| `private` | Riêng tư | — | Boolean |
| `share_user` | Chia sẻ user | Không | |
| `share_group` | Chia sẻ nhóm | Không | Number |
| `ma_nhom` | Mã nhóm | Không | |
| `owner` | Người tạo | — | Tên đầy đủ, client gửi lên (VD: `"Lê Tuấn Anh"`) |
| `comment` | Bình luận | Không | |
| `nguoi_sua` | Người sửa | — | Server tự gán |
| `datetime0` | Ngày nhập | — | `/Date(ms)/` thời điểm hiện tại |
| `status` | Trạng thái | — | `"2"` = Hoàn thành |
| `gia_bao` | Giá báo | Không | Decimal |
| `gia_dt` | Giá dự thảo | Không | Decimal |
| `ma_dt` | Mã dự thảo | Không | |
| `nd_chinh_sua` | ND chỉnh sửa | Không | |
| `ma_sp` | Sản phẩm | Không | |
| `ma_module` | Module | Không | |
| `ma_kh` | Mã KH | **Có** | Mã KH hiển thị (VD: `"ALT00490"`) |
| `stt_rec` | PK KH | **Có** | stt_rec_kh của KH liên kết |
| `type` | Loại record | — | `"1"` = Công việc |
| `user_ref` | Mã phân cấp | — | Rỗng |
| `fileupload` | File upload | Không | |
| `fileticket` | Ticket upload | — | Lấy từ Showing script khi sửa |
| `filekey` | Key file | Không | |

**Mapping Row index khi mở form sửa (45 giá trị):**

| Index | Trường | Index | Trường |
|-------|--------|-------|--------|
| 0 | id | 1 | event_yn |
| 2 | text | 3 | ma_cv |
| 4 | ten_cv (chỉ đọc) | 5 | assigned_name |
| 7 | muc_do | 8 | start_date |
| 9 | start_time | 10 | end_date |
| 11 | end_time | 12 | ngay_nhac |
| 13 | gio_nhac | 14 | full_day |
| 15 | details | 16 | private |
| 17 | share_user | 18 | share_group |
| 19 | ma_nhom | 21 | owner |
| 22 | comment | 23 | nguoi_sua |
| 24 | datetime0 | 25 | status |
| 26 | gia_bao | 27 | gia_dt |
| 28 | ma_dt | 29 | nd_chinh_sua |
| 30 | ma_sp | 31 | ma_module |
| 37 | stt_rec | 38 | type |
| 39 | user_ref | | |

### 5.4 Lấy lịch sử làm việc của 1 KH

```json
{
  "type": 0,
  "count": 100,
  "language": "v",
  "controller": "zccrAccountTask",
  "viewId": null,
  "childObject": false,
  "lastPageIndex": -1,
  "firstPageItem": "",
  "lastPageItem": "",
  "lastRowCount": 0,
  "memvars": [],
  "externalKey": [{
    "Name": "stt_rec",
    "Opr": "=",
    "Value": "<stt_rec_kh>",
    "Type": "String",
    "Ignore": false
  }],
  "gridPageIndex": -1,
  "gridPageValue": null,
  "gridRefresh": false,
  "filter": [],
  "sortExpression": null,
  "cookie": "<fbmPayloadCookie>",
  "query": null,
  "parameter": null,
  "variable": ""
}
```

Điểm khác so với lấy KH: `controller` là `"zccrAccountTask"`. `memvars` là mảng rỗng (không cần user_id). `externalKey` lọc theo `stt_rec` = `stt_rec_kh` của KH, toán tử `=` (exact match). KH không có hoạt động: `TotalRowCount: 0, Rows: []`.

**Parse response:**

```javascript
rows.forEach(row => {
  const activity = {
    id:          row[0],
    ten_loai:    row[1],
    ten_cv:      row[2],
    details:     row[3],
    start_date:  parseFBMDate(row[4]),
    end_date:    parseFBMDate(row[5]),
    ten_tt:      row[6],
    owner:       row[7],
    nguoi_sua:   row[8],
    datetime0:   parseFBMDate(row[9]),
    line_nbr:    row[10]
  };
});
```

### 5.5 Tạo hoạt động mới

Đơn giản hơn tạo KH — KHÔNG cần bước mở form trước, gửi thẳng 1 request.

```json
{
  "type": 1,
  "parentType": "Dir",
  "firstView": false,
  "searchMode": false,
  "viewPage": true,
  "authorized": "<authorized_task>",
  "action": "New",
  "actionID": null,
  "values": [],
  "vars": [
    {"Name": "recordID", "Type": "String", "Value": ""},
    {"Name": "viewPageMode", "Type": "Boolean", "Value": false}
  ],
  "memvars": [
    {"Name": "id", "OldValue": null, "NewValue": 0},
    {"Name": "event_yn", "OldValue": null, "NewValue": 0},
    {"Name": "text", "OldValue": null, "NewValue": ""},
    {"Name": "ma_cv", "OldValue": null, "NewValue": "<MÃ CÔNG VIỆC>"},
    {"Name": "assigned_name", "OldValue": null, "NewValue": ""},
    {"Name": "muc_do", "OldValue": null, "NewValue": "2"},
    {"Name": "start_date", "OldValue": null, "NewValue": "<\/Date(ms)\/>"},
    {"Name": "start_time", "OldValue": null, "NewValue": "<HH:mm>"},
    {"Name": "end_date", "OldValue": null, "NewValue": "<\/Date(ms)\/>"},
    {"Name": "end_time", "OldValue": null, "NewValue": "01:00"},
    {"Name": "ngay_nhac", "OldValue": null, "NewValue": null},
    {"Name": "gio_nhac", "OldValue": null, "NewValue": "00:00"},
    {"Name": "full_day", "OldValue": null, "NewValue": false},
    {"Name": "details", "OldValue": null, "NewValue": "<NỘI DUNG>"},
    {"Name": "private", "OldValue": null, "NewValue": false},
    {"Name": "share_user", "OldValue": null, "NewValue": ""},
    {"Name": "share_group", "OldValue": null, "NewValue": 0},
    {"Name": "ma_nhom", "OldValue": null, "NewValue": ""},
    {"Name": "owner", "OldValue": null, "NewValue": "<TÊN ĐẦY ĐỦ>"},
    {"Name": "comment", "OldValue": null, "NewValue": null},
    {"Name": "nguoi_sua", "OldValue": null, "NewValue": ""},
    {"Name": "datetime0", "OldValue": null, "NewValue": "<\/Date(ms) HIỆN TẠI\/>"},
    {"Name": "status", "OldValue": null, "NewValue": "2"},
    {"Name": "gia_bao", "OldValue": null, "NewValue": 0},
    {"Name": "gia_dt", "OldValue": null, "NewValue": 0},
    {"Name": "ma_dt", "OldValue": null, "NewValue": ""},
    {"Name": "nd_chinh_sua", "OldValue": null, "NewValue": ""},
    {"Name": "ma_sp", "OldValue": null, "NewValue": ""},
    {"Name": "ma_module", "OldValue": null, "NewValue": ""},
    {"Name": "ma_kh", "OldValue": null, "NewValue": "<MÃ KH>"},
    {"Name": "stt_rec", "OldValue": null, "NewValue": "<STT_REC_KH>"},
    {"Name": "type", "OldValue": null, "NewValue": "1"},
    {"Name": "user_ref", "OldValue": null, "NewValue": ""},
    {"Name": "fileupload", "OldValue": null, "NewValue": ""},
    {"Name": "fileticket", "OldValue": null, "NewValue": ""},
    {"Name": "filekey", "OldValue": null, "NewValue": ""}
  ],
  "language": "v",
  "controller": "zccrAccountTask",
  "viewId": null,
  "gridController": "zccrAccountTask",
  "gridViewId": null,
  "cookie": "<fbmPayloadCookie>"
}
```

Điểm khác so với tạo KH: `values: []` (mảng rỗng, không cần stt_rec bất kỳ). `vars` chỉ có 2 phần tử (không có `viewParentController`). `authorized` dùng mã riêng cho zccrAccountTask (VD: `"1.9c3"`).

**Parse response thành công:**

```javascript
if (response.d.Bugs === null) {
  const iv = response.d.InternalValues;
  const id_moi = iv.find(v => v.Name === "id").NewValue;         // VD: 167080
  const owner = iv.find(v => v.Name === "owner").NewValue;       // "Lê Tuấn Anh"
  const nguoi_sua = iv.find(v => v.Name === "nguoi_sua").NewValue; // "ANHLT"
}
```

### 5.6 Sửa hoạt động

Gồm 2 bước.

**Bước 1 — Lấy dữ liệu hiện tại:**

```json
{
  "type": 0,
  "action": "Edit",
  "values": ["<ID hoạt động>"],
  "controller": "zccrAccountTask",
  "authorized": "<authorized_task>",
  "vars": [
    {"Name": "recordID", "Type": "String", "Value": ""},
    {"Name": "viewPageMode", "Type": "Boolean", "Value": false}
  ],
  "memvars": []
}
```

Response chứa `Row` (45 giá trị) và `Showing` script chứa `_ticket` — cần lưu ticket để gửi lại trong `fileticket` ở bước 2.

**Bước 2 — Gửi dữ liệu đã sửa:**

Giống tạo mới nhưng: `action: "Edit"`, `values: ["<ID>"]`, `OldValue` = giá trị từ bước 1, `id` NewValue = ID thật.

**Response khi sửa:** `InternalValues` trả về `id`, `start_date`, `end_date`, `nguoi_sua` nhưng KHÔNG trả `owner` (khác tạo mới).

### 5.7 Xóa hoạt động

Chỉ 1 request, giống xóa KH nhưng controller và authorized khác:

```json
{
  "type": 2,
  "parentType": "Dir",
  "firstView": false,
  "searchMode": false,
  "viewPage": true,
  "authorized": "<authorized_task>",
  "action": "Delete",
  "actionID": null,
  "values": ["<ID hoạt động>"],
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

Hoạt động bị xóa là HARD DELETE — biến mất hoàn toàn. ShinCRM cần so sánh danh sách ID hoạt động đã sync với danh sách mới — nếu thiếu thì đánh dấu "đã xóa trên FBM".

### 5.8 Phân trang cho zccrAccountTask

**Composite key:** `[end_date yyyyMMdd][datetime0 yyyyMMdd][id][line_nbr]`.

**gridPageValue:** `[end_date, datetime0, id, line_nbr]`.

Thường không cần phân trang vì mỗi KH ít khi có hơn 100 hoạt động.

---

