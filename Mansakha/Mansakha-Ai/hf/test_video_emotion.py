import cv2
import mediapipe as mp
import math
import numpy as np
import time
import warnings

import torch
import torch.nn as nn
import torch.nn.functional as F

from PIL import Image
from torchvision import transforms


# ============================================================
# CONFIG
# ============================================================

MODEL_DIR = r"C:\Users\yukes\Downloads\hf\VideoEmotion"

BACKBONE_FILE = "FER_static_ResNet50_AffectNet.pt"

# Change this to test another temporal model:
# Aff-Wild2
# CREMA-D
# IEMOCAP
# RAMAS
# RAVDESS
# SAVEE

LSTM_DATASET = "Aff-Wild2"

LSTM_FILE = f"FER_dinamic_LSTM_{LSTM_DATASET}.pt"

SEQUENCE_LENGTH = 10


# ============================================================
# WARNINGS
# ============================================================

warnings.simplefilter("ignore", UserWarning)


# ============================================================
# DEVICE
# ============================================================

DEVICE = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)

print("=" * 65)
print("PS 094 - REAL-TIME VIDEO EMOTION ANALYSIS")
print("=" * 65)

print(f"Device : {DEVICE}")

if torch.cuda.is_available():

    print(
        f"GPU    : {torch.cuda.get_device_name(0)}"
    )

    print(
        f"CUDA   : {torch.version.cuda}"
    )

else:

    print("GPU    : CPU")
    print("WARNING: CUDA is not available.")


# ============================================================
# RESNET ARCHITECTURE
# ============================================================

class Bottleneck(nn.Module):

    expansion = 4

    def __init__(
        self,
        in_channels,
        out_channels,
        i_downsample=None,
        stride=1
    ):

        super().__init__()

        self.conv1 = nn.Conv2d(
            in_channels,
            out_channels,
            kernel_size=1,
            stride=stride,
            padding=0,
            bias=False
        )

        self.batch_norm1 = nn.BatchNorm2d(
            out_channels,
            eps=0.001,
            momentum=0.99
        )

        self.conv2 = nn.Conv2d(
            out_channels,
            out_channels,
            kernel_size=3,
            padding="same",
            bias=False
        )

        self.batch_norm2 = nn.BatchNorm2d(
            out_channels,
            eps=0.001,
            momentum=0.99
        )

        self.conv3 = nn.Conv2d(
            out_channels,
            out_channels * self.expansion,
            kernel_size=1,
            stride=1,
            padding=0,
            bias=False
        )

        self.batch_norm3 = nn.BatchNorm2d(
            out_channels * self.expansion,
            eps=0.001,
            momentum=0.99
        )

        self.i_downsample = i_downsample
        self.stride = stride

        self.relu = nn.ReLU()

    def forward(self, x):

        identity = x.clone()

        x = self.relu(
            self.batch_norm1(
                self.conv1(x)
            )
        )

        x = self.relu(
            self.batch_norm2(
                self.conv2(x)
            )
        )

        x = self.conv3(x)

        x = self.batch_norm3(x)

        if self.i_downsample is not None:
            identity = self.i_downsample(identity)

        x += identity

        x = self.relu(x)

        return x


# ============================================================
# SAME PADDING
# ============================================================

class Conv2dSame(torch.nn.Conv2d):

    def calc_same_pad(
        self,
        i,
        k,
        s,
        d
    ):

        return max(
            (
                math.ceil(i / s) - 1
            ) * s
            + (k - 1) * d
            + 1
            - i,
            0
        )

    def forward(self, x):

        ih, iw = x.size()[-2:]

        pad_h = self.calc_same_pad(
            ih,
            self.kernel_size[0],
            self.stride[0],
            self.dilation[0]
        )

        pad_w = self.calc_same_pad(
            iw,
            self.kernel_size[1],
            self.stride[1],
            self.dilation[1]
        )

        if pad_h > 0 or pad_w > 0:

            x = F.pad(
                x,
                [
                    pad_w // 2,
                    pad_w - pad_w // 2,
                    pad_h // 2,
                    pad_h - pad_h // 2
                ]
            )

        return F.conv2d(
            x,
            self.weight,
            self.bias,
            self.stride,
            self.padding,
            self.dilation,
            self.groups
        )


# ============================================================
# RESNET
# ============================================================

class ResNet(nn.Module):

    def __init__(
        self,
        ResBlock,
        layer_list,
        num_classes,
        num_channels=3
    ):

        super().__init__()

        self.in_channels = 64

        self.conv_layer_s2_same = Conv2dSame(
            num_channels,
            64,
            7,
            stride=2,
            groups=1,
            bias=False
        )

        self.batch_norm1 = nn.BatchNorm2d(
            64,
            eps=0.001,
            momentum=0.99
        )

        self.relu = nn.ReLU()

        self.max_pool = nn.MaxPool2d(
            kernel_size=3,
            stride=2
        )

        self.layer1 = self._make_layer(
            ResBlock,
            layer_list[0],
            planes=64,
            stride=1
        )

        self.layer2 = self._make_layer(
            ResBlock,
            layer_list[1],
            planes=128,
            stride=2
        )

        self.layer3 = self._make_layer(
            ResBlock,
            layer_list[2],
            planes=256,
            stride=2
        )

        self.layer4 = self._make_layer(
            ResBlock,
            layer_list[3],
            planes=512,
            stride=2
        )

        self.avgpool = nn.AdaptiveAvgPool2d(
            (1, 1)
        )

        self.fc1 = nn.Linear(
            512 * ResBlock.expansion,
            512
        )

        self.relu1 = nn.ReLU()

        self.fc2 = nn.Linear(
            512,
            num_classes
        )

    def extract_features(self, x):

        x = self.relu(
            self.batch_norm1(
                self.conv_layer_s2_same(x)
            )
        )

        x = self.max_pool(x)

        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)

        x = self.avgpool(x)

        x = x.reshape(
            x.shape[0],
            -1
        )

        x = self.fc1(x)

        return x

    def forward(self, x):

        x = self.extract_features(x)

        x = self.relu1(x)

        x = self.fc2(x)

        return x

    def _make_layer(
        self,
        ResBlock,
        blocks,
        planes,
        stride=1
    ):

        ii_downsample = None

        layers = []

        if (
            stride != 1
            or self.in_channels
            != planes * ResBlock.expansion
        ):

            ii_downsample = nn.Sequential(

                nn.Conv2d(
                    self.in_channels,
                    planes * ResBlock.expansion,
                    kernel_size=1,
                    stride=stride,
                    bias=False,
                    padding=0
                ),

                nn.BatchNorm2d(
                    planes * ResBlock.expansion,
                    eps=0.001,
                    momentum=0.99
                )
            )

        layers.append(
            ResBlock(
                self.in_channels,
                planes,
                i_downsample=ii_downsample,
                stride=stride
            )
        )

        self.in_channels = (
            planes * ResBlock.expansion
        )

        for _ in range(blocks - 1):

            layers.append(
                ResBlock(
                    self.in_channels,
                    planes
                )
            )

        return nn.Sequential(*layers)


def ResNet50(
    num_classes,
    channels=3
):

    return ResNet(
        Bottleneck,
        [3, 4, 6, 3],
        num_classes,
        channels
    )


# ============================================================
# LSTM
# ============================================================

class LSTMPyTorch(nn.Module):

    def __init__(self):

        super().__init__()

        self.lstm1 = nn.LSTM(
            input_size=512,
            hidden_size=512,
            batch_first=True,
            bidirectional=False
        )

        self.lstm2 = nn.LSTM(
            input_size=512,
            hidden_size=256,
            batch_first=True,
            bidirectional=False
        )

        self.fc = nn.Linear(
            256,
            7
        )

        self.softmax = nn.Softmax(
            dim=1
        )

    def forward(self, x):

        x, _ = self.lstm1(x)

        x, _ = self.lstm2(x)

        x = self.fc(
            x[:, -1, :]
        )

        x = self.softmax(x)

        return x


# ============================================================
# PREPROCESSING
# ============================================================

class PreprocessInput(torch.nn.Module):

    def forward(self, x):

        x = x.to(torch.float32)

        # RGB -> BGR
        x = torch.flip(
            x,
            dims=(0,)
        )

        x[0, :, :] -= 91.4953
        x[1, :, :] -= 103.8827
        x[2, :, :] -= 131.0912

        return x


preprocess = transforms.Compose([
    transforms.PILToTensor(),
    PreprocessInput()
])


def pth_processing(image):

    image = image.resize(
        (224, 224),
        Image.Resampling.NEAREST
    )

    image = preprocess(image)

    image = torch.unsqueeze(
        image,
        0
    )

    return image


# ============================================================
# FACE BOX
# ============================================================

def norm_coordinates(
    normalized_x,
    normalized_y,
    image_width,
    image_height
):

    x_px = min(
        math.floor(
            normalized_x * image_width
        ),
        image_width - 1
    )

    y_px = min(
        math.floor(
            normalized_y * image_height
        ),
        image_height - 1
    )

    return x_px, y_px


def get_box(
    face_landmarks,
    width,
    height
):

    coordinates = []

    for landmark in face_landmarks.landmark:

        x, y = norm_coordinates(
            landmark.x,
            landmark.y,
            width,
            height
        )

        coordinates.append(
            (x, y)
        )

    coordinates = np.asarray(
        coordinates
    )

    x_min = np.min(
        coordinates[:, 0]
    )

    y_min = np.min(
        coordinates[:, 1]
    )

    x_max = np.max(
        coordinates[:, 0]
    )

    y_max = np.max(
        coordinates[:, 1]
    )

    start_x = max(
        0,
        int(x_min)
    )

    start_y = max(
        0,
        int(y_min)
    )

    end_x = min(
        width - 1,
        int(x_max)
    )

    end_y = min(
        height - 1,
        int(y_max)
    )

    return (
        start_x,
        start_y,
        end_x,
        end_y
    )


# ============================================================
# EMOTION LABELS
# ============================================================

DICT_EMO = {

    0: "Neutral",
    1: "Happiness",
    2: "Sadness",
    3: "Surprise",
    4: "Fear",
    5: "Disgust",
    6: "Anger"

}


# ============================================================
# LOAD MODELS
# ============================================================

print("\nLoading ResNet50 backbone...")

backbone = ResNet50(
    7,
    channels=3
)

backbone_path = (
    MODEL_DIR
    + "\\"
    + BACKBONE_FILE
)

backbone.load_state_dict(
    torch.load(
        backbone_path,
        map_location=DEVICE
    )
)

backbone = backbone.to(
    DEVICE
)

backbone.eval()

print("Backbone loaded.")


print(
    f"\nLoading LSTM: {LSTM_DATASET}"
)

lstm = LSTMPyTorch()

lstm_path = (
    MODEL_DIR
    + "\\"
    + LSTM_FILE
)

lstm.load_state_dict(
    torch.load(
        lstm_path,
        map_location=DEVICE
    )
)

lstm = lstm.to(
    DEVICE
)

lstm.eval()

print("LSTM loaded.")


# ============================================================
# MEDIAPIPE
# ============================================================

mp_face_mesh = mp.solutions.face_mesh


# ============================================================
# WEBCAM
# ============================================================

cap = cv2.VideoCapture(0)

if not cap.isOpened():

    raise RuntimeError(
        "Could not open webcam."
    )


w = int(
    cap.get(
        cv2.CAP_PROP_FRAME_WIDTH
    )
)

h = int(
    cap.get(
        cv2.CAP_PROP_FRAME_HEIGHT
    )
)


# ============================================================
# TEMPORAL BUFFER
# ============================================================

lstm_features = []


# ============================================================
# STATISTICS
# ============================================================

frame_count = 0

total_processing_time = 0.0

last_emotion = "Waiting..."

last_confidence = 0.0

last_probabilities = None


# ============================================================
# FACE MESH
# ============================================================

with mp_face_mesh.FaceMesh(

    max_num_faces=1,

    refine_landmarks=False,

    min_detection_confidence=0.5,

    min_tracking_confidence=0.5

) as face_mesh:

    print("\n" + "=" * 65)
    print("WEBCAM STARTED")
    print("=" * 65)
    print("Q = Quit")
    print("P = Print emotion probabilities")
    print("=" * 65)

    while cap.isOpened():

        t1 = time.time()

        success, frame = cap.read()

        if not success or frame is None:

            break

        frame_count += 1

        frame_copy = frame.copy()

        # ====================================================
        # FACE DETECTION
        # ====================================================

        frame_copy.flags.writeable = False

        frame_rgb = cv2.cvtColor(
            frame_copy,
            cv2.COLOR_BGR2RGB
        )

        results = face_mesh.process(
            frame_rgb
        )

        frame_copy.flags.writeable = True

        # ====================================================
        # FACE FOUND
        # ====================================================

        if results.multi_face_landmarks:

            for face_landmarks in results.multi_face_landmarks:

                startX, startY, endX, endY = get_box(
                    face_landmarks,
                    w,
                    h
                )

                # --------------------------------------------
                # FACE CROP
                # --------------------------------------------

                cur_face = frame_rgb[
                    startY:endY,
                    startX:endX
                ]

                if cur_face.size == 0:

                    continue

                # --------------------------------------------
                # PREPROCESS
                # --------------------------------------------

                cur_face = pth_processing(
                    Image.fromarray(
                        cur_face
                    )
                )

                cur_face = cur_face.to(
                    DEVICE
                )

                # --------------------------------------------
                # RESNET FEATURES
                # --------------------------------------------

                with torch.no_grad():

                    features = backbone.extract_features(
                        cur_face
                    )

                    features = F.relu(
                        features
                    )

                # --------------------------------------------
                # CPU NUMPY BUFFER
                # --------------------------------------------

                features = (
                    features
                    .detach()
                    .cpu()
                    .numpy()
                )

                # --------------------------------------------
                # 10-FRAME BUFFER
                # --------------------------------------------

                if len(lstm_features) == 0:

                    lstm_features = [
                        features
                    ] * SEQUENCE_LENGTH

                else:

                    lstm_features = (
                        lstm_features[1:]
                        + [features]
                    )

                # --------------------------------------------
                # CREATE LSTM INPUT
                # --------------------------------------------

                lstm_input = torch.from_numpy(
                    np.vstack(
                        lstm_features
                    )
                )

                lstm_input = torch.unsqueeze(
                    lstm_input,
                    0
                )

                lstm_input = lstm_input.to(
                    DEVICE
                )

                # --------------------------------------------
                # LSTM
                # --------------------------------------------

                with torch.no_grad():

                    output = lstm(
                        lstm_input
                    )

                probabilities = (
                    output[0]
                    .detach()
                    .cpu()
                    .numpy()
                )

                # --------------------------------------------
                # PREDICTION
                # --------------------------------------------

                prediction = np.argmax(
                    probabilities
                )

                confidence = probabilities[
                    prediction
                ]

                emotion = DICT_EMO[
                    prediction
                ]

                last_emotion = emotion

                last_confidence = confidence

                last_probabilities = probabilities

                # --------------------------------------------
                # DRAW FACE
                # --------------------------------------------

                cv2.rectangle(
                    frame,
                    (startX, startY),
                    (endX, endY),
                    (255, 0, 255),
                    3
                )

                # --------------------------------------------
                # LABEL
                # --------------------------------------------

                label = (
                    f"{emotion} "
                    f"{confidence:.1%}"
                )

                cv2.putText(

                    frame,

                    label,

                    (
                        startX,
                        max(
                            30,
                            startY - 10
                        )
                    ),

                    cv2.FONT_HERSHEY_SIMPLEX,

                    0.8,

                    (255, 0, 255),

                    2

                )

        # ====================================================
        # FPS
        # ====================================================

        t2 = time.time()

        processing_time = t2 - t1

        total_processing_time += (
            processing_time
        )

        if processing_time > 0:

            fps = (
                1.0 /
                processing_time
            )

        else:

            fps = 0

        # ====================================================
        # UI
        # ====================================================

        cv2.putText(

            frame,

            f"FPS: {fps:.1f}",

            (20, 35),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.8,

            (255, 255, 255),

            2

        )

        cv2.putText(

            frame,

            f"Model: {LSTM_DATASET}",

            (20, 65),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.6,

            (255, 255, 255),

            2

        )

        cv2.putText(

            frame,

            f"Device: {DEVICE}",

            (20, 90),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.6,

            (255, 255, 255),

            2

        )

        # ====================================================
        # SHOW
        # ====================================================

        cv2.imshow(
            "PS 094 - Video Emotion",
            frame
        )

        # ====================================================
        # KEYBOARD
        # ====================================================

        key = (
            cv2.waitKey(1)
            & 0xFF
        )

        if key == ord("q"):

            break

        if (
            key == ord("p")
            and last_probabilities
            is not None
        ):

            print("\n")
            print("=" * 45)
            print("EMOTION PROBABILITIES")
            print("=" * 45)

            for idx, probability in enumerate(
                last_probabilities
            ):

                print(
                    f"{DICT_EMO[idx]:<12}"
                    f": {probability:.4f}"
                    f" ({probability:.1%})"
                )

            print("=" * 45)


# ============================================================
# CLEANUP
# ============================================================

cap.release()

cv2.destroyAllWindows()


# ============================================================
# SUMMARY
# ============================================================

print("\n")
print("=" * 65)
print("SESSION SUMMARY")
print("=" * 65)

print(
    f"Frames processed : {frame_count}"
)

if frame_count > 0:

    avg_time = (
        total_processing_time
        / frame_count
    )

    avg_fps = (
        1.0 / avg_time
        if avg_time > 0
        else 0
    )

    print(
        f"Average FPS     : {avg_fps:.2f}"
    )

    print(
        f"Avg frame time  : {avg_time * 1000:.2f} ms"
    )

print(
    f"Last emotion    : {last_emotion}"
)

print(
    f"Confidence      : {last_confidence:.2%}"
)

print(
    f"Device          : {DEVICE}"
)

print(
    f"LSTM model      : {LSTM_DATASET}"
)

print("=" * 65)