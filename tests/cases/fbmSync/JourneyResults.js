/** Hành trình người dùng trên màn Kết quả của Sidebar Đồng bộ FBM: vá tại chỗ, tab Xung đột, phân trang, thử lại và lựa chọn xung đột. */
const { section, check } = require('../../lib/assert');
const { taoHanhTrinh, bamNut, doiChon, choVong, statusNghi } = require('../../lib/sidebar/hanh-trinh');

async function chay(so) {
  section('FBM sync — hành trình người dùng: Kết quả');
  const { hop, dom, content } = taoHanhTrinh();
  hop.FBM_SYNC_CLIENT.active = true;
  hop.FBM_SYNC_CLIENT.statusReady = true;
  hop.FBM_SYNC_CLIENT.subscreen = 'results';
  hop.FBM_SYNC_CLIENT.resultsTab = 'summary';
  hop.FBM_SYNC_CLIENT.resultPages = {};
  hop.fbmSyncPaint(Object.assign(statusNghi(), { metadata: { traceTail: Array.from({ length: 21 }, (_, index) => ({ stage: String(index) })) } }));
  const resultTabsNode = content.querySelector('.shin-sync-tab-row');
  hop.fbmSyncPaint(Object.assign(statusNghi(), { runId: 'run-ket-qua', counts: { completed: 9, succeeded: 8 }, metadata: { traceTail: Array.from({ length: 21 }, (_, index) => ({ stage: String(index) })) } }));
  check(so, 'snapshot GAS vá Kết quả tại chỗ, giữ nguyên hàng tab',
    [content.querySelector('.shin-sync-tab-row') === resultTabsNode, content.textContent.indexOf('Đọc từ FBM: 9') >= 0],
    [true, true]);
  const resultTabs = ['summary', 'conflict', 'errors', 'log', 'audit'];
  const resultTabDescriptions = { summary: 'Tóm tắt kết quả phiên', conflict: 'Các thay đổi chờ xử lý', errors: 'Bản ghi cần xem lại', log: 'Nhật ký hoạt động', audit: 'Kết quả kiểm tra dữ liệu thử nghiệm' };
  resultTabs.forEach((tab) => {
    const button = dom.document.createElement('button');
    button.setAttribute('data-sync-results-tab', tab);
    bamNut(dom, button);
    check(so, 'kết quả chuyển đúng tab và đổi mô tả body ' + tab,
      [hop.FBM_SYNC_CLIENT.resultsTab, content.querySelector('#fbm-sync-results-tab-description-region').textContent, content.querySelector('.shin-sync-tab-row') === resultTabsNode],
      [tab, resultTabDescriptions[tab], true]);
  });
  // Mở tab Xung đột từ hàng tab khi còn xung đột phải tự đọc bản ghi đầu, như nút "Mở xử lý xung đột"; bấm lại lúc đang đọc không gọi thêm.
  const realOpenConflict = hop.fbmSyncOpenConflict;
  let conflictOpens = 0;
  hop.fbmSyncOpenConflict = () => { conflictOpens += 1; return new Promise(() => {}); };
  const conflictTab = dom.document.createElement('button');
  conflictTab.setAttribute('data-sync-results-tab', 'conflict');
  hop.FBM_SYNC_CLIENT.conflict = null; hop.FBM_SYNC_CLIENT.conflictOpening = false;
  hop.FBM_SYNC_CLIENT.lastStatus = Object.assign(statusNghi(), { metadata: { conflictCount: 0 } });
  bamNut(dom, conflictTab);
  const opensWithoutConflict = conflictOpens;
  hop.FBM_SYNC_CLIENT.lastStatus = Object.assign(statusNghi(), { metadata: { conflictCount: 1 } });
  bamNut(dom, conflictTab); bamNut(dom, conflictTab);
  check(so, 'Mở tab Xung đột khi còn xung đột thì tự đọc bản ghi đầu đúng một lần; không còn xung đột thì không gọi',
    [opensWithoutConflict, conflictOpens],
    [0, 1]);
  hop.fbmSyncOpenConflict = realOpenConflict; hop.FBM_SYNC_CLIENT.conflictOpening = false;
  const page = dom.document.createElement('button');
  page.setAttribute('data-sync-page', 'log:1');
  bamNut(dom, page);
  check(so, 'ket qua phan trang theo nut bam ma khong doi pipeline',
    [hop.FBM_SYNC_CLIENT.resultPages.log, hop.FBM_SYNC_CLIENT.subscreen],
    [1, 'results']);
  let retries = 0;
  let conflictChoice = '';
  hop.fbmSyncRetryPushFailures = () => { retries += 1; return Promise.resolve(null); };
  hop.fbmSyncResolveConflict = (entity, id, choice) => { conflictChoice = entity + ':' + id + ':' + choice; return Promise.resolve(null); };
  const retry = dom.document.createElement('button'); retry.setAttribute('data-fbm-push-retry-all', 'true');
  hop.FBM_SYNC_CLIENT.conflict = { entity: 'customer', id: 'CUS-1', remaining: 1, fields: [{ field: 'phone', left: '0901', right: '0902' }] };
  hop.FBM_SYNC_CLIENT.conflictChoices = { phone: 'shin' }; hop.FBM_SYNC_CLIENT.conflictDraft = {}; hop.FBM_SYNC_CLIENT.conflictInvalid = {};
  const conflict = dom.document.createElement('button'); conflict.id = 'fbm-sync-conflict-save';
  bamNut(dom, retry);
  bamNut(dom, conflict);
  await choVong();
  check(so, 'ket qua chuyen dung retry va lua chon conflict cua nguoi dung',
    [retries, conflictChoice],
    [1, 'customer:CUS-1:shin']);
}

module.exports = { chay };
