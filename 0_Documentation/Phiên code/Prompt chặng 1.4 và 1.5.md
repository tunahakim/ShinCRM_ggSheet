# Prompt mở phiên: chặng 1.4 và 1.5

Dán cả tệp này vào đoạn chat mới. Nó tự đủ — người nhận không cần đọc lại đoạn chat nào trước đó.

## Việc của bạn

Làm nốt chặng 1.4 và 1.5 của ShinCRM, dự án ở `D:\ShinCRM_ggSheet`. Đọc `CLAUDE.md` ở gốc dự án trước mọi thứ khác, rồi ba tệp trong `0_Documentation/Phiên code/`: `Mục tiêu ShinCRM độc lập.md`, `Cây thư mục code.md` và `Câu hỏi đêm.md`.

Đích không đổi: ShinCRM dùng được độc lập cùng Extension, chưa cần đồng bộ FBM, chưa cần bot. Chủ dự án chốt ngày 05/09/2026.

Hai quyền kèm theo: tài liệu thiết kế có chỗ chưa chuẩn thì được sửa tài liệu rồi code theo bản đúng; điểm mơ hồ thì ghi vào `Câu hỏi đêm.md`, chọn phương án an toàn, chạy tiếp.

Ba điều kiện nghiệm thu, thiếu một là chưa xong:
1. `node tests/run.js` xanh hết.
2. Mỗi chặng nghiệm thu trên tệp Sheet DEV thật, không chỉ trên hộp cát.
3. Mọi mục `[RÀNG BUỘC CỨNG]` của tài liệu 03, 04, 05, 06, 07 có chỗ trong code hoặc có lý do ghi lại vì sao không.

## Điều kiện để dùng được prompt này

Prompt này chỉ dùng khi chặng 1.3 đã xong. Kiểm ba việc trước khi viết dòng code đầu tiên: mở `Mục tiêu ShinCRM độc lập.md` xem mục chặng 1.3 còn gạch đầu dòng nào chưa gạch không, chạy `node tests/run.js` xem có xanh, và `git status` xem còn tệp nào chưa commit. Còn việc dở của 1.3 thì làm nốt cái đó trước, đừng dựng chiều ghi lên một nền chưa xanh.

Nền bạn thừa hưởng khi 1.3 đã xong: tầng dữ liệu, bộ nạp theo gói, kho RAM, bộ máy vẽ, bốn màn, bảng mười sáu hành động, bộ phát click, menu và hộp tìm khách. Cả chiều đọc chạy thông trên Sheet DEV thật với 1.700 khách và 10.000 giao dịch. Chiều ghi chưa có một dòng nào — đó chính là việc của bạn.

## Chặng 1.4 — lưu được. Đây là mốc "đã dùng được để đi bán hàng".

Tài liệu nguồn, đều ở `0_Documentation/Opus 4.8 tư vấn/`: `04. Bộ máy render và luồng lưu.md` cho chiều client, `06. CỬA GHI XUỐNG SHEET ShinCRM.md` cho chiều máy chủ, `03. Data schema & UI schema.md` Phần 6 cho luật ngầm định và kiểm giá trị, `10. Ghi log và báo lỗi.md` cho đường báo lỗi.

Phải dựng:
- `client/save/saveFlow.html` — gom dữ liệu form từ DOM theo `data-field`, bỏ ô mang `data-readonly="1"`, gọi máy chủ, nhận kết quả, cập nhật RAM rồi vẽ lại.
- `server/gate/` — ba cửa ghi cùng họ với `LogGate`: `WriteGate.js` ghi bản ghi, `IdGate.js` cấp mã mới từ bộ đếm ở sheet Config, `DeleteGate.js` xóa mềm và hoàn tác.
- `server/FieldLogic.js` — bản máy chủ của sáu hàm ngầm định và các hàm kiểm giá trị. Bên client đã có `client/schema/fieldLogic.html`; hai bên phải cho cùng kết quả, và tài liệu 03 coi máy chủ là bên nói lời cuối.
- Xóa mềm và hoàn tác: `recordStatus` chuyển `active` ↔ `deleted`, không xóa hàng thật khỏi sheet.

Bốn stub phải thay bằng việc thật — hiện chúng ném lỗi qua `actionsChuaDung()` trong `client/ui/actions.html`: `saveForm`, `deleteSelectedActivities`, `deleteActivity`, `undoDelete`. Xóa luôn hàm `actionsChuaDung` nếu sau chặng 1.5 không còn ai gọi.

## Chặng 1.5 — làm mới và sheet quản trị

Tài liệu nguồn: `07. LÀM MỚI DỮ LIỆU VÀ SHEET QUẢN TRỊ ShinCRM.md`, `08. NGÔN NGỮ LỌC VÀ SẮP XẾP TRÊN SHEET QUẢN TRỊ.md` và `08A — HỢP ĐỒNG THAM SỐ SHEET QUẢN TRỊ.md`.

Phải dựng:
- `server/view/` — đọc bộ lọc và bậc sắp xếp từ sheet Config, rồi vẽ lại vùng dữ liệu của sheet quản trị.
- Chiều ghi của `server/state/DirtyState.js`. Chiều đọc đã có và cố ý không bao giờ ném lỗi vì nó đi kèm mọi lượt trả về; chiều ghi là việc mới.
- `client/ram/refresh.html` — nạp lại dữ liệu mà không dựng lại cả sidebar.
- Ngôn ngữ lọc của tài liệu 08.

Một stub phải thay: `renderActiveViewSheet` trong `client/ui/actions.html`.

## Luật kiến trúc — sai chỗ nào trong mục này cũng hỏng trong im lặng

- Apps Script không có `import`. Mọi tệp dùng chung một vùng tên toàn cục, hai tệp khai trùng một tên thì bản nạp sau lặng lẽ thắng. Đặt tên có tiền tố theo tệp: `save*`, `writeGate*`, `viewSheet*`, `refresh*`. Ca kiểm `tests/cases/namespace.js` sẽ bắt nếu trùng.
- Tên tệp trên Google là cả đường dẫn: `server/gate/WriteGate.js` ở máy thành tệp tên `server/gate/WriteGate` trên Google. Nên `include()` và `createTemplateFromFile()` phải nhận cả đường dẫn, bỏ đuôi.
- Tệp client buộc phải là `.html` bọc thẻ `<script>`, không phải `.js` như tài liệu 04 Phần 10 và 05 Phần 13 viết.
- Dựng tệp client mới thì phải thêm một dòng `include` vào `client/Sidebar.html`, đúng chỗ trong thứ tự. Thiếu dòng đó thì hàm không tồn tại lúc chạy, mà bộ kiểm offline vẫn xanh — vì hộp cát nạp tệp theo danh sách riêng của nó.
- Hàm khai ở tệp nhúng SAU vẫn gọi được từ thân hàm của tệp nhúng TRƯỚC, vì tên được tra lúc gọi chứ không phải lúc nạp. Cái giá: không được gọi hàm như vậy ở tầng ngoài cùng của một thẻ `<script>`.
- Tệp trong `client/screen/`, `client/ui/actions.html` và `client/ram/prefs.html` không được chạm `document` hay `google.script` trực tiếp. Có ca kiểm quét mã nguồn để chặn, và `client/save/saveFlow.html` sẽ phải chọn phe: nó gom dữ liệu từ DOM nên nó được chạm DOM, nhưng đường gọi máy chủ vẫn phải đi qua `client/util/serverCall.html`.
- Mọi đường vẽ đi qua `renderScreen(man, boiCanh)` — dựng cả bốn vùng trong RAM rồi gán một lần để khỏi nháy — hoặc `renderTarget(id)` khi chỉ đổi một vùng. `[RÀNG BUỘC CỨNG]` tài liệu 04 Phần 6.
- `google.script.run` không mang `Date` qua được. Mọi mốc thời gian đi đường chuỗi, qua `server/util/DateText.js` và `client/util/valueText.html`.
- `Store.getCustomer(id)` ném lỗi với mã không có, không trả `undefined`. `Store.getActivities(customerId)` trả về cả bản ghi sống và bản ghi đã xóa mềm. Không có đường tra một giao dịch theo mã riêng của nó.
- Markdown không render trong chuỗi HTML của client. Muốn chữ đậm thì viết `<b>`, không viết hai dấu sao.
- `runEntryPoint` xả bộ đệm log ở `finally`, nên đừng dùng giá trị trả về của `flushLog()` làm số hàng đã ghi.
- Trần ngân sách ô là 500.000 ô cho cả tệp, hiện dùng 395.460. Chiều ghi mới sẽ ăn thêm, nên `CellBudget` phải được tính lại sau chặng 1.4.

## Luật bộ kiểm

`tests/` nằm ở gốc dự án, không nằm trong `1_ShinCRM_GAS`. Thêm chủ đề mới thì thêm một tệp vào `tests/cases/` và một dòng `require` vào `tests/run.js`. Quên dòng thứ hai thì ca kiểm nằm đó mà không ai chạy.

Hai hộp cát cố ý tách rời: `tests/lib/dung-hop.js` cho tệp máy chủ, `tests/lib/dung-client.js` cho tệp client. Server và client có hàm sinh đôi cùng tên như `normalizeText`, chung hộp thì chỉ kiểm được một bản.

Đọc `tests/cases/formScreen.js` trước khi viết tệp ca kiểm đầu tiên — đó là lối viết chuẩn của nhà: `section` gom nhóm, `check` so giá trị, `checkThrows` bắt lỗi ném ra, tên ca viết bằng tiếng Việt và nói rõ cái hỏng-trong-im-lặng mà nó chặn. Ca kiểm ở đây không để chứng minh code chạy đúng, mà để chặn đúng những kiểu sai không làm gì đỏ lên cả.

Cấm sửa ca kiểm cho vừa với code. Ca đỏ nghĩa là code sai, hoặc ca sai — mà ca sai thì phải nói ra với chủ dự án chứ không sửa lặng lẽ.

Chiều ghi có một loại ca kiểm mà các chặng trước chưa cần: `tests/lib/fake-sheet.js` tự đếm số lệnh `setValues` và `deleteRows`. Dùng nó để chốt luật "cả lượt một lệnh ghi" cho từng cửa ghi mới, giống cách `tests/cases/logGate.js` đã làm.

## Ràng buộc an toàn — đọc trước khi chạm Sheet

Chặng 1.4 là lần đầu hệ thống ghi xuống sheet, nên bốn việc dưới đây từ chỗ "để sau" thành chỗ gấp:

1. `server/dev/` phải xóa cả thư mục trước khi Sheet mang dữ liệu khách hàng thật. Trong đó `DevRunner.js` là một cửa web chạy hàm dưới quyền chủ tệp. Chạy `devLogTraceOff` TRƯỚC khi xóa, vì chế độ vết ghi bí mật ra sheet nguyên văn, mà công tắc tắt nó nằm trong chính thư mục sắp xóa.
2. Tham số `LOG_TRACE` đang bật giá trị `all` ở sheet `Config` hàng 4 của Sheet DEV. Trong lúc nó còn bật, sheet `Log` có thể chứa bí mật dạng chữ đọc được, và tệp không được chia sẻ ra ngoài.
3. Quyền "bất kỳ ai có đường liên kết đều sửa được" của Sheet phải tắt trước khi khoảng 1.700 khách thật vào.
4. Không chạm tệp Sheet đang dùng thật để bán hàng. Mọi thử nghiệm trên Sheet DEV.

`9_Code_cu_tham_chieu/` chỉ để đọc, không sửa một dòng. Nó là câu trả lời cho mọi câu hỏi "người dùng cũ quen thao tác thế nào", và với chặng 1.4 thì nó là nguồn của luồng lưu cũ cùng mười ba chỗ `alert()` báo lỗi cho người dùng.

Ba tệp không bao giờ được vào git, đã có trong `.gitignore`: `1_ShinCRM_GAS/.dev-token`, `1_ShinCRM_GAS/.dev-runner.json`, `1_ShinCRM_GAS/server/dev/DevToken.js`. Không in giá trị thẻ hay khóa ra màn hình chat, kể cả một phần.

## Cách chạy

Bộ kiểm offline, không cần mạng:

```bash
node tests/run.js
```

Chạy một hàm thật trên Google qua cửa DevRunner, cần mạng:

```bash
node tests/gas.js <tên hàm>
```

Bản triển khai đang ghim ở phiên bản @23. Sửa code rồi mà không truyền `--push` thì Google lặng lẽ chạy bản cũ, và bạn sẽ đi tìm một lỗi không tồn tại. Đây là cái bẫy đã mất một buổi.

Trên máy này, thư mục làm việc của shell không chắc là gốc dự án. Dùng đường dẫn tuyệt đối `D:\ShinCRM_ggSheet\...` trong lệnh shell, hoặc `cd` hẳn về gốc trước.

## Luật làm việc với chủ dự án

Chủ dự án là dân bán hàng, không phải lập trình viên, và sẽ tự tiếp nhận code này. Viết tiếng Việt có dấu. Thuật ngữ tiếng Anh thì mở ngoặc giải thích bằng tiếng Việt.

Nghiêm cấm hard wrap trong tài liệu, trong docstring và trong mô tả commit. Xuống dòng chỉ khi hết một ý.

Docstring ngắn gọn, chỉ ghi cái không đọc được từ chính đoạn code bên dưới. Docstring dài ngang phần code là lãng phí.

Việc trong tài liệu dạng todo mà làm xong thì xóa hẳn dòng đó, không ghi "đã xong". Lịch sử nằm ở git, không nằm trong tài liệu.

Dựng thêm tệp code hay thư mục code nào thì thêm ngay một dòng vào `Cây thư mục code.md` trong cùng lượt làm việc, đừng để dồn sang lượt sau.

Xong một nhiệm vụ là commit, đừng dồn mọi thứ vào một commit. Mô tả commit tiếng Việt có dấu, mỗi ý một dòng.

Việc quan trọng phải hỏi chủ dự án và đợi quyết định rồi mới ghi vào code hay tài liệu. Thấy chỗ nào mâu thuẫn hay chưa hợp lý thì nói ra, kể cả khi đó là thứ chủ dự án vừa đưa ra, hoặc thứ chính bạn vừa viết ra. Chủ dự án cần hiệu quả, không cần răm rắp nghe theo.

Báo tiến độ thường xuyên qua màn hình chat, nhưng mỗi kết quả chỉ báo một lần. Lượt sau thì trỏ tới chỗ đã ghi, đừng kể lại.

## Một quan sát để cân nhắc, chưa ai quyết

Lượt nạp trên Sheet DEV hiện mất 42,6 giây tổng, trong đó 7,7 giây tới khung hình đầu tiên và 26,9 giây máy chủ tính toán cộng cả 6 vòng gọi. Với người mở sidebar vài chục lần một ngày thì đó là con số đáng nhìn lại. Nó thuộc phần làm mới của chặng 1.5, và chưa có phương án nào được chốt — nêu ra để bạn giữ trong đầu khi dựng `client/ram/refresh.html`, chứ không phải việc phải làm ngay.
