# Phân loại tình huống ngã và không ngã của người từ hình ảnh

[Chuẩn bị MCF](papercode/prepare-dataset/prepare_mcf.ipynb) ·
[Chuẩn bị UP-Fall](papercode/prepare-dataset/prepare_upfall.ipynb) ·
[Xem kết quả](papercode/eval/evaluate.ipynb) ·
[Chạy web demo](webdemo/README.md)

Đồ án phân loại ảnh đơn thành bốn tư thế **P1 Đi/đứng**, **P2 Nằm**, **P3 Đang ngã** và **P4 Ngồi**.

## Dữ liệu

| Tập | Ảnh | Train | Validation | Lấy mẫu |
|---|---:|---:|---:|---|
| MCF | 27.016 | 21.608 | 5.408 | Stride 4, 8 camera |
| UP-Fall | 44.245 | 35.396 | 8.849 | Stride 6, Camera 1 |
| Mix | 71.261 | 57.004 | 14.257 | Ghép các phần tương ứng |

- Chia phân tầng 80:20. MCF giữ 8 ảnh cùng thời điểm trong cùng một tập và fold.
- Notebook chuẩn bị dữ liệu mở được bằng ảnh và clip minh họa có sẵn. Bật chế độ dựng lại nếu bạn có file nguồn.
- [Notebook chia train, validation và CV](papercode/prepare-dataset/splits/create_splits.ipynb) · [Split MCF](papercode/prepare-dataset/splits/mcf.csv) · [Split UP-Fall](papercode/prepare-dataset/splits/upfall.csv)

## Huấn luyện

| Đặc trưng | Softmax | KNN | LinearSVC | SVM-RBF |
|---|---|---|---|---|
| HOG RGB64 | [Notebook](papercode/train/hog_softmax.ipynb) | [Notebook](papercode/train/hog_knn.ipynb) | [Notebook](papercode/train/hog_linear_svc.ipynb) | [Notebook](papercode/train/hog_svm_rbf.ipynb) |
| ResNet-50 + GAP | [Notebook](papercode/train/resnet50_softmax.ipynb) | [Notebook](papercode/train/resnet50_knn.ipynb) | [Notebook](papercode/train/resnet50_linear_svc.ipynb) | [Notebook](papercode/train/resnet50_svm_rbf.ipynb) |

- Notebook có output chạy thử từ một cấu hình và một fold nhỏ. Chế độ full dùng 5 fold trên train để chọn tham số theo Accuracy.
- 24 model và 48 lượt đánh giá được lưu trong [benchmark.csv](papercode/eval/benchmark.csv). Khi xem Mix, notebook eval tính chỉ số từ confusion matrix gộp.
- Split theo frame hoặc thời điểm có thể đưa các frame lân cận vào train và validation. Kết quả phản ánh giao thức chia đã lưu.

## Chạy trên máy

Dùng Python 3.12 và mở notebook bằng VS Code hoặc JupyterLab.

~~~powershell
python -m pip install -r requirements.txt
~~~

Web demo có sẵn ảnh real và ảnh validation mẫu. Hướng dẫn cài model, tải dữ liệu gốc và thêm ảnh validation nằm trong [README của web demo](webdemo/README.md).

## Tài liệu tham khảo

- Auvinet và cộng sự. [Multiple Cameras Fall Dataset](https://www-labs.iro.umontreal.ca/~labimage/Dataset/technicalReport.pdf), 2010. [Bản phân phối Kaggle](https://www.kaggle.com/datasets/soumicksarker/multiple-cameras-fall-dataset)
- Martínez-Villaseñor và cộng sự. [UP-Fall Detection Dataset](https://doi.org/10.3390/s19091988), 2019. [Trang dataset](https://sites.google.com/up.edu.mx/har-up/)
- Kareem và cộng sự. [Exploiting the features of deep residual network with SVM classifier for human posture recognition](https://doi.org/10.1371/journal.pone.0314959), 2024.
