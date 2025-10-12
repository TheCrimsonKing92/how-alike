#!/usr/bin/env python3
"""Fix feature-comparisons test file by adding missing properties to FeatureClassifications objects."""

import re

# Read the test file
with open('../src/__tests__/feature-comparisons.test.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to match FeatureClassifications objects with only 4 properties
# We need to add: brows, cheeks, forehead, faceShape after the existing ones

def add_missing_props(match):
    """Add missing properties to a FeatureClassifications object."""
    indent = match.group(1)
    eyes = match.group(2)
    nose = match.group(3)
    mouth = match.group(4)
    jaw = match.group(5)

    return (f"{indent}eyes: {eyes},\n"
            f"{indent}brows: [],\n"
            f"{indent}nose: {nose},\n"
            f"{indent}mouth: {mouth},\n"
            f"{indent}cheeks: [],\n"
            f"{indent}jaw: {jaw},\n"
            f"{indent}forehead: [],\n"
            f"{indent}faceShape: []")

# Pattern that matches the 4-property FeatureClassifications
# Handles both empty arrays and arrays with content
pattern = r'(\s+)eyes: (\[[^\]]*\]),\n\1nose: (\[[^\]]*\]),\n\1mouth: (\[[^\]]*\]),\n\1jaw: (\[[^\]]*\]),'

content = re.sub(pattern, add_missing_props, content)

# Also need to update the performComparison test which has measurements
# Add missing measurements
measurements_pattern = r'(const measurements[AB]: FeatureMeasurements = \{\n\s+eyes: \{[^}]+\},\n\s+nose: \{[^}]+\},\n\s+mouth: \{[^}]+\},\n\s+jaw: \{[^}]+\},)'

def add_missing_measurements(match):
    text = match.group(1)
    # Find the indentation
    indent_match = re.search(r'\n(\s+)jaw:', text)
    if indent_match:
        indent = indent_match.group(1)
        # Add missing measurements before the closing brace
        text = text.replace(
            f',\n{indent}jaw:',
            f',\n{indent}brows: {{ shape: 0.12, position: 0.16, length: 1.05 }},\n{indent}nose:'
        ).replace(
            f'},\n{indent}jaw:',
            f'}},\n{indent}cheeks: {{ prominence: 0.06, nasolabialDepth: 0.05, height: 0.38 }},\n{indent}jaw:'
        )
        # Add at the end
        text = text + f',\n{indent}forehead: {{ height: 1.00, contour: 0.02 }},\n{indent}faceShape: {{ lengthWidthRatio: 1.5, facialThirds: 0.88 }}'
    return text

content = re.sub(measurements_pattern, add_missing_measurements, content, flags=re.DOTALL)

# Update the expectation for comparison count from 4 to 8
content = content.replace('expect(result.comparisons.length).toBe(4);', 'expect(result.comparisons.length).toBe(8);')

# Write back
with open('../src/__tests__/feature-comparisons.test.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Test file fixed successfully!")
print("- Added brows, cheeks, forehead, faceShape to all FeatureClassifications")
print("- Updated performComparison test measurements")
print("- Updated comparison count expectation from 4 to 8")
