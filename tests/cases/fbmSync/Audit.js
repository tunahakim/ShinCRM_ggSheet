/** Kiểm tra probe nghiệm thu ALT00010. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer } = require("../../lib/load-gas");

async function chay(so) {
  section("FBM sync — audit");
  const auditPull = taoHopCat({
    FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {},
    PropertiesService: { getDocumentProperties: () => ({ getProperty: (key) => ({ FBM_SYNC_TEST_CUSTOMER_CODE: 'ALT00010' }[key] || '') }) }
  });
  napServer(auditPull, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategorySync.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/write/RequestBuilders.js');
  const gate = { map: { '@CAT_TINH_THANH\u001fHà Nội': 'HNI' }, valid: { '@CAT_TINH_THANH': { 'Hà Nội': true, HNI: true } } };
  const activityDecisionLogs = [];
  auditPull.logEvent = (event) => activityDecisionLogs.push(event);
  auditPull.FbmSync.linkActivityCustomers([{ fbmId: 'ACT-ORPHAN', customerFbmCode: 'ALT-MISSING' }], []);
  const orphanEntries = activityDecisionLogs.filter((event) => event.action === 'activity_pull_skipped');
  check(so, 'Activity pull bo qua co log Customer cha va Activity ID', [orphanEntries.length, orphanEntries[0].recordId, orphanEntries[0].detail.customerCode], [1, 'ACT-ORPHAN', 'ALT-MISSING']);

  const audit = taoHopCat({ FbmSync: {}, LOG_OK: 'ok', LOG_ERROR: 'error', FbmSyncLog: [] });
  napServer(audit, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/report/Probe.js');
  audit.FbmSync.stateRead = () => ({ mode: 'read', phase: 'done', runId: 'run-1' });
  audit.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-1', fbmCustomerCode: 'ALT00010', fbmId: 'A1' }] : [{ id: 'ACT-1', fbmId: '7', customerId: 'CUS-1' }];
  audit.logEvent = (event) => audit.FbmSyncLog.push(event);
  audit.flushLog = () => {};
  const auditResult = audit.fbmAuditAltState();
  check(so, 'nghiệm thu ALT00010 có case PASS', auditResult.ok, true);
  check(so, 'nghiệm thu ghi từng case vào Log', audit.FbmSyncLog.length >= 6, true);
}

module.exports = { chay };
