/** Kiểm `fbm_sync/transport/TransportCore.js`: bảng lỗi đường truyền `transportRecoverPlan` quyết đúng một kế hoạch cho mỗi mã lỗi, không đọc kho, không ghi; bảng khai gửi lại `REQUEST_REPLAY` phủ mọi loại request và chặn loại chưa khai trước khi gửi. */
const fs = require('fs');
const path = require('path');
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');

async function chay(so) {
  section('FBM sync — TransportCore.js: bảng lỗi đường truyền');
  const { hop, documentProperties } = workflowGas();
  const F = hop.FbmSync;
  const truoc = JSON.stringify(documentProperties.data);
  const quetGd = { cursor: { kind: 'scan_job', entity: 'activity', chunkCount: 0 } };
  const daPhatLai = { cursor: { kind: 'grid' }, metadata: { transportRetryId: 'r-2' } };
  const moTab = { autoOpenTab: true }, khongMoTab = { autoOpenTab: false };
  const ke = (state, code, requestId, policy) => F.transportRecoverPlan(state, requestId || 'r-1', code, policy || khongMoTab);
  check(so, 'transportRecoverPlan: quét giao dịch quá sức chia cửa sổ ngày (đã có gói thì dừng); mất việc quét chạy lại việc; mã quét ở cursor khác thì dừng', [
    ke(quetGd, 'FBM_SCAN_TOO_LARGE'), ke({ cursor: Object.assign({}, quetGd.cursor, { chunkCount: 3 }) }, 'FBM_SCAN_TOO_LARGE'),
    ke({ cursor: { kind: 'scan_job', entity: 'customer' } }, 'FBM_SCAN_JOB_GONE'), ke({ cursor: { kind: 'grid' } }, 'FBM_SCAN_JOB_GONE')
  ], ['activity_windows', 'stop', 'scan_restart', 'stop']);
  check(so, 'transportRecoverPlan: tab không sẵn sàng thì tải lại trang dù tắt tự mở tab; không có tab chỉ mở khi chính sách cho; lần phát lại của chính request đó hỏng tiếp thì dừng', [
    ke({ cursor: { kind: 'grid' } }, 'FBM_TAB_NOT_READY'), ke({ cursor: { kind: 'grid' } }, 'FBM_TAB_NOT_FOUND'), ke({ cursor: { kind: 'grid' } }, 'FBM_TAB_NOT_FOUND', 'r-1', moTab),
    ke(daPhatLai, 'FBM_TAB_NOT_READY', 'r-2'), ke(daPhatLai, 'FBM_TAB_NOT_FOUND', 'r-2', moTab), ke(daPhatLai, 'FBM_TAB_NOT_READY', 'r-3')
  ], ['reload_page', 'stop', 'open_tab', 'stop', 'stop', 'reload_page']);
  check(so, 'transportRecoverPlan: Chrome chặn quyền site, địa chỉ ngoài miền và mã lạ thì dừng; bảng không ghi kho, không thêm metadata vào state', [
    ke({ cursor: {} }, 'FBM_SITE_ACCESS_BLOCKED', 'r-1', moTab), ke({ cursor: {} }, 'FBM_URL_OUTSIDE_SITE'), ke({}, 'MA_LA'), JSON.stringify(documentProperties.data) === truoc, 'metadata' in quetGd
  ], ['stop', 'stop', 'stop', true, false]);
  const doc = (replay, extra) => Object.assign({ cursor: { kind: 'grid' }, activeRequestReplay: replay }, extra || {});
  check(so, 'transportRecoverPlan: đường truyền đứt sau khi gửi thì chỉ gửi lại request đã khai đọc thuần, một lần mỗi request; request ghi hoặc lượt cũ chưa có dấu thì dừng', [
    ke(doc(true), 'FBM_TRANSPORT_UNAVAILABLE'), ke(doc(false), 'FBM_TRANSPORT_UNAVAILABLE'), ke({ cursor: { kind: 'grid' } }, 'FBM_TRANSPORT_UNAVAILABLE'),
    ke(doc(true, { metadata: daPhatLai.metadata }), 'FBM_TRANSPORT_UNAVAILABLE', 'r-2'), ke(doc(true), 'FBM_FETCH_TIMEOUT')
  ], ['replay', 'stop', 'stop', 'stop', 'stop']);
  const tran = { transportReplays: F.BUDGET.transportReplaysPerRun };
  check(so, 'transportRecoverPlan: lượt đã phát lại đủ trần BUDGET.transportReplaysPerRun (tính cả tải lại trang và mở tab) thì mọi kế hoạch phát lại thành replay_budget; kế hoạch dừng giữ nguyên', [
    F.BUDGET.transportReplaysPerRun, ke(doc(true, { metadata: tran }), 'FBM_TRANSPORT_UNAVAILABLE'), ke(doc(true, { metadata: tran }), 'FBM_TAB_NOT_READY'), ke(doc(true, { metadata: tran }), 'FBM_TAB_NOT_FOUND', 'r-1', moTab),
    ke(doc(false, { metadata: tran }), 'FBM_TRANSPORT_UNAVAILABLE'), ke(doc(true, { metadata: { transportReplays: F.BUDGET.transportReplaysPerRun - 1 } }), 'FBM_TRANSPORT_UNAVAILABLE')
  ], [3, 'replay_budget', 'replay_budget', 'replay_budget', 'stop', 'replay']);
  const maLoi = (fn) => { try { fn(); return 'không ném'; } catch (error) { return error.code; } };
  const lo = (kinds) => ({ meta: { kind: 'batch' }, items: kinds.map((kind) => ({ meta: { kind } })) });
  check(so, 'requestReplayable: loại đọc là true, loại ghi là false; lô chỉ true khi mọi phần tử true; loại chưa khai, thiếu kind hay phần tử lô chưa khai thì ném FBM_REQUEST_KIND_UNDECLARED, không có mặc định', [
    F.requestReplayable({ meta: { kind: 'grid' } }), F.requestReplayable({ meta: { kind: 'customer_create_open' } }), F.requestReplayable(lo(['grid', 'owner_lookup'])), F.requestReplayable(lo(['grid', 'activity_create'])),
    maLoi(() => F.requestReplayable({ meta: { kind: 'loai_moi' } })), maLoi(() => F.requestReplayable({ meta: {} })), maLoi(() => F.requestReplayable(lo(['grid', 'loai_moi']))), maLoi(() => F.requestReplayable({ meta: { kind: 'toString' } }))
  ], [true, false, true, false, 'FBM_REQUEST_KIND_UNDECLARED', 'FBM_REQUEST_KIND_UNDECLARED', 'FBM_REQUEST_KIND_UNDECLARED', 'FBM_REQUEST_KIND_UNDECLARED']);
  // Quét tĩnh mã GAS: mọi chỗ đặt `kind` cho meta của request phải có dòng trong bảng, để loại mới quên khai lộ ra ngay ở bộ test chứ không đợi tới lúc chạy thật.
  const goc = path.join(__dirname, '..', '..', '..', '1_ShinCRM_GAS', 'fbm_sync'), tep = [];
  const duyet = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((muc) => (muc.isDirectory() ? duyet(path.join(dir, muc.name)) : /\.js$/.test(muc.name) && tep.push(path.join(dir, muc.name))));
  duyet(goc);
  const loai = new Set();
  tep.forEach((file) => { const text = fs.readFileSync(file, 'utf8'); [/meta\s*:\s*(?:Object\.assign\(\s*)?\{[^{}]*?\bkind\s*:\s*'([a-z_]+)'/g, /meta\.kind\s*=\s*'([a-z_]+)'/g, /\bmeta\s*=\s*function\s*\([^)]*\)\s*\{\s*return\s+Object\.assign\(\s*\{\s*kind\s*:\s*'([a-z_]+)'/g, /\bmeta\s*=\s*Object\.assign\([^;]*?\{\s*kind\s*:\s*'([a-z_]+)'\s*\}\s*\)/g].forEach((re) => { let m; while ((m = re.exec(text))) { loai.add(m[1]); } }); });
  const chuaKhai = [...loai].filter((kind) => !Object.prototype.hasOwnProperty.call(F.REQUEST_REPLAY, kind)), thua = Object.keys(F.REQUEST_REPLAY).filter((kind) => !loai.has(kind));
  check(so, 'REQUEST_REPLAY phủ mọi loại request mã GAS dựng (quét tĩnh tìm thấy đủ cỡ bảng), không thừa loại không ai dựng, mọi giá trị đúng kiểu true/false', [
    loai.size >= 15, chuaKhai, thua, Object.values(F.REQUEST_REPLAY).every((value) => value === true || value === false)
  ], [true, [], [], true]);
}

module.exports = { chay };
