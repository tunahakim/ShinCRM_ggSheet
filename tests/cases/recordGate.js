/**
 * Sổ bận và Cửa bản ghi (tài liệu 06 Phần 1–2): hai tệp lõi chạy riêng trong hộp cát với khóa tài liệu đếm lồng, kho đếm số lần ghi và cửa ghi/cửa xóa giả.
 *
 * Nhánh dễ hỏng âm thầm: đọc sổ ngoài khóa, nhả bản ghi của chủ khác, coi sổ hỏng là rỗng, ghi kho trong phiên ngắn, ghi đè mã đang bận, đổi sổ khi lần ghi không đạt.
 */

const vm = require('vm');
const { section, check } = require('../lib/assert');
const { taoHopCat, docTep } = require('../lib/load-gas');

/** Hộp cát cho hai tệp lõi: `kho` là DocumentProperties giả, `ghiKho` đếm lần setProperty/deleteProperty, `ghi`/`xoa` ghi lại lời gọi cửa ghi/cửa xóa. */
function taoCua(opts) {
  const o = opts || {};
  const kho = Object.assign({}, o.kho || {}), dem = { ghiKho: 0 }, ghi = [], xoa = [];
  const hop = taoHopCat({
    DOCUMENT_STORE: { docLockDepth: 0 },
    documentProps: () => ({
      getProperty: (k) => (k in kho ? kho[k] : null),
      setProperty: (k, v) => { dem.ghiKho += 1; kho[k] = v; },
      deleteProperty: (k) => { dem.ghiKho += 1; delete kho[k]; }
    }),
    entityReadAllCombined: (entity) => ({ entity, rows: (o.dong || {})[entity] || [] }),
    entityReadRecordById: (entity, schemas, id) => ({ entity, rows: ((o.dong || {})[entity] || []).filter((r) => r.id === id) }),
    entityBlockRecords: (block) => block.rows.slice(),
    writeGateSave: (req) => { ghi.push(req.records.map((r) => r.id)); return o.ghiHong ? { ok: false, code: 'OLD_CHANGED' } : { ok: true }; },
    deleteGateRemove: (req) => { xoa.push(req.ids.slice()); return { ok: true }; }
  });
  hop.documentLockRun = (fn) => { hop.DOCUMENT_STORE.docLockDepth += 1; try { return fn(); } finally { hop.DOCUMENT_STORE.docLockDepth -= 1; } };
  vm.runInContext(docTep('server/state/DocumentStore.js').match(/function documentPropertyJson[\s\S]*?\n}\n/)[0], hop);
  ['server/state/RecordHolds.js', 'server/gate/RecordGate.js'].forEach((tep) => vm.runInContext(docTep(tep), hop, { filename: tep }));
  return { hop, kho, dem, ghi, xoa };
}

const nem = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
const soCua = (c) => JSON.parse(c.kho.SHIN_RECORD_HOLDS_V1 || '{}');

function testSoBan(so) {
  const a = taoCua();
  check(so, 'sổ bận đọc hoặc ghi ngoài khóa tài liệu thì ném lỗi', [
    /trong khóa tài liệu/.test(nem(() => a.hop.recordHoldsRead())), /trong khóa tài liệu/.test(nem(() => a.hop.recordHoldsWrite({}, { 'customer:C1': {} })))
  ], [true, true]);

  const hong = taoCua({ kho: { SHIN_RECORD_HOLDS_V1: '{hỏng' } });
  const mang = taoCua({ kho: { SHIN_RECORD_HOLDS_V1: '[1]' } });
  check(so, 'sổ hỏng (không phải JSON hoặc không phải bảng) thì ném lỗi, không coi là rỗng', [
    /hỏng/.test(nem(() => hong.hop.recordGateRun({ by: 'sidebar', decide: () => ({}) }))), /hỏng/.test(nem(() => mang.hop.recordGateRun({ by: 'sidebar', decide: () => ({}) })))
  ], [true, true]);

  const b = taoCua({ kho: { SHIN_RECORD_HOLDS_V1: JSON.stringify({ 'customer:C1': { by: 'fbm', run: 'r1', reason: 'đang đẩy', at: 'x' } }) } });
  const loiNha = nem(() => b.hop.recordGateRun({ by: 'sidebar', decide: () => ({ release: [{ entity: 'customer', ids: ['C1'] }] }) }));
  const loiGiu = nem(() => b.hop.recordGateRun({ by: 'sidebar', decide: () => ({ hold: [{ entity: 'customer', ids: ['C1'], reason: 'thử' }] }) }));
  check(so, 'nhả hoặc giữ đè bản ghi của chủ khác thì ném lỗi, sổ và kho không đổi', [
    /Chủ nào giữ thì chủ đó nhả/.test(loiNha), /đang do "fbm" giữ/.test(loiGiu), b.dem.ghiKho, soCua(b)['customer:C1'].by
  ], [true, true, 0, 'fbm']);
  check(so, 'giữ bản ghi mà thiếu lý do thì ném lỗi', /cần lý do/.test(nem(() => taoCua().hop.recordGateRun({ by: 'fbm', decide: () => ({ hold: [{ entity: 'customer', ids: ['C1'] }] }) }))), true);

  const c = taoCua({ dong: { customer: [{ id: 'C1' }] } });
  const kq = c.hop.recordGateRun({ by: 'sidebar', decide: () => ({ hold: [{ entity: 'customer', ids: ['C1'], reason: 'đang lưu' }], release: [], save: [{ entity: 'customer', records: [{ id: 'C1' }] }] }) });
  c.hop.recordGateRun({ by: 'sidebar', decide: () => ({ release: [{ entity: 'customer', ids: ['C1'] }] }) });
  const d = taoCua();
  d.hop.recordGateRun({ by: 'sidebar', decide: () => ({ save: [{ entity: 'customer', records: [{ id: 'C1' }] }] }) });
  check(so, 'phiên ngắn không giữ gì thì không chạm kho; giữ rồi nhả thì sổ về rỗng và xóa khóa kho', [d.dem.ghiKho, kq.ok, 'SHIN_RECORD_HOLDS_V1' in c.kho], [0, true, false]);

  const e = taoCua({ kho: { SHIN_RECORD_HOLDS_V1: JSON.stringify({ 'customer:C1': { by: 'fbm', reason: 'đẩy' }, 'activity:A1': { by: 'khac', reason: 'x' } }) } });
  const f = taoCua();
  check(so, 'nhả theo chủ chỉ bỏ mục của chủ đó; sổ không có mục của chủ thì không lấy khóa, không ghi kho', [
    e.hop.recordGateReleaseOwner('fbm'), Object.keys(soCua(e)), f.hop.recordGateReleaseOwner('fbm'), f.dem.ghiKho
  ], [true, ['activity:A1'], false, 0]);
}

function testCua(so) {
  const giu = JSON.stringify({ 'customer:C1': { by: 'fbm', run: 'r1', reason: 'Đồng bộ đang đẩy bản ghi này lên FBM.', at: 'x' } });

  const a = taoCua({ kho: { SHIN_RECORD_HOLDS_V1: giu } });
  const loiGhi = nem(() => a.hop.recordGateRun({ by: 'sidebar', decide: () => ({ save: [{ entity: 'customer', records: [{ id: 'C1' }, { id: 'C2' }] }] }) }));
  const loiXoa = nem(() => a.hop.recordGateRun({ by: 'sidebar', decide: () => ({ remove: [{ entity: 'customer', ids: ['C1'] }] }) }));
  check(so, 'hàm quyết trả mã đang bị chủ khác giữ (ghi hoặc xóa) thì cửa ném lỗi và không gọi cửa ghi/cửa xóa', [
    /đang bị tiến trình khác giữ: customer:C1/.test(loiGhi), /customer:C1/.test(loiXoa), a.ghi, a.xoa
  ], [true, true, [], []]);

  let thay = null;
  const b = taoCua({ kho: { SHIN_RECORD_HOLDS_V1: giu } });
  const kqB = b.hop.recordGateRun({ by: 'sidebar', decide: (gate) => { thay = gate.busy('customer', ['C1', 'C2']); return { value: 'bận' }; } });
  const kqFbm = b.hop.recordGateRun({ by: 'fbm', decide: (gate) => ({ value: gate.busy('customer', ['C1']) }) });
  check(so, 'gate.busy chỉ báo mã do chủ khác giữ, kèm lý do; chủ đang giữ không thấy chính mình bận', [
    thay, kqB.value, kqFbm.value
  ], [{ C1: { by: 'fbm', reason: 'Đồng bộ đang đẩy bản ghi này lên FBM.', at: 'x' } }, 'bận', {}]);

  const c = taoCua({ ghiHong: true });
  const kqC = c.hop.recordGateRun({ by: 'fbm', decide: () => ({ save: [{ entity: 'customer', records: [{ id: 'C1' }] }, { entity: 'activity', records: [{ id: 'A1' }] }], remove: [{ entity: 'customer', ids: ['C9'] }], hold: [{ entity: 'customer', ids: ['C1'], reason: 'đẩy' }] }) });
  check(so, 'lần ghi không đạt thì dừng: không ghi phần sau, không xóa, sổ và kho không đổi', [kqC.ok, c.ghi, c.xoa, c.dem.ghiKho], [false, [['C1']], [], 0]);

  const d = taoCua({ dong: { customer: [{ id: 'C1', ten: 'An' }] } });
  let thuTu = [];
  d.hop.writeGateSave = (req) => { thuTu.push('ghi ' + req.records[0].ten); return { ok: true }; };
  const kqD = d.hop.recordGateRun({ by: 'sidebar', decide: (gate) => { const r = gate.readById('customer', {}, 'C1'); thuTu.push('đọc ' + r.ten); return { save: [{ entity: 'customer', records: [{ id: 'C1', ten: r.ten + ' Mới' }] }], value: d.hop.DOCUMENT_STORE.docLockDepth }; } });
  check(so, 'hàm quyết đọc và ghi trong cùng một lần cầm khóa, trên dòng đọc mới', [thuTu, kqD.value, kqD.ok], [['đọc An', 'ghi An Mới'], 1, true]);

  check(so, 'cửa thiếu chủ hoặc thiếu hàm quyết thì ném lỗi', [
    /cần `by`/.test(nem(() => taoCua().hop.recordGateRun({ decide: () => ({}) }))), /cần `decide`/.test(nem(() => taoCua().hop.recordGateRun({ by: 'sidebar' })))
  ], [true, true]);
}

function chay(so) {
  section('Sổ bận và Cửa bản ghi');
  testSoBan(so);
  testCua(so);
}

module.exports = { chay };
