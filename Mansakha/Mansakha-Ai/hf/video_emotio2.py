import os
import cv2
import math
import time
import warnings
import numpy as np

import torch
import torch.nn as nn
import torch.nn.functional as F

from PIL import Image
from torchvision import transforms

# ============================================================
# MEDIAPIPE COMPATIBILITY
# ============================================================

try:
    import mediapipe as mp
except ImportError:
    raise RuntimeError(
        "MediaPipe is not installed.\n"
        "Install it with:\n"
        "pip install mediapipe==0.10.21"
    )

# ============================================================
# CONFIGURATION
# ============================================================

MODEL_DIR = r"C:\Users\yukes\Downloads\hf\VideoEmotion"

# CHANGE THIS TO YOUR VIDEO
VIDEO_PATH = r"C:\Users\yukes\Downloads\test.mp4"

# Output video
OUTPUT_PATH = r"C:\Users\yukes\Downloads\hf\emotion_output.mp4"

BACKBONE_FILE = "FER_static_ResNet50_AffectNet.pt"

# Available temporal models in your folder may include:
#
# Aff-Wild2
# CREMA-D
# IEMOCAP
# RAMAS
# RAVDESS
# SAVEE

LSTM_DATASET = "Aff-Wild2"

LSTM_FILE = f"FER_dinamic_LSTM_{LSTM_DATASET}.pt"

SEQUENCE_LENGTH = 10

# Process every Nth frame.
# 1 = every frame
# 2 = every second frame
FRAME_STEP = 1

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
# DEVICE
# ============================================================

DEVICE = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)

print("=" * 70)
print("PS 094 - VIDEO EMOTION ANALYSIS")
print("=" * 70)

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

# ============================================================
# RESNET BLOCK
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

            identity = self.i_downsample(
                identity
            )

        x += identity

        x = self.relu(x)

        return x

# ============================================================
# SAME PADDING CONVOLUTION
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

# ============================================================
# RESNET50
# ============================================================

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
# LSTM MODEL
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

    image = preprocess(
        image
    )

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
# LOAD BACKBONE
# ============================================================

print()
print("Loading ResNet50 backbone...")

backbone = ResNet50(
    7,
    channels=3
)

backbone_path = os.path.join(
    MODEL_DIR,
    BACKBONE_FILE
)

if not os.path.exists(
    backbone_path
):

    raise FileNotFoundError(
        f"Backbone not found:\n{backbone_path}"
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

# ============================================================
# LOAD LSTM
# ============================================================

print()
print(
    f"Loading LSTM: {LSTM_DATASET}"
)

lstm = LSTMPyTorch()

lstm_path = os.path.join(
    MODEL_DIR,
    LSTM_FILE
)

if not os.path.exists(
    lstm_path
):

    raise FileNotFoundError(
        f"LSTM model not found:\n{lstm_path}"
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
# VIDEO CHECK
# ============================================================

if not os.path.exists(
    VIDEO_PATH
):

    raise FileNotFoundError(
        f"\nVideo not found:\n{VIDEO_PATH}\n\n"
        "Change VIDEO_PATH at the top of the script."
    )

cap = cv2.VideoCapture(
    VIDEO_PATH
)

if not cap.isOpened():

    raise RuntimeError(
        f"Could not open video:\n{VIDEO_PATH}"
    )

# ============================================================
# VIDEO INFORMATION
# ============================================================

fps = cap.get(
    cv2.CAP_PROP_FPS
)

if fps <= 0:

    fps = 30.0

total_frames = int(
    cap.get(
        cv2.CAP_PROP_FRAME_COUNT
    )
)

width = int(
    cap.get(
        cv2.CAP_PROP_FRAME_WIDTH
    )
)

height = int(
    cap.get(
        cv2.CAP_PROP_FRAME_HEIGHT
    )
)

duration = (
    total_frames / fps
    if fps > 0
    else 0
)

print()
print("=" * 70)
print("VIDEO INFORMATION")
print("=" * 70)

print(
    f"Input       : {VIDEO_PATH}"
)

print(
    f"Resolution  : {width} x {height}"
)

print(
    f"FPS         : {fps:.2f}"
)

print(
    f"Frames      : {total_frames}"
)

print(
    f"Duration    : {duration:.2f} seconds"
)

print(
    f"LSTM        : {LSTM_DATASET}"
)

print(
    f"Sequence    : {SEQUENCE_LENGTH} frames"
)

print("=" * 70)

# ============================================================
# OUTPUT VIDEO
# ============================================================

fourcc = cv2.VideoWriter_fourcc(
    *"mp4v"
)

writer = cv2.VideoWriter(
    OUTPUT_PATH,
    fourcc,
    fps,
    (width, height)
)

if not writer.isOpened():

    raise RuntimeError(
        f"Could not create output video:\n{OUTPUT_PATH}"
    )

# ============================================================
# MEDIAPIPE
# ============================================================

# This uses the classic MediaPipe API.
#
# If your installed MediaPipe does not expose
# mp.solutions, install:
#
# pip install mediapipe==0.10.21

if not hasattr(
    mp,
    "solutions"
):

    raise RuntimeError(
        "\nYour MediaPipe version does not expose "
        "'mp.solutions'.\n\n"
        "Run:\n"
        "python -m pip uninstall mediapipe -y\n"
        "python -m pip install mediapipe==0.10.21\n"
    )

mp_face_mesh = mp.solutions.face_mesh

# ============================================================
# TEMPORAL BUFFER
# ============================================================

lstm_features = []

# ============================================================
# STATISTICS
# ============================================================

frame_index = 0

processed_frames = 0

faces_detected = 0

emotion_counts = {
    emotion: 0
    for emotion in DICT_EMO.values()
}

emotion_history = []

start_time = time.time()

# ============================================================
# PROCESS VIDEO
# ============================================================

with mp_face_mesh.FaceMesh(

    max_num_faces=1,

    refine_landmarks=False,

    min_detection_confidence=0.5,

    min_tracking_confidence=0.5

) as face_mesh:

    while True:

        success, frame = cap.read()

        if not success:

            break

        frame_index += 1

        # ----------------------------------------------------
        # Frame skipping
        # ----------------------------------------------------

        if (
            FRAME_STEP > 1
            and frame_index % FRAME_STEP != 0
        ):

            writer.write(frame)

            continue

        processed_frames += 1

        # ----------------------------------------------------
        # Original frame
        # ----------------------------------------------------

        display_frame = frame.copy()

        frame_height, frame_width = frame.shape[:2]

        # ----------------------------------------------------
        # BGR -> RGB
        # ----------------------------------------------------

        frame_rgb = cv2.cvtColor(
            frame,
            cv2.COLOR_BGR2RGB
        )

        # ----------------------------------------------------
        # MediaPipe
        # ----------------------------------------------------

        results = face_mesh.process(
            frame_rgb
        )

        # ----------------------------------------------------
        # Face detected
        # ----------------------------------------------------

        if results.multi_face_landmarks:

            faces_detected += 1

            face_landmarks = (
                results.multi_face_landmarks[0]
            )

            # ------------------------------------------------
            # Face bounding box
            # ------------------------------------------------

            startX, startY, endX, endY = get_box(
                face_landmarks,
                frame_width,
                frame_height
            )

            # Make sure coordinates are valid
            startX = max(
                0,
                min(
                    startX,
                    frame_width - 1
                )
            )

            startY = max(
                0,
                min(
                    startY,
                    frame_height - 1
                )
            )

            endX = max(
                startX + 1,
                min(
                    endX,
                    frame_width
                )
            )

            endY = max(
                startY + 1,
                min(
                    endY,
                    frame_height
                )
            )

            # ------------------------------------------------
            # Crop face
            # ------------------------------------------------

            cur_face = frame_rgb[
                startY:endY,
                startX:endX
            ]

            if cur_face.size > 0:

                # --------------------------------------------
                # Convert to PIL
                # --------------------------------------------

                face_image = Image.fromarray(
                    cur_face
                )

                # --------------------------------------------
                # Preprocess
                # --------------------------------------------

                input_tensor = pth_processing(
                    face_image
                )

                input_tensor = input_tensor.to(
                    DEVICE
                )

                # --------------------------------------------
                # ResNet feature extraction
                # --------------------------------------------

                with torch.no_grad():

                    features = (
                        backbone.extract_features(
                            input_tensor
                        )
                    )

                    features = F.relu(
                        features
                    )

                # --------------------------------------------
                # Convert to numpy
                # --------------------------------------------

                features = (
                    features
                    .detach()
                    .cpu()
                    .numpy()
                )

                # --------------------------------------------
                # Add feature to sequence
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
                # Stack sequence
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
                # LSTM prediction
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
                # Prediction
                # --------------------------------------------

                prediction = int(
                    np.argmax(
                        probabilities
                    )
                )

                confidence = float(
                    probabilities[
                        prediction
                    ]
                )

                emotion = DICT_EMO[
                    prediction
                ]

                emotion_counts[
                    emotion
                ] += 1

                emotion_history.append({
                    "frame": frame_index,
                    "time": frame_index / fps,
                    "emotion": emotion,
                    "confidence": confidence,
                    "probabilities": probabilities.copy()
                })

                # ------------------------------------------------
                # Draw face
                # ------------------------------------------------

                cv2.rectangle(

                    display_frame,

                    (startX, startY),

                    (endX, endY),

                    (255, 0, 255),

                    3

                )

                # ------------------------------------------------
                # Emotion label
                # ------------------------------------------------

                label = (
                    f"{emotion}: "
                    f"{confidence * 100:.1f}%"
                )

                cv2.putText(

                    display_frame,

                    label,

                    (
                        startX,
                        max(
                            35,
                            startY - 10
                        )
                    ),

                    cv2.FONT_HERSHEY_SIMPLEX,

                    0.8,

                    (255, 0, 255),

                    2

                )

                # ------------------------------------------------
                # Top probabilities
                # ------------------------------------------------

                sorted_indices = np.argsort(
                    probabilities
                )[::-1]

                for rank, idx in enumerate(
                    sorted_indices[:3]
                ):

                    prob_text = (
                        f"{DICT_EMO[int(idx)]}: "
                        f"{probabilities[idx] * 100:.1f}%"
                    )

                    cv2.putText(

                        display_frame,

                        prob_text,

                        (
                            20,
                            35 + rank * 28
                        ),

                        cv2.FONT_HERSHEY_SIMPLEX,

                        0.65,

                        (255, 255, 255),

                        2

                    )

        else:

            # ------------------------------------------------
            # No face
            # ------------------------------------------------

            cv2.putText(

                display_frame,

                "No face detected",

                (20, 40),

                cv2.FONT_HERSHEY_SIMPLEX,

                0.8,

                (0, 0, 255),

                2

            )

        # ====================================================
        # STATUS
        # ====================================================

        progress = (
            frame_index / total_frames * 100
            if total_frames > 0
            else 0
        )

        elapsed = (
            time.time()
            - start_time
        )

        processing_fps = (
            processed_frames / elapsed
            if elapsed > 0
            else 0
        )

        cv2.putText(

            display_frame,

            f"Progress: {progress:.1f}%",

            (
                20,
                height - 70
            ),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.6,

            (255, 255, 255),

            2

        )

        cv2.putText(

            display_frame,

            f"Processing FPS: {processing_fps:.1f}",

            (
                20,
                height - 45
            ),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.6,

            (255, 255, 255),

            2

        )

        cv2.putText(

            display_frame,

            f"Model: {LSTM_DATASET}",

            (
                20,
                height - 20
            ),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.55,

            (255, 255, 255),

            2

        )

        # ====================================================
        # WRITE OUTPUT
        # ====================================================

        writer.write(
            display_frame
        )

        # ====================================================
        # CONSOLE PROGRESS
        # ====================================================

        if frame_index % 30 == 0:

            print(
                f"\rProcessing: "
                f"{progress:6.2f}% | "
                f"Frame: "
                f"{frame_index}/{total_frames} | "
                f"Faces: "
                f"{faces_detected} | "
                f"FPS: "
                f"{processing_fps:.2f}",
                end=""
            )

# ============================================================
# CLEANUP
# ============================================================

cap.release()

writer.release()

# ============================================================
# SUMMARY
# ============================================================

print()
print()
print("=" * 70)
print("VIDEO PROCESSING COMPLETE")
print("=" * 70)

print(
    f"Input video       : {VIDEO_PATH}"
)

print(
    f"Output video      : {OUTPUT_PATH}"
)

print(
    f"Frames processed  : {processed_frames}"
)

print(
    f"Faces detected    : {faces_detected}"
)

print(
    f"LSTM model        : {LSTM_DATASET}"
)

print()

print("EMOTION DISTRIBUTION")
print("-" * 40)

total_predictions = sum(
    emotion_counts.values()
)

for emotion, count in emotion_counts.items():

    percentage = (
        count / total_predictions * 100
        if total_predictions > 0
        else 0
    )

    print(
        f"{emotion:<12} "
        f"{count:>6} "
        f"({percentage:>6.2f}%)"
    )

print()

if total_predictions > 0:

    dominant_emotion = max(
        emotion_counts,
        key=emotion_counts.get
    )

    print(
        f"Dominant emotion : "
        f"{dominant_emotion}"
    )

else:

    print(
        "Dominant emotion : "
        "No predictions"
    )

elapsed_total = (
    time.time()
    - start_time
)

print(
    f"Processing time   : "
    f"{elapsed_total:.2f} seconds"
)

if elapsed_total > 0:

    print(
        f"Average FPS      : "
        f"{processed_frames / elapsed_total:.2f}"
    )

print("=" * 70)