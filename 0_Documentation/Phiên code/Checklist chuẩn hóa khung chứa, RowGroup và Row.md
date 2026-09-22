# Checklist chuẩn hóa khung chứa, RowGroup và Row

> Checklist riêng cho đợt chuẩn hóa tiếp theo về kích thước, padding, margin, gap, căn chỉnh và quan hệ cha-con của component UI. Đây là nơi theo dõi tiến độ duy nhất của đợt này.
>
> Trạng thái hiện tại: đã chốt hợp đồng gap `RowGroup`/`Row`, công thức chiều rộng, default padding/margin theo nhóm component, Card canonical có một padding owner và bất biến `RowGroup → Row`; đang cập nhật tài liệu và code. Không đánh dấu `[x]` chỉ vì đã đọc hoặc đã thảo luận; mỗi mục triển khai chỉ được đánh dấu khi có bằng chứng cụ thể trong code, test, ảnh hoặc nghiệm thu Sheet DEV.

## 0. Quyết định kiến trúc đã chốt trước code

Các quyết định trong phần này là hợp đồng đầu vào cho các mục triển khai phía dưới. Mục triển khai vẫn để `[ ]` cho đến khi code, test và tài liệu chính thức chứng minh đã làm xong.

- `RowGroup` là owner duy nhất của `rowGap`: khoảng cách dọc giữa các `Row` con trực tiếp.
- `Row` là owner duy nhất của `columnGap`: khoảng cách ngang giữa các cell/block con trực tiếp trong đúng một hàng.
- `RowGroup` không sở hữu gap ngang giữa cell của một Row; `Row` không sở hữu gap dọc với Row sibling. Mỗi quan hệ sibling có đúng một owner.
- Công thức chiều rộng bắt buộc là `maxWidth(child) + marginLeft(child) + marginRight(child) = width(parent) - paddingLeft(parent) - paddingRight(parent)`.
- `Text`, `Icon`, `Button`, control và mọi component cuối có mặc định `padding: 0`/`margin: 0`, nhưng được phép khai padding nội tại khác `0` khi hình thức hoặc vùng bấm của chính nó cần. Padding nội tại không phải là căn chỉnh vị trí và không được dùng để thay Row.
- `Row` là nơi duy nhất căn `left`/`center`/`right` và `top`/`middle`/`bottom` cho component con trong layout. Các component khác không được tự dùng CSS căn chỉnh vị trí theo hai trục này.
- Row căn component con trong content box của component mẹ. Nếu mẹ có padding trái/phải bất đối xứng, Row vẫn căn đúng trong content box, nhưng tâm nhìn thấy của nội dung sẽ lệch so với tâm hình học của khung mẹ; đó là hệ quả có chủ ý của padding bất đối xứng, không phải lỗi Row.
- Mọi Row, kể cả chỉ có một hàng, phải có parent trực tiếp là RowGroup. Schema form vẫn giữ DSL ngắn `rows: [["companyName"], ["id", "taxNumber"]]`; resolver là nơi tự dựng `RowGroup → Row`.

### Quyết định Card đã chốt trước code

- [x] [Tự động] Chốt một và chỉ một padding owner cho Card canonical: Card shell sở hữu padding bốn chiều.
- [x] [Tự động] CardHeader và CardBody của Card canonical không khai báo padding, kể cả không viết các dòng `padding: 0` để reset; không khai báo nghĩa là không có owner padding tại vùng đó.
- [x] [Tự động] Ghi rõ đây là quyết định riêng của Card canonical, không phải lệnh cấm mọi block con có padding; block khác vẫn có thể sở hữu padding theo policy loại component của nó.
- [x] [Tự động] Cấm cấu trúc Card canonical đồng thời có padding ở Card và padding ở Header/Body cho cùng vùng nội dung; nếu sau này cần hình thức Card khác, phải tạo recipe/component có tên riêng thay vì thêm cờ padding chồng lấn.
- [x] [Tự động] Chốt rằng padding nội tại của leaf/Button/Icon/control vẫn được phép khi cần hình thức hoặc vùng bấm; default `0` không đồng nghĩa với cấm khai padding.

## A. Phạm vi, từ điển và nguyên tắc bắt buộc

- [ ] [Tự động] Chỉ rõ danh sách component thuộc phạm vi: component cuối, `Row`, `RowGroup`, component lớn/container, `Card`, `Page`/`Body`/`Section`, component domain và các wrapper có thể sinh trong schema hoặc renderer.
- [ ] [Tự động] Xác định cho từng component trong phạm vi: có thể chứa component con trong schema hay không, có thể chứa component con tại runtime hay không, và parent trực tiếp hợp lệ là những component nào.
- [ ] [Tự động] Định nghĩa “component mẹ” là component trực tiếp chứa component đang xét, không phải tổ tiên ở bất kỳ cấp nào.
- [ ] [Tự động] Định nghĩa “component cấp 1” là con trực tiếp của một container; component cấp 2 là con trực tiếp của component cấp 1; tiếp tục tương tự cho mọi cấp sâu hơn.
- [ ] [Tự động] Định nghĩa “component cuối” là component không thể chứa component khác trong schema, ví dụ `Text`, `Icon`, `Button`, control input/select/textarea/toggle và các leaf tương đương.
- [ ] [Tự động] Định nghĩa “component kế cuối” là component thường xuyên chứa component cuối trong schema, tối thiểu gồm `RowGroup` và `Row`.
- [ ] [Tự động] Định nghĩa “component lớn/container” là component có thể hoặc thường xuyên chứa component lớn khác và/hoặc component kế cuối trong schema, ví dụ `Card`, `Body`, `Page`, `Section` hoặc component domain tương đương.
- [ ] [Tự động] Chốt nguyên tắc một hành vi layout chỉ có một owner: không có component con nào tự thay đổi khoảng cách, vị trí hoặc kích thước dành cho sibling nếu parent/wrapper đã là owner của quan hệ đó.
- [ ] [Tự động] Cấm sửa CSS cục bộ tại màn hình để lách luật checklist này; mọi ngoại lệ phải có owner có tên, lý do, test và tài liệu.
- [ ] [Tự động] Không đưa `className`, selector CSS, `style`, margin, padding, gap, flex hoặc khóa căn chỉnh tự do vào `UI_SCHEMA` màn hình.

## B. Hợp đồng chiều rộng tối đa và vùng nội dung của component mẹ

- [ ] [Tự động] Ghi nhận công thức bắt buộc cho từng component con theo chiều ngang: `chiều rộng tối đa của component con + margin trái + margin phải = chiều rộng component mẹ - padding trái component mẹ - padding phải component mẹ`.
- [ ] [Tự động] Viết công thức tương đương bằng ký hiệu để test được: `maxWidth(child) + marginInlineStart(child) + marginInlineEnd(child) = contentWidth(parent)`; trong đó `contentWidth(parent) = width(parent) - paddingInlineStart(parent) - paddingInlineEnd(parent)`.
- [ ] [Tự động] Xác định rõ CSS box model dùng để đo `width(parent)`, `maxWidth(child)`, padding và margin; không để cùng một công thức bị hiểu khác nhau giữa `content-box` và `border-box`.
- [ ] [Tự động] Xác định cách tính border, scrollbar, gap của sibling và `box-sizing` để chúng không làm phá công thức chiều rộng hoặc tạo tràn ngang im lặng.
- [ ] [Tự động] Kiểm tra component con một cột, nhiều cột, control có chiều rộng cố định, control co giãn và component có `max-width` đều không vượt content box của parent.
- [ ] [Tự động] Kiểm tra component con có `margin-inline` khác 0 chỉ đạt công thức khi margin đó là ngoại lệ có owner; component không được tự thêm margin để tự căn hoặc tạo spacing với sibling.
- [ ] [Tự động] Kiểm tra Row luôn căn trong content box sau padding của parent, không căn theo outer box của parent.
- [ ] [Tự động] Kiểm tra parent có padding trái/phải bất đối xứng: component con vẫn đúng `left`/`center`/`right` trong content box; độ lệch thị giác so với outer box chỉ xuất hiện khi chính policy padding chọn bất đối xứng.
- [ ] [Tự động] Kiểm tra viewport Sidebar hẹp: `scrollWidth` của vùng cần kiểm tra không lớn hơn `clientWidth` chỉ vì Row, RowGroup, Card, control hoặc margin của component con.
- [ ] [Tự động] Kiểm tra tên dài, label dài, textarea dài và button dài không làm vỡ công thức chiều rộng hoặc đẩy sibling ra ngoài vùng content.

## C. Component cuối: padding và margin mặc định bằng 0, không cấm padding nội tại

- [ ] [Tự động] Lập danh sách đầy đủ component cuối hiện có, không chỉ các ví dụ `Text`, `Icon`, `Button`, input, select, textarea và toggle.
- [ ] [Tự động] Đặt mặc định `margin-top`, `margin-right`, `margin-bottom`, `margin-left` của mọi component cuối bằng `0`.
- [ ] [Tự động] Đặt mặc định `padding-top`, `padding-right`, `padding-bottom`, `padding-left` của mọi component cuối bằng `0` ở lớp wrapper/component.
- [ ] [Tự động] Cho phép component cuối khai padding nội tại khác `0` khi cần cho hình thức, vùng bấm, chữ/icon dễ đọc hoặc cấu trúc nội tại; padding không bị cấm chỉ vì component là leaf.
- [ ] [Tự động] Phân biệt rõ “padding nội tại của component” với “căn chỉnh vị trí trong parent”: padding chỉ thay content box của chính component, còn vị trí `left`/`center`/`right`/`top`/`middle`/`bottom` của component hoặc con của nó phải do Row quyết định.
- [ ] [Tự động] Kiểm tra padding trái/phải bất đối xứng của component cuối không bị hiểu nhầm là Row căn sai: Row phải căn đúng trong content box mà padding tạo ra.
- [ ] [Tự động] Kiểm tra `Text` không dùng margin để đẩy Text, Icon, Button, Field hoặc control kế bên/trên/dưới.
- [ ] [Tự động] Kiểm tra `Icon` không dùng margin để tự căn trái/phải/trên/dưới hoặc tạo khoảng cách với icon/button khác.
- [ ] [Tự động] Kiểm tra `Button` không dùng margin để tự căn trái/phải/giữa hoặc tạo khoảng cách với component khác.
- [ ] [Tự động] Kiểm tra input, select, textarea và toggle không dùng margin để tự căn hoặc tạo khoảng cách với label/control/sibling.
- [ ] [Tự động] Kiểm tra một leaf có hình thức riêng như border, background, radius, font, kích thước hit area hoặc padding nội tại không tự biến thành owner của bố cục bên ngoài.
- [ ] [Tự động] Bổ sung contract test quét CSS/API để chặn leaf component nhận hoặc tự sinh margin ngoài phục vụ sibling spacing/alignment.
- [ ] [Cần kiểm chứng thật] Mở Sidebar DEV, kiểm tra Button, Icon, Text và control nằm cạnh nhau không xuất hiện khoảng cách bất thường do leaf tự cộng lề.

## D. Component kế cuối: `RowGroup` và `Row` không có padding/margin mặc định

- [ ] [Tự động] Đặt mặc định bốn chiều `margin` của `RowGroup` bằng `0`.
- [ ] [Tự động] Đặt mặc định bốn chiều `padding` của `RowGroup` bằng `0`.
- [ ] [Tự động] Đặt mặc định bốn chiều `margin` của `Row` bằng `0`.
- [ ] [Tự động] Đặt mặc định bốn chiều `padding` của `Row` bằng `0`.
- [ ] [Tự động] Kiểm tra một `RowGroup` bên trong Card không tự cộng thêm padding/margin với padding của Card.
- [ ] [Tự động] Kiểm tra một `Row` bên trong RowGroup không tự cộng thêm padding/margin với gap của RowGroup.
- [ ] [Tự động] Cấm các selector `> * + *`, margin sibling hoặc selector màn hình thay thế cho owner gap của `RowGroup`/`Row`.
- [ ] [Tự động] Bổ sung test hồi quy cho RowGroup/Row rỗng, một con, nhiều con và RowGroup lồng RowGroup để chứng minh mặc định padding/margin vẫn bằng 0 ở mọi dạng.

## E. Component lớn/container: padding mặc định và owner gap theo con trực tiếp

- [ ] [Tự động] Lập danh sách component lớn/container và xác định component nào phải có padding mặc định ở cả bốn hướng.
- [ ] [Tự động] Với từng component lớn/container, khai một nguồn mặc định duy nhất cho `padding-top`, `padding-right`, `padding-bottom`, `padding-left`; không khai lại theo từng màn hình.
- [ ] [Tự động] Kiểm tra Card có padding bốn hướng mặc định cho vùng nội dung của nó; header, body và các vùng đặc biệt phải ghi rõ vùng nào sở hữu padding nào.
- [ ] [Tự động] Kiểm tra Card canonical chỉ có một khai báo padding owner ở Card shell; không có khai báo padding ở CardHeader/CardBody/RowGroup/Row cho cùng vùng nội dung.
- [ ] [Tự động] Kiểm tra các component lớn khác có thể sở hữu padding riêng theo policy của chính loại đó; không áp nhầm quy tắc Card thành lệnh cấm padding cho mọi component.
- [ ] [Tự động] Kiểm tra container lớn chỉ quyết định `gap` giữa các component con trực tiếp theo chiều dọc.
- [ ] [Tự động] Kiểm tra container lớn không đặt `gap`, margin sibling hoặc selector descendant để quyết định khoảng cách giữa component cháu, chắt hoặc sâu hơn.
- [ ] [Tự động] Kiểm tra khi một component con trực tiếp thay đổi chiều cao, khoảng cách với sibling cùng cấp vẫn do container mẹ quyết định, không chuyển thành margin của component con.
- [ ] [Tự động] Kiểm tra khi một component cháu thêm/bớt item, container tổ tiên không thay đổi gap nội bộ của component cháu.
- [ ] [Tự động] Viết test cây cấp độ sau, trong đó mỗi container chỉ kiểm soát gap giữa con trực tiếp của chính nó:

```text
Body
├── Card cấp 1
│   ├── Card cấp 2 (A)
│   │   ├── RowGroup cấp 3
│   │   │   ├── Row cấp 4
│   │   │   ├── Row cấp 4
│   │   │   └── Row cấp 4
│   │   ├── Card cấp 3
│   │   └── Card cấp 3
│   └── Card cấp 2 (B)
├── Khối khác cấp 1
└── Card cấp 1
```

- [ ] [Tự động] Trong cây mẫu, kiểm tra `Body` quyết định khoảng cách giữa ba khối cấp 1: Card cấp 1 đầu, Khối khác cấp 1 và Card cấp 1 cuối.
- [ ] [Tự động] Trong cây mẫu, kiểm tra Card cấp 1 đầu quyết định khoảng cách giữa Card cấp 2 (A) và Card cấp 2 (B), không quyết định gap giữa các Row cấp 4.
- [ ] [Tự động] Trong cây mẫu, kiểm tra Card cấp 2 (A) quyết định khoảng cách giữa RowGroup cấp 3, Card cấp 3 thứ nhất và Card cấp 3 thứ hai, không quyết định gap giữa các Row cấp 4.
- [ ] [Tự động] Trong cây mẫu, kiểm tra RowGroup cấp 3 quyết định khoảng cách của ba Row cấp 4.
- [ ] [Tự động] Chặn rõ các hành vi sai trong cây mẫu: khối cấp 1 không được quyết định gap của khối cấp 3/cấp 4; khối cấp 2 không được quyết định gap của khối cấp 4; áp dụng tương tự cho mọi cấp sâu hơn.
- [ ] [Tự động] Bổ sung test để thay đổi token gap của một cấp chỉ ảnh hưởng các sibling trực tiếp ở cấp đó, không làm thay đổi gap của hậu duệ.
- [ ] [Cần kiểm chứng thật] Mở ít nhất một màn có nhiều Card lồng/đứng cạnh nhau; kiểm tra Card-Card có nhịp riêng và Row-Row trong RowGroup có nhịp riêng, không bị đồng nhất sai.

## F. `RowGroup`: wrapper bắt buộc của hàng và owner nhịp cell

- [ ] [Tự động] Chốt `RowGroup` là wrapper bắt buộc của mọi `Row`, kể cả nhóm chỉ có đúng một Row.
- [ ] [Tự động] Chốt `RowGroup` không được bị thay thế bằng Card, Box, Body hoặc component lớn trong vai trò owner khoảng cách giữa các Row liên tiếp.
- [ ] [Tự động] Xác định và hiện thực nguồn owner duy nhất cho khoảng cách dọc giữa các row item trực tiếp của `RowGroup`.
- [ ] [Tự động] Xác định và hiện thực `rowGap` là nguồn owner duy nhất cho khoảng cách dọc giữa các Row con trực tiếp của RowGroup.
- [ ] [Tự động] Chặn RowGroup khai hoặc cộng `columnGap` cho cell của Row; khoảng cách ngang giữa cell là việc riêng của Row.
- [ ] [Tự động] Kiểm tra `RowGroup` một Row vẫn dùng đúng row-gap mặc định nội bộ nhưng không phát sinh khoảng trống giả ở trước/sau Row duy nhất.
- [ ] [Tự động] Kiểm tra `RowGroup` nhiều Row có row-gap đồng nhất, không phụ thuộc mỗi Row có một, hai hay nhiều cell.
- [ ] [Tự động] Kiểm tra `RowGroup` lồng RowGroup: RowGroup ngoài chỉ quyết định khoảng cách giữa các item trực tiếp của nó; RowGroup trong chỉ quyết định khoảng cách giữa các item trực tiếp của nó.
- [ ] [Tự động] Kiểm tra không có margin của Row, Card hoặc leaf component chen vào làm thay đổi khoảng cách do RowGroup đã quyết định.
- [ ] [Tự động] Bổ sung validator/runtime contract từ chối cây có `Row` không thuộc RowGroup.
- [ ] [Tự động] Bổ sung validator/runtime contract từ chối hoặc tự báo lỗi rõ ràng khi `Row` là con trực tiếp của Card, Body, Box hoặc component lớn không phải RowGroup.
- [ ] [Tự động] Bổ sung test cho RowGroup chứa đúng một Row, nhiều Row, Row có một cell và Row có nhiều cell.
- [ ] [Cần kiểm chứng thật] Mở form có cả hàng một control và hàng nhiều control; kiểm tra khoảng cách giữa các hàng luôn theo RowGroup, không thay đổi theo số cột.

## G. `Row`: căn chỉnh duy nhất và chính sách cell

- [ ] [Tự động] Chốt `Row` là component duy nhất được phép sở hữu API/cơ chế căn vị trí cho component con trong layout ngang.
- [ ] [Tự động] Chốt `Row` là owner duy nhất của `columnGap` giữa các cell/block con trực tiếp trong đúng một hàng.
- [ ] [Tự động] Thiết kế API căn ngang của Row chỉ nhận ba giá trị có tên rõ ràng: `left`, `center`, `right`.
- [ ] [Tự động] Thiết kế API căn dọc của Row chỉ nhận ba giá trị có tên rõ ràng: `top`, `middle`, `bottom`.
- [ ] [Tự động] Xác định default của Row theo cả hai trục và ghi rõ trong policy/catalog/test; không để default chỉ nằm ngầm trong CSS.
- [ ] [Tự động] Kiểm tra Row có khả năng căn ngang trái cho một cell/block.
- [ ] [Tự động] Kiểm tra Row có khả năng căn ngang giữa cho một cell/block.
- [ ] [Tự động] Kiểm tra Row có khả năng căn ngang phải cho một cell/block.
- [ ] [Tự động] Kiểm tra Row có khả năng căn dọc trên khi các cell có chiều cao khác nhau.
- [ ] [Tự động] Kiểm tra Row có khả năng căn dọc giữa khi các cell có chiều cao khác nhau.
- [ ] [Tự động] Kiểm tra Row có khả năng căn dọc dưới khi các cell có chiều cao khác nhau.
- [ ] [Tự động] Xác định cách Row chia chiều rộng cell mặc định và ngoại lệ chiều rộng hợp lệ; không để `flex`, `%`, width hoặc max-width được viết tự do tại từng màn hình.
- [ ] [Tự động] Kiểm tra Row nhiều cell có chiều rộng chia theo policy mặc định; một cell không có sibling phải dùng toàn bộ content width theo hợp đồng chiều rộng.
- [ ] [Tự động] Kiểm tra cell `flex`, `auto`, fixed hoặc `%` chỉ dùng được qua policy/catalog/validator có tên, không đi qua CSS tự do ở consumer.
- [ ] [Tự động] Cấm `Text`, `Icon`, `Button`, control, Card, RowGroup và component domain sở hữu CSS/API tự căn `left`/`center`/`right` hoặc `top`/`middle`/`bottom` đối với vị trí trong parent; lệnh cấm này không cấm padding nội tại.
- [ ] [Tự động] Cấm các component ngoài Row tự dùng `justify-content`, `align-items`, `text-align`, `margin-left:auto`, margin căn vị trí hoặc flex alignment để thay Row, trừ ngoại lệ đã được ghi tên, có lý do và test.
- [ ] [Tự động] Khi một component cần căn chỉnh các component con độc lập, refactor component đó để gọi `Row` bên trong thay vì tự viết CSS căn chỉnh riêng.
- [ ] [Tự động] Kiểm tra component Button/Lưu theo cấu trúc nội bộ bắt buộc: khung hình thức của Button → `RowGroup` → `Row` → `Text`; vị trí Text trái/phải/giữa và trên/giữa/dưới chỉ do Row nhận tham số quyết định.
- [ ] [Tự động] Kiểm tra Button/Lưu không dùng `text-align`, padding/margin layout, `justify-content` hoặc `align-items` tại chính Button/Text để thay quyết định của Row.
- [ ] [Tự động] Bổ sung test contract quét toàn bộ component để chỉ Row/preset có owner hợp lệ được chứa CSS/API căn chỉnh vị trí sibling.
- [ ] [Cần kiểm chứng thật] Kiểm tra Button, Icon kèm Text, toggle kèm label và control có chiều cao khác nhau vẫn thẳng hàng theo Row tại viewport Sidebar thật.

## H. Ràng buộc cây: mọi `Row` luôn nằm trong `RowGroup`

- [ ] [Tự động] Chốt bất biến cây runtime: parent trực tiếp của mọi `Row` phải là `RowGroup`.
- [ ] [Tự động] Chốt bất biến schema/component: bất kỳ component nào cần một Row, dù có duy nhất một hàng, phải dựng `RowGroup` bao ngoài Row đó.
- [ ] [Tự động] Chuyển mọi consumer hiện gọi `Row` độc lập sang `RowGroup([Row(...)])` hoặc helper chung tương đương; không copy-paste wrapper tại từng màn hình nếu đã có builder/resolver đúng chỗ chung.
- [ ] [Tự động] Cấm Card gọi thẳng Row.
- [ ] [Tự động] Cấm Body/Page/Section/Box hoặc component lớn gọi thẳng Row khi nó đang đóng vai container của các Row liên tiếp.
- [ ] [Tự động] Cấm Row chứa trực tiếp Row khác; layout lồng phải là `Row` → cell/block → `RowGroup` → `Row` để Row con vẫn có parent RowGroup.
- [ ] [Tự động] Kiểm tra component chỉ cần một hàng vẫn sinh RowGroup và Row, không tối ưu hóa bằng cách bỏ RowGroup.
- [ ] [Tự động] Kiểm tra Card chứa nhiều nhóm form: mỗi nhóm Rows dùng RowGroup riêng để gap nội bộ không bị Card hoặc group khác chi phối.
- [ ] [Tự động] Viết validator báo lỗi rõ ràng khi developer tạo cây sai, tối thiểu cho các ca `Card → Row`, `Box → Row`, `Row → Row` và Row độc lập.
- [ ] [Tự động] Viết contract test kiểm tra toàn bộ UI schema/resolver/component consumer không còn đường tạo Row không có RowGroup.
- [ ] [Tự động] Viết contract test bảo đảm một RowGroup có một Row và RowGroup có nhiều Row cùng đi qua một implementation/layout policy, không có nhánh CSS khác nhau.

## I. Ca lỗi cần loại bỏ: Card gọi thẳng Row làm nhịp Row không đồng bộ

- [ ] [Tự động] Lưu ca cấu trúc sai cần cấm:

```text
Card cấp 1
├── Card cấp 2 (A)
│   └── RowGroup cấp 3
│       ├── Row cấp 4
│       ├── Row cấp 4
│       └── Row cấp 4
└── Card cấp 2 (B)
    ├── Row cấp 3
    ├── Row cấp 3
    └── Row cấp 3
```

- [ ] [Tự động] Ghi rõ lỗi của cây sai: khoảng cách giữa Row cấp 4 do RowGroup cấp 3 quyết định, còn khoảng cách giữa Row cấp 3 ở Card cấp 2 (B) lại do Card cấp 2 quyết định.
- [ ] [Tự động] Ghi rõ nguyên nhân thiếu đồng bộ: gap mặc định của Card dành cho khối lớn thường lớn hơn gap mặc định của RowGroup dành cho component cuối; hai dãy Row cùng loại vì thế có hai nhịp khác nhau.
- [ ] [Tự động] Ghi rõ hậu quả cần chặn: nhìn cùng là các Row liên tiếp nhưng khoảng cách khác nhau theo nơi chúng được đặt; developer có xu hướng vá bằng CSS màn hình, làm lỗi phân mảnh quay lại.
- [ ] [Tự động] Chuyển cây sai thành cây đúng, trong đó Card cấp 2 (B) chứa một RowGroup cấp 3 bao mọi Row cấp 4:

```text
Card cấp 1
├── Card cấp 2 (A)
│   └── RowGroup cấp 3
│       ├── Row cấp 4
│       ├── Row cấp 4
│       └── Row cấp 4
└── Card cấp 2 (B)
    └── RowGroup cấp 3
        ├── Row cấp 4
        ├── Row cấp 4
        └── Row cấp 4
```

- [ ] [Tự động] Kiểm tra trong cây đúng: hai dãy Row đều do RowGroup trực tiếp sở hữu gap; Card chỉ sở hữu gap giữa Card/RowGroup là các con trực tiếp của Card.
- [ ] [Tự động] Bổ sung regression test dựng hai cây tương đương về nội dung và chứng minh cây sai bị validator từ chối, cây đúng có khoảng cách Row nhất quán.
- [ ] [Cần kiểm chứng thật] Trên Sidebar DEV, so sánh hai nhóm form/cấu hình có nhiều Row liên tiếp ở các Card khác nhau; xác nhận nhịp Row giống nhau khi cùng dùng RowGroup.

## J. Migration, tài liệu, test và nghiệm thu

- [ ] [Tự động] Trước khi sửa code, đối chiếu checklist này với tài liệu chính thức về UI schema, renderer, layout policy và `spatialConfig`; ghi mọi mâu thuẫn cần quyết định vào `Câu hỏi đêm.md`, không tự lách bằng CSS.
- [ ] [Tự động] Cập nhật tài liệu chính thức sau khi các quyết định tại checklist được chốt: công thức chiều rộng, phân loại component, ownership padding/margin/gap, API Row, bất biến `RowGroup → Row` và ví dụ cây đúng/sai.
- [ ] [Tự động] Cập nhật `Cây thư mục code.md` nếu quá trình triển khai tạo tệp/thư mục code mới.
- [ ] [Tự động] Kiểm kê tất cả CSS `display:flex`, `display:grid`, `gap`, `padding`, `margin`, `justify-content`, `align-items`, `text-align` và width rule của component trong phạm vi; phân loại thành owner hợp lệ, hình thức nội tại, ngoại lệ domain có lý do hoặc dư thừa phải xóa.
- [ ] [Tự động] Kiểm kê tất cả consumer dựng `Row`, `RowGroup`, Card, Button, Icon, Text, Field và control; xác định consumer nào vi phạm parent trực tiếp, owner gap hoặc owner alignment.
- [ ] [Tự động] Với mỗi nhóm migration hoàn tất: chạy test liên quan, tick đúng mục checklist có bằng chứng và commit riêng nhóm đó trước khi chuyển nhóm tiếp theo.
- [ ] [Tự động] Chạy đầy đủ `node tests/run.js` sau mỗi thay đổi code; ghi số lượng đạt/không đạt vào checklist kèm commit chứa thay đổi.
- [ ] [Tự động] Chạy `git diff --check` trước mỗi commit; không commit fixture nghiên cứu, dữ liệu nhạy cảm hoặc tệp ngoài phạm vi.
- [ ] [Tự động] Khi thay đổi client GAS, chạy `node tests/gas.js verifySheets --push`; ghi revision và kết quả vào checklist.
- [ ] [Cần kiểm chứng thật] Mở đúng Sheet DEV, không phải Sheet có dữ liệu khách thật; kiểm tra Sidebar khởi động không màn trắng, không lỗi JavaScript.
- [ ] [Cần kiểm chứng thật] Kiểm tra form Customer có RowGroup bao các hàng một cột và nhiều cột; không tràn ngang, không có khoảng cách Row khác nhau do parent khác nhau.
- [ ] [Cần kiểm chứng thật] Kiểm tra Settings/Sync có RowGroup bao mọi Row đơn và nhiều Row; toggle, label, control, action và nhóm lồng giữ đúng nhịp/kích thước.
- [ ] [Cần kiểm chứng thật] Kiểm tra Button/Lưu, icon action và control tại viewport hẹp; nội dung nằm đúng vị trí do Row, không bị cắt, chồng hoặc tạo scrollbar ngang.
- [ ] [Cần kiểm chứng thật] Với mỗi ca đạt, ghi màn hình, thao tác, kết quả quan sát, viewport và ảnh chụp vào checklist hoặc tài liệu nghiệm thu được chỉ định.
- [ ] [Cần kiểm chứng thật] Với mỗi ca không đạt, ghi cấu trúc parent-child, selector/vùng hiển thị, bước tái hiện và ảnh; không tự vá CSS tại màn hình để che lỗi owner.
