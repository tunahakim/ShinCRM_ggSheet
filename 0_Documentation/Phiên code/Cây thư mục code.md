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
- **Tên tệp trên Google là cả đường dẫn**: `server/log/LogGate.js` ở máy thành tệp tên `server/log/LogGate` trên Google. Nên `include()` và `createTemplateFromFile()` phải nhận tên đầy đủ — `include('client/style/tokens')`, không phải `include('tokens')`.
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
│   ├── sheet\                    Mọi tệp chạm SpreadsheetApp. Ranh giới quan trọng nhất của cây này: tệp trong đây phải nghiệm thu trên Google, tệp ngoài đây kiểm được offline.
│   │   ├── Book.js               Mở đúng tệp Sheet. Tách riêng vì đường mở khi có người ngồi trước máy khác đường mở lúc chạy tự động.
│   │   ├── SheetIo.js            Đọc hàng 1 thành bảng tra "mã cột → số cột". Mọi thao tác cột đi qua đây, không ai được đếm cột bằng tay.
│   │   ├── SheetGrid.js          Sự thật về lưới: đếm hàng dữ liệu, đọc một khối ô, nới lưới trước khi ghi. Ra đời từ lỗi thật làm sheet Log co xuống 7 hàng rồi tắt log trong im lặng.
│   │   ├── CellBudget.js         Đo tổng số ô cả tệp và so với trần ở Config. Vượt trần thì chặn hẳn lượt nạp, kèm bảng chỉ mặt sheet nào phình to.
│   │   ├── EntityRead.js         Đọc bản ghi Customer và Activity ra dạng { fields, rows, rowIndexes } truyền được sang client. Bỏ hàng không có mã và đếm số hàng đã bỏ.
│   │   ├── CategoryRead.js       Đọc sheet Category thành "mã danh mục → danh sách giá trị". Biết loại cột đi kèm _FBM mà không loại nhầm @CAT_CHO_PHEP_FBM.
│   │   ├── ConfigRead.js         Đọc bốn khối còn lại của sheet Config. Khóa trùng thì ném lỗi; riêng khối sắp xếp thì thứ tự hàng mang nghĩa nên đọc theo đường khác.
│   │   └── SetupSheets.js        Dựng và kiểm khung năm sheet từ hai tệp khai ở data\. Chạy được nhiều lần, không phá dữ liệu đang có.
│   ├── util\
│   │   ├── DateText.js           Biên giới duy nhất giữa Date và hai dạng chuỗi thời gian của dự án. google.script.run không mang Date qua được, nên mọi mốc thời gian đi đường chuỗi.
│   │   └── TextNormalize.js      Chuẩn hóa văn bản trước khi so sánh. Có một bản sinh đôi ở client\util\ — hai bản phải giống nhau từng dòng.
│   ├── state\
│   │   └── DirtyState.js         Cờ "sheet đã lệch so với RAM", giữ ở DocumentProperties. Đọc không bao giờ ném lỗi, vì nó đi kèm mọi lượt trả về.
│   ├── service\
│   │   └── LoadService.js        Gom cả một lượt nạp: đo ngân sách ô, đọc tham số, danh mục, toàn bộ khách, rồi giao dịch theo gói.
│   ├── log\
│   │   ├── LogGate.js            Cửa ghi log: gom dòng trong RAM, ghi xuống sheet Log bằng đúng một lệnh, che bí mật, cắt log theo hai trần.
│   │   └── ClientTiming.js       Cửa nhận bản đo thời gian ĐO Ở TRÌNH DUYỆT rồi ghi một dòng. Máy chủ không tự thấy tiền đi đường, nên số này phải do client gửi. Không tin số client: kẹp trần, bỏ khóa lạ.
│   ├── entry\                    Cửa vào hệ thống, và nửa đưa lỗi tới mắt người.
│   │   ├── EntryPoint.js         Vỏ bọc runEntryPoint: ghi log kèm vết, báo cho người dùng, ném lại lỗi, và luôn xả bộ đệm log ở finally.
│   │   ├── ErrorReport.js        Đưa lỗi tới mắt người theo bốn kênh. Lỗi ở onOpen thì để dành, hiện ở lần mở sidebar sau.
│   │   └── Menu.js               onOpen, menu ShinCRM và lệnh mở sidebar. Mọi việc của nó đi qua getUi và HtmlService nên không kiểm offline được.
│   └── dev\                      CHỈ DÙNG LÚC PHÁT TRIỂN — xóa cả thư mục này trước khi Sheet mang dữ liệu khách hàng thật.
│       ├── DevRunner.js          Cửa web chạy một hàm trong danh sách trắng. Mở một địa chỉ chạy code dưới quyền chủ tệp.
│       ├── DevToken.js           Thẻ bí mật của cửa trên. Không vào git, nhưng CÓ đẩy lên Google.
│       ├── Smoke.js              Phép thử nhanh: mở được tệp Sheet không, đọc được gì.
│       ├── DumpGrid.js           Đo lưới từng sheet: bao nhiêu hàng, bao nhiêu cột, còn chỗ ghi thêm bao nhiêu hàng.
│       ├── MeasureLog.js         Đo chi phí thật của deleteRows trên sheet Log lớn. Con số trong tài liệu 10 đến từ đây.
│       ├── MeasureChunk.js       Đo đường nạp trên dữ liệu đang có, không ghi ô nào: measureFirstPaint đo thời gian tới khung hình đầu, measureChunkRows so các cỡ gói.
│       └── SeedFake.js           Sinh dữ liệu giả cho Customer, Activity, Category và ĐỂ LẠI trên sheet để mở ra xem được. Mọi cột @ lõi khai đều có giá trị. Xóa bằng wipeFakeData.
│
├── client\                       Code chạy trong sidebar. Tệp .html bọc thẻ <script>, hoặc bọc thẻ <style> nếu là tệp chỉ có CSS.
│   │                             Thư mục con chia theo MỤC ĐÍCH, không chia theo đuôi thẻ.
│   ├── Sidebar.html              Trang gốc của sidebar: nhúng mọi tệp client theo đúng thứ tự rồi gọi lượt nạp đầu tiên.
│   ├── ram\                      Kho dữ liệu trong RAM của sidebar, và đường nhận dữ liệu từ máy chủ.
│   │   ├── store.html            Kho runtime cùng bảy đường tra duy nhất được chạm vào nó. Không đường nào nhận tham số chế độ xem.
│   │   ├── ingest.html           Chỗ DUY NHẤT biết hình dạng đường truyền { fields, rows }. Bung thành object đúng một lần ở đây.
│   │   └── bootstrap.html        Trình tự khởi động: nạp lõi, hiện màn hình, rồi nạp giao dịch theo gói ở phía sau.
│   ├── schema\
│   │   ├── schemaAccess.html     Cửa tra bảng khai bên client. Hỏi tên trường không có thì ném lỗi kèm gợi ý tên gần đúng, không trả về undefined.
│   │   └── schemaCheck.html      Phép tự kiểm bảng khai cột, chạy được ở cả hai phía.
│   ├── style\                    Hình thức DÙNG CHUNG cho mọi màn. Chỉ có <style>, không khai tên JavaScript nào.
│   │   ├── tokens.html           Khối biến CSS: màu, cỡ chữ, khoảng cách. Đổi diện mạo thì vào đây.
│   │   └── frame.html            Bố cục năm vùng: thanh trên, vạch tiến trình, khối thông tin, thân cuộn, chân trang.
│   ├── ui\                       Bộ máy giao diện màn nào cũng gọi được. spatialConfig giữ toàn quyền về khoảng cách.
│   │   ├── progress.html         Vạch tiến trình cho mọi lượt gọi máy chủ. Đếm số lời gọi đang chờ, không giữ một cờ bật tắt.
│   │   ├── uiBuilder.html        Hình dạng MỘT node Block, và sáu hàm dựng Card/Row/Text/Field/Button/Icon. Khóa lạ bị ném lỗi — đó là cách luật "không có style tự do" thành thật.
│   │   └── screenBuild.html      Lối viết tắt của UI_SCHEMA thành cây Block: mảng lồng mảng, chuỗi trần thay cho object, cụm group/rows. Không chạm DOM nên kiểm được offline.
│   ├── screen\                   Một tệp một màn người dùng nhìn thấy. Màn được mang theo style riêng, vì style đó chết cùng màn đó.
│   │   └── statusScreen.html     Ba màn không có form: tóm tắt lượt nạp, lỗi nạp, và màn chặn khi vượt trần ngân sách ô.
│   └── util\
│       ├── serverCall.html       Bọc google.script.run thành Promise kèm vạch tiến trình. Cửa duy nhất thấy cả hai đầu một vòng gọi, nên phép đo thời gian cũng ở đây. Cố ý KHÔNG tự hiện lỗi — việc đó của bên gọi.
│       ├── callTiming.html       Sổ đo từng vòng gọi. Tách tổng thời gian thành ba phần: máy chủ tính toán, tiền đi đường, trình duyệt bung và vẽ.
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
│   ├── dung-hop.js               Dựng sẵn hộp cát kèm sheet giả và hàm ghi ô theo mã cột. Nơi duy nhất giữ danh sách đường dẫn tệp máy chủ.
│   ├── dung-client.js            Hộp cát RIÊNG cho tệp client. Riêng vì server và client có hàm sinh đôi cùng tên, chung hộp thì bản nạp sau đè bản nạp trước.
│   └── strip-comments.js         Bỏ chú thích trước khi quét mã, để docstring được phép nhắc tên mà mã thì không.
└── cases\
    ├── textNormalize.js          Hai bản sinh đôi server và client cho cùng kết quả trên một bảng ca dùng chung.
    ├── schemaCheck.js            Bảng khai cột tự nhất quán, và chiều phụ thuộc một hướng với SYNC_SCHEMA.
    ├── namespace.js              Không tên nào khai ở hai tệp. Bẫy số một của Apps Script.
    ├── settings.js               SETTINGS và khối tham số Config, kể cả ca sheet chưa có dòng nào.
    ├── logMask.js                Luật che bí mật. Sai một lần là bí mật ra sheet, không thu lại được.
    ├── logGate.js                Kỷ luật bộ đệm, "cả lượt một lệnh ghi", và hai trần cắt log.
    ├── dateText.js               Hai dạng chuỗi thời gian, và ba luật im lặng khi sai: ô rỗng, ô gõ lạ, precision gõ sai.
    ├── sheetGrid.js              Lưới là hữu hạn, setValues không tự nới, và ca rỗng là ca thường xuyên chứ không phải ngoại lệ.
    ├── cellBudget.js             Cái bẫy gõ "500.000" thành 500, và bảng thủ phạm phải sắp giảm dần.
    ├── entityRead.js             Tra cột theo mã chứ không theo thứ tự, hàng trắng bị đếm, và không giá trị nào còn là Date.
    ├── categoryRead.js           Cái bẫy @CAT_CHO_PHEP_FBM, và mọi trường SELECT đều tìm được danh mục của mình.
    ├── configRead.js             Khóa trùng thì chặn, còn khối sắp xếp thì thứ tự hàng là nghĩa.
    ├── dirtyState.js             Khối trạng thái bẩn KHÔNG BAO GIỜ được ném, kể cả khi tệp thuộc tính hỏng hoặc đọc dở dang.
    ├── schemaAccess.js           Cửa đọc bảng khai: tên gõ sai nổ ngay kèm gợi ý, còn tên máy như toJSON thì phải đi qua.
    ├── loadService.js            Hình dạng gói loadCore, đường chặn vì ngân sách ô, và con trỏ gói giao dịch đi ngược từ hàng cuối.
    ├── ramStore.js               NGHIỆM THU CHẶNG 1.2: hai hộp cát, dữ liệu đi qua cầu google.script.run thật, và ba luật tra cứu khác nhau của Store.
    ├── callTiming.js             Phép trừ "client đo được trừ máy chủ báo". Sai chỗ này thì tiền đi đường hiện ra sai, và cỡ gói bị chọn theo một con số bịa.
    └── uiBuilder.js              Cây Block và lối viết tắt của UI_SCHEMA. Phần đáng kiểm không phải "dựng đúng thì ra đúng" mà "dựng sai thì có chặn không".
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
| `server/LoadService.gs` | `server/service/LoadService.js` |
| `server/DirtyState.gs` | `server/state/DirtyState.js` |
| `client/util/textNormalize.js` | `client/util/textNormalize.html` |
| `client/ram/store.js` | `client/ram/store.html` |
| `client/ram/ingest.js` | `client/ram/ingest.html` |
| `client/schema/schemaAccess.js` | `client/schema/schemaAccess.html` |
| `client/ui/styles.html` | `client/style/tokens.html` + `client/style/frame.html` |
| `client/ui/tokens.html` | `client/style/tokens.html` |
| `client/ui/frame.html` | `client/style/frame.html` |

Tám tệp máy chủ dựng ở chặng 1.1 và 1.2 không có trong bảng này vì tài liệu thiết kế không đặt tên cho chúng: `SheetGrid.js`, `CellBudget.js`, `EntityRead.js`, `CategoryRead.js`, `ConfigRead.js`, `DateText.js`, `EntryPoint.js`, `ErrorReport.js`. Tài liệu nói *phải làm gì* ở các phần tương ứng, còn việc gom mỗi luật vào một tệp là quyết định của phiên code — nên chỗ tra chúng là cây thư mục ở trên, không phải bảng này.

Bốn dòng `client/...js` lệch vì một lý do khác hẳn các dòng trên, đã ghi ở tài liệu làm việc `Mục tiêu chặng 1.1 và 1.2.md`: **mọi** tệp client trên Apps Script buộc phải là `.html`, không phải `.js` như tài liệu 04 Phần 10 và 05 Phần 13 viết.

Ba dòng cuối lệch vì thư mục: tài liệu 04 gom cả CSS vào `client/ui/`, còn code chia `client/style/` cho hình thức dùng chung, `client/ui/` cho bộ máy giao diện, `client/screen/` cho từng màn. Chủ dự án chốt cách chia này 05/09/2026 và tài liệu 04 Phần 10 đã sửa theo.

## Thư mục sẽ dựng ở các chặng tới

Ghi ra đây để chỗ đặt tệp mới là điều đã quyết trước, không phải điều quyết lúc đang gấp.

```
server\gate\                      Các cửa ghi có kỷ luật: WriteGate, IdGate, DeleteGate — cùng họ với LogGate.
server\view\                      Dựng sheet quản lý: đọc bộ lọc, sắp xếp, vẽ lại vùng dữ liệu.
client\save\                      Đường lưu: gom dữ liệu form, gọi máy chủ, hoàn tác.
```

Biểu mẫu **không** có thư mục riêng: bộ máy dựng form là `client\ui\` (uiBuilder, renderEngine, actions, slots), bảng khai form là `client\schema\` (uiSchema, fieldLogic), và mỗi màn có form là một tệp trong `client\screen\`.
