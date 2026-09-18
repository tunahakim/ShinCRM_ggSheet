# Checklist refactor UI schema sạch CSS

Phạm vi: loại chi tiết CSS/renderer thừa khỏi screen schema, gom cách chọn presentation vào lớp UI, giữ nguyên hành vi nghiệp vụ và rà các cấu trúc UI lặp. Không sửa fixture trong `0_Documentation/Nghiên cứu FBM/`, không đổi giao thức GAS/Extension và không đánh dấu nghiệm thu giao diện Sheet DEV thay người dùng.

## 0. Mốc xuất phát và quyết định contract

- [x] Đọc `03. Data schema & UI schema.md`, `03A. Hợp đồng Schema.md` và checklist refactor UI hiện có.
- [x] Ghi nhận baseline `node tests/run.js`: 1667 kiểm thử đạt, 0 lỗi.
- [x] Kiểm kê 201 selector trong `1_ShinCRM_GAS/client`: 186 class `shin-*` và 15 class `is-*`.
- [x] Xác định 18 schema HTML đang chứa giá trị liên quan class và lập danh sách consumer/ngoại lệ trong `Ghi chú tạm audit class và component UI.md`.
- [x] Chốt contract: screen schema chỉ giữ cấu trúc, nhãn, hành vi, dữ liệu và trạng thái tương tác; không giữ `className`, tên selector, token CSS hoặc cách ghép class.
- [x] Chốt ranh giới component: dùng chung primitive `Button`, `IconButton`, `StandaloneControl`, `MenuItem` và helper hiện có; không tạo component nghiệp vụ riêng chỉ vì nhãn/action khác nhau.
- [x] Ghi contract mới vào tài liệu chính thức và ví dụ schema sau khi test contract đã chạy ổn.

## 1. Catalog presentation và resolver

- [x] Chọn tên và vị trí tệp catalog/resolver trong lớp UI, dự kiến `1_ShinCRM_GAS/client/ui/uiClassMap.html`.
- [x] Khai báo các token presentation tối thiểu cho action dùng chung: primary, secondary, quiet, link, danger và trạng thái disabled/loading khi component cần.
- [x] Khai báo ánh xạ action và ngữ cảnh component sang token; không đưa token này vào screen schema.
- [x] Khai báo ánh xạ token/state sang class đã tồn tại; không đổi CSS ở pha đầu.
- [x] Resolver chỉ nhận dữ liệu có cấu trúc (`action`, surface/component context, state), từ chối chuỗi class tự do.
- [x] Có fallback an toàn cho action chưa khai catalog và ghi lỗi rõ ràng khi chạy kiểm tra schema: resolver trả chuỗi rỗng an toàn; audit báo action bắt buộc nhưng chưa có mapping.
- [x] Cập nhật `client/Sidebar.html` để include catalog trước các builder/renderer sử dụng nó.
- [x] Cập nhật `0_Documentation/Phiên code/Cây thư mục code.md` nếu thêm tệp code mới.

## 2. Kiểm thử contract schema

- [x] Mở rộng `tests/cases/screenSchemaAudit.js` để cấm `className`, `rootClass`, selector DOM và các property kết thúc bằng `Class` trong nhóm schema lõi đã migrate; nhóm status/Sync tiếp tục siết ở các mục sau.
- [x] Kiểm tra các map class còn lại phải nằm đúng namespace component/catalog, không rải property class ngang cấp.
- [x] Kiểm tra action trong schema được catalog/resolver biết đến khi action cần presentation.
- [x] Kiểm tra mọi class do catalog tham chiếu đều tồn tại trong CSS hoặc được đánh dấu là class primitive/host hợp lệ.
- [x] Bổ sung audit contract trong `tests/cases/screenSchemaAudit.js` và dùng phép quét CSS hiện có để phân biệt class catalog với class renderer/host.
- [x] Chạy `node tests/run.js`, ghi kết quả vào checklist ngay sau khi nhóm test đạt: 1669 đạt, 0 lỗi sau nhóm catalog/form lõi.

## 3. Migrate schema lõi và form

- [x] Loại literal class khỏi `schema/screens/activityForm.html`.
- [x] Loại literal class khỏi `schema/screens/customerForm.html`.
- [x] Loại literal class khỏi `schema/screens/noteForm.html`.
- [x] Loại literal class khỏi `schema/screens/formHeader.html`.
- [x] Loại literal class khỏi `schema/screens/view.html`.
- [x] Chuyển presentation của header/footer/button sang resolver hoặc primitive component; giữ nguyên action và thứ tự hiển thị.
- [x] Loại chuỗi `shin-header-title shin-form-title` khỏi `screen/formScreen.html`, đưa quyết định style vào component/header contract.
- [x] Kiểm tra lại `UI_FORM_HEADER`, footer save và icon save dùng chung một primitive, không tạo wrapper theo nghiệp vụ.
- [x] Chạy test sau nhóm core form và tick kết quả.

## 4. Migrate schema trạng thái

- [x] Loại literal class khỏi `schema/status/common.html`.
- [x] Loại literal class khỏi `schema/status/budgetBlocked.html`.
- [x] Loại literal class khỏi `schema/status/loadError.html`.
- [x] Loại literal class khỏi `schema/status/loadSummary.html`.
- [x] Cho helper status dùng tone/state có cấu trúc để resolver chọn class.
- [x] Giữ ngoại lệ class nội bộ của status renderer nếu không phải dữ liệu screen schema.
- [x] Chạy test sau nhóm status và tick kết quả: 1670 đạt, 0 lỗi.

## 5. Chuẩn hóa schema và consumer Sync/FBM

- [x] Rà `sync/screens/index.html`: loại toàn bộ `headerClass`, `navClass`, `navItemClass`, `activeClass`, `disabledClass`, `activeItemClass`, `toggleOnClass`, `toggleOffClass`, `actionRowClass`, `cancelClass`, `saveClass`, `editIconClass`, `editClass`, `primaryClass` khỏi schema.
- [x] Rà `sync/screens/run.html`: giữ cấu trúc role/state, chuyển class presentation sang `FBM_SYNC_RUN_UI`/catalog.
- [x] Rà `sync/screens/account.html`: xử lý `identity.cardClass` và action save/edit qua UI helper/resolver.
- [x] Rà `sync/screens/results.html`: xử lý `tabRowClass`, `tabClass`, `paginationClass` và consumer tương ứng.
- [x] Rà `sync/screens/settings.html`: xử lý `notice.relayClass` và class layout/state qua `FBM_SYNC_SETTINGS_UI`.
- [x] Rà `sync/results/status.html`, `issues.html`, `audit.html`, `conflict.html`: chuyển class presentation khỏi schema; domain class nằm ở UI helper.
- [x] Cập nhật controller/renderer Sync đọc `FBM_SYNC_*_UI`, không giữ compatibility property class trên schema.
- [x] Sửa bypass trong `sync/fbmSync.html` đang ghép `shin-loading-track`, `shin-loading-fill`, `is-idle`, `is-indeterminate`, `is-waiting` trực tiếp.
- [x] Kiểm tra `fbmSyncShell.html` và `fbmSyncConfigEditor.html`: CSS domain giữ trong module, action class gọi catalog/resolver.
- [x] Chạy test sau nhóm Sync screen/result: `node tests/run.js` đạt 1674, 0 lỗi.

## 6. Rà ngoại lệ renderer, slot và host

- [x] Đối chiếu `uiBuilder.html`, `renderEngine.html`, `inputs.html`, `menu.html`, `choiceMenu.html`, `combo.html`, `popupList.html`, `collapse.html`, `progress.html`, `search.html` với whitelist ngoại lệ.
- [x] Giữ class primitive do renderer tự sinh, không đẩy ngược vào screen schema.
- [x] Giữ class DOM nội bộ menu/combo/popup/collapse và ghi rõ ranh giới trong contract.
- [x] Rà `ui/slots.html` để bảo đảm class domain của slot có consumer và không bị dùng thay cho role chung.
- [x] Rà class host tĩnh trong `Sidebar.html`, `selectionPoll.html`, `pendingDelete.html` và class input error trong save flow.
- [x] Ghi mọi ngoại lệ còn lại vào báo cáo tạm và hợp đồng Schema, kèm lý do không migrate.

## 7. Rà component lặp và xử lý

- [x] Lập bảng inventory các đối tượng xuất hiện từ hai lần trở lên trên toàn bộ màn hình: button/action, notice/status, card/section, field row, toggle, tab, pagination, empty/error/loading state.
- [x] Với mỗi nhóm, phân biệt phần giống nhau về cấu trúc/hành vi với phần chỉ khác dữ liệu, nhãn hoặc callback.
- [x] Ưu tiên mở rộng primitive/helper hiện có trước khi tạo component mới.
- [x] Bảo đảm toàn bộ nhóm nút lưu/xác nhận dùng chung `Button`/helper tương ứng; action và nhãn nằm trong schema, presentation do resolver quyết định.
- [x] Bảo đảm nút sửa, nút điều hướng nội bộ và nút link ngoài chỉ tách component khi semantics/keyboard/URL thực sự khác; không tách theo tên nghiệp vụ.
- [x] Đã rà các consumer lặp nhưng không tạo component mới: primitive/helper hiện tại biểu diễn đủ; nếu phát sinh markup/state mới sẽ yêu cầu ít nhất hai consumer trước khi tách.
- [x] Kiểm thử sau nhóm catalog/layout bằng `node tests/run.js`: 1674 đạt, 0 lỗi; không có consumer mới cần migrate.

## 8. Tài liệu, kiểm tra và bàn giao

- [x] Cập nhật `03. Data schema & UI schema.md` để bỏ ví dụ `className` và mô tả contract schema sạch CSS.
- [x] Cập nhật `03A. Hợp đồng Schema.md` nếu cần thêm quy tắc class/catalog/ngoại lệ.
- [x] Cập nhật báo cáo tạm để phản ánh trạng thái sau mỗi nhóm lớn; không tạo bản tóm tắt quy tắc nền trùng lặp.
- [x] Chạy `node tests/run.js` đầy đủ ở mốc offline hiện tại: 1674 đạt, 0 lỗi.
- [x] Kiểm tra diff chỉ gồm file thuộc phạm vi, không chạm fixture nghiên cứu FBM và không đổi nghiệp vụ/GAS/transport.
- [x] Nghiệm thu giao diện trên Sheet DEV: form, view, status và các màn Sync; chủ dự án đã xác nhận đạt trên deployment DEV revision `@433`.
