# Checklist phiên đồng bộ FBM

Đây là checklist duy nhất của phiên đồng bộ FBM/ShinCRM. Công việc được thực hiện theo thứ tự từ trên xuống dưới; trong một slice, các mục độc lập có thể làm song song. Chỉ mục có nhãn **Cần kiểm chứng thực tế** mới cần chủ dự án giữ tab FBM, đăng nhập, bật ghi thật hoặc kiểm tra dữ liệu live. Live test chỉ được chạm `ALT00010`, tuyệt đối không gửi request xóa và không đưa `note` nội bộ ShinCRM lên FBM.

## Quy ước tiến độ

- `[x]` chỉ đánh dấu khi có bằng chứng tương ứng: code, test offline, GAS DEV hoặc kiểm chứng thực tế.
- `[ ]` là việc còn thiếu; mục không có nhãn **Cần kiểm chứng thực tế** là việc AI tự tiếp tục được.
- Một slice chỉ đóng sau khi đủ code, test, log/báo cáo và checklist case của slice đó.
- Sau khi đóng slice, ghi commit và revision GAS vào bảng bằng chứng cuối file.
- Bộ kiểm offline gần nhất đạt `954/954`; phần đọc `ALT00010` và một Activity đã từng kiểm chứng, chiều ghi chưa có kết quả thành công được xác nhận.

## Slice 0 — Nền tảng, ranh giới và an toàn

### Kiến trúc và dữ liệu nhạy cảm

- [x] GAS giữ nghiệp vụ, cursor, hash, conflict và quyết định; Extension chỉ tìm tab FBM, gọi `fetch` và trả response thô; Sidebar chỉ khởi chạy và hiển thị.
- [x] Mỗi lượt GAS–Extension trao đổi một request hoàn chỉnh; chuỗi nhiều bước nằm trong `DocumentProperties`, không nằm trong Extension.
- [x] `fetch` FBM chạy trong content script của tab `fbo.com.vn`, dùng IP, cookie và `Referer` của tab.
- [x] Cờ ghi thật mặc định tắt; Đọc thử không ghi Sheet và không ghi FBM.
- [x] Không có builder, endpoint hoặc action xóa FBM; test offline chặn mọi đường Delete.
- [x] `note` Customer là ghi chú nội bộ ShinCRM và không xuất hiện trong memvars gửi FBM.
- [x] Giới hạn live mặc định là `FBM_SYNC_TEST_CUSTOMER_CODE=ALT00010` ở đường đọc và đường chọn ứng viên push.
- [x] Bản ghi mã `TMP-` bị loại khỏi mọi kỳ quét ở cả hai chiều.
- [ ] Mỗi lát chỉ có một lời gọi cửa ghi và một khóa tài liệu; pull hiện còn có thể ghi nội dung và trạng thái thành hai lượt.
- [x] `CategorySync.js` đi qua tầng ghi lõi thay vì tự gọi `getRange/setValues`.
- [ ] `ScriptProperties` chỉ giữ khóa Web App; cờ ghi, giới hạn test và cấu hình phải chuyển về nơi đúng vòng đời.

### Extension, transport và khóa

- [x] Extension có host permission `https://fbo.com.vn:8888/*`, content script FBM, service worker và cơ chế nạp lại executor.
- [x] Đã kiểm chứng đường Sidebar → Extension → tab FBM → Sidebar nhận response thật.
- [x] Executor báo phiên bản `21.7`; reload Extension có thể phục hồi đầu nhận.
- [x] Request authorized Customer dùng `viewPage:false`, `authorized:null`, `values:[]` và ba vars đúng hợp đồng.
- [x] Request authorized Activity dùng controller riêng và hai vars đúng hợp đồng.
- [x] Đã kiểm chứng thực tế việc nhận được authorized Customer và Activity của phiên FBM đang mở.
- [x] Cookie payload và `userId` lấy từ tab/response, không tự đăng nhập bằng mật khẩu.
- [x] HTTP status, body lỗi, `Bugs` và lỗi parse được chuyển thành lỗi có cấu trúc; log không ghi cookie/payload.
- [x] Mất content script được ping rồi tiêm lại trước request nghiệp vụ.
- [x] Không tìm thấy tab, mất đầu nhận và timeout được báo rõ trên Sidebar.
- [x] Body chứa `Login.aspx` được nhận là hết phiên kể cả HTTP 200.
- [x] Retry transport được tách khỏi retry nghiệp vụ; lỗi nghiệp vụ chỉ thử lại khi `hSHIN` đổi.
- [x] Khôi phục cursor đọc còn hạn sau khi Sidebar, Chrome hoặc GAS gián đoạn; request ghi dở không tự phát lại.
- [ ] Giữ khoảng nghỉ và trần request phù hợp FBM, không dồn quá 60 request/phút.
- [ ] Web App `doPost` xác thực khóa và Extension thực sự điều phối qua Web App.

### Metadata, chuẩn hóa và trạng thái

- [x] Trang đầu controller dùng `type:0` và `AliasName`; trang sau dùng `type:1` với metadata đã lưu.
- [x] Cursor Customer và Activity dùng composite key theo tài liệu nghiên cứu.
- [x] Metadata thiếu, trùng hoặc đổi trường thì fail-closed.
- [x] Đã map các trường Customer: tên, MST, liên hệ, địa chỉ, điện thoại, email, website, tỉnh, nguồn và sản phẩm.
- [x] `product/ma_sp` được chuẩn hóa vào fingerprint Customer và loại khỏi Activity.
- [x] `owner` Activity không tham gia fingerprint và được đọc để kiểm quyền sửa.
- [x] Fingerprint chuẩn hóa xuống dòng, trim, danh mục, ngày Việt Nam, placeholder 1899/1999, Date lỗi và dấu `#SC-`.
- [x] Placeholder `1999`/`0` chỉ là rỗng ở field phù hợp; Activity `id=0` không làm đổi fingerprint.
- [x] Fingerprint đã có test không đổi, một phía đổi và conflict hai phía.
- [x] Lệch `stt_rec_kh/ma_kh` phải lấy định danh FBM riêng, không coi là ShinCRM đổi.
- [x] `@CUS_SYNC_TT/@ACT_SYNC_TT` có đủ 11 trạng thái, gồm `chưa đẩy` và `đẩy không ăn`.
- [x] Có lệnh tính lại baseline khi người dùng đổi tập field hoặc luật chuẩn hóa.

## Slice 1 — Preflight phiên FBM và danh mục

### Preflight

- [x] Tìm tab FBM, ping executor, fetch trong tab và nhận response thô.
- [x] Khi mất executor, inject rồi ping lại; request nghiệp vụ chỉ gửi một lần.
- [x] 401/403 hoặc `Login.aspx` dừng kỳ và yêu cầu đăng nhập lại, không tự login.
- [x] Lấy authorized Customer rồi Activity; thiếu token thì dừng trước CRUD.
- [ ] Kiểm owner mặc định FBM khớp `FBM_ACCOUNT_NAME`; sai thì dừng chiều push.
- [ ] Xác nhận Config có `FBM_ACCOUNT_NAME`, `FBM_MA_KH_PREFIX`, `FBM_MA_KH_LENGTH`, `FBM_ACTIVITY_SINCE` và không khai trùng.

### Danh mục

- [x] Đọc động bốn nguồn `crProvinceCity`, `crLeadSource`, `crJob`, `crdmsp`, không hardcode mã FBM.
- [x] Builder `GetCompletionList` và parser cặp mã/tên đã có; companion dùng dấu `#` đúng quan hệ.
- [x] Lookup vào Category theo kiểu chỉ bổ sung, không xóa mã cũ.
- [x] Fixture `FBM-*` được thay bằng mã thật khi có lookup live.
- [x] Cổng Category không nhận nhầm `@CAT_NHOM_KH_FBM` là companion giả.
- [x] Category lệch chỉ chặn record dùng đúng mã lỗi; record khác vẫn pull.
- [x] Lookup lỗi vẫn cho pull nhưng khóa toàn bộ chiều push của kỳ.
- [x] Mã lạ từ FBM chặn ghi record và ghi lý do để bổ sung Category.
- [x] Log danh mục nêu nguồn, mã, tên trên Sheet và tên FBM hiện tại.
- [ ] **Cần kiểm chứng thực tế:** đẩy bản sửa Category và `Probe.js` lên GAS, đọc đủ bốn lookup và kiểm tra Sheet `Category` đã xóa trắng.
- [ ] **Cần kiểm chứng thực tế:** kiểm mã trùng tên, ví dụ hai mã Cao Bằng, phải giữ đúng dấu `#` ở cả hai chiều.

### Đóng slice

- [ ] Code, test offline, log và GAS DEV của preflight/category hoàn tất.
- [ ] **Cần kiểm chứng thực tế:** xác nhận phiên, owner và Category trên tab FBM.

## Slice 2 — Pull Customer FBM → ShinCRM

### Đọc và ghi Customer

- [x] Đọc thử đã preview đúng `ALT00010 · Test` mà không ghi hai hệ.
- [x] Luồng đọc thủ công tạo state, thực thi từng request qua Extension, trả preview và kết thúc mà không ghi hai hệ.
- [x] Customer FBM chưa có `FBM_ID` được tạo dòng mới, cấp mã nội bộ, lưu ID/mã FBM, nội dung và baseline trong một khóa.
- [x] Customer đã tồn tại ở FBM và ShinCRM nhưng chưa liên kết được nhận diện bằng MST chuẩn hóa; nếu chỉ có một dòng ShinCRM khớp thì nối vào dòng đó, nếu MST trùng nhiều dòng hoặc đã liên kết thì fail-closed, không tạo Customer trùng.
- [x] Bản ghi pull có đủ `id`, `@CUS_FBM_ID`, `@CUS_MA_KH_FBM`, nội dung, baseline và trạng thái.
- [x] Pull giữ `note`, `verifyStatus`, `allowFbmPush` và trường chỉ thuộc ShinCRM.
- [ ] Bản ghi mới đặt đúng mã nội bộ, ngày tạo, `active`, khóa cha và quyền push.
- [x] Sau pull đánh dấu dirty đúng mã để Sidebar nạp lại.
- [ ] `FBM_ACTIVITY_SINCE` loại lịch sử cũ mà không làm sai baseline hoặc missing.

### Đối soát Customer

- [x] Ba hash bằng nhau → không ghi nội dung, đánh dấu đã đồng bộ.
- [x] Baseline rỗng hoặc tự lành → chỉ cập nhật baseline.
- [x] Chỉ FBM đổi → pull nội dung và baseline, giữ trường nội bộ.
- [x] Chỉ ShinCRM đổi → không pull đè, chuyển ứng viên push nếu được phép.
- [x] Hai phía đổi → conflict, khóa, log, không ghi nội dung/baseline.
- [x] Customer vắng khỏi grid → `không thấy bên FBM`, không xóa và không đổi baseline.
- [x] Tombstone local có FBM ID không bị kéo lại thành dòng mới.
- [ ] Customer ngừng đồng bộ loại cả Customer và Activity con khỏi hai chiều.
- [x] Record đang được người dùng sửa được hoãn; missing scan bỏ qua và giữ nguyên bản nháp.

### Đóng slice

- [ ] Test offline phủ đủ bảng hash, missing, tombstone và bảo toàn trường nội bộ.
- [ ] Log có từng record, hướng FBM → ShinCRM, trạng thái trước/sau và lý do bỏ qua.
- [ ] **Cần kiểm chứng thực tế:** pull `ALT00010`, xác nhận các cột định danh, baseline, trạng thái và `customerId` Activity là mã nội bộ.
- [ ] **Cần kiểm chứng thực tế:** chạy pull lần hai, không tạo Customer/Activity trùng và không tăng conflict.

## Slice 3 — Pull Activity FBM → ShinCRM

### Activity và marker

- [x] Request Activity theo `externalKey stt_rec` nối đúng Customer nội bộ.
- [x] Activity mới không marker tạo dòng ShinCRM, cấp mã nội bộ, lưu FBM ID và baseline.
- [x] Marker trỏ dòng đang đẩy thì vá ID, không tạo trùng.
- [ ] Marker trỏ dòng đã có FBM ID khác thì khóa và báo xử lý.
- [x] Marker mồ côi chỉ log, không tạo lại.
- [x] Activity thiếu hoặc placeholder `workDate` bị chặn và log, không tự điền ngày.
- [x] Hash Activity dùng cùng luật ba chiều như Customer.
- [ ] Activity vắng trong bulk chỉ mang trạng thái không thấy bên FBM, không suy hard-delete.

### Ba lớp quét

- [ ] Bulk 8 giờ lấy grid Activity, lọc theo tập ID đã biết và trả danh sách ID vắng.
- [ ] `ngay_gd` mới hơn max Activity đã có ID thì quét externalKey riêng Customer đó.
- [ ] Vòng xoay quét 30 Customer tiếp theo để bắt Activity tạo lùi ngày.
- [ ] Ba lớp có cursor bền vững và không bị hạ thành tùy chọn.

### Đóng slice

- [ ] Test offline phủ marker, missing, ngày lỗi, bulk và ba lớp phát hiện.
- [ ] Log có Customer cha, Activity ID, hướng đọc và lý do bỏ qua/khôi phục.
- [ ] **Cần kiểm chứng thực tế:** pull Activity của `ALT00010`, xác nhận `customerId` nội bộ và không tạo dòng trùng khi chạy lại.

## Slice 4 — Đối soát, khóa, conflict và phục hồi

- [x] So ba chiều phân biệt không đổi, chỉ ShinCRM đổi, chỉ FBM đổi và hai phía đổi.
- [x] Conflict lưu trạng thái, khóa record, log diff và không ghi baseline.
- [ ] `syncStatusSlot` hiển thị diff Customer/Activity mới lấy từ FBM.
- [x] Nút giải quyết hỗ trợ theo FBM, theo ShinCRM hoặc trộn tay; lấy `hFBM` đúng lúc bấm.
- [x] Form Sidebar khóa user khi mở, nhả khi đóng và kiểm khóa sync trước Save.
- [x] Pull/push hoãn record có khóa user và giữ nguyên bản nháp.
- [ ] Khóa sync làm form chỉ xem, chặn Save và luôn được nhả sau khi xong/lỗi.
- [x] Record có `FBM_ID` chỉ được xóa mềm; không có đường gửi Delete FBM.
- [ ] HTTP 500/401/403/Login.aspx giữ cursor hợp lệ và thử lại ở kỳ sau.
- [ ] Bugs HTTP 200 gắn lỗi nghiệp vụ vào record và chỉ thử lại khi dữ liệu local đổi.
- [ ] Ghi báo thành công nhưng FBM không đổi → `đẩy không ăn`, khóa record, không lặp vô hạn.
- [ ] Extension reload/service worker ngủ → state GAS không mất và pipeline đi tiếp đúng bước.
- [ ] **Cần kiểm chứng thực tế:** mở conflict, xem diff và thử một cách giải quyết.
- [ ] **Cần kiểm chứng thực tế:** sửa dở form trong lúc sync, xác nhận record bị hoãn và bản nháp không mất.

### Đóng slice

- [ ] Code, test offline, log diff và UI conflict hoàn tất.
- [ ] Bằng chứng phục hồi sau timeout, reload và lỗi nghiệp vụ đã có.

## Slice 5 — Push Customer ShinCRM → FBM

### Cổng và builder

- [x] Phải đồng thời chọn Ghi thật và bật `FBM_SYNC_ALLOW_WRITES`; thiếu một thì không phát request ghi.
- [x] Có cổng `allowFbmPush`, Category, record lock và cấu hình bắt buộc.
- [x] Chế độ Ghi thật vẫn dừng trước request khi cờ hệ thống tắt.
- [x] Khi đang có phiên hoạt động, lần bấm Đồng bộ ngay thứ hai không tạo phiên song song.
- [x] Dừng đồng bộ xóa cursor kỳ, nhả khóa sync, giữ khóa form user và không gửi Delete.
- [ ] Kiểm owner mặc định FBM với `FBM_ACCOUNT_NAME` trước toàn bộ chiều push.
- [ ] Kiểm đủ bảy field bắt buộc và mọi trần độ dài trước khi dựng request.
- [ ] Customer mới chưa Cho phép chỉ pull, không push.
- [x] Customer thiếu field hoặc vượt trần không phát request, ghi trạng thái và lý do.
- [x] Builder Customer New mở form lấy `_ma_kh_auto` rồi gửi request `New` đúng fixture.
- [x] Builder Customer Edit mở form lấy OldValue rồi gửi `Edit` đúng tập field.
- [x] Parser Row 64 ô hỗ trợ Row mảng/object và fallback FieldValues/InternalValues.
- [ ] Create mất phản hồi tra MST contains, verify exact, vá ID và không create lần hai.
- [ ] Create có Bugs đặt `đẩy lỗi`, nhả khóa và không retry khi `hSHIN` chưa đổi.
- [ ] Edit chờ kỳ pull xác nhận; không đổi là `đẩy không ăn`, giá trị thứ ba là conflict.
- [x] Sau response thành công, record chuyển sang `đã đẩy chờ xác nhận` và giữ baseline cũ cho kỳ pull sau.
- [x] Nếu kỳ xác nhận thấy FBM không đổi, record chuyển sang `đẩy không ăn`, bị khóa và không tự gửi lại.
- [x] Builder không gửi `ghi_chu`; không dùng `note` nội bộ ShinCRM.

### Đóng slice

- [ ] Test offline phủ cổng, OldValue, độ dài, Bugs, retry và không ghi chú nội bộ.
- [ ] Log có request kind, record, hướng, hash và kết quả đã che bí mật.
- [ ] **Cần kiểm chứng thực tế:** sửa một field an toàn của `ALT00010`, pull xác nhận rồi khôi phục giá trị gốc.
- [ ] **Cần kiểm chứng thực tế:** kiểm lỗi nghiệp vụ trùng/sai MST hoặc điện thoại.
- [ ] Customer create chỉ kiểm chứng thực tế nếu chủ dự án cho phép một Customer thử mới; FBM tự cấp mã khác `ALT00010`.

## Slice 6 — Push Activity ShinCRM → FBM

- [x] Builder Activity New gửi `ma_kh/stt_rec` Customer cha và marker `#SC-<mã ShinCRM>`.
- [x] Fingerprint cắt marker trước khi so.
- [ ] Customer cha chưa Cho phép, Ngừng đồng bộ hoặc thiếu FBM ID/mã thì không push Activity.
- [ ] Activity mới đủ khóa/ngày/danh mục → New, lưu FBM ID và chờ xác nhận.
- [ ] Create mất phản hồi giữ `đang đẩy`, không retry; pull dùng marker để vá hoặc báo trùng.
- [x] Builder Activity Edit mở form lấy OldValue đúng fixture.
- [x] Parser Row 45 ô giữ `end_time`, lấy `_ticket` từ Showing thành `fileticket`, hỗ trợ Row null và fallback.
- [x] Cổng owner Activity edit đã có sau bước mở form.
- [ ] Edit sai owner chỉ lỗi record đó, không sửa owner FBM và không chặn record khác.
- [ ] Kỳ pull sau edit xác nhận baseline, `đẩy không ăn` hoặc conflict.
- [ ] **Cần kiểm chứng thực tế:** tạo đúng một Activity thử dưới `ALT00010`, marker cố định và không tạo trùng khi pull lại.
- [ ] **Cần kiểm chứng thực tế:** sửa Activity thử, xác nhận owner, ticket, OldValue và baseline.
- [ ] **Cần kiểm chứng thực tế:** mô phỏng mất phản hồi một lần và kiểm marker recovery.

## Slice 7 — Heartbeat, scheduler và chạy nền

- [x] Extension có alarm heartbeat 5 phút, đọc `count:1`, không login và không write.
- [ ] Heartbeat nộp kết quả cho GAS, cập nhật lần sống cuối và kích full Customer khi tổng số đổi.
- [ ] Kỳ Customer 60 phút kéo full grid qua nhiều lát, lưu cursor từng lát.
- [ ] Kỳ Activity 8 giờ chạy bulk ID, lớp `ngay_gd` và vòng xoay 30 Customer.
- [ ] Scheduler không tạo hai kỳ, không giữ công việc trong RAM và tiếp tục từ lát đã chốt.
- [ ] Web App dùng khóa theo spreadsheet để tiếp tục khi Sidebar đóng.
- [ ] Mở lại Sidebar chỉ đọc state hiện có, không tạo kỳ thứ hai.
- [ ] Nạp lần đầu Sheet trống theo thứ tự Category → Customer → Activity → baseline, không nhân bản.
- [ ] Lệnh tính lại baseline không phát request write FBM.
- [ ] **Cần kiểm chứng thực tế:** bắt đầu kỳ, đóng Sidebar, chờ Web App/Extension và mở lại xem state/log.
- [ ] **Cần kiểm chứng thực tế:** reload hoặc để service worker ngủ rồi xác nhận kỳ tiếp tục.

## Slice 8 — Sidebar, log và probe nghiệm thu

- [x] Có màn hình đồng bộ độc lập, không hủy phiên khi quay lại, hiển thị phase, hướng, thực thể, session, counters, tiến trình và preview giới hạn.
- [x] Khi chưa chạy chỉ hiện `Đồng bộ ngay`; khi chạy chỉ hiện `Dừng đồng bộ`.
- [x] Icon menu phản ánh trạng thái; tự động có thể báo đang phát triển.
- [x] Đã thấy tiến trình request, lỗi transport và kết quả đọc trên màn hình.
- [x] GAS ghi log phase/lỗi nguồn `fbm_sync`, không ghi cookie/payload.
- [ ] Có dòng tổng kết mỗi kỳ và dòng chi tiết cho lỗi, conflict, hoãn, mã lạ và đẩy không ăn.
- [ ] Màn hình có danh sách record kéo/đẩy/lỗi/conflict, không bắt người dùng đọc JSON trong Log.
- [ ] Có lệnh `Nghiệm thu ALT00010` chạy preflight, lookup, pull, field/hash/link, idempotency và ghi báo cáo PASS/FAIL vào Log; không push FBM.
- [ ] Báo cáo che cookie/authorized nhưng giữ record ID, phase, request kind và hash trước/sau.
- [ ] `fbmProbeAltState` fail-closed nếu phát hiện candidate ngoài `ALT00010` và Activity con.
- [ ] **Cần kiểm chứng thực tế:** chạy probe một nút và kiểm tra báo cáo trên Sidebar/Log.

## Slice 9 — Live acceptance và mở rộng production

- [ ] **Cần kiểm chứng thực tế:** chạy đủ lượt Đọc thử `ALT00010`, đối chiếu số dòng, field, hash, liên kết và idempotency.
- [ ] **Cần kiểm chứng thực tế:** chạy Customer edit, Activity create/edit và xác nhận lại sau pull.
- [ ] **Cần kiểm chứng thực tế:** kiểm conflict, khóa form, mất tab/phiên và phục hồi.
- [ ] **Cần kiểm chứng thực tế:** kiểm lỗi transport/HTTP và xác nhận không gửi write mù.
- [ ] Chốt bằng fixture offline các case không thể live: Customer vắng, Activity hard-delete/vắng, owner mismatch không phát sinh, marker mồ côi.
- [ ] Không chạy Delete để dọn Activity thử; giữ marker nhận diện rõ dữ liệu nghiệm thu.
- [ ] Chỉ sau khi toàn bộ live acceptance đạt mới gỡ giới hạn `ALT00010`.
- [ ] Chỉ sau khi được duyệt mới nạp khoảng 1.700 Customer và Activity, đo payload/thời gian và chốt baseline.
- [ ] Trước production: xóa `server/dev/`, deployment DEV và tệp cấu hình thử; tắt chia sẻ bằng liên kết, `LOG_TRACE` và cửa ghi thử.
- [ ] Cập nhật cây thư mục, revision GAS, phiên bản Extension, commit tài liệu bàn giao và merge branch đồng bộ.

## Bằng chứng các slice

| Slice | Commit code | Test/offline | Revision GAS | Bằng chứng thực tế | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Slice 0 — Nền tảng |  |  |  |  |  |
| Slice 1 — Preflight + Category |  |  |  |  |  |
| Slice 2 — Pull Customer |  |  |  |  |  |
| Slice 3 — Pull Activity |  |  |  |  |  |
| Slice 4 — Đối soát + conflict |  |  |  |  |  |
| Slice 5 — Push Customer |  |  |  |  |  |
| Slice 6 — Push Activity |  |  |  |  |  |
| Slice 7 — Scheduler + nền |  |  |  |  |  |
| Slice 8 — UI + log + probe |  |  |  |  |  |
| Slice 9 — Live acceptance + production |  |  |  |  |  |
