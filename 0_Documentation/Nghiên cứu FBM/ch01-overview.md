<!-- split-doc-source: 06. FBM INTEGRATION REFERENCE (Tài liệu tích hợp FBM).md -->
<!-- split-doc-headings: ## Chương 1. Tổng quan hệ thống FBM -->
<!-- split-doc-lines: 141-186 -->

> Nội dung bên dưới được trích nguyên văn từ tài liệu gốc. Chỉ phần header này được thêm để định tuyến sau khi tách docs.
## Chương 1. Tổng quan hệ thống FBM

### 1.1 FBM là gì

FBM (FastBusiness) là hệ thống CRM nội bộ của công ty, chạy trên nền tảng ASP.NET WebForms. Đây là hệ thống mà toàn bộ công ty sử dụng để quản lý khách hàng, theo dõi hoạt động chăm sóc, quản lý hợp đồng, và đánh giá hiệu suất nhân viên kinh doanh.

FBM đã hoạt động nhiều năm, giao diện cũ, và thiếu nhiều trường quản trị mà người dùng cần. Tuy nhiên công ty vẫn sử dụng FBM làm hệ thống chính để theo dõi và đánh giá công việc, nên mọi dữ liệu quan trọng phải tồn tại trên FBM.

### 1.2 Vai trò của FBM trong ShinCRM

FBM đóng hai vai trò với ShinCRM.

Vai trò thứ nhất là nguồn dữ liệu đầu vào. Công ty bàn giao khách hàng cho nhân viên thông qua FBM. Khi có khách mới được phân công, dữ liệu khách đó cần được kéo từ FBM sang ShinCRM.

Vai trò thứ hai là đích đồng bộ. Khi nhân viên làm việc trên ShinCRM (cập nhật thông tin khách, ghi nhận hoạt động chăm sóc, thay đổi trạng thái), những thay đổi quan trọng cần được đẩy ngược lên FBM để công ty nhìn thấy trên hệ thống chính.

ShinCRM được thiết kế là hệ thống độc lập. FBM là module tích hợp quan trọng nhưng không phải thành phần bắt buộc để ShinCRM hoạt động. Nếu FBM không khả dụng, ShinCRM vẫn chạy bình thường — chỉ tạm dừng đồng bộ.

### 1.3 Thông tin kỹ thuật máy chủ

FBM được triển khai tại địa chỉ `https://fbo.com.vn:8888`. Server chạy Microsoft IIS 10.0 với ASP.NET 4.0, IP server là `103.237.147.58`, cổng 8888 qua giao thức HTTPS. Server có cơ chế chặn IP nước ngoài — chỉ chấp nhận kết nối từ IP Việt Nam. Đây là ràng buộc quan trọng: mọi request đến FBM phải xuất phát từ IP Việt Nam, ảnh hưởng trực tiếp đến kiến trúc đồng bộ của ShinCRM (Phase 2 dùng Worker Node.js đặt tại mạng Việt Nam; Chrome Extension chỉ lấy cookie).

### 1.4 Kiến trúc ứng dụng FBM

FBM sử dụng kiến trúc WebForms truyền thống kết hợp ASMX Web Services. Giao diện web được render phía server thông qua các trang `.aspx`. Các API lấy/ghi dữ liệu sử dụng hai cơ chế: PageMethods (endpoint dạng `Login.aspx/MethodName`, dùng cho xác thực) và ASMX Web Services (endpoint dạng `.asmx/MethodName`, dùng cho mọi thao tác dữ liệu). Tất cả API giao tiếp bằng JSON qua HTTP POST. Ngôn ngữ giao tiếp sử dụng mã `"v"` (tiếng Việt).

FBM không có REST API chính thức hay tài liệu API công khai. Toàn bộ thông tin trong tài liệu này được thu thập bằng cách phân tích ngược (reverse engineering) từ network traffic thực tế (HAR files).

### 1.5 Cấu trúc URL và thư mục

```
https://fbo.com.vn:8888/
├── Main/
│   ├── Login.aspx                 ← Trang đăng nhập + PageMethods (Login, GetEntityData, GetUnitData)
│   ├── zccrAccount.aspx           ← Trang quản lý khách hàng (lấy cookie payload + userId)
│   └── ...
├── AppService/
│   ├── FastBusiness.ReportExtenderService.asmx   ← Service chính (GetGridViewPage, GetDirViewPage, GetDirResponse, GetGridResponse)
│   ├── ViewPanelService.asmx                     ← Cây tổ chức nhân sự (GetTreeItem)
│   └── UploadExtender.asmx                       ← Upload file đính kèm
├── FastBusiness.DataService.asmx                  ← Danh mục dropdown (GetCompletionList)
└── Default.aspx                                   ← Trang chính sau đăng nhập
```

---

