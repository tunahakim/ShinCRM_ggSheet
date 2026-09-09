# Checklist phiên đồng bộ FBM

Tệp này là bảng điều khiển duy nhất của phiên đồng bộ FBM/ShinCRM. Nguồn chuẩn là tài liệu 09, hợp đồng 09A và bộ `0_Documentation/Nghiên cứu FBM/`. Live test chỉ được chạm khách `ALT00010`, không gửi request xóa FBM và không đưa ghi chú nội bộ ShinCRM lên FBM. Cập nhật lần cuối 09/09/2026.

## Cách đọc dấu tích

- `[x]` chỉ có nghĩa là mục đó đã đạt đúng mức bằng chứng ghi trong dòng: code, test offline hoặc live test.
- `[ ]` nghĩa là còn thiếu code, thiếu kiểm thử phù hợp hoặc chưa có bằng chứng live; có builder không đồng nghĩa pipeline đã dùng được.
- Bộ kiểm offline hiện đạt `942/942`; live test đã đọc đúng `ALT00010` và một Activity, nhưng chưa có request ghi FBM nào được xác nhận thành công.
- Lần chạy Ghi thật gần nhất đã ghi được một bản ghi pull vào ShinCRM rồi tạm dừng trước chiều push vì cổng danh mục nhận nhầm `@CAT_NHOM_KH_FBM`. Bản sửa đã có ở local, chưa được đẩy lên GAS và chưa live test lại.

## A. Tất cả điều kiện để đồng bộ hoạt động thành công

### A1. Ranh giới và an toàn

- [x] GAS giữ toàn bộ nghiệp vụ, cursor, hash và quyết định; Extension chỉ vận chuyển request/response thô; Sidebar chỉ khởi chạy và hiển thị.
- [x] Mỗi lượt GAS–Extension trao đổi đúng một request; chuỗi tạo/sửa nhiều bước nằm trong `DocumentProperties`, không nằm trong Extension.
- [x] `fetch` FBM chạy trong content script của tab `fbo.com.vn`, nên dùng đúng IP Việt Nam, cookie và `Referer` của tab.
- [x] Cờ ghi thật mặc định tắt; chế độ Đọc thử không ghi Sheet và không ghi FBM.
- [x] Không có builder, endpoint hoặc action xóa FBM; test offline canh ràng buộc này.
- [x] `note` của Customer là ghi chú nội bộ ShinCRM và không xuất hiện trong memvars Customer gửi FBM.
- [x] Có giới hạn live test mặc định `FBM_SYNC_TEST_CUSTOMER_CODE=ALT00010` ở đường đọc Customer và đường chọn ứng viên push.
- [x] Loại bản ghi mang mã `TMP-` khỏi mọi kỳ quét ở cả hai chiều; đã có cổng fail-closed và kiểm offline.
- [ ] Mọi lát chỉ dùng đúng một lời gọi cửa ghi và một khóa tài liệu; đường pull hiện có thể gọi riêng lượt ghi nội dung và lượt ghi trạng thái.
- [ ] Module không mở/ghi sheet thô; `CategorySync.js` hiện vẫn tự gọi `getRange/setValues` thay vì đi qua tầng ghi lõi.
- [ ] `ScriptProperties` chỉ giữ khóa Web App như hợp đồng 09A; code tạm hiện còn dùng nơi này cho cờ ghi, giới hạn test và fallback cấu hình.

### A2. Môi trường chạy và triển khai

- [x] Extension repo có host permission `https://fbo.com.vn:8888/*`, content script FBM, service worker và cơ chế tự nạp lại executor khi mất đầu nhận.
- [x] Live test đã chứng minh Sidebar → Extension → tab FBM → Sidebar đọc được response thật.
- [x] Extension đang dùng có executor báo phiên bản `21.7`; ca reload Extension rồi tự phục hồi đầu nhận đã được kiểm.
- [ ] Đẩy bản sửa cổng Category và `Probe.js` lên GAS bằng `--push`, rồi ghi revision mới vào checklist.
- [ ] Tải lại Extension lần cuối sau khi toàn bộ code Extension của phiên đã chốt.
- [ ] Trước mỗi live test, tab `zccrAccount.aspx` phải đang mở, đăng nhập đúng tài khoản và không có lần login mới từ thiết bị khác.
- [ ] Xác nhận `Config` có đúng `FBM_ACCOUNT_NAME`, `FBM_MA_KH_PREFIX`, `FBM_MA_KH_LENGTH`, `FBM_ACTIVITY_SINCE` và không khai trùng.
- [ ] Xác nhận `FBM_ACCOUNT_NAME` khớp owner mặc định mà form FBM thật trả về, không chỉ kiểm nó khác rỗng.
- [ ] Tạo khóa dùng chung, Web App URL và cấu hình Extension theo từng spreadsheet để đồng bộ chạy khi Sidebar đóng.
- [ ] Cài scheduler thật và kiểm tra không tạo trigger trùng.
- [ ] Trước khi đưa dữ liệu thật vào: tắt `LOG_TRACE`, tắt chia sẻ bằng liên kết, xóa `server/dev/`, tệp `.dev-runner.json` và deployment DEV theo checklist Giai đoạn 1.

### A3. Phiên FBM, transport và phục hồi

- [x] Request lấy `authorized` Customer dùng `viewPage:false`, `authorized:null`, `values:[]` và đúng ba `vars`.
- [x] Request lấy `authorized` Activity dùng controller riêng và đúng hai `vars`.
- [x] Live test đã nhận được cả `authorized` Customer và Activity của phiên đang mở.
- [x] Cookie payload và `userId` được lấy từ tab/response transport, không tự login bằng tài khoản mật khẩu.
- [x] HTTP status, body lỗi, `Bugs` và lỗi parse được chuyển thành lỗi có cấu trúc; lỗi transport được ghi vào `Log` mà không ghi cookie/payload.
- [x] Mất content script sau reload được thử ping rồi tiêm lại trước khi gửi request nghiệp vụ.
- [x] Không tìm thấy tab, mất đầu nhận và timeout được báo rõ trên màn hình thay vì dừng im lặng.
- [x] Nhận diện body HTML chứa `Login.aspx` là hết phiên ngay cả khi HTTP 200; đã có kiểm thử response HTTP 200 trả trang đăng nhập.
- [ ] Phân biệt retry lỗi vận chuyển với không retry lỗi nghiệp vụ cho tới khi `hSHIN` đổi; code hiện có thể chọn lại bản ghi `đẩy lỗi` ở kỳ sau.
- [ ] Khôi phục được mọi cursor giữa kỳ sau khi Sidebar/Chrome/GAS gián đoạn; hiện mới tự phục hồi chắc ở bước authorize Customer ban đầu.
- [ ] Giữ khoảng nghỉ và trần request phù hợp FBM, tránh gửi dồn quá 60 request/phút trong luồng tự động.
- [ ] Web App `doPost` xác thực khóa và Extension thật sự là bên gọi; hiện có `doPost` nhưng Extension chưa điều phối qua Web App.

### A4. Metadata, trường và chuẩn hóa

- [x] Trang đầu mỗi controller dùng `type:0`, lấy `ViewPage.Fields[].AliasName`; trang sau dùng `type:1`.
- [x] Có cursor phân trang Customer và Activity theo composite key của tài liệu nghiên cứu.
- [x] Nếu metadata thiếu, trùng hoặc đổi trường thì fail-closed và báo lỗi; trang đầu phải cung cấp AliasName, trang sau dùng metadata đã lưu.
- [ ] Live test trang tiếp theo với dữ liệu vượt `count`, gồm ca `TotalRowCount` thay đổi trong lúc quét.
- [x] Tập trường Customer đã map hai chiều cho tên, MST, người liên hệ, địa chỉ, điện thoại, email, website, tỉnh, nguồn và sản phẩm ở builder/record adapter.
- [x] Thêm `product/ma_sp` vào fingerprint Customer; mã sản phẩm được đổi về không gian mã FBM trước khi băm.
- [x] Loại `product/ma_sp` khỏi builder và cổng danh mục Activity; Activity chỉ đồng bộ `taskType`, `content`, `workDate` theo tài liệu 09.
- [x] `owner` Activity không nằm trong fingerprint và đã được đọc từ grid/mở form để kiểm quyền sửa.
- [ ] Giữ `owner` đủ lâu để hiện trong diff và log của đúng bản ghi; UI/log chi tiết hiện chưa có.
- [ ] Hoàn chỉnh đúng bảy phép chuẩn hóa fingerprint: hiện đã có xuống dòng, trim hai đầu, mã danh mục, ngày Việt Nam, placeholder 1899/1999 và cắt dấu `#SC-`; còn phải chốt riêng luật số 0/rỗng theo từng field.
- [ ] Bổ sung ca placeholder năm 1999 và số `0` chỉ đại diện rỗng ở đúng field FBM; hàm hiện mới xử lý ngày tới năm 1900.
- [x] Fingerprint không dùng `normalizeText`; test đã phủ không đổi, đổi ShinCRM, đổi FBM và conflict hai phía.
- [ ] Lệch hai định danh Customer phải lấy định danh FBM xuống mà không coi là ShinCRM đổi; code chưa có nhánh riêng.
- [x] Tập trạng thái `@CUS_SYNC_TT/@ACT_SYNC_TT` có đủ 11 giá trị của tài liệu, gồm `chưa đẩy` và `đẩy không ăn`.
- [ ] Có công cụ tính lại baseline do người dùng chủ động bấm khi tập field hoặc luật chuẩn hóa thay đổi.

### A5. Danh mục động

- [x] Bốn nguồn duy nhất được lấy động: tỉnh `crProvinceCity`, nguồn khách `crLeadSource`, công việc `crJob`, sản phẩm `crdmsp`; không hardcode mã FBM từ tài liệu.
- [x] Có builder `GetCompletionList`, parser cặp mã/tên, luật companion và dấu `#` cho quan hệ một-nhiều/nhiều-một.
- [x] Có đường nhập lookup vào `Category` theo kiểu chỉ bổ sung, không xóa mã cũ và thay fixture `FBM-*` bằng mã thật.
- [x] Đã sửa offline việc nhận nhầm `@CAT_NHOM_KH_FBM` là companion dù cột không tồn tại; test `914/914` xanh.
- [ ] Đẩy bản sửa Category lên GAS và live test bốn lookup được ghi đúng vào sheet `Category` đã xóa trắng.
- [x] Mã/tên Category lệch chỉ chặn những bản ghi dùng đúng mục đó; block theo mã được giữ trong `categoryGate`.
- [x] Lookup không gọi được bỏ chiều push nhưng vẫn cho pull; state ghi rõ lý do và tiếp tục grid Customer.
- [x] Mã lạ từ FBM chặn ghi bản ghi pull; người dùng bổ sung Category rồi chạy lại.
- [ ] Live test mã trùng tên như hai mã Cao Bằng chọn đúng dấu `#` ở chiều push và nhận cả hai mã ở chiều pull.
- [ ] Log danh mục phải nêu nguồn, mã, tên trên Sheet và tên FBM hiện tại đủ để người dùng sửa.

### A6. Pull FBM → ShinCRM

- [x] Live Đọc thử đã preview đúng Customer `ALT00010 · Test` và một Activity `Gọi điện chăm sóc` mà không ghi hai hệ.
- [ ] Xác minh bản ghi Customer đã pull thật có đủ `id` ShinCRM, `@CUS_FBM_ID`, `@CUS_MA_KH_FBM`, nội dung, baseline và trạng thái đúng.
- [x] Truyền khóa Customer cha vào Activity lấy theo `externalKey`; record giữ `customerFbmCode` từ context cha và nối đúng `Customer.id` khi có dữ liệu cục bộ.
- [ ] Live pull Activity vào sheet và xác nhận `customerId` là mã Customer nội bộ, không phải số dòng hoặc mã FBM.
- [ ] Pull lại lần hai không tạo Customer/Activity trùng, không tăng conflict và tự cập nhật baseline nếu hai bên bằng nhau.
- [ ] Pull bản ghi đã có chỉ ghi khi FBM đổi; nếu ShinCRM đổi thì để chờ push, nếu hai bên đổi thì đóng băng conflict.
- [ ] Pull giữ nguyên `note`, `verifyStatus`, `allowFbmPush` và các trường chỉ thuộc ShinCRM trên dòng đã có.
- [ ] Pull bản ghi mới đặt đúng mặc định lõi: mã nội bộ, ngày tạo, `active`, khóa cha; `allowFbmPush` của bản ghi vốn có trên FBM phải cho phép sửa ngược theo tài liệu 09.
- [ ] Pull hoạt động thiếu/placeholder `workDate` phải chặn và log; tuyệt đối không tự điền ngày hiện tại.
- [ ] Áp `FBM_ACTIVITY_SINCE` để bỏ lịch sử trước mốc mà không làm sai baseline hoặc phát hiện vắng mặt.
- [ ] Sau pull, đánh dấu dirty đúng mã để Sidebar nạp lại ở lần tương tác kế tiếp.
- [ ] Nếu form người dùng đang mở đúng record thì hoãn pull record đó hoặc bảo toàn bản nháp theo hợp đồng đã chốt; code hiện chỉ kiểm khóa trước push.
- [ ] Đối soát record có `FBM_ID` nhưng vắng khỏi FBM thành `không thấy bên FBM`, không chạm `recordStatus` và không cập nhật baseline.
- [ ] Dòng `deleted` có `FBM_ID` tiếp tục được đọc làm tombstone để không kéo lại thành dòng mới.

### A7. Push ShinCRM → FBM

- [x] Có hai cổng rõ ràng: chọn chế độ Ghi thật và bật `FBM_SYNC_ALLOW_WRITES`; thiếu một trong hai thì không phát request ghi.
- [x] Có cổng `allowFbmPush` theo từng record và cổng kế thừa từ Customer xuống Activity.
- [x] Có cổng danh mục, cổng record lock và cổng cấu hình không rỗng trước khi dựng request ghi.
- [ ] Cổng đầu kỳ phải so owner mặc định FBM với `FBM_ACCOUNT_NAME`; code hiện chỉ kiểm tên cấu hình khác rỗng.
- [ ] Kiểm đủ điều kiện tạo Customer theo đúng bảy trường bắt buộc FBM và báo từng trường thiếu.
- [ ] Kiểm khóa liên kết Activity có Customer cha, `stt_rec`, `ma_kh` và `workDate` trước cửa ghi.
- [ ] Kiểm mọi trần độ dài trước push; `details` phải trừ chỗ cho dấu ` #SC-<mã activity>`.
- [ ] Chỉ chọn lại record `đẩy lỗi` khi `hSHIN` đã đổi; lỗi cũ không được spam FBM mỗi kỳ.
- [ ] Sau FBM báo thành công, đặt `đã đẩy chờ xác nhận`, để baseline rỗng/giữ baseline cũ và chỉ xác nhận ở kỳ pull sau.
- [ ] Nếu kỳ xác nhận thấy FBM không đổi thì đặt `đẩy không ăn`, khóa record và không tự gửi lại.

### A8. Customer create/edit

- [x] Builder tạo Customer thực hiện mở form lấy `_ma_kh_auto` rồi gửi `New`; request khớp fixture nghiên cứu ở mức offline.
- [x] Có cổng kiểm tiền tố và độ dài mã tự sinh trước bước lưu Customer mới.
- [x] Builder không gửi `ghi_chu`; các memvar không đồng bộ lấy giá trị form cũ hoặc mặc định phù hợp.
- [ ] Live test Customer create chưa thể làm khi ràng buộc tuyệt đối chỉ dùng mã đã tồn tại `ALT00010`; FBM sẽ tự cấp một mã khách khác.
- [ ] Khi mất phản hồi sau create, tra MST bằng filter contains, verify exact rồi vá `stt_rec_kh/ma_kh`, không tạo lại; code chưa có pipeline phục hồi này.
- [x] Có builder mở form Customer và builder tạo request `Edit` khi được truyền OldValue có tên ở mức offline.
- [x] Parse `Row` 64 ô của response mở form Customer thành OldValue theo đúng tên memvar; code hỗ trợ Row mảng/object và fallback FieldValues/InternalValues.
- [ ] Live sửa một trường an toàn của `ALT00010`, đọc xác nhận, kiểm baseline và khôi phục giá trị ban đầu.
- [ ] Live lỗi nghiệp vụ trùng/sai MST hoặc điện thoại: nhận `Bugs`, đặt `đẩy lỗi`, không làm mất khóa và không retry cho tới khi dữ liệu đổi.

### A9. Activity create/edit

- [x] Builder tạo Activity gửi thẳng `New`, mang `ma_kh/stt_rec` của Customer cha và gắn dấu ` #SC-<mã ShinCRM>`.
- [x] Fingerprint cắt dấu `#SC-` trước khi so để hai bên không xung đột vĩnh viễn.
- [ ] Live tạo một Activity thử thuộc `ALT00010`, nhận `id` FBM, rồi pull xác nhận không tạo dòng trùng.
- [ ] Phủ bốn nhánh marker khi gặp ID FBM lạ: vá dòng `đang đẩy`, báo đẩy trùng, báo dòng local đã mất, hoặc tạo dòng mới nếu không có marker.
- [ ] Mất phản hồi Activity create phải giữ `đang đẩy` và không tự retry; code hiện chưa có pipeline phục hồi theo marker.
- [x] Có builder mở form Activity và builder tạo request `Edit` khi được truyền OldValue có tên ở mức offline.
- [x] Parse `Row` 45 ô thành OldValue, giữ `end_time`, và trích `_ticket` từ script `Showing` vào `fileticket`; parser nhận cả Row null, FieldValues/InternalValues và Showing dạng chuỗi/object.
- [x] Cổng owner cho Activity edit đã có trong code sau bước mở form.
- [ ] Live sửa Activity của `ALT00010`, xác nhận file ticket không mất, owner đúng và kỳ pull sau chốt baseline.
- [ ] Owner khác tài khoản phải đặt `đẩy lỗi` riêng record và không chặn các record khác.

### A10. Conflict, khóa và xóa/vắng mặt

- [x] Hàm so ba chiều đã phân biệt hai bên bằng nhau, chỉ ShinCRM đổi, chỉ FBM đổi và cả hai đổi.
- [ ] Conflict phải lưu trạng thái, khóa record, log diff và không ghi baseline; hiện mới có trạng thái, chưa có pipeline trình bày/quyết.
- [ ] `syncStatusSlot` hiển thị diff Customer/Activity tính mới từ FBM lúc người dùng mở record.
- [ ] Nút `Đã quyết xung đột` lấy `hFBM` mới đúng lúc bấm, ghi ngoại lệ baseline và mở khóa; hỗ trợ lấy FBM, giữ ShinCRM hoặc trộn tay.
- [x] Form Sidebar gọi khóa user khi mở, nhả khi đóng và kiểm khóa sync trước Save; test offline đã phủ.
- [ ] Pull và push đều phải hoãn record có khóa user, giữ nguyên bản nháp và tiếp tục record khác.
- [x] `beforeHardDelete` buộc record có `FBM_ID` chỉ được xóa mềm; hook đã được module đồng bộ triển khai.
- [x] Không có đường tự gửi Delete lên FBM.
- [ ] Khách/Activity vắng khỏi kết quả quét chỉ mang trạng thái `không thấy bên FBM`; tuyệt đối không suy ra xóa.
- [ ] `Ngừng đồng bộ` loại Customer và toàn bộ Activity con khỏi cả pull lẫn push; code hiện mới chặn push.

### A11. Sidebar, log và quan sát

- [x] Có màn hình đồng bộ độc lập, quay lại không chủ động hủy phiên, có phase, hướng, thực thể, session, counters, tiến trình và preview giới hạn.
- [x] Khi chưa chạy chỉ hiện `Đồng bộ ngay`; khi đang chạy chỉ hiện `Dừng đồng bộ`.
- [x] Icon menu phản ánh trạng thái đồng bộ; mục tự động có thể hiện là đang phát triển nhưng chưa cho bật.
- [x] Live test đã thấy tiến trình request, lỗi transport và kết quả đọc trong màn hình đồng bộ.
- [x] GAS ghi log phase/lỗi nguồn `fbm_sync`; live test đã có log khi `LOG_TRACE=all`, không ghi cookie/payload.
- [ ] Có một dòng tổng kết mỗi kỳ và dòng chi tiết cho từng lỗi, conflict, hoãn, mã danh mục lạ và đẩy không ăn; log hiện chủ yếu ghi khi đổi phase.
- [ ] Màn hình có danh sách record đã kéo/đẩy/lỗi/conflict đủ để kiểm mà không phải đọc JSON trong sheet Log.
- [ ] Đóng Sidebar không làm dừng kỳ; Extension tiếp tục qua Web App và mở lại Sidebar thấy đúng state.
- [ ] Công tắc đồng bộ tự động hoạt động thật; hiện chỉ được phép báo `Đang phát triển`.

### A12. Nhịp tự động và phát hiện thay đổi

- [x] Extension có alarm heartbeat 5 phút và request đọc `count:1`; không tự login và không gửi write từ alarm.
- [ ] Heartbeat phải nộp kết quả cho GAS, cập nhật lần sống cuối và kích quét Customer khi tổng số thay đổi; hiện response heartbeat bị bỏ.
- [ ] Kỳ Customer 60 phút kéo full grid, không dùng `ngay_gd/datetime0` làm incremental.
- [ ] Lớp Activity 1 mỗi 8 giờ kéo bulk, Extension lọc theo tập ID Activity đã biết trước khi trả về GAS.
- [ ] Lớp Activity 2 dùng `ngay_gd > max(workDate)` của các Activity đã có `@ACT_FBM_ID` để quét riêng Customer nghi phát sinh mới.
- [ ] Lớp Activity 3 quét xoay 30 Customer mỗi kỳ để bắt Activity tạo lùi ngày.
- [ ] Ba lớp Activity lưu cursor bền vững, không lớp nào bị hạ thành tùy chọn.
- [ ] Scheduler không tạo hai kỳ song song, không giữ công việc trong RAM qua alarm và tiếp tục từ lát cuối đã chốt.
- [ ] Nghiệm thu chạy khi Sidebar đóng và sau khi service worker bị Chrome dừng/đánh thức lại.

### A13. Kiểm thử, nạp lần đầu và bàn giao

- [x] Bộ test offline hiện đạt `942/942`, gồm protocol, `Bugs`, builder, category, hash, lock, bridge, parent Activity, parser OldValue/ticket, trạng thái sync, hook chống xóa cứng và retry đọc có giới hạn; không có request xóa.
- [x] Live test Đọc thử `ALT00010` đã xác thực Customer/Activity và preview đúng một khách, một giao dịch ngày 09/09/2026.
- [ ] Bổ sung test cho các khoảng trống còn lại: bảy normalize đầy đủ, lookup fail-open pull, missing, marker recovery đầy đủ, retry policy và scheduler.
- [ ] Chạy `fbmProbeAltState --push` để biết chính xác record/candidate nào sẽ bị ghi trước live test tiếp theo.
- [ ] Hoàn thành bộ live test tối thiểu ở Phần C và đính bằng chứng vào từng case.
- [ ] Nạp lần đầu khoảng 1.700 Customer và Activity từ `FBM_ACTIVITY_SINCE` theo lát, đo payload/thời gian và chốt baseline toàn bộ.
- [ ] Gỡ giới hạn `ALT00010` chỉ sau khi live test được duyệt; chạy kỳ thật đầu tiên có giám sát và đối chiếu log.
- [ ] Cập nhật cây thư mục, checklist, revision GAS, phiên bản Extension và commit tách chủ đề trước bàn giao.

## B. Tất cả pipeline và use case

### B1. Điều phối phiên

- [x] `P01 Đọc thủ công`: Sidebar bấm Đồng bộ ngay → GAS tạo state → Extension thực thi từng request → GAS preview → hoàn tất, không ghi hai hệ; đã live với `ALT00010`.
- [ ] `P02 Ghi hai chiều thủ công`: preflight → lookup → pull trước → push Customer trước → push Activity sau → chờ kỳ sau xác nhận; live mới tới cổng Category.
- [x] `P03 Chặn ghi`: chọn Ghi thật nhưng cờ hệ thống tắt → dừng trước request FBM ghi và báo rõ.
- [x] `P04 Chặn chạy song song`: đang có kỳ hoạt động → lần Start thứ hai không tạo kỳ mới.
- [x] `P05 Dừng thủ công`: Dừng đồng bộ → xóa cursor kỳ, nhả khóa sync, giữ khóa form user và không gửi Delete.
- [ ] `P06 Tiếp tục sau gián đoạn`: Sidebar/worker/GAS chết giữa bất kỳ cursor nào → đọc state và tiếp tục đúng request kế, không chạy lại việc đã chốt.
- [ ] `P07 Chạy nền`: alarm Extension → gọi Web App → nộp response trước và nhận request sau → chạy tiếp dù Sidebar đóng.

### B2. Preflight và danh mục

- [x] `P10 Tab hợp lệ`: tìm tab FBM → ping executor → fetch trong tab → nhận response thô.
- [x] `P11 Mất executor`: ping lỗi → inject executor → ping lại → chỉ gửi request nghiệp vụ một lần.
- [x] `P12 Hết phiên`: HTTP 401/403 hoặc body `Login.aspx` → dừng kỳ, log và yêu cầu người dùng đăng nhập lại; không tự login.
- [x] `P13 Authorized`: lấy riêng Customer rồi Activity; thiếu một token thì dừng trước CRUD.
- [ ] `P14 Cổng tài khoản`: mở form đầu kỳ → owner mặc định khác `FBM_ACCOUNT_NAME` → dừng toàn bộ chiều push.
- [ ] `P15 Lookup thành công`: lấy bốn danh mục → nhập add-only vào Category → đối soát mã/tên → cho phép các record hợp lệ đi tiếp.
- [ ] `P16 Lookup lỗi`: không lấy được một danh mục → vẫn pull dữ liệu, bỏ toàn bộ push của kỳ.
- [x] `P17 Mã/tên Category lỗi`: chỉ record dùng mục lỗi bị chặn và log; record khác tiếp tục.
- [x] `P18 Mã FBM lạ chiều pull`: không ghi record đó, đặt lý do có mã/tên để người dùng bổ sung Category rồi chạy lại.

### B3. Customer FBM → ShinCRM

- [ ] `P20 Customer mới`: FBM có, ShinCRM chưa có `FBM_ID` → tạo dòng mới, cấp mã ShinCRM, chép ID/mã FBM, nội dung và baseline trong một khóa.
- [ ] `P21 Customer không đổi`: `hFBM == hSHIN == hBASE` → không ghi nội dung, trạng thái đã đồng bộ.
- [ ] `P22 Baseline tự lành`: `hFBM == hSHIN != hBASE` hoặc baseline rỗng → chỉ cập nhật baseline.
- [ ] `P23 Chỉ FBM đổi`: `hSHIN == hBASE`, `hFBM != hBASE` → pull nội dung và baseline cùng lượt, giữ trường nội bộ.
- [ ] `P24 Chỉ ShinCRM đổi`: `hFBM == hBASE`, `hSHIN != hBASE` → không pull đè, chuyển ứng viên push nếu được phép.
- [ ] `P25 Hai phía đổi`: cả ba hash khác nhau → conflict, khóa, log, không ghi nội dung/baseline.
- [ ] `P26 Định danh lệch`: `stt_rec_kh/ma_kh` lệch → FBM thắng riêng phần định danh, không coi là ShinCRM đổi.
- [ ] `P27 Customer vắng`: local active có FBM_ID nhưng không thấy trong grid → trạng thái không thấy bên FBM, không xóa/không baseline.
- [ ] `P28 Customer tombstone`: local deleted có FBM_ID → giữ dòng làm bia mộ; FBM còn thì báo, FBM vắng thì coi đã khớp.
- [ ] `P29 Ngừng đồng bộ`: Customer mang hằng ngừng → loại cả Customer và Activity con khỏi hai chiều.

### B4. Activity FBM → ShinCRM và ba lớp phát hiện

- [x] `P30 Activity theo Customer`: request externalKey `stt_rec` → gắn khóa cha vào mỗi row → nối đúng Customer.id nội bộ.
- [ ] `P31 Activity mới không marker`: tạo dòng ShinCRM mới, cấp mã nội bộ, lưu FBM ID và baseline.
- [ ] `P32 Marker khôi phục`: Activity FBM lạ có marker trỏ dòng đang đẩy → vá FBM ID vào dòng đó, không tạo trùng.
- [ ] `P33 Marker trùng`: marker trỏ dòng đã có FBM ID khác → đóng băng và báo người dùng tự xử lý trên FBM.
- [ ] `P34 Marker mồ côi`: marker không trỏ dòng ShinCRM nào → log và không tạo lại.
- [ ] `P35 Activity thiếu ngày`: end_date rỗng/placeholder → chặn record và log.
- [ ] `P36 Activity không đổi/chỉ một phía đổi/conflict`: áp cùng bảng hash ba chiều như Customer.
- [ ] `P37 Activity vắng trong bulk`: đặt không thấy bên FBM, không xóa mềm và không suy hard-delete.
- [ ] `P38 Bulk 8 giờ`: lấy toàn bộ grid Activity, Extension chỉ trả row có ID đã biết và danh sách ID không thấy.
- [ ] `P39 ngay_gd`: Customer có ngày mới hơn max Activity đã có FBM ID → quét externalKey riêng Customer đó.
- [ ] `P40 Vòng xoay`: mỗi kỳ quét 30 Customer tiếp theo để bắt Activity mới tạo lùi ngày.

### B5. Customer ShinCRM → FBM

- [ ] `P50 Customer mới chưa cho phép`: FBM_ID rỗng nhưng allow khác Cho phép → chỉ pull, không push.
- [ ] `P51 Customer mới đủ điều kiện`: cho phép + đủ bảy field + Category hợp lệ → mở New lấy mã → kiểm prefix/length → lưu → ghi ID/mã/trạng thái, baseline rỗng.
- [x] `P52 Customer mới thiếu điều kiện`: thiếu field hoặc vượt trần → không request ghi, trạng thái không đủ điều kiện và log lý do.
- [ ] `P53 Customer create mất phản hồi`: giữ đang đẩy → kỳ sau tra MST contains rồi verify exact → vá ID nếu đã tạo; không create lần hai.
- [ ] `P54 Customer create Bugs`: đặt đẩy lỗi, nhả khóa, không retry tới khi hSHIN đổi.
- [ ] `P55 Customer edit`: mở form lấy OldValue → thay đúng tập field đồng bộ → gửi Edit → trạng thái chờ xác nhận.
- [ ] `P56 Customer edit xác nhận`: kỳ pull sau bằng nhau → ghi baseline/đã đồng bộ; FBM không đổi → đẩy không ăn; giá trị thứ ba → conflict.
- [ ] `P57 Ghi chú nội bộ`: Customer edit/create luôn gửi `ghi_chu` rỗng/giữ FBM theo quyết định riêng, tuyệt đối không dùng `note` ShinCRM.

### B6. Activity ShinCRM → FBM

- [ ] `P60 Activity bị cổng cha chặn`: Customer cha chưa Cho phép, Ngừng đồng bộ hoặc thiếu FBM ID/mã → không push Activity.
- [ ] `P61 Activity mới`: đủ khóa/ngày/danh mục → gắn marker → gửi New một bước → lưu FBM ID và chờ xác nhận.
- [ ] `P62 Activity create mất phản hồi`: giữ đang đẩy, không retry; pull dùng marker để vá hoặc báo trùng.
- [ ] `P63 Activity edit đúng owner`: mở form → giữ OldValue/end_time/ticket → kiểm owner → gửi Edit → chờ xác nhận.
- [ ] `P64 Activity edit sai owner`: chỉ record đó đẩy lỗi, record khác tiếp tục; không sửa owner FBM.
- [ ] `P65 Activity edit xác nhận`: kỳ pull sau chốt baseline, phát hiện đẩy không ăn hoặc conflict giống Customer.

### B7. Xung đột, người dùng đang sửa và lỗi

- [ ] `P70 Mở diff`: record conflict → lấy FBM mới qua Extension → hiển thị từng field FBM/ShinCRM cùng owner Activity.
- [ ] `P71 Quyết theo FBM`: người sửa Sheet bằng giá trị FBM → bấm Đã quyết → lấy hFBM mới → baseline mới → không push.
- [ ] `P72 Quyết theo ShinCRM`: không sửa Sheet → bấm Đã quyết → baseline bằng FBM hiện tại → kỳ sau push ShinCRM.
- [ ] `P73 Trộn tay`: sửa Sheet thành giá trị thứ ba → bấm Đã quyết → kỳ sau push giá trị trộn.
- [ ] `P74 Form đang sửa`: khóa user tồn tại → sync hoãn đúng record, các record khác chạy; bản nháp không đổi.
- [ ] `P75 Sync đang ghi`: khóa sync tồn tại → form chỉ xem/Save bị chặn; xong hoặc lỗi đều nhả khóa.
- [x] `P76 Mất tab/đầu nhận/timeout`: kỳ lỗi có thông báo và log, không gửi lại write mù.
- [ ] `P77 HTTP 500/401/403/Login.aspx`: phân loại transport, giữ cursor hợp lệ và thử lại ở kỳ sau.
- [ ] `P78 Bugs HTTP 200`: phân loại nghiệp vụ, gắn record lỗi và chỉ thử lại sau khi dữ liệu local đổi.
- [ ] `P79 Response ghi thành công nhưng FBM bỏ thay đổi`: kỳ xác nhận đặt đẩy không ăn, không lặp write vô hạn.
- [ ] `P80 Extension reload/service worker ngủ`: tự phục hồi content script, state GAS không mất và pipeline đi tiếp đúng bước.

### B8. Lịch nền, nạp lần đầu và bảo trì baseline

- [ ] `P90 Heartbeat bình thường`: mỗi 5 phút đọc một Customer, nộp kết quả cho GAS, cập nhật phiên còn sống và không mở kỳ thừa nếu tổng số không đổi.
- [ ] `P91 Heartbeat thấy tổng Customer đổi`: kích kỳ full Customer sớm, nhưng không dùng tổng số để kết luận record nào đã sửa.
- [ ] `P92 Kỳ Customer 60 phút`: kéo full Customer qua nhiều lát, pull trước, push sau và lưu cursor sau từng lát.
- [ ] `P93 Kỳ Activity 8 giờ`: chạy bulk ID đã biết, lớp `ngay_gd` và vòng xoay 30 Customer theo cursor riêng.
- [ ] `P94 Sidebar đóng`: Extension gọi Web App bằng khóa theo spreadsheet; mở lại Sidebar chỉ đọc state đang có, không khởi động kỳ thứ hai.
- [ ] `P95 Nạp lần đầu`: Sheet trống → nhập bốn Category → kéo Customer → kéo Activity từ `FBM_ACTIVITY_SINCE` → ghi baseline → chạy lại không nhân bản.
- [ ] `P96 Tính lại baseline`: khi đổi tập field/normalize, người dùng bấm lệnh một lần → tính lại theo luật mới → ghi log và không phát request write FBM.
- [ ] `P97 Gỡ giới hạn test`: chỉ sau nghiệm thu `ALT00010`, xóa giá trị `FBM_SYNC_TEST_CUSTOMER_CODE` → chạy kỳ production đầu có giám sát → giữ giới hạn request và log tổng kết.

## C. Bộ live test tối thiểu với ALT00010

### C1. Lượt tự động an toàn, mục tiêu một nút

- [ ] Tạo lệnh `Nghiệm thu ALT00010` chạy preflight, bốn lookup, pull Customer/Activity, kiểm field/hash/liên kết, chạy lại idempotency và xuất báo cáo case vào `Log`; lệnh này không push FBM.
- [ ] Báo cáo phải liệt kê từng case `PASS/FAIL`, record ID, phase, request kind, hash trước/sau và tuyệt đối che cookie/authorized.
- [ ] Trước khi chạy, `fbmProbeAltState` phải cho thấy chỉ Customer `ALT00010` và Activity con của nó; nếu có candidate ngoài phạm vi thì fail-closed.

### C2. Lượt ghi thật có kiểm soát

- [ ] Customer edit: lưu giá trị gốc của một field an toàn, đẩy một marker thử, pull xác nhận rồi khôi phục đúng giá trị gốc bằng cùng pipeline.
- [ ] Activity create: tạo đúng một Activity thử dưới `ALT00010`, có marker cố định để lần chạy lại nhận ra và không tạo thêm.
- [ ] Activity edit: sửa Activity thử vừa tạo, kiểm owner/ticket/OldValue, pull xác nhận baseline.
- [ ] Mô phỏng mất phản hồi đúng một lần ở Activity thử để kiểm marker recovery mà không tạo record thứ hai.
- [ ] Không có bước dọn bằng Delete; Activity thử được giữ lại với nội dung nhận diện rõ là dữ liệu nghiệm thu.

### C3. Lượt cần người dùng thao tác

- [ ] Conflict: người dùng đổi một field ở FBM và một giá trị khác ở ShinCRM trên record thử, chạy sync, xem diff rồi thử một trong ba cách quyết.
- [ ] Form lock: người dùng mở form và sửa dở trong lúc chạy sync, xác nhận record bị hoãn và bản nháp không mất.
- [ ] Mất tab/phiên: đóng tab hoặc đăng xuất, chạy một lát, xác nhận lỗi; mở/đăng nhập lại và tiếp tục.
- [ ] Chạy nền: bắt đầu kỳ, đóng Sidebar, chờ Extension/Web App hoàn tất rồi mở lại xem state/log.

### C4. Case không thể live chỉ với ALT00010 hoặc bị cấm

- [ ] Customer create không thể live với mã `ALT00010` đã tồn tại vì FBM tự cấp mã mới; muốn kiểm thật phải cho phép một Customer thử mới hoặc chấp nhận chỉ kiểm builder/fixture offline.
- [ ] Customer vắng do chuyển giao/xóa không nên tạo live vì sẽ đổi quyền hoặc xóa dữ liệu; phủ bằng test offline và chỉ quan sát nếu vận hành thật phát sinh.
- [ ] Activity hard-delete/vắng không được tạo live vì quy tắc cấm xóa; phủ bằng fixture offline.
- [ ] Owner mismatch chỉ live được nếu `ALT00010` có Activity của owner khác; nếu không thì phủ bằng fixture offline, không đổi owner FBM.
- [ ] Bulk Activity 8 giờ buộc FBM trả grid toàn công ty trước khi Extension lọc ID; không thể gọi nó là live test chỉ chạm `ALT00010`, nên chỉ chạy khi chủ dự án duyệt kỳ production đầu tiên.
- [ ] Nạp 1.700 Customer không thuộc giới hạn ALT00010; thực hiện sau khi bộ test hẹp đạt và chủ dự án gỡ cổng test.

## D. Thứ tự hoàn tất phiên

- [ ] Sửa các vi phạm hợp đồng đã audit ở A4–A10 và bổ sung test rủi ro cao tương ứng.
- [ ] Hoàn thiện Web App/scheduler/ba lớp Activity để Sidebar đóng vẫn chạy.
- [ ] Đẩy GAS, tải Extension, chạy probe và lượt C1.
- [ ] Chạy C2 trên `ALT00010`, đọc báo cáo và sửa cho tới khi toàn bộ case tự động đạt.
- [ ] Chạy C3 với thao tác tối thiểu của chủ dự án.
- [ ] Chốt ngoại lệ Customer create và bulk Activity ở C4.
- [ ] Gỡ cổng test, chạy nạp lần đầu và kỳ production có giám sát.
- [ ] Tắt toàn bộ cửa DEV/bí mật/log trace, commit tài liệu bàn giao và merge branch đồng bộ sau nghiệm thu.
