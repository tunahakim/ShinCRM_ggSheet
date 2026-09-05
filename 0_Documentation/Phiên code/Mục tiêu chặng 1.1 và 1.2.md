# Mục tiêu chặng 1.1 và 1.2

Tài liệu làm việc của phiên code, không phải tài liệu thiết kế. Việc nào xong thì xóa hẳn khỏi đây, dấu vết nằm ở lịch sử git.

## Ba luật của phiên này

**Một tệp một việc.** Đây là luật thật, còn con số 250 dòng chỉ là mùi báo động — quá 250 dòng thì dừng lại tự hỏi tệp này có đang gánh hai việc không. Bảng khai dữ liệu (`DATA_SCHEMA`, `UI_SCHEMA`, `SYNC_SCHEMA`) được dài, vì chúng là dữ liệu phẳng chứ không phải logic, và chẻ một bảng khai ra nhiều tệp là mở đường cho hai bảng lệch nhau trong im lặng.

**Không framework giao diện.** Giữ nguyên ràng buộc cứng của tài liệu 04. Làm đẹp bằng khối biến CSS ở đầu `client/ui/styles.html` — bảng màu, phông, bo góc, đổ bóng, khoảng đệm — cộng bộ icon SVG nhúng thẳng vào tệp nên không phụ thuộc mạng. Mọi quyết định về không gian vẫn chỉ nằm ở `spatialConfig`.

**Mỗi bước phải tự kiểm được.** Không có bước nào "viết xong rồi mai xem". Ba đường kiểm đang có: `node tests/run.js` cho hàm thuần, `node tests/check-sheet.js` đọc sheet thật qua CSV, `node tests/gas.js <hàm>` chạy hàm thật trên tệp Sheet.

## Đuôi tệp phía client: `.html`, không phải `.js`

Tài liệu 04 Phần 10 ghi client là `.js`. Trên Apps Script thì không được, và đã thử nên biết chắc:

- Đẩy `.js` theo `scriptExtensions` thì Google coi nó là code **máy chủ**, không phải code chạy trong trình duyệt.
- Đẩy `.js` theo `htmlExtensions` thì đọc lại bị đổi ký tự: `a < b` thành `a &lt; b`, tức JavaScript vỡ cú pháp.

Nên client giữ tên logic của tài liệu nhưng đuôi `.html`, bên trong bọc thẻ `<script>`, nhúng vào `Sidebar.html` bằng scriptlet `include()` — đúng cách bản cũ đã làm và đã chạy. Bộ kiểm Node cắt thẻ `<script>` rồi nạp phần ruột vào hộp cát `vm`; phép cắt đó nằm trong code của mình, đọc được, khác với việc đi đoán luật đổi ký tự của Google.

**Cần chủ dự án đồng ý sửa một chỗ ở tài liệu 04 Phần 10: cột tên tệp của các dòng client đổi đuôi `.js` thành `.html`.** Tên logic không đổi.

## Cây thư mục

```
0_Documentation/
  Opus 4.8 tư vấn/     19 tài liệu thiết kế
  Nghiên cứu FBM/      16 chương API FBM
  Phiên code/          tài liệu làm việc, gồm tệp này và Câu hỏi đêm.md
1_ShinCRM_GAS/         dự án Apps Script, clasp push từ đây
  server/              code máy chủ, đuôi .gs
  client/              code sidebar, đuôi .html bọc thẻ script
    schema/  ram/  ui/  save/  util/
  Sidebar.html         khung bốn vùng cố định
2_ShinCRM_Extension/   Chrome Extension
9_Code_cu_tham_chieu/  code cũ, chỉ đọc, không sửa một dòng
tests/                 bộ kiểm Node, không đẩy lên Google
  lib/                 bộ nạp tệp .gs và .html vào hộp cát vm
```

## Chặng 1.1 — Đọc được sheet, ghi được log

Mục tiêu một câu: **từ dòng lệnh gọi một hàm, nó đọc hàng mã cột của sheet thật rồi in ra bảng mã → chỉ số cột, và sai một mã là báo lỗi ngay chứ không đọc lệch cột.**

Đây là chặng nền, không có giao diện. Nó tồn tại để mọi chặng sau không phải đoán cột nào là cột nào.

### Tệp dựng trong chặng này

| Tệp | Việc duy nhất của nó |
|---|---|
| `server/Settings.gs` | Đọc sheet `Config` thành một đối tượng cài đặt, có nhớ tạm trong một lượt chạy. Nơi duy nhất biết `LOG_TRACE` bật hay tắt. |
| `server/TextNormalize.gs` | Hàm `normalizeText` phía máy chủ: bỏ dấu, về chữ thường, dồn khoảng trắng. Không biết gì về sheet. |
| `client/util/textNormalize.html` | Bản sinh đôi của hàm trên, chạy trong trình duyệt. Hai bản phải cho cùng kết quả trên cùng một bảng ca kiểm. |
| `server/DataSchema.gs` | Bảng khai `DATA_SCHEMA`: bản gốc duy nhất của mã `@`, kiểu dữ liệu, sheet chứa nó. Chỉ có dữ liệu, không có logic. |
| `server/SheetIo.gs` | Đọc hàng 1 của một sheet, đối chiếu với `DATA_SCHEMA`, trả về bảng tra mã → chỉ số cột. Ném lỗi nêu tên mã sai. |
| `server/LogGate.gs` | Gom log trong RAM rồi ghi xuống sheet `Log` bằng một lệnh `setValues`, kèm luật cắt cửa sổ. |
| `tests/lib/load-gas.js` | Nạp tệp `.gs` và ruột thẻ `<script>` của tệp `.html` vào hộp cát `vm` để `tests/run.js` gọi được hàm thật. |

### Nghiệm thu — chạy được bằng máy, không cần người ngồi xem

1. `node tests/run.js` chạy hết bảy ca kiểm `normalizeText` của tài liệu 02 Phần 12, **cho cả hai bản** máy chủ và client, cộng một phép so hai bản với nhau. Bộ kiểm hiện đang bỏ qua vì chưa có hàm; sau chặng này nó phải thật sự chạy và số phép kiểm phải khác 0.
2. `node tests/gas.js dumpColumnMap --push` in ra bảng mã → chỉ số cột của cả năm sheet đọc từ hàng 1 thật.
3. `node tests/gas.js probeBadColumnCode --push` tự làm hỏng một mã ở hàng 1, đọc lại, xác nhận lỗi **nêu đúng tên mã sai**, rồi trả mã cũ về chỗ. Không có bước này thì phép chặn lệch cột chỉ là lời hứa.
4. `node tests/gas.js probeLogGate --push` ghi ba dòng log trong một lượt, xác nhận sheet `Log` tăng đúng ba dòng và **chỉ tốn một lệnh ghi**.
5. `node tests/check-sheet.js` vẫn xanh — bảng khai và sheet thật chưa lệch nhau.

## Chặng 1.2 — Nạp toàn bộ dữ liệu vào RAM

Mục tiêu một câu: **mở sidebar trên sheet trống, xem log thấy đúng số bản ghi và thời gian nạp, và đường nạp không vỡ khi số bản ghi bằng 0.**

Vẫn chưa có giao diện nhìn được. Chặng này chỉ lo việc dữ liệu vào được bộ nhớ trình duyệt và tra được bằng khóa.

### Tệp dựng trong chặng này

| Tệp | Việc duy nhất của nó |
|---|---|
| `server/LoadService.gs` | Một lời gọi trả về toàn bộ dữ liệu năm sheet dưới dạng mảng, kèm số bản ghi và thời gian nạp. Không định dạng, không lọc. |
| `client/ram/store.html` | Giữ dữ liệu trong RAM và trả lời câu hỏi tra cứu theo khóa. Không tự đi gọi máy chủ. |
| `client/ram/ingest.html` | Nhận mảng thô từ máy chủ, dựng các bảng tra, rồi giao cho `store`. Nơi duy nhất biết hình dáng mảng thô. |
| `Sidebar.html` | Khung bốn vùng cố định, nhúng các tệp client bằng `include()`. Chưa vẽ trường nào. |
| `client/ui/styles.html` | Khối biến CSS và bộ icon SVG. Dựng ở chặng này để chặng 1.3 chỉ việc dùng. |

### Nghiệm thu

1. `node tests/gas.js probeLoadAll --push` trả về số bản ghi từng sheet cộng thời gian nạp, và **chạy được trên sheet đang trống** — không ném lỗi khi số bản ghi bằng 0.
2. `node tests/run.js` nạp một bộ dữ liệu giả vào `ingest` rồi `store`, xác nhận tra theo khóa ra đúng bản ghi, tra khóa không tồn tại trả về rỗng chứ không nổ.
3. Mở sidebar bằng tay, xem sheet `Log` thấy một dòng nạp có số bản ghi và số milli-giây. Đây là bước duy nhất của hai chặng cần người ngồi trước máy, và nó chỉ là xem chứ không phải sửa.

## Việc cố tình để lại

Phép đo ngân sách ô của tài liệu 00 nằm ở chặng 1.5 chứ không phải ở đây — đo lúc chưa có dữ liệu thật thì ra số vô nghĩa.

Giá trị mồi cho sheet `Category`: chỉ điền các danh mục **không** ánh xạ sang FBM. Các danh mục có ánh xạ phải để trống cho tới khi có dữ liệu thật từ tài khoản FBM, vì điền đoán rồi sửa sau là tự tạo ra hai bảng lệch nhau.
