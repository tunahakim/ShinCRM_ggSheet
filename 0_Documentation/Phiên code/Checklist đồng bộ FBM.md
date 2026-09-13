# Checklist phiên đồng bộ FBM

Đây là checklist duy nhất của phiên đồng bộ FBM/ShinCRM. Công việc được thực hiện theo thứ tự từ trên xuống dưới; trong một slice, các mục độc lập có thể làm song song. Chỉ mục có nhãn **Cần kiểm chứng thực tế** mới cần chủ dự án giữ tab FBM, đăng nhập, bật ghi thật hoặc kiểm tra dữ liệu live. Live test chỉ được chạm `ALT00010`, tuyệt đối không gửi request xóa và không đưa `note` nội bộ ShinCRM lên FBM.

## Quy ước tiến độ

- `[x]` chỉ đánh dấu khi có bằng chứng tương ứng: code, test offline, GAS DEV hoặc kiểm chứng thực tế.
- `[ ]` là việc còn thiếu; mục không có nhãn **Cần kiểm chứng thực tế** là việc AI tự tiếp tục được.
- Một slice chỉ đóng sau khi đủ code, test, log/báo cáo và checklist case của slice đó.
- Sau khi đóng slice, ghi commit và revision GAS vào bảng bằng chứng cuối file.
- Bộ kiểm offline gần nhất đạt `1195/1195`; phần đọc `ALT00010` và một Activity đã từng kiểm chứng, chiều ghi live vẫn chờ nghiệm thu.

## Nguồn hợp đồng

Hợp đồng nhận diện, đăng nhập và cấu hình kết nối nằm ở `[NEO → Tài liệu 09.06]`; hợp đồng màn hình và luồng kiểm tra liên kết nằm ở `[NEO → Tài liệu 09.08]`. Checklist chỉ ghi công việc triển khai và tiêu chí nghiệm thu, không chép lại hợp đồng.

## Slice 0 — Nền tảng, ranh giới và an toàn

### Kiến trúc và dữ liệu nhạy cảm

- [x] GAS giữ nghiệp vụ, cursor, hash, conflict và quyết định; Extension chỉ tìm tab FBM, gọi `fetch` và trả response thô; Sidebar chỉ khởi chạy và hiển thị.
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
- [x] Có probe relay chỉ đọc: Service Worker gọi Web App GAS trực tiếp, GAS trả `RELAY_PROBE_OK`, không cần Sidebar và không chạm tab FBM.
- [x] Probe ghi `request_sent`, `response_received` và kết quả cuối vào `chrome.storage.local` để phân biệt lỗi gửi, lỗi nhận và lỗi xử lý response.
- [x] Service Worker có lệnh kiểm tra vòng đọc `fbmRunBackgroundSync('read')`, chuyển request/response do GAS cấp qua tab FBM, giới hạn 100 request và không tự ghi FBM.
- [x] Relay nền dùng DTO gọn, không chuyển `metadata`/`traceTail` của Sidebar qua Extension.
- [x] Đã kiểm chứng đường Sidebar → Extension → tab FBM → Sidebar nhận response thật.
- [x] Executor báo phiên bản `21.7`; reload Extension có thể phục hồi đầu nhận.
- [x] Bridge cũ sau Reload báo lỗi `Extension context invalidated` theo nhánh có thể thử lại; Sidebar phát lại đúng một request và Service Worker chống trùng theo `id`.
- [x] Bridge cũ tự im lặng khi context mất, không làm rơi response thật từ bridge mới sau Reload.
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
- [x] 401/403 hoặc `Login.aspx` dừng kỳ và yêu cầu đăng nhập lại khi tùy chọn tự động đăng nhập tắt.
- [x] Tùy chọn tự động đăng nhập mặc định bật, tự chạy khi session hết hạn/không có cookie, không ép login khi session hợp lệ đang tồn tại và chỉ thử lại nhiều nhất một lần mỗi 15 phút. Code, test offline và GAS DEV `fbmGetLoginConfig` đã xác nhận trạng thái mặc định; nhánh hết phiên có throttle 15 phút.
- [x] Form thiết lập đặt username và password cạnh nhau, hiển thị mật khẩu dạng `***`/trống, không ghi bản rõ vào Sheet hoặc Log. Sidebar xóa ô mật khẩu sau khi lưu/thử.
- [x] Extension mã hóa username/mã user, SpreadsheetId và mật khẩu thành envelope trước khi gửi/lưu qua GAS; không lưu credential bản rõ ở Sheet, Log hoặc `Config`. Kho cục bộ dùng AES-GCM; GAS chỉ giữ ciphertext.
- [x] Khi đọc lại cấu hình, Extension chỉ giải mã nội bộ và trả trạng thái cùng các trường không nhạy cảm; Sidebar không nhận mật khẩu bản rõ. DTO `fbmGetLoginConfig` loại envelope trước khi trả về.
- [x] Nút `Đăng nhập thử` thử login mềm bằng thông tin người dùng nhập, không logout phiên hợp lệ và không ghi bí mật. Request dùng `force:false`, kết quả chỉ trả mã/trạng thái.
- [x] Preflight đối chiếu tuyệt đối username/mã user, tên đầy đủ và SpreadsheetId thực tế trước request nghiệp vụ; không trim, đổi hoa thường hoặc chuẩn hóa khi so sánh và không dùng mã ngắn.
- [x] Tự điền thông tin nhận diện từ Spreadsheet hiện tại và response `authorize`, chỉ cho xác nhận các giá trị hệ thống, không tự lưu hoặc tự chuyển tài khoản. Probe chỉ gọi authorize, không quét Customer; Sidebar chỉ lưu sau nút xác nhận.
- [x] `Kiểm tra thông tin đồng bộ` quét đủ Customer FBM, đối chiếu chỉ các dòng local đã có FBM_ID, trả tổng hợp `n/N`, mẫu sai lệch và nút `Kiểm tra lại`; không ghi Sheet/FBM. Code, test offline và GAS DEV đã xác nhận entrypoint authorize Customer, full-scan không lọc mã test, cursor `stt_rec_kh` và kết thúc không ghi Sheet/FBM.
- [x] Khi file là bản sao, đổi tài khoản hoặc chưa có liên kết nhưng đã có dữ liệu, chuyển `REBIND_REQUIRED`, khóa push/nền; sau khi người dùng xử lý dữ liệu cũ có thể chạy kiểm tra lại, không tự xóa dữ liệu.
- [x] Mỗi lần Sidebar mở hoặc bắt tay lại, Extension ghi đè relay config bằng GAS URL, khóa và Spreadsheet ID hiện tại; Extension chỉ giữ một config đang hoạt động và alarm không gọi FBM khi chưa có config.
- [x] Tách phần dựng block trạng thái, điều khiển và audit thành các tệp `.html` riêng trong `client/sync/`, vẫn dùng lớp component/block chuẩn của Sidebar.
- [x] Tách màn hình trạng thái, thiết lập đăng nhập và audit thành các tệp giao diện riêng trong `client/sync/`, tái sử dụng block chuẩn.
- [x] Lấy authorized Customer rồi Activity; thiếu token thì dừng trước CRUD.
- [x] Kiểm owner mặc định FBM khớp `FBM_ACCOUNT_NAME`; sai thì dừng chiều push.
- [x] Xác nhận Config có `FBM_ACCOUNT_NAME`, `FBM_MA_KH_PREFIX`, `FBM_MA_KH_LENGTH`, `FBM_ACTIVITY_SINCE` và không khai trùng.

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
- [x] `FBM_ACTIVITY_SINCE` loại lịch sử cũ mà không làm sai baseline hoặc missing.

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

- [x] Request Activity theo `externalKey stt_rec` nối đúng Customer nội bộ.
- [x] Activity mới không marker tạo dòng ShinCRM, cấp mã nội bộ, lưu FBM ID và baseline.
- [x] Marker trỏ dòng đang đẩy thì vá ID, không tạo trùng.
- [x] Marker trỏ dòng đã có FBM ID khác thì khóa và báo xử lý.
- [x] Marker mồ côi chỉ log, không tạo lại.
- [x] Activity thiếu hoặc placeholder `workDate` bị chặn và log, không tự điền ngày.
- [x] Hash Activity dùng cùng luật ba chiều như Customer.
- [x] Activity vắng trong bulk chỉ mang trạng thái không thấy bên FBM, không suy hard-delete.

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
- [x] Kiểm owner mặc định FBM với `FBM_ACCOUNT_NAME` trước toàn bộ chiều push.
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

- [x] Extension có alarm heartbeat 5 phút, đọc `count:1`, không tự login hoặc write; login chỉ do cổng phiên của request nghiệp vụ điều phối.
- [x] Heartbeat nộp kết quả cho GAS, cập nhật lần sống cuối và kích full Customer khi tổng số đổi.
- [x] Kỳ Customer 60 phút kéo full grid qua nhiều lát, lưu cursor từng lát.
- [x] Kỳ Activity 8 giờ chạy bulk ID và lớp `ngay_gd`.
- [x] Vòng xoay Activity chạy mỗi 30 phút, quét 30 Customer tiếp theo và tiếp tục đúng cursor sau khi service worker/GAS gián đoạn.
- [x] Scheduler không tạo hai kỳ, không giữ công việc trong RAM và tiếp tục từ lát đã chốt.
- [x] Khi người dùng bấm `Đồng bộ ngay` trong lúc có phiên nền, GAS đánh dấu phiên nền dừng, chờ response FBM hiện tại kết thúc, không cấp request tiếp theo rồi Sidebar ưu tiên phiên thủ công; không tạo hai phiên song song. Test offline phủ handoff nền → thủ công.
- [x] Nút Dừng đồng bộ xóa marker `scheduledScan`, không để heartbeat tự khởi động lại kỳ vừa dừng.
- [x] Web App dùng khóa theo spreadsheet để tiếp tục khi Sidebar đóng.
- [x] Mở lại Sidebar chỉ đọc state hiện có, không tạo kỳ thứ hai.
- [x] Nạp lần đầu theo thứ tự Category → Customer → Activity → baseline; nếu Sheet đã có dữ liệu hoặc FBM_ID thì phải qua kiểm tra liên kết, xử lý `REBIND_REQUIRED` trước và không nhân bản. Preflight chặn cả phiên đọc/ghi thường khi lệch liên kết; chỉ chế độ kiểm tra liên kết được phép chạy để xử lý.
- [x] Lệnh tính lại baseline không phát request write FBM.
- [ ] **Cần kiểm chứng thực tế:** bắt đầu kỳ, đóng Sidebar, chờ Web App/Extension và mở lại xem state/log.
- [ ] **Cần kiểm chứng thực tế:** reload hoặc để service worker ngủ rồi xác nhận kỳ tiếp tục.
- [ ] **Cần kiểm chứng thực tế:** reload Extension, kiểm tra `chrome.storage.local` có relay config, chạy một heartbeat đọc và xác nhận service worker không báo `RELAY_FETCH_FAILED`/`RELAY_TIMEOUT`, GAS nhận được handoff và state cập nhật khi Sidebar đóng.

### Đóng slice

- [x] Code, test offline, log và GAS DEV của heartbeat/scheduler hoàn tất.

## Slice 8 — Sidebar, log và probe nghiệm thu

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
- [x] Click icon Đồng bộ ở menu chính mở thẳng màn hình `Tổng quan`, không hiện menu trung gian.
- [x] Module có menu nội bộ và năm màn hình: `Tổng quan`, `Tài khoản FBM`, `Chạy đồng bộ`, `Kết quả & xử lý`, `Cài đặt phiên`.
- [x] Header có cụm phải `[ON/OFF] [☰]`; khi tắt, phiên thủ công, đồng bộ nền, auto-login và thao tác ghi/giải quyết conflict bị khóa, state/log vẫn xem được; menu con cuộn ở ngưỡng hai phần ba Sidebar.
- [x] Menu con là hộp nổi dưới header, không làm nội dung màn hình dịch xuống khi mở.
- [x] `Tài khoản FBM` gom nhận diện và đăng nhập tự động trong một màn hình; login thử phải đối chiếu user, tên tài khoản và Spreadsheet ID trước khi cho bật auto-login.
- [x] `Chạy đồng bộ` dùng dropdown diễn giải rõ `Kiểm tra an toàn`, `Lấy từ FBM → ShinCRM`, `Đẩy từ ShinCRM → FBM`, `Đồng bộ hai chiều`; không có checkbox ghi trùng ý nghĩa.
- [x] Mọi phiên đang chạy hiển thị pipeline theo thực thể với trạng thái chưa chạy/đang chạy/hoàn tất/lỗi.
- [x] Đồng bộ nền nằm trong Tổng quan/cài đặt nền, chỉ đọc FBM và tôn trọng công tắc tổng.
- [x] Conflict cho phép chọn `Giữ FBM`, `Giữ ShinCRM` hoặc `Tự nhập` theo từng field, có kiểm tra kiểu và trần độ dài.
- [x] Kết quả phiên lớn dùng tổng hợp và phân trang; Sidebar không tải toàn bộ conflict/lỗi/log về RAM.
- [x] Bố cục module động dùng Block/schema và renderer chung; loading mở màn hình, trạng thái tĩnh và tiêu đề không dựng HTML riêng trong từng màn hình.
- [x] Tên hiển thị `Nghiệm thu phạm vi thử`; `ALT00010` chỉ là phạm vi DEV/live acceptance, không đại diện cho phiên nhiều Customer.
- [x] Tiêu đề header đổi theo màn hình; menu con nổi dưới header, cuộn nội bộ ở trần khoảng hai phần ba Sidebar; công tắc tổng và auto-login dùng pill nhỏ.
- [x] Liên kết tài khoản có form nhập tay `Spreadsheet ID`, `Mã user FBM`, `Tên tài khoản FBM`; thao tác `Tự động điền - Kiểm tra` và `Lưu thông tin` báo lỗi tường minh, không tự lưu ngầm.
- [ ] **Cần kiểm chứng thực tế:** chạy probe một nút và kiểm tra báo cáo trên Sidebar/Log.

### Bổ sung UI dùng chung sau Slice 8

- [x] Tách `PopupList` thành nền hiển thị dùng chung cho search, dropdown, customer picker và menu module; controller riêng giữ nguyên hành vi từng loại.
- [x] Search giữ bề rộng đúng bằng ô nhập; dropdown giữ khả năng giãn theo nội dung và giới hạn theo Sidebar.
- [x] Tách adapter `CustomerPicker` khỏi nguồn dữ liệu dropdown; giá trị dropdown hợp lệ được đưa lên đầu và bôi xanh khi focus.
- [x] Cập nhật test offline sau khi renderer thêm class popup dùng chung: `1196/1196`.
- [ ] Cần chủ dự án mở lại Sidebar để nghiệm thu trực quan ba kiểu popup và menu Đồng bộ.

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
| Slice 1 — Preflight + Category | `fadcf33`, `8bd57f0`, `de9b316`, `7da8cfd`, `3a33422` | `1195/1195` | `@210` | GAS DEV `fbmStartIdentityProbe` trả request authorize khi file có dữ liệu lệch liên kết; `fbmProbeAutoLogin` trả endpoint Login, mặc định bật và request không chứa credential; không ghi Sheet/FBM | Category chỉ đọc/đối chiếu; auto-login giữ envelope mã hóa và throttle 15 phút |
| Slice 2 — Pull Customer |  |  |  |  |  |
| Slice 3 — Pull Activity | `8fbb6a7` + entrypoint DEV | `1075/1075` | `@136` | Pull `ALT00010` đã xác nhận Activity liên kết và idempotency; bulk/catchup/rotation đã có test offline; `fbmSyncStartActivityBulk` trả `OK`, request đầu `authorize`, state `scan=activity_bulk`; `fbmInstallScheduler` trả `OK` | Ba lớp quét Activity nền đã có cursor state/DocumentProperties |
| Slice 4 — Đối soát + conflict |  |  |  |  |  |
| Slice 5 — Push Customer | `5d74fd4` | `1175/1175` | `@200` | GAS DEV `fbmSyncStatus` đọc `ALT00010` thành công; preflight/relay probe PASS | Customer create mất phản hồi dò MST contains, verify exact + hash, vá ID/baseline và không phát lại request ghi |
| Slice 6 — Push Activity | `e9ba3f1`, `01688d6`, `cd94601`, `b6d8b43`, `1a67029`, `c1ca43d`, `b9a989e`, `c49bc6c`, `284b5b9` | `1119/1119` | `@174` | Đã bắt được phiên treo: GAS ghi `gas_returned` nhưng callback Sidebar không serialize được Date trong memvars; builder sửa ngày Sheet sang `/Date(ms)/`, cập nhật `datetime0`, tách `fileticket` OldValue/NewValue và OldValue thiếu theo fixture | Callback Activity Edit có trace `entered/returned/failed`; trace hop độc lập nối GAS/Sidebar/Extension/FBM; quá 15 giây Sidebar tự kết luận timeout và không tự gửi lại lệnh ghi |
| Slice 7 — Scheduler + nền | `7a324ee`, `43233a5`, `0d46258`, `ba46b23`, `36d6f8f`, `9923fac`, `119cea6` | `1078/1078` | `@137` | GAS DEV `fbmSyncHeartbeat` và `fbmSyncStatus` trả `OK`; không phát request ghi | Handoff heartbeat giới hạn 10 request đọc mỗi lượt; relay kèm Spreadsheet ID; Sidebar gửi config khi mở; không chạm FBM khi thiếu config; bridge cũ sau Reload được thử lại có kiểm soát; state active quá hạn được thu hồi |
| Slice 8 — UI + log + probe | `e243432`, `3e60e88`, `e4c92c1`, `52c3fa9`, `81c4c58`, `778eed1`, `54056ef` | `1196/1196` | `@217` (`fbmGetMasterSwitch` trả `OK`, `enabled: true`) | UI shell năm màn hình, menu dọc phù hợp Sidebar hẹp, popup dùng chung cho search/dropdown/customer picker/menu, hộp menu nổi dưới header, pill `ON/OFF` nhỏ, tiêu đề đổi theo màn hình, form liên kết nhập tay, pipeline chỉ hiện khi phiên chạy, tab kết quả và phân trang đã hoàn tất; bố cục động dùng Block/schema và renderer chung; chưa nghiệm thu probe trên Sidebar | Cần chủ dự án đóng/mở lại Sidebar để tải deployment mới và kiểm tra hiển thị thực tế |
| Slice 9 — Live acceptance + production |  |  |  |  |  |
