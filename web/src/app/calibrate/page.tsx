'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

interface CalibrationPoint {
  filename: string;
  actualAge: number;
  rawPrediction: number;
  calibratedPrediction: number;
  gender: string;
  confidence: number;
}

export default function CalibratePage() {
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [actualAge, setActualAge] = useState<string>('');
  const [dataPoints, setDataPoints] = useState<CalibrationPoint[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [workerReady, setWorkerReady] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Initialize worker
    const worker = new Worker(new URL('@/workers/analyze.worker.ts', import.meta.url));
    workerRef.current = worker;

    worker.postMessage({ type: 'INIT' });

    const handleMessage = (e: MessageEvent) => {
      if (e.data.type === 'READY') {
        setWorkerReady(true);
      }
    };

    worker.addEventListener('message', handleMessage);

    return () => {
      worker.removeEventListener('message', handleMessage);
      worker.terminate();
    };
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImage(file);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const processImage = async () => {
    if (!image || !actualAge || !workerRef.current) {
      alert('Please provide both image and actual age');
      return;
    }

    setIsProcessing(true);

    try {
      const jobId = `calib-${Date.now()}`;

      const handleWorkerMessage = (e: MessageEvent) => {
        if (e.data.jobId !== jobId) return;

        if (e.data.type === 'RESULT') {
          const { ageEstimateA } = e.data;

          if (ageEstimateA) {
            const dataPoint: CalibrationPoint = {
              filename: image.name,
              actualAge: parseFloat(actualAge),
              rawPrediction: ageEstimateA.rawAge || ageEstimateA.age,
              calibratedPrediction: ageEstimateA.age,
              gender: ageEstimateA.gender,
              confidence: ageEstimateA.confidence,
            };

            setDataPoints(prev => [...prev, dataPoint]);

            // Reset form
            setImage(null);
            setImagePreview(null);
            setActualAge('');

            // Reset file input
            const fileInput = document.getElementById('image-input') as HTMLInputElement;
            if (fileInput) fileInput.value = '';
          }

          workerRef.current?.removeEventListener('message', handleWorkerMessage);
          setIsProcessing(false);
        } else if (e.data.type === 'ERROR') {
          console.error('Worker error:', e.data.message);
          alert(`Failed to process image: ${e.data.message}`);
          workerRef.current?.removeEventListener('message', handleWorkerMessage);
          setIsProcessing(false);
        }
      };

      workerRef.current!.addEventListener('message', handleWorkerMessage);

      // Use the same image twice so MediaPipe can detect faces in both
      workerRef.current!.postMessage({
        type: 'ANALYZE',
        payload: {
          jobId,
          fileA: image,
          fileB: image,
          maxDim: 1280,
        }
      });

    } catch (error) {
      console.error('Error processing image:', error);
      alert('Failed to process image');
      setIsProcessing(false);
    }
  };

  const exportCSV = () => {
    if (dataPoints.length === 0) {
      alert('No data to export');
      return;
    }

    const headers = ['filename', 'actual_age', 'raw_prediction', 'calibrated_prediction', 'gender', 'confidence'];
    const rows = dataPoints.map(p => [
      p.filename,
      p.actualAge,
      p.rawPrediction,
      p.calibratedPrediction,
      p.gender,
      p.confidence
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calibration-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Age Calibration Data Collection</h1>

      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
        <p className="text-sm text-yellow-700">
          <strong>Note:</strong> This tool processes images through the same pipeline as the main app
          (face detection + cropping) to collect accurate calibration data.
        </p>
      </div>

      <div className="space-y-4 mb-8">
        <div>
          <label htmlFor="image-input" className="block text-sm font-medium mb-1">Upload Image</label>
          <input
            id="image-input"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            disabled={isProcessing}
            className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none p-2"
          />
          {image && <p className="text-sm text-gray-600 mt-1">Selected: {image.name}</p>}
        </div>

        <div>
          <label htmlFor="actual-age" className="block text-sm font-medium mb-1">Actual Age (years)</label>
          <input
            id="actual-age"
            type="number"
            min="0"
            max="120"
            value={actualAge}
            onChange={(e) => setActualAge(e.target.value)}
            placeholder="Enter actual age"
            disabled={isProcessing}
            className="block w-full p-2 text-sm text-gray-900 border border-gray-300 rounded-lg bg-gray-50 focus:outline-none"
          />
        </div>

        <Button
          onClick={processImage}
          disabled={!image || !actualAge || isProcessing}
        >
          {isProcessing ? 'Processing...' : 'Process Image'}
        </Button>
      </div>

      {dataPoints.length > 0 && (
        <>
          <div className="mb-4 flex justify-between items-center">
            <h2 className="text-xl font-semibold">
              Collected Data Points ({dataPoints.length})
            </h2>
            <Button onClick={exportCSV} variant="outline">
              Export CSV
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Filename</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actual Age</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Raw Prediction</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Calibrated</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Error (Raw)</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Gender</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {dataPoints.map((point, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2 text-sm">{point.filename}</td>
                    <td className="px-4 py-2 text-sm">{point.actualAge}</td>
                    <td className="px-4 py-2 text-sm">{point.rawPrediction.toFixed(1)}</td>
                    <td className="px-4 py-2 text-sm">{point.calibratedPrediction.toFixed(1)}</td>
                    <td className="px-4 py-2 text-sm">
                      {(point.rawPrediction - point.actualAge).toFixed(1)}
                    </td>
                    <td className="px-4 py-2 text-sm">{point.gender}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 p-4 bg-gray-50 rounded">
            <h3 className="font-semibold mb-2">Statistics</h3>
            <p className="text-sm">
              Mean Absolute Error (Raw): {
                (dataPoints.reduce((sum, p) => sum + Math.abs(p.rawPrediction - p.actualAge), 0) / dataPoints.length).toFixed(2)
              } years
            </p>
            <p className="text-sm">
              Mean Absolute Error (Calibrated): {
                (dataPoints.reduce((sum, p) => sum + Math.abs(p.calibratedPrediction - p.actualAge), 0) / dataPoints.length).toFixed(2)
              } years
            </p>
          </div>
        </>
      )}
    </div>
  );
}
