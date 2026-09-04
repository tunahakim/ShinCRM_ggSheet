<!-- split-doc-source: 06. FBM INTEGRATION REFERENCE (Tài liệu tích hợp FBM).md -->
<!-- split-doc-headings: ## Chương 6. Người liên hệ (zccrAccountLH) -->
<!-- split-doc-lines: 1497-1545 -->

> Nội dung bên dưới được trích nguyên văn từ tài liệu gốc. Chỉ phần header này được thêm để định tuyến sau khi tách docs.
## Chương 6. Người liên hệ (zccrAccountLH)

### 6.1 Tổng quan

Controller `zccrAccountLH` quản lý danh sách người liên hệ PHỤ THÊM của mỗi KH. Đây là những đầu mối ngoài người liên hệ chính (đã lưu trong trường `ong_ba` của bảng KH).

Bảng này chỉ có thể truy xuất khi xem chi tiết từng KH — không có endpoint lấy tất cả người liên hệ của tất cả KH cùng lúc. Khóa chính composite: `stt_rec_kh` + `line_nbr`. Liên kết với KH: qua `stt_rec_kh` trong `externalKey`.

**Lưu ý cho đồng bộ:** Bảng này KHÔNG bắt buộc cho đồng bộ cơ bản. Người liên hệ chính đã có trong grid KH (trường `ong_ba`, index 4). Bảng zccrAccountLH chỉ cần lấy khi ShinCRM muốn hiển thị danh sách đầy đủ tất cả người liên hệ của một KH cụ thể. Khi tạo KH mới trên FBM, KHÔNG bắt buộc gửi dữ liệu người liên hệ phụ.

### 6.2 Cấu trúc — 8 trường

| Index | AliasName | Tiêu đề | Visible | MaxLen | Ghi chú |
|-------|-----------|---------|---------|--------|---------|
| 0 | `stt_rec_kh` | _(ẩn)_ | Ẩn | — | FK tới KH |
| 1 | `line_nbr` | _(ẩn)_ | Ẩn | — | Số thứ tự, tự tăng |
| 2 | `ten_nlh` | Tên người liên hệ | Có | 128 | |
| 3 | `chuc_vu` | Chức danh | Có | 128 | |
| 4 | `dien_thoai` | Điện thoại | Có | 256 | KHÔNG validate SĐT (khác bảng KH chính) |
| 5 | `email` | Email | Có | 256 | |
| 6 | `ghi_chu` | Ghi chú | Có | 256 | |
| 7 | `ngay_tao` | Ngày tạo | Có | — | ReadOnly, server tự gán |

### 6.3 Lấy danh sách người liên hệ

```json
{
  "type": 0,
  "count": 100,
  "language": "v",
  "controller": "zccrAccountLH",
  "externalKey": [{
    "Name": "stt_rec_kh",
    "Opr": "=",
    "Value": "<stt_rec_kh>",
    "Type": "String",
    "Ignore": false
  }],
  "gridPageIndex": -1,
  "gridPageValue": null,
  "gridRefresh": true,
  "filter": [],
  "memvars": [],
  "cookie": "<fbmPayloadCookie>"
}
```

---

