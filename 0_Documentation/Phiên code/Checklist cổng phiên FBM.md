# Checklist cổng phiên FBM

Phiên: Nghiệm thu lại cổng phiên FBM theo ba tầng và ba bẫy kiến trúc.

Phạm vi phiên này không bao gồm `Checklist rà soát đồng bộ FBM trước vận hành thật.md`; tuyệt đối không sửa hoặc tick file đó. Checklist này là nơi duy nhất theo dõi nghiệm thu cổng phiên.

## Quy tắc đánh dấu

- `[x]` chỉ dùng khi ca đã được kiểm chứng đầy đủ bằng đúng tên test tự động hoặc người dùng đã báo nghiệm thu thật.
- Mỗi dòng chỉ có đúng một nhãn `[Tự động]` hoặc `[Cần kiểm chứng thật]`; nếu cần cả hai thì tách thành hai dòng.
- Một ca lỗi chỉ đạt khi Sidebar có thông báo dễ hiểu và Sheet `Log` có dòng tương ứng.
- Không ghi password, cookie, envelope, `authorized` hoặc payload nhạy cảm vào checklist, log, trace hay fixture.
- Sau mỗi mục đạt phải cập nhật checklist ngay trong cùng lượt làm việc.

## Tiến độ phiên

- [x] [Tự động] Scanner toàn repo chốt đúng một cửa cho `protocol.request`, fetch FBM và caller login; worker cũng chỉ có một điểm phát request; bằng chứng: `GAS chi co TransportCore goi protocol.request`; `toan bo Extension chi executor fetch toi FBM`; `worker chi co mot diem gui request FBM`; `kiến trúc một cửa: không có GAS caller nào phát builder login/authorize/User/heartbeat ngoài cổng`.
- [x] [Tự động] Ba tầng và ba nhánh được kiểm bằng hợp đồng phiên sống ba điều kiện (HTTP 200 + JSON parse được + khóa `d`) và fail-closed khi HTTP 500 không decode; bằng chứng: `hop dong phien song chi dat khi HTTP 200 JSON co khoa d`; `probe dau luot khong song moi duoc phep khoi dong mot login`; `FBM 401 chi probe lai va neu probe khong song thi dung, khong tu login tu loi nghiep vu`.
- [x] [Tự động] Ba bẫy đệ quy, chạy song song và thử lại vô hạn đã có test hồi quy; bằng chứng: `cổng khai báo nhóm request hệ thống và marker phiên trước khi phát request nghiệp vụ`; `hai luong phat hien mat session chi giu mot tien trinh login va luong sau cho`; `login heartbeat that bai tam dung va khong lap ngay`; `login that bai bi throttle toi da mot lan moi 30 phut khi den lich`.
- [x] [Tự động] `node tests/run.js` chạy xanh; bằng chứng bằng tên ca cụ thể: `session probe đầu lượt đọc User rồi trả lại cursor authorize`; `executor giu nguyen body HTTP 500 ky tu thay the cho GAS`; `executor dung tai Login khi FBM bao dang co phien khac, khong tu huy va khong mo trang tai khoan`.
- [ ] [Cần kiểm chứng thật] Người dùng đã kiểm tra các ca cần tab FBM thật, Sidebar đóng/mở lại và không ghi dữ liệu thật ngoài cờ an toàn đã bật.

## Tầng 1 — Cổng phiên FBM

- [x] [Tự động] Extension nhận cả hai dạng `chrome.tabs.create` callback và Promise; khi API callback trả tab vừa mở, cổng chờ tab sẵn sàng thay vì kết thúc im lặng; bằng chứng: `auto-open tuong thich Chrome tabs.create dang callback va khong dung im lang`.
- [x] [Tự động] Khi worker không có tab FBM, bridge nhận mã `FBM_TAB_NOT_FOUND` cụ thể để GAS chạy đúng chu kỳ retry hoặc kết thúc fail-closed; bằng chứng: `worker tra ma va bao ro no-tab thay vi bridge dung im lang`.
- [x] [Tự động] Khi GAS trả lỗi terminal không có request, Sidebar chuyển sang phase `error` và hiển thị mã lỗi thay vì dừng im lặng; bằng chứng: `Sidebar không kết thúc im lặng khi GAS trả lỗi không có request`.

- [x] [Tự động] Khi tab còn phiên hợp lệ, một lượt đọc cấp đúng một request nghiệp vụ, không khởi động login và giữ nguyên cursor/reservation; bằng chứng: `session hop le khong doi hanh vi ca doc va ghi`; `start chi tiep tuc cursor sau khi reservation cu da thu hoi`.
- [x] [Tự động] Khi tab còn phiên hợp lệ, một lượt ghi cấp đúng request theo thứ tự cũ và không gửi lại request ghi; bằng chứng: `session hop le khong doi hanh vi ca doc va ghi`; `request ghi khong duoc tu dong gui lai khi session het han`.
- [x] [Tự động] Cổng probe User ở đầu mỗi lượt và không suy luận hết phiên từ response rác; bằng chứng: `probe dau luot khong song moi duoc phep khoi dong mot login`; `FBM 401 chi probe lai va neu probe khong song thi dung, khong tu login tu loi nghiep vu`.
- [x] [Tự động] Probe đầu lượt phát trước mọi request nghiệp vụ kể cả `activity_bulk`, không dùng `session.cookie`/`identityVerified` của lượt trước; bằng chứng: `probe User khong mang authorized cu`; `moi luot moi probe lai User du khong con cookie cu`.
- [x] [Tự động] Mỗi lát relay nền probe User một lần ở đầu lát, trong cùng lát không probe lại; bằng chứng: `alarm dau moi lat relay phai probe User truoc khi tiep tuc cursor`; `probe dau lat dat thi moi cap lai cursor Customer dang do`.
- [x] [Tự động] Probe chỉ coi phiên sống khi đồng thời `status === 200`, body parse được thành JSON và JSON có khóa `d`; HTTP 500 + body không decode hoặc JSON thiếu `d` dừng fail-closed; bằng chứng: `hop dong phien song chi dat khi HTTP 200 JSON co khoa d`; `probe dau luot khong song moi duoc phep khoi dong mot login`.
- [x] [Tự động] Heartbeat không suy ra phiên sống/hết từ hình dạng heartbeat; bằng chứng: `heartbeat shape rong co reservation truoc khi phan loai` và `heartbeat khong co shape Customer khong duoc suy ra het phien tu heartbeat`.
- [x] [Tự động] Khi có tab nhưng phiên hết hạn và auto-login bị tắt, cổng dừng trước request nghiệp vụ, Sidebar và `Log` cùng ghi rõ mã lý do; bằng chứng: `cổng fail-closed khi tự đăng nhập tắt`.
- [x] [Tự động] Khi chưa có tab và chính sách tự mở tab bật, Extension chỉ mở URL do GAS cấp và chỉ thử lại request một lần; bằng chứng: `no-tab chi retry mot lan theo policy va co log loi`; `auto-open chi mo URL GAS cap va doi trang FBM tai xong`; `auto-open tiep tuc sau khi tab FBM ready va thao listener`.
- [x] [Tự động] Khi chưa có tab và chính sách tự mở tab tắt, không có request nghiệp vụ tới FBM, state kết thúc hữu hạn, Sidebar và `Log` cùng ghi `FBM_TAB_NOT_FOUND`; bằng chứng: `no-tab bi chan ngay khi policy tu mo tab tat`; `Sidebar nhận request retry no-tab do GAS cấp thay vì tự quyết policy`.
- [x] [Tự động] Khi tab mất giữa chừng, reservation được thu hồi, request ghi không tự gửi lại, Sidebar và `Log` đều báo lỗi; bằng chứng: `exception cong trong nhanh no-tab cung thu hoi reservation`; `loi bridge thu cong: GAS chi ghi nhan loi dung reservation, ket thuc ro rang va khong cap request moi`; `Lỗi mạng và lỗi bridge đều hiện Sidebar và gọi ghi Sheet Log`.
- [x] [Tự động] Extension trả nguyên trạng HTTP status/ok/body text; GAS phân loại ba điều kiện phiên sống, HTTP 500 body không decode fail-closed, 401/403 chỉ probe xác minh; bằng chứng: `executor giu nguyen body HTTP 500 ky tu thay the cho GAS`; `HTTP 401 va 403 chi la phien dang ngo, khong tu ket luan het phien`.
- [x] [Tự động] Request nghiệp vụ không tự kích hoạt login hoặc gửi lại khi response lỗi; fail-closed, báo Sidebar và ghi `Log`, kể cả response là ký tự rác; bằng chứng: `request ghi khong duoc tu dong gui lai khi session het han`; `loi mang transport ket thuc huu han va van ghi Log khi Sidebar dong`.
- [x] [Tự động] Lookup chạy được nhưng không có dòng là kết quả nghiệp vụ hợp lệ và đi tiếp; lookup lỗi transport/parse fail-closed; bằng chứng: `lookup loi transport hoac parse fail-closed khong tu dong di tiep`; `lookup thanh cong nhung khong co dong la ket qua hop le va di tiep`.

## Tầng 2 — Xác thực tài khoản

- [x] [Tự động] Sau mỗi login tự động thành công, hệ thống đọc grid `User` và so tuyệt đối Spreadsheet ID, mã user, username và tên đầy đủ trước khi cấp request tiếp theo; bằng chứng: `sau authorize GAS cap User grid de xac minh identity`; `chi identity khop moi tiep tuc heartbeat`; `dang nhap thu: Login thanh cong phai qua authorize va User grid khop binding moi duoc bao thanh cong`.
- [x] [Tự động] Mỗi lượt chạy mới probe User ở đầu lượt; bằng chứng: `moi luot moi probe lai User du khong con cookie cu`; `probe User khong mang authorized cu`.
- [x] [Tự động] Phiên chưa probe live trong run hiện tại bị coi là chưa đạt; marker/cookie run trước không cấp request nghiệp vụ; bằng chứng: `marker lệch session bị coi là chưa xác thực và chặn request nghiệp vụ`; `login resume chưa có marker phải quay lại probe User trước request nghiệp vụ`.
- [x] [Tự động] Sau login tự động, probe User không đạt kết thúc lỗi hữu hạn và không khởi động vòng login thứ hai; bằng chứng: `login heartbeat that bai tam dung va khong lap ngay`; `probe dau luot khong song moi duoc phep khoi dong mot login`.
- [x] [Tự động] Login thành công, bị chặn vì đang có phiên, và sai thông tin/lỗi khác là ba kết quả riêng; bị chặn không coi là sai mật khẩu và không bấm hủy phiên cũ; bằng chứng: `FBM chan vi con phien cu duoc tach khoi sai mat khau va khong tat auto-login`; `executor dung tai Login khi FBM bao dang co phien khac, khong tu huy va khong mo trang tai khoan`.
- [x] [Tự động] Khi bị chặn vì đang có phiên, mỗi vòng chờ probe trước rồi chỉ login khi probe xác nhận phiên chết; dùng `retryMinutes`, có trần số lần chờ; bằng chứng: `het chu ky cho thi probe truoc khi thu login lai`; `probe thay phien cu da song lai thi tiep tuc cursor khong login lai`; `probe xac nhan phien da chet moi cap login moi sau khi bi chan`; `bi chan qua tran cho thi dung va bao can nguoi dung xu ly`.
- [x] [Tự động] Máy không bao giờ tự bấm "Hủy phiên làm việc trước", kể cả từ "Đăng nhập thử"; bằng chứng: `executor dung tai Login khi FBM bao dang co phien khac, khong tu huy va khong mo trang tai khoan`; `FBM chan vi con phien cu duoc tach khoi sai mat khau va khong tat auto-login`.
- [x] [Tự động] Identity lệch hoặc thiếu bất kỳ định danh nào làm phiên fail-closed, không tự bật auto-login và không tự đổi binding; bằng chứng: `auto-login sai identity fail-closed va xoa marker phien`; `dang nhap thu sai identity: khong coi la thanh cong va khong thay binding`; `dang nhap thu sai identity fail-closed nhung khong tu tat auto-login`.
- [ ] [Cần kiểm chứng thật] Người dùng giữ tab FBM đúng tài khoản, chạy “Đăng nhập thử”, đối chiếu đủ bốn định danh và xác nhận thông báo/`Log` không có bí mật.

## Tầng 3 — Đối chiếu mã khách ShinCRM với FBM

- [x] [Tự động] Tầng cổng phiên và tầng xác thực tài khoản không gọi logic đối chiếu Customer; phép quét mã nguồn phát hiện mọi đường gọi xuyên tầng; bằng chứng: `tầng cổng và xác thực không gọi logic đối chiếu Customer của tầng 3`.
- [x] [Tự động] Luồng kiểm tra mã khách chỉ đọc Customer, trả tổng `n/N` và không ghi Sheet hoặc FBM; bằng chứng: `kiểm tra liên kết: chỉ quét Customer và trả tổng hợp n/N, không cấp Activity hoặc ghi binding`.

## Bẫy kiến trúc bắt buộc

- [x] [Tự động] Scanner toàn repo chốt `protocol.request`, fetch FBM và caller login/auto-login; request hệ thống vẫn do cổng tự phát mà không đệ quy; bằng chứng: `GAS chi co TransportCore goi protocol.request`; `toan bo Extension chi executor fetch toi FBM`; `cổng khai báo nhóm request hệ thống và marker phiên trước khi phát request nghiệp vụ`.
- [x] [Tự động] Hai luồng cùng phát hiện mất phiên chỉ có một tiến trình login; luồng còn lại chờ kết quả và tiếp tục hoặc nhận cùng lỗi, không phát request song song; bằng chứng: `hai luong phat hien mat session chi giu mot tien trinh login va luong sau cho`; `worker khong tao hai request FBM khi Sidebar thu lai cung id`.
- [x] [Tự động] Login thất bại dừng trong cùng lượt, lần sau chỉ được thử theo `retryMinutes`, không lặp vô hạn; bằng chứng: `login heartbeat that bai tam dung va khong lap ngay`; `login that bai khong tu chay khi chua den lich`; `login that bai bi throttle toi da mot lan moi 30 phut khi den lich`.
- [x] [Tự động] Scanner bắt fixture vi phạm và cây mã nguồn thật trả danh sách vi phạm rỗng; bằng chứng: `scanner bat fixture goi login ngoai cong`; `GAS chi co TransportCore goi protocol.request`; `toan bo Extension chi executor fetch toi FBM`.
- [x] [Tự động] Scanner tự kiểm tra fixture vi phạm giả lập (protocol ngoài cổng, fetch FBM ngoài executor, caller login ngoài cổng); bằng chứng: `scanner bat fixture goi login ngoai cong`; `scanner bat fixture goi protocol.request ngoai TransportCore`; `scanner bat fixture fetch FBM ngoai executor`.

## Lỗi, log và bảo mật

- [x] [Tự động] Mọi lỗi cổng, transport và login đều đặt state hữu hạn, Sidebar có thông báo và Sheet `Log` có dòng tương ứng kể cả khi Sidebar đang đóng; bằng chứng: `loi mang transport ket thuc huu han va van ghi Log khi Sidebar dong`; `exception noi bo cong fail-closed va ghi loi an toan`; `Lỗi mạng và lỗi bridge đều hiện Sidebar và gọi ghi Sheet Log`.
- [x] [Tự động] Hai lỗi cùng nội dung ở hai thời điểm vẫn tạo hai dòng log riêng; bằng chứng: `Hai lỗi cùng message ở hai thời điểm đều ghi Log, không dedupe vĩnh viễn`.
- [x] [Tự động] Exception nội bộ cổng fail-closed và không lộ password, cookie, envelope, `authorized` hoặc payload trong Sidebar, `Log`, trace hay fixture; bằng chứng: `exception noi bo cong fail-closed va ghi loi an toan`; `DTO Sidebar: khong lo cookie, Authorized, lookup noi bo hay lock qua bien gioi UI`; `log tong hop: recordId rong va khong dua session noi bo vao detail`; `executor projection generic giu du field GAS yeu cau va bo payload lon`.

## Việc người dùng cần làm sau khi test tự động đạt

- [ ] [Cần kiểm chứng thật] Đóng tab FBM, bật chính sách tự mở tab, chạy một lượt đọc an toàn; xác nhận Extension mở đúng URL GAS cấp và chỉ thử lại một lần.
- [ ] [Cần kiểm chứng thật] Lặp lại ca trên khi tắt chính sách tự mở tab; xác nhận không có request nghiệp vụ đi tiếp và Sidebar/`Log` cùng ghi `FBM_TAB_NOT_FOUND`.
- [ ] [Cần kiểm chứng thật] Đóng Sidebar nhưng để lịch nền hoạt động, làm mất tab FBM giữa lượt; mở Sidebar lại và kiểm tra trạng thái lỗi cùng dòng `Log`.
- [ ] [Cần kiểm chứng thật] Chỉ khi được yêu cầu mới chạy một ca ghi trên dữ liệu an toàn theo cờ an toàn hiện hành; không dùng request xóa.

## Bản ghi yêu cầu bổ sung của phiên sửa

- [x] [Tự động] Không còn đường đồng bộ nào gọi tay `loginRequest`, `beginAutoLogin` hoặc builder login; chỉ cổng phát nhóm request hệ thống; bằng chứng: `scanner bat fixture goi login ngoai cong`; `kiến trúc một cửa: không có GAS caller nào phát builder login/authorize/User/heartbeat ngoài cổng`.
- [x] [Tự động] Extension không parse/decode/project/thay thế body FBM đối với probe/session gate; GAS nhận đủ `status`, `ok`, body text nguyên trạng; bằng chứng: `executor tra nguyen response JSON cho GAS, khong projection truoc GAS`; `executor giu nguyen body HTTP 500 ky tu thay the cho GAS`.
- [x] [Tự động] 401/403 chỉ là `SESSION_SUSPECTED`, phải probe xác minh và không tự xếp `SESSION_EXPIRED`; bằng chứng: `HTTP 401 va 403 chi la phien dang ngo, khong tu ket luan het phien`; `FBM 401 chi probe lai va neu probe khong song thi dung, khong tu login tu loi nghiep vu`.
- [x] [Tự động] DTO lỗi `SESSION_EXPIRED_AT_WRITE` là fail-closed trạng thái `paused`, không trả `null` và không cấp lại request ghi; bằng chứng: `request ghi khong duoc tu dong gui lai khi session het han`.
- [x] [Tự động] Bản ghi test trỏ tên ca cụ thể, không trỏ tên tệp; bằng chứng: `FBM chan vi con phien cu duoc tach khoi sai mat khau va khong tat auto-login`, `het chu ky cho thi probe truoc khi thu login lai`, `lookup loi transport hoac parse fail-closed khong tu dong di tiep`, `executor dung tai Login khi FBM bao dang co phien khac, khong tu huy va khong mo trang tai khoan`.

## Tệp dự kiến sửa

- `1_ShinCRM_GAS/fbm_sync/transport/TransportCore.js`
- `1_ShinCRM_GAS/fbm_sync/auth/AutoLogin.js`
- `1_ShinCRM_GAS/fbm_sync/state/State.js`
- `1_ShinCRM_GAS/fbm_sync/transport/PullFlow.js`
- `1_ShinCRM_GAS/fbm_sync/state/Scheduler.js`
- `1_ShinCRM_GAS/client/sync/fbmSync.html`
- `2_ShinCRM_Extension/background/service_worker.js`
- `tests/cases/fbmSync/AutoLogin.js`
- `tests/cases/fbmSync/Orchestration.js`
- `tests/cases/fbmSync/Workflow.js`
- `tests/cases/extensionBridge.js`
