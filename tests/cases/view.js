/** Ba công cụ của server/view: vẽ sheet quản trị, sổ trạng thái vẽ, màu tab. */
const NHOM = [
  require('./view/viewSheetRenderer'),
  require('./view/viewLedger'),
  require('./view/viewTabTint')
];

function chay(so) {
  NHOM.forEach((nhom) => nhom.chay(so));
}

module.exports = { chay };
