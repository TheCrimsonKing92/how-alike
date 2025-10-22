#!/bin/bash

# Select diverse age samples from UTKFace uncropped dataset
# Target: 2-3 images per age group for good coverage

OUTPUT_DIR="calibration-images"
mkdir -p "$OUTPUT_DIR"

# Find all images across all parts
ALL_IMAGES=$(find utkface-uncropped -name "*.jpg" -type f)

# Age groups to sample (age: count)
declare -A AGE_GROUPS=(
  ["2-5"]=2
  ["6-10"]=2
  ["12-15"]=2
  ["18-22"]=2
  ["25-30"]=2
  ["35-40"]=2
  ["45-50"]=2
  ["55-60"]=2
  ["65-70"]=2
  ["75-80"]=2
  ["85-90"]=2
)

echo "Selecting calibration samples from UTKFace uncropped dataset..."
echo ""

for age_range in "${!AGE_GROUPS[@]}"; do
  IFS='-' read -ra AGES <<< "$age_range"
  MIN_AGE=${AGES[0]}
  MAX_AGE=${AGES[1]}
  COUNT=${AGE_GROUPS[$age_range]}

  echo "Looking for $COUNT images in age range $MIN_AGE-$MAX_AGE..."

  # Find images in this age range
  FOUND=0
  for img in $ALL_IMAGES; do
    # Extract age from filename (format: age_gender_race_timestamp.jpg)
    FILENAME=$(basename "$img")
    AGE=$(echo "$FILENAME" | cut -d'_' -f1)

    # Check if age is in range
    if [ "$AGE" -ge "$MIN_AGE" ] && [ "$AGE" -le "$MAX_AGE" ]; then
      cp "$img" "$OUTPUT_DIR/"
      echo "  ✓ Copied $FILENAME (age $AGE)"
      FOUND=$((FOUND + 1))

      if [ "$FOUND" -eq "$COUNT" ]; then
        break
      fi
    fi
  done

  if [ "$FOUND" -lt "$COUNT" ]; then
    echo "  ⚠️  Only found $FOUND images (wanted $COUNT)"
  fi
  echo ""
done

TOTAL=$(ls "$OUTPUT_DIR" | wc -l)
echo "Total calibration images selected: $TOTAL"
echo "Images saved to: $OUTPUT_DIR/"
ls -1 "$OUTPUT_DIR" | head -25
