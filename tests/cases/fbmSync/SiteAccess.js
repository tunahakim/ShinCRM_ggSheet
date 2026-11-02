/** Extension phân loại lỗi quyền trang bằng cách hỏi Chrome (`siteAccessCheck`), chỉ khi bước chạm trang đã hỏng; chạy service worker thật với Chrome giả (`tests/lib/fbm/worker-nap.js`). */
const { section, check } = require('../../lib/assert');
const { workerNap, phongBi, chayLuot } = require('../../lib/fbm/worker-nap');

const FBM = 'https://fbo.com.vn:8888/*';

function voiPhongBi(opt) {
  let ctxRef = null;
  const nap = workerNap(Object.assign({ gas(body, lan) { return lan === 1 ? { ok: true, request: phongBi(ctxRef, 'r') } : { ok: true, request: null }; } }, opt));
  ctxRef = nap.ctx;
  return nap;
}

async function chay(so) {
  section('FBM sync — Extension hỏi Chrome quyền trang khi bước chạm trang hỏng');
  const chan = voiPhongBi({ blocked: [FBM], tab: { ping: false, pingRefused: true, inject: () => Promise.reject(new Error('Lỗi Chrome chữ bất kỳ')) } });
  await chayLuot(chan.ctx);
  const loiChan = chan.st.bodies[1].payload.error;
  check(so, 'Chrome chặn quyền site FBM: nạp executor hỏng thì hỏi Chrome, thiếu quyền báo FBM_SITE_ACCESS_BLOCKED nêu tên trang và giữ lỗi gốc, không tải lại tab, không gửi request', [
    loiChan.code, loiChan.message.indexOf(FBM) >= 0 && loiChan.message.indexOf('chữ bất kỳ') >= 0, chan.st.reloads, chan.st.executes.length, chan.st.permissionAsks
  ], ['FBM_SITE_ACCESS_BLOCKED', true, 0, 0, [FBM]]);

  const treo = voiPhongBi({ tab: { ping: false, reloadCompletes: true } });
  await chayLuot(treo.ctx);
  check(so, 'Tab chưa sẵn sàng mà Chrome còn quyền: hỏi Chrome một lần rồi giữ nguyên FBM_TAB_NOT_READY', [treo.st.bodies[1].payload.error.code, treo.st.permissionAsks.length], ['FBM_TAB_NOT_READY', 1]);

  const xuoi = voiPhongBi({ tab: { ping: true } });
  await chayLuot(xuoi.ctx);
  check(so, 'Đường chạy bình thường không hỏi Chrome lần nào', [xuoi.st.executes.length, xuoi.st.permissionAsks.length], [1, 0]);

  const hong = workerNap({ gas() { throw new Error('NETWORK_DOWN'); } });
  const ketQuaHong = (await chayLuot(hong.ctx, [])).ketQua;
  check(so, 'Gọi GAS hỏng mạng mà Chrome còn quyền: hỏi Chrome rồi giữ RELAY_FETCH_FAILED', [ketQuaHong.code, hong.st.permissionAsks.length], ['RELAY_FETCH_FAILED', 1]);

  const chanRelay = workerNap({ blocked: ['https://script.google.com/macros/*'], gas() { throw new Error('Failed to fetch'); } });
  const ketQuaChan = (await chayLuot(chanRelay.ctx, [])).ketQua;
  check(so, 'Chrome chặn quyền trang GAS: báo RELAY_SITE_ACCESS_BLOCKED nêu tên trang, không báo chung RELAY_FETCH_FAILED', [ketQuaChan.code, JSON.stringify(chanRelay.st.statuses).indexOf('script.google.com') >= 0], ['RELAY_SITE_ACCESS_BLOCKED', true]);
}

module.exports = { chay };
