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
├── .claude\launch.json           Khai một lệnh cho công cụ mở bản xem sidebar tại máy: node tests/preview.js --serve, cổng 4173.
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
│   │   ├── Settings.js           Hằng số phía code (SETTINGS) và khối tham số hệ thống của sheet Config. Nơi duy nhất biết LOG_TRACE đang bật cho nguồn nào.
│   │   └── ConfigParams.js       Danh mục núm vặn: có những tham số nào, mỗi tham số gõ giá trị gì là hợp lệ. Settings.js biết một tham số đang là bao nhiêu, tệp này biết có những tham số nào.
│   ├── data\
│   │   ├── DataSchema.js         Khai 33 cột dữ liệu người dùng: mã cột, nhãn, kiểu, ràng buộc. Nguồn sự thật của hàng 1.
│   │   ├── ColumnFormat.js       Khuôn hiển thị của từng cột, khai một chỗ cho cả SetupSheets và WriteGate dùng chung. Chống mất chữ số đầu của mã số thuế: `@` nghĩa là chữ, không phải số.
│   │   └── SheetLayout.js        Khai khung năm sheet: mấy hàng tiêu đề, dữ liệu bắt đầu từ hàng nào, màu tiêu đề, tiêu đề sheet Log.
│   ├── sheet\                    Mọi tệp chạm SpreadsheetApp. Ranh giới quan trọng nhất của cây này: tệp trong đây phải nghiệm thu trên Google, tệp ngoài đây kiểm được offline.
│   │   ├── Book.js               Mở đúng tệp Sheet. Tách riêng vì đường mở khi có người ngồi trước máy khác đường mở lúc chạy tự động.
│   │   ├── SheetIo.js            Đọc hàng 1 thành bảng tra "mã cột → số cột". Mọi thao tác cột đi qua đây, không ai được đếm cột bằng tay.
│   │   ├── SheetGrid.js          Sự thật về lưới: đếm hàng dữ liệu, đọc một khối ô, nới lưới trước khi ghi. Ra đời từ lỗi thật làm sheet Log co xuống 7 hàng rồi tắt log trong im lặng.
│   │   ├── CellBudget.js         Đo tổng số ô cả tệp và so với trần ở Config. Vượt trần thì chặn hẳn lượt nạp, kèm bảng chỉ mặt sheet nào phình to.
│   │   ├── EntityRead.js         Đọc bản ghi Customer và Activity ra dạng { fields, rows } truyền được sang client. Bỏ hàng không có mã và đếm số hàng đã bỏ.
│   │   ├── CategoryRead.js       Đọc sheet Category thành "mã danh mục → danh sách giá trị". Biết loại cột đi kèm _FBM mà không loại nhầm @CAT_CHO_PHEP_FBM.
│   │   ├── ConfigRead.js         Đọc các khối bảng của Config và trả hợp đồng counters riêng dù bộ đếm đã lưu chung trong khối tham số.
│   │   └── SetupSheets.js        Dựng và kiểm khung năm sheet từ hai tệp khai ở data\, rồi gọi lớp chuẩn bị Config. Chạy được nhiều lần, không phá dữ liệu đang có.
│   ├── util\
│   │   ├── DateText.js           Biên giới duy nhất giữa Date và hai dạng chuỗi thời gian của dự án. google.script.run không mang Date qua được, nên mọi mốc thời gian đi đường chuỗi.
│   │   └── TextNormalize.js      Chuẩn hóa văn bản trước khi so sánh. Có một bản sinh đôi ở client\util\ — hai bản phải giống nhau từng dòng.
│   ├── state\
│   │   ├── DirtyState.js         Cờ "sheet đã lệch so với RAM", giữ ở DocumentProperties. Đọc không bao giờ ném lỗi, vì nó đi kèm mọi lượt trả về.
│   │   └── UserPrefs.js          Ba núm chọn của sidebar, giữ ở UserProperties. Chiều đọc không bao giờ ném vì nó nằm trên đường nạp lõi; chiều ghi ném ngay vì giá trị lạ ở đó là code gọi sai.
│   ├── gate\                     Các cửa ghi có kỷ luật, cùng họ với LogGate: vào một chỗ, kiểm rồi mới ghi, một lượt một lệnh.
│   │   ├── FieldLogic.js         Ba bảng chuẩn hóa - kiểm tra - bắt buộc của tài liệu 03 Phần 6, phía máy chủ. Cắt trắng và trần 50.000 ký tự là mặc định của bộ máy, không khai trong schema.
│   │   ├── IdGate.js             Cấp mã bản ghi từ bộ đếm ở Config, chỉ chạy bên trong khóa của cửa ghi. Bộ đếm lạc hậu thì nhảy lên max+1 kèm dòng cảnh báo chứ không cấp mã đã có.
│   │   ├── WriteGate.js          Cửa ghi duy nhất xuống sheet dữ liệu: khóa, cấp mã, ghi đúng cột đã khai bằng một hai lệnh, flush rồi nhả khóa. Không đạt một trường thì không ghi gì và không trả về số hàng.
│   │   └── DeleteGate.js         Một nút Xóa, hai kết cục: xóa hẳn khi không tầng nào cản, xóa mềm khi có. Xóa nhiều dòng thì xóa từ dưới lên và đọc lại bản ghi mềm.
│   ├── service\
│   │   ├── LoadService.js        Gom cả một lượt nạp: đo ngân sách ô, đọc tham số, danh mục, toàn bộ khách, rồi giao dịch theo gói.
│   │   ├── SaveService.js        Vỏ bọc vào ra của hai cửa ghi: bọc lỗi, gắn khối trạng thái bẩn, đo mili giây. Luật ghi nằm ở gate\, không nằm đây.
│   │   └── SelectionService.js   Vòng dò khi không có Extension: probeSelectionCheap trả tọa độ ô đang chọn, probeSelectionFull đọc trực tiếp cột mã của hàng đang chọn theo DATA_SCHEMA. Mở tệp bằng shinOpenBook chứ không lấy tệp đang hoạt động.
│   ├── log\
│   │   ├── LogGate.js            Cửa ghi log: gom dòng trong RAM, ghi xuống sheet Log bằng đúng một lệnh, che bí mật, cắt log theo hai trần.
│   │   └── ClientTiming.js       Cửa nhận bản đo thời gian ĐO Ở TRÌNH DUYỆT rồi đệm một dòng vết. Máy chủ không tự thấy tiền đi đường, nên số này phải do client gửi. Không tin số client: kẹp trần, bỏ khóa lạ.
│   ├── entry\                    Cửa vào hệ thống, và nửa đưa lỗi tới mắt người.
│   │   ├── EntryPoint.js         Vỏ bọc runEntryPoint: ghi log kèm vết, báo cho người dùng, ném lại lỗi, và luôn xả bộ đệm log ở finally.
│   │   ├── ErrorReport.js        Đưa lỗi tới mắt người theo bốn kênh. Lỗi ở onOpen thì để dành, hiện ở lần mở sidebar sau.
│   │   └── Menu.js               onOpen, menu ShinCRM và lệnh mở sidebar. Mọi việc của nó đi qua getUi và HtmlService nên không kiểm offline được.
│   └── dev\                      CHỈ DÙNG LÚC PHÁT TRIỂN — xóa cả thư mục này trước khi Sheet mang dữ liệu khách hàng thật.
│       ├── DevRunner.js          Cửa web chạy một hàm trong danh sách trắng. Mở một địa chỉ chạy code dưới quyền chủ tệp.
│       ├── ViewProbe.js          Probe DEV tạo/xóa sheet quản trị tạm để nghiệm thu renderer thật trên Google.
│       ├── DevToken.js           Thẻ bí mật của cửa trên. Không vào git, nhưng CÓ đẩy lên Google.
│       ├── Smoke.js              Phép thử nhanh: mở được tệp Sheet không, đọc được gì.
│       ├── DumpGrid.js           Đo lưới từng sheet: bao nhiêu hàng, bao nhiêu cột, còn chỗ ghi thêm bao nhiêu hàng.
│       ├── MeasureLog.js         Đo chi phí thật của deleteRows trên sheet Log lớn. Con số trong tài liệu 10 đến từ đây.
│       ├── MeasureChunk.js       Đo đường nạp trên dữ liệu đang có, không ghi ô nào: measureFirstPaint đo thời gian tới khung hình đầu, measureChunkRows so các cỡ gói.
│       ├── LogTraceSwitch.js     Bật/tắt tham số LOG_TRACE ở sheet Config: devLogTraceOn ghi "all", devLogTraceOff xóa trắng. Tra cột theo mã hàng 1 nên không gõ sai khối.
│       └── SeedFake.js           Sinh dữ liệu giả cho Customer, Activity, Category và ĐỂ LẠI trên sheet để mở ra xem được. Mọi cột @ lõi khai đều có giá trị. Xóa bằng wipeFakeData.
│
├── client\                       Code chạy trong sidebar. Tệp .html bọc thẻ <script>, hoặc bọc thẻ <style> nếu là tệp chỉ có CSS.
│   │                             Thư mục con chia theo MỤC ĐÍCH, không chia theo đuôi thẻ.
│   ├── Sidebar.html              Trang gốc của sidebar: nhúng mọi tệp client theo đúng thứ tự rồi gọi lượt nạp đầu tiên.
│   ├── link\                     Cầu nối ô đang chọn: ưu tiên postMessage an toàn từ Extension, khi vắng mới mở đường dò máy chủ có nhịp và luật dừng.
│   │   ├── sheetLink.html        Tai nghe CRM_CONTEXT từ Extension: kiểm tra customerId trực tiếp rồi bật followSelection. Bắt tay có tiếng đáp, đèn sống chết suy từ ACK chứ không suy từ im lặng.
│   │   └── selectionPoll.html    Máy trạng thái dự phòng khi vắng Extension: nhịp dò 2/6 giây, bốn luật dừng, đèn sét bốn trạng thái và băng cảnh báo sau ba giây ân hạn.
│   ├── ram\                      Kho dữ liệu trong RAM của sidebar, và đường nhận dữ liệu từ máy chủ.
│   │   ├── store.html            Kho runtime cùng mười đường tra duy nhất được chạm vào nó. Không đường nào nhận tham số chế độ xem.
│   │   ├── ingest.html           Chỗ DUY NHẤT biết hình dạng đường truyền { fields, rows }. Bung thành object đúng một lần ở đây.
│   │   ├── screenState.html      Màn nào đang hiện, khách nào đang xem, form đang sửa bản ghi nào. Một object chứ ba biến rời — vì window.screen là tên trình duyệt đã chiếm, khai trùng thì lặng lẽ không có tác dụng.
│   │   ├── prefs.html            Bản sao ba núm chọn trong RAM. Ngầm định ở đây phải khớp từng núm với bảng khai máy chủ; việc gửi lên máy chủ là của ACTIONS, tệp này không gọi google.script.run.
│   │   └── bootstrap.html        Trình tự khởi động: nạp lõi, hiện màn hình, rồi nạp giao dịch theo gói ở phía sau.
│   ├── schema\
│   │   ├── schemaAccess.html     Cửa tra bảng khai bên client. Hỏi tên trường không có thì ném lỗi kèm gợi ý tên gần đúng, không trả về undefined.
│   │   ├── uiSchema.html         Khai bố cục bốn màn bằng dữ liệu: thanh trên, thân, chân trang, và những trường nào nằm ở đâu. Không một dòng logic — mọi câu hỏi "màn này trông thế nào" trả lời được bằng cách đọc tệp này.
│   │   ├── fieldLogic.html       Sáu hàm ngầm định của tài liệu 03 Phần 6: giá trị điền sẵn khi mở form trống, và giá trị mang theo từ giao dịch trước.
│   │   └── schemaCheck.html      Phép tự kiểm bảng khai cột, chạy được ở cả hai phía.
│   ├── style\                    Hình thức DÙNG CHUNG cho mọi màn. Chỉ có <style>, không khai tên JavaScript nào.
│   │   ├── tokens.html           Khối biến CSS: màu, cỡ chữ, khoảng cách. Đổi diện mạo thì vào đây.
│   │   ├── frame.html            Bố cục năm vùng: thanh trên, vạch tiến trình, khối thông tin, thân cuộn, chân trang.
│   │   ├── components.html       Hình thức của thứ engine dựng ra: hàng, card, trường, ô nhập, chip, nút. Hai mặc định của spatialConfig nói ở đây một lần thay vì dán vào từng thẻ.
│   │   └── slots.html            Hình thức riêng của ba vùng do SLOTS sinh ra: dòng lịch sử, hộp gợi ý tìm khách, khối thông tin chung. Tách khỏi components.html vì các lớp này chỉ một tệp sinh ra.
│   ├── ui\                       Bộ máy giao diện màn nào cũng gọi được. spatialConfig giữ toàn quyền về khoảng cách.
│   │   ├── progress.html         Vạch tiến trình cho mọi lượt gọi máy chủ. Đếm số lời gọi đang chờ, không giữ một cờ bật tắt.
│   │   ├── icons.html            Bộ glyph SVG nội tuyến, tra theo tên. Tên lạ thì ném lỗi chứ không vẽ nút trống.
│   │   ├── uiBuilder.html        Hình dạng MỘT node Block, và bảy hàm dựng Card/Row/Text/Field/Button/Icon/Check. Khóa lạ bị ném lỗi — đó là cách luật "không có style tự do" thành thật.
│   │   ├── screenBuild.html      Lối viết tắt của UI_SCHEMA thành cây Block: mảng lồng mảng, chuỗi trần thay cho object, cụm group/rows. Không chạm DOM nên kiểm được offline.
│   │   ├── slots.html            Ba vùng nội dung mà UI_SCHEMA không khai trước được: danh sách giao dịch, hộp gợi ý tìm khách, khối thông tin chung. Trả về cây Block chứ không trả chuỗi HTML.
│   │   ├── renderEngine.html     Cây Block thành HTML rồi gán vào bốn vùng. Thoát ký tự, dịch spatialConfig thành style, và renderTarget — cách DUY NHẤT đổi nội dung màn.
│   │   ├── actions.html          Mười lăm hành động của cả hệ thống, tra theo tên. Không chạm DOM và không gọi máy chủ trực tiếp, nên mười lăm thân hàm kiểm được offline. Việc chặng sau thì ném lỗi có tên chứ không để thân rỗng.
│   │   ├── dispatch.html         Một tai nghe click duy nhất đặt ở khung. Chỗ DUY NHẤT đọc data-* thành payload, đặt con trỏ theo focusId, và đưa lỗi vào alert — nhờ vậy actions.html không chạm DOM.
│   │   ├── menu.html             Lớp menu nổi dựng từ dấu data-menu của engine. Dấu tích và chấm tròn đọc ở Prefs. Mục con vẫn mang data-action, nên menu không mở thêm đường gọi hàm nào.
│   │   ├── collapse.html         Đo xem khối có tràn trần chiều cao hay không rồi mới quyết có nút Xem thêm — phép đo mà bản khai không nói được vì nó phụ thuộc nội dung thật.
│   │   ├── search.html           Hộp tìm khách: ô nhập nằm ngoài bốn vùng engine vẽ nên con trỏ không nhảy sau mỗi chữ. Dòng gợi ý bấm hay Enter đều đi qua đúng một bộ phát click.
│   │   ├── combo.html            Hành vi của ô gõ-để-lọc: con trỏ vào ô là tự bung danh sách nên không cần mũi tên ăn 24 pixel bề ngang, lọc không dấu, và đo chỗ hở lúc chạy để bung lên khi dưới hẹp.
│   │   └── inputs.html           Hai nếp gõ chung của mọi form: Enter nhảy sang ô kế tiếp và dừng ở nút Lưu, và dán một khối nhiều dòng thành nhiều ô rồi nhuộm vàng chỗ máy tự điền.
│   ├── screen\                   Một tệp một màn người dùng nhìn thấy. Màn được mang theo style riêng, vì style đó chết cùng màn đó.
│   │   ├── statusScreen.html     Ba màn không có form: tóm tắt lượt nạp, lỗi nạp, và màn chặn khi vượt trần ngân sách ô.
│   │   ├── viewScreen.html       Màn xem khách — màn mặc định. Biết KHI NÀO vẽ lại cái gì, không biết vẽ ra sao. Chỗ duy nhất nối ScreenState.currentCustomerId với Store.
│   │   └── formScreen.html       Ba màn form dùng chung một trình tự: mở sửa, mở thêm mới, mở lồng, đóng từng lớp. Suy tiêu đề rồi chèn vào vùng header, và tính id ô nhập đầu tiên cho bên đặt con trỏ.
│   ├── save\                     Đường ghi và đường xóa phía client. Tách khỏi ui\ vì đây là ba tệp duy nhất biết hình dạng câu trả lời của hai cửa máy chủ.
│   │   ├── formCollect.html      Những gì đang gõ trên form thành object bản ghi. Lọc theo data-readonly chứ không theo data-field, và cố ý không ép kiểu số — cửa ghi là bộ phân tích duy nhất.
│   │   ├── saveFlow.html         Đường bấm Lưu: gửi đúng những trường đang có mặt trên form, tô đỏ chỗ cửa ghi trả về, lưu xong thì đóng một lớp form chứ không đóng cả ngăn xếp.
│   │   └── pendingDelete.html    Xóa có hoàn tác: bấm Xóa không gửi gì, mã vào bộ chờ và dải hoàn tác đếm ngược. Mặt nạ ở tầng hiện, Store không bị sửa cho tới khi máy chủ trả lời.
│   └── util\
│       ├── serverCall.html       Bọc google.script.run thành Promise kèm vạch tiến trình. Cửa duy nhất thấy cả hai đầu một vòng gọi, nên phép đo thời gian cũng ở đây. Cố ý KHÔNG tự hiện lỗi — việc đó của bên gọi.
│       ├── callTiming.html       Sổ đo từng vòng gọi. Tách tổng thời gian thành ba phần: máy chủ tính toán, tiền đi đường, trình duyệt bung và vẽ.
│       ├── valueText.html        Giá trị trong RAM thành chuỗi bày vào ô: số có dấu chấm nghìn, chuỗi thời gian thành dạng thẻ input chịu nhận.
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
├── preview.js                    Gộp Sidebar.html thành một tệp mở được bằng trình duyệt, ghim khung 300 pixel và cắm google.script.run giả. Dữ liệu do chính hộp cát của bộ kiểm sinh ra nên không cần mạng và không ô nào của khách thật rời khỏi Google. Thêm --serve thì mở cổng 4173.
├── check-sheet.js                Đối chiếu hàng 1 của tệp Sheet thật với bảng khai. Cần mạng.
├── gas.js                        Chạy một hàm thật trên Google qua cửa DevRunner. Cần mạng.
├── lib\
│   ├── assert.js                 Các phép so và bộ đếm đạt/trượt.
│   ├── load-gas.js               Nạp tệp .js và .html thật vào hộp cát vm, dựng lại vùng tên chung của Apps Script.
│   ├── fake-sheet.js             Tệp Sheet giả trong RAM, TỰ ĐẾM số lệnh setValues và deleteRows.
│   ├── gas-stubs.js              Utilities, Logger, PropertiesService, console giả — vừa đủ phần mà code gọi tới.
│   ├── dung-hop.js               Dựng sẵn hộp cát kèm sheet giả và hàm ghi ô theo mã cột. Nơi duy nhất giữ danh sách đường dẫn tệp máy chủ.
│   ├── dung-client.js            Hộp cát RIÊNG cho tệp client. Riêng vì server và client có hàm sinh đôi cùng tên, chung hộp thì bản nạp sau đè bản nạp trước.
│   ├── khung-gia.js              Khung sidebar giả cho bộ máy vẽ: bốn vùng, chỉ ba khả năng getElementById/innerHTML/hidden. Thay innerHTML một vùng thì phần tử con bị xóa nội dung, đúng như trình duyệt.
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
    ├── setupSheets.js            Chạy lại lần thứ hai có phá gì không: giá trị người dùng đã vặn phải còn nguyên, và tên mới nối dưới dòng cuối của chính cột tham số.
    ├── columnFormat.js           Khuôn chống mất chữ số đầu của mã số thuế: bảng khuôn khớp kiểu cột, cửa ghi đặt lại khuôn trước khi ghi, dựng và kiểm sheet áp khuôn đúng ô.
    ├── entityRead.js             Tra cột theo mã chứ không theo thứ tự, hàng trắng bị đếm, và không giá trị nào còn là Date.
    ├── categoryRead.js           Cái bẫy @CAT_CHO_PHEP_FBM, và mọi trường SELECT đều tìm được danh mục của mình.
    ├── configRead.js             Khóa trùng thì chặn, còn khối sắp xếp thì thứ tự hàng là nghĩa.
    ├── dirtyState.js             Khối trạng thái bẩn KHÔNG BAO GIỜ được ném, kể cả khi tệp thuộc tính hỏng hoặc đọc dở dang.
    ├── userPrefs.js              Ba núm chọn phía máy chủ: giá trị lạ đều rơi về ngầm định, và ghi một núm KHÔNG được để lại dấu vết nào ở DocumentProperties.
    ├── schemaAccess.js           Cửa đọc bảng khai: tên gõ sai nổ ngay kèm gợi ý, còn tên máy như toJSON thì phải đi qua.
    ├── fieldLogic.js             Sáu hàm ngầm định: mã kế tiếp lấy từ bộ đếm dạng chuỗi, và giá trị mang theo từ giao dịch gần nhất CÒN SỐNG.
    ├── loadService.js            Hình dạng gói loadCore, đường chặn vì ngân sách ô, và con trỏ gói giao dịch đi ngược từ hàng cuối.
    ├── selectionService.js       Tra ô đang chọn đúng theo Customer, Activity hoặc cột mã hiện tại của sheet quản trị; vùng tiêu đề, hàng trống và sheet ngoài kho đều trả rỗng.
    ├── ramStore.js               NGHIỆM THU CHẶNG 1.2: hai hộp cát, dữ liệu đi qua cầu google.script.run thật, và ba luật tra cứu khác nhau của Store.
    ├── screenState.js            Ngăn xếp form: screen là trường thật chứ không suy ra từ đỉnh ngăn xếp, nên push và pop phải giữ hai bên khớp. Kiểm luôn bẫy window.screen.
    ├── prefs.js                  Ngầm định phía client khớp từng núm với máy chủ — lệch thì lần mở đầu tiên hiện một nấc rồi tự nhảy sang nấc khác.
    ├── callTiming.js             Phép trừ "client đo được trừ máy chủ báo". Sai chỗ này thì tiền đi đường hiện ra sai, và cỡ gói bị chọn theo một con số bịa.
    ├── bootstrap.js              Hai hàm thuần của trình tự khởi động: cảnh báo dữ liệu nổ hộp thoại còn phép kiểm bị bỏ qua chỉ xuống console, và bậc thang cỡ gói đọc từ SETTINGS.
    ├── uiBuilder.js              Cây Block và lối viết tắt của UI_SCHEMA. Phần đáng kiểm không phải "dựng đúng thì ra đúng" mà "dựng sai thì có chặn không".
    ├── blockKeys.js              Nửa còn lại của phép kiểm khóa Block: vai nhận khóa nào thì phần lá phải vẽ ra khóa đó. Đây là ca `{icon, label}` chỉ ra glyph, và ca `Card({label})` khai đúng cú pháp mà chữ không bao giờ hiện.
    ├── uiSchema.js               Bảng khai bố cục giữ hợp đồng với ba tệp khác: mọi đường dẫn trường tra được trong DATA_SCHEMA, mọi tên hàm có trong ACTIONS, và bốn màn dựng qua screenBuild không nổ.
    ├── cssClass.js               Tên lớp CSS cũng ở chung một vùng tên như biến JS: trùng tên thì tệp nạp sau lặng lẽ thắng. Đây là ca `.shin-box` của tệp màn đè `.shin-box` dùng chung, ăn mất 26 pixel bề ngang.
    ├── renderEngine.js           Cây Block thành HTML: ký tự đặc biệt trong tên công ty, spatialConfig khai rồi mà bố cục không đổi, data-field thiếu đường dẫn, luật chỉ-đọc bị mở khóa; kèm phép quét mã nguồn chốt đúng ba tệp được gán innerHTML.
    ├── slots.js                  Dòng lịch sử giữ đúng thứ tự thời gian kể cả khi có bản ghi đã xóa chen giữa, và KHÔNG dòng nào mang field — engine tra một bản ghi cho một thực thể.
    ├── viewScreen.js             Bốn cái hỏng-trong-im-lặng của màn xem: mã card lệch giữa hai tệp, đổi khách mà chỉ vẽ lại một vùng, đổi khách lúc đang gõ dở, và tệp màn tự chạm DOM.
    ├── formScreen.js             Bốn cái hỏng-trong-im-lặng của ba màn form: tiêu đề suy sai vì bản ghi mới đã có mã xem trước, ô kế tục không có dấu, form giao dịch thiếu bản ghi khách, và đóng form lồng thì rơi thẳng về màn xem.
    ├── actions.js                Bảng mười lăm hành động: một tên rơi khỏi bảng là nút bấm không làm gì, ba cửa mở form phải khóa khi khách đã xóa mềm, và việc chặng sau phải ném lỗi đọc được chứ không im.
    ├── extensionBridge.js        Nonce của cầu nối Extension phải đi trọn từ bắt tay tới CRM_CONTEXT; origin lạ không được chiếm kênh đang dùng.
    ├── selectionPoll.js          Đồng hồ giả khóa luật ACK loại trừ mọi vòng gọi, bốn điều kiện dừng, chống vòng chồng và thang nhịp 2/6 giây.
    ├── triggers.js               Trigger sửa sheet quản trị làm mới ngay; sửa kho đánh dấu mọi sheet quản trị cần làm mới.
    └── domUi.js                  DOM giả tối thiểu kiểm ba đường UI: phát click, menu nổi và thu gọn nội dung.
```

`server/dev/FbmSyncFixture.js` — Chuẩn bị live test ALT00010, ghi checklist vào Log, không xóa dữ liệu và không gửi request FBM.

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
| `client/ui/styles.html` | `client/style/tokens.html` + `client/style/frame.html` + `client/style/components.html` |
| `client/ui/tokens.html` | `client/style/tokens.html` |
| `client/ui/frame.html` | `client/style/frame.html` |

Mười tệp máy chủ không có trong bảng này vì tài liệu thiết kế không đặt tên cho chúng: `SheetGrid.js`, `CellBudget.js`, `EntityRead.js`, `CategoryRead.js`, `ConfigRead.js`, `DateText.js`, `EntryPoint.js`, `ErrorReport.js`, `ConfigParams.js`, `UserPrefs.js`. Tài liệu nói *phải làm gì* ở các phần tương ứng — với `UserPrefs.js` là tài liệu 07 Phần 6, chỗ ra luật "mọi núm chọn nhớ ở `UserProperties`" mà không đặt tên tệp — còn việc gom mỗi luật vào một tệp là quyết định của phiên code, nên chỗ tra chúng là cây thư mục ở trên, không phải bảng này.

Bốn dòng `client/...js` lệch vì một lý do khác hẳn các dòng trên, đã ghi ở tài liệu làm việc `Mục tiêu chặng 1.1 và 1.2.md`: **mọi** tệp client trên Apps Script buộc phải là `.html`, không phải `.js` như tài liệu 04 Phần 10 và 05 Phần 13 viết.

Ba dòng cuối lệch vì thư mục: tài liệu 04 gom cả CSS vào `client/ui/`, còn code chia `client/style/` cho hình thức dùng chung, `client/ui/` cho bộ máy giao diện, `client/screen/` cho từng màn. Chủ dự án chốt cách chia này 05/09/2026 và tài liệu 04 Phần 10 đã sửa theo. Một `styles.html` của tài liệu thành ba tệp theo việc: `tokens.html` giữ biến, `frame.html` giữ năm vùng khung, `components.html` giữ các lớp mà renderEngine sinh ra.

## Thư mục sẽ dựng ở các chặng tới

Ghi ra đây để chỗ đặt tệp mới là điều đã quyết trước, không phải điều quyết lúc đang gấp.

```
server\view\                      Dựng sheet quản lý: đọc bộ lọc, sắp xếp, vẽ lại vùng dữ liệu.
server\view\ViewSheetSetup.js     Tạo sheet quản trị mới từ DATA_SCHEMA, bổ sung hai cột điều khiển còn thiếu, ghi chú và validation 10 cấp sắp xếp.
server\config\ConfigSheetSetup.js Migration bộ đếm Config cũ, dựng hướng dẫn/validation, gieo tham số và khôi phục Config về mặc định mà không chạm Customer/Activity.
server\Triggers.js                 Trigger cài đặt đánh dấu dữ liệu bẩn và chuẩn bị sheet quản trị.
```

Biểu mẫu **không** có thư mục riêng: bộ máy dựng form là `client\ui\` (uiBuilder, renderEngine, actions, slots), bảng khai form là `client\schema\` (uiSchema, fieldLogic), và mỗi màn có form là một tệp trong `client\screen\`.
2_ShinCRM_Extension/content_scripts/model/live_model_reader.js Đọc mã khách từ lưới live của Sheets trong MAIN world; mã cột do Sidebar truyền, lỗi thì đóng an toàn
## Module đồng bộ FBM (giai đoạn 2)

```
1_ShinCRM_GAS/fbm_sync/
|- schema/FbmFields.js          Field map, controller, trạng thái
|- protocol/Protocol.js         Envelope và parse response
|- transport/Transport.js       doPost và điều phối từng slice
|- state/State.js               DocumentProperties, cursor, progress
|- state/RecordLocks.js         Khóa bản ghi và kiểm tra revision
|- state/Scheduler.js           Lịch heartbeat/quét, không gọi FBM trực tiếp
|- read/GridRead.js             Grid metadata, phân trang, category request
|- write/RequestBuilders.js     Builder Customer/Activity create/edit
|- reconcile/Reconcile.js       Normalize, fingerprint, pull WriteGate
|- reconcile/CategorySync.js    Nhập lookup FBM vào Category, giữ nguyên giá trị cũ
|- report/Report.js             Trạng thái công khai cho Sidebar
server/service/FbmSyncService.js Entry points ổn định cho Sidebar
1_ShinCRM_GAS/client/sync/fbmSync.html UI màn hình đồng bộ độc lập, tiến độ và bridge request thô
2_ShinCRM_Extension/content_scripts/model/live_model_reader.js Đọc mã khách từ lưới live của Sheets trong MAIN world; mã cột do Sidebar truyền, lỗi thì đóng an toàn
2_ShinCRM_Extension/content_scripts/fbm_sync/executor.js Fetch trong tab FBM
```
