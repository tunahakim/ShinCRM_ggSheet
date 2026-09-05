# UX bản cũ và chuẩn cho bản mới

Tệp này đọc lại toàn bộ `9_Code_cu_tham_chieu/src/ui/` (Sidebar.html 263 dòng, Styles.html 206 dòng, UI_Logic.html 1241 dòng, Store_RAM.html 39 dòng) và ghi ra hai thứ:

1. **Phần 1 và Phần 2** — mọi thao tác người dùng làm được với sidebar bản cũ, và mọi mẹo tiết kiệm không gian mà bản cũ đang dùng. Đây là phần *tả lại*, không bàn đúng sai.
2. **Phần 3** — bản mới phải xử lý từng món ở trên **tốt bằng hoặc tốt hơn**. Đây là phần *ràng buộc*: món nào bản mới chưa có thì nó là việc phải làm.

Vì sao cần tệp này: bản cũ đã chạy thật với khoảng 1.700 khách và hàng chục nghìn giao dịch, nên mọi chi tiết nhỏ trong đó — nút chỉ hiện khi trỏ chuột tới, dropdown không có mũi tên, thanh cuộn 4 pixel — đều là câu trả lời cho một lần bực mình thật. Bản mới viết lại từ đầu bằng kiến trúc khác, nên nếu không có một bản kê thì những chi tiết đó mất im lặng và chỉ lộ ra khi chủ dự án dùng hàng ngày.

Ba con số của khung để mọi quyết định ở dưới có chỗ neo: sidebar Google Sheets rộng khoảng **300 pixel**, cao bằng cửa sổ trình duyệt, và nằm trong một iframe (khung nhúng) nên mọi thứ tải từ ngoài đều thêm một lần chờ.

---

## Phần 1 — Bản đồ mọi thao tác với sidebar bản cũ

### 1.1 Thanh header (thanh trên) — năm nút, cao 48 pixel

Ba nút bên trái, một khoảng đệm giãn, hai nút bên phải. Không có chữ, chỉ glyph (biểu tượng) 20 pixel, mỗi nút có `title` để trỏ chuột vào thì hiện chú thích.

| Thao tác | Kết quả |
| --- | --- |
| Bấm nút tia sét (`btn-auto`) | Lật cờ `APP.isAuto`. Bật thì nút vàng nền vàng nhạt (`.icon-btn.active`), tắt thì trở lại xám. Cờ tắt nghĩa là bấm vào ô trong Sheet không đổi khách trên sidebar nữa — dùng khi người dùng muốn đứng yên một khách để đọc. Mặc định **bật** ngay lúc nạp. |
| Bấm nút kính lúp (`btn-search`) | Lật hộp tìm khách. Xem 1.2. |
| Bấm nút mũi tên vòng | `forceReload()` — bật cờ bẩn ở máy chủ rồi nạp lại toàn bộ. |
| Bấm nút bút chì (`btn-edit-cust`) | Mở form sửa khách đang xem. Nút này **mờ 30% và không bấm được** (`.icon-btn.disabled` với `pointer-events: none`) khi chưa chọn khách nào. |
| Bấm nút người-cộng | Mở form thêm khách mới. Luôn bấm được. |

Dải tiến trình (`#loader-line`) cao **3 pixel**, `position: absolute; bottom: 0` **bên trong** header, nên lúc nó chạy không có gì bị đẩy xuống. Một vạch xanh rộng 30% trượt ngang vô hạn.

### 1.2 Hộp tìm khách

| Thao tác | Kết quả |
| --- | --- |
| Bấm kính lúp lần đầu | Hộp hiện ra dưới header, nút kính lúp sáng, **con trỏ tự vào ô nhập** — không phải bấm thêm lần nữa. |
| Gõ một chữ | Lọc ngay trong RAM, không gọi máy chủ. Khớp trên **bốn trường**: tên công ty, số điện thoại, mã khách, mã số thuế. Trần **20 kết quả**. Dòng đầu tự sáng. |
| Xóa hết chữ | Hộp gợi ý ẩn, hộp tìm vẫn mở. |
| Mũi tên xuống / lên | Chạy dấu sáng qua các dòng, **vòng lại** từ cuối về đầu, và `scrollIntoView({block: 'nearest'})` nên dòng sáng luôn nằm trong tầm mắt. |
| Enter hoặc Tab | Chọn dòng đang sáng; nếu không dòng nào sáng thì Enter chọn dòng đầu. |
| Bấm chuột vào một dòng | Chọn khách đó. |
| Sau khi chọn | Màn chính vẽ lại theo khách vừa chọn. Hộp gợi ý ẩn, **hộp tìm vẫn mở và chữ vẫn còn** — người dùng tìm liên tiếp nhiều khách mà không phải mở lại hộp. |
| Bấm kính lúp lần nữa | Hộp đóng, chữ bị xóa, và **quay về khách của ô đang chọn trên Sheet** (`APP.sheetID`) — tức là thoát tìm kiếm thì về đúng chỗ trước khi tìm. |
| Bấm ra ngoài ô nhập | Hộp gợi ý ẩn sau **200 mili giây**. Chờ 200ms là cố ý: bấm chuột vào một dòng gợi ý cũng sinh ra `blur` trước `click`, ẩn ngay thì cú bấm rơi vào chỗ trống. |

Hình thức: một dòng gợi ý có tên đậm 14 pixel ở trên, dòng phụ 11 pixel ở dưới ghép `mã | mã số thuế | điện thoại`. Trỏ chuột và dấu sáng bàn phím **cùng một màu** `#e8f0fe`. Hộp gợi ý `position: absolute` nên nó **đè lên** thân màn thay vì đẩy thân xuống, trần cao `80vh`.

### 1.3 Màn chính — ba thẻ xếp dọc

Chia hai vùng: `#fixed-area` (không cuộn, giữ thẻ khách) và `#scroll-area` (cuộn, giữ thẻ ghi chú và thẻ lịch sử). Nghĩa là **thông tin khách luôn nhìn thấy** kể cả khi cuộn xuống giữa hàng trăm giao dịch.

**Thẻ khách** — bốn dòng, mỗi dòng hai giá trị chia hai đầu:

- Tên công ty 15 pixel, đậm 700, màu xanh nhấn, `text-align: justify` (căn đều hai bên) để một tên công ty dài ba dòng không bị mép phải lởm chởm.
- Hàng 2: mã khách căn trái — mã số thuế căn phải.
- Hàng 3: người liên hệ căn trái — điện thoại căn phải.

Đặt hai giá trị vào hai đầu một hàng thay vì hai hàng riêng là mẹo tiết kiệm chiều cao rõ nhất của bản cũ: bốn giá trị nằm trong hai dòng.

**Thẻ ghi chú** — tiêu đề `GHI CHÚ` 11 pixel in hoa màu xám, và bên phải là một liên kết chữ nhỏ:

- Khách **có** ghi chú: liên kết là bút chì + chữ "Sửa"; nội dung hiện trong khối nền đỏ nhạt, viền trái đỏ 3 pixel, `white-space: pre-wrap`.
- Khách **không** có ghi chú: liên kết đổi thành dấu cộng + chữ "Thêm mới", và **vùng nội dung ẩn hẳn** — thẻ chỉ còn cao bằng một dòng tiêu đề.

**Thẻ lịch sử làm việc** — tiêu đề, bên phải là liên kết dấu cộng + "Thêm". Mỗi dòng giao dịch:

| Thao tác | Kết quả |
| --- | --- |
| Không làm gì | Dòng hiện ngày (đậm, xanh) • sản phẩm (đậm, đỏ) ở bên trái, chip công việc nền xanh lá ở bên phải, nội dung xuống dòng dưới. **Không thấy nút nào.** |
| Trỏ chuột vào dòng | Bút chì sửa hiện ra ở mép phải (`.tx-item:hover .tx-edit-icon { display: inline-block }`). Rời chuột thì mất. |
| Bấm bút chì | Mở form sửa giao dịch, điền sẵn mọi giá trị cũ. |

Sắp xếp: ngày giảm dần, cùng ngày thì số thứ tự giảm dần. Không có giao dịch thì một dòng chữ xám giữa thẻ "Chưa có giao dịch".

### 1.4 Ba form — lớp phủ toàn khung

Form là `.overlay`: `position: fixed`, trắng, phủ kín 100% khung, `z-index: 100`. Nghĩa là form **không cuộn cùng màn chính** và không có gì của màn chính lọt vào tầm mắt. Hàng tiêu đề `position: sticky; top: 0` nên nút Lưu và nút Đóng luôn nhìn thấy dù cuộn xuống đáy form.

| Thao tác | Kết quả |
| --- | --- |
| Bấm ✕ | Đóng form, không hỏi lại. |
| Bấm nút ✓ tròn trên đầu | Lưu. Có **hai** nút lưu — một tròn ở đầu form, một nút chữ to `LƯU DỮ LIỆU` ở cuối. Cuộn tới đâu cũng có nút lưu trong tầm tay. |
| Mở form thêm mới | Mọi ô reset trắng, rồi điền giá trị ngầm định lấy từ sheet `Help`. `{TODAY}` thành ngày hôm nay. Ngày nhập liệu tự điền hôm nay. |
| Mở form sửa khách | Ô mã khách chuyển `readOnly` — không sửa được mã, nhưng vẫn chọn và sao chép được. |
| Mở form thêm giao dịch | Ngày làm việc tự điền hôm nay; **sản phẩm đoán từ giao dịch gần nhất** của khách đó, không có thì lấy sản phẩm khai ở thẻ khách; **giá trị ghim kế thừa** từ giao dịch trên cùng. |
| Mở form giao dịch khi chưa chọn khách | Cảnh báo "Chọn khách hàng trước!" rồi đóng luôn. |
| Bấm lưu mà thiếu ô bắt buộc | Ô sai đổi **viền đỏ và nền đỏ nhạt**, con trỏ nhảy về ô sai **đầu tiên**, không có hộp thoại nào. Gõ lại một chữ vào ô đó thì màu đỏ tự mất (`{once: true}`). |
| Bấm lưu ô combo mà giá trị không có trong danh mục | Cũng tính là sai — bản cũ kiểm cả "rỗng" và "không thuộc danh sách". |
| Lưu thành công | Form đóng **ngay**, màn chính vẽ lại **ngay** từ RAM, rồi mới gửi lên máy chủ ở phía sau. Lỗi mạng thì hiện cảnh báo nói rõ "CHƯA được lưu vào Sheet". |
| Thêm khách trùng mã | Cảnh báo kèm mã, và ô mã đổi viền đỏ. |

### 1.5 Ô combo (gõ để lọc, chọn từ danh mục) — chín ô trên hai form

Đây là chỗ bản cũ tối ưu nhiều nhất, vì trên 300 pixel thì một mũi tên sổ xuống ăn mất chỗ của bốn chữ.

| Thao tác | Kết quả |
| --- | --- |
| Nhìn ô | **Không có mũi tên sổ xuống nào.** Ô combo trông y hệt ô nhập thường, chỉ khác chữ mờ `--Chọn--`. Toàn bộ bề rộng dành cho nội dung. |
| Con trỏ vào ô (focus) | Danh sách **tự bung** — không phải bấm mũi tên. Nếu ô đã có giá trị thì giá trị đó được **bôi đen sau 50 mili giây**, gõ một chữ là thay luôn, không phải xóa. |
| Bấm vào ô lúc danh sách đang ẩn | Bung lại danh sách. |
| Gõ chữ | Lọc theo `includes` (chứa chuỗi), không cần gõ từ đầu. |
| Giá trị trong ô khớp đúng một mục | Mục đó bị **kéo lên đầu danh sách**, nên mở lại một ô đã điền thì thấy ngay giá trị hiện tại. |
| Ô rỗng, danh sách bung | **Không dòng nào sáng** (`currentFocus = -1`). Cố ý: ô rỗng mà dòng đầu sáng thì bấm Enter cho qua ô là điền bừa mục đầu tiên. |
| Ô có chữ | Dòng đầu tự sáng, Enter là chọn. |
| Mũi tên xuống / lên, Enter, Tab | Giống hộp tìm khách: vòng lại, `scrollIntoView`, Enter và Tab đều chọn dòng đang sáng. |
| Chọn một mục | Điền giá trị **và nhảy luôn sang ô kế tiếp** (`focusNextInput`). Một mục là một lần bấm, không có bước xác nhận. |
| Không mục nào khớp | Một dòng chữ xám "Không tìm thấy". |
| Rời ô | Danh sách ẩn sau 200 mili giây. |
| Ô công ty mẹ (1.700 giá trị) | Khai `requireInput = true` và `limit = 11`: **chưa gõ gì thì không bung** danh sách, và tối đa 11 dòng, dòng cuối là `...`. Danh sách 1.700 dòng bung ra lúc focus thì vô dụng. |

Trần chiều cao của danh sách **tính lúc chạy**, không phải số cứng: `khoảng trống bên dưới ô = chiều cao cửa sổ − đáy ô − 15 pixel`, nếu chỗ đó dưới 100 pixel thì lấy 150 pixel. Tính lại mỗi lần bung **và mỗi lần gõ thêm chữ**, vì người dùng có thể vừa cuộn. Nhờ vậy ô ở giữa form thì danh sách dài, ô sát đáy thì danh sách ngắn — không bao giờ có một danh sách tràn khỏi khung mà không cuộn được.

### 1.6 Bàn phím trên toàn form

| Phím | Kết quả |
| --- | --- |
| Enter ở một ô nhập thường | **Nhảy sang ô kế tiếp**, không gửi form. Đây là nếp làm việc chính: điền cả form 18 ô chỉ bằng gõ và Enter, không rời tay khỏi bàn phím. |
| Enter trong `<textarea>` | Xuống dòng như thường — không nhảy ô. |
| Enter trên một nút | Không can thiệp, nút tự chạy. |
| Enter khi danh sách combo đang mở | **Không nhảy ô** — nhường phím cho việc chọn mục. Bản cũ nhận ra ca này bằng cách xem thẻ liền sau ô nhập có phải `.suggest-box` đang mở hay không. |
| Tab | Cả trình duyệt lo, trừ khi danh sách đang mở thì Tab chọn mục. |

Thứ tự nhảy ô lấy từ `document.querySelectorAll` với bộ chọn loại hết ô tắt, ô chỉ đọc, ô ẩn, rồi lọc thêm `offsetParent !== null` để loại ô nằm trong form đang đóng. Điểm cuối của chuỗi nhảy là nút `LƯU DỮ LIỆU` — nên Enter liên tục từ ô đầu sẽ dừng đúng ở nút lưu.

### 1.7 Dán từ ngoài vào — điền cả form bằng một lần Ctrl+V

Dán vào ô **mã khách** thì bản cũ chặn hành vi dán mặc định và tự tách:

- Tách bằng `\r\n`, `\t`, `\n`, cắt khoảng trắng, bỏ dòng rỗng. Nghĩa là **dán một hàng từ Excel cũng được** (các ô cách nhau bằng Tab), mà dán một cột nhiều dòng cũng được.
- Dòng 1 → mã khách, ghi đè kể cả khi ô đã có chữ.
- Từ 5 dòng trở lên → tên công ty, mã số thuế, người liên hệ, điện thoại (qua `cleanPhone`, bỏ dấu chấm và mọi ký tự không phải số).
- Từ 6 dòng và dòng 6 có `@` và `.` → email.
- Đúng 1 dòng → chỉ điền mã, không đụng ô khác.

Mỗi ô được điền tự động **nhuộm vàng** `#fff9c4`. Vệt vàng mất khi người dùng gõ hoặc bấm vào ô đó. Đây là cách bản cũ nói "chỗ này máy điền, anh soát lại" mà không cần một dòng chữ nào.

### 1.8 Bản cũ chặn hộp gợi ý của trình duyệt

`disableAutocompleteGlobal()` chạy lúc nạp: quét **mọi** `input` và `textarea`, ô nào chưa có `autocomplete` thì đặt `autocomplete="off"`.

Vì sao cần: Chrome nhớ mọi thứ đã gõ vào một ô cùng tên và bung một hộp gợi ý riêng của nó. Hộp đó **đè lên** hộp gợi ý của sidebar, và nó xếp theo lịch sử gõ chứ không theo danh mục — nên người dùng thấy hai hộp chồng nhau, một hộp đúng và một hộp rác. Chặn ở tầm toàn cục thay vì gõ thuộc tính vào từng thẻ là vì quên một thẻ thì lỗi chỉ lộ ra sau nhiều ngày dùng, khi Chrome đã nhớ đủ chữ.

### 1.9 Mật độ, lề, thanh cuộn

- Thanh cuộn `::-webkit-scrollbar { width: 4px }`, ray trong suốt, con trượt xám `#dadce0` bán kính 2 pixel, đậm lên khi trỏ chuột. **4 pixel** thay vì 15 pixel mặc định là 11 pixel bề ngang trả về cho nội dung.
- Lề ngang của cả sidebar: **8 pixel**. Lề trên vùng cố định: 6 pixel.
- Thẻ: `padding: 10px`, cách nhau 8 pixel.
- Một dòng giao dịch: `padding-bottom: 6px` và một đường kẻ mảnh `#f1f3f4`, dòng cuối bỏ cả hai.
- Cỡ chữ: 14 pixel là nền, 13 pixel cho dòng thông tin, **11 pixel** cho nhãn và dòng phụ, **10 pixel** cho chip. Nhãn ô nhập in hoa 11 pixel, đặt sát ô 4 pixel.
- Đáy vùng cuộn chừa `padding-bottom: 80px` để dòng cuối cùng cuộn lên được khỏi mép dưới.
- `body { overflow: hidden }` — chỉ đúng một vùng cuộn trong cả sidebar, không bao giờ có hai thanh cuộn lồng nhau.

### 1.10 Chờ, lỗi, quá tải

| Tình huống | Người dùng thấy |
| --- | --- |
| Đang gọi máy chủ | Vạch 3 pixel chạy trong header. Nạp giao dịch theo gói 5.000 dòng thì vạch **chỉ tắt khi gói cuối xong**, nên nó phản ánh đúng "còn đang nạp". |
| Đang lưu trong form | Thêm một vạch 3 pixel nữa ở đáy hàng tiêu đề form. |
| Nạp xong một gói giao dịch mà đang xem khách | Chỉ vẽ lại **riêng danh sách giao dịch** (`renderTxOnly`), không vẽ lại cả màn — chống nháy. |
| Vượt trần ô tính | Lớp phủ trắng toàn khung, glyph đỏ, "HỆ THỐNG QUÁ TẢI!", số ô đang dùng và trần cho phép có dấu chấm nghìn, hướng dẫn xóa cột trống và hàng trống, một nút "Thử tải lại". |
| Máy chủ quá 15 giây | Lớp phủ tương tự, "SERVER ĐANG BẬN!", nút "Thử lại ngay". Nút đổi chữ thành "Đang kiểm tra…" và tự tắt khi đang chạy để không bấm chồng. |
| Mất mạng lúc nạp | Cảnh báo, và **tắt vạch tiến trình** — không để giao diện treo với một vạch chạy mãi. |
| Nạp lại thành công sau lỗi | Lớp phủ đỏ tự ẩn. |

### 1.11 Nối với Extension (tiện ích Chrome)

Cứ 500 mili giây sidebar gửi `CRM_HANDSHAKE` (bắt tay) lên `window.top`. Extension bắt cú bấm ô trên Sheet rồi gửi lại `CRM_TRIGGER` kèm tên sheet, dòng, cột. Sidebar dịch dòng đó thành mã khách qua bản đồ vị trí trong RAM và đổi khách **không gọi máy chủ**.

Ba luật của "vùng cấm" để việc tự đổi khách không cản việc sửa cấu hình sheet: hàng 1 (mã cột), hàng 3 (bộ lọc), và hai cột sắp xếp đều là vùng cấm. Đang ở vùng cấm thì không đổi khách; **rời vùng cấm ra ngoài** thì nạp lại bản đồ vị trí ngay — tức là sửa bộ lọc xong bấm ra ngoài là danh sách tự cập nhật.

---

## Phần 2 — Mười mẹo làm nên chất lượng UX của bản cũ

Tách riêng vì đây là phần đáng học nhất, và mỗi mẹo đều dùng lại được ở bản mới bất kể kiến trúc khác:

1. **Chỉ hiện thứ đang cần.** Nút sửa giao dịch chỉ hiện khi trỏ chuột vào đúng dòng đó. Một danh sách 200 giao dịch mà mỗi dòng có một nút thì 200 nút là nhiễu.
2. **Bỏ trang trí ăn chỗ.** Không mũi tên sổ xuống, thanh cuộn 4 pixel, không viền quanh chữ chỉ đọc.
3. **Hai giá trị một hàng.** Mã khách trái, mã số thuế phải. Bốn giá trị hai dòng thay vì bốn dòng.
4. **Ẩn cả khối khi rỗng**, và đổi nhãn nút theo trạng thái — "Sửa" thành "Thêm mới" thay vì hiện một khối rỗng có nút "Sửa".
5. **Vẽ trước, gửi sau.** Lưu là đóng form và cập nhật màn hình ngay từ RAM; máy chủ chạy phía sau. Người dùng không chờ mạng.
6. **Đoán giá trị.** Ngày hôm nay, sản phẩm của giao dịch trước, ghim của giao dịch trước, giá trị ngầm định từ sheet `Help`.
7. **Một lần Ctrl+V điền năm ô**, và nhuộm vàng chỗ máy điền.
8. **Enter là phím chính.** Enter nhảy ô, Enter chọn mục, Enter kết ở nút lưu. Cả form không cần chuột.
9. **Lỗi hiện tại chỗ, không hiện bằng hộp thoại.** Viền đỏ + con trỏ nhảy tới ô sai đầu tiên. Hộp thoại chỉ dùng cho lỗi mạng và lỗi trùng mã.
10. **Đo lúc chạy thay vì gõ số cứng.** Trần cao của danh sách tính từ khoảng trống thật bên dưới ô.

---

## Phần 3 — Bản mới phải làm gì

Bản mới có ba thứ bản cũ không có, và chúng đổi cách hiện thực chứ không đổi mục tiêu: bố cục năm vùng cố định với nút Lưu ghim đáy; mọi thứ trong thân do `UI_SCHEMA` khai bằng dữ liệu; và đúng một bộ phát click ở khung đọc `data-action`. Nên "làm như bản cũ" ở đây nghĩa là *ra cùng một trải nghiệm*, không phải chép cùng một đoạn code.

### 3.1 Đã có và đã bằng hoặc hơn bản cũ

| Món | Bản mới |
| --- | --- |
| Thanh cuộn siêu mảnh | 6 pixel ở `client/style/frame.html`, con trượt `--shin-border-strong`. Rộng hơn bản cũ 2 pixel vì 4 pixel khó trúng chuột; xem 3.3. |
| Card ăn hết bề ngang | `#sidebar-body` có `padding: 8px 0` nên card chạm cả hai mép sidebar, chỉ còn lề trong của card là 8 pixel. Rộng hơn bản cũ 16 pixel chữ mỗi dòng, và bản mới không có thẻ lồng trong thẻ nên không mất thêm lề nào. |
| Cỡ chữ theo tầng | 11 / 12 / 13 / 15 pixel, khai thành biến ở `client/style/tokens.html` nên đổi một chỗ là đổi cả sidebar. |
| Thông tin khách luôn nhìn thấy | Vùng 3 (`#sidebar-info`) ghim trên, không cuộn. Hơn bản cũ: nó bật ở **cả ba màn** kể cả khi đang mở form, nên lúc điền giao dịch vẫn thấy đang điền cho khách nào. |
| Nút Lưu luôn nhìn thấy | Vùng 5 ghim đáy. Hơn bản cũ: bản cũ phải đặt **hai** nút lưu để cuộn tới đâu cũng có nút, bản mới chỉ cần một. |
| Vạch tiến trình không đẩy nội dung | `#sidebar-progress` chiếm sẵn 3 pixel kể cả lúc rỗng, ẩn bằng cách bỏ lớp `is-running` chứ không bằng `display: none`. |
| Hộp gợi ý đè lên thân | `position: absolute` + `z-index: 20`, trần `60vh`. |
| Dấu sáng bàn phím cùng màu với trỏ chuột | `.shin-suggest.is-active` dùng đúng `--shin-primary-soft` như `:hover`. |
| Tìm khách: trần 20, vòng lại, `scrollIntoView`, ẩn sau 200ms, chữ giữ lại sau khi chọn | Đã có đủ trong `client/ui/search.html`. Quét **sáu trường** khai `searchable` — mã khách, tên công ty, mã số thuế, điện thoại, người liên hệ, ô từ khóa — so với bốn trường của bản cũ. Hơn bản cũ ở ba chỗ nữa: khớp cả khi gõ **không dấu** (`normalizeText` bỏ dấu, `đ` thành `d`), gõ các mẩu lộn thứ tự vẫn ra khách, và khách đã xóa mềm vẫn tìm được nhưng xếp sau và gạch ngang — kèm **ba ghế dành riêng** ở cuối danh sách nên một khách đã xóa khớp truy vấn thì luôn lên tới danh sách, dù truy vấn đó khớp bao nhiêu khách còn sống. |
| Chặn hộp gợi ý của Chrome | `renderInputGuard()` đặt `autocomplete="off"` và `spellcheck="false"` vào **mọi** ô ngay lúc dựng chuỗi. Gọn hơn bản cũ: bản cũ phải quét cả DOM sau mỗi lượt vẽ vì thẻ nó viết tay trong HTML, bản mới thì mọi thẻ đi qua một hàm. |
| Chữ chỉ đọc chọn và sao chép được | `.shin-input[readonly]` giữ nền lõm, không đổi thành chữ trơn. |
| Đóng form từng lớp | `formScreen` mở lồng được và đóng đúng một lớp mỗi lần — bản cũ đóng tất cả `.overlay` một lượt. |
| Nút trên dòng lịch sử chỉ hiện khi trỏ chuột | `client/style/slots.html` để bút chì và thùng rác ở `display: none`, hiện khi `:hover` hoặc `:focus-within` — đường thứ hai là để Tab tới nút nào thì nút đó hiện lên, không thì con trỏ bàn phím đi trong bóng tối. Ẩn hẳn chứ không giữ chỗ bằng `opacity`: chỗ giữ sẵn cho hai cái nút vô hình là chỗ lấy từ tên sản phẩm ở **mọi** dòng, nên bản mới cho hàng đầu **co vào** lúc chuột tới, đúng nếp bản cũ. Hơn bản cũ: bản cũ chỉ có bút chì, bản mới thêm thùng rác cùng chỗ cùng nếp, và bút chì giữ vị trí ngoài cùng vì sửa là việc làm mười lần thì xóa mới một lần. |
| Ô combo không mũi tên, chọn vào ô là tự bung | `client/ui/combo.html`. Hơn bản cũ ở bốn chỗ: lọc **không dấu**, ô rỗng thì **không sáng dòng nào** nên Enter cho qua ô không điền bừa mục đầu, trần cao đo lúc chạy rồi **bung lên trên** khi phía dưới hẹp — bản cũ luôn bung xuống và bị vùng thân cắt mất — và bề ngang nở theo mục dài nhất rồi kẹp lại trong khung, xem 3.3. Chữ mời trong ô giữ đúng của bản cũ: `--Chọn--` cho ô chỉ được chọn, `--Chọn hoặc nhập--` cho ô nhập được chữ mới. |
| Enter nhảy ô, chặng cuối là nút Lưu | `client/ui/inputs.html`. Nhường phím cho ô nhiều dòng và cho combo đang mở danh sách. |
| Dán một khối thành cả form khách | `client/ui/inputs.html`, năm cột, số điện thoại lọc còn chữ số, ô thư điện tử chỉ nhận dòng có `@` và dấu chấm, chỗ máy tự điền nhuộm vàng cho tới khi người dùng gõ hoặc bấm vào. Neo vào ô tên công ty chứ không phải ô mã khách. |
| Hai giá trị một hàng | Khối thông tin chung: tên công ty một hàng, rồi `mã khách • người liên hệ` bên trái với **số điện thoại ghim mép phải**. Bốn giá trị trong hai dòng, đúng mẹo của bản cũ. Không có điện thoại thì hàng phụ về một cột chứ không để lại thẻ rỗng. |
| Chip co theo chữ của nó | `.shin-badge { flex: 0 0 auto }`. Không có dòng đó thì luật chia đều của `.shin-row` cho chip "Đã xóa" ăn nửa bề ngang và tên công ty bị ép còn một nửa. |
| Form trống mở ra đã có sẵn giá trị đoán | `client/schema/fieldLogic.html`, bảy hàm ngầm định. Ba ca của bản cũ đều có: ngày làm việc là hôm nay, ghim kế tục giao dịch gần nhất, và sản phẩm kế tục giao dịch gần nhất rồi **rơi tiếp về sản phẩm khai ở hồ sơ khách** khi khách chưa có giao dịch nào — đúng nếp hai bậc của bản cũ. Hơn bản cũ: ô nào máy tự đoán thì trả về trong `carried` để nhuộm màu, còn bản cũ điền im lặng nên người dùng không phân biệt được giá trị mình gõ với giá trị máy đoán. |
| Nút Thử lại trên màn báo lỗi, tự tắt lúc đang chạy | `statusScreen.html` vẽ một nút mang `data-action="reloadAll"` và `data-busy="Đang thử lại…"`; `dispatch.html` thấy `data-busy` thì tắt nút và đổi chữ cho tới khi hành động xong. Hơn bản cũ ở hai chỗ: bản cũ viết riêng một hàm `retryLoadUI` chỉ để làm việc này còn bản mới là một thuộc tính dùng được cho mọi nút gọi máy chủ, và bản cũ tự đổi màu nền bằng `style` trong lúc bản mới để `:disabled` lo — nút tắt thì luôn trông giống nhau ở mọi chỗ. |
| Số ô, số hàng, số bản ghi đều có dấu chấm nghìn | `statusNumber()`, dùng ở cả ba màn của `statusScreen.html`. `500000` đọc thành `500.000`. |
| Cả khối ghi chú là chỗ bấm để sửa | `Field({ control: 'readText', action: 'openNoteForm' })`. Control `readText` là control **duy nhất** được mang `data-action` trên chính thẻ ô, và khi nó mang thì hàng nhãn thôi mọc bút chì. Ghi chú rỗng hiện `(chưa có)` bằng `.shin-readtext:empty::before` nên vẫn có chữ để bấm. Bút chì ở tiêu đề card vẫn còn vì `div` không nhận được con trỏ, tức nó là cửa cho bàn phím. Hơn bản cũ: bản cũ chỉ có một liên kết nhỏ ở góc, còn ở đây cả khối chữ là đích ngắm. |

### 3.2 Phải làm — món bản cũ có mà bản mới còn thiếu

Xếp theo mức người dùng thấy ngay:

1. **Khóa nút Lưu trong lúc gửi, và lỗi mạng phải nói rõ "chưa lưu được".** Thuộc chặng 1.4 (`saveFlow`). Cơ chế khóa đã có sẵn, chỉ cần node `button` của `UI_SCHEMA` nhận thêm khóa `busy` để engine ghi ra `data-busy`, phần còn lại `dispatch.html` lo.

--> Phản hồi của tôi (chủ dự án): cái này thì cần căn cứ vào tài liệu xem tài liệu đang duyệt như thế nào. Việc vẽ trước, gửi sau đôi khi cũng hơi nguy hiểm nếu lưu không thành công nhưng sidebar đã vẽ lại --> khiến người dùng tưởng thành công và tắt tab luôn.

--> Trả lời (đã tra tài liệu): chủ dự án đúng, và tài liệu đứng cùng phía. Tài liệu 04 Phần 8 có một dòng `[RÀNG BUỘC CỨNG]`: "**Không có cập nhật lạc quan.** RAM chỉ đổi sau khi Apps Script xác nhận đã ghi" — kèm đúng lý do chủ dự án vừa nói, rằng báo "đã lưu" trong khi sheet chưa có gì là rủi ro mất dữ liệu thật, đắt hơn nhiều so với cái lợi vài trăm mili giây. Dòng đó cấm luôn cả hàng đợi đồng bộ ngầm, lưu nháp xuống bộ nhớ trình duyệt, và tự thử lại. Nên **món "vẽ trước, gửi sau" bị gạch khỏi danh sách phải làm**, chỉ còn lại phần khóa nút Lưu ở trên. Luồng đúng là năm trạm của tài liệu 04 Phần 7: thu thập → làm sạch → khóa nút rồi gửi → sơn lỗi lên ô nếu cửa ghi trả về danh sách trường không đạt → thành công thì mới thay bản ghi trong RAM bằng đúng bản máy chủ trả về rồi vẽ lại.

Chỗ duy nhất trong hệ được phép cho người dùng thấy kết quả trước khi máy chủ xác nhận là **xóa**, và nó lách được đúng vì không phá luật: tài liệu 06 Phần 6 cho client giữ một *tập chờ xóa*, bộ render lọc bỏ những mã trong tập đó nên dòng biến mất ngay, nhưng `Store` không bị sửa một chữ nào — tập chờ xóa là lớp che ở tầng hiển thị, và hết `SETTINGS.UNDO_DELAY_MS` mới gọi máy chủ. Bấm Hoàn tác chỉ là bỏ mã khỏi tập rồi vẽ lại, không có gì phải khôi phục. Đó là cách lấy được cảm giác nhanh mà không mượn trước một lời hứa chưa chắc giữ được.

2. **Lỗi hiện tại ô, không hiện bằng hộp thoại.** Cũng chặng 1.4: viền đỏ trên ô sai, con trỏ về ô sai đầu tiên, màu đỏ tự mất khi gõ lại. `--shin-error` và `--shin-error-soft` đã có.

### 3.3 Cố ý làm khác bản cũ

| Bản cũ | Bản mới | Vì sao |
| --- | --- | --- |
| Nút tia sét bật/tắt tự bắt ô trên Sheet | Chưa có, thuộc chặng Extension | Giữ lại, không bỏ. Ghi ở đây để chặng đó không quên đây là một nút người dùng dùng hàng ngày. |
| Xóa giao dịch: không có | Nút thùng rác hiện lúc trỏ chuột vào dòng, cạnh nút bút chì, cùng xóa mềm và hoàn tác | Bản cũ không xóa được giao dịch. Đây là thứ bản mới thêm. Chủ dự án chốt ngày 06/09/2026 rằng nó đi theo nếp bút chì của bản cũ chứ không dùng ô đánh dấu nhiều dòng: ô đánh dấu ăn chỗ ở mọi dòng để phục vụ một việc hiếm. |
| `alert` cho mọi lỗi | `alert` chỉ cho lỗi ngoài tầm người dùng (mạng, máy chủ) | Lỗi điền sai thì hiện tại ô. |
| Hai nút lưu mỗi form | Một nút, ghim đáy khung | Vùng 5 giải quyết đúng vấn đề mà hai nút của bản cũ đang chữa cháy. |
| Bôi đen giá trị cũ sau `setTimeout` 50ms | Giữ nguyên 50ms | Không có cách nào chắc chắn hơn: `select()` gọi ngay trong `focus` bị chính trình duyệt ghi đè. |
| Thanh cuộn 4 pixel | 6 pixel | Kéo được bằng chuột. |
| Tìm khách khớp có dấu, khớp chuỗi liền | Khớp cả không dấu, và gõ lộn thứ tự vẫn ra | Gõ "cty thep bac ninh" phải ra "Công ty Thép Bắc Ninh", gõ "tan 9 tien" phải ra "Công ty Xây dựng Tân Tiến 9". Chủ dự án chốt ngày 06/09/2026. Cần bó cụm liền nhau thì đặt trong ngoặc kép. |
| Ô nhiều dòng cao cố định ba dòng | Tự cao theo nội dung, trần mười dòng rồi mới cuộn nội bộ | Ghi chú dài là việc thường ngày, mà cuộn trong một ô ba dòng thì không đọc được cả đoạn. |
| Dropdown rộng bằng ô | Nở theo mục dài nhất, kẹp trong khung sidebar | Ô "Tỉnh thành" ở cột phải rộng chừng 130 pixel, mà "Thành phố Hồ Chí Minh" cần hơn thế — mọi mục dài đều bị ngắt dòng. |
