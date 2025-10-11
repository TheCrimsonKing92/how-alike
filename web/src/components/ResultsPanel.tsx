export type RegionScore = { region: string; score: number };

export default function ResultsPanel({ scores, overall, texts }: { scores?: RegionScore[]; overall?: number; texts?: {region:string;text:string}[] }) {
  // Create a map of region -> text for quick lookup
  const textMap = new Map<string, string>();
  if (texts) {
    for (const t of texts) {
      textMap.set(t.region, t.text);
    }
  }

  return (
    <section aria-label="Results" className="w-full max-w-xl">
      <h2 className="text-xl font-semibold mb-2">Results</h2>
      {typeof overall === "number" ? (
        <p className="text-sm mb-3">Overall similarity: {(overall * 100).toFixed(1)}%</p>
      ) : (
        <p className="text-sm opacity-80 mb-3">Run an analysis to see results.</p>
      )}
      <ul className="list-disc list-inside text-sm opacity-90 space-y-1">
        {(scores ?? []).map((s) => {
          const description = textMap.get(s.region);
          return (
            <li key={s.region}>
              <span className="font-medium">{s.region}:</span> {(s.score * 100).toFixed(1)}%
              {description && (
                <span className="opacity-75"> — {description}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
