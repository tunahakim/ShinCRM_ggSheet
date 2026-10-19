# Đẩy bản ghi ở mọi mức quét và so hash trước khi ghi FBM

Branch `feature/push-compare` tách từ `feature/expensive-ops`, làm trong worktree `.claude/worktrees/push-compare` vì phiên V33 vẫn dùng thư mục chính. Chủ dự án chốt toàn bộ phương án 2026-10-19. Luật chung: **luôn so giá trị hoặc hash trước khi thay đổi một bản ghi, dù ở ShinCRM hay FBM.**

## Bối cảnh

- Bước đẩy (`transport/PushFlow.js`, `customer_edit_open` / `activity_edit_open`) mở form FBM rồi lưu luôn, không so bản FBM với mốc. An toàn chỉ khi lượt lấy về cùng phiên đã đọc lại đúng bản ghi đó. Ghi đè được: giao dịch cũ bị sửa trên FBM ở chiều Hai chiều (không lộ trên danh sách), và mọi bản ghi ở chiều Chỉ đẩy. Áp cả cho dòng vừa quyết xung đột "lấy ShinCRM".
- Đọc lại sau lưu (`finishPushVerification`) ra xung đột thì dừng cả phiên, trái luật "xung đột không dừng phiên" (09/02 bước 3, 09/04 "Trong lúc chờ quyết").
- Giữ phiên không bao giờ đẩy; bản ghi sửa trên ShinCRM chờ tới lượt quét kế tiếp. Ý chủ dự án: đã cho phép đẩy thì mọi mức quét đều đẩy; chia mức quét chỉ vì FBM đắt.

## Quyết định đã chốt (2026-10-19)

1. Bước mở form sửa so ba bản bằng `FbmSync.threeWay` (hFBM từ form vừa mở qua `verifyFormValues` + `FbmSync.hash`; hSHIN của đúng bản ghi dùng dựng lệnh lưu; hBASE là mốc):
   - Bản FBM = mốc: lưu như hiện nay.
   - Bản FBM khác mốc nhưng = bản ShinCRM: không lưu, cập nhật mốc, "đã đồng bộ", nhả bản ghi.
   - Cả ba khác nhau, hoặc chưa có mốc mà hai bên khác nhau: không lưu, "xung đột chờ quyết", Log, đi tiếp bản ghi sau, không dừng phiên.
   - Chỉ bản FBM đổi (bản ShinCRM = mốc): không lưu, trả dòng về "đã đồng bộ" để chiều lấy về kéo bản FBM.
   - Ngoại lệ: giao dịch còn dấu `#SC` trên FBM vẫn lưu để bỏ dấu khi phép so cho phép.
2. Đọc lại sau lưu ra xung đột: đánh dấu dòng và đi tiếp, không dừng phiên.
3. Log xung đột ở chiều đẩy chỉ ghi tên trường lệch, không ghi giá trị.
4. Bỏ bước đọc lại FBM lúc bấm lưu xung đột: baseline = hash FBM lúc mở. "Lấy FBM" và "tùy chỉnh" lấy giá trị FBM từ Sidebar gửi lại, GAS ghép vào dòng ShinCRM, so hash với hash FBM lúc mở; khác thì không ghi. Phép so phía ShinCRM lúc lưu giữ nguyên. Chỉ làm sau mục 1.
5. Cổng có/không bằng rev sổ nạp lại; Giữ phiên gọi người điều phối đẩy rồi mới đếm, không giới hạn riêng số bản ghi mỗi nhịp. Làm sau V33 chặng 6 (chạm `pushCandidates` và cách đọc Sheet); V17 (mỗi bước đẩy đọc lại cả Sheet) nên xong trước hoặc cùng lúc.

## Checklist

### Nhóm A — So ba bản trước khi lưu FBM

- [x] A1. `continuePush` bước mở form sửa: lấy giá trị bằng `verifyFormValues`, quyết bằng `threeWay` theo quyết định 1; nhánh không lưu ghi dòng qua `pushRowChange`.
- [x] A2. Tách đoạn liệt kê trường lệch thành công cụ dùng chung, chỉ trả tên trường; dùng ở A1 và `finishPushVerification`.
- [x] A3. `finishPushVerification` ra xung đột: đánh dấu dòng, đi tiếp bản ghi sau.
- [x] A4. Test: hash từ form = hash từ lưới (Khách, Giao dịch); FBM đổi sau mốc không phát lệnh lưu, dòng thành xung đột, bản ghi sau vẫn đẩy; FBM = ShinCRM không lưu, cập nhật mốc; FBM = mốc vẫn lưu; chỉ FBM đổi không lưu; đọc lại sau lưu ra xung đột không dừng phiên.
- [x] A5. Sửa 09/04 (mục "Đẩy xong thì đọc xác nhận" và bảng so ba chiều cho chiều đẩy), 09/02 nếu còn câu ngược.
- [x] A6. Nghiệm thu GAS DEV bằng `node tests/gas.js <hàm> --push`.
- [x] A7. Chủ dự án nghiệm thu với ALT00010: sửa khách trên FBM, sửa khác trên ShinCRM, chạy Chỉ đẩy; FBM giữ nguyên, dòng thành xung đột. Lặp lại với một giao dịch cũ.

### Nhóm B — Lưu xung đột không đọc lại FBM

- [x] B1. Sidebar gửi kèm giá trị FBM các trường lệch khi chốt; GAS ghép vào dòng, so hash với hash lúc mở, rồi ghi qua `conflictSettle`; bỏ request đọc lại.
- [x] B2. Test: giá trị gửi lại khác bản đã mở thì không ghi; ShinCRM đổi từ lúc mở thì trả màn xem lại; ba lựa chọn ghi đúng baseline.
- [x] B3. Sửa 09/04 bảng sáu bước, ràng buộc "hFBM phải lấy mới lúc bấm" và câu "state GAS không giữ giá trị hai bên".
- [x] B5. Màn xung đột dùng chung luật với form sửa (chủ dự án duyệt 2026-10-19): ảnh chụp lúc mở nằm ở Sidebar; cửa ghi so trường được quyết với giá trị lúc mở (`writeGateConflicts` nhận `old` của nguồn máy); popup xung đột và popup bận dùng chung `client/ui/recordDecision.html`; sửa 06 Phần 4, 09/04 bước 4, 09/08.
- [x] B6. Sửa lỗi B5: chọn "Lưu giá trị bạn đang chọn" sau khi Sheet đổi lại ghi giá trị Sheet (nghiệm thu ca 4, Website 14:05 thành 14:06). Gốc: `snapshot.old` mang hai vai, vừa là mốc so vừa là giá trị ghi khi chọn ShinCRM (`Conflict.js:184,185`). Chủ dự án duyệt 2026-10-19, kèm hai quyết định: mốc dời sang giá trị Sheet ngay lúc popup hiện và giữ nguyên dù người dùng chọn "Quay lại" (lần Lưu sau không hỏi lại thứ đã thấy, chỉ hỏi khi Sheet đổi thêm); ô xung đột được nhắc trên màn thay vì hỏi lại bằng popup.
  - Vai trò dữ liệu sau khi sửa (mỗi dữ liệu một vai):

    | Dữ liệu | Ai tạo | Ai được đổi | Vai duy nhất |
    |---|---|---|---|
    | `field.left` | GAS lúc mở (giá trị ShinCRM lúc mở) | Chỉ người dùng: chọn "Dùng giá trị trên Sheet" ở popup | Giá trị ShinCRM đang hiện, cũng là giá trị ghi khi chọn ShinCRM |
    | `field.right` | GAS lúc mở (giá trị FBM lúc mở) | Không ai | Giá trị FBM đang hiện, gửi lại thành `fbmValues` |
    | `snapshot.old` | GAS lúc mở | Sidebar khi cửa ghi trả `conflicts` (mốc mới = giá trị Sheet người dùng vừa thấy ở popup), như `top.record` của form | Mốc so ở cửa ghi; không bao giờ là giá trị ghi |
    | `snapshot.openedHash` | GAS lúc mở | Không ai | Hash FBM lúc mở, kiểm `fbmValues` và làm baseline |
    | `merged` (Tùy chỉnh) | Người dùng gõ | Người dùng | Giá trị ghi của trường tự nhập |

  - [x] B6.1. Sidebar `fbmSyncResolveConflict`: dựng `shinValues[field] = field.left` cùng vòng với `fbmValues`, gửi kèm lệnh chốt.
  - [x] B6.2. `FbmSyncService.fbmConfirmConflict` và `ControlPort` `confirm_conflict`: truyền thêm `shinValues`.
  - [x] B6.3. `Conflict.js` `confirmConflict`: chọn ShinCRM thì ghi `shinValues[field]`; `snapshot.old` chỉ còn làm `old`. Thiếu `shinValues` của trường nào có trong `fbmValues` thì trả `CONFLICT_REOPEN`, không ghi. Sửa docstring.
  - [x] B6.4. Test GAS (ProductionMatrix): chọn ShinCRM, Sheet đổi, gửi lại với mốc mới thì ghi đúng giá trị đang hiện; thiếu `shinValues` thì mở lại, không ghi.
  - [x] B6.5. Test Sidebar: chọn "giữ giá trị của tôi" thì lần gửi lại mang `shinValues` là giá trị đang hiện (không phải giá trị Sheet); chọn "Quay lại" rồi Lưu cũng vậy; chọn "Dùng giá trị Sheet" thì `shinValues` là giá trị Sheet.
  - [x] B6.6. Popup chung (`recordDecision.html`): dòng "(lúc mở form: …)" thành "(lần trước bạn thấy: …)" cho cả form và màn xung đột, vì từ popup thứ hai giá trị đó là mốc đã dời; bỏ chữ `opened` khỏi hai bộ chữ.
  - [x] B6.7. Màn xung đột chọn "Quay lại": tô đỏ trường bị sửa trên Sheet như form (`saveFlowPaintInvalid`), giữ trong một bảng riêng của RAM, không lẫn với bảng "chưa chọn" (dòng đếm trường chưa chọn không được tính các trường này); chọn hoặc sửa trường đó thì hết đỏ.
  - [x] B6.8. `node tests/run.js` đạt hết.
  - [x] B6.9. Sửa 09/04 bước 4 và 06 Phần 4: lệnh chốt gửi giá trị hai phía đang hiện, ảnh chụp chỉ là mốc; mốc dời lúc popup hiện, giữ khi Quay lại.
  - [x] B6.10. Commit (lõi GAS, Sidebar, test, tài liệu), đẩy DEV, tải lại tab Sheet, làm lại ca 4 từ đầu.
- [x] B4. Nghiệm thu (Claude tự chạy Chrome, chủ dự án cho phép 2026-10-19) trên Sheet DEV ba lựa chọn.
  - [x] Ca 1 Lấy FBM: CUS-020075 nhận Website FBM, về "đã đồng bộ", baseline mới.
  - [x] Ca 2 Lấy ShinCRM (ACT-011377) rồi Chỉ đẩy: FBM nhận nội dung ShinCRM.
  - [x] Ca 3 Tùy chỉnh (ACT-011402) rồi Chỉ đẩy: FBM nhận giá trị gõ tay.
  - [x] Ca 4 ShinCRM đổi lúc đang xem (`fbmDevEditAltWebsite`): Lưu hiện popup xung đột của form; chọn giá trị Sheet thì màn cập nhật phía ShinCRM, chọn giữ lựa chọn thì ghi.
  - [x] Ca 5 FBM đổi lúc đang xem (sửa Website ALT00010 trên FBM), chọn ShinCRM, Chỉ đẩy: FBM không bị ghi đè, xung đột lại; dọn bằng Lấy FBM.
  - Ca 2, 3, 5 chạy trên code phiên này (19/10, 23:0x–23:2x): ca 2 FBM nhận nội dung ShinCRM, đã đồng bộ 23:01; ca 3 FBM nhận "Nội dung tùy chỉnh B4 ca 3 lần 2", Chỉ đẩy gặp "Failed to fetch" ở bước đọc xác nhận (Sidebar báo lỗi, Log ghi), Lấy FBM thì xác nhận 23:12; ca 5 Chỉ đẩy báo "không có bản ghi nào được đẩy", FBM giữ "Website FBM sửa giữa chừng B4 ca 5", CUS-020075 quay lại xung đột, chọn FBM thì về đã đồng bộ.
  - Ca 4 sau B6 (15:04): chọn ShinCRM "…14:54", Sheet đổi thành "…15:04", Lưu hiện popup ghi "lần trước bạn thấy: …14:54"; chọn Quay lại thì trường Website tô đỏ, ô giữ "…14:54", không tính là chưa chọn; Lưu lại không hỏi nữa, Sheet nhận "…14:54", chờ đối soát, hết hàng đợi. Nhánh "Lưu giá trị bạn đang chọn" gửi cùng `shinValues` nên chỉ kiểm bằng test Sidebar.
- [x] B7. Thao tác của người dùng gặp lượt nền đang chạy thì hỏi bằng popup, không tự dừng lượt nền (chủ dự án duyệt 2026-10-19). Gốc: kênh đọc FBM chỉ có một (một request bay, một cổng kiểm phiên trong state), phần này đúng kiến trúc và giữ nguyên; lỗi là "Đồng bộ ngay" và "Kiểm tra liên kết" tự đặt cờ dừng lượt nền khi người dùng chưa chọn (`PullFlow.js:16-22`), "Mở xung đột" thì chỉ báo lỗi vào Log (`Conflict.js:51`), và thẻ xung đột hiện "Không có xung đột cần xử lý" cạnh "1 xung đột còn lại". Log 15:03:20 `SYNC_RUNNING`.
  - Vai trò dữ liệu:

    | Dữ liệu | Ai tạo | Ai được đổi | Vai duy nhất |
    |---|---|---|---|
    | `metadata.manualPending` (cờ dừng nền) | Chỉ lệnh `stop_background`, gọi khi người dùng chọn "Dừng đồng bộ nền" ở popup | Lượt nền xóa khi đã dừng (`PullFlow.js:399`) | Báo lượt nền dừng sau response đang bay |
    | Mã `SYNC_BACKGROUND_RUNNING` kèm `status` | `startRun` và `openConflict` khi lượt nền đang chạy | Không ai | Cho Sidebar biết phải hỏi; `status` cấp bước và giờ bắt đầu cho tóm tắt popup |
    | Lựa chọn popup `stop` / `wait` / `cancel` | Người dùng | Không ai | `stop` gọi lệnh dừng rồi chờ; `wait` chỉ chờ; `cancel` (nút X, Esc, nền) không làm gì |

  - [x] B7.1. GAS: lệnh `stop_background` (`ControlPort`, nhóm lệnh giữ khóa, `FbmSyncService.fbmStopBackground`) gọi một hàm duy nhất đặt cờ dừng nền khi lượt đang chạy là lượt nền; lượt tay hoặc không có lượt thì không đặt gì. `startRun` gặp lượt nền thì trả `SYNC_BACKGROUND_RUNNING`, không đặt cờ.
  - [x] B7.2. GAS: `openConflict` gặp lượt nền đang chạy trả `SYNC_BACKGROUND_RUNNING`; lượt tay đang chạy giữ `SYNC_RUNNING`.
  - [x] B7.3. Popup chung `uiDecisionChoose`: thêm nút X ở tiêu đề (ra `cancel`), vùng `detail` gập lại sau nút hành động với nút "Xem chi tiết"; bỏ luật bắt buộc có lựa chọn `cancel` vì X luôn có. Popup cũ giữ nút quay lại của mình.
  - [x] B7.4. Sidebar: một hàm hỏi `fbmSyncAskBackgroundRunning(status, việc)` trên `uiDecisionChoose`: tiêu đề "Đồng bộ nền đang chạy", tóm tắt nêu bước và giờ bắt đầu từ `status`, hai nút "Dừng đồng bộ nền và … ngay" / "Tự … khi đồng bộ nền xong". Hàm chờ dùng chung (đổi tên `fbmSyncWaitForIdentityBackground` thành `fbmSyncWaitForBackgroundIdle`, nhịp hỏi và hạn chờ đặt trong hằng số cấu hình đầu tệp) rồi gọi lại đúng lệnh gốc. Bỏ `backgroundStopping` tự bật khi bấm chạy; chỉ bật khi người dùng chọn dừng.
  - [x] B7.5. Ba nơi gọi: chạy tay (`fbmSyncRunStart`), kiểm liên kết (hai chỗ `fbmStartIdentityCheck`/`fbmStartIdentityProbe`), mở xung đột (`fbmSyncOpenConflict`).
  - [x] B7.6. Thẻ xung đột: còn xung đột mà chưa có bản ghi trong RAM thì hiện lý do (đang chờ đồng bộ nền, lỗi mở), không hiện "Không có xung đột cần xử lý".
  - [x] B7.7. Test GAS (Orchestration, BackgroundChain, Conflict): bấm chạy tay giữa lượt nền không đặt cờ; `stop_background` đặt cờ và lượt nền dừng; mở xung đột giữa lượt nền trả mã mới, không phát request. Test Sidebar: popup ba lựa chọn, X không gọi GAS, `stop` gọi dừng rồi chạy lệnh gốc, `wait` không gọi dừng; popup chung có nút X và chi tiết gập.
  - [x] B7.8. `node tests/run.js` đạt hết.
  - [x] B7.9. Sửa 09/02 mục 6 "Thao tác của người dùng luôn được ưu tiên", 09/08 hai đoạn "Đồng bộ ngay" (dòng 78, 200), 04 Phần 9 popup chung (nút X, chi tiết gập, luật tóm tắt/chi tiết).
  - [x] B7.10. Commit, đẩy DEV, tải lại tab; nghiệm thu: mở tab Xung đột và bấm Bắt đầu đúng lúc lượt nền chạy.
- [x] B8. Nút chạy ở màn Chạy đồng bộ theo cùng luật B7 (chủ dự án chốt 2026-10-19): lượt nền đang chạy thì nút vẫn là "Bắt đầu đồng bộ", bấm vào thì hiện popup hỏi dừng hay chờ; không còn đường hủy lượt nền mà không hỏi. Gốc: nút chọn "Dừng đồng bộ" theo `phase` mà không biết lượt đó của ai, nên lượt nền cũng hiện nút dừng và bấm là gọi `fbmCancelSync`.
  Vai trò dữ liệu: `status.origin` (GAS tạo từ `state.origin`, chỉ để Sidebar biết lượt đang chạy là của ai; GAS vẫn tự quyết `SYNC_BACKGROUND_RUNNING`); `FBM_SYNC_CLIENT.backgroundWait` (Sidebar, việc đang chờ lượt nền xong; khóa nút chạy để bấm thêm không bị bỏ qua im lặng).
  - [x] B8.1. GAS `statusView` thêm `origin`.
  - [x] B8.2. `fbmSyncRunActionBlock`: chỉ lượt tay đang chạy mới hiện "Dừng đồng bộ"; lượt nền đang chạy hiện "Bắt đầu đồng bộ" (bấm đi qua `fbmSyncRun` → popup B7); đang chờ lượt nền (`backgroundWait`) thì nút khóa với nhãn "Đang chờ đồng bộ nền xong...", nhãn đặt trong schema.
  - [x] B8.3. Test: nút với lượt nền, lượt tay, lúc đang chờ; `statusView` có `origin`.
  - [x] B8.4. Sửa 09/08 đoạn "Thao tác gặp lượt nền"; `node tests/run.js`; commit, đẩy DEV, nghiệm thu: lượt nền chạy thì nút là "Bắt đầu đồng bộ", bấm hiện popup.
- [x] B9. Nút X của popup lượt nền đưa màn về như vừa mở, coi như chưa bấm nút gây ra popup (chủ dự án chốt 2026-10-19), áp chung cho mọi thao tác. Gốc: mỗi thao tác đổi màn trước khi gọi GAS (vẽ "Đang chuẩn bị...", dòng báo "Đang kiểm tra liên kết...", chuyển sang tab Xung đột), còn nhánh X lại tự viết thêm dòng báo riêng ở từng nơi và vẽ lại bằng status giả vừa vẽ.
  Vai trò dữ liệu: `started.status` (GAS, trạng thái thật lúc trả `SYNC_BACKGROUND_RUNNING`; là thứ màn hiện nếu vừa mở, dùng để vẽ lại khi X); các giá trị lúc mở màn (`running=false`, `mode='read'`, `identityAction=''`, `identityLastAction=''`, `resultsTab='summary'`, `conflictNote=''`, dòng báo tài khoản rỗng) là đích của X.
  - [x] B9.1. Một công cụ `fbmSyncScreenFresh(status)` đưa các giá trị hiển thị về lúc mở rồi vẽ bằng status thật; `fbmSyncAfterBackground` gọi nó khi X và trả `SYNC_BACKGROUND_SKIPPED`. Bỏ ba nhánh X tự viết dòng báo ở kiểm liên kết, tự điền và thẻ xung đột; nút mở xung đột mở lại khi X.
  - [x] B9.2. Test: X ở kiểm liên kết, tự điền, tab Xung đột đều về đúng giá trị lúc mở, vẽ status thật, chỉ một lần gọi lệnh gốc.
  - [x] B9.3. Sửa 09/08 câu nút X; `node tests/run.js` 2642 đạt.
  - [x] B9.4. Nghiệm thu trên Sheet DEV cùng B8.4: lượt nền chạy thì nút vẫn là "Bắt đầu đồng bộ", bấm hiện popup; X ở Kiểm tra liên kết, Bắt đầu đồng bộ và tab Xung đột đều đưa màn về như vừa mở (không còn dòng "Đang kiểm tra liên kết...", tab Xung đột về Tổng quan), lượt nền vẫn chạy tiếp.

- [x] B10. Extension đọc đúng ô khi sheet có hàng, cột ẩn hoặc bộ lọc (chủ dự án yêu cầu 2026-10-19: không gõ cứng, Extension tự dò khi Google đổi). Gốc: bộ đọc coi chỉ số lưới live là tọa độ thật, trong khi lưới chỉ chứa hàng và cột đang hiện; ở `!lead` ẩn A–B gây `LIVE_GRID_CONFLICT`, ẩn hàng thì trả `ok` sai hàng. Căn cứ: `Nghiên cứu Google Sheet/2026.09.09 ...` mục 14, tài liệu 05 Phần 10.
  Vai trò dữ liệu: bảng quy đổi hàng/cột (Google, nguồn sự thật về vị trí đang hiện; Extension chỉ đọc, kiểm lại mỗi lần đọc); mảng đánh dấu (Google, dùng đối chiếu bảng quy đổi); lưới đầy đủ (Google, giá trị ô theo vị trí gọn); đường dẫn đã nhớ tới object chứa bảng theo gid (Extension, chỉ là lối tắt, sai thì dò lại); `rawHeaderRow` (Extension trả, địa chỉ thật; Sidebar dựng `readPlan['!']` theo mã cột như cũ).
  - [x] B10.1. Dò trên DEV: ẩn cột, ẩn hàng, bộ lọc; ghi tài liệu nghiên cứu mục 14, tài liệu 05, mở lại mục cột ẩn trong `Checklist reload RAM và sheet quản trị.md`.
  - [x] B10.2. `live_model_reader.js`: nhận object chứa bảng quy đổi theo hình dạng trong lượt dò sẵn có, giữ object có gid gần nhất đúng gid; ghép bảng hàng/cột với lưới theo kích thước, loại lưới không khớp; đọc ô qua bảng quy đổi; `rawHeaderRow` địa chỉ thật; mỗi lần đọc kiểm lại ràng buộc, sai thì dò lại và trả `LIVE_AXIS_NOT_FOUND`.
  - [x] B10.3. Sidebar `sheetLink.html`: `LIVE_AXIS_NOT_FOUND` vào danh sách lỗi bộ đọc (hỏi GAS, băng cảnh báo, Log một lần mỗi phiên); không coi là sheet không có cột mã.
  - [x] B10.4. Test `tests/cases/liveModelReader.js`: ẩn hàng giữa, hai cột ẩn không liền nhau, cột mã nằm giữa, bộ lọc; bản sao vùng đang hiện bị loại; ô thật đang ẩn trả không đọc được; thiếu bảng, bảng sai độ dài, không tăng dần, lệch mảng đánh dấu, số hàng bằng số cột, gid gần nhất là sheet khác đều không trả `ok`. Test Sidebar cho `LIVE_AXIS_NOT_FOUND`. `node tests/run.js` 2662 đạt.
  - [x] B10.5. Commit Extension và Sidebar; chủ dự án tải lại Extension; nghiệm thu trên DEV: `!lead` ẩn A–B đọc được ngay không băng cảnh báo, ẩn thêm hàng 3 và một cột giữa đọc đúng khách, Customer có bộ lọc đọc đúng; hiện lại và gỡ bộ lọc.

### Nhóm C — Đẩy ở mọi mức quét (sau V33 chặng 6)

Phương án chi tiết (AI trình 2026-10-19; chủ dự án chốt lưới an toàn Quét nhanh 2026-10-19, còn chờ câu hiển thị lượt Giữ phiên và việc V17):

- Gốc: Giữ phiên chỉ phát request đếm (`chainStart('heartbeat')`, `fbmSyncHeartbeatRequest`), không có đường gọi tiến trình đẩy, nên bản ghi sửa trên ShinCRM chờ tới Quét nhanh (mặc định 60 phút). Mặt khác mọi lượt có đẩy đều đọc cả hai Sheet và băm mọi bản ghi (`preflightLocal`, rồi `nextPushRequest` mỗi bản ghi; 4–5 giây trên DEV) dù không có gì đổi; gắn đẩy vào nhịp 5 phút mà không có cổng rẻ thì mỗi nhịp tốn chừng đó. Thiếu một câu trả lời rẻ cho câu hỏi "từ lần đẩy sạch trước, có gì có thể làm đổi danh sách ứng viên không".
- Dùng lại: revision của sổ nạp lại (`reloadJournalRead().rev`, tăng ở đúng một chỗ `recordChangesAfterWrite`, mọi cửa ghi và `shinOnEdit`/`shinOnChange` đều đi qua); sổ lỗi đẩy (`pushFailuresRead`) và phạm vi khách (`FbmSync.scope`). Giữ phiên khi cổng mở gọi đúng tiến trình Chỉ đẩy có sẵn (`FbmSync.start` mode `push`: kiểm phiên → kiểm dữ liệu → đẩy → `runTail` đếm → `chainTail`), không tự xếp lại công cụ đẩy.
- Dấu lần đẩy sạch (khóa riêng trong ScriptProperties của fbm_sync): `{ rev, failures, scope }`, trong đó `failures` là hash của sổ lỗi đẩy, `scope` là danh sách mã khách chỉ định. Tính ở đầu chặng đẩy, trước khi đọc Sheet. Chỉ ghi khi chặng đẩy chạy hết cả Khách lẫn Giao dịch tới `done` mà không hoãn, không lỗi, không tạm dừng bản ghi nào. Đầu mỗi chặng đẩy xóa dấu trước, nên lượt bị cắt ngang không để lại dấu cũ.
- Cổng: mỗi lượt nền có đẩy quyết cổng đúng một lần, ở đầu bước kiểm dữ liệu ShinCRM, và ghi kết quả vào state của lượt; chặng đẩy (`pullFinishOrPush`, `beginCustomerPull` mode `push`) chỉ đọc kết quả đó, không tự quyết lại. Bằng nhau thì bỏ cả bước kiểm dữ liệu ShinCRM (không đọc Sheet) lẫn chặng đẩy, ghi một dòng vết khi `LOG_TRACE` bật; thiếu dấu hay khác là quét như hiện nay; dấu hỏng thì quét và ghi Log cảnh báo, không im lặng. Lượt tay luôn quét. Quét nhanh nền luôn quét (chủ dự án chốt 2026-10-19); danh sách loại quét bỏ qua cổng đặt trong cấu hình, không gõ cứng. Chi phí cổng: đọc sổ nạp lại và dấu, mỗi thứ một lần đọc Properties; sổ lỗi đẩy chỉ đọc thêm khi rev đã khớp. Sau lượt có ghi Sheet (kể cả GAS kéo về) rev tăng nên lượt kế quét một lần không ra gì rồi ghi dấu; chủ dự án đã chấp nhận.
- Giữ phiên ở chiều Hai chiều hoặc Chỉ đẩy: cổng mở thì mở lượt Chỉ đẩy nguồn nền (`scan: 'keepalive'`), request đầu của lượt là bước kiểm phiên nên vẫn giữ phiên; xong chặng đẩy thì đếm cuối lượt nếu chiều lịch nền có ghi Sheet, Quét nhanh bù chạy theo chiều lịch nền (Hai chiều), không theo mode `push` của lượt. Cổng đóng hoặc chiều Lấy thì phát request đếm như hiện nay. Hai đường cấp Giữ phiên (`chainStart` và `fbmSyncHeartbeatRequest`) đi qua một chỗ quyết định.
- Đường bịt bằng kiến trúc: rev chỉ có một nơi tăng mà mọi đường ghi Sheet của ShinCRM và mọi sửa tay qua trigger đều đi qua; dấu chỉ ghi ở lượt sạch và bị xóa đầu chặng, thiếu hay hỏng dấu thì cổng mở (tốn một lần quét chứ không sót). Chỗ chỉ còn phép kiểm: sửa Sheet mà trigger không chạy (trigger lỗi, hết hạn mức Google, script ngoài ShinCRM) thì rev không tăng; không bịt được vì Google không bảo đảm trigger. Lưới an toàn đề xuất: Quét nhanh nền luôn bỏ qua cổng, nên bản ghi bị sót chậm tối đa một chu kỳ Quét nhanh, và lượt tay luôn quét. Lỗi trigger vẫn ghi Log qua `runEntryPoint`.
  Vai trò dữ liệu: `reloadJournal.rev` (GAS, sổ nạp lại; cổng chỉ đọc); sổ lỗi đẩy và phạm vi khách (fbm_sync; cổng chỉ đọc); dấu lần đẩy sạch (fbm_sync, chỉ chặng đẩy ghi và xóa; không phải nguồn sự thật, chỉ là quyền bỏ qua một lần quét); `chain.direction` (lịch nền; quyết chiều đếm và Quét nhanh bù của lượt Giữ phiên).

- [ ] C1. Cổng: công cụ đọc dấu hiện tại, công cụ so (thuần, trả mở/đóng kèm lý do), ghi/xóa dấu ở chặng đẩy; quyết một lần ở `preflightLocalStep` lượt nền, ghi vào state lượt, chặng đẩy đọc state; Quét nhanh và lượt tay bỏ qua cổng theo cấu hình; khóa dấu, danh sách loại quét bỏ qua cổng và câu vết trong cấu hình.
- [ ] C2. Giữ phiên: một chỗ quyết định cho hai đường cấp; cổng mở thì mở lượt Chỉ đẩy `keepalive`; `countTailMark`/`recountStart` dùng chiều lịch nền cho lượt này.
- [ ] C3. Test: cổng đóng không đọc Sheet và không phát request đẩy; dấu thiếu, hỏng, khác rev, khác sổ lỗi (Mở lại bản ghi lỗi), khác phạm vi đều quét; lượt có hoãn hoặc lỗi không ghi dấu; lượt bị cắt không để dấu cũ; lượt tay và Quét nhanh nền bỏ qua cổng; `shinOnEdit` sửa ô bản ghi làm rev tăng; Giữ phiên Hai chiều cổng mở ra lượt đẩy rồi đếm, Quét nhanh bù chiều Hai chiều; chiều Chỉ đẩy không đếm; cổng đóng ra request đếm như cũ. `node tests/run.js`.
- [ ] C4. Sửa 09/02 (bảng lịch nền dòng Giữ phiên, mục 3 chuỗi, mục 8, "Thứ tự trong một kỳ" bước 3), 09/08 nếu câu chữ UI nói Giữ phiên chỉ đếm.
- [ ] C5. Commit, đẩy DEV; nghiệm thu: sửa tay một ô ALT00010 trên Sheet DEV thì `probeDirtyState` rev tăng và Giữ phiên kế tiếp đẩy lên FBM; không sửa gì thì Giữ phiên chỉ đếm, Log vết ghi cổng đóng.
