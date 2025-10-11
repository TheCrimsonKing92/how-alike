"use client";
import React from "react";
import type { FeatureNarrative } from "@/workers/types";

export default function FeatureDetailPanel({
  narrative,
  congruenceScore,
}: {
  narrative?: FeatureNarrative;
  congruenceScore?: number;
}) {
  const [expandedFeatures, setExpandedFeatures] = React.useState<Set<string>>(new Set());

  if (!narrative) return null;

  const features = Object.keys(narrative.featureSummaries);

  const toggleFeature = (feature: string) => {
    setExpandedFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(feature)) {
        next.delete(feature);
      } else {
        next.add(feature);
      }
      return next;
    });
  };

  return (
    <section aria-label="Feature Analysis" className="w-full mt-6">
      <h3 className="text-lg font-semibold mb-2">Detailed Feature Analysis</h3>

      {typeof congruenceScore === "number" && (
        <p className="text-sm mb-3">
          Morphological congruence: {(congruenceScore * 100).toFixed(1)}%
        </p>
      )}

      <div className="text-sm mb-4 opacity-90">
        {narrative.overall}
      </div>

      {narrative.sharedCharacteristics && (
        <div className="text-sm mb-4 opacity-80 italic">
          {narrative.sharedCharacteristics}
        </div>
      )}

      <div className="space-y-2">
        {features.map((feature) => {
          const isExpanded = expandedFeatures.has(feature);
          const summary = narrative.featureSummaries[feature];
          const details = narrative.axisDetails[feature];

          const hasContent = details && (details.shared.length > 0 || details.imageA.length > 0 || details.imageB.length > 0);

          return (
            <div key={feature} className="border rounded-md overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 transition"
                onClick={() => toggleFeature(feature)}
              >
                <div className="flex-1">
                  <div className="font-medium capitalize text-sm">{feature}</div>
                  <div className="text-xs opacity-75 mt-0.5">{summary}</div>
                </div>
                <svg
                  className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isExpanded && hasContent && (
                <div className="px-3 py-2 bg-gray-50 border-t text-xs">
                  <div className="flex flex-col md:flex-row md:gap-4 space-y-3 md:space-y-0">
                    {details.shared.length > 0 && (
                      <div className="flex-1">
                        <div className="font-medium text-gray-700 mb-1">Shared Characteristics</div>
                        <ul className="list-disc list-inside opacity-80">
                          {details.shared.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {details.imageA.length > 0 && (
                      <div className="flex-1">
                        <div className="font-medium text-gray-700 mb-1">Image A</div>
                        <ul className="list-disc list-inside opacity-80">
                          {details.imageA.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {details.imageB.length > 0 && (
                      <div className="flex-1">
                        <div className="font-medium text-gray-700 mb-1">Image B</div>
                        <ul className="list-disc list-inside opacity-80">
                          {details.imageB.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
