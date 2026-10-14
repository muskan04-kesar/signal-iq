"""
Run YOLOv5 object detection inference on BDD100K images or custom input.
"""

import os
import glob
import argparse
import subprocess

def main():
    parser = argparse.ArgumentParser(description="Run YOLOv5 inference")
    parser.add_argument(
        "--source",
        type=str,
        default=None,
        help="Path to an image, directory, or video. Defaults to a sample image from dataset_bdd100k/images/val"
    )
    parser.add_argument(
        "--weights",
        type=str,
        default=None,
        help="Path to model weights. Defaults to the latest yolov5/runs/train/exp*/weights/best.pt or yolov5s.pt"
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=0.25,
        help="Confidence threshold (default: 0.25)"
    )
    args = parser.parse_args()

    # Determine weights
    weights_path = args.weights
    if not weights_path:
        train_runs = glob.glob(r"yolov5\runs\train\*\weights\best.pt")
        if train_runs:
            train_runs.sort(key=os.path.getmtime, reverse=True)
            weights_path = train_runs[0]
        else:
            weights_path = r"yolov5\runs\train\exp\weights\best.pt"

    if not os.path.exists(weights_path):
        print(f"Custom trained weights not found at {weights_path}.")
        print("Falling back to pretrained yolov5s.pt...")
        weights_path = "yolov5s.pt"

    # Determine data yaml
    data_yaml = os.path.join("dataset_bdd100k", "bdd100k.yaml")

    # Determine input source
    source = args.source
    if not source:
        dataset_val_images = os.path.join("dataset_bdd100k", "images", "val")
        if not os.path.exists(dataset_val_images):
            dataset_val_images = os.path.join("dataset_bdd100k", "images", "train")

        image_files = (
            glob.glob(os.path.join(dataset_val_images, "*.jpg")) +
            glob.glob(os.path.join(dataset_val_images, "*.jpeg")) +
            glob.glob(os.path.join(dataset_val_images, "*.png"))
        )

        if not image_files:
            # Fallback to yolov5 sample data
            fallback_img = os.path.join("yolov5", "data", "images", "bus.jpg")
            if os.path.exists(fallback_img):
                source = fallback_img
            else:
                print("Could not find any images in dataset_bdd100k or yolov5/data/images.")
                print("Please run download_dataset.py first or specify an image with --source <path>")
                exit(1)
        else:
            source = image_files[0]

    print(f"\nRunning YOLOv5 inference:")
    print(f"  Source:  {source}")
    print(f"  Weights: {weights_path}")
    print(f"  Conf:    {args.conf}")

    cmd = [
        "py", r"yolov5\detect.py",
        "--weights", weights_path,
        "--source", source,
        "--conf", str(args.conf),
    ]
    if os.path.exists(data_yaml) and weights_path != "yolov5s.pt":
        cmd.extend(["--data", data_yaml])

    subprocess.run(cmd)
    print("\nInference complete! Output saved in yolov5/runs/detect/")

if __name__ == "__main__":
    main()
