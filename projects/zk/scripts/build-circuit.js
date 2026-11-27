/**
 * Quantum Garaj ZK — Devre Derleme, Groth16 Trusted Setup ve Tarayıcı Paketleme Scripti
 *
 * Kullanım: npm run build
 *
 * Yaptığı işlemler:
 * 1) garajBilet.circom devresini circom.exe ile derler (.r1cs, .wasm, .sym)
 * 2) Yerel test/Sepolia için Powers of Tau (pot13) + Groth16 Phase 2 (.zkey) kurar
 * 3) verification_key.json ve contracts/Groth16Verifier.sol (+ PoseidonT3.sol) üretir
 * 4) GitHub Pages (docs/) için statik tarayıcı dosyalarını kopyalar/paketler:
 *    - docs/zk-artifacts/garajBilet.wasm
 *    - docs/zk-artifacts/garajBilet_final.zkey
 *    - docs/zk-artifacts/verification_key.json
 *    - docs/zk-vendor/snarkjs.min.js
 *    - docs/zk-vendor/poseidon2.js
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const snarkjs = require("snarkjs");

const ZK_DIR = path.resolve(__dirname, "..");
const REPO_DIR = path.resolve(ZK_DIR, "..", "..");
const BUILD_DIR = path.join(ZK_DIR, "build");
const TOOLS_DIR = path.join(ZK_DIR, "tools");
const CIRCOM_BIN = path.join(TOOLS_DIR, process.platform === "win32" ? "circom.exe" : "circom");
const PROJECTS_ZK_DIR = path.join(ZK_DIR, "contracts");
const DOCS_ARTIFACTS_DIR = path.join(REPO_DIR, "docs", "zk-artifacts");
const DOCS_VENDOR_DIR = path.join(REPO_DIR, "docs", "zk-vendor");

function klasorHazirla(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function boyutYaz(dosyaYolu) {
  const bytes = fs.statSync(dosyaYolu).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function browserPoseidon2Paketle(hedefYol) {
  const poseidonLiteDir = path.join(ZK_DIR, "node_modules", "poseidon-lite");
  const c2Mod = require(path.join(poseidonLiteDir, "constants", "2.js"));
  const unstringifyMod = require(path.join(poseidonLiteDir, "poseidon", "unstringify.js"));
  const constants2 = c2Mod.default || c2Mod;
  const unstringify = unstringifyMod.default || unstringifyMod;
  const parsed = unstringify(constants2);

  // BigInt sabitlerini doğrudan string dizisi olarak gömüp tarayıcıda BigInt'e çeviriyoruz
  const cHex = parsed.C.map((v) => "0x" + v.toString(16));
  const mHex = parsed.M.map((row) => row.map((v) => "0x" + v.toString(16)));

  const bundle = `/* Otomatik üretildi (poseidon-lite Poseidon(2) / BN254) — Circomlib ile bit-bit uyumlu */
(function (globalScope) {
  "use strict";
  const F = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  const N_ROUNDS_F = 8;
  const N_ROUNDS_P = 57;
  const C = ${JSON.stringify(cHex)}.map(BigInt);
  const M = ${JSON.stringify(mHex)}.map((row) => row.map(BigInt));

  function pow5(v) {
    const sq = (v * v) % F;
    return (((sq * sq) % F) * v) % F;
  }

  function mix(state) {
    const out = [0n, 0n, 0n];
    for (let x = 0; x < 3; x++) {
      let acc = 0n;
      for (let y = 0; y < 3; y++) {
        acc += M[x][y] * state[y];
      }
      out[x] = acc % F;
    }
    return out;
  }

  function poseidon2(inputs) {
    if (!Array.isArray(inputs) || inputs.length !== 2) {
      throw new Error("poseidon2 tam olarak 2 girdi bekler.");
    }
    let state = [0n, ((BigInt(inputs[0]) % F) + F) % F, ((BigInt(inputs[1]) % F) + F) % F];
    const totalRounds = N_ROUNDS_F + N_ROUNDS_P;
    for (let r = 0; r < totalRounds; r++) {
      for (let y = 0; y < 3; y++) {
        state[y] = (state[y] + C[r * 3 + y]) % F;
        if (r < N_ROUNDS_F / 2 || r >= N_ROUNDS_F / 2 + N_ROUNDS_P) {
          state[y] = pow5(state[y]);
        } else if (y === 0) {
          state[y] = pow5(state[y]);
        }
      }
      state = mix(state);
    }
    return state[0];
  }

  globalScope.POSEIDON_SNARK_FIELD = F;
  globalScope.poseidon2 = poseidon2;
})(typeof window !== "undefined" ? window : globalThis);
`;

  fs.writeFileSync(hedefYol, bundle, "utf8");
}

function poseidonSolidityUret(hedefYol) {
  const kaynak = fs.readFileSync(
    path.join(ZK_DIR, "node_modules", "poseidon-solidity", "PoseidonT3.sol"),
    "utf8"
  );

  // Bağımsız contract haline getiriyoruz (Remix'te library linking gerekmeden 1 tıkla deploy olur)
  // ve sabit bellek ofseti (0x80/0xa0) yerine doğrudan input pointer'ı kullanıyoruz.
  let cikti = kaynak
    .replace("/// SPDX-License-Identifier: MIT", "// SPDX-License-Identifier: MIT")
    .replace("pragma solidity >=0.7.0;", "pragma solidity ^0.8.24;")
    .replace("library PoseidonT3 {", "contract PoseidonT3 {")
    .replace(
      "function hash(uint[2] memory) public pure returns (uint) {",
      "function hash(uint256[2] memory input) external pure returns (uint256 res) {"
    )
    .replace("mload(0x80)", "mload(input)")
    .replace("mload(0xa0)", "mload(add(input, 0x20))")
    .replace(
      "mstore(0x0, mod(add(add(mulmod(state0, M00, F), mulmod(state1, M10, F)), mulmod(state2, M20, F)), F))\n\n      return(0, 0x20)",
      "res := mod(add(add(mulmod(state0, M00, F), mulmod(state1, M10, F)), mulmod(state2, M20, F)), F)"
    )
    .replace(
      "mstore(0x0, mod(add(add(mulmod(state0, M00, F), mulmod(state1, M10, F)), mulmod(state2, M20, F)), F))\r\n\r\n      return(0, 0x20)",
      "res := mod(add(add(mulmod(state0, M00, F), mulmod(state1, M10, F)), mulmod(state2, M20, F)), F)"
    );

  if (cikti.includes("mload(0x80)") || cikti.includes("return(0, 0x20)") || cikti.includes("library PoseidonT3")) {
    throw new Error("PoseidonT3.sol dönüşümü tamamlanamadı.");
  }

  fs.writeFileSync(hedefYol, cikti, "utf8");
}

async function main() {
  console.log("=== Quantum Garaj ZK Derleme & Kurulum Başladı ===\n");

  if (!fs.existsSync(CIRCOM_BIN)) {
    throw new Error(`circom ikilisi bulunamadı: ${CIRCOM_BIN}`);
  }

  klasorHazirla(BUILD_DIR);
  klasorHazirla(PROJECTS_ZK_DIR);
  klasorHazirla(DOCS_ARTIFACTS_DIR);
  klasorHazirla(DOCS_VENDOR_DIR);

  // 1) Circom derlemesi
  console.log("[1/5] garajBilet.circom derleniyor...");
  execFileSync(
    CIRCOM_BIN,
    ["circuits/garajBilet.circom", "--r1cs", "--wasm", "--sym", "-l", "node_modules", "-o", "build"],
    { cwd: ZK_DIR, stdio: "inherit" }
  );

  const r1csPath = path.join(BUILD_DIR, "garajBilet.r1cs");
  const wasmPath = path.join(BUILD_DIR, "garajBilet_js", "garajBilet.wasm");

  // 2) Powers of Tau (Phase 1) — pot13 => 2^13 = 8192 kısıt kapasitesi
  const ptau0 = path.join(BUILD_DIR, "pot13_0000.ptau");
  const ptau1 = path.join(BUILD_DIR, "pot13_0001.ptau");
  const ptauFinal = path.join(BUILD_DIR, "pot13_final.ptau");

  if (!fs.existsSync(ptauFinal)) {
    console.log("\n[2/5] Powers of Tau (pot13, bn128) oluşturuluyor...");
    const bn128 = await snarkjs.curves.getCurveFromName("bn128");
    await snarkjs.powersOfTau.newAccumulator(bn128, 13, ptau0);
    await snarkjs.powersOfTau.contribute(
      ptau0,
      ptau1,
      "QuantumTeam Phase1 Testnet",
      crypto.randomBytes(32).toString("hex")
    );
    await snarkjs.powersOfTau.preparePhase2(ptau1, ptauFinal);
    if (bn128.terminate) await bn128.terminate();
  } else {
    console.log("\n[2/5] Mevcut pot13_final.ptau bulundu, yeniden kullanılıyor.");
  }

  // 3) Groth16 Phase 2 (Devreye özel anahtar kurulumu)
  console.log("\n[3/5] Groth16 Phase 2 (zkey & verification_key) üretiliyor...");
  const zkey0 = path.join(BUILD_DIR, "garajBilet_0000.zkey");
  const zkeyFinal = path.join(BUILD_DIR, "garajBilet_final.zkey");
  const vkeyPath = path.join(BUILD_DIR, "verification_key.json");

  await snarkjs.zKey.newZKey(r1csPath, ptauFinal, zkey0);
  await snarkjs.zKey.contribute(
    zkey0,
    zkeyFinal,
    "QuantumTeam GarajBilet Contribution",
    crypto.randomBytes(32).toString("hex")
  );
  const vKey = await snarkjs.zKey.exportVerificationKey(zkeyFinal);
  fs.writeFileSync(vkeyPath, JSON.stringify(vKey, null, 2), "utf8");

  // 4) Solidity Groth16Verifier.sol ve PoseidonT3.sol dışa aktarımı
  console.log("\n[4/5] Groth16Verifier.sol ve PoseidonT3.sol üretiliyor...");
  const templates = {
    groth16: fs.readFileSync(
      path.join(ZK_DIR, "node_modules", "snarkjs", "templates", "verifier_groth16.sol.ejs"),
      "utf8"
    ),
  };
  const solidityVerifier = await snarkjs.zKey.exportSolidityVerifier(zkeyFinal, templates);
  const verifierOutPath = path.join(PROJECTS_ZK_DIR, "Groth16Verifier.sol");
  fs.writeFileSync(verifierOutPath, solidityVerifier, "utf8");

  const poseidonOutPath = path.join(PROJECTS_ZK_DIR, "PoseidonT3.sol");
  poseidonSolidityUret(poseidonOutPath);

  // 5) GitHub Pages (docs/) statik varlıklarının kopyalanması
  console.log("\n[5/5] Tarayıcı ZK varlıkları docs/ klasörüne paketleniyor...");
  const outWasm = path.join(DOCS_ARTIFACTS_DIR, "garajBilet.wasm");
  const outZkey = path.join(DOCS_ARTIFACTS_DIR, "garajBilet_final.zkey");
  const outVkey = path.join(DOCS_ARTIFACTS_DIR, "verification_key.json");
  const outSnarkjs = path.join(DOCS_VENDOR_DIR, "snarkjs.min.js");
  const outPoseidon = path.join(DOCS_VENDOR_DIR, "poseidon2.js");

  fs.copyFileSync(wasmPath, outWasm);
  fs.copyFileSync(zkeyFinal, outZkey);
  fs.copyFileSync(vkeyPath, outVkey);
  fs.copyFileSync(path.join(ZK_DIR, "node_modules", "snarkjs", "build", "snarkjs.min.js"), outSnarkjs);
  browserPoseidon2Paketle(outPoseidon);

  console.log("\n=== Derleme ve Paketleme Tamamlandı ===");
  console.log(`  Groth16Verifier.sol : ${boyutYaz(verifierOutPath)}`);
  console.log(`  garajBilet.wasm     : ${boyutYaz(outWasm)}`);
  console.log(`  garajBilet_final.zkey: ${boyutYaz(outZkey)}`);
  console.log(`  snarkjs.min.js      : ${boyutYaz(outSnarkjs)}`);
  console.log(`  poseidon2.js        : ${boyutYaz(outPoseidon)}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("HATA:", err);
    process.exit(1);
  });
