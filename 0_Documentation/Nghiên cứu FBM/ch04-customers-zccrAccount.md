<!-- split-doc-source: 06. FBM INTEGRATION REFERENCE (Tài liệu tích hợp FBM).md -->
<!-- split-doc-headings: ## Chương 4. Khách hàng (zccrAccount) -->
<!-- split-doc-lines: 724-1194 -->

> Nội dung bên dưới được trích nguyên văn từ tài liệu gốc. Chỉ phần header này được thêm để định tuyến sau khi tách docs.
## Chương 4. Khách hàng (zccrAccount)

### 4.1 Tổng quan

Controller `zccrAccount` quản lý toàn bộ hồ sơ khách hàng trên FBM. Đây là bảng dữ liệu chính và lớn nhất, hiện có khoảng 1.700 khách hàng (với tài khoản ANHLT, mã NV 2037).

Bảng database gốc: `crkh` (bảng), `vcrkh` (view). Khóa chính nội bộ: `stt_rec_kh` (format: `A` + 9 chữ số, ví dụ `A000076128`). Khóa hiển thị: `ma_kh` (8 ký tự chữ+số, ví dụ `TLP20855`, `ALT00490`). Sort mặc định: `ngay_gd desc, datetime0 desc, xorder`.

Phân biệt `stt_rec_kh` và `ma_kh`: `stt_rec_kh` là khóa chính nội bộ, người dùng không nhìn thấy trên giao diện, dùng khi gọi API (truy vấn giao dịch, mở form sửa, xóa). `ma_kh` là mã hiển thị, server tự sinh theo quy tắc prefix + số tự tăng, không tự đặt được.

### 4.2 Cấu trúc grid — 28 cột

Khi gọi `GetGridViewPage` với `controller: "zccrAccount"`, mỗi dòng trong `Rows[]` là mảng 28 giá trị theo thứ tự cố định sau:

| Index | AliasName | Tiêu đề hiển thị | Type | Visible | MaxLen | Ghi chú |
|-------|-----------|------------------|------|---------|--------|---------|
| 0 | `stt_rec_kh` | _(ẩn)_ | String | Ẩn | — | PK nội bộ, format A+9 số |
| 1 | `ma_kh` | Mã khách | String | Có | 8 | Mã hiển thị, server tự sinh |
| 2 | `ten_kh` | Tên khách hàng | String | Có | 1000 | |
| 3 | `ma_so_thue` | Mã số thuế | String | Có | 32 | |
| 4 | `ong_ba` | Người liên hệ | String | Có | 256 | Tên người liên hệ chính |
| 5 | `dc_lh` | Địa chỉ | String | Ẩn | — | Địa chỉ liên hệ |
| 6 | `dien_thoai` | Điện thoại | String | Có | 52 | |
| 7 | `email` | Email | String | Có | 256 | |
| 8 | `ten_tt` | Trạng thái KH | String | Có | 128 | Tên hiển thị (không phải mã) |
| 9 | `website` | Trang chủ | String | Ẩn | — | |
| 10 | `ten_lv` | Lĩnh vực | String | Có | 128 | Tên lĩnh vực KD |
| 11 | `ten_qmo` | Quy mô n/sự | String | Có | 128 | Tên quy mô DN |
| 12 | `ten_dclh_tinh` | Tỉnh/thành | String | Có | 128 | Tên tỉnh |
| 13 | `ten_loai` | Phân loại KH | String | Có | 128 | Tên phân loại (kèm mã, VD "07. Thực phẩm") |
| 14 | `nh_kh1` | Nhóm 1 | String | Có | 8 | |
| 15 | `nh_kh2` | Nhóm 2 | String | Có | 8 | |
| 16 | `nh_kh3` | Nhóm 3 | String | Có | 8 | |
| 17 | `ten_cv` | Công việc | String | Có | 128 | Công việc/hoạt động gần nhất, null = chưa có hoạt động |
| 18 | `ten_nguon_dm` | Nguồn tiềm năng | String | Có | 128 | Tên nguồn |
| 19 | `nv_tele` | NV Marketing | String | Có | 32 | Mã NV (VD: THAOLP) |
| 20 | `nv_kd` | NV Kinh doanh | String | Có | 32 | Mã NV (VD: ANHLT) |
| 21 | `ten_sp` | Sản phẩm | String | Có | 128 | |
| 22 | `ten_module` | Module | String | Có | 128 | |
| 23 | `ngay_gd` | Ngày gd cuối | DateTime | Có | — | Format `/Date(ms)/` |
| 24 | `ngay_kh` | Ngày kh cuối | DateTime | Có | — | Có thể là null placeholder (1899) |
| 25 | `datetime0` | Ngày tạo | DateTime | Có | — | |
| 26 | `nguoi_sua` | Người sửa | String | Ẩn | — | Mã NV sửa cuối (null = chưa sửa) |
| 27 | `xorder` | _(ẩn)_ | String | Ẩn | — | Thứ tự sắp xếp, 12 ký tự padding zero |

**Lưu ý quan trọng:** Grid trả về TÊN hiển thị cho các trường dropdown (ví dụ `ten_tt` = "Đang chăm sóc", `ten_nguon_dm` = "KD - Tự tìm"). Khi cần gửi lại FBM (tạo/sửa), phải dùng MÃ tương ứng (ví dụ `ma_tt` = "CS", `nguon_dm` = "KDTUTIM"). Bảng mapping mã ↔ tên đầy đủ ở Chương 11.13.

### 4.3 Cấu trúc form — 64 trường (46 memvars)

Khi mở form chi tiết KH (qua `GetDirViewPage` action Edit), response trả về `Row` gồm 64 giá trị. Khi lưu KH (tạo mới hoặc sửa), payload `memvars` gồm 46 trường. Dưới đây là danh sách trường trên form, kèm index trong Row và thông tin bắt buộc.

**Nhóm nhận diện:**

| Index trong Row | Tên trường memvars | Tiêu đề | Bắt buộc | Loại nhập | Ghi chú |
|-----------------|-------------------|---------|----------|-----------|---------|
| 0 | `stt_rec_kh` | — | — | Server tự sinh | PK, rỗng khi tạo mới, có giá trị khi sửa |
| 1 | `stt_rec_kh0` | — | Không | Tự động | stt_rec_kh của KH mẹ |
| 2 | `user_ref` | — | — | Server tự gán | Mã phân cấp NV |
| 3 | `ma_kh` | Mã khách | — | Server tự sinh | Lấy từ `_ma_kh_auto` trong ClientScript |

**Nhóm thông tin chính:**

| Index | Tên trường | Tiêu đề | Bắt buộc | MaxLen | Ghi chú |
|-------|-----------|---------|----------|--------|---------|
| 4 | `ten_kh` | Tên khách hàng | **CÓ** | 1000 | |
| 5 | `kh_me` | KH mẹ | Không | — | Mã KH công ty mẹ (dropdown crAccount) |
| 6 | `ten_kh_me` | _(tên KH mẹ)_ | — | — | Chỉ đọc, server trả khi mở form |
| 7 | `ngay_tl` | Ngày thành lập | Không | — | DateTime |
| 8 | `ma_so_thue` | Mã số thuế | **CÓ** | 32 | Server kiểm tra trùng khi lưu |
| 9 | `ong_ba` | Người liên hệ | **CÓ** | 256 | |
| 10 | `chuc_danh` | Chức danh | Không | — | |

**Nhóm liên hệ:**

| Index | Tên trường | Tiêu đề | Bắt buộc | MaxLen | Ghi chú |
|-------|-----------|---------|----------|--------|---------|
| 11 | `dien_thoai` | Điện thoại | **CÓ** | 52 | Phải là SĐT hợp lệ (chỉ chứa số), server validate |
| 12 | `fax` | Fax | Không | — | |
| 13 | `email` | Email | Không | 256 | |
| 14 | `website` | Trang chủ | Không | — | |

**Nhóm phân loại:**

| Index | Tên trường | Tiêu đề | Bắt buộc | Ghi chú |
|-------|-----------|---------|----------|---------|
| 15 | `ma_lvkd` | Lĩnh vực KD | Không | Dropdown crIndustry, gửi mã (VD: `"06"`) |
| 16 | _(ten_lv)_ | — | — | Chỉ đọc, tên hiển thị |
| 17 | `qm_ns` | Quy mô | Không | Dropdown crdmqmo, gửi mã (VD: `"SN"`) |
| 18 | _(ten_qmo)_ | — | — | Chỉ đọc |
| 19 | `sl_kt` | Số lượng kế toán | Không | Number, đặc thù ngành phần mềm kế toán |
| 20 | `loai_kh` | Phân loại KH | Không | Dropdown crAccountType, gửi mã (VD: `"06"`) |
| 21 | _(ten_loai)_ | — | — | Chỉ đọc |
| 22 | `nguon_dm` | Nguồn tiềm năng | **CÓ** | Dropdown crLeadSource, gửi mã (VD: `"KDTUTIM"`) |
| 23 | _(ten_nguon_dm)_ | — | — | Chỉ đọc |

**Nhóm địa chỉ:**

| Index | Tên trường | Tiêu đề | Bắt buộc | Ghi chú |
|-------|-----------|---------|----------|---------|
| 24 | `dc_lh` | Địa chỉ | **CÓ** | |
| 25 | `dc_lh_tinh` | Tỉnh/thành | **CÓ** | Dropdown crProvinceCity, gửi mã (VD: `"HNI"`) |
| 26 | _(ten_dclh_tinh)_ | — | — | Chỉ đọc |
| 27 | `dc_lh_quan` | Quận/huyện | Không | Dropdown crDistrict, filter theo tỉnh |
| 28 | _(ten_dclh_quan)_ | — | — | Chỉ đọc |
| 29 | `dc_lh_qg` | Quốc gia | Không | Dropdown crCountry, mặc định `"VN"` |
| 30 | _(ten_qg)_ | — | — | Chỉ đọc |
| 31 | `dc_gh` | ĐC xuất hóa đơn | Không | |

**Nhóm nhãn và nghiệp vụ:**

| Index | Tên trường | Tiêu đề | Bắt buộc | Ghi chú |
|-------|-----------|---------|----------|---------|
| 32 | `nh_kh1` | Nhóm 1 | Không | Max 8 ký tự |
| 33 | `nh_kh2` | Nhóm 2 | Không | Max 8 ký tự |
| 34 | `nh_kh3` | Nhóm 3 | Không | Max 8 ký tự |
| 35 | `ma_sp` | Sản phẩm | Không | Mã sản phẩm |
| 36 | _(ten_sp)_ | — | — | Chỉ đọc |
| 37 | `ma_module` | Module | Không | |
| 38 | `ma_cv` | Công việc | Không | Dropdown crJob, mã công việc |
| 39 | _(ten_cv)_ | — | — | Chỉ đọc |
| 40-43 | — | — | — | Trường phụ chưa dùng trong ShinCRM Phase 2; không map vào cột chính, chỉ giữ trong FBM raw data nếu response có giá trị. |
| 44 | `ghi_chu` | Ghi chú | Không | |

**Nhóm trạng thái:**

| Index | Tên trường | Tiêu đề | Bắt buộc | Ghi chú |
|-------|-----------|---------|----------|---------|
| 45 | `ma_tt` | Trạng thái | Không | Dropdown crLeadStatus, gửi mã (VD: `"CS"`) |
| 46 | _(ten_tt)_ | — | — | Chỉ đọc |
| 47 | `status` | Status active/conversion | — | `1`=Hoạt động, `2`=Đã chuyển đổi, `3`=Không hoạt động; khi tạo mới gửi `"1"`. Không dùng để xác định `care_status`. |

**Nhóm NV phụ trách:**

| Index | Tên trường | Tiêu đề | Bắt buộc | Ghi chú |
|-------|-----------|---------|----------|---------|
| 54 | `nv_kd` | NV Kinh doanh | Không | Mã NV |
| 55 | `nv_tele` | NV Marketing | Không | Mã NV |

**Nhóm thời gian (server quản lý):**

| Index | Tên trường | Tiêu đề | Ghi chú |
|-------|-----------|---------|---------|
| 56 | `ngay_gd` | Ngày gd cuối | Server tự cập nhật |
| 57 | `ngay_kh` | Ngày kh cuối | Server tự cập nhật |
| 58 | `datetime0` | Ngày tạo | Server tự gán khi tạo mới |
| 59 | `nguoi_sua` | Người sửa | Server tự gán = mã NV đang đăng nhập |

**Nhóm khác:**

| Index | Tên trường | Tiêu đề | Ghi chú |
|-------|-----------|---------|---------|
| 60 | `nguoi_tim` | Người tìm | Không bắt buộc |
| 62 | `id` | — | Luôn `0` |
| 63 | `ds_ma_hd` | DS mã hợp đồng | Danh sách mã HĐ liên kết, lấy qua GetDirResponse "ContactRef" |

**Tóm tắt trường bắt buộc khi tạo KH mới trên FBM:** `ten_kh` (tên KH), `ma_so_thue` (MST), `ong_ba` (người liên hệ), `dien_thoai` (SĐT, chỉ số), `nguon_dm` (mã nguồn tiềm năng), `dc_lh` (địa chỉ), `dc_lh_tinh` (mã tỉnh/thành).

### 4.4 Lấy danh sách khách hàng

**Payload:**

```json
{
  "type": 0,
  "count": 2000,
  "language": "v",
  "controller": "zccrAccount",
  "viewId": null,
  "childObject": false,
  "lastPageIndex": -1,
  "firstPageItem": "",
  "lastPageItem": "",
  "lastRowCount": 0,
  "memvars": [{"Name": "user_id", "OldValue": null, "NewValue": ""}],
  "externalKey": [{
    "Name": "stt_rec_kh in (select stt_rec_kh from dbo.zcFastBusiness$Function$GetCustomerValidate('2037')) and 1",
    "Opr": "=",
    "Value": 1,
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

Dùng `type: 0` lần đầu để lấy cả metadata (ViewPage.Fields). Các lần sau dùng `type: 1`. `count: 2000` lấy toàn bộ KH trong 1 request (đã test thành công). `externalKey` chứa điều kiện phân quyền — thay `'2037'` bằng userId thực tế. `memvars` gửi `user_id` rỗng (FBM yêu cầu, không ảnh hưởng kết quả). `gridPageIndex: -1` = trang đầu tiên.

**Parse response:**

```javascript
const data = response.d;
const totalCount = data.TotalRowCount;
const rows = data.Rows;

rows.forEach(row => {
  const kh = {
    stt_rec_kh:    row[0],
    ma_kh:         row[1],
    ten_kh:        row[2],
    ma_so_thue:    row[3],
    ong_ba:        row[4],
    dc_lh:         row[5],
    dien_thoai:    row[6],
    email:         row[7],
    ten_tt:        row[8],
    website:       row[9],
    ten_lv:        row[10],
    ten_qmo:       row[11],
    ten_dclh_tinh: row[12],
    ten_loai:      row[13],
    nh_kh1:        row[14],
    nh_kh2:        row[15],
    nh_kh3:        row[16],
    ten_cv:        row[17],
    ten_nguon_dm:  row[18],
    nv_tele:       row[19],
    nv_kd:         row[20],
    ten_sp:        row[21],
    ten_module:    row[22],
    ngay_gd:       parseFBMDate(row[23]),
    ngay_kh:       parseFBMDate(row[24]),
    datetime0:     parseFBMDate(row[25]),
    nguoi_sua:     row[26],
    xorder:        row[27]
  };
});

function parseFBMDate(dateStr) {
  if (!dateStr) return null;
  const match = dateStr.match(/-?\d+/);
  if (!match) return null;
  const ms = parseInt(match[0], 10);
  const date = new Date(ms);
  if (date.getFullYear() <= 1900) return null;
  return date;
}
```

### 4.5 Tạo khách hàng mới

Tạo KH mới trên FBM gồm 2 bước.

**Bước 1 — Mở form lấy mã KH tự sinh:**

```json
{
  "type": 0,
  "parentType": "Dir",
  "firstView": false,
  "searchMode": false,
  "viewPage": true,
  "authorized": "<authorized_kh>",
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

`values` để mảng rỗng `[]` là được — server vẫn mở form và sinh mã KH bình thường (đã test thực tế: `values:[]` với `viewPage:true` trả về `Bugs:null`, không có lỗi NotAuthorized). Không cần truyền stt_rec_kh của KH nào.

Parse response: `response.d.ClientScript` chứa `_ma_kh_auto = 'ALT00490'` — đây là mã KH tự sinh. Trích xuất bằng regex `/_ma_kh_auto\s*=\s*'([^']+)'/`.

**Bước 2 — Gửi dữ liệu KH mới:**

```json
{
  "type": 1,
  "parentType": "Dir",
  "firstView": false,
  "searchMode": false,
  "viewPage": true,
  "authorized": "<authorized_kh>",
  "action": "New",
  "actionID": null,
  "values": ["<stt_rec_kh bất kỳ>"],
  "vars": [
    {"Name": "recordID", "Type": "String", "Value": ""},
    {"Name": "viewPageMode", "Type": "Boolean"},
    {"Name": "viewParentController", "Type": "String", "Value": ""}
  ],
  "memvars": [
    {"Name": "stt_rec_kh", "OldValue": null, "NewValue": ""},
    {"Name": "stt_rec_kh0", "OldValue": null, "NewValue": ""},
    {"Name": "user_ref", "OldValue": null, "NewValue": ""},
    {"Name": "ma_kh", "OldValue": null, "NewValue": "<mã từ bước 1>"},
    {"Name": "ten_kh", "OldValue": null, "NewValue": "<TÊN KH>"},
    {"Name": "kh_me", "OldValue": null, "NewValue": ""},
    {"Name": "ngay_tl", "OldValue": null, "NewValue": null},
    {"Name": "ma_so_thue", "OldValue": null, "NewValue": "<MST>"},
    {"Name": "ong_ba", "OldValue": null, "NewValue": "<NGƯỜI LIÊN HỆ>"},
    {"Name": "chuc_danh", "OldValue": null, "NewValue": ""},
    {"Name": "dien_thoai", "OldValue": null, "NewValue": "<SĐT - CHỈ SỐ>"},
    {"Name": "fax", "OldValue": null, "NewValue": ""},
    {"Name": "email", "OldValue": null, "NewValue": ""},
    {"Name": "website", "OldValue": null, "NewValue": ""},
    {"Name": "ma_lvkd", "OldValue": null, "NewValue": ""},
    {"Name": "qm_ns", "OldValue": null, "NewValue": ""},
    {"Name": "sl_kt", "OldValue": null, "NewValue": 0},
    {"Name": "loai_kh", "OldValue": null, "NewValue": ""},
    {"Name": "nguon_dm", "OldValue": null, "NewValue": "<MÃ NGUỒN>"},
    {"Name": "dc_lh", "OldValue": null, "NewValue": "<ĐỊA CHỈ>"},
    {"Name": "dc_lh_tinh", "OldValue": null, "NewValue": "<MÃ TỈNH>"},
    {"Name": "dc_lh_quan", "OldValue": null, "NewValue": ""},
    {"Name": "dc_lh_qg", "OldValue": null, "NewValue": "VN"},
    {"Name": "dc_gh", "OldValue": null, "NewValue": ""},
    {"Name": "nh_kh1", "OldValue": null, "NewValue": ""},
    {"Name": "nh_kh2", "OldValue": null, "NewValue": ""},
    {"Name": "nh_kh3", "OldValue": null, "NewValue": ""},
    {"Name": "ma_cv", "OldValue": null, "NewValue": ""},
    {"Name": "ma_sp", "OldValue": null, "NewValue": ""},
    {"Name": "ma_module", "OldValue": null, "NewValue": ""},
    {"Name": "ghi_chu", "OldValue": null, "NewValue": ""},
    {"Name": "ma_tt", "OldValue": null, "NewValue": "CS"},
    {"Name": "status", "OldValue": null, "NewValue": "1"},
    {"Name": "controller", "OldValue": null, "NewValue": "zccrAccount"},
    {"Name": "parentController", "OldValue": null, "NewValue": ""},
    {"Name": "nv_kd", "OldValue": null, "NewValue": ""},
    {"Name": "nv_tele", "OldValue": null, "NewValue": ""},
    {"Name": "ngay_gd", "OldValue": null, "NewValue": null},
    {"Name": "ngay_kh", "OldValue": null, "NewValue": null},
    {"Name": "datetime0", "OldValue": null, "NewValue": null},
    {"Name": "nguoi_sua", "OldValue": null, "NewValue": ""},
    {"Name": "nguoi_tim", "OldValue": null, "NewValue": ""},
    {"Name": "id", "OldValue": null, "NewValue": 0},
    {"Name": "ds_ma_hd", "OldValue": null, "NewValue": ""}
  ],
  "language": "v",
  "controller": "zccrAccount",
  "viewId": null,
  "gridController": "zccrAccount",
  "gridViewId": null,
  "cookie": "<fbmPayloadCookie>"
}
```

Khi tạo mới: tất cả `OldValue` là `null`, `stt_rec_kh` NewValue rỗng (server tự sinh), `status` = `"1"`.

**Parse response thành công:**

```javascript
if (response.d.Bugs === null) {
  const iv = response.d.InternalValues;
  const stt_rec_kh_moi = iv.find(v => v.Name === "stt_rec_kh").NewValue;
  const ma_kh = iv.find(v => v.Name === "ma_kh").NewValue;
  const datetime0 = iv.find(v => v.Name === "datetime0").NewValue;
  const nguoi_sua = iv.find(v => v.Name === "nguoi_sua").NewValue;
}
```

### 4.6 Sửa khách hàng

Sửa KH cũng gồm 2 bước.

**Bước 1 — Mở form sửa, lấy dữ liệu hiện tại:**

Giống payload bước 1 tạo mới nhưng `action: "Edit"` và `values: ["<stt_rec_kh cần sửa>"]`. Response chứa `Row` gồm 64 giá trị — đây là dữ liệu hiện tại, dùng làm `OldValue` cho bước 2.

**Bước 2 — Gửi dữ liệu đã sửa:**

Giống payload bước 2 tạo mới nhưng: `action: "Edit"`, `values: ["<stt_rec_kh>"]`, mỗi memvar có `OldValue` = giá trị hiện tại từ bước 1, `NewValue` = giá trị mới (giống OldValue nếu không sửa), `stt_rec_kh` NewValue = PK thật (không rỗng), `status` = giá trị hiện tại (VD `"2"`).

**Response khi sửa khác tạo mới:** `InternalValues` KHÔNG trả về `stt_rec_kh` và `datetime0` (vì không thay đổi). Chỉ trả `nguoi_sua`, `nv_tele`, `nv_kd`.

### 4.7 Xóa khách hàng

Chỉ cần 1 request duy nhất, không cần mở form trước.

```json
{
  "type": 2,
  "parentType": "Dir",
  "firstView": false,
  "searchMode": false,
  "viewPage": true,
  "authorized": "<authorized_kh>",
  "action": "Delete",
  "actionID": null,
  "values": ["<stt_rec_kh cần xóa>"],
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

Response: `Bugs === null` = xóa thành công. KH bị xóa mềm (soft delete) — prefix `stt_rec_kh` đổi thành `Z`, record vẫn tồn tại trong DB nhưng bị ẩn khỏi danh sách.

### 4.8 Tìm kiếm khách hàng

Tìm kiếm KH chính là `GetGridViewPage` với mảng `filter` không rỗng. Payload giống mục 4.4 nhưng thêm `filter` và đặt `gridPageIndex: -2`.

```json
{
  "filter": ["ma_so_thue:**0107346145"],
  "gridPageIndex": -2,
  "gridPageValue": null,
  "count": 100
}
```

Xem chi tiết cú pháp filter ở mục 3.5.

### 4.9 Kiểm tra hợp lệ mã số thuế và số điện thoại khi lưu

FBM validate mã số thuế (MST) và số điện thoại (SĐT) tại thời điểm lưu (không phải realtime). Có ba loại lỗi có thể trả về khi tạo/sửa KH: **trùng MST**, **sai định dạng MST**, và **sai định dạng SĐT**. Trong mọi trường hợp lỗi, response trả về với toàn bộ các trường dữ liệu là `null` và thông tin lỗi nằm trong `Bugs` (gồm `FieldName` và `Message`).

**4.9.1 Trùng mã số thuế**

Khi gửi request tạo/sửa KH với MST đã tồn tại trong hệ thống, response trả:

```json
{
  "d": {
    "Bugs": {
      "FieldName": "ma_so_thue",
      "Message": "Mã số thuế <span class=\"Highlight\">0100100590</span> đã có trong danh mục."
    }
  }
}
```

Kiểm tra là exact match trên toàn hệ thống (không chỉ KH của NV hiện tại). FBM chặn trùng MST cho mọi giá trị, không có ngoại lệ. Điều này có nghĩa: MST trùng có thể thuộc KH do mình đang quản lý, hoặc thuộc KH do NV kinh doanh khác quản lý. ShinCRM cần ghi log trường hợp trùng MST và xử lý theo Tài liệu 2 — Domain Specification, mục 6.1 (chống trùng) và 6.4 (quy tắc đẩy KH lên FBM).

**4.9.2 Sai định dạng mã số thuế / số điện thoại**

FBM validate định dạng MST và SĐT **chung một nhóm quy tắc**. Vì vậy khi MST sai định dạng, thông báo lỗi vẫn nhắc cả "số điện thoại", và `FieldName` trả về là `ma_so_thue`. Đây là đặc thù của FBM, không phải lỗi client.

Sai định dạng mã số thuế:

```json
{
  "d": {
    "Bugs": {
      "FieldName": "ma_so_thue",
      "Message": "Mã số thuế hoặc số điện thoại không hợp lệ không hợp lệ"
    }
  }
}
```

Sai định dạng số điện thoại:

```json
{
  "d": {
    "Bugs": {
      "FieldName": "dien_thoai",
      "Message": "Số điện thoại không hợp lệ không hợp lệ"
    }
  }
}
```

Sai định dạng cả MST và SĐT — FBM chỉ trả về **một lỗi duy nhất**, ưu tiên báo ở `ma_so_thue`:

```json
{
  "d": {
    "Bugs": {
      "FieldName": "ma_so_thue",
      "Message": "Mã số thuế hoặc số điện thoại không hợp lệ không hợp lệ"
    }
  }
}
```

Lưu ý: FBM validate tuần tự và dừng ở lỗi đầu tiên, nên khi cả hai trường cùng sai, chỉ nhận được lỗi của `ma_so_thue`. Sau khi người dùng sửa MST và gửi lại, nếu SĐT vẫn sai thì lần đó mới nhận được lỗi `dien_thoai`. Do đó không thể dựa vào một lần response để biết hết mọi trường sai — cần validate đầy đủ ở phía ShinCRM trước khi đẩy lên FBM. Ngoài ra chuỗi `Message` bị lặp cụm "không hợp lệ không hợp lệ" (lỗi ghép chuỗi từ phía FBM); ShinCRM không nên hiển thị nguyên văn message này cho người dùng mà nên map theo `FieldName` sang thông báo chuẩn của mình.

**4.9.3 Phân biệt trùng MST và sai định dạng MST**

Cả hai loại lỗi này đều có `FieldName: "ma_so_thue"`, phải phân biệt qua nội dung `Message`: chứa cụm "đã có trong danh mục" là **trùng MST**, còn chứa cụm "không hợp lệ" là **sai định dạng**.

**4.9.4 Chiến lược cho ShinCRM**

Trước khi đẩy KH mới lên FBM, nên validate định dạng ở phía ShinCRM để giảm số request lỗi: MST đúng độ dài, chỉ chứa số, đúng cấu trúc 10 hoặc 13 chữ số; SĐT chỉ chứa số (theo mục 4.3, trường `dien_thoai`). Việc này đặc biệt quan trọng vì FBM chỉ báo một lỗi mỗi lần, nếu không validate trước sẽ phải gửi lại nhiều lần.

Về chống trùng MST, có thể chủ động kiểm tra bằng filter `["ma_so_thue:**<MST đầy đủ>"]` rồi verify exact match trong kết quả (vì filter `**` là contains, không phải exact match). Nếu đã tồn tại và KH đó do mình quản lý: lấy `stt_rec_kh` để cập nhật thay vì tạo mới. Nếu đã tồn tại nhưng KH đó do NV khác quản lý: ghi log, thông báo theo quy tắc, không tự động tạo/cập nhật. Nếu FBM trả lỗi trùng MST khi lưu (không kiểm tra trước): ghi log lỗi, đưa vào hàng chờ xử lý thủ công.

### 4.10 Phân trang cho zccrAccount

**Composite key** cho firstPageItem/lastPageItem: `[ngay_gd yyyyMMdd][datetime0 yyyyMMdd][xorder 15 ký tự][stt_rec_kh 10 ký tự]`. Ví dụ: `2026040920260401000000000332A000076128`.

**gridPageValue** khi chuyển trang: mảng 4 giá trị từ dòng cuối trang hiện tại: `[ngay_gd, datetime0, xorder, stt_rec_kh]`. Ngày ở dạng `/Date(ms)/`.

Với tổng ~1.700 KH, có thể dùng `count: 2000` để lấy hết trong 1 request, không cần phân trang.

### 4.11 Chiến lược đồng bộ incremental

Sort mặc định là `ngay_gd desc` — KH có giao dịch gần nhất lên đầu. ShinCRM lưu timestamp lần sync cuối, rồi kéo từ trang 1, so sánh `ngay_gd` và `datetime0` với timestamp đó. Khi gặp record cũ hơn timestamp sync cuối thì dừng. Cách này giảm thiểu số request và lượng data truyền tải.

### 4.12 Sắp xếp (Sort) cho zccrAccount

Dùng trường `sortExpression` trong payload. Ví dụ: `"ngay_gd desc"` (mới nhất trước), `"ma_kh asc"` (mã KH A→Z), `"ten_kh asc"` (tên A→Z), `"datetime0 asc"` (cũ nhất trước).

Khi thay đổi sort, gửi `gridPageIndex: 0`, `gridPageValue: null` để reset hoàn toàn. Sort kết hợp được với filter.

Các cột đã xác nhận sort được: `ngay_gd`, `datetime0`, `ma_kh`, `ten_kh`, `dien_thoai`, `ten_nguon_dm`.

---

