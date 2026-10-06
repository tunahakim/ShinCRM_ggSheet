# Nghiên cứu luồng đẩy thay đổi ShinCRM lên FBM

## Phạm vi và giả định

- Câu hỏi nghiên cứu: mô tả từng bước quan sát được khi người dùng dừng đồng bộ nền/chạy đồng bộ thủ công để đẩy một bản ghi giao dịch ShinCRM đã sửa khác FBM lên FBM, trong kịch bản thành công.
- Giả định của người dùng: tự động đăng nhập đã bật; cấu hình đã đúng; tab FBM đang đóng và phiên FBM đã đăng xuất.
- Tài liệu đang dùng: `0_Documentation/00. Tài liệu chính thức/09. Đồng bộ FBM/00. Mục lục và phạm vi.md`, `09A. Hợp đồng đồng bộ FBM.md`, `0_Documentation/Phiên code/Checklist rà soát đồng bộ FBM trước vận hành thật.md`, `0_Documentation/Phiên code/Câu hỏi đêm.md`, `tests/contracts/fbmSyncPipeline.js`.

## Phát hiện đầu tiên

1. Kiến trúc có ba nơi chạy code: GAS giữ nghiệp vụ, state, cursor, hash và quyết định; Extension chỉ là đồng hồ/relay và gọi `fetch` trong content script của tab FBM; Sidebar điều phối và hiển thị.
2. Một lát đồng bộ là một request và một lần ghi kết quả xuống Sheet; không có công việc sống qua ranh giới hai lát, không chạy song song.
3. Khi có phiên nền, lệnh đồng bộ thủ công phải làm phiên nền dừng sau request FBM hiện tại rồi ưu tiên phiên thủ công.
4. Với record đã có `FBM_ID`, tình huống sửa khác FBM thuộc nhóm đẩy Customer/Activity đã liên kết (F05/F06 tùy loại bản ghi) và có thể nằm trong luồng đồng bộ hai chiều (F09).
5. Tab FBM đóng không làm Extension tự mở tab; GAS phải phát một request qua relay, Extension mới tìm/mở hoặc dùng tab FBM theo hợp đồng phiên. Cần đọc code để xác định chính xác trạng thái hiển thị và tên tab.

## Ghi chú phương pháp

Các dòng chữ UI, thứ tự callback, tên tab và thao tác trình duyệt chỉ được chốt sau khi đối chiếu tài liệu UI, cổng phiên, code GAS/Sidebar/Extension và test tương ứng. Không suy đoán từ tên hàm nội bộ.

## Đối chiếu code hiện hành — điều kiện để ca thành công

1. Màn `Chạy đồng bộ` có dropdown `Loại đồng bộ` với nhãn chính xác `Đẩy từ ShinCRM → FBM`; khi chưa chạy nút là `Bắt đầu đồng bộ`; khi phase đang hoạt động nút là `Dừng đồng bộ`; trong lúc đang chờ response sau thao tác dừng, nút là `Đang dừng…` (dấu ba chấm Unicode).
2. Nút `Dừng đồng bộ` chỉ là nút hủy phiên đang chạy. Nó không bắt đầu đồng bộ. Sự kiện click gọi `fbmSyncCancel`, không gọi `fbmStartSync`.
3. Khi người dùng bấm `Bắt đầu đồng bộ`, Sidebar gọi GAS `fbmStartSync('push', trace)`, đặt trạng thái tạm `Đang chuẩn bị đồng bộ` / `Đang chuẩn bị phiên đồng bộ...`, rồi chạy vòng GAS → Extension → tab FBM → GAS cho đến khi không còn `request`.
4. GAS preflight đọc lại Sheet, dựng hash local hiện tại và so với `fbmHash` baseline đã lưu; nó chưa gọi FBM để đọc hash live ở bước này. Chỉ bản ghi ShinCRM đổi được đưa vào ứng viên. Với Activity đã có `FBM_ID`, cổng còn kiểm Customer cha, owner, ngày và Category trước request ghi.
5. Nếu số ứng viên đạt ngưỡng chấp thuận (mặc định lớn hơn hoặc bằng `10` theo code `candidateCount >= approvalThreshold`), GAS trả `awaiting_approval`, Sidebar hiện `Phiên có nhiều thay đổi; hãy xem kết quả rồi chấp thuận để tiếp tục.` và nút `Chấp thuận và chạy`. Ca một giao dịch thường không vào nhánh này.
6. Nếu chưa vượt ngưỡng, GAS dựng request hệ thống đầu tiên `authorize` cho Customer. Envelope có `openFbmContext` khi chính sách auto-open bật; URL Extension được GAS cấp là `https://fbo.com.vn:8888/Main/zccrAccount.aspx`, `active: false`.
7. Extension tìm tab có URL `https://fbo.com.vn:8888/*`. Nếu không có tab và envelope có `openFbmContext`, Chrome mở một tab mới URL trên; Extension chờ tab tải xong tối đa 15 giây, rồi tiêm executor và gửi request qua content script. Nếu auto-open tắt, không có tab thì trả lỗi `FBM_TAB_NOT_FOUND` và không có request nghiệp vụ tiếp theo.
8. Trong kênh Sidebar, request đi từ iframe qua `postMessage` với action `CRM_FBM_REQUEST`; iframe bridge chuyển nguyên envelope sang service worker; service worker tìm tab và gọi content-script executor. Extension không hiểu payload nghiệp vụ và không tự mở bước tiếp theo.
9. Cổng phiên theo hợp đồng phải xác minh phiên sống bằng HTTP 200 + JSON parse được + có khóa `d`; khi phiên chết, auto-login phải dùng chuỗi login → authorize → User, rồi đối chiếu Spreadsheet ID, mã user, username, tên tài khoản. Không được tự bấm nút hủy phiên cũ trên FBM.

## Điểm cần nói rõ về ca đăng xuất

- `FbmSync.start` lưu cursor `authorize_customer`, nhưng envelope đi qua `nextEnvelope`; khi identity chưa được xác minh, `nextEnvelope` đổi request thực tế thành `session_probe` trước khi trả về Sidebar.
- Auto-login chỉ chạy sau khi probe được phân loại là phiên không sống và chính sách tự đăng nhập có đủ credential. Nếu phản hồi live khác mẫu mà cổng không nhận diện được, phiên sẽ dừng theo mã lỗi tương ứng; không được hứa vượt quá điều code đã kiểm tra.

## Nhánh Activity đã có FBM_ID khi chạy push thành công

1. `FbmSync.start({mode:'push'})` sau preflight và hai authorize sẽ đọc tuần tự bốn lookup Category: `@CAT_TINH_THANH`/`crProvinceCity`, `@CAT_NGUON_KH`/`crLeadSource`, `@CAT_CONG_VIEC`/`crJob`, `@CAT_SAN_PHAM`/`crdmsp`. GAS giữ các cặp cần dùng trong state, Extension chỉ chuyển response.
2. Sau lookup cuối, `beginCustomerPull` nhận ra mode `push`, dựng `categoryGate`, chuyển phase `push`, entity `customer`, cursor `push_scan`, message `Đang chuẩn bị các bản ghi ShinCRM cần đẩy lên FBM...`; GAS quét candidates local. Không pull toàn bộ Customer/Activity trong push-only.
3. Candidate Activity đã có `FBM_ID` và hash local khác `fbmHash` trở thành `kind:'edit'`; Customer cha phải có FBM_ID, quyền `allowFbmPush`, Category hợp lệ, đủ trường/ngày/nội dung, owner hợp binding và không bị khóa bởi người dùng.
4. GAS dựng request mở form Activity: `activity_edit_open`, action `Edit`, values chứa FBM_ID, memvars rỗng. State: phase `push`, entity `activity`, current là mã nội bộ Activity, message `Đang đẩy giao dịch ACT-...`.
5. Sidebar hiển thị status snapshot tại chỗ; trước khi response về, nó thay message bằng `Đang chờ tab FBM trả dữ liệu giao dịch...`; khi Extension trả response thì hiển thị `Đã nhận phản hồi FBM; đang chờ GAS xử lý...` trong lúc gọi `fbmContinueSync`.
6. GAS trích OldValue, owner, end_time, fileticket từ response mở form; dựng `activity_edit_save` với memvars NewValue/OldValue, giữ ngày/giờ và fileticket; không dùng timestamp `InternalValues` để thay OldValue.
7. FBM nhận request lưu. Khi response lưu thành công, GAS ghi tạm trạng thái `pushed`/FBM_ID qua cửa ghi Sheet, giữ baseline cũ, lưu hash đang chờ xác nhận trong state và log lý do `Đã gửi request ghi; đang đọc xác nhận trực tiếp.`. Đây chưa phải kết thúc thành công.
8. GAS cấp request mở form Activity lần nữa (`activity_verify`) để đọc xác nhận trực tiếp. Sidebar lại hiện `Đang chờ tab FBM trả dữ liệu giao dịch...`, rồi `Đã nhận phản hồi FBM; đang chờ GAS xử lý...`.
9. GAS tính hash dữ liệu đọc lại. Nếu khớp hash vừa gửi và bản ghi ShinCRM chưa bị sửa tiếp, cửa ghi cập nhật `fbmHash`, `syncStatus = synced`, `syncedAt`; xóa hash pending, nhả khóa record, tăng `counts.succeeded`, log `FBM đã xác nhận đúng dữ liệu vừa ghi.` và message tạm `Đã xác nhận activity ACT-...`.
10. Candidate cuối làm `nextPushRequest` chuyển state `done`, xóa cursor/entity/current và đặt message chính xác `Đồng bộ hoàn tất; bản ghi vừa đẩy đã được FBM xác nhận.`; GAS trả `request:null`.

## Các chuỗi hiển thị chính trên Sidebar trong nhánh thành công

- Trước khi gọi GAS: `Đang chuẩn bị đồng bộ` và `Đang chuẩn bị phiên đồng bộ...`.
- Khi phase kiểm tra/authorize/lookup: nhãn phase `Đang kiểm tra phiên FBM`; pipeline `Kiểm tra phiên FBM`, `Category`, `Kiểm tra bản ghi`, `Mở form FBM`, `Ghi FBM`, `Đọc xác nhận`, `Cập nhật baseline`; tiến trình khi chưa có tổng là `Tiến trình: đang xử lý…`.
- Khi Activity edit: nhãn phase `Đang ghi dữ liệu`; hướng `ShinCRM → FBM`; đối tượng `Giao dịch`; message request chờ là `Đang chờ tab FBM trả dữ liệu giao dịch...`; pipeline chuyển lần lượt `Mở form FBM`, `Ghi FBM`, `Đọc xác nhận`.
- Khi done: nhãn `Hoàn tất`; pipeline title `Pipeline đã hoàn tất`, mọi marker là `✓`; hướng `ShinCRM → FBM`; đối tượng `Tổng hợp`; session `Customer: Đã xác nhận · Activity: Đã xác nhận`; bộ đếm một bản ghi là `Đã xử lý 1 · thành công 1 · lỗi 0 · xung đột 0 · hoãn 0`; message `Đồng bộ hoàn tất; bản ghi vừa đẩy đã được FBM xác nhận.`; nút trở lại `Bắt đầu đồng bộ`.
- Sidebar không tự chuyển sang màn `Kết quả & xử lý`; người dùng vẫn ở `Chạy đồng bộ`. Nếu mở menu nội bộ thì các nhãn tab kết quả là `Tổng quan`, `Xung đột`, `Lỗi`, `Log`, `Nghiệm thu`.

## Nếu người dùng thật sự bấm `Dừng đồng bộ`

1. Sidebar đặt `cancelRequested=true` nhưng vẫn giữ `running=true`, gọi GAS `fbmCancelSync` và không bỏ promise relay đang chờ.
2. GAS thấy `activeRequestId`, đặt `metadata.cancelPending=true`, trả mã `SYNC_CANCEL_PENDING` và message `Đang chờ response FBM hiện tại để dừng an toàn; sẽ không cấp request kế tiếp.`
3. Sidebar đổi nút thành `Đang dừng…` và khóa nút. Request FBM đang bay vẫn được gửi/nhận; không có lệnh thu hồi HTTP.
4. Khi response cuối vào GAS, `nextEnvelope` thấy `cancelPending`, chuyển phase `paused`, xóa reservation/deadline, đặt message `Đã nhận xong response đang bay và dừng phiên; không cấp request FBM kế tiếp.` rồi trả `request:null`.
5. Về nghiệp vụ, đây là kết thúc `Tạm dừng`, không phải `Hoàn tất`; không được kết luận bản ghi đã đẩy nếu request lưu hoặc đọc xác nhận chưa chạy xong.
6. Code client hiện reset cờ `running/cancelRequested` sau lần paint trạng thái cuối nhưng không gọi thêm `fbmSyncPaint`; vì vậy sau callback cuối, DOM có thể còn nhãn `Đang dừng…` cho tới lần đọc status tiếp theo. Test hiện có chỉ kiểm cờ RAM đã về `false`, chưa chốt repaint cuối.

## Trình duyệt và tab trong ca auto-open

- Tab Spreadsheet Google hiện tại vẫn giữ focus. `openFbmContext.active` được GAS đặt `false`, nên `chrome.tabs.create` mở tab FBM nền và Extension không tự chuyển người dùng sang tab đó.
- URL Extension được cấp để mở là `https://fbo.com.vn:8888/Main/zccrAccount.aspx`.
- Nếu FBM redirect người dùng chưa đăng nhập, URL nhìn thấy trong tab có thể trở thành `Login.aspx`; điều này do máy chủ FBM, không do code Extension. Code login dùng `fetch` tới Login.aspx và các endpoint `GetEntityData`, `GetUnitData`, `Login`, rồi `fetch` lại `zccrAccount.aspx`; các fetch này không tự điều hướng thanh địa chỉ.
- Sau mỗi request, tab FBM không hiển thị thông báo nghiệp vụ do Extension; Sidebar của Google Sheet mới là nơi hiển thị progress/message. Extension chỉ tiêm `executor.js`, gọi fetch cùng cookie/Referer và trả thân response thô.

## Các dòng có mã hóa/chuỗi không đồng nhất cần giữ nguyên khi mô tả

- Một số message trong PullFlow hiện là ASCII không dấu, ví dụ `Dang kiem tra phien FBM...`, `Da xac thuc Customer; dang xac thuc Activity...`, `Dang kiem tra danh muc FBM...`, `Dang doc giao dich cua khach hang...`, `Dong bo hoan tat.`.
- Message sau bước save Activity trong PushFlow hiện chứa chuỗi mojibake literal `ÄÃ£ ghi activity <ID>; Ä‘ang Ä‘á»c xÃ¡c nháº­n FBM...`; không được tự sửa thành tiếng Việt có dấu khi báo “code hiện tại”, vì đó là dòng người dùng có thể nhìn thấy nếu GAS trả nguyên chuỗi này.
- Có một lệch hiển thị khác trong code hiện tại: `fbmSyncLoop` chỉ chọn chữ `giao dịch` khi `request.meta.entity === 'activity'`, nhưng các builder `activity_edit_open`/`activity_edit_save`/request verify hiện không gắn `meta.entity`. Vì vậy message chờ của ba request Activity có thể hiện nguyên văn `Đang chờ tab FBM trả dữ liệu khách hàng...` dù status entity là Activity/Giao dịch. Đây là hành vi code hiện tại; hợp đồng UI mong đợi phải là `...giao dịch...`.

## Đính chính về probe phiên và auto-login đầu lượt

- `FbmSync.start({mode:'push'})` lưu cursor `authorize_customer`, nhưng gọi `sessionSystemEnvelope('authorize')`; hàm này đi qua `nextEnvelope()` trước khi trả về Sidebar. Khi marker identity chưa được xác minh, `nextEnvelope()` đổi request thực tế thành `session_probe`, đổi cursor thành `session_probe`, phase thành `checking_session`, entity rỗng và message `Đang kiểm tra tab và tài khoản FBM...`.
- Vì vậy thứ tự ca đầu lượt đẹp nhất là: Sidebar gọi `fbmStartSync` → GAS phát `session_probe` → Extension mở tab nền nếu envelope có `openFbmContext` → probe User. Probe sống phải trả HTTP 200, parse được và có khóa `d`; GAS đối chiếu bốn nhận diện với binding rồi mới trả lại `authorize_customer`.
- Với tab đã đăng xuất, probe không được coi là thành công. Nếu phản hồi probe là HTTP 200 có `Authorized:false` và không có dòng User, hoặc phản hồi không sống sau cơ chế probe lại, `sessionGateHandleProbeFailure()` mới gọi `beginAutoLogin()` khi chính sách tự đăng nhập đã bật và credential đã cấu hình. Adapter login lần lượt GET `Login.aspx`, POST `GetEntityData`, POST `GetUnitData`, POST `Login`, rồi GET lại `zccrAccount.aspx` để lấy payload cookie; sau đó GAS vẫn authorize Customer, đọc User, đối chiếu Spreadsheet ID/mã user/username/tên đầy đủ, rồi dựng lại cursor đang chờ.
- HTTP 500/thân không parse được chỉ đi vào auto-login khi nó xuất hiện ở probe và được `sessionGateHandleProbeFailure()` nhận diện như probe không sống. Nếu lỗi đó xảy ra ở request ghi (`cursor.kind === 'push_wait'`), cổng cố ý chặn và trả `SESSION_EXPIRED_AT_WRITE`, không tự gửi lại lệnh ghi.

## Runbook đầy đủ cho một Activity đã liên kết

Phần này cố định ca có đúng một ứng viên Activity đã có `FBM_ID`, Customer cha đã liên kết, giá trị local đã đổi khác hash baseline, không có conflict, không có bản ghi Customer cần đẩy và không chạm ngưỡng chấp thuận. Để tab đang đóng vẫn chạy được, giả định bắt buộc là cả `enabled=true` của tự đăng nhập và `autoOpenTab=true` của `Cho phép tự mở tab FBM khi GAS yêu cầu` đều đã lưu.

1. Người dùng đang ở Sidebar, màn `Chạy đồng bộ`, chọn `Đẩy từ ShinCRM → FBM`. Trước khi chạy, nút là `Bắt đầu đồng bộ`. Nút `Dừng đồng bộ` chưa tồn tại ở trạng thái này; nó chỉ xuất hiện sau khi phiên chạy.
2. Người dùng click `Bắt đầu đồng bộ`. Listener chặn click mặc định, điều phối tới `fbmSyncRun('push')`; không mở tab trình duyệt bằng code Sidebar.
3. Sidebar đặt `running=true`, `cancelRequested=false`, xóa trace cũ, tăng `viewEpoch`, rồi vẽ ngay: nhãn phase `Đang chuẩn bị đồng bộ`, hướng `Kết nối FBM`, đối tượng `Chuẩn bị phiên`, message `Đang chuẩn bị phiên đồng bộ...`, bộ đếm rỗng. Vì phase đang hoạt động, nút được thay bằng `Dừng đồng bộ`; dropdown loại đồng bộ bị khóa.
4. Sidebar gọi `google.script.run` tới `fbmStartSync('push', trace)`. Service GAS ghi trace vào vùng chẩn đoán, vào `controlDispatchLocked('start')` để khóa phiên, đọc state cũ và kiểm tra công tắc module.
5. GAS chạy preflight trên Sheet hiện tại: đọc Customer/Activity local, dựng candidate, tính hash local hiện tại và so với baseline `fbmHash`, kiểm quyền `allowFbmPush`, parent Customer, owner, required fields, Category và conflict. Một ứng viên nên không trả `awaiting_approval`; nếu có từ 10 ứng viên trở lên thì ở đây thay vào đó Sidebar sẽ hiện `Phiên có nhiều thay đổi; hãy xem kết quả rồi chấp thuận để tiếp tục.` và nút `Chấp thuận và chạy`.
6. GAS tạo state run mới: `phase=checking_session`, `mode=push`, `origin=manual`, cursor ban đầu `authorize_customer`, đếm 0, ghi state vào DocumentProperties. Service ghi Log hành động `start`/preflight theo các chuyển phase cần ghi; Log chỉ chứa mã, lý do, hash và bộ đếm, không chứa cookie, mật khẩu, token hay payload.
7. Dù cursor nghiệp vụ là `authorize_customer`, envelope đầu tiên đi qua `nextEnvelope()`. Vì identity của run mới chưa được xác minh, GAS thay request thực tế thành `session_probe`, đổi cursor thành `session_probe`, giữ phase `checking_session`, entity rỗng, message `Đang kiểm tra tab và tài khoản FBM...`. Envelope có `meta.openFbmContext={url:'https://fbo.com.vn:8888/Main/zccrAccount.aspx',active:false}` nếu auto-open đã bật; GAS cấp `requestId`, deadline 120 giây và đánh dấu `activeRequestId`.
8. Sidebar nhận kết quả `fbmStartSync`, vào `fbmSyncLoop`. Nó vẽ snapshot GAS, sau đó vẽ message chờ request. Với probe, UI có thể hiện `Đang chờ tab FBM trả dữ liệu khách hàng...` vì request hệ thống User không khai `meta.entity='activity'`; đây là cách code chọn chữ, không phải dữ liệu nghiệp vụ.
9. Sidebar gửi `postMessage` lên cửa sổ Sheet với `action='CRM_FBM_REQUEST'`, nonce, session Extension, id chờ cục bộ và nguyên envelope. `iframe_bridge.js` kiểm origin/nonce/session, không đọc payload, rồi chuyển `FBM_EXECUTE_REQUEST` cho service worker.
10. Service worker `findFbmTab()` dò URL `https://fbo.com.vn:8888/*`. Không tìm thấy tab nên đọc `openFbmContext`; Chrome tạo tab mới với URL `https://fbo.com.vn:8888/Main/zccrAccount.aspx` và `active:false`. Tab mới nằm nền, tab Google Sheet vẫn giữ focus. Máy chủ FBM có thể redirect thanh địa chỉ của tab mới tới `Login.aspx`; Extension không tự điều hướng thanh địa chỉ bằng fetch.
11. Worker đợi tab hoàn tất tối đa 15 giây, ping executor; nếu chưa có hoặc sai phiên bản thì tiêm `content_scripts/fbm_sync/executor.js`, ping lại, rồi gửi `FBM_EXECUTE_V2`. Nếu auto-open tắt thì bước này dừng bằng `FBM_TAB_NOT_FOUND`, không có ca thành công.
12. Executor thay token `{{FBM_PAYLOAD_COOKIE}}` bằng dữ liệu bắt được từ HTML trang khi probe cho phép fallback rỗng, gọi `fetch` tới endpoint User bằng `credentials:'include'`, timeout fetch 10 giây, đọc cả gzip thành text và trả `{ok,status,headers,body,transport.trace}`. Tab FBM không hiện thông báo nghiệp vụ; Sidebar mới hiện tiến độ.
13. Bridge chuyển response thô về Sidebar bằng `CRM_FBM_RESPONSE`, ghép trace bridge/worker/executor. Sidebar vẽ tạm `Đã nhận phản hồi FBM; đang chờ GAS xử lý...`, rồi gọi `fbmContinueSync(response, trace)`; không gửi request kế tiếp trước khi GAS quyết định.
14. GAS kiểm `requestId` chống response cũ, xóa reservation của probe, nhập trace, parse response và kiểm tra probe sống bằng HTTP 200 + JSON parse được + khóa `d`. Vì phiên đã đăng xuất, probe được xem là không sống. Cổng phiên gọi `beginAutoLogin()` nếu credential đã cấu hình và retry policy cho phép; state đổi message thành `Phiên FBM hết hạn; đang thử đăng nhập lại tự động...`, cursor `login`, phase `checking_session`.
15. GAS cấp envelope `login`. Tab FBM đã tồn tại nên worker không tạo tab thứ hai. Worker đọc credential đã mã hóa từ `chrome.storage.local` theo `credentialRef`, chỉ đưa credential vào RAM của Extension; GAS/Log/Sidebar không nhận mật khẩu hoặc envelope.
16. Executor chạy đúng chuỗi login: GET `https://fbo.com.vn:8888/Main/Login.aspx` để lấy salt; POST `Login.aspx/GetEntityData`; POST `Login.aspx/GetUnitData`; POST `Login.aspx/Login` với hash mật khẩu; sau login thành công GET `https://fbo.com.vn:8888/Main/zccrAccount.aspx` để bắt payload cookie. Các fetch này dùng cookie tab và không tự đổi URL tab.
17. Response login về GAS. GAS đánh dấu login thành công, đổi cursor thành `login_identity_authorize`, message `Đăng nhập thành công; đang xác minh đúng tài khoản FBM...`, rồi cấp request `authorize` Customer.
18. Response authorize Customer chứa mã `Authorized`. GAS lưu token trong state, đổi cursor `login_identity_user`, message `Đã xác thực phiên; đang đọc mã và tên tài khoản FBM...`, rồi cấp request grid User (`controller='User'`).
19. Response grid User chứa metadata AliasName và một dòng nhận diện. GAS đọc `userId`, `username`, `accountName`, ghép Spreadsheet ID hiện tại, đối chiếu binding đã lưu. Nếu khớp, đánh dấu identity/session sống, xóa cờ hết hạn và dựng lại cursor gốc `authorize_customer`; message `Đăng nhập lại thành công; đang tiếp tục phiên đồng bộ...`.
20. GAS authorize Customer lần nữa cho cursor gốc, nhận token Customer, đặt cursor `authorize_activity`, message literal hiện tại `Da xac thuc Customer; dang xac thuc Activity...` (ASCII không dấu), rồi cấp authorize Activity.
21. Response authorize Activity lưu token Activity, đặt cursor `lookup` index 0, message `Dang kiem tra danh muc FBM...`, rồi cấp lần lượt bốn request completion: `crProvinceCity/@CAT_TINH_THANH`, `crLeadSource/@CAT_NGUON_KH`, `crJob/@CAT_CONG_VIEC`, `crdmsp/@CAT_SAN_PHAM`. Mỗi request đi qua lại đúng các bước Sidebar → bridge → worker → tab → executor → response → `fbmContinueSync`; mỗi envelope mới giữ `activeRequestId` riêng.
22. Sau lookup cuối, GAS lưu các cặp mã Category cần dùng, dựng `categoryGate`, message `Đã đọc danh mục FBM; đang đối chiếu Category...`, chuyển `phase=push`, `entity=customer`, cursor `push_scan`, message `Đang chuẩn bị các bản ghi ShinCRM cần đẩy lên FBM...`. Không có request grid Customer/Activity toàn bộ trong mode `push`.
23. `nextPushRequest()` quét candidates Customer trước. Không có Customer thay đổi nên chuyển cursor sang Activity index 0, đọc lại Activity và Customer cha từ Sheet. Nó thấy Activity `ACT-...` có `FBM_ID`, hash local khác `fbmHash`, quyền cho phép đẩy, Category hợp lệ, đủ `taskType/content/workDate`, parent có `FBM_ID`, owner khớp binding và record không bị khóa.
24. GAS khóa record bằng lock owner `sync`, ghi qua cửa Sheet trạng thái `syncStatus='đang đẩy'`, đặt `phase=push`, `entity=activity`, `current=ACT-...`, cursor `push_wait/operation=activity_edit_open`, message `Đang đẩy giao dịch ACT-......`, rồi trả request mở form Activity `action='Edit'`, `values=[FBM_ID]`, `memvars=[]`.
25. Sidebar vẽ snapshot trên, sau đó `fbmSyncLoop` thay message chờ bằng **chuỗi code hiện tại** `Đang chờ tab FBM trả dữ liệu khách hàng...` vì builder Activity chưa gắn `meta.entity='activity'`. Đây là điểm lệch so với nhãn entity `Giao dịch` và hợp đồng UI mong muốn `...dữ liệu giao dịch...`.
26. Tab FBM trả form Activity. Sidebar vẽ `Đã nhận phản hồi FBM; đang chờ GAS xử lý...` và gọi GAS. GAS trích OldValue từ `InternalValues`/Row/FieldValues, lấy `owner`, `end_time`, `fileticket`, kiểm owner lần nữa; không dùng timestamp `InternalValues` để thay OldValue. GAS tạo request `activity_edit_save` với `NewValue` từ Sheet, `OldValue` từ form, ngày/giờ cũ cần giữ và fileticket; ghi cursor operation `activity_edit_save` trước khi trả request.
27. Sidebar lại vẽ message chờ **thực tế** `Đang chờ tab FBM trả dữ liệu khách hàng...`; Extension gửi request save tới cùng tab. Khi GAS nhận response save thành công, `markPushResult()` đọc id Activity, ghi qua cửa Sheet `syncStatus='đã đẩy chờ xác nhận'` và giữ `fbmId`, giữ nguyên baseline cũ; lưu `hSHIN` đang chờ trong state `pendingPush`; Log thêm `push_record` với lý do `Đã gửi request ghi; đang đọc xác nhận trực tiếp.`
28. GAS đặt cursor operation `activity_verify`, state message literal hiện tại là `ÄÃ£ ghi activity <ID>; Ä‘ang Ä‘á»c xÃ¡c nháº­n FBM...`, rồi cấp request mở form Activity lần hai để đọc xác nhận. Đây là chuỗi mojibake đang nằm trong code, không phải chuỗi nên tự sửa khi mô tả code hiện tại.
29. Sidebar/Extension gửi request verify giống các vòng trước. Sau response, GAS `verifyFormValues()` yêu cầu tối thiểu `id`, `ma_cv`, `details`, `end_date`, tính hash dữ liệu FBM đọc lại và so với `pendingPush.hSHIN`.
30. Hash khớp và local Activity chưa bị sửa tiếp: cửa ghi cập nhật `fbmHash=incomingHash`, `syncStatus='đã đồng bộ'`, `syncedAt`; xóa pending hash; nhả lock `activity:ACT-...`; tăng `counts.succeeded` từ 0 lên 1; Log `push_record` lý do `FBM đã xác nhận đúng dữ liệu vừa ghi.`; message tạm `Đã xác nhận activity ACT-....`.
31. Vì không còn candidate Activity, GAS chuyển `phase=done`, xóa `cursor`, `entity`, `current`, đặt message `Đồng bộ hoàn tất; bản ghi vừa đẩy đã được FBM xác nhận.`, trả `request:null` trong kết quả `fbmContinueSync` cuối. Không cấp thêm request FBM.
32. Sidebar nhận kết quả cuối, vẽ lần cuối: phase `Hoàn tất`; pipeline title `Pipeline đã hoàn tất`; bảy bước `Kiểm tra phiên FBM`, `Category`, `Kiểm tra bản ghi`, `Mở form FBM`, `Ghi FBM`, `Đọc xác nhận`, `Cập nhật baseline` đều marker `✓`; hướng `ShinCRM → FBM`; đối tượng `Tổng hợp`; session `Customer: Đã xác nhận · Activity: Đã xác nhận`; **theo code hiện tại của mode `push`**, bộ đếm là `Đã xử lý 0 · thành công 1 · lỗi 0 · xung đột 0 · hoãn 0` vì `counts.completed` chỉ được cộng trong nhánh đọc grid, còn nhánh push chỉ cộng `counts.succeeded`. Message đúng như bước 31. Nút đổi lại `Bắt đầu đồng bộ`, dropdown mở khóa, Sidebar vẫn ở màn `Chạy đồng bộ` và không tự chuyển sang `Kết quả & xử lý`.
33. Promise `fbmSyncLoop` kết thúc, Sidebar đặt `running=false`, `cancelRequested=false`. Tab FBM được giữ mở ở nền; không có lệnh đóng tab và tab Google Sheet vẫn là tab đang được người dùng nhìn thấy. State GAS, các cột trạng thái Activity và Log là nguồn kết quả cuối; Extension không giữ queue nghiệp vụ.

## Nếu click `Dừng đồng bộ` giữa chuỗi trên

1. Khi phiên đang có `activeRequestId`, click gọi `fbmSyncCancel`; Sidebar đặt `cancelRequested=true`, giữ `running=true`, không hủy promise relay và đổi nút thành `Đang dừng…` (disabled).
2. GAS đặt `metadata.cancelPending=true`, trả `SYNC_CANCEL_PENDING` và message `Đang chờ response FBM hiện tại để dừng an toàn; sẽ không cấp request kế tiếp.` Request đang bay vẫn hoàn tất ở FBM; không có HTTP cancel.
3. Response hiện tại về GAS, cursor được xử lý đúng một lần. Trước khi dựng envelope kế tiếp, `nextEnvelope()` thấy `cancelPending`, chuyển phase `paused`, xóa `activeRequestId/deadline`, xóa cờ chờ, đặt message `Đã nhận xong response đang bay và dừng phiên; không cấp request FBM kế tiếp.`, trả `request:null`.
4. Sidebar vẽ `Tạm dừng`, pipeline title `Pipeline đã tạm dừng`, bước đang làm vẫn là marker hiện tại; không vẽ `Hoàn tất` và không tăng success nếu bước verify chưa chạy. Nếu click xảy ra đúng lúc không còn `activeRequestId`, GAS dừng ngay và message khác là `Đã dừng phiên đồng bộ; kết quả và log của lượt này vẫn được giữ để xem lại.`
5. Sau callback, code reset cờ RAM về false nhưng có thể không paint lại nút thêm lần nữa; DOM có thể còn `Đang dừng…` cho tới lần status tiếp theo. Đây là sai khác hiển thị cần ghi nhận khi nghiệm thu, không phải bằng chứng bản ghi đã được FBM xác nhận.

## Kiểm chứng offline

- Chạy `node tests/run.js` sau khi hoàn tất nghiên cứu: `Đạt: 1935`, `Không đạt: 0`.
