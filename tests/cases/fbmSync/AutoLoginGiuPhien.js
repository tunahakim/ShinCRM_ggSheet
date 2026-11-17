/** Kiểm Giữ phiên khi phiên chết: probe, đăng nhập qua các bước trang Login, xác minh tài khoản rồi chạy tiếp chuỗi nền. */
const { section, check } = require('../../lib/assert');
const { TRANG_FBM_THU } = require('../../lib/load-gas');
const { vaSoNen } = require('../../lib/fbm/cai-dat-thu');
const { USER_BODY, quaTrang, noiNen, hoiNen, dungHopGiuPhien, vaDauThu } = require('../../lib/fbm/tu-dang-nhap');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();
const { datState } = require('../../lib/fbm/dat-state');

async function chay(so) {
  section('FBM sync - auto-login: Giữ phiên đăng nhập');
  const { hop: heartbeat } = dungHopGiuPhien();
  datState(heartbeat.FbmSync, { session: { expired: true } });
  vaSoNen(heartbeat.FbmSync, { heartbeat: { doneAt: 1 } });
  // Dấu hết hạn còn từ lượt trước không đủ để đăng nhập (09/06), và phiên chưa xác minh thì Giữ phiên không được dựng request đếm khách (mã người dùng lấy từ phiên đã xác minh): mở bằng probe, probe báo chưa xác thực mới đi cổng đăng nhập.
  const staleCount = hoiNen(heartbeat);
  const staleProbe = noiNen(heartbeat, { ok: false, status: 401, body: '', transport: { contract: MA_HOP_DONG, trace: [{ requestId: staleCount.request.id }] } });
  const autoLoginRequest = noiNen(heartbeat, { ok: true, status: 200, body: '{"d":{"Authorized":false,"Rows":[]}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: staleProbe.request.id }] } });
  const autoLoginManual = heartbeat.FbmSync.stateRead().cursor.manual;
  check(so, 'heartbeat phien chua xac minh: mo bang probe, FBM tra 401 thi probe lai mot lan roi cap login request',
    [staleCount.request.meta.kind, staleProbe.request && staleProbe.request.meta.kind, autoLoginRequest.ok, autoLoginRequest.request && autoLoginRequest.request.meta.kind, autoLoginRequest.request && autoLoginRequest.request.meta.step],
    ['session_probe', 'session_probe', true, 'login_step', 'page']);
  const loginResponse = quaTrang((reply) => noiNen(heartbeat, reply), autoLoginRequest.request);
  check(so, 'đăng nhập qua đủ các bước trang Login rồi vẫn phải authorize trước',
    [loginResponse.ok, loginResponse.request.meta.kind, loginResponse.request.meta.entity],
    [true, 'authorize', 'customer']);
  const authorizeResponse = noiNen(heartbeat, { ok: true, status: 200, body: '{"d":{"Authorized":"auth-customer"}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: loginResponse.request.id }] } });
  check(so, 'sau authorize GAS cap User grid de xac minh identity',
    [authorizeResponse.ok, authorizeResponse.request.meta.kind, authorizeResponse.request.body.controller],
    [true, 'identity_user_grid', 'User']);
  const userResponse = noiNen(heartbeat, { ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG, captures: TRANG_FBM_THU, trace: [{ requestId: authorizeResponse.request.id }] } });
  check(so, 'Chỉ khi tài khoản khớp mới đi tiếp lượt Giữ phiên tới bước đếm khách',
    [userResponse.ok, userResponse.request.meta.kind, heartbeat.FbmSync.stateRead().session.accountUsername, heartbeat.FbmSync.stateRead().session.accountName],
    [true, 'customer_count', 'ANHLT', 'Le Tuan Anh']);
  check(so, 'Giữ phiên là lượt nền: đi qua probe rồi cần đăng nhập không bị tính là lượt bấm tay, lần đăng nhập vẫn chịu chu kỳ chờ của chạy nền',
    [heartbeat.FbmSync.stateRead().origin, !!autoLoginRequest.request && autoLoginManual],
    ['background', false]);
  // Gặp thật 2026-10-16 20:33: đăng nhập xong giữa Giữ phiên, response đếm khách về thì GAS trả "hết việc" mà lượt vẫn mở ở checking_session; Quét đầy đủ đến hạn không chạy, lần hỏi sau mới phát hiện lượt bỏ dở.
  vaSoNen(heartbeat.FbmSync, { customerFull: { doneAt: 1, baseline: 1, baselineScope: heartbeat.FbmSync.scopeMark(heartbeat.FbmSync.scope()) } });
  const resumedLogs = [], savedResumedLog = heartbeat.logEvent;
  heartbeat.logEvent = (event) => resumedLogs.push(event);
  const resumedCount = noiNen(heartbeat, { ok: true, status: 200, body: '{"d":{"TotalRowCount":1,"Rows":[[1]],"ViewPage":{"Fields":[{"AliasName":"id"}]}}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: userResponse.request.id }] } });
  heartbeat.logEvent = savedResumedLog;
  const resumedState = heartbeat.FbmSync.stateRead();
  check(so, 'Đăng nhập xong giữa Giữ phiên: response đếm khách về thì chuỗi chạy tiếp Quét đầy đủ đến hạn, không trả hết việc khi lượt còn mở', [
    resumedCount.ok, !!resumedCount.request, resumedState.process, heartbeat.FbmSync.processBookRead().heartbeat.doneAt > 1, resumedLogs.some((event) => event.action === 'run_left_open')
  ], [true, true, 'customerFull', true, false]);
  // Các ca sau chỉ xét Giữ phiên: bỏ Quét đầy đủ vừa mở khỏi chuỗi.
  vaSoNen(heartbeat.FbmSync, { customerFull: { doneAt: Date.now() } });
  datState(heartbeat.FbmSync, { process: '' });
  // Lượt tay đã tự đăng nhập thì cờ "đã thử đăng nhập" còn sót sau khi lượt xong: dựng lại dấu đó cho ca kế.
  const leftoverState = heartbeat.FbmSync.stateRead();
  leftoverState.metadata.autoLoginTried = true;
  heartbeat.FbmSync.stateWrite(leftoverState);

  // Phiên chết lần nữa ở lần hỏi nền sau (gặp thật 2026-10-16: đăng nhập 00:17, 00:32 phiên lại chết): cờ "đã thử đăng nhập" của lượt trước không được chặn lần đăng nhập mới.
  datState(heartbeat.FbmSync, { phase: 'done', cursor: {}, activeRequestId: '', deadlineAt: 0 });
  const loginLeftover = heartbeat.FbmSync.stateRead().metadata.autoLoginTried;
  vaDauThu(heartbeat.FbmSync, { lastAttemptAt: 0, nextRetryAt: 0 });
  vaSoNen(heartbeat.FbmSync, { heartbeat: { doneAt: 1 } });
  const againCount = hoiNen(heartbeat);
  // Quét đầy đủ vừa mở đã xóa phiên nên Giữ phiên mở bằng probe; probe nhận Authorized:false là phiên chết, đi thẳng cổng đăng nhập.
  const againProbe = noiNen(heartbeat, { ok: true, status: 200, body: '{"d":{"TotalRowCount":0,"Rows":null,"ViewPage":null,"Authorized":false}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: againCount.request.id }] } });
  check(so, 'Lượt trước đã tự đăng nhập thành công, lần hỏi nền sau phiên lại chết: probe nhận Authorized:false thì cấp lệnh đăng nhập mới, không dừng SESSION_PROBE_FAILED_AFTER_LOGIN', [
    loginLeftover, againCount.request.meta.kind, againProbe.code || '', againProbe.request && againProbe.request.meta.kind
  ], [true, 'session_probe', '', 'login_step']);
}

module.exports = { chay };
