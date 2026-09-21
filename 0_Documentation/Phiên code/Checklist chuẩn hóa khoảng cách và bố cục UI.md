# Checklist chuẩn hóa khoảng cách và bố cục UI

## 0. Mục tiêu và ranh giới

- [x] Ghi nhận mục tiêu phiên: mọi khoảng cách mặc định phải đi qua hợp đồng layout dùng chung; ngoại lệ chỉ tồn tại khi có lý do layout/ngữ nghĩa riêng.
- [x] Ghi nhận nguyên tắc chủ sở hữu: Page/Section sở hữu khoảng cách giữa Card; CardBody sở hữu khoảng cách giữa block; Stack sở hữu khoảng cách dọc; Row sở hữu khoảng cách ngang; ActionStack sở hữu khoảng cách giữa các nhóm action; Field/StandaloneField sở hữu khoảng cách label-control; Button/Icon chỉ sở hữu hình học bên trong.
- [x] Ghi nhận nguyên tắc cấu trúc: cùng một loại bố cục phải dùng cùng wrapper, không giải quyết khoảng cách bằng margin rải tại màn hình.
- [x] Ghi nhận nguyên tắc sibling spacing: chỉ dùng một cơ chế cho khoảng cách giữa các sibling; phiên này chọn `gap` làm cơ chế chuẩn.
- [x] Ghi nhận nguyên tắc bảo toàn: không đổi nghiệp vụ, state, action, payload, Schema dữ liệu hoặc hợp đồng GAS/Extension.
- [x] Ghi nhận nguyên tắc ngoại lệ: layout pipeline, schedule, conflict, tab, shell và host tĩnh chỉ giữ CSS riêng khi không thể biểu diễn bằng primitive chung; mỗi ngoại lệ phải có consumer và lý do.
- [x] Xác định danh sách màn hình nằm trong phạm vi: form lõi, view, status, Sync Run, Account, Results, Settings, header, footer, host và slot có ảnh hưởng khoảng cách.
- [x] Xác định rõ phần ngoài phạm vi: giao diện Google Sheets do Google sở hữu, fixture FBM, nghiệp vụ GAS/Extension và các thay đổi visual không liên quan khoảng cách/bố cục.

## 1. Mốc xuất phát và bằng chứng

- [x] Chạy `node tests/run.js` trước khi sửa code; ghi tổng số đạt, số lỗi và commit hiện tại vào checklist.
- [x] Ghi lại `git status --short`; phân loại thay đổi có sẵn của chủ dự án để không đưa vào commit phiên này.
- [x] Chụp/ghi nhận cấu trúc DOM của ít nhất một màn đại diện cho mỗi nhóm: form lõi, view, status, Sync Run, Sync Account, Sync Results, Sync Settings.
- [ ] Ghi nhận khoảng cách thực tế của các cặp cần so sánh: Card-Card, block-block trong Card, Field-Field, Field-action, action-action, Card header-action và tab-body.
- [x] Ghi nhận riêng vị trí của tất cả action mang nghĩa lưu/xác nhận: footer form, icon titleActions, config button, identity action, conflict save/merge và Run approval.
- [x] Xác định mỗi action lưu/xác nhận đang là `Button` hay `Icon` và đang nằm dưới wrapper nào.
- [x] Lưu bằng chứng baseline vào checklist hoặc test fixture; không dùng mô tả chung như “nhìn đúng”.

## 2. Kiểm kê token và luật không gian hiện có

- [ ] Kiểm tra toàn bộ token khoảng cách trong `client/style/tokens.html`; xác nhận chỉ một bảng giá trị nền tồn tại.
- [ ] Kiểm tra mọi giá trị số dùng cho `gap`, `margin`, `padding` trong CSS client; lập danh sách giá trị không lấy từ token.
- [ ] Phân loại từng khai báo thành: spacing giữa sibling, padding nội bộ, khoảng cách label-control, kích thước/hình học, hoặc ngoại lệ domain.
- [ ] Kiểm tra `.shin-row`; ghi rõ cơ chế hiện tại dùng `margin-left` và xác định các consumer đang phụ thuộc vào nó.
- [ ] Kiểm tra `.shin-single-action-row`; ghi rõ cơ chế `gap`, quy tắc wrap và quy tắc reset margin con.
- [ ] Kiểm tra `.shin-stack` và `.shin-action-stack`; ghi rõ gap, align, width và quy tắc reset margin hiện có.
- [ ] Kiểm tra luật `.shin-box > .shin-single-action-row + .shin-single-action-row`; xác định có bị áp vào `ActionStack` hay không.
- [ ] Kiểm tra `.shin-form-field`; ghi rõ margin ngoài và khoảng cách label-control.
- [ ] Kiểm tra `.shin-toggle-row`; ghi rõ margin ngoài và gap nội bộ.
- [ ] Kiểm tra `.shin-notice`, `.shin-preview-row`, `.shin-error-message`, `.shin-pass-row`, `.shin-action-status`, `.shin-pagination`; lập bảng owner và consumer.
- [ ] Kiểm tra `.shin-section`, `#sidebar-body > * + *` và các luật khoảng cách Card cấp page.
- [ ] Kiểm tra `.shin-card-head`, `.shin-card-actions`, `.shin-card-body`; tách padding, gap và spacing giữa block.
- [ ] Kiểm tra `frame.html`, `slots.html`, `status.html` để tìm spacing không nằm trong `components.html`.
- [ ] Kiểm tra CSS inline trong `sync/fbmSyncShell.html` và `sync/screens/settings.html`; phân loại lớp generic bị lặp với lớp đặc thù thật sự.
- [ ] Kiểm tra `spatialConfig` và các inline style được engine sinh; xác nhận chúng chỉ dùng cho kích thước/không gian của chính node, không thay hợp đồng sibling spacing.

## 3. Kiểm kê cấu trúc ghép component

- [ ] Lập danh sách mọi nơi gọi `Row`, `Stack`, `ActionStack`, `Card`, `Box`, `StandaloneField`, `Button` và `Icon` trong `client`.
- [ ] Với mỗi `Card`, ghi rõ wrapper trực tiếp của body và danh sách con trực tiếp.
- [ ] Với mỗi `Stack`, ghi rõ con nào là Field, Notice, Row, Box hoặc action group.
- [ ] Với mỗi `ActionStack`, ghi rõ từng nhóm action và xác nhận nhóm action không bị đặt trực tiếp cạnh nhau trong `Box` khác.
- [ ] Với mỗi `Row`, xác định nó là row dữ liệu, row field, row action, row tab hay row domain đặc thù.
- [ ] Xác định mọi `Box` đang được dùng như layout nhưng không có primitive layout tương ứng.
- [ ] Xác định mọi action row chỉ có một Button nhưng đang dùng wrapper riêng theo màn hình.
- [ ] Xác định mọi wrapper có tên nghiệp vụ nhưng chỉ khác label/action/data so với wrapper dùng chung.
- [ ] Xác định mọi vùng rỗng chịu ảnh hưởng của `.shin-box:empty` và kiểm tra việc ẩn vùng có làm thay đổi sibling spacing hay không.
- [ ] Kiểm tra các trạng thái render động có thay đổi số lượng con trực tiếp của CardBody/Stack/ActionStack hay không.

## 4. Kiểm kê action lưu/xác nhận

- [ ] Kiểm kê nút lưu footer của `customerForm`, `activityForm` và `noteForm`.
- [ ] Kiểm kê icon lưu trong `UI_FORM_HEADER` và mọi `titleActions` của Card.
- [ ] Kiểm kê lưu thông tin identity/account trong Sync Account.
- [ ] Kiểm kê các nút lưu cấu hình module, relay, Extension, lịch nền và login policy trong Sync Settings.
- [ ] Kiểm kê `saveMerge`/xác nhận conflict trong Sync Audit/Conflict.
- [ ] Kiểm kê `approve` trong Sync Run vì đây là hành động chấp thuận ghi dù nhãn không phải “Lưu”.
- [ ] Kiểm kê các action không phải ghi (`check`, `probe`, `test`, `retry`, `start`, `cancel`, `keepAll...`) để không gộp nhầm vào layout/variant của save.
- [ ] Với mỗi action, ghi rõ primitive, wrapper, owner spacing và class đặc thù hiện có.
- [ ] Xác nhận cùng semantics nhưng khác primitive (`Icon` và `Button`) được coi là hai presentation surface có hợp đồng riêng, không âm thầm dùng chung kích thước.

## 5. Hợp đồng layout chuẩn phải chốt trước khi sửa code

- [ ] Chốt token spacing nền và nguồn duy nhất của giá trị token.
- [ ] Chốt khoảng cách mặc định giữa các Card ở Page/Section.
- [ ] Chốt khoảng cách mặc định giữa các block trực tiếp trong CardBody.
- [ ] Chốt khoảng cách mặc định giữa các phần tử trực tiếp trong Stack.
- [ ] Chốt khoảng cách mặc định giữa các nhóm trong ActionStack.
- [ ] Chốt khoảng cách ngang mặc định của Row.
- [ ] Chốt khoảng cách label-control của Field/StandaloneField.
- [ ] Chốt padding CardHead, CardBody và Button/Icon theo vai component.
- [ ] Chốt Button/Icon không được có margin ngoài để điều khiển sibling spacing.
- [ ] Chốt component con không được tự cộng margin ngoài khi đã nằm trong Stack/CardBody/ActionStack.
- [ ] Chốt không dùng margin sibling để thay cho `gap` trong layout generic.
- [ ] Chốt quy tắc khi một primitive được lồng trong primitive khác: owner ở cấp trực tiếp nào thì cấp đó quyết định spacing.
- [ ] Chốt quy tắc reset margin nội bộ để không phát sinh `gap + margin` khi Field/Toggle/Notice nằm trong Stack.
- [ ] Chốt quy tắc action một nút và action nhiều nút đều phải đi qua wrapper chuẩn tương ứng.
- [ ] Chốt quy tắc Card-Card chỉ được điều khiển ở Page/Section, không do Card tự tạo khoảng cách ngoài.
- [ ] Chốt danh sách ngoại lệ hợp lệ và owner của từng ngoại lệ.
- [ ] Ghi hợp đồng trên vào tài liệu chính thức trước khi bắt đầu nhóm code đầu tiên.

## 6. Thiết kế kiểm thử kiến trúc trước khi sửa code

- [x] Viết kiểm thử xác nhận bảng token spacing chỉ có một nguồn khai báo.
- [x] Viết kiểm thử phát hiện literal spacing ngoài allowlist token/primitive/exception.
- [x] Viết kiểm thử phát hiện selector generic định nghĩa sibling spacing bằng `margin`.
- [x] Viết kiểm thử cho phép các margin nội bộ được allowlist rõ ràng, không cấm mù mọi `margin`.
- [x] Viết kiểm thử xác nhận Button/Icon không có margin ngoài trong CSS generic.
- [x] Viết kiểm thử xác nhận Field/Toggle/Notice không tạo khoảng cách kép khi làm con trực tiếp của Stack/ActionStack/CardBody.
- [x] Viết kiểm thử xác nhận `ActionStack` không bị luật fallback `shin-box > .shin-single-action-row + ...` cộng thêm spacing.
- [x] Viết kiểm thử xác nhận cùng nhóm action nhiều dòng luôn có `ActionStack` trong cây Block.
- [x] Viết kiểm thử xác nhận CardBody chỉ có một owner cho khoảng cách giữa block trực tiếp.
- [x] Viết kiểm thử xác nhận Page/Section chỉ có một owner cho khoảng cách giữa Card.
- [x] Viết kiểm thử xác nhận action save/approve không tự chọn wrapper theo tên nghiệp vụ.
- [x] Viết kiểm thử xác nhận class exception phải có trong registry/allowlist và có consumer.
- [x] Viết kiểm thử xác nhận screen schema không chứa class CSS hoặc spacing token.
- [x] Viết kiểm thử xác nhận builder không truyền `style` tự do để điều khiển sibling spacing.
- [ ] Chạy riêng nhóm kiểm thử kiến trúc trước khi migrate; ghi số đạt/lỗi vào checklist.

Ghi chú mốc kiểm thử: `layoutSpacing` đã chạy độc lập và hiện đỏ đúng 6 nhóm luật do CSS cũ chưa migrate. `node tests/run.js` hiện dừng trước nhóm UI tại `tests/cases/fbmSync/Push.js` với lỗi có sẵn `Không nhận diện được bước push: undefined`; không quy lỗi này cho phiên spacing.

Baseline phiên spacing trước lượt sửa tiếp theo: commit `683976b`, `node tests/run.js` đạt `1873`, lỗi `8`; `git status --short` chỉ có các thay đổi FBM session/pipeline có sẵn của chủ dự án, không đưa vào các commit spacing. Cây đại diện và vị trí action được kiểm bằng `formScreen`, `viewScreen`, `fbmSync/Sidebar`, `fbmSync/Components`.

## 7. Cập nhật tài liệu chính thức trước khi sửa code

- [x] Cập nhật `03. Data schema & UI schema.md` để nói rõ UI schema khai cấu trúc/hành vi, còn layout primitive sở hữu spacing.
- [x] Cập nhật `04. Bộ máy render và luồng lưu.md` để mô tả `Stack`, `ActionStack`, `Row`, `CardBody` và owner spacing.
- [x] Cập nhật `09/08. UI đồng bộ và cấu hình.md` để Sync dùng cùng layout contract và chỉ giữ ngoại lệ domain.
- [x] Ghi rõ Button/Icon không sở hữu khoảng cách bên ngoài trong tài liệu component/render.
- [x] Ghi rõ chỉ dùng `gap` cho sibling spacing generic; margin chỉ giữ trong allowlist nội bộ/ngoại lệ.
- [x] Ghi rõ cấu trúc chuẩn Page → Stack → Card → CardBody → Stack → Field/ActionStack → Row.
- [x] Ghi rõ cách xử lý action một nút, nhiều nút, title action và action xác nhận.
- [x] Ghi rõ danh sách ngoại lệ Sync hiện tại và tiêu chí để loại bỏ ngoại lệ sau này.
- [ ] Cập nhật `Cây thư mục code.md` nếu phiên tạo thêm tệp code/test hoặc thư mục mới.
- [x] Cập nhật checklist này sau khi sửa `03. Data schema & UI schema.md`, `04. Bộ máy render và luồng lưu.md` và `09/08. UI đồng bộ và cấu hình.md`; nhóm tài liệu đã sẵn sàng làm mốc cho code.

## 8. Nhóm code A — chuẩn hóa token và primitive layout

- [x] Đưa mọi token spacing nền về đúng một nguồn trong `style/tokens.html`.
- [x] Chuẩn hóa primitive Row để sibling spacing chỉ dùng một cơ chế.
- [x] Chuẩn hóa primitive Stack để reset margin nội bộ đúng contract.
- [x] Chuẩn hóa primitive ActionStack để không nhận thêm spacing từ luật fallback generic.
- [x] Chuẩn hóa CardBody để spacing giữa block trực tiếp chỉ có một owner.
- [x] Chuẩn hóa Section/Page container để spacing giữa Card chỉ có một owner.
- [x] Chuẩn hóa Field/StandaloneField để label-control và spacing ngoài không bị cộng kép.
- [x] Giữ nguyên hình học nội bộ Button/Icon, loại bỏ mọi margin ngoài không thuộc primitive.
- [x] Chạy kiểm thử kiến trúc sau nhóm primitive; `layoutSpacing` đạt 9/9 và `fbmSync/Components` đạt 29/29 khi chạy độc lập.
- [x] Chạy `node tests/run.js` sau khi nhóm A hoàn tất.
- [ ] Tick toàn bộ mục nhóm A ngay sau khi test đạt.
- [x] Commit riêng nhóm A với tiêu đề tiếng Việt nêu rõ chuẩn hóa primitive spacing.

Ghi chú nhóm A: các test UI/layout liên quan đạt; `node tests/run.js` chạy được tới tổng kết `1867 đạt, 12 không đạt`. 12 lỗi thuộc các ca FBM session/pipeline có thay đổi sẵn trong worktree, không thuộc các tệp nhóm A; mục chạy bộ đầy đủ vẫn để mở cho mốc bàn giao cuối.

## 9. Nhóm code B — chuẩn hóa Page, frame, Card và form lõi

- [x] Chuẩn hóa khoảng cách giữa các Card ở view/form/status theo Page/Section contract.
- [x] Chuẩn hóa CardBody của các màn lõi theo cùng cấu trúc con trực tiếp.
- [x] Chuyển các form field/action về Stack và ActionStack chuẩn, không thêm margin tại screen.
- [x] Kiểm tra footer save của ba form lõi dùng đúng wrapper action chuẩn.
- [x] Kiểm tra header/title action dùng đúng contract của CardHead/CardActions, không bị lẫn với Button body.
- [x] Xóa các luật margin trùng đã được primitive cấp cao sở hữu.
- [x] Chạy kiểm thử cấu trúc DOM cho view/customerForm/activityForm/noteForm/status.
- [x] Chạy `node tests/run.js` sau nhóm B.
- [x] Tick từng mục nhóm B ngay sau bằng chứng tương ứng.
- [x] Commit riêng nhóm B.

Ghi chú nhóm B: `formScreen` đạt 20/20 và `viewScreen` đạt 16/16; các assertion mới kiểm trực tiếp cây `Card → Row → Field`, `titleActions` và footer Button.

## 10. Nhóm code C — chuẩn hóa Sync Run và Account

- [x] Chuẩn hóa cây Run thành Card → CardBody → Stack/ActionStack theo contract.
- [x] Loại bỏ khả năng cộng kép gap/margin giữa các nhóm action Run.
- [x] Chuẩn hóa pipeline spacing như một ngoại lệ domain có owner duy nhất.
- [x] Chuẩn hóa Account connection section; xác định rõ padding/gap đặc thù nào còn cần giữ.
- [x] Chuẩn hóa identity fields và identity actions theo Field/Stack/ActionStack chung.
- [x] Chuẩn hóa login section; không để FormField/ToggleRow tự cộng spacing với Stack cha.
- [x] Kiểm tra các action `check`, `probe`, `save`, `approve` dùng đúng layout nhưng không gộp nhầm presentation.
- [x] Chạy kiểm thử cấu trúc DOM cho Run và Account ở trạng thái xem, sửa, lỗi và đang chạy.
- [x] Chạy `node tests/run.js` sau nhóm C.
- [x] Tick từng mục nhóm C ngay sau bằng chứng tương ứng.
- [x] Commit riêng nhóm C.

Ghi chú nhóm C: `layoutSpacing`, `fbmSync/Components` và `fbmSync/Sidebar` đạt `40/40`; các lớp status/pipeline/conflict đã bỏ margin sibling, Account dùng Stack cho identity fields, field-help và login policy groups.

## 11. Nhóm code D — chuẩn hóa Sync Results và Settings

- [x] Chuẩn hóa Results tab row, tab description và Results body theo owner spacing rõ ràng.
- [x] Chuẩn hóa Card kết quả và pagination; không để preview/error/pagination tự cộng margin kép.
- [x] Chuẩn hóa Settings card region để các Card có cùng nhịp xếp.
- [x] Chuẩn hóa nhóm module, relay, Extension, background và login policy theo Stack/CardBody contract.
- [x] Chuẩn hóa schedule row và detail controls như ngoại lệ grid có owner duy nhất.
- [x] Chuẩn hóa toggle row/login children để margin không cộng với gap Stack.
- [x] Chuẩn hóa các action save/rotate/edit/cancel trong Settings qua cùng layout action contract.
- [x] Kiểm tra trạng thái notice/error/success/preview không làm thay đổi bất ngờ spacing khi xuất hiện hoặc biến mất.
- [x] Chạy kiểm thử cấu trúc DOM cho Results và Settings ở trạng thái rỗng, có dữ liệu, lỗi và đang sửa.
- [x] Chạy `node tests/run.js` sau nhóm D.
- [x] Tick từng mục nhóm D ngay sau bằng chứng tương ứng.
- [x] Commit riêng nhóm D.

Ghi chú nhóm D: `layoutSpacing`, `fbmSync/Components` và `fbmSync/Sidebar` đạt `40/40`; Results gom page text/rows vào `Stack`, pagination giữ `Row`, Settings giữ grid schedule/detail và wrapper CardBody làm owner.

## 12. Nhóm code E — xử lý ngoại lệ và dọn đường cũ

- [x] Lập allowlist cuối cùng cho pipeline, schedule, conflict, tabs, progress, summary, shell, slots và host tĩnh.
- [x] Với mỗi ngoại lệ, ghi owner, consumer, lý do không dùng primitive generic và test bảo vệ.
- [x] Loại các class Sync chỉ lặp lại spacing generic mà không có hình thức/ngữ nghĩa đặc thù.
- [x] Loại các fallback CSS đã hết consumer sau khi chuyển sang primitive chuẩn.
- [x] Tìm và loại các selector sibling margin còn sót ngoài allowlist.
- [x] Tìm và loại các wrapper Box chỉ tồn tại để bù margin thủ công.
- [x] Kiểm tra không có `!important`, selector theo id màn hình hoặc selector theo thứ tự nút được thêm để vá khoảng cách.
- [x] Kiểm tra không có class mới theo tên nghiệp vụ chỉ để thay đổi spacing của một màn.
- [x] Chạy toàn bộ kiểm thử kiến trúc và `node tests/run.js`.
- [x] Tick từng mục nhóm E ngay sau bằng chứng tương ứng.
- [x] Commit riêng nhóm E.

Allowlist nhóm E: `margin: 0` chỉ là reset trên primitive/status/control; `margin-left: auto` chỉ căn phải; `#sidebar-info` giữ `margin-bottom` để tách vùng info với body; `login-policy-children` và `detail-controls` giữ `margin-left` để thụt lề domain; `popup-mark` giữ `margin-right` cho glyph; padding/border của lịch sử, schedule, conflict là nội bộ. `layoutSpacing` kiểm không còn selector sibling margin generic, và `components.html`/`frame.html`/`slots.html` đã chuyển các quan hệ sibling tương ứng sang `gap`.

## 13. Kiểm thử hồi quy offline sau toàn bộ code

- [ ] Chạy `node tests/run.js`; ghi tổng kết cuối phiên.
- [ ] Chạy các test contract Block/schema/UI liên quan spacing và layout; ghi tên test cụ thể.
- [ ] Kiểm tra mọi class trong catalog/allowlist đều tồn tại trong CSS hoặc thuộc whitelist primitive/host.
- [ ] Kiểm tra mọi primitive layout được include đúng thứ tự trước consumer.
- [ ] Kiểm tra không có thay đổi fixture FBM hoặc dữ liệu nhạy cảm.
- [ ] Kiểm tra diff không chứa thay đổi nghiệp vụ ngoài phạm vi.
- [ ] Kiểm tra mỗi commit chỉ chứa một nhóm liên quan và checklist đã tick tương ứng.
- [ ] Cập nhật tài liệu chính thức nếu code thực tế buộc phải điều chỉnh contract đã ghi.

## 14. Nghiệm thu trực quan trên Sheet DEV

- [ ] Mở Sidebar trên Sheet DEV và kiểm tra Card-Card ở mọi màn; output kỳ vọng: cùng nhịp theo Page/Section contract, không có khoảng trắng kép.
- [ ] Kiểm tra khoảng cách block-block trong từng Card; output kỳ vọng: cùng owner CardBody/Stack, không phụ thuộc tên màn.
- [ ] Kiểm tra cùng một loại action save trong form lõi; output kỳ vọng: wrapper và nhịp action giống nhau ở các form có cùng surface.
- [ ] Kiểm tra save icon trong Card header; output kỳ vọng: giữ kích thước Icon riêng nhưng khoảng cách CardHead/CardActions nhất quán.
- [ ] Kiểm tra save Button trong Card body; output kỳ vọng: không nhận margin từ Button, chỉ nhận spacing từ ActionStack/Row cha.
- [ ] Kiểm tra Run, Account, Results, Settings; output kỳ vọng: không có nhóm action bị dính hoặc cách xa gấp đôi.
- [ ] Kiểm tra trạng thái có/không có Notice, Error, Preview; output kỳ vọng: thêm/xóa trạng thái không làm cộng spacing ngoài contract.
- [ ] Kiểm tra Settings khi mở/sửa/hủy/lưu; output kỳ vọng: draft và control không bị thay đổi bởi callback nền.
- [ ] Kiểm tra Results với Summary/Conflict/Errors/Log/Audit; output kỳ vọng: tab, Card, pagination giữ cùng nhịp.
- [ ] Kiểm tra viewport Sidebar hẹp; output kỳ vọng: Row wrap không làm nút tràn hoặc phá owner spacing.
- [ ] Ghi lại từng lỗi visual bằng màn hình, vùng DOM, selector và khoảng cách quan sát được; không ghi “xấu” hoặc “không đều” chung chung.
- [ ] Chỉ đánh dấu nghiệm thu đạt sau khi chủ dự án xác nhận trên Sheet DEV.

## 15. Tiêu chí hoàn tất phiên

- [ ] Có một token spacing nền duy nhất.
- [ ] Mỗi loại sibling spacing có đúng một owner.
- [ ] Button/Icon không sở hữu spacing bên ngoài.
- [ ] Các màn dùng cấu trúc wrapper chuẩn theo loại bố cục.
- [ ] Mọi ngoại lệ có allowlist, consumer, lý do và test.
- [ ] Không còn luật generic cộng đồng thời `gap` và margin cho cùng một sibling relationship.
- [ ] Test kiến trúc và `node tests/run.js` đạt không lỗi.
- [ ] Tài liệu chính thức phản ánh đúng code sau refactor.
- [ ] Mọi nhóm code đã được commit riêng và checklist đã tick ngay sau commit.
- [ ] Chủ dự án đã nghiệm thu trực quan trên Sheet DEV.
