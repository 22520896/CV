import os
from functools import lru_cache

import numpy as np
from PIL import Image, ImageOps
from skimage.feature import hog


def rgb128(image):
    return ImageOps.exif_transpose(image).convert("RGB").resize((128, 128), Image.Resampling.BILINEAR)


def hog_vector(image):
    rgb64 = rgb128(image).resize((64, 64), Image.Resampling.BILINEAR)
    return hog(
        np.asarray(rgb64, dtype=np.float32), orientations=9, pixels_per_cell=(8, 8),
        cells_per_block=(3, 3), block_norm="L2-Hys", channel_axis=-1,
    ).astype(np.float32)


@lru_cache(maxsize=1)
def resnet():
    os.environ.setdefault("KERAS_BACKEND", "torch")
    import torch
    from keras.applications.resnet import ResNet50, preprocess_input

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = ResNet50(weights="imagenet", include_top=False, pooling="avg", input_shape=(128, 128, 3))
    model.trainable = False
    model.to(device).eval()
    return model, torch, device, preprocess_input


def resnet_vector(image):
    model, torch, device, preprocess_input = resnet()
    pixels = np.ascontiguousarray(preprocess_input(np.asarray(rgb128(image), dtype=np.float32)[None]))
    with torch.inference_mode():
        return model(torch.as_tensor(pixels, device=device), training=False).detach().cpu().numpy()[0]
