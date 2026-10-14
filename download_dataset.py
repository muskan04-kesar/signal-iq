"""
Download and prepare the BDD100k dataset from Hugging Face (dgural/bdd100k)
for YOLOv5 object detection training and inference.
"""

import os
import sys
import json
import argparse
import urllib.request
import requests
from requests.adapters import HTTPAdapter
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm import tqdm
import yaml

# 13 Object Detection Classes in BDD100K
BDD_CLASSES = [
    'bicycle',
    'bus',
    'car',
    'motorcycle',
    'other person',
    'other vehicle',
    'pedestrian',
    'rider',
    'traffic light',
    'traffic sign',
    'trailer',
    'train',
    'truck'
]
CLASS_TO_IDX = {name: i for i, name in enumerate(BDD_CLASSES)}

HF_REPO_ID = "dgural/bdd100k"
SAMPLES_JSON_URL = f"https://huggingface.co/datasets/{HF_REPO_ID}/resolve/main/samples.json"
BASE_IMAGE_URL = f"https://huggingface.co/datasets/{HF_REPO_ID}/resolve/main/"


def get_samples_metadata(cache_dir):
    """Ensure samples.json is downloaded and return loaded data."""
    os.makedirs(cache_dir, exist_ok=True)
    local_samples_path = os.path.join(cache_dir, "samples.json")

    # Check huggingface_hub default cache first if exists
    hf_cache_snapshot = os.path.expanduser(
        r"~/.cache/huggingface/hub/datasets--dgural--bdd100k/snapshots"
    )
    if os.path.exists(hf_cache_snapshot):
        for snap in os.listdir(hf_cache_snapshot):
            candidate = os.path.join(hf_cache_snapshot, snap, "samples.json")
            if os.path.exists(candidate) and os.path.getsize(candidate) > 1000000:
                print(f"Found existing cached samples.json at: {candidate}")
                with open(candidate, "r", encoding="utf-8") as f:
                    return json.load(f)["samples"]

    if os.path.exists(local_samples_path) and os.path.getsize(local_samples_path) > 1000000:
        print(f"Using local samples.json: {local_samples_path}")
    else:
        print("Downloading samples.json metadata (~67 MB) from Hugging Face...")
        with requests.get(SAMPLES_JSON_URL, stream=True) as r:
            r.raise_for_status()
            total_size = int(r.headers.get("content-length", 0))
            with open(local_samples_path, "wb") as f, tqdm(
                total=total_size, unit="B", unit_scale=True, desc="samples.json"
            ) as pbar:
                for chunk in r.iter_content(chunk_size=65536):
                    f.write(chunk)
                    pbar.update(len(chunk))

    with open(local_samples_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["samples"]


def convert_detections_to_yolo(detections):
    """
    Convert FiftyOne bounding boxes [x, y, w, h] (normalized top-left)
    to YOLO format: <class_id> <x_center> <y_center> <width> <height>
    """
    yolo_lines = []
    for det in detections:
        label = det.get("label")
        if label not in CLASS_TO_IDX:
            continue
        cls_id = CLASS_TO_IDX[label]
        bbox = det.get("bounding_box", [])
        if len(bbox) != 4:
            continue

        x, y, w, h = bbox
        # FiftyOne: x, y is top-left, w, h is width and height
        x_center = max(0.0, min(1.0, x + w / 2.0))
        y_center = max(0.0, min(1.0, y + h / 2.0))
        w_clamped = max(0.0, min(1.0, w))
        h_clamped = max(0.0, min(1.0, h))

        # Skip invalid or 0-area boxes
        if w_clamped <= 0 or h_clamped <= 0:
            continue

        yolo_lines.append(f"{cls_id} {x_center:.6f} {y_center:.6f} {w_clamped:.6f} {h_clamped:.6f}")
    return yolo_lines


def download_single_image(session, rel_filepath, target_img_path):
    """Download a single image file if not already present."""
    if os.path.exists(target_img_path) and os.path.getsize(target_img_path) > 0:
        return True

    url = BASE_IMAGE_URL + rel_filepath.replace("\\", "/")
    for attempt in range(3):
        try:
            resp = session.get(url, timeout=20)
            if resp.status_code == 200:
                with open(target_img_path, "wb") as f:
                    f.write(resp.content)
                return True
        except Exception:
            if attempt == 2:
                return False
    return False


def build_dataset(samples, dest_dir, num_samples=1000, split_ratio=0.8, max_workers=16):
    """
    Download images and write YOLO label txt files and data.yaml.
    """
    if num_samples and num_samples > 0:
        samples = samples[:num_samples]
    total = len(samples)
    print(f"\nPreparing {total} samples for YOLOv5 format...")

    split_idx = int(total * split_ratio)
    train_samples = samples[:split_idx]
    val_samples = samples[split_idx:]
    print(f"Split: {len(train_samples)} train images, {len(val_samples)} validation images.")

    # Create directories
    for split in ["train", "val"]:
        os.makedirs(os.path.join(dest_dir, "images", split), exist_ok=True)
        os.makedirs(os.path.join(dest_dir, "labels", split), exist_ok=True)

    session = requests.Session()
    adapter = HTTPAdapter(pool_connections=max_workers, pool_maxsize=max_workers, max_retries=3)
    session.mount("https://", adapter)
    session.mount("http://", adapter)

    tasks = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        for split, split_items in [("train", train_samples), ("val", val_samples)]:
            for item in split_items:
                rel_path = item["filepath"]
                filename = os.path.basename(rel_path)
                stem = os.path.splitext(filename)[0]

                target_img_path = os.path.join(dest_dir, "images", split, filename)
                target_label_path = os.path.join(dest_dir, "labels", split, f"{stem}.txt")

                # Generate label file immediately from metadata
                dets = item.get("detections", {}).get("detections", [])
                lines = convert_detections_to_yolo(dets)
                with open(target_label_path, "w", encoding="utf-8") as lf:
                    lf.write("\n".join(lines) + ("\n" if lines else ""))

                # Queue image download
                tasks.append(
                    executor.submit(download_single_image, session, rel_path, target_img_path)
                )

        print("\nDownloading images in parallel...")
        success_count = 0
        with tqdm(total=len(tasks), desc="Downloading images", unit="img") as pbar:
            for future in as_completed(tasks):
                if future.result():
                    success_count += 1
                pbar.update(1)

    print(f"Successfully prepared {success_count}/{len(tasks)} images and labels.")

    # Generate data.yaml
    yaml_path = os.path.join(dest_dir, "bdd100k.yaml")
    abs_dest_dir = os.path.abspath(dest_dir).replace("\\", "/")

    yaml_content = {
        "path": abs_dest_dir,
        "train": "images/train",
        "val": "images/val",
        "nc": len(BDD_CLASSES),
        "names": {i: name for i, name in enumerate(BDD_CLASSES)}
    }

    with open(yaml_path, "w", encoding="utf-8") as yf:
        yaml.dump(yaml_content, yf, default_flow_style=False, sort_keys=False)

    print(f"\nCreated dataset configuration at: {yaml_path}")
    return yaml_path


def main():
    parser = argparse.ArgumentParser(description="Download & prepare BDD100K dataset for YOLOv5")
    parser.add_argument(
        "--num-samples",
        type=int,
        default=1000,
        help="Number of samples to prepare (default: 1000). Use --all to process all 10,000."
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Download and process all 10,000 samples from the dataset."
    )
    parser.add_argument(
        "--dest-dir",
        type=str,
        default="dataset_bdd100k",
        help="Directory to save the formatted YOLO dataset (default: dataset_bdd100k)"
    )
    parser.add_argument(
        "--split",
        type=float,
        default=0.8,
        help="Train/Val split ratio (default: 0.8 for 80%% train, 20%% val)"
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=16,
        help="Number of parallel download threads (default: 16)"
    )

    args = parser.parse_args()
    num_samples = 0 if args.all else args.num_samples

    print("=" * 60)
    print("BDD100K Dataset Preparation for YOLOv5")
    print(f"Source: https://huggingface.co/datasets/{HF_REPO_ID}")
    print(f"Target Directory: {os.path.abspath(args.dest_dir)}")
    print(f"Samples: {'All 10,000' if num_samples == 0 else num_samples}")
    print("=" * 60)

    cache_dir = os.path.join(args.dest_dir, ".cache")
    samples = get_samples_metadata(cache_dir)
    yaml_path = build_dataset(
        samples,
        dest_dir=args.dest_dir,
        num_samples=num_samples,
        split_ratio=args.split,
        max_workers=args.workers
    )

    print("\n" + "=" * 60)
    print("Setup completed successfully!")
    print(f"You can now train YOLOv5 using: {yaml_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()
