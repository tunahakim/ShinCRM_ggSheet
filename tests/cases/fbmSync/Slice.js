/** Kiểm `fbm_sync/state/Slice.js`: lát giữ một bản ô lượt, mọi hàm trong lát sửa cùng bản đó và cuối lát ghi xuống kho đúng một lần; bản khác đưa vào bị chặn trước khi đè. */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');

const KHOA_O_LUOT = 'FBM_SYNC_STATE_V1';

function loi(fn) {
  try { fn(); return ''; } catch (error) { return String(error && error.code || 'khong-ma'); }
}

/**
 * Hộp có lượt tay đọc đang mở (request đầu đang bay). Đếm số lần ô lượt được ghi xuống kho qua cửa `stateStore` từ sau khi mở; `hongLanGhi` làm hỏng đúng một lần ghi kế tiếp.
 * Đếm ở cửa ghi ô lượt chứ không ở kho: trong khóa, kho DocumentProperties còn bộ đệm riêng gộp lần ghi tới lúc nhả khóa.
 */
function hopCoLuot() {
  const { hop, documentProperties } = workflowGas({});
  const F = hop.FbmSync;
  F.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
  F.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  F.start({ mode: 'read', origin: 'manual', manual: true });
  const kho = { soLanGhi: 0, hongLanGhi: false };
  const ghiThat = F.stateStore;
  F.stateStore = function (state) {
    kho.soLanGhi += 1;
    if (kho.hongLanGhi) {
      kho.hongLanGhi = false;
      const hong = new Error('Kho tạm hỏng');
      hong.code = 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED';
      throw hong;
    }
    return ghiThat(state);
  };
  const trongKho = () => JSON.parse(documentProperties.data[KHOA_O_LUOT]);
  const lat = (work) => F.withOrchestrationLock(() => F.runSlice(work));
  return { F, kho, trongKho, lat };
}

async function chay(so) {
  section('FBM sync — Slice.js: một bản ô lượt mỗi lát, ghi một lần');

  // Hai công cụ trong một lát mỗi bên đọc ô lượt và sửa một trường khác nhau: cả hai thay đổi còn, kho chỉ bị ghi một lần.
  const hai = hopCoLuot();
  let cungBan = false;
  hai.lat(() => {
    const a = hai.F.stateRead(), b = hai.F.stateRead();
    cungBan = a === b;
    a.message = 'công cụ A';
    hai.F.stateWrite(a);
    b.counts.created = 7;
    hai.F.stateWrite(b);
    return { ok: true, request: { id: 'request-ke' } };
  });
  check(so, 'hai công cụ sửa hai trường trong một lát: cùng một bản, cả hai thay đổi nằm trong kho, kho ghi ô lượt đúng một lần', [
    cungBan, hai.trongKho().message, hai.trongKho().counts.created, hai.kho.soLanGhi
  ], [true, 'công cụ A', 7, 1]);

  // Lát không đổi ô lượt thì không ghi kho.
  const yen = hopCoLuot();
  yen.lat(() => { yen.F.stateRead(); return { ok: true, request: { id: 'request-ke' } }; });
  check(so, 'lát chỉ đọc ô lượt: không ghi kho lần nào', yen.kho.soLanGhi, 0);

  // Bản sao cũ đọc thẳng từ kho (như hàm đọc kho riêng rồi ghi lại) bị chặn trước khi đè; lượt sang lỗi với đúng mã.
  const cu = hopCoLuot();
  const ma = loi(() => cu.lat(() => {
    cu.F.stateRead().message = 'thay đổi của lát';
    const banCu = cu.F.stateLoad();
    banCu.message = 'bản cũ đè';
    cu.F.stateWrite(banCu);
    return { ok: true, request: { id: 'khong-duoc-phat' } };
  }));
  check(so, 'ghi một bản khác bản của lát: ném SLICE_FOREIGN_STATE, bản cũ không vào kho, lượt sang lỗi mang mã đó, kho ghi một lần', [
    ma, cu.trongKho().message === 'bản cũ đè', cu.trongKho().phase, cu.trongKho().lastFailureCode, cu.kho.soLanGhi
  ], ['SLICE_FOREIGN_STATE', false, 'error', 'SLICE_FOREIGN_STATE', 1]);

  // Lát ném lỗi giữa chừng: lượt đóng lỗi trên bản của lát (giữ con trỏ đang dở để tra lại) rồi mới ghi, một lần.
  const gay = hopCoLuot();
  const maGay = loi(() => gay.lat(() => {
    gay.F.stateRead().cursor = { kind: 'scan_job', entity: 'customer', page: 3 };
    const sai = new Error('Lỗi thử giữa lát');
    sai.code = 'THU_LOI_GIUA_LAT';
    throw sai;
  }));
  check(so, 'lát ném lỗi giữa chừng: lỗi gốc được ném lại, lượt lỗi mang mã gốc, cursor đang dở được giữ, kho ghi một lần', [
    maGay, gay.trongKho().phase, gay.trongKho().lastFailureCode, gay.trongKho().cursor.page, gay.kho.soLanGhi
  ], ['THU_LOI_GIUA_LAT', 'error', 'THU_LOI_GIUA_LAT', 3, 1]);

  // Ghi kho cuối lát hỏng: không im lặng; lượt trong kho sang lỗi ở lần ghi kế và lỗi ghi được ném lên.
  const hong = hopCoLuot();
  const maHong = loi(() => hong.lat(() => {
    hong.F.stateRead().message = 'lát chạy êm';
    hong.F.stateWrite(hong.F.stateRead());
    hong.kho.hongLanGhi = true;
    return { ok: true, request: { id: 'request-ke' } };
  }));
  check(so, 'ghi kho cuối lát hỏng: lỗi ghi được ném, lượt trong kho sang lỗi mang mã đó ở lần ghi kế, không còn ở pha đang chạy', [
    maHong, hong.trongKho().phase, hong.trongKho().lastFailureCode, hong.F.statusView().running
  ], ['FBM_DOCUMENT_PROPERTIES_WRITE_FAILED', 'error', 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED', false]);

  // Lát lồng trong lát dùng chung bản của lát ngoài và không tự ghi kho.
  const long = hopCoLuot();
  long.lat(() => {
    long.F.runSlice(() => { long.F.stateWrite(Object.assign(long.F.stateRead(), { message: 'lát trong' })); return { ok: true, request: { id: 'r-trong' } }; });
    long.F.stateRead().counts.updated = 4;
    long.F.stateWrite(long.F.stateRead());
    return { ok: true, request: { id: 'r-ngoai' } };
  });
  check(so, 'lát lồng: thay đổi của lát trong và lát ngoài cùng nằm trong kho, kho ghi một lần', [long.trongKho().message, long.trongKho().counts.updated, long.kho.soLanGhi], ['lát trong', 4, 1]);

  // Ngoài lát, đọc và ghi đi thẳng xuống kho như cũ.
  const ngoai = hopCoLuot();
  const banNgoai = ngoai.F.stateRead();
  banNgoai.message = 'ngoài lát';
  ngoai.F.stateWrite(banNgoai);
  check(so, 'ngoài lát: mỗi lần đọc là một bản mới, ghi đi thẳng xuống kho', [ngoai.F.stateRead() === ngoai.F.stateRead(), ngoai.trongKho().message, ngoai.kho.soLanGhi], [false, 'ngoài lát', 1]);
}

module.exports = { chay };
