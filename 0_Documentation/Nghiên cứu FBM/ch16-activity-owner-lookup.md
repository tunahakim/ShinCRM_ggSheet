## Chương 16. Tra khách đang giữ một giao dịch

Ghi ngày 2026-10-16, từ các lần chủ dự án tự chạy thử trên DevTools của tab FBM thật (khách test `A000050753` / `ALT00010`). Mọi request trong chương này là request đọc; không có request lưu hay xóa.

### 16.1 Bài toán

Grid giao dịch (`zccrAccountTask`, endpoint `GetGridViewPage`) chỉ trả 11 cột: `id`, `ten_loai`, `ten_cv`, `details`, `start_date`, `end_date`, `ten_tt`, `owner`, `nguoi_sua`, `datetime0`, `line_nbr`. Không có cột khách nào, cả `ma_kh` lẫn `stt_rec`. Điều này đúng ở cả bản lấy giao dịch của một khách lẫn bản lấy giao dịch của tất cả khách (đối chiếu metadata `Fields` trong `RequestFBM/Lấy bảng hoạt động của 1 khách có cả tiêu đề.txt` và `... TẤT CẢ khách có cả tiêu đề.txt`).

Hệ quả: chỉ khi đọc giao dịch theo một khách (`externalKey` `stt_rec` = `stt_rec_kh` của khách) mới biết giao dịch thuộc khách nào, vì đó là khách mình vừa hỏi. Đọc lại một giao dịch theo `id` chỉ cho biết giao dịch còn hay mất, không cho biết chủ.

Hai cột `ma_kh` và `stt_rec` của giao dịch có trong form (memvars, ch05) nhưng form không phải grid.

### 16.2 Cơ chế: `externalKey` được ghép vào điều kiện WHERE

Mỗi phần tử `externalKey` có dạng `{ Name, Opr, Value, Type, Ignore }`. Theo hành vi quan sát được (suy luận, chưa có mã nguồn FBM), FBM ghép thành một vế điều kiện `<Name> <Opr> <Value>` trong câu SQL của grid. Vì `Name` không bị kiểm, có thể đặt cả một biểu thức vào `Name` rồi kết thúc bằng `and 1`, để vế cuối thành `... and 1 = 1`.

Chính web FBM dùng cách này khi tải danh sách khách (`RequestFBM/Lấy trang khách hàng không có tiêu đề.txt`):

```json
{"Name":"stt_rec_kh in (select stt_rec_kh from dbo.zcFastBusiness$Function$GetCustomerValidate('<USER_ID>')) and 1","Opr":"=","Value":1,"Type":"String","Ignore":false}
```

Bảng gốc của giao dịch là `sysevents` (ch05), nối với khách qua cột `stt_rec` = `stt_rec_kh` của khách. Ghép hai điều trên: lọc grid **khách** bằng câu truy vấn con trên `sysevents` để hỏi "khách nào đang giữ giao dịch có id này".

### 16.3 Request mẫu: hỏi chủ của một giao dịch

Endpoint `POST /AppService/FastBusiness.ReportExtenderService.asmx/GetGridViewPage`, chạy trong tab FBM đã đăng nhập (`credentials: 'include'`). `cookie` là giá trị trường `cookie` trong body của một request `GetGridViewPage` bất kỳ của phiên hiện tại.

```json
{
  "type": 0, "count": 20, "language": "v", "controller": "zccrAccount",
  "viewId": null, "childObject": false, "lastPageIndex": -1, "firstPageItem": "", "lastPageItem": "", "lastRowCount": 0,
  "memvars": [{ "Name": "user_id", "OldValue": null, "NewValue": "" }],
  "externalKey": [{ "Name": "stt_rec_kh in (select stt_rec from sysevents where id = '<ID_GIAO_DICH>') and 1", "Opr": "=", "Value": 1, "Type": "String", "Ignore": false }],
  "gridPageIndex": -1, "gridPageValue": null, "gridRefresh": false, "filter": [], "sortExpression": "ngay_gd desc",
  "cookie": "<COOKIE>", "query": null, "parameter": null, "variable": ""
}
```

Response là grid khách như thường (`d.TotalRowCount`, `d.Rows`, cột đầu `stt_rec_kh`, cột hai `ma_kh`, cột ba `ten_kh`).

Kết quả thử 2026-10-16:

| Ca | `Name` | Kết quả |
|---|---|---|
| Giao dịch có thật `177552` của khách test | `stt_rec_kh in (select stt_rec from sysevents where id = '177552') and 1` | HTTP 200, 1 dòng `["A000050753","ALT00010","Test"]`, `Bugs: null` |
| Như trên, tên bảng có schema | `... from dbo.sysevents ...` | Giống hệt dòng trên |
| Đối chứng, id không có thật | `... where id = '0') and 1` | HTTP 200, 0 dòng |

Kết luận: một id giao dịch → một request → đúng một khách, tức một cặp "id giao dịch – khách". Câu lọc thật sự có tác dụng (đối chứng ra 0 dòng, không trả bừa mọi khách).

### 16.4 Gom nhiều id một request

Đổi điều kiện thành `where id in ('<id1>','<id2>',...)`. Kỳ vọng ra **tập khách** đang giữ các giao dịch đó, không ra từng cặp: grid khách mỗi khách một dòng, không có cột giao dịch. Muốn biết giao dịch nào của khách nào thì đọc giao dịch của từng khách trong tập. Chưa chạy thử. Phiên "Một cửa ghi chiều lấy về FBM" chọn hỏi mỗi id một request để ra đúng cặp, nên không cần thử biến thể này.

### 16.5 Đường đã thử và bị chặn: `GetCompletionList` với bảng giao dịch

`POST /FastBusiness.DataService.asmx/GetCompletionList` (ch11, `RequestFBM/Lấy 1 danh mục thuộc hoạt động.txt`) nhận `dataTable`, `valueField`, `textField`, `keyFilter`, `keyValid`, `orderField` và trả từng cặp `[value, text]`. Ý tưởng: `dataTable: "sysevents"`, `valueField: "id"`, `textField: "stt_rec"` để lấy cặp "id giao dịch – khách" hàng loạt trong một request.

Kết quả thử 2026-10-16 (`type: 102`, `prefixText: ""`, `keyValid: "(1 = 1)"`, `orderField` bằng `valueField`):

| Ca | `controller` | `dataTable` / cột | `keyFilter` | Kết quả |
|---|---|---|---|---|
| Đối chứng đúng mẫu | `crJob` | `crdmcv` / `ma_cv`, `ten_cv` | `(status = '1')` | HTTP 200, 12 danh mục |
| Theo khách test | `crJob` | `sysevents` / `id`, `stt_rec` | `(stt_rec = 'A000050753')` | HTTP 500 |
| Như trên | `zccrAccountTask` | như trên | như trên | HTTP 500 |
| Theo lô id | `crJob` | như trên | `(id in ('177552','176921','999999999'))` | HTTP 500 |
| Mọi giao dịch của khách mình | `crJob` | như trên | `(stt_rec in (select stt_rec_kh from dbo.zcFastBusiness$Function$GetCustomerValidate('<USER_ID>')))` | HTTP 500 |

Kết luận: `GetCompletionList` không cho trỏ vào bảng giao dịch (có thể do danh sách bảng được phép theo `controller`, hoặc tên cột khác; chưa rõ nguyên nhân). Chưa tìm được cách lấy cặp "id giao dịch – khách" hàng loạt trong một request.

### 16.6 Cạm bẫy

- Đây là hành vi FBM chấp nhận, không phải tính năng FBM cam kết. FBM nâng cấp có thể chặn; bên dùng phải coi lỗi hoặc kết quả lạ là "không biết", không suy ra giao dịch đã mất.
- Giá trị đưa vào `Name` là chuỗi SQL ghép tay: chỉ đưa id toàn chữ số, không bao giờ đưa chuỗi người dùng nhập.
- Request mẫu ở 16.3 **không** kèm điều kiện `GetCustomerValidate` mà web FBM tự gửi khi tải danh sách khách. Khách trả về trong các lần thử là khách của chính tài khoản thử, nên chưa biết request không kèm điều kiện này có trả khách thuộc quyền người khác hay không (16.7).
- Mỗi lần gửi request lỗi (HTTP 500) là một lỗi trên máy chủ thật của công ty; thử biến thể mới thì làm ít và có chủ đích.

### 16.7 Câu hỏi còn mở

- Request ở 16.3, không kèm `GetCustomerValidate`, có trả về khách đang thuộc quyền tài khoản khác không. Cách thử chỉ đọc: lấy id một giao dịch của khách người khác đang quản lý (ví dụ do đồng nghiệp cho biết), chạy request 16.3, xem có ra một dòng không. Cùng câu hỏi cho request lọc thẳng `stt_rec_kh = '<mã khách của người khác>'`.

- Có đường nào khác trả cặp "id giao dịch – khách" hàng loạt (ví dụ cột sắp xếp, khóa trang `firstPageItem`/`lastPageItem` của grid giao dịch khi `sortExpression` có `stt_rec`) hay không.
