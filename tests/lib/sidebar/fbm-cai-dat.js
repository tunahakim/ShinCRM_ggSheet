/**
 * Gói cài đặt FBM đúng dạng GAS trả cho Sidebar (giá trị hiệu lực theo tên phần). Test Sidebar dùng chung để mọi phần đều có mặt; ca nào cần giá trị khác chỉ ghi đè đúng ô.
 * Giá trị ở đây chỉ là dữ liệu mẫu của test, không phải mặc định của sản phẩm: mặc định thật nằm ở GAS.
 */
const GOC = {
  spreadsheetId: 'sheet-test',
  corrupt: [],
  fbm_master: { enabled: true },
  fbm_run: { approvalThreshold: 10, scopeLimited: false, scopeCodes: [], requestGapMinSeconds: 0, requestGapMaxSeconds: 0 },
  fbm_account: { customerPrefix: '', customerCodeLength: '' },
  fbm_extension: { pollMinutes: 5, runOnStartup: true },
  fbm_background: {
    enabled: true, direction: 'read', heartbeatEnabled: true, heartbeatMinutes: 5, customerFullEnabled: true, customerFullMinutes: 60,
    activityFullEnabled: false, activityFullMinutes: 480, detailEnabled: false, detailMinutes: 30, detailCustomersPerRun: 30,
    machineAutoTakeover: false
  },
  fbm_login_policy: { enabled: true, autoOpenTab: false, retryEnabled: true, retryMinutes: 30 },
  defaults_fbm_pull: {}
};

/** Bản sao của gói mẫu; `ghiDe` là `{ tênPhần: { ô: giá trị } }` (phần `null` thì giữ `null` để dựng ca khóa hỏng). */
function goiCaiDat(ghiDe) {
  const goi = JSON.parse(JSON.stringify(GOC));
  Object.keys(ghiDe || {}).forEach((ten) => {
    const moi = ghiDe[ten];
    goi[ten] = moi && typeof moi === 'object' && !Array.isArray(moi) && goi[ten] && typeof goi[ten] === 'object' && !Array.isArray(goi[ten]) ? Object.assign(goi[ten], moi) : moi;
  });
  return goi;
}

module.exports = { goiCaiDat };
