/** Điều phối các nhóm kiểm tra FBM; mỗi file con chỉ giữ một trách nhiệm. */
const NHOM = [
  require("./fbmSync/Control"),
  require("./fbmSync/Protocol"),
  require("./fbmSync/Builders"),
  require("./fbmSync/Pull"),
  require("./fbmSync/Reconcile"),
  require("./fbmSync/Orchestration"),
  require("./fbmSync/Preflight"),
  require("./fbmSync/Push"),
  require("./fbmSync/Audit"),
  require("./fbmSync/UserJourneys"),
  require("./fbmSync/Workflow")
];

async function chay(so) { for (const nhom of NHOM) { await nhom.chay(so); } }

module.exports = { chay };
