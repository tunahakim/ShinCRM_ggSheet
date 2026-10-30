/**
 * Hợp đồng dữ liệu giữa GAS (gồm Sidebar) và Extension; nguồn là Tài liệu 09.01 mục "Mã phiên bản hợp đồng GAS–Extension".
 *
 * GAS và Extension cài ở hai nơi nên có thể lệch bản. Mã phiên bản là SHA-256 của dữ liệu dưới đây (không tính chú thích), hai bên chép mã vào hằng của mình; test `gasExtensionContract` báo mã mới cần chép khi dữ liệu đổi.
 * Đổi bất kỳ trường nào bên dưới thì mã đổi, Extension cũ sẽ bị GAS từ chối cho tới khi chủ dự án tải lại Extension.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONTRACT = {
  // GAS → Extension: envelope một request FBM. Extension chỉ đọc các trường này và không suy luận nghiệp vụ.
  request: {
    fields: ['protocol', 'version', 'contract', 'id', 'url', 'method', 'headers', 'body', 'bodyText', 'meta', 'items'],
    meta: ['kind', 'trace', 'transport', 'requestGap', 'force', 'credentialRef', 'openFbmContext', 'afterLoginUrl', 'reloadFbmPage', 'timeoutMs', 'fetchMs', 'gasReplyMs', 'batch', 'job', 'keep'],
    // Cột giữ lại của response lưới (theo `AliasName`, đúng thứ tự). Extension lọc ngay trong tab; response không phải lưới đi nguyên.
    keep: ['fields'],
    // Mọi URL trong envelope phải thuộc miền này; Extension từ chối envelope có địa chỉ khác trước khi tìm tab.
    site: 'https://fbo.com.vn:8888/',
    transport: ['captures', 'replacements'],
    // Khoảng nghỉ ngẫu nhiên Extension chờ trước mỗi request gọi FBM (kể cả từng phần tử của lô), tính từ lúc request FBM trước kết thúc.
    requestGap: ['minMs', 'maxMs'],
    // Lô request đọc độc lập (`meta.kind = 'batch'`): Extension chạy lần lượt, dừng khi tổng thân vượt `batch.maxBytes`.
    batch: ['maxBytes'],
    // Việc quét: `scan_job` gọi FBM một lần, giữ cột theo `keep`, cắt gói và giữ trong RAM tab; `scan_chunk` trả gói theo số thứ tự, không gọi FBM.
    scanKinds: ['scan_job', 'scan_chunk'],
    job: ['jobId', 'idField', 'keepIds', 'chunkTargetBytes', 'chunkMaxBytes', 'maxResponseBytes', 'chunkIndex'],
    item: ['id', 'url', 'method', 'headers', 'body', 'bodyText', 'meta'],
    itemMeta: ['kind', 'trace']
  },
  // Extension → GAS: response FBM thô. `transport.contract` là mã phiên bản Extension đang chạy.
  response: {
    fields: ['ok', 'status', 'headers', 'body', 'transport', 'items', 'job'],
    transport: ['contract', 'trace', 'captures', 'loginStage', 'loginBlocked'],
    // Response lô chỉ gồm phần tử đã chạy, đúng thứ tự gửi.
    item: ['id', 'ok', 'status', 'headers', 'body'],
    // Gói của việc quét giữ dạng response grid FBM; `job` cho GAS đối chiếu với cursor trước khi ghi.
    job: ['jobId', 'chunkIndex', 'chunkCount', 'rowCount', 'keptCount', 'totalRowCount', 'oversize'],
    // Tab không còn giữ việc quét (tải lại, Extension khởi động lại): GAS chạy lại cả việc. Quá trần cỡ, không đọc được dạng bảng hoặc hết hạn fetch: GAS chia giao dịch theo khoảng ngày.
    codes: ['FBM_SCAN_JOB_GONE', 'FBM_SCAN_TOO_LARGE', 'FBM_SCAN_UNPARSEABLE', 'FBM_FETCH_TIMEOUT'],
    // Lỗi Extension không gửi được envelope tới tab: Chrome chặn quyền site (không thử lại, người dùng phải mở quyền), địa chỉ ngoài miền FBM.
    transportCodes: ['FBM_SITE_ACCESS_BLOCKED', 'FBM_URL_OUTSIDE_SITE']
  },
  // Extension → Web App GAS: cửa duy nhất phong bì ra khỏi GAS, cho cả lượt nền lẫn lượt tay. `heartbeat` hỏi việc (GAS trả request của lượt tay đang chờ máy hỏi, hoặc việc nền đến hạn); `continue` nộp `response` / `error` (`requestId`, `code`, `message`). Mọi thân mang `machineId`; GAS chỉ nhận `continue` từ đúng máy đang lái lượt.
  relay: {
    body: ['key', 'contract', 'spreadsheetId', 'command', 'payload'],
    commands: ['heartbeat', 'continue'],
    payload: ['machineId', 'trigger', 'trail', 'response', 'error', 'hop'],
    // Ô lỗi gọi relay trong hộp đen, gửi kèm `trail` ở lần hỏi sau; GAS ghi Log rồi trả `trailAck` = `at` để Extension xóa ô.
    relayFailure: ['at', 'command', 'code', 'httpStatus', 'attempts'],
    reply: ['ok', 'code', 'error', 'httpStatus', 'request', 'status', 'conflict', 'trailAck', 'retryMs'],
    driverCodes: ['RELAY_MACHINE_ID_REQUIRED', 'RUN_DRIVER_MISMATCH', 'CONTINUE_EMPTY'],
    // Mã giao thức lệch giữa GAS và Extension: bên nhận dừng, Sidebar báo tải lại Extension.
    mismatchCode: 'EXTENSION_PROTOCOL_MISMATCH',
    // Extension đã chuyển sang Sheet khác giữa chuỗi: báo một lần cho GAS cũ rồi dừng.
    failureCodes: ['RELAY_CONFIG_SWITCHED']
  },
  // Sidebar ↔ Extension qua postMessage.
  bridge: {
    toExtension: ['CRM_HANDSHAKE', 'CRM_FBM_CONFIG', 'CRM_FBM_CREDENTIALS', 'CRM_FBM_CREDENTIAL_METADATA', 'CRM_FBM_CREDENTIAL_CLEAR', 'CRM_FBM_CANCEL', 'CRM_FBM_MACHINE_ID', 'CRM_FBM_RUN_NOW'],
    toSidebar: ['CRM_HANDSHAKE_ACK', 'CRM_FBM_CONFIG_ACK', 'CRM_FBM_CREDENTIALS_RESULT', 'CRM_FBM_CREDENTIAL_METADATA_RESULT', 'CRM_FBM_CREDENTIAL_CLEAR_RESULT', 'CRM_FBM_CANCEL_RESULT', 'CRM_FBM_MACHINE_ID_RESULT', 'CRM_FBM_RUN_NOW_RESULT', 'CRM_FBM_STATUS'],
    // Mọi trả lời lệnh cùng một dạng; `CRM_FBM_STATUS` mang trạng thái lượt GAS trả qua relay hoặc lỗi Extension (`failure`).
    reply: ['id', 'ok', 'result', 'code', 'error', 'currentSpreadsheetId'],
    status: ['status', 'conflict', 'code', 'error', 'failure', 'done'],
    // Sidebar mở lượt tay xong thì đánh thức Extension hỏi GAS ngay (`trigger` `run_now`); tin không mang mã lượt, GAS tự biết lượt nào chờ máy này.
    runNow: ['retryMs'],
    // Cấu hình relay: `switchFrom` là Spreadsheet Extension đang giữ, chỉ gửi sau khi người dùng xác nhận chuyển Sheet ở Sidebar.
    config: ['url', 'key', 'spreadsheetId', 'extension', 'switchFrom'],
    configAck: ['ok', 'code', 'error', 'currentSpreadsheetId'],
    configCodes: ['RELAY_CONFIG_SAVED', 'RELAY_CONFIG_UNCHANGED', 'RELAY_SPREADSHEET_SWITCHED', 'RELAY_SPREADSHEET_SWITCH_REQUIRED', 'RELAY_CONFIG_INVALID', 'RELAY_CONFIG_SAVE_FAILED']
  }
};

function contractVersion(contract) {
  return crypto.createHash('sha256').update(JSON.stringify(contract || CONTRACT)).digest('hex').slice(0, 12);
}

/** Mã Extension đang công bố; response giả trong test dùng mã này để giống đúng thứ Extension thật gửi về. */
function extensionContractVersion() {
  const worker = path.join(__dirname, '..', '..', '2_ShinCRM_Extension', 'background', 'service_worker.js');
  return (fs.readFileSync(worker, 'utf8').match(/var FBM_CONTRACT_VERSION = '([^']*)';/) || [])[1];
}

module.exports = { CONTRACT, contractVersion, extensionContractVersion };
