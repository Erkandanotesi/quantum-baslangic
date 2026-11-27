/**
 * Quantum Garaj ZK — Uçtan Uca Kriptografik ve Yerel EVM Sözleşme Test Paketi
 *
 * Kullanım: npm test
 *
 * Doğrulanan katmanlar:
 *  A) 3 yönlü Poseidon(2) uyumu: circomlibjs === tarayıcı poseidon2.js === Solidity PoseidonT3.sol
 *  B) Solidity derleme & EIP-170 (24 KB) bytecode boyutu kontrolü (optimizer açık & kapalı)
 *  C) Off-chain Groth16 devre testleri: geçerli kanıt, sahte secret, non-binary yön, front-running
 *  D) Yerel Sepolia EVM (@ethereumjs/vm) tam sözleşme akışı:
 *     - PoseidonT3, Groth16Verifier, GarajKayitZK deploy
 *     - Yanlış bilet ücreti reddi
 *     - biletAl + Merkle kökü birebir eşleşme
 *     - Çift commitment reddi
 *     - Temiz 2. cüzdan ile eski kök geçmişi (root history) kullanarak zkGirisYap
 *     - Zincir üstü front-running saldırısı reddi (takmaAd değiştirme)
 *     - Zincir üstü çift giriş (double-spend nullifier) saldırısı reddi
 *     - Görevli (Relayer) modu ile anonim giriş
 *     - Kontenjan doluluğu reddi
 *     - Yetkisiz ve yetkili ucretleriCek testi
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const crypto = require("crypto");
const solc = require("solc");
const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const { ethers } = require("ethers");
const { createVM, runTx } = require("@ethereumjs/vm");
const { Common, Sepolia, Hardfork } = require("@ethereumjs/common");
const { createLegacyTx } = require("@ethereumjs/tx");
const {
  createAddressFromPrivateKey,
  createAddressFromString,
  createAccount,
  hexToBytes,
  bytesToHex,
} = require("@ethereumjs/util");

const ZK_DIR = path.resolve(__dirname, "..");
const REPO_DIR = path.resolve(ZK_DIR, "..", "..");
const PROJECTS_ZK_DIR = path.join(ZK_DIR, "contracts");
const DOCS_ARTIFACTS_DIR = path.join(REPO_DIR, "docs", "zk-artifacts");
const DOCS_VENDOR_DIR = path.join(REPO_DIR, "docs", "zk-vendor");

const SNARK_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const AGAC_DERINLIGI = 10;

// Tarayıcıya paketlenen poseidon2.js dosyasını doğrudan yükle ve test et
require(path.join(DOCS_VENDOR_DIR, "poseidon2.js"));
const browserPoseidon2 = globalThis.poseidon2;

function rastgeleAlanElemani() {
  // 248-bit kriptografik rastgele değer (< SNARK_FIELD garantili)
  return BigInt("0x" + crypto.randomBytes(31).toString("hex"));
}

function baglamHashHesapla(takmaAd, girisAdresi) {
  const h = ethers.solidityPackedKeccak256(["string", "address"], [takmaAd, girisAdresi]);
  return BigInt(h) % SNARK_FIELD;
}

function etkinlikIdHesapla(chainId, sozlesmeAdresi) {
  const h = ethers.solidityPackedKeccak256(["uint256", "address"], [chainId, sozlesmeAdresi]);
  return BigInt(h) % SNARK_FIELD;
}

// 10 seviyeli Poseidon Merkle Ağacı (GarajKayitZK.sol ile birebir aynı mantık)
class YerelPoseidonMerkle {
  constructor(derinlik = AGAC_DERINLIGI) {
    this.derinlik = derinlik;
    this.yapraklar = [];
    this.sifirlar = [0n];
    for (let i = 1; i <= derinlik; i++) {
      this.sifirlar[i] = browserPoseidon2([this.sifirlar[i - 1], this.sifirlar[i - 1]]);
    }
  }

  ekle(yaprak) {
    const indeks = this.yapraklar.length;
    this.yapraklar.push(BigInt(yaprak));
    return indeks;
  }

  katmanlar() {
    const katman = [this.yapraklar.slice()];
    for (let s = 0; s < this.derinlik; s++) {
      const onceki = katman[s];
      const sonraki = [];
      const ciftSayisi = Math.ceil(onceki.length / 2);
      for (let i = 0; i < ciftSayisi; i++) {
        const sol = onceki[2 * i] !== undefined ? onceki[2 * i] : this.sifirlar[s];
        const sag = onceki[2 * i + 1] !== undefined ? onceki[2 * i + 1] : this.sifirlar[s];
        sonraki.push(browserPoseidon2([sol, sag]));
      }
      katman.push(sonraki);
    }
    return katman;
  }

  kok() {
    const k = this.katmanlar()[this.derinlik];
    return k.length > 0 ? k[0] : this.sifirlar[this.derinlik];
  }

  kanitYolu(yaprakIndeksi) {
    if (yaprakIndeksi < 0 || yaprakIndeksi >= this.yapraklar.length) {
      throw new Error("Geçersiz yaprak indeksi");
    }
    const katman = this.katmanlar();
    const yolElemanlari = [];
    const yolYonleri = [];
    let idx = yaprakIndeksi;

    for (let s = 0; s < this.derinlik; s++) {
      const sagdaMi = idx % 2 === 1;
      const kardesIdx = sagdaMi ? idx - 1 : idx + 1;
      const kardes =
        katman[s][kardesIdx] !== undefined ? katman[s][kardesIdx] : this.sifirlar[s];
      yolElemanlari.push(kardes);
      yolYonleri.push(sagdaMi ? 1 : 0);
      idx = Math.floor(idx / 2);
    }

    return { kok: this.kok(), yolElemanlari, yolYonleri };
  }
}

function solidityDerle(dosyaAdi, optimizerAcik = true) {
  const kaynak = fs.readFileSync(path.join(PROJECTS_ZK_DIR, dosyaAdi), "utf8");
  const input = {
    language: "Solidity",
    sources: { [dosyaAdi]: { content: kaynak } },
    settings: {
      optimizer: { enabled: optimizerAcik, runs: 200 },
      evmVersion: "cancun",
      outputSelection: {
        "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] },
      },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors) {
    const hatalar = output.errors.filter((e) => e.severity === "error");
    if (hatalar.length > 0) {
      throw new Error(
        `${dosyaAdi} derleme hatası:\n` + hatalar.map((e) => e.formattedMessage).join("\n")
      );
    }
  }
  return output.contracts[dosyaAdi];
}

function revertSebebiCoz(returnValue) {
  if (!returnValue || returnValue.length === 0) return "(boş revert)";
  const hex = bytesToHex(returnValue);
  if (hex.startsWith("0x08c379a0")) {
    try {
      const [msg] = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + hex.slice(10));
      return msg;
    } catch {}
  }
  return hex;
}

async function snarkCalldataUret(proof, publicSignals) {
  const raw = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const parsed = JSON.parse("[" + raw + "]");
  return { pA: parsed[0], pB: parsed[1], pC: parsed[2], pubSignals: parsed[3] };
}

async function main() {
  console.log("=== Quantum Garaj ZK — Tam Doğrulama & EVM Test Paketi ===\n");

  // ---------------------------------------------------------------------------
  // A) Solidity Derleme ve EIP-170 Bytecode Boyut Kontrolleri
  // ---------------------------------------------------------------------------
  console.log("[A] Solidity sözleşmeleri derleniyor (solc 0.8.24)...");
  const poseidonCompiledOpt = solidityDerle("PoseidonT3.sol", true).PoseidonT3;
  const poseidonCompiledNoOpt = solidityDerle("PoseidonT3.sol", false).PoseidonT3;
  const verifierCompiled = solidityDerle("Groth16Verifier.sol", true).Groth16Verifier;
  const garajCompiled = solidityDerle("GarajKayitZK.sol", true).GarajKayitZK;

  const boyutlar = [
    ["PoseidonT3 (opt=ON) ", poseidonCompiledOpt.evm.deployedBytecode.object.length / 2],
    ["PoseidonT3 (opt=OFF)", poseidonCompiledNoOpt.evm.deployedBytecode.object.length / 2],
    ["Groth16Verifier     ", verifierCompiled.evm.deployedBytecode.object.length / 2],
    ["GarajKayitZK        ", garajCompiled.evm.deployedBytecode.object.length / 2],
  ];
  for (const [ad, bayt] of boyutlar) {
    console.log(`    ✓ ${ad}: ${bayt} bayt (limit: 24576)`);
    assert(bayt < 24576, `${ad} EIP-170 24 KB limitini aşıyor!`);
  }

  // ABI'yi projects/zk/GarajKayitZK.abi.json olarak dışa aktar
  fs.writeFileSync(
    path.join(PROJECTS_ZK_DIR, "GarajKayitZK.abi.json"),
    JSON.stringify(garajCompiled.abi, null, 2),
    "utf8"
  );

  // ---------------------------------------------------------------------------
  // B) Yerel Sepolia EVM Kurulumu & 3 Yönlü Poseidon Doğrulaması
  // ---------------------------------------------------------------------------
  console.log("\n[B] Yerel Sepolia EVM (@ethereumjs/vm) başlatılıyor...");
  const common = new Common({ chain: Sepolia, hardfork: Hardfork.Cancun });
  const vm = await createVM({ common });

  // 4 yerel test hesabı (yalnızca geçici test anahtarları)
  const hesaplar = [
    { ad: "Gorevli", pk: Buffer.from("01".repeat(32), "hex") },
    { ad: "Zengin1", pk: Buffer.from("02".repeat(32), "hex") },
    { ad: "Zengin2", pk: Buffer.from("03".repeat(32), "hex") },
    { ad: "Temiz2 ", pk: Buffer.from("04".repeat(32), "hex") },
  ];

  for (const h of hesaplar) {
    h.addrObj = createAddressFromPrivateKey(h.pk);
    h.address = ethers.getAddress(h.addrObj.toString());
    h.nonce = 0n;
    await vm.stateManager.putAccount(
      h.addrObj,
      createAccount({ balance: ethers.parseEther("10") })
    );
  }

  const [gorevli, zengin1, zengin2, temizCuzdan] = hesaplar;

  async function islemGonder(hesap, { to = null, data = "0x", value = 0n, gasLimit = 8_000_000n }) {
    const acc = await vm.stateManager.getAccount(hesap.addrObj);
    const txData = {
      nonce: acc ? acc.nonce : 0n,
      gasPrice: 1_000_000_000n,
      gasLimit,
      value,
      data: hexToBytes(data),
    };
    if (to) txData.to = createAddressFromString(to);
    const tx = createLegacyTx(txData, { common }).sign(hesap.pk);
    const res = await runTx(vm, { tx, skipBalance: false });
    return res;
  }

  async function viewCagir(hedef, iface, fnAdi, args = []) {
    const calldata = iface.encodeFunctionData(fnAdi, args);
    const res = await vm.evm.runCall({
      to: createAddressFromString(hedef),
      caller: gorevli.addrObj,
      data: hexToBytes(calldata),
      gasLimit: 5_000_000n,
      isStatic: true,
    });
    if (res.execResult.exceptionError) {
      throw new Error(`View hatası (${fnAdi}): ${revertSebebiCoz(res.execResult.returnValue)}`);
    }
    return iface.decodeFunctionResult(fnAdi, bytesToHex(res.execResult.returnValue));
  }

  // Sözleşmeleri deploy et
  const posDeployRes = await islemGonder(gorevli, {
    data: "0x" + poseidonCompiledOpt.evm.bytecode.object,
  });
  assert(!posDeployRes.execResult.exceptionError, "PoseidonT3 deploy başarısız!");
  const poseidonAddr = ethers.getAddress(posDeployRes.createdAddress.toString());

  const verDeployRes = await islemGonder(gorevli, {
    data: "0x" + verifierCompiled.evm.bytecode.object,
  });
  assert(!verDeployRes.execResult.exceptionError, "Groth16Verifier deploy başarısız!");
  const verifierAddr = ethers.getAddress(verDeployRes.createdAddress.toString());

  const poseidonIface = new ethers.Interface(poseidonCompiledOpt.abi);
  const garajIface = new ethers.Interface(garajCompiled.abi);

  // 3 Yönlü Poseidon Testi
  const circomPoseidon = await buildPoseidon();
  const testCiftleri = [
    [0n, 0n],
    [1n, 2n],
    [123456789n, 987654321n],
    [rastgeleAlanElemani(), rastgeleAlanElemani()],
  ];

  for (const [a, b] of testCiftleri) {
    const refCircom = circomPoseidon.F.toObject(circomPoseidon([a, b]));
    const refBrowser = browserPoseidon2([a, b]);
    const [refSolidity] = await viewCagir(poseidonAddr, poseidonIface, "hash", [[a, b]]);
    assert.strictEqual(refBrowser, refCircom, "poseidon2.js circomlibjs ile uyuşmuyor!");
    assert.strictEqual(refSolidity, refCircom, "PoseidonT3.sol circomlibjs ile uyuşmuyor!");
  }
  console.log("    ✓ 3 yönlü Poseidon(2) eşleşmesi doğrulandı (circomlibjs === browser === Solidity)");

  // GarajKayitZK deploy (KAPASITE=3, BILET_UCRETI=0.001 ETH)
  const biletUcreti = ethers.parseEther("0.001");
  const ctorArgs = garajIface.encodeDeploy([
    poseidonAddr,
    verifierAddr,
    "otomobil garaji (ZK)",
    3n,
    biletUcreti,
  ]);
  const garajDeployRes = await islemGonder(gorevli, {
    data: "0x" + garajCompiled.evm.bytecode.object + ctorArgs.slice(2),
  });
  assert(!garajDeployRes.execResult.exceptionError, "GarajKayitZK deploy başarısız!");
  const garajAddr = ethers.getAddress(garajDeployRes.createdAddress.toString());
  console.log(`    ✓ Sözleşmeler yerel Sepolia EVM'e deploy edildi (${garajAddr})`);

  const [zincirEtkinlikId] = await viewCagir(garajAddr, garajIface, "ETKINLIK_ID");
  const yerelEtkinlikId = etkinlikIdHesapla(11155111n, garajAddr);
  assert.strictEqual(zincirEtkinlikId, yerelEtkinlikId, "ETKINLIK_ID uyuşmuyor!");

  const merkle = new YerelPoseidonMerkle(AGAC_DERINLIGI);
  const [ilkKok] = await viewCagir(garajAddr, garajIface, "guncelKok");
  assert.strictEqual(ilkKok, merkle.kok(), "Başlangıç boş Merkle kökü uyuşmuyor!");
  console.log("    ✓ Başlangıç boş Merkle kökü ve ETKINLIK_ID birebir eşleşti");

  // ---------------------------------------------------------------------------
  // C) Off-Chain Devre Güvenlik Testleri (Geçerli / Sahte / Non-Binary / Front-Run)
  // ---------------------------------------------------------------------------
  console.log("\n[C] Off-chain Groth16 devre & güvenlik testleri...");
  const wasmPath = path.join(DOCS_ARTIFACTS_DIR, "garajBilet.wasm");
  const zkeyPath = path.join(DOCS_ARTIFACTS_DIR, "garajBilet_final.zkey");
  const vKey = JSON.parse(
    fs.readFileSync(path.join(DOCS_ARTIFACTS_DIR, "verification_key.json"), "utf8")
  );

  // Bilet 1 ve Bilet 2 gizli anahtarlarını üret
  const bilet1 = { secret: rastgeleAlanElemani(), nullifierSecret: rastgeleAlanElemani() };
  bilet1.commitment = browserPoseidon2([bilet1.secret, bilet1.nullifierSecret]);
  bilet1.nullifierHash = browserPoseidon2([bilet1.nullifierSecret, yerelEtkinlikId]);

  const bilet2 = { secret: rastgeleAlanElemani(), nullifierSecret: rastgeleAlanElemani() };
  bilet2.commitment = browserPoseidon2([bilet2.secret, bilet2.nullifierSecret]);
  bilet2.nullifierHash = browserPoseidon2([bilet2.nullifierSecret, yerelEtkinlikId]);

  const bilet3 = { secret: rastgeleAlanElemani(), nullifierSecret: rastgeleAlanElemani() };
  bilet3.commitment = browserPoseidon2([bilet3.secret, bilet3.nullifierSecret]);
  bilet3.nullifierHash = browserPoseidon2([bilet3.nullifierSecret, yerelEtkinlikId]);

  // Test 1: Yanlış bilet ücretiyle biletAl reddedilmeli
  const yanlisUcretRes = await islemGonder(zengin1, {
    to: garajAddr,
    data: garajIface.encodeFunctionData("biletAl", [bilet1.commitment]),
    value: 0n,
  });
  assert(yanlisUcretRes.execResult.exceptionError, "Yanlış ücret kabul edildi!");
  console.log(`    ✓ [1] Yanlış ücret reddedildi: "${revertSebebiCoz(yanlisUcretRes.execResult.returnValue)}"`);

  // Test 2: Bilet 1 alımı ve Merkle kökü kontrolü
  const b1Res = await islemGonder(zengin1, {
    to: garajAddr,
    data: garajIface.encodeFunctionData("biletAl", [bilet1.commitment]),
    value: biletUcreti,
  });
  assert(!b1Res.execResult.exceptionError, "Bilet 1 alımı başarısız!");
  merkle.ekle(bilet1.commitment);
  const [kok1] = await viewCagir(garajAddr, garajIface, "guncelKok");
  assert.strictEqual(kok1, merkle.kok(), "Bilet 1 sonrası Merkle kökü uyuşmuyor!");
  console.log(`    ✓ [2] Bilet 1 kesildi & Merkle kökü eşleşti (gas: ${b1Res.totalGasSpent})`);

  // Bilet 1 için Kök #1 anındaki Merkle yolunu kaydet (sonra Bilet 2 eklendikten sonra eski kökle kanıt deneyeceğiz!)
  const yol1EskiKok = merkle.kanitYolu(0);

  // Test 3: Aynı commitment tekrar gönderilememeli
  const dupCommitRes = await islemGonder(zengin2, {
    to: garajAddr,
    data: garajIface.encodeFunctionData("biletAl", [bilet1.commitment]),
    value: biletUcreti,
  });
  assert(dupCommitRes.execResult.exceptionError, "Çift commitment kabul edildi!");
  console.log(`    ✓ [3] Çift commitment reddedildi: "${revertSebebiCoz(dupCommitRes.execResult.returnValue)}"`);

  // Bilet 2 alımı (Kök #2 oluşur; Bilet 1'in kanıtı Kök #1'e göre üretilecek — root history testi!)
  const b2Res = await islemGonder(zengin2, {
    to: garajAddr,
    data: garajIface.encodeFunctionData("biletAl", [bilet2.commitment]),
    value: biletUcreti,
  });
  assert(!b2Res.execResult.exceptionError, "Bilet 2 alımı başarısız!");
  merkle.ekle(bilet2.commitment);
  const [kok2] = await viewCagir(garajAddr, garajIface, "guncelKok");
  assert.strictEqual(kok2, merkle.kok(), "Bilet 2 sonrası Merkle kökü uyuşmuyor!");
  console.log(`    ✓ [4] Bilet 2 kesildi & yeni Merkle kökü eşleşti (gas: ${b2Res.totalGasSpent})`);

  // Bilet 1 için geçerli Groth16 kanıtı üret (eski Kök #1 + temizCuzdan adresine kilitli!)
  const takmaAd1 = "GizliSurucu1";
  const baglam1 = baglamHashHesapla(takmaAd1, temizCuzdan.address);
  const girdi1 = {
    secret: bilet1.secret.toString(),
    nullifierSecret: bilet1.nullifierSecret.toString(),
    yolElemanlari: yol1EskiKok.yolElemanlari.map((x) => x.toString()),
    yolYonleri: yol1EskiKok.yolYonleri,
    kok: yol1EskiKok.kok.toString(),
    nullifierHash: bilet1.nullifierHash.toString(),
    etkinlikId: yerelEtkinlikId.toString(),
    baglamHash: baglam1.toString(),
  };

  const t0 = Date.now();
  const { proof: proof1, publicSignals: pub1 } = await snarkjs.groth16.fullProve(
    girdi1,
    wasmPath,
    zkeyPath
  );
  const sureMs = Date.now() - t0;
  const offChainOk = await snarkjs.groth16.verify(vKey, pub1, proof1);
  assert.strictEqual(offChainOk, true, "Off-chain doğrulama başarısız!");
  console.log(`    ✓ [5] Groth16 kanıtı üretildi ve off-chain doğrulandı (${sureMs} ms)`);

  // Test 6: Sahte secret ile devre kanıt üretmeyi reddetmeli
  let sahteReddedildi = false;
  try {
    await snarkjs.groth16.fullProve(
      { ...girdi1, secret: (bilet1.secret + 1n).toString() },
      wasmPath,
      zkeyPath
    );
  } catch {
    sahteReddedildi = true;
  }
  assert.strictEqual(sahteReddedildi, true, "Sahte secret devreden geçti!");
  console.log("    ✓ [6] Yanlış secret ile sahte bilet denemesi devre tarafından reddedildi");

  // Test 7: Non-binary yolYonleri (ör. 2) devre güvenlik kısıtıyla reddedilmeli
  let nonBinaryReddedildi = false;
  try {
    const bozukYonler = [...girdi1.yolYonleri];
    bozukYonler[0] = 2;
    await snarkjs.groth16.fullProve({ ...girdi1, yolYonleri: bozukYonler }, wasmPath, zkeyPath);
  } catch {
    nonBinaryReddedildi = true;
  }
  assert.strictEqual(nonBinaryReddedildi, true, "Non-binary yolYonleri devreden geçti!");
  console.log("    ✓ [7] Non-binary Merkle yön saldırısı (sel=2) devre tarafından reddedildi");

  // Test 8: Off-chain front-running (baglamHash değiştirme) doğrulamayı geçememeli
  const sahtePub = [...pub1];
  sahtePub[3] = baglamHashHesapla("HirsizBot", temizCuzdan.address).toString();
  const frontRunOffchain = await snarkjs.groth16.verify(vKey, sahtePub, proof1);
  assert.strictEqual(frontRunOffchain, false, "Off-chain front-running geçti!");
  console.log("    ✓ [8] Off-chain front-running (takmaAd değiştirme) doğrulamadan geçemedi");

  // ---------------------------------------------------------------------------
  // D) Zincir Üstü EVM Doğrulama ve Saldırı Testleri
  // ---------------------------------------------------------------------------
  console.log("\n[D] Zincir üstü EVM Groth16 doğrulama ve saldırı senaryoları...");
  const cd1 = await snarkCalldataUret(proof1, pub1);

  // Test 9: Zincir üstü front-running saldırısı (takmaAd değiştirilerek gönderim)
  const frTx = await islemGonder(temizCuzdan, {
    to: garajAddr,
    data: garajIface.encodeFunctionData("zkGirisYap", [
      cd1.pA,
      cd1.pB,
      cd1.pC,
      yol1EskiKok.kok,
      bilet1.nullifierHash,
      "HirsizTakmaAd",
      temizCuzdan.address,
    ]),
  });
  assert(frTx.execResult.exceptionError, "Zincir üstü front-running kabul edildi!");
  console.log(`    ✓ [9] Zincir üstü front-running reddedildi: "${revertSebebiCoz(frTx.execResult.returnValue)}"`);

  // Test 10: Temiz 2. cüzdan ile gerçek anonim giriş (üstelik eski Kök #1 ile!)
  const giris1Tx = await islemGonder(temizCuzdan, {
    to: garajAddr,
    data: garajIface.encodeFunctionData("zkGirisYap", [
      cd1.pA,
      cd1.pB,
      cd1.pC,
      yol1EskiKok.kok,
      bilet1.nullifierHash,
      takmaAd1,
      temizCuzdan.address,
    ]),
  });
  assert(
    !giris1Tx.execResult.exceptionError,
    `Geçerli zkGirisYap başarısız oldu: ${revertSebebiCoz(giris1Tx.execResult.returnValue)}`
  );
  console.log(
    `    ✓ [10] Temiz 2. cüzdan ile eski kök geçmişinden anonim giriş ONAYLANDI (gas: ${giris1Tx.totalGasSpent})`
  );

  // Test 11: Aynı biletle 2. kez giriş (double-spend nullifier) reddedilmeli
  const ciftGirisTx = await islemGonder(temizCuzdan, {
    to: garajAddr,
    data: garajIface.encodeFunctionData("zkGirisYap", [
      cd1.pA,
      cd1.pB,
      cd1.pC,
      yol1EskiKok.kok,
      bilet1.nullifierHash,
      takmaAd1,
      temizCuzdan.address,
    ]),
  });
  assert(ciftGirisTx.execResult.exceptionError, "Çift giriş (double-spend) kabul edildi!");
  console.log(
    `    ✓ [11] Çift giriş saldırısı reddedildi: "${revertSebebiCoz(ciftGirisTx.execResult.returnValue)}"`
  );

  // Test 12: Görevli (Relayer) Modu — Bilet 2 sahibi address(0) bağlayıp kanıtı görevliye verir
  const yol2 = merkle.kanitYolu(1);
  const takmaAd2 = "RelayerMisafir2";
  const baglam2 = baglamHashHesapla(takmaAd2, ethers.ZeroAddress);
  const { proof: proof2, publicSignals: pub2 } = await snarkjs.groth16.fullProve(
    {
      secret: bilet2.secret.toString(),
      nullifierSecret: bilet2.nullifierSecret.toString(),
      yolElemanlari: yol2.yolElemanlari.map((x) => x.toString()),
      yolYonleri: yol2.yolYonleri,
      kok: yol2.kok.toString(),
      nullifierHash: bilet2.nullifierHash.toString(),
      etkinlikId: yerelEtkinlikId.toString(),
      baglamHash: baglam2.toString(),
    },
    wasmPath,
    zkeyPath
  );
  const cd2 = await snarkCalldataUret(proof2, pub2);
  const relayerTx = await islemGonder(gorevli, {
    to: garajAddr,
    data: garajIface.encodeFunctionData("zkGirisYap", [
      cd2.pA,
      cd2.pB,
      cd2.pC,
      yol2.kok,
      bilet2.nullifierHash,
      takmaAd2,
      ethers.ZeroAddress,
    ]),
  });
  assert(
    !relayerTx.execResult.exceptionError,
    `Relayer zkGirisYap başarısız: ${revertSebebiCoz(relayerTx.execResult.returnValue)}`
  );
  const [girisler] = await viewCagir(garajAddr, garajIface, "tumGirisler");
  assert.strictEqual(girisler.length, 2, "Toplam giriş sayısı 2 olmalı!");
  assert.strictEqual(girisler[0].takmaAd, takmaAd1);
  assert.strictEqual(girisler[1].takmaAd, takmaAd2);
  assert.strictEqual(ethers.getAddress(girisler[1].gonderen), gorevli.address);
  console.log(
    `    ✓ [12] Görevli (Relayer) modu ile anonim giriş ONAYLANDI (gas: ${relayerTx.totalGasSpent})`
  );

  // Test 13: Kontenjan doluluğu (KAPASITE=3)
  const b3Res = await islemGonder(zengin1, {
    to: garajAddr,
    data: garajIface.encodeFunctionData("biletAl", [bilet3.commitment]),
    value: biletUcreti,
  });
  assert(!b3Res.execResult.exceptionError, "3. bilet alımı başarısız!");

  const b4Res = await islemGonder(zengin2, {
    to: garajAddr,
    data: garajIface.encodeFunctionData("biletAl", [rastgeleAlanElemani()]),
    value: biletUcreti,
  });
  assert(b4Res.execResult.exceptionError, "Kapasite aşımı kabul edildi!");
  console.log(`    ✓ [13] Kapasite doluluğu reddedildi: "${revertSebebiCoz(b4Res.execResult.returnValue)}"`);

  // Test 14: Yetkisiz ve yetkili ücret çekimi
  const yetkisizCekim = await islemGonder(zengin1, {
    to: garajAddr,
    data: garajIface.encodeFunctionData("ucretleriCek", []),
  });
  assert(yetkisizCekim.execResult.exceptionError, "Yetkisiz ücret çekimi kabul edildi!");

  const gorevliOnce = (await vm.stateManager.getAccount(gorevli.addrObj)).balance;
  const yetkiliCekim = await islemGonder(gorevli, {
    to: garajAddr,
    data: garajIface.encodeFunctionData("ucretleriCek", []),
  });
  assert(!yetkiliCekim.execResult.exceptionError, "Görevli ücret çekimi başarısız!");
  const gorevliSonra = (await vm.stateManager.getAccount(gorevli.addrObj)).balance;
  const gazMaliyeti = yetkiliCekim.totalGasSpent * 1_000_000_000n;
  assert.strictEqual(gorevliSonra - gorevliOnce + gazMaliyeti, biletUcreti * 3n);
  console.log("    ✓ [14] Görevli yetki kontrolü & 0.003 ETH ücret çekimi doğrulandı");

  console.log("\n=== TÜM 14 KRİPTOGRAFİK VE ZİNCİR ÜSTÜ TEST BAŞARIYLA GEÇTİ! ===");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nTEST BAŞARISIZ:", err);
    process.exit(1);
  });
