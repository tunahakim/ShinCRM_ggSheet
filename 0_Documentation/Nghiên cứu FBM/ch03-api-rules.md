<!-- split-doc-source: 06. FBM INTEGRATION REFERENCE (Tài liệu tích hợp FBM).md -->
<!-- split-doc-headings: ## Chương 3. API Reference — Quy tắc chung -->
<!-- split-doc-lines: 545-723 -->

> Nội dung bên dưới được trích nguyên văn từ tài liệu gốc. Chỉ phần header này được thêm để định tuyến sau khi tách docs.
## Chương 3. API Reference — Quy tắc chung

Chương này mô tả các quy tắc áp dụng cho TẤT CẢ request đến FBM API, không phân biệt controller hay thao tác.

### 3.1 Danh sách endpoints

FBM có 4 service chính và 1 service phụ:

**ReportExtenderService** (service chính cho mọi thao tác dữ liệu):

Đường dẫn gốc: `/AppService/FastBusiness.ReportExtenderService.asmx`

Phương thức `GetGridViewPage` dùng để lấy danh sách dạng bảng có phân trang — áp dụng khi lấy danh sách khách hàng, lịch sử làm việc, hợp đồng, deal, báo cáo. Phương thức `GetDirViewPage` dùng để mở form, lưu form, xóa record — áp dụng cho tạo mới, sửa, xóa khách hàng và hoạt động, lấy authorized. Phương thức `GetDirResponse` dùng cho thao tác nghiệp vụ đặc biệt — áp dụng khi lookup KH mẹ, lấy danh sách mã hợp đồng liên kết. Phương thức `GetGridResponse` dùng để lấy dữ liệu tổng hợp nhanh — áp dụng khi lấy tổng tiền deal (TotalAmount).

**DataService** (danh mục dropdown):

Đường dẫn gốc: `/FastBusiness.DataService.asmx`

Phương thức `GetCompletionList` dùng để lấy danh sách giá trị cho dropdown/autocomplete — áp dụng khi lấy danh mục tỉnh thành, nguồn KH, trạng thái, nhân viên, sản phẩm.

**ViewPanelService** (cây tổ chức):

Đường dẫn gốc: `/AppService/ViewPanelService.asmx`

Phương thức `GetTreeItem` dùng để lấy cây phân cấp nhân sự — áp dụng khi xem cấu trúc team, đếm KH theo nhóm trạng thái.

**UploadExtender** (file đính kèm):

Đường dẫn gốc: `/AppService/UploadExtender.asmx`

Phương thức `GetListViewPage` dùng để lấy cấu trúc và danh sách file đính kèm — áp dụng khi mở form hoạt động có file đính kèm.

**PageMethods trên Login.aspx** (xác thực):

Đường dẫn gốc: `/Main/Login.aspx`

Ba phương thức `GetEntityData`, `GetUnitData`, `Login` đã mô tả chi tiết ở Chương 2.

### 3.2 Quy tắc request chung

Tất cả API FBM đều là HTTP POST với JSON body. Không có ngoại lệ — FBM không hỗ trợ GET cho các API dữ liệu (chỉ dùng GET cho trang HTML).

**Headers bắt buộc cho mọi request POST:**

```
Content-Type: application/json; charset=UTF-8
Cookie: <ASP.NET_SessionId và cookie auth từ quá trình login>
Referer: https://fbo.com.vn:8888/Main/zccrAccount.aspx
```

Header `Referer` rất quan trọng — FBM server kiểm tra Referer trong mọi request POST. Giá trị `https://fbo.com.vn:8888/Main/zccrAccount.aspx` hoạt động cho hầu hết các API. Khi gọi Login PageMethods, Referer là `https://fbo.com.vn:8888/Main/Login.aspx`.

**BUG QUAN TRỌNG — Escape dấu gạch chéo:** FBM (ASP.NET WebForms) có một bug: nếu JSON body chứa ký tự `/` không được escape, server trả về HTTP 500. Giải pháp bắt buộc là thay thế tất cả `/` bằng `\/` trong chuỗi JSON body trước khi gửi. Trong kiến trúc ShinCRM, bước này nằm ở Supabase Edge Function / FBM request builder: `JSON.stringify(payload).replace(/\//g, "\\/")`. Worker Node.js nhận body đã là string hoàn chỉnh, không stringify lại và không escape lại.

**Body rỗng phải là JSON object:** Ngay cả khi API không cần tham số (như `GetEntityData`), body vẫn phải gửi `{}`. Gửi body rỗng hoặc null sẽ gây lỗi parse.

**Cookie payload trong JSON body:** Hầu hết API dữ liệu yêu cầu trường `"cookie"` trong JSON body chứa `fbmPayloadCookie` (ví dụ `"500020372f578FHN_CRM_App"`). Đây KHÔNG phải HTTP cookie — đây là trường trong payload. FBM dùng cơ chế cookie kép: HTTP cookie (trong header) để xác thực phiên, payload cookie (trong body) để xác minh ngữ cảnh người dùng. Cả hai đều bắt buộc.

### 3.3 Quy tắc response chung

**Response bọc trong trường "d":** Tất cả response từ PageMethods và ASMX Web Service đều được bọc trong trường `"d"`. Đây là cơ chế bảo mật mặc định của ASP.NET AJAX để ngăn JSON hijacking. Client luôn truy cập `response.d` để lấy dữ liệu thực.

**Kiểm tra lỗi qua trường Bugs:** Khi thực hiện thao tác ghi (tạo, sửa, xóa), response chứa trường `Bugs`. Nếu `Bugs` là `null`, thao tác thành công. Nếu `Bugs` là object, thao tác thất bại — `Bugs.FieldName` cho biết trường bị lỗi, `Bugs.Message` chứa thông báo lỗi (có thể chứa HTML).

**Dữ liệu trả về dạng mảng vị trí:** `Rows[]` trong response `GetGridViewPage` trả về mảng các mảng giá trị (positional array), không phải mảng object có key. Client phải biết trước mapping index cho từng controller. Mapping này cố định và được mô tả chi tiết tại từng chương controller.

**TotalRowCount luôn phản ánh tổng thực:** Dù tham số `count` giới hạn số dòng trong `Rows[]`, trường `TotalRowCount` luôn trả về tổng số bản ghi thực sự thỏa điều kiện. Ngoại lệ: khi chuyển trang (không phải trang đầu), `TotalRowCount` có thể trả về `0` (server không đếm lại).

**Phát hiện session hết hạn:** Khi session hết hạn, response có thể là HTTP 401/403, hoặc body chứa chuỗi `"Login.aspx"` (redirect). ShinCRM cần kiểm tra cả hai trường hợp trong mỗi response.

### 3.4 Cơ chế phân trang

FBM sử dụng cơ chế phân trang dạng keyset (cursor-based), không phải offset-based. Điều này có nghĩa: thay vì nói "lấy trang 3" (skip 20, take 10), FBM nói "lấy 10 dòng sau dòng có giá trị X".

**Các tham số phân trang trong payload GetGridViewPage:**

`type` có 3 giá trị: `0` = lấy data + metadata (dùng lần đầu, response chứa cả `ViewPage` với định nghĩa cột), `1` = chỉ lấy data (dùng từ lần thứ 2 trở đi), `-5` = chỉ khởi tạo, không lấy data.

`count` là số dòng tối đa server trả về trong `Rows[]`. Đã test thành công với `count=2000`, có thể lấy toàn bộ danh sách trong 1 request.

`gridPageIndex` có các giá trị: `-1` = trang đầu tiên (dùng khi init), `-2` = reset về trang đầu và đếm lại tổng (dùng khi thay đổi filter hoặc sort), `0` = quay lại trang 1 từ vị trí khác, `N` (dương) = chuyển đến trang N+1.

`gridPageValue` là mảng giá trị "con trỏ" — chứa các giá trị sort key của dòng cuối trang hiện tại, dùng để server biết bắt đầu trang tiếp từ đâu. Mỗi controller có cấu trúc gridPageValue khác nhau (chi tiết ở từng chương). Đặt `null` khi load trang đầu hoặc reset.

`firstPageItem` và `lastPageItem` là composite key (chuỗi ghép liền) của dòng đầu và dòng cuối trang hiện tại. FBM dùng nội bộ để tối ưu query.

`lastPageIndex` là số trang hiện tại trước khi chuyển. `lastRowCount` là tổng số dòng từ lần gọi trước.

`gridRefresh` đặt `true` khi cần reload dữ liệu (ví dụ đổi context từ KH này sang KH khác), `false` trong trường hợp thông thường.

**Chiến lược phân trang cho ShinCRM:**

Cách đơn giản nhất: dùng `count` đủ lớn (1000-2000) để lấy toàn bộ dữ liệu trong 1 request. Phù hợp khi tổng số record không quá lớn (zccrAccount ~1700 KH, v2_crContract ~177 HĐ).

Nếu cần phân trang (dữ liệu quá lớn hoặc muốn giảm tải): lấy trang đầu với `type=0, gridPageIndex=-1`, rồi lấy các trang tiếp với `type=1`, tăng `gridPageIndex`, truyền `gridPageValue` từ dòng cuối trang trước.

### 3.5 Cơ chế lọc (Filter)

FBM sử dụng cú pháp filter dạng chuỗi trong mảng `"filter"` của payload `GetGridViewPage`.

**Cú pháp:** `"tên_cột:**giá_trị"` — trong đó `**` là toán tử LIKE (contains, chứa chuỗi con). Đây là toán tử duy nhất được xác nhận qua thực tế.

**Ví dụ:**
```json
"filter": ["dien_thoai:**0901234567"]
```
Tìm KH có số điện thoại chứa "0901234567".

```json
"filter": ["ma_kh:**alt", "ten_kh:**công ty", "ma_so_thue:**01"]
```
Tìm KH thỏa mãn TẤT CẢ điều kiện (AND logic): mã KH chứa "alt" VÀ tên chứa "công ty" VÀ MST chứa "01".

**Quy tắc quan trọng:**

Nhiều filter trong mảng là AND (tất cả phải thỏa mãn). Không phân biệt hoa/thường (case-insensitive). Filter `**` là contains (LIKE '%...%'), không phải exact match. Khi cần khớp chính xác (ví dụ kiểm tra trùng MST), dùng filter với giá trị đầy đủ rồi loop qua kết quả verify bằng so sánh chính xác. Khi thay đổi filter, BẮT BUỘC gửi `gridPageIndex: -2` để reset về trang đầu. Mảng rỗng `[]` = không lọc, lấy tất cả.

**Các cột đã xác nhận có thể filter (zccrAccount):** `ma_kh`, `ten_kh`, `ma_so_thue`, `ong_ba`, `dien_thoai`, `email`. Các cột khác có `AllowFilter: true` trong metadata cũng có thể filter được.

### 3.6 Cơ chế sắp xếp (Sort)

Trường `sortExpression` trong payload `GetGridViewPage` nhận chuỗi dạng `"tên_cột asc"` hoặc `"tên_cột desc"`.

**Ví dụ:**
```json
"sortExpression": "ngay_gd desc"
```
Sắp xếp theo ngày giao dịch giảm dần (mới nhất trước).

```json
"sortExpression": "ten_kh asc"
```
Sắp xếp theo tên KH tăng dần (A→Z).

**Quy tắc:** Chỉ sort theo 1 cột mỗi request. `null` = sắp xếp mặc định của server (mỗi controller có sort mặc định riêng). Khi thay đổi sort, gửi `gridPageIndex: 0` với `gridPageValue: null` để reset. Sort và filter hoạt động độc lập, có thể kết hợp.

**Các cột đã test sort thành công (zccrAccount):** `ngay_gd`, `datetime0`, `ma_kh`, `ten_kh`, `dien_thoai`, `ten_nguon_dm`. Các cột có `AllowSorting: true` trong metadata cũng sort được.

### 3.7 Thao tác CRUD qua GetDirViewPage

`GetDirViewPage` là endpoint duy nhất cho tất cả thao tác tạo, sửa, xóa, mở form. Phân biệt thao tác qua 3 trường: `type`, `action`, và nội dung `memvars`.

**Bảng tổng hợp các thao tác:**

| Thao tác | type | action | values | memvars | Mô tả |
|----------|------|--------|--------|---------|-------|
| Lấy authorized | `0` | `"New"` | `[]` | `[]` | viewPage=false, authorized=null |
| Mở form tạo mới (lấy mã tự sinh) | `0` | `"New"` | `["<stt_rec bất kỳ>"]` | `[]` | viewPage=true, authorized=mã đã lấy |
| Lưu record mới | `1` | `"New"` | `["<stt_rec bất kỳ>"]` | đầy đủ trường, OldValue=null | |
| Mở form sửa (lấy data hiện tại) | `0` | `"Edit"` | `["<PK cần sửa>"]` | `[]` | |
| Lưu record đã sửa | `1` | `"Edit"` | `["<PK cần sửa>"]` | đầy đủ trường, OldValue=giá trị cũ | |
| Xóa record | `2` | `"Delete"` | `["<PK cần xóa>"]` | `[]` | Không cần gửi dữ liệu trường |

**Giá trị `authorized` theo controller:**

Khách hàng (zccrAccount): dùng mã dạng `"1111.xxx"`, trường `authorized` gốc trong file HAR là `"1111.cac"` nhưng giá trị thực tế thay đổi mỗi phiên.

Hoạt động (zccrAccountTask): dùng mã dạng `"1.xxx"`, trường `authorized` gốc trong file HAR là `"1.cfd"` nhưng giá trị thực tế thay đổi mỗi phiên.

**Cơ chế xóa khác nhau giữa các controller:**

Khách hàng (zccrAccount): soft delete — record không bị xóa thật mà đổi prefix `stt_rec_kh` thành `Z`. Script FBM tự filter `left(stt_rec_kh,1) <> 'Z'`. ShinCRM cần biết điều này khi đồng bộ: KH biến mất khỏi danh sách FBM có thể do bị xóa mềm.

Hoạt động (zccrAccountTask): hard delete — record biến mất hoàn toàn khỏi database.

### 3.8 Định dạng dữ liệu đặc biệt

**Ngày tháng ASP.NET:** FBM trả ngày giờ theo format `"/Date(<timestamp>)/"` trong đó `<timestamp>` là Unix timestamp tính bằng milliseconds. Ví dụ: `"/Date(1767927660000)/"` = 09/01/2026 lúc 14:21 (giờ Việt Nam).

Cách parse: lấy số giữa `(` và `)`, chia 1000 để ra Unix timestamp giây.

**Ngày null placeholder:** Giá trị `"/Date(-2209014000000)/"` tương ứng ngày 1899-12-30 (epoch base của .NET). Đây là giá trị NULL. Quy tắc: nếu năm ≤ 1900, coi là null. Tương tự, `"/Date(915123600000)/"` = 1999-01-01 xuất hiện ở nhiều KH cũ chưa có giao dịch, cũng có thể coi là null trong ngữ cảnh "ngày giao dịch gần nhất".

**Thời gian tách riêng trong hoạt động:** FBM lưu ngày và giờ tách riêng cho hoạt động: `start_date` (DateTime, phần ngày) + `start_time` (String `"HH:mm"`). `end_date` + `end_time` tương tự. ShinCRM cần ghép `end_date` + `end_time` để có thời gian đầy đủ.

**Dữ liệu có space đầu:** Một số giá trị text trên FBM có space ở đầu (ví dụ `" Bộ tư lệnh cảnh sát cơ động"`). ShinCRM cần trim khi nhập.

---

