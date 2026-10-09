import yaml
import os

yaml_path = r"C:\Users\H P\.cache\kagglehub\datasets\ikramali585\emergency-vs-non-emergency-vehicles\versions\1\data.yaml"
base_dir = r"C:/Users/H P/.cache/kagglehub/datasets/ikramali585/emergency-vs-non-emergency-vehicles/versions/1"

with open(yaml_path, 'r') as f:
    data = yaml.safe_load(f)

data['train'] = os.path.join(base_dir, 'train').replace('\\', '/')
data['val'] = os.path.join(base_dir, 'val').replace('\\', '/')

with open(yaml_path, 'w') as f:
    yaml.dump(data, f, default_flow_style=False)

print("Updated data.yaml successfully.")
