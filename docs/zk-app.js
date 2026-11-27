/* Quantum Garaj ZK — Groth16 & Poseidon Merkle Tarayıcı İstemcisi (GitHub Pages Uyumlu) */

(function () {
  "use strict";

  const el = (id) => document.getElementById(id);

  const SEPOLIA_CHAIN_ID = 11155111n;
  const SEPOLIA_CHAIN_HEX = "0xaa36a7";
  const ETHERSCAN_URL = "https://sepolia.etherscan.io";
  const SEPOLIA_RPCS = [
    "https://sepolia.gateway.tenderly.co",
    "https://ethereum-sepolia-rpc.publicnode.com",
  ];

  const SNARK_FIELD =
    window.POSEIDON_SNARK_FIELD ||
    21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  const AGAC_DERINLIGI = 10;

  const WASM_URL = "zk-artifacts/garajBilet.wasm";
  const ZKEY_URL = "zk-artifacts/garajBilet_final.zkey";
  const VKEY_URL = "zk-artifacts/verification_key.json";

  const STORAGE_CONTRACT_KEY = "garaj-zk-sozlesme-v1";
  const STORAGE_TICKETS_KEY = "garaj-zk-biletler-v1";

  const GARAJ_ZK_ABI = [
    "function etkinlikAdi() view returns (string)",
    "function KAPASITE() view returns (uint256)",
    "function BILET_UCRETI() view returns (uint256)",
    "function ETKINLIK_ID() view returns (uint256)",
    "function gorevli() view returns (address)",
    "function guncelKok() view returns (uint256)",
    "function toplamBilet() view returns (uint256)",
    "function toplamGiris() view returns (uint256)",
    "function bilinenKokMu(uint256 _kok) view returns (bool)",
    "function kullanilanNullifier(uint256) view returns (bool)",
    "function taahhutKayitliMi(uint256) view returns (bool)",
    "function baglamHashHesapla(string _takmaAd, address _girisAdresi) pure returns (uint256)",
    "function tumGirisler() view returns ((uint256 nullifierHash, string takmaAd, address girisAdresi, address gonderen, uint256 zaman)[])",
    "function biletAl(uint256 _commitment) payable",
    "function zkGirisYap(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256 _kok, uint256 _nullifierHash, string _takmaAd, address _girisAdresi)",
    "function ucretleriCek()",
    "event BiletAlindi(uint256 indexed commitment, uint32 indexed yaprakIndeksi, uint256 yeniKok, uint256 zaman)",
    "event ZkGirisYapildi(uint256 indexed nullifierHash, string takmaAd, address indexed girisAdresi, address indexed gonderen, uint256 zaman)",
    "event UcretlerCekildi(address indexed gorevli, uint256 miktar)",
  ];

  // Uygulama durumu
  let browserProvider = null;
  let signer = null;
  let aktifAdres = null;
  let dogruAg = false;
  let aktifIslemVar = false;

  let sozlesmeAyar = null; // { address, deployBlock }
  let sozlesmeBilgi = null;
  let merkleYapraklar = []; // [{ index, commitment, txHash, zaman }]
  let yerelMerkle = null;
  let yerelKokUygunMu = false;
  let onbellekVKey = null;

  // Kart 1'de üretilen mevcut taslak bilet
  let taslakBilet = null; // { secret, nullifierSecret, commitment, notMetni }
  let biletNotuGorunur = false;
  let relayerPaketOnayli = null;

  const tarihFmt = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const kisaAdres = (a) => (a && a.length >= 10 ? a.slice(0, 6) + "…" + a.slice(-4) : a || "–");
  const kisaSayi = (v) => {
    const s = String(v ?? "");
    return s.length > 16 ? s.slice(0, 8) + "…" + s.slice(-6) : s || "–";
  };

  /* ===========================
     1) TEMA & YARDIMCILAR
     =========================== */
  function temaUygula(tema) {
    const root = document.documentElement;
    if (tema === "dark" || tema === "light") {
      root.dataset.theme = tema;
    } else {
      delete root.dataset.theme;
    }
    const aktifKoyu =
      tema === "dark" ||
      (!tema && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const icon = el("themeIcon");
    if (icon) {
      icon.innerHTML = aktifKoyu
        ? '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>'
        : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
    }
  }

  function temaBaslat() {
    temaUygula(localStorage.getItem("garaj-tema"));
    el("themeBtn").addEventListener("click", () => {
      const suAnKoyu =
        document.documentElement.dataset.theme === "dark" ||
        (!document.documentElement.dataset.theme &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      const yeni = suAnKoyu ? "light" : "dark";
      localStorage.setItem("garaj-tema", yeni);
      temaUygula(yeni);
    });
  }

  function kopyala(metin, btn, varsayilanMetin) {
    if (!metin) return;
    navigator.clipboard?.writeText(metin).then(() => {
      if (!btn) return;
      btn.textContent = "Kopyalandı ✓";
      setTimeout(() => {
        btn.textContent = varsayilanMetin;
      }, 1500);
    });
  }

  function durumGoster({ tur = "info", rozet = "Durum", baslik = "", mesaj = "", detay = "", txHash = "", adim = null, basariliAdim = false }) {
    const kutu = el("durumKutusu");
    kutu.className = "tx-status-bar show " + tur;
    el("durumRozeti").textContent = rozet;
    el("durumBaslik").textContent = baslik;
    el("durumMesaji").textContent = mesaj;

    const detayEl = el("durumDetay");
    if (detay) {
      detayEl.textContent = detay;
      detayEl.style.display = "block";
    } else {
      detayEl.style.display = "none";
    }

    const linkEl = el("durumTxLink");
    if (txHash) {
      linkEl.href = `${ETHERSCAN_URL}/tx/${txHash}`;
      linkEl.textContent = txHash.slice(0, 10) + "…" + txHash.slice(-6);
      linkEl.style.display = "inline";
    } else {
      linkEl.style.display = "none";
    }

    const hat = el("islemHatti");
    if (adim !== null) {
      hat.style.display = "flex";
      hat.querySelectorAll(".step-pill").forEach((pill) => {
        const s = Number(pill.dataset.step);
        pill.classList.remove("active", "done", "fail");
        if (basariliAdim) {
          if (s <= adim) pill.classList.add("done");
        } else if (tur === "error") {
          if (s < adim) pill.classList.add("done");
          else if (s === adim) pill.classList.add("fail");
        } else {
          if (s < adim) pill.classList.add("done");
          else if (s === adim) pill.classList.add("active");
        }
      });
    } else {
      hat.style.display = "none";
    }
  }

  function durumGizle() {
    el("durumKutusu").className = "tx-status-bar";
  }

  function hataMesajiCoz(err) {
    if (!err) return "Bilinmeyen hata oluştu.";
    if (err.code === "ACTION_REJECTED" || err.code === 4001) {
      return "İşlem MetaMask cüzdanında kullanıcı tarafından reddedildi.";
    }
    const ham = err.reason || err.shortMessage || err.info?.error?.message || err.message || "";
    const eslesme = ham.match(/reverted(?: with reason string)? ["']([^"']+)["']/i);
    if (eslesme) return `Sözleşme reddetti: ${eslesme[1]}`;
    return ham.slice(0, 220) || "İşlem tamamlanamadı.";
  }

  /* ===========================
     2) KRİPTOGRAFİ & MERKLE AĞACI
     =========================== */
  function rastgeleAlanElemani() {
    const bytes = new Uint8Array(31); // 248-bit => BN254 SNARK_FIELD'dan kesinlikle küçük
    crypto.getRandomValues(bytes);
    let hex = "0x";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    return BigInt(hex);
  }

  function biletNotuOlustur(secret, nullifierSecret) {
    const sHex = secret.toString(16).padStart(62, "0");
    const nHex = nullifierSecret.toString(16).padStart(62, "0");
    return `qzk-v1-${sHex}-${nHex}`;
  }

  function biletNotuCoz(hamMetin) {
    const temiz = String(hamMetin || "").trim();
    const m = /^qzk-v1-([0-9a-fA-F]{1,64})-([0-9a-fA-F]{1,64})$/.exec(temiz);
    if (!m) {
      throw new Error("Geçersiz bilet formatı. Bilet kodu 'qzk-v1-<hex>-<hex>' biçiminde olmalıdır.");
    }
    const secret = BigInt("0x" + m[1]);
    const nullifierSecret = BigInt("0x" + m[2]);
    if (secret <= 0n || secret >= SNARK_FIELD || nullifierSecret <= 0n || nullifierSecret >= SNARK_FIELD) {
      throw new Error("Bilet anahtarları BN254 alan sınırının dışında.");
    }
    const commitment = window.poseidon2([secret, nullifierSecret]);
    return { secret, nullifierSecret, commitment, notMetni: temiz };
  }

  function baglamHashHesapla(takmaAd, girisAdresi) {
    const h = ethers.solidityPackedKeccak256(["string", "address"], [takmaAd, girisAdresi]);
    return BigInt(h) % SNARK_FIELD;
  }

  class TarayiciPoseidonMerkle {
    constructor(derinlik = AGAC_DERINLIGI) {
      this.derinlik = derinlik;
      this.yapraklar = [];
      this.sifirlar = [0n];
      for (let i = 1; i <= derinlik; i++) {
        this.sifirlar[i] = window.poseidon2([this.sifirlar[i - 1], this.sifirlar[i - 1]]);
      }
    }

    yapraklariYukle(liste) {
      this.yapraklar = liste.map((x) => BigInt(x));
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
          sonraki.push(window.poseidon2([sol, sag]));
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

  /* ===========================
     3) YEREL BİLET DEPOSU
     =========================== */
  function tumKayitliBiletleriOku() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_TICKETS_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function yerelBiletKaydet(kayit) {
    const liste = tumKayitliBiletleriOku().filter(
      (b) => !(b.contract?.toLowerCase() === kayit.contract.toLowerCase() && b.commitment === kayit.commitment)
    );
    liste.unshift(kayit);
    localStorage.setItem(STORAGE_TICKETS_KEY, JSON.stringify(liste.slice(0, 30)));
    kayitliBiletSeciminiCiz();
  }

  function aktifSozlesmeBiletleri() {
    if (!sozlesmeAyar) return [];
    const hedef = sozlesmeAyar.address.toLowerCase();
    return tumKayitliBiletleriOku().filter((b) => b.contract?.toLowerCase() === hedef);
  }

  function kayitliBiletSeciminiCiz() {
    const sel = el("kayitliBiletSec");
    const biletler = aktifSozlesmeBiletleri();
    sel.innerHTML = '<option value="">-- Kayıtlı bilet seç veya aşağıya yapıştır --</option>';
    for (const b of biletler) {
      const opt = document.createElement("option");
      opt.value = b.notMetni;
      const tarih = b.tarih ? tarihFmt.format(new Date(b.tarih)) : "";
      opt.textContent = `Mühür ${kisaSayi(b.commitment)} · ${kisaAdres(b.satinAlan)} (${tarih})`;
      sel.appendChild(opt);
    }
  }

  /* ===========================
     4) RPC & ZİNCİR OKUMA
     =========================== */
  async function okumaProviderAl() {
    if (browserProvider && dogruAg) return browserProvider;
    for (const url of SEPOLIA_RPCS) {
      try {
        const p = new ethers.JsonRpcProvider(url, 11155111, { staticNetwork: true });
        await Promise.race([
          p.getBlockNumber(),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 6500)),
        ]);
        return p;
      } catch {}
    }
    throw new Error("Sepolia RPC düğümlerine ulaşılamadı. İnternet bağlantını veya MetaMask'ı kontrol et.");
  }

  async function loglariParcaliOku(provider, address, topic0, baslangicBlok, tepeBlok) {
    const parcaBoyutu = 40000;
    const tumLoglar = [];
    let from = baslangicBlok;
    while (from <= tepeBlok) {
      const to = Math.min(from + parcaBoyutu - 1, tepeBlok);
      const logs = await provider.getLogs({
        address,
        topics: [topic0],
        fromBlock: from,
        toBlock: to,
      });
      tumLoglar.push(...logs);
      from = to + 1;
    }
    return tumLoglar;
  }

  async function zincirDurumunuYenile() {
    if (!sozlesmeAyar) return;
    const btn = el("yenileBtn");
    btn.classList.add("spinning");
    el("status").textContent = "Sepolia zinciri ve Merkle ağacı senkronize ediliyor…";

    try {
      const provider = await okumaProviderAl();
      const contract = new ethers.Contract(sozlesmeAyar.address, GARAJ_ZK_ABI, provider);

      const [
        etkinlikAdi,
        kapasite,
        biletUcreti,
        etkinlikId,
        gorevli,
        guncelKok,
        toplamBilet,
        toplamGiris,
        kasaWei,
        girisKayitlari,
        tepeBlok,
      ] = await Promise.all([
        contract.etkinlikAdi(),
        contract.KAPASITE(),
        contract.BILET_UCRETI(),
        contract.ETKINLIK_ID(),
        contract.gorevli(),
        contract.guncelKok(),
        contract.toplamBilet(),
        contract.toplamGiris(),
        provider.getBalance(sozlesmeAyar.address),
        contract.tumGirisler(),
        provider.getBlockNumber(),
      ]);

      sozlesmeBilgi = {
        etkinlikAdi,
        kapasite: BigInt(kapasite),
        biletUcreti: BigInt(biletUcreti),
        etkinlikId: BigInt(etkinlikId),
        gorevli: ethers.getAddress(gorevli),
        guncelKok: BigInt(guncelKok),
        toplamBilet: Number(toplamBilet),
        toplamGiris: Number(toplamGiris),
        kasaWei: BigInt(kasaWei),
        girisKayitlari,
      };

      // BiletAlindi eventlerini okuyup yerel Poseidon Merkle ağacını oluştur
      const iface = new ethers.Interface(GARAJ_ZK_ABI);
      const biletTopic = iface.getEvent("BiletAlindi").topicHash;
      const baslangic =
        Number.isInteger(sozlesmeAyar.deployBlock) && sozlesmeAyar.deployBlock >= 0
          ? sozlesmeAyar.deployBlock
          : Math.max(0, tepeBlok - 120000);

      let loglar = [];
      try {
        loglar = await loglariParcaliOku(provider, sozlesmeAyar.address, biletTopic, baslangic, tepeBlok);
      } catch {
        // Tenderly yedek RPC ile tekrar dene
        const yedek = new ethers.JsonRpcProvider(SEPOLIA_RPCS[0], 11155111, { staticNetwork: true });
        loglar = await loglariParcaliOku(yedek, sozlesmeAyar.address, biletTopic, baslangic, tepeBlok);
      }

      const yaprakHarita = new Map();
      for (const lg of loglar) {
        const parsed = iface.parseLog(lg);
        const idx = Number(parsed.args.yaprakIndeksi);
        yaprakHarita.set(idx, {
          index: idx,
          commitment: BigInt(parsed.args.commitment),
          yeniKok: BigInt(parsed.args.yeniKok),
          zaman: Number(parsed.args.zaman),
          txHash: lg.transactionHash,
        });
      }

      merkleYapraklar = Array.from(yaprakHarita.values()).sort((a, b) => a.index - b.index);
      yerelMerkle = new TarayiciPoseidonMerkle(AGAC_DERINLIGI);
      yerelMerkle.yapraklariYukle(merkleYapraklar.map((y) => y.commitment));
      yerelKokUygunMu = yerelMerkle.kok() === sozlesmeBilgi.guncelKok;

      arayuzuGuncelle();
      el("status").textContent = `Son güncelleme: blok #${tepeBlok} · ${merkleYapraklar.length} bilet mührü tarandı.`;
    } catch (err) {
      el("status").textContent = "Zincir okuma hatası: " + hataMesajiCoz(err);
    } finally {
      btn.classList.remove("spinning");
    }
  }

  /* ===========================
     5) ARAYÜZ GÜNCELLEME
     =========================== */
  function arayuzuGuncelle() {
    if (!sozlesmeAyar || !sozlesmeBilgi) return;

    const b = sozlesmeBilgi;
    const ucretEth = ethers.formatEther(b.biletUcreti);
    const kasaEth = ethers.formatEther(b.kasaWei);
    const yuzde = b.kapasite > 0n ? Math.round((b.toplamBilet / Number(b.kapasite)) * 100) : 0;

    el("garajAdi").textContent = b.etkinlikAdi;
    el("toplamBilet").textContent = String(b.toplamBilet);
    el("kapasite").textContent = String(b.kapasite);
    el("biletYuzde").textContent = `${yuzde}%`;
    el("biletUcretiYazi").textContent =
      b.biletUcreti === 0n ? "Ücret: Ücretsiz (0 ETH)" : `Ücret: ${ucretEth} SepoliaETH`;

    el("toplamGiris").textContent = String(b.toplamGiris);
    el("bekleyenBiletYazi").textContent = `Kullanılmamış bilet: ${Math.max(0, b.toplamBilet - b.toplamGiris)}`;
    el("merkleYaprakSayisi").textContent = `${merkleYapraklar.length} yaprak`;
    el("kasaBakiye").textContent = `${Number(kasaEth).toFixed(4)} ETH`;
    el("etkinlikIdKisa").textContent = `ID: ${kisaSayi(b.etkinlikId)}`;

    // Merkle kök doğrulama rozeti
    const rozet = el("merkleRozet");
    if (yerelKokUygunMu) {
      el("merkleUyumDurum").textContent = "✓ Kök zincirle birebir eşleşti";
      rozet.textContent = "✓ Merkle Senkron";
      rozet.classList.remove("warn");
    } else {
      el("merkleUyumDurum").textContent = "⚠ Yayın bloğunu daha erken gir";
      rozet.textContent = "⚠ Eksik Log / Kök Farklı";
      rozet.classList.add("warn");
    }

    // Sol panel
    el("sideEtkinlik").textContent = b.etkinlikAdi;
    el("sideAdres").textContent = kisaAdres(sozlesmeAyar.address);
    el("sideAdres").href = `${ETHERSCAN_URL}/address/${sozlesmeAyar.address}`;
    el("sideUcret").textContent = b.biletUcreti === 0n ? "0 ETH" : `${ucretEth} ETH`;
    el("sideKok").textContent = kisaSayi(b.guncelKok);
    el("sideYerelKok").textContent = yerelMerkle ? kisaSayi(yerelMerkle.kok()) : "–";

    // Görevli paneli
    el("gorevliAdresi").textContent = kisaAdres(b.gorevli);
    el("gorevliAdresi").href = `${ETHERSCAN_URL}/address/${b.gorevli}`;
    el("gorevliKasaBakiye").textContent = `${kasaEth} ETH`;

    // Buton durumları
    const kontenjanDolu = BigInt(b.toplamBilet) >= b.kapasite;
    el("biletAlBtn").disabled = !signer || !dogruAg || aktifIslemVar || kontenjanDolu;
    el("biletAlBtnYazi").textContent = kontenjanDolu
      ? "Bilet Kontenjanı Doldu"
      : b.biletUcreti === 0n
        ? "Ücretsiz Bilet Kes (biletAl)"
        : `${ucretEth} ETH Öde & Bilet Kes`;

    const gorevliMi = aktifAdres && b.gorevli.toLowerCase() === aktifAdres.toLowerCase();
    el("ucretCekBtn").disabled = !signer || !dogruAg || aktifIslemVar || !gorevliMi || b.kasaWei === 0n;

    if (aktifAdres) {
      const chip = el("rolRozeti");
      chip.style.display = "inline-flex";
      chip.textContent = gorevliMi ? "Görevli" : "Katılımcı";
    }

    relayerButonunuGuncelle();
    ayniCuzdanKontroluYap();
    yaprakListesiniCiz();
    girisListesiniCiz();
    kayitliBiletSeciminiCiz();
  }

  function yaprakListesiniCiz() {
    const ul = el("yaprakListesi");
    el("yaprakSayac").textContent = String(merkleYapraklar.length);
    if (!merkleYapraklar.length) {
      ul.innerHTML = '<li class="tx-empty">Henüz kesilmiş gizli bilet yok.</li>';
      return;
    }
    ul.innerHTML = "";
    for (const y of [...merkleYapraklar].reverse()) {
      const li = document.createElement("li");
      li.className = "tx-item";
      li.innerHTML = `
        <div class="tx-main">
          <span class="tx-badge kayit">Yaprak #${y.index}</span>
          <span class="mono" style="font-size:.76rem">${kisaSayi(y.commitment)}</span>
        </div>
        <div class="tx-meta">
          <span>${y.zaman ? tarihFmt.format(new Date(y.zaman * 1000)) : "–"}</span>
          <a class="mono" target="_blank" rel="noopener" href="${ETHERSCAN_URL}/tx/${y.txHash}">tx ↗</a>
        </div>
      `;
      ul.appendChild(li);
    }
  }

  function girisListesiniCiz() {
    const ol = el("zkGirisListesi");
    const kayitlar = sozlesmeBilgi?.girisKayitlari || [];
    el("girisSayac").textContent = String(kayitlar.length);
    if (!kayitlar.length) {
      ol.innerHTML = '<li class="tx-empty">Henüz anonim ZK giriş kaydı bulunmuyor.</li>';
      return;
    }
    ol.innerHTML = "";
    kayitlar.forEach((k, i) => {
      const li = document.createElement("li");
      li.className = "entry";
      const relayerMi =
        k.girisAdresi === ethers.ZeroAddress ||
        k.girisAdresi.toLowerCase() !== k.gonderen.toLowerCase();
      const etiket = relayerMi
        ? '<span class="zk-tag-relayer">Relayer / Görevli İletti</span>'
        : '<span class="zk-tag-direct">2. Cüzdan Doğrudan</span>';
      const zamanYazi = k.zaman ? tarihFmt.format(new Date(Number(k.zaman) * 1000)) : "–";

      li.innerHTML = `
        <div class="node"><span>#${i + 1}</span></div>
        <div class="card">
          <div class="card-top">
            <strong class="name">${guvenliMetin(k.takmaAd)}</strong>
            ${etiket}
          </div>
          <div class="meta-row mono" style="font-size:.76rem;color:var(--muted);margin-top:6px;display:flex;flex-wrap:wrap;gap:12px">
            <span>Nullifier: ${kisaSayi(k.nullifierHash)}</span>
            <span>İleten (Gas): ${kisaAdres(k.gonderen)}</span>
            <span>Bağlı Adres: ${k.girisAdresi === ethers.ZeroAddress ? "Gizli (0x0)" : kisaAdres(k.girisAdresi)}</span>
            <span>${zamanYazi}</span>
          </div>
        </div>
      `;
      ol.appendChild(li);
    });
  }

  function guvenliMetin(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ===========================
     6) CÜZDAN BAĞLANTISI
     =========================== */
  async function cuzdanBagla() {
    if (!window.ethereum) {
      durumGoster({
        tur: "error",
        rozet: "Cüzdan Yok",
        baslik: "MetaMask bulunamadı",
        mesaj: "Zincir işlemleri için tarayıcında MetaMask eklentisi kurulu olmalıdır. (Not: Relayer modunda cüzdansız da ZK kanıtı üretebilirsin!)",
      });
      return;
    }

    try {
      browserProvider = new ethers.BrowserProvider(window.ethereum);
      await browserProvider.send("eth_requestAccounts", []);
      await cuzdanDurumunuOku();
    } catch (err) {
      durumGoster({
        tur: "error",
        rozet: "İptal",
        baslik: "Cüzdan bağlantısı kurulamadı",
        mesaj: hataMesajiCoz(err),
      });
    }
  }

  async function cuzdanDurumunuOku() {
    if (!window.ethereum) return;
    browserProvider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await browserProvider.send("eth_accounts", []);
    if (!accounts || !accounts.length) {
      aktifAdres = null;
      signer = null;
      dogruAg = false;
      el("bagliAdres").textContent = "Cüzdan Bağla";
      el("bagliNokta").style.display = "none";
      el("rolRozeti").style.display = "none";
      el("agUyariKutu").classList.remove("show");
      arayuzuGuncelle();
      return;
    }

    aktifAdres = ethers.getAddress(accounts[0]);
    const net = await browserProvider.getNetwork();
    dogruAg = net.chainId === SEPOLIA_CHAIN_ID;
    signer = dogruAg ? await browserProvider.getSigner() : null;

    el("bagliAdres").textContent = kisaAdres(aktifAdres);
    el("bagliNokta").style.display = "inline-block";

    if (!dogruAg) {
      el("agUyari").textContent = `Yanlış ağdasın (Chain ${net.chainId}). ZK Garaj işlemleri için Ethereum Sepolia ağına geçmelisin.`;
      el("agUyariKutu").classList.add("show");
    } else {
      el("agUyariKutu").classList.remove("show");
    }

    arayuzuGuncelle();
  }

  async function sepoliaGec() {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_HEX }],
      });
      await cuzdanDurumunuOku();
    } catch (err) {
      durumGoster({
        tur: "error",
        rozet: "Ağ Hatası",
        baslik: "Sepolia ağına geçilemedi",
        mesaj: hataMesajiCoz(err),
      });
    }
  }

  /* ===========================
     7) KART 1: GİZLİ BİLET ÜRET & AL
     =========================== */
  function yeniTaslakBiletUret() {
    const secret = rastgeleAlanElemani();
    const nullifierSecret = rastgeleAlanElemani();
    const commitment = window.poseidon2([secret, nullifierSecret]);
    const notMetni = biletNotuOlustur(secret, nullifierSecret);

    taslakBilet = { secret, nullifierSecret, commitment, notMetni };
    el("uretilenBiletNotu").textContent = notMetni;
    el("uretilenCommitment").textContent = commitment.toString();
  }

  async function biletAlCalistir() {
    if (!signer || !dogruAg || !sozlesmeAyar || !sozlesmeBilgi || !taslakBilet) return;
    aktifIslemVar = true;
    arayuzuGuncelle();

    try {
      const contract = new ethers.Contract(sozlesmeAyar.address, GARAJ_ZK_ABI, signer);
      const ucret = sozlesmeBilgi.biletUcreti;

      durumGoster({
        tur: "pending",
        rozet: "İmza Bekleniyor",
        baslik: "Gizli bilet mührü zincire kaydediliyor",
        mesaj: "MetaMask onay penceresini kontrol et. Zincire yalnızca Poseidon commitment gönderilir.",
        detay: `commitment = ${taslakBilet.commitment.toString()}`,
        adim: 1,
      });

      const tx = await contract.biletAl(taslakBilet.commitment, { value: ucret });

      durumGoster({
        tur: "pending",
        rozet: "Zincirde Bekliyor",
        baslik: "Bilet işlemi Sepolia'ya iletildi",
        mesaj: "Blok onayı ve Merkle ağacı güncellemesi bekleniyor…",
        txHash: tx.hash,
        adim: 2,
      });

      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error("İşlem zincirde başarısız (status=0) oldu.");
      }

      // Gizli bileti bu tarayıcının yerel deposuna kaydet
      yerelBiletKaydet({
        contract: sozlesmeAyar.address,
        notMetni: taslakBilet.notMetni,
        commitment: taslakBilet.commitment.toString(),
        satinAlan: aktifAdres,
        txHash: tx.hash,
        tarih: Date.now(),
      });

      // Kullanıcı isterse hemen giriş kartında seçebilsin diye notu giriş alanına da ön-doldur
      el("girisBiletNotuInput").value = taslakBilet.notMetni;

      durumGoster({
        tur: "ok",
        rozet: "Bilet Kesildi ✓",
        baslik: "Gizli ZK biletin Merkle ağacına eklendi!",
        mesaj: "Bilet kodun yerelde saklandı (JSON olarak da indirebilirsin). Anonim giriş için MetaMask'ta 2. temiz hesabına geçip 2. karttan ZK kanıtı üretebilirsin.",
        detay: `Blok #${receipt.blockNumber} · Gas: ${receipt.gasUsed.toString()}`,
        txHash: tx.hash,
        adim: 3,
        basariliAdim: true,
      });

      yeniTaslakBiletUret();
      await zincirDurumunuYenile();
    } catch (err) {
      durumGoster({
        tur: "error",
        rozet: "Başarısız",
        baslik: "Bilet alınamadı",
        mesaj: hataMesajiCoz(err),
        adim: 1,
      });
    } finally {
      aktifIslemVar = false;
      arayuzuGuncelle();
    }
  }

  /* ===========================
     8) KART 2: TARAYICIDA ZK KANITI & ANONİM GİRİŞ
     =========================== */
  function seciliGirisModu() {
    const r = document.querySelector('input[name="girisMod"]:checked');
    return r ? r.value : "direct";
  }

  function ayniCuzdanKontroluYap() {
    const uyari = el("ayniCuzdanUyari");
    const mod = seciliGirisModu();
    el("zkGirisBtnYazi").textContent =
      mod === "relayer" ? "ZK Kanıt Paketi Üret (Gas Gerekmez)" : "ZK Kanıtı Üret ve Giriş Yap";

    const girilenNot = el("girisBiletNotuInput").value.trim();
    if (mod !== "direct" || !aktifAdres || !girilenNot) {
      uyari.classList.add("is-hidden");
      return;
    }

    const kayit = aktifSozlesmeBiletleri().find((b) => b.notMetni === girilenNot);
    if (kayit && kayit.satinAlan && kayit.satinAlan.toLowerCase() === aktifAdres.toLowerCase()) {
      uyari.textContent =
        "⚠ Gizlilik Uyarısı: Bu bileti şu an bağlı olan cüzdanla almışsın! Gerçek anonimlik için MetaMask'tan 2. temiz hesabına geçebilir veya 'Relayer Paketi Üret' modunu seçebilirsin.";
      uyari.classList.remove("is-hidden");
    } else {
      uyari.classList.add("is-hidden");
    }
  }

  async function verificationKeyYukle() {
    if (!onbellekVKey) {
      const resp = await fetch(VKEY_URL);
      if (!resp.ok) throw new Error("verification_key.json yüklenemedi.");
      onbellekVKey = await resp.json();
    }
    return onbellekVKey;
  }

  async function zkGirisCalistir() {
    if (!sozlesmeAyar || !sozlesmeBilgi || !yerelMerkle) return;
    if (aktifIslemVar) return;

    const mod = seciliGirisModu();
    const takmaAd = el("zkTakmaAdInput").value.trim();
    const notHam = el("girisBiletNotuInput").value.trim();

    if (!notHam) {
      durumGoster({ tur: "error", rozet: "Eksik Bilgi", baslik: "Gizli bilet kodu gerekli", mesaj: "Kayıtlı biletlerinden birini seç veya qzk-v1-... kodunu yapıştır." });
      return;
    }
    if (!takmaAd || takmaAd.length > 48) {
      durumGoster({ tur: "error", rozet: "Eksik Bilgi", baslik: "Takma ad geçersiz", mesaj: "Takma ad 1 ile 48 karakter arasında olmalıdır." });
      return;
    }
    if (mod === "direct" && (!signer || !dogruAg)) {
      durumGoster({
        tur: "error",
        rozet: "Cüzdan Gerekli",
        baslik: "Sepolia cüzdanı bağlı değil",
        mesaj: "Doğrudan gönderim için MetaMask'ı Sepolia ağında bağla veya 'Relayer Paketi Üret' modunu seç.",
      });
      return;
    }

    aktifIslemVar = true;
    el("relayerCiktiKutu").classList.add("is-hidden");
    arayuzuGuncelle();

    try {
      // 1) Bilet kodunu çöz ve Merkle ağacındaki sırasını bul
      const bilet = biletNotuCoz(notHam);
      const yaprakIndeksi = merkleYapraklar.findIndex((y) => y.commitment === bilet.commitment);
      if (yaprakIndeksi === -1) {
        throw new Error(
          "Bu bilet mührü zincirdeki Merkle ağacında bulunamadı. Önce 1. karttan bilet kes veya 'Yenile' butonuna bas (yayın bloğunu kontrol et)."
        );
      }

      const nullifierHash = window.poseidon2([bilet.nullifierSecret, sozlesmeBilgi.etkinlikId]);

      // Gas yakmadan önce nullifier'ın kullanılıp kullanılmadığını kontrol et
      const readProvider = await okumaProviderAl();
      const readContract = new ethers.Contract(sozlesmeAyar.address, GARAJ_ZK_ABI, readProvider);
      const kullanildiMi = await readContract.kullanilanNullifier(nullifierHash);
      if (kullanildiMi) {
        throw new Error("Bu gizli bilet daha önce kullanılmış (nullifierHash zincirde yanmış).");
      }

      const girisAdresi = mod === "direct" ? aktifAdres : ethers.ZeroAddress;
      const baglamHash = baglamHashHesapla(takmaAd, girisAdresi);
      const yol = yerelMerkle.kanitYolu(yaprakIndeksi);

      durumGoster({
        tur: "pending",
        rozet: "ZK Prover Çalışıyor",
        baslik: "Tarayıcıda Groth16 sıfır-bilgi kanıtı üretiliyor…",
        mesaj: "Gizli biletin tarayıcı dışına çıkmadan 2.937 kısıtlı GarajBilet(10) devresinden geçiriliyor.",
        detay: `Yaprak #${yaprakIndeksi} · Merkle kökü: ${kisaSayi(yol.kok)}`,
        adim: 0,
      });

      // Tarayıcı çizimi güncellensin diye kısa nefes
      await new Promise((r) => setTimeout(r, 40));

      const devreGirdisi = {
        secret: bilet.secret.toString(),
        nullifierSecret: bilet.nullifierSecret.toString(),
        yolElemanlari: yol.yolElemanlari.map((x) => x.toString()),
        yolYonleri: yol.yolYonleri,
        kok: yol.kok.toString(),
        nullifierHash: nullifierHash.toString(),
        etkinlikId: sozlesmeBilgi.etkinlikId.toString(),
        baglamHash: baglamHash.toString(),
      };

      const t0 = performance.now();
      const { proof, publicSignals } = await window.snarkjs.groth16.fullProve(
        devreGirdisi,
        WASM_URL,
        ZKEY_URL
      );
      const sureMs = Math.round(performance.now() - t0);

      // Üretilen kanıtı anında yerel olarak doğrula
      const vKey = await verificationKeyYukle();
      const yerelDogru = await window.snarkjs.groth16.verify(vKey, publicSignals, proof);
      if (!yerelDogru) {
        throw new Error("Üretilen ZK kanıtı yerel doğrulamadan geçemedi.");
      }

      const rawCalldata = await window.snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
      const [pA, pB, pC] = JSON.parse("[" + rawCalldata + "]");

      // Mod B: Relayer Paketi Üret (zincire göndermeden JSON olarak dışa aktar)
      if (mod === "relayer") {
        const paket = {
          version: "quantum-garaj-zk-v1",
          contract: sozlesmeAyar.address,
          kok: yol.kok.toString(),
          nullifierHash: nullifierHash.toString(),
          takmaAd,
          girisAdresi,
          pA,
          pB,
          pC,
          proof,
          publicSignals,
        };
        el("relayerCiktiJson").value = JSON.stringify(paket, null, 2);
        el("relayerCiktiKutu").classList.remove("is-hidden");

        // Demo kolaylığı: Relayer paneline tek tıkla kopyalaması için hazır bırak
        durumGoster({
          tur: "ok",
          rozet: `Kanıt Hazır (${sureMs} ms)`,
          baslik: "ZK Kanıt Paketi tarayıcıda üretildi ve doğrulandı!",
          mesaj: "Bu paketi kopyalayıp Görevli / Relayer paneline (Kart 3) yapıştırarak katılımcı cüzdanı hiç gas ödemeden girişi tamamlayabilirsin.",
          detay: `Nullifier: ${kisaSayi(nullifierHash)} · Bağlı takma ad: "${takmaAd}"`,
          adim: 0,
          basariliAdim: true,
        });
        return;
      }

      // Mod A: Doğrudan 2. temiz cüzdanla zincire gönder
      durumGoster({
        tur: "pending",
        rozet: `Kanıt Hazır (${sureMs} ms)`,
        baslik: "ZK kanıtı doğrulandı — MetaMask onayı bekleniyor",
        mesaj: "Groth16 kanıtı zincire gönderiliyor. Sözleşme içindeki Groth16Verifier kanıtı on-chain doğrulayacak.",
        detay: `Nullifier: ${kisaSayi(nullifierHash)} · Gönderen: ${kisaAdres(aktifAdres)}`,
        adim: 1,
      });

      const writeContract = new ethers.Contract(sozlesmeAyar.address, GARAJ_ZK_ABI, signer);
      const tx = await writeContract.zkGirisYap(
        pA,
        pB,
        pC,
        yol.kok,
        nullifierHash,
        takmaAd,
        girisAdresi
      );

      durumGoster({
        tur: "pending",
        rozet: "Zincirde Bekliyor",
        baslik: "Anonim ZK giriş işlemi Sepolia'ya gönderildi",
        mesaj: "On-chain Groth16Verifier doğrulaması ve blok makbuzu bekleniyor…",
        txHash: tx.hash,
        adim: 2,
      });

      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error("zkGirisYap işlemi zincirde başarısız oldu.");
      }

      durumGoster({
        tur: "ok",
        rozet: "Anonim Giriş Onaylandı ✓",
        baslik: `"${takmaAd}" sıfır-bilgi kanıtıyla garaja girdi!`,
        mesaj: `Kanıt süresi: ${sureMs} ms · Zincir üstü Groth16 doğrulaması geçti ve bilet nullifier'ı yakıldı.`,
        detay: `Blok #${receipt.blockNumber} · Gas: ${receipt.gasUsed.toString()}`,
        txHash: tx.hash,
        adim: 3,
        basariliAdim: true,
      });

      await zincirDurumunuYenile();
    } catch (err) {
      durumGoster({
        tur: "error",
        rozet: "Hata",
        baslik: "ZK giriş tamamlanamadı",
        mesaj: hataMesajiCoz(err),
        adim: 0,
      });
    } finally {
      aktifIslemVar = false;
      arayuzuGuncelle();
    }
  }

  /* ===========================
     9) KART 3: RELAYER & GÖREVLİ PANELİ
     =========================== */
  function relayerButonunuGuncelle() {
    el("relayerGonderBtn").disabled = !relayerPaketOnayli || !signer || !dogruAg || aktifIslemVar;
  }

  async function relayerPaketiIncele() {
    const ham = el("relayerGirisJson").value.trim();
    const kutu = el("relayerOnizleme");
    relayerPaketOnayli = null;

    if (!ham) {
      kutu.classList.add("is-hidden");
      relayerButonunuGuncelle();
      return;
    }

    try {
      const p = JSON.parse(ham);
      if (!p.pA || !p.pB || !p.pC || !p.kok || !p.nullifierHash || !p.takmaAd || !p.girisAdresi) {
        throw new Error("Eksik kanıt alanları.");
      }
      if (sozlesmeAyar && p.contract && p.contract.toLowerCase() !== sozlesmeAyar.address.toLowerCase()) {
        throw new Error("Bu kanıt paketi farklı bir GarajKayitZK sözleşmesi için üretilmiş.");
      }

      // İsteğe bağlı off-chain kriptografik ön doğrulama
      let offchainYazi = "";
      if (p.proof && p.publicSignals) {
        const vKey = await verificationKeyYukle();
        const ok = await window.snarkjs.groth16.verify(vKey, p.publicSignals, p.proof);
        if (!ok) throw new Error("Groth16 kanıtı kriptografik olarak GEÇERSİZ!");
        offchainYazi = "✓ Groth16 off-chain doğrulandı · ";
      }

      relayerPaketOnayli = p;
      kutu.textContent = `${offchainYazi}Takma ad: "${p.takmaAd}" · Nullifier: ${kisaSayi(p.nullifierHash)} · Hedef: ${p.girisAdresi === ethers.ZeroAddress ? "Gizli (0x0)" : kisaAdres(p.girisAdresi)}`;
      kutu.className = "zk-ok-inline";
      kutu.classList.remove("is-hidden");
    } catch (err) {
      kutu.textContent = "⚠ " + hataMesajiCoz(err);
      kutu.className = "zk-warning-inline";
      kutu.classList.remove("is-hidden");
    }
    relayerButonunuGuncelle();
  }

  async function relayerGonderCalistir() {
    if (!relayerPaketOnayli || !signer || !dogruAg || !sozlesmeAyar) return;
    aktifIslemVar = true;
    arayuzuGuncelle();

    try {
      const p = relayerPaketOnayli;
      const writeContract = new ethers.Contract(sozlesmeAyar.address, GARAJ_ZK_ABI, signer);

      durumGoster({
        tur: "pending",
        rozet: "Relayer Onayı",
        baslik: `"${p.takmaAd}" için ZK kanıtı iletiliyor`,
        mesaj: "Gas ücretini Relayer/Görevli cüzdanı öder; kanıtın içeriği değiştirilemez (front-running kilitli).",
        adim: 1,
      });

      const tx = await writeContract.zkGirisYap(
        p.pA,
        p.pB,
        p.pC,
        BigInt(p.kok),
        BigInt(p.nullifierHash),
        p.takmaAd,
        p.girisAdresi
      );

      durumGoster({
        tur: "pending",
        rozet: "Zincirde Bekliyor",
        baslik: "Relayer ZK giriş işlemi iletildi",
        mesaj: "Sepolia blok onayı bekleniyor…",
        txHash: tx.hash,
        adim: 2,
      });

      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error("Relayer işlemi başarısız oldu.");
      }

      el("relayerGirisJson").value = "";
      relayerPaketOnayli = null;
      el("relayerOnizleme").classList.add("is-hidden");

      durumGoster({
        tur: "ok",
        rozet: "Relayer Girişi Onaylandı ✓",
        baslik: `"${p.takmaAd}" sıfır-gas ile garaja kaydedildi!`,
        mesaj: "Katılımcının cüzdanı giriş işleminde hiç görünmeden Groth16 doğrulaması tamamlandı.",
        detay: `Blok #${receipt.blockNumber} · Gas: ${receipt.gasUsed.toString()}`,
        txHash: tx.hash,
        adim: 3,
        basariliAdim: true,
      });

      await zincirDurumunuYenile();
    } catch (err) {
      durumGoster({
        tur: "error",
        rozet: "Başarısız",
        baslik: "Relayer gönderimi reddedildi",
        mesaj: hataMesajiCoz(err),
        adim: 1,
      });
    } finally {
      aktifIslemVar = false;
      arayuzuGuncelle();
    }
  }

  async function ucretleriCekCalistir() {
    if (!signer || !dogruAg || !sozlesmeAyar) return;
    aktifIslemVar = true;
    arayuzuGuncelle();

    try {
      const writeContract = new ethers.Contract(sozlesmeAyar.address, GARAJ_ZK_ABI, signer);
      durumGoster({
        tur: "pending",
        rozet: "İmza Bekleniyor",
        baslik: "Biriken bilet ücretleri çekiliyor",
        mesaj: "Görevli cüzdanından MetaMask onayı bekleniyor…",
        adim: 1,
      });

      const tx = await writeContract.ucretleriCek();
      durumGoster({
        tur: "pending",
        rozet: "Zincirde Bekliyor",
        baslik: "Ücret çekim işlemi gönderildi",
        mesaj: "Sepolia makbuzu bekleniyor…",
        txHash: tx.hash,
        adim: 2,
      });

      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error("Ücret çekimi başarısız oldu.");

      durumGoster({
        tur: "ok",
        rozet: "Çekildi ✓",
        baslik: "Bilet ücretleri görevli cüzdanına aktarıldı",
        mesaj: `Blok #${receipt.blockNumber} üzerinde onaylandı.`,
        txHash: tx.hash,
        adim: 3,
        basariliAdim: true,
      });
      await zincirDurumunuYenile();
    } catch (err) {
      durumGoster({
        tur: "error",
        rozet: "Hata",
        baslik: "Ücret çekilemedi",
        mesaj: hataMesajiCoz(err),
        adim: 1,
      });
    } finally {
      aktifIslemVar = false;
      arayuzuGuncelle();
    }
  }

  /* ===========================
     10) SÖZLEŞME BAĞLAMA & BAŞLATMA
     =========================== */
  async function sozlesmeBagla(hamAdres, hamBlok) {
    const hataEl = el("zkKurulumHata");
    hataEl.classList.add("is-hidden");

    let address;
    try {
      address = ethers.getAddress(hamAdres.trim());
    } catch {
      hataEl.textContent = "Geçerli bir 42 karakterlik Ethereum Sepolia adresi (0x...) girin.";
      hataEl.classList.remove("is-hidden");
      return;
    }

    let deployBlock = null;
    if (String(hamBlok || "").trim() !== "") {
      const n = Number(String(hamBlok).trim());
      if (!Number.isInteger(n) || n < 0) {
        hataEl.textContent = "Yayın bloğu pozitif bir tam sayı olmalıdır.";
        hataEl.classList.remove("is-hidden");
        return;
      }
      deployBlock = n;
    }

    el("zkBaglaBtn").disabled = true;
    try {
      const provider = await okumaProviderAl();
      const code = await provider.getCode(address);
      if (!code || code === "0x") {
        throw new Error("Bu adreste Sepolia ağına yayınlanmış bir sözleşme bulunamadı.");
      }

      // GarajKayitZK arayüzünü doğrulamak için ETKINLIK_ID ve guncelKok çağrısı yap
      const testContract = new ethers.Contract(address, GARAJ_ZK_ABI, provider);
      await testContract.ETKINLIK_ID();
      await testContract.guncelKok();

      sozlesmeAyar = { address, deployBlock };
      localStorage.setItem(STORAGE_CONTRACT_KEY, JSON.stringify(sozlesmeAyar));

      el("zkKurulumKart").classList.add("is-hidden");
      el("zkWorkspace").classList.remove("is-hidden");

      await zincirDurumunuYenile();
    } catch (err) {
      hataEl.textContent =
        "Sözleşme doğrulanamadı (GarajKayitZK olduğundan ve Sepolia'da yayınlandığından emin ol): " +
        hataMesajiCoz(err);
      hataEl.classList.remove("is-hidden");
    } finally {
      el("zkBaglaBtn").disabled = false;
    }
  }

  function olaylariBagla() {
    el("baglanBtn").addEventListener("click", cuzdanBagla);
    el("sepoliaGecBtn").addEventListener("click", sepoliaGec);
    el("yenileBtn").addEventListener("click", zincirDurumunuYenile);
    el("durumKapatBtn").addEventListener("click", durumGizle);

    el("zkSozlesmeForm").addEventListener("submit", (e) => {
      e.preventDefault();
      sozlesmeBagla(el("zkSozlesmeAdres").value, el("zkYayinBlok").value);
    });

    el("sozlesmeDegistirBtn").addEventListener("click", () => {
      if (sozlesmeAyar) {
        el("zkSozlesmeAdres").value = sozlesmeAyar.address;
        el("zkYayinBlok").value = sozlesmeAyar.deployBlock ?? "";
      }
      el("zkKurulumKart").classList.remove("is-hidden");
      el("zkWorkspace").classList.add("is-hidden");
    });

    el("copySozlesmeBtn").addEventListener("click", () => {
      if (sozlesmeAyar) kopyala(sozlesmeAyar.address, el("copySozlesmeBtn"), "Kopyala");
    });

    // Kart 1 butonları
    el("yeniBiletUretBtn").addEventListener("click", yeniTaslakBiletUret);
    el("biletGosterBtn").addEventListener("click", () => {
      biletNotuGorunur = !biletNotuGorunur;
      el("uretilenBiletNotu").classList.toggle("masked", !biletNotuGorunur);
      el("biletGosterBtn").textContent = biletNotuGorunur ? "🙈 Gizle" : "👁 Göster";
    });
    el("biletKopyalaBtn").addEventListener("click", () => {
      if (taslakBilet) kopyala(taslakBilet.notMetni, el("biletKopyalaBtn"), "Kopyala");
    });
    el("biletIndirBtn").addEventListener("click", () => {
      if (!taslakBilet) return;
      const veri = {
        type: "quantum-garaj-zk-ticket",
        contract: sozlesmeAyar?.address || null,
        notMetni: taslakBilet.notMetni,
        commitment: taslakBilet.commitment.toString(),
        olusturmaZamani: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(veri, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quantum-zk-bilet-${taslakBilet.commitment.toString().slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
    el("biletAlBtn").addEventListener("click", biletAlCalistir);

    // Kart 2 butonları
    el("kayitliBiletSec").addEventListener("change", (e) => {
      if (e.target.value) {
        el("girisBiletNotuInput").value = e.target.value;
        ayniCuzdanKontroluYap();
      }
    });
    el("biletDosyaInput").addEventListener("change", async (e) => {
      const dosya = e.target.files?.[0];
      if (!dosya) return;
      try {
        const icerik = JSON.parse(await dosya.text());
        if (!icerik.notMetni) throw new Error("Dosyada notMetni alanı yok.");
        el("girisBiletNotuInput").value = icerik.notMetni;
        ayniCuzdanKontroluYap();
      } catch (err) {
        durumGoster({ tur: "error", rozet: "Dosya Hatası", baslik: "Bilet JSON okunamadı", mesaj: hataMesajiCoz(err) });
      }
      e.target.value = "";
    });
    el("girisBiletNotuInput").addEventListener("input", ayniCuzdanKontroluYap);
    document.querySelectorAll('input[name="girisMod"]').forEach((r) => {
      r.addEventListener("change", ayniCuzdanKontroluYap);
    });
    el("zkGirisBtn").addEventListener("click", zkGirisCalistir);
    el("relayerPaketKopyalaBtn").addEventListener("click", () => {
      kopyala(el("relayerCiktiJson").value, el("relayerPaketKopyalaBtn"), "Paketi Kopyala");
    });

    // Kart 3 (Relayer & Görevli)
    el("relayerGirisJson").addEventListener("input", relayerPaketiIncele);
    el("relayerGonderBtn").addEventListener("click", relayerGonderCalistir);
    el("ucretCekBtn").addEventListener("click", ucretleriCekCalistir);

    // MetaMask hesap/ağ olayları
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", () => cuzdanDurumunuOku());
      window.ethereum.on("chainChanged", () => cuzdanDurumunuOku());
    }
  }

  async function baslat() {
    temaBaslat();
    olaylariBagla();
    yeniTaslakBiletUret();

    if (typeof window.poseidon2 !== "function" || typeof window.snarkjs === "undefined") {
      durumGoster({
        tur: "error",
        rozet: "Kütüphane Eksik",
        baslik: "ZK kütüphaneleri yüklenemedi",
        mesaj: "Sayfayı file:// yerine yerel bir HTTP sunucusu (örn. npx serve docs) veya GitHub Pages üzerinden açmalısın.",
      });
      return;
    }

    await cuzdanDurumunuOku();

    try {
      const kayitli = JSON.parse(localStorage.getItem(STORAGE_CONTRACT_KEY) || "null");
      if (kayitli && kayitli.address) {
        el("zkSozlesmeAdres").value = kayitli.address;
        el("zkYayinBlok").value = kayitli.deployBlock ?? "";
        await sozlesmeBagla(kayitli.address, kayitli.deployBlock ?? "");
      }
    } catch {}
  }

  document.addEventListener("DOMContentLoaded", baslat);
})();
