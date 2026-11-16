/** Executor của Extension trong tab FBM: cắt gói việc quét dưới trần, chỉ giữ dòng GAS xin, báo mất việc khi tab tải lại. Không qua GAS. */
const { section, check } = require('../../lib/assert');
const { tabGia, luoiFbm } = require('../../lib/fbm/tab-fbm-gia');

/** Request `scan_job` dựng tay để kiểm executor riêng, không qua GAS. */
function scanRequest(id, job) {
  return { id, url: 'https://fbm.test/AppService/Grid', body: { controller: 'zccrAccount' }, meta: Object.assign({ kind: 'scan_job', fetchMs: 5000, keep: { fields: ['stt_rec_kh', 'ma_kh', 'ten_kh'] }, job: Object.assign({ jobId: 'J-1', idIndex: 0, keepIds: null, chunkTargetBytes: 512 * 1024, chunkMaxBytes: 768 * 1024 }, job) }) };
}
function chunkRequest(id, jobId, chunkIndex) {
  return { id, url: 'https://fbm.test/AppService/Grid', body: {}, meta: { kind: 'scan_chunk', fetchMs: 5000, job: { jobId, chunkIndex } } };
}
const bytes = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');

async function chay(so) {
  section('FBM sync — executor việc quét');
  // Request GET GAS dựng (trang đăng nhập, tài khoản) mang body null; fetch thật ném lỗi nếu GET có body, nên executor phải gửi không body chứ không phải chuỗi "null".
  const getSent = (await tabGia().send({ id: 'g1', url: 'https://fbm.test/Login.aspx', method: 'GET', body: null, meta: { kind: 'login_page', fetchMs: 5000 } }, '<html></html>')).sent;
  check(so, 'Executor gửi request GET có body null xuống fetch không kèm body (không phải chuỗi "null"), nên trang đăng nhập FBM không còn lỗi "GET/HEAD cannot have body"', [getSent && getSent.url, getSent && getSent.body], ['https://fbm.test/Login.aspx', undefined]);
  // Executor: 3.000 dòng có dấu tiếng Việt (UTF-8 nhiều byte) phải thành nhiều gói, mỗi gói đã serialize không vượt trần; dòng không bị cắt đôi, đúng thứ tự, FBM chỉ bị gọi một lần.
  const executorFields = ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ghi_chu_noi_bo'];
  const bigRows = Array.from({ length: 3000 }, (_, i) => ['R' + i, 'KH' + i, 'Công ty Trách Nhiệm Hữu Hạn Thương Mại Dịch Vụ Đầu Tư Số ' + i + ' ' + 'ă'.repeat(300), 'riêng']);
  const tab = tabGia();
  const first = (await tab.send(scanRequest('e1'), luoiFbm(executorFields, bigRows, 3000))).reply.result;
  const chunks = [first];
  for (let index = 1; index < first.job.chunkCount; index += 1) { chunks.push((await tab.send(chunkRequest('e' + (index + 1), 'J-1', index), '')).reply.result); }
  const chunkRows = chunks.map((chunk) => JSON.parse(chunk.body).d.Rows);
  const allIds = chunkRows.flat().map((item) => item[0]);
  const firstFields = JSON.parse(first.body).d.SourceFields, laterFields = chunks.slice(1).map((chunk) => JSON.parse(chunk.body).d.SourceFields);
  check(so, 'Executor cắt 3.000 dòng thành nhiều gói, mỗi gói đã serialize không quá trần 768 KiB, đủ 3.000 dòng đúng thứ tự, dòng nguyên vẹn, chỉ gọi FBM một lần, chỉ giữ cột GAS xin; tên cột gốc chỉ đi trong gói 0', [
    first.job.chunkCount > 1, chunks.every((chunk) => bytes(chunk) <= 768 * 1024), allIds.length, allIds.join(',') === bigRows.map((item) => item[0]).join(','),
    chunkRows.flat().every((item) => item.length === 3 && item[2] === bigRows[Number(item[0].slice(1))][2]), tab.fetches(), firstFields, laterFields.every((item) => item === undefined), chunks.map((chunk) => chunk.job.chunkIndex).join(',') === chunks.map((_, i) => i).join(','), first.job.totalRowCount
  ], [true, true, 3000, true, true, 1, executorFields, true, true, 3000]);

  const oversizeTab = tabGia();
  const oversizeRows = [['R1', 'KH1', 'nhỏ'], ['R2', 'KH2', 'đ'.repeat(300 * 1024)], ['R3', 'KH3', 'nhỏ']];
  const oversize = (await oversizeTab.send(scanRequest('o1', { chunkTargetBytes: 200 * 1024, chunkMaxBytes: 300 * 1024 }), luoiFbm(['stt_rec_kh', 'ma_kh', 'ten_kh'], oversizeRows, 3))).reply.result;
  check(so, 'Executor không gửi dòng mà riêng nó đã vượt trần một gói, báo id dòng đó trong oversize, các dòng khác vẫn đi',
    [oversize.job.oversize, JSON.parse(oversize.body).d.Rows.map((item) => item[0]), oversize.job.rowCount, oversize.job.chunkCount],
    [['R2'], ['R1', 'R3'], 3, 1]);

  const keepTab = tabGia();
  const kept = (await keepTab.send(scanRequest('k1', { keepIds: ['R2'] }), luoiFbm(['stt_rec_kh', 'ma_kh', 'ten_kh'], [['R1', 'a', 'b'], ['R2', 'c', 'd']], 2))).reply.result;
  check(so, 'Executor chỉ giữ dòng có id nằm trong keepIds GAS gửi',
    [JSON.parse(kept.body).d.Rows, kept.job.keptCount, kept.job.rowCount],
    [[['R2', 'c', 'd']], 1, 2]);

  const goneTab = tabGia();
  await goneTab.send(scanRequest('g1'), luoiFbm(['stt_rec_kh', 'ma_kh', 'ten_kh'], [['R1', 'a', 'b']], 1));
  const wrongJob = (await goneTab.send(chunkRequest('g2', 'J-khac', 0), '')).reply;
  goneTab.reload();
  const afterReload = (await goneTab.send(chunkRequest('g3', 'J-1', 0), '')).reply;
  check(so, 'Tab không còn giữ việc quét (sai jobId hoặc tab tải lại) thì executor trả lỗi FBM_SCAN_JOB_GONE, không gọi FBM',
    [wrongJob.code, afterReload.code, goneTab.fetches()],
    ['FBM_SCAN_JOB_GONE', 'FBM_SCAN_JOB_GONE', 1]);

  return so;
}

module.exports = { chay };
