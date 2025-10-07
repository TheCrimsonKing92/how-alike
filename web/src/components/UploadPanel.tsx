import { Button } from "@/components/ui/button";

export default function UploadPanel() {
  return (
    <section aria-label="Upload" className="w-full max-w-xl">
      <h2 className="text-xl font-semibold mb-2">Upload or Capture</h2>
      <p className="text-sm opacity-80 mb-4">Placeholder for dual image upload/camera capture.</p>
      <div className="flex gap-2">
        <Button variant="default">Select Photos</Button>
        <Button variant="secondary">Use Camera</Button>
      </div>
    </section>
  );
}
