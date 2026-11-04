/**
 * Ca kiểm lỗi sinh ở trình duyệt: cổng chung `server/log/ClientError.js`, nhánh hết hạn chờ của `callServer` và màn lỗi của lượt nạp.
 *
 * Lỗi hết hạn chờ phía client là nhánh hỏng âm thầm: máy chủ không ném gì nên không có dòng Log, còn màn lỗi từng khẳng định "đã ghi một dòng vào sheet Log". Các ca dưới đây chốt ba điều: hết hạn thì có lời gọi ghi Log nêu tên hàm và số ms; màn lỗi chỉ nói "đã ghi" khi máy chủ xác nhận; lời gọi ghi Log tự hết hạn thì không sinh thêm lời gọi ghi Log.
 */

const { dungHop } = require('../lib/dung-hop');
const { napServer } = require('../lib/load-gas');
const { dungClient } = require('../lib/dung-client');
const { section, check, ghiLoiNap } = require('../lib/assert');

/** Hộp cát `callServer` với `google.script.run` giả: lưu lại từng lời gọi và hẹn giờ để ca kiểm tự quyết lời gọi nào trả, lời gọi nào hết hạn. */
function dungCallServer() {
  const goi = [];
  const hen = [];
  const hop = dungClient({ tep: ['client/util/serverCall.html'], stubs: {
    Promise, Date,
    setTimeout(fn, ms) { hen.push({ fn, ms }); return hen.length; },
    clearTimeout() {},
    progressBegin() {}, progressEnd() {}, callTimingRecord() {},
    google: { script: { get run() {
      const lan = { name: '', args: [], ok: null, fail: null };
      goi.push(lan);
      const runner = new Proxy({}, { get(t, k) {
        if (k === 'withSuccessHandler') { return (fn) => { lan.ok = fn; return runner; }; }
        if (k === 'withFailureHandler') { return (fn) => { lan.fail = fn; return runner; }; }
        return (...args) => { lan.name = String(k); lan.args = args; };
      } });
      return runner;
    } } }
  } });
  return { hop, goi, hen };
}

async function chay(so) {
  section('clientError — cổng chung ghi lỗi Sidebar vào sheet Log');

  try {
    const nen = dungHop({ sheets: ['Log'], props: { LOG_LAST_CLEANUP: '2999-01-01' } });
    napServer(nen.hop, 'server/log/ClientError.js');
    const kq = nen.hop.logClientError('client_timeout', 'Máy chủ không phản hồi hàm loadCore sau 30000 ms.', { ham: 'loadCore', ms: 30000, khoaLa: 'phải bị bỏ' });
    const sheet = nen.Log.sheet;
    const dau = nen.hop.SHEET_LAYOUT.Log.firstDataRow;
    const dong = sheet.getLastRow() >= dau ? sheet.getRange(dau, 1, sheet.getLastRow() - dau + 1, 9).getValues() : [];
    const chu = dong.map((d) => d.join('|')).join('\n');
    check(so, 'logClientError ghi đúng một dòng nguồn sidebar nêu tên hàm và số ms, bỏ khóa lạ, trả ok để client biết đã ghi',
      [kq && kq.ok, dong.length, chu.indexOf('sidebar|client_timeout') >= 0, chu.indexOf('loadCore') >= 0, chu.indexOf('30000') >= 0, chu.indexOf('khoaLa') >= 0],
      [true, 1, true, true, true, false]);
  } catch (err) {
    ghiLoiNap(so, 'ghi Log qua logClientError', err);
  }

  section('clientError — callServer hết hạn chờ thì tự ghi Log');

  let ca;
  try {
    ca = dungCallServer();
  } catch (err) {
    return ghiLoiNap(so, 'nạp serverCall', err);
  }
  const { hop, goi, hen } = ca;

  let loi = null;
  const p = hop.callServer('loadCore').catch((err) => { loi = err; });
  hen[0].fn();
  await p;
  check(so, 'hết hạn chờ: lỗi nêu tên hàm và số ms, kèm Promise ghi Log, và có đúng một lời gọi logClientError mang tên hàm và số ms',
    [loi && loi.message, !!(loi && loi.logged && typeof loi.logged.then === 'function'), goi.map((g) => g.name), goi[1] && goi[1].args],
    ['Máy chủ không phản hồi hàm loadCore sau 30000 ms.', true, ['loadCore', 'logClientError'], ['client_timeout', 'Máy chủ không phản hồi hàm loadCore sau 30000 ms.', { ham: 'loadCore', ms: 30000 }]]);

  goi[1].ok({ ok: true });
  check(so, 'máy chủ xác nhận ghi thì err.logged ra true', await loi.logged, true);

  goi.length = 0; hen.length = 0; loi = null;
  const p2 = hop.callServer('loadCore').catch((err) => { loi = err; });
  hen[0].fn();
  await p2;
  hen[1].fn();
  check(so, 'lời gọi ghi Log cũng hết hạn thì err.logged ra false và không sinh thêm lời gọi ghi Log nào',
    [await loi.logged, goi.map((g) => g.name)], [false, ['loadCore', 'logClientError']]);

  goi.length = 0; hen.length = 0; loi = null;
  const p3 = hop.callServer('loadCore').catch((err) => { loi = err; });
  goi[0].fail(new Error('Máy chủ ném lỗi'));
  await p3;
  check(so, 'lỗi máy chủ ném (runEntryPoint đã ghi) thì không ghi Log lần nữa và không có err.logged',
    [loi.message, loi.logged, goi.length], ['Máy chủ ném lỗi', undefined, 1]);

  section('clientError — màn lỗi lượt nạp nói đúng việc đã ghi Log hay chưa');

  let boot;
  try {
    boot = dungClient({ tep: ['client/ram/bootstrap.html'], stubs: { Promise, Date } });
  } catch (err) {
    return ghiLoiNap(so, 'nạp bootstrap', err);
  }
  const man = [];
  Object.assign(boot, {
    callTimingReset() {}, dispatchInstall() {}, selectionPollInstall() {}, sheetLinkInstall() {}, changeSignalInstall() {},
    selectionPollSetReady() {}, statusInfoLine() {},
    statusLoadError: (message, logState) => man.push(logState)
  });

  let ghi;
  boot.callServer = () => { const e = new Error('Máy chủ không phản hồi hàm loadCore sau 30000 ms.'); e.logged = new Promise((r) => { ghi = r; }); return Promise.reject(e); };
  const chay1 = boot.sidebarBoot();
  await new Promise((r) => setImmediate(r));
  const truocKhiGhi = man.slice();
  ghi(true);
  const kq1 = await chay1;
  check(so, 'hết hạn chờ, ghi Log được: màn lỗi nói đang ghi rồi nói đã ghi', [truocKhiGhi, man, kq1.logged], [['pending'], ['pending', 'logged'], true]);

  man.length = 0;
  boot.callServer = () => { const e = new Error('hết hạn'); e.logged = Promise.resolve(false); return Promise.reject(e); };
  await boot.sidebarBoot();
  check(so, 'hết hạn chờ, không ghi được Log: màn lỗi nói rõ là chưa ghi, không nói đã ghi', man, ['pending', 'not_logged']);

  man.length = 0;
  boot.callServer = () => Promise.reject(new Error('Máy chủ ném lỗi'));
  await boot.sidebarBoot();
  check(so, 'lỗi máy chủ ném: màn lỗi giữ câu máy chủ đã ghi Log', man, ['server']);

  man.length = 0;
  boot.callServer = () => { const e = new Error('hết hạn'); e.logged = new Promise((r) => { ghi = r; }); return Promise.reject(e); };
  const cu = boot.sidebarBoot();
  await new Promise((r) => setImmediate(r));
  boot.callServer = () => Promise.reject(new Error('lượt mới'));
  await boot.sidebarBoot();
  ghi(true);
  await cu;
  check(so, 'người dùng bấm Thử lại trong lúc chờ ghi Log: lượt cũ không vẽ đè màn của lượt mới', man, ['pending', 'server']);

  const nguonStatus = require('fs').readFileSync(require('path').join(__dirname, '..', '..', '1_ShinCRM_GAS', 'client', 'screen', 'statusScreen.html'), 'utf8');
  check(so, 'màn lỗi có đủ bốn câu theo trạng thái ghi Log', ['server:', 'pending:', 'logged:', 'not_logged:'].every((k) => nguonStatus.indexOf(k) >= 0), true);
}

module.exports = { chay };
