/**
 * Khung hành trình người dùng trên Sidebar Đồng bộ FBM: dựng Sidebar thật, gắn listener thật (`fbmSyncInstall`), giả lời GAS cho công tắc tổng và công tắc nền, rồi bấm, đổi ô qua đúng listener của tài liệu như người dùng. Status GAS dựng bằng bộ dựng thật (`status-gas.js`).
 */

const { taoSidebarDongBo } = require('./bo-dong-bo');
const { statusGas } = require('../fbm/status-gas');

/** Chờ một vòng hẹn giờ để Promise của listener chạy xong. */
function choVong() { return new Promise((resolve) => setTimeout(resolve, 0)); }

/** Bấm qua listener `click` của tài liệu. */
function bamNut(dom, target) {
  const listener = dom.document.listeners.click;
  if (!listener) throw new Error('Sidebar chưa đăng ký listener click.');
  listener({ target, preventDefault() {} });
}

/** Đổi ô qua listener `change` của tài liệu. */
function doiChon(dom, target) {
  const listener = dom.document.listeners.change;
  if (!listener) throw new Error('Sidebar chưa đăng ký listener change.');
  listener({ target });
}

/** Status GAS lúc rảnh, vá thêm phần đọc khác (`enabled`, `backgroundEnabled`...). */
function statusNghi(them) { return statusGas({ phase: 'idle' }, them); }

/**
 * Sidebar đã gắn listener và có status GAS rảnh; ca kiểm tự đặt `active`, `statusReady` như lúc người dùng đang đứng. `calls` ghi mọi lời gọi GAS; công tắc tổng và công tắc nền đổi giá trị GAS giữ, lệnh khác trả `ok` kèm status rảnh.
 */
function taoHanhTrinh() {
  const { hop, dom, content } = taoSidebarDongBo();
  const calls = [];
  let enabled = true, backgroundEnabled = true;
  hop.callServer = (name, args) => {
    calls.push({ name, args: args || [] });
    if (name === 'fbmGetSyncStatus') return Promise.resolve(statusNghi({ enabled, backgroundEnabled }));
    if (name === 'fbmSetMasterSwitch') { enabled = args && args[0] === true; return Promise.resolve({ ok: true, enabled, status: statusNghi({ enabled, backgroundEnabled }) }); }
    if (name === 'fbmSetBackgroundSwitch') { backgroundEnabled = args && args[0] === true; return Promise.resolve({ ok: true, enabled: backgroundEnabled }); }
    return Promise.resolve({ ok: true, settings: {}, status: statusNghi() });
  };
  hop.fbmSyncInstall();
  hop.FBM_SYNC_CLIENT.lastStatus = statusNghi();
  return { hop, dom, content, calls };
}

module.exports = { taoHanhTrinh, bamNut, doiChon, choVong, statusNghi };
