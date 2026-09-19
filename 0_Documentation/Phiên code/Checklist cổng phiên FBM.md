# Checklist cổng phiên FBM

Phiên: Đưa tự đăng nhập FBM vào mọi luồng qua một cổng duy nhất.

Phạm vi phiên này không bao gồm `Checklist rà soát đồng bộ FBM trước vận hành thật.md`; tuyệt đối không sửa hoặc tick file đó. Checklist này chỉ theo dõi cổng phát request FBM.

## Quy tắc đánh dấu

- `[x]` chỉ dùng khi ca đã được kiểm chứng đầy đủ bằng test tự động hoặc người dùng đã báo nghiệm thu thật.
- Một ca lỗi chỉ được tick khi đồng thời có thông báo dễ hiểu ở Sidebar và một dòng tương ứng trong Sheet `Log`.
- Không tick ca cần tab FBM, đăng nhập, bấm ghi thật hoặc kiểm tra dữ liệu live cho tới khi chủ dự án báo đã làm xong.
- Không ghi password, cookie, envelope, `authorized` hoặc payload nhạy cảm vào checklist, log, trace hay fixture.
- Sau mỗi mục đạt phải cập nhật checklist ngay trong cùng lượt làm việc.

## Tiến độ

- [x] Đọc tài liệu 09 liên quan và ghi khảo sát vào `Tạm nghiên cứu cổng phiên FBM.md`.
- [x] Xác định owner login, các đường phát request và các thiếu sót của ba nhánh phiên.
- [x] Chủ dự án duyệt Bước 1 và chốt sáu điều chỉnh: sửa `PullFlow.js`/`Scheduler.js` chỉ để gỡ login; bypass do cổng tự nhận biết; không có state no-tab ở GAS; cổng tự áp policy no-tab; sửa hai lỗi log im lặng; thu hẹp checklist.
- [x] Sửa checklist theo quyết định đã duyệt.
- [x] Bước 2: bổ sung phần thiếu và gỡ tham chiếu login khỏi flow.
- [x] Bước 3: viết/chạy test, quét mã nguồn và kiểm tra không lộ bí mật.
- [ ] Bước 4: nghiệm thu thao tác thật còn lại, cập nhật cây thư mục nếu cần và commit tiếng Việt có dấu.

## D. Hợp đồng login test qua cổng

Điều kiện đầu: Sidebar có Extension handshake; credential chỉ tồn tại dưới dạng envelope do Extension mã hóa.

| Mục | Input → output kỳ vọng | Cách kiểm | Trạng thái |
|---|---|---|---|
| D1 | Kiểm tra liên kết/nhận diện → request authorize/User đi qua cổng; Sidebar không tự dựng request FBM | Tự động | [x] |
| D2 | Login test → chỉ owner login xử lý; không lồng session gate vô hạn | Tự động | [x] |
| D3 | Login thành công → identity khớp binding; không ghi bí mật | Người dùng mở tab FBM và xác nhận identity thật | [ ] |
| D4 | Login thất bại → Sidebar báo lý do an toàn và Sheet `Log` có lỗi | Tự động | [x] |

## F. Cây quyết định session gate

### F0. Bất biến chung

- [x] Mọi request FBM do flow tạo đều đi qua cổng chung; flow không gọi, không nhắc và không biết login.
- [x] Cổng đọc session state sẵn có, không probe FBM trước mỗi lượt.
- [x] Cổng tự nhận biết request nội bộ do chính tiến trình login nó khởi động để không đệ quy; caller không truyền cờ bypass.
- [x] Cổng tự áp `openFbmContext` theo policy cho mọi request cần phát, không dựa trên danh sách loại request.

### F1. Session hợp lệ, không đổi hành vi

Điều kiện: `state.session.expired` không bật và extension có tab FBM.

- [x] Một luồng đọc cấp đúng request cũ qua cổng, giữ nguyên cursor/reservation và không gọi login/probe.
- [x] Một luồng ghi cấp đúng request cũ qua cổng, không đổi thứ tự/preflight và không gọi login/probe.
- [x] Regression gộp hai ca trên: khi phiên hợp lệ, output trước/sau cổng giống nhau ngoài metadata trace/reservation bắt buộc.

### F2. Có tab nhưng phiên hết hạn

Điều kiện: state đã đánh dấu hết hạn hoặc response được phân loại `SESSION_EXPIRED`.

- [x] Auto-login bật và đủ điều kiện → cổng khởi động đúng một tiến trình login, giữ cursor đọc cũ, login thành công rồi resume đúng một lần.
- [x] Hai luồng đồng thời → chỉ một tiến trình login; luồng còn lại nhận trạng thái đang xử lý, không cấp request song song.
- [x] Login thất bại → dừng hữu hạn, state lỗi/tạm dừng, Sidebar báo dễ hiểu và Sheet `Log` ghi một dòng an toàn.
- [x] Auto-login tắt/chưa cấu hình/throttle → fail-closed ngay tại cổng, không phát request nghiệp vụ và Sidebar + Sheet `Log` đều có lý do.
- [x] Request ghi nhận `SESSION_EXPIRED` → không tự gửi lại request ghi; giữ an toàn để người dùng xử lý.

### F3. Không có tab FBM

Điều kiện: Extension thi hành nhưng không tìm thấy tab; GAS không giữ state “có tab”.

- [x] Policy cho phép tự mở tab khi GAS yêu cầu → cổng trả chỉ dẫn `openFbmContext`, Extension mở đúng URL GAS cấp, rồi thử lại đúng một lần.
- [x] Policy tắt → cổng fail-closed, không phát request nghiệp vụ; Sidebar + Sheet `Log` ghi `FBM_TAB_NOT_FOUND` hoặc mã tương đương.
- [x] Tab mất giữa chừng → reservation được thu hồi an toàn, không retry mù request ghi, Sidebar + Sheet `Log` đều báo.

## G. Lỗi chắc chắn và cấm lỗi im lặng

| Mục | Input → output kỳ vọng | Cách kiểm | Trạng thái |
|---|---|---|---|
| G1 | FBM trả HTTP 401/shape hết phiên → `SESSION_EXPIRED`, đi qua F2, không nuốt lỗi | Tự động | [x] |
| G2 | Extension chưa kết nối hoặc bridge mất → state kết thúc hữu hạn, Sidebar báo và Sheet `Log` ghi | Tự động mô phỏng; người dùng kiểm Sidebar thật nếu cần | [x] |
| G3 | Không tìm thấy tab trước khi gửi → đi qua F3, không có request ngoài chỉ dẫn GAS | Tự động mô phỏng; mở tab thật cần người dùng | [x] |
| G4 | Mạng/relay timeout hoặc fetch ném lỗi → reservation/state xử lý hữu hạn, Sidebar báo và Sheet `Log` ghi, không retry vô hạn | Tự động mô phỏng | [x] |
| G5 | Login thất bại liên tiếp → retry đúng chu kỳ cấu hình, không loop; từng thất bại có Sidebar + Sheet `Log` | Tự động | [x] |
| G6 | Transport failure nền khi Sidebar đóng → vẫn có dòng Sheet `Log`; mở Sidebar lại thấy thông báo trạng thái | Tự động phần GAS; người dùng kiểm chứng Sidebar mở lại | [x] |
| G7 | Hai lỗi cùng message ở hai thời điểm → không dedupe làm mất dòng log lần sau | Tự động | [x] |
| G8 | Exception nội bộ cổng → fail-closed, thông báo an toàn ở Sidebar và Sheet `Log`, không lộ bí mật | Tự động | [x] |

## H. Quét kiến trúc bắt buộc

- [x] Chỉ cổng chung được gọi `FbmSync.protocol.request`; không có GAS path phát request FBM vòng ngoài cổng. Executor `fetch` là ngoại lệ thi hành bắt buộc.
- [x] Chỉ `AutoLogin.js` giữ thuật toán login và `TransportCore.js` làm cổng gọi owner; `PullFlow.js` và `Scheduler.js` không còn dòng nhắc login.
- [x] Bypass nội bộ chỉ do cổng nhận biết tiến trình login do chính cổng cấp, không có cờ caller để né cổng.
- [x] `openFbmContext` do policy cổng quyết định, không có danh sách loại request phải bảo trì thủ công.
- [x] Log/Trace/fixture không chứa password, cookie, envelope, `authorized` hoặc payload nhạy cảm.

## Việc người dùng cần làm sau khi test tự động đạt

- [ ] D3: mở Sidebar → phần kết nối tài khoản → giữ tab FBM thật đang đăng nhập → chạy “Đăng nhập thử” → đối chiếu đúng Spreadsheet ID, mã user, username và tên tài khoản đã liên kết; xác nhận không có mật khẩu/envelope trong thông báo hoặc Sheet `Log`.
- [ ] F3: bật chính sách “Cho phép tự mở tab FBM khi GAS yêu cầu”, đóng tab FBM, chạy một lượt đọc an toàn; xác nhận Extension chỉ mở URL do GAS cấp và chỉ thử lại một lần. Lặp lại khi tắt chính sách để xác nhận bị chặn, không có request nghiệp vụ đi tiếp.
- [ ] G6: đóng Sidebar nhưng để lịch nền hoạt động, tạo lỗi transport bằng cách đóng/mất tab FBM giữa lượt; mở Sidebar lại sau khi relay kết thúc, xác nhận trạng thái lỗi dễ hiểu và kiểm tra Sheet `Log` có đúng mã lỗi.
- [ ] Nếu được yêu cầu, chạy một ca ghi thật trên dữ liệu an toàn theo cờ an toàn hiện hành; không dùng request xóa.

## Tệp dự kiến sửa

- `1_ShinCRM_GAS/fbm_sync/transport/TransportCore.js`
- `1_ShinCRM_GAS/fbm_sync/auth/AutoLogin.js` chỉ khi cần adapter/hợp đồng, không viết lại thuật toán login.
- `1_ShinCRM_GAS/fbm_sync/transport/PullFlow.js` chỉ gỡ tham chiếu login.
- `1_ShinCRM_GAS/fbm_sync/state/Scheduler.js` chỉ gỡ tham chiếu login.
- `1_ShinCRM_GAS/client/sync/fbmSync.html`
- `2_ShinCRM_Extension/background/service_worker.js` nếu cần relay retry theo chỉ dẫn GAS.
- Các test hiện có trong `tests/cases/fbmSync/AutoLogin.js`, `Orchestration.js`, `Sidebar.js` và `tests/cases/extensionBridge.js`.
