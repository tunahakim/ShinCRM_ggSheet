# Checklist refactor UI Sidebar theo Schema

## Mục tiêu và ranh giới

- [x] Chốt nguyên tắc: mọi màn hình người dùng nhìn thấy phải có một file schema riêng; controller chỉ đọc schema, xử lý state/DTO và tạo Block động qua renderer dùng chung.
- [x] Chốt cách tổ chức: schema màn nghiệp vụ ở `1_ShinCRM_GAS/client/schema/screens/`, schema trạng thái ở `client/schema/status/`, schema FBM theo cùng ý nghĩa ở `client/schema/sync/screens/`; controller đặt ở thư mục chức năng tương ứng.
- [x] Chốt điều cấm: không ghép HTML literal, không `innerHTML`, không `createElement`, không tự dựng DOM trong controller màn hình; không khai lại nhãn UI tĩnh ở controller nếu đã thuộc schema.
- [x] Chốt nguyên tắc bảo toàn: không sửa fixture FBM, không hoàn tác thay đổi selection/Extension có sẵn, không đổi nghiệp vụ GAS/transport trong đợt chỉ refactor UI.

## Kiểm kê cấu trúc hiện tại

- [x] Kiểm kê các màn lõi `view`, `customerForm`, `activityForm`, `noteForm`.
- [x] Kiểm kê các màn trạng thái tải dữ liệu và giới hạn ngân sách.
- [x] Kiểm kê bốn màn FBM: `run`, `account`, `results`, `settings`.
- [x] Kiểm kê các vùng FBM dùng chung cho identity, status, conflict, audit và relay.
- [x] Xác định các thay đổi ngoài phạm vi cần giữ nguyên: `sheetLink`, `SelectionService`, model/scout Extension và test selection.

## Schema lõi Sidebar

- [x] Tách schema `view` thành `client/schema/screens/view.html`.
- [x] Tách schema `customerForm` thành `client/schema/screens/customerForm.html`.
- [x] Tách schema `activityForm` thành `client/schema/screens/activityForm.html`.
- [x] Tách schema `noteForm` thành `client/schema/screens/noteForm.html`.
- [x] Tách header dùng chung thành `client/schema/screens/formHeader.html`.
- [x] Giữ `client/schema/uiSchema.html` chỉ làm registry, không chứa lại bố cục màn.
- [x] Chuyển controller `statusScreen` sang schema trạng thái và renderer chung.
- [x] Tách schema trạng thái vào `client/schema/status/common.html`, `budgetBlocked.html`, `loadError.html`, `loadSummary.html`.
- [x] Thêm style trạng thái dùng chung tại `client/style/status.html`.
- [x] Xác nhận controller lõi không chứa HTML literal hoặc lối tắt DOM.

## Schema FBM

- [x] Tạo schema riêng cho màn Chạy đồng bộ tại `client/schema/sync/screens/run.html`.
- [x] Tạo schema riêng cho màn Tài khoản FBM tại `client/schema/sync/screens/account.html`.
- [x] Tạo schema riêng cho màn Kết quả & xử lý tại `client/schema/sync/screens/results.html`.
- [x] Tạo schema riêng cho màn Cài đặt phiên tại `client/schema/sync/screens/settings.html`.
- [x] Tạo registry FBM tại `client/schema/sync/screens/index.html`.
- [x] Chuyển `fbmSyncUiSchema.html` thành compatibility bridge chỉ chứa helper renderer, không chứa schema màn.
- [x] Nạp đủ năm schema FBM trước controller tương ứng trong `client/Sidebar.html`.
- [x] Nạp lại compatibility bridge trong `client/Sidebar.html` vì các controller cũ vẫn gọi helper bridge.
- [x] Chuyển nhãn, lựa chọn pipeline, tab, tiêu đề trang và thông tin field tĩnh của bốn màn vào schema.
- [x] Chuyển id vùng render, class component và nhãn phân trang của bốn màn vào schema.
- [x] Chuyển toàn bộ wrapper Block tĩnh còn lại của bốn màn vào factory trong schema; controller chỉ ghép dữ liệu state/DTO và node động.
- [x] Chuyển vùng identity đang nằm trong `fbmSyncSettingsScreen.html` vào schema Tài khoản FBM hoàn chỉnh.
- [x] Chuyển các block status, issue, conflict và audit còn nhãn tĩnh sang schema FBM dùng chung tại `client/schema/sync/results/`.
- [x] Quyết định và ghi rõ ranh giới giữa schema bố cục màn và schema nội dung DTO động để không biến controller thành nơi khai báo UI lần nữa.

### Ranh giới thực thi đã chốt

- [x] Schema màn hình giữ nhãn, id, class, thứ tự vùng, factory Card/Row/Stack/Box và các giá trị mặc định nhìn thấy trên giao diện.
- [x] Controller màn hình giữ state/DTO, phép chọn nhánh nghiệp vụ, phép map dữ liệu động và truyền slot vào factory schema; không giữ HTML, DOM construction hoặc chuỗi UI tĩnh.
- [x] Khung năm vùng cố định trong `client/Sidebar.html` chỉ là host của renderer (header/progress/info/body/footer), không phải một màn nghiệp vụ; mọi nội dung màn được thay bằng Block từ schema.
- [x] Schema kết quả giữ format nội dung động (prefix, separator, fallback) để controller chỉ nối dữ liệu trả về từ GAS/Extension.
- [x] `fbmSync.html` được giữ ở ranh giới điều phối state/request; các chuỗi trạng thái nó phát ra là DTO runtime, còn mọi cấu trúc Block, nhãn schema và format hiển thị thuộc controller/schema màn tương ứng.
- [x] `fbmSyncUiSchema.html` chỉ còn compatibility bridge; registry và schema nguồn nằm trong `client/schema/sync/screens/` và `client/schema/sync/results/`.

## Rà hardcode controller

- [x] Rà `client/sync/screens/run.html`; loại nhãn pipeline, tiêu đề phase, marker, action id/class khỏi phần khai báo trực tiếp.
- [x] Rà `client/sync/screens/account.html`; loại nhãn login, id vùng, class field/action khỏi phần khai báo trực tiếp.
- [x] Rà `client/sync/screens/results.html`; loại nhãn tab, phân trang, id vùng và class hiển thị khỏi phần khai báo trực tiếp.
- [x] Rà `client/sync/screens/settings.html`; loại nhãn cấu hình, id control, default hiển thị và class layout khỏi phần khai báo trực tiếp.
- [x] Rà lần cuối mọi chuỗi người dùng nhìn thấy trong bốn controller FBM, gồm fallback/error/notice do controller tạo.
- [x] Rà `fbmSyncShell.html` để nhãn header, menu và trạng thái ON/OFF không bị khai cứng ngoài schema shell.
- [x] Rà `fbmSyncStatusScreen.html` và `fbmSyncAuditScreen.html` để nội dung tĩnh dùng schema status/audit.
- [x] Rà `fbmSyncConfigEditor.html` để nhãn action chung có nguồn schema chung, không tạo bản sao giữa các màn.

## Contract và test

- [x] Thêm `tests/cases/screenSchemaAudit.js` kiểm tra schema lõi/trạng thái nằm đúng folder và Sidebar include đủ schema.
- [x] Cập nhật `tests/cases/fbmSync/Components.js` để đọc schema FBM mới thay vì tìm chuỗi ở controller cũ.
- [x] Kiểm tra controller màn không chứa HTML literal hoặc thao tác DOM trực tiếp.
- [x] Bổ sung audit riêng cho FBM: mỗi màn có đúng một schema, schema không có DOM/HTML literal, controller không khai nhãn UI tĩnh.
- [x] Bổ sung kiểm include thứ tự: schema trước controller, bridge trước nơi gọi helper bridge.
- [x] Bổ sung kiểm không có schema FBM trùng tên hoặc registry trỏ file không tồn tại.
- [x] Chạy `node tests/run.js` sau nhóm thay đổi ban đầu; mốc đạt gần nhất là `1657/1657` trước khi mở rộng tiếp.
- [x] Chạy lại `node tests/run.js` sau khi hoàn tất các mục đang mở.
- [x] Nếu thay đổi contract dùng chung, cập nhật test tương ứng và chỉ đọc phần tổng kết/lỗi.

## Tài liệu và bàn giao

- [x] Cập nhật `0_Documentation/00. Tài liệu chính thức/03. Data schema & UI schema.md` mô tả schema theo màn và schema trạng thái.
- [x] Cập nhật `0_Documentation/Phiên code/Cây thư mục code.md` cho các thư mục schema mới.
- [x] Sửa mô tả `fbmSyncUiSchema.html` trong cây thư mục thành compatibility bridge.
- [x] Cập nhật checklist này ngay sau từng nhóm hoàn thành, không gom tick cuối lượt.
- [x] Ghi rõ các mục cần chủ dự án nghiệm thu trực quan trên Sheet DEV, không đánh dấu hoàn tất bằng test offline.
- [x] Không commit thay đổi selection/Extension ngoài nhóm refactor schema Sidebar.

### Nghiệm thu trực quan còn lại trên Sheet DEV

- [ ] Mở Sidebar trên Sheet DEV, chuyển lần lượt Run/Account/Results/Settings và xác nhận không có vùng trắng, card lặp hoặc mất tiêu đề.
- [ ] Ở Results, thử Summary/Conflict/Errors/Log/Audit; xác nhận tab, phân trang và nút xử lý vẫn thao tác được.
- [ ] Ở Settings, mở từng card, sửa rồi hủy/lưu; xác nhận control không bị ghi đè khi status nền cập nhật.
- [ ] Ở Account, thử login/identity và xác nhận field giữ bản nháp khi chuyển tab hoặc nhận status mới.

## Tiêu chí hoàn tất

- [x] Bốn màn FBM và các vùng status/conflict/audit đều có nguồn schema rõ ràng, đúng folder, không có bản khai UI trùng trong controller.
- [x] Sidebar include đúng thứ tự và không còn include thiếu hoặc include file schema không tồn tại.
- [x] Audit test bắt được việc thêm màn không có schema hoặc thêm HTML/DOM vào controller.
- [x] `node tests/run.js` đạt không lỗi.
- [x] Diff cuối chỉ gồm code/schema/test/tài liệu thuộc refactor này và thay đổi sẵn có được bảo toàn.
- [x] Báo cáo bàn giao nêu file chính, test đã chạy, mục còn cần chủ dự án kiểm tra trên DEV và không lặp lại bảng số liệu ở các lượt sau.
