<!-- split-doc-source: 06. FBM INTEGRATION REFERENCE (Tài liệu tích hợp FBM).md -->
<!-- split-doc-headings: ## Chương 9. Quản trị Deal / Triển khai (zccrdmduanKD) -->
<!-- split-doc-lines: 1719-1972 -->

> Nội dung bên dưới được trích nguyên văn từ tài liệu gốc. Chỉ phần header này được thêm để định tuyến sau khi tách docs.
## Chương 9. Quản trị Deal / Triển khai (zccrdmduanKD)

### 9.1 Tổng quan

Controller `zccrdmduanKD` quản lý hợp đồng sau khi ký — theo dõi triển khai, nghiệm thu, thanh toán, bảo hành. Đây là module hoàn toàn khác với v2_crContract (danh sách HĐ ký mới). Mỗi khi click vào 1 dòng HĐ trong grid chính, FBM tự động load 7 bảng phụ.

Tổng số deal hiện tại: 168. Khóa chính nội bộ: `stt_rec_hd` (format `A` + 9 số). Liên kết với v2_crContract: qua `ma_hd` (mã hợp đồng). ShinCRM kéo dữ liệu từ module này để hiển thị trạng thái triển khai và tiến độ thanh toán.

**QUAN TRỌNG:** `stt_rec_hd` trong zccrdmduanKD KHÁC với `stt_rec_hd` trong v2_crContract cho cùng một hợp đồng. Ví dụ: HĐ `ALT260406FW01` có `stt_rec_hd = A000028016` trong v2_crContract nhưng `stt_rec_hd = A000021851` trong zccrdmduanKD. Khi join 2 bảng, PHẢI dùng `ma_hd` làm khóa, KHÔNG dùng `stt_rec_hd`.

### 9.2 Cấu trúc grid chính — 34 cột

| Index | AliasName | Tiêu đề | Type | Visible | Ghi chú |
|-------|-----------|---------|------|---------|---------|
| 0 | `stt_rec_hd` | _(ẩn)_ | String | Ẩn | PK dự án (khác v2_crContract!) |
| 1 | `ma_hd` | Mã hợp đồng | String | Có | KHÓA LIÊN KẾT với v2_crContract |
| 2 | `ten_kh` | Tên khách hàng | String | Có | |
| 3 | `ten_hd` | Tên hợp đồng | String | Ẩn | Thường = ten_kh |
| 4 | `nhom_trien_khai` | Nhóm triển khai | String | Có | VD: "TEAM-NGOCNTB" |
| 5 | `phong_trien_khai` | PTH | String | Có | "TV1", "TV2", "PDV" |
| 6 | `nv_trien_khai` | NV triển khai | String | Có | Mã NV |
| 7 | `ngay_chuyen` | Ngày chuyển TK | DateTime | Có | Ngày chuyển sang triển khai |
| 8 | `ngay_hl` | Ngày ký | DateTime | Có | |
| 9 | `gia_tri_hd` | Giá trị ký | Decimal | Có | Aggregate: Sum |
| 10 | `tien_da_thu` | Tiền đã thu | Decimal | Có | Aggregate: Sum |
| 11 | `tien_hd_da_xuat` | HĐ đã xuất | Decimal | Có | Aggregate: Sum |
| 12 | `tien_con_thu` | Thu tiền còn lại | Decimal | Có | Computed: = gia_tri - da_thu |
| 13 | `ngay_bd` | Bắt đầu TK | DateTime | Có | |
| 14 | `ngay_kh_nghiem_thu` | KH nghiệm thu | DateTime | Có | Kế hoạch |
| 15 | `ngay_kt` | Nghiệm thu | DateTime | Có | Thực tế |
| 16 | `ten_hh` | Sản phẩm | String | Có | |
| 17 | `phan_he` | Module | String | Có | |
| 18 | `ma_bcd` | Bản cài đặt | String | Có | VD: FA12, FAW24, FO |
| 19 | `ma_kh` | Mã KH | String | Ẩn | Format "KHxxxxxx" |
| 20 | `so_hd` | Số hợp đồng | String | Có | |
| 21 | `phap_nhan` | Pháp nhân | String | Ẩn | "1" = TNHH, "2" = CP |
| 22 | `ten_phap_nhan` | PN | String | Có | "TNHH", "CP" |
| 23 | `customer_signer_name` | Người ký | String | Có | = NV kinh doanh |
| 24 | `u_group` | PKD | String | Có | "KD1" |
| 25 | `phong_lap_trinh` | PLT | String | Có | "PLT1", "PLT2", "" |
| 26 | `gia_tri_gt` | Giảm trừ | Decimal | Ẩn | |
| 27 | `gia_tri_net` | Giá trị net | Decimal | Ẩn | |
| 28 | `ong_ba` | Người liên hệ | String | Có | Tên NLH phía KH |
| 29 | `dien_thoai` | Điện thoại | String | Có | SĐT NLH |
| 30 | `ten_cv` | Công việc | String | Có | Bước triển khai hiện tại |
| 31 | `ten_tthd` | Trạng thái | String | Có | Trạng thái triển khai |
| 32 | `ma_vv_kt` | Mã vụ việc KT | String | Ẩn | |
| 33 | `xorder` | _(ẩn)_ | String | Ẩn | |

### 9.3 Các bảng phụ (7 bảng)

Khi click vào 1 deal trên grid chính, FBM gửi 7 request song song để load 7 bảng phụ:

#### 9.3.1 zccrdmduanTaskKD — Lịch sử công việc triển khai (18 cột)

| Index | AliasName | Tiêu đề | Visible | Ghi chú |
|-------|-----------|---------|---------|---------|
| 0 | `id` | _(ẩn, PK)_ | Ẩn | |
| 1 | `ten_loai` | Loại | Ẩn | |
| 2 | `datetime0` | Ngày tạo | Có | |
| 3 | `ma_cv` | Mã CV | Có | |
| 4 | `ten_cv` | Tên công việc | Có | |
| 5 | `details` | Chi tiết | Có | |
| 6 | `start_date` | Ngày bắt đầu | Có | |
| 7 | `ngay_kh_tu` | KH duyệt | Ẩn | |
| 8 | `end_date` | Ngày TH đến | Ẩn | |
| 9 | `nguoi_th` | Người thực hiện | Ẩn | |
| 10 | `status` | Mã TT | Có | |
| 11 | `ten_tt` | Trạng thái | Có | |
| 12 | `owner` | Người tạo | Có | |
| 13 | `nguoi_sua` | Người sửa | Ẩn | |
| 14 | `line_nbr` | _(ẩn)_ | Ẩn | |
| 15 | `ca` | Buổi | Ẩn | |
| 16 | `phuong_thuc` | PT | Ẩn | |
| 17 | `so_ngay` | Số ngày | Ẩn | |

Mã công việc triển khai: `"07"` = Cài đặt, `"09"` = Đào tạo, `"05"`/`"21"` = Nghiệm thu.

#### 9.3.2 zccrdmduanThanhtoanKD — Thanh toán (12 cột)

| Index | AliasName | Tiêu đề | Ghi chú |
|-------|-----------|---------|---------|
| 0 | `id` | _(ẩn)_ | |
| 1 | `owner` | _(ẩn)_ | |
| 2 | `line_nbr` | _(ẩn)_ | |
| 3 | `lan_tt` | Lần TT | "1", "2" |
| 4 | `ngay_dk` | Ngày đề nghị | |
| 5 | `so_dk` | Số đề nghị | VD: "ALT260406FW01-1" |
| 6 | `tien_dk` | Giá trị | Decimal |
| 7 | `ma_dk` | Mã điều kiện | "01", "08" |
| 8 | `ngay_tt` | Ngày thanh toán | null = chưa thanh toán |
| 9 | `tien_tt` | Tiền thanh toán | |
| 10 | `ten_dk` | Tên điều kiện | "Tạm ứng sau khi ký hợp đồng", "Nghiệm thu toàn bộ" |
| 11 | `ten_tt` | Trạng thái | "Đã thanh toán", "Chưa đề nghị" |

#### 9.3.3 zccrdmduanHoadonKD — Hóa đơn (10 cột)

| Index | AliasName | Tiêu đề | Ghi chú |
|-------|-----------|---------|---------|
| 0 | `id` | _(ẩn)_ | |
| 1 | `owner` | _(ẩn)_ | |
| 2 | `line_nbr` | _(ẩn)_ | |
| 3 | `lan_tt` | Lần HĐ | |
| 4 | `ngay_tt` | Ngày xuất | |
| 5 | `tien_dk` | KH xuất | Decimal |
| 6 | `tien_tt` | Giá trị xuất | |
| 7 | `ma_dk` | Mã điều kiện | |
| 8 | `ten_dk` | Tên điều kiện | |
| 9 | `ten_tt` | Trạng thái | "Chưa xuất HĐ", "Đã xuất HĐ" |

#### 9.3.4 zccrdmduanFileKD — Tài liệu đính kèm (10 cột)

| Index | AliasName | Tiêu đề | Ghi chú |
|-------|-----------|---------|---------|
| 0 | `id` | _(ẩn)_ | |
| 1 | `stt_rec` | _(ẩn)_ | |
| 2 | `so_ct` | Số chứng từ | "KD", "TV2\\005207" |
| 3 | `so_dk` | Mã hợp đồng | |
| 4 | `ten_hd` | Tên hợp đồng | |
| 5 | `text` | Mô tả | "Tài liệu kinh doanh", "KHTK", "BBNT+TTKN+BQ" |
| 6 | `datetime0` | Ngày tạo | |
| 7 | `tinh_trang` | Tình trạng | "Tiếp nhận", "" |
| 8 | `owner` | Người tạo | |
| 9 | `line_nbr` | _(ẩn)_ | |

#### 9.3.5 Các bảng phụ còn lại

`zccrdmduanKehoachKD` (Kế hoạch triển khai, 11 cột), `zccrdmduanKehoachTuanKD` (Kế hoạch tuần, 13 cột), `zccrdmduanUsersKD` (Người dùng KH, 12 cột — gồm hoten, dien_thoai, email, phong_ban, vi_tri, modul_sd, ghi_chu). Cả 3 đều rỗng trong data mẫu.

### 9.4 externalKey bắt buộc

Deal dùng cơ chế phân quyền qua bảng `dmhd_load`, khác cả zccrAccount và v2_crContract:

```
exists (select 1 from dmhd_load a where a.stt_rec_hd = vdmhd.stt_rec_hd and user_id = 2037) and 1
```

Thay `2037` bằng userId thực tế.

### 9.5 Lấy danh sách deal

```json
{
  "type": 0,
  "count": 2000,
  "language": "v",
  "controller": "zccrdmduanKD",
  "viewId": null,
  "childObject": false,
  "lastPageIndex": -1,
  "firstPageItem": "",
  "lastPageItem": "",
  "lastRowCount": 0,
  "memvars": [{"Name": "user_id", "OldValue": null, "NewValue": ""}],
  "externalKey": [{
    "Name": " exists (select 1 from dmhd_load a where a.stt_rec_hd = vdmhd.stt_rec_hd and user_id =2037) and 1",
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

Lấy bảng phụ cho 1 deal cụ thể: dùng cùng endpoint `GetGridViewPage`, thay `controller` bằng tên bảng phụ (VD: `"zccrdmduanThanhtoanKD"`), `externalKey` lọc theo `stt_rec_hd` của deal đó (KHÔNG phải stt_rec_hd của v2_crContract).

### 9.6 Lấy tổng tiền (GetGridResponse — TotalAmount)

**Endpoint:** `POST /AppService/FastBusiness.ReportExtenderService.asmx/GetGridResponse`

```json
{
  "actionID": "TotalAmount",
  "values": [
    {"Name": "userLogin", "Type": "String", "Value": "2037"},
    {"Name": "userFind", "Type": "String", "Value": "2037"},
    {"Name": "type", "Type": "String", "Value": 0}
  ],
  "controller": "zccrdmduanKD",
  "language": "v",
  "element": null
}
```

**Response:**
```json
{
  "d": {
    "Row": [
      {"Name": "gia_tri_hd", "Value": 136755600.0},
      {"Name": "tien_da_thu", "Value": 73005600.0},
      {"Name": "tien_hd_da_xuat", "Value": 9540000.0},
      {"Name": "tien_con_thu", "Value": 63750000.0}
    ]
  }
}
```

Hữu ích cho ShinCRM hiển thị dashboard tài chính tổng quan.

### 9.7 Liên kết deal ↔ hợp đồng ↔ khách hàng

Chuỗi liên kết đầy đủ:

```
zccrAccount (KH)
    ↕ liên kết qua ma_so_thue
v2_crContract (HĐ ký kết)
    ↕ liên kết qua ma_hd
zccrdmduanKD (Deal triển khai)
```

Cụ thể: `zccrAccount.ma_so_thue = v2_crContract.ma_so_thue` (liên kết KH ↔ HĐ). `v2_crContract.ma_hd = zccrdmduanKD.ma_hd` (liên kết HĐ ↔ Deal). Không dùng `stt_rec_hd` để join vì giá trị khác nhau giữa v2_crContract và zccrdmduanKD.

**Trường bổ sung từ zccrdmduanKD mà v2_crContract không có:** nhom_trien_khai, phong_trien_khai, nv_trien_khai, tien_da_thu, tien_hd_da_xuat, tien_con_thu, ngay_bat_dau_tk, ngay_kh_nghiem_thu, ngay_nghiem_thu, ong_ba (NLH), dien_thoai, ten_cv (bước triển khai), ten_tthd (trạng thái triển khai), ten_phap_nhan.

**Trường bổ sung từ v2_crContract mà zccrdmduanKD không có:** ten_loaihd (Ký mới/Nâng cấp/Bổ sung), ten_nguon (nguồn đầu mối), nguoi_tim (NV giới thiệu), ly_do (lý do chọn Fast).

### 9.8 Danh mục trạng thái và bước công việc triển khai

**Trạng thái triển khai (ten_tthd):**

| Giá trị | Ý nghĩa |
|---------|---------|
| Đang thực hiện | Đang triển khai |
| Đã nghiệm thu | Hoàn thành, KH đã nghiệm thu |
| Đang bảo hành | Sau nghiệm thu, trong thời gian bảo hành |
| Treo | Tạm dừng |
| Chưa thực hiện | Chưa bắt đầu |

**Bước công việc triển khai (ten_cv):**

| Giá trị | Ý nghĩa |
|---------|---------|
| Cài đặt | Bước đầu |
| Đào tạo, HDSD | Đào tạo sử dụng |
| Lập trình chỉnh sửa đặc thù | Tùy chỉnh |
| Nghiệm thu toàn bộ | Bước cuối |
| Liên hệ, chốt kế hoạch | Chuẩn bị |
| Cập nhật công việc định kỳ | Bảo trì |
| Hỗ trợ, bảo hành, bảo trì PM | Hậu mãi |
| Thúc đẩy tiến độ HĐ treo, tạm dừng, chưa thực hiện | Theo dõi |

---

