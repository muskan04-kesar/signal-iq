@echo off
echo Starting YOLOv5 training...
py yolov5\train.py --img 640 --batch 4 --epochs 50 --workers 0 --data "C:\Users\H P\.cache\kagglehub\datasets\ikramali585\emergency-vs-non-emergency-vehicles\versions\1\data.yaml" --weights yolov5s.pt
echo Training complete.
