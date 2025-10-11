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
  const [expandedFeature, setExpandedFeature] = React.useState<string | null>(null);

  if (!narrative) return null;

  const features = Object.keys(narrative.featureSummaries);

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
          const isExpanded = expandedFeature === feature;
          const summary = narrative.featureSummaries[feature];
          const details = narrative.axisDetails[feature] || [];

          return (
            <div key={feature} className="border rounded-md overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 transition"
                onClick={() => setExpandedFeature(isExpanded ? null : feature)}
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
              {isExpanded && details.length > 0 && (
                <div className="px-3 py-2 bg-gray-50 border-t text-xs space-y-1">
                  {details.map((detail, idx) => (
                    <div key={idx} className="opacity-80">
                      • {detail}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
