# Checklist nghiên cứu tạm — UI kết nối tài khoản FBM

> Tài liệu tạm để giữ ngữ cảnh giữa các lượt làm việc và sau khi context bị nén. Đây không phải nguồn chuẩn nghiệp vụ. Mỗi phát hiện mới phải ghi ngay vào đây; mục đã sửa và đã kiểm thử thì đánh dấu `[x]`, không xóa lịch sử quyết định. Khi toàn bộ việc đã được nghiệm thu, có thể xóa file này nếu chủ dự án yêu cầu.

## 0. Phạm vi và trạng thái phiên

- Phạm vi: màn `Tài khoản FBM`, hai vùng `Liên kết tài khoản` và `Đăng nhập tự động`, màn `Chạy đồng bộ`, shell/header và các hợp đồng layout UI liên quan.
- Ý đồ đã được chủ dự án xác nhận: hai vùng có thể khác bản chất nhưng dùng chung một edit surface `connection` và một cổng lưu nguyên tử; không tách thành hai màn sửa độc lập.
- Không được tự ý mở rộng sang nghiệp vụ đồng bộ khác; chỉ sửa UI, hợp đồng state/payload cần thiết cho các hành vi bên trên.
- Tài liệu chuẩn đã đọc: `0_Documentation/00. Tài liệu chính thức/09. Đồng bộ FBM/00. Mục lục và phạm vi.md`, `0_Documentation/00. Tài liệu chính thức/09. Đồng bộ FBM/08. UI đồng bộ và cấu hình.md`, `0_Documentation/Phiên code/Checklist rà soát đồng bộ FBM trước vận hành thật.md`, `0_Documentation/Phiên code/Câu hỏi đêm.md`.
- Branch/commit nền khi bắt đầu nghiên cứu: `feature/fbm-sync`, commit `0b37676 Sửa giao diện kết nối tài khoản FBM`.
- Deployment DEV đã từng push trước phiên này: `@468`, gọi `fbmGetLoginConfig` trả `OK`. Sau mọi sửa code phải push lại bằng `node tests/gas.js fbmGetLoginConfig --push` và ghi version mới vào đây.
- Test nền trước phiên này: `node tests/run.js` đạt `1840 đạt, 0 không đạt`.
- Worktree khi tạo checklist: còn file untracked có sẵn `0_Documentation/Phiên code/Ghi chú khảo sát getChanges và revision.md`; không tự ý xóa, không đưa vào commit UI này.

## 1. Yêu cầu người dùng và hợp đồng hành vi

### 1.1. Màn Tài khoản FBM

- [x] Bỏ hoàn toàn dòng `Đồng bộ nền đang tắt · FBM → ShinCRM` và biến thể `Đồng bộ nền đang bật ...` khỏi màn Tài khoản FBM. `fbmSyncConnectionStatusBlocks()` và vùng notice connection đã được loại khỏi renderer; test `Account không có dòng nền` sẽ chốt DOM không chứa dòng này.
- [x] Không còn link `Cài đặt đồng bộ nền` trong card kết nối tài khoản; link duy nhất vẫn ở màn `Chạy đồng bộ`.
- [x] Link `Cài đặt đồng bộ nền` đã được chuyển sang màn `Chạy đồng bộ` trong patch trước; cần kiểm tra lại sau khi sửa layout.
- [x] Giữ link `Cài đặt đăng nhập tự động` ở đúng vùng `Đăng nhập tự động`; kiểm thử UserJourneys xác nhận link mở đúng khối `Chính sách tự đăng nhập`.

### 1.2. Hai nút ở màn Chạy đồng bộ

- [x] `Dừng đồng bộ` và `Cài đặt đồng bộ nền` nằm trên hai hàng dọc riêng qua `ActionStack` lõi với gap token; không dính mép và không phụ thuộc margin cục bộ màn Run.
- [x] Sửa ở tầng hệ thống: thêm helper `ActionStack` trong `client/ui/uiBuilder.html` và fallback `.shin-box > .shin-single-action-row + .shin-single-action-row` trong `client/style/components.html`; layout Run chỉ dùng helper này.
- [x] Regression test `Các action Run đi qua ActionStack lõi có hai Row con và nhịp dọc dùng chung` cùng test core `ActionStack lõi và fallback ngăn hai nhóm action dính mép` đạt.
- [x] Không sửa `9_Code_cu_tham_chieu/src/ui/Styles.html`; đã kiểm tra diff không có tệp đặc tả hình thức.

### 1.3. Username FBM

- [x] Hiển thị đầy đủ username đã lưu, ví dụ `ANHLT`; không tự ý mask thành `AN***`. Legacy `AN***` được đọc metadata từ vault Extension và sửa metadata GAS khi đọc được.
- [x] Không coi chuỗi đã mask là username thật để so lệch, lưu lại hoặc dựng bản nháp; nếu Extension không đọc được metadata thì hiển thị trạng thái không xác định và chặn lưu/xóa âm thầm.
- [x] Credential/password vẫn giữ quy tắc bảo mật: username hiển thị đầy đủ, password đã lưu chỉ là marker `********`, password mới vẫn là input `type=password` và chỉ Extension mã hóa.

### 1.4. Cảnh báo hai username khác nhau

- [x] `Tên đăng nhập FBM` trong vùng liên kết và `Username FBM` trong vùng đăng nhập là hai giá trị độc lập; không tự đồng bộ/ghi đè lẫn nhau khi gõ.
- [x] Nếu cả hai có giá trị và khác nhau, lúc lưu edit surface `connection` hiện popup cảnh báo.
- [x] Popup cho phép xác nhận để lưu; mismatch không bị biến thành lỗi chặn ở GAS.
- [x] Hủy popup không gọi GAS, giữ bản nháp và hiện notice phù hợp.
- [x] Khi module đồng bộ FBM bật, banner mismatch nằm dưới header trên mọi màn hình shell; test Sidebar chạy đủ `run/account/results/settings`.
- [x] Banner không dùng câu hỏi xác nhận; popup và banner là hai thông điệp riêng.
- [x] Patch trước đã tách `usernameMismatchWarning` (popup) và `usernameMismatchBanner` (banner); cần giữ khi sửa tiếp.
- [x] Patch trước đã bổ sung ca shell banner trên các màn `run/account/results/settings`; cần chạy lại sau thay đổi mới.

### 1.5. Password rỗng khi mở chế độ sửa

- [x] Mở edit không lấy plaintext password cũ ra UI; password marker được xóa khi focus và khôi phục khi blur rỗng.
- [x] Không nhập password mới và không đổi `Username FBM` gửi `credential.mode: preserve`; không ghi password rỗng hoặc marker.
- [x] Username không đổi giữ đúng username đầy đủ; legacy mask không được dùng làm giá trị mới.
- [x] Đổi identity username nhưng giữ credential username/password vẫn đi qua mismatch popup và preserve credential sau xác nhận.
- [x] Đổi `Username FBM` nhưng để password rỗng chỉ bị cảnh báo/chặn lúc lưu; không tạo credential thiếu password và không nhầm marker là giá trị nhập.

### 1.6. Xóa credential và dữ liệu legacy

- [x] Có nút riêng `Xóa thông tin đăng nhập`; xóa bằng hai ô rỗng khi đã có credential dùng cùng popup xác nhận.
- [x] Chưa từng có credential với hai ô rỗng không hiện popup xóa và giữ trạng thái `Chưa lưu`.
- [x] Xóa thành công xóa vault Extension trước rồi mới xóa cấu hình GAS, tắt auto-login và giữ nguyên liên kết tài khoản; cổng GAS được retry một lần theo thao tác idempotent.
- [x] Extension lỗi khi xóa thì không gọi GAS tiếp và không báo thành công; GAS lỗi tạm thời được retry, lỗi cuối vẫn báo thất bại; test UserJourneys khóa các nhánh này.

## 2. Quy tắc tài liệu chuẩn áp dụng

- UI schema chỉ mô tả ý định/hành vi; không đưa selector/CSS tự do vào schema.
- Dùng component chung khi cấu trúc và hành vi giống nhau; không tự tạo HTML theo nghiệp vụ nếu `Card`, `Row`, `Stack`, `Button`, `Text`, `StandaloneField` đã đủ.
- Mỗi quyết định presentation và trạng thái chỉ có một nơi sở hữu; layout action phải được ánh xạ tập trung.
- Module FBM dùng renderer/schema chung; không ghép chuỗi HTML cho card, header, trạng thái hoặc loading.
- `Row` dùng cho một hàng nút chia đều; `Stack` dùng để xếp dọc các phần tử với gap. Các action độc lập không được đặt trực tiếp cạnh nhau trong một `Box` không có gap.
- Thông báo chung dưới header là ngoại lệ có điều kiện đã được tài liệu UI chuẩn ghi rõ cho mismatch username; các dòng trạng thái đồng bộ nền không thuộc màn Tài khoản.
- GAS giữ state nghiệp vụ, quyết định payload/dirty/conflict; Sidebar điều phối hiển thị và thời điểm gọi GAS.

## 3. Bằng chứng code đã thu thập

### 3.1. Nguyên nhân dòng trạng thái đồng bộ nền còn ở Account

- Tệp: `1_ShinCRM_GAS/client/sync/screens/account.html`, hàm `fbmSyncConnectionStatusBlocks()` khoảng dòng 41–45.
- Hàm hiện đọc `FBM_SYNC_CLIENT.lastStatus.backgroundEnabled`, `syncSettings.background.direction`, rồi dựng `Text` dạng `Đồng bộ nền đang bật/tắt · ...`.
- `fbmSyncConnectionCard()` truyền kết quả hàm này vào `FBM_SYNC_ACCOUNT_UI.layout.connectionCard({ notice: ... })`, nên dòng xuất hiện ngay dưới header card `Kết nối tài khoản FBM`.
- Tài liệu UI chuẩn quy định màn `Tài khoản FBM` dành cho nhận diện tài khoản, auto-login và relay; link cài đặt nền thuộc màn `Chạy đồng bộ`. Vì vậy dòng này là presentation/state đặt sai vùng, không phải thông tin cần giữ ở Account.
- Cập nhật sau sửa: hàm và slot notice nền đã bị loại khỏi card Account; regression test xác nhận không còn chuỗi trạng thái đồng bộ nền trong màn này.

### 3.2. Nguyên nhân hai nút ở Run bị dính

- Tệp: `1_ShinCRM_GAS/client/sync/screens/run.html`, hàm `fbmSyncRunBackgroundSettingsBlock()` khoảng dòng 27–29.
- Hàm mới trả về một `Row` qua `FBM_SYNC_RUN_UI.layout.actionRow(Button(...))` cho nút `Cài đặt đồng bộ nền`.
- Tệp: `1_ShinCRM_GAS/client/sync/screens/run.html`, `fbmSyncRenderRun()` khoảng dòng 44–49: truyền `action: actionRow(fbmSyncRunActionBlock(status))` và `settings: fbmSyncRunBackgroundSettingsBlock(status)`.
- Tệp: `1_ShinCRM_GAS/client/sync/screens/run.html`, `fbmSyncPatchRun()` khoảng dòng 51–55: render trực tiếp `[actionRow(...), fbmSyncRunBackgroundSettingsBlock(status)]` vào cùng `FBM_SYNC_RUN_SCHEMA.regions.action`.
- Tệp: `1_ShinCRM_GAS/client/sync/fbmSyncUiSchema.html`, `FBM_SYNC_RUN_UI.layout.screen()` khoảng dòng 23–29: vùng action là `Box({ id: regions.action, elements: [slots.action, slots.settings] })`; `Box` này không có class Stack/gap.
- Tệp: `1_ShinCRM_GAS/client/ui/uiClassMap.html`, map `run.actionRow = 'shin-single-action-row'`; mỗi action row có class riêng nhưng không có container dọc chung.
- Tệp: `1_ShinCRM_GAS/client/style/components.html`, `.shin-row` có `gap: 0`, chỉ đặt khoảng cách giữa các con trực tiếp bằng `.shin-row > * + *`; `.shin-single-action-row` chỉ điều chỉnh chính một row; `.shin-stack/.shin-action-stack` mới có `flex-direction: column` và `gap: var(--shin-gap-2)`.
- Kết luận hiện tại: lỗi trực tiếp do patch trước ghép hai `Row` sibling vào `Box` không có `Stack/gap`; không phải do `Row` tự nhiên làm sai. Tuy nhiên hệ thống thiếu ràng buộc/helper để ngăn kiểu ghép này, nên cần sửa cả cấu trúc layout dùng chung và thêm test regression.
- Cập nhật sau sửa: core có `ActionStack` sở hữu xếp dọc và gap; Run chỉ truyền hai action vào helper này. CSS fallback cũng ngăn hai `shin-single-action-row` sibling dính mép; không thêm margin cục bộ.

### 3.3. Nguyên nhân username bị hiển thị `AN***`

- Tệp client: `1_ShinCRM_GAS/client/schema/sync/screens/account.html`, field `login.username` có label `Username FBM`, id `fbm-login-username`.
- Tệp client: `1_ShinCRM_GAS/client/sync/fbmSyncConfigEditor.html`, hàm `fbmSyncLoginUsernameValue()` lấy `public.usernameHint` để dựng giá trị username.
- Tệp GAS: `1_ShinCRM_GAS/fbm_sync/auth/AutoLogin.js`, `loginConfigSave()` lưu `safePublic.usernameHint` từ metadata Extension; `loginConfigPublic()` trả metadata này ra Sidebar.
- Deployment DEV tại thời điểm nghiên cứu trả `public.usernameHint: "AN***"`, nên dữ liệu credential hiện có hoặc Extension đang dùng giá trị đã mask. Không được kết luận chỉ từ UI rằng password bị mã hóa; cần tách rõ mask username, envelope password và dữ liệu cũ.
- Đã đọc Extension: `2_ShinCRM_Extension/background/service_worker.js:190-200` cho thấy `saveCredentialEnvelope()` mã hóa payload gồm username/password bằng AES-GCM, lưu key/envelope ở vault local Extension, và trả `public.usernameHint: username` đầy đủ; `iframe_bridge.js` chỉ chuyển request/result, không mask username. Test `tests/cases/extensionBridge.js` cũng khóa luật metadata username đầy đủ.
- Patch hiện tại giữ `fbmSyncUsernameComparable()` để không so lệch giả với legacy mask, đồng thời đọc metadata username đầy đủ từ vault Extension. Nếu đọc metadata thất bại, UI hiển thị `Không đọc được username đã lưu`, không dựng bản nháp rỗng rồi xóa âm thầm.

### 3.4. Luồng edit surface và cổng lưu

- Tệp: `1_ShinCRM_GAS/client/sync/fbmSyncConfigEditor.html`.
- `fbmSyncConfigCanonicalKey()` quy `identity` và `login` về một key `connection`.
- `fbmSyncConfigStartEdit('connection')` tạo một draft gồm `identity` và `loginUsername`; `fbmSyncConfigTitleActions('connection')` tạo icon sửa/hủy/lưu ở card cha.
- `fbmSyncConfigButton('connection', ...)` tạo nút chữ phụ nếu đang edit; nút này vẫn có `data-sync-config-key="connection"`, nên phải đi cùng cổng lưu nguyên tử, không tạo save path thứ hai.
- `FBM_SYNC_CONFIG_UNSAVED_FIELDS.connection` theo dõi bốn ô identity, login username và password để dirty-state/unsaved changes.
- Tệp: `1_ShinCRM_GAS/client/sync/screens/account.html`, `fbmSyncLoginActionBlocks()` đang thêm nút chữ `Lưu thông tin` khi `editing === true`; cần giữ nhưng không tạo thêm edit surface.
- Tệp: `1_ShinCRM_GAS/client/sync/fbmSync.html`, `fbmSyncSaveConnection()` đọc hai vùng, kiểm tra identity partial, username/password, mismatch confirm, tạo payload rồi gọi `callServer('fbmSaveConnection', [{ binding, credential }])`.
- Tệp: `1_ShinCRM_GAS/fbm_sync/reconcile/Identity.js`, `FbmSync.connectionSave()` ghi binding và credential trong cùng luồng rollback; `keepOnIdentityChange` hiện cho phép giữ credential khi identity đổi.

### 3.5. Luồng password/username hiện đang cần xác minh bằng test và code Extension

- Khi kết thúc edit, `fbmSyncConfigFinishEdit('connection')` đặt `FBM_SYNC_CLIENT.loginDraft = { username: '' }` và xóa DOM password.
- Khi bắt đầu edit, `fbmSyncConfigStartEdit('connection')` lấy username từ `fbmSyncLoginUsernameValue(login)`; password không lấy plaintext mà renderer để rỗng.
- `fbmSyncLoginCredentialsFromForm()` đọc username/password hiện có trên DOM.
- `fbmSyncSaveConnection()` hiện tính `preservingCredential = hasUsername && !hasPassword && credentials.username === savedCredentialUsername`.
- Nếu password có giá trị thì `mode: 'save'`, gọi Extension mã hóa credential rồi gửi envelope/ref/public metadata.
- Nếu password rỗng và username khớp `savedCredentialUsername` thì `mode: 'preserve'`, gửi không có envelope mới.
- Nếu identity thay đổi và không rơi vào nhánh preserve thì client hiện có thể gửi `mode: 'clear'`; đây là điểm phải kiểm tra lại để đáp ứng hợp đồng mới “identity đổi nhưng credential cũ vẫn có thể giữ sau cảnh báo”.
- Nếu `public.usernameHint` đang là `AN***`, phép so sánh `credentials.username === savedCredentialUsername` không thể coi `AN***` là username thật `ANHLT`; đây là nguồn rủi ro chính cho câu hỏi “password rỗng đang giữ hay xóa”.
- Chưa được kết luận giá trị password thật sau thao tác không đổi cho tới khi kiểm tra payload test và `FbmSync.connectionSave()`/`loginConfigClearCredential()` trên từng nhánh.

### 3.6. Kết luận hành vi hiện tại cho năm câu hỏi của chủ dự án

- Câu 1: Dòng trạng thái nền hiện vẫn được dựng ở `fbmSyncConnectionStatusBlocks()` và truyền vào card kết nối Account; nó chưa được xóa.
- Câu 2: Hai nút Run dính là lỗi trực tiếp của patch trước: hai `shin-single-action-row` được đưa làm sibling trực tiếp vào `Box` action không có `Stack/gap`. CSS `gap` của từng Row chỉ áp dụng bên trong Row; không tạo khoảng cách giữa hai Row. Đây chưa phải lỗi bản thân primitive `Row`, nhưng hệ thống thiếu API/ràng buộc ngăn cách ghép sai nên phải sửa ở layout dùng chung và thêm regression test.
- Câu 3: Code Extension hiện tại không mask username khi mã hóa/lưu credential mới; nó trả username đầy đủ ở metadata và payload mã hóa. Giá trị `AN***` đang xuất hiện vì metadata `public.usernameHint` đã lưu trong GAS/deployment hiện tại là chuỗi đã mask từ dữ liệu/lần lưu cũ. Sidebar hiện chỉ đọc metadata đó nên hiển thị lại `AN***`; GAS/Sidebar không có key để giải mã vault Extension và tự khôi phục `ANHLT`.
- Câu 4: Khi identity username đổi nhưng `Username FBM` vẫn là username đầy đủ cũ, client sẽ phát hiện mismatch và popup trước khi gọi GAS; xác nhận thì gửi `mode: 'preserve'` và `keepOnIdentityChange: true`, nên identity mới được lưu còn credential cũ giữ nguyên. Nhưng nếu ô `Username FBM` đang là `AN***`, hàm `fbmSyncUsernameComparable()` cố ý bỏ qua chuỗi có `*`, nên hiện tại không cảnh báo; đây là lý do hành vi trong ảnh không đạt yêu cầu.
- Câu 5, password: Mở edit không lấy plaintext password cũ; ô password rỗng. Nếu username trên form trùng `public.usernameHint` hiện tại và password để rỗng, client gửi `credential.mode: 'preserve'`; GAS không ghi envelope mới, nên password cũ trong vault Extension không bị thay bằng rỗng. Sau save, DOM password lại bị xóa. Nếu username form khác hint hiện tại mà password vẫn rỗng, client hiện chặn cục bộ vì chỉ có một trong hai trường username/password; chưa gọi GAS.
- Câu 5, username: Với nhánh `preserve`, GAS giữ nguyên metadata/public username đang lưu. Nếu metadata hiện là `AN***`, nó vẫn là `AN***`; code hiện tại không tự biết hoặc khôi phục `ANHLT`. Credential thật trong vault Extension chỉ giữ nguyên giá trị cũ nếu nhánh preserve; nội dung vault không thể kết luận là `ANHLT` chỉ bằng dữ liệu GAS, nhưng nếu credential cũ được tạo đúng từ Extension hiện tại thì payload mã hóa đã chứa username đầy đủ.
- Câu 5, nhánh xóa: Nếu identity thay đổi nhưng client không đặt `keepOnIdentityChange: true`, `FbmSync.connectionSave()` đổi `preserve` thành `clear`; `loginConfigClearCredential()` xóa ref/envelope/public khỏi cấu hình GAS và tắt auto-login. Việc đó không đồng nghĩa đã xóa vault local Extension, trừ khi có luồng clear Extension riêng.

### 3.7. Ma trận payload hiện tại cần chủ dự án duyệt

| Tình huống | Client hiện gửi | GAS hiện làm |
|---|---|---|
| Không đổi identity, username đầy đủ giữ nguyên, password rỗng | `mode: preserve` | Giữ envelope/password/public cũ |
| Không đổi identity, username đang là `AN***`, password rỗng | `mode: preserve` | Giữ nguyên cấu hình GAS đang chứa `AN***`; không khôi phục `ANHLT` |
| Chỉ đổi identity username, credential username đầy đủ cũ, password rỗng, xác nhận popup | `mode: preserve`, `keepOnIdentityChange: true` | Lưu identity mới, giữ credential cũ; hai username có thể lệch theo chủ ý |
| Đổi `Username FBM` nhưng để password rỗng | Bị client chặn trước GAS nếu username khác hint hiện tại | Không có ghi |
| Đổi username và nhập password mới | `mode: save`, envelope mới từ Extension | Lưu credential mới và metadata username mới |
| Identity đổi, không preserve credential | `mode: clear` | Xóa credential khỏi cấu hình GAS và tắt auto-login |

## 3.8. Phương án hành vi đã được chủ dự án duyệt

- Giữ nguyên các nhãn hiện tại (`USERNAME FBM`, `MẬT KHẨU FBM`); nội dung trong ô và trạng thái tương tác phải đủ tường minh, không đổi nhãn để thay thế cho UX.
- Username credential đã lưu phải hiển thị đầy đủ, ví dụ `ANHLT`; không mask thành `AN***`. Username nhận diện và username credential là hai giá trị độc lập, không tự ghi đè nhau.
- Password đã lưu ở chế độ xem hoặc đang sửa nhưng chưa thao tác vào ô hiển thị đúng marker `********`; marker chỉ là dấu hiệu đã có mật khẩu, không phải giá trị thật.
- Khi click vào ô password đã lưu, xóa marker, để input rỗng và dùng placeholder `Nhập mật khẩu mới`. Khi rời ô mà input rỗng, hoặc đã gõ rồi xóa hết rồi rời ô, khôi phục marker `********` và hiểu là preserve, không đổi password.
- Giá trị password người dùng đang gõ vẫn giữ `type=password` để hiển thị dạng dấu chấm; không hiển thị plaintext mặc định. Có thể dùng icon mắt chung của core nếu phù hợp, nhưng không đổi giá trị password và không đưa password ra GAS/Sidebar DTO/log.
- Mọi thay đổi trong ô username đều phải được theo dõi, gồm gõ, dán và thao tác menu chuột phải/phím tắt; có thể debounce khoảng 100 ms. Chỉ cập nhật vùng password, không dựng lại cả card làm mất focus/nội dung.
- Có credential cũ và username hiện tại đúng `ANHLT`: password rỗng thì hiện lại `********`; password mới khác rỗng là update password.
- Username khác `ANHLT`, kể cả rỗng: xóa marker, để password rỗng với placeholder `Nhập mật khẩu mới`; hiểu là đổi tài khoản hoặc ý định xóa. Nếu gõ lệch rồi quay lại `ANHLT`, password rỗng thì khôi phục marker; password đã nhập thì giữ draft.
- Chỉ kiểm tra thiếu cặp khi bấm `Lưu thông tin`, không hiện cảnh báo trong lúc đang nhập. Username có mà password rỗng, hoặc password có mà username rỗng, đều chặn lưu và yêu cầu đủ cả hai; sau khi người dùng click lại để nhập thì notice lỗi cũ biến mất.
- Cả username và password khác rỗng thì cho phép lưu credential mới. Cả hai rỗng khi chưa từng có credential là trạng thái `Chưa lưu`, không tạo credential và không hiện popup xóa.
- Cả hai rỗng khi đang có credential và người dùng đã xóa username là yêu cầu xóa; không bao giờ xóa chỉ vì password rỗng.
- Xóa credential dùng phương án kết hợp: có nút riêng `Xóa thông tin đăng nhập` và nhận diện thêm trường hợp người dùng làm cả hai ô rỗng rồi bấm `Lưu thông tin`. Hai đường đi dùng chung một popup và cùng nghiệp vụ xóa.
- Popup xóa dùng đúng hai lựa chọn `[Quay lại]` và `[Xác nhận xóa]`, nêu rõ username/mật khẩu bị xóa nhưng liên kết tài khoản FBM vẫn giữ. Hủy không gọi GAS và giữ bản nháp.
- Xác nhận xóa phải xóa cấu hình credential ở GAS, xóa credential tương ứng trong vault Extension, tắt auto-login, giữ nguyên `Liên kết tài khoản`, rồi trả khối về `Chưa lưu`. GAS và Extension không có transaction xuyên hệ thống nên phải có xử lý bù; không báo thành công nếu mới xóa một phía.
- Khi hai username đều có giá trị và khác nhau, lúc lưu edit surface `connection` hiện popup cảnh báo; xác nhận vẫn cho lưu nguyên tử, hủy không gọi GAS. Mismatch banner nhỏ dưới header chỉ hiện khi module đang bật, trên mọi màn hình; banner không thay popup.
- Khối `Chính sách tự đăng nhập` luôn có dòng trạng thái riêng phía trên: bật là `Đã bật tính năng đăng nhập tự động` màu xanh, tắt là `Đã tắt tính năng đăng nhập tự động` màu đỏ. Nếu policy bật nhưng chưa có credential thì thêm notice readiness riêng.
- Nếu chưa có credential, không cho sửa policy; icon sửa vẫn có thể bấm để mở popup giải thích, có nút/link `Đi tới Đăng nhập tự động` và `[Quay lại]`, link tới đúng khối khai báo username/password.
- Layout UI: `Row` chỉ đại diện phần tử cùng một dòng; container/`Stack`/`Flow` dùng chung sở hữu khoảng cách dọc giữa các action độc lập. Không sửa bằng margin cục bộ màn Run. Toàn bộ audit UI codebase vẫn chờ lệnh riêng, không mở rộng trong phiên này.

## 3.9. Chi tiết state machine đã được chủ dự án duyệt

### Password: phân biệt marker, giá trị nhập và mã hóa

- Khi xem đã lưu: hiển thị `********`; đây là dấu hiệu có credential, không phải password thật.
- Khi click vào ô password đã lưu: xóa dấu `********`, để input rỗng, placeholder `Nhập mật khẩu mới`.
- Khi rời ô mà input vẫn rỗng: khôi phục `********`, đánh dấu `preserve`; không đổi password.
- Khi người dùng gõ rồi xóa hết và rời ô: cũng khôi phục `********`, đánh dấu `preserve`.
- Khi input có giá trị: đây là password mới cần lưu. Mã hóa chỉ diễn ra tại Extension trước khi gửi credential đi lưu.
- Input luôn dùng `type=password`, ký tự đang gõ hiển thị dạng dấu chấm; giá trị tạm vẫn giữ nguyên để submit. Icon mắt chỉ là tùy chọn theo component chung, không hiển thị plaintext mặc định.

### Realtime username và password

- Theo dõi username với debounce khoảng 100 ms kể từ thay đổi cuối; bao gồm gõ, dán, chuột phải và phím tắt. Chỉ cập nhật vùng password, không dựng lại card.
- Có credential đã lưu, username hiện tại đúng `ANHLT`: password ở trạng thái `********`/preserve; nếu người dùng nhập giá trị mới vào password thì đó là update password.
- Username khác `ANHLT`, kể cả rỗng: xóa marker `********`, password về rỗng với placeholder `Nhập mật khẩu mới`; đây là thay tài khoản hoặc ý định xóa.
- Username gõ lệch rồi quay lại đúng `ANHLT`: nếu password draft đang rỗng thì khôi phục marker; nếu đã có password draft thì giữ draft và coi là update password.
- Username rỗng + password có giá trị, hoặc username có giá trị + password rỗng sau khi username đã đổi: chỉ chặn khi bấm lưu, không chặn realtime.

### Validation chỉ khi bấm lưu

- Không hiện cảnh báo thiếu cặp username/password trong lúc đang gõ.
- Bấm lưu mới hiện popup/notice lỗi; khi người dùng click lại để sửa, notice lỗi cũ biến mất.
- Cả hai rỗng khi đang có credential và username đã bị xóa: yêu cầu xóa, mở confirmation chung.
- Cả hai rỗng khi chưa từng có credential: giữ `Chưa lưu`, không tạo credential, không hiện popup xóa.
- Chế độ xem chưa từng lưu hiển thị `Chưa lưu` trong cả hai ô; khi bấm sửa, cả hai input rỗng với placeholder tương ứng, không coi `Chưa lưu` là giá trị nhập.

### Phương án xóa credential

- Đã duyệt phương án kết hợp: nút riêng `Xóa thông tin đăng nhập` và xóa khi người dùng chủ động làm cả hai ô rỗng rồi bấm `Lưu thông tin`.
- Hai đường đi vào cùng một confirmation và cùng một nghiệp vụ; không xóa âm thầm, không xóa chỉ vì password rỗng.
- Nút popup dùng đúng `[Quay lại]` và `[Xác nhận xóa]`.
- Xác nhận xóa: xóa cấu hình credential GAS, xóa credential tương ứng trong vault Extension, tắt auto-login, giữ nguyên liên kết tài khoản.
- Vì GAS/Extension không có transaction xuyên hệ thống, cần protocol lỗi bù/idempotent và báo lỗi rõ khi một phía thất bại; tuyệt đối không báo thành công một phần.

### Chính sách tự đăng nhập khi chưa có credential

- Khối chính sách luôn có dòng trạng thái riêng phía trên notice/chỗ sửa.
- Policy bật: dòng xanh `Đã bật tính năng đăng nhập tự động`; policy tắt: dòng đỏ `Đã tắt tính năng đăng nhập tự động`.
- Policy bật nhưng chưa có credential: thêm notice readiness `Chưa sẵn sàng: hãy nhập username và mật khẩu ở màn Đăng nhập tự động`; dòng xanh vẫn phản ánh công tắc, notice phản ánh khả năng hoạt động.
- Chưa có credential thì không cho sửa policy; click icon sửa phải mở popup giải thích thay vì disable im lặng.
- Popup có nút/link `Đi tới Đăng nhập tự động` và `[Quay lại]`; link tới đúng khối khai báo credential.

## 4. Việc cần làm theo thứ tự

- [x] Đọc Extension để xác định hợp đồng metadata username; code hiện tại trả username đầy đủ, còn `AN***` là dữ liệu metadata đã tồn tại trong GAS/deployment.
- [x] Đọc đầy đủ renderer `Row`, `Stack`, `Box` và CSS component liên quan; xác định `Row` chỉ có trách nhiệm một hàng và gap dọc phải do container chung sở hữu.
- [x] Chốt thiết kế layout action dọc bằng API `ActionStack` lõi và fallback CSS hệ thống, không lặp class hoặc margin tại màn Run.
- [x] Xóa status line nền khỏi Account ở schema/render/patch và cập nhật test snapshot/hành vi liên quan.
- [x] Sửa layout Run để `Dừng đồng bộ` và `Cài đặt đồng bộ nền` tách hàng có gap chuẩn qua `ActionStack`.
- [x] Khôi phục hiển thị username đầy đủ, xử lý legacy mask qua metadata vault và fail-closed khi metadata không đọc được.
- [x] Rà lại semantics password rỗng: preserve credential cũ, không clear nhầm, marker không được gửi như password mới, plaintext không đi qua GAS.
- [x] Rà lại mismatch khi chỉ sửa `Tên đăng nhập FBM`: popup xuất hiện khi hai username có giá trị và lệch; xác nhận lưu, hủy không gọi GAS.
- [x] Thêm/điều chỉnh test cho Account không có dòng nền, Run layout dọc, username đầy đủ, mismatch, blank password preserve, marker focus/blur/realtime, legacy mask, xóa credential, retry GAS và nhánh lỗi vault.
- [x] Chạy `node tests/run.js`: `1854 đạt, 0 không đạt`.
- [x] Chạy `git diff --check`: không có lỗi whitespace.
- [x] Push GAS DEV bằng `node tests/gas.js fbmGetLoginConfig --push`; revision `@469` trả `OK`, `configured: true`, `public.usernameHint: ANHLT`.
- [x] Chỉ sau khi kiểm thử pass mới commit nhóm thay đổi; commit `46c1575` không đưa file untracked có sẵn hoặc thay đổi Category gate ngoài phạm vi vào commit.
- [ ] Nghiệm thu live trên Sheet DEV; không dùng dữ liệu khách thật và không gửi request xóa.

## 5. Quy tắc không được vi phạm khi tiếp tục

- Không đọc/sửa `0_Documentation/Nghiên cứu FBM` hoặc fixture trong thư mục đó.
- Không sửa `9_Code_cu_tham_chieu/src/ui/Styles.html`.
- Không tự ý xóa/revert thay đổi có sẵn của chủ dự án, đặc biệt file `0_Documentation/Phiên code/Ghi chú khảo sát getChanges và revision.md` đang untracked.
- Không hardcode HTML mới; ưu tiên schema, renderer primitive, `Row`, `Stack`, `Button`, `Notice` và layout catalog dùng chung.
- Không đưa password, cookie, envelope, `authorized` hoặc payload nhạy cảm vào log/test fixture/sidebar notice.
- Không kết luận password cũ đã bị thay đổi chỉ từ việc ô nhập đang rỗng; phải truy payload/mode/cổng GAS.
- Sau mỗi nhóm sửa, tick đúng mục đã có bằng chứng; không tick chỉ vì code đã viết.

## 6. Nhật ký thực hiện và bằng chứng

| Thời điểm | Việc | Kết quả/bằng chứng |
|---|---|---|
| 2026-09-20 | Đọc tài liệu UI FBM, mục lục 09, checklist rà soát và Câu hỏi đêm | Đã ghi các ràng buộc liên quan ở mục 2 |
| 2026-09-20 | Rà code Account/Run/editor/shell/CSS | Đã xác nhận nguyên nhân hai Row Run dính nhau ở mục 3.2 |
| 2026-09-20 | Đọc Extension và truy vết các nhánh save/preserve/clear | Đã ghi câu trả lời hiện tại cho 5 câu hỏi và ma trận payload ở mục 3.6–3.7; chưa sửa code |
| 2026-09-20 | Test trước phiên hiện tại | `node tests/run.js`: `1840 đạt, 0 không đạt` trước khi tạo file |
| 2026-09-20 | Deployment trước phiên hiện tại | `node tests/gas.js fbmGetLoginConfig --push`: deployment `@468`, trả `OK`; chưa phải deployment của các sửa mới |
| 2026-09-20 | Sửa core ActionStack và loại status nền khỏi Account | `node tests/run.js`: `1843 đạt, 0 không đạt`; test layout xác nhận hai Row nằm trong `shin-action-stack`, Account không còn vùng notice nền |
| 2026-09-20 | Hoàn thiện credential state machine và kiểm thử xóa | Username legacy đọc metadata vault hoặc fail-closed; marker `********` focus/blur/realtime; preserve không mã hóa lại; xóa vault trước GAS, retry GAS một lần và chặn partial failure; `node tests/run.js`: `1854 đạt, 0 không đạt`; `git diff --check` sạch |
| 2026-09-20 | Commit và push nhóm credential/UI | Commit `46c1575 Hoàn thiện state machine credential FBM`; GAS DEV `@469`, `fbmGetLoginConfig --push` trả `OK`, username `ANHLT` |

## 7. Điểm tiếp tục sau khi context bị nén

1. Đọc file này trước, không thu thập lại từ đầu.
2. Đã hoàn tất code/test/commit/push của nhóm credential/UI; không stage `Ghi chú khảo sát getChanges và revision.md` hay thay đổi pipeline ngoài phạm vi.
3. Chỉ còn nghiệm thu live trên Sheet DEV; giữ `[ ]` cho tới khi chủ dự án kiểm tra, không chạy thao tác xóa live.
