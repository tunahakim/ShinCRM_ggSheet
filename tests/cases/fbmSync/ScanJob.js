/** Việc quét Customer: Extension gọi FBM một lần và cắt gói, GAS nhận từng gói theo cursor; kiểm cả nhánh gói trùng, gói lạ, mất response, mất tab, ghi lỗi và lượt thiếu dòng. */
const { section, check } = require('../../lib/assert');
const { workflowGas, executorSession, executorRaw, sendBatchThroughExecutor, gateItemReply, gridResponse, row } = require('./Workflow');
const { napServer } = require('../../lib/load-gas');

const USER_RESPONSE = JSON.stringify({ d: { TotalRowCount: 1, Rows: [[2037, 'ANHLT', 'Le Tuan Anh']], ViewPage: { Fields: [{ AliasName: 'id' }, { AliasName: 'name' }, { AliasName: 'ten' }] } } });
const KHOA_TRANG = ['ngay_gd', 'datetime0', 'xorder', 'stt_rec_kh'];

/** Một Sheet DEV giả, một tab FBM giả giữ RAM giữa các request, và FBM giả phân trang keyset như bản thật. */
/** Id giao dịch FBM giả của khách `FBM-C<i>`: dạng số như FBM thật. */
const gdSo = (key) => String(800000 + Number(String(key).replace(/\D/g, '') || 0));

function scanHarness(options) {
  const opt = options || {};
  const logs = [], writes = [], local = { customer: (opt.localCustomers || []).slice(), activity: (opt.localActivities || []).slice() };
  const flow = workflowGas({
    logEvent: (event) => logs.push(event),
    LOG_OK: 'ok', LOG_WARN: 'warn', LOG_ERROR: 'error', LOG_CONFLICT: 'conflict',
    readLocal: 'sheet', DATA_SCHEMA: {}, SYNC_SCHEMA: {},
    entityReadAllCombined: (entity) => {
      const fields = Array.from(new Set(local[entity].flatMap((record) => Object.keys(record))));
      return { fields, rows: local[entity].map((record) => fields.map((field) => record[field])) };
    },
    writeGateSave: (request) => {
      if (opt.failWrite && opt.failWrite(request)) { throw new Error('Ghi Sheet lỗi giả lập'); }
      writes.push(request);
      const entity = request.entity;
      (request.records || []).forEach((patch) => {
        let index = local[entity].findIndex((item) => String(item.id || '') === String(patch.id || ''));
        if (index < 0) {
          index = local[entity].length;
          local[entity].push(Object.assign({}, patch, { id: patch.id || (entity === 'customer' ? 'CUS-' : 'ACT-') + String(index + 1).padStart(6, '0') }));
        } else {
          local[entity][index] = Object.assign({}, local[entity][index], patch);
        }
      });
      const fields = local[entity].length ? Object.keys(local[entity][0]) : [];
      return { ok: true, fields, rows: local[entity].map((record) => fields.map((field) => record[field])) };
    }
  });
  const F = flow.hop.FbmSync;
  F.prepareCategoryGate = () => ({ map: {}, names: {}, valid: {}, warnings: [] });
  F.readCategoryGateSheet = () => ({ map: {}, names: {}, namesBySource: {}, valid: {}, warnings: [] });
  F.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
  Object.assign(F.BUDGET, opt.budget || {});
  const customerFields = F.GRID_FIELDS.customer.concat(['ghi_chu_noi_bo']), activityFields = F.GRID_FIELDS.activity;
  const so2 = (i) => String(i).padStart(2, '0');
  const khach = (i) => row(customerFields, {
    stt_rec_kh: 'FBM-C' + i, ma_kh: 'ALT' + String(i).padStart(5, '0'), ten_kh: 'Công ty Thử Nghiệm Số ' + i + ' ' + 'x'.repeat(opt.nameLength || 0), ma_so_thue: '0100' + so2(i),
    ong_ba: 'Anh ' + i, dc_lh: 'Hà Nội', dien_thoai: '09' + so2(i), email: 'c' + i + '@example.test', ghi_chu_noi_bo: 'không được về GAS',
    ngay_gd: '/Date(' + Date.UTC(2026, 8, 20) + ')/', datetime0: '/Date(' + (Date.UTC(2026, 8, 20, 1) + i * 60000) + ')/', xorder: i
  });
  const rows = Array.from({ length: opt.customers || 12 }, (_, k) => k + 1).map(khach);
  const khoa = KHOA_TRANG.map((field) => customerFields.indexOf(field));
  const ngayFbm = (value) => new Date(Number(String(value).match(/\d+/)[0]) + 7 * 3600000).toISOString().slice(0, 10).replace(/-/g, '');
  const gioMayChu = (value) => '/Date(' + (Number(String(value).match(/\d+/)[0]) + 7 * 3600000) + ')/';
  /** FBM chỉ trả trang kế khi request mô tả đúng dòng cuối trang trước; chỉ trang đầu báo tổng. Thiếu bộ lọc khách của người dùng thì FBM đếm cả khách của người khác. */
  const customerPage = (body) => {
    const total = rows.length + Number(opt.totalExtra || 0) + ((body.externalKey || []).some((item) => /GetCustomerValidate/.test(item.Name)) ? 0 : 3);
    const pageValue = body.gridPageValue;
    const keyIndex = pageValue ? rows.findIndex((item) => JSON.stringify(khoa.map((index, k) => (k < 2 ? gioMayChu(item[index]) : item[index]))) === JSON.stringify(pageValue)) : -1, keyRow = rows[keyIndex];
    const moTaDung = keyRow && body.lastPageItem === ngayFbm(keyRow[khoa[0]]) + ngayFbm(keyRow[khoa[1]]) + keyRow[khoa[2]] + keyRow[khoa[3]] && body.lastRowCount === total;
    const start = !pageValue ? 0 : moTaDung ? keyIndex + 1 : rows.length;
    return gridResponse(customerFields, rows.slice(start, start + Number(body.count)), start ? 0 : total);
  };
  /** Giao dịch FBM của một khách; mặc định một giao dịch mỗi khách. */
  // Id giao dịch FBM thật luôn là số; cửa ghi chỉ hỏi khách đang giữ một giao dịch khi id toàn chữ số.
  const actsOf = (key) => (opt.activityFor ? opt.activityFor(key) : [{ id: gdSo(key), details: 'Gọi ' + key, end_date: '2026-09-20', owner: 'Owner', datetime0: '2026-09-20T03:00:00', line_nbr: 1 }]);
  /** Toàn bộ giao dịch bên FBM: mặc định đúng các giao dịch đọc theo từng khách, để lấy toàn bộ và đọc theo khách nhìn thấy cùng một FBM. */
  const fbmActivities = () => (opt.fbmActivities ? opt.fbmActivities() : rows.flatMap((item) => actsOf(item[customerFields.indexOf('stt_rec_kh')])));
  const ngayLoc = (text) => { const m = String(text).match(/(\d{2})\/(\d{2})\/(\d{4})/); return m[3] + '-' + m[2] + '-' + m[1]; };
  /** FBM lọc `end_date` theo đúng mẫu thật: `>=` và `<=` đều lấy ngày biên; `fbmRowCap` giả FBM trả ít dòng hơn tổng nó báo. */
  const activityBulk = (body) => {
    let list = fbmActivities();
    (body.filter || []).forEach((filter) => {
      const lower = String(filter).match(/>=(\d{2}\/\d{2}\/\d{4})/), upper = String(filter).match(/<=(\d{2}\/\d{2}\/\d{4})/);
      list = list.filter((item) => (!lower || String(item.end_date).slice(0, 10) >= ngayLoc(lower[1])) && (!upper || String(item.end_date).slice(0, 10) <= ngayLoc(upper[1])));
    });
    trace.bulkFilters.push((body.filter || []).join('|'));
    const total = list.length;
    if (opt.fbmRowCap) { list = list.slice(0, opt.fbmRowCap); }
    return gridResponse(activityFields, list.map((values) => row(activityFields, values)), total);
  };
  const tab = executorSession();
  // `tabCalls`: số request không phải `scan_chunk` đã qua tab; FBM bị gọi đúng bằng số này thì `scan_chunk` không gọi lại FBM.
  const trace = { kinds: [], jobs: [], errors: [], statuses: [], tabCalls: 0, activityCustomers: [], lookups: [], bulkFilters: [] };
  /** Đưa một request qua tab FBM giả như Extension: trả `{ fail: mã }` khi Extension báo lỗi vận chuyển, hoặc `{ raw }` để nộp GAS. Hook như `run`. */
  async function deliver(request, h) {
    const kind = String(request.meta && request.meta.kind || '');
    trace.kinds.push(kind + (kind === 'scan_chunk' ? ':' + request.meta.job.chunkIndex : '') + (kind === 'scan_job' && request.meta.entity === 'activity' ? ':activity' : ''));
    if (h.beforeSend) { h.beforeSend(request, tab, trace); }
    // `hooks.fail` giả Extension báo lỗi vận chuyển (hết hạn fetch...) cho request đó thay vì gửi qua tab.
    const fakeFail = h.fail && h.fail(request, trace);
    if (fakeFail) { trace.errors.push(fakeFail); return { fail: fakeFail, message: 'Lỗi giả lập ' + fakeFail }; }
    let raw;
    if (kind === 'batch') {
      raw = await sendBatchThroughExecutor(request, (item) => {
        const gateReply = gateItemReply(item, { fields: customerFields, rows: rows.filter((dong) => !opt.goneCustomers || opt.goneCustomers.indexOf(dong[customerFields.indexOf('stt_rec_kh')]) < 0), owners: opt.owners, exists: opt.exists, fail: opt.lookupFail });
        if (gateReply) {
          // `lookups` chỉ đếm request tra mã khách đang giữ giao dịch hoặc khách còn tồn tại, không đếm phần khách của lô.
          const names = item.body.externalKey.map((k) => k.Name).join('|');
          if (!/stt_rec_kh in \('/.test(names)) { trace.lookups.push(names); }
          return gateReply;
        }
        const key = item.body.externalKey[0].Value;
        trace.activityCustomers.push(key);
        const acts = actsOf(key).map((values) => row(activityFields, values));
        const body = JSON.parse(gridResponse(activityFields, acts, acts.length));
        if (item.body.type !== 0) { delete body.d.ViewPage; }
        return { body: JSON.stringify(body) };
      });
    } else {
      const body = kind === 'session_probe' || kind === 'identity_user_grid' ? USER_RESPONSE
        : kind === 'authorize' ? JSON.stringify({ d: { Authorized: 'auth-' + request.meta.entity } })
        : kind === 'scan_job' ? (request.meta.entity === 'activity' ? activityBulk(request.body) : customerPage(request.body))
        : kind === 'customer_count' || kind === 'heartbeat' ? customerPage(request.body) : '';
      if (kind !== 'scan_chunk') { trace.tabCalls += 1; }
      const sent = await tab.send(h.rewrite ? h.rewrite(request, trace) : request, body);
      if (sent.reply && sent.reply.error) { trace.errors.push(sent.reply.code); return { fail: sent.reply.code, message: sent.reply.error }; }
      raw = executorRaw(sent.reply, request.id);
      if (raw.job) { trace.jobs.push(Object.assign({}, raw.job)); }
      if (h.edit) { raw = h.edit(raw, request, trace) || raw; }
    }
    return { raw };
  }
  /** Chạy lượt tới khi GAS không cấp request; `hooks.beforeSend` giả mất tab, `hooks.edit` sửa response, `hooks.afterError` quyết định request kế khi GAS ném lỗi. */
  async function run(hooks) {
    const h = hooks || {};
    F.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
    let step = F.start(Object.assign({ mode: 'read', origin: 'manual', manual: true, pack: h.pack }, h.startOptions || {}));
    for (let hop = 0; step && step.request && hop < 200; hop += 1) {
      const sent = await deliver(step.request, h);
      if (sent.fail) {
        step = F.controlDispatchLocked('transport_failure', { requestId: step.request.id, code: sent.fail, message: sent.message });
        trace.statuses.push(step.status);
        continue;
      }
      const before = F.statusView();
      try {
        step = F.controlDispatchLocked('continue', { response: sent.raw });
      } catch (error) {
        trace.errors.push(String(error && error.message || error));
        if (!h.afterError) { throw error; }
        step = h.afterError(F, error);
        continue;
      }
      trace.statuses.push(step.status);
      if (step.status && F.shouldLogStatus(before, step.status)) { F.logStatus(step.status, 'slice'); }
    }
    return step;
  }
  /** Một lần Extension hỏi GAS theo alarm `gas_poll`: request đầu nộp qua cổng heartbeat, các request sau qua cổng continue tới khi GAS trả `request: null` như relay thật; trần 200 vòng chỉ để test không treo. */
  async function poll(hooks) {
    const h = hooks || {}, hop = flow.hop;
    let step = hop.fbmSyncHeartbeatRequest({ source: h.source || 'alarm', hop: 0 });
    for (let used = 0; step && step.request && used < 200; used += 1) {
      const request = step.request, sent = await deliver(request, h);
      if (sent.fail) { step = F.controlDispatchLocked('transport_failure', { requestId: request.id, code: sent.fail, message: sent.message, hop: used + 1 }); continue; }
      step = used === 0 ? hop.fbmSyncHeartbeat(sent.raw, { hop: 1 }) : F.controlDispatchLocked('continue', { response: sent.raw, hop: used + 1 });
    }
    return step;
  }
  return { flow, F, logs, writes, local, tab, trace, run, poll, rows, customerFields, themKhach: (i) => rows.push(khach(i)) };
}

/** Request `scan_job` dựng tay để kiểm executor riêng, không qua GAS. */
function scanRequest(id, job) {
  return { id, url: 'https://fbm.test/AppService/Grid', body: { controller: 'zccrAccount' }, meta: Object.assign({ kind: 'scan_job', fetchMs: 5000, job: Object.assign({ jobId: 'J-1', fields: ['stt_rec_kh', 'ma_kh', 'ten_kh'], idField: 'stt_rec_kh', keepIds: null, chunkTargetBytes: 512 * 1024, chunkMaxBytes: 768 * 1024 }, job) }) };
}
function chunkRequest(id, jobId, chunkIndex) {
  return { id, url: 'https://fbm.test/AppService/Grid', body: {}, meta: { kind: 'scan_chunk', fetchMs: 5000, job: { jobId, chunkIndex } } };
}
const bytes = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');

async function chay(so) {
  section('FBM sync — việc quét Customer qua Extension');

  // Cột việc quét xin là nguồn duy nhất cho cả phép kiểm metadata và hash: chiếu cột không được làm đổi hash Customer, thiếu cột thì dừng.
  const fieldsHarness = scanHarness({ customers: 1 });
  const FF = fieldsHarness.F, scanCols = FF.scanFields('customer');
  const fullRecord = Object.fromEntries(fieldsHarness.customerFields.map((field, index) => [field, fieldsHarness.rows[0][index]]));
  Object.assign(fullRecord, { ten_dclh_tinh: 'Hà Nội', ten_nguon_dm: 'Giới thiệu', website: 'shin.test' });
  const projected = Object.fromEntries(scanCols.map((field) => [field, fullRecord[field]]));
  let missingTenCv = '';
  try { FF.validateGridFields('customer', scanCols.filter((field) => field !== 'ten_cv')); } catch (error) { missingTenCv = error.message; }
  check(so, 'Cột việc quét Customer đủ cho hash: hash dòng đã chiếu cột bằng hash dòng đầy đủ; thiếu ten_cv thì validateGridFields dừng', [
    FF.hash(projected, 'customer', {}) === FF.hash(fullRecord, 'customer', {}), FF.validateGridFields('customer', scanCols), missingTenCv
  ], [true, true, 'FBM thiếu metadata AliasName: ten_cv']);

  // Executor: 3.000 dòng có dấu tiếng Việt (UTF-8 nhiều byte) phải thành nhiều gói, mỗi gói đã serialize không vượt trần; dòng không bị cắt đôi, đúng thứ tự, FBM chỉ bị gọi một lần.
  const executorFields = ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ghi_chu_noi_bo'];
  const bigRows = Array.from({ length: 3000 }, (_, i) => ['R' + i, 'KH' + i, 'Công ty Trách Nhiệm Hữu Hạn Thương Mại Dịch Vụ Đầu Tư Số ' + i + ' ' + 'ă'.repeat(300), 'riêng']);
  const tab = executorSession();
  const first = (await tab.send(scanRequest('e1'), gridResponse(executorFields, bigRows, 3000))).reply.result;
  const chunks = [first];
  for (let index = 1; index < first.job.chunkCount; index += 1) { chunks.push((await tab.send(chunkRequest('e' + (index + 1), 'J-1', index), '')).reply.result); }
  const chunkRows = chunks.map((chunk) => JSON.parse(chunk.body).d.Rows);
  const allIds = chunkRows.flat().map((item) => item[0]);
  const firstFields = JSON.parse(first.body).d.ViewPage.Fields.map((field) => field.AliasName);
  check(so, 'Executor cắt 3.000 dòng thành nhiều gói, mỗi gói đã serialize không quá trần 768 KiB, đủ 3.000 dòng đúng thứ tự, dòng nguyên vẹn, chỉ gọi FBM một lần, chỉ giữ cột GAS xin', [
    first.job.chunkCount > 1, chunks.every((chunk) => bytes(chunk) <= 768 * 1024), allIds.length, allIds.join(',') === bigRows.map((item) => item[0]).join(','),
    chunkRows.flat().every((item) => item.length === 3 && item[2] === bigRows[Number(item[0].slice(1))][2]), tab.fetches(), firstFields, chunks.map((chunk) => chunk.job.chunkIndex).join(',') === chunks.map((_, i) => i).join(','), first.job.totalRowCount
  ], [true, true, 3000, true, true, 1, ['stt_rec_kh', 'ma_kh', 'ten_kh'], true, 3000]);

  const oversizeTab = executorSession();
  const oversizeRows = [['R1', 'KH1', 'nhỏ'], ['R2', 'KH2', 'đ'.repeat(300 * 1024)], ['R3', 'KH3', 'nhỏ']];
  const oversize = (await oversizeTab.send(scanRequest('o1', { chunkTargetBytes: 200 * 1024, chunkMaxBytes: 300 * 1024 }), gridResponse(['stt_rec_kh', 'ma_kh', 'ten_kh'], oversizeRows, 3))).reply.result;
  check(so, 'Executor không gửi dòng mà riêng nó đã vượt trần một gói, báo id dòng đó trong oversize, các dòng khác vẫn đi', [oversize.job.oversize, JSON.parse(oversize.body).d.Rows.map((item) => item[0]), oversize.job.rowCount, oversize.job.chunkCount], [['R2'], ['R1', 'R3'], 3, 1]);

  const keepTab = executorSession();
  const kept = (await keepTab.send(scanRequest('k1', { keepIds: ['R2'] }), gridResponse(['stt_rec_kh', 'ma_kh', 'ten_kh'], [['R1', 'a', 'b'], ['R2', 'c', 'd']], 2))).reply.result;
  check(so, 'Executor chỉ giữ dòng có id nằm trong keepIds GAS gửi', [JSON.parse(kept.body).d.Rows, kept.job.keptCount, kept.job.rowCount], [[['R2', 'c', 'd']], 1, 2]);

  const goneTab = executorSession();
  await goneTab.send(scanRequest('g1'), gridResponse(['stt_rec_kh', 'ma_kh', 'ten_kh'], [['R1', 'a', 'b']], 1));
  const wrongJob = (await goneTab.send(chunkRequest('g2', 'J-khac', 0), '')).reply;
  goneTab.reload();
  const afterReload = (await goneTab.send(chunkRequest('g3', 'J-1', 0), '')).reply;
  check(so, 'Tab không còn giữ việc quét (sai jobId hoặc tab tải lại) thì executor trả lỗi FBM_SCAN_JOB_GONE, không gọi FBM', [wrongJob.code, afterReload.code, goneTab.fetches()], ['FBM_SCAN_JOB_GONE', 'FBM_SCAN_JOB_GONE', 1]);

  // GAS: số dòng mỗi request nhỏ và gói nhỏ buộc phải chuyển trang và xin nhiều gói; lượt phải nhận đủ khách, đọc giao dịch của đủ khách và gắn cờ khách cũ không còn trên FBM.
  const staleCustomer = { id: 'CUS-000900', fbmId: 'FBM-CU', fbmCustomerCode: 'ALT09999', companyName: 'Khách đã bỏ', recordStatus: 'active', syncStatus: 'đã đồng bộ' };
  const paged = scanHarness({ customers: 12, nameLength: 400, budget: { scanCustomerRows: 5, chunkTargetBytes: 6000 }, localCustomers: [Object.assign({}, staleCustomer)] });
  const pagedEnd = await paged.run();
  const pagedState = paged.F.stateRead();
  const scanJobs = paged.trace.kinds.filter((kind) => kind === 'scan_job').length, scanChunks = paged.trace.kinds.filter((kind) => kind.indexOf('scan_chunk') === 0).length;
  const pagedFbmIds = paged.local.customer.map((item) => item.fbmId).filter((id) => id !== 'FBM-CU').sort();
  check(so, 'Số dòng mỗi request nhỏ hơn tổng: GAS chuyển trang tới khi đủ 12/12 khách, mỗi trang xin đủ gói, đọc giao dịch của 12 khách, phiên done và khách không còn trên FBM bị gắn "không thấy bên FBM"', [
    pagedEnd.status.phase, scanJobs, scanChunks > 0, pagedFbmIds.length, new Set(pagedFbmIds).size, paged.local.activity.length, pagedState.metadata.customerScan, paged.local.customer.find((item) => item.fbmId === 'FBM-CU').syncStatus, paged.tab.fetches() === paged.trace.tabCalls
  ], ['done', 3, true, 12, 12, 12, { total: 12, seen: 12 }, paged.F.SYNC_STATUS.missing, true]);
  const pagedNames = paged.writes.filter((item) => item.entity === 'customer').flatMap((item) => item.records || []).map((item) => JSON.stringify(item));
  check(so, 'Cột FBM ngoài danh sách GAS xin không về tới cửa ghi', pagedNames.some((text) => text.indexOf('không được về GAS') >= 0), false);

  // Ghi Sheet lỗi ở bước ghi của lô đầu: cursor không tiến, lần sau dựng lại đúng lô đó và lượt vẫn đủ khách, không trùng.
  let failOnce = true;
  const writeFail = scanHarness({ customers: 12, budget: { chunkTargetBytes: 6000 }, failWrite: (request) => request.entity === 'activity' && failOnce && !(failOnce = false) });
  let retryRequest = null, firstBatch = null;
  const khoaLo = (request) => (request && request.items || []).map((item) => item.body.externalKey.map((k) => k.Name + '=' + k.Value).join('|'));
  const writeFailEnd = await writeFail.run({
    beforeSend: (request) => { if (request.meta.kind === 'batch' && !firstBatch) { firstBatch = request; } },
    afterError: (F) => { retryRequest = F.requestForCursor(F.stateRead()); return { request: F.nextEnvelope(retryRequest) }; }
  });
  const writeFailIds = writeFail.local.customer.map((item) => item.fbmId), writeFailActs = writeFail.local.activity.map((item) => item.fbmId);
  check(so, 'Ghi Sheet lỗi ở bước ghi của lô: cursor không tiến, request kế dựng lại đúng lô đó, lượt đủ 12 khách và 12 giao dịch không trùng', [
    !!retryRequest && JSON.stringify(khoaLo(retryRequest)) === JSON.stringify(khoaLo(firstBatch)), writeFailEnd.status.phase, writeFailIds.length, new Set(writeFailIds).size, writeFailActs.length, new Set(writeFailActs).size
  ], [true, 'done', 12, 12, 12, 12]);

  // Mất response của một gói: GAS dựng lại request từ cursor là xin gói đang chờ từ RAM, không gọi lại FBM.
  const lost = scanHarness({ customers: 12, budget: { chunkTargetBytes: 6000 } });
  let lostRequest = null, lostDone = false;
  const lostEnd = await lost.run({ edit: (raw, request) => {
    if (lostDone || request.meta.kind !== 'scan_chunk' || request.meta.job.chunkIndex !== 1) { return raw; }
    lostDone = true;
    const state = lost.F.stateRead();
    lostRequest = lost.F.requestForCursor(state);
    return raw;
  } });
  check(so, 'Mất response một gói: request dựng lại từ cursor là scan_chunk đúng gói đang chờ cùng jobId, FBM chỉ bị gọi một lần, lượt đủ 12 khách', [
    lostRequest && lostRequest.meta.kind, lostRequest && lostRequest.meta.job.chunkIndex, lostRequest && lostRequest.meta.job.jobId === lost.trace.jobs[0].jobId, lost.tab.fetches() === lost.trace.tabCalls, lostEnd.status.phase, lost.local.customer.length
  ], ['scan_chunk', 1, true, true, 'done', 12]);

  // Gói trùng (response cũ tới muộn): bỏ qua, xin lại gói đang chờ, không ghi trùng.
  const dup = scanHarness({ customers: 12, budget: { chunkTargetBytes: 6000 } });
  let dupSent = false;
  const dupEnd = await dup.run({ rewrite: (request) => {
    if (dupSent || request.meta.kind !== 'scan_chunk' || request.meta.job.chunkIndex !== 2) { return request; }
    dupSent = true;
    return Object.assign({}, request, { meta: Object.assign({}, request.meta, { job: Object.assign({}, request.meta.job, { chunkIndex: 1 }) }) });
  } });
  const dupIds = dup.local.customer.map((item) => item.fbmId);
  check(so, 'Gói trùng tới muộn: GAS bỏ qua, xin lại gói đang chờ, lượt done đủ 12 khách không trùng và tổng khách đã nhận vẫn 12', [
    dupSent, dup.trace.kinds.filter((kind) => kind === 'scan_chunk:2').length, dupEnd.status.phase, dupIds.length, new Set(dupIds).size, dup.F.stateRead().metadata.customerScan
  ], [true, 2, 'done', 12, 12, { total: 12, seen: 12 }]);

  // Gói lạ (khác việc quét): dừng phiên, không ghi gói đó, Sidebar và Log cùng thấy.
  const stray = scanHarness({ customers: 12, budget: { chunkTargetBytes: 6000 } });
  const strayEnd = await stray.run({ edit: (raw, request) => {
    if (request.meta.kind !== 'scan_chunk') { return raw; }
    return Object.assign({}, raw, { job: Object.assign({}, raw.job, { jobId: 'viec-khac' }) });
  } });
  check(so, 'Gói lạ khác jobId: phiên error FBM_SCAN_JOB_MISMATCH, không ghi khách nào vì danh sách chỉ đánh dấu, Log ghi scan_job_mismatch, Sidebar có lời lỗi', [
    strayEnd.status.phase, strayEnd.status.lastFailureCode, stray.writes.filter((item) => item.entity === 'customer').length, stray.logs.some((event) => event.action === 'scan_job_mismatch' && event.outcome === 'error'), String(strayEnd.status.lastError || '').indexOf('không khớp việc quét') >= 0
  ], ['error', 'FBM_SCAN_JOB_MISMATCH', 0, true, true]);

  // Phiên chết giữa lượt (đăng nhập ở thiết bị khác): FBM trả HTTP 200 nhưng Authorized:false, Rows:null và tab không có khối việc quét. Gặp thật 2026-10-16.
  const deadSession = scanHarness({ customers: 12, budget: { chunkTargetBytes: 6000 } });
  let deadSent = false;
  const deadEnd = await deadSession.run({ edit: (raw, request) => {
    if (deadSent || request.meta.kind !== 'scan_job') { return raw; }
    deadSent = true;
    return { ok: true, status: 200, body: '{"d":{"TotalRowCount":0,"Rows":null,"ViewPage":null,"Authorized":false}}', transport: raw.transport };
  } });
  const deadAfterScan = deadSession.trace.kinds[deadSession.trace.kinds.indexOf('scan_job') + 1];
  check(so, 'Việc quét nhận Authorized:false (phiên chết): request kế là probe phiên, không báo FBM_SCAN_JOB_MISMATCH, không ghi khách nào từ response đó', [
    deadSent, deadAfterScan, deadSession.logs.some((event) => event.action === 'scan_job_mismatch'), String(deadEnd.status.lastFailureCode || '') === 'FBM_SCAN_JOB_MISMATCH'
  ], [true, 'session_probe', false, false]);

  // Mất tab giữa việc quét: chạy lại cả việc với jobId mới, không đếm trùng khách; mất quá số lần cho phép thì dừng lỗi.
  const lostTab = scanHarness({ customers: 12, budget: { chunkTargetBytes: 6000 } });
  let reloads = 0;
  const lostTabEnd = await lostTab.run({ beforeSend: (request, fbmTab) => { if (request.meta.kind === 'scan_chunk' && reloads < 1) { reloads += 1; fbmTab.reload(); } } });
  const lostTabIds = lostTab.local.customer.map((item) => item.fbmId);
  check(so, 'Mất tab một lần: GAS chạy lại việc quét với jobId mới, Log cảnh báo scan_job_restart, lượt done đủ 12 khách không trùng và đếm đúng 12', [
    lostTab.trace.errors, lostTab.trace.kinds.filter((kind) => kind === 'scan_job').length, new Set(lostTab.trace.jobs.map((job) => job.jobId)).size, lostTab.logs.some((event) => event.action === 'scan_job_restart' && event.outcome === 'warn'),
    lostTabEnd.status.phase, lostTabIds.length, new Set(lostTabIds).size, lostTab.F.stateRead().metadata.customerScan
  ], [['FBM_SCAN_JOB_GONE'], 2, 2, true, 'done', 12, 12, { total: 12, seen: 12 }]);

  const tabGone = scanHarness({ customers: 12, budget: { chunkTargetBytes: 6000 } });
  const tabGoneEnd = await tabGone.run({ beforeSend: (request, fbmTab) => { if (request.meta.kind === 'scan_chunk') { fbmTab.reload(); } } });
  const tabGoneState = tabGone.F.stateRead();
  check(so, 'Mất tab liên tục: chạy lại tối đa 2 lần rồi dừng lỗi FBM_SCAN_JOB_GONE, Log ghi scan_job_gone, Sidebar có lời hướng dẫn, khách vắng không bị gắn cờ', [
    tabGone.trace.errors.length, tabGone.trace.kinds.filter((kind) => kind === 'scan_job').length, tabGoneState.phase, tabGoneState.lastFailureCode, tabGone.logs.some((event) => event.action === 'scan_job_gone' && event.outcome === 'error'),
    String(tabGoneEnd && tabGoneEnd.status && tabGoneEnd.status.lastError || '').indexOf('Giữ tab FBM mở') >= 0, tabGone.local.customer.some((item) => item.syncStatus === tabGone.F.SYNC_STATUS.missing)
  ], [3, 3, 'error', 'FBM_SCAN_JOB_GONE', true, true, false]);

  // Lượt thiếu dòng (FBM báo tổng lớn hơn số dòng trả về, hoặc dòng vượt trần không về GAS): không gắn cờ khách nào, phiên lỗi FBM_SCAN_INCOMPLETE.
  const incomplete = scanHarness({ customers: 12, totalExtra: 3, localCustomers: [Object.assign({}, staleCustomer)] });
  const incompleteEnd = await incomplete.run();
  check(so, 'FBM báo 15 khách mà chỉ trả 12: phiên error FBM_SCAN_INCOMPLETE trước cửa ghi, khách vắng không bị gắn "không thấy bên FBM", chưa ghi khách nào, Log ghi lỗi', [
    incompleteEnd.status.phase, incompleteEnd.status.lastFailureCode, incomplete.local.customer.find((item) => item.fbmId === 'FBM-CU').syncStatus, incomplete.local.customer.length, incomplete.logs.some((event) => event.outcome === 'error' && JSON.stringify(event).indexOf('chỉ nhận 12/15 khách') >= 0)
  ], ['error', 'FBM_SCAN_INCOMPLETE', 'đã đồng bộ', 1, true]);
  const tooBig = scanHarness({ customers: 6, nameLength: 9000, budget: { chunkTargetBytes: 6000, chunkMaxBytes: 12000 }, localCustomers: [Object.assign({}, staleCustomer)] });
  const tooBigEnd = await tooBig.run();
  check(so, 'Dòng khách vượt trần một gói: Log ghi scan_row_oversize từng dòng, lượt thiếu dòng nên FBM_SCAN_INCOMPLETE và không gắn cờ', [
    tooBig.logs.filter((event) => event.action === 'scan_row_oversize').length, tooBigEnd.status.lastFailureCode, tooBig.local.customer.find((item) => item.fbmId === 'FBM-CU').syncStatus
  ], [6, 'FBM_SCAN_INCOMPLETE', 'đã đồng bộ']);

  // Thiếu mã người dùng thì request đọc khách không mang điều kiện quyền, FBM trả cả khách của người khác: không dựng request nào, phiên lỗi có lý do.
  const noUser = scanHarness({ customers: 3 });
  // Dòng Log lỗi của phiên do sổ bước ghi lúc đóng bước; GAS thật luôn nạp sổ bước.
  napServer(noUser.flow.hop, 'fbm_sync/diagnostic/Trace.js');
  const settingsWithUser = noUser.F.scriptSettings;
  noUser.F.scriptSettings = () => Object.assign(settingsWithUser(), { userId: '' });
  const noUserEnd = await noUser.run({ afterError: () => null });
  const noUserStatus = noUser.F.statusView();
  check(so, 'Thiếu mã người dùng FBM: không gửi request đọc khách nào, phiên dừng ở lỗi FBM_USER_ID_MISSING, Sidebar và Log báo "thiếu mã người dùng FBM"', [
    noUser.trace.kinds.filter((kind) => /^(scan_job|customer_count|batch)/.test(kind)).length, noUser.F.stateRead().phase, noUser.F.stateRead().lastFailureCode,
    /thiếu mã người dùng FBM/.test(String(noUserStatus.lastError || noUserStatus.message || '')), noUser.logs.some((event) => /thiếu mã người dùng FBM/.test(JSON.stringify(event))), noUserEnd && noUserEnd.request || null
  ], [0, 'error', 'FBM_USER_ID_MISSING', true, true, null]);
}

module.exports = { chay, scanHarness, gdSo };
