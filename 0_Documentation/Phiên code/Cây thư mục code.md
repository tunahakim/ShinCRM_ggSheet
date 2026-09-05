# Cây thư mục code ShinCRM

Tệp này là bản đồ để chủ dự án soát: **mỗi tệp code có một dòng nói nó làm gì**. Nó không thay tài liệu thiết kế — tài liệu nói *phải làm gì*, tệp này nói *thứ đó đang nằm ở đâu*.

Luật giữ tệp này đúng: dựng thêm một tệp hoặc một thư mục thì thêm ngay một dòng vào đây trong cùng lượt làm việc. Một bản đồ sai còn tệ hơn không có bản đồ, vì người đọc tin nó.

## Nguyên tắc chia thư mục

Chia theo **việc tệp đó làm**, không chia theo chặng làm ra nó và không chia theo loại dữ liệu nó chạm tới. Ba câu hỏi khi đặt một tệp mới:

1. Tệp này có chạm `SpreadsheetApp` không? Có thì nó thuộc `sheet/`. Đây là ranh giới quan trọng nhất: hàm không chạm sheet thì kiểm offline được, hàm chạm sheet thì phải nghiệm thu trên Google.
2. Tệp này chỉ khai dữ liệu, hay có xử lý? Chỉ khai thì thuộc `data/`.
3. Tệp này có được phép còn tồn tại khi Sheet mang dữ liệu khách hàng không? Không thì nó thuộc `server/dev/`.

Một tệp làm đúng một việc. Vượt quá khoảng 250 dòng thì đọc lại nó — thường là dấu hiệu nó đang làm hai việc, chứ không phải dấu hiệu phải chẻ bừa làm hai.

## Toàn cảnh

```
D:\ShinCRM_ggSheet\
├── CLAUDE.md                     Luật làm việc giữa chủ dự án và AI. Đọc trước mọi thứ khác.
├── README.md                     Giới thiệu dự án.
├── 0_Documentation\              Tài liệu thiết kế. Nguồn sự thật của mọi dòng code.
├── 1_ShinCRM_GAS\                Code Apps Script — thứ được đẩy lên Google bằng clasp.
├── 2_ShinCRM_Extension\          Code Chrome Extension (chặng sau, chưa dựng).
├── 9_Code_cu_tham_chieu\         Code MiniCRM cũ, CHỈ để tra cứu. Không sửa một dòng nào.
└── tests\                        Bộ kiểm chạy bằng Node trên máy. Không đẩy lên Google.
```

## 1_ShinCRM_GAS — code chạy trên Google

Ba điều phải biết về thư mục này, cả ba đều đã từng gây lỗi thật:

- Tệp `.js` ở máy, đẩy lên Google thành `.gs`. Tệp client phải là `.html` bọc thẻ `<script>`.
- **Tên tệp trên Google là cả đường dẫn**: `server/log/LogGate.js` ở máy thành tệp tên `server/log/LogGate` trên Google. Nên `include()` và `createTemplateFromFile()` phải nhận tên đầy đủ — `include('client/ui/styles')`, không phải `include('styles')`.
- Apps Script **không có `import`**. Mọi tệp máy chủ dùng chung một vùng tên toàn cục, nên hai tệp khai trùng một tên thì bản nạp sau lặng lẽ thắng. Thư mục ở đây là để người đọc tìm được việc, không phải để máy ngăn cách.

```
1_ShinCRM_GAS\
├── appsscript.json               Khai múi giờ, phiên bản runtime, quyền của script.
├── .clasp.json                   Trỏ tới dự án Apps Script nào, khai đuôi tệp nào được đẩy.
├── .claspignore                  Tệp KHÔNG đẩy lên Google. Chặn đường bí mật lên Google.
│                                 (Ba tệp .dev-token, .dev-runner.json, creds.json cũng nằm ở đây nhưng chỉ có trên máy — chúng chứa thẻ và khóa nên bị .gitignore chặn, không vào git.)
│
├── server\                       Code chạy phía Google, không có DOM, không thấy trang web.
│   ├── config\
│   │   └── Settings.js           Hằng số phía code (SETTINGS) và khối tham số hệ thống của sheet Config. Nơi duy nhất biết LOG_TRACE đang bật cho nguồn nào.
│   ├── data\
│   │   ├── DataSchema.js         Khai 33 cột dữ liệu người dùng: mã cột, nhãn, kiểu, ràng buộc. Nguồn sự thật của hàng 1.
│   │   └── SheetLayout.js        Khai khung năm sheet: mấy hàng tiêu đề, dữ liệu bắt đầu từ hàng nào, màu tiêu đề, tiêu đề sheet Log.
│   ├── sheet\
│   │   ├── Book.js               Mở đúng tệp Sheet. Tách riêng vì đường mở khi có người ngồi trước máy khác đường mở lúc chạy tự động.
│   │   ├── SheetIo.js            Đọc hàng 1 thành bảng tra "mã cột → số cột". Mọi thao tác cột đi qua đây, không ai được đếm cột bằng tay.
│   │   └── SetupSheets.js        Dựng và kiểm khung năm sheet từ hai tệp khai ở data\. Chạy được nhiều lần, không phá dữ liệu đang có.
│   ├── util\
│   │   └── TextNormalize.js      Chuẩn hóa văn bản trước khi so sánh. Có một bản sinh đôi ở client\util\ — hai bản phải giống nhau từng dòng.
│   ├── log\
│   │   └── LogGate.js            Cửa ghi log: gom dòng trong RAM, ghi xuống sheet Log bằng đúng một lệnh, che bí mật, cắt log theo hai trần.
│   └── dev\                      CHỈ DÙNG LÚC PHÁT TRIỂN — xóa cả thư mục này trước khi Sheet mang dữ liệu khách hàng thật.
│       ├── DevRunner.js          Cửa web chạy một hàm trong danh sách trắng. Mở một địa chỉ chạy code dưới quyền chủ tệp.
│       ├── DevToken.js           Thẻ bí mật của cửa trên. Không vào git, nhưng CÓ đẩy lên Google.
│       ├── Smoke.js              Phép thử nhanh: mở được tệp Sheet không, đọc được gì.
│       ├── DumpGrid.js           Đo lưới từng sheet: bao nhiêu hàng, bao nhiêu cột, còn chỗ ghi thêm bao nhiêu hàng.
│       └── MeasureLog.js         Đo chi phí thật của deleteRows trên sheet Log lớn. Con số trong tài liệu 10 đến từ đây.
│
├── client\                       Code chạy trong sidebar, tệp .html bọc thẻ <script>.
│   ├── schema\
│   │   └── schemaCheck.html      Phép tự kiểm bảng khai cột, chạy được ở cả hai phía.
│   └── util\
│       └── textNormalize.html    Bản sinh đôi client của server\util\TextNormalize.js. [RÀNG BUỘC CỨNG] hai bản phải giống nhau.
│
└── fbm_sync\                     Module đồng bộ FBM. Đọc được DATA_SCHEMA; phần lõi TUYỆT ĐỐI không đọc ngược vào đây.
    └── SyncSchema.js             Khai 8 cột thuần đồng bộ. Tám cột này không được xuất hiện trong DATA_SCHEMA.
```

## tests — bộ kiểm chạy trên máy

Không đẩy lên Google. Nó nạp chính tệp code thật vào một hộp cát của Node rồi gọi hàm thật, nên nó kiểm code đang chạy chứ không kiểm một bản chép lại.

Giới hạn phải biết: xanh ở đây nghĩa là **logic đúng**, không có nghĩa là chạy được trên Google. Lời cuối vẫn thuộc về `node tests/gas.js <tên hàm>`.

```
tests\
├── run.js                        Chạy cả bộ. Thêm chủ đề mới thì thêm một tệp vào cases\ và một dòng vào đây.
├── check-sheet.js                Đối chiếu hàng 1 của tệp Sheet thật với bảng khai. Cần mạng.
├── gas.js                        Chạy một hàm thật trên Google qua cửa DevRunner. Cần mạng.
├── lib\
│   ├── assert.js                 Các phép so và bộ đếm đạt/trượt.
│   ├── load-gas.js               Nạp tệp .js và .html thật vào hộp cát vm, dựng lại vùng tên chung của Apps Script.
│   ├── fake-sheet.js             Tệp Sheet giả trong RAM, TỰ ĐẾM số lệnh setValues và deleteRows.
│   ├── gas-stubs.js              Utilities, Logger, PropertiesService, console giả — vừa đủ phần mà code gọi tới.
│   ├── dung-hop.js               Dựng sẵn hộp cát kèm sheet giả. Nơi duy nhất giữ danh sách đường dẫn tệp máy chủ.
│   └── strip-comments.js         Bỏ chú thích trước khi quét mã, để docstring được phép nhắc tên mà mã thì không.
└── cases\
    ├── textNormalize.js          Hai bản sinh đôi server và client cho cùng kết quả trên một bảng ca dùng chung.
    ├── schemaCheck.js            Bảng khai cột tự nhất quán, và chiều phụ thuộc một hướng với SYNC_SCHEMA.
    ├── namespace.js              Không tên nào khai ở hai tệp. Bẫy số một của Apps Script.
    ├── settings.js               SETTINGS và khối tham số Config, kể cả ca sheet chưa có dòng nào.
    ├── logMask.js                Luật che bí mật. Sai một lần là bí mật ra sheet, không thu lại được.
    └── logGate.js                Kỷ luật bộ đệm, "cả lượt một lệnh ghi", và hai trần cắt log.
```

## Bảng tra: tên trong tài liệu thiết kế → tệp thật

Tài liệu thiết kế viết trước khi có thư mục con, nên chúng gọi tệp bằng tên phẳng: `server/Settings.gs`, `server/LogGate.gs`. Code thật đã chia thư mục. Bảng này để đi từ tài liệu sang code mà không phải dò.

Không sửa tên trong tài liệu thiết kế vì hai lẽ: chúng là bản đã chốt, và sửa 19 tệp để đổi một cột tên tệp là mở đường cho lỗi sao chép ở những chỗ không ai kiểm. Chỗ cần khớp chỉ là một bảng, và nó ở đây.

| Tài liệu viết | Tệp thật |
|---|---|
| `server/Settings.gs` | `server/config/Settings.js` |
| `server/DataSchema.gs` | `server/data/DataSchema.js` |
| `server/SheetLayout.gs` | `server/data/SheetLayout.js` |
| `server/SheetIo.gs` | `server/sheet/SheetIo.js` |
| `server/TextNormalize.gs` | `server/util/TextNormalize.js` |
| `server/LogGate.gs` | `server/log/LogGate.js` |
| `client/util/textNormalize.js` | `client/util/textNormalize.html` |

Dòng cuối lệch vì một lý do khác hẳn các dòng trên, đã ghi ở tài liệu làm việc `Mục tiêu chặng 1.1 và 1.2.md`: tệp client trên Apps Script buộc phải là `.html`, không phải `.js` như tài liệu 04 Phần 10 viết.

## Thư mục sẽ dựng ở các chặng tới

Ghi ra đây để chỗ đặt tệp mới là điều đã quyết trước, không phải điều quyết lúc đang gấp.

```
server\service\                   Đường nghiệp vụ: nạp dữ liệu lên RAM, lưu, sửa, xóa, hoàn tác.
server\gate\                      Các cửa ghi có kỷ luật: WriteGate, IdGate, DeleteGate — cùng họ với LogGate.
server\entry\                     Cửa vào: onOpen, menu, mở sidebar, runEntryPoint và nửa báo lỗi tới mắt người.
client\ui\                        Khung sidebar, khối biến CSS, biểu tượng SVG. spatialConfig giữ toàn quyền về khoảng cách.
client\ram\                       Kho dữ liệu trong RAM của sidebar và đường nhận dữ liệu từ máy chủ.
client\form\                      Dựng biểu mẫu từ bảng khai cột.
```
