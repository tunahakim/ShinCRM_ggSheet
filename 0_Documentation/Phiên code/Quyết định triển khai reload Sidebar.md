# BẢN GHI QUYẾT ĐỊNH TRIỂN KHAI RELOAD SIDEBAR

> Bản ghi này giữ lại các quyết định đã chốt trong phiên thiết kế reload mới. Hợp đồng nghiệp vụ chuẩn nằm ở `0_Documentation/00. Tài liệu chính thức/07A. Hợp đồng Reload RAM và Sheet quản trị.md`; checklist thực thi nằm ở `0_Documentation/Phiên code/Checklist reload RAM và sheet quản trị.md`. Khi hai nơi khác nhau, phải cập nhật hợp đồng và checklist, không tự tạo luật thứ ba trong code.

## 1. Trạng thái quyết định

- Chủ dự án đã duyệt hướng triển khai một request selection duy nhất khi không có Extension.
- Chưa sửa code theo hướng mới tại thời điểm tạo bản ghi này.
- Việc triển khai bắt buộc theo thứ tự: cập nhật tài liệu chính thức, cập nhật checklist, đối chiếu code hiện tại, sửa từng lát code, kiểm thử offline, rồi nghiệm thu trên Spreadsheet DEV.
- Không thử trên Spreadsheet có dữ liệu khách thật.

## 2. Mục tiêu

Mục tiêu là giữ RAM Sidebar và toàn bộ sheet quản trị nhất quán sau mọi thay đổi được GAS xác nhận, đồng thời không để việc theo dõi ô đang chọn làm người dùng phải chờ hoặc thấy thanh loading giả.

Các yêu cầu phải đạt:

1. GAS là nơi duy nhất biết một giá trị có thực sự được ghi, cột có mã hợp lệ hay không, mã bản ghi nào bị ảnh hưởng và scope reload nào an toàn.
2. Mọi ghi thành công vào `Customer` hoặc `Activity` qua `onEdit`, `WriteGate`, `DeleteGate`, pull, push hoặc background đều phát signal dirty chung.
3. Sheet quản trị được GAS quyết định và vẽ độc lập, không phụ thuộc Sidebar, Extension, focus hay sheet đang active.
4. Sidebar nhận schema và dữ liệu thô từ Extension, tự phân tích Name Box/hàng 1 để quyết định có cần đánh thức GAS hay không; Sidebar không tự quyết định dirty state, scope reload hay API nghiệp vụ.
5. Khi có Extension hoặc không có Extension, click vào ô vẫn phải lấy được mã khách để đổi khách đang xem.
6. Tránh nhiều request nối tiếp chỉ để lấy context selection; khi có thể, một request GAS phải trả cả selection và quyết định reload.

## 3. Ranh giới ba thành phần

### 3.1. GAS

GAS giữ nguồn sự thật và state bền vững:

- installable `onEdit` xử lý sửa giá trị trực tiếp;
- installable `onChange` xử lý thay đổi cấu trúc;
- `WriteGate`/`DeleteGate` xử lý mọi ghi do GAS;
- `ReloadDecision` phân loại thay đổi và tạo output;
- `DirtyState` giữ `revision`, `changedAt`, các scope bẩn;
- `renderAllManagedViewsIfAllowed` vẽ sheet quản trị;
- các API reload thực thi nạp RAM theo scope.

GAS không được chờ Sidebar để vẽ view và không được coi Extension là nguồn sự thật.

### 3.2. Extension

Extension là kênh quan sát và vận chuyển dữ liệu thô. Nó không hiểu ý nghĩa nghiệp vụ của mã cột hoặc token đọc. Nó phải giữ đường đọc dữ liệu phục vụ đổi khách khi người dùng click vào ô, nhưng không được biến kết quả đó thành quyết định reload.

Chỉ bỏ những phần mới thêm trong phiên này dùng để suy đoán việc nhập liệu:

- suy đoán `isEditing`;
- đọc thanh công thức để kết luận bắt đầu hoặc kết thúc sửa;
- dùng chuyển trạng thái `isEditing: true -> false` để đặt timer reload;
- coi `CRM_CONTEXT` là bằng chứng người dùng vừa sửa dữ liệu.

Extension gửi một `CRM_CONTEXT` cho Sidebar khi trạng thái hoặc tín hiệu tương tác thực sự thay đổi, gồm:

- tên sheet và `gid`;
- chuỗi nguyên bản của Name Box (`E10`, `E10:G12`, `A:A`, `5:7`, hoặc tên vùng);
- tên sheet, `gid`, Spreadsheet ID và dữ liệu hàng 1 đọc được dạng thô: mọi ô không rỗng kèm địa chỉ vật lý (`A1`, `B1`, ...), số cột vật lý, giá trị thực tế và cờ `complete`;
- các ô dữ liệu được Sidebar cấp trong `readPlan` (nếu có), kèm địa chỉ, giá trị thực tế, trạng thái và lỗi đối chiếu giá trị kỳ vọng;
- tín hiệu tương tác bàn phím hoặc click trên canvas; không phân biệt Delete/Backspace;
- `customerId`/`customerIdSource` hiện tại được giữ để tương thích và đổi khách tức thời, nhưng không phải quyết định nghiệp vụ;
- thời điểm phát hiện.

Extension dùng địa chỉ vật lý thật của Sheet, không đánh số lại theo cột đang hiển thị. Cột ẩn vẫn là `B1`, `B10`... Nếu không xác minh được hàng 1 hoặc ô được yêu cầu, Extension trả `complete=false`/`unavailable` và thông tin lỗi; không tự đoán.

Extension không quyết định có reload, không quyết định cột `@` hợp lệ, không phân tích Name Box thành loại nghiệp vụ, không tạo `reloadRelevant`/`reloadColumns` và không được ghi dirty.

Extension bắt mọi tín hiệu bàn phím ở tầng DOM như một `keyboardHint`, không tách luật Delete/Backspace. Extension cũng bắt click chỉ trong vùng canvas/lưới của Google Sheets. Nếu click làm Name Box đổi thì context vị trí là tín hiệu chính; nếu click không làm Name Box đổi (ví dụ menu chuột phải rồi paste), click vẫn tạo hint sau vòng gom 200 ms. Click vào Sidebar/menu/iframe không thuộc canvas bị bỏ qua.

Các event này vẫn chỉ là hint; Extension không kết luận có `onEdit`, không đọc ý nghĩa mã cột và không tạo dirty signal.

### 3.3. Sidebar

Sidebar giữ state riêng của trang đó:

- `previousSelectionContext`;
- `lastSeenRevision`;
- `previousCustomerId`;
- bản nháp cục bộ để bảo vệ form đang sửa;
- các timer đánh thức và timer safety polling.

Sidebar giữ schema, ý nghĩa mã `@` và `readPlan`. Sidebar tự phân tích Name Box và đối chiếu toàn bộ hàng 1 có giá trị để biết một hint có nằm trong vùng có ý nghĩa cần kiểm tra hay không. Đây chỉ là tối ưu thời điểm gửi request; GAS vẫn là nơi xác nhận thay đổi, dirty state, scope reload và payload. Nếu hàng 1 không đầy đủ hoặc không chắc chắn, Sidebar phải fail-open và hỏi GAS.

Ở phía GAS, trigger giữ snapshot hàng 1 theo từng sheet để đối chiếu cả sửa một ô lẫn sửa vùng. Snapshot được tạo khi cài trigger và cập nhật sau mỗi lần `onEdit` chạm hàng 1; nếu thiếu snapshot, GAS không được để Sidebar thay thế việc xác nhận nghiệp vụ.

Khi Extension gửi `CRM_CONTEXT` có `customerId` hợp lệ và mã đã có trong Store, Sidebar phải gọi đường nguồn-chọn cục bộ ngay trong lượt nhận tin để màn hình chính đổi khách không phụ thuộc độ trễ RPC. Các lượt kiểm tra dirty, reload RAM hoặc đồng bộ sheet quản trị có thể chạy nối tiếp ở nền; nếu mã chưa có trong Store thì được thử lại sau khi lượt nạp hoàn tất.

## 4. Một request selection duy nhất

Khi không có Extension, không dùng chuỗi hai request từ Sidebar:

```text
probeSelectionCheap() -> probeSelectionFull()
```

Thay vào đó, dùng một API bên ngoài duy nhất theo hợp đồng, tên có thể là `probeSelectionAndReload`.

Sidebar truyền:

- selection context lần trước;
- `previousCustomerId`;
- `lastSeenRevision`;
- `localDraft`;
- sheet hiện tại và lý do đánh thức.

Trong một lượt chạy GAS:

1. Đọc sheet, range và tọa độ hiện tại.
2. So sánh với context lần trước.
3. Nếu vị trí/vùng/sheet đổi, đọc cột mã theo schema và lấy mã khách mới.
4. Nếu vị trí không đổi, trả lại mã khách cũ hoặc không gửi lại mã; không đọc ô mã khách vô ích.
5. Đọc `ReloadState` và gọi `ReloadDecision` với input Sidebar đầy đủ.
6. Gọi quyết định và thực thi reload ngay trong cùng lượt GAS. Nếu chưa đủ thời gian debounce, trả `defer` cùng `readyAt`/`waitMs`; nếu đã đủ, GAS tự nạp dữ liệu và trả payload trong chính response này.

`probeSelectionAndReload` là cổng request-response duy nhất của Sidebar cho selection và RAM. Sidebar không được nhận một `decision` rồi gọi tiếp `reloadRecords`, `reloadCategory` hoặc `loadCore` để hoàn tất cùng một lượt reload. Sidebar chỉ áp dụng payload mà GAS trả về.

Response tối thiểu:

```text
{
  requestId,
  selection,
  decision,
  reload: ReloadState,
  payload: { mode: 'none' | 'records' | 'category' | 'fullCore', ... },
  observedRevision,
  processedRevision,
  remainingRevision,
  revisionMatched
}
```

GAS không tự đẩy response ở `readyAt`: Apps Script không có kênh push và request đã kết thúc sau khi trả `defer`. Sidebar chỉ làm nhiệm vụ vận chuyển, đặt một timer theo `waitMs`, rồi gửi request kế tiếp. Request đầu tiên đến sau `readyAt` sẽ nhận payload.

Nếu GAS gọi helper tương đương `probeSelectionFull` bên trong cùng lượt chạy thì đó không phải request mạng thứ hai. Không lưu context selection dùng chung trong `DocumentProperties`: nhiều Sidebar hoặc nhiều người dùng có thể đứng ở các vị trí khác nhau. Context lần trước do Sidebar truyền vào là nguồn tối ưu an toàn hơn.

`probeSelectionCheap` có thể còn tồn tại như helper nội bộ nếu giúp giảm đọc Sheet, nhưng không được là một bước RPC bắt buộc trước `probeSelectionFull`.

## 5. Hai mốc thời gian của Sidebar

### 5.1. Debounce đánh thức theo phạm vi và tương tác

Sau mỗi context, Sidebar đối chiếu Name Box với hàng 1 và hủy timer cũ. Ô đơn/đổi sheet không có `keyboardHint` hoặc click bất thường dùng `POSITION_WAKE_MS=1000`. Vùng/hàng/cột, mọi `keyboardHint`, hoặc click canvas không làm Name Box đổi dùng `EDIT_SETTLE_MS=3000`. Nếu không thuộc phạm vi mã `@` cần kiểm tra thì không đặt wake; nếu hàng 1 không đầy đủ thì fail-open và vẫn đặt wake.

Mục đích là giảm số request khi người dùng di chuyển nhanh, gõ liên tục hoặc kéo vùng. Hai hằng số này là cấu hình dùng chung giữa Sidebar và GAS; chúng không thay thế `changedAt` do trigger GAS ghi.

Nếu wake mới đến trong lúc request trước còn chạy, Sidebar chỉ giữ một cờ wake đang chờ ở tầng vận chuyển rồi gửi một request tiếp theo. Cờ này không chứa mã, không chứa scope và không quyết định nghiệp vụ. GAS phải đọc `ReloadState` mới nhất và tự thực thi hoặc trả `defer` theo scope đó. Không có request con `reloadRecords` từ Sidebar trong cùng chuỗi.

Ví dụ năm lần sửa A–E cách nhau một giây: các request trong năm giây đầu chỉ trả `defer`; request kế tiếp tại mốc dữ liệu sẵn sàng trả một payload duy nhất chứa A–E. Mỗi response trước đó không có payload. Nếu F phát sinh sau khi A–E đã được xử lý, F tạo revision mới và được trả trong một request riêng sau mốc debounce của F.

Apps Script không có cơ chế hủy chắc chắn một invocation đang chạy. Vì vậy thiết kế không dựa vào hủy tiến trình: request cũ có thể hoàn tất nhưng chỉ được áp dụng nếu revision của nó không thấp hơn revision đã nạp. `DirtyState` lưu nhật ký các mã records theo revision trong `DocumentProperties`; khi revision đổi trong lúc đọc, GAS chỉ xóa mã của revision đã đọc và giữ mọi mã xuất hiện ở revision mới, kể cả trường hợp cùng một mã bị sửa lại. Nếu signal đổi trong lúc đọc, GAS giữ signal mới hoặc trả chỉ thị để request kế tiếp xử lý, không xóa nhầm dirty state.

### 5.2. Debounce dữ liệu 3 giây

Với sửa trực tiếp `Customer`/`Activity`, GAS ghi `changedAt` ngay khi `onEdit` đánh dấu dirty. RAM không được reload sớm hơn `changedAt + 3000 ms` để gom nhiều `onEdit` liên tiếp.

Ví dụ:

```text
10:00:00.0  onEdit ô A, changedAt = 10:00:00.0
10:00:00.4  onEdit ô B, changedAt = 10:00:00.4
10:00:01.2  onEdit ô C, changedAt = 10:00:01.2
10:00:02.2  Sidebar chưa hỏi vì đây là chuỗi input, hẹn theo EDIT_SETTLE_MS
10:00:04.2  Sidebar hỏi một lần; GAS trả payload nếu trigger đã ghi và đủ mốc
10:00:04.2  Nếu GAS chưa thấy signal hoặc chưa đủ mốc, GAS trả defer và waitMs còn thiếu
```

Mỗi `onEdit` mới cập nhật lại mốc cuối. Rời `Customer` hoặc `Activity` là ngoại lệ đã chốt: Sidebar reload ngay và hủy timer còn lại.

Hai mốc không áp dụng giống nhau cho sheet quản trị. `onEdit`/`onChange`/cửa ghi phải để GAS quyết định và vẽ view theo chính sách ngay; Sidebar debounce chỉ phục vụ RAM Sidebar.

## 6. Không có Extension

Fallback selection polling hiện có được giữ để lấy vị trí khi không có Extension. Nhịp mặc định hiện tại là 2 giây, sau ba lần vị trí ổn định chuyển thành 6 giây.

Mỗi request fallback phải gộp luôn kiểm tra reload:

```text
selection probe
  + current position
  + customerId nếu vị trí đổi
  + ReloadState/ReloadDecision
```

Sidebar chỉ đặt wake khi tự đối chiếu context với schema/hàng 1 thấy vùng có khả năng ảnh hưởng. Metadata `reloadColumns`/`reloadRelevant` không còn là giao thức Extension. Khi hàng 1 chưa đầy đủ, schema/hint thiếu hoặc không thể xác định an toàn, Sidebar fail-open và vẫn hỏi GAS.

Nếu vị trí không đổi nhưng `revision` mới, Sidebar vẫn xử lý RAM reload. Nếu vị trí đổi, GAS lấy mã khách mới trong cùng request hoặc trong helper nội bộ của cùng request.

Safety polling theo `n` phút là lưới an toàn thứ hai. Timer được tính từ lần Sidebar hỏi GAS gần nhất thành công; nếu đã có fallback probe hoặc wake request gần hơn thì timer được reset, không tạo request trùng. Request safety chạy âm thầm, chỉ reload thật sự mới được hiện loading.

Khuyến nghị ban đầu cho `n` là 1 phút để nghiệm thu, sau đó có thể tăng nếu cần giảm lưu lượng. Không đặt safety polling khi Sidebar đã đóng. `focus` và `visibilitychange` chỉ đặt lại lịch fallback/safety, không gọi `sheetLinkSyncDirtyData()` trực tiếp. Khi trình duyệt tạm dừng ACK trong tab nền, fallback có thể hỏi GAS một lượt sau khi quay lại; lượt này phải im lặng nếu không có payload reload.

## 7. Hợp đồng reload RAM

Một wake request phải truyền cho `ReloadDecision`:

- `selectionContext` và `previousSelectionContext`;
- `lastSeenRevision`;
- `localDraft` và mã Sidebar đang giữ bản nháp;
- nguyên nhân `position`, `keydown`, `safety-poll`, `open`;
- context thô, hàng 1, kết quả `readPlan`, loại tương tác và phạm vi đã Sidebar phân tích để quyết định thời điểm wake;
- `autoRenderView` và các chính sách liên quan.

GAS trả quyết định tối thiểu:

```text
{
  selection: { position, positionChanged, customerId, customerIdChanged },
  ram: { action: 'none' | 'reload' | 'defer', mode, recordIds, waitMs, reason },
  views: { action: 'none' | 'render' | 'defer', mode, reason },
  reload: ReloadState
}
```

`selection.customerId` là dữ liệu phục vụ đổi khách đang xem; `ram` là quyết định nạp Store; `views` là thông tin GAS, Sidebar không tự thực thi phần view.

Nếu bản nháp Sidebar trùng mã đang bẩn, GAS trả `defer` cho mã đó, không ghi đè bản nháp. Các mã khác trong cùng signal vẫn được reload. Cờ chung không được xóa chỉ vì một Sidebar đã đọc hoặc đã defer.

## 8. Sheet quản trị

Sheet quản trị được xử lý chủ động, không chờ Sidebar polling:

```text
onEdit/onChange hoặc WriteGate/DeleteGate
        ↓
ReloadDecision trên GAS
        ↓
DirtyState
        ↓
renderAllManagedViewsIfAllowed()
```

Các trường hợp chính:

- Customer/Activity đổi ở cột mã hợp lệ: vẽ toàn bộ view sau signal, nếu chính sách cho phép.
- Category/Config đổi: vẽ toàn bộ view sau signal.
- Hàng 1 sheet quản trị chỉ vẽ khi trước hoặc sau thay đổi có ít nhất một giá trị mã `@` hợp lệ; đổi giá trị thường sang giá trị thường không vẽ. Sửa một ô hay cả vùng đều đối chiếu từng ô trước/sau.
- Thay đổi cấu trúc qua `onChange`: đánh dấu scope bảo thủ và vẽ lại view cần thiết.
- `autoRenderView=false`: không vẽ tự động, nhưng giữ cờ; khi bật lại, GAS vẽ toàn bộ ngay.

Sidebar safety polling không phải là cơ chế quyết định vẽ view. Nó chỉ giúp RAM Sidebar phát hiện signal khi không có event đánh thức đủ nhanh.

## 9. `onChange`

`onChange` là trigger Spreadsheet cho thay đổi cấu trúc như thêm/xóa hàng, cột hoặc sheet. Event thường không có range chính xác, nên xử lý bảo thủ:

- thêm/xóa hàng hoặc cột ở Customer/Activity: `allCore` + `allViews`;
- thêm/xóa sheet hoặc thay đổi cấu trúc schema: `schema` + `allCore` + `allViews`;
- thay đổi cấu trúc sheet quản trị: `allViews`.

`onChange` không thay thế `onEdit`, không dùng để xác định thay đổi giá trị ô thông thường.

## 10. Các ca nhập liệu và nguyên tắc an toàn

- Chỉ mở ô hoặc click xem: không có `onEdit`, revision không đổi, không reload.
- Enter để xem rồi đóng mà không đổi: không có dirty mới, request nếu có cũng trả `none`.
- Nhấn Esc hủy: không có dirty mới.
- Double-click, gõ rồi click sang ô khác: GAS `onEdit` là nơi xác nhận; context hint chỉ đánh thức, không được dùng để lấy vùng vừa sửa.
- Nhập trên thanh công thức: keydown có thể đánh thức; GAS vẫn quyết định.
- Kéo tự động điền: `onEdit` xử lý vùng nếu Sheets phát event; fallback/safety polling chỉ đọc signal đã được GAS ghi.
- Thay đổi do công thức phụ thuộc một ô khác: tạm thời không mở rộng phạm vi; không giả định polling Sidebar tự phát hiện được signal chưa được GAS ghi.
- Ghi thất bại: không tạo signal thành công, không xóa dirty cũ.

## 11. Loading và request im lặng

Request kiểm tra selection/reload không được làm thanh loading chạy mỗi nhịp. `callServer` hiện là cửa chung bật progress cho mọi request; các probe selection/reload phải truyền `silent: true`, chỉ payload reload thật mới được hiện loading.

Chỉ các lượt thực sự nạp RAM, full core, hoặc thao tác người dùng cần chờ mới được hiện loading. Việc kiểm tra revision không đổi phải kết thúc âm thầm. `probeSelectionAndReload` luôn chạy với `silent: true`; cờ `SHEET_LINK_SHOW_PROBE_PROGRESS` phải giữ `false`, chỉ payload reload thật mới mở tiến trình.

## 12. Tiêu chí nghiệm thu mới

Trên Spreadsheet DEV phải chứng minh:

1. Extension vẫn lấy đúng `customerId` khi click vào Customer, Activity và sheet quản trị.
2. Không có Extension, một request selection trả được context, mã khách khi vị trí đổi và quyết định reload.
3. Không đổi vị trí thì không đọc lại ô mã khách.
4. Sửa cùng một ô Customer, đứng nguyên sheet, Sidebar reload sau 3 giây tính từ `onEdit` cuối.
5. Nhiều edit liên tiếp chỉ có một lượt reload RAM.
6. Đổi sheet vẫn reload ngay.
7. Keydown, Enter và Esc không tự tạo dirty nếu GAS không có signal.
8. Không có Extension, fallback selection probe kèm kiểm tra reload; không có request kiểm tra dư.
9. Safety polling phát hiện signal nền sau tối đa `n` phút khi không có wake request khác.
10. Sheet quản trị được vẽ ngay từ `onEdit`, `onChange` hoặc cửa ghi, kể cả khi Sidebar đóng.
11. `autoRenderView=false` giữ cờ và bật lại thì GAS vẽ ngay.
12. Ghi thật thất bại không làm mất dirty state.
13. Nhiều Sidebar không ghi đè context selection của nhau.

## 13. Việc không được làm trong lát triển khai này

- Không rollback toàn bộ Extension.
- Không bỏ đường lấy `customerId` khi click.
- Không lưu tọa độ selection chung vào `DocumentProperties`.
- Không để Sidebar tự phân loại cột `@` hoặc tự quyết định API reload.
- Không dùng polling Sidebar để thay thế renderer sheet quản trị.
- Không mở rộng sang dependency công thức trong lát này.
- Không chạm fixture trong `0_Documentation/Nghiên cứu FBM/`.
- Không thử trên dữ liệu khách production.

## 14. Bổ sung: pipeline sau khi áp payload và reload Config riêng

Sau khi GAS trả payload, Sidebar phải hoàn tất việc bung và tổ chức toàn bộ payload vào RAM trước khi vẽ. Không nhánh nào được vẽ giữa chừng hoặc tự gọi `renderScreen()` không có màn đã dựng. Các nhánh `records`, `category`, `config`, `customer`, `activity` và `fullCore` đều trả tóm tắt scope đã áp dụng; một bộ điều phối chung `refreshDecideAndRender` chạy đúng một lần sau pha áp RAM.

Bộ điều phối nhận scope đã áp dụng, mã bị ảnh hưởng, revision, `ScreenState` và bản nháp cục bộ. Nó không gọi GAS, không tạo dirty signal và không quyết định API reload. Nếu đang ở `view`, nó kiểm tra mã khách còn trong Store rồi gọi `screenViewRender`; nếu đang ở form, nó gọi `screenFormRender` và giữ `formStack[].draft`. Mã khách đã biến mất phải được dọn trước khi vẽ view.

`reloadConfig` là một đường nạp riêng. GAS đọc đủ `params`, `sheetSchema`, `defaults`, `counters` và `sort`, trả `reloadMode: 'config'`; Sidebar thay toàn bộ `Store.config` mà không reset hoặc đọc lại Customer/Activity. Chỉ khi GAS xác định thay đổi Config ảnh hưởng Schema hoặc cách giải mã bản ghi mới nâng scope thành `fullCore`. Sau khi Config áp xong, bộ điều phối vẽ lại màn hình hiện tại theo cùng quy tắc như mọi payload khác.

Các mục kiểm thử bắt buộc cho lát này: payload records cập nhật giao diện ngay cả khi mã khách không đổi; full core không vẽ khi Activity còn đang nạp; Config riêng cập nhật `Store.config` mà không đọc lại Customer/Activity; form giữ bản nháp; không còn request do `mouseenter`; response/context cũ không làm nháy ngược mã khách.
