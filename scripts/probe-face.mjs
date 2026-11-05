import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

globalThis.window = { document: { createElement: () => ({}) } };
globalThis.document = globalThis.window.document;
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.startsWith("file:")) {
    const body = readFileSync(fileURLToPath(url));
    return new Response(body);
  }
  return nativeFetch(input, init);
};

const faceapi = await import("@vladmandic/face-api/dist/face-api.esm.js");

const dir = new URL("../assets/face-models/", import.meta.url).href;
const tf = faceapi.tf;
console.log("tf", tf.version.tfjs);
await tf.setBackend("cpu");
await tf.ready();
console.log("backend", tf.getBackend());
await faceapi.nets.tinyFaceDetector.loadFromUri(dir);
await faceapi.nets.faceLandmark68Net.loadFromUri(dir);
await faceapi.nets.faceRecognitionNet.loadFromUri(dir);
const tensor = tf.zeros([64, 64, 3]);
const found = await faceapi.detectSingleFace(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 128, scoreThreshold: 0.5 }));
console.log("detect", found);
tensor.dispose();
console.log("ok");
