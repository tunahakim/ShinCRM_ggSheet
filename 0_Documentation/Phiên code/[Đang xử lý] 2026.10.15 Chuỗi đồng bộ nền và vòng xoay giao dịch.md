# Chuỗi đồng bộ nền và vòng xoay giao dịch

Mục tiêu: lịch nền chạy được mọi tiến trình đến hạn trong một lần hỏi (hết lỗi bỏ đói), bước đếm khách dùng chung cho chạy tay và chạy nền, Vòng xoay đọc đủ N khách với cursor chỉ tiến qua dữ liệu đã ghi, dọn hai bước cũ chạy kèm sau lấy toàn bộ giao dịch, và sửa luật "cho phép đồng bộ" ở bước gắn cờ vắng và bước chọn khách để đọc.

Nguồn chuẩn (đọc trước khi code): 09/02 Phần 3 "Các lịch nghiệp vụ do GAS giữ" và "Chuỗi trong một lần hỏi", Phần 8 "Bốn thao tác đọc" và sơ đồ bốn lớp; 09/05 Phần 9 và Phần 10 (luật kế thừa); 09/08 card `Lịch đồng bộ nền` và đoạn `Đồng bộ ngay` khi lượt nền đang chạy; 09/07 bảng tham số. Tài liệu đã cập nhật theo quyết định của chủ dự án ngày 2026-10-15; code đang lệch tài liệu ở mọi mục dưới đây.

Branch: tạo `feature/fbm-background-chain` từ `main`.

## 1. Dọn hai bước cũ chạy kèm sau lấy toàn bộ giao dịch

Hai bước này là phần sót của thiết kế 2026-09-10 (commit 8fbb6a7): "đuổi kịp" tìm tối đa 30 khách có ngày giao dịch cuối mới hơn giao dịch mới nhất của cả Sheet, và "xoay 30 khách" với cursor riêng. Chúng đã được thay bằng lớp 2/3 trong Quét nhanh (`read/ActivityLayers.js`) và tiến trình Vòng xoay; chủ dự án đồng ý gỡ.

- [x] [Tự động] Gỡ `activityBulkSupplement` (`transport/ActivityScan.js`), `activitySupplementNext` và nhánh `activity_catchup_customer_grid`/`activity_rotation_customer_grid` (`transport/PullFlow.js`), `activityCatchupCustomerRequest`, `activityRotationCursor`, `activityRotationCustomerRequest`, `activityRotationNext`, `activityRotationSave`, `ACTIVITY_SUPPLEMENT_CUSTOMERS` (`read/GridRead.js`); bỏ khóa `FBM_SYNC_ACTIVITY_ROTATION` khỏi bảng khóa 09/01. Bằng chứng: `grep` không còn tên nào trong `1_ShinCRM_GAS/` và `tests/`.
- [x] [Tự động] Test: lượt lấy toàn bộ giao dịch chạy nền kết thúc ngay sau lớp 1, không cấp request Customer nào sau lớp 1. Test `ActivityScan.js`: "Lượt lấy toàn bộ giao dịch chạy nền kết thúc ngay sau lớp 1: sau lớp 1 chỉ còn đúng một request đếm khách, không đọc khách nào" (request đếm của mục 3 là request Customer duy nhất được phép).

## 2. Luật "cho phép đồng bộ" ở bước gắn cờ vắng và bước chọn khách để đọc

Hiện bước ghi và bước đẩy đã đúng; hai bước dưới quên xét ô cho phép, trái 09/05.

- [x] [Tự động] `markMissingAfterFullScan` (`reconcile/Identity.js`) bỏ qua bản ghi mà `syncPermission` (`reconcile/CategoryGate.js`, có luật kế thừa từ khách) trả `pull: false`. Test: khách `Không đồng bộ` vắng bên FBM không bị gắn cờ; giao dịch `Cho phép` của khách `Cấm đồng bộ` vắng bên FBM không bị gắn cờ; khách `Cho phép` vắng thì vẫn bị gắn `không thấy bên FBM`. Test `Pull.js`: "Gắn cờ vắng theo quyền: khách \"Không đồng bộ\" vắng bên FBM không bị gắn cờ; ..." (thử phá bộ lọc quyền thì đỏ).
- [ ] [Tự động] Bước chọn khách để đọc giao dịch (lớp 2 `activityDueMark`, lớp 3 `activityTopRefill`, hàng đợi `ActivityBatch.js`, Vòng xoay) bỏ qua khách `pull: false`; lấy toàn bộ giao dịch không đưa giao dịch của khách đó vào tập id theo dõi. Test: khách `Chờ đồng bộ` lệch ngày giao dịch cuối không sinh request đọc giao dịch. Đã xong lớp 2, lớp 3, hàng đợi và tập id lớp 1 qua `pullAllowedReader` (`reconcile/CategoryGate.js`), test `ActivityScan.js`: "Khách \"Chờ đồng bộ\" lệch ngày giao dịch cuối không sinh request đọc giao dịch; ..."; Vòng xoay dùng cùng bộ lọc khi làm mục 5 rồi mới tick.

## 3. Bước đếm khách và số khách mốc

- [x] [Tự động] Một hàm dựng request đếm khách từ chính hàm dựng request lấy danh sách toàn bộ khách (cùng phạm vi, cùng bộ lọc), chỉ khác `count: 1`; bỏ `heartbeatCustomerRequest` dạng không lọc phạm vi. Đã làm: `customerCountRequest` (`transport/CustomerCount.js`) gọi `customerListRequest` (`transport/ScanJob.js`), cũng là hàm `scanJobRequest` dùng; Giữ phiên dùng cùng request. Bằng chứng là test thử phá ở dòng cuối mục này.
- [x] [Tự động] Số khách mốc lưu bền ở khóa DocumentProperties riêng (không trong state, vì `stateStart` xóa `session`), chỉ ghi khi lượt lấy danh sách toàn bộ khách đọc đầy đủ, bằng `TotalRowCount` của request đó; thêm khóa vào bảng 09/01. Khóa `FBM_SYNC_CUSTOMER_BASELINE_V1`, ghi trong `pullMarkMissing` khi `scan === 'full'`. Test `CustomerCount.js`: "FBM không đổi: sau Quét nhanh chỉ một request đếm, số đếm khớp mốc vừa ghi và lượt kết thúc, không quét lại" (mốc bằng 12).
- [x] [Tự động] Một hàm "đếm khách, lệch mốc thì chạy Quét nhanh rồi đếm lại" dùng ở cuối mọi tiến trình, cuối lượt chạy tay và làm thân của Giữ phiên. Test: FBM không đổi thì sau Quét nhanh bước đếm khớp và lượt kết thúc; tổng FBM tăng giữa hai lần đếm thì Quét nhanh chạy thêm đúng một lần rồi kết thúc; chưa có mốc thì Quét nhanh chạy. Test `CustomerCount.js`: "FBM không đổi: sau Quét nhanh chỉ một request đếm, ...", "Tổng khách FBM tăng giữa hai lần đếm: chạy thêm đúng một Quét nhanh, ...", "Chưa có số khách mốc: lượt lấy toàn bộ giao dịch đếm xong thì chạy Quét nhanh để lấy mốc, ...". Bước đếm chỉ gắn vào lượt ở chiều có ghi Sheet (`countTailMark`); Giữ phiên chiều Chỉ đẩy chỉ giữ phiên.
- [x] [Tự động] Thử phá: cho bước đếm dùng bộ lọc khác bộ lọc lấy danh sách thì test "FBM không đổi thì kết thúc" đỏ. Đã thử: request đếm bỏ bộ lọc khách của người dùng (FBM giả trả thêm 3 khách người khác) thì cả 3 test `CustomerCount.js` đỏ.

## 4. Chuỗi trong một lần hỏi

- [ ] [Tự động] Sổ hẹn: chuỗi chạy tiến trình đến hạn theo ưu tiên Quét nhanh, Lấy toàn bộ giao dịch, Vòng xoay, Giữ phiên; mỗi tiến trình theo lịch tối đa một lần mỗi chuỗi; sau mỗi tiến trình xem lại sổ hẹn. Chuỗi ghi trong state GAS, lượt chuyền bị cắt lát thì lần hỏi sau chạy tiếp chuỗi cũ.
- [ ] [Tự động] Mốc kế tiếp = mốc cũ + chu kỳ, cộng tiếp tới khi vượt giờ hiện tại; chỉ dời khi tiến trình chạy xong (bỏ dời ở `pickDue`).
- [ ] [Tự động] Test mô phỏng nhiều lần hỏi: `gas_poll` 60 phút, Quét nhanh 60 phút, Lấy toàn bộ giao dịch 8 giờ, Vòng xoay 60 phút: trong 8 lần hỏi Lấy toàn bộ giao dịch chạy ít nhất một lần và Vòng xoay chạy ở mọi lần hỏi đến hạn (hết bỏ đói). `gas_poll` 10 phút, Giữ phiên 1 phút: mỗi lần hỏi Giữ phiên chạy đúng một lần. Vòng xoay chu kỳ 1 phút mà mỗi lần chạy mất 3 phút: chuỗi vẫn dừng.
- [ ] [Tự động] Test: lượt nền bị lượt tay chen ngang thì mốc của tiến trình đó không dời, lần hỏi kế tiếp chạy lại.
- [ ] [Tự động] Giữ phiên có công tắc và chu kỳ riêng như hiện nay; công tắc từng tiến trình chỉ bật/tắt lịch hẹn, không chặn bước đếm gọi Quét nhanh. Test: tắt Quét nhanh, tổng FBM đổi thì Giữ phiên vẫn gọi Quét nhanh.

## 5. Vòng xoay đọc đủ N khách

- [ ] [Tự động] `customersPerRun` bỏ giới hạn 1–50 (`Scheduler.js`, `PullFlow.js`), chỉ yêu cầu số nguyên từ 1; phiên đọc theo lô `BUDGET.activityBatchCustomers` đến khi đủ N.
- [ ] [Tự động] Cursor `FBM_SYNC_DETAIL_CURSOR_V1` là khách cuối cùng đã ghi xong giao dịch, lưu sau mỗi lô (hiện `customerNext` lưu cursor ngay khi ghi xong trang khách, trước khi đọc giao dịch). Test: lỗi giữa lô giao dịch thì phiên sau bắt đầu từ sau khách cuối đã ghi xong và vẫn đọc đủ N.

## 6. Lượt tay chen ngang lượt nền

- [ ] [Tự động] Giữ hành vi hiện có (`manualPending`, `SYNC_BACKGROUND_STOPPING`); nút hiện `Đang dừng đồng bộ nền...` và khóa trong lúc chờ; lượt tay kết thúc bằng bước đếm, lệch thì hiện `Số khách FBM vừa đổi, quét thêm một lần...`.
- [ ] [Tự động] UI `Cài đặt phiên`: ô số khách vòng xoay không giới hạn 50, dòng giải thích công tắc tiến trình và chu kỳ không ngắn hơn `Chu kỳ hỏi GAS` (09/08).

## Bàn giao

- [ ] [Tự động] `node tests/run.js` đạt, 0 lỗi; thử phá test chuỗi (cho mỗi lần hỏi chỉ chạy một tiến trình) thấy đỏ rồi khôi phục.
- [ ] [Tự động] Đẩy GAS DEV `node tests/gas.js smokeTest --push`.
- [ ] [Cần kiểm chứng thật] Chủ dự án để Sheet DEV chạy nền vài giờ: Sheet `Log` có Lấy toàn bộ giao dịch và Vòng xoay chạy, không có lỗi `SYNC_STALE_RUN`.
- [ ] Đổi tên tệp sang `[Đã xử lý]`, gộp branch vào `main`.
