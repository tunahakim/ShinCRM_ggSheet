/** Cửa ghi kéo về nhận đầu vào qua tham số: sổ chờ đẩy do người điều phối lô đọc một lần (`ctx.pending`), bản ghi thiếu dấu vân bị chặn trước khi chạm Sheet, phân tích response không sửa dữ liệu đầu vào. */
const { section, check } = require('../../lib/assert');
const { hopKeoVe, congDanhMucThu } = require('../../lib/fbm/hop-keo');
const { luoiDaCat, dongFbm } = require('../../lib/fbm/tab-fbm-gia');

function thrownCode(fn) {
  try { fn(); return 'không ném'; } catch (error) { return String(error && error.code || error && error.message || error); }
}

async function chay(so) {
  section('FBM sync — cửa ghi kéo về nhận sổ chờ đẩy qua tham số');
  const hop = hopKeoVe(), F = hop.FbmSync, gate = congDanhMucThu();
  F.readCategoryGate = () => gate;
  let ghiSheet = 0, docSoTungMuc = 0, docSo = 0;
  hop.writeGateSave = () => { ghiSheet += 1; return { ok: true }; };
  F.pendingPushGet = () => { docSoTungMuc += 1; throw new Error('pullPageApply tự đọc sổ chờ đẩy'); };
  const incoming = F.customerRecord({ stt_rec_kh: 'S1', ma_kh: 'ALT00010', ten_kh: 'Đã đẩy' }, gate);
  F.readLocal = (entity) => (entity === 'customer' ? [Object.assign({}, incoming, { id: 'CUS-1', fbmHash: 'hash-cu', syncStatus: F.SYNC_STATUS.pushed })] : []);
  const ctx = { categoryGate: gate, accountName: '', now: Date.now() };

  check(so, 'Thiếu ctx.pending thì ném PULL_PENDING_MISSING, không ghi Sheet', [thrownCode(() => F.pullPageApply('customer', [incoming], ctx)), ghiSheet], ['PULL_PENDING_MISSING', 0]);
  const khongDauVan = Object.assign({}, incoming, { fbmHash: '' });
  check(so, 'Bản ghi thiếu dấu vân FBM thì ném PULL_RECORD_UNHASHED, không ghi Sheet', [thrownCode(() => F.pullPageApply('customer', [khongDauVan], Object.assign({ pending: {} }, ctx))), ghiSheet], ['PULL_RECORD_UNHASHED', 0]);

  const pending = { 'customer:CUS-1': { hash: incoming.fbmHash } };
  const truc = F.pullPageApply('customer', [incoming], Object.assign({ pending }, ctx));
  check(so, 'Bản đã đẩy khớp mục chờ trong ctx.pending thì xác nhận, không tự đọc sổ', [truc.pendingClears, docSoTungMuc, ghiSheet], [[{ entity: 'customer', id: 'CUS-1' }], 0, 1]);

  // Người điều phối lô đọc sổ đúng một lần mỗi lô và truyền xuống.
  F.pendingPushesRead = () => { docSo += 1; return pending; };
  const xoa = [];
  F.pendingPushClear = (entity, id) => { xoa.push(entity + ':' + id); };
  const state = F.stateDefault();
  state.mode = 'read';
  F.pullBatchApply(state, 'customer', [incoming, F.customerRecord({ stt_rec_kh: 'S2', ma_kh: 'ALT00011', ten_kh: 'Mới' }, gate)], ctx);
  check(so, 'pullBatchApply đọc sổ chờ đẩy một lần cho cả lô rồi xóa mục đã khớp', [docSo, docSoTungMuc, xoa], [1, 0, ['customer:CUS-1']]);

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
