# Checklist phiên đồng bộ FBM

Tài liệu này theo dõi phạm vi đồng bộ FBM/ShinCRM. Không thực hiện request ghi hoặc xóa thật trên FBM nếu chưa có chỉ đạo live test rõ ràng. Mã khách duy nhất được phép dùng khi live test là `ALT00010`.

## 1. Nền tảng và ranh giới

- [x] Xác định GAS là bộ não, Extension chỉ làm cầu nối `fetch`, Sidebar hiển thị tiến độ.
- [x] Giữ `RequestFBM` làm fixture tham khảo, không sửa nội dung nghiệp vụ; các file `.txt` được commit ở commit đầu tiên của branch đồng bộ FBM.
- [x] Chặn mặc định mọi request ghi bằng `FBM_SYNC_ALLOW_WRITES=false`.
- [x] Không triển khai thao tác xóa FBM.
- [x] Bổ sung docstring/comment ngắn cho các ranh giới và bẫy chính trong code mới.
- [x] Cập nhật cây thư mục code khi thêm module đồng bộ.

## 2. Protocol, state và transport GAS

- [x] Chuẩn hóa envelope request/response, mã lỗi và `Bugs`.
- [x] Giữ cookie/metadata transport kể cả khi FBM trả HTTP lỗi.
- [x] Lưu cursor, phase, counts, lỗi, conflict và thời điểm cập nhật trong `DocumentProperties`.
- [x] Chặn hai phiên đồng bộ chạy song song.
- [x] Có API bắt đầu, tiếp tục, lấy trạng thái và heartbeat.
- [x] Rà soát toàn bộ `Transport.js` để bảo toàn `state.locks` qua mọi lần ghi state.
- [x] Xác nhận mọi nhánh lỗi push chuyển record sang `error` và giải phóng khóa.

## 3. Đọc dữ liệu từ FBM

- [x] Lấy token `authorized` riêng cho Customer và Activity.
- [x] Đọc metadata và ánh xạ `AliasName`.
- [x] Phân trang Customer bằng cursor ổn định.
- [x] Phân trang Activity theo từng Customer.
- [x] Giới hạn live test mặc định ở Customer `ALT00010`; đặt `FBM_SYNC_TEST_CUSTOMER_CODE` rỗng khi được phép quét toàn bộ.
- [x] Giữ đúng cursor Customer khi trang không có Activity.
- [x] Lấy danh mục động bằng `GetCompletionList`/lookup và kiểm tra theo từng nguồn.
- [x] Kiểm tra danh mục trước cả chiều đọc; chiều ghi thật nhập mã/tên mới vào `Category` mà không xóa giá trị cũ.
- [x] Chuẩn hóa ngày, số 0 đầu chuỗi, giá trị rỗng và dữ liệu response lỗi.
- [x] Kiểm tra trạng thái đọc và panel tiến độ qua Sidebar.

## 4. Đối chiếu và ghi ShinCRM

- [x] Chuẩn hóa fingerprint `hFBM`, `hSHIN`, `hBASE` và ba chiều đối chiếu.
- [x] Fingerprint SELECT dùng mã FBM qua ánh xạ `Category`, không dùng nhãn hiển thị ShinCRM.
- [x] Kéo Customer/Activity mới về Sheet, giữ ghi chú nội bộ riêng và chặn bản ghi có danh mục lạ hoặc thiếu ngày làm việc.
- [x] Nhận diện không đổi, thay đổi một phía và conflict hai phía.
- [x] Không đưa ghi chú nội bộ ShinCRM vào payload FBM.
- [x] Khóa record khi đang đồng bộ ghi.
- [x] Hoãn record đang được người dùng sửa.
- [x] Chặn Save Sidebar khi record đang bị sync khóa.
- [x] Bổ sung/kiểm tra test cho khóa user, khóa sync và chặn Save.

## 5. Chiều ghi FBM

- [x] Kiểm tra cấu hình bắt buộc `FBM_ACCOUNT_NAME`.
- [x] Kiểm tra `FBM_MA_KH_PREFIX` và `FBM_MA_KH_LENGTH` trước khi tạo Customer.
- [x] Builder tạo Customer theo quy trình mở form rồi lưu.
- [x] Builder sửa Customer giữ `OldValue` từ dữ liệu FBM.
- [x] Builder tạo Activity theo request `New` và gắn dấu nhận diện.
- [x] Builder mở form Activity để chuẩn bị sửa.
- [x] Đối chiếu đầy đủ builder tạo/sửa với fixture request và tài liệu nghiên cứu.
- [ ] Chỉ bật test ghi thật sau khi người dùng chủ động xác nhận live test.

## 6. Extension

- [x] Tách content script FBM và executor fetch trả response thô.
- [x] Service worker định tuyến request, không giữ cursor nghiệp vụ.
- [x] Bổ sung quyền host cho `fbo.com.vn`.
- [x] Có heartbeat và nhận biết tab/phiên FBM.
- [x] Kiểm tra syntax toàn bộ Extension sau các thay đổi cuối.
- [ ] Đóng gói và tải lại Extension khi bước live test được phép.

## 7. Sidebar và lịch chạy

- [x] Có khu vực trạng thái phase/count/error/conflict/skipped.
- [x] Màn hình đồng bộ độc lập chiếm toàn Sidebar; nút quay lại chỉ ẩn màn hình, không hủy phiên đang chạy.
- [x] Hiển thị preview đọc-only có giới hạn của Customer/Activity để nghiệm thu live mà không ghi Sheet.
- [x] Có mục menu `Mở đồng bộ FBM` để mở/đóng khu vực trạng thái.
- [x] Chỉ lấy snapshot trạng thái khi mở màn hình và sau mỗi slice; không polling định kỳ tạo callback thừa.
- [x] Rà soát hiển thị tiến độ thực tế trong Sidebar.
- [x] Hoàn thiện heartbeat định kỳ 5 phút trong Extension bằng `chrome.alarms` và request đọc.
- [ ] Hoàn thiện lịch quét Customer 60 phút và Activity 8 giờ.
- [x] Có nút đồng bộ thủ công, dừng phiên và thông báo lỗi nhất quán.

## 8. Kiểm thử và nghiệm thu

- [x] Test offline protocol, fingerprint, cursor, builder và category gate.
- [x] Test không phát sinh request xóa.
- [x] Bổ sung test `pushConfigErrors` và `validateAutoCustomerCode`.
- [x] Bổ sung test state/lock qua nhánh success, error và conflict.
- [x] Chạy `node tests/run.js`.
- [x] Chạy `node tests/gas.js probeSidebarTemplate --push`.
- [x] Kiểm tra DEV runner trên Sheet DEV với trạng thái, bắt đầu và dừng phiên đọc.
- [ ] Live test đọc duy nhất `ALT00010` sau khi người dùng tải Extension và giữ đăng nhập FBM.
- [ ] Chỉ sau khi đọc ổn định mới xin phép test ghi có kiểm soát; tuyệt đối không xóa.

## 9. Bàn giao

- [ ] Cập nhật checklist và cây thư mục lần cuối.
- [x] Đẩy GAS sau khi test offline và GAS smoke test xanh (revision `@110`).
- [ ] Đóng gói và tải lại Extension sau khi bước live test được phép.
- [x] Ghi rõ các bước người dùng cần thao tác và kết quả nghiệm thu.

## Điều kiện còn chờ người dùng

Các mục live test cần người dùng tải lại `2_ShinCRM_Extension`, mở tab FBM đã đăng nhập và giữ tab hoạt động. Khi đến bước này chỉ dùng mã `ALT00010`; chưa bật cờ ghi thật và không thực hiện xóa. Lịch quét đầy đủ 60 phút/8 giờ chỉ được nghiệm thu sau khi luồng đọc qua Extension đã chạy ổn định, vì GAS không thể tự vượt giới hạn IP của FBM.

### Quy trình live test đọc

1. Tải lại thư mục `2_ShinCRM_Extension` trong `chrome://extensions`.
2. Giữ tab `https://fbo.com.vn:8888/Main/zccrAccount.aspx` đăng nhập bằng tài khoản FBM hiện tại.
3. Mở Sidebar ShinCRM, mở panel `Đồng bộ FBM` và bấm `Đồng bộ ngay`.
4. Chờ phase `Đang kiểm tra phiên FBM`, sau đó kiểm tra phase đọc Customer/Activity và các bộ đếm tiến độ.
5. Đối chiếu riêng khách `ALT00010`; không bấm nút dừng giữa request trừ khi tab/Extension lỗi.
6. Nếu phiên bị kẹt, bấm `Dừng đồng bộ`; nút này không ghi/xóa dữ liệu FBM.
