export type RegionScore = { region: string; score: number };

export default function ResultsPanel({ scores, overall }: { scores?: RegionScore[]; overall?: number }) {
  return (
    <section aria-label="Results" className="w-full max-w-xl">
      <h2 className="text-xl font-semibold mb-2">Results</h2>
      {typeof overall === "number" ? (
        <p className="text-sm mb-3">Overall similarity: {(overall * 100).toFixed(1)}%</p>
      ) : (
        <p className="text-sm opacity-80 mb-3">Run an analysis to see results.</p>
      )}
      <ul className="list-disc list-inside text-sm opacity-90 space-y-1">
        {(scores ?? []).map((s) => (
          <li key={s.region}>
            <span className="font-medium">{s.region}:</span> {(s.score * 100).toFixed(1)}%
          </li>
        ))}
      </ul>
    </section>
  );
}
