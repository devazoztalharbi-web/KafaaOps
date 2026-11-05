import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import jpeg from "jpeg-js";
import { decrypt, encrypt, sha256 } from "./crypto";
import { activeTemplate, audit, one, run } from "./db";

type Engine = {
  tf: {
    setBackend: (name: string) => Promise<void>;
    ready: () => Promise<void>;
    tensor3d: (values: Float32Array, shape: [number, number, number]) => { dispose: () => void };
  };
  nets: {
    tinyFaceDetector: { loadFromUri: (uri: string) => Promise<void> };
    faceLandmark68Net: { loadFromUri: (uri: string) => Promise<void> };
    faceRecognitionNet: { loadFromUri: (uri: string) => Promise<void> };
  };
  TinyFaceDetectorOptions: new (options: { inputSize: number; scoreThreshold: number }) => unknown;
  detectAllFaces: (tensor: unknown, options: unknown) => {
    withFaceLandmarks: () => {
      withFaceDescriptors: () => Promise<Array<{ landmarks: { positions: Array<{ x: number; y: number }> }; descriptor: ArrayLike<number> }>>;
    };
  };
};

type Sample = { descriptor: number[]; ear: number; yaw: number };

export function livenessFrom(ears: number[], yaws: number[]) {
  if (ears.length < 6 || ears.length !== yaws.length) return false;
  const lowest = Math.min(...ears);
  const highest = Math.max(...ears);
  const blinked = lowest < 0.23 && highest > 0.27 && highest - lowest > 0.045;
  const turned = Math.max(...yaws) - Math.min(...yaws) > 0.18;
  return blinked && turned;
}

function headYaw(points: Array<{ x: number; y: number }>) {
  const left = points[36];
  const right = points[45];
  const nose = points[30];
  const width = Math.hypot(right.x - left.x, right.y - left.y) || 1;
  return (nose.x - (left.x + right.x) / 2) / width;
}
type FaceError = { error: "err_file_type" | "err_no_face" | "err_face_count" | "err_liveness" | "err_face" | "err_no_template" };

const proofs = new Map<string, { userId: string; distance: number; expires: number }>();
let engine: Promise<Engine> | null = null;

function installBrowserShim() {
  const scope = globalThis as unknown as { window?: unknown; document?: unknown; __kafaaFileFetch?: boolean };
  if (!scope.window) {
    const documentShim = { createElement: () => ({}) };
    scope.window = { document: documentShim };
    scope.document = documentShim;
  }
  if (scope.__kafaaFileFetch) return;
  const native = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("file:")) return new Response(readFileSync(fileURLToPath(url)));
    return native(input, init);
  };
  scope.__kafaaFileFetch = true;
}

function models() {
  engine ??= (async () => {
    installBrowserShim();
    const faceapi = (await import("@vladmandic/face-api/dist/face-api.esm.js")) as unknown as Engine;
    await faceapi.tf.setBackend("cpu");
    await faceapi.tf.ready();
    const dir = `${pathToFileURL(path.join(process.cwd(), "assets", "face-models")).href}/`;
    await faceapi.nets.tinyFaceDetector.loadFromUri(dir);
    await faceapi.nets.faceLandmark68Net.loadFromUri(dir);
    await faceapi.nets.faceRecognitionNet.loadFromUri(dir);
    return faceapi;
  })();
  return engine;
}

function eyeAspect(points: Array<{ x: number; y: number }>, start: number) {
  const distance = (a: number, b: number) => Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
  return (distance(start + 1, start + 5) + distance(start + 2, start + 4)) / (2 * distance(start, start + 3));
}

function euclidean(left: number[], right: number[]) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = left[index] - right[index];
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

async function sampleFrame(bytes: Uint8Array): Promise<Sample | { error: "err_file_type" | "err_no_face" | "err_face_count" }> {
  if (bytes.byteLength < 32 || bytes.byteLength > 1_500_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return { error: "err_file_type" };
  let decoded: { width: number; height: number; data: Uint8Array };
  try {
    decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  } catch {
    return { error: "err_no_face" };
  }
  if (decoded.width < 80 || decoded.height < 80) return { error: "err_no_face" };
  const faceapi = await models();
  const rgb = new Float32Array(decoded.width * decoded.height * 3);
  for (let source = 0, target = 0; source < decoded.data.length; source += 4) {
    rgb[target] = decoded.data[source];
    rgb[target + 1] = decoded.data[source + 1];
    rgb[target + 2] = decoded.data[source + 2];
    target += 3;
  }
  const tensor = faceapi.tf.tensor3d(rgb, [decoded.height, decoded.width, 3]);
  try {
    const found = await faceapi.detectAllFaces(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 })).withFaceLandmarks().withFaceDescriptors();
    if (found.length === 0) return { error: "err_no_face" };
    if (found.length !== 1) return { error: "err_face_count" };
    const points = found[0].landmarks.positions;
    const descriptor = Array.from(found[0].descriptor);
    if (descriptor.length !== 128) return { error: "err_no_face" };
    return { descriptor, ear: (eyeAspect(points, 36) + eyeAspect(points, 42)) / 2, yaw: headYaw(points) };
  } finally {
    tensor.dispose();
  }
}

async function readBlink(frames: Uint8Array[]): Promise<{ mean: number[] } | FaceError> {
  if (frames.length < 6 || frames.length > 8) return { error: "err_liveness" as const };
  const samples: Sample[] = [];
  for (const frame of frames) {
    const sample = await sampleFrame(frame);
    if ("error" in sample) return sample;
    samples.push(sample);
  }
  if (!livenessFrom(samples.map((sample) => sample.ear), samples.map((sample) => sample.yaw))) return { error: "err_liveness" as const };
  const frontal = samples.filter((sample) => Math.abs(sample.yaw) < 0.15);
  if (frontal.length < 2) return { error: "err_liveness" as const };
  const mean = frontal[0].descriptor.map((_, index) => frontal.reduce((sum, sample) => sum + sample.descriptor[index], 0) / frontal.length);
  if (frontal.some((sample) => euclidean(sample.descriptor, mean) > 0.45)) return { error: "err_face" as const };
  return { mean };
}

function thresholdFor(userId: string) {
  const row = one<{ match_threshold: number }>(
    "SELECT companies.match_threshold AS match_threshold FROM users JOIN companies ON companies.id = users.company_id WHERE users.id = ?",
    userId,
  );
  return row?.match_threshold ?? 0.48;
}

export function issueFaceProof(userId: string, distance: number) {
  const id = crypto.randomUUID();
  proofs.set(id, { userId, distance, expires: Date.now() + 30_000 });
  return id;
}

export function consumeFaceProof(id: string, userId: string) {
  const proof = proofs.get(id);
  proofs.delete(id);
  if (!proof || proof.userId !== userId || proof.expires < Date.now()) return null;
  return proof;
}

export async function enrollFace(userId: string, companyId: string | null, frames: Uint8Array[]): Promise<{ version: number } | FaceError> {
  const blink = await readBlink(frames);
  if ("error" in blink) return blink;
  const existing = activeTemplate(userId);
  if (existing) {
    const stored = JSON.parse(decrypt(Buffer.from(existing.cipher)).toString()) as number[];
    if (euclidean(blink.mean, stored) > thresholdFor(userId)) return { error: "err_face" as const };
    run("UPDATE face_templates SET active = 0 WHERE user_id = ?", userId);
  }
  const version = (existing?.version ?? 0) + 1;
  const id = crypto.randomUUID();
  run(
    "INSERT INTO face_templates (id, user_id, version, cipher, consent_hash, created_at, active) VALUES (?, ?, ?, ?, ?, ?, 1)",
    id,
    userId,
    version,
    encrypt(Buffer.from(JSON.stringify(blink.mean))),
    sha256(blink.mean.join(",")),
    new Date().toISOString(),
  );
  if (companyId) audit(companyId, userId, existing ? "face.renew" : "face.enroll", "face", id, { version });
  return { version };
}

export async function matchFace(userId: string, frames: Uint8Array[]): Promise<{ distance: number; proof: string } | FaceError> {
  const blink = await readBlink(frames);
  if ("error" in blink) return blink;
  const existing = activeTemplate(userId);
  if (!existing) return { error: "err_no_template" as const };
  const stored = JSON.parse(decrypt(Buffer.from(existing.cipher)).toString()) as number[];
  const distance = euclidean(blink.mean, stored);
  if (distance > thresholdFor(userId)) return { error: "err_face" as const, distance };
  return { distance, proof: issueFaceProof(userId, distance) };
}
