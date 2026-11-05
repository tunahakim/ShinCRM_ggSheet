/**
 * Kiểm cửa báo lỗi thao tác của Sidebar (`client/ui/actionError.html`): lỗi hiện ở dòng đáy chứ không bật hộp thoại, vào sheet `Log` đúng một lần theo nguồn lỗi (máy chủ đã ghi, hết hạn chờ đã tự ghi, lỗi trình duyệt ghi tại đây), chữ gợi ý nói đúng đã ghi hay chưa, nút ✕ bỏ tại chỗ không gọi GAS, và màn đồng bộ FBM đang giữ khung thì lỗi sang thẻ lỗi của màn đó.
 */
const { section, check, ghiLoiNap } = require('../lib/assert');
const { taoHopCat } = require('../lib/load-gas');
const { napTheoSidebar } = require('../lib/sidebar/nap-sidebar');
const { domGia } = require('../lib/dom-gia');

const nghi = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Sidebar với GAS giả: `calls` ghi lời gọi máy chủ; `ghiLog` là kết quả máy chủ trả cho lời ghi Log. */
function taoCanh(ghiLog) {
  const dom = domGia();
  const hop = napTheoSidebar(['client/util/serverCall.html', 'client/ui/notices.html', 'client/ui/actionError.html'], taoHopCat({ document: dom.document, window: dom.window }));
  const calls = [], alerts = [];
  hop.callServer = (name, args) => { calls.push([name, args]); return name === 'logClientError' ? (ghiLog instanceof Error ? Promise.reject(ghiLog) : Promise.resolve(ghiLog)) : Promise.resolve({ notices: [] }); };
  hop.alert = (text) => alerts.push(text);
  hop.console = { error: () => {} };
  return { hop, calls, alerts };
}
const goiY = (hop) => hop.NOTICES.actionError && hop.NOTICES.actionError.blocks[0].hint;

async function chay(so) {
  section('Sidebar — cửa báo lỗi thao tác: dòng đáy, sheet Log, không hộp thoại');
  let a;
  try { a = taoCanh({ ok: true }); } catch (err) { return ghiLoiNap(so, 'nạp cửa báo lỗi thao tác', err); }
  const cho = a.hop.actionErrorReport(new Error('Hành động hỏng'));
  const dangGhi = goiY(a.hop);
  await cho;
  check(so, 'Lỗi sinh ở trình duyệt: dòng đáy hiện lỗi kèm nút ✕, ghi Log qua logClientError đúng một lần, gợi ý đổi từ "đang ghi" sang "đã ghi", không bật hộp thoại', [
    a.hop.NOTICES.actionError.line, a.hop.NOTICES.actionError.blocks[0].button, a.calls.map((c) => [c[0], c[1][0], c[1][1]]), dangGhi, goiY(a.hop), a.alerts
  ], ['Lỗi: Hành động hỏng', { label: 'Đóng ✕', action: 'noticeDismiss', value: 'actionError' }, [['logClientError', 'sidebar_action', 'Hành động hỏng']], a.hop.ACTION_ERROR_LOG_TEXT.pending, a.hop.ACTION_ERROR_LOG_TEXT.logged, []]);

  const b = taoCanh({ ok: true });
  await b.hop.actionErrorReport(Object.assign(new Error('Máy chủ ném'), { fromServer: true }));
  await b.hop.actionErrorReport(Object.assign(new Error('Hết hạn chờ'), { logged: Promise.resolve(false) }));
  check(so, 'Lỗi máy chủ ném thì không ghi Log lần nữa và nói máy chủ đã ghi; hết hạn chờ dùng kết quả ghi sẵn, ghi hỏng thì bảo chụp màn hình', [
    b.calls.length, goiY(b.hop)
  ], [0, b.hop.ACTION_ERROR_LOG_TEXT.not_logged]);

  const c = taoCanh(new Error('mất mạng'));
  const truoc = c.hop.actionErrorReport('Không xử lý được thay đổi chưa lưu.');
  c.hop.noticeDismissKey('actionError');
  await truoc; await nghi();
  check(so, 'Nhận cả chữ; ghi Log hỏng không ném; bấm ✕ bỏ tại chỗ không gọi GAS và lời ghi Log về muộn không vẽ lại thông báo đã đóng', [
    c.calls.map((x) => x[0]), c.hop.NOTICES.actionError === undefined
  ], [['logClientError'], true]);

  const d = taoCanh({ ok: true }), veLoi = [];
  d.hop.FBM_SYNC_CLIENT = { active: true };
  d.hop.fbmSyncPaintError = (err, message, action) => { veLoi.push([message, action]); };
  d.hop.actionErrorReport(new Error('Lỗi trong màn FBM'));
  check(so, 'Màn đồng bộ FBM giữ khung (dòng đáy ẩn): lỗi sang thẻ lỗi của màn FBM (tự ghi Log), không đặt dòng đáy và không ghi Log lần hai', [
    veLoi, d.hop.NOTICES.actionError === undefined, d.calls.length
  ], [[['Lỗi trong màn FBM', 'sidebar_action']], true, 0]);
}

module.exports = { chay };
