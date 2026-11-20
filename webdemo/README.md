# Web demo

- Chọn tập huấn luyện MCF, UP-Fall hoặc Mix, rồi chọn pipeline.
- Chọn ảnh validation mẫu hoặc tải ảnh JPG, PNG hay WebP lên.
- Trang **Dataset và camera** cho xem ba góc MCF cùng thời điểm và ba ảnh theo thứ tự trong một trial UP-Fall.

## Cài và chạy

1. Từ gốc repo, cài môi trường bằng lệnh trong [README](../README.md#chạy-trên-máy).
2. Tải gói model tương ứng từ [Release v1.0.0](https://github.com/22520896/CV/releases/tag/v1.0.0). Giải nén vào [papercode/eval/models](../papercode/eval/models). Ví dụ, gói Mix tạo thư mục mix với tám file joblib.
3. Chạy từ gốc repo.

~~~powershell
python -m webdemo.app
~~~

Mở [demo tại cổng 5000](http://127.0.0.1:5000). HOG chạy trên CPU. ResNet tải trọng số ImageNet của Keras trong lần chạy đầu, rồi dùng GPU nếu có.

Mã kiểm tra SHA-256 của từng checkpoint theo [index.json](../papercode/eval/models/index.json) trước khi nạp. Để dùng model đã tải ở nơi khác, đặt biến CV_MODEL_DIR đến thư mục chứa các thư mục con mcf, upfall và mix.
