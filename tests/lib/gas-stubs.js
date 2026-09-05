/**
 * Những thứ toàn cục chỉ có trên Google, dựng lại vừa đủ để chạy code thật trong Node: `Utilities`, `Logger`, `PropertiesService`, cộng tệp Sheet giả.
 *
 * Vì sao không nạp thẳng thư viện nào: mỗi thứ ở đây chỉ mô phỏng đúng phần mà code của dự án gọi tới. Dựng nhiều hơn là dựng thứ không ai kiểm, mà một bản mô phỏng không ai kiểm là một chỗ để lỗi nằm im.
 *
 * `Utilities.formatDate` ở đây nhận đúng hai khuôn mà dự án dùng, và **ném lỗi** khi gặp khuôn khác. Đây là lựa chọn có ý thức: một bản mô phỏng âm thầm trả về chuỗi sai sẽ làm phép kiểm xanh trong khi cột `Lúc` trên sheet thật ghi rác.
 */

const { taoBook } = require('./fake-sheet');

/** Đổi số thành chuỗi đủ chữ số, ví dụ 7 thành "07". */
function dem2(n) {
  return (n < 10 ? '0' : '') + n;
}

/**
 * `formatDate` giả. Chỉ hiểu ba khuôn mà dự án dùng, và bỏ qua tham số múi giờ.
 *
 * Ba khuôn: `yyyy-MM-dd` và `yyyy-MM-dd HH:mm` là hai dạng chuỗi thời gian chốt ở tài liệu 05 Phần 3, còn `yyyy-MM-dd HH:mm:ss` là dạng cột `Lúc` của sheet `Log`. Khuôn của `Log` có giây vì đó là dấu vết pháp y, còn dữ liệu nghiệp vụ thì không có giây.
 *
 * Bỏ qua múi giờ là giới hạn phải biết: phép kiểm ở đây không chứng minh được cột `Lúc` ghi đúng giờ Việt Nam. Việc đó chỉ chứng minh được trên Google, và `dumpSettings`, `probeLogGate`, `probeDateText` là chỗ nhìn thấy nó.
 */
function formatDateGia(date, timezone, format) {
  const d = date instanceof Date ? date : new Date(date);
  const ngay = d.getFullYear() + '-' + dem2(d.getMonth() + 1) + '-' + dem2(d.getDate());
  const gioPhut = dem2(d.getHours()) + ':' + dem2(d.getMinutes());

  if (format === 'yyyy-MM-dd') { return ngay; }
  if (format === 'yyyy-MM-dd HH:mm') { return ngay + ' ' + gioPhut; }
  if (format === 'yyyy-MM-dd HH:mm:ss') { return ngay + ' ' + gioPhut + ':' + dem2(d.getSeconds()); }

  throw new Error('formatDate giả chưa biết khuôn "' + format + '". Thêm khuôn vào tests/lib/gas-stubs.js chứ đừng để nó trả về chuỗi sai.');
}

/**
 * Dựng cả bộ thứ toàn cục cho một hộp cát.
 *
 * `sheets` là tên các sheet dựng sẵn trong tệp giả. `props` là `DocumentProperties` ban đầu — truyền sẵn khóa dọn log vào đây là cách chặn phép quét tuổi log chạy trong một phép kiểm không nói về nó.
 */
function taoStubsGas(options) {
  const chon = options || {};
  const gia = taoBook(chon.sheets || []);
  const props = Object.assign({}, chon.props || {});
  const daLog = [];
  const daConsole = [];

  return {
    SpreadsheetApp: gia.SpreadsheetApp,

    /**
     * `console` giả: giữ lại dòng thay vì in ra.
     *
     * Trên Google thì `console.log` đi vào Cloud logging và đó là chỗ duy nhất còn sót lại khi một lượt chạy bị giết giữa đường — nên code **phải** gọi nó. Nhưng in ra ở đây thì một ca kiểm đệm 250 dòng vết sẽ nhấn chìm cả bản báo cáo, mà một bản báo cáo không ai đọc nổi thì không phải cái phanh.
     *
     * Giữ lại thì được thêm một thứ: phép kiểm soi được vào đây, nên luật "phản chiếu mọi dòng ra console" thành điều chứng minh được thay vì điều tin là có.
     */
    console: {
      log: (...phan) => { daConsole.push('log: ' + phan.join(' ')); },
      error: (...phan) => { daConsole.push('error: ' + phan.join(' ')); },
      warn: (...phan) => { daConsole.push('warn: ' + phan.join(' ')); },
      info: (...phan) => { daConsole.push('info: ' + phan.join(' ')); }
    },

    Utilities: {
      formatDate: formatDateGia,
      DigestAlgorithm: { MD5: 'MD5' },
      /**
       * Không phải MD5 thật. Hợp đồng của nó là hai điều mà nhãn che dựa vào: **cùng một chuỗi ra cùng một dãy byte**, và **hai chuỗi khác nhau ra hai dãy khác nhau** ngay từ những byte đầu.
       *
       * Điều thứ hai là điều dễ làm hụt. Bản đầu của tệp này cộng dồn theo từng vị trí, nên hai chuỗi chỉ khác nhau ở ký tự thứ tám vẫn cho hai byte đầu giống nhau — mà nhãn che chỉ lấy hai byte đầu. Hệ quả: phép kiểm "hai bí mật khác nhau ra hai nhãn khác nhau" báo đỏ trong khi code thật không sai gì. Một bản mô phỏng thiếu đúng cái tính chất mà code dựa vào thì nó không kiểm được code, nó chỉ kiểm chính nó.
       */
      computeDigest(algorithm, value) {
        const text = String(value);
        const bytes = [];
        for (let i = 0; i < 16; i += 1) { bytes.push((i * 7 + text.length) % 256); }
        for (let i = 0; i < text.length; i += 1) {
          for (let j = 0; j < 16; j += 1) {
            bytes[j] = (bytes[j] * 31 + text.charCodeAt(i) + j) % 256;
          }
        }
        return bytes;
      }
    },

    Logger: { log: (line) => daLog.push(String(line)) },

    PropertiesService: {
      getDocumentProperties: () => ({
        getProperty: (key) => (Object.prototype.hasOwnProperty.call(props, key) ? props[key] : null),
        setProperty: (key, value) => { props[key] = String(value); },
        deleteProperty: (key) => { delete props[key]; }
      })
    },

    // Bốn thứ dưới đây không có bên Google, chỉ để phép kiểm xem lại: tệp giả, bộ đếm lệnh gọi, những dòng Logger đã in, và những dòng console đã giữ.
    _book: gia.book,
    _dem: gia.dem,
    _daLog: daLog,
    _daConsole: daConsole,
    _props: props
  };
}

module.exports = { taoStubsGas, formatDateGia };
