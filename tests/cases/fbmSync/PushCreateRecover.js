/** Cứu lệnh tạo mất phản hồi: Customer tạo mất response thì đọc lại lưới theo MST và đối chiếu đúng mã, không ghi lại lệnh tạo; Activity mất phản hồi giữ trạng thái đang đẩy và khóa cho dấu #SC. */
const { section, check } = require('../../lib/assert');
const { soBan, giuBanGhiDongBo } = require('../../lib/load-gas');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();
const { dungHopDay, activityMoi } = require('../../lib/fbm/hop-day');
const { boUngVienDay } = require('../../lib/fbm/ung-vien-day');
const { buocDay, buocDayLoi } = require('../../lib/fbm/buoc-day');
const { luoiDaCat } = require('../../lib/fbm/tab-fbm-gia');

async function chay(so) {
  section('FBM sync — push: cứu lệnh tạo mất phản hồi');
  const hop = dungHopDay(), push = hop.push;
  const createLocal = { id: 'CUS-CREATE', fbmId: '', fbmCustomerCode: '', companyName: 'Khach tao lai', taxNumber: '0100123456', contactPerson: 'Nguoi lien he', phone: '0900000000', email: 'a@example.com', address: 'Ha Noi', province: 'HNI', website: '', leadSource: 'Source', product: '', fbmSyncPermission: 'Cho phép' };
  const createCandidate = { entity: 'customer', kind: 'create', id: createLocal.id, autoCode: 'ALT00020', record: createLocal };
  push.FbmSync.readLocal = (entity) => entity === 'customer' ? [createLocal] : [];
  boUngVienDay(push);
  push.FbmSync.scriptSettings = () => ({ cookie: 'cookie', customerAuthorized: '1.test', activityAuthorized: '', accountName: 'Owner', userId: '2037' });
  const createState = push.FbmSync.runOpen({ phase: 'push' }); createState.session = hop.session; createState.activeRequestId = 'test-create-request'; createState.cursor = { kind: 'push_wait', entity: 'customer', index: 0, operation: 'customer_create_save', candidate: createCandidate }; push.FbmSync.stateWrite(createState);
  const recoveryStart = push.FbmSync.runSlice(() => push.FbmSync.continue({ ok: false, status: 500, body: '{"Message":"timeout"}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'test-create-request' }] } }));
  check(so, 'Customer create mat response chuyen sang request doc MST contains, khong ghi lai',
    [recoveryStart.ok, recoveryStart.request.meta.kind, recoveryStart.request.body.gridPageIndex, recoveryStart.request.body.filter, recoveryStart.request.body.externalKey.some((item) => item.Name === 'ma_kh' && item.Value === 'ALT00020'), push.FbmSync.stateRead().cursor.operation],
    [true, 'grid', -2, ['ma_so_thue:**0100123456'], false, 'customer_create_recover']);
  const customerFields = push.FbmSync.GRID_FIELDS.customer.slice();
  const customerRow = []; customerRow[0] = 'FBM-CREATE'; customerRow[1] = 'ALT00020'; customerRow[2] = 'Khach tao lai'; customerRow[3] = '0100123456'; customerRow[4] = 'Nguoi lien he'; customerRow[5] = 'Ha Noi'; customerRow[6] = '0900000000'; customerRow[7] = 'a@example.com'; customerRow[9] = ''; customerRow[12] = 'HNI'; customerRow[18] = 'Source'; customerRow[21] = '';
  let recoveryPatch;
  push.writeGateSave = (request) => { recoveryPatch = request.records[0]; return { ok: true }; };
  // FBM trả đủ cột của lưới khách; ô không đặt là chuỗi rỗng.
  const recoveryGrid = await luoiDaCat(push.FbmSync, 'customer', customerFields, [customerFields.map((_, index) => customerRow[index] === undefined ? '' : customerRow[index])], 1);
  const recoveryParsed = push.FbmSync.rowsToRecords('customer', recoveryGrid);
  check(so, 'fixture recovery doc dung stt_rec_kh va ma_kh',
    [recoveryParsed.rows[0].stt_rec_kh, recoveryParsed.rows[0].ma_kh],
    ['FBM-CREATE', 'ALT00020']);
  buocDay(push.FbmSync, recoveryGrid);
  check(so, 'Customer create recovery doi chieu exact va vach ID baseline',
    [recoveryPatch.fbmId, recoveryPatch.fbmCustomerCode, recoveryPatch.syncStatus, push.FbmSync.stateRead().counts.pushed],
    ['FBM-CREATE', 'ALT00020', push.FbmSync.SYNC_STATUS.synced, 1]);
  const activityCandidate = activityMoi(push.FbmSync);
  const lostState = push.FbmSync.runOpen({ phase: 'push' });
  lostState.cursor = { kind: 'push_wait', entity: 'activity', index: 0, operation: 'activity_create', candidate: activityCandidate };
  push.FbmSync.stateWrite(lostState);
  giuBanGhiDongBo(push, 'activity', 'ACT-NEW');
  push.FbmSync.readLocal = (entity) => entity === 'activity' ? [activityCandidate.record] : [];
  let lostPatch;
  push.writeGateSave = (request) => { lostPatch = request.records[0]; return { ok: true }; };
  const lost = buocDayLoi(push.FbmSync, 'Mất phản hồi');
  check(so, 'Activity mat phan hoi giu dang day va khoa cho marker',
    [lost.ok, lost.request, lostPatch.syncStatus, push.FbmSync.stateRead().counts.error, !!push.FbmSync.pushFailuresRead().hashes['activity:ACT-NEW'], soBan(push)['activity:ACT-NEW'].by],
    [true, null, push.FbmSync.SYNC_STATUS.pushing, 1, true, 'fbm']);
}

module.exports = { chay };
