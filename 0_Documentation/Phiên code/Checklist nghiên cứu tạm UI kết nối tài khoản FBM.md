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

- [ ] Bỏ hoàn toàn dòng `Đồng bộ nền đang tắt · FBM → ShinCRM` và biến thể `Đồng bộ nền đang bật ...` khỏi màn Tài khoản FBM. Đây là màn thông tin tài khoản, không phải màn cài đặt đồng bộ nền.
- [ ] Không còn link `Cài đặt đồng bộ nền` trong card kết nối tài khoản.
- [x] Link `Cài đặt đồng bộ nền` đã được chuyển sang màn `Chạy đồng bộ` trong patch trước; cần kiểm tra lại sau khi sửa layout.
- [ ] Giữ link `Cài đặt đăng nhập tự động` ở đúng vùng `Đăng nhập tự động`.

### 1.2. Hai nút ở màn Chạy đồng bộ

- [ ] `Dừng đồng bộ` và `Cài đặt đồng bộ nền` phải nằm trên hai hàng dọc riêng, có khoảng cách dùng token layout chuẩn; không dính mép và không phụ thuộc margin cục bộ của một màn.
- [ ] Sửa ở đúng ranh giới hệ thống/layout để cấu trúc nhiều action độc lập không thể vô ý tạo hai hàng liền nhau không có `Stack/gap`.
- [ ] Thêm test regression kiểm tra quan hệ DOM/schema hoặc class layout: action chính và action điều hướng phải đi qua container xếp dọc có gap; không chỉ kiểm tra chuỗi HTML hay màu nút.
- [ ] Không sửa `9_Code_cu_tham_chieu/src/ui/Styles.html`; đây là đặc tả hình thức chỉ đọc.

### 1.3. Username FBM

- [ ] Hiển thị đầy đủ username đã lưu, ví dụ `ANHLT`; không tự ý mask thành `AN***`.
- [ ] Không coi chuỗi đã mask là username thật để so lệch, lưu lại hoặc dựng bản nháp.
- [ ] Credential/password vẫn phải giữ nguyên quy tắc bảo mật hiện hành; yêu cầu bỏ mask chỉ áp dụng cho `Username FBM`, không suy diễn thành hiển thị mật khẩu rõ.

### 1.4. Cảnh báo hai username khác nhau

- [ ] `Tên đăng nhập FBM` trong vùng liên kết (`identity.username`) và `Username FBM` trong vùng đăng nhập (`credential.public.usernameHint`) là hai giá trị độc lập; không tự đồng bộ/ghi đè lẫn nhau khi gõ.
- [ ] Nếu cả hai có giá trị và khác nhau, lúc lưu edit surface `connection` phải hiện popup cảnh báo.
- [ ] Popup phải cho phép xác nhận để lưu; không biến mismatch thành lỗi chặn ở GAS.
- [ ] Hủy popup thì không gọi GAS, giữ nguyên bản nháp và hiện notice phù hợp.
- [ ] Khi module đồng bộ FBM đang bật, dòng cảnh báo nhỏ về mismatch phải luôn ở ngay dưới header trên mọi màn hình của shell.
- [ ] Dòng cảnh báo cố định dưới header không được dùng câu hỏi `Bạn có chắc chắn muốn lưu không?`; popup và banner là hai thông điệp khác mục đích.
- [x] Patch trước đã tách `usernameMismatchWarning` (popup) và `usernameMismatchBanner` (banner); cần giữ khi sửa tiếp.
- [x] Patch trước đã bổ sung ca shell banner trên các màn `run/account/results/settings`; cần chạy lại sau thay đổi mới.

### 1.5. Password rỗng khi mở chế độ sửa

- [ ] Mở edit không thể lấy plaintext password cũ ra UI; ô mật khẩu rỗng là trạng thái nhập mật khẩu mới, không phải giá trị mới cần ghi.
- [ ] Nếu người dùng không nhập password mới và không đổi `Username FBM`, thao tác lưu phải giữ nguyên credential/envelope/password cũ (ví dụ password thật vẫn là `abcd1234`), không ghi password rỗng.
- [ ] Username không đổi phải giữ đúng username đầy đủ đã lưu (ví dụ `ANHLT`), không lấy `AN***` làm giá trị mới.
- [ ] Nếu người dùng chỉ đổi identity username và để nguyên credential username/password, mismatch phải cảnh báo theo mục 1.4; sau khi xác nhận vẫn lưu được identity và không làm mất credential cũ.
- [ ] Phải kiểm tra riêng trường hợp người dùng đổi `Username FBM` nhưng để password rỗng: không được âm thầm tạo credential mới thiếu password, không được nhầm chuỗi mask là giá trị nhập thật; hợp đồng cuối cùng phải được chốt bằng code/test.

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

### 3.2. Nguyên nhân hai nút ở Run bị dính

- Tệp: `1_ShinCRM_GAS/client/sync/screens/run.html`, hàm `fbmSyncRunBackgroundSettingsBlock()` khoảng dòng 27–29.
- Hàm mới trả về một `Row` qua `FBM_SYNC_RUN_UI.layout.actionRow(Button(...))` cho nút `Cài đặt đồng bộ nền`.
- Tệp: `1_ShinCRM_GAS/client/sync/screens/run.html`, `fbmSyncRenderRun()` khoảng dòng 44–49: truyền `action: actionRow(fbmSyncRunActionBlock(status))` và `settings: fbmSyncRunBackgroundSettingsBlock(status)`.
- Tệp: `1_ShinCRM_GAS/client/sync/screens/run.html`, `fbmSyncPatchRun()` khoảng dòng 51–55: render trực tiếp `[actionRow(...), fbmSyncRunBackgroundSettingsBlock(status)]` vào cùng `FBM_SYNC_RUN_SCHEMA.regions.action`.
- Tệp: `1_ShinCRM_GAS/client/sync/fbmSyncUiSchema.html`, `FBM_SYNC_RUN_UI.layout.screen()` khoảng dòng 23–29: vùng action là `Box({ id: regions.action, elements: [slots.action, slots.settings] })`; `Box` này không có class Stack/gap.
- Tệp: `1_ShinCRM_GAS/client/ui/uiClassMap.html`, map `run.actionRow = 'shin-single-action-row'`; mỗi action row có class riêng nhưng không có container dọc chung.
- Tệp: `1_ShinCRM_GAS/client/style/components.html`, `.shin-row` có `gap: 0`, chỉ đặt khoảng cách giữa các con trực tiếp bằng `.shin-row > * + *`; `.shin-single-action-row` chỉ điều chỉnh chính một row; `.shin-stack/.shin-action-stack` mới có `flex-direction: column` và `gap: var(--shin-gap-2)`.
- Kết luận hiện tại: lỗi trực tiếp do patch trước ghép hai `Row` sibling vào `Box` không có `Stack/gap`; không phải do `Row` tự nhiên làm sai. Tuy nhiên hệ thống thiếu ràng buộc/helper để ngăn kiểu ghép này, nên cần sửa cả cấu trúc layout dùng chung và thêm test regression.

### 3.3. Nguyên nhân username bị hiển thị `AN***`

- Tệp client: `1_ShinCRM_GAS/client/schema/sync/screens/account.html`, field `login.username` có label `Username FBM`, id `fbm-login-username`.
- Tệp client: `1_ShinCRM_GAS/client/sync/fbmSyncConfigEditor.html`, hàm `fbmSyncLoginUsernameValue()` lấy `public.usernameHint` để dựng giá trị username.
- Tệp GAS: `1_ShinCRM_GAS/fbm_sync/auth/AutoLogin.js`, `loginConfigSave()` lưu `safePublic.usernameHint` từ metadata Extension; `loginConfigPublic()` trả metadata này ra Sidebar.
- Deployment DEV tại thời điểm nghiên cứu trả `public.usernameHint: "AN***"`, nên dữ liệu credential hiện có hoặc Extension đang dùng giá trị đã mask. Không được kết luận chỉ từ UI rằng password bị mã hóa; cần tách rõ mask username, envelope password và dữ liệu cũ.
- Tệp Extension cần đọc ở bước tiếp theo để xác định nguồn mask: `2_ShinCRM_Extension/background/service_worker.js` quanh các nhánh `FBM_ENCRYPT_CREDENTIALS`/`usernameHint`, và `2_ShinCRM_Extension/content_scripts/bridge/iframe_bridge.js` quanh `CRM_FBM_CREDENTIALS`.
- Patch trước đã thêm `fbmSyncUsernameComparable()` để coi username chứa `*` là không đủ dữ kiện so mismatch; đây chỉ là biện pháp tránh cảnh báo giả, chưa đáp ứng yêu cầu phải hiển thị đầy đủ username.

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

## 4. Việc cần làm theo thứ tự

- [ ] Đọc Extension để xác định chính xác nguồn `AN***` và hợp đồng metadata username; không sửa fixture nghiên cứu FBM.
- [ ] Đọc đầy đủ renderer `Row`, `Stack`, `Box` và CSS component liên quan để chọn helper/layout chung phù hợp.
- [ ] Chốt thiết kế layout action dọc: một API/container sở hữu gap, không lặp class hoặc margin tại màn Run.
- [ ] Xóa status line nền khỏi Account ở schema/render/patch và cập nhật test snapshot/hành vi liên quan.
- [ ] Sửa layout Run để `Dừng đồng bộ` và `Cài đặt đồng bộ nền` tách hàng có gap chuẩn; cập nhật schema/UI helper nếu cần.
- [ ] Khôi phục hiển thị username đầy đủ, đồng thời xử lý dữ liệu cũ đã mask theo phương án không gây cảnh báo lệch giả và không ghi đè credential âm thầm.
- [ ] Rà lại semantics password rỗng: preserve credential cũ, không clear nhầm, không gửi plaintext/password rỗng.
- [ ] Rà lại mismatch khi chỉ sửa `Tên đăng nhập FBM`: popup phải xuất hiện nếu hai username đều có giá trị và lệch; xác nhận cho lưu, hủy không gọi GAS.
- [ ] Thêm/điều chỉnh test cho: Account không có dòng nền; Run có khoảng cách/layout dọc; username đầy đủ; identity-only change mismatch; blank password preserve; username mask legacy không tạo cảnh báo giả.
- [ ] Chạy `node tests/run.js`; đọc chỉ tổng kết/lỗi.
- [ ] Chạy `git diff --check`.
- [ ] Push GAS DEV bằng `node tests/gas.js fbmGetLoginConfig --push`; ghi version và kết quả vào mục 6.
- [ ] Chỉ sau khi kiểm thử pass mới commit nhóm thay đổi; không đưa file untracked có sẵn hoặc thay đổi Category gate ngoài phạm vi vào commit.
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
| 2026-09-20 | Test trước phiên hiện tại | `node tests/run.js`: `1840 đạt, 0 không đạt` trước khi tạo file |
| 2026-09-20 | Deployment trước phiên hiện tại | `node tests/gas.js fbmGetLoginConfig --push`: deployment `@468`, trả `OK`; chưa phải deployment của các sửa mới |

## 7. Điểm tiếp tục sau khi context bị nén

1. Đọc file này trước, không thu thập lại từ đầu.
2. Tiếp tục từ mục 4 theo thứ tự: Extension username → renderer/layout → xóa dòng nền → sửa action stack → semantics username/password → test/push.
3. Trước mỗi lần sửa, ghi ngắn phát hiện mới vào mục 3; sau khi test chứng minh thì tick mục 1/4 tương ứng và cập nhật mục 6.
