# Checklist rà soát module đồng bộ FBM trước vận hành thật

## Trạng thái phiên

- Phạm vi: rà soát theo luồng hoàn chỉnh từ thao tác người dùng đến kết quả cuối cùng, trước khi vận hành thật.
- Checklist này thay thế phạm vi của phiên rà soát hiện tại. `Checklist đồng bộ FBM.md` là checklist của phiên code tính năng cũ và không dùng làm căn cứ cho phiên này.
- Giai đoạn hiện tại: đã chốt phạm vi checklist; đang thực hiện bước 2 và các bước tự động tiếp theo. Các dòng cần tab/login/ghi thật vẫn để `[ ]` tới khi chủ dự án nghiệm thu.
- Cổng phiên FBM đã hoàn thành ở commit `caac98d` và nghiệm thu tự động ở `0c7b9f0`; E01, E02, F12, F14 của checklist này dùng cây quyết định cổng phiên mới.
- Quy ước: chỉ tick `[x]` khi toàn bộ bước của use case đạt và có bằng chứng phù hợp với cột kiểm chứng.
- Nếu một bước yêu cầu người dùng giữ tab FBM, đăng nhập, bấm ghi thật hoặc đối chiếu dữ liệu live thì để `[ ]` cho tới khi người dùng xác nhận.

## Quy tắc an toàn bắt buộc

- [ ] Mọi test ghi thật chỉ chạy trên Sheet DEV hoặc file trắng; dữ liệu live FBM chỉ dùng phạm vi `ALT00010`, không gửi request xóa và không chạm dữ liệu khách của người khác. Bằng chứng: Đã có test đúng nhánh: `Audit.js › probe ALT00010 fail-closed khi co ung vien ngoai pham vi` kiểm scope ALT00010; phần live còn chờ nghiệm thu.
- [ ] Bộ dữ liệu kiểm chứng có nhiều bản ghi, tối thiểu hai Customer và hai Activity, trong đó có bản ghi giữ nguyên, bản ghi thay đổi, bản ghi mới và bản ghi cần chặn; không dùng một Customer test duy nhất để kết luận. Bằng chứng: Có test nhưng kiểm chuyện khác: `ProductionMatrix.js › pull nhiều Customer tạo đúng ba dòng` có nhiều bản ghi nhưng chưa đủ bộ live bốn nhóm.
- [ ] Mỗi luồng ghi rõ `runId`, mã bản ghi và kết quả cuối; không kết luận từ request FBM thành công nếu chưa đọc xác nhận theo `09.04 Phần 6 — Đẩy xong thì đọc xác nhận`. Bằng chứng: Có test nhưng kiểm chuyện khác: `Push.js › Activity chi tinh thanh cong sau khi doc xac nhan khop hash` kiểm hậu ghi, chưa rà đủ mọi luồng.
- [ ] Mọi lỗi phát sinh trong luồng, kể cả lỗi mạng hoặc relay, phải đồng thời hiện thông báo dễ hiểu ở Sidebar và được GAS ghi vào Sheet `Log`; thiếu một trong hai thì luồng chưa đạt. Bằng chứng: Có test nhưng kiểm chuyện khác: `UserJourneys.js › mọi lỗi lưu kết nối đều hiện Sidebar và ghi Sheet Log` và `Orchestration.js › lỗi cầu nối đã kết thúc vẫn cho phép hủy liên kết` kiểm một số lớp lỗi, chưa đủ mọi luồng.
- [ ] Thông báo và Log không được chứa cookie, mật khẩu, khóa relay, `authorized`, token hoặc payload nhạy cảm. Bằng chứng: Đã có test đúng nhánh: `extensionBridge.js › relay nền báo lỗi transport về GAS một lần khi Sidebar đóng` và `Workflow.js › DTO Sidebar: khong lo cookie, Authorized, lookup noi bo hay lock qua bien gioi UI`.
- [ ] Không chủ động mô phỏng lỗi ngoài phạm vi; nếu lỗi phát sinh tự nhiên, ghi lại và áp quy tắc Sidebar + `Log`. Bằng chứng: Chưa có test; đây là quy tắc thực hiện nghiệm thu.

## Ma trận luồng cần kiểm

| Mã | Luồng | Kết quả nguy hiểm cần bảo vệ | Cách kiểm chứng dự kiến |
|---|---|---|---|
| F01 | Kiểm tra an toàn | Không được ghi Sheet dữ liệu hoặc ghi FBM | Xem các dòng con tự động/thật |
| F02 | Lấy Customer đã liên kết từ FBM | Cập nhật đúng dòng, không ghi đè trường ngoài phạm vi | Xem các dòng con tự động/thật |
| F03 | Lấy Customer mới từ FBM | Tạo đúng một dòng, đủ ID và baseline | Xem các dòng con tự động/thật |
| F04 | Lấy Activity từ FBM | Nối đúng Customer, không tạo trùng, giữ dữ liệu nguyên trạng | Xem các dòng con tự động/thật |
| F05 | Đẩy Customer đã có FBM_ID | Ghi đúng bản ghi và chỉ chốt sau đối soát | Xem các dòng con tự động/thật |
| F06 | Đẩy Activity đã có FBM_ID | Giữ `owner`, thời gian và fileticket, không ghi sai bản ghi | Xem các dòng con tự động/thật |
| F07 | Tạo Customer mới trên FBM | Chuỗi nhiều bước không tạo trùng và không ghi baseline sớm | Xem các dòng con tự động/thật |
| F08 | Tạo Activity mới trên FBM | Có dấu nhận diện, đúng Customer cha, không gửi trùng | Xem các dòng con tự động/thật |
| F09 | Đồng bộ hai chiều | Pull trước, push sau, không nhân bản hoặc ghi đè ngược | Xem các dòng con tự động/thật |
| F10 | Conflict và quyết định của người dùng | Không tự chọn bên thắng, không ghi đè thay đổi mới | Xem các dòng con tự động/thật |
| F11 | Vắng mặt và xóa an toàn | Không tự soft-delete hoặc gửi Delete lên FBM | Xem các dòng con tự động/thật |
| F12 | Đồng bộ nền và tiếp tục phiên | Không chạy song song, không mất cursor sau mỗi lát | Xem các dòng con tự động/thật |
| F13 | Công tắc và chấp thuận nguy hiểm | Chặn ghi trước khi có đủ điều kiện | Xem các dòng con tự động/thật |
| F14 | Liên kết tài khoản và preflight | Không ghi nhầm sang Spreadsheet/tài khoản FBM khác | Xem các dòng con tự động/thật |
| E01 | FBM trả 401/hết phiên | Cổng phiên tự xử lý login/resume hữu hạn, không retry ghi mù | Xem các dòng con tự động/thật |
| E02 | Extension/relay không sẵn sàng | Không cấp request FBM ngoài cổng, không dừng im lặng; thiếu tab thì cổng trả chỉ dẫn tự mở | Xem các dòng con tự động/thật |
| E03 | Extension mất kết nối giữa luồng | Giữ con trỏ an toàn, không tạo trùng khi tiếp tục | Tự động; nếu phát sinh live cần người dùng đối chiếu |
| E04 | Sheet thiếu cột hoặc trùng mã khách | Fail-closed trước khi ghi, báo rõ và ghi Log | Tự động và kiểm chứng trên bản sao DEV |
| E05 | Dữ liệu danh mục/ngày/khóa bất thường | Chặn đúng bản ghi, không ghi dữ liệu sai | Tự động và kiểm chứng trên bản sao DEV |
| E06 | Hạn mức và giới hạn nền tảng | Chạm trần thời gian hoặc dung lượng vẫn giữ state/cursor, không ghi hỏng; batch và delay được áp dụng | Xem các dòng con tự động/thật |
| E07 | HTTP/parse lỗi | HTTP 500 hoặc HTML lỗi bị fail-closed, không biến thành kết quả rỗng | Xem các dòng con tự động/thật |
| S01 | Nơi lưu và quyền đọc mật khẩu FBM | Chỉ envelope đã mã hóa đi qua GAS; Sidebar/Log/fixture không nhận mật khẩu bản rõ | Xem các dòng con tự động/thật |
| F15 | Phiên rỗng hai phía | Không phát request ghi, không thay đổi Sheet/FBM, tổng kết là 0 thay đổi | Xem các dòng con tự động/thật |

## F01 — Kiểm tra an toàn

**Điều kiện đầu:** Spreadsheet DEV đã liên kết đúng tài khoản FBM, tab FBM đang mở và có dữ liệu nhưng chưa cho phép ghi thật trong luồng này.

- [ ] 1a. GAS trả DTO của mode `Kiểm tra an toàn` với trạng thái liên kết và quyền ghi là chỉ đọc; không cấp request ghi → `09.01 Phần 2 — Cổng điều khiển và adapter kênh` và `09.08 Bố cục màn hình` là output kỳ vọng. Bằng chứng: Đã có test đúng nhánh: `Workflow.js › phan quyen ghi theo mode: check khong ghi, read chi ghi Sheet, push chi ghi FBM` (phân quyền check/read/push và DTO Sidebar).
- [ ] 1b. `[Cần kiểm chứng thật]` Sidebar hiển thị đúng mode, trạng thái liên kết và nút chạy khi người dùng mở màn hình → không phát request ghi. Bằng chứng: Có test nhưng kiểm chuyện khác: `UserJourneys.js › nguoi dung chon bon loai dong bo thi Sidebar gui dung mode da chon` kiểm chọn mode, chưa kiểm nghiệm thu card live.
- [ ] 2. GAS kiểm tra đủ bốn giá trị binding, trạng thái phiên, Category, cấu trúc hash và dữ liệu liên kết → trả DTO kết quả; Customer, Activity, cursor nghiệp vụ và baseline không đổi. Bằng chứng: Đã có test đúng nhánh: `Workflow.js › tu dong dien: GAS cap dung mot grid User va khong xin Authorized khong dung` (identity/check gate) và `Preflight.js › preflight báo Activity đổi nhưng chưa bật quyền đẩy`.
- [ ] 3. `[Cần kiểm chứng thật]` Extension chuyển request đọc qua tab FBM → FBM chỉ nhận request đọc; người dùng đối chiếu không có thay đổi dữ liệu trên FBM. Bằng chứng: Chưa có test; đây là kiểm chứng live.
- [ ] 4a. GAS ghi tổng kết/lỗi của lượt vào Sheet `Log` với lý do an toàn → không có cookie, mật khẩu, `authorized`, token hoặc payload. Bằng chứng: Đã có test đúng nhánh: `Workflow.js › DTO Sidebar: khong lo cookie, Authorized, lookup noi bo hay lock qua bien gioi UI` (log tổng hợp/DTO) và `UserJourneys.js › mọi lỗi lưu kết nối đều hiện Sidebar và ghi Sheet Log` (lỗi Sidebar + Log).
- [ ] 4b. `[Cần kiểm chứng thật]` Sidebar hiển thị tổng kết hoặc lỗi trong card thao tác sau khi relay kết thúc. Bằng chứng: Có test nhưng kiểm chuyện khác: `Sidebar.js › Lỗi mạng và lỗi bridge đều hiện Sidebar và gọi ghi Sheet Log` kiểm render Results, chưa kiểm lượt live này.

## F02 — Lấy Customer đã liên kết từ FBM → ShinCRM

**Điều kiện đầu:** Có ít nhất hai Customer đã có `@CUS_FBM_ID` và baseline; một bản ghi được sửa trên FBM, một bản ghi không đổi; các mã danh mục đều có trong `Category`.

- [ ] 1. `[Cần kiểm chứng thật]` Người dùng chọn `Lấy từ FBM → ShinCRM` trên dữ liệu DEV → Sidebar hiển thị pipeline `Kiểm tra phiên → Category → Customer → Đối soát → Cập nhật Sheet`. Bằng chứng: Có test nhưng kiểm chuyện khác: `UserJourneys.js › nguoi dung chon bon loai dong bo thi Sidebar gui dung mode da chon` kiểm mode, chưa kiểm pipeline live.
- [ ] 2. GAS kéo đủ grid Customer, nối cột lần đầu bằng `AliasName` rồi dùng cursor cho trang tiếp theo → không dùng index cứng và không bỏ sót bản ghi. Bằng chứng: Đã có test đúng nhánh: `Pull.js › Pull ghi log từng record co huong trang thai truoc sau va ly do` và `Workflow.js › moi pipeline co nguon, trigger, ket qua quan sat va bang chung bat buoc` (grid/cursor/projection).
- [ ] 3. Bản ghi FBM đã đổi được ghép theo `@CUS_FBM_ID` → chỉ trường đồng bộ thay đổi được ghi đúng dòng; trường quản trị/lõi không bị thay thế. Bằng chứng: Đã có test đúng nhánh: `Pull.js › mode read ghi ket qua pull vao ShinCRM nhung khong co quyen ghi FBM` (ghép và cửa ghi pull).
- [ ] 4. Bản ghi không đổi được đối soát lại → không ghi thừa, baseline chỉ cập nhật khi hash hai phía khớp theo `09.04 Phần 6 — Phép so ba chiều` và `09.04 Phần 6 — Đẩy xong thì đọc xác nhận`. Bằng chứng: Đã có test đúng nhánh: `Reconcile.js › FBM khong doi sau push thanh notApplied va khoa record` và `Pull.js › ba hash khong doi khong ghi noi dung`.
- [ ] 5a. Cửa ghi lưu nội dung, ID, hash và trạng thái trong một lượt khóa; không cấp request ghi FBM trong mode pull → `09.04 Phần 7 — Lượt ghi của fbm_sync` là output kỳ vọng. Bằng chứng: Đã có test đúng nhánh: `Workflow.js › phan quyen ghi theo mode: check khong ghi, read chi ghi Sheet, push chi ghi FBM` (phân quyền chiều pull) và `Push.js › push loi luu hash local de chan lap lai` (khóa/commit).
- [ ] 5b. `[Cần kiểm chứng thật]` Sidebar hiển thị số hoàn tất và Sheet `Log` có tổng kết phiên. Bằng chứng: Có test nhưng kiểm chuyện khác: `Sidebar.js › Results Tổng hợp hiển thị đầy đủ Category, Activity missing, preflight và HTTP` kiểm Results, chưa kiểm ca pull live này.
- [ ] 6a. Đọc lại sau pull cho kết quả đúng giá trị FBM; không tự điền rỗng hoặc giá trị mặc định cho trường nghiệp vụ → `09.04 Phần 7 — Luật ghi ở chiều lấy về` là output kỳ vọng. Bằng chứng: Đã có test đúng nhánh: `Pull.js › mode read ghi ket qua pull vao ShinCRM nhung khong co quyen ghi FBM`.
- [ ] 6b. `[Cần kiểm chứng thật]` Người dùng đối chiếu một Customer đã sửa và một Customer không đổi trên Sheet DEV. Bằng chứng: Chưa có test; cần dữ liệu live/DEV.

## F03 — Lấy Customer mới từ FBM → ShinCRM

**Điều kiện đầu:** Có Customer mới trên FBM chưa có dòng tương ứng trong Sheet; MST nối được đúng một dòng hoặc không có dòng local; mã danh mục hợp lệ.

- [ ] 1. `[Cần kiểm chứng thật]` Người dùng chạy pull với Customer mới → Sidebar báo bản ghi mới, không báo lỗi hoặc conflict giả. Bằng chứng: Có test nhưng kiểm chuyện khác: `Pull.js › Customer pull mới ghi cả định danh baseline và quyền đẩy qua cửa ghi` kiểm dữ liệu pull, chưa kiểm hiển thị live.
- [ ] 2. GAS ghép theo `stt_rec_kh`/MST và trường chưa liên kết → tạo đúng một dòng ShinCRM, chạy lại không tạo bản sao. Bằng chứng: Đã có test đúng nhánh: `Pull.js › Customer trùng MST nhiều dòng thì fail-closed không tạo bản ghi` và `Reconcile.js › ba chieu khong doi`.
- [ ] 3. Cửa ghi cấp `id`, `createdAt`, `recordStatus`, `allowFbmPush`, lưu `@CUS_FBM_ID`, `@CUS_MA_KH_FBM`, hash và trạng thái trong một lượt nguyên tử → `09.04 Phần 6 — Nạp lần đầu và luật tạo dòng mới` là output kỳ vọng. Bằng chứng: Đã có test đúng nhánh: `Pull.js › Customer pull mới ghi cả định danh baseline và quyền đẩy qua cửa ghi`.
- [ ] 4a. GAS tạo một dòng và ghi mã bản ghi vào tổng kết mà không đưa payload/bí mật ra ngoài → `09.07 Phần 11 — Log` là output kỳ vọng. Bằng chứng: Có test nhưng kiểm chuyện khác: `Audit.js › nghiệm thu ALT00010 có case PASS` kiểm Log ALT00010, chưa kiểm Customer mới trong pipeline này.
- [ ] 4b. `[Cần kiểm chứng thật]` Sidebar và Sheet `Log` hiển thị số dòng tạo mới cùng mã bản ghi. Bằng chứng: Có test nhưng kiểm chuyện khác: `Sidebar.js › Results Tổng hợp hiển thị đầy đủ Category, Activity missing, preflight và HTTP` kiểm Results chung.
- [ ] 5a. Chạy lại kỳ sau tra đúng MST, vá ID vào dòng cũ và không tạo Customer thứ hai; baseline chỉ chốt sau khi hash hai phía khớp theo `09.04 Phần 6 — Nạp lần đầu và luật tạo dòng mới`. Bằng chứng: Đã có test đúng nhánh: `Push.js › Customer create mat response chuyen sang request doc MST contains, khong ghi lai` (recovery Customer create) và `Pull.js › Customer pull mới ghi cả định danh baseline và quyền đẩy qua cửa ghi`.
- [ ] 5b. `[Cần kiểm chứng thật]` Người dùng đối chiếu trên Sheet DEV không có Customer thứ hai sau khi chạy lại. Bằng chứng: Chưa có test; cần kiểm chứng dữ liệu.

## F04 — Lấy Activity từ FBM → ShinCRM

**Điều kiện đầu:** Có ít nhất hai Activity FBM, gồm một Activity của đồng nghiệp không có dấu `#SC-A...` và một Activity đã biết hoặc mới; Customer cha có thể nối được; `end_date` hợp lệ.

- [ ] 1. `[Cần kiểm chứng thật]` Người dùng chạy pull và chờ các lớp Activity → Sidebar hiển thị tiến độ, không đứng im khi chờ response. Bằng chứng: Có test nhưng kiểm chuyện khác: `Sidebar.js › Run render giữ pipeline để chẩn đoán lỗi sau request` kiểm render tiến độ, chưa kiểm lượt Activity live.
- [ ] 2. GAS dùng bulk, lớp theo `ngay_gd` và cursor vòng xoay → không bỏ Activity mới hoặc tạo lùi ngày trong phạm vi `09.02 Phần 8 — Hoạt động: ba lớp`. Bằng chứng: Đã có test đúng nhánh: `Pull.js › Activity pull moi noi dung vao Customer noi bo va cho phep day` và `Workflow.js › moi pipeline co nguon, trigger, ket qua quan sat va bang chung bat buoc` (cursor/filter).
- [ ] 3. Activity không có dấu nhận diện được ghép theo `@ACT_FBM_ID` hoặc tạo dòng mới, gán đúng Customer cha, giữ `owner` trong state và không ghi `owner` vào trường đồng bộ → `09.03 Phần 4 — activity`. Bằng chứng: Đã có test đúng nhánh: `Pull.js › Activity pull moi noi dung vao Customer noi bo va cho phep day` và `ProductionMatrix.js › pull nhiều Customer tạo đúng ba dòng`.
- [ ] 4. Dấu `#SC-A...` do ShinCRM tạo được cắt khỏi `content` trước fingerprint → `09.04 Phần 6 — Dấu nhận diện trong nội dung hoạt động`. Bằng chứng: Đã có test đúng nhánh: `Protocol.js › ba chieu khong doi` và `Reconcile.js › ba chieu khong doi`.
- [ ] 5. Cửa ghi lưu Activity, `@ACT_FBM_ID`, hash và trạng thái trong một lượt khóa; không điền `priority`, `dueAt` hoặc trường ngoài grid → `09.03 Phần 4 — activity`. Bằng chứng: Có test nhưng kiểm chuyện khác: `Push.js › push loi luu hash local de chan lap lai` kiểm khóa/commit nhưng chưa đủ trường Activity live.
- [ ] 6a. Chạy lại cùng Activity không tạo dòng trùng; kết quả phân biệt số mới, cập nhật và bỏ qua. Bằng chứng: Đã có test đúng nhánh: `Pull.js › Activity pull moi noi dung vao Customer noi bo va cho phep day` và `ProductionMatrix.js › pull nhiều Activity nội dung vào đúng ba Customer cha`.
- [ ] 6b. `[Cần kiểm chứng thật]` Sidebar và `Log` hiển thị ba bộ đếm của lượt Activity. Bằng chứng: Có test nhưng kiểm chuyện khác: `Sidebar.js › Results Tổng hợp hiển thị đầy đủ Category, Activity missing, preflight và HTTP` kiểm Results tổng hợp.

## F05 — Đẩy Customer đã có FBM_ID → FBM

**Điều kiện đầu:** Một Customer đã liên kết được sửa ở ShinCRM, có `@CUS_CHO_PHEP_FBM = Cho phép`, Category hợp lệ, binding và owner phiên hợp lệ; một Customer khác không thay đổi để kiểm tra không ghi thừa.

- [ ] 1. `[Cần kiểm chứng thật]` Người dùng chọn `Đẩy từ ShinCRM → FBM` → Sidebar hiển thị preview ứng viên và chỉ cấp ghi sau preflight. Bằng chứng: Có test nhưng kiểm chuyện khác: `Preflight.js › preflight mode push van fail-closed theo binding va cac cong thuc te` kiểm cổng, chưa kiểm thao tác live.
- [ ] 2. GAS đọc lại Sheet, tính `hSHIN`, `hFBM`, `hBASE` và chọn đúng bản ghi chỉ-ShinCRM-đổi → Customer không đổi bị bỏ qua. Bằng chứng: Đã có test đúng nhánh: `Push.js › push thanh cong giu baseline cu cho ky xac nhan va dung source push` và `Reconcile.js › FBM khong doi sau push thanh notApplied va khoa record`.
- [ ] 3. Request payload dùng mã Category từ `Category`, đúng trường và không vượt trần độ dài → `09.03 Phần 5 — Hai ràng buộc cứng của chiều đi` là output kỳ vọng; không dùng mã hardcode hoặc trường ngoài schema. Bằng chứng: Đã có test đúng nhánh: `Builders.js › Category lệch chỉ chặn record dùng đúng mã`, `Protocol.js › lookup giu object Rows de doi chieu Category`.
- [ ] 4. `[Cần kiểm chứng thật]` Extension gửi request qua tab FBM đúng phiên → FBM chỉ cập nhật Customer đích, không đổi Customer khác. Bằng chứng: Chưa có test; cần đối chiếu live.
- [ ] 5. Sau response lưu, GAS cấp đọc xác nhận đúng Customer → chỉ khi hash FBM khớp payload mới ghi baseline/trạng thái hoàn tất theo `09.04 Phần 6 — Đẩy xong thì đọc xác nhận`. Bằng chứng: Đã có test đúng nhánh: `Push.js › Activity chi tinh thanh cong sau khi doc xac nhan khop hash` và `Reconcile.js › push loi cung hash khong bi lap lai`.
- [ ] 6a. GAS ghi trạng thái kết quả và `Log` không chứa mật khẩu, cookie hoặc payload → `09.07 Phần 11 — Log` là output kỳ vọng. Bằng chứng: Đã có test đúng nhánh: `Workflow.js › DTO Sidebar: khong lo cookie, Authorized, lookup noi bo hay lock qua bien gioi UI` và `Sidebar.js › Results Tổng hợp hiển thị đầy đủ Category, Activity missing, preflight và HTTP`.
- [ ] 6b. `[Cần kiểm chứng thật]` Sidebar hiển thị kết quả cuối và Sheet phản ánh trạng thái Customer. Bằng chứng: Có test nhưng kiểm chuyện khác: `Sidebar.js › Results Tổng hợp hiển thị đầy đủ Category, Activity missing, preflight và HTTP` kiểm Results tổng quát.

## F06 — Đẩy Activity đã có FBM_ID → FBM

**Điều kiện đầu:** Activity đã liên kết, Customer cha được phép đẩy, Activity có thay đổi nội dung hoặc ngày, owner FBM khớp binding và có fileticket nếu form trả về.

- [ ] 1. GAS kiểm tra Customer cha, `owner`, `workDate`, liên kết và độ dài content sau khi trừ dấu nhận diện → bản ghi không đủ điều kiện bị chặn trước request ghi theo `09.04 Phần 7 — Đủ điều kiện đẩy, tách khỏi hợp lệ`. Bằng chứng: Đã có test đúng nhánh: `Preflight.js › preflight báo Activity đổi nhưng chưa bật quyền đẩy` và `Push.js › Activity edit gui fileticket theo OldValue/NewValue cua fixture`.
- [ ] 2. GAS mở form Edit đúng Activity và lấy `OldValue`, `owner`, `end_time`, `Showing._ticket` → không dựng payload từ timestamp `InternalValues`. Bằng chứng: Có test nhưng kiểm chuyện khác: `Builders.js › Activity edit gui fileticket theo OldValue/NewValue cua fixture` kiểm payload chung, chưa chốt đủ ca form Edit Activity.
- [ ] 3. GAS dựng request giữ ngày/giờ và gửi `fileticket` → không mất file đính kèm hoặc đổi giờ ngoài ý muốn theo `09.01 Phần 1 — Sự thật nền về FBM` (sửa bản ghi buộc mở form lấy OldValue). Bằng chứng: Có test nhưng kiểm chuyện khác: `Builders.js › Activity edit gui fileticket theo OldValue/NewValue cua fixture`.
- [ ] 4. `[Cần kiểm chứng thật]` Extension gửi request và FBM lưu đúng Activity đích, không ghi sang Activity khác. Bằng chứng: Chưa có test; cần đối chiếu live.
- [ ] 5. GAS đọc xác nhận sau ghi → baseline chỉ cập nhật khi dữ liệu thực tế khớp; nếu lệch thì giữ `hPUSH`, báo chưa xác nhận và không gửi lại lệnh ghi theo `09.04 Phần 6 — Đẩy xong thì đọc xác nhận`. Bằng chứng: Đã có test đúng nhánh: `Push.js › Activity chi tinh thanh cong sau khi doc xac nhan khop hash` và `Reconcile.js › ba chieu khong doi`.
- [ ] 6a. GAS ghi kết quả, owner và mã Activity vào DTO/`Log` mà không lộ bí mật theo `09.07 Phần 11 — Log`. Bằng chứng: Có test nhưng kiểm chuyện khác: `Sidebar.js › Results Tổng hợp hiển thị đầy đủ Category, Activity missing, preflight và HTTP` kiểm Results, chưa kiểm owner live.
- [ ] 6b. `[Cần kiểm chứng thật]` Sidebar hiển thị kết quả cuối và người dùng đối chiếu owner/mã Activity trên FBM. Bằng chứng: Chưa có test; cần đối chiếu live.

## F07 — Tạo Customer mới từ ShinCRM → FBM

**Điều kiện đầu:** Customer local chưa có `@CUS_FBM_ID`, có đủ trường FBM bắt buộc, được phép đẩy, `customerPrefix` và `customerCodeLength` đã cấu hình; không dùng dữ liệu khách thật ngoài phạm vi cho phép.

- [ ] 1. Preflight đủ điều kiện và ghi `@CUS_SYNC_TT = đang đẩy` trước request → dừng giữa chừng không tạo lại mù theo `09.05 Phần 10 — Trạng thái vòng đời`. Bằng chứng: Đã có test đúng nhánh: `Push.js › bon mode tach dung quyen ghi Sheet va FBM` và `Preflight.js › preflight mode push van fail-closed theo binding va cac cong thuc te`.
- [ ] 2. `[Cần kiểm chứng thật]` Extension gửi bước mở form/lấy mã rồi gửi dữ liệu theo state GAS → FBM sinh mã đúng `customerPrefix`/`customerCodeLength` trong `09.07 Phần 12 — Cấu hình tài khoản FBM`. Bằng chứng: Chưa có test; cần FBM thật.
- [ ] 3. GAS trích `stt_rec_kh`/`ma_kh`, ghi nội dung, hai ID và trạng thái `chờ đối soát` trong một khóa; baseline để rỗng theo `09.04 Phần 6 — Tạo khách mới: baseline để rỗng`. Bằng chứng: Đã có test đúng nhánh: `Push.js › Activity chi tinh thanh cong sau khi doc xac nhan khop hash`.
- [ ] 4a. Khi mất response cuối, state `đang đẩy` được tra MST chính xác ở kỳ sau, vá ID vào dòng cũ và không tạo Customer trùng. Bằng chứng: Đã có test đúng nhánh: `Push.js › Customer create mat response chuyen sang request doc MST contains, khong ghi lai` (recovery Customer create).
- [ ] 4b. `[Cần kiểm chứng thật]` Người dùng đối chiếu Sheet DEV sau khi chạy lại không có dòng Customer thứ hai. Bằng chứng: Chưa có test; cần kiểm dữ liệu.
- [ ] 5a. GAS giữ trạng thái lỗi/đối soát chưa xong và không retry request ghi mù theo `09.04 Phần 6 — Đẩy xong thì đọc xác nhận`. Bằng chứng: Đã có test đúng nhánh: `Push.js › HTTP 500 cho phep retry doc co gioi han va giu cursor`.
- [ ] 5b. `[Cần kiểm chứng thật]` Sidebar và `Log` hiển thị từng kết quả của chuỗi tạo Customer. Bằng chứng: Có test nhưng kiểm chuyện khác: `Sidebar.js › Results Tổng hợp hiển thị đầy đủ Category, Activity missing, preflight và HTTP` kiểm Results chung.

## F08 — Tạo Activity mới từ ShinCRM → FBM

**Điều kiện đầu:** Activity local mới có Customer cha đã có FBM_ID và được phép đẩy; Activity có ngày hợp lệ và content còn chỗ cho dấu `#SC-A...`.

- [ ] 1. GAS kiểm tra Customer cha, quyền đẩy, độ dài content và gắn đúng một dấu `#SC-A<id>` ở cuối payload → chạy lại không gắn dấu lặp theo `09.04 Phần 6 — Dấu nhận diện trong nội dung hoạt động`. Bằng chứng: Đã có test đúng nhánh: `Builders.js › Activity tạo mới dùng type lưu form` và `Reconcile.js › push loi cung hash khong bi lap lai`.
- [ ] 2. `[Cần kiểm chứng thật]` Extension gửi request tạo Activity → FBM lưu đúng Customer cha, ngày làm việc và nội dung có dấu nhận diện. Bằng chứng: Chưa có test; cần đối chiếu live.
- [ ] 3. GAS nhận `@ACT_FBM_ID`, ghi trạng thái/hash và chỉ chốt baseline sau đọc xác nhận theo `09.04 Phần 6 — Đẩy xong thì đọc xác nhận`. Bằng chứng: Đã có test đúng nhánh: `Push.js › Activity chi tinh thanh cong sau khi doc xac nhan khop hash` và `Reconcile.js › push loi cung hash khong bi lap lai`.
- [ ] 4a. Pull sau đó ghép dấu nhận diện vào đúng dòng local, không tạo Activity thứ hai. Bằng chứng: Đã có test đúng nhánh: `Pull.js › Activity pull moi noi dung vao Customer noi bo va cho phep day`.
- [ ] 4b. `[Cần kiểm chứng thật]` Người dùng đối chiếu Activity đích trên FBM và Sheet DEV. Bằng chứng: Chưa có test; cần đối chiếu live.
- [ ] 5a. Không có request Delete trong chuỗi tạo Activity theo `09.05 Phần 9 — Hệ không bao giờ tự gửi lệnh xóa lên FBM`. Bằng chứng: Đã có test đúng nhánh: `Audit.js › nghiệm thu ALT00010 có case PASS` và `Workflow.js › moi pipeline co nguon, trigger, ket qua quan sat va bang chung bat buoc`.

## F09 — Đồng bộ hai chiều

**Điều kiện đầu:** Có nhiều Customer/Activity trong bốn nhóm: chỉ FBM đổi, chỉ ShinCRM đổi, hai bên cùng đổi và bản ghi mới ở mỗi phía.

- [ ] 1. `[Cần kiểm chứng thật]` Người dùng chọn `Đồng bộ hai chiều` → Sidebar công bố thứ tự pull, xử lý pull/conflict rồi mới push ứng viên. Bằng chứng: Có test nhưng kiểm chuyện khác: `Workflow.js › read rong: pipeline di het session, lookup va Customer grid qua Extension roi ket thuc` kiểm state thứ tự, chưa kiểm pipeline live.
- [ ] 2. GAS hoàn tất pull và ghi state trước khi dựng push → Activity local chỉ đẩy sau khi Customer cha có mã FBM theo `09.02 Phần 3 — Thứ tự trong một kỳ`. Bằng chứng: Đã có test đúng nhánh: `Workflow.js › moi pipeline co nguon, trigger, ket qua quan sat va bang chung bat buoc` và `Push.js › push thanh cong giu baseline cu cho ky xac nhan va dung source push`.
- [ ] 3a. Bản ghi chỉ FBM đổi được lấy về, chỉ ShinCRM đổi được đẩy, bản ghi không đổi không bị ghi; mã và số lượng phải khớp state. Bằng chứng: Đã có test đúng nhánh: `Pull.js › Pull ghi log từng record co huong trang thai truoc sau va ly do`, `Push.js › bon mode tach dung quyen ghi Sheet va FBM` và `Reconcile.js › FBM khong doi sau push thanh notApplied va khoa record`.
- [ ] 3b. `[Cần kiểm chứng thật]` Người dùng đối chiếu preview/kết quả trên bộ nhiều Customer/Activity. Bằng chứng: Chưa có test; cần bộ dữ liệu nhiều bản ghi.
- [ ] 4a. Bản ghi hai bên cùng đổi chuyển thành `xung đột chờ quyết`, không chọn bên thắng hoặc cập nhật baseline theo `09.04 Phần 6 — Phép so ba chiều` và `09.04 Phần 6 — Xung đột hiện ra thế nào`. Bằng chứng: Đã có test đúng nhánh: `Reconcile.js › ba chieu bat conflict hai phia`.
- [ ] 4b. `[Cần kiểm chứng thật]` Người dùng mở hàng đợi conflict để xác nhận bản ghi không bị ghi đè. Bằng chứng: Có test nhưng kiểm chuyện khác: `Sidebar.js › Lỗi xử lý xung đột hiện rõ và không khóa nút` kiểm DTO conflict, chưa kiểm live.
- [ ] 5a. GAS ghi tổng `Hoàn tất/Conflict/Lỗi/Bỏ qua` vào state/`Log` và không có ghi im lặng theo `09.07 Phần 11 — Log`. Bằng chứng: Có test nhưng kiểm chuyện khác: `Audit.js › nghiệm thu ALT00010 có case PASS` kiểm Log ALT00010, chưa đủ tổng kết hai chiều.
- [ ] 5b. `[Cần kiểm chứng thật]` Sidebar và Sheet hiển thị cùng tổng kết sau khi phiên kết thúc. Bằng chứng: Có test nhưng kiểm chuyện khác: `Sidebar.js › Results Tổng hợp hiển thị đầy đủ Category, Activity missing, preflight và HTTP` kiểm Results chung.

## F10 — Conflict và quyết định của người dùng

**Điều kiện đầu:** Một Customer hoặc Activity có `hFBM`, `hSHIN`, `hBASE` khác nhau rõ ràng.

- [ ] 1. Kỳ đồng bộ phát hiện ba hash khác nhau → ghi `xung đột chờ quyết`, đóng băng bản ghi, không ghi baseline và ghi Log theo `09.04 Phần 6 — Phép so ba chiều`. Bằng chứng: Đã có test đúng nhánh: `Reconcile.js › ba chieu bat conflict hai phia`.
- [ ] 2. `[Cần kiểm chứng thật]` Người dùng mở màn hình `Xung đột` → Sidebar chỉ hiển thị DTO, trường khác nhau và hai giá trị FBM/ShinCRM; không lộ baseline/payload theo `09.08 Màn hình Kết quả & xử lý`. Bằng chứng: Có test nhưng kiểm chuyện khác: `Sidebar.js › Run render giữ pipeline để chẩn đoán lỗi sau request` kiểm DTO, chưa kiểm live.
- [ ] 3. `[Cần kiểm chứng thật]` Người dùng chọn `Giữ FBM`, `Giữ ShinCRM` hoặc nhập từng trường → form kiểm đúng kiểu/trần độ dài, không tự trộn ngoài lựa chọn theo `09.08 Conflict và nhập giá trị tùy chỉnh`. Bằng chứng: Chưa có test; cần thao tác UI.
- [ ] 4. Khi xác nhận, GAS đọc lại Sheet và FBM; nếu FBM đổi từ lúc mở thì không chốt, đưa bản ghi về hàng đợi và báo rõ. Bằng chứng: Đã có test đúng nhánh: `Reconcile.js › ba chieu khong doi`.
- [ ] 5. `[Cần kiểm chứng thật]` Người dùng xác nhận khi dữ liệu còn khớp → baseline lấy FBM mới nhất; giữ FBM không push, giữ/trộn ShinCRM chuyển sang chờ đối soát. Bằng chứng: Chưa có test; cần thao tác live.
- [ ] 6a. GAS ghi kết quả quyết định vào `Log` và giữ bản ghi ngoài luồng tự động khi đang chờ quyết theo `09.04 Phần 6 — Chế độ xử lý xung đột riêng`. Bằng chứng: Có test nhưng kiểm chuyện khác: `Reconcile.js › ba chieu bat conflict hai phia` kiểm state, chưa kiểm đồng thời Sidebar + Log.
- [ ] 6b. `[Cần kiểm chứng thật]` Sidebar hiển thị kết quả quyết định và người dùng xác nhận bản ghi không bị xử lý tiếp. Bằng chứng: Chưa có test; cần thao tác live.

## F11 — Vắng mặt và xóa an toàn

**Điều kiện đầu:** Một Customer/Activity đã biết bị thiếu trong kết quả quét FBM; không được giả định nguyên nhân là đã xóa.

- [ ] 1. GAS phát hiện bản ghi vắng → ghi cờ `không thấy bên FBM`, đóng băng và không chạm `@CUS_TT_BAN_GHI`/trạng thái xóa theo `09.05 Phần 9 — Xóa và vắng mặt`. Bằng chứng: Đã có test đúng nhánh: `Reconcile.js › Customer vang chi danh dau missing va bo qua tombstone` và `Pull.js › Bulk Activity vắng được đánh dấu missing khi ID không xuất hiện`.
- [ ] 2. `[Cần kiểm chứng thật]` Người dùng đối chiếu một bản ghi vắng trên FBM → hệ không suy diễn xóa do chuyển giao hoặc đổi quyền nhìn thấy. Bằng chứng: Chưa có test; cần đối chiếu live.
- [ ] 3. Không có request Delete trong mọi luồng → trace/request list không chứa hành động xóa theo `09.05 Phần 9 — Hệ không bao giờ tự gửi lệnh xóa lên FBM`. Bằng chứng: Đã có test đúng nhánh: `Audit.js › nghiệm thu ALT00010 có case PASS` và `Workflow.js › moi pipeline co nguon, trigger, ket qua quan sat va bang chung bat buoc`.
- [ ] 4. `[Cần kiểm chứng thật]` Người dùng chủ động đặt `Ngừng đồng bộ` → kỳ sau bản ghi không bị kéo/đẩy lại; đây là quyết định người dùng theo `09.05 Phần 10 — Cờ cho phép đồng bộ`. Bằng chứng: Có test nhưng kiểm chuyện khác: `Workflow.js › cong tac tong tat: GAS khong cap envelope FBM moi` kiểm công tắc tổng, chưa kiểm ca bản ghi live.
- [ ] 5a. GAS ghi trạng thái vắng và hành động cần người dùng vào `Log` theo `09.07 Phần 11 — Log`. Bằng chứng: Đã có test đúng nhánh: `Audit.js › nghiệm thu ALT00010 có case PASS`.
- [ ] 5b. `[Cần kiểm chứng thật]` Sidebar hiển thị bản ghi vắng và hành động cần người dùng. Bằng chứng: Chưa có test; cần nghiệm thu UI.

## F12 — Đồng bộ nền và tiếp tục phiên

**Điều kiện đầu:** Lịch nền và Extension được cấu hình theo giá trị phổ biến; không có phiên khác đang chạy.

- [ ] 1. `gas_poll` hỏi GAS qua một alarm duy nhất; khi GAS trả `request: null`, Extension không dò tab và không tạo request FBM theo `09.01 Phần 2 — Bộ não ở GAS` và `09.02 Phần 3 — Một alarm Extension`. Bằng chứng: Đã có test đúng nhánh: `Workflow.js › moi pipeline co nguon, trigger, ket qua quan sat va bang chung bat buoc` và `extensionBridge.js › executor không fetch khi GAS không cấp envelope`.
- [ ] 2. Hai lịch đến hạn cùng lúc → GAS chọn một theo ưu tiên, không tạo hai phiên hoặc request song song. Bằng chứng: Đã có test đúng nhánh: `Workflow.js › scheduler GAS khong cap tien trinh song song khi A dang chay` (scheduler ưu tiên/overlap).
- [ ] 3a. Mỗi lát ghi cursor/state vào `DocumentProperties` trước khi kết thúc; service worker thức lại nhận request từ cursor hiện tại, không chạy lại dữ liệu đã chốt theo `09.02 Phần 3 — Nhịp chạy và cắt lát`. Bằng chứng: Đã có test đúng nhánh: `Workflow.js › moi pipeline co nguon, trigger, ket qua quan sat va bang chung bat buoc`, `Orchestration.js › alarm ke tiep tiep tuc cursor sau khi het relay slice` và `extensionBridge.js › executor không fetch khi GAS không cấp envelope`.
- [ ] 3b. `[Cần kiểm chứng thật]` Không cần người dùng tự mở tab: khi policy tự mở bật, Extension nhận `openFbmContext`, tự mở đúng URL và tiếp tục đúng một lần; người dùng chỉ đối chiếu tab/URL. Bằng chứng: Có test nhưng kiểm chuyện khác: `extensionBridge.js › auto-open chỉ mở URL GAS cấp` kiểm auto-open giả lập, chưa nghiệm thu tab FBM thật.
- [ ] 4a. Lệnh thủ công khi nền đang chạy bị chặn/chờ ở cổng, không tạo reservation song song theo `09.08 Điều khiển khi có phiên nền`. Bằng chứng: Đã có test đúng nhánh: `Workflow.js › scheduler GAS khong cap tien trinh song song khi A dang chay` (scheduler overlap) và `Orchestration.js › alarm ke tiep tiep tuc cursor sau khi het relay slice`.
- [ ] 4b. `[Cần kiểm chứng thật]` Sidebar báo đang có phiên nền và chỉ tiếp tục sau lát hiện tại; người dùng không phải tự mở tab FBM. Bằng chứng: Có test nhưng kiểm chuyện khác: `Sidebar.js › Run render giữ pipeline để chẩn đoán lỗi sau request` kiểm trạng thái, chưa kiểm thao tác live.
- [ ] 5a. Tắt lịch nền hoặc công tắc tổng → GAS không cấp request mới, giữ nguyên cursor/state/log/credential/relay; bật lại chỉ mở khóa, không tự ghi tiếp theo `09.02 Phần 3 — Công tắc tổng`. Bằng chứng: Đã có test đúng nhánh: `Workflow.js › log tong hop: recordId rong va khong dua session noi bo vao detail` và `UserJourneys.js › snapshot GAS vá Tài khoản mà giữ nguyên form và mật khẩu bản nháp`.
- [ ] 5b. `[Cần kiểm chứng thật]` Sidebar nói rõ trạng thái khóa; người dùng không cần tự đăng nhập lại hoặc tự mở tab để bật lại. Bằng chứng: Có test nhưng kiểm chuyện khác: `UserJourneys.js › cài đặt phiên ở chế độ xem khóa toàn bộ control thân card` kiểm khóa control, chưa kiểm live.

## F13 — Công tắc và chấp thuận nguy hiểm

### F13-A — `approvalThreshold = 0`

**Điều kiện đầu:** Có ít nhất một bản ghi đủ điều kiện ghi FBM; `approvalThreshold` được lưu đúng bằng `0`.

- [ ] 1. `[Cần kiểm chứng thật]` Người dùng lưu cấu hình ngưỡng `0` → Sidebar đọc lại và hiển thị đúng giá trị, không đọc nhầm Config cũ. Bằng chứng: Có test nhưng kiểm chuyện khác: `Settings.js › luu nguong phe duyet hop le va cho phep nguong 0` kiểm lưu/validation, chưa kiểm Sidebar live.
- [ ] 2. Phiên push có một bản ghi đủ điều kiện → GAS trả `sync_approval_required` trước request ghi đầu tiên. Bằng chứng: Đã có test đúng nhánh: `Push.js › push hon 10 ban ghi phai cho nguoi dung chap thuan`.
- [ ] 3. `[Cần kiểm chứng thật]` Người dùng chọn hủy → không có request ghi FBM, Sheet không đổi, Sidebar và `Log` ghi rõ đã hủy/chưa ghi. Bằng chứng: Có test nhưng kiểm chuyện khác: `UserJourneys.js › mọi lỗi lưu kết nối đều hiện Sidebar và ghi Sheet Log` kiểm callback approve/cancel, chưa kiểm live Sheet/FBM.
- [ ] 4. `[Cần kiểm chứng thật]` Người dùng chạy lại và chọn chấp thuận → chỉ ứng viên preview được cấp request, sau đó đi qua F05/F06/F07/F08. Bằng chứng: Có test nhưng kiểm chuyện khác: `Push.js › push hon 10 ban ghi phai cho nguoi dung chap thuan` kiểm cổng approval, chưa kiểm chuỗi live.

### F13-B — `@CUS_CHO_PHEP_FBM` tắt nhưng có bản ghi thay đổi

**Điều kiện đầu:** Customer đã có FBM_ID và thay đổi ở ShinCRM, nhưng ô cho phép đẩy là rỗng, `Chưa cho phép` hoặc giá trị tầng giữa; Activity con cũng được dùng để kiểm tra kế thừa.

- [ ] 1. Preflight đọc lại Sheet → loại Customer và Activity không đủ quyền khỏi tập push trước khi dựng request FBM. Bằng chứng: Đã có test đúng nhánh: `Preflight.js › preflight báo Activity đổi nhưng chưa bật quyền đẩy` và `Push.js › push thanh cong giu baseline cu cho ky xac nhan va dung source push`.
- [ ] 2. `[Cần kiểm chứng thật]` Người dùng chạy push → Sidebar nói rõ bị chặn do chưa `Cho phép`, không hiển thị như lỗi mạng và không gửi request ghi. Bằng chứng: Có test nhưng kiểm chuyện khác: `Sidebar.js › Lỗi mạng và lỗi bridge đều hiện Sidebar và gọi ghi Sheet Log` kiểm lỗi Results, chưa kiểm cờ live.
- [ ] 3a. GAS giữ nguyên dữ liệu local và ghi lý do chặn vào state/`Log` theo `09.05 Phần 10 — Cờ cho phép đồng bộ`. Bằng chứng: Đã có test đúng nhánh: `Workflow.js › moi pipeline co nguon, trigger, ket qua quan sat va bang chung bat buoc` và `Push.js › bon mode tach dung quyen ghi Sheet va FBM`.
- [ ] 3b. `[Cần kiểm chứng thật]` Sau khi người dùng đổi sang `Cho phép`, Sidebar mới cho chạy lại và người dùng đối chiếu không có request trước đó. Bằng chứng: Chưa có test; cần thao tác live.

### F13-C — Công tắc tổng tắt

- [ ] 1. `[Cần kiểm chứng thật]` Người dùng tắt công tắc tổng khi không có request bay → nút chạy, ghi, auto-login và resolve conflict bị khóa; màn hình chỉ đọc vẫn mở. Bằng chứng: Có test nhưng kiểm chuyện khác: `UserJourneys.js › cài đặt phiên ở chế độ xem khóa toàn bộ control thân card` kiểm khóa control, chưa kiểm live.
- [ ] 2. GAS nhận poll hoặc command khi công tắc tắt → trả `request: null`/trạng thái bị khóa và giữ nguyên cursor, credential, relay, log. Bằng chứng: Đã có test đúng nhánh: `Workflow.js › log tong hop: recordId rong va khong dua session noi bo vao detail`.
- [ ] 3a. Bật lại chỉ mở khóa, không cấp request tự động và không tự ghi tiếp theo `09.02 Phần 3 — Công tắc tổng`. Bằng chứng: Đã có test đúng nhánh: `Workflow.js › moi pipeline co nguon, trigger, ket qua quan sat va bang chung bat buoc`.
- [ ] 3b. `[Cần kiểm chứng thật]` Người dùng phải chọn tiếp tục hoặc phiên mới trên Sidebar. Bằng chứng: Có test nhưng kiểm chuyện khác: `UserJourneys.js › client gửi credential đã mã hóa đúng payload và xóa password sau save` kiểm control, chưa kiểm live.

## F14 — Liên kết tài khoản và preflight

**Điều kiện đầu:** Có Spreadsheet ID thực tế, identity FBM và trạng thái liên kết để kiểm tra đúng/sai; chỉ dùng tài khoản DEV được phép.

- [ ] 1a. Cổng phiên mở request `User` cho thao tác tự điền, trả đúng grid và bản nháp bốn định danh; không lưu binding/chuyển quyền → `09.06 Nhận diện Spreadsheet và kiểm tra liên kết trước khi cấp request nghiệp vụ`. Bằng chứng: Đã có test đúng nhánh: `Workflow.js › tu dong dien: GAS cap dung mot grid User va khong xin Authorized khong dung` và `AutoLogin.js › dang nhap thu sai identity bao loi nhung khong tu tat auto-login`.
- [ ] 1b. `[Cần kiểm chứng thật]` Người dùng bấm `Tự động điền` và đối chiếu bốn định danh; không phải tự mở tab vì cổng tự mở theo policy nếu thiếu tab. Bằng chứng: Có test nhưng kiểm chuyện khác: `Workflow.js › GAS cap lenh mo tab: Extension chi mo dung URL duoc cap va moi gui request` và `extensionBridge.js › auto-open chỉ mở URL GAS cấp` mới giả lập.
- [ ] 2. GAS so sánh tuyệt đối SpreadsheetId, mã user, username và tên đầy đủ → lệch một giá trị trả `REBIND_REQUIRED`, khóa đồng bộ thường/nền theo `09.06 Cổng kiểm tra trước request nghiệp vụ`. Bằng chứng: Đã có test đúng nhánh: `Pull.js › Kiem tra lien ket Customer chi doc ID da lien ket va tra n/N` và `Workflow.js › moi pipeline co nguon, trigger, ket qua quan sat va bang chung bat buoc`.
- [ ] 3a. Lượt kiểm tra liên kết chỉ quét Customer, trả tổng `Hợp lệ/Không tìm thấy/Chưa có FBM_ID`, không ghi Sheet hoặc FBM theo `09.06 Nhận diện Spreadsheet và kiểm tra liên kết`. Bằng chứng: Đã có test đúng nhánh: `Workflow.js › moi pipeline co nguon, trigger, ket qua quan sat va bang chung bat buoc`.
- [ ] 3b. `[Cần kiểm chứng thật]` Người dùng đối chiếu tổng trên Sidebar với Sheet DEV sau khi cổng phiên hoàn tất. Bằng chứng: Có test nhưng kiểm chuyện khác: `Sidebar.js › Results Tổng hợp hiển thị đầy đủ Category, Activity missing, preflight và HTTP` kiểm Results chung.
- [ ] 4a. Login test đi qua cổng phiên; identity lệch bị fail-closed, không bật auto-login hoặc thay binding theo `09.06 Trạng thái phiên đăng nhập`. Bằng chứng: Đã có test đúng nhánh: `AutoLogin.js › log session gate khong chua bi mat hoac payload nhay cam` và `Workflow.js › log tong hop: recordId rong va khong dua session noi bo vao detail`.
- [ ] 4b. `[Cần kiểm chứng thật]` Người dùng giữ tab FBM thật để đối chiếu đúng/sai identity; không tự đăng nhập lại ngoài thao tác `Đăng nhập thử`. Bằng chứng: Chưa có test; cần identity thật.
- [ ] 5. Chưa có binding hoặc đang `REBIND_REQUIRED` → request nghiệp vụ thường bị chặn trước khi cấp envelope FBM theo `09.06 Cổng kiểm tra trước request nghiệp vụ`. Bằng chứng: Đã có test đúng nhánh: `Pull.js › Kiem tra lien ket Customer chi doc ID da lien ket va tra n/N`, `Workflow.js › tu dong dien: GAS cap dung mot grid User va khong xin Authorized khong dung` và `extensionBridge.js › executor không fetch khi GAS không cấp envelope`.

## E01 — FBM trả 401 hoặc phiên đăng nhập hết hạn

**Điều kiện đầu:** Cổng phiên có credential envelope đã lưu; request nhận 401/403 hoặc body `Login.aspx`; policy auto-login đang bật hoặc có lý do fail-closed tương ứng. Người dùng không tự đăng nhập lại trong ca này.

- [ ] 1. Transport phân loại 401/403/`Login.aspx` là `SESSION_EXPIRED` theo `09.01 Phần 1 — Phân biệt hai loại thất bại` → không kết luận ghi thành công, không cập nhật baseline và không retry request ghi mù. Bằng chứng: Đã có test đúng nhánh: `Protocol.js › body Login.aspx voi HTTP 200 bi nhan la het phien`, `AutoLogin.js › FBM 401 di qua cong session va bat dau auto-login mot lan` và `extensionBridge.js › executor không fetch khi GAS không cấp envelope`.
- [ ] 2. Cổng phiên tự khởi động tối đa một tiến trình login mềm, giữ cursor/reservation, rồi resume đúng một lần sau khi login thành công theo `09.06 Trạng thái phiên đăng nhập` và checklist cổng phiên F2. Bằng chứng: Đã có test đúng nhánh: `AutoLogin.js › log session gate khong chua bi mat hoac payload nhay cam` và `extensionBridge.js › executor không fetch khi GAS không cấp envelope`.
- [ ] 3. Nếu login thất bại hoặc bị throttle, GAS đóng lát ở cursor an toàn, đặt state lỗi/tạm dừng và ghi `Log` với `action/entity/runId/reason`; không chứa cookie, password, `authorized` hoặc payload. Bằng chứng: Đã có test đúng nhánh: `AutoLogin.js › log session gate khong chua bi mat hoac payload nhay cam`, `Orchestration.js › alarm ke tiep tiep tuc cursor sau khi het relay slice` và `UserJourneys.js › mọi lỗi lưu kết nối đều hiện Sidebar và ghi Sheet Log`.
- [ ] 4. `[Cần kiểm chứng thật]` Người dùng giữ tab FBM/Extension để quan sát cổng tự login hoặc tự mở context; không tự nhập lại mật khẩu và không tự mở tab trong lúc chạy. Bằng chứng: Có test nhưng kiểm chuyện khác: `extensionBridge.js › auto-open chỉ mở URL GAS cấp` giả lập auto-open/login, chưa nghiệm thu tài khoản thật.
- [ ] 5a. GAS tạo DTO lỗi để Sidebar đọc lại và không cấp request nghiệp vụ kế tiếp khi state chưa xác nhận. Bằng chứng: Đã có test đúng nhánh: `AutoLogin.js › login thành công dựng lại request grid theo cursor` và `Orchestration.js › trace client ghi theo lo mot lan`.
- [ ] 5b. `[Cần kiểm chứng thật]` Sidebar hiển thị thông báo hết phiên dễ hiểu ngay tại card thao tác; người dùng đối chiếu không có ghi nhầm. Bằng chứng: Có test nhưng kiểm chuyện khác: `Sidebar.js › Lỗi mạng và lỗi bridge đều hiện Sidebar và gọi ghi Sheet Log` kiểm render lỗi chung.

## E02 — Extension/relay không sẵn sàng

**Điều kiện đầu:** GAS có việc nhưng Extension chưa bắt tay, relay config không có/không hợp lệ, hoặc không tìm thấy tab FBM. Việc thiếu tab thuộc policy của cổng phiên: cổng trả `openFbmContext` để Extension tự mở nếu được phép; không yêu cầu người dùng tự mở tab.

- [ ] 1. GAS không cấp envelope nghiệp vụ khi handshake/relay config không hợp lệ; nếu chỉ thiếu tab và policy cho phép thì GAS trả `openFbmContext` đúng URL, Extension tự mở và chỉ thử lại một lần theo checklist cổng phiên F3. Bằng chứng: Đã có test đúng nhánh: `Workflow.js › moi pipeline co nguon, trigger, ket qua quan sat va bang chung bat buoc` và `extensionBridge.js › auto-open chỉ mở URL GAS cấp`.
- [ ] 2. `[Cần kiểm chứng thật]` Người dùng bấm chạy khi Extension chưa kết nối → Sidebar báo thiếu handshake/relay; khi chỉ thiếu tab, người dùng quan sát Extension tự mở tab theo URL GAS cấp, không tự mở tay. Bằng chứng: Có test nhưng kiểm chuyện khác: `extensionBridge.js › auto-open chỉ mở URL GAS cấp` mô phỏng bridge/auto-open, chưa kiểm live.
- [ ] 3a. Cursor/reservation không nhảy khi thiếu relay hoặc tab; không ghi Sheet dữ liệu và không gửi FBM. Bằng chứng: Đã có test đúng nhánh: `Orchestration.js › lỗi cầu nối đã kết thúc vẫn cho phép hủy liên kết`, `Workflow.js › moi pipeline co nguon, trigger, ket qua quan sat va bang chung bat buoc` và `extensionBridge.js › relay nền báo lỗi transport về GAS một lần khi Sidebar đóng`.
- [ ] 3b. GAS ghi lỗi transport vào Sheet `Log`, không `catch` rỗng hoặc chỉ console; Sidebar có DTO lỗi để hiển thị lại. Bằng chứng: Đã có test đúng nhánh: `Orchestration.js › lỗi cầu nối đã kết thúc vẫn cho phép hủy liên kết`, `UserJourneys.js › mọi lỗi lưu kết nối đều hiện Sidebar và ghi Sheet Log` và `extensionBridge.js › relay nền báo lỗi transport về GAS một lần khi Sidebar đóng`.
- [ ] 4. `[Cần kiểm chứng thật]` Sau khi relay handshake được khôi phục hoặc cổng tự mở tab xong, người dùng chạy lại; hệ tiếp tục từ state an toàn và không tạo trùng. Bằng chứng: Chưa có test; cần thao tác thật.

## E03 — Extension mất kết nối giữa chừng

**Điều kiện đầu:** Một phiên nhiều lát đang chạy; Extension/service worker bị dừng hoặc relay mất kết nối sau khi đã có dữ liệu ở các lát trước.

- [ ] 1. Lát đã ghi thành công trước mất kết nối giữ cursor/kết quả → lượt sau không chạy lại bản ghi đã chốt. Bằng chứng: Đã có test đúng nhánh: `Orchestration.js › alarm ke tiep tiep tuc cursor sau khi het relay slice` và `Push.js › bon mode tach dung quyen ghi Sheet va FBM`.
- [ ] 2. Lát mất kết nối chưa có response không đánh dấu hoàn tất/baseline → state cho phép tiếp tục hoặc yêu cầu đối chiếu an toàn. Bằng chứng: Đã có test đúng nhánh: `Orchestration.js › alarm ke tiep tiep tuc cursor sau khi het relay slice` và `extensionBridge.js › auto-open tiếp tục sau khi tab FBM ready`.
- [ ] 3. Retry sau nối lại tra cứu Customer `đang đẩy` theo MST; Activity chưa xác nhận không gửi lại mù theo `09.04 Phần 6 — Đẩy xong thì đọc xác nhận`. Bằng chứng: Đã có test đúng nhánh: `Push.js › Customer create mat response chuyen sang request doc MST contains, khong ghi lai`.
- [ ] 4a. GAS ghi lỗi relay/trạng thái chưa hoàn tất vào `Log` với các trường tối thiểu của `09.07 Phần 11 — Log`; không để state chuyển thành hoàn tất. Bằng chứng: Đã có test đúng nhánh: `Orchestration.js › lỗi cầu nối đã kết thúc vẫn cho phép hủy liên kết` và `extensionBridge.js › relay nền báo lỗi transport về GAS một lần khi Sidebar đóng`.
- [ ] 4b. `[Cần kiểm chứng thật]` Sidebar hiển thị lỗi relay dễ hiểu sau khi mở lại; người dùng đối chiếu không tưởng phiên đã xong. Bằng chứng: Có test nhưng kiểm chuyện khác: `Sidebar.js › Lỗi mạng và lỗi bridge đều hiện Sidebar và gọi ghi Sheet Log` kiểm Results lỗi, chưa kiểm mở lại live.

## E04 — Sheet thiếu cột hoặc trùng mã khách

**Điều kiện đầu:** Tạo bản sao DEV của Sheet rồi cố ý thiếu một cột đồng bộ hoặc tạo hai dòng có cùng mã khách/MST trong phạm vi kiểm tra.

- [ ] 1. Preflight phát hiện thiếu cột bắt buộc hoặc mã khách trùng/mơ hồ → dừng trước cửa ghi và trước request FBM nguy hiểm. Bằng chứng: Đã có test đúng nhánh: `Preflight.js › preflight chan Customer moi khi thieu prefix va do dai ma khach FBM`.
- [ ] 2. `[Cần kiểm chứng thật]` Người dùng chạy luồng liên quan → Sidebar chỉ rõ sheet/cột/mã bị lỗi, không báo thành công giả. Bằng chứng: Có test nhưng kiểm chuyện khác: `Sidebar.js › Lỗi mạng và lỗi bridge đều hiện Sidebar và gọi ghi Sheet Log` kiểm lỗi tổng hợp, chưa kiểm thiếu cột live.
- [ ] 3a. GAS ghi lỗi vào `Log`, giữ nguyên dữ liệu không lỗi và không cập nhật baseline/cursor như thể đã xử lý xong theo `09.04 Phần 7 — Lượt ghi của fbm_sync`. Bằng chứng: Đã có test đúng nhánh: `Orchestration.js › alarm ke tiep tiep tuc cursor sau khi het relay slice` và `Push.js › Activity chi tinh thanh cong sau khi doc xac nhan khop hash`.
- [ ] 3b. `[Cần kiểm chứng thật]` Người dùng đối chiếu trên bản sao DEV dữ liệu hợp lệ vẫn nguyên vẹn sau khi ca lỗi kết thúc. Bằng chứng: Chưa có test; cần kiểm Sheet DEV.
- [ ] 4. `[Cần kiểm chứng thật]` Người dùng sửa cấu trúc/dữ liệu trên bản sao DEV rồi chạy lại → chỉ bản ghi hợp lệ được xử lý, không tạo bản sao. Bằng chứng: Chưa có test; cần kiểm bản sao DEV.

## E05 — Dữ liệu danh mục, ngày hoặc khóa bất thường

**Điều kiện đầu:** Dùng bản sao DEV để tạo các ca theo `09.03 Phần 5 — Bảng ánh xạ mã danh mục`, `09.04 Phần 7 — Validate theo nguồn và theo hướng đi`: mã Category không tồn tại/khác tên FBM, Activity thiếu `end_date`, Activity không suy ra Customer cha hoặc MST nối nhiều dòng.

- [ ] 1. Category không gọi được hoặc đối soát sai → toàn bộ chiều push bị chặn; chiều pull chỉ xử lý phần không phụ thuộc mã FBM theo `09.03 Phần 5 — Kiểm danh mục đầu phiên`. Bằng chứng: Đã có test đúng nhánh: `Workflow.js › moi pipeline co nguon, trigger, ket qua quan sat va bang chung bat buoc`, `Protocol.js › lookup giu object Rows de doi chieu Category` và `Preflight.js › preflight mode push van fail-closed theo binding va cac cong thuc te`.
- [ ] 2. FBM trả mã danh mục không có dòng nhận trong `Category` → chỉ bản ghi đó bị cờ mã lạ, không ghi rỗng theo `09.03 Phần 5 — Hai ràng buộc cứng của chiều đi`. Bằng chứng: Đã có test đúng nhánh: `Protocol.js › lookup giu object Rows de doi chieu Category` và `Reconcile.js › ba chieu khong doi`.
- [ ] 3. Activity thiếu ngày hoặc khóa Customer → bản ghi bị chặn/đóng băng, không ghi dòng thiếu liên kết theo `09.04 Phần 7 — Validate theo nguồn và theo hướng đi`. Bằng chứng: Có test nhưng kiểm chuyện khác: `Preflight.js › preflight báo Activity đổi nhưng chưa bật quyền đẩy` kiểm cổng chung, chưa đủ dữ liệu Activity.
- [ ] 4. MST nối nhiều dòng hoặc không nối duy nhất → fail-closed, không tạo Customer trùng theo `09.04 Phần 6 — Nạp lần đầu và luật tạo dòng mới`. Bằng chứng: Đã có test đúng nhánh: `Pull.js › Customer trùng MST nhiều dòng thì fail-closed không tạo bản ghi`.
- [ ] 5a. Mỗi ca ghi một lỗi an toàn vào `Log`; bản ghi hợp lệ khác chỉ được xử lý trong phạm vi cho phép theo `09.07 Phần 11 — Log`. Bằng chứng: Có test nhưng kiểm chuyện khác: `Audit.js › probe ALT00010 fail-closed khi co ung vien ngoai pham vi` kiểm Log ALT00010, chưa đủ từng ca E05.
- [ ] 5b. `[Cần kiểm chứng thật]` Sidebar hiển thị lý do riêng cho từng ca trên bản sao DEV. Bằng chứng: Có test nhưng kiểm chuyện khác: `Sidebar.js › Results Tổng hợp hiển thị đầy đủ Category, Activity missing, preflight và HTTP` kiểm Results tổng hợp.

## E06 — Hạn mức và giới hạn nền tảng

**Điều kiện đầu:** Một bản sao DEV có đủ dữ liệu để chạy quá một lát; state chứa cursor/progress, conflict, khóa và cấu hình trong `DocumentProperties`; cấu hình có `customersPerRun` và khoảng `minDelaySeconds`/`maxDelaySeconds` khác mặc định.

- [ ] 1. Khi lát chạm trần thời gian GAS giữa chừng, hệ dừng trước request kế tiếp, ghi cursor của bản ghi cuối đã chốt vào `DocumentProperties`, đặt trạng thái tạm dừng và không phát lại request đã bay theo `09.02 Phần 3 — Nhịp chạy và cắt lát`. Bằng chứng: Có test nhưng kiểm chuyện khác: `Orchestration.js › lỗi cầu nối đã kết thúc vẫn cho phép hủy liên kết` kiểm giới hạn relay, chưa mô phỏng trần thời gian GAS giữa lát.
- [ ] 2. Khi ghi state chạm trần dung lượng `DocumentProperties`, GAS fail-closed trước khi ghi dở JSON cursor/progress/conflict/khóa/cấu hình; giữ bản state trước đó, trả lỗi lưu state cụ thể và ghi cùng lỗi vào `Log` theo `09.07 Phần 13 — Kiểm chứng còn treo`. Bằng chứng: Chưa có test.
- [ ] 3. Đặt `Số lượng Customer mỗi lượt = 3` → mỗi lát chỉ cấp đúng 3 Customer và cursor chuyển sang Customer thứ 4; không dùng số cứng 30/50. Bằng chứng: Có test nhưng kiểm chuyện khác: `Workflow.js › moi pipeline co nguon, trigger, ket qua quan sat va bang chung bat buoc` kiểm lưu `customersPerRun` và cursor, chưa chứng minh số request thực tế bằng tham số.
- [ ] 4. Đặt `Delay mỗi request = 0,5–2 giây` → envelope kế tiếp mang `waitMs` trong khoảng 500–2000 ms và Extension chỉ gửi sau khoảng chờ đó. Bằng chứng: Có test nhưng kiểm chuyện khác: `Workflow.js › moi pipeline co nguon, trigger, ket qua quan sat va bang chung bat buoc` chỉ kiểm metadata `waitMs`, chưa kiểm thời điểm gửi ở Extension.
- [ ] 5. `[Cần kiểm chứng thật]` Với cấu hình delay an toàn, người dùng đối chiếu timestamp các request liên tiếp và không có burst làm FBM từ chối/mất quyền truy cập; delay được xem là giới hạn truy cập chứ không chỉ là tốc độ. Bằng chứng: Chưa có test; cần FBM thật.
- [ ] 6a. Lỗi trần thời gian hoặc dung lượng đều tạo DTO lỗi Sidebar và một dòng `Log` có `runId`, phase, cursor cuối và lý do an toàn; không có `catch` rỗng. Bằng chứng: Chưa có test.
- [ ] 6b. `[Cần kiểm chứng thật]` Sidebar hiển thị rõ lát bị dừng vì giới hạn nào và hướng chạy tiếp; người dùng xác nhận không có ghi đè dữ liệu. Bằng chứng: Chưa có test; cần nghiệm thu.

## E07 — HTTP 500 hoặc response HTML lỗi

**Điều kiện đầu:** Một request đọc/ghi nhận response HTTP 500 hoặc body là trang HTML lỗi/đăng nhập thay vì JSON grid FBM.

- [ ] 1. Protocol nhận response 500 hoặc HTML không parse được → trả `ok: false` với lớp lỗi HTTP/parse, giữ cursor/reservation an toàn và không biến body thành grid rỗng; không ghi Sheet, không cập nhật baseline. Output đối chiếu `09.01 Phần 1 — Phân biệt hai loại thất bại`. Bằng chứng: Có test nhưng kiểm chuyện khác: `Protocol.js › body Login.aspx voi HTTP 200 bi nhan la het phien` kiểm HTTP 500 JSON và malformed JSON, chưa có HTML error page.
- [ ] 2a. GAS ghi một dòng `Log` lỗi với status/lớp parse, `runId` và requestId; không có payload hoặc bí mật. Bằng chứng: Có test nhưng kiểm chuyện khác: `Orchestration.js › heartbeat HTTP 500 dung phien va tra loi ro rang` kiểm HTTP 500 heartbeat, chưa kiểm HTML.
- [ ] 2b. `[Cần kiểm chứng thật]` Sidebar hiển thị lỗi HTTP/parse dễ hiểu và không hiển thị “0 bản ghi” hoặc “FBM không có dữ liệu”. Bằng chứng: Có test nhưng kiểm chuyện khác: `Sidebar.js › Results Tổng hợp hiển thị đầy đủ Category, Activity missing, preflight và HTTP` kiểm hiển thị HTTP 500 trong Results giả lập.
- [ ] 3. `[Cần kiểm chứng thật]` Người dùng chạy một ca đại diện trên DEV/FBM test và đối chiếu Sheet không bị ghi rỗng hoặc reset cursor. Bằng chứng: Chưa có test; cần response thật.

## S01 — Nơi lưu và quyền đọc mật khẩu FBM

**Điều kiện đầu:** Đã cấu hình một credential FBM thử; chỉ dùng tài khoản DEV, không đưa mật khẩu thật vào fixture/log.

- [ ] 1. Extension mã hóa credential trước khi GAS lưu; `DocumentProperties` chỉ chứa envelope opaque, `ScriptProperties` chỉ chứa `FBM_SYNC_KEY`, còn `chrome.storage.local` chỉ giữ cấu hình relay/envelope theo `09.06 Phân biệt bốn nhóm cấu hình` và `09.06 Nơi lưu và quyền sở hữu`. Bằng chứng: Có test nhưng kiểm chuyện khác: `extensionBridge.js › relay nền báo lỗi transport về GAS một lần khi Sidebar đóng` kiểm envelope/bridge và `UserJourneys.js › snapshot GAS vá Tài khoản mà giữ nguyên form và mật khẩu bản nháp` kiểm payload mã hóa, chưa quét quyền đọc toàn module.
- [ ] 2. Chỉ Extension được mã hóa/giải mã credential; GAS chỉ chuyển envelope tới cổng, Sidebar chỉ nhận `usernameHint`/trạng thái và không nhận password bản rõ. Bằng chứng: Có test nhưng kiểm chuyện khác: `extensionBridge.js › executor không fetch khi GAS không cấp envelope` kiểm executor login, chưa chứng minh danh sách caller đầy đủ.
- [ ] 3. Quét toàn bộ Log, Trace và fixture không có password, cookie, envelope, `authorized` hoặc payload; test phải fail nếu chuỗi bí mật lọt ra. Bằng chứng: Đã có test đúng nhánh: `extensionBridge.js › executor không fetch khi GAS không cấp envelope`, `Workflow.js › DTO Sidebar: khong lo cookie, Authorized, lookup noi bo hay lock qua bien gioi UI` và `UserJourneys.js › mọi lỗi lưu kết nối đều hiện Sidebar và ghi Sheet Log`.
- [ ] 4. `[Cần kiểm chứng thật]` Màn hình tài khoản chỉ hiển thị mật khẩu dạng che/ô trống; người dùng xác nhận không thấy mật khẩu trong Sidebar, Sheet `Log` hoặc thông báo. Bằng chứng: Có test nhưng kiểm chuyện khác: `UserJourneys.js › mọi lỗi lưu kết nối đều hiện Sidebar và ghi Sheet Log` kiểm giữ draft password, chưa kiểm nghiệm thu hiển thị thật.

## F15 — Phiên rỗng hai phía

**Điều kiện đầu:** Snapshot Customer/Activity trên Sheet và FBM giống nhau, không có bản ghi mới, sửa, conflict, vắng mặt hoặc ứng viên push.

- [ ] 1. GAS hoàn tất pull/đối soát với bộ đếm `created=0`, `updated=0`, `pushed=0`, `conflict=0`, `error=0`, không cấp request ghi và không thay đổi hash/baseline/cursor ngoài metadata phiên. Bằng chứng: Chưa có test.
- [ ] 2. Extension không gửi request FBM ngoài các request đọc cần thiết; không tạo dòng Sheet, không tạo Log per-record và không phát Delete. Bằng chứng: Có test nhưng kiểm chuyện khác: `Workflow.js › alarm noop: Extension hoi GAS mot lan, khong tim tab va khong fetch FBM` kiểm alarm noop, chưa kiểm phiên hai phía rỗng.
- [ ] 3a. GAS ghi một tổng kết phiên duy nhất vào `Log` với các bộ đếm bằng 0 theo `09.07 Phần 11 — Log`. Bằng chứng: Có test nhưng kiểm chuyện khác: `Audit.js › nghiệm thu ALT00010 có case PASS` kiểm tổng kết ALT00010 có dữ liệu.
- [ ] 3b. `[Cần kiểm chứng thật]` Sidebar hiển thị rõ “không có thay đổi” và người dùng đối chiếu Sheet/FBM vẫn nguyên trạng. Bằng chứng: Chưa có test; cần nghiệm thu DEV/live.

## H. Quét kiến trúc cửa ghi FBM sync

- [ ] 1. Quét toàn bộ `1_ShinCRM_GAS/fbm_sync/**/*.js` sau khi bỏ comment/literal, tìm mọi mutator Sheet (`setValue`, `setValues`, `appendRow`, `clear*`, ...); mọi mutator phải đi qua cửa ghi chung được tài liệu 09.04 Phần 7 và 09.07 Phần 11 cho phép, không có file tự ghi vòng ngoài. Output phải nêu file/dòng vi phạm nếu có. Bằng chứng: Có test nhưng kiểm chuyện khác: `writeGateAudit.js › inventory không bỏ sót file có mutator` quét inventory mutator toàn GAS, chưa khóa riêng bypass trong `fbm_sync/`.
- [ ] 2. Phép quét kiểm chính nó bằng một fixture vi phạm có mutator trong `fbm_sync/` và phải chuyển đỏ; cách kiểm tương tự `renderEngine.js › ca kiểm tra tương ứng` (quét `innerHTML`) và `namespace.js › ca kiểm tra tương ứng` (quét vùng tên). Bằng chứng: Chưa có test.
- [ ] 3. `[Cần kiểm chứng thật]` Không có bước live; người dùng chỉ xem báo cáo quét đỏ/xanh trước khi cho phép chạy thật. Bằng chứng: Chưa có test; cần review báo cáo.

## Điều kiện hoàn thành bước 1

- [ ] Mọi dòng F01–F15, E01–E07, S01 và H đã có điều kiện đầu, input, output kỳ vọng, nhãn kiểm chứng đơn nhất và ô `Bằng chứng` rõ ràng. Bằng chứng: Chưa có test; đây là điều kiện rà tài liệu.
- [ ] Chủ dự án duyệt phạm vi, dữ liệu thử, các bước cần thao tác live và thứ tự thực hiện. Bằng chứng: Chưa có test; chờ chủ dự án duyệt.
- [ ] Chuyển sang bước 2: viết test ưu tiên E06.2, E06.1, E06.4 rồi chạy `node tests/run.js`. Bằng chứng: Chưa có test; đang thực hiện sau khi checklist được duyệt.

## Các điểm cần chủ dự án xác nhận sau khi duyệt checklist

- Sheet DEV/file trắng và tài khoản FBM DEV nào được phép dùng.
- Chính sách tự mở tab FBM, tài khoản DEV dùng để đối chiếu identity và cách xác nhận phạm vi `ALT00010`; không mặc định người dùng phải tự mở tab.
- Bộ dữ liệu live tối thiểu cho các ca tạo/sửa Customer và Activity; không dùng dữ liệu khách thật ngoài phạm vi đã cho phép.
- Những bước người dùng sẽ trực tiếp đối chiếu trên FBM/Sheet sau khi bộ test tự động hoàn tất.

## Tài liệu đã dùng để lập checklist

- `0_Documentation/00. Tài liệu chính thức/09. Đồng bộ FBM/00. Mục lục và phạm vi.md`
- `0_Documentation/00. Tài liệu chính thức/09. Đồng bộ FBM/01. Kiến trúc và giao thức.md`
- `0_Documentation/00. Tài liệu chính thức/09. Đồng bộ FBM/02. Nhịp chạy và pipeline.md`
- `0_Documentation/00. Tài liệu chính thức/09. Đồng bộ FBM/03. Trường và danh mục.md`
- `0_Documentation/00. Tài liệu chính thức/09. Đồng bộ FBM/04. Đối soát, fingerprint và conflict.md`
- `0_Documentation/00. Tài liệu chính thức/09. Đồng bộ FBM/05. Xóa, vắng mặt và cờ đồng bộ.md`
- `0_Documentation/00. Tài liệu chính thức/09. Đồng bộ FBM/06. Bảo mật và cấu hình kết nối.md`
- `0_Documentation/00. Tài liệu chính thức/09. Đồng bộ FBM/07. Log, tham số và nghiệm thu.md`
- `0_Documentation/00. Tài liệu chính thức/09. Đồng bộ FBM/08. UI đồng bộ và cấu hình.md`
- `0_Documentation/Phiên code/Checklist cổng phiên FBM.md` và các commit `caac98d`, `0c7b9f0`
- `tests/contracts/fbmSyncPipeline.js`

## Kịch bản kiểm chứng thật (chạy liền mạch)

- [ ] Kịch bản L1 — mở Spreadsheet DEV, chọn `Kiểm tra an toàn` và `Lấy từ FBM → ShinCRM`: để cổng phiên tự mở tab khi thiếu tab, tự điền bốn định danh, chạy login test nếu cần, rồi đối chiếu Sidebar/`Log`, pipeline, Customer/Activity và việc không có request ghi. Bao phủ các dòng `[Cần kiểm chứng thật]` của F01–F04, F12, F14, E01, E02, E07 và S01.
- [ ] Kịch bản L2 — trên cùng tab và bộ dữ liệu DEV nhiều bản ghi, chạy pull, `Đồng bộ hai chiều`, preview/chấp thuận push, conflict, vắng mặt, Customer/Activity mới và ca rỗng; đối chiếu từng mã bản ghi, bộ đếm, timestamp delay, số Customer mỗi lượt, Sheet và FBM. Bao phủ F02–F11, F13, F15, E05–E07.
- [ ] Kịch bản L3 — bật lịch nền, tắt/bật công tắc, làm gián đoạn relay rồi để cổng tự mở lại tab và tiếp tục; kiểm tra thông báo lỗi, cursor, không tạo trùng, giao diện tài khoản và nơi hiển thị mật khẩu. Bao phủ F12–F14, E01–E03, S01 và các dòng live còn lại.

## Dọn trước production (không thực hiện trong phiên này)

- [ ] Xóa `server/dev/`, đóng deployment DEV, tắt chia sẻ bằng liên kết và tắt `LOG_TRACE` trước khi đưa dữ liệu thật vào production.
