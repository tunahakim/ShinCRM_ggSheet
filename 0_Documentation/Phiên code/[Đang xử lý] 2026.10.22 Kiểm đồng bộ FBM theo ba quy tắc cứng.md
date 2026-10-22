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
