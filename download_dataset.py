import kagglehub
import os
import shutil

print("Downloading dataset...")
path = kagglehub.dataset_download("ikramali585/emergency-vs-non-emergency-vehicles")
print("Path to dataset files:", path)

# Let's list the contents of the downloaded dataset to understand its structure
print("\nDataset contents:")
for root, dirs, files in os.walk(path):
    level = root.replace(path, '').count(os.sep)
    indent = ' ' * 4 * (level)
    print(f"{indent}{os.path.basename(root)}/")
    subindent = ' ' * 4 * (level + 1)
    for f in files[:5]: # print at most 5 files per dir
        print(f"{subindent}{f}")
    if len(files) > 5:
        print(f"{subindent}...")
