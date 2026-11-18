/** Ma trận xung đột giao dịch (G9): DTO màn chọn giá trị đọc nhãn từ DATA_SCHEMA thật, trường MST chỉ chọn một bên, PA3 ghi đúng details và end_date về content và workDate. */
const { section, check } = require('../../lib/assert');
const { datState } = require('../../lib/fbm/dat-state');
const { taoHopCat, napServer } = require('../../lib/load-gas');
const { makeSync } = require('../../lib/fbm/hang-day');
const { keoVe, keoLo } = require('../../lib/fbm/keo-ve');
const { luoiTheoTen, khachMau, chotXungDot } = require('../../lib/fbm/ma-tran');

async function chay(so) {
  section('FBM sync — ma trận xung đột giao dịch (G9)');
  const sync = makeSync();
  // G9.3: PA3 cho Activity đi đúng đường lệnh chốt xung đột; trường FBM `details`/`end_date` ghi về `content`/`workDate` của ShinCRM.
  const activityGridFields = ['id', 'ten_loai', 'ten_cv', 'details', 'start_date', 'end_date', 'ten_tt', 'owner', 'nguoi_sua', 'datetime0', 'line_nbr'];
  const activityGrid = (requestId, rows) => luoiTheoTen(sync.hop.FbmSync, 'activity', activityGridFields, rows, requestId);
  const fbmActivity = (details, endDate) => ({ id: 'FBM-A1', ma_kh: 'ALT00001', ten_cv: 'Gọi điện', details, end_date: endDate });
  const ac = makeSync(), AC = ac.hop.FbmSync;
  AC.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', userId: '2037', accountName: 'Le Tuan Anh', customerPrefix: 'ALT', customerCodeLength: 8 });
  const acState = AC.runOpen({ phase: 'pull_activity' }); acState.mode = 'read';
  AC.readCategoryGate = () => ({ map: {}, names: {}, valid: { '@CAT_TINH_THANH': { 'Hà Nội': true }, '@CAT_CONG_VIEC': { 'Gọi điện': true } }, warnings: [] });
  AC.stateWrite(acState);
  const acGate = AC.stateCategoryGate(acState);
  keoVe(AC, 'customer', [khachMau('FBM-C1', 'ALT00001', 'Công ty 1')]);
  keoLo(AC, 'activity', [AC.activityRecord(fbmActivity('Nội dung gốc', '/Date(1757386800000)/'), acGate, { sttRec: 'FBM-C1' })], 'read');
  ac.local.activity[0].content = 'Nội dung Shin';
  const acPull = keoLo(AC, 'activity', [AC.activityRecord(fbmActivity('Nội dung FBM', '/Date(1757473200000)/'), acGate, { sttRec: 'FBM-C1' })], 'read');
  const acDone = AC.stateRead(); acDone.phase = 'done'; AC.stateWrite(acDone);
  datState(AC, { session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const acOpen = AC.runSlice(() => AC.runConflictOpenCommand());
  const acLatest = fbmActivity('Nội dung FBM', '/Date(1757473200000)/');
  const acOpened = AC.runSlice(((r) => () => AC.continue(r))(await activityGrid(acOpen.request && acOpen.request.id, [acLatest])));
  const acFields = ((acOpened.conflict && acOpened.conflict.fields) || []).map((item) => item.field);
  // DTO cho màn chọn giá trị (G9.1) đọc nhãn và kiểu từ DATA_SCHEMA thật; hộp test mặc định để DATA_SCHEMA rỗng nên nạp bảng khai thật rồi trả lại.
  const realSchema = napServer(taoHopCat({}), 'server/data/DataSchema.js').DATA_SCHEMA;
  ac.hop.DATA_SCHEMA = realSchema;
  const acView = AC.conflictView({ entity: 'activity', id: ac.local.activity[0].id, local: ac.local.activity[0], latest: AC.activityRecord(acLatest, acGate), gate: acGate }, 1);
  check(so, 'G9.1: DTO xung đột mang mã · tên bản ghi, nhãn trường theo DATA_SCHEMA; trường chữ tự do cho sửa, trường ngày chỉ chọn và hiện dạng ISO',
    [acView.code, acView.name, acView.fields.map((item) => [item.field, item.label, item.editable, item.right])],
    ['ALT00001', 'Gọi điện', [['details', 'Nội dung công việc', true, 'Nội dung FBM'], ['end_date', 'Ngày làm việc', false, '2025-09-10']]]);
  const cvView = AC.conflictView({ entity: 'customer', id: 'CUS-X', local: { fbmCustomerCode: 'ALT00009', companyName: 'Cty X', taxNumber: '0101', phone: '090' }, latest: { fbmCustomerCode: 'ALT00009', companyName: 'Cty X', taxNumber: '0202', phone: '091' }, gate: acGate }, 1);
  check(so, 'G9.1: mã số thuế (có validate và unique) chỉ được chọn một bên, điện thoại được gõ tay',
    (cvView.fields || []).map((item) => [item.label, item.editable]),
    [['Điện thoại', true], ['Mã số thuế', false]]);
  ac.hop.DATA_SCHEMA = {};
  const acManual = chotXungDot(AC, 'activity', ac.local.activity[0].id, 'manual', { details: { choice: 'manual', value: 'Nội dung tự nhập' }, end_date: { choice: 'fbm' } }, Object.fromEntries(acOpened.conflict.fields.map((item) => [item.field, item.right])), Object.fromEntries(acOpened.conflict.fields.map((item) => [item.field, item.left])), acOpened.conflict.snapshot);
  const acRow = ac.local.activity[0];
  check(so, 'G9.3: Activity xung đột hai trường thì DTO mở ra đúng hai trường FBM details và end_date',
    [acPull.conflicts, acFields],
    [1, ['details', 'end_date']]);
  check(so, 'G9.3: PA3 Activity ghi giá trị tự nhập vào content, lấy end_date FBM vào workDate, giữ liên kết Customer, chờ đối soát và hết hàng đợi',
    [acManual.ok, acRow.content, acRow.workDate, acRow.customerId, acRow.syncStatus, acRow.fbmHash === AC.activityRecord(acLatest, acGate).fbmHash, acManual.remaining],
    // Ngày FBM về dạng chữ ISO như màn xung đột đã hiện; cửa ghi thật đổi sang ngày (`textToDate`), hộp test để DATA_SCHEMA rỗng nên giữ chữ.
    [true, 'Nội dung tự nhập', '2025-09-10', 'CUS-000001', 'chờ đối soát', true, 0]);
}

module.exports = { chay };
