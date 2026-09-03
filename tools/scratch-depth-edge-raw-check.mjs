import { pipeline } from '@huggingface/transformers';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMG = path.join(__dirname, '..', 'file_000000006d188210a9bb1129089a7b29.png');

const depthEstimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small');
const output = await depthEstimator(IMG);
console.log('Keys:', Object.keys(output));
const pd = output.predicted_depth;
console.log('predicted_depth type:', pd.constructor.name);
console.log('predicted_depth dims:', pd.dims);
const data = pd.data ?? pd.ort_tensor?.data;
console.log('predicted_depth data type:', data?.constructor?.name, 'length:', data?.length);
if (data) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < data.length; i++) { if (data[i] < min) min = data[i]; if (data[i] > max) max = data[i]; }
  console.log('raw value range:', min, max);
  console.log('sample values:', Array.from(data.slice(0, 10)));
}
