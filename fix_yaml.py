"""
Utility to verify and update bdd100k.yaml paths for YOLOv5.
"""

import os
import yaml

workspace_dir = os.path.dirname(os.path.abspath(__file__))
dataset_dir = os.path.join(workspace_dir, "dataset_bdd100k")
yaml_path = os.path.join(dataset_dir, "bdd100k.yaml")

if not os.path.exists(yaml_path):
    print(f"Warning: {yaml_path} not found. Please run download_dataset.py first.")
    exit(1)

with open(yaml_path, 'r', encoding='utf-8') as f:
    data = yaml.safe_load(f)

# Ensure absolute path with forward slashes for YOLOv5 compatibility
data['path'] = os.path.abspath(dataset_dir).replace('\\', '/')
data['train'] = 'images/train'
data['val'] = 'images/val'

with open(yaml_path, 'w', encoding='utf-8') as f:
    yaml.dump(data, f, default_flow_style=False, sort_keys=False)

print(f"Verified and updated {yaml_path} successfully.")
print(f"Dataset root: {data['path']}")
