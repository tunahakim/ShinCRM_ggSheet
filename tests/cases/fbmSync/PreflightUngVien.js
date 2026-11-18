/** Preflight: ứng viên đẩy (mã khách mới, Activity lệch owner) và các lỗi chung phải chặn phiên ghi có mã: cài đặt, sổ lỗi đẩy, cổng Category. */
const { section, check } = require('../../lib/assert');
const { hopPreflight } = require('../../lib/fbm/hop-preflight');

async function chay(so) {
  section("FBM sync — preflight ứng viên và lỗi chặn");
  const { hop, ungVien } = hopPreflight();
  hop.FbmSync.readLocal = (entity) => entity === 'activity' ? [{ id: 'ACT-NOPERM', customerId: 'CUS-1', fbmId: '174813' }] : [{ id: 'CUS-1', fbmId: 'FBM-CU', fbmCustomerCode: 'ALT00010' }];
  hop.FbmSync.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: 'Lê Tuấn Anh', customerPrefix: '', customerCodeLength: '' });
  ungVien((entity) => entity === 'customer' ? [{ entity: 'customer', kind: 'create', id: 'CUS-NEW', record: { id: 'CUS-NEW', fbmSyncPermission: 'Cho phép' } }] : []);
  const missingCustomerCode = hop.FbmSync.runPreflight({ mode: 'write' });
  check(so, 'preflight chan Customer moi khi thieu prefix va do dai ma khach FBM',
    missingCustomerCode.blocking.some((item) => item.code === 'FBM_CUSTOMER_CODE_CONFIG_MISSING'),
    true);
  hop.FbmSync.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: 'Lê Tuấn Anh', customerPrefix: 'ALT', customerCodeLength: '8' });
  const configuredCustomerCode = hop.FbmSync.runPreflight({ mode: 'write' });
  check(so, 'preflight cho Customer moi khi du cau hinh ma khach FBM',
    configuredCustomerCode.blocking.some((item) => item.code === 'FBM_CUSTOMER_CODE_CONFIG_MISSING'),
    false);

  ungVien((entity) => entity === 'activity' ? [{ entity: 'activity', kind: 'edit', id: 'ACT-1', record: { id: 'ACT-1', syncStatus: hop.FbmSync.SYNC_STATUS.conflict, taskType: 'Gọi điện chăm sóc', owner: 'Owner khác' } }] : []);
  hop.FbmSync.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: 'Owner đúng' });
  const owner = hop.FbmSync.runPreflight({ mode: 'write' });
  const ownerWarn = owner.warnings.filter((item) => item.code === 'FBM_ACTIVITY_OWNER_MISMATCH');
  check(so, 'Activity lệch owner: preflight cảnh báo không chặn và loại khỏi số ứng viên; việc bỏ qua thật do markPushSkippedBatch lúc đẩy',
    [owner.blocking.some((item) => item.code === 'FBM_ACTIVITY_OWNER_MISMATCH'), ownerWarn.length, owner.candidateCount],
    [false, 1, 0]);
  // Bản ghi hợp lệ cạnh bản ghi lỗi riêng vẫn vào danh sách đẩy.
  ungVien((entity) => entity === 'activity' ? [{ entity: 'activity', kind: 'edit', id: 'ACT-LECH', record: { id: 'ACT-LECH', taskType: 'Gọi điện chăm sóc', owner: 'Owner khác' } }, { entity: 'activity', kind: 'edit', id: 'ACT-OK', record: { id: 'ACT-OK', owner: 'Owner đúng', taskType: 'Gọi điện', content: 'Gọi lại', workDate: '2026-10-01' } }] : []);
  const gateTruoc = hop.FbmSync.readCategoryGate;
  hop.FbmSync.readCategoryGate = () => ({ map: {}, valid: { '@CAT_CONG_VIEC': { 'Gọi điện': true } } });
  check(so, 'một Activity lệch owner bị loại riêng, Activity khác vẫn là ứng viên đẩy',
    hop.FbmSync.runPreflight({ mode: 'write' }).candidateCount,
    1);
  hop.FbmSync.readCategoryGate = gateTruoc;
  // Lỗi chung vẫn chặn: đọc cài đặt hỏng không còn bị nuốt, đọc sổ lỗi đẩy hỏng chặn.
  const settingsBefore = hop.FbmSync.scriptSettings;
  hop.FbmSync.scriptSettings = () => { throw new Error('Không đọc được Config'); };
  const settingsBroken = hop.FbmSync.runPreflight({ mode: 'write' }).blocking.filter((item) => item.code === 'FBM_SETTINGS_READ_FAILED');
  hop.FbmSync.scriptSettings = settingsBefore;
  check(so, 'đọc cài đặt đồng bộ hỏng: preflight chặn bằng FBM_SETTINGS_READ_FAILED nêu nguyên nhân, không coi cài đặt là rỗng',
    [settingsBroken.length, /Không đọc được Config/.test(settingsBroken[0] && settingsBroken[0].message)],
    [1, true]);
  const failuresBefore = hop.FbmSync.pushFailuresRead;
  hop.FbmSync.pushFailuresRead = () => { throw new Error('Sổ lỗi hỏng'); };
  check(so, 'đọc sổ lỗi đẩy hỏng: preflight chặn bằng FBM_FAILURE_STATE_READ_FAILED',
    hop.FbmSync.runPreflight({ mode: 'write' }).blocking.some((item) => item.code === 'FBM_FAILURE_STATE_READ_FAILED'),
    true);
  hop.FbmSync.pushFailuresRead = () => ({ hashes: { 'activity:ACT-LOI': 'h' }, details: { 'activity:ACT-LOI': { reason: 'Lỗi cũ' } } });
  const oldFailure = hop.FbmSync.runPreflight({ mode: 'write' }).issues.filter((item) => item.code === 'FBM_PREVIOUS_PUSH_FAILURE');
  hop.FbmSync.pushFailuresRead = failuresBefore;
  check(so, 'bản ghi từng đẩy lỗi: cảnh báo nêu mã bản ghi, không chặn phiên',
    [oldFailure.length, oldFailure[0] && oldFailure[0].blocking, /ACT-LOI/.test(oldFailure[0] && oldFailure[0].message)],
    [1, false, true]);
  // Không dựng được cổng Category thì chiều ghi bị chặn có mã và nêu nguyên nhân, không coi như cổng rỗng rồi cho đẩy.
  const gateBefore = hop.FbmSync.readCategoryGate;
  hop.FbmSync.readCategoryGate = () => { throw new Error('Category hỏng giữa chừng'); };
  const gateFailed = hop.FbmSync.runPreflight({ mode: 'write' });
  hop.FbmSync.readCategoryGate = gateBefore;
  const gateIssue = gateFailed.blocking.filter((item) => item.code === 'FBM_CATEGORY_GATE_FAILED');
  check(so, 'cổng Category không dựng được: preflight chặn bằng FBM_CATEGORY_GATE_FAILED nêu nguyên nhân, không có ứng viên đẩy',
    [gateFailed.ok, gateIssue.length, /Category hỏng giữa chừng/.test(gateIssue[0] && gateIssue[0].message), gateFailed.candidateCount],
    [false, 1, true, 0]);
}

module.exports = { chay };
