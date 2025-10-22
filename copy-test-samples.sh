#!/bin/bash

mkdir -p calibration-test-images
cd web/src/__tests__/fixtures/age-calibration

# Copy one image for each age group
for age in 2 5 12 18 28 36 45 55 66 75; do
  file=$(ls -1 | grep "^${age}_" | head -1)
  if [ -n "$file" ]; then
    cp "$file" ../../../../../calibration-test-images/
    echo "Copied $file"
  fi
done

cd ../../../../../calibration-test-images
echo ""
echo "Test images copied:"
ls -1
