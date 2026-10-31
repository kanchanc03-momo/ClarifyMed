# ClarifyMed Demo Sample Images

This directory provides ready-to-use sample clinical test images for testing ClarifyMed's AI analysis pipelines.

---

## 1. Pediatric Wrist X-rays (YOLOv8 Detection)

Located directly in:  
`c:\Users\HP\ClarifyMed\samples\wrist_xrays\`

Included test fixtures from the GRAZPEDWRI-DX benchmark:
1. `0195_0920972576_01_WRI-L2_M010.png` — Pediatric wrist X-ray
2. `0296_0388544204_01_WRI-L2_F005.png` — Pediatric wrist X-ray
3. `0378_0753639905_02_WRI-L1_F013.png` — Pediatric wrist X-ray with fracture
4. `0391_0714864135_01_WRI-L1_M015.png` — Pediatric wrist X-ray

### How to test:
- Open http://localhost:5173
- Select **Pediatric wrist X-ray**
- Drag and drop any of the above `.png` images
- Click **Analyze X-ray**

---

## 2. Diabetic Retinopathy Fundus Images (EfficientNet-B0)

You can obtain retinal fundus images from the following trusted open datasets:

### Option A: From your Google Colab / Kaggle APTOS 2019 Dataset
Since you trained your model using the APTOS 2019 dataset:
1. Go to your **Google Colab** session or [Kaggle APTOS 2019 Blindness Detection](https://www.kaggle.com/c/aptos2019-blindness-detection/data).
2. Open the `train_images/` folder.
3. Download any 2–3 sample images, for example:
   - `000c1434d8d7.png` (Grade 2 - Moderate)
   - `001639a390f0.png` (Grade 4 - Proliferative DR)
   - `002473974a4c.png` (Grade 3 - Severe)
   - `002c21358ce6.png` (Grade 0 - No DR)
4. Place them in `c:\Users\HP\ClarifyMed\samples\retinopathy\` for easy drag-and-drop.

### Option B: Open Access Benchmarks & Repositories
- **Kaggle APTOS 2019:** [https://www.kaggle.com/c/aptos2019-blindness-detection](https://www.kaggle.com/c/aptos2019-blindness-detection)
- **IDRiD (Indian Diabetic Retinopathy Image Dataset):** [https://idrid.grand-challenge.org/](https://idrid.grand-challenge.org/)
- **MESSIDOR-2 Open Research Dataset:** [https://www.adcis.net/en/third-party/messidor2/](https://www.adcis.net/en/third-party/messidor2/)
- **Wikimedia Commons (Instant Free Clinical Samples):** Search for `Diabetic retinopathy fundus photograph` or `Normal fundus photograph`.

### How to test:
- Open http://localhost:5173
- Select **Diabetic retinopathy screening**
- Drag and drop any retinal fundus image (`.png` or `.jpg`)
- Click **Analyze Retinal Photo** to generate the ICDR grade (0-4) and Grad-CAM lesion heatmap!
