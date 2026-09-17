# Checklist phiên đồng bộ FBM

Đây là checklist duy nhất của phiên đồng bộ FBM/ShinCRM. Công việc được thực hiện theo thứ tự từ trên xuống dưới; trong một slice, các mục độc lập có thể làm song song. Chỉ mục có nhãn **Cần kiểm chứng thực tế** mới cần chủ dự án giữ tab FBM, đăng nhập, bật ghi thật hoặc kiểm tra dữ liệu live. Live test chỉ được chạm `ALT00010`, tuyệt đối không gửi request xóa và không đưa `note` nội bộ ShinCRM lên FBM.

## Quy ước tiến độ

- `[x]` chỉ đánh dấu khi có bằng chứng tương ứng: code, test offline, GAS DEV hoặc kiểm chứng thực tế.
- `[ ]` là việc còn thiếu; mục không có nhãn **Cần kiểm chứng thực tế** là việc AI tự tiếp tục được.
- Một slice chỉ đóng sau khi đủ code, test, log/báo cáo và checklist case của slice đó.
- Sau khi đóng slice, ghi commit và revision GAS vào bảng bằng chứng cuối file.
- Bộ kiểm offline chốt đạt `1585/1585`. Các mục live vẫn được đánh dấu riêng và không được suy ra từ test offline.

## Nguồn hợp đồng

Hợp đồng nhận diện, đăng nhập và cấu hình kết nối nằm ở `[NEO → Tài liệu 09.06]`; hợp đồng màn hình và luồng kiểm tra liên kết nằm ở `[NEO → Tài liệu 09.08]`. Checklist chỉ ghi công việc triển khai và tiêu chí nghiệm thu, không chép lại hợp đồng.

## Slice 0 — Nền tảng, ranh giới và an toàn

### Reload RAM và sheet quản trị

Hợp đồng chi tiết và checklist triển khai riêng nằm ở `07A. Hợp đồng Reload RAM và Sheet quản trị.md` và `Checklist reload RAM và sheet quản trị.md`. Các mục dưới đây là cổng bắt buộc để mọi slice FBM không làm Sidebar hoặc view giữ dữ liệu cũ:

- [x] Mọi lần ghi thành công từ pull, push, verify, baseline, conflict, missing, retry và background phát signal ReloadState chung (cổng `WriteGate`/`DeleteGate`, test `reloadGates.js`).
- [x] Signal có mã Customer/Activity khi xác định được; không xác định được thì bật full core (test `reloadGates.js`, `loadService.js`).
- [x] Signal luôn đặt `allViews`; không chỉ đánh dấu view đang mở (test `reloadGates.js`, `triggers.js`).
- [x] Sidebar đóng vẫn giữ signal trong DocumentProperties và Sidebar mở lại đọc được revision mới (đường `background`, test `reloadGates.js`, `selectionPoll.js`).
- [x] Ghi trạng thái đồng bộ dù không đổi nội dung chính vẫn reload RAM và vẽ view khi chính sách cho phép (test status `pending/notApplied/conflict/missing/error` trong `reloadGates.js`).
- [x] Ghi thất bại không xóa dirty state cũ (test `reloadGates.js`).
- [ ] Chạy toàn bộ ca R3 và R8 trong `Checklist reload RAM và sheet quản trị.md` trước khi đóng slice FBM có ghi dữ liệu.

### Kiến trúc và dữ liệu nhạy cảm

- [x] GAS giữ nghiệp vụ, cursor, hash, conflict và quyết định; Extension chỉ tìm tab FBM, gọi `fetch` và trả response thô. Adapter login/vault là ngoại lệ bảo mật duy nhất được 09.06 quy định; không mở rộng ngoại lệ này sang nghiệp vụ đồng bộ.
- [x] Có `FbmSync.controlDispatch(command, payload)` làm cổng điều khiển trung lập; adapter Sidebar/relay chỉ chuyển lệnh và hiển thị DTO, không sao chép nghiệp vụ.
- [x] Có DTO `sync_approval_required` với action ID ổn định; kênh tương lai (ví dụ Zalo) được phép đổi action thành phím tắt như `Gửi 1`, nhưng core không biết số thứ tự hay giao diện kênh.
- [x] Mỗi lượt GAS–Extension trao đổi một request hoàn chỉnh; chuỗi nhiều bước nằm trong `DocumentProperties`, không nằm trong Extension.
- [x] `fetch` FBM chạy trong content script của tab `fbo.com.vn`, dùng IP, cookie và `Referer` của tab.
- [x] Cờ ghi thật mặc định tắt; Đọc thử không ghi Sheet và không ghi FBM.
- [x] Không có builder, endpoint hoặc action xóa FBM; test offline chặn mọi đường Delete.
- [x] `note` Customer là ghi chú nội bộ ShinCRM và không xuất hiện trong memvars gửi FBM.
- [x] Giới hạn live mặc định là `FBM_SYNC_TEST_CUSTOMER_CODE=ALT00010` ở đường đọc và đường chọn ứng viên push.
- [x] Bản ghi mã `TMP-` bị loại khỏi mọi kỳ quét ở cả hai chiều.
- [x] Mỗi lát chỉ có một lời gọi cửa ghi và một khóa tài liệu; pull gộp nội dung và trạng thái vào cùng một lượt `writeGateSave`.
- [x] Category là cấu hình do người dùng sở hữu; đồng bộ chỉ đọc/đối chiếu, tuyệt đối không ghi hoặc xóa Sheet Category.
- [x] `ScriptProperties` chỉ giữ khóa Web App; cờ ghi, giới hạn test và cấu hình đã dùng `DocumentProperties`, Sheet Config hoặc state phiên đúng vòng đời.
- [x] GAS tự tạo `FBM_SYNC_KEY` đúng một lần khi Sidebar lần đầu yêu cầu relay, không cần thao tác menu; mở Sidebar sau đó chỉ lấy lại khóa cũ.
- [x] Màn hình đồng bộ có thao tác đổi khóa relay có xác nhận; GAS đổi nguyên tử, Extension xác nhận đã lưu, không hiển thị hoặc ghi khóa ra Sheet/Log.

### Extension, transport và khóa

- [x] GAS dựng `bodyText` đã escape cho FBM; Extension chỉ chuyển nguyên văn qua `fetch`, không parse/serialize lại.

- [x] Extension có host permission `https://fbo.com.vn:8888/*`, content script FBM, service worker và cơ chế nạp lại executor.
- [x] Mỗi lần Sidebar mở, sau bắt tay local, Sidebar gửi đúng một relay config do GAS cấp; Extension chỉ kiểm tra cấu trúc rồi lưu local/ACK, không probe `/exec` hoặc retry theo session bridge.
- [x] Relay nền ghi `request_sent`, `response_received` và kết quả cuối vào `chrome.storage.local` để phân biệt lỗi gửi, lỗi nhận và lỗi xử lý response; cấu hình relay không tạo request Web App.
- [x] Service Worker chỉ hỏi GAS ở nhịp alarm, chuyển request/response do GAS cấp qua tab FBM và nộp response thô lại; `request: null` thì không tìm tab, không gọi FBM và chờ nhịp sau.
- [x] Relay nền dùng DTO gọn, không chuyển `metadata`/`traceTail` của Sidebar qua Extension.
- [x] Đã kiểm chứng đường Sidebar → Extension → tab FBM → Sidebar nhận response thật.
- [x] Executor báo phiên bản `21.7`; reload Extension có thể phục hồi đầu nhận.
- [x] Bridge mất context trả lỗi `EXTENSION_CONTEXT_INVALIDATED` tường minh; Sidebar không tự phát lại request FBM, Service Worker vẫn chống trùng theo `id`.
- [x] Bridge khác `sessionId` bị bỏ qua để không làm rơi response thật từ bridge hiện tại.
- [x] Request authorized Customer dùng `viewPage:false`, `authorized:null`, `values:[]` và ba vars đúng hợp đồng.
- [x] Request authorized Activity dùng controller riêng và hai vars đúng hợp đồng.
- [x] Đã kiểm chứng thực tế việc nhận được authorized Customer và Activity của phiên FBM đang mở.
- [x] Cookie payload và `userId` lấy từ tab/response; heartbeat không tự đăng nhập hoặc ghi, còn login tự động chỉ chạy qua cổng phiên khi thiếu cookie hoặc session hết hạn.
- [x] HTTP status, body lỗi, `Bugs` và lỗi parse được chuyển thành lỗi có cấu trúc; log không ghi cookie/payload.
- [x] Mất content script được ping rồi tiêm lại trước request nghiệp vụ.
- [x] Không tìm thấy tab, mất đầu nhận và timeout được báo rõ trên Sidebar.
- [x] Body chứa `Login.aspx` được nhận là hết phiên kể cả HTTP 200.
- [x] Retry transport được tách khỏi retry nghiệp vụ; lỗi nghiệp vụ chỉ thử lại khi `hSHIN` đổi.
- [x] Khôi phục cursor đọc còn hạn sau khi Sidebar, Chrome hoặc GAS gián đoạn; request ghi dở không tự phát lại.
- [x] Giữ khoảng nghỉ và trần request phù hợp FBM, không dồn quá 60 request/phút.
- [x] Web App `doPost` xác thực khóa và Extension thực sự điều phối qua Web App; kiểm thử nguồn relay phủ khóa và Spreadsheet ID.

### Metadata, chuẩn hóa và trạng thái

- [x] Trang đầu controller dùng `type:0` và `AliasName`; trang sau dùng `type:1` với metadata đã lưu.
- [x] Cursor Customer và Activity dùng composite key theo tài liệu nghiên cứu.
- [x] Metadata thiếu, trùng hoặc đổi trường thì fail-closed.
- [x] Đã map các trường Customer: tên, MST, liên hệ, địa chỉ, điện thoại, email, website, tỉnh, nguồn và sản phẩm.
- [x] `product/ma_sp` được chuẩn hóa vào fingerprint Customer và loại khỏi Activity.
- [x] `owner` Activity không tham gia fingerprint và được đọc để kiểm quyền sửa.
- [x] Fingerprint chuẩn hóa xuống dòng, trim, danh mục, ngày Việt Nam, placeholder 1899/1999, Date lỗi và dấu `#SC-`, nhưng không dùng `normalizeText`.
- [x] Placeholder `1999`/`0` chỉ là rỗng ở field phù hợp; Activity `id=0` không làm đổi fingerprint.
- [x] Fingerprint đã có test không đổi, một phía đổi và conflict hai phía.
- [x] Lệch `stt_rec_kh/ma_kh` phải lấy định danh FBM riêng, không coi là ShinCRM đổi.
- [x] Khi `ma_kh` lệch, FBM là nguồn thắng cho định danh; không đưa lệch định danh vào ứng viên push.
- [x] `SYNC_SCHEMA` chỉ khai field đồng bộ theo tên, `AliasName`, trần độ dài và tám cột kỹ thuật; lõi không đọc ngược bảng khai, bộ tự kiểm bắt vi phạm.
- [x] `@CUS_SYNC_TT/@ACT_SYNC_TT` có đủ 11 trạng thái, gồm `chưa đẩy` và `đẩy không ăn`.
- [x] Có lệnh tính lại baseline khi người dùng đổi tập field hoặc luật chuẩn hóa.

## Slice 1 — Preflight phiên FBM và danh mục

### Preflight

- [x] Trước mỗi phiên chạy checker Core và checker riêng của `fbm_sync`; mọi lỗi có `scope`, `code`, `severity`, `blocking`, thông báo người dùng và dòng Log, không ẩn trong bước push.
- [x] Tìm tab FBM, ping executor, fetch trong tab và nhận response thô.
- [x] Khi mất executor, inject rồi ping lại; request nghiệp vụ chỉ gửi một lần.
- [x] Executor có phiên bản giao thức riêng; worker tự nạp lại bản mới và dùng kênh request V2 để bản cũ không xử lý heartbeat song song. Request thiếu envelope bị chặn trước `fetch`, trace chỉ giữ metadata transport tối thiểu. Có lệnh `fbmHeartbeatNow()` và `fbmHeartbeatLastStatus` để nghiệm thu ngay, không phải chờ alarm 5 phút; heartbeat phải nhận envelope do GAS cấp trước khi chạm FBM, không còn request mặc định trong executor; alarm chỉ là nhịp hỏi GAS, không tự dừng/tạo retry theo lỗi relay hoặc cờ nghiệp vụ.
- [x] 401/403 hoặc `Login.aspx` dừng kỳ và yêu cầu đăng nhập lại khi tùy chọn tự động đăng nhập tắt.
- [x] Tùy chọn tự động đăng nhập mặc định bật, tự chạy khi session hết hạn/không có cookie, không ép login khi session hợp lệ đang tồn tại và chỉ thử lại nhiều nhất một lần mỗi 30 phút. Code, test offline và GAS DEV `fbmGetLoginConfig` đã xác nhận trạng thái mặc định; nhánh hết phiên có throttle 30 phút.
- [x] Form thiết lập đặt username và password cạnh nhau, hiển thị mật khẩu dạng bản rõ chỉ trong lượt đang gõ, không ghi bản rõ vào Sheet hoặc Log. Sidebar chỉ xóa ô sau `Lưu mã hóa` thành công, không xóa sau `Đăng nhập thử`.
- [x] Extension mã hóa username/mã user, SpreadsheetId và mật khẩu thành envelope trước khi gửi/lưu qua GAS; không lưu credential bản rõ ở Sheet, Log hoặc `Config`. Kho cục bộ dùng AES-GCM; GAS chỉ giữ ciphertext.
- [x] Khi đọc lại cấu hình, Extension chỉ giải mã nội bộ và trả trạng thái cùng các trường không nhạy cảm; Sidebar không nhận mật khẩu bản rõ. DTO `fbmGetLoginConfig` loại envelope trước khi trả về.
- [x] Nút `Đăng nhập thử` thử login mềm bằng thông tin người dùng nhập, không logout phiên hợp lệ và không ghi bí mật. Request dùng `force:false`; Sidebar giữ rõ kết quả thành công hoặc lỗi ngay dưới thao tác.
- [x] Preflight đối chiếu tuyệt đối username/mã user, tên đầy đủ và SpreadsheetId thực tế trước request nghiệp vụ; không trim, đổi hoa thường hoặc chuẩn hóa khi so sánh và không dùng mã ngắn.
- [x] Tự điền thông tin nhận diện từ Spreadsheet hiện tại và response `authorize`, chỉ cho xác nhận các giá trị hệ thống, không tự lưu hoặc tự chuyển tài khoản. Probe chỉ gọi authorize, không quét Customer; Sidebar chỉ lưu sau nút xác nhận.
- [x] `Kiểm tra thông tin đồng bộ` quét đủ Customer FBM, đối chiếu chỉ các dòng local đã có FBM_ID, trả tổng hợp `n/N`, mẫu sai lệch và nút `Kiểm tra lại`; không ghi Sheet/FBM. Code, test offline và GAS DEV đã xác nhận entrypoint authorize Customer, full-scan không lọc mã test, cursor `stt_rec_kh` và kết thúc không ghi Sheet/FBM.
- [x] Khi chưa có liên kết, file là bản sao hoặc đổi tài khoản khi còn dữ liệu, chuyển `UNBOUND`/`REBIND_REQUIRED`, khóa mọi đồng bộ thường trước khi cấp request FBM; sau khi người dùng xử lý dữ liệu cũ có thể chạy kiểm tra lại, không tự xóa dữ liệu.
- [x] Mỗi lần Sidebar mở, Extension nhận đúng một relay config gồm GAS URL, khóa và Spreadsheet ID hiện tại; Extension chỉ giữ một config đang hoạt động và alarm không gọi FBM khi chưa có config.
- [x] Tách phần dựng block trạng thái, điều khiển và audit thành các tệp `.html` riêng trong `client/sync/`, vẫn dùng lớp component/block chuẩn của Sidebar.
- [x] Tách màn hình trạng thái, thiết lập đăng nhập và audit thành các tệp giao diện riêng trong `client/sync/`, tái sử dụng block chuẩn.
- [x] Lấy authorized Customer rồi Activity; thiếu token thì dừng trước CRUD.
- [x] Kiểm owner mặc định FBM khớp tên đầy đủ trong binding đã xác nhận; sai thì dừng chiều push.
- [x] Xác nhận tham số đồng bộ cấp hệ thống không còn nằm trong Config; `FBM_SYNC_SETTINGS_V1` chỉ giữ `approvalThreshold`, tên tài khoản không được nhân bản vào Config.

### Danh mục

- [x] Đọc động bốn nguồn `crProvinceCity`, `crLeadSource`, `crJob`, `crdmsp`, không hardcode mã FBM.
- [x] Builder `GetCompletionList` và parser cặp mã/tên đã có; companion dùng dấu `#` đúng quan hệ.
- [x] Lookup FBM chỉ được giữ trong state để đối chiếu; mã lạ chặn record và yêu cầu người dùng bổ sung Category thủ công.
- [x] Fixture ánh xạ một-nhiều và nhiều-một chỉ được tạo bằng lệnh DEV riêng, không chạy trong luồng đồng bộ.
- [x] Cổng Category không nhận nhầm `@CAT_NHOM_KH_FBM` là companion giả.
- [x] Category lệch chỉ chặn record dùng đúng mã lỗi; record khác vẫn pull.
- [x] Lookup lỗi vẫn cho pull nhưng khóa toàn bộ chiều push của kỳ.
- [x] Mã lạ từ FBM chặn ghi record và ghi lý do để bổ sung Category.
- [x] Log danh mục nêu nguồn, mã, tên trên Sheet và tên FBM hiện tại; không ghi ngược vào Sheet Category.
- [ ] **Cần kiểm chứng thực tế:** đẩy bản sửa Category và `Probe.js` lên GAS, đọc đủ bốn lookup và xác nhận luồng không ghi hoặc xóa Sheet `Category`.
- [ ] **Cần kiểm chứng thực tế:** kiểm mã trùng tên, ví dụ hai mã Cao Bằng, phải giữ đúng dấu `#` ở cả hai chiều.

### Đóng slice

- [x] Code, test offline và GAS DEV của preflight/category hoàn tất; phiên chỉ đọc lookup và không ghi Sheet `Category`.
- [ ] **Cần kiểm chứng thực tế:** xác nhận phiên, owner và Category trên tab FBM.

## Slice 2 — Pull Customer FBM → ShinCRM

### Đọc và ghi Customer

- [x] Đọc thử đã preview đúng `ALT00010 · Test` mà không ghi hai hệ.
- [x] Luồng đọc thủ công tạo state, thực thi từng request qua Extension, trả preview và kết thúc mà không ghi hai hệ.
- [x] Customer FBM chưa có `FBM_ID` được tạo dòng mới, cấp mã nội bộ, lưu ID/mã FBM, nội dung và baseline trong một khóa.
- [x] Customer đã tồn tại ở FBM và ShinCRM nhưng chưa liên kết được nhận diện bằng MST chuẩn hóa; nếu chỉ có một dòng ShinCRM khớp thì nối vào dòng đó, nếu MST trùng nhiều dòng hoặc đã liên kết thì fail-closed, không tạo Customer trùng.
- [x] Bản ghi pull có đủ `id`, `@CUS_FBM_ID`, `@CUS_MA_KH_FBM`, nội dung, baseline và trạng thái.
- [x] Pull giữ `note`, `verifyStatus`, `allowFbmPush` và trường chỉ thuộc ShinCRM.
- [x] Bản ghi mới đặt đúng mã nội bộ, ngày tạo, `active`, khóa cha và quyền push.
- [x] Sau pull đánh dấu dirty đúng mã để Sidebar nạp lại.
- [x] `activitySince` trong `FBM_ACCOUNT_SETTINGS_V1` lọc Activity trước mốc; bản ghi bị bỏ qua vẫn được đánh dấu đã thấy để không bị coi là bản ghi mất.

### Đối soát Customer

- [x] Ba hash bằng nhau → không ghi nội dung, đánh dấu đã đồng bộ.
- [x] Baseline rỗng hoặc tự lành → chỉ cập nhật baseline.
- [x] Chỉ FBM đổi → pull nội dung và baseline, giữ trường nội bộ.
- [x] Chỉ ShinCRM đổi → không pull đè, chuyển ứng viên push nếu được phép.
- [x] Hai phía đổi → conflict, khóa, log, không ghi nội dung/baseline.
- [x] Customer vắng khỏi grid → `không thấy bên FBM`, không xóa và không đổi baseline.
- [x] Tombstone local có FBM ID không bị kéo lại thành dòng mới.
- [x] Customer ngừng đồng bộ loại cả Customer và Activity con khỏi hai chiều.
- [x] Record đang được người dùng sửa được hoãn; missing scan bỏ qua và giữ nguyên bản nháp.

### Đóng slice

- [x] Test offline phủ đủ bảng hash, missing, tombstone và bảo toàn trường nội bộ.
- [x] Log có từng record, hướng FBM → ShinCRM, trạng thái trước/sau và lý do bỏ qua.
- [x] Pull `ALT00010` đã xác nhận Customer có một bản ghi nội bộ và Activity có một liên kết Customer nội bộ; cần kiểm tra riêng các cột baseline/trạng thái trước khi đóng mục đầy đủ.
- [x] Chạy pull lần hai với `ALT00010`: giữ một Customer nội bộ, một Activity liên kết, không trùng FBM ID và không tăng conflict.

## Slice 3 — Pull Activity FBM → ShinCRM

### Activity và marker

- [x] Request Activity theo `externalKey stt_rec` nối đúng Customer nội bộ; khi có `activitySince`, bulk và request theo Customer cùng thêm `filter` `end_date:>=DD/MM/YYYY`.
- [x] Mỗi lượt chụp `activitySince` vào state; đổi cấu hình giữa chừng không trộn phạm vi giữa các trang/cursor của lượt đang chạy.
- [x] Activity mới không marker tạo dòng ShinCRM, cấp mã nội bộ, lưu FBM ID và baseline.
- [x] Marker trỏ dòng đang đẩy thì vá ID, không tạo trùng.
- [x] Marker trỏ dòng đã có FBM ID khác thì khóa và báo xử lý.
- [x] Marker mồ côi chỉ log, không tạo lại.
- [x] Activity thiếu hoặc placeholder `workDate` bị chặn và log, không tự điền ngày.
- [x] Hash Activity dùng cùng luật ba chiều như Customer.
- [x] Activity vắng trong bulk chỉ mang trạng thái không thấy bên FBM, không suy hard-delete; Activity trước `activitySince` không bị đưa vào missing scan.

### Ba lớp quét

- [x] Bulk 8 giờ lấy grid Activity, lọc theo tập ID đã biết và trả danh sách ID vắng.
- [x] `ngay_gd` mới hơn max Activity đã có ID thì quét externalKey riêng Customer đó.
- [x] Vòng xoay quét 30 Customer tiếp theo để bắt Activity tạo lùi ngày.
- [x] Ba lớp có cursor bền vững trong state và DocumentProperties, không bị hạ thành tùy chọn.
- [x] Có entrypoint DEV `fbmSyncStartActivityBulk` để chạy riêng pipeline bulk Activity và kiểm thử không cần chờ trigger 8 giờ.

### Đóng slice

- [x] Test offline phủ marker, missing, ngày lỗi, bulk, catchup và rotation của ba lớp phát hiện.
- [x] Log có Customer cha, Activity ID, hướng đọc và lý do bỏ qua/khôi phục.
- [x] Pull Activity của `ALT00010` sau Reload Extension: `customerId` liên kết đúng Customer nội bộ và chạy lại không tạo dòng trùng.

## Slice 4 — Đối soát, khóa, conflict và phục hồi

- [x] So ba chiều phân biệt không đổi, chỉ ShinCRM đổi, chỉ FBM đổi và hai phía đổi.
- [x] Conflict lưu trạng thái, khóa record, log diff và không ghi baseline.
- [x] Màn hình xử lý conflict là chế độ riêng, tách khỏi màn hình chạy phiên đồng bộ.
- [x] GAS giữ hàng đợi/cursor conflict; Sidebar chỉ nhận và xử lý một bản ghi mỗi lần, không tải cả danh sách về RAM; DTO chỉ trả conflict đầu hàng đợi và `conflictCount`.
- [x] Sidebar conflict hiển thị dọc, chỉ hiện các trường khác nhau; mỗi trường xếp giá trị ShinCRM và FBM để đối chiếu.
- [x] Người dùng có thể giữ toàn bộ FBM, giữ toàn bộ ShinCRM hoặc chọn giá trị từng trường để trộn thủ công; GAS ánh xạ field fingerprint về field nội bộ trước khi ghi.
- [x] Khi xác nhận, GAS yêu cầu đọc lại đúng dòng ShinCRM và FBM; nếu FBM đổi từ lúc mở thì cập nhật conflict và không chốt.
- [x] Nút giải quyết hỗ trợ theo FBM, theo ShinCRM hoặc trộn tay; cập nhật `hFBM` và trạng thái theo lựa chọn.
- [x] Form Sidebar khóa user khi mở, nhả khi đóng và kiểm khóa sync trước Save.
- [x] Pull/push hoãn record có khóa user và giữ nguyên bản nháp.
- [x] Khóa sync làm form chỉ xem, chặn Save và luôn được nhả sau khi xong/lỗi.
- [x] Record có `FBM_ID` chỉ được xóa mềm; không có đường gửi Delete FBM.
- [x] HTTP 500/401/403/Login.aspx giữ cursor hợp lệ và thử lại ở kỳ sau.
- [x] Bugs HTTP 200 gắn lỗi nghiệp vụ vào record và chỉ thử lại khi dữ liệu local đổi.
- [x] Ghi báo thành công nhưng FBM không đổi → `đẩy không ăn`, khóa record, không lặp vô hạn.
- [x] Extension reload/service worker ngủ → state GAS không mất và pipeline đi tiếp đúng bước; test offline đã phủ resume cursor, stale run, heartbeat tiếp tục và bridge cũ tự im lặng sau reload.
- [ ] **Cần kiểm chứng thực tế:** mở conflict, xem diff và thử một cách giải quyết.
- [ ] **Cần kiểm chứng thực tế:** sửa dở form trong lúc sync, xác nhận record bị hoãn và bản nháp không mất.

### Đóng slice

- [x] Code, test offline, log diff và UI conflict hoàn tất; test offline phủ ánh xạ field trộn và request đọc lại trước khi chốt.
- [x] Bằng chứng phục hồi sau timeout, reload và lỗi nghiệp vụ đã có ở test offline; request ghi dở không tự phát lại.
- [x] State active bị bỏ rơi quá 2 phút được tự thu hồi; phiên chờ ghi không tự retry; test offline đã đạt.
- [x] Supervisor GAS chạy mỗi phút, phát hiện `lastProgressAt` quá hạn, đánh dấu `SUPERVISOR_TIMEOUT_AT_*` và fail-closed mà không tự retry lệnh ghi.

## Slice 5 — Push Customer ShinCRM → FBM

### Cổng và builder

- [x] GAS vẫn chặn mọi request ghi khi công tắc bảo vệ tổng đang tắt; mode hướng dữ liệu không tự mở khóa ghi.
- [x] UI thay checkbox `Cho phép ghi thật lên FBM` bằng công tắc tổng dạng pill `ON/OFF` trên header; khi tắt khóa phiên thủ công, nền, auto-login và giải quyết conflict.
- [x] Có cổng `allowFbmPush`, Category, record lock và cấu hình bắt buộc.
- [x] Hướng có ghi vẫn dừng trước request khi cổng bảo vệ tổng phía GAS tắt.
- [x] Khi đang có phiên hoạt động, lần bấm Đồng bộ ngay thứ hai không tạo phiên song song.
- [x] Nếu tổng số bản ghi đủ điều kiện thay đổi lớn hơn `10`, Sidebar preview và chờ người dùng chấp thuận trước request ghi; từ `10` trở xuống vẫn phải qua công tắc tổng, cổng phiên và cổng bản ghi. `fbmApprovePush` chỉ cấp request authorize sau khi chấp thuận; test offline đã phủ ngưỡng `11`.
- [x] Dừng đồng bộ xóa cursor kỳ, nhả khóa sync, giữ khóa form user và không gửi Delete.
- [x] Kiểm owner mặc định FBM với tên đầy đủ trong binding trước toàn bộ chiều push.
- [x] Kiểm đủ bảy field bắt buộc và mọi trần độ dài trước khi dựng request.
- [x] Customer mới chưa Cho phép chỉ pull, không push.
- [x] Customer thiếu field hoặc vượt trần không phát request, ghi trạng thái và lý do.
- [x] Builder Customer New mở form lấy `_ma_kh_auto` rồi gửi request `New` đúng fixture.
- [x] Builder Customer Edit mở form lấy OldValue rồi gửi `Edit` đúng tập field.
- [x] Parser Row 64 ô hỗ trợ Row mảng/object và fallback FieldValues/InternalValues.
- [x] Create mất phản hồi tra MST contains (`filter` với `gridPageIndex: -2`), verify exact cả MST/mã khách và hash, vá ID/baseline và không create lần hai; test offline đã phủ cả request dò và kết quả xác nhận.
- [x] Create có Bugs đặt `đẩy lỗi`, nhả khóa và không retry khi `hSHIN` chưa đổi.
- [x] Edit đọc xác nhận trực tiếp ngay sau response ghi; chỉ khi hash FBM khớp hash payload mới tính là thành công.
- [x] Sau response thành công, record chuyển sang `đã đẩy chờ xác nhận`, giữ baseline cũ và lưu `hPUSH` nhỏ theo `entity:id` trong `DocumentProperties` (không thêm cột Sheet).
- [x] Nếu đọc xác nhận lỗi/thiếu trường/không khớp, giữ `hPUSH`, báo rõ và không tự gửi lại request ghi; kỳ sau phân biệt được lần đẩy của hệ thống với thay đổi ngoài.
- [x] Builder không gửi `ghi_chu`; không dùng `note` nội bộ ShinCRM.

### Đóng slice

- [x] Test offline phủ cổng, OldValue, độ dài, Bugs, retry và không ghi chú nội bộ.
- [x] Log có request kind, record, hướng, hash và kết quả đã che bí mật.
- [ ] **Cần kiểm chứng thực tế:** sửa một field an toàn của `ALT00010`, pull xác nhận rồi khôi phục giá trị gốc.
- [ ] **Cần kiểm chứng thực tế:** kiểm lỗi nghiệp vụ trùng/sai MST hoặc điện thoại.
- [ ] Customer create chỉ kiểm chứng thực tế nếu chủ dự án cho phép một Customer thử mới; FBM tự cấp mã khác `ALT00010`.

## Slice 6 — Push Activity ShinCRM → FBM

- [x] Builder Activity New gửi `ma_kh/stt_rec` Customer cha và marker `#SC-<mã ShinCRM>`.
- [x] Fingerprint cắt marker trước khi so.
- [x] Customer cha chưa Cho phép, Ngừng đồng bộ hoặc thiếu FBM ID/mã thì không push Activity.
- [x] Activity mới đủ khóa/ngày/danh mục → New, lưu FBM ID và chờ xác nhận.
- [x] Create mất phản hồi giữ `đang đẩy`, không retry; pull dùng marker để vá hoặc báo trùng.
- [x] Live `ALT00010`: xóa Activity khỏi Sheet rồi chạy lại, hệ thống khôi phục từ FBM, không phát sinh request xóa và không tạo trùng.
- [x] Builder Activity Edit mở form lấy OldValue đúng fixture.
- [x] Builder Activity Edit gửi `memvars.id` là ID FBM số, không gửi mã nội bộ `ACT-*`.
- [x] Callback Activity Edit chỉ trả snapshot gọn cho Sidebar, không mang lookup Category, OldValue hoặc record nội bộ khiến GAS → Sidebar treo; quá 5 giây cảnh báo và quá 15 giây hiện `GAS_CALLBACK_TIMEOUT` kèm bước/cursor cuối, không tự phát lại lệnh ghi.
- [x] Trace hop độc lập ghi `runId/requestId` và mốc GAS/Sidebar/Bridge/Worker/Executor/FBM vào kho giới hạn; không ghi cookie, mật khẩu hoặc payload.
- [x] Parser Row 45 ô giữ `end_time`, lấy `_ticket` từ Showing thành `fileticket`, hỗ trợ Row null và fallback.
- [x] Cổng owner Activity edit đã có sau bước mở form.
- [x] Edit sai owner chỉ lỗi record đó, không sửa owner FBM và không chặn record khác.
- [x] Lỗi đẩy không tự lặp; Sidebar chỉ có thao tác mở lại cả nhóm lỗi, không bắt sửa dữ liệu nghiệp vụ và không retry mù request đã ghi.
- [x] Kỳ pull sau edit xác nhận baseline, `đẩy không ăn` hoặc conflict.
- [ ] **Cần kiểm chứng thực tế:** tạo đúng một Activity thử dưới `ALT00010`, marker cố định và không tạo trùng khi pull lại.
- [ ] **Cần kiểm chứng thực tế:** sửa Activity thử, xác nhận owner, ticket, OldValue và baseline.
- [ ] **Cần kiểm chứng thực tế:** mô phỏng mất phản hồi một lần và kiểm marker recovery.

- [x] Biên GAS chuẩn hóa đệ quy toàn bộ kết quả public của fbmStartSync/fbmContinueSync, không để Date trong status, metadata hoặc cursor làm mất callback Sidebar; test offline 1175/1175.
- [x] Activity Edit dựng ngày theo đúng form FBM: giữ `start_date`, dùng `workDate` cho `end_date`, không lấy timestamp `InternalValues` nguyên dạng để gửi lại; giờ vẫn lấy riêng từ `start_time`/`end_time`.
- [x] Chieu day dung lai khi counts.conflict > 0 ngay ca khi danh sach chi tiet conflict bi thieu.

## Slice 7 — Heartbeat, scheduler và chạy nền

- [x] Extension chỉ có một alarm kỹ thuật `gas_poll` mặc định 5 phút, đọc `count:1` khi GAS cấp envelope; không có alarm theo tiến trình và không tự login hoặc write.
- [x] Heartbeat nộp kết quả cho GAS, cập nhật lần sống cuối và kích full Customer khi tổng số đổi.
- [x] Kỳ Customer 60 phút kéo full grid qua nhiều lát, lưu cursor từng lát.
- [x] Kỳ Activity 8 giờ chạy bulk ID và lớp `ngay_gd`.
- [x] Vòng xoay Activity chạy mỗi 30 phút, quét 30 Customer tiếp theo và tiếp tục đúng cursor sau khi service worker/GAS gián đoạn.
- [x] Scheduler không tạo hai kỳ, không giữ công việc trong RAM và tiếp tục từ lát đã chốt.
- [x] Khi người dùng bấm `Đồng bộ ngay` trong lúc có phiên nền, GAS đánh dấu phiên nền dừng, chờ response FBM hiện tại kết thúc, không cấp request tiếp theo rồi Sidebar ưu tiên phiên thủ công; không tạo hai phiên song song. Test offline phủ handoff nền → thủ công.
- [x] Nút Dừng đồng bộ xóa marker `scheduledScan`, không để heartbeat tự khởi động lại kỳ vừa dừng.
- [x] Web App dùng khóa theo spreadsheet để tiếp tục khi Sidebar đóng.
- [x] Mở lại Sidebar chỉ đọc state hiện có, không tạo kỳ thứ hai; cấu hình kỹ thuật chỉ được chuyển một lần sau bắt tay local.
- [x] Nạp lần đầu theo thứ tự Category → Customer → Activity → baseline; nếu Sheet đã có dữ liệu hoặc FBM_ID thì phải qua kiểm tra liên kết, xử lý `REBIND_REQUIRED` trước và không nhân bản. Preflight chặn cả phiên đọc/ghi thường khi lệch liên kết; chỉ chế độ kiểm tra liên kết được phép chạy để xử lý.
- [x] Lệnh tính lại baseline không phát request write FBM.
- [ ] **Cần kiểm chứng thực tế:** bắt đầu kỳ, đóng Sidebar, chờ Web App/Extension và mở lại xem state/log.
- [ ] **Cần kiểm chứng thực tế:** reload hoặc để service worker ngủ rồi xác nhận kỳ tiếp tục.
- [ ] **Cần kiểm chứng thực tế:** reload Extension, kiểm tra `chrome.storage.local` có relay config, chạy một heartbeat đọc và xác nhận service worker không báo `RELAY_FETCH_FAILED`/`RELAY_TIMEOUT`, GAS nhận được handoff và state cập nhật khi Sidebar đóng.

### Đóng slice

- [x] Code, test offline, log và GAS DEV của heartbeat/scheduler hoàn tất.

## Slice 8 — Sidebar, log và nghiệm thu kết nối

- [x] Có màn hình đồng bộ độc lập, không hủy phiên khi quay lại, hiển thị phase, hướng, thực thể, session, counters, tiến trình và preview giới hạn.
- [x] Màn hình `Chạy đồng bộ` khi chưa chạy chỉ hiện hành động bắt đầu phù hợp với mode; khi chạy chỉ hiện `Dừng đồng bộ`.
- [x] Icon menu phản ánh trạng thái; tự động có thể báo đang phát triển.
- [x] Đã thấy tiến trình request, lỗi transport và kết quả đọc trên màn hình.
- [x] Mở màn hình đồng bộ lấy relay config song song với snapshot trạng thái, không để cấu hình nền chặn giao diện.
- [x] GAS ghi log phase/lỗi nguồn `fbm_sync`, không ghi cookie/payload.
- [x] Có dòng tổng kết mỗi kỳ và dòng chi tiết cho lỗi, conflict, hoãn, mã lạ và đẩy không ăn.
- [x] Màn hình có preview bản ghi kéo về và chi tiết conflict, lỗi đẩy, Category block, Activity vắng; không bắt người dùng đọc JSON trong Log.
- [x] Có lệnh nghiệm thu phạm vi thử chạy preflight, lookup, pull, field/hash/link, idempotency và ghi báo cáo PASS/FAIL vào Log; hiện phạm vi DEV là `ALT00010`, không push FBM.
- [x] Báo cáo che cookie/authorized nhưng giữ record ID, phase, request kind và hash trước/sau.
- [x] `fbmProbeAltState` fail-closed nếu phát hiện candidate ngoài `ALT00010` và Activity con.
- [x] Mỗi lần mở Spreadsheet, luồng `onOpen` dựng menu rồi trigger cài đặt `shinAutoShowSidebar` mở Sidebar qua cùng hàm dựng khung; trigger đơn không gọi `Ui.showSidebar`, lượt mở tự động không bật alert nếu dựng khung lỗi và không tự phát request FBM.
- [x] Click icon Đồng bộ ở menu chính mở thẳng màn hình `Chạy đồng bộ`, không hiện menu trung gian.
- [x] Module có menu nội bộ bốn màn hình, đặt `Chạy đồng bộ` ở đầu: `Chạy đồng bộ`, `Tài khoản FBM`, `Kết quả & xử lý`, `Cài đặt phiên`.
- [x] Header có cụm phải `[ON/OFF] [☰]`; khi tắt, phiên thủ công, đồng bộ nền, auto-login và thao tác ghi/giải quyết conflict bị khóa, state/log vẫn xem được; menu con cuộn ở ngưỡng hai phần ba Sidebar.
- [x] Menu con là hộp nổi dưới header, không làm nội dung màn hình dịch xuống khi mở; `PopupList` tự dùng viewport khi trigger nằm ngoài vùng body để không bị ép xuống mép body (test `domUi`).
- [x] `Tài khoản FBM` gom nhận diện và trạng thái đăng nhập trong một màn hình; login thử phải đối chiếu user, tên tài khoản và Spreadsheet ID. Công tắc auto-login nằm duy nhất trong `Cài đặt phiên`.
- [x] `Chạy đồng bộ` dùng dropdown diễn giải rõ `Kiểm tra an toàn`, `Lấy từ FBM → ShinCRM`, `Đẩy từ ShinCRM → FBM`, `Đồng bộ hai chiều`; không có checkbox ghi trùng ý nghĩa.
- [x] Mọi phiên đang chạy hiển thị pipeline theo thực thể với trạng thái chưa chạy/đang chạy/hoàn tất/lỗi.
- [x] Đồng bộ nền nằm trong `Cài đặt phiên`; lịch nền chạy theo chiều đã chọn và tôn trọng công tắc tổng.
- [x] Conflict cho phép chọn `Giữ FBM`, `Giữ ShinCRM` hoặc `Tự nhập` theo từng field, có kiểm tra kiểu và trần độ dài.
- [x] Kết quả phiên lớn dùng tổng hợp và phân trang; Sidebar không tải toàn bộ conflict/lỗi/log về RAM.
- [x] Bố cục module động dùng Block/schema và renderer chung; loading mở màn hình, trạng thái tĩnh và tiêu đề không dựng HTML riêng trong từng màn hình.
- [x] Tên hiển thị `Nghiệm thu phạm vi thử`; `ALT00010` chỉ là phạm vi DEV/live acceptance, không đại diện cho phiên nhiều Customer.
- [x] Tiêu đề header đổi theo màn hình; menu con nổi dưới header, cuộn nội bộ ở trần khoảng hai phần ba Sidebar; công tắc tổng và auto-login dùng pill nhỏ; các nút có menu trong tiêu đề Card dùng cùng chiều cao compact với tiêu đề Card.
- [x] Liên kết tài khoản có form nhập tay `Spreadsheet ID`, `Mã user FBM`, `Username FBM`, `Tên tài khoản FBM`; thao tác `Tự động điền - Kiểm tra` và `Lưu thông tin` báo lỗi tường minh, không tự lưu ngầm.
- [ ] **Cần kiểm chứng thực tế:** tải lại Extension, mở Sidebar và kiểm tra ACK cấu hình relay cùng trạng thái báo trên Sidebar/Log.

### Bổ sung UI dùng chung sau Slice 8

- [x] Identity probe chỉ chạy `GetGridViewPage` controller `User`, không lấy `authorize` thừa; GAS giữ dữ liệu trong DTO và Sidebar cập nhật bản nháp đủ bốn ô ngay cả khi form còn focus, không tự lưu liên kết. Test offline đạt `1325/1325`; relay deployment `@292`, DEV runner `@291`.
- [x] Khi Extension bắt tay bằng `sessionId` mới, bridge mới được nhận nhưng Sidebar không tự gửi lại relay config trong cùng lượt mở; mở Sidebar lần sau sẽ gửi một lần. Không yêu cầu cập nhật `chrome.storage` thủ công.
- [x] Tách `PopupList` thành nền hiển thị dùng chung cho search, dropdown, customer picker và menu module; controller riêng giữ nguyên hành vi từng loại.
- [x] Search giữ bề rộng đúng bằng ô nhập; dropdown giữ khả năng giãn theo nội dung và giới hạn theo Sidebar.
- [x] Tách adapter `CustomerPicker` khỏi nguồn dữ liệu dropdown; giá trị dropdown hợp lệ được đưa lên đầu và bôi xanh khi focus.
- [x] Cập nhật test offline sau khi renderer thêm class popup dùng chung và sửa mặc định ngưỡng chấp thuận khi Config rỗng: `1198/1198`.
- [ ] Cần chủ dự án mở lại Sidebar để nghiệm thu trực quan ba kiểu popup và menu Đồng bộ.

### Đợt ổn định Tài khoản FBM và trạng thái UI

- [x] Adapter đăng nhập lấy salt mới từ `Login.aspx` trước `GetEntityData` → `GetUnitData` → `Login`; đọc đúng `ChallengeScript` HTML FBM thực tế, giữ `force:false`, không gửi mật khẩu bản rõ và có test mô phỏng đủ năm request.
- [x] Tự điền nhận diện trên file chưa có binding điền form và chờ `Lưu thông tin`; chỉ đối chiếu/kiểm tra Customer khi đã có binding.
- [x] Render status hoãn dựng lại màn hình Tài khoản khi người dùng đang gõ, không giữ mật khẩu vào client state/GAS/Sheet/Log; popup combo giữ focus qua thao tác chuột.
- [x] Mở Sidebar chỉ bắt tay và gửi một relay config local, không tự phát heartbeat hoặc request FBM. Relay cùng URL, khóa và Spreadsheet đã xác nhận ACK ngay trong Extension, không probe GAS lặp hay yêu cầu Sidebar tự làm mới.
- [x] Màn hình Chạy đồng bộ giữ pipeline và chẩn đoán sau khi hoàn tất, lỗi hoặc tạm dừng; GAS trả DTO pipeline theo phase/cursor, Sidebar vá cùng lúc từng node, trạng thái và thanh tiến độ tại chỗ, nên không giữ dấu hoàn tất/số đếm của lượt cũ và không xóa/dựng lại thân màn hình. Test workflow offline đạt `1344/1344`; `fbmSyncStatus --push` xác nhận DTO ở GAS DEV revision `@295`.
- [x] Kết quả `Đăng nhập thử` và `Kiểm tra liên kết` luôn hiện ngay dưới nút thao tác, gồm đang chạy, thành công, cảnh báo có Customer thiếu và lỗi; DTO cho phép Sidebar nhận tổng hợp `n/N` từ GAS.
- [ ] **Cần kiểm chứng thực tế:** reload Extension, tự điền nhận diện, đăng nhập thử và chạy một lượt `Kiểm tra an toàn`; đối chiếu Network và trạng thái Sidebar theo hướng dẫn bàn giao.

## Đợt sửa bắt buộc — Scheduler GAS quyết định, Extension chỉ cầu nối

Các mục dưới đây là phần đang phải hoàn thiện trước khi báo chủ dự án chạy live. Chỉ đánh dấu `[x]` sau khi có test offline hoặc bằng chứng GAS DEV tương ứng.

- [x] Sửa kết quả heartbeat khi GAS trả `request: null`: không được biến trạng thái chờ/tắt/hết phiên thành thành công giả.
- [x] Khi GAS đã cấp envelope nhưng Extension không có tab FBM hoặc executor không trả lời, gửi transport failure về GAS để thu hồi reservation và giữ cursor an toàn; không retry mù.
- [x] Thêm khóa/reservation/idempotency cho `heartbeat_request`, chống hai alarm hoặc request thủ công cấp chồng và ghi đè `activeRequestId`.
- [x] Đưa giới hạn hop/slice của heartbeat và relay nền về GAS; Extension chỉ lặp theo envelope GAS trả và dừng khi `request: null`.
- [x] Đổi relay nền để hỏi GAS trước, chỉ tìm tab và gửi FBM sau khi GAS cấp envelope; Extension không tự chọn nghiệp vụ, mode, cursor hoặc điều kiện dừng.
- [x] Hoàn thiện auto-login nền: chỉ khi GAS xác định session hết hạn/thiếu cookie; thử tối đa một lần mỗi 30 phút, `force:false`, phiên đang được dùng thì chuyển sang chờ và không thử dồn.
- [x] Chốt trạng thái không có cookie ban đầu: GAS không cấp heartbeat FBM rỗng; chỉ cấp login envelope hoặc trả trạng thái chờ rõ ràng.
- [x] Bảo đảm công tắc tổng tắt/dừng phiên không xóa thông tin request đang bay; response cũ sau cancel/stop không được tiếp tục pipeline.
- [x] Sửa continuation nền: heartbeat chỉ xử lý response của đúng request heartbeat; nếu GAS cấp request tiếp theo thuộc cursor phiên nền thì Extension nộp qua `kind: background_sync`, command `continue` và `FbmSync.continue`; kiểm thử offline đạt `1304/1304`.
- [x] Capture generic của Extension đọc cả HTML và text của trang theo chỉ dẫn GAS; pattern cookie do GAS cấp nhận cả dấu nháy thường và escaped, token transport chỉ có trong text vẫn được thay trước khi gửi FBM.
- [x] Transport failure kết thúc phase `error`, giữ chẩn đoán nhưng không giữ reservation/cursor; hủy liên kết sau lỗi được phép, còn công tắc tổng OFF chuyển ngay sang `paused` nếu không có request FBM đang bay.
- [x] Bổ sung test offline cho mọi nhánh trên, gồm relay local không fetch `/exec`, ACK cấu hình lỗi giữ config cũ, `UNBOUND` không được cấp envelope, bridge mất context báo lỗi rõ, capture từ text, pause và công tắc tổng; tổng hiện tại `1325/1325`.
- [x] Executor áp dụng đúng `source` trong chỉ dẫn capture/replacement generic do GAS cấp, không ép mọi replacement về HTML trang; commit `b91790d`, test offline vẫn `1260/1260`.
- [x] Nghiệm thu GAS DEV bằng `node tests/gas.js ... --push` cho heartbeat request/response, transport failure, reservation và auto-login. `fbmSyncHeartbeatRequest` đạt ở revision `@252` với trạng thái fail-closed `AUTO_LOGIN_NOT_CONFIGURED`, `phase: paused`; `fbmSyncHeartbeat` trả `STALE_RESPONSE` khi không có reservation; `fbmSyncHeartbeatTransportFailure` trả `STALE_RESPONSE` khi request không còn hiệu lực; `fbmGetLoginConfig` đạt ở `@248`; `fbmProbeAutoLogin` đạt ở `@249`.
- [x] GAS DEV relay `AKfycbxWM4...` đã nâng revision `@288`; entrypoint transport failure giữ fail-closed với reservation cũ và xác nhận lỗi capture kết thúc tại `error`, không giữ cursor/reservation; executor test dùng trực tiếp pattern GAS cấp để chặn tái diễn lỗi dấu nháy cookie.
- Bằng chứng bổ sung: các entrypoint DEV đã được chạy lại sau khi sửa trạng thái chờ đăng nhập; kết quả đầy đủ được ghi ngay tại mục nghiệm thu GAS DEV bên trên.
- [x] Deployment Sidebar `AKfycbx0...` đã nâng lên revision `@292`; POST không khóa trả JSON `unauthorized`, xác nhận đây là Web App relay thật thay vì trang HTML Drive.
- [!] **Cần chủ dự án kiểm chứng thực tế:** giữ tab FBM đăng nhập, sau đó đăng xuất/đăng nhập lại để xác nhận không đá phiên máy khác và alarm tự khôi phục đúng chính sách.

## Bộ kiểm workflow theo use case

- [x] Tạo charter độc lập `tests/contracts/fbmSyncPipeline.js` từ Tài liệu 09.01, 09.02, 09.06, 09.08 và hợp đồng log; catalog cố định đủ 44 pipeline A-F, mỗi pipeline nêu trigger, kết quả quan sát được ở Sidebar, Extension, GAS, Sheet/Log khi có liên quan và loại bằng chứng bắt buộc.
- [x] Ma trận 44 pipeline có cổng kiểm: mỗi dòng phải trỏ tới ít nhất một module test offline đang chạy và điều kiện bằng chứng live/GAS DEV; thiếu chủ sở hữu test hoặc tệp test sẽ làm `node tests/run.js` đỏ.
- [x] Tạo harness `tests/cases/fbmSync/Workflow.js` chạy envelope thật qua GAS -> executor Extension -> GAS với fixture FBM, không dùng request FBM thật; đã kiểm tự điền/kiểm tra liên kết, đăng nhập thử đúng/sai identity, response thiếu identity, xóa binding rỗng, cổng mode, full read rỗng, alarm noop/no tab/có tab, approval, lỗi bridge thủ công, master OFF, stale response, cancel khi request đang bay, DTO không lộ state nội bộ và log tổng hợp.
- [x] Bổ sung `tests/cases/fbmSync/UserJourneys.js`: dựng Sidebar rồi phát click/change như người dùng cho bốn màn hình, header, công tắc tổng, bốn loại đồng bộ, chấp thuận/dừng, liên kết/credential/login, cài đặt phiên, tab kết quả, phân trang, retry và conflict.
- [x] Chuyển Sidebar sang vá component theo snapshot: chỉ dựng toàn thân lúc mở/đổi màn hình; Chạy đồng bộ, Tài khoản, Kết quả và Cài đặt giữ node control/bản nháp khi snapshot GAS tới. Vùng log/lỗi/conflict chỉ thay component dữ liệu của chính nó. Hồi quy kiểm node/focus dropdown, mật khẩu, nhịp Extension, hàng tab và cập nhật progress tại chỗ; `node tests/run.js` đạt `1428/1428`.
- [x] Bổ sung `StandaloneControl` như một Block độc lập cho input/select/toggle không thuộc DATA_SCHEMA; renderer có `renderControlValue`, `renderTargetState` và `renderReplaceChildren`. Sync shell, banner, menu, progress, preview và audit đều đi qua cây Block; không tạo HTML/DOM riêng cho callback trạng thái. `field.control` vẫn là khóa chọn renderer của trường dữ liệu, không phải component này.
- [x] Rà soát component toàn Sidebar: Sync dùng lại `Box/Card/Row/Text/Button/Icon/Field` và lớp `.shin-*` chung; bổ sung `StandaloneField` cho control ngoài DATA_SCHEMA; thay toàn bộ hàng nút, field, notice, toggle, key/value, pagination, section, vùng khóa và loading tương tự bằng component/lớp của ShinCRM độc lập; xóa helper Sync bọc lại control không còn nơi gọi; dọn style Sync generic legacy khỏi `frame.html` và `fbmSyncShell.html`; thêm kiểm hợp đồng `tests/cases/fbmSync/Components.js` cùng hồi quy chi tiết lỗi Category/Activity/preflight/HTTP, bộ kiểm đạt `1449/1449`.
- [x] Sửa lỗi loading giữ sổ node cũ: khi mở lại module, vùng nội dung hủy dấu màn trước và xóa target cũ; snapshot đầu tiên dựng lại Chạy đồng bộ thay vì vá vào node không còn trên DOM.
- [x] Sửa bố cục hàng lịch nền bằng grid dùng chung; toggle, nhãn và ô chu kỳ có cột/gap ổn định, không dính vào nhau trên Sidebar hẹp.
- [x] Đưa thông báo Cài đặt phiên về đúng card: relay, nhịp Extension, lịch nền/scheduler và chính sách tự đăng nhập có vùng thông báo riêng; bỏ mô tả và message chung ở đầu màn hình.
- [x] Tách các mount header/menu/banner của Sync khỏi vùng nội dung; snapshot chỉ vá target động, còn thay toàn vùng chỉ dùng lúc mở hoặc chuyển màn. Kiểm thử hồi quy giữ nguyên node/focus và đạt `1428/1428` sau khi thêm shell Block.
- [x] Chuẩn hóa shell Sync theo khung header chung của Sidebar/form (chiều cao, lề, khoảng cách, tiêu đề và Icon); gộp loading thành một Text căn giữa `Đang tải trạng thái phiên đồng bộ FBM`; bổ sung hồi quy header/loading, bộ test đạt `1433/1433`.
- [x] Bỏ wrapper `Box` riêng của header Sync; render trực tiếp cùng dãy `Icon → Text → thao tác bên phải` như header form vào mount dùng chung, tránh xung đột `.shin-box { display: block; }`; test đạt `1434/1434`.
- [x] Sửa công tắc `Bật lịch đồng bộ nền`: phản hồi ngay khi click, vá theo kết quả GAS tại chỗ, mở khóa sau callback và rollback khi lỗi; bổ sung kiểm hành trình UI, test đạt `1435/1435`.
- [x] Bỏ `FBM_ACCOUNT_NAME` khỏi Config/API/preflight; cổng owner và giá trị fallback request lấy tên đầy đủ từ binding bốn định danh. Test mô phỏng Config cũ xác nhận nó không thể gây khóa hoặc đổi binding.
- [ ] Mở rộng từng use case còn lại của charter thành trace chạy được đầy đủ qua các lớp; không đánh dấu hoàn tất chỉ vì các unit test thành phần đạt.
- [ ] Chỉ sau khi workflow offline của use case đạt mới đưa use case đó vào checklist nghiệm thu live tương ứng.

## Slice 9A — Một nhịp Extension và cấu hình nền theo pipeline

Các ràng buộc thiết kế của slice này nằm ở Tài liệu 09.01, 09.02, 09.06, 09.08 và 09A. Checklist dưới đây chỉ theo dõi việc triển khai và bằng chứng, không lặp lại hợp đồng.

### GAS scheduler

- [x] Tách hoàn toàn nhịp hỏi GAS của Extension khỏi lịch nghiệp vụ Customer, Activity và giữ phiên.
- [x] `fbmSyncHeartbeatRequest` kiểm công tắc, phiên đang chạy, tiến trình đến hạn và reservation trước khi dựng request; không có việc thì trả `request:null`.
- [x] Khi nhiều tiến trình cùng đến hạn, chọn đúng một theo ưu tiên rồi ghi `nextRunAt`; không tạo request FBM song song.
- [x] Khi tiến trình A đang chạy, request hỏi tiếp chỉ dựng continuation từ cursor A; tiến trình B chờ ở GAS.
- [x] Giữ phiên có ưu tiên thấp nhất và bị bỏ qua khi tiến trình khác đang chạy.
- [x] Marker quá hạn sau sleep được hợp nhất thành một lượt, không phát lại hàng loạt.
- [x] Supervisor chỉ thu hồi phiên treo, không phát lại request ghi và không xóa state cần chẩn đoán.
- [x] API đọc/ghi lịch nền, công tắc từng tiến trình và DTO `nextRunAt` có kiểm tra giới hạn.
- [x] Shape lịch nền versioned có công tắc tổng, ba chiều (`read`/`push`/`write`), bốn tiến trình và mặc định chu kỳ đã chốt.
- [x] Tiến trình detail lưu cursor trang qua `DocumentProperties`, giới hạn Customer mỗi lượt và không đánh dấu missing của full scan.
- [x] Delay detail tối thiểu/tối đa được GAS cấp thành `waitMs` trên envelope; Extension chỉ chờ rồi hỏi lại, không chứa logic nghiệp vụ.

### Extension service worker

- [x] Chỉ duy trì một alarm kỹ thuật tên `gas_poll`, mặc định 5 phút; không có alarm theo phiên hoặc tiến trình.
- [x] Alarm chỉ POST `heartbeat_request` một lần; `request:null` không dò tab, không gọi FBM và không retry ngoài lịch.
- [x] Cấu hình `pollMinutes`, `runOnStartup`, URL GAS, khóa relay và Spreadsheet ID kỹ thuật được lưu nguyên tử; lịch nghiệp vụ không nằm trong Extension.
- [x] Chrome startup có thể hỏi GAS ngay một lượt; Service Worker reload/wake chỉ khôi phục listener/alarm, không tự gửi request.
- [x] Có một flight chống request hỏi GAS trùng; alarm quá hạn sau sleep không tạo nhiều lượt bù.
- [x] Khi GAS cấp lệnh mở tab, Extension chỉ mở đúng URL được cấp, không tự chọn nghiệp vụ và không tự focus tab; tab mới phải tải xong trước khi chạy executor.
- [x] Không có tab khi tự mở bị tắt phải trả mã lỗi/chờ rõ ràng và nộp transport failure đúng reservation.

### Transport response lớn

- [x] Response không có chỉ dẫn được trả nguyên văn; Extension không tự hiểu Customer, Activity hoặc ý nghĩa field.
- [x] Bổ sung primitive generic lọc mảng/projection theo chỉ dẫn GAS, có fail-closed khi JSON/path không hợp lệ.
- [x] GAS cấp chỉ dẫn projection cột generic cho các trang bulk Activity sau khi đọc AliasName trang đầu; Extension chỉ áp dụng chỉ dẫn.
- [ ] **Cần kiểm chứng thực tế:** đo kích thước trước/sau trên response bulk FBM thật để xác nhận không chuyển nguyên body 35–40 MB qua relay.
- [x] Test đủ projection, lọc mảng, path thiếu, JSON lỗi, mảng rỗng, không có chỉ dẫn và không lọc nhầm dữ liệu.

### Sidebar và cấu hình phiên

- [x] Chuyển toàn bộ block đồng bộ nền vào `Cài đặt phiên`.
- [x] Hiển thị block `Kết nối Extension`, nhịp `gas_poll` mặc định 5 phút, startup poll và trạng thái relay; Spreadsheet ID kỹ thuật không hiển thị trong Sidebar.
- [x] Gom auto-login, tự mở tab và retry vào một nguồn cấu hình; `Tài khoản FBM` chỉ hiển thị trạng thái và nút đăng nhập thử.
- [x] Khi lưu cấu hình, tiến trình đang chạy, lỗi relay, `request:null` và retry đều có thông báo rõ; không mất log hoặc bản nháp.
- [x] Công tắc module trong Header và Card `Bật tắt module đồng bộ FBM` dùng cùng lệnh GAS, cập nhật lạc quan và rollback đồng thời.
- [x] Bốn tham số phiên được migration một lần khỏi Config vào `FBM_SYNC_SETTINGS_V1`, có API đọc/ghi và validation; ngưỡng `0` được chấp nhận.

### Workflow pipeline

- [x] Bổ sung workflow test dựa trên tài liệu cho startup, wake, restart, một alarm, không có việc, overlap, ưu tiên, auto-open, retry và response lớn.
- [ ] Ma trận 44 pipeline có ít nhất một bằng chứng chạy thật qua GAS → Extension → FBM giả lập → GAS/UI cho mỗi nhánh liên quan.
- [x] Chạy `node tests/run.js`; bộ offline hiện đạt `1589/1589`. Ma trận live/GAS DEV còn chờ các mục được đánh dấu riêng.

### Đợt sửa Sidebar FBM ngày 16/09/2026

- [x] Xóa màn `Tổng quan`; `Chạy đồng bộ` là màn hình mặc định và đứng đầu menu chọn màn hình.
- [x] Tài khoản FBM rút gọn thông báo liên kết, tô đỏ đúng ô thiếu, tự điền thành công chỉ báo một dòng, credential đã lưu hiển thị chỉ xem với icon sửa.
- [x] Chạy đồng bộ và Kết quả & xử lý dùng popup/tab/action-row chuẩn, progress rỗi rỗng, năm tab đều cột, Summary có khoảng đệm và Conflict có nút quay lại một hàng riêng.
- [x] Cài đặt phiên có công tắc module đồng bộ, lịch nền hai chiều/bốn tiến trình, batch và delay detail, tham số phiên chỉnh được trong Sidebar.
- [x] Tám khối cấu hình dùng component điều phối chung cho trạng thái xem/sửa, snapshot hủy, draft và action lưu; view khóa input, edit hiện X + dấu tích ở tiêu đề, nút body dùng cùng lệnh lưu/hủy. Test UI FBM đạt 106/106.
- [x] Nút sửa cấu hình dùng hàng action chung nên đồng nhất chiều rộng; trạng thái sửa dùng nền xám trung tính, viền hòa với nền, chữ thường, hover đậm nền nhưng vẫn hòa viền, dấu tích xanh, dấu X đỏ và khoảng cách icon 8px. Test offline đạt 1580/1580.
- [x] Chuẩn hóa mép các khối lớn: `.shin-scroll-region` giữ gutter 4px ở cả hai phía, section không tự cộng padding trái nên card của màn thường và bốn màn Sync cùng trục dù có scrollbar hay không.
- [x] Khối thông tin khách dùng `--shin-card-pad` cho lề ngang như ruột Card, không để mã khách/liên hệ sát mép Sidebar.
- [x] Commit triển khai: `4370b08`, `80cb723`, `a10bba3`, `9d38fac`, `8822e72`, `801f391`, `40936a7`, `5c3acf9`, `ab208da`, `5feb4b6`, `2991b29`, `a8856a9`, `3dac581`, `6158962`, `550a738`, `3367e34`, `da6ec7e`, `e58da21`, `d2c6cf8`, `dc9460c`, `3b32296`, `afb119a`, `58e8d5b`, `9cf3b43`, `4ff29fa`; GAS DEV `fbmGetSyncSettings` đạt `OK` ở revision `@353`.

## Slice 9 — Live acceptance và mở rộng production

- [ ] **Cần kiểm chứng thực tế:** chạy đủ lượt Đọc thử `ALT00010`, đối chiếu số dòng, field, hash, liên kết và idempotency.
- [ ] **Cần kiểm chứng thực tế:** chạy Customer edit, Activity create/edit và xác nhận lại sau pull.
- [ ] **Cần kiểm chứng thực tế:** kiểm conflict, khóa form, mất tab/phiên và phục hồi.
- [ ] **Cần kiểm chứng thực tế:** kiểm lỗi transport/HTTP và xác nhận không gửi write mù.
- [x] Chốt bằng fixture offline các case không thể live: Customer vắng, Activity hard-delete/vắng, owner mismatch không phát sinh, marker mồ côi.
- [ ] Không chạy Delete để dọn Activity thử; giữ marker nhận diện rõ dữ liệu nghiệm thu.
- [ ] Chỉ sau khi toàn bộ live acceptance đạt mới gỡ giới hạn `ALT00010`.
- [ ] Chỉ sau khi được duyệt mới nạp khoảng 1.700 Customer và Activity, đo payload/thời gian và chốt baseline.
- [ ] Trước production: xóa `server/dev/`, deployment DEV và tệp cấu hình thử; tắt chia sẻ bằng liên kết, `LOG_TRACE` và cửa ghi thử.
- [ ] Cập nhật cây thư mục, revision GAS, phiên bản Extension, commit tài liệu bàn giao và merge branch đồng bộ.

## Bằng chứng các slice

| Slice | Commit code | Test/offline | Revision GAS | Bằng chứng thực tế | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Slice 0 — Nền tảng |  |  |  |  |  |
| Slice 1 — Preflight + Category | `fadcf33`, `8bd57f0`, `de9b316`, `7da8cfd`, `3a33422` | `1195/1195` | `@210` | GAS DEV `fbmStartIdentityProbe` trả request authorize khi file có dữ liệu lệch liên kết; `fbmProbeAutoLogin` trả endpoint Login, mặc định bật và request không chứa credential; không ghi Sheet/FBM | Category chỉ đọc/đối chiếu; auto-login giữ envelope mã hóa và throttle 30 phút |
| Slice 2 — Pull Customer |  |  |  |  |  |
| Slice 3 — Pull Activity | `8fbb6a7` + entrypoint DEV | `1075/1075` | `@136` | Pull `ALT00010` đã xác nhận Activity liên kết và idempotency; bulk/catchup/rotation đã có test offline; `fbmSyncStartActivityBulk` trả `OK`, request đầu `authorize`, state `scan=activity_bulk`; `fbmInstallScheduler` trả `OK` | Ba lớp quét Activity nền đã có cursor state/DocumentProperties |
| Slice 4 — Đối soát + conflict |  |  |  |  |  |
| Slice 5 — Push Customer | `5d74fd4` | `1175/1175` | `@200` | GAS DEV `fbmSyncStatus` đọc `ALT00010` thành công; preflight đạt | Customer create mất phản hồi dò MST contains, verify exact + hash, vá ID/baseline và không phát lại request ghi |
| Slice 6 — Push Activity | `e9ba3f1`, `01688d6`, `cd94601`, `b6d8b43`, `1a67029`, `c1ca43d`, `b9a989e`, `c49bc6c`, `284b5b9` | `1119/1119` | `@174` | Đã bắt được phiên treo: GAS ghi `gas_returned` nhưng callback Sidebar không serialize được Date trong memvars; builder sửa ngày Sheet sang `/Date(ms)/`, cập nhật `datetime0`, tách `fileticket` OldValue/NewValue và OldValue thiếu theo fixture | Callback Activity Edit có trace `entered/returned/failed`; trace hop độc lập nối GAS/Sidebar/Extension/FBM; quá 15 giây Sidebar tự kết luận timeout và không tự gửi lại lệnh ghi |
| Slice 7 — Scheduler + nền | `7a324ee`, `43233a5`, `0d46258`, `ba46b23`, `36d6f8f`, `9923fac`, `119cea6` | `1078/1078` | `@252` | GAS DEV heartbeat request/response, reservation và transport failure fail-closed; không phát request ghi khi thiếu phiên/cấu hình | GAS giữ hop/slice và cursor; relay kèm Spreadsheet ID; Sidebar gửi config khi mở; không chạm FBM khi GAS chưa cấp envelope; bridge cũ sau Reload được thử lại có kiểm soát; state active quá hạn được thu hồi |
| Slice 8 — UI + log + probe | `e243432`, `3e60e88`, `e4c92c1`, `52c3fa9`, `81c4c58`, `778eed1`, `54056ef`, `4493ec5`, `23d1a49`, `1f7be3e`, `030b059`, `e928e4a`, `8438eed`, `d428a6e`, `697ddd0`, `860c83b`, `23c9111`, `2e50efc`, `4ec7688`, `638c5f4`, `cb81f07` | `1228/1228` (gồm smoke test DOM Sidebar, test executor chặn endpoint lỗi và heartbeat thủ công) | `@232` (`fbmGetSyncSettings` trả `OK`, `approvalThreshold: 10`; `fbmGetMasterSwitch` trả `OK`, `enabled: true`; `fbmSyncStatus`/`fbmSyncPreflight` fail-closed đúng khi chưa liên kết FBM; `fbmGetSyncTrace` trả `OK`) | UI shell bốn màn hình, menu dọc phù hợp Sidebar hẹp, popup dùng chung cho search/dropdown/customer picker/menu, hộp menu nổi dưới header có nền đặc và cuộn nội bộ, pill `ON/OFF` nhỏ, tiêu đề đổi theo màn hình, form liên kết nhập tay; lớp Đồng bộ phủ toàn Sidebar, không bị đẩy xuống sau thông tin khách; form khách hàng khai một cụm Schema và hiển thị liền mạch; mép view/form/Sync dùng token scrollbar 4px, tiêu đề card đồng nhất 28px và nút có menu không làm header phình cao, nhãn form tương phản hơn; bộ lọc lịch sử hiển thị `All/Active/Deleted`, nấc đang chọn nằm trước nút `Thêm`; pipeline chỉ hiện khi phiên chạy, tab kết quả và phân trang đã hoàn tất; nút Trang trước/Trang sau dùng hai cột bằng nhau, chữ đủ tương phản khi bị khóa; mở lại dropdown hợp lệ hiện toàn bộ danh sách và bôi xanh giá trị cũ, đang gõ chỉ lọc các dòng khớp và bôi xanh dòng đầu để Tab/Enter chọn, Công ty mẹ dùng cùng luồng tìm kiếm và chọn dòng đầu; mọi ô nhập dùng token chặn autofill của Chrome, không còn popup đen chồng lên popup ứng dụng; khoảng cách giữa các khối trên toàn Sidebar dùng một nhịp gap chung; bố cục động dùng Block/schema và renderer chung; smoke test UI phủ trạng thái rỗng/đang chạy/lỗi, pipeline, liên kết, conflict, phân trang, cấu hình và lỗi async; worker tự nạp executor `21.10`, kênh V2 không để executor cũ gọi song song, endpoint `undefined` bị chặn trước `fetch`, trace giữ metadata an toàn, GAS cấp envelope heartbeat trước khi worker gửi FBM; chưa nghiệm thu probe trên Sidebar | Cần chủ dự án đóng/mở lại Sidebar và tải lại Extension để kiểm tra hiển thị/thực tế |
| Slice 9A — Một nhịp Extension + scheduler GAS | `a1b8e0c`, `02331ab`, `3b0ed75`, `14938d6`, `d57cb30`, `69239fe`, `3340e87`, `56e7974`, `a1397e2`, `3b32296`, `afb119a` + bản phát hành Extension | `1570/1570` | `@333` | GAS DEV `fbmGetSyncSettings` trả `OK` với `account` từ `FBM_ACCOUNT_SETTINGS_V1`; `fbmSaveAccountSettings` trả `OK` trên Sheet DEV; `fbmSyncStartActivityBulk` trả `OK` với envelope `authorize` fail-closed trước khi có phiên FBM; offline kiểm migration/validation prefix-độ dài/mốc Activity, filter `end_date:>=DD/MM/YYYY` theo mẫu FBM ở bulk/per-Customer, state chụp mốc theo lượt, missing scan bỏ qua Activity trước mốc, refresh conflict không áp dụng mốc, kiểm mã FBM tự sinh, preflight Customer mới, smoke UI card cấu hình tài khoản và menu bốn màn hình với Chạy đồng bộ là mặc định; kiểm hồi quy `.shin-scroll-region`, gutter hai phía và `.shin-section`; `fbmGetSyncSettings` trả cấu hình nền và tài khoản đúng DTO | Còn cần đo response bulk thật, live kiểm tab/Sidebar và nghiệm thu 44 pipeline theo các mục riêng |
| Slice 9 — Live acceptance + production |  |  |  |  |  |

Ghi chú triển khai sau Slice 8: commit `770dc8c` và `21434f9` làm heartbeat kiểm tra relay/công tắc/phiên trước khi gửi FBM; deployment GAS cũ hoặc phiên hết hạn sẽ không làm alarm tiếp tục bắn request FBM, còn `fbmHeartbeatNow()` thủ công vẫn chạy khi chỉ tắt đồng bộ nền. Commit `b42db8b` buộc Sidebar lấy URL relay hiện tại và chờ Extension ACK, tránh giữ URL deployment cũ. Commit mới bổ sung quyền truy cập Sheets và nâng Extension lên `21.9` để khôi phục bridge sau khi reload; khi relay gặp 404, Service Worker yêu cầu Sidebar đang mở tự lấy lại URL hiện tại. Executor ưu tiên cookie payload hiện có trên tab thay cho cookie cũ từ GAS. Test offline đạt `1235/1235`; GAS DEV đã tạo deployment mới `https://script.google.com/macros/s/AKfycbxWM4kaJmtGZnWQ6cHQbW8Y87qvOHTmAIkxlkVTGVjamlFxe5zUzNJ2Wxr3AQ7t03rV/exec` ở revision `@236`; đang chờ xác nhận Extension tự đổi URL trong storage.
Ghi chú cập nhật triển khai: GAS DEV revision `@237` trả relay URL `AKfycbxWM4...`; Extension `21.10` chống lặp refresh khi relay lỗi, bridge cũ bỏ qua `Extension context invalidated`, Sidebar timeout request sau 30 giây và gửi một heartbeat khi mở Sidebar theo công tắc đồng bộ nền.
Ghi chú cập nhật triển khai tiếp theo: GAS DEV revision `@238` sửa thứ tự khởi tạo, Sidebar chờ `CRM_HANDSHAKE_ACK` trước khi gửi relay config nên URL mới được Extension tự lưu sau khi mở Sidebar.
Triển khai xác nhận: deployment Sidebar đang dùng `AKfycbx0ueI_gR2zz...` đã được cập nhật revision `@240`; DEV runner dùng `AKfycbxWM4...` revision `@241`. URL deployment ổn định qua revision; Extension chỉ nhận lại config local/ACK khi Sidebar mở, không tự probe URL.
Ghi chú chẩn đoán relay: deployment Sidebar đã cập nhật revision `@243`; relay compact giữ lại `code`, `error` và HTTP status để không làm rỗng nguyên nhân lỗi heartbeat.
Ghi chú executor: commit `4560e42` sửa heartbeat Customer về request trang đầu hợp lệ; commit `dad9f02` nâng executor lên `21.9` để tab FBM đang mở tự nạp bản sửa sau khi Extension reload. Test offline đạt `1236/1236`.
Ghi chú Slice 9A: commit `a1b8e0c` gom lịch nghiệp vụ về GAS, giữ Extension một alarm `gas_poll`, thêm cấu hình `Cài đặt phiên`, auto-open theo lệnh GAS và primitive projection/lọc generic; Extension phát hành `21.15`. GAS DEV hiện ở revision `@299`; test offline mới nhất `1428/1428`. Chưa coi đo bulk thật hoặc live acceptance là hoàn tất.
### Cập nhật refactor shell Sidebar ngày 16/09/2026

- [x] Refactor FBM dùng chung shell `header/info/body/footer` của Sidebar; bỏ overlay và vùng cuộn riêng, phục hồi form/footer khi đóng, khóa callback đến muộn; test offline `1582/1582`, commit `2827107`, `222f7be`, GAS DEV revision `@340`.
- [x] Tách menu chọn cố định khỏi combo input: thêm `StandaloneControl(kind: 'menu')` dùng popup chung nhưng trigger là button, chuyển Loại đồng bộ/Chiều đồng bộ/Conflict; khóa callback đến muộn khi popup đang mở; test offline `1589/1589`, commit `3b297e7`, `2ee3aa7`, GAS DEV revision `@343`.
- [x] Màn FBM vẽ ngay shell và khung `Chạy đồng bộ` trước snapshot GAS; trạng thái chưa sẵn sàng khóa control qua renderer chung, snapshot về sau hydrate tại chỗ; test offline `1589/1589`, commit `88d88e7`, GAS DEV revision `@344`.
- [x] Tab `Kết quả & xử lý` hiển thị năm tab chỉ có nhãn; mô tả nằm ở một vùng riêng bên dưới hàng tab và được vá theo tab đang chọn, giữ mã tab và vá tại chỗ; body dùng `Stack` chung thay vì lồng `shin-section`, chữ phụ 13px, Nghiệm thu tối đa hai dòng; test offline `1589/1589`, commit `3e84f0a`, GAS DEV revision `@350`.
- [x] Chuẩn hóa `PopupList` làm component popup duy nhất cho search, dropdown, customer picker, menu chọn và menu module; controller chỉ giữ dữ liệu/phím tắt, popup dùng chung tự neo, giãn theo nội dung, giới hạn Sidebar, lật chiều và đóng khi click ngoài; test offline `1583/1583`, commit `d255abd`, GAS DEV revision `@376`.
- [x] Loại bỏ listener đóng popup trùng trong FBM/choice menu; PopupList là nơi duy nhất xử lý click ngoài và bộ DOM test mô phỏng đúng nhiều listener; test offline `1584/1584`, commit `14cc9f6`, GAS DEV revision `@377`.
- [x] Hợp nhất hoàn toàn menu ba chấm, popup `Sản phẩm`, `Chiều đồng bộ`, tìm kiếm và customer picker vào một `PopupList`: khung/kích thước/bố cục dùng chuẩn popup `Sản phẩm`; typography theo ô nhập (`Roboto` 14px, line-height 1.4, weight thường); dòng thoáng `6px 10px` và có vạch phân cách mảnh như dropdown cũ; màu chữ/active/hover giữ theo hợp đồng PopupList; dòng active/selected không in đậm; không còn CSS popup riêng; test offline `1589/1589`, commit `45d38e1`, GAS DEV revision `@386`.
- [x] PopupList tái neo popup theo trigger khi vùng body, cửa sổ hoặc viewport cuộn/đổi kích thước; giữ popup tại mép nhìn thấy khi trigger chạm mép vùng cuộn, còn menu header vẫn neo theo viewport; test offline `1603/1603`.

### Cập nhật reload RAM và sheet quản trị ngày 16/09/2026

- [x] Lõi GAS quyết định scope reload từ `ReloadState`, trigger/cửa ghi phát signal, API `probeSelectionAndReload` gộp selection và reload trong một request; commit `933f308`.
- [x] Sidebar/Extension dùng wake debounce một giây, reload dữ liệu ba giây, fallback selection probe một request và safety polling thưa chỉ cho RAM; revision chỉ được ghi nhận sau khi áp dụng dữ liệu thành công; commit `ab464fe`.
- [x] Checklist chi tiết và hợp đồng triển khai đã được cập nhật; các ca live trong Sheet DEV còn chờ chủ dự án nghiệm thu.

### Cập nhật chuẩn form Sidebar ngày 17/09/2026

- [x] Header các màn sửa/lưu dùng chung bố cục nhãn trái, X và tick cùng neo phải; icon dùng SVG nội tuyến, input/textarea/combo/menu dùng viền, đệm và nhãn theo chuẩn giao diện cũ; test offline `1606/1606`.
- [x] Dải loading giữ 3px ổn định để body không nhảy, dùng `visibility: hidden` lúc rảnh nên không lộ vạch và không phụ thuộc màu nền của `#sidebar-body`; test offline `1606/1606`.
- [x] Hợp nhất primitive loading dùng chung `shin-loading-track`/`shin-loading-fill` cho ray toàn Sidebar và progress trong card Sync; bỏ CSS animation riêng theo màn hình; test offline `1608/1608`.
