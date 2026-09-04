<!-- split-doc-source: 06. FBM INTEGRATION REFERENCE (Tài liệu tích hợp FBM).md -->
<!-- split-doc-headings: ## Chương 10. Báo cáo ký kết (crptsk16) -->
<!-- split-doc-lines: 1973-2116 -->

> Nội dung bên dưới được trích nguyên văn từ tài liệu gốc. Chỉ phần header này được thêm để định tuyến sau khi tách docs.
## Chương 10. Báo cáo ký kết (crptsk16)

### 10.1 Tổng quan

Controller `crptsk16` cung cấp báo cáo tổng hợp ký kết theo tháng, quý, hoặc năm. Đây là module báo cáo chỉ đọc — không có thao tác tạo/sửa/xóa. ShinCRM dùng module này để hiển thị dashboard hiệu suất kinh doanh.

Báo cáo trả về danh sách NV kèm chỉ tiêu (kế hoạch) và doanh số thực tế. Dòng đầu tiên (stt = "") luôn là dòng tổng cộng. Không có externalKey — báo cáo mở cho tất cả NV có quyền truy cập module.

### 10.2 Cấu trúc — 7 cột

| Index | AliasName | Tiêu đề | Type | Ghi chú |
|-------|-----------|---------|------|---------|
| 0 | `stt` | Stt | String | "" = dòng tổng cộng |
| 1 | `u_name` | Người ký | String | Mã NV (VD: "ANHLT") |
| 2 | `gia_tri_kh` | Kế hoạch | Decimal | Chỉ tiêu (VNĐ) |
| 3 | `gia_tri_hd` | Tiền | Decimal | Doanh số thực tế |
| 4 | `gia_tri_gt` | Giảm trừ | Decimal | |
| 5 | `gia_tri_net` | Thực tế | Decimal | = gia_tri_hd - gia_tri_gt |
| 6 | `ty_le` | TL hoàn thành (%) | Decimal | = gia_tri_net / gia_tri_kh × 100 |

### 10.3 Bộ lọc báo cáo

Báo cáo có 3 mẫu và nhiều bộ lọc tùy chọn.

**Mẫu báo cáo (mau_bc):**

| Giá trị | Ý nghĩa | Trường filter kèm theo |
|---------|---------|----------------------|
| `"1"` | Theo tháng | thang (1-12), nam |
| `"2"` | Theo quý | quy (1-4), nam |
| `"3"` | Theo năm | nam |

**Bộ lọc tùy chọn:**

| Trường memvars | Ý nghĩa | Rỗng = |
|---------------|---------|--------|
| `nv_bh` | NV cụ thể (mã NV) | Xem tất cả NV |
| `ma_bp` | Phòng ban (mã phòng) | Xem tất cả phòng |
| `ma_sp` | Sản phẩm (mã SP) | Xem tất cả SP |

### 10.4 Lấy báo cáo theo tháng/quý/năm

Gồm 2 bước: submit filter rồi lấy data.

**Bước 1 — Submit filter:**

```json
{
  "type": 1,
  "parentType": "Dir",
  "firstView": false,
  "searchMode": true,
  "viewPage": true,
  "authorized": null,
  "action": "New",
  "actionID": null,
  "values": [],
  "vars": [],
  "memvars": [
    {"Name": "mau_bc", "OldValue": null, "NewValue": "1"},
    {"Name": "thang", "OldValue": null, "NewValue": 4},
    {"Name": "quy", "OldValue": null, "NewValue": 2},
    {"Name": "nam", "OldValue": null, "NewValue": 2026},
    {"Name": "nv_bh", "OldValue": null, "NewValue": ""},
    {"Name": "ten_nv", "OldValue": null, "NewValue": ""},
    {"Name": "ma_bp", "OldValue": null, "NewValue": ""},
    {"Name": "ten_bp", "OldValue": null, "NewValue": ""},
    {"Name": "ma_sp", "OldValue": null, "NewValue": ""},
    {"Name": "ten_sp", "OldValue": null, "NewValue": ""}
  ],
  "language": "v",
  "controller": "crptsk16",
  "viewId": null,
  "gridController": "crptsk16",
  "gridViewId": null,
  "cookie": "<fbmPayloadCookie>"
}
```

Response: null (chỉ là trigger cho server chuẩn bị data).

**Bước 2 — Lấy data:**

```json
{
  "type": 0,
  "count": 100,
  "language": "v",
  "controller": "crptsk16",
  "viewId": null,
  "childObject": false,
  "lastPageIndex": -1,
  "firstPageItem": "",
  "lastPageItem": "",
  "lastRowCount": 0,
  "memvars": [
    {"Name": "mau_bc", "OldValue": null, "NewValue": "1"},
    {"Name": "thang", "OldValue": null, "NewValue": 4},
    {"Name": "quy", "OldValue": null, "NewValue": 2},
    {"Name": "nam", "OldValue": null, "NewValue": 2026},
    {"Name": "nv_bh", "OldValue": null, "NewValue": ""},
    {"Name": "ten_nv", "OldValue": null, "NewValue": ""},
    {"Name": "ma_bp", "OldValue": null, "NewValue": ""},
    {"Name": "ten_bp", "OldValue": null, "NewValue": ""},
    {"Name": "ma_sp", "OldValue": null, "NewValue": ""},
    {"Name": "ten_sp", "OldValue": null, "NewValue": ""}
  ],
  "externalKey": [],
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
  const report = {
    stt:        row[0],    // "" = dòng tổng cộng
    nguoi_ky:   row[1],    // Mã NV
    ke_hoach:   row[2],    // Chỉ tiêu (VNĐ)
    doanh_so:   row[3],    // Doanh số ký được
    giam_tru:   row[4],    // Giảm trừ
    thuc_te:    row[5],    // = doanh_so - giam_tru
    ty_le_pct:  row[6]     // % hoàn thành
  };

  if (report.stt === "") {
    // Dòng tổng cộng — hiển thị riêng trên dashboard
  }
});
```

**Ví dụ data tháng 4/2026 (ANHLT):** Kế hoạch: 170.000.000 VNĐ/tháng. Doanh số: 21.750.000. Tỷ lệ: 12,79%. Tổng công ty: kế hoạch 8,124 tỷ, thực tế 2,515 tỷ, tỷ lệ 30,95%.

---

