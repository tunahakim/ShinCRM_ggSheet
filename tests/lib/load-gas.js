/**
 * Bộ nạp code Apps Script vào hộp cát của Node, để bộ kiểm offline gọi được hàm thật chứ không phải chép lại logic sang chỗ khác.
 *
 * Vì sao phải có tệp này: Apps Script không có require, không có module.exports — mọi tệp dùng chung một vùng tên toàn cục.
 * Muốn kiểm hàm thật mà không chép lại code thì phải dựng lại đúng cái vùng tên đó, nên ở đây một hộp cát `vm` được giữ chung
 * cho nhiều tệp, đúng như cách Google chạy chúng.
 *
 * Phía client là tệp `.html` bọc thẻ `<script>`, nên trước khi nạp phải cắt lấy phần ruột. Phép cắt nằm ngay trong tệp này,
 * đọc được và sửa được — khác hẳn với việc đi đoán luật đổi ký tự của Google.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAS_DIR = path.join(__dirname, '..', '..', '1_ShinCRM_GAS');

/**
 * Dựng một hộp cát rỗng. Truyền `stubs` để đặt sẵn những thứ chỉ có trên Google — ví dụ một `SpreadsheetApp` giả.
 * Không đặt sẵn gì thì hàm nào đụng tới `SpreadsheetApp` sẽ ném lỗi "is not defined", và đó là điều mong muốn:
 * hàm thuần thì không được đụng vào nó.
 */
function taoHopCat(stubs) {
  const hopCat = Object.assign({ console: console }, stubs || {});
  vm.createContext(hopCat);
  return hopCat;
}

/**
 * Cắt lấy phần ruột của các thẻ `<script>` trong một tệp client.
 *
 * Mỗi đoạn bị cắt bỏ được thay bằng đúng số dòng trống tương ứng, nên số dòng trong thông báo lỗi vẫn trỏ đúng dòng của tệp gốc.
 * Không có thẻ `<script>` nào thì ném lỗi chứ không trả về chuỗi rỗng: nạp một tệp rỗng trong im lặng là cách chắc chắn nhất
 * để có một bộ kiểm xanh mà chẳng kiểm gì.
 */
function catRuotScript(raw, nhan) {
  const mo = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  const phan = [];
  let daDoc = 0;
  let khop;

  const demDong = (text) => text.split('\n').length - 1;

  while ((khop = mo.exec(raw)) !== null) {
    const truoc = raw.slice(daDoc, khop.index + khop[0].indexOf(khop[1]));
    phan.push('\n'.repeat(demDong(truoc)));
    phan.push(khop[1]);
    daDoc = khop.index + khop[0].length;
  }

  if (!phan.length) {
    throw new Error('Tệp client "' + nhan + '" không có thẻ <script> nào. Không nạp được gì, nên coi là lỗi chứ không im lặng.');
  }

  return phan.join('');
}

/** Đọc một tệp trong dự án GAS. Thiếu tệp thì nói rõ thiếu tệp nào, vì đây là lỗi hay gặp nhất lúc mới dựng. */
function docTep(duongDanTuongDoi) {
  const duongDan = path.join(GAS_DIR, duongDanTuongDoi);
  if (!fs.existsSync(duongDan)) {
    throw new Error('Không thấy tệp "' + duongDanTuongDoi + '" trong 1_ShinCRM_GAS. Chưa dựng hoặc đặt sai chỗ.');
  }
  // Repo lưu LF nhưng Windows có thể checkout CRLF; test so chuỗi nhiều dòng bằng '\n' nên luôn đọc về LF.
  return fs.readFileSync(duongDan, 'utf8').replace(/\r\n/g, '\n');
}

/** Nạp một hoặc nhiều tệp `.js` phía máy chủ vào hộp cát, theo đúng thứ tự truyền vào. */
/**
 * Trên GAS mọi tệp chung một phạm vi toàn cục, nên module đồng bộ luôn thấy bảng giá trị "Cho phép đồng bộ FBM" khai ở `DataSchema.js`. Hộp cát chỉ nạp vài tệp nên phải cấp riêng bảng đó; chỉ chép đúng hai tên này để không đè `DATA_SCHEMA` giả mà test tự dựng.
 */
function capBangChoPhepDongBo(hopCat) {
  if (hopCat.FBM_SYNC_PERMISSION_OPTIONS) { return; }
  const rieng = taoHopCat({});
  vm.runInContext(docTep('server/data/DataSchema.js'), rieng, { filename: 'server/data/DataSchema.js' });
  vm.runInContext(docTep('server/config/ConfigParams.js'), rieng, { filename: 'server/config/ConfigParams.js' });
  hopCat.FBM_SYNC_PERMISSION_OPTIONS = rieng.FBM_SYNC_PERMISSION_OPTIONS;
  hopCat.fbmSyncPermissionValues = rieng.fbmSyncPermissionValues;
  capOXacThucMacDinh(hopCat, rieng.FBM_VERIFY_STATUS_CONFIG_NAME);
}

/** Giá trị ô Config "Xác thực mặc định cho khách kéo từ FBM" của tệp thử; test cần giá trị khác thì tự gán `configGet`. */
const XAC_THUC_MAC_DINH_THU = 'Chưa xác thực';

/**
 * Tệp thật luôn có ô Config này (preflight chặn khi trống), nên hộp cát chỉ nạp vài tệp đồng bộ cũng được cấp sẵn tên ô và một `configGet` chỉ trả giá trị cho đúng ô đó.
 * Hộp cát đã có `configGet` riêng thì giữ nguyên.
 */
function capOXacThucMacDinh(hopCat, ten) {
  if (!hopCat.FBM_VERIFY_STATUS_CONFIG_NAME) { hopCat.FBM_VERIFY_STATUS_CONFIG_NAME = ten; }
  if (typeof hopCat.configGet !== 'function') { hopCat.configGet = (name, fallback) => name === ten ? XAC_THUC_MAC_DINH_THU : (fallback === undefined ? '' : fallback); }
}

/** Mã người dùng FBM của phiên thử; test cần nhánh thiếu mã thì tự gán `scriptSettings`. */
const MA_NGUOI_DUNG_THU = '2037';

/**
 * Tệp thật luôn có mã người dùng sau bước kiểm phiên, và request đọc khách thiếu mã thì không dựng được. Hộp cát dựng phiên giả không qua bước đó nên được cấp sẵn mã thử khi phiên giả để trống.
 */
function capMaNguoiDungThu(hopCat) {
  const goc = hopCat.FbmSync && hopCat.FbmSync.scriptSettings;
  if (typeof goc !== 'function') { return; }
  hopCat.FbmSync.scriptSettings = function () { const cfg = goc.apply(this, arguments); if (!cfg.userId) { cfg.userId = MA_NGUOI_DUNG_THU; } return cfg; };
}

/**
 * Đồng bộ ghi Sheet qua Cửa bản ghi (`recordGateRun`), còn hộp cát FBM chỉ nạp tệp đồng bộ và tự gán `FbmSync.readLocal`, `writeGateSave`. Nạp cửa và sổ bận thật; phần chỉ có trên Google thay bằng bản tối thiểu, chỉ khi hộp cát chưa có:
 *   - không có khóa tài liệu (`LockService.getDocumentLock`) hoặc `SETTINGS` thì khóa tài liệu là bộ đếm lồng (đủ để sổ bận biết đang trong khóa);
 *   - không có `PropertiesService` thì kho tài liệu nằm trong bộ nhớ;
 *   - không có tầng đọc bản ghi thì `gate.read`/`gate.readById` đọc qua `FbmSync.readLocal` mà test đã gán.
 */
function capCuaBanGhi(hopCat) {
  if (typeof hopCat.recordGateRun === 'function') { return; }
  if (!hopCat.PropertiesService) {
    const kho = {};
    hopCat.PropertiesService = { getDocumentProperties: () => ({ getProperty: (k) => (k in kho ? kho[k] : null), setProperty: (k, v) => { kho[k] = String(v); }, deleteProperty: (k) => { delete kho[k]; }, setProperties: (m) => { Object.keys(m).forEach((k) => { kho[k] = String(m[k]); }); }, getProperties: () => Object.assign({}, kho) }) };
  }
  // Kho thật luôn có `deleteProperty` (sổ bận rỗng thì xóa khóa); kho giả của test cũ thiếu thì xóa bằng cách ghi chuỗi rỗng, nghĩa như chưa có.
  const layKho = hopCat.PropertiesService.getDocumentProperties;
  if (typeof layKho === 'function') {
    hopCat.PropertiesService.getDocumentProperties = function () {
      const kho = layKho.apply(this, arguments);
      if (kho && typeof kho.deleteProperty !== 'function' && typeof kho.setProperty === 'function') { kho.deleteProperty = (k) => kho.setProperty(k, ''); }
      return kho;
    };
  }
  if (!hopCat.LockService || typeof hopCat.LockService.getDocumentLock !== 'function' || !hopCat.SETTINGS) {
    // Như bản thật trừ phần Google: vào lớp ngoài cùng thì bỏ bản đọc, ra lớp ngoài cùng thì gửi kho phần ghi chờ trong khóa.
    vm.runInContext('documentLockRun = function (work) { var outer = DOCUMENT_STORE.docLockDepth === 0; if (outer) { documentStoreRefresh(); } DOCUMENT_STORE.docLockDepth += 1; try { return work(); } finally { DOCUMENT_STORE.docLockDepth -= 1; if (outer) { documentStoreFlush(DOCUMENT_STORE_DIRTY_DOC); if (!documentStoreActive()) { documentStoreClear(); } } } };', hopCat);
  }
  if (typeof hopCat.entityReadAllCombined !== 'function') {
    // `FbmSync.readLocal` thật cũng đọc qua tầng này; test chưa gán Sheet giả thì lần gọi lồng trả Sheet rỗng thay vì đệ quy vô tận.
    let dangDoc = false;
    const khoi = (entity, loc) => {
      if (dangDoc) { return { entity, fields: [], rows: [] }; }
      dangDoc = true;
      try {
        const records = (hopCat.FbmSync.readLocal(entity) || []).filter(loc || (() => true));
        const fields = [];
        records.forEach((record) => Object.keys(record).forEach((field) => { if (fields.indexOf(field) < 0) { fields.push(field); } }));
        return { entity, fields, rows: records.map((record) => fields.map((field) => record[field])) };
      } finally { dangDoc = false; }
    };
    hopCat.entityReadAllCombined = (entity) => khoi(entity);
    hopCat.entityReadRecordById = (entity, schemas, id) => khoi(entity, (record) => String(record.id || '').trim() === String(id || '').trim());
  }
  if (typeof hopCat.entityBlockRecords !== 'function') { vm.runInContext(docTep('server/sheet/EntityRead.js').match(/function entityBlockRecords[\s\S]*?\n}\n/)[0], hopCat); }
  ['server/state/RecordHolds.js', 'server/gate/RecordGate.js'].forEach((tep) => vm.runInContext(docTep(tep), hopCat, { filename: tep }));
}

/** Ghi một mục giữ của chủ `by` vào sổ bận qua cửa thật. */
function giuBanGhi(hopCat, by, entity, id, reason) {
  return hopCat.recordGateRun({ by: by, run: 'run-thu', decide: () => ({ hold: [{ entity: entity, ids: [id], reason: reason || 'Tiến trình ' + by + ' đang giữ bản ghi này.' }] }) });
}

/** Ghi một mục giữ của đồng bộ vào sổ bận, như lúc đồng bộ đánh dấu "đang đẩy". */
function giuBanGhiDongBo(hopCat, entity, id) {
  return giuBanGhi(hopCat, 'fbm', entity, id, 'Đồng bộ đang đẩy bản ghi này lên FBM.');
}

/** Sổ bận hiện tại `{ "entity:mã": { by, run, reason, at } }`, đọc qua đúng cổng trong khóa tài liệu. */
function soBan(hopCat) {
  return hopCat.documentLockRun(() => hopCat.recordHoldsRead());
}

/** Công cụ đọc/ghi Sheet tầng 1–3 (tài liệu 06 Phần 2): mọi tệp chạm Sheet đi qua chúng. */
const TEP_TANG_SHEET = ['server/sheet/SheetReadCopy.js', 'server/sheet/SheetPolicy.js', 'server/sheet/SheetCellWrite.js', 'server/sheet/SheetStructure.js', 'server/sheet/SheetGrid.js', 'server/sheet/SheetRegions.js', 'server/sheet/SheetLocate.js', 'server/sheet/EntityWrite.js'];

function napServer(hopCat, ...duongDans) {
  // Trên GAS mọi tệp chung một không gian tên; cửa kho DocumentProperties và tầng đọc/ghi Sheet là phụ thuộc của gần như mọi tệp server nên luôn nạp trước, như bản thật.
  if (typeof hopCat.documentProps !== 'function' && duongDans.indexOf('server/state/DocumentStore.js') < 0) {
    vm.runInContext(docTep('server/state/DocumentStore.js'), hopCat, { filename: 'server/state/DocumentStore.js' });
  }
  if (typeof hopCat.sheetReadHeader !== 'function') {
    TEP_TANG_SHEET.filter((tep) => duongDans.indexOf(tep) < 0).forEach((tep) => vm.runInContext(docTep(tep), hopCat, { filename: tep }));
  }
  duongDans.forEach((duongDan) => {
    if (duongDan.indexOf('fbm_sync/') === 0) { capBangChoPhepDongBo(hopCat); }
    vm.runInContext(docTep(duongDan), hopCat, { filename: duongDan });
    if (duongDan === 'fbm_sync/read/GridRead.js') { capMaNguoiDungThu(hopCat); }
    if (duongDan === 'fbm_sync/write/SheetSave.js' || duongDan === 'fbm_sync/state/State.js') { capCuaBanGhi(hopCat); }
  });
  return hopCat;
}

/** Nạp một hoặc nhiều tệp client `.html`, cắt thẻ `<script>` rồi chạy phần ruột trong cùng hộp cát. */
function napClient(hopCat, ...duongDans) {
  duongDans.forEach((duongDan) => {
    const js = catRuotScript(docTep(duongDan), duongDan);
    vm.runInContext(js, hopCat, { filename: duongDan });
  });
  return hopCat;
}

/**
 * Nạp một tệp vào hộp cát **riêng** của nó. Dùng cho phép so hai bản sinh đôi server và client:
 * hai bản cùng tên hàm, nạp chung một hộp thì bản sau ghi đè bản trước và phép so trở thành vô nghĩa.
 */
function napRieng(duongDan, stubs) {
  const hopCat = taoHopCat(stubs);
  return duongDan.endsWith('.html') ? napClient(hopCat, duongDan) : napServer(hopCat, duongDan);
}

/** Chạy `fn` trong danh sách thay đổi chờ ghi nhận như một lần chạy GAS (`runEntryPoint`): dấu nạp lại gom lại và ghi nhận một lần khi `fn` xong. Dùng cho test gọi thẳng cửa ghi mà không qua cửa vào. */
function trongLanChay(hopCat, fn) {
  hopCat.pendingChangesBegin();
  try { return fn(); } finally { hopCat.pendingChangesEnd(); }
}

/** Dòng sổ nhật ký nạp lại mới nhất (rỗng nếu chưa có), để ca kiểm xem một lần chạy đã báo đổi phần nào. */
function dongSoCuoi(hopCat) {
  return hopCat.reloadJournalRead().entries.slice(-1)[0] || {};
}

module.exports = { GAS_DIR, taoHopCat, napServer, giuBanGhi, giuBanGhiDongBo, soBan, napClient, napRieng, catRuotScript, docTep, trongLanChay, dongSoCuoi };
