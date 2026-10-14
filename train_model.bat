@echo off
echo ========================================================
echo Starting YOLOv5 Training with BDD100k Dataset
echo ========================================================

if not exist "dataset_bdd100k\bdd100k.yaml" (
    echo Dataset configuration not found at dataset_bdd100k\bdd100k.yaml!
    echo Running download_dataset.py to prepare the dataset first...
    py download_dataset.py --num-samples 1000
)

echo Starting YOLOv5 training on BDD100k...
py yolov5\train.py --img 640 --batch 4 --epochs 10 --workers 0 --data "dataset_bdd100k\bdd100k.yaml" --weights yolov5s.pt
echo Training complete! Weights saved to yolov5\runs\train\
pause
