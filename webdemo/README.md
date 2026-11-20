# Web demo

- Chọn tập huấn luyện MCF, UP-Fall hoặc Mix, rồi chọn pipeline.
- Chọn ảnh validation 80:20, 26 ảnh thực tế hoặc tải ảnh JPG, PNG hay WebP lên.
- Trang **Dataset & camera** cho xem đủ 8 góc MCF cùng thời điểm. Camera lọc ảnh validation và cả 8 góc dùng chung model MCF.
- Bộ model khớp benchmark báo cáo. P4 là **Ngồi** cho MCF, UP-Fall và Mix.

## Ảnh thực tế

- 26 ảnh gồm 9 đi/đứng, 8 nằm và 9 đang ngã. Nhãn tham chiếu được gán trước khi dự đoán. Ảnh chỉ dùng để thử web ngoài bộ MCF và UP-Fall.
- Nguồn và giấy phép từng ảnh có trong [samples.json](realdata/samples.json). Ảnh RealBiomFall được trích từ clip theo timestamp. Ảnh Wikimedia Commons được chuyển từ JPEG sang PNG.

## Cài và chạy

1. Từ gốc repo, cài môi trường bằng lệnh trong [README](../README.md#chạy-trên-máy).
2. Tải gói model tương ứng từ [Release v1.0.0](https://github.com/22520896/CV/releases/tag/v1.0.0). Giải nén vào [papercode/eval/models](../papercode/eval/models). Ví dụ, gói Mix tạo thư mục mix với tám file joblib.
3. Chạy từ gốc repo.

~~~powershell
python -m webdemo.app
~~~

Mở [demo tại cổng 5000](http://127.0.0.1:5000). HOG chạy trên CPU. ResNet tải trọng số ImageNet của Keras trong lần chạy đầu, rồi dùng GPU nếu có.

Mã kiểm tra SHA-256 của từng checkpoint theo [index.json](../papercode/eval/models/index.json) trước khi nạp. Để dùng model đã tải ở nơi khác, đặt biến CV_MODEL_DIR đến thư mục chứa các thư mục con mcf, upfall và mix.

Repo có sẵn ảnh mẫu. Web cũng đọc ảnh validation đã dựng tại papercode/prepare-dataset/prepared. Đặt CV_FRAME_STORE đến thư mục data của dự án CV-UPFALL nếu đã có ảnh RGB128 ở đó. Thư viện chỉ hiện file ảnh có sẵn và thuộc [split đã lưu](../papercode/prepare-dataset/splits).
