/** Chiều đẩy phát request qua đúng bước phát của lát (`sliceIssue` → `requestIssue`): phong bì mở chặng đẩy mang mã request, hạn chờ và ô lượt ghi request đang chờ; phiên chưa xác minh thì cổng phiên đổi thành hỏi thử. */
const { section, check } = require('../../lib/assert');
const { workflowGas, trongLat } = require('../../lib/fbm/hop-dong-bo');

function moChangDay(xacMinh) {
  const luong = workflowGas({}), F = luong.hop.FbmSync, st = F.runOpen({ phase: 'pull_customer' });
  st.mode = 'write';
  if (xacMinh) { F.sessionIdentityVerify(st, { userId: '2037', username: 'demo', accountName: 'Demo' }); }
  F.stateWrite(st);
  // Như bản thật: bước có request đặt dấu chờ response (`push_wait`) trước khi trả request.
  F.pushNext = (copy) => { copy.cursor = F.pushCursor(copy.cursor, { kind: 'push_wait', operation: 'owner_lookup' }); return { next: { url: F.FBM_BASE_URL + '/AppService/FastBusiness.asmx/GetDirViewPage', body: {}, meta: { kind: 'owner_lookup' } } }; };
  return { F, ket: trongLat(F, () => F.pullFinishOrPush(st, {}), st), st: F.stateRead() };
}

function chay(so) {
  section('FBM sync — Chiều đẩy phát request qua bước phát của lát');
  const daXacMinh = moChangDay(true), request = daXacMinh.ket.request || {};
  check(so, 'phiên đã xác minh: phong bì mở chặng đẩy có mã request, hạn chờ; ô lượt ghi đúng request đang chờ', [
    String(request.meta && request.meta.kind || ''), !!request.id, request.id === daXacMinh.st.activeRequestId, daXacMinh.st.deadlineAt > Date.now(), daXacMinh.st.phase
  ], ['owner_lookup', true, true, true, 'push']);
  const chuaXacMinh = moChangDay(false), probe = chuaXacMinh.ket.request || {};
  check(so, 'phiên chưa xác minh: cổng phiên đổi request đẩy thành hỏi thử, không phát request đẩy', [
    String(probe.meta && probe.meta.kind || ''), probe.id === chuaXacMinh.st.activeRequestId
  ], ['session_probe', true]);
}

module.exports = { chay };
