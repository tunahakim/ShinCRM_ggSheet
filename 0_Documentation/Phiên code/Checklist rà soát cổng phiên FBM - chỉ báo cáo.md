# Checklist rà soát cổng phiên FBM — chỉ báo cáo

Phiên: rà soát gốc lỗi hai đường làm việc với FBM trước khi sửa kiến trúc.

Phạm vi: chỉ đọc mã nguồn và test hiện có; không sửa code, không sửa checklist cổng phiên hiện hữu, không kết luận nghiệm thu live.

Quy tắc: mỗi mục chỉ đánh dấu `[x]` khi đã có dẫn chứng tệp và hàm cụ thể; tên ca test hiện có chỉ được ghi là bằng chứng nếu nó thật sự kiểm đúng nhánh.

## A. Kiểm kê mọi điểm tạo và phát request FBM

- [x] [Mã nguồn] GAS chỉ serialize envelope tại `1_ShinCRM_GAS/fbm_sync/transport/TransportCore.js:FbmSync.nextEnvelope`; dòng 366 là điểm duy nhất gọi `FbmSync.protocol.request`; quét `FbmSync.protocol.request(` ngoài tệp này không có kết quả.
- [x] [Mã nguồn] Các builder đọc/ghi chỉ tạo object request rồi quay về cổng: `1_ShinCRM_GAS/fbm_sync/read/GridRead.js:gridRequest, identityUserRequest, heartbeatCustomerRequest, identityCheckCustomerRequest, activityGridRequest, activityBulkRequest, conflictRefreshRequest, activityCatchupCustomerRequest, activityRotationCustomerRequest, completionRequest`; `1_ShinCRM_GAS/fbm_sync/write/RequestBuilders.js:authorizeRequest, activityCreateRequest, activityEditOpenRequest, activityEditRequest, customerCreateAuthorizeRequest, customerCreateOpenRequest, customerCreateRequest, customerEditOpenRequest, customerEditRequest`.
- [x] [Mã nguồn] Request login được dựng ở `1_ShinCRM_GAS/fbm_sync/auth/AutoLogin.js:loginRequest`; request login/authorize/User/heartbeat được phân loại tại `TransportCore:sessionSystemRequest` và đóng envelope qua `sessionSystemEnvelope`.
- [x] [Mã nguồn] Extension có một điểm chuyển envelope nghiệp vụ vào tab tại `2_ShinCRM_Extension/background/service_worker.js:sendToFbmTab`; một điểm fetch generic tại `2_ShinCRM_Extension/content_scripts/fbm_sync/executor.js:execute` dòng 313.
- [x] [Mã nguồn] Login adapter có các fetch FBM riêng tại `executor:executeLogin` dòng 243 (`GetEntityData`/`GetUnitData`), 245 (`GET Login.aspx`), 267 (`GET zccrAccount.aspx`), và 264 (`POST Login`); đây là nhóm hệ thống do request `meta.kind === 'login'` kích hoạt, không phải một cửa fetch nghiệp vụ thứ hai.
- [x] [Lệch nguyên tắc] `1_ShinCRM_GAS/server/dev/FbmSyncFixture.js:fbmProbeAutoLogin` gọi thẳng `sync.loginRequest('probe-ref', true)` để dựng fixture; không gửi HTTP nhưng làm code ngoài cổng biết tiến trình login, nên phép quét hiện tại bỏ sót.
- [x] [Lệch kiểm thử] `tests/cases/extensionBridge.js:146-156` chỉ quét tên `FbmSync.*`, loại `TransportCore.js`, không quét `sync.loginRequest` trong `server/dev`, không chốt toàn bộ builder URL hay mọi `fetch`; vì vậy các ca `GAS chỉ có TransportCore gọi protocol.request` và `kiến trúc một cửa` đang xanh nhưng chưa chứng minh luật bao trùm.

## B. Bốn giả thuyết của lỗi thực tế

- [x] [H1 — đúng có điều kiện] `FbmSync.stateStart` tại `1_ShinCRM_GAS/fbm_sync/state/State.js:222-230` giữ nguyên `previous.session`; `TransportCore:296-308` chỉ probe User khi `sessionIdentityIsVerified` false. Marker cũ còn hợp lệ làm lượt mới bỏ probe và `PullFlow.start:83-86` cấp authorize ngay; tab tồn tại/sẵn sàng không đồng nghĩa đang đăng nhập.
- [x] [H2 — đúng] `AutoLogin:applyTransportSession:142-149` là nơi ghi cookie vào `state.session.cookie`; `GridRead:scriptSettings:5-13,21-30` đọc cookie đó cho request sau; `stateStart` giữ lại cookie qua lượt mới. Không có bước live nào xác nhận cookie còn hiệu lực trước khi marker cũ được chấp nhận.
- [x] [H3 — đúng và có hai điểm chặn] GAS `Protocol.isSessionExpired:49-53` chỉ nhận dấu `Login.aspx`/form login; `classifyFailure:60-78` xếp body 200 ký tự rác thành `PARSE_ERROR`, còn `PullFlow.continue:330-340` chỉ retry đọc. Code chỉ coi HTTP 401 là `SESSION_EXPIRED`; HTTP 403 đang bị test và xếp `TRANSPORT_ERROR`, trái quy định 09.01 cần kiểm lại hợp đồng. Với authorize, `executor:projectResponseBody:53-61` ném `FBM_TRANSPORT_PROJECTION_INVALID_JSON` trước khi GAS nhận response; `service_worker:rawFbmReply:241-245` chỉ chuyển lỗi transport và `TransportCore:sessionGateTransportRetry:217-236` chỉ xử lý `FBM_TAB_NOT_FOUND`/`FBM_TAB_NOT_READY`, nên không kích hoạt login.
- [x] [H4 — đúng về orchestration] Đường `Đăng nhập thử` bắt đầu tại `EntryPoints.js:fbmStartLoginTest` → `AutoLogin:loginTestRequest:157-169` → `executor:executeLogin:241-274`; sau Login, `loginAdapterContinue:189-206` bắt buộc authorize rồi `loginAuthorizeContinue:209-220` đọc User, `loginIdentityContinue:223-270` so bốn định danh. Đường đồng bộ bắt đầu tại `FbmSyncService:fbmStartSync` → `PullFlow.start:5-86`, cấp authorize/probe theo marker và chỉ gọi `TransportCore:sessionGateHandleFailure:197-214`/`beginAutoLogin` sau khi đã phân loại `SESSION_EXPIRED`; vì vậy không chủ động chạy chuỗi login đầy đủ ở đầu lượt.

## C. Tầng xác thực và các bẫy kiến trúc

- [x] [Tầng 2] `AutoLogin:loginIdentityContinue:223-254` đọc User và so Spreadsheet ID, userId, username, accountName; marker gắn `sessionId` tại `TransportCore:66-76` và `AutoLogin:247-254`. Chưa thấy tầng 2 gọi logic đối chiếu mã Customer.
- [x] [Tầng 3] Đối chiếu mã Customer nằm ở `1_ShinCRM_GAS/fbm_sync/reconcile/Identity.js:identityCheckBegin, identityCheckPage, identityCheckFinish` và được điều phối trong `PullFlow.continue`; không được gọi từ `TransportCore` hay `AutoLogin`. Tuy nhiên phép quét hiện có chỉ kiểm hai tệp đó, không kiểm toàn call graph.
- [x] [Chạy song song] `TransportCore:sessionGateStart:160-193` dùng `activeRequestId`/cursor login để luồng sau chờ; `service_worker` có `fbmRequestFlights` để chống gửi trùng cùng requestId. Đây là thiết kế có bảo vệ, nhưng chưa chứng minh nhánh stale marker không mở hai phiên.
- [x] [Thử lại hữu hạn] `AutoLogin:beginAutoLogin:274-285` đi qua `autoLoginCanAttempt`/`autoLoginMarkAttempt`; `loginAdapterContinue:193-198` đánh dấu thất bại; `sessionGateStart:175-186` fail-closed khi tắt/throttle. Nhánh malformed response hiện không vào được cơ chế này, nên luật hữu hạn không cứu được use case đã quan sát.
- [x] [Nhánh riêng chưa lộ] `PullFlow.start:86` truyền `requireIdentityProbe: state.scan !== 'activity_bulk'`; `TransportCore:296` vì vậy cho `activity_bulk` authorize mà không buộc probe User khi chưa có marker. Đây là lỗi độc lập với stale cookie của use case hiện tại.

## D. Đối chiếu bằng chứng checklist cổng hiện hữu

- [x] [Sai/thiếu bằng chứng] Dòng 17 và 53: scanner hiện tại không thấy `server/dev/FbmSyncFixture:fbmProbeAutoLogin` và không quét toàn bộ builder/fetch; không thể coi là đã chứng minh “đúng một cửa”.
- [x] [Sai hành vi] Dòng 18 và 31: các test chỉ chứng minh nhánh đã được phân loại `SESSION_EXPIRED`; không phủ response ký tự rác bị Extension projection chặn trước GAS và không phủ lượt mới giữ marker/cookie.
- [x] [Sai hành vi] Dòng 36: mô tả body `Login.aspx`/HTTP 401 nhưng không có ca response malformed từ tab `Login.aspx` đi qua `executor:projectResponseBody` rồi vào session gate.
- [x] [Sai hành vi] Dòng 41: `tests/cases/fbmSync/AutoLogin.js:54` còn xác nhận lượt sau bỏ qua User grid; cùng với `State.stateStart:228-230` giữ marker qua run mới, điều này trái yêu cầu “mỗi lượt mới kiểm tra đầu lượt”.
- [x] [Chưa đủ phạm vi] Dòng 42 chỉ kiểm marker lệch `sessionId`; không kiểm marker cũ được giữ nguyên khi tạo run mới.
- [x] [Sai/thiếu bằng chứng] Dòng 56 lặp lại scanner chưa đủ ở dòng 17/53 và còn tuyên bố flow nghiệp vụ không biết login, trong khi `server/dev/FbmSyncFixture` biết `loginRequest`.
- [ ] [Cần người dùng kiểm chứng thật] Chưa cần thao tác live để kết luận gốc lỗi; chỉ cần live sau khi sửa để xác nhận chuỗi request không còn authorize trước login và Sidebar/Log báo lỗi hữu hạn.

## E. Kết luận để duyệt trước khi sửa

- [x] [Scanner đã viết] `tests/cases/extensionBridge.js:scanFbmRequestArchitecture` quét hai cây mã nguồn GAS/Extension, gồm `server/dev`, chốt ba luật `protocol.request`, fetch FBM và caller login/auto-login; có ba fixture vi phạm ảo. Chạy trước sửa runtime chỉ lộ `1_ShinCRM_GAS/server/dev/FbmSyncFixture.js`, đúng chỗ đã nêu trong báo cáo, không có đường lệch mới.

- [x] [Gốc lỗi] Run mới tái sử dụng `session.cookie` và `identityVerified` của run trước; khi tab vừa mở ở `Login.aspx`, cổng tưởng marker cũ là phiên sống, cấp authorize ngay. Response rác bị Extension ném lỗi projection trước GAS, nên không có cơ hội phân loại `SESSION_EXPIRED` và gọi auto-login.
- [x] [Kiến trúc cần sửa] Tách trạng thái “đã xác thực live trong run hiện tại” khỏi state phiên cũ; mọi run đồng bộ phải probe User trước request nghiệp vụ; cookie cũ không là bằng chứng sống; malformed/projection có dấu hiệu trang login phải vào cùng session gate; bỏ caller dev gọi thẳng `loginRequest`; mở rộng scanner/test chốt toàn repo.
- [ ] [Cảnh báo hợp đồng] Sửa các điểm trên sẽ đụng hợp đồng state/session marker, mã lỗi transport Extension→GAS và ca test scanner; cần duyệt trước khi viết code.
