# Xung đột không dừng phiên đồng bộ

Branch `claude/fix-conflict-no-stop-f8d187`, tách từ `feature/expensive-ops`. Gốc lỗi thấy trên Log 2026-10-19 00:20: lượt Hai chiều (quét `full`) dừng ngay với `SYNC_PREFLIGHT_FAILED` chỉ vì có một dòng "xung đột chờ quyết", chưa lấy, ghi hay đẩy gì.

## Gốc lỗi

- Luật lúc đó ở `09/04` "Chế độ xử lý xung đột riêng": khóa nằm trên dòng, pull và push bỏ qua dòng đó; người dùng xử lý lúc nào là việc của họ. Sau đó chủ dự án chốt bỏ khóa (phần "Xung đột so lại mỗi kỳ" bên dưới). Phần thực thi đã làm đúng (`isConflictPending` ở pull, `pushCandidates` loại dòng xung đột và bản ghi từng đẩy lỗi khi hash chưa đổi).
- Nơi quyết thứ hai, rộng hơn luật: `FbmSync.preflightCandidates` đặt `blocking = (mode === 'write')` cho lỗi của riêng từng bản ghi (`FBM_RECORD_CONFLICT_PENDING`, `FBM_PREVIOUS_PUSH_FAILURE`, `FBM_CATEGORY_MAPPING_MISSING`, `FBM_ACTIVITY_OWNER_MISMATCH`), và `preflightApply` dừng cả lượt khi có một lỗi chặn.
- Chỗ dừng thứ hai: `FbmSync.stopPushOnConflicts` (gọi ở `nextPushRequest` và `pullFinishOrPush`) dừng cả chiều đẩy khi chiều Lấy cùng lượt phát hiện xung đột, dù `pushCandidates` đọc lại trạng thái trên dòng nên đã tự loại dòng đó.
- Hai `catch` rỗng, vi phạm "không có lỗi im lặng": `pushCandidates` (đọc state/sổ lỗi đẩy hỏng thì sổ rỗng và đẩy lại âm thầm bản ghi từng lỗi) và `preflightCandidates` (đọc cài đặt hỏng thì cài đặt rỗng).
- Dòng tổng kết `sync_session_finished` ghi "0 xung đột" vì `counts.conflict` chỉ đếm xung đột phát hiện trong lượt, còn xung đột tồn đọng từ Sheet ở `metadata.conflictCount`. Khi phiên không còn dừng ở preflight thì dòng này đúng nghĩa của nó (xung đột mới trong lượt); số tồn đọng được ghi ở dòng riêng "còn N xung đột". Tên lượt "Tay · Quét nhanh" với `scan: full` là đúng: Quét nhanh là tên của tiến trình `customerFull` (quét `full`, gói `quick`), không phải lỗi.

## Công cụ có sẵn được dùng lại

- `FbmSync.markPushSkipped` + `pushOwnerError` + `validatePushCategories` ở `nextPushRequest`: đã loại đúng bản ghi lệch người phụ trách hoặc thiếu ánh xạ danh mục, đánh dấu trên dòng và ghi cảnh báo nêu mã bản ghi. Không viết đường loại thứ hai; preflight chỉ báo trước bằng cảnh báo không chặn.
- `pushCandidates` là bộ lọc ứng viên duy nhất; dòng xung đột vừa phát hiện giữa lượt bị loại vì nó đọc lại Sheet.
- `stateStart` đã mang `metadata.conflictCount` sang lượt sau; thêm `conflictLogged` ngay cạnh, không tạo khóa kho mới.
- `logEvent`, `FbmSync.preflightIssue`, `logPreflight`: kênh báo lỗi và ghi Log sẵn có.

## Đối chiếu `[RÀNG BUỘC CỨNG]` (AGENTS.md mục 2)

| Quy tắc | Cách đáp ứng |
|---|---|
| Lỗi không có đường xảy ra | Bịt bằng kiến trúc: chỉ còn một nơi quyết bỏ dòng xung đột/đẩy lỗi (`pushCandidates`) và một nơi quyết bỏ dòng thiếu ánh xạ/lệch owner (`markPushSkipped`); preflight không còn quyền chặn vì lỗi của riêng một dòng. Chỗ còn là phép kiểm: preflight vẫn kiểm trước để báo cảnh báo, nhưng không quyết. |
| Một việc một công cụ | Không viết hàm loại bản ghi mới; dùng lại `pushCandidates` và `markPushSkipped`. Xóa `stopPushOnConflicts` (quyết định trùng). |
| Tiến trình điều phối, công cụ trao nhau bằng dữ liệu | `preflightLocal` trả số xung đột trong kết quả; `preflightApply` (người điều phối) so với số lượt trước và ghi Log; công cụ đếm không tự ghi Log. |
| Tiến trình lớn ghép từ nhỏ | Không đổi cấu trúc điều phối. |
| Không lỗi im lặng | Hai `catch` rỗng thành lỗi báo rõ: preflight ra issue chặn, `pushCandidates` để lỗi nổi lên cho cổng báo lỗi chung. |

`FBM_CUSTOMER_CODE_CONFIG_MISSING` giữ chặn: là cấu hình chung (một lần sửa trong Cài đặt), và thực thi `pushConfigErrors` đã tạm dừng chiều đẩy vì lý do này; bỏ riêng ứng viên tạo Customer cần thêm đường loại thứ hai ở thực thi, trái "một việc một công cụ".

## Việc

- [x] 1. Preflight: xung đột chờ quyết và lỗi đẩy cũ thành cảnh báo không chặn; thiếu ánh xạ danh mục và lệch owner thành cảnh báo không chặn, bản ghi đó không tính vào số ứng viên.
- [x] 2. Bỏ `stopPushOnConflicts` và hai chỗ gọi.
- [x] 3. Hai `catch` rỗng thành lỗi báo rõ.
- [x] 4. Log "còn N xung đột" chỉ khi số khác lượt trước; Sidebar vẫn hiện số.
- [x] 5. Test: preflight ghi `ok` khi có xung đột; xung đột giữa lượt không dừng chiều đẩy; bản ghi thiếu ánh xạ bị loại riêng; catch cũ báo lỗi; Log xung đột chỉ khi số đổi.
- [x] 6. Sửa tài liệu 09/02 bước 3 và rà 09 còn nói ngược.
- [x] 7. `node tests/run.js` 0 lỗi.
- [ ] 8. Chủ dự án nghiệm thu trên Sheet DEV: để một dòng xung đột, chạy Hai chiều, thấy phiên chạy tiếp, dòng đó giữ nguyên, Log có một dòng "còn N xung đột".

## Xung đột so lại mỗi kỳ (chủ dự án chốt 2026-10-19)

"Xung đột chờ quyết" là trạng thái cho người thấy và hàng đợi của màn hình xung đột, không phải khóa. Gốc: `Pull.js` bỏ qua dòng chờ quyết trước khi so, trong khi bước đánh dấu vẫn đọc chi tiết những khách đó mỗi kỳ (dấu vân FBM khác baseline) rồi bỏ kết quả; dòng đã khớp lại vẫn kẹt xung đột. Dùng lại `FbmSync.threeWay` và các nhánh ghi sẵn có của `pullWrite`, `readAgainStatus` cho phần đọc lại, `conflictPendingNote` cho phần báo; nhánh "dòng đã rời trạng thái chờ quyết" của `conflictSettle` lo ca màn hình xung đột đang mở.

- [x] 9. `pullWrite` so ba chiều dòng chờ quyết với baseline cũ; còn xung đột thì giữ nguyên, không ghi lại, không Log từng dòng. Xung đột định danh (dấu của FBM ID khác trỏ vào) vẫn giữ.
- [x] 10. `readAgainStatus` gồm "xung đột chờ quyết" để dòng luôn được đọc lại kể cả khi FBM đã quay về gốc.
- [x] 11. Test: bốn tình huống (khớp nhau, FBM về gốc, ShinCRM về gốc, vẫn khác) ở `ProductionMatrix.js`; xung đột định danh không bị gỡ ở `Pull.js`.
- [x] 12. Sửa `09/04` và bảng nguồn ghi ở tài liệu 06.
- [ ] 13. Chủ dự án nghiệm thu trên Sheet DEV: sửa một dòng đang xung đột cho hai phía khớp nhau, chạy Hai chiều, dòng về "đã đồng bộ" và Log có "Hai phía đã khớp nhau; gỡ xung đột".
