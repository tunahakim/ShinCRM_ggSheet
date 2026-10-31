/** Entry point cho Sidebar, DEV runner va Web App relay. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Người dùng chấp thuận phiên push lớn; chỉ sau đó mới cấp request authorize đầu tiên. */
function fbmSyncApprovePush() {
  var state = FbmSync.stateRead();
  if (String(state.phase || '') !== 'awaiting_approval' || !state.metadata || state.metadata.approvalRequired !== true) {
    return { ok: false, code: 'PUSH_APPROVAL_NOT_REQUIRED', status: FbmSync.statusView() };
  }
  state.phase = 'checking_session';
  state.entity = '';
  state.cursor = { kind: 'authorize_customer' };
  state.metadata.approvalGranted = true;
  state.message = 'Đã chấp thuận; đang kiểm tra phiên FBM...';
  if (typeof FbmSync.businessStepStart === 'function') { FbmSync.businessStepStart(state, 'session', { mode: state.mode, scan: state.scan }); }
  FbmSync.stateWrite(state);
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'push_batch_approved', outcome: typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', reason: 'Người dùng chấp thuận phiên có hơn 10 bản ghi thay đổi.', detail: { candidateCount: Number(state.metadata.approvalCount || 0) } }); }
  return { ok: true, request: FbmSync.sessionSystemEnvelope('authorize', { entity: 'customer' }), status: FbmSync.statusView() };
}
/**
 * Dừng lượt ngay và nhả mọi bản ghi đồng bộ đang giữ trong sổ bận, kể cả khi còn request đang bay: response về sau bị `requestAnswered` loại. Không chờ response đang bay rồi mới dừng, vì Extension nhận lệnh Dừng thì cắt lô giữa chừng; xử lý lô cắt dở như lô thường là báo lỗi lệch lô cho một lần dừng hợp lệ.
 * Client luôn gọi hủy sau khi báo lỗi; phiên đã lỗi phải giữ nguyên lỗi để Sidebar và Log không đổi thành "Đã dừng".
 */
function fbmSyncCancel() {
  var state = FbmSync.stateRead(), failed = String(state.phase || '') === 'error';
  FbmSync.stateWrite(FbmSync.runCloseNow(state, failed ? null : { phase: 'paused', message: 'Đã dừng phiên đồng bộ; kết quả và log của lượt này vẫn được giữ để xem lại.' }));
  // Trả status công khai, không trả ô lượt: ô lượt mang cookie và token phiên FBM.
  return { ok: true, status: FbmSync.statusView() };
}

/** Mở lại toàn bộ nhóm lỗi sau khi người dùng đã sửa nguyên nhân; không lặp request FBM tại đây. Đọc và ghi trong một hàm quyết; bản ghi đang bận giữ nguyên dấu lỗi để lần mở lại sau xét tiếp. */
function fbmSyncRetryPushFailures() {
  var state = FbmSync.stateRead(), failures = FbmSync.pushFailuresRead().hashes, keys = Object.keys(failures);
  if (!keys.length) { return { ok: false, code: 'PUSH_FAILURES_NOT_FOUND', message: 'Không có nhóm bản ghi lỗi đẩy cần mở lại.' }; }
  var opened = FbmSync.recordChange(function (gate) {
    var byEntity = { customer: [], activity: [] }, present = { customer: {}, activity: {} }, reset = [], missing = [];
    ['customer', 'activity'].forEach(function (entity) {
      gate.read(entity, FbmSync.recordSchemas()).forEach(function (record) { present[entity][String(record && record.id || '')] = true; });
    });
    keys.forEach(function (key) {
      var split = key.indexOf(':'), entity = split < 0 ? '' : key.slice(0, split), id = split < 0 ? '' : key.slice(split + 1);
      if (!byEntity[entity] || !id || !present[entity][id]) { missing.push(key); return; }
      if (gate.busy(entity, [id])[id]) { return; }
      byEntity[entity].push({ id: id, syncStatus: FbmSync.SYNC_STATUS.pending });
      reset.push(key);
    });
    return { save: ['customer', 'activity'].map(function (entity) { return { entity: entity, records: byEntity[entity], source: 'pull' }; }), value: { reset: reset, missing: missing } };
  }).value, reset = opened.reset, missing = opened.missing;
  // Bản ghi không còn trên Sheet thì dấu chặn gửi lại vô nghĩa; giữ lại thì nó chiếm chỗ của cầu dao lỗi đẩy mãi mãi.
  FbmSync.pushFailuresRemove(reset.concat(missing));
  state.message = 'Đã mở lại ' + reset.length + ' bản ghi lỗi; hãy chạy lại phiên Ghi thật để gửi theo hàng đợi.';
  FbmSync.stateWrite(state);
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'push_retry_batch_enabled', outcome: typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', reason: 'Người dùng chủ động mở lại nhóm bản ghi lỗi đẩy.', detail: { total: keys.length, reset: reset.length, missing: missing.length } }); }
  return { ok: true, total: keys.length, reset: reset.length, missing: missing.length, status: FbmSync.statusView() };
}

/**
 * Địa chỉ Web App relay thuộc về bản triển khai của từng script, không thuộc code: code đi theo mọi bản sao Sheet nên hằng số trong code sẽ chỉ Extension của bản sao về Web App của Sheet gốc.
 * Nguồn duy nhất là `ScriptApp.getService().getUrl()` đọc lúc GAS đang chạy trong chính Web App (trong ngữ cảnh Sidebar nó có thể trả địa chỉ @HEAD). Kèm `scriptId` vì bản sao mang theo ScriptProperties của script gốc.
 */
FbmSync.RELAY_URL_KEY = 'FBM_SYNC_RELAY_URL_V1';
FbmSync.relayUrlStored = function (props) {
  var raw = String(props.getProperty(FbmSync.RELAY_URL_KEY) || '');
  if (!raw) { return ''; }
  var value = JSON.parse(raw);
  return value && value.scriptId === ScriptApp.getScriptId() ? String(value.url || '') : '';
};
/** Chỉ gọi trong ngữ cảnh Web App. Chỉ ghi khi địa chỉ đổi, nên lời gọi nền thường chỉ tốn một lần đọc ScriptProperties đã có sẵn. */
FbmSync.relayUrlRecord = function (props) {
  var url = String(ScriptApp.getService().getUrl() || '');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)) { throw new Error('Web App không đọc được địa chỉ /exec của chính nó (nhận được "' + url + '").'); }
  if (FbmSync.relayUrlStored(props) === url) { return { url: url, changed: false }; }
  props.setProperty(FbmSync.RELAY_URL_KEY, JSON.stringify({ url: url, scriptId: ScriptApp.getScriptId(), at: Date.now() }));
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'relay_url_recorded', outcome: typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', reason: 'Đã ghi địa chỉ Web App đồng bộ nền của script này; Sidebar sẽ gửi địa chỉ này cho Extension.' }); }
  return { url: url, changed: true };
};
/** Địa chỉ cho cấu hình relay; chưa có thì dừng hẳn, không cấp cấu hình trỏ sai Web App. */
FbmSync.relayUrlRequired = function (props) {
  var url = FbmSync.relayUrlStored(props);
  if (!url) { throw new Error('Chưa có địa chỉ Web App đồng bộ nền của Sheet này. Hãy mở link Web App một lần (Apps Script → Triển khai → Quản lý bản triển khai → URL ứng dụng web) rồi mở lại Sidebar.'); }
  return url;
};

/**
 * Khóa relay là bí mật chung của Sheet này và Extension; nằm trong DocumentStore như mọi state của đồng bộ. Sinh ở đúng một chỗ, chỉ trong khóa điều phối (lệnh `relay_config`, `relay_rotate_key`), nên hai lời gọi cùng lúc không sinh hai khóa khác nhau.
 */
FbmSync.RELAY_KEY_KEY = 'FBM_RELAY_KEY_V1';
FbmSync.relayKeyRead = function () { return String(FbmSync.props().getProperty(FbmSync.RELAY_KEY_KEY) || ''); };
FbmSync.relayKeyEnsure = function (rotate) {
  var key = rotate ? '' : FbmSync.relayKeyRead();
  if (!key) { key = Utilities.getUuid(); FbmSync.props().setProperty(FbmSync.RELAY_KEY_KEY, key); }
  return key;
};
/** Cấp relay config của đúng Spreadsheet hiện tại; không để Extension tự đoán địa chỉ GAS. Đổi khóa (`rotate`) thì Sidebar phải nhận ACK Extension trước khi coi là hoàn tất. */
FbmSync.relayConfig = function (rotate) {
  var url = FbmSync.relayUrlRequired(PropertiesService.getScriptProperties());
  return { ok: true, url: url, key: FbmSync.relayKeyEnsure(rotate === true), spreadsheetId: FbmSync.currentSpreadsheetId(), extension: FbmSync.extensionConfigPublic(), masterEnabled: FbmSync.masterEnabled(), backgroundEnabled: FbmSync.backgroundEnabled() };
};
/** Ghi Log lựa chọn của người dùng khi Extension đang đồng bộ nền cho Sheet khác: chuyển sang Sheet này hay giữ Sheet cũ. */
FbmSync.relaySwitchDecisionLog = function (decision, fromSpreadsheetId) {
  var switching = decision === 'switch', from = String(fromSpreadsheetId || '').slice(0, 120);
  logEvent({ source: 'fbm_sync', action: switching ? 'relay_spreadsheet_switched' : 'relay_spreadsheet_kept', outcome: LOG_WARN, reason: switching ? 'Người dùng xác nhận chuyển đồng bộ nền của Extension từ Sheet ' + from + ' sang Sheet này.' : 'Người dùng giữ Extension đồng bộ nền cho Sheet ' + from + '; Sheet này chưa nhận đồng bộ nền.', detail: { fromSpreadsheetId: from } });
  return { ok: true };
};
/**
 * Thân trả cho Extension sau khi đã qua `publicResult`. `status` là statusView đầy đủ vì Extension chuyển nguyên cho Sidebar đang mở vẽ (lượt tay giờ do Extension chở); `conflict` là bản xung đột vừa đọc lại để Sidebar mở hộp quyết.
 * `httpStatus` là mã HTTP của response FBM (chỉ có ở kết quả lỗi đọc FBM), không phải `status`. `trailAck` là mốc ô lỗi Extension GAS vừa ghi Log, Extension xóa ô khi mốc chưa đổi. `retryMs` là giãn cách Extension thử lại lần gọi relay hỏng kế tiếp.
 */
FbmSync.relayCompact = function (result, trailAck) {
  var value = result || {};
  return {
    ok: value.ok !== false,
    code: String(value.code || ''),
    error: String(value.error || value.message || ''),
    httpStatus: Number(value.httpStatus || 0),
    request: value.request || null,
    status: value.status || null,
    conflict: value.conflict || null,
    trailAck: Number(trailAck || 0),
    retryMs: FbmSync.BUDGET.relayRetryMs.slice()
  };
};

/**
 * Cổng HTTP Extension gọi cho nhịp nền, chạy cả khi Sidebar đóng. Thân lời gọi: `{ key, contract, spreadsheetId, command, payload }`; chỉ nhận lệnh relay được phép (`heartbeat`, `continue`).
 * Phải đi qua `runEntryPoint` như mọi cửa vào: Log chỉ nằm trong bộ đệm RAM tới khi cửa vào xả, và exception phải có dòng Log cùng tin chờ hiện ở Sidebar lần mở sau (FBM-034).
 * Khóa sai thì không ghi Log: ai biết URL cũng gọi được, ghi Log ở nhánh này là cho người lạ đẩy trôi Log thật.
 */
function doPost(event) {
  var reply = function (value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); };
  try {
    var body;
    // Thông báo lỗi JSON.parse có thể trích một đoạn nội dung gửi lên (chứa khóa relay), nên thay bằng câu không mang nội dung.
    try { body = event && event.postData && event.postData.contents ? JSON.parse(event.postData.contents) : {}; } catch (badJson) { return reply({ ok: false, code: 'RELAY_INVALID_JSON', error: 'invalid_json' }); }
    var expected = FbmSync.relayKeyRead();
    if (!expected || body.key !== expected) { return reply({ ok: false, code: 'RELAY_UNAUTHORIZED', error: 'unauthorized' }); }
    return reply(runEntryPoint('fbmRelay', 'fbm_sync', function () { FbmSync.relayUrlRecord(PropertiesService.getScriptProperties()); return FbmSync.relayHandle(body); }));
  } catch (err) { return reply({ ok: false, code: String(err && err.code || 'RELAY_FAILED'), error: errorMessage(err) }); }
}
/**
 * Mở link Web App trên trình duyệt là bước cài đặt duy nhất cho địa chỉ relay: Web App ghi địa chỉ của chính nó. Ai mở link cũng chỉ ghi được đúng địa chỉ thật của script này.
 * Lời gọi mang `token` là của cửa chạy hàm lúc phát triển (server/dev); gỡ thư mục đó thì nhánh này không còn.
 */
function doGet(event) {
  var params = event && event.parameter ? event.parameter : {};
  if (params.token !== undefined && typeof devRunnerGet === 'function') { return devRunnerGet(event); }
  var result = runEntryPoint('fbmRelayUrlRecord', 'fbm_sync', function () { return FbmSync.relayUrlRecord(PropertiesService.getScriptProperties()); });
  var text = result && result.url ? 'ShinCRM đã ghi địa chỉ Web App đồng bộ nền của Sheet này. Mở lại Sidebar để gửi địa chỉ cho Extension.' : 'ShinCRM chưa ghi được địa chỉ Web App; xem Sheet Log.';
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}
/** Phần nghiệp vụ của nhịp nền sau khi đã qua khóa relay; mọi từ chối ném lỗi có mã để `runEntryPoint` ghi Log và báo Sidebar. */
FbmSync.relayHandle = function (body) {
  if (!body.spreadsheetId || String(body.spreadsheetId) !== FbmSync.currentSpreadsheetId()) { throw FbmSync.relayError('RELAY_SPREADSHEET_MISMATCH', 'Extension gửi nhịp nền cho bảng tính khác với bảng tính đang gắn script; kiểm tra lại cấu hình relay.'); }
  var mismatch = FbmSync.protocol.contractCheck(body.contract);
  if (mismatch) { throw FbmSync.relayError(mismatch.code, mismatch.message + ' (Extension gửi mã "' + (mismatch.received || 'không có') + '", GAS cần "' + mismatch.expected + '").'); }
  var command = String(body.command || '');
  if (!FbmSync.relayCommandAllowed(command)) { throw FbmSync.relayError('RELAY_COMMAND_REJECTED', 'Relay không được gọi lệnh "' + command + '"; chỉ nhận heartbeat và continue.'); }
  var payload = body.payload || {};
  if (!String(payload.machineId || '')) { throw FbmSync.relayError('RELAY_MACHINE_ID_REQUIRED', 'Extension gọi relay mà không gửi mã máy; GAS không biết máy nào đang chở lượt.'); }
  var failure = FbmSync.relayFailureEntry(payload.trail);
  if (failure) { logEvent(failure.entry); }
  return FbmSync.relayCompact(FbmSync.controlDispatch(command, payload, 'relay'), failure ? failure.at : 0);
};
FbmSync.relayError = function (code, message) { var error = new Error(message); error.code = code; return error; };
