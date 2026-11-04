/**
 * Dựng cài đặt đồng bộ cho test qua đúng cổng cài đặt (`settingsSave`) của hộp cát, không ghi thẳng khóa kho: test nào dựng sai giá trị thì bị cổng từ chối ngay, y như lúc người dùng lưu.
 * Hộp cát phải đã nạp `TEP_CAI_DAT_FBM` (`napServer` tự nạp khi hộp có tệp `fbm_sync`).
 */

/** Lưu một gói `{ tên phần: phần thay đổi }`; không đạt thì ném, vì test dựng cài đặt sai là lỗi của test. */
function datCaiDat(hop, patches) {
  const ket = hop.settingsSave(patches);
  if (!ket.ok) { throw new Error('Test dựng cài đặt không đạt: ' + JSON.stringify(ket.problems)); }
  return ket;
}

function tenPhan(hop, ten) { return hop.FbmSync.SETTING_SECTIONS[ten]; }

/** Lưu một phần theo tên ngắn (`master`, `run`, `account`, `extension`, `background`, `loginPolicy`) và trả giá trị hiệu lực của phần đó (đã điền mặc định cho ô để trống). */
function datPhan(hop, ten, patch) {
  const patches = {};
  patches[tenPhan(hop, ten)] = patch;
  datCaiDat(hop, patches);
  return docPhan(hop, ten);
}

/** Công tắc tổng và công tắc lịch nền. */
function datCongTac(hop, bat) { return datPhan(hop, 'master', { enabled: bat }); }
function datNen(hop, bat) { return datPhan(hop, 'background', { enabled: bat }); }

/** Giá trị hiệu lực của một phần, cùng đường đọc mà code dùng. */
function docPhan(hop, ten) { return hop.settingsValues(tenPhan(hop, ten)); }

/** Đổi lịch nền dạng theo tiến trình `{ enabled, direction, heartbeat: { enabled, minutes }, ..., detail: { customersPerRun } }` sang phần thay đổi của phần lịch nền; trường nào thiếu thì giữ giá trị đang lưu. */
function lichNenPatch(lich) {
  const patch = {};
  if (lich.enabled !== undefined) { patch.enabled = lich.enabled; }
  if (lich.direction !== undefined) { patch.direction = lich.direction; }
  ['heartbeat', 'customerFull', 'activityFull', 'detail'].forEach((kind) => {
    const muc = lich[kind] || {};
    if (muc.enabled !== undefined) { patch[kind + 'Enabled'] = muc.enabled; }
    if (muc.minutes !== undefined) { patch[kind + 'Minutes'] = muc.minutes; }
  });
  if (lich.detail && lich.detail.customersPerRun !== undefined) { patch.detailCustomersPerRun = lich.detail.customersPerRun; }
  return patch;
}

/** Lưu lịch nền dạng theo tiến trình và trả lịch hiệu lực cùng dạng. */
function datLichNen(hop, lich) {
  datPhan(hop, 'background', lichNenPatch(lich));
  return docLichNen(hop);
}

/** Lịch nền hiệu lực dạng theo tiến trình, đúng bộ dựng mà Scheduler dùng. */
function docLichNen(hop) { return hop.FbmSync.scheduleShape(docPhan(hop, 'background')); }

module.exports = { datCaiDat, datPhan, datCongTac, datNen, docPhan, lichNenPatch, datLichNen, docLichNen };
