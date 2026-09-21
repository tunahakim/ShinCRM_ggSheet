# Checklist chuẩn hóa Row và RowGroup UI

> Checklist riêng của phiên này. Đây là nơi theo dõi tiến độ duy nhất cho việc chuẩn hóa primitive dàn trang, schema `rows` và các component dùng lại layout trong Sidebar.
>
> Trạng thái ban đầu: chưa sửa code. Mỗi mục chỉ được đánh dấu `[x]` khi có bằng chứng cụ thể trong test hoặc tài liệu đã cập nhật. Sau mỗi nhóm code xanh, phải tick checklist ngay và commit nhóm đó trước khi sang nhóm tiếp theo.

## A. Phạm vi và nguyên tắc bất biến

- [x] [Tự động] Ghi nhận phạm vi: `Row`, nhóm dọc hiện đang là `Stack`, `UI_SCHEMA` dạng `group + rows`, catalog/resolver, CSS primitive và các component Sidebar/FBM dùng layout ngang/dọc.
- [x] [Tự động] Ghi nhận không sửa fixture trong `0_Documentation/Nghiên cứu FBM/`.
- [x] [Tự động] Ghi nhận không thêm `className`, `rootClass`, selector DOM, chuỗi CSS hoặc `style` tự do vào screen schema.
- [x] [Tự động] Ghi nhận mỗi hành vi layout chỉ có một owner; component con không dùng margin để điều khiển sibling spacing.
- [x] [Tự động] Ghi nhận schema màn hình mô tả cấu trúc, field, label, action và trạng thái; resolver/catalog sở hữu presentation.
- [x] [Tự động] Ghi nhận component đặc thù được phép tồn tại khi có hành vi/nghiệp vụ riêng, nhưng phải tái sử dụng primitive layout chung.

## B. Hợp đồng tên và trách nhiệm

- [ ] [Tự động] Chốt `Row` là đúng một hàng ngang, chứa một hoặc nhiều cell/block.
- [ ] [Tự động] Chốt `Row` sở hữu khoảng cách ngang giữa các cột, chính sách độ rộng cột và căn chỉnh nội bộ của hàng.
- [ ] [Tự động] Chốt `Row` không sở hữu khoảng cách với Row khác, Card khác hoặc sibling bên ngoài.
- [ ] [Tự động] Chốt `RowGroup` là nhóm một hoặc nhiều `Row` xếp dọc.
- [ ] [Tự động] Chốt `RowGroup` sở hữu khoảng cách dọc giữa các Row trực tiếp và không sở hữu khoảng cách giữa các Card.
- [ ] [Tự động] Chốt runtime chỉ có một implementation cho vai trò `RowGroup`; không để `Stack` và `RowGroup` cùng triển khai hành vi riêng.
- [x] [Tự động] Quyết định tên runtime chính thức: đổi `Stack` thành `RowGroup`; không để hai policy độc lập.
- [ ] [Tự động] Chốt `Card` sở hữu khung, title, padding và body; container chứa Card sở hữu khoảng cách giữa các Card.
- [ ] [Tự động] Chốt `Field`, `Text`, `Icon`, `Button`, `Toggle` không tự thêm margin bên ngoài để đẩy sibling.
- [ ] [Tự động] Chốt `HeaderGroup`, `ActionStack`, `SplitRow` là preset có tên cho các cấu trúc khác vai trò; không ép `Row` generic nhận `space-between`.
- [ ] [Tự động] Chốt Row có thể dùng độc lập trong component nội bộ khi parent đã sở hữu spacing; schema form vẫn bung danh sách hàng qua RowGroup.
- [ ] [Tự động] Chốt Row không nhận trực tiếp một danh sách Row khác như sibling; layout lồng phải đi qua cell/block hoặc RowGroup.
- [ ] [Tự động] Chốt Row lồng Row chỉ là ngoại lệ khi một cell thật sự chứa một layout ngang độc lập; không dùng để gom Toggle + Text một cách máy móc.

## C. Hợp đồng khoảng cách và căn chỉnh

- [ ] [Tự động] Xác định token dùng cho `cardGap`, `rowGap`, `columnGap`, `fieldGap` và padding; mỗi token có nguồn duy nhất trong `client/style/tokens.html`.
- [ ] [Tự động] Kiểm tra `Page/Section/CardGroup` là owner khoảng cách giữa Card.
- [ ] [Tự động] Kiểm tra `CardBody/RowGroup` là owner khoảng cách giữa Row hoặc Block trực tiếp thuộc nhóm.
- [ ] [Tự động] Kiểm tra `Row` là owner duy nhất của column gap; không còn selector sibling margin thay thế gap.
- [ ] [Tự động] Kiểm tra `Field/StandaloneField` là owner khoảng cách label-control bên trong chính nó.
- [ ] [Tự động] Kiểm tra `ActionStack` là owner khoảng cách và vị trí của nhóm action; Button không tự đẩy action khác.
- [ ] [Tự động] Chốt mặc định độ rộng cột là `equal`, hiện thực tập trung bằng flex policy; schema không ghi CSS flex trực tiếp.
- [ ] [Tự động] Chốt các ngoại lệ độ rộng chỉ dùng policy/catalog có tên như `auto`, `fixed`, `flex` hoặc `width` đã được validator cho phép.
- [ ] [Tự động] Chốt căn ngang mặc định của cell Row theo policy chung; API công khai dùng `left`, `center`, `right` nếu primitive/wrapper cần override.
- [ ] [Tự động] Chốt căn dọc mặc định của Row theo policy chung; API công khai dùng `top`, `middle`, `bottom` nếu primitive/wrapper cần override.
- [ ] [Tự động] Tách căn block trong cell khỏi căn nội dung bên trong Field/Text/Button; không dùng một thuộc tính để điều khiển cả hai tầng.
- [ ] [Tự động] Giữ `start/end` chỉ ở layout policy nội bộ nếu cần RTL; không đưa `start/end` vào screen schema hiện tại.
- [ ] [Tự động] Mặc định gridlines/border của Row tắt; nếu cần bật phải là policy có tên và test riêng, không là CSS màn hình.

## D. Hợp đồng UI schema

- [ ] [Tự động] Giữ schema form công khai ở dạng `body: [{ group, rows }]`; không đổi thành các lời gọi `row(...)`, `text(...)`, `toggle(...)`.
- [ ] [Tự động] Ghi rõ `body[i]` là một nhóm dọc tương ứng với RowGroup/Card theo resolver.
- [ ] [Tự động] Ghi rõ `rows[i]` là đúng một Row ngang.
- [ ] [Tự động] Ghi rõ `rows[i][j]` là một cell/block; chuỗi trần là field name, object là khai báo field có override hợp lệ.
- [ ] [Tự động] Không thêm `type: "rowGroup"` khi ngữ cảnh `body` đã xác định nhóm; chỉ dùng discriminator ở cây node tổng quát nếu thật sự cần.
- [ ] [Tự động] Cho phép một Row có một cell hoặc nhiều cell; không thêm node rỗng chỉ để đủ cột.
- [ ] [Tự động] Cho phép object field giữ `field`, `control`, `label`, `width`, `readonly`, `action` theo hợp đồng schema hiện có.
- [ ] [Tự động] Chặn `align`, `justify`, `align-items`, `text-align`, margin, class CSS và style tự do trong form schema.
- [ ] [Tự động] Chặn trộn cây Block với dạng `{ group, rows }` trong cùng một `body`.
- [ ] [Tự động] Chốt màn hình phức tạp dùng component/catalog domain; component chuyên dụng bên trong bắt buộc dùng lại Row/RowGroup.
- [ ] [Tự động] Ghi ví dụ mapping từ `rows` sang cây runtime `RowGroup -> Row -> Field` trong tài liệu chính thức.

## E. Tài liệu phải cập nhật trước code

- [x] [Tự động] Cập nhật `03. Data schema & UI schema.md` để phân biệt rõ schema `rows` với runtime `RowGroup` và `Row`.
- [x] [Tự động] Cập nhật `04. Bộ máy render và luồng lưu.md` về owner spacing, RowGroup, Row lồng và component chuyên dụng.
- [x] [Tự động] Cập nhật `03A. Hợp đồng Schema.md` để ghi RowGroup là wrapper trên vai `box`, không tạo Block role thứ hai.
- [x] [Tự động] Ghi rõ quyết định xử lý tên `Stack`: đổi thành `RowGroup`, không giữ implementation song song.
- [x] [Tự động] Ghi ví dụ form customer: một cell, hai cell, control override và mapping runtime trong hợp đồng `rows` hiện có.
- [x] [Tự động] Ghi quy tắc màn Settings: Row đơn cho từng dòng; RowGroup lồng cho nhóm tùy chọn con; Row lồng Row chỉ khi cell có layout ngang độc lập.
- [x] [Tự động] Ghi rõ CSS màn hình chỉ được dùng cho hình thức/domain exception đã có owner và test; không dùng để sửa sibling spacing trong hợp đồng layout.
- [ ] [Tự động] Cập nhật tài liệu điều hướng hoặc cây thư mục nếu thêm tệp code; không tạo bản tóm tắt lặp lại quy chuẩn nền.

## F. Primitive và catalog

- [ ] [Tự động] Tạo hoặc đổi tên implementation RowGroup theo quyết định ở mục B, bảo đảm chỉ có một hàm/ policy sở hữu nhóm dọc.
- [ ] [Tự động] Di chuyển policy/class owner từ `Stack` sang tên canonical nếu quyết định rename; giữ alias chỉ trong thời gian migration nếu cần.
- [ ] [Tự động] Cập nhật `BLOCK_ROLES`, key contract và thông báo lỗi để RowGroup hợp lệ nếu RowGroup là Block role mới.
- [ ] [Tự động] Cập nhật `UI_LAYOUT_POLICY` với owner, axis, cross-axis, content và class duy nhất của RowGroup.
- [ ] [Tự động] Cập nhật CSS primitive: Row dùng column gap; RowGroup dùng row gap; reset margin con trực tiếp; không dùng sibling margin.
- [ ] [Tự động] Cập nhật chính sách width equal/flex/auto/fixed ở một nơi; không rải rule theo màn hình.
- [ ] [Tự động] Cập nhật policy horizontal/vertical alignment và test các enum sai bị fail sớm.
- [ ] [Tự động] Giữ HeaderGroup/ActionStack/SplitRow là preset riêng, không làm biến dạng Row generic.
- [ ] [Tự động] Kiểm tra Button/Icon/Text/Field không có API hoặc CSS margin để điều khiển sibling.
- [ ] [Tự động] Thêm test primitive chứng minh Row nhận một hàng, RowGroup nhận một hoặc nhiều Row và nested layout hợp lệ.

## G. Resolver và screen builder

- [ ] [Tự động] Sửa `screenBuild` để mỗi cụm `{ group, rows }` sinh đúng Card chứa một RowGroup, không đặt các Row trực tiếp cạnh CardBody nếu RowGroup là owner mới.
- [ ] [Tự động] Giữ mỗi mảng con trong `rows` thành đúng một Row; không làm thay đổi thứ tự field.
- [ ] [Tự động] Giữ field object/`control`/`readonly`/`action` khi bung schema.
- [ ] [Tự động] Chặn hàng không phải mảng, cell không hợp lệ, group thiếu rows và body trộn hai dạng.
- [ ] [Tự động] Kiểm tra resolver không truyền layout CSS từ schema xuống Block.
- [ ] [Tự động] Kiểm tra screen customer/activity/note/view hiện tại vẫn render đủ field, action, tooltip, menu, focusId và data-field.
- [ ] [Tự động] Kiểm tra schema `body` rỗng, nhóm một Row và nhóm nhiều Row đều có cây runtime hợp lệ.

## H. Refactor component dùng chung

- [ ] [Tự động] Kiểm kê component có nhiều phần tử ngang đồng cấp: HeaderGroup, CardTitleBar, ActionRow, InlineFieldRow, ToggleRow và layout tương đương.
- [ ] [Tự động] Với mỗi component, xác định Row là owner ngang; không tự viết lại `display:flex`, gap và căn chỉnh nếu cùng hành vi.
- [ ] [Tự động] Refactor HeaderGroup để title ở vùng start, Cancel/Save ở vùng end; thứ tự `[Hủy, Lưu]` giữ nguyên.
- [ ] [Tự động] Refactor ToggleRow/InlineFieldRow để dùng Row primitive hoặc preset Row có tên; không để CSS màn hình quyết định sibling spacing.
- [ ] [Tự động] Refactor Card title/actions để dùng wrapper action chung, không gắn align lên Icon/Button lá.
- [ ] [Tự động] Refactor layout Sync Settings: toggle, schedule row, parent login row, child login group và detail inputs dùng primitive owner đúng cấp.
- [ ] [Tự động] Giữ DetailField dạng dọc nếu label nằm trên control; không ép mọi layout thành Row ngang.
- [ ] [Tự động] Cho phép RowGroup lồng RowGroup cho nhóm tùy chọn con; kiểm tra indentation là policy wrapper, không phải margin tùy ý trong schema.
- [ ] [Tự động] Các component Loading/Empty/Notice/Table/Pipeline/Conflict giữ preset đặc thù có lý do, không bị đổi default generic.
- [ ] [Tự động] Tìm và xử lý mọi `Stack(`, `shin-stack`, `UI_LAYOUT_POLICY.stack` theo quyết định canonical; không để consumer cũ tạo owner thứ hai.

## I. Dọn hardcode và contract chống tái phạm

- [ ] [Tự động] Quét toàn bộ screen schema tìm `className`, `rootClass`, `classes`, `*Class`, `style`, selector DOM và alignment tự do.
- [ ] [Tự động] Quét CSS màn hình tìm margin/gap dùng để điều khiển sibling spacing; phân loại thành lỗi cần xóa hoặc ngoại lệ có owner.
- [ ] [Tự động] Xóa hardcode gây lệch mép phải của nhóm toggle khi wrapper full-width đi cùng margin ngang; chuyển indentation vào policy wrapper nếu cần.
- [ ] [Tự động] Với mọi ngoại lệ còn lại, ghi consumer, lý do, owner, selector và test trong allowlist.
- [ ] [Tự động] Bổ sung contract test chặn primitive con tự thêm margin ngoài.
- [ ] [Tự động] Bổ sung contract test chặn Row generic tự `space-between` hoặc nhận alignment không thuộc preset.
- [ ] [Tự động] Bổ sung contract test chặn thêm primitive/layout function mới trùng owner đã có.
- [ ] [Tự động] Bổ sung contract test kiểm tra nested Row chỉ xuất hiện ở vị trí cell/block hợp lệ.
- [ ] [Tự động] Bổ sung contract test schema `rows` luôn map đúng số lượng Row và thứ tự field.

## J. Kiểm thử hồi quy

- [ ] [Tự động] Chạy nhóm test `uiBuilder`, `screenBuild`, `blockKeys`, `schemaCheck`, `renderEngine` sau primitive/resolver.
- [ ] [Tự động] Chạy nhóm test `layoutSpacing`, `fbmSync/Components`, `fbmSync/Sidebar`, `formScreen`, `viewScreen`, `uiSchema` sau migration component.
- [ ] [Tự động] Chạy `node tests/run.js`; chỉ tick khi toàn bộ test xanh và ghi tổng số test cụ thể.
- [ ] [Tự động] Kiểm tra diff không chạm fixture `0_Documentation/Nghiên cứu FBM/`.
- [ ] [Tự động] Kiểm tra diff từng commit chỉ chứa checklist/tài liệu/code/test thuộc nhóm đang commit.
- [ ] [Tự động] Kiểm tra không có cookie, password, token, payload nhạy cảm hoặc dữ liệu khách thật trong diff/test/log.

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

- [ ] [Tự động] Commit nhóm tài liệu sau khi E hoàn tất và checklist được tick.
- [ ] [Tự động] Commit nhóm primitive/catalog sau khi F và test liên quan xanh.
- [ ] [Tự động] Commit nhóm resolver/schema sau khi G và test liên quan xanh.
- [ ] [Tự động] Commit từng nhóm component sau khi H và test liên quan xanh.
- [ ] [Tự động] Commit nhóm contract test/dọn hardcode sau khi I và test liên quan xanh.
- [ ] [Tự động] Chạy lại full test trước commit cuối và ghi kết quả vào checklist.
- [ ] [Tự động] Nghiệm thu GAS DEV bằng `node tests/gas.js <tên-hàm> --push` nếu có thay đổi cần kiểm tra trên GAS.
- [ ] [Tự động] Ghi commit hash vào checklist sau mỗi nhóm; không gom nhiều nhóm độc lập vào một commit.
- [ ] [Cần kiểm chứng thật] Sau khi code và test offline hoàn tất, dừng ở bước cần chủ dự án kiểm tra trực quan và ghi rõ thao tác cần thực hiện.
