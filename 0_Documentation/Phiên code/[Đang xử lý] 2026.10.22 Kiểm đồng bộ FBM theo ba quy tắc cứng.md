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

## Lộ trình đợt refactor (chờ chủ dự án duyệt)

Phạm vi: GAS `fbm_sync/` và `server/service/FbmSyncService.js`, Sidebar `client/sync/`, Extension phía FBM (`2_ShinCRM_Extension/`). Đích: kiến trúc ở mục trên, ba quy tắc cứng đúng cho mọi hàm, có test tĩnh giữ, không còn tàn dư. Ba mốc chủ dự án duyệt: cuối A (bảng đích), giữa B (sau mỗi bước có việc cần kiểm trên Sheet), cuối C (trước khi gộp `main`).

### Giai đoạn A — kiểm kê và thiết kế chi tiết (không sửa code)
- [x] A0. Chốt kiến trúc đích (mục "Kiến trúc đích").
- [ ] A1. Script kiểm kê (trong scratchpad): (1) mọi hàm của phạm vi kèm tệp, số dòng, các lệnh đáng chú ý (`stateRead`/`stateWrite`, ghi DocumentProperties, đọc/ghi Sheet, `logEvent`, `nextEnvelope`, `statusView`, `catch` rỗng, nhánh `typeof ... === 'function'`), gắn cờ hàm dài hoặc gọi nhiều loại lệnh; (2) mọi khóa DocumentProperties và `chrome.storage` của FBM kèm hàm đọc, hàm ghi, hàm xóa.
- [ ] A2. Agent Sonnet đọc các hàm bị gắn cờ và từng kho theo nhóm tệp, trả theo mẫu cố định (hàm làm những việc gì, gợi ý tách; kho dùng làm gì, sống bao lâu, ai dọn); đọc trọn các tệp chưa đọc (màn vẽ Sidebar, `FbmSyncService.js`); kiểm bản mã GAS giữ có cùng khóa với Extension không (để biết có phải nhập lại mật khẩu).
- [ ] A3. Bảng đích trong tệp này: cây tiến trình chi tiết (người điều phối, công cụ nó gọi, state nó sở hữu); danh mục công cụ theo loại (đầu vào, đầu ra, ai được gọi); ánh xạ mỗi hàm cũ → đích (giữ / tách / gộp / xóa); ánh xạ mỗi kho cũ → đích (giữ / gộp / xóa, luật dọn). Hàm hay kho không ánh xạ được là sót hoặc code chết. Tự đọc lại các kết luận nặng của agent.
- [ ] A4. Sửa P1–P10 theo kiến trúc đã chốt (P6 thay bằng cổng chặng đẩy), thêm P11 (tách hàm ôm nhiều việc), P12 (test tĩnh chặn tái phạm), P13 (gộp kho và luật dọn); mỗi mục đủ ba phần (a)(b)(c). **Trình chủ dự án duyệt.**
- [ ] A5. Viết checklist chi tiết từng bước B vào tệp này (bước con, dữ liệu vào/ra, test, việc chủ dự án cần kiểm trên Sheet).

### Chuẩn bị trước giai đoạn B (chủ dự án làm)
- [ ] Tạo một bản sao Sheet DEV làm bản lưu (Tệp › Tạo bản sao), không dùng để chạy.
- [ ] Đồng ý thời điểm bắt đầu; trong lúc B chạy, gặp gì lạ trên Sheet thì báo.

Cách chạy thử (b): mỗi lần thử chiều ghi FBM, AI bật giới hạn phạm vi chỉ `ALT00010` và tắt đồng bộ nền bằng lệnh, thử xong trả lại như cũ và báo. Mỗi bước B đẩy lên Sheet DEV đang dùng thật nên phải chạy trọn vẹn và qua test trước khi đẩy.

### Giai đoạn B — sửa; mỗi bước: test offline, `node tests/gas.js ... --push` trên DEV, sửa tài liệu liên quan, commit riêng, tick checklist
- [ ] B0. Test tĩnh khung "danh sách ngoại lệ chỉ được giảm": vi phạm hiện có ghi thành ngoại lệ, mỗi bước sau xóa bớt; thêm vi phạm mới là đỏ.
- [ ] B1. Lỗi thật nhỏ, độc lập: dừng nền ngay và Sidebar chờ theo `running` (P10); mất `identityBlocks`; `approvalThreshold` bỏ `catch`; các `catch` rỗng và `.catch` trả null ở GAS và Sidebar. Chủ dự án kiểm: bấm đồng bộ khi nền đang chạy, chọn dừng.
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
