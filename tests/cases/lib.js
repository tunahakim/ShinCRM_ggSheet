/** Phép kiểm cho chính khung test ở tests/lib; khung sai thì mọi ca dựng trên nó xanh trên một môi trường không tồn tại. */
const NHOM = [
  require('./lib/gas'),
  require('./lib/sidebar'),
  require('./lib/ext'),
  require('./lib/quet')
];

function chay(so) {
  NHOM.forEach((nhom) => nhom.chay(so));
}

module.exports = { chay };
