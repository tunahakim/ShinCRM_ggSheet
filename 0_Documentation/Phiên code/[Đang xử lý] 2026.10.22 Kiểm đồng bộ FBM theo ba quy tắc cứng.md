# Kiểm đồng bộ FBM theo ba quy tắc cứng

Branch `feature/fbm-audit`. Chặng 3a chỉ đọc, lập bản đồ và trình phương án; không sửa code. Chặng 3b sửa sau khi chủ dự án chốt phương án.

## Bối cảnh và việc gộp vào (chuyển từ Todo mục 3)

- Bối cảnh (chủ dự án 2026-10-21): code `fbm_sync` do phiên AI cũ viết, nghi vi phạm nặng "một việc một công cụ", "người điều phối gọi công cụ, công cụ trao nhau bằng dữ liệu", "tiến trình lớn ghép từ tiến trình nhỏ". Nút "Đăng nhập thử" lẽ ra chỉ khởi chạy đúng tiến trình đăng nhập tự động, nghi đang có hai luồng.
- Bằng chứng gặp thật 2026-10-21 (Sheet DEV mới): đăng nhập thử thành công nhưng Sidebar báo "Đăng nhập thử không thành công: Preflight thất bại: Phạm vi đồng bộ ... còn trống". Log: lượt nền "Quét nhanh" chạy 21:56:37–40 xen giữa lượt đăng nhập thử (kết thúc 21:56:43). Gốc: đăng nhập thử và lượt đồng bộ dùng chung một ô state (`FbmSync.stateRead/stateWrite`); `FbmSync.loginTestRequest` chỉ kiểm "đang có lượt chạy" lúc bắt đầu, lượt nền vẫn vào được giữa chừng và ghi đè state, bước sau của đăng nhập thử (`FbmSync.continue`) đọc state của lượt nền nên trả lỗi preflight của lượt nền. Đăng nhập thử và tự đăng nhập dùng chung các bước (`loginAdapterContinue`, `loginAuthorizeContinue`, `loginIdentityContinue`) nhưng rẽ nhánh theo cờ `testOnly`/`purpose`/`manual` rải trong từng bước, tức quyết định của người điều phối nằm trong công cụ.
- Cách làm đề xuất: đọc trọn (không sửa) từng tiến trình của `fbm_sync` và phía Sidebar `client/sync/`, lập bản đồ tiến trình – công cụ – nơi sở hữu state, liệt kê vi phạm kèm mức nặng, rồi mới trình phương án sửa theo ba phần. Một ô state duy nhất cho mọi lượt là chỗ phải xét đầu tiên.
- Lý do sau mục 1 và 2 (chủ dự án chốt 2026-10-21): sửa đồng bộ FBM thì dùng luôn cổng thông báo và bảng khai cài đặt đã có, không phải tự viết hàm báo lỗi hay đọc cài đặt riêng rồi làm lại. Lý do trước mục 4: UI mới vẽ các màn đồng bộ FBM trên hợp đồng đã sạch. Lỗi đăng nhập thử bị lượt nền ghi đè chỉ gặp trên DEV nên chờ tới mục này.
- Gộp vào đây phần lõi của "một máy chạy đồng bộ nền" (V24). Chủ dự án chốt 2026-10-21: chốt cùng phiên FBM, vì đây là việc ai được chạy lượt nền, cùng gốc với một ô state cho mọi lượt; phần màn chọn máy làm ở mục 4.
  - Bối cảnh (2026-10-21, từ V24 của `[Đã xử lý] 2026.10.14 Vi phạm luật thao tác đắt.md`): mỗi máy có Extension và đã từng mở Sidebar đều tự hỏi GAS 5 phút một lần, kể cả khi công tắc tắt. Ba máy là ba dòng hỏi (khoảng 864 lần/ngày, phần lớn nhận "không có việc"). Dữ liệu không chạy trùng nhờ khóa và lịch đến hạn của GAS, nhưng GAS giao việc cho máy hỏi trước, có thể là máy không mở tab FBM hoặc không còn phiên đăng nhập (cookie FBM nằm trong trình duyệt từng máy). Cho Extension tự dừng khi công tắc tắt thì bật lại ở máy khác sẽ không tới được máy đó, đồng bộ nền âm thầm đứng im.
  - Thiết kế đề xuất (chủ dự án đồng ý hướng 2026-10-21, chưa chốt chi tiết):
    - Mỗi Extension tự tạo một mã máy ngẫu nhiên khi cài; GAS là nơi duy nhất ghi máy chạy nền (mã máy, tên máy, lúc giao, lần hỏi cuối).
    - Chủ dự án chọn máy, không để máy tự giành quyền (tự giành thì các máy khác vẫn phải hỏi để phát hiện máy chính tắt, và có thể giành về máy không mở FBM). Máy không được giao hỏi GAS thì nhận lệnh dừng nhịp; Extension chỉ làm theo lệnh GAS.
    - Công tắc tổng và công tắc nền không làm máy chạy nền ngừng hỏi, để bật lại từ máy nào cũng có hiệu lực ở nhịp kế tiếp.
    - Máy chạy nền im lặng quá số nhịp đặt trong cấu hình thì Sidebar mọi máy báo lỗi và ghi Log, không tự chuyển.
    - Gửi cấu hình liên quan Extension (chọn máy, bật nhịp) phải nhận được xác nhận của Extension; chưa xác nhận thì báo lỗi.
- Chuyển cài đặt FBM về cổng cài đặt dùng chung của mục 2 (chủ dự án đồng ý 2026-10-22): `FBM_SYNC_SETTINGS_V1`, `FBM_ACCOUNT_SETTINGS_V1`, cài đặt đăng nhập và Extension hiện có hàm đọc, kiểm, lưu viết riêng trong `fbm_sync/state/`; khai chúng thành các phần cài đặt của module FBM và bỏ các hàm riêng. Ngầm định khi kéo khách từ FBM (giá trị "Xác thực", giá trị mặc định của ô "Cho phép đồng bộ FBM" đang là cờ `pullDefault` trong `FBM_SYNC_PERMISSION_OPTIONS`) gom vào bảng ngầm định của phần cài đặt FBM, cùng kiểu với ngầm định khi nhập trên Sidebar.
- Lỗi gặp thật 2026-10-22 trên Sheet DEV mới, gộp vào chặng 3 (chủ dự án chốt 2026-10-22):
  - Extension gặp HTTP 404 từ Web App relay (Google chập chờn, trang "không thể mở tệp tại thời điểm này", tự hết sau vài phút) thì chỉ lưu `fbmRelayLastStatus` trong `chrome.storage`, dừng lượt, không thử lại, không ghi hộp đen (`2_ShinCRM_Extension/background/service_worker.js`, `postRelay` mã `RELAY_ENDPOINT_NOT_FOUND`, `fbmHeartbeatNow` dừng ở `blocked_gas_request`). GAS chỉ biết qua dòng "quá hạn chờ" 4–6 phút sau với hộp đen cũ 25 phút. Hướng đã bàn: ghi lỗi vào hộp đen qua `noteChainStep` để lần gọi được GAS kế tiếp mang lên Log, và thử lại có giãn cách trong người điều phối chuỗi.
  - Lượt ghi nền dừng ở `awaiting_approval` không bao giờ được thu hồi (`FbmSync.recoverStaleRun` chỉ thu hồi phase chạy) và không có thông báo nào, nên đồng bộ nền đứng im tới khi người dùng tự mở màn đồng bộ. Cần: thông báo qua cổng thông báo khi chờ chấp thuận (Sidebar hiện ở khung mới của mục 4), và quyết định lượt chờ duyệt quá hạn thì làm gì.
  - Ngưỡng chấp thuận DEV bị lưu là 0 do hàm chuyển Config cũ của `SyncSettings.js` đổi ô trống thành 0 (`Number('') === 0`); hàm đó đã xóa ở phiên lõi cài đặt và DEV đã đặt lại 10. Khi chuyển cài đặt FBM sang cổng chung thì kiểu `number` coi ô trống là chưa đặt. `FbmSync.approvalThreshold` (`fbm_sync/schema/FbmFields.js`) còn `catch (ignore)` che lỗi đọc cài đặt.
- Chia hai chặng: 3a chỉ đọc, lập bản đồ và trình phương án; 3b sửa sau khi chủ dự án chốt phương án.

## Checklist chặng 3a

- [x] Đọc `Quy tắc theo loại phiên/Đồng bộ FBM.md`, mục lục 09, các chuyên đề 09 liên quan, `Câu hỏi đêm.md`.
- [x] Đọc trọn các tiến trình GAS `fbm_sync` (người điều phối và công cụ nó gọi): đăng nhập thử, tự đăng nhập, lượt đồng bộ (quét, preflight, áp, đối soát), lượt nền, hủy/thu hồi.
- [x] Đọc trọn phía Sidebar `client/sync/` và Extension phía FBM (`service_worker.js`, chuỗi nền, `postRelay`).
- [x] Lập bản đồ tiến trình – công cụ – nơi sở hữu state (ghi vào mục "Bản đồ" của tệp này).
- [x] Liệt kê vi phạm ba quy tắc cứng kèm mức nặng (ghi vào mục "Vi phạm").
- [ ] Trình phương án ba phần (a) gốc lỗi, (b) công cụ dùng lại, (c) bảng đối chiếu quy tắc cứng cho từng nhóm vi phạm, gồm cả bốn lỗi gặp thật 2026-10-22 và việc chuyển cài đặt FBM về cổng chung.

## Bản đồ

Đường dẫn GAS tính từ `1_ShinCRM_GAS/fbm_sync/`; Sidebar là `1_ShinCRM_GAS/client/sync/`; Extension là `2_ShinCRM_Extension/`.

### Nơi giữ state

| State | Nơi giữ | Ai ghi |
|---|---|---|
| Lượt đang chạy: runId, phase, cursor, session (cookie, lookups, danh tính đã xác minh), counts, metadata | Một khóa `FBM_SYNC_STATE_V1` (`state/State.js`) | Dùng chung cho lượt tay, lượt nền, Giữ phiên, đếm khách, đăng nhập thử, hủy phiên cũ, dò/kiểm liên kết. Khoảng 27 chỗ `stateWrite`, 22 chỗ `stateRead` ngoài `State.js`/`PullFlow.js` |
| Kho phụ theo lượt: chờ xác nhận đẩy, lỗi đẩy, danh sách đẩy, dấu đẩy sạch, tập "đã thấy", danh sách đọc, mốc đếm khách, trace | Các khóa riêng trong DocumentProperties | Mỗi kho có hàm riêng; vài chỗ ghi `props()` thẳng (`Identity.js`, `CustomerCount.js`, `ActivityLayers.js`, `Trace.js`) |
| Cài đặt: phiên (`FBM_SYNC_SETTINGS_V1`), tài khoản (`FBM_ACCOUNT_SETTINGS_V1`), đăng nhập, Extension, lịch nền, công tắc tổng/nền, liên kết danh tính | Mỗi loại một khóa và một bộ đọc/kiểm/lưu riêng | Ngầm định kéo FBM (`defaults_fbm_pull`) đã ở cổng cài đặt chung; cờ `pullDefault` còn trong `FBM_SYNC_PERMISSION_OPTIONS` |
| Lịch nền: mốc đến hạn và thử lại từng tiến trình | `state/Scheduler.js` | `scheduleMarkDone`/`scheduleMarkFailed` |
| Bản sao ở Sidebar: `mode`, `pack`, `running`, `cancelRequested`, `ownRunId`, `lastStatus` (bị sửa tại chỗ), `identityStatus`/`loginStatus`/`syncSettings` (tự ghép) | RAM `FBM_SYNC_CLIENT` | Sidebar |
| Extension: cấu hình relay, kho credential, hộp đen một ô `fbmChainTrail`, `scanJob` trong RAM tab FBM, mốc giãn cách, lệnh dừng | `chrome.storage`, RAM worker, RAM tab | Extension |

### Tiến trình và người điều phối

- Khóa: `withOrchestrationLock` + `withPropertyBuffer`. Đi qua khóa: mọi lệnh của `controlDispatchLocked` (start, continue, approve_push, cancel, reset_state, retry_push_failures, set_master_switch, set_background_switch, identity_status, save_identity_binding, save_connection, xung đột, transport_failure). **Không qua khóa**: `fbmStartLoginTest`, `fbmStartForceLogin`, `fbmLoginTestResult` (gọi thẳng `loginTestRequest`/`loginForceRequest`/`continue`), `fbmSaveLoginPolicy`, `fbmRepairLoginUsername`, `fbmSetAutoLogin`, `fbmSaveAccountSettings`, `fbmSaveExtensionConfig`, `fbmSaveBackgroundSchedule`, phần lưu của `fbmSaveSyncSettings`.
- Lượt tay: Sidebar `fbmSyncRun` → `fbmStartSync` → `controlDispatchLocked('start')` → `runSlice` → `startRun` (nối lại cursor, `stateStart`, `preflightGates`/`preflightApply`, chọn cursor đầu) → `nextEnvelope`. Vòng `fbmSyncLoop`: chuyển request sang Extension → `fbmContinueSync` → `FbmSync.continue` → `continueStep` (switch theo `cursor.kind`, gồm cả cổng phiên) → công cụ từng chặng (quét khách `customerScanChunk`, lớp giao dịch `ActivityScan`/`ActivityBatch.gateReadContinue`, `pullRecords`/`pullWrite`, đối soát, `pushStageBegin`/`nextPushRequest`/`continuePush`/`markPushResult`) → `nextEnvelope`.
- Cổng phát request: `nextEnvelope` (`transport/TransportCore.js`) vừa kiểm công tắc tổng rồi ghi paused, vừa kiểm ngân sách, dừng chờ, cấp token đăng nhập thử theo `cursor.purpose`, đổi sang probe khi phiên chưa xác minh, gọi `sessionGateStart` khi phiên hết hạn, kiểm endpoint, cấp id, ghi `activeRequestId`/hạn.
- Cổng phiên và tự đăng nhập: `sessionGateStart` → `sessionGateProbeRequest` → `sessionGateHandleProbeFailure`/`sessionGateHandleFailure`/`sessionGateTransportRetry` → `beginAutoLogin` → `loginAdapterContinue` → `loginAuthorizeContinue` → `loginIdentityContinue` → `loginResumeRequest`. Đăng nhập thử và hủy phiên cũ dùng lại các bước này nhưng ghi cursor `{kind:'login', testOnly, purpose, expectedIdentity}` vào chính ô state của lượt đồng bộ; mỗi bước tự rẽ theo `testOnly`/`purpose`/`manual`. Sidebar chạy bằng vòng riêng `fbmSyncLoginTestLoop`.
- Lượt nền: alarm `gas_poll` → `fbmHeartbeatNow` → `doPost` → `fbmSyncRelayHandle` → `fbmSyncHeartbeatRequest`/`fbmSyncHeartbeat`/`fbmSyncHeartbeatLocked` → `schedulerPickDue` (chỉ từ chối khi `runInProgress`, nên `paused` không chặn) → `chainStart`/`keepaliveStart`/`recountStart` → `relayRun` đệ quy; mỗi hop `chainAdvance`, cuối chuỗi `chainTail`. `fbmSyncHeartbeatLocked` và `FbmSync.continue` cũng có nhánh nối chuỗi riêng.
- Chấp thuận: `preflightApply` đặt `awaiting_approval` khi số bản ghi ≥ `approvalThreshold()`; `runInProgress` coi phase này là đang chạy nên chặn mọi lượt nền; `recoverStaleRun` không thu hồi; duyệt bằng `fbmApprovePush` → `approve_push`.
- Thu hồi: `recoverStaleRun` (gọi từ `fbmSyncStatusRead` và lượt nền) chỉ thu hồi ACTIVE_PHASES; `stateFailRun` có tính `awaiting_approval`; `runLeftOpenClose`.
- Extension: `relayRun` là người điều phối chuỗi nền (`prepareFbmTab` → `sendToFbmTab` → nộp GAS → lỗi thì `reportFailure`); đường Sidebar (`FBM_EXECUTE_REQUEST`) chạy `prepareFbmTab` → `sendToFbmTab` bằng bộ nối riêng; `executor.js` chạy luồng login FBM, cắt gói quét và fetch.

## Vi phạm

Mức: **Nặng** = có thể sai dữ liệu, ghi đè âm thầm, ghi FBM sai hoặc đã gặp thật; **Vừa** = sai kiến trúc dễ thành lỗi khi sửa tiếp; **Nhẹ** = gọn lại khi tiện.

### N1. Một ô state cho mọi lượt, đăng nhập thử đi ngoài khóa — Nặng (đã gặp thật 2026-10-21)
- Đăng nhập thử, hủy phiên cũ, Giữ phiên, đếm khách, dò liên kết, lượt tay, lượt nền ghi chung `FBM_SYNC_STATE_V1`. `loginTestRequest` kiểm "đang chạy" một lần rồi ghi đè ô, không cầm khóa; lượt nền chen vào giữa, bước sau đọc state lượt nền.
- Sidebar có hai vòng (`fbmSyncLoop`, `fbmSyncLoginTestLoop`); vòng đăng nhập thử không đặt `running`, không kiểm Extension/nền, nút Dừng không hủy được, lỗi thì state kẹt `checking_session`. `fbmSyncTestLogin` báo "thành công" khi vòng hết request mà không đọc kết luận của GAS.
- `fbmSyncForceLogin` tự xếp "đăng nhập rồi chạy lại" ở Sidebar.

### N2. Quyết định của người điều phối nằm trong công cụ — Nặng
- `nextEnvelope` gộp kiểm, quyết và ghi state (mục Bản đồ).
- `continueStep` là switch khổng lồ trộn cổng phiên với nghiệp vụ; gọi `continueSessionGate` ở hai chỗ.
- Các bước login rẽ theo `testOnly`/`purpose`/`manual`; `authContinue` rẽ theo `scan`; `loginIdentityContinue` tự tắt tự đăng nhập khi lệch.
- `scanJobAccept`, `gateOpen`/`gateNextBatch`/`gateLookupContinue`/`gateReadContinue`, `customerCountContinue`, `runTail` tự dựng `nextEnvelope` + `statusView` bên trong.

### N3. Công cụ tự đọc/ghi state thay vì nhận và trả dữ liệu — Nặng
- **Lỗi thật đã xác nhận khi đọc**: `pullRecords` (`transport/PullFlow.js:98`) đọc state, gọi `pullWrite`; `pullWrite` (`reconcile/Pull.js:56`) tự đọc bản khác, ghi `metadata.identityBlocks` rồi `stateWrite`; `pullRecords` ghi lại bản cũ ở dòng 118. `stateWrite` thay cả khối `metadata`, nên `identityBlocks` mất. `gateReadContinue` phải đọc lại và vá tay là dấu vết của lỗi này.
- `scriptSettings` (`read/GridRead.js:8`) tự `stateRead`; mọi hàm dựng request (gồm `formEnvelope`, `activityValues` điền `owner`) dựa vào "phiên chắc đã xác minh". Chiều ghi có chặn ở `pushConfigErrors` (`PushFlow.js:350`) nhưng `pushOwnerError` (`PushCandidates.js:131`) trả rỗng khi thiếu tên.
- `markPushResult` tự `stateRead`, `continuePush` đọc lại; `recordChange`, `pushCandidates`, `pushReviewContext`, `preflightCandidates`, `preflightVerifyStatus`, `recordIssuesFlush`, `traceContext`, `conflictFail`, `conflictRefreshRead`, `lookupBatchApply`, `customerScanMark`, `activityBulkAccept/End` tự đọc state, kho hoặc Sheet.
- `stateWrite` có hiệu ứng phụ (đóng bước nghiệp vụ, ghi Log `request_unanswered`).
- `pendingPushClear` chạy sau khi đã ghi Sheet; lỗi giữa chừng thì baseline đổi mà chờ xác nhận còn. `gateReadContinue` ghi nhiều kho rời nhau, không nguyên tử.

### N4. Nhiều người điều phối nối chuỗi nền, chưa có "một máy chạy nền" — Vừa
- Nối chuỗi ở `fbmSyncHeartbeatRequest`, `fbmSyncHeartbeatLocked`, `chainAdvance`/`chainTail`, nhánh heartbeat trong `FbmSync.continue`.
- GAS giao việc cho máy hỏi trước (V24).

### N5. Cài đặt FBM có bộ đọc/lưu riêng và nhiều cửa cho một công tắc — Vừa
- Năm bộ đọc/kiểm/lưu riêng (`SyncSettings.js`, `AccountSettings.js`, login config trong `AutoLogin.js` ghi `props().setProperty` ở nhiều hàm, extension config và lịch nền trong `Scheduler.js`), đều ngoài khóa.
- Công tắc tổng có 2 cửa (`fbmSetMasterSwitch`, tham số của `fbmSaveSyncSettings`); tự đăng nhập 2 cửa (`fbmSetAutoLogin`, `fbmSaveLoginPolicy`); liên kết danh tính 3 cửa (`fbmSaveIdentityBinding` ×2 ở Sidebar, `fbmSaveConnection`); công tắc nền 2 cửa.
- `setMasterEnabled` tự ghi state paused.
- Cờ `pullDefault` trong `FBM_SYNC_PERMISSION_OPTIONS` là ngầm định nằm ngoài bảng ngầm định.

### N6. Lỗi im lặng — Nặng ở GAS chiều ghi, Vừa ở chỗ khác
- `catch` rỗng: `FbmSync.approvalThreshold` (`schema/FbmFields.js:394`, lỗi đọc cài đặt thành ngưỡng 10), `sessionGateToken`, `documentPropertySet` (`ignoreBytes`), `traceContext`, `traceResponse`, `httpErrorMessage`, `fbmTraceContinue` (`server/service/FbmSyncService.js`).
- Mở cửa khi thiếu hàm: `readCategoryGate` trả gate rỗng; `Pull.js:139` coi mọi mã danh mục là hợp lệ khi thiếu `validateIncomingCategories`; `typeof logEvent === 'function'` khắp nơi.
- Extension: 404/không phải JSON/sai khóa chỉ ghi `fbmRelayLastStatus`; `fbmHeartbeatNow` ghi đè mã thật bằng `HEARTBEAT_FAILED`/`HEARTBEAT_REQUEST_NOT_READY`; `relayRun` coi `{ok:false}` khi nộp kết quả là "trả lời GAS" nên bỏ kết quả FBM đã lấy; alarm chỉ `console.warn`; `noteChainStep`/`noteRelayStatus` có `catch (ignore)`; hộp đen một ô bị ghi đè.
- Sidebar: `callServer('fbmCancelSync').catch(→null)` ở ba chỗ, `fbmSyncLogClientError` trả null, `catch (ignore)`, sửa tên đăng nhập lỗi chỉ đặt cờ.

### N7. Lượt chờ chấp thuận đứng im mãi — Nặng (đã gặp thật 2026-10-22)
- `awaiting_approval` tính là đang chạy nên chặn mọi lượt nền, nhưng `recoverStaleRun` không thu hồi và không có thông báo.

### N8. Sidebar tự quyết nghiệp vụ và giữ bản sao state — Vừa
- Quyết PA1/PA2/PA3 xung đột và tự gửi `fbmValues`/`shinValues`, tự sửa DTO xung đột; tự dựng pipeline từ phase; danh sách phase "đang chạy" chép 5 lần (cộng `FbmSync.PHASES` ở GAS thiếu `awaiting_approval`/`waiting_session`); tự đánh giá probe đủ/thiếu; dựng status giả; biến lỗi cũ thành "Sẵn sàng".
- Chính sách thử lại theo regex chữ lỗi, quyết có hủy lượt hay không, định nghĩa "nền rảnh", hằng số 120 giây/30 phút trong code.
- Xóa credential ở Extension trước rồi GAS, thử lại một lần; tự sửa tên đăng nhập ở GAS khi mở màn; tự suy `mode` credential.
- Đọc thẳng hình dạng state nội bộ: `cursor.kind`, `cursor.operation`, `metadata.*`.

### N9. Extension làm nghiệp vụ và có hai đường gọi GAS — Vừa
- `prepareFbmTab` tự tải lại tab; `executeBatch` tự quyết điểm dừng lô; worker biết `kind` (`scan_chunk`, `login`); `executeLogin` chạy cả luồng login FBM; `scanJob` giữ trạng thái công việc trong RAM tab.
- `fbmHeartbeatNow` và closure `post` của `relayRun` là hai đường gọi GAS xử lý lỗi khác nhau; đường Sidebar có bộ nối `prepareFbmTab` → `sendToFbmTab` riêng; `postRelay` vừa fetch vừa phân loại vừa ghi chẩn đoán.
- `iframe_bridge.js` năm khối kiểm origin/nonce gần giống nhau, `CRM_FBM_CANCEL` không kiểm `event.source`.

### N10. Một việc làm ở nhiều chỗ trong công cụ GAS — Vừa
- Hash dòng FBM tính ở 6 chỗ trên hai hình dạng (dòng thô và record), khớp nhờ quy ước ngầm của `canonical`.
- Hai định nghĩa "cần đẩy" (`pushReview` và `preflightPushPermissions`) loại khác tập.
- Gate danh mục dựng ba đường; cache gắn lên object state bằng `defineProperty` mất khi đọc lại state.
- `activityBatchMismatch` và `scanJobMismatch` gần giống hệt; bốn chỗ tự gán `phase='error'` thay vì một công cụ đặt lỗi.
- Ngày Việt Nam chuẩn hóa ba chỗ với hai nguồn múi giờ (`Fingerprint.js:32` cứng `Asia/Ho_Chi_Minh`, `GridRead.js:167` theo múi giờ script).
- `threeWay` hai chế độ, tự hash baseline thì bỏ `categoryGate`.

### N11. "Dừng đồng bộ nền" phụ thuộc response kế tiếp, Sidebar chờ sai điều kiện — Nặng (gặp thật 2026-10-23)
- `stopBackground` (`transport/PullFlow.js:14`) chỉ đặt `manualPending`; lượt nền chỉ dừng khi response kế tiếp về (`continueStep`). Chuỗi nền đã đứt (Extension nộp kết quả hỏng, hộp đen `gas_reply_failed`) thì không response nào về, lượt chỉ được thu hồi khi quá hạn 3–5 phút (`SYNC_STALE_RUN`).
- `fbmSyncWaitForBackgroundIdle` (`client/sync/fbmSync.html`) chờ `phase === 'idle' && !runId` trong 120 giây; lượt bị thu hồi có phase `error`, nên dù nền đã nhả Sidebar vẫn không chạy lệnh gốc và báo "Đồng bộ nền chưa xong trong thời gian chờ".
- Log DEV 2026-10-23: chuỗi nền đứt ở 08:42, 09:17, 09:22, 09:36 với hộp đen `gas_reply_failed` (Extension không nộp được kết quả cho Web App relay), hai lần bấm tay lúc 09:22:37 và 09:36:48 đều báo lỗi trên.

## Phương án đề xuất (chờ chủ dự án chốt)

Ký hiệu cho bảng (c): **R1** lỗi không có đường xảy ra; **R2** một việc một công cụ; **R3** người điều phối gọi công cụ, công cụ trao nhau bằng dữ liệu; **R4** tiến trình lớn ghép từ tiến trình nhỏ.

### P1. Một cửa cho mọi lượt, tiến trình đăng nhập có người điều phối riêng (N1, phần login của N2)
- (a) Gốc: ô state là tài nguyên độc quyền (một tab FBM, một phiên cookie) nhưng không có một cửa duy nhất cấp quyền dùng ô: đăng nhập thử và hủy phiên cũ đi đường riêng ngoài khóa, kiểm "đang chạy" và ghi ô ở hai lần khác nhau. Mục đích lượt (thử, ép, tự đăng nhập giữa lượt) không do người điều phối giữ mà rải vào từng bước dưới dạng cờ.
- (b) Dùng lại: `controlDispatchLocked` + `runSlice` + `stateStart` (đã kiểm và ghi trong cùng một lần cầm khóa cho lượt đồng bộ); vòng `fbmSyncLoop` ở Sidebar; các bước `loginAdapterContinue`/`loginAuthorizeContinue`/`loginIdentityContinue` giữ phần làm việc, bỏ phần rẽ nhánh. Giữ **một ô state** và quy tắc một lượt tại một thời điểm (không tách ô: hai lượt song song vẫn tranh cùng tab và cookie). Đăng nhập thử và hủy phiên cũ thành lệnh `start` với loại lượt `login_test`/`login_force`; tiến trình đăng nhập có một người điều phối `loginRun` nhận "làm gì sau khi đăng nhập xong" lúc khởi chạy (kết thúc lượt / nối lại cursor đang chờ / khởi chạy lượt đồng bộ) và ghi vào cursor; các bước chỉ trả dữ liệu `{ok, identity, code}`. GAS trả kết luận lượt (`result.ok`, mã, lời) để Sidebar hiện; Sidebar bỏ `fbmSyncLoginTestLoop` và bỏ việc tự nối "đăng nhập rồi chạy".
- (c) R1: bịt bằng kiến trúc đường "lượt khác ghi đè giữa chừng" (mọi lượt chỉ vào ô qua `stateStart` trong khóa, `runInProgress` từ chối lượt thứ hai) và đường "bước sau đọc nhầm lượt" (cursor mang runId, `continue` đối chiếu runId); không còn phép kiểm nào thay. R2: một cửa khởi chạy, một vòng Sidebar. R3: bước login là công cụ trả dữ liệu, chỉ `loginRun` quyết. R4: lượt đồng bộ gặp phiên hết hạn gọi `loginRun` như một công cụ, đăng nhập thử cũng gọi đúng `loginRun`.

### P2. Tách cổng request và bảng điều phối chặng (N2, N4 phần GAS, lõi V24)
- (a) Gốc: `nextEnvelope` vừa là cổng phát vừa là người quyết (công tắc, ngân sách, dừng, phiên); `continueStep` là một switch ôm mọi chặng và cổng phiên; nối chuỗi nền viết ở bốn chỗ.
- (b) Dùng lại: `nextEnvelope` giữ đúng việc dựng envelope, cấp id, ghi request đang chờ; các phép kiểm công tắc/ngân sách/dừng gom thành một công cụ kiểm thuần trả quyết định, `runSlice` gọi trước; cổng phiên (`sessionGate*`) thành một tiến trình nhỏ gọi từ `runSlice` khi response báo hết phiên. `continueStep` đổi thành bảng `cursor.kind → hàm điều phối chặng`. Một hàm nối chuỗi nền duy nhất cho heartbeat, `chainAdvance`, `chainTail`, nhánh heartbeat của `continue`. Lõi V24: kho "máy chạy nền" trong GAS (mã máy, tên, lúc giao, lần hỏi cuối); `fbmSyncHeartbeatRequest` nhận mã máy và trả lệnh dừng nhịp cho máy không được giao; màn chọn máy ở mục 4.
- (c) R1: bịt đường "chặng quên kiểm công tắc/ngân sách" (kiểm nằm ở người điều phối, chặng không tự phát request) và đường "hai máy nhận việc" (chỉ máy được giao nhận request). Còn phép kiểm: máy được giao im lặng quá số nhịp thì báo lỗi, vì GAS không chủ động gọi được Extension. R2: một cổng phát, một hàm nối chuỗi. R3: chặng trả request mong muốn, người điều phối phát. R4: `runSlice` gọi tiến trình cổng phiên và tiến trình chặng.

### P3. State là dữ liệu truyền qua công cụ (N3, phần đặt lỗi của N10)
- (a) Gốc: không có hợp đồng "người điều phối đọc state một lần, công cụ nhận và trả"; công cụ tự `stateRead`/`stateWrite`, nên hai bản state cùng sống trong một lời gọi và bản ghi sau đè bản trước (lỗi `identityBlocks` đã xác nhận).
- (b) Dùng lại: `runSlice` đã cầm khóa và kho đã ghi gộp (`withPropertyBuffer`). Quy ước: `runSlice` đọc state một lần, truyền vào chặng; công cụ chỉ trả kết quả (patch, số đếm, vấn đề); `runSlice` ghi một lần. `scriptSettings(state)` nhận state qua tham số. `stateWrite` thành công cụ ghi thuần, hiệu ứng phụ (đóng bước, Log request chưa trả lời) chuyển lên người điều phối. Một công cụ `runFail(state, code, message)` thay bốn chỗ gán tay và hai hàm mismatch. `pendingPushClear` đi cùng lần ghi kho cuối, sau khi `recordChange` trả đạt.
- (c) R1: bịt đường "hai bản state đè nhau" (công cụ không còn gọi `stateRead`/`stateWrite`; test tĩnh chặn hai hàm này ngoài danh sách người điều phối). Còn phép kiểm: ghi Sheet rồi ghi kho không nguyên tử được vì là hai kho khác nhau; giữ thiết kế "ghi lại idempotent" và test nhánh lỗi giữa chừng. R2: một công cụ đặt lỗi. R3: đúng định nghĩa quy tắc. R4: không đổi.

### P4. Cài đặt FBM về cổng cài đặt chung, một cửa cho mỗi công tắc (N5, lỗi ngưỡng)
- (a) Gốc: năm kho cài đặt FBM có bộ đọc/kiểm/lưu riêng, ghi ngoài khóa; một công tắc có nhiều cửa; trạng thái lần thử đăng nhập lẫn với cài đặt.
- (b) Dùng lại: cổng `settingsSave`/`settingsValue`/`settingsDefaultsChecked` và bảng khai phần `fbmSettingsSections`. Khai các phần `fbm_sync`, `fbm_account`, `fbm_login` (bật/tắt, chính sách, tên đăng nhập), `fbm_extension`, `fbm_background`. Cổng cần thêm: kiểu `boolean`, `codeList`, `number` có khoảng giá trị (ô trống là chưa đặt, không thành 0), và một hàm kiểm cả phần thuần (khai trong phần) cho ràng buộc giữa các trường (khoảng nghỉ min ≤ max, tiền tố đi cùng độ dài). Đổi mã khách chỉ định ra khách (đọc Sheet) là bước của người điều phối lưu phần `fbm_sync`, truyền kết quả vào hàm kiểm. Trạng thái lần thử đăng nhập và credential ref chuyển sang kho state riêng. Cờ `pullDefault` thành trường `syncPermission` trong `defaults_fbm_pull`. Mỗi công tắc một lệnh của `controlDispatchLocked`. `approvalThreshold` đọc qua `settingsValue`, bỏ `catch`. Hàm chuyển một lần từ khóa cũ sang khóa `SETTINGS:` theo mẫu `settingsMigrateFromConfig`.
- (c) R1: bịt đường "ô trống thành 0" và "lưu giá trị chưa kiểm" (chỉ `settingsWrite` ghi, chỉ sau `settingsValidate`); đường "hai cửa đặt công tắc lệch nhau" mất vì chỉ còn một cửa. R2: một cổng cài đặt. R3: hàm kiểm cả phần thuần, người điều phối đọc Sheet rồi truyền vào. R4: lưu cài đặt FBM gọi người điều phối `settingsSave`.

### P5. Không còn lỗi im lặng, Extension một cổng gọi GAS (N6, lỗi 404, phần gọi GAS của N9)
- (a) Gốc: Extension thiếu một cổng gọi GAS (hai đường xử lý lỗi khác nhau); các `catch` rỗng và nhánh `typeof ... === 'function'` là phép kiểm phòng thứ tự nạp không còn cần (GAS nạp mọi tệp trước khi chạy).
- (b) Dùng lại: `relayRun` làm người điều phối duy nhất; gom `fbmHeartbeatNow` và closure `post` thành một hàm gọi GAS nhận cả hai kiểu lỗi, ghi `noteChainStep` một lần với kind, requestId, hop, mã thật, `httpStatus`; `postRelay` chỉ fetch và trả kết quả. Hộp đen thêm ô "lỗi relay gần nhất" không bị bước sau đè, `heartbeat_request` kế tiếp mang lên Log. Thử lại có giãn cách chỉ khi nộp kết quả có request đang chờ ở GAS; số lần và khoảng nghỉ do GAS cấp trong envelope (như `meta.requestGap`), nằm trong hạn `gasReplyMs`. GAS bỏ `catch` rỗng và nhánh `typeof`, dùng `logEvent`/`noticeRaise` sẵn có; Sidebar bỏ `.catch` trả null.
- (c) R1: bịt đường "kết quả FBM bị bỏ vì nộp hỏng mà không ai biết" (một cổng, mọi lỗi đi một đường ghi hộp đen). Còn phép kiểm: 404 xảy ra khi GAS chưa chạy nên chỉ báo trễ ở lần gọi được kế tiếp; Extension không ghi được Sheet `Log`. R2: một cổng gọi GAS. R3: `postRelay` không tự ghi chẩn đoán. R4: đường Sidebar dùng cùng hàm chuẩn bị tab và gửi tab.

### P6. Lượt chờ chấp thuận có hạn và có thông báo (N7)
- (a) Gốc: `awaiting_approval` tính là đang chạy (chặn mọi lượt nền, kể cả Giữ phiên) nhưng nằm ngoài danh sách thu hồi và không phát thông báo.
- (b) Dùng lại: `preflightApply` gọi `noticeRaise` (topic chờ chấp thuận) khi đặt phase; `recoverStaleRun` thêm luật hạn chờ duyệt đọc từ phần cài đặt `fbm_sync`: quá hạn thì đóng lượt về `paused` mã `SYNC_APPROVAL_EXPIRED`, ghi Log, đổi thông báo. Chưa ghi gì lên FBM nên đóng là an toàn; lượt nền kế tiếp preflight lại và chờ duyệt lại nếu vẫn vượt ngưỡng.
- (c) R1: bịt đường "đứng im vô hạn" bằng luật hạn trong cửa thu hồi duy nhất. R2: dùng cổng thông báo và cửa thu hồi sẵn có. R3, R4: không đổi.

### P7. Sidebar chỉ khởi chạy và hiển thị (N8)
- (a) Gốc: DTO trạng thái chưa mang kết luận nghiệp vụ (đang chạy, bước, kết luận, quyết định xung đột), nên Sidebar tự suy từ phase/cursor.
- (b) Dùng lại: `statusView` thêm trường kết luận (`running`, `pipeline` luôn có, `result`), danh sách phase ở một nơi trong GAS; xung đột: Sidebar chỉ gửi lựa chọn từng trường, GAS (`confirm_conflict`) quyết PA và giá trị; xóa credential và sửa tên đăng nhập do GAS điều phối, Extension làm theo lệnh. Phần vẽ lại màn làm ở mục 4.
- (c) R1: bịt đường "Sidebar báo thành công khi GAS kết luận lỗi" và "năm danh sách phase lệch nhau". R2, R3, R4: Sidebar không xếp lại công cụ của GAS.

### P8. Extension không làm nghiệp vụ (phần còn lại của N9)
- (a) Gốc: luồng login FBM, quyết tải lại tab và điểm dừng lô nằm ở Extension.
- (b) Dùng lại: tải lại tab chỉ khi envelope có lệnh; luồng login FBM chuyển sang GAS thành dãy request thường (GAS tính MD5 bằng `Utilities.computeDigest`), Extension chỉ fetch và ghi `localStorage` theo lệnh; cắt gói quét giữ ở Extension vì là truyền tin (danh sách giữ lại do GAS cấp).
- (c) R1: bịt đường "Extension quyết khác GAS". R2, R3: Extension một việc là chuyển request. R4: không đổi.

### P9. Một công cụ cho mỗi phép tính trùng (N10)
- (a) Gốc: không có công cụ chung cho hash dòng FBM, điều kiện "cần đẩy", gate danh mục của một lời gọi và chuẩn hóa ngày.
- (b) Dùng lại: một hàm hash trên một hình dạng (record đã đổi tên; mọi chỗ đổi dòng thô sang record trước); một vị từ "cần đẩy" cho cả preflight và chặng đẩy; gate danh mục theo bản chụp của lời gọi như `readLocal`, bỏ cache `defineProperty`; một hàm ngày theo hằng múi giờ dự án; `threeWay` chỉ nhận hash.
- (c) R1: bịt đường "preflight đếm khác tập đẩy" và "hash lệch hình dạng". R2: đúng định nghĩa. R3, R4: không đổi.

### P10. Dừng lượt nền có hiệu lực ngay, Sidebar chờ theo kết luận của GAS (N11)
- (a) Gốc: lệnh dừng giao việc dừng cho một response có thể không bao giờ về; "nền đã nhả" là quyết định nghiệp vụ nhưng do Sidebar tự định nghĩa bằng phase.
- (b) Dùng lại: `requestAnswered` đã từ chối response cũ (`STALE_RESPONSE`), và hash chờ xác nhận đẩy (`pendingPush*`) đã ghi trước khi gửi lệnh ghi FBM, lượt sau tự kiểm lại. Nên `stop_background` đóng lượt nền ngay trong cùng lần cầm khóa (phase `paused`, mã dừng do người dùng) bằng công cụ đặt kết thúc chung, response đến muộn bị bỏ theo đường sẵn có. `statusView` trả `running` (từ `runInProgress`), Sidebar chờ theo trường này; khi lệnh dừng đóng ngay thì Sidebar gọi lệnh gốc luôn, không cần vòng chờ 3 giây.
- (c) R1: bịt đường "chờ một response không bao giờ về" và "Sidebar hiểu sai nền đã nhả". Còn phép kiểm: lệnh ghi FBM đang bay khi dừng có kết quả chưa biết, dựa vào kiểm hash chờ xác nhận ở lượt sau (đã có). R2: một định nghĩa "đang chạy" ở GAS. R3: Sidebar chỉ đọc kết luận. R4: không đổi.

### Thứ tự chặng 3b đề xuất
1. Bịt lỗi thật, nhỏ và độc lập: P10; mất `identityBlocks`; `approvalThreshold`; P6; P5.
2. P1.
3. P2.
4. P3.
5. P4.
6. P9, rồi phần hợp đồng của P7, rồi P8.

## Kế hoạch đợt refactor (chờ chủ dự án duyệt)

Phạm vi: GAS `fbm_sync/` và `server/service/FbmSyncService.js`, Sidebar `client/sync/`, Extension phía FBM (`2_ShinCRM_Extension/`). Đích: ba quy tắc cứng (một việc một công cụ; người điều phối gọi công cụ, công cụ trao nhau bằng dữ liệu; tiến trình lớn ghép từ tiến trình nhỏ) đúng cho mọi hàm, có test tĩnh giữ, không còn tàn dư.

### Giai đoạn A — rà soát và thiết kế đích (3a, không sửa code)
- [ ] A1. Script kiểm kê (trong scratchpad): liệt kê mọi hàm kèm tệp, số dòng và các lệnh đáng chú ý (`stateRead`/`stateWrite`, ghi DocumentProperties, đọc/ghi Sheet, `logEvent`, `nextEnvelope`, `statusView`, `catch` rỗng, nhánh `typeof ... === 'function'`); gắn cờ hàm dài hoặc gọi nhiều loại lệnh.
- [ ] A2. Agent Sonnet đọc các hàm bị gắn cờ theo nhóm tệp, trả theo mẫu cố định (hàm làm những việc gì, gợi ý tách); đọc trọn các tệp chưa đọc (màn vẽ Sidebar, `FbmSyncService.js`).
- [ ] A3. Dựng giấy nháp đích trong tệp này: cây tiến trình (mẹ, con, hàm điều phối, state sở hữu), danh mục công cụ theo loại (đầu vào, đầu ra, ai được gọi), bảng ánh xạ mỗi hàm cũ → đích (giữ / tách / gộp / xóa). Hàm không ánh xạ được là sót hoặc code chết. Tự đọc lại các kết luận nặng của agent.
- [ ] A4. Ghi P11 (tách hàm ôm nhiều việc) và P12 (test tĩnh chặn tái phạm), cập nhật P1–P10 theo giấy nháp; trình chủ dự án duyệt.

### Giai đoạn B — sửa (3b), mỗi bước: test offline, `node tests/gas.js ... --push` trên DEV, commit riêng
- [ ] B0. Viết test tĩnh trước, chạy ở chế độ "danh sách ngoại lệ chỉ được giảm": vi phạm hiện có ghi thành danh sách ngoại lệ, mỗi bước sau xóa bớt; thêm vi phạm mới là đỏ.
- [ ] B1. Lỗi thật nhỏ, độc lập: P10 (dừng nền ngay, Sidebar chờ theo `running`), mất `identityBlocks`, `approvalThreshold`, P6 (chờ chấp thuận có hạn và thông báo), P5 (lỗi im lặng, Extension một cổng gọi GAS).
- [ ] B2. P1: một cửa cho mọi lượt, tiến trình đăng nhập `loginRun`, Sidebar một vòng.
- [ ] B3. P2: tách cổng request, bảng chặng, một hàm nối chuỗi nền, lõi V24.
- [ ] B4. P3 + P11: state truyền qua công cụ, tách các hàm ôm nhiều việc.
- [ ] B5. P4: cài đặt FBM về cổng cài đặt chung, một cửa cho mỗi công tắc.
- [ ] B6. P9: một công cụ cho mỗi phép tính trùng.
- [ ] B7. P7 phần hợp đồng dữ liệu Sidebar (phần vẽ làm ở mục 4).
- [ ] B8. P8: Extension không làm nghiệp vụ.

### Giai đoạn C — dọn tàn dư (bắt buộc trước khi gộp `main`)
- [ ] C1. Xóa mọi hàm có đích "xóa" trong bảng ánh xạ; tìm tên trong toàn repo (GAS, Sidebar, Extension, tests, `server/dev/`, `DEV_RUNNER_ALLOWED`) phải ra 0.
- [ ] C2. Xóa nhánh tương thích đời cũ (state cũ, khóa cũ, trigger cũ, lệnh Extension cũ) sau khi hàm chuyển một lần đã chạy trên DEV; xóa khóa DocumentProperties cũ bằng hàm dọn một lần rồi xóa luôn hàm dọn.
- [ ] C3. Test tĩnh "hàm không ai gọi" cho `fbm_sync/`, `client/sync/`, Extension; danh sách ngoại lệ của B0 phải rỗng.
- [ ] C4. Sửa tài liệu 09 và `Quy tắc theo loại phiên/Đồng bộ FBM.md` cho khớp (chỉ ghi luật và vị trí, không chép bước), cập nhật `Cây thư mục code.md`, xóa giấy nháp đích khỏi tệp phiên.
- [ ] C5. Chạy bộ test đầy đủ, nghiệm thu trên DEV, hỏi chủ dự án trước khi gộp `main`.
