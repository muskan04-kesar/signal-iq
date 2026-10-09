import os
import glob
import subprocess

# Paths
# Dynamically find the most recent training run that has weights
train_runs = glob.glob(r"yolov5\runs\train\exp*\weights\best.pt")
if train_runs:
    # Sort by modification time to get the newest
    train_runs.sort(key=os.path.getmtime, reverse=True)
    weights_path = train_runs[0]
else:
    weights_path = r"yolov5\runs\train\exp\weights\best.pt"

# Fallback to the pretrained model if training hasn't finished
if not os.path.exists(weights_path):
    print(f"Custom trained weights not found at {weights_path}.")
    print("Using the default yolov5s.pt model for demonstration...")
    weights_path = "yolov5s.pt"

# Let's pick a random validation image from the dataset to test on
dataset_val_images = r"C:\Users\H P\.cache\kagglehub\datasets\ikramali585\emergency-vs-non-emergency-vehicles\versions\1\val\images"
image_files = glob.glob(os.path.join(dataset_val_images, "*.jpg")) + \
              glob.glob(os.path.join(dataset_val_images, "*.jpeg")) + \
              glob.glob(os.path.join(dataset_val_images, "*.png"))

if not image_files:
    print(f"Could not find any images in {dataset_val_images}.")
    print("Please provide a path to an image manually.")
    exit(1)

test_image = image_files[0] # Just pick the first one

print(f"Running inference on: {test_image}")
print(f"Using weights: {weights_path}")

# Run YOLOv5 detect.py script
cmd = [
    "py", r"yolov5\detect.py",
    "--weights", weights_path,
    "--source", test_image,
    "--conf", "0.25",  # Confidence threshold
]

subprocess.run(cmd)

print("\nInference complete! Check the yolov5/runs/detect folder for the output image.")
