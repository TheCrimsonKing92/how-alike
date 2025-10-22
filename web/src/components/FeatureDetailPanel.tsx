"use client";
import React from "react";
import type { FeatureNarrative } from "@/workers/types";
import { annotateGlossaryText } from "@/components/DefinitionTooltip";

export default function FeatureDetailPanel({
  narrative,
  congruenceScore,
}: {
  narrative?: FeatureNarrative;
  congruenceScore?: number;
}) {
  const [expandedFeatures, setExpandedFeatures] = React.useState<Set<string>>(new Set());

  if (!narrative) return null;

  // Sort features by congruence score (descending)
  const features = Object.keys(narrative.featureSummaries).sort((a, b) => {
    const agreementA = narrative.axisDetails[a]?.agreement ?? 0;
    const agreementB = narrative.axisDetails[b]?.agreement ?? 0;
    return agreementB - agreementA; // Descending order
  });

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
    <section aria-label="Feature Analysis" className="w-full mt-4">
      <h3 className="text-base font-semibold mb-2">Detailed Feature Analysis</h3>

      {typeof congruenceScore === "number" && (
        <div className="mb-3 pb-2 border-b">
          <div className="text-sm opacity-70">Overall Congruence</div>
          <div className="text-2xl font-bold">
            {(congruenceScore * 100).toFixed(1)}%
          </div>
        </div>
      )}

      <div className="text-sm mb-2 text-foreground">
        {annotateGlossaryText(narrative.overall)}
      </div>

      {narrative.sharedCharacteristics && (
        <div className="text-xs mb-3 italic text-muted-foreground">
          {annotateGlossaryText(narrative.sharedCharacteristics)}
        </div>
      )}

      <div className="space-y-1.5">
        {features.map((feature) => {
          const isExpanded = expandedFeatures.has(feature);
          const summary = narrative.featureSummaries[feature];
          const details = narrative.axisDetails[feature];

          const hasContent = details && (details.shared.length > 0 || details.imageA.length > 0 || details.imageB.length > 0);

          return (
            <div key={feature} className="border rounded">
              <button
                type="button"
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-left hover:bg-gray-50 transition"
                onClick={() => toggleFeature(feature)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize text-xs">{feature}</span>
                    {typeof details?.agreement === "number" && (
                      <span className="text-xs font-semibold opacity-60">
                        {(details.agreement * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {annotateGlossaryText(summary)}
                  </div>
                </div>
                <svg
                  className={`w-3.5 h-3.5 ml-2 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isExpanded && hasContent && (
                <div className="px-2.5 py-2 bg-gray-50 border-t text-xs">
                  <div className="flex flex-col md:flex-row md:gap-3 space-y-2 md:space-y-0">
                    {details.shared.length > 0 && (
                      <div className="flex-1 min-w-0 text-muted-foreground">
                        <div className="font-medium text-gray-700 text-xs mb-0.5">Shared</div>
                        <ul className="list-disc list-inside text-xs space-y-0.5">
                          {details.shared.map((item, idx) => (
                            <li key={idx} className="leading-tight">
                              {annotateGlossaryText(item)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {details.imageA.length > 0 && (
                      <div className="flex-1 min-w-0 text-muted-foreground">
                        <div className="font-medium text-gray-700 text-xs mb-0.5">Image A</div>
                        <ul className="list-disc list-inside text-xs space-y-0.5">
                          {details.imageA.map((item, idx) => (
                            <li key={idx} className="leading-tight">
                              {annotateGlossaryText(item)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {details.imageB.length > 0 && (
                      <div className="flex-1 min-w-0 text-muted-foreground">
                        <div className="font-medium text-gray-700 text-xs mb-0.5">Image B</div>
                        <ul className="list-disc list-inside text-xs space-y-0.5">
                          {details.imageB.map((item, idx) => (
                            <li key={idx} className="leading-tight">
                              {annotateGlossaryText(item)}
                            </li>
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
