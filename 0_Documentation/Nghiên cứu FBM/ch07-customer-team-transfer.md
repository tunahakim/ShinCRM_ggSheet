<!-- split-doc-source: 06. FBM INTEGRATION REFERENCE (Tài liệu tích hợp FBM).md -->
<!-- split-doc-headings: ## Chương 7. Chuyển giao khách hàng (zccrAccountTeam) -->
<!-- split-doc-lines: 1546-1580 -->

> Nội dung bên dưới được trích nguyên văn từ tài liệu gốc. Chỉ phần header này được thêm để định tuyến sau khi tách docs.
## Chương 7. Chuyển giao khách hàng (zccrAccountTeam)

### 7.1 Tổng quan

Controller `zccrAccountTeam` quản lý lịch sử chuyển giao (bàn giao) KH giữa các nhân viên. Mỗi lần công ty phân công hoặc chuyển KH cho NV khác, một bản ghi được tạo trong bảng này.

Khóa chính composite: `ngay_bg`, `stt_rec_kh`, `user_id2`, `user_id`. Liên kết với KH: qua `stt_rec_kh`.

**Lưu ý cho đồng bộ:** Bảng này KHÔNG bắt buộc cho đồng bộ cơ bản. Khi tạo KH mới trên FBM, server tự gán NV phụ trách dựa trên session đăng nhập — KHÔNG cần gửi dữ liệu chuyển giao. Bảng này hữu ích nếu ShinCRM muốn hiển thị lịch sử "KH này từng do ai phụ trách".

### 7.2 Cấu trúc — 12 trường

| Index | AliasName | Tiêu đề | Visible | Ghi chú |
|-------|-----------|---------|---------|---------|
| 0 | `stt_rec_kh` | _(ẩn)_ | Ẩn | FK tới KH |
| 1 | `user_id2` | _(ẩn)_ | Ẩn | PK — mã NV marketing |
| 2 | `ma_nv_tele` | NV Marketing | Có | Autocomplete crUser, filter `status='1' and s1='1'` |
| 3 | `ten_nv_tele` | Tên NV marketing | Có | ReadOnly |
| 4 | `user_id` | _(ẩn)_ | Ẩn | PK — mã NV kinh doanh |
| 5 | `ma_nv_kd` | NV k.doanh | Có | Autocomplete crUser, filter `status='1'` |
| 6 | `ten_nv_kd` | Tên NV k.doanh | Có | ReadOnly |
| 7 | `ghi_chu` | Ghi chú | Có | Max 256 |
| 8 | `ngay_bg` | Ngày bàn giao | Có | ReadOnly, auto = ngày hiện tại |
| 9 | `user_id0` | _(ẩn)_ | Ẩn | Người tạo bản ghi |
| 10 | `datetime0` | _(ẩn)_ | Ẩn | |
| 11 | `line_nbr` | _(ẩn)_ | Ẩn | |

### 7.3 Lấy lịch sử chuyển giao

Payload giống mục 6.3 nhưng `controller: "zccrAccountTeam"`.

---



