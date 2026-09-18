# Kế hoạch sửa Sidebar Đồng bộ FBM

> Tệp làm việc của phiên UI Sidebar FBM ngày 16/09/2026. Phần đầu là kế hoạch đã chốt; Phụ lục A ở cuối giữ nguyên văn review của chủ dự án để nghiệm thu. Khi triển khai xong, cập nhật các hợp đồng chính thức liên quan và checklist, không dùng tệp này để tạo thêm quy tắc nghiệp vụ song song.
>
> **Khôi phục ngữ cảnh bắt buộc:** trước khi tiếp tục bất kỳ slice nào thuộc kế hoạch này, đặc biệt sau khi context bị nén, đọc lại tệp này cùng `09. Đồng bộ FBM/06. Bảo mật và cấu hình kết nối.md`, `07. Log, tham số và nghiệm thu.md`, `08. UI đồng bộ và cấu hình.md`, checklist FBM và `Câu hỏi đêm.md`.

## 1. Mục tiêu và kết quả cần đạt

- Làm Sidebar Đồng bộ FBM nhất quán với các component chuẩn của ShinCRM, không còn control/popup/spacing riêng mang hình thức khác form Khách hàng và Giao dịch.
- Sửa trạng thái rỗng để lần đầu mở màn hình không hiện pipeline đã hoàn tất, trạng thái phiên cũ, hoặc progress xanh/đỏ khi không có phiên đang chạy.
- Bỏ hẳn màn `Tổng quan` vì nội dung trùng với các màn chuyên trách; đặt `Chạy đồng bộ` làm màn hình mặc định và đưa nó lên đầu menu chọn màn hình.
- Đưa toàn bộ cấu hình vận hành FBM mà người dùng chỉnh vào Sidebar và `DocumentProperties`; không còn phụ thuộc sheet `Config` cho nhóm tham số này.
- Mở rộng lịch nền để chạy theo chiều người dùng chọn, vẫn để GAS giữ toàn bộ state, cursor, cổng an toàn và quyết định nghiệp vụ.

## 2. Sự thật hiện trạng và nguyên nhân lỗi

- Năm tab Kết quả đang khai lưới bốn cột; CSS đẩy tab thứ năm xuống một hàng riêng, nên năm tab không đều.
- Tab Tổng hợp nối trực tiếp các Block kết quả thay vì bọc bằng `.shin-section`; vì vậy hai Card `Trạng thái phiên` và `Cần xử lý` không nhận `gap` chuẩn. Đây là lỗi dùng sai vùng chứa, không phải lỗi component chuẩn.
- Pipeline có fallback suy diễn bước từ `phase`. Khi một snapshot không được phân biệt chặt với phiên thực sự, fallback có thể vẽ nội dung trông như pipeline đã chạy. Progress cũng nhận giá trị không đủ nghĩa ở trạng thái rỗi nên tạo fill màu không có ý nghĩa.
- Các input vận hành Sync có lúc dùng cấu trúc/render riêng thay vì `StandaloneField`; select loại đồng bộ không dùng cùng controller `PopupList` với popup chuẩn.
- Scheduler hiện chỉ có `heartbeat`, `customer`, `activity`; lịch luôn khởi động mode `read`, chưa có chiều cấu hình, quét chi tiết, giới hạn Customer/lượt, hoặc delay giữa request.
- `FBM_SYNC_APPROVAL_THRESHOLD` được đưa vào kho `FBM_SYNC_SETTINGS_V1`. Ba giá trị gắn tài khoản FBM được khôi phục theo quyết định mới: `customerPrefix` và `customerCodeLength` kiểm tra `ma_kh` FBM tự sinh khi tạo Customer mới; `activitySince` giới hạn phạm vi quét Activity. Chúng nằm ở `FBM_ACCOUNT_SETTINGS_V1` và màn hình `Tài khoản FBM`, không nằm trong tham số phiên.

## 3. Quyết định đã chốt với chủ dự án

### 3.1. Màn hình mặc định và component

- Xóa file/màn `Tổng quan`, không để route hoặc fallback render tới màn đã xóa.
- Click icon Đồng bộ và mở Sidebar phải vào `Chạy đồng bộ`; schema menu đặt `run` ở phần tử đầu tiên.
- Tất cả input/select/toggle ngoài `DATA_SCHEMA` dùng `StandaloneField` hoặc `StandaloneControl`; không tạo nhãn/ô nhập HTML đặc thù cho FBM.
- Bổ sung một pattern dùng chung cho hàng chỉ có một nút hành động: `Row` mang class CSS chung căn giữa. Toàn bộ nút đứng riêng một hàng trong Sync dùng pattern đó. Đổi sang căn trái/phải về sau chỉ sửa class dùng chung, không sửa từng màn.
- Select `Loại đồng bộ` và select vận hành Sync dùng adapter select chung dựa trên `PopupList`, cùng hình thức, vị trí, keyboard và trạng thái dòng chọn với popup chuẩn. Không dùng popup/native select riêng cho từng màn.

### 3.2. Tài khoản FBM

- Block liên kết chỉ hiển thị `Chưa kết nối với tài khoản FBM nào` khi `UNBOUND` và `Đã kết nối với tài khoản FBM: {accountName}` khi `BOUND`. Các trạng thái lỗi/rebind chỉ hiện chi tiết khi thật sự có lỗi cần người dùng xử lý.
- Bấm lưu liên kết với một đến ba trường có giá trị sẽ đánh dấu đỏ chính xác các trường bị thiếu, cùng class/state invalid của form chuẩn; giữ form và cuộn/focus vào ô thiếu đầu tiên. Bốn trường đều trống vẫn là lệnh hủy liên kết hiện có.
- `Tự động điền` chỉ đọc User và thành công thì thông báo `Đã lấy thông tin thành công và điền vào form.` sau khi đã điền bốn control; không tự đối chiếu Customer hoặc lặp dữ liệu bên dưới. `Kiểm tra liên kết` do người dùng bấm riêng; chỉ lỗi Extension/tab/response/thiếu nhận diện mới hiện chi tiết ở lượt tự điền.
- Nếu chưa lưu credential, username/password trống và gõ/lưu theo luồng hiện có. Nếu đã lưu, username và password `****` hiển thị chỉ đọc, không có chú thích thừa.
- Card `Đăng nhập tự động` có icon bút ở hàng tiêu đề. Bấm bút chuyển form sang sửa: username hiện giá trị đã lưu, password trống để nhập lại; lưu yêu cầu đủ cả username và password, tránh cập nhật nửa vời làm mất credential. Thành công quay về chế độ chỉ đọc; hủy/đóng không thay đổi credential.

### 3.3. Chạy đồng bộ và Kết quả & xử lý

- `Bắt đầu đồng bộ`, `Chấp thuận và chạy`, `Lưu nhịp Extension`, `Lưu lịch nền`, `Lưu chính sách đăng nhập`, `Đổi cấu hình kết nối` và mọi nút đơn cùng loại dùng hàng căn giữa chung.
- Khi `phase` là `idle` không có `runId` hoặc không có lượt được người dùng mở lại, không dựng pipeline, Card trạng thái phiên hay progress của một lượt cũ. Pipeline chỉ hiện trong phiên active, chờ chấp thuận, lỗi/dừng có thông tin chẩn đoán, hoặc phiên hoàn tất mà người dùng chủ động mở lại.
- Progress ở trạng thái rỗi là rỗng, không có fill xanh/đỏ. Xanh chỉ đại diện tiến độ/hoàn tất hợp lệ; đỏ chỉ đại diện lỗi thật; khi chờ response dùng trạng thái waiting riêng.
- Năm tab `Tổng hợp`, `Xung đột`, `Lỗi`, `Log`, `Nghiệm thu phạm vi thử` luôn nằm trong lưới năm cột bằng nhau; nhãn dài được xuống dòng cân đối, không ép tab riêng xuống hàng thứ hai.
- Thân tab Tổng hợp đi qua `.shin-section` để Card `Trạng thái phiên` và `Cần xử lý` nhận gap chuẩn.
- Tab Xung đột đặt `Quay lại kết quả` thành một hàng action riêng ở dưới cùng sau nội dung xử lý, không chen cạnh các action theo bản ghi.

### 3.4. Cài đặt phiên

- Card đầu tiên là `Bật tắt module đồng bộ FBM`. Công tắc trong Card và công tắc Header cùng đọc một DTO `masterEnabled`, gọi một lệnh GAS `fbmSetMasterSwitch`, cập nhật lạc quan cùng lúc, rồi nhận snapshot xác nhận hoặc rollback cùng lúc nếu lỗi.
- `Kết nối Extension` dùng spacing chuẩn giữa notice relay và action đổi cấu hình. `Chu kỳ hỏi GAS (phút)` là một hàng nhãn | input. Bỏ hẳn dòng Spreadsheet ID kỹ thuật khỏi Sidebar.
- `Lịch đồng bộ nền` có công tắc tổng; tắt công tắc thì toàn bộ chiều, tiến trình và input phía dưới ở chỉ xem/disabled. Bật/tắt thành công phải vá node tại chỗ, rollback rõ ràng khi GAS từ chối.
- Chiều lịch nền có đúng ba chọn lựa: `FBM → ShinCRM`, `ShinCRM → FBM`, `Đồng bộ hai chiều`. Khi phát hiện khác biệt, GAS chạy theo chiều đã chọn.
- Tiến trình lịch nền và mặc định lần đầu là:

| Tiến trình | Mặc định bật | Chu kỳ mặc định |
| --- | --- | --- |
| Giữ phiên FBM không bị đăng xuất | Bật | 5 phút |
| Quét lấy toàn bộ danh sách Customer | Bật | 8 giờ |
| Quét lấy toàn bộ Activity | Tắt | 1 ngày |
| Quét chi tiết Customer và Activity của Customer | Tắt | 1 giờ |

- Tiến trình quét chi tiết có thêm `Số lượng Customer quét mỗi lần` mặc định `50` và `Delay tối thiểu/tối đa (giây)` mặc định `0,5` / `2`.
- Card `Bật tắt module đồng bộ FBM` chứa công tắc tổng và `Ngưỡng yêu cầu chấp thuận`; ngưỡng được lưu trong `DocumentProperties`, không còn Card `Tham số phiên` riêng.

| Tham số | Ý nghĩa và hành vi |
| --- | --- |
| Ngưỡng yêu cầu chấp thuận | Số bản ghi ghi lên FBM từ mức này trở lên phải chờ duyệt trước request ghi đầu tiên. `0` nghĩa mọi lượt ghi đều cần duyệt. |

### 3.5. Lịch nền, cổng ghi và `waitMs`

- Lịch nền chạy theo chiều người dùng cấu hình, không còn bị mô tả hoặc cưỡng chế là chỉ đọc FBM.
- Với lượt nền có ghi lên FBM: nếu số bản ghi cần ghi nhỏ hơn ngưỡng, GAS tự tiếp tục sau các cổng an toàn hiện có; nếu số lượng từ ngưỡng trở lên, GAS lưu preview và dừng ở `awaiting_approval`. Scheduler không được tự vượt qua trạng thái chờ duyệt hoặc đè lên preview.
- Ngưỡng `0` làm mọi lượt nền có ghi chờ duyệt. Lượt thủ công vẫn dùng cùng ngưỡng chấp thuận, nhưng do người dùng đã chủ động khởi chạy nên chỉ cần bước duyệt khi đạt ngưỡng.
- Thêm scan `detail`: GAS giữ cursor bền vững, chọn tối đa 50 Customer mỗi lượt, quét Customer và Activity của từng Customer, rồi lưu `notBefore` trước Customer kế tiếp.
- GAS trả DTO kỹ thuật `waitMs` được tính ngẫu nhiên trong khoảng cấu hình 0,5–2 giây. Extension chỉ chờ rồi hỏi lại GAS; không nhận Customer, chiều, cursor, logic conflict hoặc quyết định nghiệp vụ. Nếu Service Worker ngủ trước khi hết chờ, alarm `gas_poll` kế tiếp tôn trọng `notBefore` và không chạy sớm.
- Extension vẫn chỉ giữ alarm `gas_poll` duy nhất. `waitMs` là primitive transport do GAS cấp, không phải scheduler/logic nghiệp vụ mới trong Extension.

## 4. Thiết kế kỹ thuật và API

### 4.1. Lưu tham số phiên và migration Config

- Tạo kho `FBM_SYNC_SETTINGS_V1` trong `DocumentProperties`, chỉ chứa `{ approvalThreshold }` đã chuẩn hóa. Tạo kho `FBM_ACCOUNT_SETTINGS_V1` cho `{ customerPrefix, customerCodeLength, activitySince }`, có migration một lần từ các key Config cũ tương ứng.
- Khi kho chưa tồn tại, GAS chỉ một lần đọc `FBM_SYNC_APPROVAL_THRESHOLD` cũ cho tham số phiên và các key `FBM_MA_KH_PREFIX`, `FBM_MA_KH_LENGTH`, `FBM_ACTIVITY_SINCE` cũ cho cấu hình tài khoản, ghi record chuẩn rồi dùng record đó. Sau khi kho tương ứng đã tồn tại, tuyệt đối không đọc lại Config.
- `customerPrefix` và `customerCodeLength` phải nhập đủ cả hai hoặc để trống cả hai. Khi tạo Customer mới, Preflight chặn nếu thiếu cấu hình; sau bước mở form, mã `ma_kh` FBM tự sinh phải khớp tiền tố và độ dài trước khi gửi request lưu. `activitySince` là ngày hợp lệ hoặc để trống; Activity trước mốc bị bỏ qua nhưng không bị coi là bản ghi mất.
- `activitySince` được đổi sang filter FBM `end_date:>=DD/MM/YYYY` trên bulk và mọi request Activity theo Customer; missing scan loại Activity trước mốc, refresh conflict đọc đích danh không áp dụng mốc. Mỗi lượt chụp mốc vào state để đổi cấu hình giữa chừng không làm trộn phạm vi cursor.
- Thêm `FbmSync.syncSettingsRead()`/`syncSettingsSave(input)` và `FbmSync.accountSettingsRead()`/`accountSettingsSave(input)`; server entrypoint công khai tương ứng là `fbmGetSyncSettings()`, `fbmSaveSyncSettings(settings)`, `fbmSaveAccountSettings(settings)`. GAS kiểm tra DTO rồi trả bản đã lưu để Sidebar vá lại.

### 4.2. Shape cấu hình lịch nền

- Nâng `FBM_SYNC_BACKGROUND_SCHEDULE_V1` sang shape versioned gồm `enabled`, `direction`, `heartbeat`, `customerFull`, `activityFull`, `detail`.
- `heartbeat`, `customerFull`, `activityFull` mang `{ enabled, minutes, priority }`; `detail` mang thêm `{ customersPerRun, minDelaySeconds, maxDelaySeconds }`.
- Đọc shape cũ `{ customer, activity, heartbeat }` tương thích một lần: map Customer/Activity hiện có sang `customerFull`/`activityFull`, áp mặc định đã chốt cho field mới và lưu shape mới khi người dùng bấm lưu.
- `fbmSaveBackgroundSchedule(schedule)` kiểm chu kỳ 1 phút đến 7 ngày, `customersPerRun` là số nguyên dương, delay tối thiểu không âm, delay tối đa không nhỏ hơn tối thiểu và không vượt giới hạn an toàn được khai một chỗ ở GAS.
- Khi đổi lịch, chỉ reset marker `nextRunAt` của tiến trình đã đổi nếu không có request FBM đang bay; không hủy/ghi đè cursor của phiên active.

### 4.3. Scheduler và transport

- Scheduler chọn một tiến trình tới hạn theo priority, không chạy song song; active cursor tiếp tục trước khi chọn tiến trình mới.
- Khi chọn `customerFull`, `activityFull` hoặc `detail`, scheduler gọi `FbmSync.start()` với `origin: 'background'`, scan tương ứng và mode lấy từ `direction`; mapping mode giữ nguyên `read`, `push`, `write` của module hiện tại.
- Thêm `detail` cursor/pipeline tại GAS, có giới hạn 50 Customer/lượt và `notBefore`. Mọi cập nhật cursor, delay, request ID và state vẫn ở `DocumentProperties`.
- DTO heartbeat/relay có thể mang `{ request: null, waitMs }`. Worker chỉ tạo delayed re-poll generic khi `waitMs > 0`; tuyệt đối không tự phát request FBM, không retry write, và không thêm alarm theo tiến trình.

### 4.4. Component và render

- Mở rộng renderer chung để select `StandaloneControl` dùng controller `PopupList`, không tạo controller popup Sync riêng.
- Bổ sung class dùng chung cho action-row đơn và inline label-control; dùng ở cả các Card Sync cần thiết, không thêm `.shin-sync-*` nếu ý nghĩa chỉ là form/layout chuẩn.
- Validation liên kết dùng state invalid của input dùng chung; không tự tô style tại màn Account.
- Icon bút Login dùng `Icon`/`titleActions` của `Card`; giữ mật khẩu bản rõ chỉ trong DOM của lượt sửa và không nhận password từ GAS.
- Mọi callback status chỉ vá vùng động bằng `renderTarget`/`renderTargetState`; không dựng lại form đang gõ, header, popup hoặc draft credential.

## 5. Tài liệu, kiểm thử và nghiệm thu

- Cập nhật `09. Đồng bộ FBM/06. Bảo mật và cấu hình kết nối.md`: nơi lưu bốn tham số FBM, migration Config và ranh giới credential/relay.
- Cập nhật `09. Đồng bộ FBM/07. Log, tham số và nghiệm thu.md`: mô tả tham số, default, ngưỡng duyệt và loại bỏ nguồn Config cũ.
- Cập nhật `09. Đồng bộ FBM/08. UI đồng bộ và cấu hình.md`: dashboard, Account, popup, trạng thái rỗng, settings và lịch nền hai chiều.
- Cập nhật `Checklist đồng bộ FBM.md` cùng mỗi nhóm code/test; không sửa bất kỳ tệp nào trong `0_Documentation/Nghiên cứu FBM/`.
- Test offline bổ sung: Account validation/credential locked-editable; PopupList select; single-action alignment; năm tab; summary gap; idle/old pipeline/progress; master switch hai vị trí; migration DocumentProperties; validation tham số; schedule bốn tiến trình/default; direction; ngưỡng auto-write/awaiting approval; detail cursor 50; `waitMs`; worker không tạo alarm mới và không có logic nghiệp vụ.
- Chạy `node tests/run.js` sau thay đổi code. Chạy GAS DEV các API mới với `node tests/gas.js <tên-hàm> --push` và thêm entrypoint cần thiết vào `DEV_RUNNER_ALLOWED`.
- Nghiệm thu người dùng cần mở lại Sidebar và tải lại Extension để nhìn UI thật; live FBM chỉ dùng `ALT00010`, không gửi request xóa, và không chạy ghi thật ngoài cờ an toàn hiện có.

---

## Phụ lục A — Nguyên văn yêu cầu chỉnh sửa Sidebar của chủ dự án

```text
1. Màn hình tổng quan:

Hiện tại tôi thấy màn hình này đang khá vô dụng. Bạn xem làm nó hữu ích hơn được không, nếu không thì xóa luôn màn hình này đi.

2. Màn hình "Tài khoản FBM"
2.1. Khối Liên kết tài khoản
- Spreadsheet chưa khớp tài khoản FBM đã lưu. Cần kiểm tra lại trước khi chạy bất kỳ chiều đồng bộ nào. --> Quá dài, sửa lại là "Chưa kết nối với tài khoản FBM nào"/ "Đã kết nối với tài khoản FBM: Lê Tuấn Anh" là đủ
- Hãy nhập đủ cả bốn thông tin liên kết, hoặc xóa cả bốn ô để hủy liên kết. --> Ở các ô bị thiếu thì tô đỏ ô, giống như khi nhập thiếu các trường bắt buộc ở màn hình Khách hàng/ Giao dịch vậy, như thế mới trực quan.
- Khi tôi click vào "Tự động điền", nếu thành công thì nó đã tự điền thông tin vào 4 ô nhập liệu rồi, do đó không cần ghi chi tiết ở bên dưới. Chỉ cần ghi đã Lấy thông tin thành công và điền vào form. Việc kiểm tra liên kết do nút riêng đảm nhiệm; chỉ hiện chi tiết nếu lỗi thôi.
2.2. Đăng nhập tự động
- Xóa bỏ "Đã lưu thông tin đăng nhập được mã hóa. Chính sách tự đăng nhập, tự mở tab và thử lại được chỉnh trong Cài đặt phiên."
--> Tôi muốn như sau:
- Nếu chưa lưu tài khoản, mật khẩu: hiện trắng.
- Khi gõ: như hiện tại là được rồi
- Nếu đã lưu mật khẩu: ô mật khẩu hiện các ký tự **** để người dùng biết là mật khẩu đã từng được lưu rồi, đồng thời nếu đã lưu mật khẩu rồi thì ô user và pass sẽ ở trạng thái chỉ xem, Có icon cái bút (sửa) ở cùng hàng Tiêu đề "Đăng nhập tự động", ấn vào để sửa. Như vậy nhìn là tự hiểu, không cần ghi chú gì.

3. Màn hình "Chạy đồng bộ"
3.1. Khối Chọn loại đồng bộ
- Popup khi click vào ô để chọn loại đồng bộ: popup này không chung định dạng với những popup khác??? Sao đã có component về popup rồi mà không dùng, cứ dùng component đâu đâu vậy? Sửa lại cho đồng bộ, dùng component đã có sẵn.
- Nút bắt đầu đồng bộ: Căn giữa, hiện tại đang bị lệch trái.
3.2. Khối Trạng thái phiên
- Tại sao thanh tiến trình lại 1 nửa xanh/ 1 nửa đỏ dù đang không chạy gì? Cần fix bug này.
3.3. "Khối Pipeline đã hoàn tất" và "Trạng thái phiên"
- Tôi mới mở màn hình này, còn chưa chạy gì mà nó đã hiện là sao???

4. Màn hình "Kết quả & xử lý"
4.1. Các tab
- 5 tab Tổng hợp - Xung đột - Lỗi - Log - Nghiệm thu phạm vi thử đang rất xấu, trông không đều chút nào.
4.2. Tab Tổng hợp
- Khối Trạng thái phiên: Tại sao thanh tiến trình lại 1 nửa xanh/ 1 nửa đỏ dù đang không chạy gì? Cần fix bug này.
- Hai khối "Trạng thái phiên" và "Cần xử lý" đang dính vào nhau??? Tại sao lại bị lỗi này? Trả lời tại sao, vì tôi nhớ là component chuẩn đã để khoảng đệm rồi cơ mà?
4.3. Tab xung đột
- Đưa nút "Quay lại kết quả" thành 1 dòng riêng ở dưới cùng

5. Màn hình "Cài đặt phiên"
5.1. Bổ sung 1 khối đầu tiên là Bật tắt module đồng bộ FBM
- Có nút on/off - nút này chính là nút on/off ở thanh tiêu đề, và 2 nút này luôn giữ trạng thái giống nhau, sửa ở 1 nơi thì nơi kia cũng update theo!
5.2. Khối Kết nối Extension
- Dòng chữ "Extension đã nhận cấu hình relay của file này." và nút "Đổi cấu hình kết nối" Đang nằm quá sát nhau
- Nút "Đổi cấu hình kết nối" đang lệch trái, căn giữa. Nói chung tất cả các nút đứng 1 mình 1 hàng thì căn giữa!
- Sửa lại bố cục như sau:
Chu kỳ hỏi GAS (phút) | Ô nhập liệu (ở cùng 1 hàng)

5.3. Khối Nhịp hỏi GAS của Extension
- Bỏ dòng "Spreadsheet ID kỹ thuật: 1jEQMWMn5jRUBDGXrQxbK0hpld6gGwlAXSZpoRQm8lpI" đi!
- Nút "Lưu nhịp Extension" đang căn trái, chỉnh lại bằng căn giữa --> bạn xem làm cách nào để xử lý hàng loạt đi, không sửa từng cái từng cái như thế này. Sửa lại để làm sao nếu tôi muốn đổi sang căn phải thì chỉ sửa ở 1 chỗ thôi!

5.4. Khối Lịch đồng bộ nền
- Sao lại là "Chỉ đọc FBM; mỗi lượt đến hạn được GAS chọn một tiến trình theo ưu tiên." Nó có thể đồng bộ 2 chiều nếu tôi cài đặt như thế chứ.

Các cài đặt có trong "Lịch đồng bộ nền":

- Cài đặt chung:
  + on/off toàn phiên đồng bộ nền (công tắc tổng, nếu nó off thì tất cả giá trị bên dưới chuyển sang chế độ chỉ xem)
  + Chiều đồng bộ: Nếu phát hiện có khác biệt giữa FBM và ShinCRM thì sẽ đồng bộ theo chiều đồng bộ đã chọn

- Giữ phiên FBM không bị đăng xuất:
  + on/off
  + Thời gian

- Quét lấy toàn bộ danh sách Customer
  + on/off
  + Thời gian

- Quét lấy toàn bộ Activity:
  + on/off (khả năng cao là tôi sẽ off cho đỡ nặng)
  + Thời gian

- Quét chi tiết Customer và Activity của Customer:
  + on/of
  + Thời gian
  + Số lượng customer quét mỗi lần
  + Thời gian delay giữa mỗi request tới 1 khách hàng (giây): Tối thiểu | Tối đa

5.4. Khối Tham số phiên
- Kích hoạt phần Tham số phiên đi, đặc biệt là "Ngưỡng yêu cầu chấp thuận". Sắp tới tôi sẽ bỏ hẳn sheet config, trước tiên thì sẽ bỏ các tham số phiên đồng bộ khỏi sheet config, cấu hình toàn bộ ở sidebar và lưu vào document properties.
- Tiền tố mã khách, độ dài mã khách và mốc Activity đã được xác định là cấu hình gắn với tài khoản FBM, không phải tham số phiên: đưa sang màn hình `Tài khoản FBM`. Tiền tố/độ dài dùng kiểm tra `ma_kh` FBM tự sinh khi tạo Customer mới; mốc Activity bỏ qua Activity có ngày làm việc trước mốc và không coi chúng là bản ghi mất.
- Ngưỡng yêu cầu chấp thuận: cần note ý nghĩa chi tiết, đọc chẳng hiểu gì cả.

6. Tôi đã dày công thiết kế các component rất đẹp rồi, nhưng code lại cứ đi vẽ ra mấy cái component khác thì phải cái đâu đâu thế:
 -Ví dụ: Với các ô nhập liệu có nhãn, phần ô nhập liệu Mã số thuế (kèm nhãn Mã số thuế) lại hơi khác với ô nhập liệu "Tên đăng nhập FBM" (ít nhất thì tôi thấy định dạng nhãn khác nhau)
```
