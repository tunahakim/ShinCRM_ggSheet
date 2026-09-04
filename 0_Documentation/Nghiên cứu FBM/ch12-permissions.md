<!-- split-doc-source: 06. FBM INTEGRATION REFERENCE (Tài liệu tích hợp FBM).md -->
<!-- split-doc-headings: ## Chương 12. Phân quyền -->
<!-- split-doc-lines: 2382-2464 -->

> Nội dung bên dưới được trích nguyên văn từ tài liệu gốc. Chỉ phần header này được thêm để định tuyến sau khi tách docs.
## Chương 12. Phân quyền

### 12.1 Tổng quan

FBM phân quyền dữ liệu ở tầng SQL — mỗi API request phải gửi kèm điều kiện phân quyền trong trường `externalKey`. Nếu thiếu hoặc sai `externalKey`, server trả rỗng hoặc lỗi. Mỗi module dùng cơ chế phân quyền khác nhau.

### 12.2 Phân quyền khách hàng (GetCustomerValidate)

Dùng stored function SQL Server `dbo.zcFastBusiness$Function$GetCustomerValidate('<userId>')`. Hàm nhận mã NV, trả về tập `stt_rec_kh` mà NV đó có quyền xem.

**externalKey:**
```json
{
  "Name": "stt_rec_kh in (select stt_rec_kh from dbo.zcFastBusiness$Function$GetCustomerValidate('2037')) and 1",
  "Opr": "=",
  "Value": 1,
  "Type": "String",
  "Ignore": false
}
```

Phần `and 1` kết hợp với `"Opr": "="` và `"Value": 1` tạo thành `1 = 1` (luôn đúng), cho phép nhúng truy vấn phân quyền như một phần của mệnh đề WHERE.

Có 2 hàm phân quyền: `GetCustomerValidate` (dùng khi mở trang, lấy danh sách) và `GetCustomerValidate2` (dùng khi tìm kiếm). Trong thực tế cả 2 đều hoạt động tương tự.

Bảng phụ trợ: `crctquyenkh` (bảng quyền KH), `crchiasekh` (bảng chia sẻ KH).

### 12.3 Phân quyền hợp đồng (user_ref)

Dùng điều kiện so sánh `user_ref` (mã phân cấp trong cây tổ chức):

**externalKey:**
```json
{
  "Name": "(0= 1 or (user_ref like rtrim('103003001003018003') +'%') or 2037= 1557 ) and 1 ",
  "Opr": "=",
  "Value": 1,
  "Type": "String",
  "Ignore": false
}
```

Giải thích: `0 = 1` = false (không phải admin). `user_ref like '103003001003018003%'` = xem HĐ thuộc nhánh cây tổ chức của mình. `2037 = 1557` = false (không phải super admin mã 1557). Kết quả: chỉ xem HĐ mà mình hoặc cấp dưới phụ trách.

Giá trị cần thay thế: `103003001003018003` = user_ref (lấy từ ClientScript `this._userRef`), `2037` = userId, `1557` = mã super admin (cố định).

### 12.4 Phân quyền deal (dmhd_load)

Dùng bảng `dmhd_load` kiểm tra NV nào được load deal nào:

**externalKey:**
```json
{
  "Name": " exists (select 1 from dmhd_load a where a.stt_rec_hd = vdmhd.stt_rec_hd and user_id =2037) and 1",
  "Opr": "=",
  "Value": 1,
  "Type": "String",
  "Ignore": false
}
```

Thay `2037` bằng userId thực tế.

### 12.5 Cây tổ chức nhân sự

Lấy qua `ViewPanelService.asmx/GetTreeItem`. Cây tổ chức của tài khoản ANHLT (mã NV 2037):

```
FHN Admin (496)
  └── Phan Quốc Khánh (1548)
       └── Lê Khắc Bình (498)
            └── Nguyễn Duy Hiển (501) — 878 KH
                 └── Đào Đức Phú (520) — 80 KH
                      └── Lê Tuấn Anh (2037) — 1178 KH
                           ├── #1: Tiềm năng (44 KH)
                           ├── #2: Đang chăm sóc (1095 KH)
                           └── #3: Đã ký hợp đồng (39 KH)
```

Thông tin từ ClientScript: mã NV = `2037`, username = `ANHLT`, tên đầy đủ = `Lê Tuấn Anh`, mã phân cấp (user_ref) = `103003001003018003`, admin flag = `0` (không phải admin), loại NV (`_kd_yn`) = `2` (kinh doanh).

---

