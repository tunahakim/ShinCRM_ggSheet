# Mục tiêu chặng 1.1 và 1.2

Tài liệu làm việc của phiên code, không phải tài liệu thiết kế. Việc nào xong thì xóa hẳn khỏi đây, dấu vết nằm ở lịch sử git.

## Đang ở đâu

Mục này tả **trạng thái hiện tại**, không phải lịch sử. Việc xong thì biến mất khỏi tài liệu, còn cái nó để lại thì hiện ra ở đây.

- Chặng 1.1 **xong**, đã nghiệm thu trên tệp Sheet thật: đọc hàng mã cột, đọc tham số `Config`, và cửa ghi log ghi ba dòng trong một lượt bằng đúng một lệnh ghi, bí mật ra sheet dưới dạng nhãn che.
- Chặng 1.2 **code đã dựng xong**, chưa nghiệm thu trên Google: đường nạp lõi và nạp giao dịch theo gói, kho RAM phía client, vỏ sidebar năm vùng, ba màn không có form (đang nạp, vượt trần số ô, lỗi).
- Bộ kiểm offline chạy `node tests/run.js` xanh, 222 phép kiểm, mười hai chủ đề — thêm sáu chủ đề mới: ngày dạng chuỗi, lưới sheet hữu hạn, trần số ô, đọc bản ghi, đọc danh mục, đọc tham số `Config`.
- Thư mục `server/` đã chia theo việc — `config`, `data`, `sheet`, `state`, `service`, `entry`, `util`, `log`, `dev` — thay vì rải phẳng. Bản đồ ở `Cây thư mục code.md`.
- Còn nợ ba việc để đóng chặng 1.2: thêm các hàm dò mới vào `DEV_RUNNER_ALLOWED`, chạy `node tests/gas.js probeLoadAll --push` và `probeSidebarTemplate --push`, rồi mở sidebar bằng tay xem sheet `Log` có một dòng nạp.

### Điều học được, để chặng sau không đạp lại

`setValues` **không tự nới sheet**. Lưới sheet là hữu hạn — sheet mới của Google có 1.000 hàng × 26 cột — và `deleteRows` **co lưới lại**. Ghép ba điều đó lại là một cái bẫy: phép đo `measureDeleteRows` từng chèn 5.000 hàng rồi xóa đi, để lại sheet `Log` với lưới 7 hàng, và lượt ghi log sau đó chết vì `getRange` chạm quá hàng cuối. Chết trong im lặng, vì cửa ghi log bắt mọi lỗi rồi đi tiếp theo đúng thiết kế.

Hai chỗ đã sửa: phép nới lưới nằm ở `server/sheet/SheetGrid.js` để mọi đường ghi đi qua một chỗ duy nhất, và tệp Sheet giả của bộ kiểm giờ có lưới hữu hạn nên bẫy này bị bắt trên máy. Mọi tệp sắp viết mà ghi xuống sheet đều phải gọi qua đó, không riêng gì log.

## Ba luật của phiên này

**Một tệp một việc.** Đây là luật thật, còn con số 250 dòng chỉ là mùi báo động — quá 250 dòng thì dừng lại tự hỏi tệp này có đang gánh hai việc không. Bảng khai dữ liệu (`DATA_SCHEMA`, `UI_SCHEMA`, `SYNC_SCHEMA`) được dài, vì chúng là dữ liệu phẳng chứ không phải logic, và chẻ một bảng khai ra nhiều tệp là mở đường cho hai bảng lệch nhau trong im lặng.

**Không framework giao diện.** Giữ nguyên ràng buộc cứng của tài liệu 04. Làm đẹp bằng khối biến CSS ở `client/ui/tokens.html` — bảng màu, phông, bo góc, đổ bóng, khoảng đệm — cộng bộ icon SVG nhúng thẳng vào tệp nên không phụ thuộc mạng. Mọi quyết định về không gian vẫn chỉ nằm ở `spatialConfig`.

**Mỗi bước phải tự kiểm được.** Không có bước nào "viết xong rồi mai xem". Ba đường kiểm đang có: `node tests/run.js` cho hàm thuần, `node tests/check-sheet.js` đọc sheet thật qua CSV, `node tests/gas.js <hàm>` chạy hàm thật trên tệp Sheet.

## Luật đuôi tệp và tên tệp trên Apps Script

Ba việc này đã trả giá để biết, nên ghi lại ở đây thay vì để phiên sau dò lại.

### Tệp máy chủ: trên máy đuôi `.js`, trên Google thành `.gs`

Trên máy để đuôi `.js` cho IDE hiểu là JavaScript mà mở tử tế. `clasp push` đọc `scriptExtensions` trong `.clasp.json` và tự đổi thành `.gs` khi đặt lên Google. Trong `.clasp.json` thì `.js` xếp trước `.gs`, vì `clasp pull` ghi ra đuôi đầu danh sách — xếp ngược lại là mỗi lần pull tự đổi hết tệp về `.gs`.

### Tên tệp trên Google là **cả đường dẫn**, không phải tên cụt

`clasp push` đẩy `server/SheetIo.js` lên thành một tệp tên đúng là `server/SheetIo.gs` — dấu gạch chéo nằm trong tên tệp, chứ Apps Script không có thư mục thật.

Việc này quan trọng nhất ở phía HTML, và chủ dự án đã bị lỗi này một lần rồi: `HtmlService.createTemplateFromFile()` và scriptlet `include()` phải nhận **cả đường dẫn, bỏ đuôi**:

```js
// Đúng
HtmlService.createTemplateFromFile('client/Sidebar');
<?!= include('client/ui/tokens'); ?>

// Sai — Google không tìm thấy tệp, lỗi chỉ nổ lúc chạy chứ không nổ lúc đẩy
<?!= include('tokens'); ?>
```

Bản cũ ở `9_Code_cu_tham_chieu/` đã làm đúng cách này: `createTemplateFromFile('src/ui/Sidebar')` với `<?!= include('src/ui/Styles'); ?>`.

### Tệp client: `.html`, không phải `.js`

Tài liệu 04 Phần 10 ghi client là `.js`. Trên Apps Script thì không được, và đã thử nên biết chắc:

- Đẩy `.js` theo `scriptExtensions` thì Google coi nó là code **máy chủ**, không phải code chạy trong trình duyệt.
- Đẩy `.js` theo `htmlExtensions` thì đọc lại bị đổi ký tự: `a < b` thành `a &lt; b`, tức JavaScript vỡ cú pháp.

Nên client giữ tên logic của tài liệu nhưng đuôi `.html`, bên trong bọc thẻ `<script>` hoặc `<style>`, nhúng vào `client/Sidebar.html` bằng scriptlet `include()` — đúng cách bản cũ đã làm và đã chạy. Bộ kiểm Node cắt thẻ `<script>` rồi nạp phần ruột vào hộp cát `vm`; phép cắt đó nằm trong code của mình, đọc được, khác với việc đi đoán luật đổi ký tự của Google.

Chủ dự án đã đồng ý 05/09/2026, và tài liệu 04 Phần 10 đã sửa theo: cột tên tệp của các dòng client mang đuôi `.html`.

## Cây thư mục

Bản đồ thư mục kèm mô tả từng tệp nằm ở `Cây thư mục code.md` cùng thư mục này. Giữ một bản duy nhất là có ý thức: hai bản đồ trong hai tệp thì trước sau gì cũng lệch nhau, và bản lệch còn hại hơn không có.

## Chặng 1.2 — Nạp toàn bộ dữ liệu vào RAM

Mục tiêu một câu: **mở sidebar trên sheet trống, xem log thấy đúng số bản ghi và thời gian nạp, và đường nạp không vỡ khi số bản ghi bằng 0.**

Vẫn chưa có giao diện nhìn được. Chặng này chỉ lo việc dữ liệu vào được bộ nhớ trình duyệt và tra được bằng khóa.

### Tệp dựng trong chặng này

| Tệp | Việc duy nhất của nó |
|---|---|
| `server/service/LoadService.js` | Trình tự và kích cỡ của hai đường nạp: lõi một lần, giao dịch theo gói. Không tự đọc ô nào. |
| `server/state/DirtyState.js` | Đọc khối trạng thái bẩn từ `DocumentProperties` để đính vào mọi phản hồi. Chỉ chiều đọc. |
| `server/entry/EntryPoint.js` | Vỏ bọc chung của mọi cửa vào: nhả bộ đệm log, ghi dòng lỗi, ném lại. |
| `server/entry/ErrorReport.js` | Chọn kênh báo lỗi theo cửa vào, cộng kho chờ cho lúc không có người. |
| `server/entry/Menu.js` | Thực đơn trên thanh menu và lệnh mở sidebar. |
| `server/sheet/EntityRead.js`, `CategoryRead.js`, `ConfigRead.js`, `CellBudget.js`, `SheetGrid.js` | Năm cửa đọc và đo sheet, mỗi tệp một việc. |
| `server/util/DateText.js` | Đổi `Date` sang chuỗi cố định độ dài, vì `google.script.run` không mang được `Date`. |
| `client/ram/store.html` | Giữ dữ liệu trong RAM và trả lời câu hỏi tra cứu theo khóa. Không tự đi gọi máy chủ. |
| `client/ram/ingest.html` | Nhận mảng thô từ máy chủ, dựng các bảng tra, rồi giao cho `store`. Nơi duy nhất biết hình dáng mảng thô. |
| `client/ram/bootstrap.html` | Trình tự ba bước lúc mở sidebar. Biết thứ tự, không biết cách làm từng việc. |
| `client/util/serverCall.html` | Chỗ duy nhất gọi `google.script.run`, bọc thành `Promise` và tự lo dải tiến trình. |
| `client/schema/schemaAccess.html` | Cửa duy nhất đọc bảng khai trường, gõ sai tên trường thì ném lỗi kèm gợi ý. |
| `client/Sidebar.html` | Khung năm vùng cố định, nhúng các tệp client bằng `include()`. Chưa vẽ trường nào. |
| `client/ui/tokens.html` | Khối biến CSS của cả sidebar. Dựng ở chặng này để chặng 1.3 chỉ việc dùng. |
| `client/ui/frame.html` | Bố cục năm vùng, cho bố cục bánh kẹp có sẵn ở mọi màn. |
| `client/ui/progress.html` | Dải tiến trình, đếm số lời gọi đang chờ. |
| `client/ui/statusScreen.html` | Ba màn không có form: đang nạp, vượt trần số ô, lỗi. |

### Nghiệm thu

1. `node tests/gas.js probeLoadAll --push` trả về số bản ghi từng sheet cộng thời gian nạp, và **chạy được trên sheet đang trống** — không ném lỗi khi số bản ghi bằng 0.
2. `node tests/run.js` nạp một bộ dữ liệu giả vào `ingest` rồi `store`, xác nhận tra theo khóa ra đúng bản ghi. Ba đường tra có **ba luật khác nhau**, và bộ kiểm phải kiểm cả ba: `getCustomer` thiếu mã thì **ném lỗi** vì đó là dấu hiệu bản đồ hàng đã cũ; `getActivities` trả về mảng rỗng; `getCustomerIdByRow` trả về chuỗi rỗng vì bấm vào hàng tiêu đề thì không được mở gì.
3. Mở sidebar bằng tay, xem sheet `Log` thấy một dòng nạp có số bản ghi và số milli-giây. Đây là bước duy nhất của hai chặng cần người ngồi trước máy, và nó chỉ là xem chứ không phải sửa.

## Việc cố tình để lại

Phép đo ngân sách ô: tài liệu 00 xếp việc **đo trên khối lượng thật** vào Giai đoạn 3, và điều đó vẫn đúng — sheet còn trắng thì đo ra số vô nghĩa. Nhưng phiên code đã dựng sẵn **cái thước** ở `server/sheet/CellBudget.js` và cắm nó vào đầu `loadCore`, vì đường nạp cần một chỗ để dừng khi tệp đã quá ì. Đây là một điểm lệch với tài liệu 00, đã ghi thành câu hỏi ở `Câu hỏi đêm.md`.

Giá trị mồi cho sheet `Category`: chỉ điền các danh mục **không** ánh xạ sang FBM. Các danh mục có ánh xạ phải để trống cho tới khi có dữ liệu thật từ tài khoản FBM, vì điền đoán rồi sửa sau là tự tạo ra hai bảng lệch nhau.
