/**
 * Bản xem sidebar ngay tại máy: gộp `client/Sidebar.html` thành một tệp mở được bằng trình duyệt, cắm bản giả của `google.script.run`, rồi ép khung về 300 pixel đúng bằng sidebar thật của Google Sheets.
 *
 * Vì sao có tệp này: mỗi lần xin ảnh chụp màn hình là tiêu một lượt chờ của chủ dự án. Tệp này đổi vòng lặp sửa bố cục từ một-vòng-một-lượt-chờ thành một-vòng-vài-giây.
 *
 * Gói dữ liệu do hộp cát máy chủ của bộ kiểm tự sinh rồi chạy `loadCore()` thật trên đó. Không cần mạng, không cần hàm dò trong `server/dev/`, không một ô nào của khách thật rời khỏi Google. Đổi lại là chuỗi bịa, nên tên công ty và ghi chú dưới đây viết dài đúng cỡ dữ liệu thật để chỗ vỡ bố cục và phép thu gọn vẫn lộ ra.
 *
 * Bốn chỗ tệp này KHÔNG nói được, nên nó không thay được mắt chủ dự án ở lượt nghiệm thu: CSS riêng Google nhét vào iframe sidebar, phông chữ trên máy khác, độ trễ thật của `google.script.run`, và đường bị chặn vì trần ngân sách ô.
 *
 * Chạy `node tests/preview.js` rồi mở tệp nó in ra.
 */

const fs = require('fs');
const path = require('path');
const { dungHop, ghiO } = require('./lib/dung-hop');
const { formatDateGia } = require('./lib/gas-stubs');

const GAS_DIR = path.join(__dirname, '..', '1_ShinCRM_GAS');
const TEP_RA = path.join(__dirname, 'xem-sidebar.html');

/** Độ trễ giả của mỗi vòng gọi máy chủ, tính bằng phần nghìn giây. Để dải tiến trình kịp hiện ra chứ không nháy một cái rồi tắt. */
const TRE_GIA = 140;

/** Danh mục cho các trường SELECT. Thiếu một mã ở đây thì ô chọn tương ứng rỗng, nên bảng này phải phủ hết `source` của `DATA_SCHEMA`. */
const DANH_MUC = {
  '@CAT_TINH_THANH': ['Hà Nội', 'Hồ Chí Minh', 'Đà Nẵng', 'Bình Dương', 'Hải Phòng', 'Bắc Ninh'],
  '@CAT_NHOM_KH': ['Nhà thầu chính', 'Nhà thầu phụ', 'Chủ đầu tư', 'Đại lý phân phối'],
  '@CAT_SAN_PHAM': ['Thép hình H', 'Thép tấm cán nóng', 'Tôn mạ kẽm', 'Ống thép đúc'],
  '@CAT_NGUON_KH': ['Facebook Marketplace', 'Khách giới thiệu', 'Tự tìm', 'Hội chợ triển lãm'],
  '@CAT_XAC_THUC': ['Đã xác thực', 'Chưa xác thực', 'Nghi ngờ trùng'],
  '@CAT_CHO_PHEP_FBM': ['Có', 'Không'],
  '@CAT_CONG_VIEC': ['Gọi điện', 'Gửi báo giá', 'Gặp mặt tại công trình', 'Chốt hợp đồng', 'Chăm sóc lại'],
  '@CAT_UU_TIEN': ['Cao', 'Trung bình', 'Thấp'],
  '@CAT_NGUOI_NHAP_LIEU': ['Tuấn', 'Hà', 'Minh']
};

/** Ghi chú dài hơn ba dòng ở bề rộng 300 pixel — khách này PHẢI có nút "Xem thêm" trên card ghi chú. */
const GHI_CHU_DAI = 'Khách quen từ 2023, thanh toán chậm trung bình 20 ngày nhưng chưa lần nào mất. Anh Dũng phụ trách mua hàng, chỉ nghe điện thoại sau 17h vì ban ngày ở công trình. Đợt tháng 3 có khiếu nại về dung sai thép tấm, đã xử lý bằng cách đổi lô, nhớ nhắc kỹ thuật kiểm trước khi giao. Đang hỏi báo giá cho gói thầu Vinhomes giai đoạn 2, dự kiến chốt trong tháng 10.';

/** Ghi chú gọn trong một dòng — khách này PHẢI KHÔNG có nút nào. `[RÀNG BUỘC CỨNG]` tài liệu 04 Phần 5. */
const GHI_CHU_NGAN = 'Chỉ mua lẻ, gọi trước khi giao.';

/** Mười hai khách. Tên công ty và địa chỉ để dài đúng cỡ thật, vì 300 pixel là hẹp và hai chỗ đó vỡ trước tiên. */
const KHACH = [
  { companyName: 'Công ty Cổ phần Xây dựng và Thương mại Đông Á Hà Nội', taxNumber: '0101234567', phone: '0912345678', email: 'muahang@dongahanoi.vn', address: 'Tầng 12 Tòa nhà Sông Đà, 165 Cầu Giấy, Phường Dịch Vọng, Quận Cầu Giấy', province: 'Hà Nội', website: 'dongahanoi.vn', contactPerson: 'Nguyễn Tiến Dũng', customerGroup: 'Nhà thầu chính', product: 'Thép hình H', leadSource: 'Facebook Marketplace', verifyStatus: 'Đã xác thực', note: GHI_CHU_DAI, searchAliases: 'dong a xd hn' },
  { companyName: 'Công ty TNHH Thương mại Hải Phòng Phát', taxNumber: '0201112223', phone: '0225830111', address: '48 Lê Lợi, Quận Ngô Quyền', province: 'Hải Phòng', contactPerson: 'Trần Thị Hà', customerGroup: 'Đại lý phân phối', product: 'Tôn mạ kẽm', leadSource: 'Khách giới thiệu', verifyStatus: 'Đã xác thực', note: GHI_CHU_NGAN },
  { companyName: 'Tổng Công ty Đầu tư Phát triển Hạ tầng Đô thị Bình Dương', taxNumber: '3700998877', phone: '0274222333', address: 'Số 1 Đại lộ Bình Dương, Phường Phú Hòa, Thành phố Thủ Dầu Một', province: 'Bình Dương', contactPerson: 'Lê Quốc Minh', customerGroup: 'Chủ đầu tư', product: 'Thép tấm cán nóng', leadSource: 'Hội chợ triển lãm', verifyStatus: 'Chưa xác thực' },
  { companyName: 'Công ty Cơ khí Đà Nẵng', taxNumber: '0400556677', phone: '0236388999', address: '12 Nguyễn Văn Linh', province: 'Đà Nẵng', contactPerson: 'Phạm Văn Sơn', product: 'Ống thép đúc', leadSource: 'Tự tìm', verifyStatus: 'Đã xác thực', note: 'Đã ký khung năm 2026, chiết khấu 3%.' },
  { companyName: 'Công ty TNHH Một thành viên Kết cấu Thép Bắc Ninh Số 2', taxNumber: '2300445566', phone: '0222765432', address: 'Lô CN4 Khu công nghiệp Quế Võ, Phường Vân Dương', province: 'Bắc Ninh', contactPerson: 'Đỗ Thu Trang', customerGroup: 'Nhà thầu phụ', product: 'Thép hình H', leadSource: 'Facebook Marketplace', verifyStatus: 'Nghi ngờ trùng' },
  { companyName: 'Công ty Xây lắp Sài Gòn Thành Đạt', taxNumber: '0311223344', phone: '0283822111', address: '245 Nguyễn Thị Minh Khai, Phường 5, Quận 3', province: 'Hồ Chí Minh', contactPerson: 'Võ Hoàng Nam', customerGroup: 'Nhà thầu chính', product: 'Thép tấm cán nóng', leadSource: 'Khách giới thiệu', verifyStatus: 'Đã xác thực' },
  { companyName: 'Công ty Thép Việt Nhật', taxNumber: '0104445556', phone: '0243756111', province: 'Hà Nội', product: 'Tôn mạ kẽm', leadSource: 'Tự tìm', verifyStatus: 'Chưa xác thực' },
  { companyName: 'Công ty Cổ phần Bê tông và Xây dựng Hà Nội Mới', taxNumber: '0107778889', phone: '0938111222', address: 'Km 9 Đường Nguyễn Trãi, Quận Hà Đông', province: 'Hà Nội', contactPerson: 'Bùi Thanh Tùng', customerGroup: 'Nhà thầu chính', product: 'Thép hình H', leadSource: 'Hội chợ triển lãm', verifyStatus: 'Đã xác thực' },
  { companyName: 'Doanh nghiệp tư nhân Vật liệu Xây dựng Thủ Đức', taxNumber: '0312345678', phone: '0906778899', address: '78 Võ Văn Ngân, Phường Bình Thọ', province: 'Hồ Chí Minh', contactPerson: 'Ngô Thị Lan', product: 'Ống thép đúc', leadSource: 'Facebook Marketplace', verifyStatus: 'Đã xác thực' },
  { companyName: 'Công ty TNHH Xây dựng Đông Á Cũ — không dùng nữa', taxNumber: '0109999999', phone: '0900000000', province: 'Hà Nội', leadSource: 'Tự tìm', verifyStatus: 'Chưa xác thực', note: 'Trùng với Đông Á Hà Nội, đã gộp.', recordStatus: 'deleted' },
  { companyName: 'Công ty Cổ phần Đầu tư Xây dựng Cần Thơ', taxNumber: '1801112223', phone: '0292383777', address: '156 đường 30 Tháng 4, Phường Xuân Khánh', contactPerson: 'Huỳnh Văn Bảy', customerGroup: 'Chủ đầu tư', product: 'Thép tấm cán nóng', leadSource: 'Khách giới thiệu', verifyStatus: 'Đã xác thực' },
  { companyName: 'Công ty Thương mại Dịch vụ Kỹ thuật Toàn Cầu', taxNumber: '0313334445', phone: '0977123456', address: '90 Nguyễn Cơ Thạch, Phường An Lợi Đông', province: 'Hồ Chí Minh', contactPerson: 'Trịnh Đức Anh', customerGroup: 'Đại lý phân phối', product: 'Tôn mạ kẽm', leadSource: 'Tự tìm', verifyStatus: 'Đã xác thực' }
];

/** Nội dung giao dịch: bốn câu dài ngắn khác nhau, quay vòng. Câu dài để thấy dòng lịch sử xử lý chữ tràn thế nào. */
const NOI_DUNG = [
  'Gọi cho anh Dũng, chốt số lượng 42 tấn thép hình H200 giao đợt đầu vào ngày 18, đợt hai chờ mặt bằng công trình. Đã gửi lại báo giá có chiết khấu 2% qua Zalo.',
  'Gửi báo giá lần 2.',
  'Gặp tại công trình Vinhomes Ocean Park, khảo sát đường vào cho xe 20 tấn. Kết luận: xe không vào được cổng số 3, phải đổi sang cổng số 1 và giao trước 7h sáng.',
  'Khách hẹn gọi lại tuần sau, đang chờ chủ đầu tư giải ngân.'
];

/** Ghi một bản ghi vào sheet giả. Tra mã cột qua `DATA_SCHEMA` để tệp này không chốt cứng một mã `@` nào. */
function ghiBanGhi(nen, tenSheet, thucThe, hang, ban) {
  const khai = nen.hop.DATA_SCHEMA[thucThe];
  Object.keys(ban).forEach((ten) => {
    if (!khai[ten]) {
      throw new Error('DATA_SCHEMA.' + thucThe + ' không có trường "' + ten + '". Sửa bảng dữ liệu giả trong tests/preview.js.');
    }
    ghiO(nen, tenSheet, hang, khai[ten].code, ban[ten]);
  });
}

const ma = (tienTo, so) => tienTo + String(so).padStart(4, '0');

/** Dựng hộp cát máy chủ có đủ năm sheet và dữ liệu giả bên trong, để `loadCore` thật chạy được trên đó. */
function dungNen() {
  const homNay = formatDateGia(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  const nen = dungHop({ sheets: ['Customer', 'Activity', 'Category', 'Config', 'Log'], props: { LOG_LAST_CLEANUP: homNay } });
  const hangDau = nen.hop.SHEET_FIRST_DATA_ROW;

  Object.keys(DANH_MUC).forEach((maCot) => {
    DANH_MUC[maCot].forEach((giaTri, i) => { ghiO(nen, 'Category', hangDau + i, maCot, giaTri); });
  });

  KHACH.forEach((khach, i) => {
    ghiBanGhi(nen, 'Customer', 'customer', hangDau + i, Object.assign({
      id: ma('KH', i + 1),
      bidClosingDate: new Date(2026, 9, 5 + (i % 20)),
      createdAt: new Date(2026, 2, 1 + (i * 7) % 300),
      allowFbmPush: i % 4 === 3 ? 'Không' : 'Có',
      recordStatus: 'active'
    }, khach));
  });

  let hang = hangDau;
  let so = 0;
  KHACH.forEach((khach, iK) => {
    if (khach.recordStatus === 'deleted') { return; }
    const soDong = iK === 0 ? 12 : 4;

    for (let j = 0; j < soDong; j++) {
      so += 1;
      const ngay = new Date(2026, 7, 1 + (so * 3) % 35);
      ghiBanGhi(nen, 'Activity', 'activity', hang, {
        id: ma('GD', so),
        customerId: ma('KH', iK + 1),
        workDate: ngay,
        taskType: DANH_MUC['@CAT_CONG_VIEC'][so % 5],
        content: NOI_DUNG[so % NOI_DUNG.length],
        product: DANH_MUC['@CAT_SAN_PHAM'][so % 4],
        enteredBy: DANH_MUC['@CAT_NGUOI_NHAP_LIEU'][so % 3],
        contractValue: so % 3 === 0 ? so * 12500000 : '',
        priority: DANH_MUC['@CAT_UU_TIEN'][so % 3],
        dueAt: new Date(2026, 8, 1 + so % 20, 9, 30),
        createdAt: new Date(ngay.getFullYear(), ngay.getMonth(), ngay.getDate(), 8, 15),
        allowFbmPush: 'Có',
        recordStatus: iK === 0 && j % 5 === 4 ? 'deleted' : 'active'
      });
      hang += 1;
    }
  });

  return nen;
}

/** Cho một gói đi qua cầu `google.script.run` — chỗ mọi `Date` chết. Bản xem phải đi qua nó thật, vì sidebar thật cũng vậy. */
const quaCau = (goi) => JSON.parse(JSON.stringify(goi));

/** Cỡ gói giả, cố tình nhỏ để lượt xem sinh ra nhiều gói: vòng nạp nền và dòng "đang nạp giao dịch" mới chạy thật. */
const CO_GOI = 25;

/** Chạy `loadCore` rồi cả vòng gói `loadActivityChunk`, thu về đúng những gói mà sidebar thật sẽ nhận. */
function dungGoi(nen) {
  const core = quaCau(nen.hop.loadCore());
  if (core.blocked) {
    throw new Error('Hộp cát trả về đường bị chặn "' + core.blocked + '" — dữ liệu giả đang quá to cho trần ngân sách ô.');
  }

  const goiGd = [];
  let cursor = null;
  do {
    const goi = quaCau(nen.hop.loadActivityChunk(cursor, CO_GOI));
    goiGd.push(goi);
    cursor = goi.nextCursor;
    if (goiGd.length > 200) { throw new Error('Vòng nạp gói không dừng — con trỏ máy chủ giả không tiến.'); }
  } while (cursor);

  return { core: core, goiGd: goiGd };
}

/** Thay mỗi thẻ `<?!= include('X') ?>` bằng ruột tệp `X.html`. Đúng phép thay chuỗi mà `include()` ở `server/entry/Menu.js` làm trên Google, không dựng lại gì. */
function gopSidebar() {
  const goc = fs.readFileSync(path.join(GAS_DIR, 'client/Sidebar.html'), 'utf8');

  const ra = goc.replace(/<\?!=\s*include\(\s*'([^']+)'\s*\)\s*\?>/g, (_, duongDan) => {
    const tep = path.join(GAS_DIR, duongDan + '.html');
    if (!fs.existsSync(tep)) {
      throw new Error('Dòng include trỏ vào "' + duongDan + '" nhưng không có tệp đó — lỗi này làm chết sidebar thật trên Google.');
    }
    return fs.readFileSync(tep, 'utf8');
  });

  if (ra.indexOf('<?!=') !== -1) {
    throw new Error('Còn thẻ `<?!=` chưa thay trong bản gộp. Có dòng include viết khác lối `include(\'...\')`.');
  }
  return ra;
}

/** Nhúng JSON vào thẻ `<script>`: chỉ cần chặn `<` là đủ để một chuỗi dữ liệu không cắt được thẻ. */
const jsonNhung = (x) => JSON.stringify(x).replace(/</g, '\\u003c');

/** Bản giả của `google.script.run`, cắm ở đúng tầng đó chứ không thay `callServer` — để dải tiến trình và phép đo thời gian vẫn chạy nguyên đường của chúng. */
function banGia(goi) {
  return `<script>
/* Bản giả của google.script.run, chỉ có trong bản xem tại máy. */
(function () {
  var CORE = ${jsonNhung(goi.core)};
  var GOI_GD = ${jsonNhung(goi.goiGd)};
  var TRE = ${TRE_GIA};
  var prefs = JSON.parse(JSON.stringify(CORE.prefs || {}));
  var iGoi = 0;

  var HAM = {
    loadCore: function () { iGoi = 0; return CORE; },
    loadActivityChunk: function () {
      if (iGoi >= GOI_GD.length) { throw new Error('Bản xem chỉ có ' + GOI_GD.length + ' gói, sidebar xin gói thứ ' + (iGoi + 1) + '.'); }
      return GOI_GD[iGoi++];
    },
    userPrefsWrite: function (name, value) { prefs[name] = value; return { ok: true, prefs: prefs }; },
    logClientTiming: function () { return { ok: true }; }
  };

  function taoRunner() {
    var r = { _ok: null, _loi: null };
    r.withSuccessHandler = function (fn) { r._ok = fn; return r; };
    r.withFailureHandler = function (fn) { r._loi = fn; return r; };

    Object.keys(HAM).forEach(function (ten) {
      r[ten] = function () {
        var args = [].slice.call(arguments);
        setTimeout(function () {
          try { r._ok(HAM[ten].apply(null, args)); } catch (err) { r._loi(err); }
        }, TRE);
      };
    });
    return r;
  }

  window.google = { script: {} };
  Object.defineProperty(window.google.script, 'run', { get: taoRunner });
})();
</script>`;
}

/** Ép khung về 300 pixel: sidebar của Google Sheets rộng chừng đó và code không hề gọi `setWidth`, nên đó là bề rộng thật. Xem ở cửa sổ rộng hơn là xem một bố cục khác. */
const KHUNG_300 = `<style>
/* Chỉ có trong bản xem tại máy. Không tệp nào trong client/ biết tới nó.
   Cố tình không đặt display:flex lên body: làm vậy thì #sidebar-root thành mục con của flex và height:100% của frame.html hết tác dụng, khung cao bằng nội dung nên vùng thân không bao giờ cuộn và không soi được chân sidebar có ghim đáy hay không. Căn giữa bằng margin:0 auto để body vẫn là block đúng như trong iframe thật. */
html, body { background: #4b5563; }
#sidebar-root { width: 300px; margin: 0 auto; background: var(--shin-bg); box-shadow: 0 0 0 1px #111827; }
</style>`;

/** Máy chủ tĩnh một tệp, chỉ để trình duyệt mở được bản gộp. Mở thẳng bằng `file://` cũng chạy, nhưng có cổng thì công cụ chụp màn hình mới vào được. */
function moCong(cong) {
  require('http').createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(TEP_RA));
  }).listen(cong, () => console.log('  Đang mở ở http://localhost:' + cong));
}

function chay() {
  const nen = dungNen();
  const goi = dungGoi(nen);

  const html = gopSidebar()
    .replace('</head>', KHUNG_300 + '\n</head>')
    .replace('<body>', '<body>\n' + banGia(goi));

  fs.writeFileSync(TEP_RA, html, 'utf8');

  const soGd = goi.goiGd.reduce((tong, g) => tong + g.rows.length, 0);
  console.log('Đã ghi ' + TEP_RA);
  console.log('  ' + goi.core.customer.rows.length + ' khách, ' + soGd + ' giao dịch chia ' + goi.goiGd.length + ' gói, độ trễ giả ' + TRE_GIA + 'ms mỗi vòng gọi.');
  if ((goi.core.warnings || []).length) {
    console.log('  Cảnh báo từ loadCore: ' + goi.core.warnings.join(' | '));
  }

  if (process.argv.includes('--serve')) { moCong(4173); }
}

chay();
