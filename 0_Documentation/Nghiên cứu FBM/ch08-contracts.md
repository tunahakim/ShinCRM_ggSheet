<!-- split-doc-source: 06. FBM INTEGRATION REFERENCE (Tài liệu tích hợp FBM).md -->
<!-- split-doc-headings: ## Chương 8. Hợp đồng ký kết (v2_crContract) -->
<!-- split-doc-lines: 1581-1718 -->

> Nội dung bên dưới được trích nguyên văn từ tài liệu gốc. Chỉ phần header này được thêm để định tuyến sau khi tách docs.
## Chương 8. Hợp đồng ký kết (v2_crContract)

### 8.1 Tổng quan

Controller `v2_crContract` quản lý danh sách hợp đồng đã ký với khách hàng. Đây là module chỉ đọc từ phía ShinCRM (Phase 2) — ShinCRM kéo dữ liệu hợp đồng từ FBM để hiển thị, không tạo/sửa hợp đồng trên FBM qua API.

Tổng số hợp đồng hiện tại (tài khoản ANHLT): 177. Khóa chính nội bộ: `stt_rec_hd` (format `A` + 9 số, ví dụ `A000028016`). Khóa hiển thị: `ma_hd` (mã hợp đồng, ví dụ `ALT260406FW01`). Sort mặc định: theo `xorder`.

Bảng này có 3 trường đánh dấu PK: `stt_rec_hd`, `ma_hd`, `stt_rec_bh`. Trường `stt_rec_bh` là ID bản ghi bán hàng liên kết — nếu không rỗng, FBM không cho phép xóa/sửa hợp đồng đó.

**Quy tắc mã hợp đồng (ma_hd):** Format `ALTyymmddXXnn` — `ALT` là prefix NV (ANHLT), `yymmdd` là ngày tạo, `XX` là mã sản phẩm (FT = Fast Accounting 12, FW = Web, FO = Online, FI = E-Invoice, HDDV = Hóa đơn đầu vào), `nn` là số thứ tự trong ngày. Ví dụ: `ALT260406FW01` = ANHLT, ngày 06/04/2026, Fast Accounting Web, HĐ thứ 1.

### 8.2 Cấu trúc grid — 23 cột

| Index | AliasName | Tiêu đề | Type | Visible | MaxLen | Ghi chú |
|-------|-----------|---------|------|---------|--------|---------|
| 0 | `stt_rec_hd` | _(ẩn)_ | String | Ẩn | — | PK nội bộ |
| 1 | `ma_hd` | Mã hợp đồng | String | Có | 30 | PK hiển thị, liên kết với zccrdmduanKD |
| 2 | `so_hd` | Số hợp đồng | String | Có | 64 | Số HĐ nội bộ/pháp lý |
| 3 | `ma_kh` | Mã KH | String | Có | 8 | Format "KHxxxxxx" — KHÁC mã KH trong zccrAccount |
| 4 | `ten_kh` | Tên khách hàng | String | Có | 1000 | |
| 5 | `ma_so_thue` | Mã số thuế | String | Có | 62 | Dùng để liên kết với zccrAccount |
| 6 | `customer_signer_name` | Người ký | String | Có | 30 | Tên NV ký (= mã NV kinh doanh) |
| 7 | `u_group` | Phòng | String | Có | 16 | VD: "KD1" |
| 8 | `gia_tri_hd` | Tiền | Decimal | Có | — | Giá trị HĐ (VNĐ), có thể âm |
| 9 | `gia_tri_gt` | Giảm trừ | Decimal | Có | — | |
| 10 | `gia_tri_net` | Giá trị net | Decimal | Có | — | = gia_tri_hd - gia_tri_gt |
| 11 | `ngay_hl` | Ngày ký | DateTime | Có | — | |
| 12 | `ngay_chuyen` | Ngày tính DT | DateTime | Có | — | Ngày tính doanh thu |
| 13 | `ten_loaihd` | Loại HĐ | String | Có | 128 | "Ký mới" / "Nâng cấp" / "Bổ sung" |
| 14 | `ten_nguon` | Tên nguồn | String | Có | 128 | Nguồn đầu mối |
| 15 | `nguoi_tim` | NVGT | String | Có | 16 | NV giới thiệu (mã NV) |
| 16 | `ten_hh` | Sản phẩm | String | Có | 128 | |
| 17 | `so_ban` | Bản cài | String | Có | 128 | Số bản cài đặt |
| 18 | `phan_he` | Module | String | Có | 128 | VD: "XL", "TM", "SX", "FO.SX" |
| 19 | `ten_qmo` | Quy mô | String | Có | 128 | Luôn null trong data mẫu |
| 20 | `ly_do` | Lý do chọn Fast | String | Có | 256 | |
| 21 | `xorder` | _(ẩn)_ | String | Ẩn | — | Thứ tự |
| 22 | `stt_rec_bh` | _(ẩn)_ | String | Ẩn | — | PK bán hàng liên kết, rỗng = chưa liên kết |

**Giá trị đặc biệt:** Có HĐ giá trị âm (VD: `ALT260205FI01` — giá trị -3.200.000 VNĐ, loại "Bổ sung", số HĐ chứa "TLHĐ" = trả lại hợp đồng). ShinCRM cần hiển thị số âm đúng cách.

### 8.3 externalKey bắt buộc

Hợp đồng dùng cơ chế phân quyền theo cây tổ chức (`user_ref`), khác với KH dùng hàm `GetCustomerValidate`. Chuỗi externalKey:

```
(0= 1 or (user_ref like rtrim('103003001003018003') +'%') or 2037= 1557 ) and 1
```

Giải thích: `0 = 1` luôn false (vì `_admin = 0`, không phải admin). `user_ref like '103003001003018003%'` cho phép xem HĐ của mình + cấp dưới trong cây tổ chức. `2037 = 1557` luôn false (mã NV 2037 ≠ mã super admin 1557). Kết quả: chỉ xem được HĐ thuộc nhánh user_ref bắt đầu bằng `103003001003018003`.

Khi triển khai, thay `103003001003018003` bằng `user_ref` thực tế (lấy từ ClientScript bước login), thay `2037` bằng userId thực tế.

### 8.4 Lấy danh sách hợp đồng

```json
{
  "type": 0,
  "count": 2000,
  "language": "v",
  "controller": "v2_crContract",
  "viewId": null,
  "childObject": false,
  "lastPageIndex": -1,
  "firstPageItem": "",
  "lastPageItem": "",
  "lastRowCount": 0,
  "memvars": [{"Name": "user_id", "OldValue": null, "NewValue": ""}],
  "externalKey": [{
    "Name": "(0= 1 or (user_ref like rtrim('103003001003018003') +'%') or 2037= 1557 ) and 1 ",
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

**Parse response:**

```javascript
rows.forEach(row => {
  const hd = {
    stt_rec_hd:       row[0],
    ma_hd:            row[1],
    so_hd:            row[2],
    ma_kh_hd:         row[3],    // "KHxxxxxx" — khác zccrAccount!
    ten_kh:           row[4],
    ma_so_thue:       row[5],    // Dùng để liên kết với zccrAccount
    nguoi_ky:         row[6],
    phong:            row[7],
    gia_tri_hd:       row[8],
    gia_tri_gt:       row[9],
    gia_tri_net:      row[10],
    ngay_ky:          parseFBMDate(row[11]),
    ngay_tinh_dt:     parseFBMDate(row[12]),
    loai_hd:          row[13],
    nguon:            row[14],
    nv_gioi_thieu:    row[15],
    san_pham:         row[16],
    so_ban_cai:       row[17],
    module:           row[18],
    quy_mo:           row[19],
    ly_do_chon:       row[20],
    xorder:           row[21],
    stt_rec_bh:       row[22]
  };
});
```

### 8.5 Liên kết hợp đồng ↔ khách hàng

Đây là điểm phức tạp quan trọng. FBM dùng 2 hệ thống mã KH khác nhau: trong zccrAccount (CRM), mã KH có format `ALTxxxxx` (VD: `ALT00487`); trong v2_crContract (hợp đồng), mã KH có format `KHxxxxxx` (VD: `KH020368`). Cùng một doanh nghiệp nhưng mã khác nhau ở 2 module.

KHÔNG thể dùng `ma_kh` để join giữa 2 bảng. Phải dùng `ma_so_thue` (MST) làm khóa chung: `v2_crContract.ma_so_thue = zccrAccount.ma_so_thue`. Ví dụ: MST `"0111252299"` → trong KH là "CÔNG TY TNHH BT BAMBOO GLOBAL" (ALT00487), trong HĐ là cùng tên nhưng mã KH020368.

Ngoài ra, trường `ds_ma_hd` trên form KH (zccrAccount, index 63) chứa danh sách mã HĐ liên kết — có thể dùng làm tham chiếu phụ, lấy qua GetDirResponse action `"ContactRef"`.

### 8.6 Phân trang cho v2_crContract

**Composite key:** `[xorder 12 ký tự][stt_rec_hd 10 ký tự][ma_hd chiều dài biến đổi]`. Ví dụ: `000000000055A000028016ALT260406FW01`.

**gridPageValue:** `[xorder, stt_rec_hd, ma_hd, stt_rec_bh]` (4 giá trị).

Với 177 HĐ, dùng `count: 2000` lấy hết trong 1 request.

---

