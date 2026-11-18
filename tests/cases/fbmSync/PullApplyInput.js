/** Cửa ghi kéo về nhận đầu vào qua tham số: bản ghi thiếu dấu vân bị chặn trước khi chạm Sheet; dòng đã đẩy được xác nhận bằng so ba chiều trên chính dòng, không có sổ chờ; phân tích response không sửa dữ liệu đầu vào. */
const { section, check } = require('../../lib/assert');
const { hopKeoVe, congDanhMucThu } = require('../../lib/fbm/hop-keo');
const { luoiDaCat, dongFbm } = require('../../lib/fbm/tab-fbm-gia');

function thrownCode(fn) {
  try { fn(); return 'không ném'; } catch (error) { return String(error && error.code || error && error.message || error); }
}

async function chay(so) {
  section('FBM sync — cửa ghi kéo về xác nhận dòng đã đẩy bằng chính dòng');
  const hop = hopKeoVe(), F = hop.FbmSync, gate = congDanhMucThu();
  F.readCategoryGate = () => gate;
  let ghiSheet = 0, ghiCuoi = null;
  hop.writeGateSave = (change) => { ghiSheet += 1; ghiCuoi = change; return { ok: true }; };
  const incoming = F.customerRecord({ stt_rec_kh: 'S1', ma_kh: 'ALT00010', ten_kh: 'Đã đẩy' }, gate);
  const ctx = { categoryGate: gate, accountName: '', now: Date.now(), runId: 'R1' };
  const dongDaDay = (extra) => { F.readLocal = (entity) => (entity === 'customer' ? [Object.assign({}, incoming, { id: 'CUS-1', fbmHash: 'hash-cu', syncStatus: F.SYNC_STATUS.pushed }, extra || {})] : []); };

  dongDaDay();
  const khongDauVan = Object.assign({}, incoming, { incomingHash: '' });
  check(so, 'Bản ghi thiếu dấu vân FBM thì ném PULL_RECORD_UNHASHED, không ghi Sheet', [thrownCode(() => F.pullPageApply('customer', [khongDauVan], ctx)), ghiSheet], ['PULL_RECORD_UNHASHED', 0]);

  const khop = F.pullPageApply('customer', [incoming], ctx);
  check(so, 'Dòng "đã đẩy chờ xác nhận" mà FBM trả đúng bản trên dòng thì xác nhận "đã đồng bộ", không cần sổ chờ', [khop.written, khop.conflicts, ghiSheet], [1, 0, 1]);

  dongDaDay({ companyName: 'Sửa tiếp sau khi đẩy' });
  const xungDot = F.pullPageApply('customer', [incoming], ctx);
  check(so, 'Dòng "đã đẩy chờ xác nhận" khác bản FBM và khác mốc cũ thì là xung đột, không ghi đè', xungDot.conflicts, 1);

  dongDaDay({ companyName: 'Sửa tiếp sau khi đẩy', fbmHash: incoming.incomingHash });
  const khongAn = F.pullPageApply('customer', [incoming], ctx);
  check(so, 'FBM vẫn trả đúng mốc cũ sau lần đẩy thì "đẩy không ăn", không xung đột', [khongAn.conflicts, khongAn.skipped], [0, 1]);

  section('FBM sync — phân tích response không sửa dữ liệu đầu vào');
  const fields = F.scanFields('customer');
  const item = await luoiDaCat(F, 'customer', fields, [dongFbm(fields, { stt_rec_kh: 'S9', ma_kh: 'ALT00099', ten_kh: 'Khách thử' })], 1);
  const itemTruoc = JSON.stringify(item);
  const parsed = F.protocol.parse(item), parsedTruoc = JSON.stringify(parsed);
  const grid = F.rowsToRecords('customer', parsed);
  check(so, 'protocol.parse và rowsToRecords không sửa response hay kết quả phân tích', [JSON.stringify(item) === itemTruoc, JSON.stringify(parsed) === parsedTruoc, grid.rows.length], [true, true, 1]);
  return so;
}

module.exports = { chay };
