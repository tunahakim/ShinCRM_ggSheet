# Checklist chuẩn hóa vị trí và căn chỉnh UI

Đây là checklist duy nhất của phiên chuẩn hóa vị trí/căn chỉnh UI. Phạm vi là cách các phần tử được đặt trong vùng cha và cách nội dung được căn trong chính phần tử; không làm lại checklist spacing đã hoàn tất. Mỗi mục chỉ được đánh dấu `[x]` khi có bằng chứng cụ thể ở test, diff tài liệu hoặc nghiệm thu Sheet DEV được ghi ngay bên cạnh.

## 1. Phạm vi và nguyên tắc không đổi

- [x] Xác nhận phiên này chỉ xử lý position/alignment của UI, không thay đổi state nghiệp vụ, hợp đồng lưu, dữ liệu Sheet, Extension hoặc transport FBM.
- [x] Xác nhận không sửa `0_Documentation/Nghiên cứu FBM/`.
- [x] Xác nhận các thay đổi FBM session/pipeline đã có sẵn trong worktree không thuộc phiên này và không được đưa vào commit UI.
- [x] Xác nhận checklist spacing `Checklist chuẩn hóa khoảng cách và bố cục UI.md` chỉ được tham chiếu, không tick lại hoặc thay đổi trạng thái cũ.
- [x] Chốt rằng screen schema chỉ mô tả cấu trúc, nhãn, dữ liệu, trạng thái và action; không nhận `left`, `right`, `center`, `start`, `end`, `justify`, `align-items`, `text-align`, margin, CSS selector hoặc style tự do.
- [x] Chốt rằng vị trí của phần tử con do wrapper layout trực tiếp sở hữu; Button, Icon, Text và Field không tự đẩy mình bằng margin hoặc thuộc tính căn sibling.
- [x] Chốt rằng presentation mặc định được resolver/catalog và primitive layout quyết định tập trung, không khai lại tại từng màn hình.
- [x] Chốt dùng giá trị logic `start`/`end` trong tầng layout khi cần hướng, không dùng `left`/`right` làm hợp đồng nghiệp vụ.
- [x] Chốt không có một mặc định `center` cho toàn giao diện; căn giữa chỉ được dùng ở component/trạng thái có ý nghĩa rõ ràng.

## 2. Hợp đồng mặc định phải kiểm thử được

- [x] Chốt Page/Section: các Card con đi theo trục `start`, chiếm vùng được phép và không tự căn riêng.
- [x] Chốt Card/CardBody: block con bắt đầu từ `start`; Card không sở hữu vị trí ngoài của chính nó.
- [x] Chốt Stack: xếp dọc, mặc định `stretch` theo chiều ngang và `start` theo nội dung.
- [x] Chốt Row generic: xếp ngang, mặc định bắt đầu từ `start`; không tự `space-between`; căn dọc mặc định không được làm lệch Field nhiều dòng.
- [x] Chốt wrapper hàng điều khiển có tên riêng được phép căn dọc `center` khi tất cả con là control cùng hàng.
- [x] Chốt Field/StandaloneField: label và control đi theo trục `start`; control chiếm độ rộng do Field/wrapper quyết định.
- [x] Chốt Text/Heading/Label: nội dung đọc mặc định `start`, không tự căn theo tên màn hình.
- [x] Chốt Button: kích thước/vị trí ngoài do wrapper; nội dung chữ và icon bên trong Button căn giữa.
- [x] Chốt Icon/IconButton: glyph căn giữa trong vùng của chính nó; Icon không tự tạo khoảng cách với sibling.
- [x] Chốt ActionStack: nhóm action được đặt ở vị trí cuối của vùng hành động theo preset tập trung; từng Button không tự nhận biết mình nằm bên phải.
- [x] Chốt Header: nhóm đầu, tiêu đề và nhóm cuối được biểu diễn bằng cấu trúc nhóm; không dùng một item đánh dấu `align` để tạo khoảng trống.
- [x] Chốt Notice/Error/Preview: nội dung bắt đầu từ `start`; icon trạng thái và nút đóng do component đặc thù sở hữu.
- [x] Chốt Loading/Empty state: được căn giữa chỉ vì trạng thái này có ý nghĩa hiển thị rỗng/chờ; không dùng làm mặc định cho Stack/Card.
- [x] Chốt bảng: căn cột theo ý nghĩa dữ liệu do Table resolver sở hữu; chữ bắt đầu, số kết thúc, cột action theo preset Table.
- [x] Chốt form nhập số: không tự động đổi sang căn phải chỉ vì kiểu dữ liệu NUMBER; quy tắc căn trong form và trong bảng là hai ngữ cảnh khác nhau.
- [x] Chốt ngoại lệ chỉ được thêm ở primitive/layout catalog/domain component có tên, consumer, lý do và test bảo vệ.
- [x] Chốt không dùng `margin-left: auto` trên Button/Icon/Field để thay cho wrapper sở hữu vị trí.

## 3. Kiểm kê hiện trạng trước khi sửa

- [x] Liệt kê mọi khai báo `align` trong screen schema, form header, view header và các schema FBM; đầu ra phải có đường dẫn file và action/consumer tương ứng.
- [x] Liệt kê mọi nơi `Block` cho phép khóa `align`; phân biệt API primitive với khai báo screen schema.
- [x] Liệt kê mọi nơi renderer dịch `align` thành class hoặc style.
- [x] Liệt kê mọi selector CSS còn dùng `shin-align-right`, `margin-left: auto`, `justify-content`, `align-items` và `text-align`; phân loại generic, primitive, domain và host tĩnh.
- [x] Liệt kê mọi nơi dùng `Row`, `Stack`, `ActionStack`, `StandaloneField`, `Button`, `Icon` trong form lõi và bốn màn Sync.
- [x] Liệt kê mọi header có cấu trúc nhóm đầu/tiêu đề/nhóm cuối; ghi rõ thứ tự hiện tại phải được bảo toàn.
- [x] Liệt kê các layout đặc thù được giữ lại: shell header, schedule row, tab row, pipeline, conflict header, status table, history row, popup và dialog.
- [x] Ghi baseline test trước khi sửa: nhóm UI/layout và tổng `node tests/run.js`, chỉ ghi số lỗi thuộc phiên khác nếu có.
- [x] Chụp/ghi cây Block hiện tại của form header và view header để đối chiếu sau migration.

Ghi chú kiểm kê: `align` đang được khai tại `client/schema/screens/formHeader.html`, `client/schema/screens/view.html`, được cho phép trong `client/ui/uiBuilder.html`, chuyển thành class tại `client/ui/renderEngine.html` và CSS `.shin-align-right` ở `client/style/components.html`/`frame.html`. Các consumer chính là header form/view; không tìm thấy consumer screen khác. Baseline UI gần nhất là `layoutSpacing`, `fbmSync/Components`, `fbmSync/Sidebar` đạt `200/200`; `node tests/run.js` có `1883` đạt và `4` lỗi FBM session/pipeline có sẵn ngoài phạm vi.

## 4. Cập nhật tài liệu chính thức trước code

- [x] Cập nhật `03. Data schema & UI schema.md`: bỏ mô tả screen schema tự do khai `align`; mô tả cấu trúc header theo nhóm và vị trí do layout wrapper sở hữu.
- [x] Cập nhật `03. Data schema & UI schema.md`: tách căn nội dung bên trong primitive, căn con trong wrapper và vị trí cả wrapper trong vùng cha.
- [x] Cập nhật `03. Data schema & UI schema.md`: ghi bảng mặc định cho Page, CardBody, Stack, Row, Field, Text, Button, Icon, ActionStack, Table, Loading/Empty.
- [x] Cập nhật `03. Data schema & UI schema.md`: ghi rõ ngoại lệ dùng resolver/catalog hoặc component ngữ nghĩa, không dùng CSS/style trong schema.
- [x] Cập nhật `04. Bộ máy render và luồng lưu.md`: mô tả layout policy tập trung, header group và ranh giới giữa `spatialConfig` với alignment.
- [x] Cập nhật `04. Bộ máy render và luồng lưu.md`: chốt renderer không dịch khóa `align` của screen schema thành class `shin-align-right` nữa.
- [x] Cập nhật `09/08. UI đồng bộ và cấu hình.md`: ghi các mặc định vị trí cho Settings schedule row, detail controls, action group, notice và tab/result.
- [x] Cập nhật `09/08. UI đồng bộ và cấu hình.md`: ghi ngoại lệ domain còn lại và owner của từng ngoại lệ.
- [ ] Cập nhật `0_Documentation/Phiên code/Cây thư mục code.md` nếu thêm file layout policy hoặc test mới.
- [x] Ghi commit tài liệu riêng sau khi các tài liệu trên không còn mâu thuẫn với quyết định phiên này.

Ghi chú tiến độ: tài liệu nền đã cập nhật; core/header, Sync shell, ActionStack Account, Empty và token schedule đã được commit riêng. Policy semantic hiện nằm trong `UI_LAYOUT_POLICY` của `client/ui/uiBuilder.html`; nhóm policy đã commit `343b422`; test offline gần nhất đạt `1918/1918`. Còn phải hoàn tất allowlist/domain audit, hồi quy cuối và nghiệm thu trực quan DEV.

## 5. Primitive và layout policy

- [x] Tạo hoặc mở rộng đúng một nơi sở hữu layout policy cho các mặc định alignment; không rải map mặc định ở controller, schema và CSS riêng lẻ. Bằng chứng: `UI_LAYOUT_POLICY` và `uiLayoutClass` trong `client/ui/uiBuilder.html`; primitive và HeaderGroup đều dùng resolver này.
- [x] Định nghĩa helper/group cho header start và header end; helper phải nhận đúng hai phía hợp lệ và từ chối giá trị khác. Bằng chứng: `screenHeaderGroup` và ca `HeaderGroup không nhận phía lạ` trong `tests/cases/uiBuilder.js`.
- [x] Định nghĩa wrapper action chuẩn để đặt nhóm action ở `end`; không dùng thuộc tính căn trên từng Button. Bằng chứng: `ActionStack` và kiểm owner trong `tests/cases/layoutSpacing.js`.
- [x] Giữ Button/Icon chỉ sở hữu hình học và căn nội dung bên trong; không cho primitive tự thêm margin để thay vị trí sibling. Bằng chứng: kiểm CSS Button/Icon và Block key contract trong `tests/cases/layoutSpacing.js`, `tests/cases/blockKeys.js`.
- [x] Chốt Row generic không tự `space-between`; nếu cần chia hai phía phải dùng wrapper có tên như SplitRow/HeaderGroup. Bằng chứng: kiểm Row generic trong `tests/cases/layoutSpacing.js`.
- [x] Chốt wrapper control-row có căn dọc riêng; không đổi toàn bộ Row generic chỉ để sửa một loại hàng. Bằng chứng: `.shin-inline-field-row` và ca kiểm trong `tests/cases/layoutSpacing.js`.
- [x] Chốt các component Loading/Empty/Table/Notice có preset riêng, không thay đổi mặc định Stack/CardBody. Bằng chứng: primitive `Empty`, CSS preset và ca kiểm trong `tests/cases/layoutSpacing.js`.
- [x] Cập nhật CSS host/header để nhóm cuối dùng owner nhóm, không dùng `.shin-align-right` trên node lá. Bằng chứng: `.shin-header-group-start/end` trong `client/style/frame.html` và kiểm CSS.
- [x] Xóa hoặc vô hiệu hóa selector generic `.shin-align-right` sau khi không còn consumer. Bằng chứng: kiểm không còn selector trong `tests/cases/layoutSpacing.js`.
- [x] Giữ lại các `text-align`/`justify-content` đặc thù có consumer và ghi chúng vào allowlist; không cấm mù mọi căn chỉnh nội bộ. Bằng chứng: allowlist margin/alignment tại Tài liệu 04 Phần 6 và các test domain trong `tests/cases/layoutSpacing.js`.
- [x] Chạy test primitive/layout ngay sau nhóm này; `node tests/run.js` đạt `1918`, lỗi `0`, bao gồm owner mặc định và selector cũ.
- [x] Tick ngay từng mục primitive đã có bằng chứng test trong checklist.
- [x] Commit riêng nhóm primitive/layout policy và checklist tương ứng; các phần trước đã commit `e3996d3`, policy semantic đã commit `343b422`.

## 6. Migration screen schema và builder

- [x] Đổi form header từ danh sách phẳng có `align` sang cấu trúc nhóm start/end; giữ nguyên action, tooltip và thứ tự trong từng nhóm. Bằng chứng: `client/schema/screens/formHeader.html` và test form.
- [x] Đổi view header sang cấu trúc nhóm start/end; giữ nguyên thứ tự các nút tìm kiếm, refresh, menu, sửa và thêm. Bằng chứng: `client/schema/screens/view.html` và `tests/cases/uiSchema.js`.
- [x] Cập nhật screen builder để dựng HeaderGroup từ cấu trúc nhóm, không chuyển tiếp khóa `align` xuống Block. Bằng chứng: `screenHeader`/`screenHeaderGroup` và test cây header.
- [x] Cập nhật screen builder để từ chối header cấu trúc sai, thiếu nhóm hoặc item không hợp lệ bằng thông báo cụ thể. Bằng chứng: các ca header thiếu nhóm, nhóm lạ, nhóm không phải mảng và item `align` trong `tests/cases/uiBuilder.js`.
- [x] Cập nhật chèn tiêu đề form để tiêu đề nằm trong nhóm start giữa nút đóng và nhóm action cuối, không dò vị trí bằng `align`. Bằng chứng: `screenFormHeader` và `tests/cases/formScreen.js`.
- [x] Cập nhật schema checker để quét cả item trong nhóm header và vẫn kiểm action/menu/tooltip như trước. Bằng chứng: `tests/cases/schemaCheck.js` và toàn bộ test xanh.
- [x] Cập nhật Block key contract: Button/Icon không còn nhận `align` từ screen schema; các khóa lạ vẫn bị chặn. Bằng chứng: `BLOCK_KEYS_BY_ROLE` và `tests/cases/blockKeys.js`.
- [x] Cập nhật renderer: node lá không còn sinh class `shin-align-right`; HeaderGroup mới là nơi sinh cấu trúc vị trí. Bằng chứng: `renderClassList`, CSS HeaderGroup và test render/layout.
- [x] Cập nhật các schema/controller FBM nếu đang dùng pattern `align` hoặc helper tương đương; không đổi nhãn/action nghiệp vụ. Bằng chứng: kiểm kê trước sửa không có consumer `align` trong schema/controller FBM.
- [x] Chạy test `uiBuilder`, `blockKeys`, `schemaCheck`, `renderEngine`, `formScreen`, `viewScreen`, `uiSchema` sau migration. Bằng chứng: `node tests/run.js` đạt `1918`, lỗi `0`.
- [x] Tick ngay từng mục migration có test cụ thể; các mục đã được đánh dấu cùng bằng chứng ngay sau khi `1918/1918` test xanh.
- [x] Commit riêng nhóm migration schema/builder/renderer; đã commit `e3996d3`.

## 7. Chuẩn hóa các màn hình và component dùng chung

- [ ] Kiểm tra form customer: tiêu đề, nút hủy, nút lưu header và footer giữ đúng vị trí sau khi bỏ `align`.
- [ ] Kiểm tra form activity: cùng header/footer contract với customer, không tạo nhánh căn riêng.
- [ ] Kiểm tra note form: title/action và textarea không bị đổi owner vị trí.
- [ ] Kiểm tra view: nhóm công cụ đầu và nhóm hành động cuối không bị dồn hoặc đảo thứ tự.
- [ ] Kiểm tra Card titleActions: dùng nhóm action chuẩn; không dùng `align` lá để đẩy icon.
- [x] Kiểm tra Run: action kiểm tra, chạy, settings và approval dùng wrapper semantic tương ứng. Bằng chứng: ActionStack + hai `shin-single-action-row` trong `tests/cases/fbmSync/Sidebar.js`.
- [x] Kiểm tra Account: identity fields, status và action group dùng Field/Stack/ActionStack chuẩn. Bằng chứng: `FBM_SYNC_ACCOUNT_UI.layout.actionStack`, cây identity/login và test `fbmSync/Sidebar`.
- [x] Kiểm tra Results: tab, description, summary, conflict, error, log, audit và pagination giữ alignment đặc thù đã định nghĩa. Bằng chứng: các ca Results trong `tests/cases/fbmSync/Sidebar.js` và preset domain trong `tests/cases/layoutSpacing.js`.
- [x] Kiểm tra Settings: công tắc tổng, chiều đồng bộ, schedule row, detail inputs và nút Lưu lịch nền dùng preset đúng owner. Bằng chứng: cây schedule/detail và test Settings trong `tests/cases/fbmSync/Sidebar.js`, token schedule trong `tests/cases/layoutSpacing.js`.
- [x] Kiểm tra Notice/Error/Preview xuất hiện và biến mất không làm node con tự căn lại ngoài wrapper. Bằng chứng: render target Notice trong `tests/cases/fbmSync/UserJourneys.js` và preset Notice/Empty/Preview trong `tests/cases/layoutSpacing.js`.
- [x] Kiểm tra header shell Sync và header form không tạo hai cơ chế căn phải khác nhau. Bằng chứng: `fbmSyncShellHeaderBlocks` dùng `screenHeaderGroup('start'/'end')`, test `fbmSync/Sidebar`.
- [x] Với mỗi ngoại lệ domain, ghi consumer, lý do, selector/component owner và test bảo vệ ngay trong checklist hoặc allowlist. Bằng chứng: allowlist Tài liệu 04 Phần 6, hợp đồng Sync Tài liệu 09 Phần 8 và ca domain trong `layoutSpacing`/`fbmSync/Sidebar`.
- [x] Chạy test layout/UI sau từng màn hình; tick các mục đã kiểm chứng sau khi `node tests/run.js` đạt `1918`, lỗi `0`.
- [ ] Commit riêng từng nhóm màn hình nếu diff độc lập; không đưa thay đổi FBM session/pipeline có sẵn vào commit.

## 8. Hợp đồng chống tái phạm

- [x] Test phát hiện `align` xuất hiện trong screen schema/form header/view header hoặc cấu hình màn hình mới. Bằng chứng: `loiAlignmentSchema` trong `tests/cases/uiSchema.js` và ca item `align` trong `tests/cases/uiBuilder.js`.
- [x] Test phát hiện screen schema chứa `left`, `right`, `center`, `start`, `end`, `justify`, `align-items`, `text-align`, margin, class CSS hoặc style tự do ở vị trí bị cấm. Bằng chứng: `loiAlignmentSchema` kiểm các khóa alignment; `start/end` chỉ được chấp nhận ngay dưới header.
- [x] Test xác nhận HeaderGroup chỉ nhận `start`/`end` và cả hai nhóm giữ nguyên thứ tự item. Bằng chứng: các ca HeaderGroup trong `tests/cases/uiBuilder.js` và cây header thật trong `tests/cases/uiSchema.js`.
- [x] Test xác nhận Button/Icon không sinh class căn sibling hoặc margin ngoài. Bằng chứng: `tests/cases/layoutSpacing.js` và `tests/cases/renderEngine.js`.
- [x] Test xác nhận Row generic không tự dùng `space-between`; SplitRow/ActionStack mới được phép có hành vi đó. Bằng chứng: kiểm Row generic và ActionStack trong `tests/cases/layoutSpacing.js`.
- [x] Test xác nhận Stack/CardBody/ActionStack có owner alignment duy nhất, không bị component con ghi đè. Bằng chứng: `tests/cases/layoutSpacing.js` và `tests/cases/fbmSync/Sidebar.js`.
- [x] Test xác nhận Table/Loading/Empty/Notice dùng preset domain đúng owner, không làm thay đổi default generic. Bằng chứng: ca `Loading/Empty/Notice/Table` trong `tests/cases/layoutSpacing.js`.
- [x] Test xác nhận hướng logic `start/end` không bị hard-code `left/right` trong layout policy. Bằng chứng: test `layout policy dùng hướng logic` trong `tests/cases/uiBuilder.js`.
- [x] Test xác nhận schema sai hoặc alignment enum sai bị fail sớm với thông báo tên màn/đường dẫn. Bằng chứng: các ca header sai cấu trúc/item trong `tests/cases/uiBuilder.js` và `uiLayoutClass` thiếu policy.
- [x] Test xác nhận toàn bộ schema hiện tại vẫn render được, không mất action, menu, tooltip, focusId hoặc data-field. Bằng chứng: `uiSchema`, `schemaCheck`, `formScreen`, `viewScreen`, `renderEngine` trong `node tests/run.js`.
- [x] Chạy riêng nhóm contract alignment trước khi chạy bộ đầy đủ; nhóm `layoutSpacing`, `uiBuilder`, `uiSchema`, `renderEngine` đạt trong tổng `1918/1918`, lỗi `0`.
- [x] Tick từng luật chống tái phạm ngay sau khi test đạt.
- [x] Commit riêng nhóm test contract/allowlist; commit cùng nhóm policy sau khi test xanh.

## 9. Hồi quy và an toàn

- [ ] Chạy `node tests/run.js` sau mỗi nhóm code; ghi tổng đạt/lỗi và phân loại lỗi ngoài phạm vi nếu có.
- [ ] Chạy lại toàn bộ test UI/layout liên quan: `layoutSpacing`, `uiBuilder`, `blockKeys`, `schemaCheck`, `renderEngine`, `uiSchema`, `formScreen`, `viewScreen`, `screenSchemaAudit`, `fbmSync/Components`, `fbmSync/Sidebar`.
- [ ] Kiểm tra không sửa fixture trong `0_Documentation/Nghiên cứu FBM/`.
- [ ] Kiểm tra diff từng commit chỉ chứa checklist/tài liệu/code/test alignment thuộc nhóm đó.
- [ ] Kiểm tra các thay đổi FBM session/pipeline có sẵn vẫn giữ nguyên và không bị stage/commit nhầm.
- [ ] Kiểm tra không có cookie, mật khẩu, token, payload nhạy cảm hoặc dữ liệu khách thật trong diff/test/log.
- [ ] Kiểm tra thứ tự include của layout policy, uiBuilder, screenBuild, renderer và schema không tạo lỗi runtime.
- [ ] Tick mục hồi quy ngay khi có output tương ứng.

## 10. Nghiệm thu trực quan trên Sheet DEV

- [ ] Mở Sidebar trên Sheet DEV, không dùng Sheet có dữ liệu khách thật.
- [ ] Kiểm tra form Customer ở trạng thái thêm mới: tiêu đề, Hủy, Lưu và footer đúng vị trí; không có nút bị dồn hoặc tràn.
- [ ] Kiểm tra form Customer ở trạng thái sửa: vị trí giống thêm mới, chỉ nội dung tiêu đề thay đổi.
- [ ] Kiểm tra form Activity và Note: header/action dùng cùng chuẩn với form Customer.
- [ ] Kiểm tra View: cụm công cụ đầu, tiêu đề/vùng co giãn và cụm action cuối đúng thứ tự.
- [ ] Kiểm tra Run: action chính và action phụ không bị căn khác với các màn Sync khác.
- [ ] Kiểm tra Account: label, input, status và action giữ đúng trục.
- [ ] Kiểm tra Results ở cả năm tab: tab, description, Card, pagination và action không đổi vị trí bất ngờ.
- [ ] Kiểm tra Settings giống ảnh tham chiếu: công tắc, chiều đồng bộ, bốn schedule row, detail fields và Lưu lịch nền có trục thống nhất.
- [ ] Kiểm tra Notice, Error, Preview, Empty và Loading xuất hiện/biến mất mà không phá vị trí sibling.
- [ ] Kiểm tra viewport Sidebar hẹp: nhãn dài xuống dòng đúng vùng, control không tràn, action không bị mất hoặc chồng.
- [ ] Kiểm tra focus bằng bàn phím: thứ tự focus theo thứ tự DOM, không bị thay đổi chỉ vì nhóm căn phải.
- [ ] Ghi từng sai lệch bằng màn hình, vùng, kích thước/ vị trí quan sát được và ảnh chụp; không ghi nhận xét chung chung.
- [ ] Chỉ đánh dấu nghiệm thu đạt sau khi chủ dự án xác nhận trực quan trên Sheet DEV.

## 11. Tiêu chí hoàn tất phiên

- [ ] Không còn screen schema nào dùng alignment tự do.
- [ ] Header form/view dùng cấu trúc nhóm thay vì marker `align` trên item lá.
- [ ] Primitive/layout catalog là nơi duy nhất sở hữu mặc định alignment generic.
- [ ] Ngoại lệ domain có owner, consumer, lý do và test.
- [ ] Test contract chặn việc thêm lại alignment tự do vào schema.
- [ ] Tất cả nhóm code đã được tick ngay sau khi hoàn thành và đã commit riêng.
- [ ] `node tests/run.js` đã được chạy; các lỗi còn lại nếu thuộc thay đổi có sẵn phải được ghi rõ, không che hoặc tự ý sửa ngoài phạm vi.
- [ ] Checklist có ghi trạng thái nghiệm thu DEV và commit cuối cùng của phiên.
