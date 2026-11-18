/** Preflight: liên kết tài khoản FBM (REBIND_REQUIRED, kiểm và dò liên kết) và phạm vi giới hạn theo danh sách khách; chiều đẩy vẫn đóng khi thiếu liên kết. */
const { section, check } = require('../../lib/assert');
const { hopPreflight } = require('../../lib/fbm/hop-preflight');

async function chay(so) {
  section("FBM sync — preflight liên kết và phạm vi");
  const { hop } = hopPreflight();
  hop.FbmSync.readLocal = (entity) => entity === 'activity' ? [{ id: 'ACT-NOPERM', customerId: 'CUS-1', fbmId: '' }] : [{ id: 'CUS-1', fbmCustomerCode: 'ALT00010', fbmSyncPermission: 'Cho phép' }];
  const read = hop.FbmSync.runPreflight({ mode: 'read' });
  check(so, 'preflight read chan truoc khi lien ket tai khoan FBM nhung khong can Config ten tai khoan',
    [read.ok, read.blocking.some((item) => item.code === 'FBM_IDENTITY_UNBOUND'), read.warnings.some((item) => item.code === 'FBM_ACCOUNT_NAME_MISSING')],
    [false, true, false]);
  hop.FbmSync.readLocal = (entity) => entity === 'activity' ? [{ id: 'ACT-NOPERM', customerId: 'CUS-1', fbmId: '174813' }] : [{ id: 'CUS-1', fbmId: 'FBM-CU', fbmCustomerCode: 'ALT00010' }];
  const rebindRead = hop.FbmSync.runPreflight({ mode: 'read' });
  check(so, 'preflight read chặn khi file có FBM ID nhưng chưa kiểm tra liên kết',
    [rebindRead.ok, rebindRead.blocking.some((item) => item.code === 'REBIND_REQUIRED')],
    [false, true]);
  const identityCheck = hop.FbmSync.runPreflight({ mode: 'check', scan: 'identity_check' });
  check(so, 'preflight identity check được phép chạy để xử lý REBIND',
    [identityCheck.ok, identityCheck.blocking.some((item) => item.code === 'REBIND_REQUIRED')],
    [true, false]);
  {
    const savedScope = hop.FbmSync.scope;
    hop.FbmSync.scope = () => ({ codes: [], fbm: [], shin: [], notFound: [] });
    const emptyRead = hop.FbmSync.runPreflight({ mode: 'read' }), emptyPush = hop.FbmSync.runPreflight({ mode: 'push' }), emptyIdentity = hop.FbmSync.runPreflight({ mode: 'check', scan: 'identity_check' });
    check(so, 'Phạm vi giới hạn mà danh sách khách chỉ định trống: chặn cả lượt lấy lẫn lượt đẩy trước request FBM đầu tiên, lệnh kiểm liên kết vẫn chạy',
      [emptyRead.ok, emptyRead.blocking.some((item) => item.code === 'FBM_SCOPE_EMPTY'), emptyPush.blocking.some((item) => item.code === 'FBM_SCOPE_EMPTY'), emptyIdentity.blocking.some((item) => item.code === 'FBM_SCOPE_EMPTY')], [false, true, true, false]);
    hop.FbmSync.scope = () => ({ codes: ['ALT00099'], fbm: ['ALT00099'], shin: [], notFound: [] });
    const fbmOnly = hop.FbmSync.runPreflight({ mode: 'write' });
    check(so, 'Danh sách chỉ có mã FBM chưa có trên Sheet: lượt hai chiều không bị chặn vì phạm vi (chiều đẩy chỉ không có khách nào)',
      fbmOnly.issues.some((item) => /^FBM_SCOPE_/.test(item.code)),
      false);
    hop.FbmSync.scope = () => ({ codes: ['ALT00010', 'CUS-000009'], fbm: ['ALT00010'], shin: ['CUS-1'], notFound: ['CUS-000009'] });
    const gone = hop.FbmSync.runPreflight({ mode: 'read' }).issues.filter((item) => item.code === 'FBM_SCOPE_CODE_NOT_FOUND');
    check(so, 'Mã ShinCRM trong danh sách đã mất khỏi Sheet Customer: preflight cảnh báo kèm mã, không chặn phần khách còn lại',
      [gone.length, gone[0] && gone[0].blocking, gone[0] && gone[0].message.indexOf('CUS-000009') >= 0],
      [1, false, true]);
    hop.FbmSync.scope = () => null;
    check(so, 'Không giới hạn phạm vi: không có lỗi phạm vi',
      hop.FbmSync.runPreflight({ mode: 'read' }).issues.some((item) => /^FBM_SCOPE_/.test(item.code)),
      false);
    hop.FbmSync.scope = savedScope;
  }
  const identityProbe = hop.FbmSync.runPreflight({ mode: 'check', scan: 'identity_probe' });
  check(so, 'preflight identity probe được phép chạy để tự điền liên kết',
    [identityProbe.ok, identityProbe.blocking.some((item) => item.code === 'REBIND_REQUIRED')],
    [true, false]);

  const push = hop.FbmSync.runPreflight({ mode: 'push' });
  check(so, 'preflight mode push van fail-closed theo binding va cac cong thuc te',
    [push.ok, push.blocking.some((item) => item.code === 'FBM_ACCOUNT_NAME_MISSING')],
    [false, false]);
}

module.exports = { chay };
