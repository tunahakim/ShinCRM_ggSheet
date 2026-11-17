/**
 * Status Sidebar dựng bằng bộ dựng thật của GAS (`FbmSync.statusViewBuild`): ca test Sidebar lấy status từ đây, không tự viết tay, để fixture luôn đúng hợp đồng GAS trả (tone, nút, tiến độ, pipeline...). Hộp GAS nạp một lần cho cả bộ test.
 */

const { workflowGas } = require('./hop-dong-bo');

let F = null, goc = null;

function nap() {
  if (!F) { F = workflowGas().hop.FbmSync; goc = F.statusInputRead(); }
  return F;
}

/** Status GAS dựng từ `state` (vá lên state rỗng) và các phần đọc khác (`enabled`, `stopFlag`, `gate`, `run`, `login`, `binding`...). Mặc định công tắc tổng bật. */
function statusGas(state, them) {
  nap();
  return F.statusViewBuild(Object.assign({}, goc, { enabled: true, state: Object.assign({}, goc.state, state || {}) }, them || {}));
}

/** State một lượt tay đang chạy còn hạn (có yêu cầu chờ Extension), vá thêm bằng `state`. */
function stateDangChay(state) {
  nap();
  return Object.assign({ runId: 'r-1', phase: 'pull_customer', origin: 'manual', updatedAt: goc.now, activeRequestId: 'q-1', deadlineAt: goc.now + 60000 }, state || {});
}

/** Hằng của bộ dựng GAS (ví dụ `STALE_RUN_MS`, `SCOPE_NOTICE_TEXT`) để ca kiểm không chép số. */
function hangGas() { return nap(); }

module.exports = { statusGas, stateDangChay, hangGas };
