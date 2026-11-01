/** Tầng liên kết của Sidebar: thăm dò chọn ô, kênh báo thay đổi, đồng bộ sheet quản trị. */
const NHOM = [
  require('./link/selectionPoll'),
  require('./link/changeSignal'),
  require('./link/viewSync')
];

async function chay(so) {
  for (const nhom of NHOM) { await nhom.chay(so); }
}

module.exports = { chay };
