# Download face-api.js models
# Run this script from the project root: .\scripts\download-models.ps1

$modelsDir = "public\models"

# Create models directory if it doesn't exist
if (!(Test-Path $modelsDir)) {
    New-Item -ItemType Directory -Path $modelsDir -Force
}

# Base URL for face-api.js models
$baseUrl = "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"

# Models to download
$models = @(
    "ssd_mobilenetv1_model-shard1",
    "ssd_mobilenetv1_model-shard2",
    "ssd_mobilenetv1_model-weights_manifest.json",
    "face_landmark_68_model-shard1",
    "face_landmark_68_model-weights_manifest.json",
    "face_recognition_model-shard1",
    "face_recognition_model-shard2",
    "face_recognition_model-weights_manifest.json"
)

Write-Host "Downloading face-api.js models to $modelsDir..."

foreach ($model in $models) {
    $url = "$baseUrl/$model"
    $output = "$modelsDir\$model"
    
    Write-Host "Downloading $model..."
    try {
        Invoke-WebRequest -Uri $url -OutFile $output -UseBasicParsing
        Write-Host "  Done" -ForegroundColor Green
    }
    catch {
        Write-Host "  Failed: $_" -ForegroundColor Red
    }
}

Write-Host "Complete! Models saved to $modelsDir" -ForegroundColor Green
