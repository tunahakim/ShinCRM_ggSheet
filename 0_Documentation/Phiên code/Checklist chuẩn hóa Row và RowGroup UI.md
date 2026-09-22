# Checklist chuẩn hóa Row và RowGroup UI

> Checklist riêng của phiên này. Đây là nơi theo dõi tiến độ duy nhất cho việc chuẩn hóa primitive dàn trang, schema `rows` và các component dùng lại layout trong Sidebar.
>
> Trạng thái ban đầu: chưa sửa code. Mỗi mục chỉ được đánh dấu `[x]` khi có bằng chứng cụ thể trong test hoặc tài liệu đã cập nhật. Sau mỗi nhóm code xanh, phải tick checklist ngay và commit nhóm đó trước khi sang nhóm tiếp theo.

## A. Phạm vi và nguyên tắc bất biến

- [x] [Tự động] Ghi nhận phạm vi: `Row`, nhóm dọc canonical là `RowGroup`, `UI_SCHEMA` dạng `group + rows`, catalog/resolver, CSS primitive và các component Sidebar/FBM dùng layout ngang/dọc.
- [x] [Tự động] Ghi nhận không sửa fixture trong `0_Documentation/Nghiên cứu FBM/`.
- [x] [Tự động] Ghi nhận không thêm `className`, `rootClass`, selector DOM, chuỗi CSS hoặc `style` tự do vào screen schema.
- [x] [Tự động] Ghi nhận mỗi hành vi layout chỉ có một owner; component con không dùng margin để điều khiển sibling spacing.
- [x] [Tự động] Ghi nhận schema màn hình mô tả cấu trúc, field, label, action và trạng thái; resolver/catalog sở hữu presentation.
- [x] [Tự động] Ghi nhận component đặc thù được phép tồn tại khi có hành vi/nghiệp vụ riêng, nhưng phải tái sử dụng primitive layout chung.

## B. Hợp đồng tên và trách nhiệm

- [x] [Tự động] Chốt `Row` là đúng một hàng ngang, chứa một hoặc nhiều cell/block.
- [x] [Tự động] Chốt `Row` sở hữu khoảng cách ngang giữa các cột, chính sách độ rộng cột và căn chỉnh nội bộ của hàng.
- [x] [Tự động] Chốt `Row` không sở hữu khoảng cách với Row khác, Card khác hoặc sibling bên ngoài.
- [x] [Tự động] Chốt `RowGroup` là nhóm một hoặc nhiều row item xếp dọc; `Row` là hàng nhiều ô, còn Block trực tiếp là hàng một ô để component không phải bọc cú pháp thừa.
- [x] [Tự động] Chốt `RowGroup` sở hữu khoảng cách dọc giữa các row item trực tiếp và không sở hữu khoảng cách giữa các Card.
- [x] [Tự động] Chốt runtime chỉ có một implementation cho vai trò `RowGroup`; không để `Stack` và `RowGroup` cùng triển khai hành vi riêng.
- [x] [Tự động] Quyết định tên runtime chính thức: đổi `Stack` thành `RowGroup`; không để hai policy độc lập.
- [x] [Tự động] Chốt `Card` sở hữu khung, title, padding và body; container chứa Card sở hữu khoảng cách giữa các Card.
- [x] [Tự động] Chốt `Field`, `Text`, `Icon`, `Button`, `Toggle` không tự thêm margin bên ngoài để đẩy sibling.
- [x] [Tự động] Chốt `HeaderGroup`, `ActionStack`, `SplitRow` là preset có tên cho các cấu trúc khác vai trò; không ép `Row` generic nhận `space-between`.
- [x] [Tự động] Chốt Row có thể dùng độc lập trong component nội bộ khi parent đã sở hữu spacing; schema form vẫn bung danh sách hàng qua RowGroup.
- [x] [Tự động] Chốt Row không nhận trực tiếp một danh sách Row khác như sibling; layout lồng chỉ xuất hiện như một cell/block của Row hoặc qua RowGroup. Bằng chứng: `tests/cases/uiBuilder.js` kiểm tra nested Row nằm trong một cell và row item Block đơn được RowGroup chấp nhận.
- [x] [Tự động] Chốt Row lồng Row chỉ là ngoại lệ khi một cell thật sự chứa một layout ngang độc lập; không dùng để gom Toggle + Text một cách máy móc.

## C. Hợp đồng khoảng cách và căn chỉnh

- [x] [Tự động] Xác định token dùng cho `cardGap`, `rowGap`, `columnGap`, `fieldGap` và padding; mỗi token có nguồn duy nhất trong `client/style/tokens.html`.
- [x] [Tự động] Kiểm tra `Page/Section/CardGroup` là owner khoảng cách giữa Card.
- [x] [Tự động] Kiểm tra `CardBody/RowGroup` là owner khoảng cách giữa Row hoặc Block trực tiếp thuộc nhóm.
- [x] [Tự động] Kiểm tra `Row` là owner duy nhất của column gap; không còn selector sibling margin thay thế gap.
- [x] [Tự động] Kiểm tra `Field/StandaloneField` là owner khoảng cách label-control bên trong chính nó.
- [x] [Tự động] Kiểm tra `ActionStack` là owner khoảng cách và vị trí của nhóm action; Button không tự đẩy action khác.
- [x] [Tự động] Chốt mặc định độ rộng cột là `equal`, hiện thực tập trung bằng flex policy; schema không ghi CSS flex trực tiếp.
- [x] [Tự động] Chốt các ngoại lệ độ rộng chỉ dùng policy/catalog có tên như `auto`, `fixed`, `flex` hoặc `width` đã được validator cho phép.
- [x] [Tự động] Chốt căn ngang mặc định của cell Row theo policy chung; API công khai dùng `left`, `center`, `right` nếu primitive/wrapper cần override.
- [x] [Tự động] Chốt căn dọc mặc định của Row theo policy chung; API công khai dùng `top`, `middle`, `bottom` nếu primitive/wrapper cần override.
- [x] [Tự động] Tách căn block trong cell khỏi căn nội dung bên trong Field/Text/Button; không dùng một thuộc tính để điều khiển cả hai tầng.
- [x] [Tự động] Giữ `start/end` chỉ ở layout policy nội bộ nếu cần RTL; không đưa `start/end` vào screen schema hiện tại.
- [x] [Tự động] Mặc định gridlines/border của Row tắt; nếu cần bật phải là policy có tên và test riêng, không là CSS màn hình. Bằng chứng: `tests/cases/layoutSpacing.js` kiểm tra rule `.shin-row` không có `border`.

## D. Hợp đồng UI schema

- [x] [Tự động] Giữ schema form công khai ở dạng `body: [{ group, rows }]`; không đổi thành các lời gọi `row(...)`, `text(...)`, `toggle(...)`.
- [x] [Tự động] Ghi rõ `body[i]` là một nhóm dọc tương ứng với RowGroup/Card theo resolver.
- [x] [Tự động] Ghi rõ `rows[i]` là đúng một Row ngang.
- [x] [Tự động] Ghi rõ `rows[i][j]` là một cell/block; chuỗi trần là field name, object là khai báo field có override hợp lệ.
- [x] [Tự động] Không thêm `type: "rowGroup"` khi ngữ cảnh `body` đã xác định nhóm; chỉ dùng discriminator ở cây node tổng quát nếu thật sự cần.
- [x] [Tự động] Cho phép một Row có một cell hoặc nhiều cell; không thêm node rỗng chỉ để đủ cột.
- [x] [Tự động] Cho phép object field giữ `field`, `control`, `label`, `width`, `readonly`, `action` theo hợp đồng schema hiện có.
- [x] [Tự động] Chặn `align`, `justify`, `align-items`, `text-align`, margin, class CSS và style tự do trong form schema.
- [x] [Tự động] Chặn trộn cây Block với dạng `{ group, rows }` trong cùng một `body`.
- [x] [Tự động] Chốt màn hình phức tạp dùng component/catalog domain; component chuyên dụng bên trong bắt buộc dùng lại Row/RowGroup.
- [x] [Tự động] Ghi ví dụ mapping từ `rows` sang cây runtime `RowGroup -> Row -> Field` trong tài liệu chính thức.

## E. Tài liệu phải cập nhật trước code

- [x] [Tự động] Cập nhật `03. Data schema & UI schema.md` để phân biệt rõ schema `rows` với runtime `RowGroup` và `Row`.
- [x] [Tự động] Cập nhật `04. Bộ máy render và luồng lưu.md` về owner spacing, RowGroup, Row lồng và component chuyên dụng.
- [x] [Tự động] Cập nhật `03A. Hợp đồng Schema.md` để ghi RowGroup là wrapper trên vai `box`, không tạo Block role thứ hai.
- [x] [Tự động] Ghi rõ quyết định xử lý tên `Stack`: đổi thành `RowGroup`, không giữ implementation song song.
- [x] [Tự động] Ghi ví dụ form customer: một cell, hai cell, control override và mapping runtime trong hợp đồng `rows` hiện có.
- [x] [Tự động] Ghi quy tắc màn Settings: Row đơn cho từng dòng; RowGroup lồng cho nhóm tùy chọn con; Row lồng Row chỉ khi cell có layout ngang độc lập.
- [x] [Tự động] Ghi rõ CSS màn hình chỉ được dùng cho hình thức/domain exception đã có owner và test; không dùng để sửa sibling spacing trong hợp đồng layout.
- [x] [Tự động] Không thêm tệp code hoặc thư mục trong nhóm này nên không phát sinh cập nhật cây thư mục; tài liệu chỉ sửa các hợp đồng bị lỗi thời.

## F. Primitive và catalog

- [x] [Tự động] Tạo hoặc đổi tên implementation RowGroup theo quyết định ở mục B, bảo đảm chỉ có một hàm/ policy sở hữu nhóm dọc.
- [x] [Tự động] Di chuyển policy/class owner từ `Stack` sang tên canonical; không giữ alias song song.
- [x] [Tự động] Không thêm `RowGroup` vào `BLOCK_ROLES`: đây là wrapper trên vai `box`, đúng hợp đồng `03A`; test `uiBuilder` xác nhận `RowGroup`/`ActionStack` trả `box` và không có role song song.
- [x] [Tự động] Cập nhật `UI_LAYOUT_POLICY` với owner, axis, cross-axis, content và class duy nhất của RowGroup.
- [x] [Tự động] Cập nhật CSS primitive: Row dùng column gap; RowGroup dùng row gap; reset margin con trực tiếp; không dùng sibling margin.
- [x] [Tự động] Cập nhật chính sách width equal/flex/auto/fixed ở một nơi; không rải rule theo màn hình.
- [x] [Tự động] Policy căn chỉnh nằm tập trung trong `UI_LAYOUT_POLICY`; `Row` từ chối khóa `align` tự do và test `uiBuilder` kiểm tra lỗi sớm. Các preset dùng `HeaderGroup`, `ActionStack`, `Loading`, `Empty`.
- [x] [Tự động] Giữ HeaderGroup/ActionStack/SplitRow là preset riêng, không làm biến dạng Row generic.
- [x] [Tự động] Kiểm tra Button/Icon/Text/Field không có API hoặc CSS margin để điều khiển sibling.
- [x] [Tự động] Thêm test primitive chứng minh Row nhận một hàng, RowGroup nhận một hoặc nhiều row item và nested layout hợp lệ.

## G. Resolver và screen builder

- [x] [Tự động] Sửa `screenBuild` để mỗi cụm `{ group, rows }` sinh đúng Card chứa một RowGroup, không đặt các Row trực tiếp cạnh CardBody nếu RowGroup là owner mới.
- [x] [Tự động] Giữ mỗi mảng con trong `rows` thành đúng một Row; không làm thay đổi thứ tự field.
- [x] [Tự động] Giữ field object/`control`/`readonly`/`action` khi bung schema.
- [x] [Tự động] Chặn hàng không phải mảng, cell không hợp lệ, group thiếu rows và body trộn hai dạng.
- [x] [Tự động] Kiểm tra resolver không truyền layout CSS từ schema xuống Block.
- [x] [Tự động] Kiểm tra screen customer/activity/note/view hiện tại vẫn render đủ field, action, tooltip, menu, focusId và data-field.
- [x] [Tự động] Kiểm tra schema `body` rỗng, nhóm một Row và nhóm nhiều Row đều có cây runtime hợp lệ.

## H. Refactor component dùng chung

- [x] [Tự động] Kiểm kê component có nhiều phần tử ngang đồng cấp: HeaderGroup, CardTitleBar, ActionRow, InlineFieldRow, ToggleRow và layout tương đương. Kết quả và allowlist nằm trong `Ghi chú tạm audit class và component UI.md`.
- [x] [Tự động] Với mỗi component, xác định Row là owner ngang; không tự viết lại `display:flex`, gap và căn chỉnh nếu cùng hành vi. Bằng chứng: `layoutSpacing`, `fbmSync/Components` và các test Sidebar kiểm tra ToggleRow, schedule, conflict head, action row.
- [x] [Tự động] Refactor HeaderGroup để title ở vùng start, Cancel/Save ở vùng end; thứ tự `[Hủy, Lưu]` giữ nguyên. Bằng chứng: test `formScreen`, `uiSchema`, `fbmSync/Sidebar` và `layoutSpacing` kiểm tra hai nhóm header, thứ tự action và owner căn mép.
- [x] [Tự động] Refactor ToggleRow/InlineFieldRow để dùng Row primitive hoặc preset Row có tên; không để CSS màn hình quyết định sibling spacing. Bằng chứng: test `layoutSpacing` kiểm tra owner spacing; test `fbmSync/Sidebar` kiểm tra toggle Settings có role `row`.
- [x] [Tự động] Refactor Card title/actions để dùng wrapper action chung, không gắn align lên Icon/Button lá. Bằng chứng: test `renderEngine` kiểm tra `shin-card-actions` và không còn `shin-align-right`; test `fbmSync/Components` kiểm tra action card dùng style chung.
- [x] [Tự động] Refactor panel cảnh báo thay đổi chưa lưu và dialog quyết định dùng `RowGroup`; CSS panel chỉ giữ khung/hình thức, không tự sở hữu `display:flex` hoặc `gap`. Bằng chứng: test `unsavedChanges` và `layoutSpacing`.
- [x] [Tự động] Refactor layout Sync Settings: toggle, schedule row, parent login row, child login group và detail inputs dùng primitive owner đúng cấp. Bằng chứng: `fbmSync/Sidebar` kiểm tra toggle, schedule và login parent là `row`, child group là `box` mang policy `RowGroup`; `layoutSpacing` kiểm tra schedule không còn Grid và detail group không tự sở hữu gap.
- [x] [Tự động] Giữ DetailField dạng dọc nếu label nằm trên control; `detailField` dùng `RowGroup` và chỉ giữ class hình thức `min-width`. Bằng chứng: `tests/cases/fbmSync/Sidebar.js` và `layoutSpacing`.
- [x] [Tự động] Cho phép RowGroup lồng RowGroup cho nhóm tùy chọn con; kiểm tra indentation là policy wrapper, không phải margin tùy ý trong schema. Bằng chứng: login policy dùng `RowGroup` cho children/retry group; `layoutSpacing` chặn `margin-left` cũ của wrapper children.
- [x] [Tự động] Các component Loading/Empty/Notice/Table/Pipeline/Conflict/Status giữ preset đặc thù có lý do, không bị đổi default generic. Bằng chứng: test `fbmSync/Sidebar` kiểm tra Pipeline/Progress vẫn là preset có class riêng; conflict field và status root dùng `RowGroup` nhưng giữ hình thức domain; bảng status vẫn giữ Grid để thẳng cột; test `layoutSpacing` chặn flex/grid/gap lặp lại trong các wrapper này.
- [x] [Tự động] Tìm và xử lý mọi `Stack(`, `shin-stack`, `UI_LAYOUT_POLICY.stack` theo quyết định canonical; không để consumer cũ tạo owner thứ hai.

## I. Dọn hardcode và contract chống tái phạm

- [x] [Tự động] Quét toàn bộ screen schema tìm `className`, `rootClass`, `classes`, `*Class`, `style`, selector DOM và alignment tự do. Bằng chứng: `tests/cases/screenSchemaAudit.js` và `tests/cases/uiSchema.js`.
- [x] [Tự động] Quét CSS màn hình tìm margin/gap dùng để điều khiển sibling spacing; phân loại thành lỗi cần xóa hoặc ngoại lệ có owner. Bằng chứng: `tests/cases/layoutSpacing.js`, `fbmSync/Components.js` và audit allowlist.
- [x] [Tự động] Xóa hardcode gây lệch mép phải của nhóm toggle khi wrapper full-width đi cùng margin ngang; chuyển indentation vào policy wrapper nếu cần. Bằng chứng: `.shin-sync-login-policy-children` chỉ còn padding/border; `layoutSpacing` chặn lại `margin-left` và selector margin con.
- [x] [Tự động] Với mọi ngoại lệ còn lại, ghi consumer, lý do, owner, selector và test trong allowlist `Ghi chú tạm audit class và component UI.md` mục 10.
- [x] [Tự động] Bổ sung contract test chặn primitive con tự thêm margin ngoài. Bằng chứng: `layoutSpacing` kiểm tra Row/Field/Toggle/Button/Icon và reset margin chỉ ở wrapper owner.
- [x] [Tự động] Bổ sung contract test chặn Row generic tự `space-between` hoặc nhận alignment không thuộc preset. Bằng chứng: `uiBuilder` và `layoutSpacing`.
- [x] [Tự động] Bổ sung contract test chặn thêm primitive/layout function mới trùng owner đã có. Bằng chứng: `uiBuilder` xác nhận không có `Stack`, chỉ có `RowGroup` và `ActionStack` dùng lại wrapper canonical.
- [x] [Tự động] Bổ sung contract test kiểm tra nested Row chỉ xuất hiện ở vị trí cell/block hợp lệ và Block trực tiếp trong RowGroup được chấp nhận như row item một ô. Bằng chứng: `uiBuilder` kiểm tra nested Row là phần tử của Row và kiểm tra cả hai dạng row item.
- [x] [Tự động] Bổ sung contract test schema `rows` luôn map đúng số lượng Row và thứ tự field. Bằng chứng: `tests/cases/uiBuilder.js` và `tests/cases/uiSchema.js`.

## J. Kiểm thử hồi quy

- [x] [Tự động] Chạy nhóm test `uiBuilder`, `screenBuild`, `blockKeys`, `schemaCheck`, `renderEngine` sau primitive/resolver; nằm trong bộ chạy `node tests/run.js`.
- [x] [Tự động] Chạy nhóm test `layoutSpacing`, `fbmSync/Components`, `fbmSync/Sidebar`, `formScreen`, `viewScreen`, `uiSchema` sau migration component; nằm trong bộ chạy `node tests/run.js`.
- [x] [Tự động] Chạy `node tests/run.js`: `1937 đạt, 0 không đạt`.
- [x] [Tự động] Tái sinh preview bằng `node tests/preview.js`: 12 khách, 52 giao dịch, 3 gói; quét `tests/xem-sidebar.html` không còn `.shin-align-right` hoặc `shin-stack`, xác nhận artifact không giữ class layout cũ.
- [x] [Tự động] Kiểm tra diff không chạm fixture `0_Documentation/Nghiên cứu FBM/`: `git diff HEAD^ -- ...` không có dòng thay đổi.
- [x] [Tự động] Kiểm tra diff commit `3a8357f` chỉ chứa 12 tệp checklist/tài liệu/code/test thuộc nhóm RowGroup và dọn CSS; không chứa tệp ngoài phạm vi.
- [x] [Tự động] Kiểm tra diff/test/log không có cookie, giá trị password, token, payload nhạy cảm hoặc dữ liệu khách thật; phép quét diff theo các khóa nhạy cảm không trả kết quả.

## K. Nghiệm thu trực quan trên Sheet DEV

- [ ] [Cần kiểm chứng thật] Mở đúng Sheet DEV của dự án, xác nhận không phải Sheet chứa dữ liệu khách thật, rồi mở Sidebar bằng luồng khởi động chính.
- [ ] [Cần kiểm chứng thật] Xác nhận Sidebar mở không báo lỗi JavaScript, không hiện màn trắng và header/sidebar body đều có nội dung.
- [ ] [Cần kiểm chứng thật] Mở form thêm Customer; xác nhận tiêu đề màn hiển thị đúng ngữ cảnh `Thêm Khách Hàng`.
- [ ] [Cần kiểm chứng thật] Trong form thêm Customer, xác nhận nút Hủy nằm bên phải tiêu đề và nút Lưu nằm ngoài cùng bên phải.
- [ ] [Cần kiểm chứng thật] Trong form thêm Customer, xác nhận thứ tự hai action header là Hủy trước, Lưu sau; không bị đảo do wrapper.
- [ ] [Cần kiểm chứng thật] Trong form thêm Customer, xác nhận nút footer `LƯU DỮ LIỆU` nằm đúng vùng footer và không bị dính vào hàng field cuối.
- [ ] [Cần kiểm chứng thật] Trong form thêm Customer, xác nhận hàng chỉ có `companyName` chiếm toàn bộ chiều rộng khả dụng.
- [ ] [Cần kiểm chứng thật] Trong form thêm Customer, xác nhận các hàng `id`/`taxNumber`, `contactPerson`/`phone`, `product`/`customerGroup` chia cột đều.
- [ ] [Cần kiểm chứng thật] Trong form thêm Customer, xác nhận hàng textarea `note` không làm cột bên cạnh xuất hiện giả hoặc làm Card tràn ngang.
- [ ] [Cần kiểm chứng thật] Mở form sửa Customer; xác nhận cấu trúc, thứ tự field, header và footer giữ nguyên như form thêm, chỉ khác title/dữ liệu.
- [ ] [Cần kiểm chứng thật] So sánh khoảng cách dọc giữa hai hàng một cột liên tiếp với hai hàng hai cột; khoảng cách phải do cùng rowGap, không phụ thuộc số cell.
- [ ] [Cần kiểm chứng thật] So sánh khoảng cách ngang giữa các cell trong hai hàng hai cột; khoảng cách phải đồng nhất theo columnGap.
- [ ] [Cần kiểm chứng thật] Xác nhận Field, Text, Button và Icon không tự tạo thêm khoảng cách khiến một cặp sibling bị rộng hơn cặp khác.
- [ ] [Cần kiểm chứng thật] Mở màn có ít nhất hai Card liên tiếp; xác nhận khoảng cách Card-Card lớn/nhỏ theo cardGap riêng, không bằng rowGap nội bộ Card.
- [ ] [Cần kiểm chứng thật] Xác nhận thay đổi chiều cao nội dung một Card không làm khoảng cách giữa Card kế bên biến thành margin của Card con.
- [ ] [Cần kiểm chứng thật] Mở màn Settings; xác nhận hàng toggle có nhãn ở vùng trái và control ở vùng phải, cùng một trục ngang.
- [ ] [Cần kiểm chứng thật] Mở Settings có schedule; xác nhận toggle, nhãn và ô chu kỳ nằm trên cùng một hàng, không bị rơi cột hoặc lệch icon.
- [ ] [Cần kiểm chứng thật] Mở Settings có detail field; xác nhận label nằm trên control theo dạng dọc và các detail field có cùng nhịp dọc.
- [ ] [Cần kiểm chứng thật] Mở Settings có action nhiều nút; xác nhận các nút thuộc cùng ActionStack, có khoảng cách đều và không bị Button tự đẩy.
- [ ] [Cần kiểm chứng thật] Mở nhóm login policy; xác nhận hàng parent và nhóm children có cùng mép phải logic của control.
- [ ] [Cần kiểm chứng thật] Trong login policy, xác nhận indentation của children chỉ thụt phần nội dung theo policy, không làm cả wrapper lệch khỏi Card.
- [ ] [Cần kiểm chứng thật] Trong login policy, xác nhận toggle parent và toggle child không bị lệch hàng dọc khi label dài.
- [ ] [Cần kiểm chứng thật] Kiểm tra HeaderGroup trên ít nhất một màn có title dài; xác nhận title co/ellipsis mà không đẩy Hủy/Lưu ra ngoài viewport.
- [ ] [Cần kiểm chứng thật] Thu hẹp viewport Sidebar đến kích thước hẹp thực tế; xác nhận label dài xuống dòng trong vùng của nó.
- [ ] [Cần kiểm chứng thật] Ở viewport hẹp, xác nhận input/select/textarea không tràn ngang khỏi Card hoặc che control kế bên.
- [ ] [Cần kiểm chứng thật] Ở viewport hẹp, xác nhận action button không chồng chữ, không bị cắt nhãn và không tạo scrollbar ngang ngoài ý muốn.
- [ ] [Cần kiểm chứng thật] Dùng phím Tab từ đầu Sidebar; ghi lại thứ tự focus qua header, field, control và action, rồi xác nhận thứ tự khớp thứ tự người dùng nhìn thấy.
- [ ] [Cần kiểm chứng thật] Dùng Shift+Tab quay ngược từ footer; xác nhận wrapper Row/RowGroup không làm bỏ qua hoặc lặp lại control.
- [ ] [Cần kiểm chứng thật] Kiểm tra một component chỉ có Block đơn trong RowGroup; xác nhận hình thức và thứ tự hiển thị không đổi so với trước refactor.
- [ ] [Cần kiểm chứng thật] Với mỗi ca đạt, ghi màn hình, thao tác, kết quả quan sát và ảnh chụp tương ứng; không đánh dấu đạt bằng nhận xét chung chung.
- [ ] [Cần kiểm chứng thật] Với mỗi ca không đạt, ghi selector/vùng nhìn thấy, bước tái hiện, ảnh trước/sau và không tự sửa CSS tại màn hình để che lỗi.

## L. Commit và bàn giao

- [x] [Tự động] Commit nhóm tài liệu sau khi E hoàn tất và checklist được tick: `3a8357f`.
- [x] [Tự động] Commit nhóm primitive/catalog sau khi F và test liên quan xanh: `3a8357f`.
- [x] [Tự động] Commit nhóm resolver/schema sau khi G và test liên quan xanh: `52d36af` (screenBuild/RowGroup/schema resolver).
- [x] [Tự động] Commit từng nhóm component sau khi H và test liên quan xanh. Nhóm Settings commit tại `15e4154`; nhóm Sync generic commit tại `5b352f4`; nhóm activity slot commit tại `68da852`; nhóm unsaved dialog commit tại `3cf1883`; nhóm status commit tại `85280f3`.
- [x] [Tự động] Commit nhóm contract test/dọn hardcode sau khi I và test liên quan xanh: `3a8357f`.
- [x] [Tự động] Chạy lại full test trước commit cuối: `node tests/run.js` đạt `1937 đạt, 0 không đạt` sau commit `57ee0cf`.
- [x] [Tự động] Nghiệm thu GAS DEV bằng `node tests/gas.js verifySheets --push`: deployment `@491`, kết quả `OK`; Activity/Category/Config/Log đạt, Customer vẫn có cảnh báo lệch thứ tự cột có sẵn trên Sheet.
- [x] [Tự động] Ghi commit hash vào checklist sau mỗi nhóm; nhóm hiện tại dùng `3a8357f`, không gom file ngoài phạm vi.
- [x] [Tự động] Tách các ca nghiệm thu trực quan thành các bước độc lập, mỗi bước có kết quả kỳ vọng cụ thể; commit checklist là `0064f22`.
- [x] [Tự động] Đẩy bản hiện tại lên GAS DEV để chủ dự án kiểm tra Sidebar: revision `@491`, hàm `verifySheets` trả `OK`.
- [x] [Tự động] Đồng bộ các checklist/tài liệu liên quan, thay mô tả primitive `Stack` hiện hành bằng `RowGroup`; commit tài liệu là `1462b93`.
- [x] [Tự động] Cập nhật số liệu tiến độ trong checklist căn chỉnh sang test `1938/1938` và GAS DEV `@491`; commit là `a3919c9`.
- [ ] [Cần kiểm chứng thật] Sau khi code và test offline hoàn tất, dừng ở bước cần chủ dự án kiểm tra trực quan và ghi rõ thao tác cần thực hiện.

## M. Audit hợp đồng RowGroup sau refactor

- [x] [Tự động] Đối chiếu toàn bộ consumer `RowGroup` và ghi nhận các trường hợp truyền Block trực tiếp; xác định đây là hàng một ô hợp lệ, không phải owner layout thứ hai.
- [x] [Tự động] Cập nhật tài liệu chính thức 03, 03A và 04 để dùng cùng định nghĩa row item với runtime.
- [x] [Tự động] Bổ sung test hồi quy cho `RowGroup([Row(...)])`, `RowGroup([Text(...)])` và `RowGroup([Box(...)])`; `uiBuilder` xác nhận hình dạng row item và không tạo wrapper layout thứ hai, còn `layoutSpacing` giữ bằng chứng owner spacing; toàn bộ lượt chạy đạt `1938/1938`.
- [x] [Tự động] Chạy `node tests/run.js`: `1938 đạt, 0 không đạt`; commit riêng nhóm contract là `3e63dc2`.
- [ ] [Cần kiểm chứng thật] Sau commit contract, mở Sidebar DEV và kiểm tra một nhóm chỉ có Block đơn không đổi hình thức hoặc thứ tự hiển thị.
