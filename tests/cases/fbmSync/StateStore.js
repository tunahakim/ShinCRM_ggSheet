/**
 * Kho trạng thái phiên đồng bộ khi DocumentProperties đầy hoặc hỏng: không ghi dở, đóng phiên ghi bản rút gọn, state hỏng thì status trả "kẹt" kèm nút đặt lại.
 */
const { section, check } = require('../../lib/assert');
const { dungHop, TEP_NEN } = require('../../lib/dung-hop');
const { TEP_KHUNG_LUOT } = require('../../lib/load-gas');
const { trongLanGoi } = require('../../lib/gas/lan-goi');
const { docLog } = require('../../lib/gas/doc-log');

/** Kho trạng thái phiên: đầy kho thì không ghi dở, đóng phiên ghi bản rút gọn, state hỏng thì status trả "kẹt" kèm nút đặt lại. */
function kiemKhoTrangThai(so) {
  const nen = dungHop({ sheets: ['Log'], tep: TEP_NEN.concat(TEP_KHUNG_LUOT, ['fbm_sync/state/RunPlan.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/report/Report.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/control/ControlPort.js']) });
  const F = nen.hop.FbmSync, kho = nen.stubs.PropertiesService.getDocumentProperties();
  let day = false;
  ['setProperty', 'setProperties'].forEach((ten) => { const goc = kho[ten]; kho[ten] = function () { if (day) { throw new Error('DocumentProperties quota exceeded'); } return goc.apply(null, arguments); }; });
  const phinh = { total: 120, recent: Array.from({ length: 120 }, (_, i) => ({ customer: 'CUS-' + String(i).padStart(6, '0'), reason: 'x'.repeat(200) })) };

  F.stateWrite({ runId: 'before-quota', cursor: { pageIndex: 2 } });
  const truoc = nen.props.FBM_SYNC_STATE_V1;
  day = true;
  let loiDay = null;
  try { F.stateWrite({ runId: 'too-large', cursor: { pageIndex: 3 }, metadata: { customerErrors: phinh } }); } catch (err) { loiDay = err; }
  day = false;
  check(so, 'DocumentProperties đầy giữ nguyên state cũ, không ghi dở JSON; cổng kho ném lỗi có mã kèm khóa hỏng, không tự ghi Log',
    [loiDay && loiDay.code, nen.props.FBM_SYNC_STATE_V1 === truoc, loiDay && loiDay.detail.property, docLog(nen, { flush: true }).length], ['FBM_DOCUMENT_PROPERTIES_QUOTA', true, 'FBM_SYNC_STATE_V1', 0]);

  F.stateWrite({ runId: 'r-push', phase: 'push', cursor: { kind: 'push_wait' } });
  let loiDong = null;
  try { F.stateWrite(Object.assign(F.stateRead(), { phase: 'error', lastError: 'Lỗi khi ghi FBM', message: 'Lỗi khi ghi FBM', metadata: { customerErrors: phinh } })); } catch (err) { loiDong = err; }
  const rutGon = F.stateRead();
  check(so, 'đóng phiên mà state phình quá giới hạn thì lưu bản rút gọn ở phase lỗi, giữ cursor, rồi vẫn ném lỗi kèm bản rút gọn để cửa lệnh ghi Log',
    [rutGon.phase, rutGon.runId, rutGon.cursor.kind, rutGon.metadata.customerErrors === undefined, rutGon.message.indexOf('bản rút gọn') > 0, loiDong && loiDong.code, loiDong && loiDong.minimal.cursorKept],
    ['error', 'r-push', 'push_wait', true, true, 'FBM_DOCUMENT_PROPERTIES_QUOTA', true]);
  let loiGiua = null;
  try { F.stateWrite(Object.assign(F.stateRead(), { phase: 'push', metadata: { customerErrors: phinh } })); } catch (err) { loiGiua = err; }
  check(so, 'lát giữa chừng ghi state hỏng vẫn ném lỗi, không lặng lẽ thay bằng bản rút gọn',
    [loiGiua && loiGiua.code, F.stateRead().phase],
    ['FBM_DOCUMENT_PROPERTIES_QUOTA', 'error']);

  nen.props.FBM_SYNC_STATE_V1 = '{"phase":"push"';
  nen.props.FBM_SYNC_PENDING_PUSHES_V1 = '{"activity:ACT-1":{"hash":"h"}}';
  Object.assign(F, { identityStatus: () => ({ status: 'BOUND' }), settingsView: () => ({}), loginConfigPublic: () => ({ configured: true }) });
  const ket = trongLanGoi(nen.hop, () => F.statusRead()).status;
  check(so, 'state hỏng thì status trả "kẹt" kèm nút đặt lại và ghi Log, không ném lỗi',
    [ket.code, ket.resetOffered, ket.phase, docLog(nen).some((row) => row.join('|').indexOf('state_stuck') >= 0)], ['SYNC_STATE_STUCK', true, 'error', true]);
  const datLai = trongLanGoi(nen.hop, () => F.stateReset());
  check(so, 'đặt lại xóa state phiên hỏng, giữ hash chờ xác nhận và ghi Log',
    [datLai.ok, nen.props.FBM_SYNC_STATE_V1, nen.props.FBM_SYNC_PENDING_PUSHES_V1, F.stateRead().phase, docLog(nen).some((row) => row.join('|').indexOf('state_reset') >= 0)],
    [true, undefined, '{"activity:ACT-1":{"hash":"h"}}', 'idle', true]);
  F.stateWrite({ runId: 'r-live', phase: 'pull_customer' });
  const tuChoi = F.stateReset();
  const quaHan = F.stateReset(Date.now() + F.STALE_RUN_MS + 1000);
  check(so, 'phiên đang chạy bình thường thì từ chối đặt lại, phiên treo quá hạn thì cho',
    [tuChoi.code, quaHan.ok, nen.props.FBM_SYNC_STATE_V1],
    ['SYNC_RESET_RUNNING', true, undefined]);
}

function chay(so) {
  section('FBM sync - kho trạng thái phiên');
  kiemKhoTrangThai(so);
}

module.exports = { chay };
