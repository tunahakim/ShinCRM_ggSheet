# PROMPT cho phiên code đầu tiên — chặng 1.0 và 1.1

Tệp này là **đề bài của một phiên duy nhất**, không phải tài liệu thiết kế. Dán toàn bộ nội dung này vào phiên mới. Soạn 04/09/2026.

## Phần 1 — Bối cảnh, đọc trước khi làm bất cứ gì

ShinCRM mini là CRM cá nhân một người dùng, chạy trên Google Sheet cộng Google Apps Script (GAS) cộng một Chrome Extension. Bộ tài liệu thiết kế đã **đóng xong** sau nhiều phiên, nằm ở `0_Documentation/Opus 4.8 tư vấn/`, gồm tài liệu 01 tới 10 kèm năm hợp đồng (`02A`, `03A`, `05A`, `08A`, `09A`, `10A`). Không còn quyết định thiết kế nào phải chốt để bắt đầu code.

Phiên này là **phiên code đầu tiên**. Trước nó, số dòng code viết theo kiến trúc mới là **không**.

Nhưng trong repo **đã có khoảng 3.550 dòng code cũ đang chạy được**, theo một kiến trúc khác. Đừng nhầm nó là code của kiến trúc mới, và đừng sửa nó. Quyết định đã chốt với chủ dự án: **viết mới hoàn toàn, không refactor** (tái cấu trúc). Lý do đầy đủ và bảng "phần nào bê nguyên, phần nào chỉ đọc, phần nào bỏ" nằm ở **`00. Lộ trình và checklist.md` Phần 6** — đọc phần đó trước khi mở bất cứ tệp code cũ nào.

### Thứ tự đọc tài liệu

1. `00. Lộ trình và checklist.md` — toàn bộ. Đây là bản đồ: đang ở đâu, còn treo gì, làm gì tiếp, và Phần 6 là bảng tra code cũ.
2. `01. Quy chuẩn nền ShinCRM.md` — luật đặt tên, luật trình bày tài liệu, bản đồ tài liệu. Phần 5 của nó cho biết tài liệu nào là nguồn chuẩn của việc gì.
3. `02. KIẾN TRÚC DỮ LIỆU ShinCRM.md` và `02A` — hình dạng sheet, mã cột `@`, mười cột mô tả bản ghi.
4. `03. Data schema & UI schema.md` và `03A` — hai bảng `DATA_SCHEMA` và `UI_SCHEMA`, nối nhau bằng **tên trường**.
5. `10. Ghi log và báo lỗi.md` và `10A` — sheet `Log` và module log dùng chung, vì chặng 1.1 dựng nó.

Bốn tài liệu còn lại (04, 05, 06, 07, 08 cùng hợp đồng) là của các chặng sau. Đọc khi tới chặng đó, đừng gánh hết vào đầu phiên.

## Phần 2 — Luật bắt buộc của phiên, không được vi phạm

Đây là luật của cả dự án, ghi trong `CLAUDE.md` ở gốc repo, và nó **ghi đè** mọi mặc định:

1. **Việc quan trọng phải bàn với chủ dự án rồi mới viết.** Tuyệt đối cấm AI tự quyết mà chủ dự án không biết gì. Nếu trong lúc code thấy tài liệu thiếu hoặc mâu thuẫn thì **dừng lại hỏi**, đừng tự chọn một hướng rồi viết luôn.
2. **Được phép và được khuyến khích phản biện**, kể cả phản biện chính tài liệu hoặc chính câu vừa nói của mình. Cái quan trọng là hiệu quả, không phải răm rắp nghe theo.
3. **Nghiêm cấm hard wrap** (ngắt dòng cứng giữa câu) trong tài liệu, trong mô tả commit, và trong code. Comment trong code thì được; docstring cũng cấm hard wrap.
4. Dùng thuật ngữ tiếng Anh thì mở ngoặc ghi nghĩa tiếng Việt.
5. Một mục dạng todo đã làm xong thì **xóa hẳn, không để lại dấu vết** — lịch sử nằm ở git, cùng lắm tóm tắt trong mô tả commit.
6. Commit: tiếng Việt có dấu, luôn có Description, không hard wrap, và **chỉ commit khi chủ dự án bảo commit**.

Thêm hai luật riêng của phiên này:

7. **Code cũ không sửa một dòng nào.** Ngoại lệ duy nhất là hai tệp Extension bê sang bản mới, và bản sửa nằm ở code mới chứ không sửa tại chỗ.
8. **Không chạm tệp Sheet đang dùng thật.** Mọi việc làm trên tệp Sheet mới. Tệp đang chạy là dữ liệu bán hàng thật của chủ dự án và vẫn phải dùng được suốt thời gian dựng cái mới.

## Phần 3 — Việc của phiên, chặng 1.0: dựng môi trường

Đích của chặng: `clasp push` lên một dự án Apps Script **mới** chạy được, và `clasp pull` về không mất tệp.

### 3.1 Dồn code cũ vào thư mục tham chiếu

Tạo `9_Code_cu_tham_chieu/` ở gốc repo, chuyển toàn bộ `1_ShinCRM_GAS/src/` hiện tại vào đó, giữ nguyên cây thư mục con để các số dòng ghi trong Phần 6 của tài liệu 00 còn đúng. Dùng `git mv` để git thấy đây là phép chuyển chứ không phải xóa rồi thêm.

`2_ShinCRM_Extension/` **để nguyên chỗ cũ**, không chuyển. Lý do: hai tệp trong đó sẽ được bê sang bản mới, và việc chọn "bản Extension nào là bản thật" thuộc chặng 1.3 chứ không phải chặng này.

Sau khi chuyển, `1_ShinCRM_GAS/` chỉ còn `.clasp.json` và `appsscript.json`. Thư mục code mới dựng dần theo bảng chặng ở tài liệu 00 Phần 3.

### 3.2 Tạo tệp Sheet mới, trắng

Chủ dự án tự làm bước này trên giao diện Google Drive, phiên code không có quyền:

- Tạo một tệp Google Sheet **mới hoàn toàn**. Không sao chép tệp đang chạy, không chép dữ liệu sang.
- Tệp Sheet đang chạy **không chạm**. Nó vẫn phải dùng được để đi bán hàng suốt thời gian dựng cái mới, và nó sẽ còn là chỗ bán hàng cho tới khi FBM nạp dữ liệu về tệp mới.

Sheet trắng là **quyết định đã chốt từ trước**, không phải chuyện tiết kiệm công: tài liệu 09 Phần 13 ghi database cũ bỏ hoàn toàn, module đồng bộ khởi động trên sheet trống, coi như triển khai một dự án mới chưa hề có dữ liệu. Cả luồng khách tạm `TMP-` và việc ghép cặp 1.700 khách đã bị xóa khỏi thiết kế dựa trên tiền đề đó.

Hệ quả phải nhớ khi code: **suốt Giai đoạn 1, sheet gần như trống.** Đường nạp phải chạy đúng khi số bản ghi bằng 0, không được ném lỗi và không được coi sheet trống là sheet hỏng. Bản ghi thật đầu tiên xuất hiện ở chặng 1.4, do gõ tay. Khối lượng thật chỉ về ở Giai đoạn 3, và mọi phép đo khối lượng đã chuyển về đó.

### 3.3 Dựng bốn sheet và sheet `Log` trên tệp mới

Trên tệp mới, dựng bốn sheet `Customer`, `Activity`, `Category`, `Config` cộng sheet `Log`. Đây là chỗ tài liệu 02 Phần 3 và tài liệu 10 Phần 2 là nguồn chuẩn, đọc trước khi gõ.

Bốn sheet kia có **ba hàng tiêu đề**, chủ dự án đã chốt lại ngày 04/09/2026:

- Hàng 1: mã cột kỹ thuật bắt đầu bằng `@`. Đây là căn cứ **duy nhất** để code nhận cột.
- Hàng 2: tên hiển thị cho người đọc. Code bỏ qua hoàn toàn.
- Hàng 3: hàng ghi chú hoặc hàng lọc. Code bỏ qua hoàn toàn.
- Dữ liệu từ **hàng 4** trở xuống.

Sheet `Log` là ngoại lệ duy nhất: **một** hàng tiêu đề, chín cột, không mã `@`, dữ liệu từ hàng 2.

Mã cột lấy từ tài liệu 02 Phần 4 cho `Customer` và Phần 5 cho `Activity`. Kèm mười cột mô tả bản ghi, để trống: sáu cột ở `Customer` (`@CUS_FBM_ID`, `@CUS_MA_KH_FBM`, `@CUS_HASH_FBM`, `@CUS_SYNC_TT`, `@CUS_SYNC_LUC`, `@CUS_TT_BAN_GHI`) và bốn cột ở `Activity` (`@ACT_FBM_ID`, `@ACT_HASH_FBM`, `@ACT_SYNC_TT`, `@ACT_TT_BAN_GHI`).

Lợi thế của tệp trắng là ở đây: không có phép chuyển đổi nào, không đổi tên sheet, không viết lại `@KH_*` thành `@CUS_*`, và không phải gỡ cái bẫy `@KH_FBM_STATUS` của bản cũ — cột đó **gộp** hai việc mà tài liệu 02 đã tách hẳn ra, "cho phép đẩy lên FBM" và "trạng thái đồng bộ", nên nó không có mã mới nào tương ứng một-đối-một. Gõ hàng 1 đúng ngay từ đầu là xong.

### 3.4 Tạo dự án Apps Script gắn với tệp mới

Cũng do chủ dự án làm trên giao diện:

- Mở **tệp mới**, vào Tiện ích mở rộng → Apps Script. Việc này tạo một dự án script **gắn liền** (container-bound) với tệp đó.
- Vào Cài đặt dự án, copy `scriptId`.

Rồi phiên code ghi `scriptId` mới vào `1_ShinCRM_GAS/.clasp.json`.

**Cảnh báo quan trọng:** `scriptId` đang nằm trong `.clasp.json` là của dự án **cũ đang chạy thật**. Đẩy code mới lên đó là ghi đè hệ đang dùng để bán hàng. Đổi `scriptId` **trước** khi gõ `clasp push` lần đầu, và trước lần push đầu tiên hãy chạy `clasp show-file-status` để nhìn xem sẽ đẩy gì lên đâu.

### 3.5 Kiểm môi trường clasp

`clasp` **đã cài sẵn và đã đăng nhập** — đã kiểm ngày 04/09/2026: bản 3.2.0, tài khoản `leanh99dnsl@gmail.com`, tệp `~/.clasprc.json` có sẵn, `node` v24 và `npm` v11 đều có. Chủ dự án tưởng đã gỡ, nhưng không.

Việc còn lại chỉ là kiểm lại, và biết mấy điều sau:

- Kiểm nhanh: `clasp --version`, rồi `clasp show-authorized-user`.
- **Bản 3 khác bản 2 ở tên lệnh.** Bản 3 dùng `clone-script`, `create-script`, `show-file-status`, `tail-logs`; các tên cũ `clone`, `create`, `status`, `logs` vẫn còn nhưng chỉ là bí danh. Đừng chép lệnh từ hướng dẫn cũ trên mạng về dùng mà không đối chiếu `clasp --help`.
- `clasp` **làm phẳng thư mục**: một dấu `/` trong tên tệp trên Apps Script là thư mục duy nhất tồn tại. `src/core/Api.js` dưới máy thành một tệp tên `src/core/Api` trên dự án. Đã kiểm bằng `clasp show-file-status` là bản 3.2.0 vẫn hiểu đúng cây thư mục con của `.clasp.json` hiện tại.
- Hai tệp `UI_Factory.html` và `UI_Layouts.html` trong code cũ **rỗng hoàn toàn, 0 byte**. Nếu `clasp push` báo lỗi ở tệp rỗng thì đó là lý do — nhưng sau bước 3.1 thì chúng đã sang thư mục tham chiếu và không còn bị đẩy nữa.

### 3.6 Chạy thử để đóng chặng 1.0

Đẩy `appsscript.json` cộng một tệp `.gs` chỉ có một hàm in ra một dòng, xác nhận `clasp push` xong thì mở editor thấy tệp, chạy hàm thấy dòng in ra, rồi `clasp pull` về không mất tệp nào. Tới đây chặng 1.0 xong.

## Phần 4 — Việc của phiên, chặng 1.1: đọc được sheet

Đích của chặng, lấy nguyên từ tài liệu 00: gọi một hàm trong editor, in ra bảng mã cột → chỉ số cột của `Customer`, và **sai một mã là báo lỗi ngay**.

Bốn tệp của chặng: `server/Settings.gs`, `server/DataSchema.gs`, `server/SheetIo.gs`, `server/LogGate.gs`.

`LogGate` dựng ngay ở chặng này, không để sau, vì mọi chặng về sau đều cần nó để tự quan sát. Nguồn chuẩn là tài liệu 10 và 10A: đệm log trong RAM rồi **một** lệnh `setValues` cho mỗi lượt chạy, hai chế độ log, `LOG_TRACE` đặt ở sheet `Config`, cửa sổ giữ 30 ngày hoặc 5.000 dòng.

Kèm theo chặng này có **một việc đo còn treo**, ghi ở tài liệu 00 Phần 5 loại một: đo chi phí thật của `deleteRows` trên sheet `Log` 5.000 dòng. Làm cùng lúc dựng `LogGate`, và báo số đo lại cho chủ dự án — nếu số xấu thì luật cắt cửa sổ có thể phải đổi.

Phép đo này **vẫn làm được trên tệp mới trắng**, khác với phép đo ngân sách ô. Lý do: nội dung sheet `Log` vốn là do hệ tự sinh, nên 5.000 dòng giả cho ra một con số dùng được, còn 5.000 khách giả thì không nói gì về ngân sách ô thật. Cách làm: một hàm dùng một lần ghi 5.000 dòng giả bằng **một** lệnh `setValues`, đo `deleteRows`, rồi xóa sạch sheet. Đừng dùng vòng lặp `appendRow` để tạo dữ liệu đo, vì chính nó sẽ ăn hết thời gian và làm sai phép đo.

Hai điều của tài liệu 10 Phần 7 đã là **quyết định của chủ dự án**, đừng tự sửa lại khi code: khi `LOG_TRACE` đang bật thì secret ghi **thô** vào log, chỉ che khi tắt; hệ quả đã biết và đã chấp nhận là sheet `Log` có thể chứa secret thô cho tới khi cửa sổ 30 ngày hoặc 5.000 dòng đẩy nó ra, và trong khoảng đó **không được chia sẻ tệp**.

## Phần 5 — Thứ chủ dự án đã dặn riêng: đừng làm mất phần UX đã chỉnh tay

Chủ dự án nói nguyên văn rằng code cũ "có một số phần khá tốt mà tôi đã phải sửa ux rất nhiều, như là việc xử lý dropdown ở sidebar ui. Ngoài ra ui cũng là thứ cần tham khảo."

Việc này thuộc chặng 1.3 chứ không phải phiên này, nhưng ghi ra đây vì nếu phiên đầu không biết thì phiên sau dễ viết lại UI từ đầu theo tài liệu và làm rơi mất phần đã chỉnh. Chi tiết ở tài liệu 00 Phần 6 loại hai. Ba hành vi tài liệu 03 **chưa** nói tới và một phiên chỉ đọc tài liệu sẽ làm thiếu: `Enter` đi tiếp sang ô sau, `Tab` chọn mục trong danh sách chứ không nhảy ô, và dán một cục thông tin thì tự điền nhiều ô rồi bôi sáng. Tới chặng 1.3 mà thấy ba việc này không có chỗ trong `SLOTS` hay `ACTIONS` thì **hỏi chủ dự án**, đừng tự bỏ.

## Phần 6 — Ngoài phạm vi phiên này

- **Không** viết code của chặng 1.2 trở đi. Mỗi chặng đóng bằng một lần chạy thử được, và chặng sau chỉ mở khi chặng trước đã chạy.
- **Không** sửa code cũ, kể cả sửa lỗi đã biết. Ví dụ `Utils.js` khai `getRawDateValue` hai lần, dòng 67 và 91 — đó là lỗi đang sống, nhưng nó nằm ở hệ cũ và hệ cũ vẫn phải chạy được để đi bán hàng.
- **Không** làm gì cho bot. Chủ dự án đã chốt: việc nghiên cứu bot để sau, khi nào đồng bộ FBM thành công đã.
- **Không** làm gì cho `fbm_sync`. Nó là Giai đoạn 3, và bảy mục kiểm chứng thực nghiệm trên tài khoản FBM thật phải đứng trước mọi dòng code của module đó.
- **Không** chọn "bản Extension nào là bản thật". Đó là việc của chặng 1.3. Hai bản là `2_ShinCRM_Extension/` trong repo và bản chạy thật ở `D:\Program\0. Extension\MiniCRM_GoogleSheet`.
- **Không** chép dữ liệu từ tệp Sheet cũ sang tệp mới, kể cả để "có cái mà thử". Tệp mới trắng là quyết định đã chốt, và dữ liệu thật về từ FBM ở Giai đoạn 3. Ngoại lệ duy nhất trong phiên này là 5.000 dòng giả để đo `deleteRows`, và chúng phải bị xóa sạch sau khi đo.
- **Không** commit khi chủ dự án chưa bảo commit.

## Phần 7 — Đóng phiên khi nào

Phiên xong khi cả ba câu sau đều trả lời được bằng một lần chạy thật, không phải bằng suy luận:

1. `clasp push` lên dự án **mới** chạy được, `clasp pull` về không mất tệp, và `.clasp.json` **không còn** trỏ vào `scriptId` của dự án đang chạy thật.
2. Gọi một hàm trong editor, nó in ra bảng mã cột → chỉ số cột của `Customer` trên tệp Sheet mới, và cố tình đổi một mã ở hàng 1 thì nó báo lỗi ngay kèm mã sai.
3. `LogGate` ghi được xuống sheet `Log` bằng một lệnh `setValues`, và số đo `deleteRows` trên 5.000 dòng đã có, đã báo chủ dự án.

Sau đó: cập nhật tài liệu 00 — xóa hẳn các mục đã xong ở checklist, **không** ghi "đã xong" để lại dấu vết. Rồi xin phép chủ dự án commit.
