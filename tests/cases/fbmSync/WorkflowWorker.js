/**
 * Service worker thật trả lời nhịp nền: hỏi GAS một lần, không tự tìm tab khi không có việc, nộp lỗi tab đúng reservation, chỉ mở đúng URL GAS cấp và chuyển response thô kèm mã hợp đồng của chính nó.
 */
const { section, check } = require('../../lib/assert');
const { workerNhip } = require('../../lib/fbm/worker-nhip');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();

async function chay(so) {
  section('FBM sync — service worker và nhịp nền');
  const noopWorker = workerNhip([{ ok: true, code: 'HEARTBEAT_NOOP', request: null }], []);
  const noopResult = await noopWorker.context.fbmHeartbeatNow('workflow');
  check(so, 'alarm noop: Extension hoi GAS mot lan, khong tim tab va khong fetch FBM', [
    noopResult.code, noopWorker.relayCalls.map((item) => item.body.command), noopWorker.metrics().fbmTabQueries, noopWorker.metrics().fbmMessages
  ], ['HEARTBEAT_NOOP', ['heartbeat'], 0, 0]);

  const noTabWorker = workerNhip([
    { ok: true, request: { id: 'reserved-heartbeat', contract: MA_HOP_DONG, url: 'https://fbo.com.vn:8888/service', method: 'POST', bodyText: '{}', meta: { timeoutMs: 30000 } } },
    { ok: true, code: 'TRANSPORT_RECORDED', request: null }
  ], []);
  const noTabResult = await noTabWorker.context.fbmHeartbeatNow('workflow');
  check(so, 'alarm khong co tab: Extension nop transport failure dung reservation va khong tu fetch FBM', [
    noTabResult.code, noTabWorker.relayCalls.map((item) => [item.body.command, (item.body.payload.error || {}).requestId || '', (item.body.payload.error || {}).code || '']), noTabWorker.metrics().fbmMessages
  ], ['TRANSPORT_RECORDED', [['heartbeat', '', ''], ['continue', 'reserved-heartbeat', 'FBM_TAB_NOT_FOUND']], 0]);

  const autoOpenWorker = workerNhip([
    { ok: true, request: { id: 'open-heartbeat', contract: MA_HOP_DONG, url: 'https://fbo.com.vn:8888/service', method: 'POST', bodyText: '{}', meta: { timeoutMs: 30000, openFbmContext: { url: 'https://fbo.com.vn:8888/Main/zccrAccount.aspx', active: false } } } },
    { ok: true, code: 'HEARTBEAT_COMPLETE', request: null }
  ], [], (tabId, message) => {
    if (message.type === 'FBM_PING_V2') { return { ready: true, version: '22.0' }; }
    if (message.type === 'FBM_EXECUTE_V2') { return { result: { ok: true, status: 200, body: '{"d":{"TotalRowCount":12,"Rows":[]}}', transport: { trace: [{ stage: 'executor_response_sent', requestId: message.request.id }] } } }; }
    return null;
  });
  const autoOpenResult = await autoOpenWorker.context.fbmHeartbeatNow('workflow');
  check(so, 'GAS cap lenh mo tab: Extension chi mo dung URL duoc cap va moi gui request',
    [autoOpenResult.ok, autoOpenWorker.metrics().fbmTabQueries, autoOpenWorker.metrics().fbmTabCreates, autoOpenWorker.metrics().fbmMessages],
    [true, 1, 1, 2]);

  const rawHeartbeat = '{"d":{"TotalRowCount":12,"Rows":[]}}';
  const completeWorker = workerNhip([
    { ok: true, request: { id: 'heartbeat-envelope', contract: MA_HOP_DONG, url: 'https://fbo.com.vn:8888/service', method: 'POST', bodyText: '{"from":"gas"}', meta: { timeoutMs: 30000, gasReplyMs: 390000 } } },
    { ok: true, code: 'HEARTBEAT_COMPLETE', request: null }
  ], [{ id: 17 }], (tabId, message) => {
    if (message.type === 'FBM_PING_V2') { return { ready: true, version: '22.0' }; }
    if (message.type === 'FBM_EXECUTE_V2') {
      return { result: { ok: true, status: 200, body: rawHeartbeat, transport: { trace: [{ stage: 'executor_response_sent', requestId: message.request.id }] } } };
    }
    return null;
  });
  const completeResult = await completeWorker.context.fbmHeartbeatNow('workflow');
  check(so, 'alarm co tab: GAS cap envelope truoc, Extension chuyen response tho kem ma hop dong cua no ve GAS va dung khi request null', [
    completeResult.ok, completeWorker.relayCalls.map((item) => item.body.command), completeWorker.relayCalls[1].body.payload.response.body,
    completeWorker.relayCalls[1].body.payload.response.transport.contract,
    completeWorker.metrics().fbmTabQueries, completeWorker.metrics().fbmMessages
  ], [true, ['heartbeat', 'continue'], rawHeartbeat, MA_HOP_DONG, 1, 2]);
}

module.exports = { chay };
