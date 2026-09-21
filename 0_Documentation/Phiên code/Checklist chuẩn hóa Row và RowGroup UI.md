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
- [x] [Tự động] Chốt `RowGroup` là nhóm một hoặc nhiều `Row` xếp dọc.
- [x] [Tự động] Chốt `RowGroup` sở hữu khoảng cách dọc giữa các Row trực tiếp và không sở hữu khoảng cách giữa các Card.
- [x] [Tự động] Chốt runtime chỉ có một implementation cho vai trò `RowGroup`; không để `Stack` và `RowGroup` cùng triển khai hành vi riêng.
- [x] [Tự động] Quyết định tên runtime chính thức: đổi `Stack` thành `RowGroup`; không để hai policy độc lập.
- [x] [Tự động] Chốt `Card` sở hữu khung, title, padding và body; container chứa Card sở hữu khoảng cách giữa các Card.
- [x] [Tự động] Chốt `Field`, `Text`, `Icon`, `Button`, `Toggle` không tự thêm margin bên ngoài để đẩy sibling.
- [x] [Tự động] Chốt `HeaderGroup`, `ActionStack`, `SplitRow` là preset có tên cho các cấu trúc khác vai trò; không ép `Row` generic nhận `space-between`.
- [x] [Tự động] Chốt Row có thể dùng độc lập trong component nội bộ khi parent đã sở hữu spacing; schema form vẫn bung danh sách hàng qua RowGroup.
- [x] [Tự động] Chốt Row không nhận trực tiếp một danh sách Row khác như sibling; layout lồng chỉ xuất hiện như một cell/block của Row hoặc qua RowGroup. Bằng chứng: `tests/cases/uiBuilder.js` kiểm tra RowGroup chỉ chứa Row và nested Row nằm trong một cell.
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
- [x] [Tự động] Thêm test primitive chứng minh Row nhận một hàng, RowGroup nhận một hoặc nhiều Row và nested layout hợp lệ.

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
- [x] [Tự động] Bổ sung contract test kiểm tra nested Row chỉ xuất hiện ở vị trí cell/block hợp lệ. Bằng chứng: `uiBuilder` kiểm tra nested Row là phần tử của Row và RowGroup chỉ nhận Row.
- [x] [Tự động] Bổ sung contract test schema `rows` luôn map đúng số lượng Row và thứ tự field. Bằng chứng: `tests/cases/uiBuilder.js` và `tests/cases/uiSchema.js`.

## J. Kiểm thử hồi quy

- [x] [Tự động] Chạy nhóm test `uiBuilder`, `screenBuild`, `blockKeys`, `schemaCheck`, `renderEngine` sau primitive/resolver; nằm trong bộ chạy `node tests/run.js`.
- [x] [Tự động] Chạy nhóm test `layoutSpacing`, `fbmSync/Components`, `fbmSync/Sidebar`, `formScreen`, `viewScreen`, `uiSchema` sau migration component; nằm trong bộ chạy `node tests/run.js`.
- [x] [Tự động] Chạy `node tests/run.js`: `1937 đạt, 0 không đạt`.
- [x] [Tự động] Kiểm tra diff không chạm fixture `0_Documentation/Nghiên cứu FBM/`: `git diff HEAD^ -- ...` không có dòng thay đổi.
- [x] [Tự động] Kiểm tra diff commit `3a8357f` chỉ chứa 12 tệp checklist/tài liệu/code/test thuộc nhóm RowGroup và dọn CSS; không chứa tệp ngoài phạm vi.
- [x] [Tự động] Kiểm tra diff/test/log không có cookie, giá trị password, token, payload nhạy cảm hoặc dữ liệu khách thật; phép quét diff theo các khóa nhạy cảm không trả kết quả.

## K. Nghiệm thu trực quan trên Sheet DEV

- [ ] [Cần kiểm chứng thật] Mở Sidebar trên Sheet DEV, không dùng Sheet có dữ liệu khách thật.
- [ ] [Cần kiểm chứng thật] Kiểm tra form Customer thêm/sửa: title, Hủy, Lưu, footer và các hàng field không bị lệch/tràn.
- [ ] [Cần kiểm chứng thật] Kiểm tra các hàng một cột và hai cột có cùng rowGap/columnGap theo policy.
- [ ] [Cần kiểm chứng thật] Kiểm tra các Card liên tiếp có cardGap riêng, không bị dùng nhầm rowGap.
- [ ] [Cần kiểm chứng thật] Kiểm tra HeaderGroup: tiêu đề trái, Hủy bên phải, Lưu ngoài cùng bên phải.
- [ ] [Cần kiểm chứng thật] Kiểm tra Settings: toggle, input, detail fields và các icon/action thẳng hàng.
- [ ] [Cần kiểm chứng thật] Kiểm tra nhóm login children có indentation đúng nhưng không làm lệch mép phải của toggle.
- [ ] [Cần kiểm chứng thật] Kiểm tra viewport Sidebar hẹp: label dài xuống dòng đúng vùng, control không tràn, action không chồng.
- [ ] [Cần kiểm chứng thật] Kiểm tra focus bằng bàn phím không đổi thứ tự do wrapper layout.
- [ ] [Cần kiểm chứng thật] Ghi ảnh và mô tả cụ thể cho từng sai lệch; không đánh dấu đạt bằng nhận xét chung chung.

## L. Commit và bàn giao

- [x] [Tự động] Commit nhóm tài liệu sau khi E hoàn tất và checklist được tick: `3a8357f`.
- [x] [Tự động] Commit nhóm primitive/catalog sau khi F và test liên quan xanh: `3a8357f`.
- [x] [Tự động] Commit nhóm resolver/schema sau khi G và test liên quan xanh: `52d36af` (screenBuild/RowGroup/schema resolver).
- [x] [Tự động] Commit từng nhóm component sau khi H và test liên quan xanh. Nhóm Settings commit tại `15e4154`; nhóm Sync generic commit tại `5b352f4`; nhóm activity slot commit tại `68da852`; nhóm unsaved dialog commit tại `3cf1883`; nhóm status commit tại `85280f3`.
- [x] [Tự động] Commit nhóm contract test/dọn hardcode sau khi I và test liên quan xanh: `3a8357f`.
- [ ] [Tự động] Chạy lại full test trước commit cuối và ghi kết quả vào checklist.
- [ ] [Tự động] Nghiệm thu GAS DEV bằng `node tests/gas.js <tên-hàm> --push` nếu có thay đổi cần kiểm tra trên GAS.
- [x] [Tự động] Ghi commit hash vào checklist sau mỗi nhóm; nhóm hiện tại dùng `3a8357f`, không gom file ngoài phạm vi.
- [ ] [Cần kiểm chứng thật] Sau khi code và test offline hoàn tất, dừng ở bước cần chủ dự án kiểm tra trực quan và ghi rõ thao tác cần thực hiện.
