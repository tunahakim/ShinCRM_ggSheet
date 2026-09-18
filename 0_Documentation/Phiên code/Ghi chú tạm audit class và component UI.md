# Ghi chú tạm — audit class CSS và component UI

Trạng thái: đã triển khai refactor schema sạch CSS ở lớp offline; tệp này tiếp tục là sổ audit và inventory để giữ ngữ cảnh trước nghiệm thu giao diện trên Sheet DEV.

## 1. Phạm vi và mốc kiểm tra

- Source chính thức đã rà: `1_ShinCRM_GAS/client` và `2_ShinCRM_Extension`.
- Không tính fixture trong `0_Documentation/Nghiên cứu FBM/`, file preview sinh ra `tests/xem-sidebar.html`, hay class của Google Sheets trong Extension (`docs-sheet-active-tab`).
- Bộ test nền ngày audit: `node tests/run.js` — Đạt 1667, Không đạt 0.
- Bộ test sau migrate Sync/layout/catalog: `node tests/run.js` — Đạt 1674, Không đạt 0.
- CSS selector class riêng biệt trong `1_ShinCRM_GAS/client`: 201, gồm 186 class `shin-*` và 15 state class `is-*`.
- 201 là số class selector định nghĩa trong CSS, không phải số lần xuất hiện. Một class có thể được khai báo một lần nhưng tiêu thụ ở nhiều schema/component.

## 2. Các file/schema chứa tên class

### 2.1 Schema lõi và schema trạng thái

| File | Dạng khai báo | Class chính |
|---|---|---|
| `client/schema/screens/activityForm.html` | `footer[].className` literal | `shin-primary`, `shin-save-wide` |
| `client/schema/screens/customerForm.html` | `footer[].className` literal | `shin-primary`, `shin-save-wide` |
| `client/schema/screens/formHeader.html` | `header[].className` literal | `shin-form-cancel`, `shin-form-save` |
| `client/schema/screens/noteForm.html` | field/footer `className` literal | `shin-note-tall`, `shin-primary`, `shin-save-wide` |
| `client/schema/screens/view.html` | field `className` literal; spatial token chứa tên class | `shin-note`, `shin-card-history` |
| `client/schema/status/common.html` | primitive status truyền literal | `shin-status-*` |
| `client/schema/status/budgetBlocked.html` | primitive status truyền literal | `shin-status-title`, `shin-status-strong`, `shin-status-box`, `shin-status-warn` |
| `client/schema/status/loadError.html` | primitive status/button truyền literal | `shin-status-title`, `shin-status-box`, `shin-status-error`, `shin-primary` |
| `client/schema/status/loadSummary.html` | primitive status truyền literal | `shin-status-title`, `shin-status-strong`, `shin-status-box`, `shin-status-warn` |

### 2.2 Schema Sync/FBM

| File | Dạng khai báo | Điểm cần chú ý |
|---|---|---|
| `client/schema/sync/screens/index.html` | raw property trong `shell` và `config` | `headerClass`, `navClass`, `navItemClass`, `activeClass`, `disabledClass`, `activeItemClass`, `toggleOnClass`, `toggleOffClass`, `actionRowClass`, `cancelClass`, `saveClass`, `editIconClass`, `editClass`, `primaryClass` đều nằm ngoài `classes`. |
| `client/schema/sync/screens/run.html` | `rootClass` + `classes` map | map có role/state và class domain pipeline. |
| `client/schema/sync/screens/account.html` | `rootClass` + `classes` map + `identity.cardClass` | `identity.cardClass = shin-action-stack` nằm ngoài map chung. |
| `client/schema/sync/screens/results.html` | `rootClass` + `classes` map + raw properties | `tabRowClass`, `tabClass`, `paginationClass` nằm ngoài `classes`; `layout.screen` dùng `tabRowClass`, controller dùng `tabClass`. |
| `client/schema/sync/screens/settings.html` | `rootClass` + `classes` map + `notice.relayClass` | `notice.relayClass = shin-pass-row` nằm ngoài map; map đã có layout và state toggle. |
| `client/schema/sync/results/status.html` | `classes` map | Có map rõ cho progress/status nhưng controller vẫn ghép class trực tiếp ở một nơi khác. |
| `client/schema/sync/results/issues.html` | `classes` map | `preview`, `error`. |
| `client/schema/sync/results/audit.html` | `classes` map | `preview`, `muted`, `pass`, `error`. |
| `client/schema/sync/results/conflict.html` | `classes` map | Domain conflict + `singleAction`, `primary`. |

Tổng cộng: 18 schema HTML có class-related values: 5 schema lõi, 4 schema trạng thái, 5 schema Sync screen, 4 schema Sync result.

### 2.3 Component, slot, controller và host có class

- `client/ui/uiBuilder.html`: `Notice` đã có map tone `pending/success/warning/error` sang class; `Stack`, `StandaloneField` thêm class primitive.
- `client/ui/renderEngine.html`: sinh class HTML cố định cho Block/Field/Button/Icon/Check/StandaloneControl; đây là lớp renderer, không phải class màn hình.
- `client/ui/slots.html`: class đặc thù slot hoạt động, gợi ý khách, info bar, badge và empty state.
- `client/ui/menu.html`, `client/ui/choiceMenu.html`, `client/ui/combo.html`, `client/ui/popupList.html`, `client/ui/collapse.html`: class DOM nội bộ menu/combo/popup/collapse.
- `client/ui/inputs.html`, `client/ui/progress.html`, `client/ui/search.html`: class cho input state, busy/progress và search host.
- `client/screen/formScreen.html`: CSS form và `Text(... className: 'shin-header-title shin-form-title')` tại dòng 105.
- `client/screen/viewScreen.html`: tham chiếu `shin-card-history` để tìm card lịch sử khai trong schema.
- `client/save/saveFlow.html`: hằng `SAVE_FLOW_ERROR_CLASS = 'shin-input-error'`, thêm/xóa class lỗi trên control.
- `client/save/pendingDelete.html`: dùng id/class undo strip đã có trong host.
- `client/link/selectionPoll.html`: `classList.toggle('shin-extension-missing', ...)` tại dòng 166.
- `client/sync/fbmSync.html`: cập nhật trực tiếp progress bằng `shin-loading-track`, `shin-loading-fill`, `is-idle`, `is-indeterminate`, `is-waiting` tại dòng 329–330; đây là bypass rõ của `FBM_SYNC_STATUS_SCHEMA.classes`.
- `client/sync/fbmSyncShell.html`: CSS Sync inline và tiêu thụ class từ registry shell (`headerClass`, `navClass`, `toggleOnClass`...).
- `client/sync/fbmSyncConfigEditor.html`: tiêu thụ class config từ `FBM_SYNC_UI_SCHEMA.config` và tạo nút chỉnh sửa/lưu/hủy dùng chung.
- `client/sync/fbmSyncSettingsScreen.html`, `client/sync/fbmSyncStatusScreen.html`, `client/sync/fbmSyncAuditScreen.html`, `client/sync/screens/account.html`, `client/sync/screens/results.html`, `client/sync/screens/run.html`, `client/sync/screens/settings.html`: controller/screen consumer của các schema Sync.
- `client/Sidebar.html`: host khung tĩnh (`shin-shell-header`, loading, search, undo, warning...); tài liệu cho phép host giữ class cố định.
- `client/style/components.html`: 98 selector generic/semantic/control.
- `client/style/frame.html`: 12 selector frame/host.
- `client/style/slots.html`: 23 selector slot/domain.
- `client/style/status.html`: 16 selector status.
- `client/sync/fbmSyncShell.html`: 44 selector CSS Sync inline.
- `client/style/tokens.html`: chỉ chứa CSS custom properties, không định nghĩa selector class.

Extension chỉ có một class không thuộc UI ShinCRM: `2_ShinCRM_Extension/content_scripts/scout/sheet_scout.js` đọc class Google Sheets `docs-sheet-active-tab`.

## 3. Class được tiêu thụ ở đâu

### 3.1 Role/feedback dùng xuyên màn hình

| Role/nhóm | Class tiêu biểu | Consumer |
|---|---|---|
| Primary/action | `shin-primary`, `shin-save-wide` | footer ba form lõi; nút retry status; nút action Sync run/account/conflict/config. `shin-save-wide` còn được `ui/inputs.html` dùng để tìm footer save. |
| Muted/secondary | `shin-muted`, `shin-text-soft`, các class text tương ứng | Sync run/account/results/settings/audit; CSS generic/Sync. |
| Error/invalid | `shin-error`, `shin-error-message`, `shin-status-error`, `shin-notice-error`, `shin-input-error`, `is-error`, `is-invalid` | status screen; Sync status/issues/audit/account; save flow đánh dấu field; pipeline step. |
| Warning | `shin-warn`, `shin-status-warn`, `shin-notice-warning`, `shin-extension-warning` | status budget/load summary; Notice; host cảnh báo thiếu Extension. |
| Success/pass | `shin-ok`, `shin-pass-row`, `shin-notice-success`, `is-done` | Sync account/settings/audit/pipeline; slot badge/style. |
| Pending/info | `shin-notice-pending`, `shin-notice-info`, `shin-status-info` | Notice và status info. `Notice` đã có resolver tone cục bộ tại `ui/uiBuilder.html:170–176`. |
| State modifier | 15 class `is-*` | popup/combo/menu, toggle, progress, pipeline, tab và description. Bao gồm `is-active`, `is-selected`, `is-current`, `is-done`, `is-error`, `is-idle`, `is-indeterminate`, `is-invalid`, `is-multiline`, `is-off`, `is-on`, `is-running`, `is-waiting`, `is-body-popup`, `is-filled`. |

### 3.2 Class domain/khối

- `shin-status-*`: chỉ được tạo bởi `schema/status/common.html` và các status schema; consumer cuối là `screen/statusScreen.html` qua `STATUS_SCHEMA`.
- `shin-act-*`, `shin-suggest-*`, `shin-info-*`, `shin-badge-*`, `shin-empty`: tạo bởi `ui/slots.html`; consumer là `renderEngine` khi render `SLOTS.activityList`, `SLOTS.searchSuggestions`, `SLOTS.infoBarContent`.
- `shin-sync-*`: schema Sync, controller Sync và CSS inline `sync/fbmSyncShell.html`; dùng cho pipeline, progress, tab, summary, conflict, settings layout.
- `shin-config-*`, `shin-single-action-row`, `shin-action-stack`, `shin-action-status`, `shin-preview-row`, `shin-pagination`: chủ yếu do Sync config/result screen tiêu thụ.
- `shin-card-*`, `shin-field-*`, `shin-input`, `shin-button`, `shin-icon`, `shin-toggle-*`, `shin-choice-*`, `shin-combo-*`, `shin-popup-*`: renderer/primitive UI sinh hoặc menu controller tiêu thụ; không nên đẩy các class này vào screen schema.

## 4. Phân nhóm 201 selector (phân loại loại trừ nhau)

Đây là nhóm phục vụ audit, không phải đề xuất đổi tên CSS ngay.

| Nhóm | Số class | Phạm vi |
|---|---:|---|
| State modifier `is-*` | 15 | Trạng thái thêm/bớt trên component. |
| Status screen | 16 | `shin-status`, title/copy/box/KV/table/info/error/warn. |
| Slot/domain lõi | 28 | `shin-act-*`, `shin-suggest-*`, `shin-info-*`, `shin-badge-*`, `shin-empty*`. |
| Sync/FBM domain | 49 | `shin-sync-*`, cùng các class `shin-config-*` gắn với module Sync. |
| Semantic/feedback | 15 | primary, muted, error, warning, success/pass, notice, invalid/disabled, input error, save-wide. |
| Control/menu | 43 | button/input/field/label, combo/choice/toggle, popup/menu, icon/glyph/check/collapse. |
| Layout/frame/host | 35 | box/row/stack/card/section/shell/header, loading/busy/search/undo, action/pagination/preview và layout còn lại. |
| **Tổng** | **201** | 186 `shin-*` + 15 `is-*`. |

Các role semantic có thể chồng về nghĩa sử dụng (ví dụ `is-error` là state, `shin-error-message` là class semantic); vì vậy bảng trên là phân nhóm kỹ thuật loại trừ nhau, còn bảng role ở mục 3.1 là góc nhìn hành vi.

## 5. Ngoại lệ và chỗ bất thường

### 5.1 Vi phạm/đáng xử lý trước

1. Core form/status truyền literal `className` ngay trong schema (`activityForm`, `customerForm`, `noteForm`, `formHeader`, `view`, 4 status schema), trong khi Sync đã có pattern `classes` map.
2. Sync không thống nhất hình thức map: `rootClass`, `headerClass`, `navClass`, `tabClass`, `tabRowClass`, `paginationClass`, `cardClass`, `relayClass`, `toggleOnClass`... nằm rải ngoài `classes`.
3. `FBM_SYNC_RESULTS_SCHEMA` có `classes` nhưng `tabRowClass`, `tabClass`, `paginationClass` vẫn nằm ngoài map; đây là lỗi hợp đồng rõ, không chỉ khác style.
4. `FBM_SYNC_ACCOUNT_SCHEMA.identity.cardClass` và `FBM_SYNC_SETTINGS_SCHEMA.notice.relayClass` là raw class ngoài map chung.
5. `client/sync/fbmSync.html:329–330` bypass schema status và ghép chuỗi class trực tiếp khi cập nhật DOM state.
6. `client/screen/formScreen.html:105` controller core tự truyền class title tĩnh.
7. `renderTargetState` cho phép `className`, `addClass`, `removeClass` nhận chuỗi tự do; cần audit contract sau khi đã gom registry, nhưng không nên phá ngay vì đây là cổng dùng chung của Sync.

### 5.2 Ngoại lệ hợp lệ hoặc cần giữ ranh giới

- Renderer/primitive (`uiBuilder`, `renderEngine`) phải biết class HTML mà chính nó sinh ra.
- Menu/combo/popup/collapse là DOM nội bộ component; không đưa vào schema màn hình.
- Slot động (`ui/slots.html`) cần class domain riêng và đang có cặp style `style/slots.html`; có thể giữ nếu contract slot được ghi rõ.
- CSS Sync đặc thù trong `sync/fbmSyncShell.html` giữ ở module Sync; chỉ đưa role/state dùng chung về registry khi thật sự trùng nghĩa.
- `Sidebar.html` là host tĩnh được tài liệu cho phép.
- `shin-act-del` và `shin-act-edit` là hai action khác vai trò; không thay bằng selector đếm vị trí.
- `shin-sync-conflict-value-shin` và `shin-sync-conflict-value-fbm` là hai nguồn dữ liệu khác ngữ nghĩa; không gom thành `success/error` chỉ vì màu.

## 6. Rà soát component lặp

### Đã có component/helper dùng chung

- Primitive Block đã có trong `ui/uiBuilder.html`: `Box`, `Card`, `Row`, `Text`, `Field`, `Button`, `Icon`, `Check`, `StandaloneControl`.
- `Stack` và `StandaloneField` là component layout/control dùng lại.
- `Notice` đã gom tone → class ở một chỗ.
- Status có `statusSchemaText`, `statusSchemaBox`, `statusSchemaRoot`, `statusSchemaKeyValues`, `statusSchemaTable`.
- Form header dùng chung qua `UI_FORM_HEADER`.
- Slot activity có `slotActivityRow`, slot suggestion/info có helper riêng.
- Sync config có `fbmSyncConfigButton`, `fbmSyncConfigButtonRow`, `fbmSyncConfigTitleActions`; các card settings dùng layout helper chung.

### Ứng viên cần xử lý bằng refactor role/map, chưa cần tạo component nghiệp vụ mới

- Nhóm control ghi/xác nhận phải rà **toàn bộ**, không chỉ ba footer form lõi. Các nhóm đã thấy gồm:
  - Core: `saveForm` ở footer của `customerForm`, `activityForm`, `noteForm` và icon Lưu dùng chung trong `UI_FORM_HEADER`.
  - Sync account: lưu thông tin đăng nhập, lưu account settings, lưu identity; các nút này nằm ở `sync/screens/account.html` và `sync/fbmSyncSettingsScreen.html`.
  - Sync settings: lưu module, relay/rotate relay, nhịp Extension, lịch nền và chính sách đăng nhập; các nút được tạo qua `fbmSyncConfigButtonRow` ở `sync/screens/settings.html`.
  - Sync config title action: icon Lưu thay đổi sinh qua `fbmSyncConfigTitleActions` cho các card cấu hình.
  - Conflict: `saveMerge` lưu lựa chọn hợp nhất trong `sync/fbmSyncAuditScreen.html`.
  - Write approval: nút `approve` trong màn Run là chấp thuận để ghi, cần cùng audit dù nhãn không chứa chữ “Lưu”.
- Ngoài nhóm ghi/xác nhận còn có các action cùng dùng `Button` nhưng khác mục đích: `check`, `probe`, `test`, `retry`, `start`, `cancel`, `keepAllShin`, `keepAllFbm`. Chúng có thể dùng chung primitive Button, nhưng không được gộp mù vào một biến thể hiển thị “save”.
- Không nên bắt schema khai thêm `purpose: 'commit'` khi `action: 'saveForm'` đã nói lên ý nghĩa; đó là dữ liệu lặp và làm schema khó đọc.
- Schema màn hình nên giữ hành vi/dữ liệu (`action`, `label`, `target`, `disabled`, `pressed`...), không chứa class CSS và không chứa biến thể trình bày. Catalog ở lớp UI sẽ tra `action` + ngữ cảnh component để chọn appearance, rồi resolver mới đổi appearance thành class.
- Không dùng tên thuộc tính `role` cho mục đích này vì `role` đã là vai nội bộ của Block (`button`, `icon`, `field`...). Không tạo từng component theo tên nghiệp vụ như `SaveCustomerButton`, `SaveExtensionButton`, `SaveConflictButton` nếu khác biệt chỉ là nhãn, id, data và callback.
- Các nút lưu cấu hình Sync hiện đã đi qua `fbmSyncConfigButton`; phần thiếu là catalog/resolver tập trung và kiểm kê tất cả đường ghi, không phải thiếu một component nút mới cho từng màn.
- Các card settings Sync có khung Card giống nhau; `layout.card` + `cardRegion` đã đủ. Chỉ tách `ConfigCard` nếu sau audit visual chứng minh còn markup/state lặp không biểu diễn được bằng slot.
- Các dòng toggle/settings dùng `layout.toggle`, `scheduleRow`, `detailField`; đây là helper cục bộ hợp lý, chưa nên đẩy thành component toàn hệ thống vì chúng mang layout Sync đặc thù.

### Kết luận component

Có tái sử dụng, nhưng phần thiếu chính hiện tại là catalog `action`/ngữ cảnh → appearance → class và quy ước schema sạch CSS, không phải thiếu hàng loạt component. Không nên tạo component mới chỉ vì cùng nhãn, cùng màu hoặc cùng class.

## 7. Kế hoạch refactor sơ bộ để xin duyệt

1. **Đóng băng contract và kiểm kê**: chốt danh sách 201 class, các consumer và ngoại lệ; không đổi CSS/markup ở pha này.
2. **Tạo catalog/resolver ở lớp UI, không đặt trong screen schema**, ví dụ `client/ui/uiClassMap.html`: catalog action + ngữ cảnh component → appearance; appearance/state → class. Resolver trả class đã biết, không nhận HTML/CSS tự do.
3. **Bổ sung kiểm thử contract**: phát hiện raw class trong screen schema, property class ngoài map, action/ ngữ cảnh chưa có catalog, và catalog trỏ tới class không có CSS; giữ kiểm thử Block hiện có.
4. **Chuyển nhóm ít rủi ro trước**: các action dùng chung trong Sync `classes` map và `Notice`/status; giữ nguyên class kết quả nên giao diện không đổi.
5. **Chuẩn hóa core/status**: bỏ literal class khỏi schema, để Button/Notice/status helper tra catalog/resolver; giữ class layout/domain riêng ở component hoặc stylesheet tương ứng.
6. **Xử lý Sync property rải rác**: đưa `tabClass`, `tabRowClass`, `paginationClass`, `cardClass`, `relayClass`, shell/config class vào namespace `classes` có cấu trúc; cập nhật consumer cùng lượt.
7. **Loại bypass progress**: để `fbmSync.html` lấy track/fill/state từ `FBM_SYNC_STATUS_SCHEMA` hoặc resolver, không ghép chuỗi class tại controller.
8. **Audit renderer/slot/host riêng**: chỉ siết contract, không chuyển class nội bộ renderer/menu/slot/Sidebar vào screen map nếu không có lý do kiến trúc.
9. **Rà component lần cuối**: chỉ tạo component mới cho cấu trúc + hành vi lặp mà helper hiện tại không biểu diễn được; ưu tiên mở rộng `Button`, `Notice`, `ConfigCard`/layout helper thay vì tạo wrapper theo nghiệp vụ.
10. **Nghiệm thu theo pha**: chạy `node tests/run.js`, kiểm tra render/schema offline, sau đó nghiệm thu visual trên Sheet DEV; cập nhật checklist ngay sau từng mục. Không đụng dữ liệu khách thật.

## 8. Trạng thái sau nhóm migrate Sync và audit component

- `client/schema/sync/screens/*.html` và `client/schema/sync/results/*.html` hiện chỉ giữ ID vùng, nhãn, action, dữ liệu và trạng thái; không còn `className`, `rootClass`, `classes`, `*Class`, `uiSyncClass` hoặc token `shin-*`/`is-*`.
- Layout có class của Sync đã chuyển sang `client/sync/fbmSyncUiSchema.html`, thuộc lớp UI; controller đọc `FBM_SYNC_*_UI` thay vì đọc class từ schema.
- Bypass progress trong `client/sync/fbmSync.html` đã dùng `uiSyncClass`, `uiClassJoin`, `uiSyncToggleClass` và resolver selector; không còn ghép trực tiếp track/fill/state class.
- Catalog `client/ui/uiClassMap.html` hiện là nơi duy nhất ánh xạ action/component/status/Sync sang class; kiểm thử xác nhận mọi class catalog đều có CSS và các action `save`, `edit`, `start`, `approve`, `cancel`, `reloadAll`, `retry`, `deleteActivity` đều có mapping button.

## 9. Inventory component lặp trên các màn hình

Phương pháp: quét toàn bộ `client/schema`, `client/screen` và `client/sync`, sau đó đối chiếu nơi gọi primitive với nơi có hành vi/cấu trúc thật sự khác. Số lần gọi chỉ dùng để tìm ứng viên, không dùng làm lý do tự động tách component.

| Nhóm đối tượng | Nơi xuất hiện | Phần giống nhau | Quyết định |
|---|---|---|---|
| Button/action | form lõi, status retry, Sync account/run/results/settings/conflict/config | thẻ button, trạng thái disabled, label/action/data thay đổi theo nghiệp vụ | Dùng `Button`; class lấy resolver. Không tạo `SaveCustomerButton`, `SaveSettingsButton` hoặc component theo tên nghiệp vụ. |
| Nút lưu cấu hình | `fbmSyncConfigEditor.html`, account, settings, identity | cặp edit/save, hàng action, khóa cấu hình và callback khác nhau | Dùng `fbmSyncConfigButton`, `fbmSyncConfigButtonRow`, `fbmSyncConfigTitleActions`; đã gom action class về resolver. |
| Nút sửa/điều hướng | form header, titleActions, mở chính sách đăng nhập, tab/menu Sync | semantics khác nhau nhưng đều là Button/Icon với keyboard và callback chuẩn | Không tách `NavigationButton`; schema chỉ khai action/label/menu, UI chọn appearance. |
| Notice/status | core status, Sync settings/account/status/issues | tone, text, vùng cập nhật động | Dùng `Notice` và status helper; `pending/success/warning/error/info` được map tập trung. |
| Card/section | view, form, status, toàn bộ card cấu hình Sync, kết quả/audit/conflict | khung Card/Box/Stack, title và elements khác dữ liệu | Dùng `Card`, `Box`, `Stack`; layout Sync đặc thù giữ trong UI helper, chưa cần `ConfigCard` mới. |
| Field row/control | form lõi, account/settings, conflict | label/control/disabled/error khác field và dữ liệu | Dùng `Field`, `StandaloneField`, `StandaloneControl`; trạng thái invalid chỉ là data/state. |
| Toggle | settings module/background/process/login policy, shell master | control toggle, `aria-pressed`, on/off state | Dùng `StandaloneControl(kind: 'toggle')` và `uiSyncToggleClass`; chưa có cấu trúc/hành vi mới đủ để tách `Toggle` riêng. |
| Tab | results có 5 tab | Button trigger, active state, tab data | Dùng Button + `FBM_SYNC_RESULTS_UI`; chưa có consumer khác với cấu trúc/hành vi tương tự cần component mới. |
| Pagination | results log/errors | hai Button trước/sau, disabled theo trang | Đã gom trong `FBM_SYNC_RESULTS_UI.layout.pagination`; không tạo component nghiệp vụ. |
| Loading/error/empty | status progress, preflight/issues, conflict rỗng, slot empty | Block + text/tone/state | Dùng status/Notice/slot helper; class domain conflict/slot vẫn là ngoại lệ có consumer riêng. |

Kết luận inventory: có nhiều lần xuất hiện nhưng primitive/helper hiện tại đã biểu diễn đúng cấu trúc và hành vi. Không tạo component mới trong nhóm này; thay đổi cần thiết là mở rộng resolver và tách layout Sync khỏi screen schema. Nếu sau nghiệm thu visual xuất hiện markup/state lặp không biểu diễn được bằng các helper trên, chỉ tách component khi có ít nhất hai consumer cụ thể và ghi tên consumer vào checklist.

## 10. Whitelist ngoại lệ sau audit

- `uiBuilder.html` và `renderEngine.html`: class primitive do renderer tự sinh (`shin-button`, `shin-field`, `shin-input`, `shin-card`, `shin-box`, ...); đây là implementation của component, không phải screen schema.
- `menu.html`, `choiceMenu.html`, `combo.html`, `popupList.html`, `collapse.html`: class DOM nội bộ phục vụ popup/menu/keyboard/focus; không đưa vào catalog screen.
- `ui/slots.html`: class domain `shin-act-*`, `shin-suggest-*`, `shin-info-*`, `shin-badge-*`, `shin-empty*` có stylesheet và consumer slot tương ứng; không dùng thay role `primary/error/muted` chung.
- `Sidebar.html`, `selectionPoll.html`, `pendingDelete.html`: host tĩnh nằm ngoài cây Block; giữ class vì DOM được dựng một lần và có state riêng (search, undo, thiếu Extension).
- `saveFlow.html`: `shin-input-error` là state validation gắn trực tiếp vào field sau khi thu thập dữ liệu; không phải presentation token của screen schema.
- CSS inline `sync/fbmSyncShell.html` và `sync/screens/settings.html`: CSS domain Sync đặc thù; class được catalog/UI helper tiêu thụ, không khai trong schema.
- `shin-sync-conflict-value-shin`/`shin-sync-conflict-value-fbm` giữ riêng vì thể hiện hai nguồn dữ liệu; `shin-act-del`/`shin-act-edit` giữ riêng vì hành vi khác nhau.

Đã hoàn tất các nhóm offline theo checklist `Checklist refactor UI schema sạch CSS.md`; `node tests/run.js` đạt 1674, lỗi 0. Giao diện form, view, status và các màn Sync đã được chủ dự án nghiệm thu trên Sheet DEV deployment revision `@433`.
