/** Điều phối các nhóm kiểm tra FBM; mỗi file con chỉ giữ một trách nhiệm. */
const NHOM = [
  require("./fbmSync/Control"),
  require("./fbmSync/Protocol"),
  require("./fbmSync/Contract"),
  require("./fbmSync/Builders"),
  require("./fbmSync/Pull"),
  require("./fbmSync/Reconcile"),
  require("./fbmSync/Orchestration"),
  require("./fbmSync/Preflight"),
  require("./fbmSync/Push"),
  require("./fbmSync/PushCompare"),
  require("./fbmSync/Audit"),
  require("./fbmSync/UserJourneys"),
  require("./fbmSync/Workflow"),
  require("./fbmSync/ScanJob"),
  require("./fbmSync/ScanPack"),
  require("./fbmSync/ActivityScan"),
  require("./fbmSync/CustomerCount"),
  require("./fbmSync/BackgroundChain"),
  require("./fbmSync/Rotation"),
  require("./fbmSync/Gate"),
  require("./fbmSync/Settings"),
  require("./fbmSync/RelayResend")
];

async function chay(so) { for (const nhom of NHOM) { await nhom.chay(so); } }

module.exports = { chay };
