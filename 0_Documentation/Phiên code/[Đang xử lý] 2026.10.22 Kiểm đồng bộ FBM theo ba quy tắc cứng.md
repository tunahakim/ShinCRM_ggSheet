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

## Phương án đề xuất (A4, chờ chủ dự án duyệt)

Các phương án dưới đây thực hiện kiến trúc ở mục "Kiến trúc đích" và bảng ở mục "Bảng đích (A3)"; tên công cụ đích lấy theo A3.1–A3.3. "Lỗi n" là lỗi thứ n trong danh sách lỗi mới ở dòng A2 của lộ trình (đã đọc lại ở A3.5). Thứ tự làm là các bước B của lộ trình.

Ký hiệu cho bảng (c): **R1** lỗi không có đường xảy ra; **R2** một việc một công cụ; **R3** người điều phối gọi công cụ, công cụ trao nhau bằng dữ liệu; **R4** tiến trình lớn ghép từ tiến trình nhỏ.

### P1. Một cửa lệnh, Tiến trình đăng nhập có người điều phối riêng, Sidebar một vòng (N1, phần login của N2, lỗi 2, lỗi 6)
- (a) Gốc: không có một cửa duy nhất cấp quyền dùng ô lượt. Sidebar có 30 điểm vào GAS, relay có 4 loại tin đi ngoài cửa, đăng nhập thử và hủy phiên cũ đi đường riêng ngoài khóa. Mỗi điểm vào tự chọn tham số và tự lọc kết quả, nên `start` làm rơi `identity` của Kiểm liên kết (lỗi 2) và `fbmCancelSync` quên lọc, trả cả cookie và token về Sidebar (lỗi 6). Mục đích lượt (thử, ép, tự đăng nhập giữa lượt) rải vào từng bước thành cờ `testOnly`/`purpose`/`manual`.
- (b) Dùng lại: `controlDispatch` + `runSlice` + bảng lệnh có sẵn ở `ControlPort.js`. Mọi điểm vào Sidebar và relay thành adapter một dòng gọi `controlDispatch(lệnh, dữ liệu)`; lệnh `start` nhận nguyên đối tượng tham số đã chuẩn hóa một chỗ, không chép từng trường. Mọi kết quả ra ngoài đi qua một công cụ `publicResult` dựng từ `transportValue` (bỏ bản trùng) theo danh sách trường được phép, không theo danh sách trường cấm. Đăng nhập thử và đăng nhập ép thành `start` loại `login_test`/`login_force`; `loginRun(state, afterLogin)` là người điều phối duy nhất của Tiến trình đăng nhập, các bước `loginAdapterContinue`/`loginAuthorizeContinue`/`loginIdentityContinue` giữ phần làm việc và trả `{ ok, identity, code }`. Sidebar bỏ `fbmSyncLoginTestLoop`, `fbmSyncForceLogin`, chỉ còn `sidebarRun`.
- (c) R1: bịt bằng kiến trúc các đường "lượt khác ghi đè giữa chừng" (mọi lượt vào ô qua một cửa trong khóa), "bước sau đọc nhầm lượt" (cursor mang runId), "điểm vào làm rơi tham số" (không còn chép từng trường) và "điểm vào quên lọc bí mật" (một cửa ra theo danh sách cho phép, có test chốt). Không còn phép kiểm thay. R2: một cửa lệnh, một cửa ra, một vòng Sidebar, một Tiến trình đăng nhập. R3: bước đăng nhập trả dữ liệu, chỉ `loginRun` quyết. R4: Cổng phiên và đăng nhập thử cùng gọi `loginRun`.

### P2. Lát, cổng phát request và Chuỗi nền theo K5 (N2, N4 phần GAS, N7, lõi V24)
- (a) Gốc: `nextEnvelope` vừa phát request vừa quyết công tắc, ngân sách, dừng, phiên (4 lần đọc, 5 lần ghi ô lượt); `continueStep` là một switch ôm mọi chặng và cổng phiên (18 lần ghi); nối chuỗi nền viết ở bốn chỗ; thu hồi lượt treo (`recoverStaleRun`) chạy trong lúc đọc trạng thái và bỏ sót phase chờ duyệt (N7).
- (b) Dùng lại: phần dựng envelope, cấp id, ghi hạn của `nextEnvelope` thành cổng `requestIssue`; các phép kiểm gom thành `sliceGuards` thuần do `runSlice` gọi trước; `continueStep` thành bảng `cursor.kind` → người điều phối chặng. Chuỗi nền là một người điều phối `heartbeatRun` xét đúng thứ tự K5: máy hỏi có phải máy được giao (`machineCheck`, kho máy nền V24) → lượt dở quá hạn (`staleRunCheck`, đóng `SYNC_ABANDONED_RUN`, ghi Log kèm hộp đen) → cổng chặng đẩy → tiến trình đến hạn theo sổ tiến trình → `request: null`. Thử lại sau lỗi giữ backoff 5, 10, 20, 40, 60 phút. `recoverStaleRun` và việc ghi trong `fbmSyncStatusRead` bị xóa.
- (c) R1: bịt đường "chặng quên kiểm công tắc/ngân sách" (chặng không tự phát request), "hai máy cùng chạy nền" (chỉ máy được giao nhận request), "lượt treo mãi" (một chỗ xét quá hạn mỗi lần hỏi) và "đọc trạng thái làm đổi state". Còn phép kiểm: Extension hoặc relay chết chỉ biết qua hạn chờ, vì GAS không gọi được Extension. R2: một cổng phát, một chuỗi nền. R3: chặng trả request mong muốn, cổng phát. R4: `runSlice` gọi Cổng phiên và các chặng; Chuỗi nền gọi Lượt.

### P3. State là dữ liệu truyền qua công cụ, lượt có điểm mở và điểm đóng (N3, phần đặt lỗi của N10, lỗi 9)
- (a) Gốc: không có hợp đồng "người điều phối đọc state một lần, công cụ nhận và trả", nên công cụ tự `stateRead`/`stateWrite`, hai bản state cùng sống trong một lời gọi và bản sau đè bản trước (mất `identityBlocks`). Lượt không có điểm đóng chung, nên kho làm việc còn lại khi lượt lỗi hoặc bị hủy, và kết quả của tiến trình được ghi giữa chừng (số khách mốc ghi trước chặng giao dịch, lỗi 9).
- (b) Dùng lại: `runSlice` đã cầm khóa; `withPropertyBuffer` đã gom ghi kho. `runSlice` đọc ô một lần, truyền bản sao vào chặng, chặng trả patch, `runSlice` ghi một lần. `scriptSettings(state)` và các công cụ đọc kho nhận dữ liệu qua tham số. `stateWrite` thành công cụ ghi thuần; hiệu ứng phụ (đóng bước, Log request chưa trả lời) lên người điều phối. Một công cụ `runFail(state, code, message)` thay bốn chỗ gán tay. Lượt có `runOpen` (thay `stateStart`, một patch) và `runClose` (mọi đường kết thúc gọi: dọn kho làm việc, ghi sổ tiến trình gồm số khách mốc và con trỏ vòng xoay).
- (c) R1: bịt đường "hai bản state đè nhau" (công cụ không còn gọi `stateRead`/`stateWrite`, test tĩnh P12 chặn), "kho làm việc mồ côi" (một điểm đóng cho mọi đường kết thúc) và "ghi kết quả khi tiến trình chưa xong". Còn phép kiểm: ghi Sheet rồi ghi kho không nguyên tử được vì là hai kho; giữ thiết kế ghi lại idempotent và test nhánh lỗi giữa chừng. R2: một công cụ đặt lỗi, một điểm mở, một điểm đóng. R3: đúng định nghĩa. R4: không đổi.

### P4. Cài đặt FBM về cổng cài đặt chung (N5, lỗi 7, lỗi 8)
- (a) Gốc: năm kho cài đặt FBM có bộ đọc/kiểm/lưu riêng, bốn chính sách đọc khác nhau, ghi ngoài khóa; công tắc tổng là chuỗi trần có nhiều cửa và được đổi trước khi kiểm phần còn lại (lỗi 7); chính sách, credential và trạng thái lần thử đăng nhập chung một khóa có 8 người ghi đọc-sửa-ghi cả khóa, trong đó lưu chính sách không cầm khóa (lỗi 8); Sidebar thay ô trống bằng 5 và 30.
- (b) Dùng lại: cổng `settingsSave`/`settingsValue`/`settingsDefaultsChecked`, bảng khai `fbmSettingsSections`, mẫu `defaults_fbm_pull`, hàm chuyển theo mẫu `settingsMigrateFromConfig`. Khai các mục `fbm_sync`, `fbm_account`, `fbm_login` (chính sách), `fbm_extension`, `fbm_background`, công tắc tổng, công tắc nền, máy nền. Cổng thêm kiểu `boolean`, `codeList`, số có khoảng (ô trống là chưa đặt) và hàm kiểm cả mục cho ràng buộc giữa trường. Lưu nhiều mục một lần: kiểm hết rồi mới ghi. Credential sang `FBM_CREDENTIAL_V1`, lần thử sang `FBM_LOGIN_ATTEMPT_V1` (A3.3). `approvalThreshold` đọc qua `settingsValue`, bỏ `catch`. Khóa cài đặt hỏng thì báo lỗi kèm nút "Đặt về mặc định".
- (c) R1: bịt đường "ô trống thành số", "lưu giá trị chưa kiểm", "công tắc đổi mà phần sau hỏng", "hai cửa đặt công tắc lệch nhau" và "ghi lần thử đè credential vừa đổi" (ba kho riêng, mỗi kho một người ghi). R2: một cổng cài đặt. R3: hàm kiểm thuần, người điều phối đọc Sheet rồi truyền vào. R4: lưu cài đặt FBM gọi người điều phối `settingsSave`.

### P5. Không còn lỗi im lặng, Extension một cổng gọi GAS (N6, lỗi 3, lỗi 5, lỗi 10)
- (a) Gốc: Extension có ba đường gọi GAS với ba kiểu xử lý lỗi, trong đó 404 hoặc response không phải JSON bị biến thành giá trị thường nên chuỗi kết thúc và kết quả FBM bị bỏ (lỗi 5). GAS và Sidebar che lỗi bằng `catch` rỗng, `.catch` trả null và nhánh `typeof ... === 'function'` (có chỗ mở cửa khi thiếu hàm, lỗi 10). `markPushError` thoát trước khi ghi Log ở nhánh bận/đổi/vắng (lỗi 3).
- (b) Dùng lại: `relayRun` làm người điều phối duy nhất ở Extension; `postRelay` chỉ fetch và ném mọi lỗi kèm `httpStatus` và mã thật; một công cụ `relayCall` cho cả hỏi lẫn nộp; hộp đen `fbmChainTrail` duy nhất, thêm ô lỗi nộp gần nhất, GAS ghi Log xong trả `trailAck` để Extension xóa. GAS bỏ `catch` rỗng và mọi nhánh `typeof`, dùng `logEvent`/`noticeRaise`; Sidebar bỏ `.catch` trả null. `pushResultApply` (A3.1) ghi Log ở mọi nhánh.
- (c) R1: bịt đường "kết quả FBM bị bỏ mà không ai biết" (một cổng, mọi lỗi đi một đường), "thiếu hàm thì mở cửa" (không còn nhánh `typeof`, test tĩnh chặn). Còn phép kiểm: 404 xảy ra khi GAS không chạy nên chỉ báo được ở lần gọi kế tiếp (qua hộp đen hoặc hạn chờ); Extension không ghi được Sheet `Log`. R2: một cổng gọi GAS, một hộp đen. R3: `postRelay` không tự ghi chẩn đoán. R4: đường lượt tay qua Sidebar dùng cùng công cụ chuẩn bị tab và gửi tab với `relayRun`.

### P6. Chấp thuận qua cổng chặng đẩy (N7, thay phương án hạn chờ cũ)
- (a) Gốc: chờ chấp thuận là một phase của lượt nên chiếm ô, tính là đang chạy, chặn mọi lượt nền kể cả Giữ phiên, nằm ngoài danh sách thu hồi và không phát thông báo; Sidebar duyệt mà không gửi dấu tập đang hiện, nên có đường "duyệt bộ này mà đẩy bộ khác".
- (b) Dùng lại: kho `FBM_SYNC_PUSH_CLEAN_V1` mở rộng thành cổng chặng đẩy (A3.3); sổ nạp lại của lõi để biết Sheet đổi; `noticeRaise` cho thông báo. Làm đúng K6: kiểm ngưỡng ở đầu chặng đẩy; vượt ngưỡng thì cổng ghi chờ duyệt kèm dấu tập, số bản ghi, revision sổ nạp lại; lượt chạy nốt và kết thúc bình thường; lệnh `approve_push` mang dấu tập, chặng đẩy dựng lại tập và so dấu. Thông báo hai nút "Chấp thuận" và "Kiểm lại ngay", tự tắt khi cổng về sạch. Bỏ phase `awaiting_approval`, không có hạn chờ.
- (c) R1: bịt đường "chờ duyệt chặn nền và Giữ phiên" (không chiếm ô), "đứng im vô hạn" (lượt kết thúc bình thường), "duyệt bộ này đẩy bộ khác" (so dấu tập trước request ghi đầu tiên). Không còn phép kiểm thay. R2: một cổng chặng đẩy cho cả sạch lẫn chờ duyệt; dùng lại sổ nạp lại. R3: `pushGateDecide` thuần, chặng đẩy ghi qua cổng. R4: "Kiểm lại ngay" chạy lượt tay bằng người điều phối Lượt.

### P7. Sidebar chỉ gửi lệnh và hiển thị (N8, lỗi 1)
- (a) Gốc: `statusView` chưa mang kết luận nghiệp vụ, nên Sidebar tự suy trạng thái từ phase và cursor qua 6 bản sao danh sách phase (đều thiếu `waiting_session`, lỗi 1), tự quyết xung đột, tự nối chuỗi, tự dựng status giả, dùng `window.confirm`.
- (b) Dùng lại: các khối đã đúng mẫu (`fbmSyncRunResetBlocks`, `fbmSyncSaveBackgroundSettings`, `fbmSyncStatusFromResult`, `fbmSyncBudgetMs`). `statusViewBuild` trả `running`, `tone`, `actions`, `progress`, `pendingApproval`, `warnings`, `issues`, `pipeline` luôn có; danh sách phase chỉ ở `State.js`. Xung đột: Sidebar gửi lựa chọn từng trường. Xóa credential và sửa tên đăng nhập do GAS điều phối. Năm bảng chờ RPC gộp thành `extensionRpc`. `window.confirm` thay bằng `uiDecisionOpen`. Phần vẽ lại màn làm ở Todo mục 4.
- (c) R1: bịt đường "Sidebar hiện khác GAS" (không còn bản sao phase, không còn status giả) và "Sidebar báo thành công khi GAS kết luận lỗi". R2: một định nghĩa trạng thái ở GAS, một bảng chờ RPC. R3: Sidebar chỉ đọc kết luận. R4: Sidebar không xếp lại công cụ của GAS.

### P8. Extension không làm nghiệp vụ, tách khóa và bản mã (phần còn lại của N9, K8, lỗi 11)
- (a) Gốc: luồng đăng nhập FBM (5 request, chọn database/đơn vị, băm, nhận diện bị chặn, ghi khóa trang), quyết tải lại tab, điểm dừng lô và rẽ theo `kind` nằm ở Extension; Extension giữ cả khóa lẫn bản mã mật khẩu và gửi mật khẩu bản rõ sang tab FBM; executor fetch URL từ envelope không kiểm miền.
- (b) Dùng lại: lệnh `meta.reloadFbmPage`/`meta.openFbmContext` đã có (tải lại tab chỉ khi envelope bảo); luồng đăng nhập chuyển sang GAS thành dãy request thường theo `loginRun`; Extension giữ `md5` và làm "giải mã trong worker, băm, điền chỗ trống" cho hai bước cần mật khẩu, bản rõ không sang tab. Vault chỉ giữ `{ ref, key }`, bản mã do GAS gửi trong envelope (A2 đã xác nhận không phải nhập lại mật khẩu). Một phép kiểm miền FBM chung cho mọi URL từ envelope. Cắt gói quét theo quyết định ở A3.6.
- (c) R1: bịt đường "Extension quyết khác GAS", "lộ mật khẩu khi mất riêng Extension" (Extension không còn bản mã) và "fetch ra ngoài miền FBM". Còn phép kiểm: test chốt rằng mật khẩu và bản băm chỉ xuất hiện trong request gửi FBM. R2: Extension một việc là chuyển request. R3: Extension băm trên dữ liệu envelope đưa. R4: không đổi.

### P9. Một công cụ cho mỗi phép tính trùng (N10, lỗi 4)
- (a) Gốc: không có công cụ chung cho hash bản ghi (6 chỗ, hai hình dạng), điều kiện "cần đẩy" (hai định nghĩa, bốn hàm rời), gate danh mục của một lời gọi, chuẩn hóa ngày, so chủ bản ghi (4 chỗ, 2 nghĩa); `Probe.js` tự viết lại phép phân loại bản ghi và làm sai (lỗi 4).
- (b) Dùng lại: một `hash` trên record đã đổi tên; một `pushEligible`; gate danh mục theo bản chụp của lời gọi như `readLocal`, bỏ cache `defineProperty`; một hàm ngày theo hằng múi giờ dự án; `threeWay` chỉ nhận hash; `pushRowChange` làm mẫu cho mọi cửa ghi dòng. `Probe.js` sang `server/dev` và gọi công cụ chung.
- (c) R1: bịt đường "preflight đếm khác tập đẩy" và "hash lệch hình dạng". R2: đúng định nghĩa. R3, R4: không đổi.

### P10. Dừng lượt nền có hiệu lực ngay (N11)
- (a) Gốc: lệnh dừng giao việc dừng cho một response có thể không bao giờ về; Sidebar tự định nghĩa "nền đã nhả" bằng phase và chờ tới 30 phút, mỗi 3 giây gọi GAS một lần, khóa nút Dừng.
- (b) Dùng lại: `requestAnswered` đã loại response cũ; hash chờ xác nhận đẩy đã ghi trước khi gửi lệnh ghi FBM. `stop_background` đóng lượt nền ngay trong cùng lần cầm khóa bằng `runFail`/`runClose`; Sidebar nhận `running:false` trong kết quả và gọi lệnh gốc luôn. Xóa `fbmSyncWaitForBackgroundIdle`.
- (c) R1: bịt đường "chờ một response không bao giờ về" và "Sidebar hiểu sai nền đã nhả". Còn phép kiểm: lệnh ghi FBM đang bay khi dừng có kết quả chưa biết, dựa vào kiểm hash chờ xác nhận ở lượt sau (đã có). R2: một định nghĩa "đang chạy". R3: Sidebar chỉ đọc kết luận. R4: không đổi.

### P11. Tách các hàm ôm nhiều việc
- (a) Gốc: khoảng 510 hàm có vi phạm; nặng nhất là các hàm vừa đọc, vừa kiểm, vừa tính, vừa ghi: `nextEnvelope`, `continueStep`, `pullWrite`, `customerScanMark`, các hàm con của `PushFlow.js`, `statusView`, `connectionSave`, `executeLogin`, `relayRun`, `bridgeOnMessage`, `saveCredentialEnvelope`, `fbmSyncSaveConnection`. Không có quy ước loại công cụ nên mỗi hàm tự lấy thứ nó cần.
- (b) Dùng lại: danh mục loại công cụ A3.2 và bảng ánh xạ ở tệp đi kèm A3 (mỗi hàm đã có đích). Tách theo trách nhiệm nghiệp vụ, không băm theo dòng; phần nào đã có công cụ chung thì gọi công cụ đó. Làm cùng bước B chạm tệp đó (B3, B4, B9, B10), không mở bước riêng.
- (c) R1: bịt đường "công cụ tự lấy dữ liệu sai lúc" (mọi đầu vào truyền qua tham số). R2: mỗi hàm một loại việc. R3: đúng định nghĩa. R4: người điều phối gọi người điều phối con.

### P12. Test tĩnh chặn tái phạm
- (a) Gốc: ba quy tắc cứng chỉ nằm trong tài liệu; không có gì chặn khi code mới vi phạm, nên vi phạm tích lại qua nhiều phiên.
- (b) Dùng lại: bộ chạy `node tests/run.js` và cách kiểm chuỗi nguồn đã có ở `tests/cases/extensionBridge.js`. Thêm một tệp test tĩnh đọc nguồn `fbm_sync/`, `FbmSyncService.js`, `client/sync/`, Extension phía FBM, kiểm: `stateRead`/`stateWrite` chỉ ở danh sách người điều phối; không `catch` rỗng, không `.catch` trả null; không `typeof FbmSync.x === 'function'`; danh sách phase chỉ ở `State.js`; `props().setProperty` chỉ ở các cổng kho; không `window.confirm`; kết quả mọi adapter không chứa `cookie`, `authorized`, `envelope`, `password`; Extension không rẽ theo `kind`. Mỗi luật có danh sách ngoại lệ chỉ được giảm (B0); C3 thêm luật "hàm không ai gọi" và yêu cầu mọi danh sách ngoại lệ rỗng.
- (c) R1: bịt đường "vi phạm mới lọt vào" bằng test đỏ; luật nào chỉ kiểm được bằng mắt (ví dụ một hàm làm hai việc nghiệp vụ) thì còn là việc rà khi review. R2: một tệp test cho mọi luật. R3, R4: test kiểm được phần lệnh gọi, phần ý nghĩa vẫn do người rà.

### P13. Gộp kho và luật dọn
- (a) Gốc: 32 khóa DocumentProperties và 9 khóa `chrome.storage` lớn lên theo từng tính năng, nhiều khóa không có ai dọn (kho làm việc khi lượt lỗi, vault mồ côi, khóa chỉ ghi không đọc, hộp đen cũ mang lên mãi), nhiều nhóm cùng vòng đời nằm rời (8 khóa lịch nền, hai khóa liên kết).
- (b) Dùng lại: `documentPropertySet` (sửa đo byte thật, bỏ `catch` rỗng), `seenStore*`, `pushList*` làm mẫu kho phân mảnh; mẫu hàm chuyển một lần `settingsMigrateFromConfig`. Làm theo bảng A3.3: gộp sổ tiến trình, kho kết nối, cổng chặng đẩy; tách khóa đăng nhập thành ba; danh sách tiền tố kho làm việc khai một chỗ, `runClose` xóa hẳn; vault chỉ giữ khóa và dọn theo ref GAS gửi; xóa khóa không ai đọc. Một hàm chuyển một lần chạy trên DEV, C2 xóa khóa cũ và xóa luôn hàm chuyển.
- (c) R1: bịt đường "kho phình vô hạn" (mỗi kho có người dọn ghi ở A3.3) và "hai khóa cùng vòng đời lệch nhau". Còn phép kiểm: lệnh ghi đang chờ quá tuổi chỉ báo chứ không tự xóa (tự xóa có thể làm tạo trùng trên FBM). R2: mỗi vòng đời một kho, mỗi kho một cổng. R3: chỉ người điều phối gọi cổng kho. R4: không đổi.

### Thứ tự
Theo các bước B của lộ trình: B0 (P12 khung), B1 (lỗi thật nhỏ: P10, lỗi 2, 3, 6, 7, mất `identityBlocks`, `approvalThreshold`, `catch` rỗng), B2 (P1), B3 (P2), B4 (P3, P11), B5 (P6), B6 (P4), B7 (P13), B8 (P9), B9 (P7), B10 (P5 phần Extension, P8).

## Kiến trúc đích

Bản thiết kế đích của đồng bộ FBM sau refactor, ở mức nơi chạy, nơi giữ state, cửa vào, cây tiến trình và tín hiệu. Nó thay cho phần mô tả rời về vòng đời lượt, nhịp chạy, chấp thuận, mất đường truyền và mật khẩu ở P1, P5, P6, P8, P10 (A4 sửa các mục P cho khớp). Danh mục công cụ chi tiết, bảng ánh xạ hàm cũ → đích và kho cũ → đích làm ở A3 sau khi kiểm kê. Sau 3b, phần này thành luật trong tài liệu 09 (C4) và bị xóa khỏi tệp phiên.

Chủ dự án chốt 2026-10-24: một ô state, mỗi lúc một lượt; Extension hỏi theo nhịp cố định, GAS quyết có việc hay không; chờ chấp thuận gộp vào kho cổng chặng đẩy, không chiếm ô; mất đường truyền là lỗi như mọi lỗi mạng; Extension giữ khóa, GAS giữ bản mã mật khẩu; chạy thử trên chính Sheet DEV theo cách (b).

### K1. Nhiệm vụ của từng đối tượng

| Đối tượng | Được làm | Không được làm |
|---|---|---|
| FBM | CRM thật của công ty, nguồn dữ liệu; chỉ trả lời request | — |
| GAS (bộ não) | Quyết mọi việc: có chạy không, chạy gì, request nào, response nghĩa là gì, ghi gì xuống Sheet, có cần chấp thuận không, báo lỗi gì, Sidebar hiện gì. Nơi duy nhất ghi Sheet và `Log`. Chỉ chạy khi Sidebar hoặc Extension gọi, hoặc trigger sửa ô chạy | — |
| Extension (người đưa thư, kiêm đồng hồ) | Một alarm `gas_poll` theo nhịp người dùng đặt (mặc định 5 phút); nhận envelope, chuẩn bị tab FBM theo lệnh trong envelope, fetch trong tab, nộp response thô qua một cổng gọi GAS; giữ khóa giải mã mật khẩu và làm phép "giải mã, băm, điền vào chỗ trống" khi envelope yêu cầu; hộp đen | Tự quyết tải lại tab, rẽ nhánh theo loại việc, chạy chuỗi đăng nhập, tự thử lại, giữ bản mã mật khẩu, giữ response qua hai lần gọi |
| Sidebar (bảng điều khiển) | Gửi lệnh của người dùng tới GAS; với lượt tay, đưa thư giữa GAS và Extension; hiển thị `statusView` và thông báo do GAS dựng | Suy trạng thái từ phase hay cursor, quyết xung đột, tự nối "đăng nhập rồi chạy", tự nhận biết dữ liệu đổi |
| Sheet | Dữ liệu khách, giao dịch, danh mục; sheet `Log` (trần `LOG_MAX_ROWS`) | Chỉ GAS ghi |
| DocumentProperties | Kho ẩn đi kèm tệp: ô lượt, sổ hẹn, cài đặt, sổ nạp lại, bản mã mật khẩu, kho phụ | Chỉ GAS đọc ghi |
| `chrome.storage` của Extension | Địa chỉ và khóa relay, khóa giải mã, hộp đen | Không giữ dữ liệu nghiệp vụ |
| Tab FBM (cookie, localStorage) | Phiên đăng nhập FBM, do FBM và trình duyệt giữ | Extension chỉ ghi khóa trang khi GAS bảo |
| RAM Sidebar | Bản sao để hiển thị nhanh | Không phải nguồn sự thật |

Hai đường truyền, chung một cửa GAS: lượt nền đi Extension ↔ Web App relay; lượt tay đi Sidebar ↔ GAS (`google.script.run`) và Sidebar ↔ Extension (`postMessage`), không qua Web App nên vẫn chạy khi relay 404.

Lỗi GAS không phản hồi: ai gọi hỏng thì thấy trước. Sidebar gọi hỏng thì hiện ngay và ghi bù Log khi GAS chạy lại. Extension gọi hỏng thì ghi hộp đen; lần gọi được kế tiếp GAS ghi Log và báo Sidebar. Relay hỏng mà Sidebar vẫn gọi được thì GAS tự thấy request lượt nền quá hạn và báo Sidebar.

### K2. Nơi sở hữu state

Mỗi state có một chủ và một cổng. Danh sách đủ các khóa và việc gộp làm ở A1–A3 (bảng kiểm kê kho); dưới đây là các kho chính của kiến trúc.

| State | Chủ | Cổng | Ghi chú |
|---|---|---|---|
| Ô lượt `FBM_SYNC_STATE_V1`: lượt nào, bước nào, request đang chờ và hạn, kết luận | Người điều phối lát `runSlice` | Đọc một lần đầu lát, ghi một lần cuối lát, trong khóa | Một lượt tại một thời điểm; không công cụ nào tự `stateRead`/`stateWrite` |
| Sổ hẹn: giờ chạy xong, lần thử lại của từng tiến trình nền | Lịch nền | `scheduleMarkDone`/`scheduleMarkFailed` | Ứng viên gộp 8 khóa thành 1 |
| Cổng chặng đẩy (`FBM_SYNC_PUSH_CLEAN_V1` mở rộng): trạng thái sạch hoặc chờ duyệt; dấu tập ứng viên, số bản ghi, revision sổ nạp lại, lúc, dấu đã duyệt | Chặng đẩy | Cổng chặng đẩy | Không thêm kho mới; nằm ngoài ô lượt nên chờ duyệt không chiếm ô |
| Sổ nạp lại `reloadJournal` | Lõi | `fbm_sync` chỉ đọc qua hàm đọc của lõi | Giữ luật lõi không biết `fbm_sync` |
| Máy chạy nền (V24) | GAS | Cổng máy nền | Theo thiết kế ở mục bối cảnh |
| Cài đặt FBM | Cổng cài đặt chung | `settingsSave`/`settingsValue` | P4 |
| Bản mã mật khẩu | GAS | Cổng credential | GAS không có khóa |
| Khóa giải mã | Extension | Chỉ Extension | Extension không lưu bản mã |
| Hộp đen | Extension | Gửi kèm `heartbeat_request` (đã có) | Một ô ghi đè, kích thước cố định; thêm ô "lỗi nộp gần nhất" cũng một ô |

Mọi kho phải có luật dọn: ai xóa, khi nào. Kho không trả lời được câu này là lỗi phải sửa ở B.

### K3. Một cửa duy nhất

Mọi thay đổi state FBM đi qua `controlDispatch(lệnh, dữ liệu)` cầm khóa. Sidebar và relay là adapter, không có đường gọi thẳng vào công cụ.

| Nhóm | Lệnh |
|---|---|
| Lượt | `start` (đồng bộ tay, đăng nhập thử, đăng nhập ép, kiểm liên kết, dò liên kết), `continue`, `cancel`, `stop_background` |
| Nền | `heartbeat` (kèm hộp đen và mã máy) |
| Chấp thuận | `approve_push` (kèm dấu tập Sidebar đang hiện) |
| Xung đột | `confirm_conflict` (Sidebar gửi lựa chọn từng trường, GAS quyết) |
| Cài đặt | `save_settings`, `set_master`, `set_background`, `save_identity_binding`, `save_credential`, `assign_background_machine` |
| Đọc | `status` |

Luật chiếm ô: ô bận khi và chỉ khi lượt ở phase đang chạy và có request đang chờ chưa quá hạn hoặc đang trong một lát. Mọi trạng thái cuối (xong, lỗi, tạm dừng, xung đột) là ô rảnh. Danh sách phase "đang chạy" khai một chỗ trong GAS; `statusView` trả sẵn `running`. Bấm chạy tay gặp lượt nền: GAS trả `SYNC_BACKGROUND_RUNNING`, Sidebar hỏi; chọn dừng thì `stop_background` đóng lượt nền ngay trong khóa, response đến muộn bị `requestAnswered` loại.

### K4. Cây tiến trình

```
Chuỗi nền (heartbeat)          Lượt tay (start)          Đăng nhập thử / ép (start)
  └─ chọn tiến trình đến hạn      │                            │
      └────────── Lượt ◄──────────┘                            │
                   ├─ Cổng phiên ─ hết phiên ─► Tiến trình đăng nhập ◄┘
                   ├─ Chặng quét khách
                   ├─ Chặng lớp giao dịch
                   ├─ Chặng kéo về
                   ├─ Chặng đối soát
                   ├─ Chặng đẩy ─► Cổng chặng đẩy (chấp thuận)
                   └─ Bước đếm khách ─ lệch ─► Quét nhanh
```

- Mỗi hộp là một người điều phối, gọi công cụ (đọc, kiểm, tính, ghi) và người điều phối con.
- Lượt tay, lượt nền và Giữ phiên là cùng một người điều phối Lượt, khác tham số.
- Đăng nhập thử gọi đúng Tiến trình đăng nhập mà Cổng phiên dùng; "làm gì sau khi đăng nhập xong" truyền vào lúc khởi chạy, các bước không rẽ theo cờ.
- Một lát: `runSlice` cầm khóa, đọc ô một lần → công cụ kiểm thuần (công tắc, ngân sách, cờ dừng) trả quyết định → bảng `cursor.kind` → người điều phối chặng trả `{ thay đổi state, request kế hoặc kết thúc }` → cổng phát request dựng envelope, cấp id, ghi hạn → `runSlice` ghi ô một lần.

### K5. Mỗi lần Extension hỏi

Extension hỏi theo nhịp cố định người dùng đặt; GAS xét theo thứ tự:
1. Máy hỏi không phải máy được giao chạy nền: trả lệnh dừng nhịp (V24).
2. Lượt dở có request quá hạn: đóng lượt (`SYNC_ABANDONED_RUN`), ghi Log kèm hộp đen, báo Sidebar.
3. Cổng chặng đẩy đang chờ duyệt: có dấu duyệt thì chạy lượt có đẩy; sổ nạp lại có dòng mới chạm Customer/Activity sau revision đã ghi thì kiểm lại; không có gì mới thì các lượt bỏ chặng đẩy.
4. Tiến trình đến hạn theo sổ hẹn: chạy.
5. Không có gì: `request: null`.

Thử lại sau lỗi giữ nguyên cơ chế hiện có: tiến trình nền kết thúc lỗi hoặc tạm dừng được dời 5, 10, 20, 40, tối đa 60 phút; lần đầu bằng đúng một nhịp hỏi nên lỗi lẻ được chạy lại ngay lần hỏi kế; mất đường truyền đi chung đường này.

### K6. Chấp thuận

- Kiểm ngưỡng ở đầu chặng đẩy (tập ứng viên lúc đó là tập sẽ đẩy, sau kéo về và đối soát). Chấp thuận vẫn đứng trước mọi request ghi.
- Vượt ngưỡng: không phát request ghi; cổng chặng đẩy chuyển sang chờ duyệt (dấu tập, số, revision sổ nạp lại sau lần ghi Sheet cuối của lượt, lúc); phát thông báo qua `noticeRaise`; lượt chạy nốt bước đếm và kết thúc bình thường, ghi giờ chạy xong.
- Đang chờ duyệt thì mọi lượt bỏ chặng đẩy trừ khi K5 bước 3 cho chạy; không đẩy lẻ phần nào.
- Duyệt: `approve_push` mang dấu tập đang hiện; chặng đẩy dựng lại tập và so dấu, khớp mới đẩy, khác thì hỏi lại.
- Thông báo có hai nút: "Chấp thuận" và "Kiểm lại ngay" (chạy lượt tay qua đường Sidebar). Thông báo tự tắt khi cổng về sạch.
- Bỏ phase `awaiting_approval` và bỏ ý tưởng hạn chờ.

### K7. Lỗi đường truyền

- Là lỗi như mọi lỗi mạng, một lớp xử lý ở cổng request; ghi Log và báo Sidebar.
- Extension một cổng gọi GAS cho cả hỏi lẫn nộp; mọi lỗi ghi hộp đen kèm mã thật và `httpStatus`. Extension không giữ response; lượt mới đọc lại từ FBM. Lệnh ghi đã gửi mà mất response vẫn theo luật `SYNC_STALE_WRITE`, không gửi lại.

### K8. Mật khẩu và đăng nhập

- Hiện tại Extension giữ cả khóa lẫn bản mã, GAS cũng giữ bản mã: mất riêng Extension là lộ.
- Đích: GAS giữ bản mã, Extension chỉ giữ khóa. Không phải nhập lại mật khẩu nếu bản mã GAS giữ là bản do chính khóa đó tạo (kiểm ở A2).
- Tiến trình đăng nhập do GAS điều phối, mỗi bước một request thường: lấy trang Login (GAS trích salt) → lấy database và đơn vị (GAS chọn) → gửi Login → GAS xét kết quả → đọc trang tài khoản → ghi khóa trang.
- Hai bước cần mật khẩu: GAS gửi envelope có chỗ trống băm kèm bản mã và salt; Extension giải mã trong bộ nhớ, băm, điền, fetch rồi bỏ. Mật khẩu và bản băm chỉ ra khỏi Extension trong request gửi FBM; có test chốt.

### K9. Đối chiếu quy tắc cứng

| Quy tắc | Cách đáp ứng |
|---|---|
| Lỗi không có đường xảy ra | Bịt bằng kiến trúc: hai lượt ghi đè nhau; bước sau đọc nhầm lượt; duyệt bộ này mà đẩy bộ khác; chờ duyệt chặn nền và Giữ phiên; dừng nền phải chờ response; lộ mật khẩu khi mất một bên; hai bản state đè nhau trong một lời gọi; nhịp hỏi bị một câu trả lời sai làm ngừng (nhịp cố định). Chỉ còn phép kiểm: Extension chết chỉ biết qua hạn chờ; relay hỏng chỉ biết qua hạn chờ hoặc khi Extension nối lại; sửa Sheet mà trigger không chạy thì lưới an toàn là Quét nhanh |
| Một việc một công cụ | Một cửa lệnh; một cổng chặng đẩy cho cả sạch lẫn chờ duyệt; dùng lại sổ nạp lại; một cổng gọi GAS ở Extension; một tiến trình đăng nhập; một danh sách phase "đang chạy"; một đường xử lý lỗi mạng |
| Người điều phối gọi công cụ, công cụ trao nhau bằng dữ liệu | `runSlice` đọc ghi ô một lần; chặng trả dữ liệu; Extension băm trên dữ liệu envelope đưa |
| Tiến trình lớn ghép từ tiến trình nhỏ | Lượt tay, lượt nền, Giữ phiên chung người điều phối Lượt; đăng nhập thử gọi Tiến trình đăng nhập; chuỗi nền gọi Lượt |

### K10. Những chỗ tài liệu 09 phải đổi theo (làm ở C4)

- 09/02 "Chuỗi trong một lần hỏi" mục 4: bỏ "chờ chấp thuận" khỏi định nghĩa "đang chạy"; mục 6: dừng nền có hiệu lực ngay.
- 09/02 "Thứ tự trong một kỳ" bước 3: hỏi chấp thuận ở đầu chặng đẩy, chờ duyệt nằm ở cổng chặng đẩy.
- 09/01 và 09/06: Extension giữ khóa, GAS giữ bản mã; đăng nhập do GAS điều phối.
- 09/01 "Cổng điều khiển": danh sách lệnh theo K3.

## Bảng đích (A3)

Bảng chi tiết của kiến trúc đích, dựng từ kiểm kê A1 và bảng A2. Ánh xạ từng hàm cũ sang đích nằm ở tệp đi kèm `2026.10.24 Ánh xạ hàm đồng bộ FBM (A3).md` (551 dòng, chỉ ghi hàm không giữ nguyên; hàm vắng mặt là giữ). Mục này thắng tệp đi kèm khi vênh. Cả hai bị xóa ở C4 sau khi luật đã vào tài liệu 09.

### A3.1 Cây tiến trình chi tiết

Mỗi dòng là một người điều phối: nó gọi những gì theo thứ tự, sở hữu state nào, thay cho những hàm cũ nào.

| Người điều phối | Gọi theo thứ tự | State sở hữu | Thay cho |
|---|---|---|---|
| Cửa lệnh `controlDispatch` | cầm khóa → tra bảng lệnh K3 → gọi người điều phối của lệnh → trả kết quả đã lọc qua một công cụ `publicResult` (bỏ `session`, `cursor`, mọi trường bí mật) | khóa điều phối | `controlDispatchLocked`, 30 điểm vào `fbm*` ở `FbmSyncService.js` (thành adapter một dòng), `fbmSyncRelayHandle` và 4 loại tin ngoài cửa, các hàm heartbeat tự cầm khóa, `fbmPublicResult`/`transportValue` (2 bản) |
| Lát `runSlice` | `stateRead` một lần → `sliceGuards` (kiểm thuần: công tắc, ngân sách, cờ dừng, request quá hạn) → bảng `cursor.kind` → người điều phối chặng trả `{ patch, next hoặc end }` → `requestIssue` (kiểm endpoint, cấp id, đặt hạn, bọc envelope) → `stateWrite` một lần → `processBookMark` nếu lượt kết thúc → ghi Log một lần | ô lượt `FBM_SYNC_STATE_V1` | `continueStep` (18 `stateWrite`), `nextEnvelope` (4 đọc, 5 ghi), `continue`, `pauseForRuntimeLimit`, `sessionSystemEnvelope`, `cursorStartEnvelope` |
| Chuỗi nền `heartbeatRun` | theo K5: `machineCheck` → `staleRunCheck` (đóng lượt `SYNC_ABANDONED_RUN`, ghi Log kèm hộp đen) → `pushGateDue` → `processDue` (đọc sổ tiến trình) → gọi Lượt, hoặc trả `request: null` | không (đọc sổ tiến trình, cổng chặng đẩy, máy nền) | `fbmSyncHeartbeat*`, `chainStart`, `schedulerPickDue`, `keepaliveStart`, `recoverStaleRun` (gốc N7), `fbmSyncHeartbeatTransportFailure` |
| Lượt `runStart(mode, scan, origin, afterLogin)` | `runOpen` (một patch: dọn kho làm việc lượt trước, đặt ô) → Cổng phiên → các chặng theo `scan` → Bước đếm khách → `runClose` (mọi đường kết thúc: xong, lỗi, hủy, bỏ lượt) | kho làm việc của lượt (A3.3) | `startRun`, `stateStart` (7 kho không nguyên tử), `finishPullRun`, `pullFinishOrPush`, `activityStagesContinue`, `runTail`, `recountStart`, 4 chỗ tự đặt `phase='error'` (về một công cụ `runFail`) |
| Cổng phiên `sessionGate` | probe → còn phiên: trả về chặng đang chờ; hết phiên: gọi Tiến trình đăng nhập với `afterLogin = nối lại cursor`; lỗi mạng: lớp lỗi chung K7 | `metadata.sessionGate` trong ô lượt | 12 hàm `sessionGate*`, `continueSessionGate`, `pageIdentityReloadRequest` |
| Tiến trình đăng nhập `loginRun(state, afterLogin)` | trang Login → `loginSaltExtract` → database/đơn vị → `loginUnitPick` → Login (envelope có chỗ trống băm + bản mã từ cổng credential) → `loginResultClassify` → trang tài khoản → `authorizeExtract` → `identityMatchDecide` → lệnh ghi khóa trang → `loginAttemptMark` → `afterLogin` | cursor đăng nhập trong ô lượt; `FBM_LOGIN_ATTEMPT_V1` | `beginAutoLogin`, `loginCursorNext`, `loginResumeRequest`, `loginTestRequest`, `loginForceRequest`, `loginTestResult`, `loginIdentityContinue`, nhánh `testOnly`/`purpose`/`manual`, `requestForCursor` (dựng lại login với `testOnly:false`); phía Extension `executeLogin`, `storeLoginPageKey`, `loginValueFromPage`, `loginListValue`, `showFbmHomeAfterLogin` |
| Chặng quét khách | `scan_job`/`scan_chunk` → `customerScanRecord` (tính) → đánh dấu đã thấy → hết gói: kiểm đủ (`seen` = `total`) → trả `customerTotal` cho `runClose` | kho `SEEN_customer_*` | `customerScanChunk`, `customerScanEnd`, `customerScanMark` (4 việc), `beginCustomerPull`, `scanJobRestart` |
| Chặng lớp giao dịch | lớp top → lớp đọc mới → vòng xoay chi tiết (con trỏ nhận từ sổ tiến trình, trả con trỏ mới cho `runClose`) → lô giao dịch | kho `READ_*`, `TOP_ORDER_`, `READ_WAIT`, `GATE_LOOKUP_`, `SEEN_customer_activity_*` | `activityTop*`, `activityRotation*` (bỏ ghi con trỏ trong công cụ), `activityBatch*`, `activityScan*`, `readList*`, `activityScanToWindows` gọi từ `Scheduler.js` |
| Chặng kéo về | `pullParse` (không sửa đầu vào, parse một lần) → `hash` một lần mỗi bản ghi → ghi Sheet qua cửa ghi lõi → patch | không | `pullRecords`, `pullWrite` (~200 dòng, 4 lần hash), `parse` |
| Chặng đối soát | đọc local một lần mỗi lát → `categoryGate` theo bản chụp → `pushEligible` (một định nghĩa) → có xung đột: mở xung đột | không | `preflightLocalStep`, `preflightCandidates`, `preflightPushPermissions` và `pushReview` (hai định nghĩa "cần đẩy"), `stateCategoryGate`, bốn hàm rời `syncPermission`/`activityParentReady`/`isPushFrozen`/`isTemporaryRecord` |
| Chặng đẩy | `pushGateDecide` (sạch / vượt ngưỡng → chờ duyệt / dấu duyệt khớp → đẩy) → mỗi ứng viên: `pendingPushSet` → request ghi → `pushResultApply` (một công cụ: `pushRowChange`, xóa mục chờ, ghi Log ở mọi nhánh kể cả bận/đổi/vắng) | cổng chặng đẩy, `PENDING_PUSHES`, `PUSH_FAILURES` | 27 hàm `PushFlow.js` (mọi hàm con tự ghi state và dựng envelope), `markPushResult` (ghi Sheet trước `pendingPushSet`), `markPushError` (lỗi 3), `nextPushRequest` (2 lần ghi mỗi ứng viên), `continuePush`, `approvalThreshold` (catch rỗng), phase `awaiting_approval` |
| Bước đếm khách | đếm → `customerCountChanged(total, baseline)` thuần → lệch: gọi Lượt quét nhanh | không | `CustomerCount.js` (đọc mốc trong công cụ) |
| Xung đột | `open_conflict`/`confirm_conflict`: đọc lại local và FBM trong khóa → `conflictDecide` thuần từ lựa chọn từng trường → ghi một lần cuối | đếm xung đột (một người ghi) | `Conflict.js` (3 người ghi `conflictCount`), Sidebar `fbmSyncConflictDecision`, `fbmSyncResolveConflict`, `fbmSyncConflictSheetChanged` |
| Lưu cài đặt `settingsSave(section, values)` | kiểm hết các mục → ghi một lần → trả `statusView`; công tắc tổng, công tắc nền, máy nền là các mục | cổng cài đặt chung | `syncSettingsSave`, `accountSettingsSave`, `extensionConfigSave`, `backgroundScheduleSave`, `loginConfigPolicySave` (không cầm khóa), `setMasterEnabled`, `setBackgroundEnabled`, `fbmSaveSyncSettings` (lỗi 7) |
| Lưu kết nối `connectionSave` | kiểm danh tính → ghi credential qua cổng credential → ghi kho kết nối → hỏng thì hoàn tác theo thứ tự ngược; xóa credential thì trả kèm lệnh cho Extension xóa khóa | kho kết nối, `FBM_CREDENTIAL_V1` | `connectionSave`, `bindingWrite` (đọc hai Sheet trước khi so), `bindingClear` (danh sách phase riêng), `loginConfigSave`, `loginConfigClearCredential`, `loginConfigRepairUsername`, Sidebar `fbmSyncDeleteLoginCredential` (xóa Extension trước GAS) |
| Đọc trạng thái `status` | đọc ô lượt, cổng chặng đẩy, sổ tiến trình, cài đặt mỗi thứ một lần → `statusViewBuild` thuần trả `running`, `tone`, `actions`, `progress`, `pendingApproval`, `warnings`, `issues`; không ghi | không | `statusView` (đọc trên 6 kho, thiếu `running`), `fbmSyncStatusRead` (ghi trong lúc đọc), `statusMetadata`, `statusLabel` (thiếu `waiting_session`), mọi chỗ Sidebar suy trạng thái |
| Extension `relayLoop` | alarm → `relayCall('ask')` → envelope → `prepareFbmTab(meta)` (chỉ làm lệnh có trong envelope) → `credentialFill` nếu có chỗ trống băm → `executeFetch` → `relayCall('submit')` → lặp tới `request: null` | hộp đen | `fbmHeartbeatNow`, `relayRun`, `RELAY_CHANNELS`, `postRelay` (lỗi 5), `fbmTransportProbe` (sang dev), đường `FBM_EXECUTE_REQUEST` riêng, `sendToFbmTab`, `hydrateLoginRequest`, `callsFbm`, nhánh tự tải lại tab |
| Sidebar `sidebarRun` | gửi lệnh → vẽ `statusView` → có envelope thì đưa Extension → nộp bằng lệnh `continue` → lặp | RAM hiển thị | `fbmSyncLoop` và `fbmSyncLoginTestLoop` (hai vòng), `fbmSyncForceLogin`, `fbmSyncAfterBackground`, `fbmSyncWaitForBackgroundIdle` (N11) |

### A3.2 Danh mục công cụ theo loại

| Loại | Đầu vào | Đầu ra | Ai được gọi | Không được | Ví dụ đích |
|---|---|---|---|---|---|
| Đọc | khóa kho hoặc vùng Sheet | dữ liệu đã parse; hỏng thì ném lỗi có mã | người điều phối | ghi, kiểm nghiệp vụ, trả giá trị mặc định khi hỏng | `stateRead`, `localScan`, `credentialRead`, `processBookRead`, `settingsValue`, `reloadJournalRead` của lõi |
| Kiểm thuần | dữ liệu | `{ ok, code, message }` hoặc một quyết định | người điều phối, công cụ tính | đọc kho, ghi, Log, sửa đầu vào, mở cửa khi thiếu hàm | `sliceGuards`, `pushGateDecide`, `pushEligible`, `identityMatchDecide`, `loginResultClassify`, `customerCountChanged`, `settingsValidate` |
| Tính thuần | dữ liệu (kể cả thời điểm `now`) | dữ liệu mới | bất kỳ | đọc/ghi, `new Date()` bên trong | `hash` (một hàm, một hình dạng bản ghi), `customerScanRecord`, `authorizeExtract`, `loginSaltExtract`, `statusViewBuild`, các hàm dựng request |
| Ghi | dữ liệu đã kiểm | `{ ok }`; hỏng thì ném | người điều phối, ở cuối lát | tự kiểm lại, tự đọc state khác, `catch` rỗng | `stateWrite`, `documentPropertySet` (đo byte thật, ném khi vượt trần), `processBookMark`, `pushGateWrite`, `pushRowChange`, `logEvent` |
| Cổng | lệnh + dữ liệu cho đúng một kho | kết quả | người điều phối | đường ghi tắt vào kho đó | `requestIssue`, cổng cài đặt, cổng credential, cổng chặng đẩy, cổng máy nền |
| Người điều phối chặng | bản sao state của lát + response | `{ patch, next hoặc end }` | `runSlice` qua bảng `cursor.kind`, hoặc người điều phối cha | `stateRead`/`stateWrite`, dựng envelope, ghi Log rải rác | các hộp ở A3.1 |
| Adapter | tham số từ ngoài | kết quả của `controlDispatch` | `google.script.run`, `doPost` | logic, khóa, Log riêng | các `fbm*` trong `FbmSyncService.js`, `fbmSyncRelayHandle` |
| Công cụ vật lý Extension | lệnh trong envelope | kết quả thô hoặc lỗi có mã thật | `relayLoop` | rẽ theo `kind`, tự thử lại, đổi mã lỗi | `prepareFbmTab`, `executeFetch`, `gapWait`, `credentialFill`, `relayCall`, `noteChainStep` |
| Sidebar | `statusView`, thao tác người dùng | lệnh gửi GAS, giao diện | `sidebarRun`, sự kiện giao diện | suy trạng thái, quyết nghiệp vụ, `window.confirm`, giá trị mặc định thay ô trống | `extensionRpc` (một bảng chờ thay 5 bảng), các hàm vẽ |

### A3.3 Ánh xạ kho cũ sang đích và luật dọn

| Kho cũ | Đích | Chủ, cổng | Luật dọn |
|---|---|---|---|
| `FBM_SYNC_STATE_V1` | giữ | `runSlice` | ghi đè; cỡ chặn bởi trần byte; `reset_state` là lối thoát |
| `FBM_SYNC_DONE_*` ×4, `FBM_SYNC_RETRY_*` ×4, `FBM_SYNC_CUSTOMER_BASELINE_V1`, `FBM_SYNC_DETAIL_CURSOR_V1` | gộp `FBM_SYNC_PROCESS_BOOK_V1`: bốn mục `customerFull`, `activityFull`, `detail`, `heartbeat`, mỗi mục `{ doneAt, failures, retryAt }`; thêm `customerFull.baseline`, `detail.cursor` | `processBookMark`, `runSlice` gọi khi lượt kết thúc | cỡ cố định bốn mục, ghi đè; tắt tiến trình thì xóa lịch thử lại của mục đó |
| `FBM_SYNC_SETTINGS_V1`, `FBM_ACCOUNT_SETTINGS_V1`, `FBM_SYNC_EXTENSION_CONFIG_V1`, `FBM_SYNC_BACKGROUND_SCHEDULE_V1`, `FBM_SYNC_ENABLED`, phần chính sách của `FBM_LOGIN_CONFIG_V1` | cổng cài đặt chung, mỗi nhóm một mục theo mẫu `defaults_fbm_pull`; thêm mục máy nền (V24) | `settingsSave` / `settingsValue` | ghi đè; đọc không ghi lại; khóa hỏng thì báo lỗi kèm nút "Đặt về mặc định" (hiện chưa có lối thoát) |
| phần credential của `FBM_LOGIN_CONFIG_V1` | `FBM_CREDENTIAL_V1` `{ credentialRef, envelope, usernameHint }` | cổng credential (`save_credential`) | xóa khi người dùng xóa hoặc đổi danh tính; GAS gửi `credentialRef` đang dùng cho Extension để Extension xóa khóa cũ |
| phần lần thử của `FBM_LOGIN_CONFIG_V1`, `FBM_AUTO_LOGIN_LAST_ATTEMPT_V1` | `FBM_LOGIN_ATTEMPT_V1` `{ lastAttemptAt, nextRetryAt, lastLoginAt, lastError }`; khóa `LAST_ATTEMPT` xóa (chỉ ghi, không ai đọc) | `loginAttemptMark` (không chạm credential, bịt lỗi 8) | cỡ cố định, ghi đè |
| `FBM_SYNC_BINDING_V1`, `FBM_SYNC_BINDING_CLEAR_V1` | gộp `FBM_CONNECTION_V1` `{ binding, clearedFrom }` | `connectionSave` | ghi đè; `clearedFrom` xóa khi liên kết mới ghi xong |
| `FBM_SYNC_PUSH_CLEAN_V1` | đổi tên `FBM_SYNC_PUSH_GATE_V1` `{ status: clean hoặc pending, fingerprint, count, journalRevision, at, approvedFingerprint }` | cổng chặng đẩy | ghi đè; về `clean` khi đẩy xong hoặc tập ứng viên rỗng |
| `FBM_SYNC_PENDING_PUSHES_V1` | giữ | chặng đẩy | xóa mục khi kết quả ghi đã áp; đối soát xóa mục mồ côi (bản ghi đã có mã FBM hoặc không còn trên Sheet); mục quá tuổi theo `sentAt` chỉ báo Log và Sidebar, **không tự xóa** vì xóa có thể làm tạo trùng (FBM-027) |
| `FBM_SYNC_PUSH_FAILURES_V1` | giữ | chặng đẩy | xóa mục khi bản ghi đổi hash, đẩy được, xung đột đã giải hoặc không còn; thêm trần số mục |
| `FBM_SYNC_PUSH_LIST_*`, `FBM_SYNC_READ_NEW_*`, `FBM_SYNC_READ_NEW_DONE_*`, `FBM_SYNC_READ_WAIT`, `FBM_SYNC_TOP_ORDER_*`, `FBM_SYNC_GATE_LOOKUP_*`, `FBM_SYNC_SEEN_*` (bỏ phạm vi `activity` không tồn tại) | kho làm việc của lượt: một danh sách tiền tố khai một chỗ; `READ_NEW` và `READ_NEW_DONE` gộp một danh sách có thẻ nếu B7 đo thấy vừa trần, không thì giữ hai | Lượt (`runOpen`/`runClose`) | `runClose` xóa hẳn khóa (không ghi rỗng) ở mọi đường kết thúc; `runOpen` xóa thêm một lần phòng lượt trước chết giữa chừng; `READ_WAIT` thêm trần byte |
| `FBM_SYNC_PREVIEW_V1` | giữ | Lượt | xóa ở `runOpen` (bản xem trước phải còn sau lượt để người dùng xem) |
| `FBM_SYNC_TRACE_V1` | giữ | công cụ trace | 24 dòng và trần byte; ghi qua `documentPropertySet` |
| `FBM_SYNC_RELAY_URL_V1` (ScriptProperties) | giữ, gắn `scriptId` | `relayUrlRecord` | ghi đè |
| `FBM_SYNC_KEY` (ScriptProperties) | giữ; sinh ở một chỗ `relayKeyEnsure` (hiện hai chỗ) | cổng relay | xoay khóa thì ghi đè |
| `fbmCredentialVault:<ref>` (chrome) | chỉ giữ `{ ref, key }`, bỏ bản mã | Extension | ref khác ref GAS gửi kèm câu trả lời heartbeat thì xóa; GAS báo xóa credential thì xóa hết |
| `fbmWebAppUrl`, `fbmSyncKey`, `fbmSpreadsheetId`, `fbmPollMinutes`, `fbmRunOnStartup` (chrome) | giữ; một bộ đọc, một hằng tên khóa, một hàm kẹp phút; nhịp hỏi là bản sao cài đặt GAS | Extension | ghi đè khi cấu hình lại |
| `fbmChainTrail` (chrome) | giữ làm hộp đen duy nhất, thêm mã thật và `httpStatus` của lần nộp hỏng gần nhất | Extension | GAS ghi Log xong trả `trailAck`, Extension xóa (hiện lần hỏi sau mang lại hộp đen cũ) |
| `fbmRelayLastStatus`, `fbmHeartbeatLastStatus` (chrome) | xóa (không ai đọc) | — | C2 xóa khóa cũ một lần |
| RAM Sidebar `running`, `cancelRequested`, `backgroundStopping`, `backgroundWait`, `ownRunId`, `backgroundDirection` | xóa, đọc từ `statusView` | — | — |
| RAM Sidebar 5 bảng chờ RPC | gộp một bảng của `extensionRpc` | Sidebar | xóa mục khi có kết quả hoặc hết hạn |
| RAM Sidebar `pendingLoginEnvelope` | giữ (là bản mã, không có khóa) | Sidebar | xóa khi gõ lại ô hoặc lưu xong |

Không phải kho (A1 bắt nhầm): `FBM_SYNC_EXCEPTION`, `FBM_SYNC_PERMISSION_INVALID`, `FBM_SYNC_SETTINGS_STORAGE_UNAVAILABLE` là mã lỗi. `SHIN_BOOK_BINDING_V1`, `SHIN_RECORD_HOLDS_V1`, `reloadJournal` thuộc lõi; `fbm_sync` chỉ đọc qua hàm của lõi.

### A3.4 Quyết định của A3 ở chỗ agent vênh nhau

- Con trỏ vòng xoay và số khách mốc vào sổ tiến trình, không giữ riêng hay đưa vào cổng chặng đẩy. Cả hai là kết quả của một tiến trình nền, sống qua lượt, chỉ cần ghi khi tiến trình đó xong. Ghi ở `runClose` thay vì giữa lượt cũng bịt lỗi 9 bằng kiến trúc: hiện số khách mốc được ghi ngay khi quét đủ danh sách (`PullFlow.js:297`), trước chặng giao dịch và chặng đẩy.
- Bản xem trước dọn ở đầu lượt kế, không ở cuối lượt.
- Kho lệnh ghi đang chờ không dọn theo tuổi tự động (lý do ở A3.3).
- Gộp hai danh sách đọc mới chờ số đo ở B7.

### A3.5 Kết luận nặng của agent đã tự đọc lại

| # | Kết luận A2 | Kết quả đọc lại |
|---|---|---|
| 1 | Sidebar chép danh sách phase 5 lần thiếu `waiting_session` | Đúng; `statusLabel` cũng thiếu nhãn. Lúc chờ đăng nhập Sidebar hiện nút "Bắt đầu" thay vì "Dừng" |
| 2 | `start` ở `ControlPort.js` không truyền `identity` | Đúng và có hậu quả: `fbmStartIdentityCheck` gửi bốn ô đang nhập (`FbmSyncService.js:24`), `ControlPort.js:13` bỏ đi, `PullFlow.js:67` rơi về liên kết đã lưu. Nút "Kiểm liên kết" kiểm liên kết cũ chứ không kiểm cái người dùng đang nhập |
| 3 | `markPushError` thoát trước Log | Đúng (`PushFlow.js:295-305`): đã cộng đếm lỗi và sổ lỗi rồi mới thoát khi bận/đổi/vắng, không có dòng Log |
| 4 | `Probe.js` đảo customer/activity | Đúng, chỉ ảnh hưởng ca dò; `Probe.js` chuyển sang `server/dev` |
| 5 | Extension bỏ kết quả FBM khi nộp gặp 404 hoặc không phải JSON | Đúng (`service_worker.js:468-470` biến thành `{ok:false}`, `:670-672` kết thúc chuỗi). GAS chỉ biết khi request quá hạn |
| 6 | `fbmSyncCancel` trả state có `authorized` | Đúng và nặng hơn báo cáo: `fbmCancelSync` không qua `fbmPublicResult`, trả nguyên ô lượt gồm `session.cookie`, `customerAuthorized`, `activityAuthorized` về Sidebar (`EntryPoints.js:43`, `State.js:206`). Trái luật không để lộ cookie và token; đưa vào B1 |
| 7 | Lưu cài đặt đổi công tắc tổng trước khi kiểm | Đúng (`FbmSyncService.js:75-79`): công tắc đổi xong mới kiểm và lưu phần còn lại; phần sau hỏng thì công tắc đã đổi |
| 8 | `autoLoginMark*` có thể khôi phục credential vừa xóa | Hạ mức: mỗi hàm đọc lại khóa ngay trước khi ghi nên không khôi phục được trong một lời gọi. Nguy cơ thật là mất cập nhật khi `fbmSaveLoginPolicy` (không cầm khóa, `FbmSyncService.js:86`) chạy cùng lúc với lượt đăng nhập. Tách kho ở A3.3 bịt cả hai |
| 9 | `customerBaselineWrite` ghi mốc sớm | Đúng, ảnh hưởng thấp vì tiến trình lỗi được chạy lại theo backoff; A3.4 dời vào `runClose` |
| 10 | Phạm vi "thiếu hàm thì mở" | Đúng: `typeof FbmSync.scope === 'function' ? ... : null` ở `PushCandidates.js:77`, tương tự ở `GridRead` (3 chỗ), `ActivityLayers` (1), `ActivityBatch` (2) |
| 11 | Cầu nối iframe và executor không kiểm nguồn | Hạ mức: `CRM_FBM_CANCEL` và `CRM_FBM_REQUEST` có kiểm origin, nonce, phiên, chỉ thiếu kiểm cửa sổ nguồn; nonce chỉ Sidebar biết nên nguy cơ thấp. Executor fetch URL từ envelope không kiểm miền; thêm một phép kiểm miền chung ở B10 |

### A3.6 Điểm cần chủ dự án quyết (trình ở A4)

- Việc quét danh sách khách: một lần trả của FBM lớn hơn trần một lần nộp qua relay, nên Extension cắt thành nhiều gói, giữ phần chưa gửi trong RAM của tab FBM và chọn sẵn cột (`scanJob`, `scanChunks`). K1 cấm Extension giữ response qua hai lần gọi. Có hai cách: (a) ghi ngoại lệ ở K1: Extension được cắt gói một response đang quét, mất gói khi tab tải lại thì GAS quét lại từ đầu (hiện đã có `scanJobRestart`); (b) GAS xin FBM từng trang nhỏ, tốn thêm request FBM mỗi lượt. Đề xuất (a), vì giữ RAM tab ở đây là phép cắt gói kỹ thuật chứ không phải quyết định nghiệp vụ.

## Lộ trình đợt refactor (chờ chủ dự án duyệt)

Phạm vi: GAS `fbm_sync/` và `server/service/FbmSyncService.js`, Sidebar `client/sync/`, Extension phía FBM (`2_ShinCRM_Extension/`). Đích: kiến trúc ở mục trên, ba quy tắc cứng đúng cho mọi hàm, có test tĩnh giữ, không còn tàn dư. Ba mốc chủ dự án duyệt: cuối A (bảng đích), giữa B (sau mỗi bước có việc cần kiểm trên Sheet), cuối C (trước khi gộp `main`).

### Giai đoạn A — kiểm kê và thiết kế chi tiết (không sửa code)
- [x] A0. Chốt kiến trúc đích (mục "Kiến trúc đích").
- [x] A1. Script kiểm kê (trong scratchpad): (1) mọi hàm của phạm vi kèm tệp, số dòng, các lệnh đáng chú ý (`stateRead`/`stateWrite`, ghi DocumentProperties, đọc/ghi Sheet, `logEvent`, `nextEnvelope`, `statusView`, `catch` rỗng, nhánh `typeof ... === 'function'`), gắn cờ hàm dài hoặc gọi nhiều loại lệnh; (2) mọi khóa DocumentProperties và `chrome.storage` của FBM kèm hàm đọc, hàm ghi, hàm xóa. Kết quả (2026-10-24): 58 tệp, 1.065 hàm, 66 hàm bị gắn cờ (dài trên 60 dòng, chạm từ ba loại lệnh state/kho/Sheet/envelope/status trở lên, hoặc có `catch` rỗng); 32 khóa DocumentProperties của FBM và 11 khóa `chrome.storage`. Bảng nằm ở scratchpad phiên (`inv_functions.tsv`, `inv_stores.md`), không đưa vào repo.
- [x] A2. Agent Sonnet đọc các hàm bị gắn cờ và từng kho theo nhóm tệp, trả theo mẫu cố định (hàm làm những việc gì, gợi ý tách; kho dùng làm gì, sống bao lâu, ai dọn); đọc trọn các tệp chưa đọc (màn vẽ Sidebar, `FbmSyncService.js`); kiểm bản mã GAS giữ có cùng khóa với Extension không (để biết có phải nhập lại mật khẩu). Kết quả (2026-10-24): 7 agent đọc trọn khoảng 950 hàm của 7 nhóm tệp, khoảng 510 hàm có vi phạm; bảng từng hàm và kho nằm ở scratchpad phiên (`a2_G1.md`…`a2_G7.md`), không đưa vào repo. Mật khẩu: bản mã GAS giữ ở `FBM_LOGIN_CONFIG_V1` đúng là bản Extension tạo bằng khóa trong `fbmCredentialVault`, nên tách khóa và bản mã (K8) không phải nhập lại mật khẩu. Lỗi thật mới ngoài N1–N11, A3 tự đọc lại trước khi đưa vào phương án: (1) Sidebar chép danh sách phase 5 lần đều thiếu `waiting_session` (`fbmSync.html`, `screens/run.html`), đã kiểm thấy đúng; (2) lệnh `start` ở `ControlPort.js` không truyền `identity`, đã kiểm thấy đúng, còn phải xem lượt kiểm liên kết có đi đường này không; (3) `markPushError` thoát trước khi ghi Log khi cửa ghi trả bận/đổi/vắng nhưng đã cộng sổ lỗi; (4) `Probe.js` xét loại bản ghi theo `customerFbmCode` nên đảo customer/activity, đã kiểm thấy đúng (chỉ ảnh hưởng ca dò); (5) Extension đổi 404 hoặc response không phải JSON thành `{ok:false}` và bỏ kết quả FBM đã lấy (`service_worker.js`, gần N11); (6) `fbmSyncCancel` trả cả state có `authorized` cho Sidebar; (7) lưu cài đặt đổi công tắc tổng trước khi kiểm (`FbmSyncService.js`); (8) `autoLoginMark*` ghi đè cả cấu hình đăng nhập nên có thể khôi phục credential vừa xóa; (9) `customerBaselineWrite` ghi mốc trước khi chặng giao dịch và chặng đẩy chạy; (10) phạm vi "thiếu hàm = mở" ở `GridRead`, `ActivityLayers`, `PushCandidates`, `ActivityBatch`; (11) cầu nối iframe và executor không kiểm nguồn tin và origin.
- [x] A3. Bảng đích trong tệp này: cây tiến trình chi tiết (người điều phối, công cụ nó gọi, state nó sở hữu); danh mục công cụ theo loại (đầu vào, đầu ra, ai được gọi); ánh xạ mỗi hàm cũ → đích (giữ / tách / gộp / xóa); ánh xạ mỗi kho cũ → đích (giữ / gộp / xóa, luật dọn). Hàm hay kho không ánh xạ được là sót hoặc code chết. Tự đọc lại các kết luận nặng của agent. Kết quả (2026-10-24): mục "Bảng đích (A3)" và tệp `2026.10.24 Ánh xạ hàm đồng bộ FBM (A3).md`. Đọc lại 11 lỗi mới của A2: 9 đúng (lỗi 2 và 6 nặng hơn báo cáo), 2 hạ mức; một điểm chờ chủ dự án quyết (A3.6).
- [ ] A4. Sửa P1–P10 theo kiến trúc đã chốt (P6 thay bằng cổng chặng đẩy), thêm P11 (tách hàm ôm nhiều việc), P12 (test tĩnh chặn tái phạm), P13 (gộp kho và luật dọn); mỗi mục đủ ba phần (a)(b)(c). **Trình chủ dự án duyệt.** Đã viết (2026-10-24), chờ duyệt.
- [ ] A5. Viết checklist chi tiết từng bước B vào tệp này (bước con, dữ liệu vào/ra, test, việc chủ dự án cần kiểm trên Sheet).

### Chuẩn bị trước giai đoạn B (chủ dự án làm)
- [ ] Tạo một bản sao Sheet DEV làm bản lưu (Tệp › Tạo bản sao), không dùng để chạy.
- [ ] Đồng ý thời điểm bắt đầu; trong lúc B chạy, gặp gì lạ trên Sheet thì báo.

Cách chạy thử (b): mỗi lần thử chiều ghi FBM, AI bật giới hạn phạm vi chỉ `ALT00010` và tắt đồng bộ nền bằng lệnh, thử xong trả lại như cũ và báo. Mỗi bước B đẩy lên Sheet DEV đang dùng thật nên phải chạy trọn vẹn và qua test trước khi đẩy.

### Giai đoạn B — sửa; mỗi bước: test offline, `node tests/gas.js ... --push` trên DEV, sửa tài liệu liên quan, commit riêng, tick checklist
- [ ] B0. Test tĩnh khung "danh sách ngoại lệ chỉ được giảm": vi phạm hiện có ghi thành ngoại lệ, mỗi bước sau xóa bớt; thêm vi phạm mới là đỏ.
- [ ] B1. Lỗi thật nhỏ, độc lập: dừng nền ngay và Sidebar chờ theo `running` (P10); `fbmCancelSync` trả cookie và token về Sidebar (lỗi 6); Kiểm liên kết bỏ bốn ô đang nhập (lỗi 2); `markPushError` thiếu Log (lỗi 3); lưu cài đặt đổi công tắc trước khi kiểm (lỗi 7); mất `identityBlocks`; `approvalThreshold` bỏ `catch`; các `catch` rỗng và `.catch` trả null ở GAS và Sidebar. Chủ dự án kiểm: bấm đồng bộ khi nền đang chạy, chọn dừng.
- [ ] B2. Một cửa lệnh, luật chiếm ô, Tiến trình đăng nhập có người điều phối riêng, Sidebar một vòng (P1). Chủ dự án kiểm: Đăng nhập thử, Đăng nhập ép, đồng bộ tay.
- [ ] B3. Lát và chặng (P2): công cụ kiểm thuần, cổng phát request, bảng `cursor.kind`, một hàm nối chuỗi nền; phần GAS của máy chạy nền (V24).
- [ ] B4. State truyền qua công cụ, tách các hàm ôm nhiều việc (P3, P11).
- [ ] B5. Chấp thuận qua cổng chặng đẩy (K6). Chủ dự án kiểm (phạm vi `ALT00010`, ngưỡng tạm đặt 1): sửa một bản ghi → thông báo chờ duyệt; Ctrl+Z → tự hết; sửa lại → Chấp thuận → đẩy.
- [ ] B6. Cài đặt FBM về cổng chung (P4), hàm chuyển một lần chạy trên DEV. Chủ dự án kiểm: các màn cài đặt giữ đúng giá trị cũ.
- [ ] B7. Gộp kho và luật dọn (P13), hàm chuyển một lần.
- [ ] B8. Một công cụ cho mỗi phép tính trùng (P9).
- [ ] B9. Hợp đồng dữ liệu Sidebar (P7; phần vẽ lại màn làm ở Todo mục 4).
- [ ] B10. Extension: một cổng gọi GAS, bỏ quyết tải lại tab, đăng nhập do GAS điều phối, tách khóa và bản mã, mã máy (P5 phần Extension, P8, K8, V24). Chủ dự án tải lại Extension rồi kiểm: Đăng nhập thử, tự đăng nhập khi hết phiên, lượt nền chạy.

### Giai đoạn C — dọn tàn dư và nghiệm thu (bắt buộc trước khi gộp `main`)
- [ ] C1. Xóa mọi hàm và kho có đích "xóa"; tìm tên trong toàn repo (GAS, Sidebar, Extension, tests, `server/dev/`, `DEV_RUNNER_ALLOWED`) phải ra 0.
- [ ] C2. Xóa nhánh tương thích đời cũ (state cũ, khóa cũ, trigger cũ, lệnh Extension cũ) sau khi các hàm chuyển một lần đã chạy trên DEV; xóa khóa DocumentProperties cũ bằng hàm dọn một lần rồi xóa luôn hàm dọn.
- [ ] C3. Test tĩnh "hàm không ai gọi" cho `fbm_sync/`, `client/sync/`, Extension; danh sách ngoại lệ của B0 phải rỗng.
- [ ] C4. Sửa tài liệu 09 theo K10 và `Quy tắc theo loại phiên/Đồng bộ FBM.md` (chỉ ghi luật và vị trí, không chép bước), cập nhật `Cây thư mục code.md`, xóa giấy nháp đích khỏi tệp phiên.
- [ ] C5. Chạy bộ test đầy đủ, nghiệm thu trên DEV.
- [ ] C6. Chạy thật vài ngày trên Sheet DEV, AI đọc `Log` mỗi ngày; không có lỗi mới thì **hỏi chủ dự án trước khi gộp `main`**.
- [ ] C7. Sau khi gộp: đổi tệp phiên sang `[Đã xử lý]`, cập nhật Todo và `AGENTS.md` mục 1.
