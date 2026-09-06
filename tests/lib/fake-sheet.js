/**
 * Một tệp Sheet giả, sống trong bộ nhớ Node, đủ để chạy code Apps Script thật mà không cần mạng.
 *
 * Vì sao cần: những luật đáng lo nhất của dự án là luật về **số lệnh gọi** — "cả lượt chỉ tốn một `setValues`", "cắt log bằng một `deleteRows`". Trên Google thì đo được bằng đồng hồ và hạn mức, nhưng mỗi lần đo là một vòng đẩy code cộng chờ mạng, nên trong một phiên code người ta sẽ đo một lần rồi thôi. Ở đây tệp giả **tự đếm** từng lệnh, nên luật đó thành một phép kiểm chạy trong một giây.
 *
 * Giới hạn phải biết, và đây là chỗ ghi nó: tệp giả này **không phải Google**. Nó nhớ khuôn hiển thị nhưng không có **hệ quả** của khuôn (ghi chuỗi số vào ô General ở đây không bị đổi thành số), không có công thức, không có hàng ẩn, không có giới hạn 10 triệu ô, và không có chuyện `getActiveSpreadsheet` trả về một đối tượng trông như tệp nhưng đụng vào là ném lỗi. Xanh ở đây nghĩa là logic đúng, không có nghĩa là chạy được trên Google — lời cuối vẫn thuộc về các phép nghiệm thu qua `node tests/gas.js`.
 */

/** Một ô rỗng ra chuỗi rỗng, đúng như `getValues` của Google trả về. */
function oRong(giaTri) {
  return giaTri === undefined || giaTri === null ? '' : giaTri;
}

/**
 * Khuôn hiển thị của một ô Google chưa ai đụng tới. Đúng chuỗi này là thứ `getNumberFormat` trả về cho ô General.
 *
 * Để đúng chuỗi thật chứ không để chuỗi rỗng, vì đây chính là khuôn nuốt số 0 đầu của mã số thuế: một phép kiểm đọc thấy khuôn này nghĩa là cột đang hở, và nó phải đỏ.
 */
const KHUON_GENERAL = '0.###############';

/**
 * Dựng một sheet giả. `dem` là bộ đếm dùng chung của cả tệp, để phép kiểm biết một lượt tốn mấy lệnh.
 *
 * Sheet giả có **lưới hữu hạn**, mặc định 1.000 hàng × 26 cột đúng như sheet mới của Google, và lưới đó co lại khi `deleteRows`.
 * Đây là điều bản đầu của tệp này thiếu, và cái thiếu ấy đã che một lỗi thật: `cells` cũ tự dài ra theo mọi lời ghi, nên `setValues`
 * ở đây không bao giờ vượt lưới, trong khi trên Google thì `getRange` chạm quá hàng cuối là ném lỗi ngay. Lỗi lọt qua bộ kiểm xanh
 * rồi nổ trên sheet thật: sheet `Log` bị co xuống 7 hàng sau một phép đo, và lượt ghi log tiếp theo chết trong im lặng.
 *
 * Bài học ghi lại ở đây vì nó sẽ còn đúng cho mọi thứ thêm vào tệp này: một tệp giả **dễ tính hơn** thứ nó mô phỏng thì không bảo vệ ai cả.
 */
function taoSheet(ten, dem, luoi) {
  const cells = [];
  const formats = [];
  let frozenRows = 0;
  let maxRows = (luoi && luoi.rows) || 1000;
  let maxCols = (luoi && luoi.cols) || 26;

  const soCotThat = () => cells.reduce((max, row) => Math.max(max, row ? row.length : 0), 0);

  const coNoiDung = (row) => Array.isArray(row) && row.some((cell) => oRong(cell) !== '');

  const layDong = (i) => {
    while (cells.length <= i) { cells.push([]); }
    return cells[i];
  };

  const layDongKhuon = (i) => {
    while (formats.length <= i) { formats.push([]); }
    return formats[i];
  };

  const sheet = {
    getName: () => ten,

    /** Dòng cuối có nội dung. Trả về 0 khi sheet trắng, đúng như Google. */
    getLastRow() {
      for (let i = cells.length - 1; i >= 0; i -= 1) {
        if (coNoiDung(cells[i])) { return i + 1; }
      }
      return 0;
    },

    getLastColumn() {
      let max = 0;
      cells.forEach((row) => {
        if (!Array.isArray(row)) { return; }
        for (let c = row.length - 1; c >= 0; c -= 1) {
          if (oRong(row[c]) !== '') { max = Math.max(max, c + 1); break; }
        }
      });
      return max;
    },

    setFrozenRows(n) { frozenRows = n; return sheet; },
    getFrozenRows: () => frozenRows,

    getMaxRows: () => maxRows,
    getMaxColumns: () => maxCols,

    /**
     * Nới lưới thêm hàng. Google chèn hàng trắng ngay sau `afterRow`, nên hàng đã có nội dung ở dưới bị đẩy xuống.
     *
     * Hàng mới **thừa hưởng khuôn hiển thị của hàng ngay trên nó**, đúng như Google. Chép cả chỗ này vì đó là cơ chế duy nhất giữ cho hàng khách mới không rơi về khuôn General — nếu không có nó thì phép đặt khuôn một lần lúc dựng khung là vô nghĩa.
     */
    insertRowsAfter(afterRow, howMany) {
      const them = howMany === undefined ? 1 : howMany;
      const trong = [];
      const khuonMau = (formats[afterRow - 1] || []).slice();
      const khuonMoi = [];
      for (let i = 0; i < them; i += 1) { trong.push([]); khuonMoi.push(khuonMau.slice()); }
      cells.splice(afterRow, 0, ...trong);
      layDongKhuon(afterRow - 1);
      formats.splice(afterRow, 0, ...khuonMoi);
      maxRows += them;
      dem.insertRows += 1;
      return sheet;
    },

    /**
     * Vùng ô. Trả về đối tượng có đúng những phương pháp mà code của dự án dùng, không nhiều hơn.
     *
     * Cố ý không dựng đủ mặt API của Google: một tệp giả càng giống thật càng dễ tin, mà càng dễ tin thì càng dễ quên nó là giả. Thiếu phương pháp nào thì phép kiểm ném lỗi "is not a function" và người viết sẽ thấy ngay là mình vừa dùng một API chưa có ở đây.
     */
    getRange(row, col, numRows, numCols) {
      const soDong = numRows === undefined ? 1 : numRows;
      const soCot = numCols === undefined ? 1 : numCols;

      // Vượt lưới thì ném lỗi, đúng như Google. Đây là phép chặn đã bắt được lỗi thật, nên đừng nới nó ra cho phép kiểm dễ xanh.
      if (row < 1 || col < 1) {
        throw new Error('getRange: hàng và cột đếm từ 1, nhận được hàng ' + row + ' cột ' + col + '.');
      }
      if (row + soDong - 1 > maxRows) {
        throw new Error('getRange: vùng chạm tới hàng ' + (row + soDong - 1) + ' nhưng sheet "' + ten + '" chỉ có ' + maxRows + ' hàng. Google cũng ném lỗi ở đây — setValues KHÔNG tự nới sheet.');
      }
      if (col + soCot - 1 > maxCols) {
        throw new Error('getRange: vùng chạm tới cột ' + (col + soCot - 1) + ' nhưng sheet "' + ten + '" chỉ có ' + maxCols + ' cột. Google cũng ném lỗi ở đây.');
      }

      const range = {
        getValues() {
          const ra = [];
          for (let r = 0; r < soDong; r += 1) {
            const nguon = cells[row - 1 + r] || [];
            const dong = [];
            for (let c = 0; c < soCot; c += 1) { dong.push(oRong(nguon[col - 1 + c])); }
            ra.push(dong);
          }
          return ra;
        },

        setValues(values) {
          if (values.length !== soDong) {
            throw new Error('setValues: vùng ' + soDong + ' dòng nhưng đưa vào ' + values.length + ' dòng. Google cũng ném lỗi ở đây.');
          }
          values.forEach((dong, r) => {
            if (dong.length !== soCot) {
              throw new Error('setValues: vùng ' + soCot + ' cột nhưng dòng ' + (r + 1) + ' có ' + dong.length + ' ô.');
            }
            const dich = layDong(row - 1 + r);
            dong.forEach((o, c) => { dich[col - 1 + c] = o; });
          });
          dem.setValues += 1;
          return range;
        },

        getValue() { return oRong((cells[row - 1] || [])[col - 1]); },
        setValue(v) { layDong(row - 1)[col - 1] = v; dem.setValues += 1; return range; },

        /**
         * Khuôn hiển thị — thứ duy nhất trong phần định dạng được mô phỏng thật, vì dự án **đọc lại** nó ở `verifySheets`.
         *
         * Vẫn không mô phỏng **hệ quả** của khuôn: ở đây ghi chuỗi `'0101243150'` vào ô khuôn General thì nó vẫn nằm nguyên là chuỗi, còn Google thì đổi thành số `101243150`. Nên phép kiểm offline chỉ chứng minh được cột đã được đặt đúng khuôn, không chứng minh được số 0 đầu sống sót; câu đó chỉ `probeWriteGate` trên Google trả lời được.
         */
        setNumberFormat(format) {
          for (let r = 0; r < soDong; r += 1) {
            const dich = layDongKhuon(row - 1 + r);
            for (let c = 0; c < soCot; c += 1) { dich[col - 1 + c] = format; }
          }
          dem.setNumberFormat += 1;
          return range;
        },

        getNumberFormats() {
          const ra = [];
          for (let r = 0; r < soDong; r += 1) {
            const nguon = formats[row - 1 + r] || [];
            const dong = [];
            for (let c = 0; c < soCot; c += 1) { dong.push(nguon[col - 1 + c] || KHUON_GENERAL); }
            ra.push(dong);
          }
          return ra;
        },

        getNumberFormat() { return (formats[row - 1] || [])[col - 1] || KHUON_GENERAL; },

        // Định dạng không được mô phỏng: dự án chỉ đặt chứ không đọc lại, nên nuốt là đủ và giả vờ có định dạng mới là nói dối.
        setFontWeight() { return range; },
        setBackground() { return range; },
        setNote() { return range; },
        clearNote() { return range; }
      };

      return range;
    },

    /**
     * Xóa hàng, và **co lưới lại** đúng như Google. Chính chỗ co lưới này là thứ đưa sheet `Log` thật xuống còn 7 hàng.
     *
     * Google từ chối xóa hết các hàng không đóng băng — một sheet phải còn ít nhất một hàng ghi được. Mô phỏng luôn phép từ chối đó,
     * vì nó đã làm đổ một phép nghiệm thu trên sheet thật, và một luật đã đổ một lần thì đáng có phép kiểm canh.
     */
    deleteRows(row, count) {
      const soXoa = count === undefined ? 1 : count;
      if (maxRows - frozenRows - soXoa < 1) {
        throw new Error('deleteRows: xóa ' + soXoa + ' hàng từ hàng ' + row + ' là xóa hết các hàng không đóng băng của sheet "' + ten + '" (lưới ' + maxRows + ' hàng, đóng băng ' + frozenRows + '). Google từ chối việc này: "Rất tiếc, không thể xóa tất cả các hàng không được cố định."');
      }
      cells.splice(row - 1, soXoa);
      formats.splice(row - 1, soXoa);
      maxRows -= soXoa;
      dem.deleteRows += 1;
      return sheet;
    },

    /** Chỉ dùng trong phép kiểm, không có bên Google: xem thẳng ruột sheet. */
    _cells: cells,
    _khuon: formats,
    _soCot: soCotThat,

    /** Chỉ dùng trong phép kiểm: đặt lại lưới để dựng đúng hoàn cảnh sheet chật. */
    _datLuoi(rows, cols) {
      maxRows = rows;
      if (cols !== undefined) { maxCols = cols; }
      return sheet;
    }
  };

  return sheet;
}

/**
 * Dựng một tệp giả kèm bộ đếm lệnh gọi.
 *
 * `getActiveSpreadsheet` cố ý **ném lỗi**, mô phỏng đường chạy khi không có ai ngồi trước máy — đúng đường mà `shinOpenBook` phải đi được, và cũng là đường đã từng làm lộ ra lỗi "reading from storage ... NOT_FOUND". `openById` thì trả về tệp giả bất kể ID, nên cổng chặn chạy nhầm tệp không được kiểm ở đây; nó chỉ kiểm được trên Google, nơi có tệp thật để mà nhầm.
 */
function taoBook(tenSheets) {
  const dem = { setValues: 0, deleteRows: 0, insertSheet: 0, insertRows: 0, setNumberFormat: 0 };
  const sheets = {};

  (tenSheets || []).forEach((ten) => { sheets[ten] = taoSheet(ten, dem); });

  const book = {
    getId: () => 'tep-gia-trong-bo-nho',
    getName: () => 'ShinCRM (tệp giả)',

    /**
     * Múi giờ tệp. Trả về đúng múi giờ Việt Nam vì đó là múi giờ tệp thật, và vì đường đọc bản ghi truyền giá trị này xuống `dateToText`.
     *
     * Giới hạn phải biết, và nó thuộc về `Utilities.formatDate` giả chứ không thuộc về đây: hàm giả đó **bỏ qua** tham số múi giờ. Nên phép kiểm offline chỉ chứng minh được rằng chuỗi múi giờ được truyền qua đúng đường, chứ không chứng minh được giờ in ra là giờ Việt Nam. Câu hỏi sau chỉ trả lời được bằng `probeDateText` trên Google.
     */
    getSpreadsheetTimeZone: () => 'Asia/Ho_Chi_Minh',

    getSheetByName: (ten) => sheets[ten] || null,
    getSheets: () => Object.keys(sheets).map((ten) => sheets[ten]),
    insertSheet(ten) {
      sheets[ten] = taoSheet(ten, dem);
      dem.insertSheet += 1;
      return sheets[ten];
    },
    deleteSheet(sheet) { delete sheets[sheet.getName()]; return book; },
    _dem: dem
  };

  const SpreadsheetApp = {
    getActiveSpreadsheet() {
      throw new Error('Tệp giả: không có tệp đang mở, đúng như lúc chạy không có ai ngồi trước máy.');
    },
    openById: () => book,
    flush: () => undefined
  };

  return { book: book, SpreadsheetApp: SpreadsheetApp, dem: dem };
}

module.exports = { taoSheet, taoBook };
