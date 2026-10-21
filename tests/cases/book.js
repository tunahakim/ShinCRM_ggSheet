/**
 * Ca kiểm cho `server/sheet/Book.js`: cửa lấy tệp Sheet không chứa mã Sheet viết cứng.
 *
 * Nhánh nguy hiểm nhất là bản sao: nó mang theo ScriptProperties của script gốc, nên cặp {mã Sheet, mã script} của Sheet gốc nằm sẵn trong kho. Đường gọi từ ngoài mà tin cặp đó là Web App của bản sao âm thầm ghi vào Sheet gốc.
 */

const { taoHopCat, napServer } = require('../lib/load-gas');
const { section, check } = require('../lib/assert');

function dungKho(initial) {
  const data = Object.assign({}, initial || {});
  return { data, writes: 0, getProperty(key) { return data[key] === undefined ? null : data[key]; }, setProperty(key, value) { this.writes++; data[key] = value; } };
}

function dungHopBook(options) {
  const opts = options || {};
  const props = opts.props || dungKho();
  const opened = [];
  const events = [];
  const hop = taoHopCat({
    LOG_OK: 'ok',
    logEvent: (entry) => events.push(entry.action),
    ScriptApp: { getScriptId: () => opts.scriptId || 'script-A' },
    PropertiesService: { getScriptProperties: () => props },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => { if (opts.active) { return opts.active; } throw new Error('reading from storage NOT_FOUND'); },
      openById: (id) => { opened.push(id); return { getId: () => id, getName: () => 'Sheet ' + id }; }
    }
  });
  napServer(hop, 'server/sheet/Book.js');
  return { hop, props, opened, events };
}

function chay(so) {
  section('Cửa lấy tệp Sheet — không mã viết cứng, bản sao không mở nhầm Sheet gốc');

  const banSao = { getId: () => 'sheet-copy', getName: () => 'Bản sao' };
  const coMo = dungHopBook({ active: banSao });
  check(so, 'có Sheet đang mở (Sidebar, menu, trigger) thì dùng nó dù là bản sao', coMo.hop.shinOpenBook().getId(), 'sheet-copy');

  const kho = dungKho();
  const ghi = dungHopBook({ active: banSao, props: kho });
  const lan1 = ghi.hop.shinBookBindingRecord(banSao, kho);
  const lan2 = ghi.hop.shinBookBindingRecord(banSao, kho);
  check(so, 'mở Sidebar ghi cặp mã Sheet và mã script một lần, lần sau giống thì không ghi lại', [lan1.changed, lan2.changed, kho.writes, ghi.events], [true, false, 1, ['bookBindingRecorded']]);

  const ngoai = dungHopBook({ props: kho });
  const a = ngoai.hop.shinOpenBook();
  const b = ngoai.hop.shinOpenBook();
  check(so, 'lời gọi từ ngoài mở đúng Sheet đã ghi, nhiều lần trong một lượt chỉ mở một lần', [a.getId(), b === a, ngoai.opened], ['sheet-copy', true, ['sheet-copy']]);

  const khoGoc = dungKho({ SHIN_BOOK_BINDING_V1: JSON.stringify({ spreadsheetId: 'sheet-original', scriptId: 'script-original' }) });
  const saoNgoai = dungHopBook({ props: khoGoc, scriptId: 'script-copy' });
  let loi = '';
  try { saoNgoai.hop.shinOpenBook(); } catch (err) { loi = err.message; }
  check(so, 'bản sao mang kho của script gốc: lời gọi từ ngoài báo lỗi rõ, không mở Sheet gốc', [saoNgoai.opened, /Mở Sidebar ShinCRM trên Sheet này/.test(loi)], [[], true]);

  const chuaGhi = dungHopBook({});
  let loi2 = '';
  try { chuaGhi.hop.shinOpenBook(); } catch (err) { loi2 = err.message; }
  check(so, 'chưa từng ghi thì lời gọi từ ngoài báo lỗi, không đoán Sheet', [chuaGhi.opened, loi2 !== ''], [[], true]);

  const khoHong = dungKho({ SHIN_BOOK_BINDING_V1: '{hỏng' });
  const hongNgoai = dungHopBook({ props: khoHong });
  let loi3 = '';
  try { hongNgoai.hop.shinOpenBook(); } catch (err) { loi3 = err.message; }
  const hongMo = dungHopBook({ active: banSao, props: khoHong });
  const ghiLai = hongMo.hop.shinBookBindingRecord(banSao, khoHong);
  check(so, 'cặp hỏng: lời gọi từ ngoài báo lỗi; mở Sidebar ghi đè lại theo Sheet đang mở', [hongNgoai.opened, /bị hỏng/.test(loi3), ghiLai.changed, JSON.parse(khoHong.data.SHIN_BOOK_BINDING_V1).spreadsheetId], [[], true, true, 'sheet-copy']);

  check(so, 'Book.js không còn hằng số mã Sheet', typeof coMo.hop.SETUP_EXPECTED_SPREADSHEET_ID, 'undefined');
}

module.exports = { chay };
