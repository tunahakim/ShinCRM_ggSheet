/**
 * Hiến chương use case và ma trận 44 pipeline phải trỏ tới tệp test đang chạy, cùng phân quyền ghi theo mode. Ma trận chứa đường dẫn tệp thật nên đổi tên hay xóa tệp ca là đỏ ở đây, không âm thầm mất chủ sở hữu kiểm thử.
 */
const fs = require('fs');
const path = require('path');
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');
const { WORKFLOWS, PIPELINE_CATALOG } = require('../../contracts/fbmSyncPipeline');
const ROOT = path.join(__dirname, '..', '..', '..');

async function chay(so) {
  section('FBM sync — hiến chương use case và ma trận pipeline');
  const ids = WORKFLOWS.map((item) => item.id);
  check(so, 'charter workflow co 14 use case doc lap va khong trung ID',
    [WORKFLOWS.length, new Set(ids).size],
    [14, 14]);
  check(so, 'charter bao phu relay, nhan dien, nen, ghi, dung va UI/log', WORKFLOWS.map((item) => item.id).sort(), [
    'relay-sidebar-open', 'identity-autofill', 'identity-clear-binding', 'background-noop', 'manual-transport-failure',
    'identity-login-test', 'background-transport-failure', 'master-off-in-flight', 'read-vs-check-write-gate', 'push-write-safety', 'stale-response-and-cancel', 'ui-status-and-log', 'conflict-resolution', 'full-pull-missing'
  ].sort());
  check(so, 'catalog gom du 44 pipeline A-F cua module va khong trung ma',
    [PIPELINE_CATALOG.length, new Set(PIPELINE_CATALOG.map((item) => item.id)).size],
    [44, 44]);
  check(so, 'moi pipeline co nguon, trigger, ket qua quan sat va bang chung bat buoc',
    PIPELINE_CATALOG.every((item) => item.source && item.trigger && item.expect && item.requiredProof.length === 2),
    true);
  check(so, 'ma tran 44 pipeline deu tro den module test dang chay va khong co pipeline khong co chu so huu kiem thu',
    PIPELINE_CATALOG.every((item) => item.testModules.length > 0 && item.testModules.every((file) => fs.existsSync(path.join(ROOT, file)))),
    true);
  check(so, 'ma tran 44 pipeline co trace offline theo hanh vi va phan biet bang chung live',
    PIPELINE_CATALOG.every((item) => item.offlineScenario && item.layers && item.layers.gas && item.layers.extension && item.layers.ui && item.layers.log && item.requiredProof.indexOf('offline') >= 0 && item.requiredProof.some((proof) => /GAS DEV|live/.test(proof))),
    true);
  const gates = workflowGas().hop.FbmSync;
  check(so, 'phan quyen ghi theo mode: check khong ghi, read chi ghi Sheet, push chi ghi FBM', [
    ['check', 'read', 'push', 'write'].map((mode) => gates.canWriteSheet(mode)),
    ['check', 'read', 'push', 'write'].map((mode) => gates.canWriteFbm(mode))
  ], [[false, true, false, true], [false, false, true, true]]);
}

module.exports = { chay };
