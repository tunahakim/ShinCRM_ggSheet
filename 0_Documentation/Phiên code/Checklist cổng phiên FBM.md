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

- [x] [Tự động] Phép quét vĩnh viễn liệt kê mọi đường tạo và phát request FBM, chốt đúng một cổng phát envelope; bằng chứng: `GAS chỉ có TransportCore gọi protocol.request`; `worker chỉ có một điểm gửi request FBM`; `kiến trúc một cửa: không có GAS caller nào phát builder login/authorize/User/heartbeat ngoài cổng`.
- [x] [Tự động] Ba tầng và ba nhánh cổng phiên đã có test độc lập cho cả thành công và thất bại; bằng chứng: `session hop le khong doi hanh vi ca doc va ghi`; `FBM 401 di qua cong session va bat dau auto-login mot lan`; `cổng fail-closed khi tự đăng nhập tắt`; `no-tab chi retry mot lan theo policy va co log loi`; `dang nhap thu: Login thanh cong phai qua authorize va User grid khop binding moi duoc bao thanh cong`; `kiem tra lien ket: chi quet Customer va tra tong hop n/N, khong cap Activity hoac ghi binding`.
- [x] [Tự động] Ba bẫy đệ quy, chạy song song và thử lại vô hạn đã có test hồi quy; bằng chứng: `cổng khai báo nhóm request hệ thống và marker phiên trước khi phát request nghiệp vụ`; `hai luong phat hien mat session chi giu mot tien trinh login va luong sau cho`; `login heartbeat that bai tam dung va khong lap ngay`; `login that bai bi throttle toi da mot lan moi 30 phut khi den lich`.
- [x] [Tự động] `node tests/run.js` chạy xanh sau thay đổi; bằng chứng: tổng kết `Đạt: 1848`, `Không đạt: 0`.
- [ ] [Cần kiểm chứng thật] Người dùng đã kiểm tra các ca cần tab FBM thật, Sidebar đóng/mở lại và không ghi dữ liệu thật ngoài cờ an toàn đã bật.

## Tầng 1 — Cổng phiên FBM

- [x] [Tự động] Khi tab còn phiên hợp lệ, một lượt đọc cấp đúng một request nghiệp vụ, không khởi động login và giữ nguyên cursor/reservation; bằng chứng: `session hop le khong doi hanh vi ca doc va ghi`; `start chi tiep tuc cursor sau khi reservation cu da thu hoi`.
- [x] [Tự động] Khi tab còn phiên hợp lệ, một lượt ghi cấp đúng request theo thứ tự cũ và không gửi lại request ghi; bằng chứng: `session hop le khong doi hanh vi ca doc va ghi`; `request ghi khong duoc tu dong gui lai khi session het han`.
- [x] [Tự động] Khi có tab nhưng phiên hết hạn và auto-login được phép, cổng chỉ khởi động một login, xác thực xong rồi tiếp tục đúng cursor đọc ban đầu một lần; bằng chứng: `hết phiên tạo request login và giữ cursor cũ`; `sau authorize GAS cap User grid de xac minh identity`; `chi identity khop moi tiep tuc heartbeat`; `FBM 401 di qua cong session va bat dau auto-login mot lan`.
- [x] [Tự động] Khi có tab nhưng phiên hết hạn và auto-login bị tắt, cổng dừng trước request nghiệp vụ, Sidebar và `Log` cùng ghi rõ mã lý do; bằng chứng: `cổng fail-closed khi tự đăng nhập tắt`.
- [x] [Tự động] Khi chưa có tab và chính sách tự mở tab bật, Extension chỉ mở URL do GAS cấp và chỉ thử lại request một lần; bằng chứng: `no-tab chi retry mot lan theo policy va co log loi`; `auto-open chi mo URL GAS cap va doi trang FBM tai xong`; `auto-open tiep tuc sau khi tab FBM ready va thao listener`.
- [x] [Tự động] Khi chưa có tab và chính sách tự mở tab tắt, không có request nghiệp vụ tới FBM, state kết thúc hữu hạn, Sidebar và `Log` cùng ghi `FBM_TAB_NOT_FOUND`; bằng chứng: `no-tab bi chan ngay khi policy tu mo tab tat`; `Sidebar nhận request retry no-tab do GAS cấp thay vì tự quyết policy`.
- [x] [Tự động] Khi tab mất giữa chừng, reservation được thu hồi, request ghi không tự gửi lại, Sidebar và `Log` đều báo lỗi; bằng chứng: `exception cong trong nhanh no-tab cung thu hoi reservation`; `loi bridge thu cong: GAS chi ghi nhan loi dung reservation, ket thuc ro rang va khong cap request moi`; `Lỗi mạng và lỗi bridge đều hiện Sidebar và gọi ghi Sheet Log`.
- [x] [Tự động] HTTP 401, trang `Login.aspx`, lỗi mạng, timeout và bridge mất đều đi qua cổng request chung, không có `catch` nuốt lỗi; bằng chứng: `HTTP 401 di vao session gate, 403 van la loi van chuyen`; `body Login.aspx voi HTTP 200 bi nhan la het phien`; `loi mang transport ket thuc huu han va van ghi Log khi Sidebar dong`; `relay GAS co timeout va luu chan doan toi thieu`; `Sidebar ket thuc waiter bang loi bridge ro rang, khong gui lai request FBM`.

## Tầng 2 — Xác thực tài khoản

- [x] [Tự động] Sau mỗi login tự động thành công, hệ thống đọc grid `User` và so tuyệt đối Spreadsheet ID, mã user, username và tên đầy đủ trước khi cấp request tiếp theo; bằng chứng: `sau authorize GAS cap User grid de xac minh identity`; `chi identity khop moi tiep tuc heartbeat`; `dang nhap thu: Login thanh cong phai qua authorize va User grid khop binding moi duoc bao thanh cong`.
- [x] [Tự động] Mỗi lượt chạy mới kiểm tra tài khoản đúng một lần ở đầu lượt, lưu kết quả gắn với dấu phiên và không đọc lại grid `User` trong các request tiếp theo của cùng phiên; bằng chứng: `session probe đầu lượt đọc User rồi trả lại cursor authorize`; `marker xác thực cùng session bỏ qua User ở lượt kế tiếp`.
- [x] [Tự động] Phiên chưa từng xác thực hoặc dấu xác thực không khớp phiên hiện tại bị coi là chưa đạt và không được cấp request nghiệp vụ; bằng chứng: `login resume chưa có marker phải quay lại probe User trước request nghiệp vụ`; `marker lệch session bị coi là chưa xác thực và chặn request nghiệp vụ`; `auto-login sai identity fail-closed va xoa marker phien`.
- [x] [Tự động] Identity lệch hoặc thiếu bất kỳ định danh nào làm phiên fail-closed, không tự bật auto-login và không tự đổi binding; bằng chứng: `auto-login sai identity fail-closed va xoa marker phien`; `dang nhap thu sai identity: khong coi la thanh cong va khong thay binding`; `dang nhap thu sai identity fail-closed nhung khong tu tat auto-login`.
- [ ] [Cần kiểm chứng thật] Người dùng giữ tab FBM đúng tài khoản, chạy “Đăng nhập thử”, đối chiếu đủ bốn định danh và xác nhận thông báo/`Log` không có bí mật.

## Tầng 3 — Đối chiếu mã khách ShinCRM với FBM

- [x] [Tự động] Tầng cổng phiên và tầng xác thực tài khoản không gọi logic đối chiếu Customer; phép quét mã nguồn phát hiện mọi đường gọi xuyên tầng; bằng chứng: `tầng cổng và xác thực không gọi logic đối chiếu Customer của tầng 3`.
- [x] [Tự động] Luồng kiểm tra mã khách chỉ đọc Customer, trả tổng `n/N` và không ghi Sheet hoặc FBM; bằng chứng: `kiểm tra liên kết: chỉ quét Customer và trả tổng hợp n/N, không cấp Activity hoặc ghi binding`.

## Bẫy kiến trúc bắt buộc

- [x] [Tự động] Request hệ thống dùng cho login/authorize/User được đánh dấu riêng, chỉ cổng phiên được quyền phát, và không quay lại cổng để tự khởi động login lần nữa; bằng chứng: `cổng khai báo nhóm request hệ thống và marker phiên trước khi phát request nghiệp vụ`; `bypass session gate khong nam trong tham so caller`; `kiến trúc một cửa: không có GAS caller nào phát builder login/authorize/User/heartbeat ngoài cổng`.
- [x] [Tự động] Hai luồng cùng phát hiện mất phiên chỉ có một tiến trình login; luồng còn lại chờ kết quả và tiếp tục hoặc nhận cùng lỗi, không phát request song song; bằng chứng: `hai luong phat hien mat session chi giu mot tien trinh login va luong sau cho`; `worker khong tao hai request FBM khi Sidebar thu lai cung id`.
- [x] [Tự động] Login thất bại dừng trong cùng lượt, lần sau chỉ được thử theo `retryMinutes`, không lặp vô hạn; bằng chứng: `login heartbeat that bai tam dung va khong lap ngay`; `login that bai khong tu chay khi chua den lich`; `login that bai bi throttle toi da mot lan moi 30 phut khi den lich`.
- [x] [Tự động] Phép quét kiến trúc không còn đường GAS nào phát envelope ngoài cổng, không có caller truyền cờ bypass và không có tên login trong flow nghiệp vụ; bằng chứng: `GAS chi co TransportCore goi protocol.request`; `flow orchestration khong con tham chieu owner login`; `bypass session gate khong nam trong tham so caller`; `worker chi co mot diem gui request FBM`.

## Lỗi, log và bảo mật

- [x] [Tự động] Mọi lỗi cổng, transport và login đều đặt state hữu hạn, Sidebar có thông báo và Sheet `Log` có dòng tương ứng kể cả khi Sidebar đang đóng; bằng chứng: `loi mang transport ket thuc huu han va van ghi Log khi Sidebar dong`; `exception noi bo cong fail-closed va ghi loi an toan`; `Lỗi mạng và lỗi bridge đều hiện Sidebar và gọi ghi Sheet Log`.
- [x] [Tự động] Hai lỗi cùng nội dung ở hai thời điểm vẫn tạo hai dòng log riêng; bằng chứng: `Hai lỗi cùng message ở hai thời điểm đều ghi Log, không dedupe vĩnh viễn`.
- [x] [Tự động] Exception nội bộ cổng fail-closed và không lộ password, cookie, envelope, `authorized` hoặc payload trong Sidebar, `Log`, trace hay fixture; bằng chứng: `exception noi bo cong fail-closed va ghi loi an toan`; `DTO Sidebar: khong lo cookie, Authorized, lookup noi bo hay lock qua bien gioi UI`; `log tong hop: recordId rong va khong dua session noi bo vao detail`; `executor projection generic giu du field GAS yeu cau va bo payload lon`.

## Việc người dùng cần làm sau khi test tự động đạt

- [ ] [Cần kiểm chứng thật] Đóng tab FBM, bật chính sách tự mở tab, chạy một lượt đọc an toàn; xác nhận Extension mở đúng URL GAS cấp và chỉ thử lại một lần.
- [ ] [Cần kiểm chứng thật] Lặp lại ca trên khi tắt chính sách tự mở tab; xác nhận không có request nghiệp vụ đi tiếp và Sidebar/`Log` cùng ghi `FBM_TAB_NOT_FOUND`.
- [ ] [Cần kiểm chứng thật] Đóng Sidebar nhưng để lịch nền hoạt động, làm mất tab FBM giữa lượt; mở Sidebar lại và kiểm tra trạng thái lỗi cùng dòng `Log`.
- [ ] [Cần kiểm chứng thật] Chỉ khi được yêu cầu mới chạy một ca ghi trên dữ liệu an toàn theo cờ an toàn hiện hành; không dùng request xóa.

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
