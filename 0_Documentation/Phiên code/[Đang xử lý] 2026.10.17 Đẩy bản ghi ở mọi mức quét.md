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
- [ ] B4. Nghiệm thu (Claude tự chạy Chrome, chủ dự án cho phép 2026-10-19) trên Sheet DEV ba lựa chọn.
  - [x] Ca 1 Lấy FBM: CUS-020075 nhận Website FBM, về "đã đồng bộ", baseline mới.
  - [ ] Ca 2 Lấy ShinCRM (ACT-011377) rồi Chỉ đẩy: FBM nhận nội dung ShinCRM.
  - [ ] Ca 3 Tùy chỉnh (ACT-011402) rồi Chỉ đẩy: FBM nhận giá trị gõ tay.
  - [x] Ca 4 ShinCRM đổi lúc đang xem (`fbmDevEditAltWebsite`): Lưu hiện popup xung đột của form; chọn giá trị Sheet thì màn cập nhật phía ShinCRM, chọn giữ lựa chọn thì ghi.
  - [ ] Ca 5 FBM đổi lúc đang xem (sửa Website ALT00010 trên FBM), chọn ShinCRM, Chỉ đẩy: FBM không bị ghi đè, xung đột lại; dọn bằng Lấy FBM.
  - Ca 2 và ca 3 lúc 13:4x chạy trên code V33 (V33 đã đẩy đè DEV): FBM đã nhận đúng giá trị (ACT-011377 nội dung ShinCRM, ACT-011402 "Nội dung tùy chỉnh B4 ca 3", đã đồng bộ 13:56), nhưng chưa chứng minh code phiên này; làm lại hai ca sau B6. Từ 13:58 DEV là code phiên này (@942), phiên V33 tạm dừng tới khi gộp.
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

### Nhóm C — Đẩy ở mọi mức quét (sau V33 chặng 6)

- [ ] C1. Cổng rev sổ nạp lại; test sửa tay trên Sheet làm rev tăng.
- [ ] C2. Giữ phiên: việc chính → đẩy → đếm.
- [ ] C3. Sửa 09/02 (nhịp, Giữ phiên), 09/08 nếu cần.
