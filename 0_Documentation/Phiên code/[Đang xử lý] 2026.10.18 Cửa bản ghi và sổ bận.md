# Cửa bản ghi và sổ bận

Tách từ chặng 5b của `[Đang xử lý] 2026.10.14 Vi phạm luật thao tác đắt.md` (tệp đó quá nặng). Cùng branch `feature/expensive-ops`. Kiến trúc chủ dự án duyệt 2026-10-18; hợp đồng chính thức ở tài liệu 06 Phần 1 "Cửa bản ghi" và Phần 2 "Sổ bận". Giải luôn V2 của tệp gốc (mỗi lần mở và đóng form tốn hai lời gọi GAS khóa sửa).

## Gốc lỗi

1. Đồng bộ FBM đọc dữ liệu cục bộ ngoài khóa tài liệu rồi mới ghi trong khóa (`pullWrite`, xác nhận sau đẩy, chọn ứng viên đẩy, mở lại lỗi đẩy), trái luật đọc – quyết – ghi trong cùng một lần cầm khóa: một lần Lưu hoặc Xóa chen giữa có thể bị ghi đè. Đường Lưu chỉ được che nhờ `fbmSaveGuarded` cầm khóa điều phối; đường Xóa hở.
2. Trạng thái "bản ghi đang bận" do module FBM sở hữu (`state.locks` trong `FBM_SYNC_STATE_V1`), nên lõi phải gọi FBM (`fbmSaveGuarded`) mới biết, cửa xóa không hỏi, và tiến trình khác về sau (bot, lệnh menu) không có chỗ hỏi.
3. Khóa lúc mở form không có hạn, không có chủ, trùng việc với phép kiểm giá trị cũ, tốn hai lời gọi GAS mỗi lần mở/đóng form (V2), lỗi bị nuốt im lặng ở client.
4. Màn xử lý xung đột FBM chỉ kiểm phía FBM đổi giữa lúc mở và lúc chốt (`openedHash`); phía ShinCRM đọc lại rồi dùng luôn, nên chọn "Giữ ShinCRM" có thể đẩy giá trị người dùng chưa thấy.

## Kiến trúc đã chốt

- Một Cửa bản ghi (`recordGateRun`) cho mọi thay đổi dòng Customer/Activity của mọi tiến trình. Bên gọi đưa hàm quyết, không đưa bản đọc; cửa chạy trong một lần cầm khóa: đọc mới → hàm quyết (nhận bản đọc mới và sổ bận) → kiểm sổ trên mọi mã sắp ghi/xóa (trả bản ghi đang bận là trái hợp đồng, ném lỗi, không ghi gì) → ghi/xóa qua cửa ghi, cửa xóa → giữ/nhả trong sổ.
- Một sổ bận ở lõi (`SHIN_RECORD_HOLDS_V1` trong DocumentProperties, người dùng không sửa được). Mọi phiên đều giữ bản ghi qua sổ; phiên ngắn giữ trong bộ nhớ của lần cầm khóa (không ai hỏi được sổ khi chưa cầm khóa) nên không tốn thêm lần ghi; chỉ phiên kéo dài qua nhiều lần gọi (đồng bộ đẩy) ghi sổ. Mỗi chỗ giữ có chủ (tiến trình), lượt, lý do bằng tiếng người, mốc giờ; chủ nào giữ thì chủ đó nhả, kể cả đường thu hồi khi tiến trình chết.
- Mở form không giữ gì. Lưu gặp bận: popup "Thử lại" / "Quay lại form, chưa lưu gì". Xóa gặp bận: popup "Thử lại" / "Để sau". Đồng bộ gặp bận: bỏ qua bản ghi đó, lượt sau làm lại.
- Cho lưu từ form khi bản ghi đang "xung đột chờ quyết".
- Nguyên lý 6: người quyết dựa trên thứ đang thấy, lệnh ghi mang theo thứ đã thấy, cửa so với bản đọc mới; khác thì không ghi mà cho xem lại. Áp như nhau cho popup lưu (giá trị cũ), màn xung đột FBM (cả hai bên) và popup xóa.
- Sửa tay trên Sheet ngoài tầm cửa: lưới đỡ là so ba chiều, kiểm giá trị cũ, xác nhận sau ghi.

## Việc

- [x] Tài liệu: 06 Phần 1 (Cửa bản ghi, bảng tiến trình đi qua cửa, người chỉ đọc), Phần 2 (sổ bận, ai giữ bao lâu, xếp hàng, thu hồi), Phần 4 (lưu gặp bận), Phần 5 (xóa gặp bận), Phần 8 (tệp mới); 04 Phần 9 (hai popup bận); 05A (bỏ khóa mở form); 09/01 bảng khóa DocumentProperties (bỏ khóa bản ghi khỏi `FBM_SYNC_STATE_V1`, thêm `SHIN_RECORD_HOLDS_V1` thuộc lõi); 09/02 bước `push_wait` giữ bản ghi trong sổ; 09/04 màn xung đột kiểm cả hai bên; 09A; `Cây thư mục code.md`.
- [x] Lõi: `server/state/RecordHolds.js` (đọc, kiểm bận, giữ, nhả, nhả cả chủ; chỉ chạy trong khóa tài liệu, ngoài khóa ném lỗi) và `server/gate/RecordGate.js` (`recordGateRun`, `recordGateReleaseOwner`). Đọc mới cho hàm quyết qua `gate.read` (`entityReadAllCombined`) và `gate.readById` (`entityReadRecordById`).
- [x] Sidebar lưu: `saveRecord` đi qua cửa với hàm quyết chuẩn (kiểm sổ rồi giao cửa ghi kiểm giá trị cũ); trả `{ ok: false, busy }` khi bận; bỏ `fbmSaveGuarded`, chặn `RECORD_CONFLICT`. Client: popup "Thử lại" / "Quay lại form, chưa lưu gì".
- [x] Sidebar xóa: `deleteRecords` đi qua cửa; mã bận không xóa, trả `busy`; client popup "Thử lại" / "Để sau" (để sau thì bỏ mặt nạ, dòng hiện lại).
- [x] Gỡ khóa cũ: `RecordLocks.js`, `fbmBeginEdit`/`fbmEndEdit`/`fbmSaveGuarded`/`fbmSyncSaveAllowed`, `screenFormSyncLock`/`screenFormSyncUnlock`, `state.locks` và mọi chỗ đọc nó (`stateStart`, `recoverStaleRun`, `fbmSyncCancel`, `lockRecord*`, `unlockRecord`, `isRecordLocked`); probe DEV đo `fbmSyncSaveAllowed`.
- [x] Đồng bộ FBM qua cửa: `FbmSync.recordChange` (hàm quyết của FBM, chủ `fbm`, schema thêm `SYNC_SCHEMA`, kết quả không đạt thành lỗi như `sheetSave` cũ); `sheetSave` không còn nhận bản ghi đã quyết sẵn.
  - [x] Lấy về (`pullWrite`): đọc cục bộ, nối khách cha, so ba chiều và ghi trong một hàm quyết; bản ghi bận (chủ khác) thì hoãn và Log.
  - [x] Gắn cờ vắng / chuyển quyền (`gateFlagWrite`): hàm quyết đọc lại bản ghi theo mã, bỏ bản ghi bận, đang chờ quyết hoặc đã vắng.
  - [x] Đẩy, bước đầu: hàm quyết đọc lại đúng dòng ứng viên; dòng đổi so với lúc chọn (hoặc đã vắng, hoặc bận) thì để lượt sau; khớp thì ghi "đang đẩy" và giữ bản ghi trong sổ. Ghi "không đủ điều kiện" / "mã danh mục lạ" cũng chỉ khi dòng còn khớp.
  - [x] Đẩy, các bước sau: ghi kết quả gửi, xác nhận, khôi phục khách vừa tạo, lỗi đẩy, dọn dấu — đọc cục bộ trong hàm quyết, nhả bản ghi trong cùng lần ghi kết quả cuối (kể cả "đẩy không ăn", trước đây bị sót không nhả).
  - [x] Thu hồi: bắt đầu lượt mới, hủy lượt, thu hồi lượt kẹt nhả mọi bản ghi chủ `fbm` trong sổ; lượt mất phản hồi khi đang ghi (`SYNC_STALE_WRITE`) giữ nguyên.
  - [x] Mở lại lỗi đẩy (`fbmSyncRetryPushFailures`): đọc và ghi trong một hàm quyết.
  - [x] Màn xung đột: lúc mở ghi nhớ dấu vân phía ShinCRM cùng phía FBM; lúc chốt (và lúc tự đóng khi hết trường lệch) hàm quyết đọc lại dòng, phía ShinCRM khác thì không ghi, trả màn xung đột mới để xem lại; ghi dựa trên bản đọc mới. Bỏ ghi "không thấy bên FBM" khi dòng đã rời trạng thái chờ quyết.
- [x] Test: sổ (ngoài khóa ném lỗi, chủ khác thấy bận, cùng chủ không bận, nhả sai chủ ném lỗi, phiên ngắn không ghi kho); cửa (hàm quyết trả bản ghi bận thì ném và không ghi; giữ chỉ ghi kho khi ghi thành công; đọc trong cửa thấy dữ liệu mới); lưu bận, xóa bận phía máy chủ và client popup; đồng bộ lấy về bỏ bản ghi bận; đẩy bỏ ứng viên đã đổi; xác nhận nhả bản ghi; màn xung đột phía ShinCRM đổi thì bắt xem lại; test quét mã: ngoài cửa không ai gọi `writeGateSave`/`deleteGateRemove`, không ai đọc `SHIN_RECORD_HOLDS_V1` ngoài `RecordHolds.js`.
- [ ] Chạy `node tests/run.js`, đẩy DEV, `probeSaveGate` (đã thêm bước sổ bận: giữ bằng chủ giả, lưu và xóa thấy bận, nhả rồi lưu lại được); tải lại tab Sheet DEV.
- [ ] Chủ dự án nghiệm thu trên Sheet DEV: mở form không còn hai lời gọi khóa; lưu và xóa bình thường; lưu khách đang "xung đột chờ quyết" được.
