<!-- split-doc-source: 06. FBM INTEGRATION REFERENCE (Tài liệu tích hợp FBM).md -->
<!-- split-doc-headings: ## Chương 15. Phụ lục -->
<!-- split-doc-lines: 2596-2694 -->

> Nội dung bên dưới được trích nguyên văn từ tài liệu gốc. Chỉ phần header này được thêm để định tuyến sau khi tách docs.
## Chương 15. Phụ lục

### 15.1 Bảng tổng hợp tất cả endpoints

| # | Endpoint | Method | Mục đích |
|---|---------|--------|---------|
| 1 | `/Main/Login.aspx` | GET | Lấy cookie phiên + salt |
| 2 | `/Main/Login.aspx/GetEntityData` | POST | Lấy danh sách database |
| 3 | `/Main/Login.aspx/GetUnitData` | POST | Lấy danh sách đơn vị |
| 4 | `/Main/Login.aspx/Login` | POST | Đăng nhập chính thức |
| 5 | `/Main/zccrAccount.aspx` | GET | Lấy cookie payload + userId |
| 6 | `/Default.aspx` | GET | Trang chính sau đăng nhập |
| 7 | `.../ReportExtenderService.asmx/GetGridViewPage` | POST | Truy vấn dữ liệu bảng (KH, HĐ, deal, BC) |
| 8 | `.../ReportExtenderService.asmx/GetDirViewPage` | POST | CRUD form (tạo, sửa, xóa, lấy authorized) |
| 9 | `.../ReportExtenderService.asmx/GetDirResponse` | POST | Thao tác nghiệp vụ (lookup KH mẹ, lấy mã HĐ) |
| 10 | `.../ReportExtenderService.asmx/GetGridResponse` | POST | Dữ liệu tổng hợp (TotalAmount) |
| 11 | `/FastBusiness.DataService.asmx/GetCompletionList` | POST | Danh mục dropdown |
| 12 | `/AppService/ViewPanelService.asmx/GetTreeItem` | POST | Cây tổ chức nhân sự |
| 13 | `/AppService/UploadExtender.asmx/GetListViewPage` | POST | File đính kèm |

### 15.2 Bảng tổng hợp tất cả controllers

| Controller | Bảng DB | Mục đích | Chương |
|-----------|---------|---------|--------|
| `zccrAccount` | `crkh` / `vcrkh` | Khách hàng | 4 |
| `zccrAccountTask` | `sysevents` | Hoạt động / lịch sử làm việc | 5 |
| `zccrAccountLH` | — | Người liên hệ | 6 |
| `zccrAccountTeam` | — | Chuyển giao KH | 7 |
| `v2_crContract` | — | Hợp đồng ký kết | 8 |
| `zccrdmduanKD` | — | Quản trị deal / triển khai | 9 |
| `zccrdmduanTaskKD` | — | Lịch sử công việc triển khai | 9.3.1 |
| `zccrdmduanThanhtoanKD` | — | Thanh toán | 9.3.2 |
| `zccrdmduanHoadonKD` | — | Hóa đơn | 9.3.3 |
| `zccrdmduanFileKD` | — | Tài liệu đính kèm deal | 9.3.4 |
| `zccrdmduanKehoachKD` | — | Kế hoạch triển khai | 9.3.5 |
| `zccrdmduanKehoachTuanKD` | — | Kế hoạch tuần | 9.3.5 |
| `zccrdmduanUsersKD` | — | Người dùng KH | 9.3.5 |
| `crptsk16` | — | Báo cáo ký kết | 10 |
| `crLeadStatus` | `crdmttdm` | DM Trạng thái KH | 11.2 |
| `crLeadSource` | `crdmngdm` | DM Nguồn tiềm năng | 11.3 |
| `crdmqmo` | `crdmqmo` | DM Quy mô DN | 11.4 |
| `crAccountType` | `crdmloaikh` | DM Phân loại KH | 11.5 |
| `crIndustry` | `crdmlvkd` | DM Lĩnh vực KD | 11.6 |
| `crJob` | `crdmcv` | DM Công việc | 11.7 |
| `crProvinceCity` | `crdmtinh` | DM Tỉnh/thành | 11.8 |
| `crDistrict` | `crdmquan` | DM Quận/huyện | 11.9 |
| `crCountry` | `crdmqg` | DM Quốc gia | 11.10 |
| `crdmsp` | `crdmsp` | DM Sản phẩm | 11.11 |
| `crUser` | `vsysuserinfo` | DM Nhân viên | 11.12 |
| `crAccount` | `crkh` | Lookup KH (chọn KH mẹ) | 11.13 |

### 15.3 Danh sách nhân viên đã phát hiện

| Mã NV | Tên đầy đủ | Vai trò | Ghi chú |
|-------|-----------|---------|---------|
| `ANHLT` | Lê Tuấn Anh | NV Kinh doanh | Mã NV: 2037, user chính ShinCRM |
| `THAOLP` | Lê Phương Thảo | NV Marketing | |
| `HUONGNV` | `HUONGNV` (chưa có tên trong dữ liệu mẫu) | NV Marketing | Lưu mã gốc; không suy đoán tên khi danh mục `crUser` chưa trả về tên. |
| `LINHND` | Nguyễn Diệu Linh | NV Marketing | |
| `HANHTT` | Trần Thu Hạnh | NV Marketing | |
| `PHUCDH` | Đỗ Hoàng Phúc | NV khác/legacy | Không dùng role mô tả này để phân quyền; lấy trạng thái thật từ `crUser` khi sync. |
| `LINHBK` | Bùi Khánh Linh | NV khác/legacy | Không dùng role mô tả này để phân quyền; lấy trạng thái thật từ `crUser` khi sync. |
| `LYBK` | Bùi Khánh Ly | NV khác/legacy | Không dùng role mô tả này để phân quyền; lấy trạng thái thật từ `crUser` khi sync. |
| `NGAPTT` | Phùng Thị Tâm Nga | NV khác/legacy | Không dùng role mô tả này để phân quyền; lấy trạng thái thật từ `crUser` khi sync. |
| `NGOCNTB` | Nguyễn Thị Bích Ngọc | NV khác/legacy | Không dùng role mô tả này để phân quyền; lấy trạng thái thật từ `crUser` khi sync. |

### 15.4 Quy tắc mã KH và mã hợp đồng

**Mã KH (ma_kh):** Prefix là mã viết tắt của NV tạo KH. Server tự sinh tuần tự: `ALT00490` → `ALT00491` → ... Phải gọi API mở form để lấy mã, không tự đặt.

| Prefix | NV tham khảo | Quy tắc sử dụng |
|--------|--------------|----------------|
| `ALT` | ANHLT (Lê Tuấn Anh) | Chỉ dùng để đọc hiểu mã cũ/debug. |
| `TLP` | THAOLP (Lê Phương Thảo) | Chỉ dùng để đọc hiểu mã cũ/debug. |
| `HTT` | HANHTT (Trần Thu Hạnh) | Chỉ dùng để đọc hiểu mã cũ/debug. |
| `HUO` | HUONGNV | Chỉ dùng để đọc hiểu mã cũ/debug; nếu cần tên, lấy từ `crUser`. |
| `LIB` | LINHBK (Bùi Khánh Linh) | Chỉ dùng để đọc hiểu mã cũ/debug. |
| `TPD` | NV legacy | Chỉ dùng để đọc hiểu mã cũ/debug. |
| `DHP` | NV khác | Chỉ dùng để đọc hiểu mã cũ/debug. |
| `LND` | NV khác | Chỉ dùng để đọc hiểu mã cũ/debug. |

📌 Không dùng prefix để quyết định owner khi sync. Owner/NV phụ trách phải lấy từ field FBM/API trả về hoặc từ danh mục `crUser`; khi tạo KH mới, luôn gọi API mở form để FBM tự sinh `ma_kh`.

**PK KH (stt_rec_kh):** Format `A` + 9 chữ số, tuần tự: `A000076463` → `A000076464`. Server sinh khi lưu thành công. KH bị xóa mềm có prefix `Z` thay vì `A`.

**Mã HĐ (ma_hd):** Format `ALTyymmddXXnn` — ALT = prefix NV, yymmdd = ngày, XX = mã SP, nn = STT trong ngày.

**Mã KH trong HĐ (v2_crContract.ma_kh):** Format `KHxxxxxx` — khác hoàn toàn với mã KH trong CRM. Không dùng để join.

### 15.5 Lịch sử phiên bản tài liệu

| Phiên bản | Ngày | Thay đổi |
|-----------|------|---------|
| 0.1 | 2026-04-11 | Bản nháp đầu tiên. Bao gồm: KH, Hoạt động, NLH, Chuyển giao, HĐ, Deal, Báo cáo, Danh mục, Phân quyền, Giới hạn & rủi ro. Chưa có mapping FBM↔ShinCRM chi tiết. |
| 0.2 | 2026-05-26 | Chốt mapping nền FBM↔ShinCRM ở Chương 14 để đủ triển khai adapter Phase 2. |

---

Đây là hết toàn bộ Tài liệu 6 (FBM Integration Reference) phiên bản 0.1. Bạn xem qua và cho tôi biết nếu cần chỉnh sửa hoặc bổ sung gì.
