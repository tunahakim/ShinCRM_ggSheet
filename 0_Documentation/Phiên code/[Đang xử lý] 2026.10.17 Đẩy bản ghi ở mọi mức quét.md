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

- [ ] A1. `continuePush` bước mở form sửa: lấy giá trị bằng `verifyFormValues`, quyết bằng `threeWay` theo quyết định 1; nhánh không lưu ghi dòng qua `pushRowChange`.
- [ ] A2. Tách đoạn liệt kê trường lệch thành công cụ dùng chung, chỉ trả tên trường; dùng ở A1 và `finishPushVerification`.
- [ ] A3. `finishPushVerification` ra xung đột: đánh dấu dòng, đi tiếp bản ghi sau.
- [ ] A4. Test: hash từ form = hash từ lưới (Khách, Giao dịch); FBM đổi sau mốc không phát lệnh lưu, dòng thành xung đột, bản ghi sau vẫn đẩy; FBM = ShinCRM không lưu, cập nhật mốc; FBM = mốc vẫn lưu; chỉ FBM đổi không lưu; đọc lại sau lưu ra xung đột không dừng phiên.
- [ ] A5. Sửa 09/04 (mục "Đẩy xong thì đọc xác nhận" và bảng so ba chiều cho chiều đẩy), 09/02 nếu còn câu ngược.
- [ ] A6. Nghiệm thu GAS DEV bằng `node tests/gas.js <hàm> --push`.
- [ ] A7. Chủ dự án nghiệm thu với ALT00010: sửa khách trên FBM, sửa khác trên ShinCRM, chạy Chỉ đẩy; FBM giữ nguyên, dòng thành xung đột. Lặp lại với một giao dịch cũ.

### Nhóm B — Lưu xung đột không đọc lại FBM

- [ ] B1. Sidebar gửi kèm giá trị FBM các trường lệch khi chốt; GAS ghép vào dòng, so hash với hash lúc mở, rồi ghi qua `conflictSettle`; bỏ request đọc lại.
- [ ] B2. Test: giá trị gửi lại khác bản đã mở thì không ghi; ShinCRM đổi từ lúc mở thì trả màn xem lại; ba lựa chọn ghi đúng baseline.
- [ ] B3. Sửa 09/04 bảng sáu bước, ràng buộc "hFBM phải lấy mới lúc bấm" và câu "state GAS không giữ giá trị hai bên".
- [ ] B4. Chủ dự án nghiệm thu trên Sheet DEV ba lựa chọn.

### Nhóm C — Đẩy ở mọi mức quét (sau V33 chặng 6)

- [ ] C1. Cổng rev sổ nạp lại; test sửa tay trên Sheet làm rev tăng.
- [ ] C2. Giữ phiên: việc chính → đẩy → đếm.
- [ ] C3. Sửa 09/02 (nhịp, Giữ phiên), 09/08 nếu cần.
