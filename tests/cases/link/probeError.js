/**
 * Lỗi của lời hỏi nền ô đang chọn (`sheetLinkProbeSelectionAndReload`) và của nhịp dò: phải tới mắt người dùng và vào sheet `Log`, không chỉ ghi console.
 * Lời hỏi lặp vài giây một lần, nên lỗi lặp y hệt không được ghi thêm dòng Log; lần hỏi thành công kế tiếp tự gỡ thông báo.
 */

const fs = require('fs');
const path = require('path');
const { section, check, ghiLoiNap } = require('../../lib/assert');
const { syncValue, syncError, dungHopLienKet, batDauLienKet } = require('../../lib/sidebar/hop-lien-ket');

const CHAN = 'Cần được cho phép để thực hiện hành động đó.';
const ok = { ok: true, reload: { revision: 0 }, selection: { spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1, customerId: '' } };

async function chay(so) {
  section('Lời hỏi nền ô đang chọn — lỗi hiện ở Sidebar và vào Log, chỉ khi lỗi đổi');
  let hop;
  try { hop = dungHopLienKet(); batDauLienKet(hop); } catch (err) { return ghiLoiNap(so, 'nạp tầng liên kết', err); }
  let tra = () => syncError(new Error(CHAN));
  hop.callServer = (name) => { hop._calls.push(name); return tra(); };
  hop.console = { error() {} };
  // Lời hứa giả chạy đồng bộ nên cổng gán cờ "đang bay" sau khi lượt đã xong; nhả cờ trước mỗi lần hỏi như lời hứa thật.
  const hoi = () => { hop.SHEET_LINK_SELECTION_PENDING = null; return hop.sheetLinkProbeSelectionAndReload('safety-poll', { silent: true }); };
  const goiY = () => hop.NOTICES.selectionProbe && hop.NOTICES.selectionProbe.blocks[0].hint;

  let kq = 'chưa trả';
  hoi().then((x) => { kq = x; });
  check(so, 'lời hỏi bị Google chặn: hiện thông báo kèm lý do, ghi Log một lần dưới tên selectionProbe, vẫn trả null để nhịp tự thử lại',
    [hop.NOTICES.selectionProbe && hop.NOTICES.selectionProbe.line, hop._errorLogs, kq, goiY()],
    ['Lỗi: ' + CHAN, [['selectionProbe', CHAN]], null, hop.ACTION_ERROR_LOG_TEXT.logged]);

  hoi(); hoi();
  check(so, 'lỗi lặp y hệt không ghi thêm dòng Log', hop._errorLogs.length, 1);

  tra = () => syncError(Object.assign(new Error('Máy chủ ném'), { inLog: true }));
  hoi();
  check(so, 'lỗi đổi chữ thì báo lại; lỗi máy chủ đã ghi thì câu gợi ý nói đã có trong Log',
    [hop.NOTICES.selectionProbe.blocks[0].lines[0], hop._errorLogs.length, goiY()],
    ['Máy chủ ném', 2, hop.ACTION_ERROR_LOG_TEXT.server]);

  tra = () => syncValue(ok);
  hoi();
  check(so, 'lần hỏi thành công kế tiếp gỡ thông báo', hop.NOTICES.selectionProbe, undefined);

  tra = () => syncError(new Error(CHAN));
  hoi();
  check(so, 'lỗi quay lại sau khi đã hết thì báo và ghi Log lại', [Boolean(hop.NOTICES.selectionProbe), hop._errorLogs.length], [true, 3]);

  tra = () => syncValue(Object.assign({}, ok, { selection: null, reload: null, view: { bad: true } }));
  hop.sheetLinkApplyDecisionResult = () => { throw new Error('xử lý lời trả hỏng'); };
  hoi();
  check(so, 'lỗi khi xử lý lời trả cũng được báo (Sidebar đứng im vì nó cũng là lỗi)', hop.NOTICES.selectionProbe.blocks[0].lines[0], 'xử lý lời trả hỏng');

  let kiemThieu;
  try { hop.backgroundErrorReport('khongCo', new Error('x')); kiemThieu = 'không ném'; } catch (err) { kiemThieu = 'ném'; }
  check(so, 'khóa lời gọi nền chưa khai là lỗi lập trình', kiemThieu, 'ném');

  const nguon = ['client/link/sheetLink.html', 'client/link/selectionPoll.html'].map((rel) => fs.readFileSync(path.join(__dirname, '..', '..', '..', '1_ShinCRM_GAS', rel), 'utf8')).join('\n');
  check(so, 'tầng liên kết không còn nuốt lỗi bằng console.warn', /console\.warn/.test(nguon), false);
}

module.exports = { chay };
