# Luật chung nạp lại RAM và vẽ lại view

Làm sau khi `[Đã xử lý] 2026.10.15 Chuỗi đồng bộ nền và vòng xoay giao dịch.md` đã xong và gộp vào `main`, trước phiên `[Chờ xử lý] 2026.10.15 Một cửa ghi chiều lấy về FBM.md` (chủ dự án đồng ý thứ tự 2026-10-16). Phiên này đụng lõi Sidebar và GAS (`SelectionService`, `sheetLink`, `DirtyState`, `WriteCommit`, `Triggers`), nên mở branch mới từ `main`.

## Vì sao phải làm

Hiện trạng đọc được 2026-10-16 (07A dòng "Pull/push/background" và code):

- Ba nơi cùng quyết "nạp hay hoãn": GAS (dấu bẩn, `waitMs`), Sidebar tự đặt cờ `syncRunning` gửi lên, Sidebar tự chặn vẽ lại view lần nữa (`sheetLink.html` nhánh `applyView`).
- Cờ `syncRunning` chỉ đúng khi Sidebar tự điều khiển lượt (bấm tay). Lượt nền do Extension hỏi thẳng GAS nên cờ luôn `false`: mỗi lần GAS ghi Sheet trong lượt nền (mỗi bước có ghi, mỗi lô 50 khách) là RAM nạp lại và sheet `!` đang xem vẽ lại, trái 07A ("trong lúc lượt đồng bộ chạy thì hoãn").
- Mỗi lần áp payload Sidebar hiện lớp phủ chặn thao tác, nên nạp nền dồn dập làm Sidebar bị khóa liên tục.
- Bên ghi tự chọn độ trễ nạp (`recordsDebounceMs`, `recordsReadyAt` trong `DirtyState.js`): thời điểm nạp do bên ghi quyết chứ không do GAS.

## Quyết định của chủ dự án (2026-10-16)

Nguyên tắc nền áp dụng: "Một hành vi, một chỗ định nghĩa", "Mỗi state và mỗi quyết định chỉ có một nơi sở hữu duy nhất", "Đừng viết code để bắt lỗi — hãy dựng kiến trúc mà lỗi đó không có đường xảy ra".

1. **GAS quyết, Sidebar chỉ hỏi.** "Nạp ngay / không có gì" chỉ GAS quyết, từ state GAS giữ. Sidebar bỏ cờ `syncRunning`, bỏ `refreshDeferredBySync`, bỏ lời hỏi `sync-finished` và bỏ chỗ tự chặn vẽ lại view; GAS trả gì Sidebar áp nấy.
2. **Đơn vị thay đổi là một lần chạy GAS, không phải một lần ghi.** Một lần chạy là một lời gọi từ Sidebar, một lượt trigger sửa tay, một lần Extension trả response đồng bộ, một lời gọi API. Hàm ghi không được tự đánh dấu bẩn, chỉ bỏ mã bản ghi vừa đổi vào "giỏ thay đổi" trong bộ nhớ của lần chạy; cửa vào chung của GAS đổ giỏ một lần lúc lần chạy kết thúc (một dấu bẩn, một lần tăng revision). Ghi 40.000 ô, 200 dòng hay 1 khối trong một lần chạy đều chỉ ra một dấu bẩn. Luật này phủ mọi kênh sửa: sửa tay, Sidebar, đồng bộ tay, đồng bộ nền, API.
3. **Chỉ bản ghi đổi nội dung mới vào giỏ.** Ghi lại bản ghi y hệt cũ, ghi mốc kỹ thuật (hash, baseline), state đồng bộ, dòng Log, sổ đánh dấu của Vòng xoay, mốc số khách không vào giỏ. Phải có test chốt: lượt đồng bộ đọc thấy FBM không đổi gì thì không sinh dấu bẩn nào.
4. **Sidebar tự giới hạn bằng cấu trúc, không bằng hẹn giờ.** Không bao giờ có hai lời hỏi song song; tín hiệu đến lúc đang bận gộp thành đúng một lời hỏi kế tiếp (đã có, giữ nguyên). Nhịp nạp tối đa vì vậy bằng tốc độ một lời hỏi, không cần con số chờ lặng hay trần thời gian. Phương án "chờ lặng Q giây, trần M giây" và "khai báo thao tác còn tiếp" đã bàn và loại vì thêm độ trễ đoán bằng thời gian.
5. **Độ trễ trigger sửa tay là luật của kênh `/bind`, không phải luật nạp.** Tín hiệu `/bind` đến trước khi trigger kịp ghi dấu bẩn (đo 2,6–3,8 giây, docstring `CHANGE_SIGNAL_DELAYS_MS` ở `Settings.js`), nên lời hỏi chưa thấy revision tăng thì hỏi lại theo lịch trễ như hiện nay.
6. **Nạp nền chỉ hiện thanh loading, không dùng lớp phủ chặn.** Chỉ chặn khi người dùng đang chờ kết quả của chính thao tác mình vừa làm (ví dụ lưu form); kết quả đó trả ngay trong chính lời gọi ghi.
7. **Vẽ lại view luôn đi cùng lần áp RAM** (khi công tắc tự làm mới bật và đang đứng ở sheet `!` đó). Giữ bất biến 6 của 07A: Customer/Activity đổi thì mọi sheet `!` thành cũ; vế "chỉ vẽ khi giỏ có bản ghi thuộc view" đã loại (chủ dự án duyệt 2026-10-16) vì bản ghi có thể vừa rời khỏi view sau khi sửa, lọc trước/sau rất dễ sót, mà số lần vẽ đã bị giới hạn bằng cấu trúc.
8. **Bỏ chờ 3 giây sau lần sửa tay cuối** (`RELOAD_DECISION_DEBOUNCE_MS`, `recordsReadyAt`, `recordsDebounceMs`, `flushOnLeave`; chủ dự án duyệt 2026-10-16): lịch hỏi trễ của kênh `/bind` và cổng gom đã gom các lần sửa sát nhau. Hoãn chỉ còn một lý do: bảo vệ bản nháp Sidebar.

Kỳ vọng với đồng bộ sau khi có cả phiên này và phiên Một cửa ghi: chỉ mỗi lô của cửa ghi có bản ghi đổi mới sinh một lần nạp; ngày FBM không đổi gì thì cả chuỗi nền không nạp lần nào; kết thúc lượt không có lần nạp riêng.

## Việc cần làm

- [x] Viết lại 07A trước khi code (chủ dự án duyệt 2026-10-16; 07A bất biến 1a–1d, mục 3, ma trận dòng sửa tay/Sidebar/Pull, mục 6, 6.1; đồng bộ 05, 05A, 07): thay dòng "Pull/push/background" và mọi luật hoãn riêng lẻ bằng luật chung ở trên; sửa 09 nếu có đoạn nhắc hoãn nạp khi đồng bộ chạy. Trình chủ dự án duyệt trước khi code.
- [ ] Liệt kê mọi cửa vào của GAS (lời gọi Sidebar, trigger, relay Extension, API) và mọi chỗ đang tự đánh dấu bẩn (`WriteCommit`, `Triggers`, các bên truyền `recordsDebounceMs`/`recordsReadyAt`); ghi kết quả vào tệp này rồi tách thành các mục `[Tự động]`/`[Cần kiểm chứng thật]`.
- [ ] `node tests/run.js` đạt; đẩy GAS DEV; chủ dự án nghiệm thu trên Sheet DEV (chạy nền: Sheet đang xem cập nhật theo lô, chỉ có thanh loading, không lớp phủ); đổi tên tệp sang `[Đã xử lý]`.
