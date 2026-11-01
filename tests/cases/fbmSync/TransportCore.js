/** Kiểm `fbm_sync/transport/TransportCore.js`: bảng lỗi đường truyền `transportRecoverPlan` quyết đúng một kế hoạch cho mỗi mã lỗi, không đọc kho, không ghi. */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');

async function chay(so) {
  section('FBM sync — TransportCore.js: bảng lỗi đường truyền');
  const { hop, documentProperties } = workflowGas();
  const F = hop.FbmSync;
  const truoc = JSON.stringify(documentProperties.data);
  const quetGd = { cursor: { kind: 'scan_job', entity: 'activity', chunkCount: 0 } };
  const daPhatLai = { cursor: { kind: 'grid' }, metadata: { sessionGate: { noTabRetryRequestId: 'r-2' } } };
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
}

module.exports = { chay };
