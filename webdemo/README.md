# Web demo

- Chọn bộ model MCF, UP-Fall hoặc Mix, rồi chọn một hay nhiều pipeline để dự đoán cùng một ảnh. Mở kết quả từng model để xem bốn thanh phần trăm và thời gian.
- Chọn ảnh validation 80:20, 28 ảnh real hoặc tải ảnh JPG, PNG hay WebP lên.
- Ảnh validation có tag MCF hoặc UP-Fall. Khi dùng bộ model Mix, có thể lọc theo dataset và tư thế cùng lúc.
- Trang **Dataset & camera** chạy cùng một model MCF trên 8 ảnh chụp cùng thời điểm. Bấm vào ảnh để mở kết quả chi tiết trong Demo.
- Bộ model khớp benchmark báo cáo. P4 là **Ngồi** cho MCF, UP-Fall và Mix.

`app.py` xử lý các route, `catalog.py` đọc danh sách ảnh, `features.py` trích đặc trưng và `models.py` nạp checkpoint, kiểm tra SHA-256 và tính điểm dự đoán.

## Ảnh thực tế

- Mỗi tư thế P1–P4 có 7 ảnh chụp ngoài MCF và UP-Fall. Nhãn tham chiếu dựa trên tư thế nhìn thấy và các khung lân cận đối với P3 (Đang ngã).
- Demo mở với **Mix + ResNet-50 + Softmax**. Bộ ảnh được tuyển chọn theo dự đoán của model này, với 5 ảnh dự đoán đúng và 2 ảnh dự đoán sai ở mỗi tư thế (71,4%). Tỷ lệ chỉ mô tả thư viện demo. Benchmark dùng tập validation 80:20 của từng bộ.
- [samples.json](realdata/samples.json) lưu tác giả, nguồn, giấy phép, tệp gốc và timestamp nếu ảnh được trích từ video. Ảnh từ [GMDCSA24](https://doi.org/10.5281/zenodo.13354453) gồm cảnh ngã mô phỏng. Các nguồn khác gồm [RealBiomFall](https://doi.org/10.5281/zenodo.11636174) và [bộ ảnh tư thế của Patrick O. Ogbuitepu](https://huggingface.co/datasets/pat2echo/fall-detection-posture-classification). Ảnh mới được lưu dưới dạng PNG và giảm kích thước khi cần.

## Cài và chạy với ảnh có sẵn

1. Từ gốc repo, cài môi trường bằng lệnh trong [README](../README.md#chạy-trên-máy).
2. Tải ít nhất một trong ba gói `models-mcf.zip`, `models-upfall.zip` hoặc `models-mix.zip` từ [Release v1.0.0](https://github.com/22520896/CV/releases/tag/v1.0.0). Giải nén vào `papercode/eval/models/`. Ví dụ, gói Mix tạo `papercode/eval/models/mix/hog_softmax.joblib` cùng bảy model Mix còn lại. Dùng gói MCF để chạy **So sánh dự đoán** trên 8 camera.
3. Chạy từ gốc repo.

~~~powershell
python -m webdemo.app
~~~

Mở [demo tại cổng 5000](http://127.0.0.1:5000). HOG chạy trên CPU. ResNet tải trọng số ImageNet của Keras trong lần chạy đầu, rồi dùng GPU nếu có.

Repo đi kèm **28 ảnh real**, **20 ảnh validation MCF** và **5 ảnh validation UP-Fall**. Các ảnh validation mẫu nằm trong `papercode/prepare-dataset/dataraw/<dataset>/examples/images/`.

Ứng dụng kiểm tra SHA-256 của từng checkpoint trước khi nạp. Nếu giải nén model ở nơi khác, đặt `CV_MODEL_DIR` đến thư mục chứa các thư mục con `mcf`, `upfall` hoặc `mix`. [Danh sách checkpoint](../papercode/eval/models/index.json)

## Thêm ảnh validation

Bộ validation đầy đủ theo split có **5.408 ảnh MCF** và **8.849 ảnh UP-Fall**. Web chọn các `sample_id` có `split=validation` và có file ảnh tương ứng trên máy. [Split MCF](../papercode/prepare-dataset/splits/mcf.csv) · [Split UP-Fall](../papercode/prepare-dataset/splits/upfall.csv)

| Dataset | File nguồn và thư mục đặt file | Ảnh RGB128 sau khi chạy notebook |
|---|---|---|
| MCF | Tải gói Kaggle và giải nén video vào `papercode/prepare-dataset/dataraw/mcf/` theo dạng `chute01/cam1.avi`. Hai bảng chú giải CSV đã có sẵn trong repo. [Gói MCF trên Kaggle](https://www.kaggle.com/datasets/soumicksarker/multiple-cameras-fall-dataset) | `papercode/prepare-dataset/prepared/mcf/images/<sample_id>.png` |
| UP-Fall | Trong mục **Downloads** của HAR-UP, chọn Subject, Activity, Trial và tải **Camera1**. Tải `CompleteDataSet.csv` từ **Complete Downloads**. Đặt CSV và các ZIP theo mẫu `S01_A01_T1_Camera1.zip` trong `papercode/prepare-dataset/dataraw/upfall/`. [Trang tải HAR-UP](https://sites.google.com/up.edu.mx/har-up/) | `papercode/prepare-dataset/prepared/upfall/images/<sample_id>.png` |

Mở notebook của dataset tương ứng, đặt `PREPARE_RAW = True` rồi chạy từ đầu. Notebook ghi ảnh theo `sample_id` và kiểm tra với split công bố. Khi ảnh nằm trong `prepared/`, web tự tìm thấy lúc khởi động. [Notebook MCF](../papercode/prepare-dataset/prepare_mcf.ipynb) · [Notebook UP-Fall](../papercode/prepare-dataset/prepare_upfall.ipynb)

### Dùng kho ảnh RGB128 có sẵn với `CV_FRAME_STORE`

`CV_FRAME_STORE` là biến môi trường tùy chọn, trỏ tới **thư mục cha chứa `mcf/` và `upfall/`** của kho ảnh đã dựng. Nếu chỉ có một dataset thì đặt thư mục con của dataset đó. Hai đường dẫn dưới đây minh họa cấu trúc mà web đọc từ kho ngoài repo.

```text
CV_FRAME_STORE/
├── mcf/frames/rgb128/scenario_01/camera_01/000939.png
└── upfall/frames/rgb128/subject_01/activity_01/trial_01/000078.png
```

Đặt biến trong cùng cửa sổ PowerShell trước khi chạy Flask. Thay đường dẫn mẫu bằng thư mục `data` trên máy bạn.

~~~powershell
$env:CV_FRAME_STORE = 'D:\CV-UPFALL\data'
python -m webdemo.app
~~~
