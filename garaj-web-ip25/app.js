/* Quantum Garaj (İP 25) — Bekleme Durumları, Makbuz Doğrulama & Hata Yönetimi */

const el = (id) => document.getElementById(id);
const ethersYukluMu = typeof ethers !== "undefined";
const iface = ethersYukluMu ? new ethers.Interface(SOZLESME_ABI) : null;
const GARAJ_ADI_YEDEK_IFACE = ethersYukluMu
  ? new ethers.Interface(["function garajAdi() view returns (string)"])
  : null;

const KAYIT_TOPIC = iface ? iface.getEvent("KayitOlundu").topicHash : null;
const GIRIS_TOPIC = iface ? iface.getEvent("GirisOnaylandi").topicHash : null;

const RPC_ZAMAN_ASIMI = 8500;
const LOG_PARCA = 9000;
const YENILEME_MS = 20000;

// Uygulama durumu
let browserProvider = null;
let signer = null;
let yazmaSozlesmesi = null;
let aktifAdres = null;
let dogruAg = false;
let aktifGonderimVar = false;
let bekleyenIslem = null; // { sozlesme, hash, islemTuru, etiket, gonderen, durum, gonderimZamani }
let kullaniciIstekNo = 0;
let hesapRozetZaman = null;
let yenileYaziZaman = null;

let sozlesmeBilgi = {
  garajAdi: "Otomobil Garajı",
  kapasite: 0,
  toplamKayit: 0,
  gorevli: null,
};

let tepeBlok = null;
let tarananBlok = DEPLOY_BLOCK - 1;
const katilimcilar = new Map(); // lowerAddr -> { adres, takmaAd, kayitTx, kayitBlok, kayitZaman, girisOnayli, girisTx, girisBlok, girisZaman, sira }
const islemListesi = [];        // { tur: 'kayit'|'giris', tx, blok, logIndex, adres, takmaAd, zaman }
const islemAnahtarlari = new Set();
const makbuzlar = new Map();    // txHash -> receipt
const blokZamanlari = new Map();// blockNumber -> unix seconds

let zincirFiltre = "all";
let islemFiltre = "all";
let eslesenAdres = null;
let isikZaman = null;

class BelirsizSonucHatasi extends Error {
  constructor(mesaj, txHash, teknikDetay = "") {
    super(mesaj);
    this.name = "BelirsizSonucHatasi";
    this.txHash = txHash;
    this.teknikDetay = teknikDetay;
  }
}

// Formatlayıcılar
const tarihFmt = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const goreceFmt = new Intl.RelativeTimeFormat("tr", { numeric: "auto" });
const sayiFmt = new Intl.NumberFormat("tr-TR");

const kisaAdres = (a) => (a && a.length >= 10 ? a.slice(0, 6) + "…" + a.slice(-4) : a || "–");
const kisaHash = (h) => (h && h.length >= 16 ? h.slice(0, 10) + "…" + h.slice(-6) : h || "–");

function once(sn) {
  if (!sn) return "–";
  const fark = Math.round(sn - Date.now() / 1000);
  const birimler = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [birim, s] of birimler) {
    if (Math.abs(fark) >= s) return goreceFmt.format(Math.round(fark / s), birim);
  }
  return "az önce";
}

function ethYaz(wei) {
  if (wei == null) return "–";
  const tam = wei / 10n ** 18n;
  const kesir = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, 7).replace(/0+$/, "");
  return tam + (kesir ? "," + kesir : "") + " ETH";
}

function basHarfler(ad) {
  const temiz = (ad || "").trim();
  if (!temiz) return "??";
  const p = temiz.split(/\s+/).filter(Boolean);
  if (p.length > 1) return (p[0][0] + p[p.length - 1][0]).toLocaleUpperCase("tr");
  return temiz.slice(0, 2).toLocaleUpperCase("tr");
}

function adresRengi(adres) {
  const h1 = parseInt(adres.slice(2, 6), 16);
  const hue = [24, 34, 168, 184, 205, 16, 154][h1 % 7];
  const light = 32 + (h1 % 14);
  return `linear-gradient(135deg, hsl(${hue} 68% ${light + 8}%), hsl(${hue} 62% ${light - 6}%))`;
}

function kopyala(metin, btn) {
  if (!metin || !btn) return;
  const eski = btn.textContent;
  navigator.clipboard?.writeText(metin).then(
    () => {
      btn.textContent = "Kopyalandı ✓";
      setTimeout(() => (btn.textContent = eski), 1400);
    },
    () => {
      btn.textContent = "Olmadı";
      setTimeout(() => (btn.textContent = eski), 1400);
    }
  );
}

/* ===========================
   1) TEMA YÖNETİMİ
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
  const kayitli = localStorage.getItem("garaj-tema");
  temaUygula(kayitli);
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

/* ===========================
   2) PUBLIC SEPOLIA RPC & MAKBUZ SORGULAMA
   =========================== */
async function rpcHam(url, method, params) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("Tarayıcı çevrimdışı");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(RPC_ZAMAN_ASIMI),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "RPC hatası");
  if (j.result === undefined) throw new Error("Eksik RPC cevabı");
  return j.result; // Not: pending makbuz için null geçerli bir yanıttır
}

async function rpc(url, method, params) {
  const result = await rpcHam(url, method, params);
  if (result == null) throw new Error("boş RPC cevabı");
  return result;
}

async function hizli(method, params) {
  let sonHata = null;
  for (const url of SEPOLIA_RPCS) {
    try {
      return await rpc(url, method, params);
    } catch (e) {
      sonHata = e;
    }
  }
  throw new Error(sonHata?.message || "Sepolia RPC düğümlerine ulaşılamadı");
}

async function ethCallDecode(fnName, args = []) {
  const data = iface.encodeFunctionData(fnName, args);
  const raw = await hizli("eth_call", [{ to: SOZLESME_ADRESI, data }, "latest"]);
  return iface.decodeFunctionResult(fnName, raw)[0];
}

async function etkinlikAdiOku() {
  try {
    return await ethCallDecode("etkinlikAdi");
  } catch {
    try {
      const data = GARAJ_ADI_YEDEK_IFACE.encodeFunctionData("garajAdi", []);
      const raw = await hizli("eth_call", [{ to: SOZLESME_ADRESI, data }, "latest"]);
      return GARAJ_ADI_YEDEK_IFACE.decodeFunctionResult("garajAdi", raw)[0];
    } catch {
      return "Otomobil Garajı";
    }
  }
}

async function blokZamaniAl(blokNo) {
  if (blokZamanlari.has(blokNo)) return blokZamanlari.get(blokNo);
  const hexBlok = "0x" + blokNo.toString(16);
  const blk = await hizli("eth_getBlockByNumber", [hexBlok, false]);
  const sn = parseInt(blk.timestamp, 16);
  blokZamanlari.set(blokNo, sn);
  return sn;
}

async function makbuzAl(tx) {
  if (!makbuzlar.has(tx)) {
    makbuzlar.set(tx, await hizli("eth_getTransactionReceipt", [tx]));
  }
  return makbuzlar.get(tx);
}

async function makbuzSorgulaTekSefer(txHash) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { erisildi: false, receipt: null, hata: "Tarayıcı çevrimdışı" };
  }

  let enAzBirYanit = false;
  let sonHata = null;

  for (const url of SEPOLIA_RPCS) {
    try {
      const result = await rpcHam(url, "eth_getTransactionReceipt", [txHash]);
      enAzBirYanit = true;
      if (result) {
        makbuzlar.set(txHash, result);
        return { erisildi: true, receipt: result, rpcUrl: url };
      }
    } catch (err) {
      sonHata = err;
    }
  }

  if (enAzBirYanit) {
    return { erisildi: true, receipt: null };
  }
  return {
    erisildi: false,
    receipt: null,
    hata: sonHata?.message || "Sepolia RPC düğümlerine ulaşılamadı",
  };
}

function makbuzOzetiCikar(receipt) {
  const statusNum =
    typeof receipt.status === "number"
      ? receipt.status
      : receipt.status != null
      ? parseInt(receipt.status, 16)
      : 0;
  const basarili = statusNum === 1;
  const blokNo = receipt.blockNumber ? parseInt(receipt.blockNumber, 16) : null;
  const gasUsed = receipt.gasUsed ? BigInt(receipt.gasUsed) : null;
  const gasPrice = receipt.effectiveGasPrice ? BigInt(receipt.effectiveGasPrice) : null;
  const ucretWei = gasUsed !== null && gasPrice !== null ? gasUsed * gasPrice : null;

  return { receipt, basarili, statusNum, blokNo, gasUsed, ucretWei };
}

function bekleMs(ms, abortCheck) {
  return new Promise((resolve) => {
    const bas = Date.now();
    const kontrol = setInterval(() => {
      if (abortCheck() || Date.now() - bas >= ms) {
        clearInterval(kontrol);
        resolve();
      }
    }, 200);
  });
}

async function makbuzBekleVeDogrula(tx, onIlerleme) {
  const baslangic = Date.now();
  let ardisikBaglantiHatasi = 0;
  let offlineKesildi = typeof navigator !== "undefined" && navigator.onLine === false;

  const offlineDinleyici = () => {
    offlineKesildi = true;
  };
  if (typeof window !== "undefined") {
    window.addEventListener("offline", offlineDinleyici);
  }

  try {
    while (Date.now() - baslangic < MAKBUZ_ZAMAN_ASIMI_MS) {
      if (offlineKesildi || (typeof navigator !== "undefined" && navigator.onLine === false)) {
        throw new BelirsizSonucHatasi(
          "İnternet bağlantısı kesildiği için işlem makbuzu doğrulanamadı.",
          tx.hash,
          "Bağlantı kesildi (offline)"
        );
      }

      const gecenSn = Math.max(0, Math.round((Date.now() - baslangic) / 1000));
      if (onIlerleme) onIlerleme(gecenSn);

      const sorgu = await makbuzSorgulaTekSefer(tx.hash);
      if (!sorgu.erisildi) {
        ardisikBaglantiHatasi += 1;
        if (ardisikBaglantiHatasi >= 2) {
          throw new BelirsizSonucHatasi(
            "Ağ veya RPC bağlantı sorunu nedeniyle işlem sonucu henüz doğrulanamadı.",
            tx.hash,
            sorgu.hata
          );
        }
      } else {
        ardisikBaglantiHatasi = 0;
        if (sorgu.receipt) {
          return makbuzOzetiCikar(sorgu.receipt);
        }
      }

      await bekleMs(MAKBUZ_SORGU_ARALIGI_MS, () => offlineKesildi);
    }

    throw new BelirsizSonucHatasi(
      "İşlem zincire yayınlandı ancak 45 saniye içinde makbuz doğrulanamadı.",
      tx.hash,
      "Makbuz bekleme zaman aşımı"
    );
  } finally {
    if (typeof window !== "undefined") {
      window.removeEventListener("offline", offlineDinleyici);
    }
  }
}

async function loglariAl(url, from, to) {
  return rpc(url, "eth_getLogs", [
    {
      address: SOZLESME_ADRESI,
      topics: [[KAYIT_TOPIC, GIRIS_TOPIC]],
      fromBlock: "0x" + from.toString(16),
      toBlock: "0x" + to.toString(16),
    },
  ]);
}

async function loglariTara(tepe) {
  if (tepe <= tarananBlok) return;
  let loglar = null;
  for (const url of LOG_RPCS) {
    try {
      loglar = await loglariAl(url, tarananBlok + 1, tepe);
      break;
    } catch {}
  }

  if (!loglar) {
    loglar = [];
    for (let a = tarananBlok + 1; a <= tepe; a += LOG_PARCA) {
      const b = Math.min(a + LOG_PARCA - 1, tepe);
      let parca = null;
      for (const url of LOG_RPCS) {
        try {
          parca = await loglariAl(url, a, b);
          break;
        } catch {}
      }
      if (!parca) throw new Error("Event logları okunamadı");
      loglar.push(...parca);
    }
  }

  const yeniBloklar = [...new Set(loglar.map((l) => parseInt(l.blockNumber, 16)))].filter(
    (b) => !blokZamanlari.has(b)
  );
  await Promise.all(yeniBloklar.map((b) => blokZamaniAl(b).catch(() => null)));

  for (const l of loglar) {
    const blok = parseInt(l.blockNumber, 16);
    const logIndex = parseInt(l.logIndex, 16);
    const anahtar = `${l.transactionHash}:${logIndex}`;
    if (islemAnahtarlari.has(anahtar)) continue;
    islemAnahtarlari.add(anahtar);

    const parsed = iface.parseLog({ topics: l.topics, data: l.data });
    if (!parsed) continue;

    const zaman = blokZamanlari.get(blok) || 0;
    const adres = ethers.getAddress(parsed.args.katilimci);
    const key = adres.toLowerCase();

    if (parsed.name === "KayitOlundu") {
      const takmaAd = parsed.args.takmaAd;
      const mevcut = katilimcilar.get(key) || {
        adres,
        takmaAd,
        girisOnayli: false,
        sira: katilimcilar.size + 1,
      };
      mevcut.takmaAd = takmaAd;
      mevcut.kayitTx = l.transactionHash;
      mevcut.kayitBlok = blok;
      mevcut.kayitZaman = zaman;
      katilimcilar.set(key, mevcut);

      islemListesi.push({
        tur: "kayit",
        tx: l.transactionHash,
        blok,
        logIndex,
        adres,
        takmaAd,
        zaman,
      });
    } else if (parsed.name === "GirisOnaylandi") {
      const mevcut = katilimcilar.get(key) || {
        adres,
        takmaAd: kisaAdres(adres),
        sira: katilimcilar.size + 1,
      };
      mevcut.girisOnayli = true;
      mevcut.girisTx = l.transactionHash;
      mevcut.girisBlok = blok;
      mevcut.girisZaman = zaman;
      katilimcilar.set(key, mevcut);

      islemListesi.push({
        tur: "giris",
        tx: l.transactionHash,
        blok,
        logIndex,
        adres,
        takmaAd: mevcut.takmaAd,
        zaman,
      });
    }
  }

  islemListesi.sort((a, b) => b.blok - a.blok || b.logIndex - a.logIndex);

  for (const item of islemListesi) {
    const k = katilimcilar.get(item.adres.toLowerCase());
    if (k && k.takmaAd) item.takmaAd = k.takmaAd;
  }

  tarananBlok = tepe;
}

/* ===========================
   3) BEKLEYEN / BELİRSİZ İŞLEM KALICILIĞI
   =========================== */
function bekleyenIslemiKaydet(kayit) {
  bekleyenIslem = {
    sozlesme: SOZLESME_ADRESI.toLowerCase(),
    hash: kayit.hash,
    islemTuru: kayit.islemTuru,
    etiket: kayit.etiket,
    gonderen: kayit.gonderen || aktifAdres || null,
    durum: kayit.durum || "chain-pending",
    gonderimZamani: kayit.gonderimZamani || Date.now(),
  };
  try {
    localStorage.setItem(SON_ISLEM_STORAGE_KEY, JSON.stringify(bekleyenIslem));
  } catch {}
}

function bekleyenIslemiTemizle() {
  bekleyenIslem = null;
  try {
    localStorage.removeItem(SON_ISLEM_STORAGE_KEY);
  } catch {}
}

function bekleyenIslemiYukle() {
  try {
    const ham = localStorage.getItem(SON_ISLEM_STORAGE_KEY);
    if (!ham) return null;
    const kayit = JSON.parse(ham);
    if (
      !kayit ||
      typeof kayit.hash !== "string" ||
      kayit.sozlesme !== SOZLESME_ADRESI.toLowerCase()
    ) {
      return null;
    }
    kayit.durum = "unknown";
    bekleyenIslem = kayit;
    return kayit;
  } catch {
    return null;
  }
}

/* ===========================
   4) SÖZLEŞME VERİLERİNİ OKUMA
   =========================== */
async function genelBilgileriOku() {
  const [ad, kapasite, toplam, gorevli, tepeHex] = await Promise.all([
    etkinlikAdiOku(),
    ethCallDecode("KAPASITE"),
    ethCallDecode("toplamKayit"),
    ethCallDecode("gorevli"),
    hizli("eth_blockNumber", []),
  ]);

  tepeBlok = parseInt(tepeHex, 16);
  sozlesmeBilgi = {
    garajAdi: ad || "Otomobil Garajı",
    kapasite: Number(kapasite),
    toplamKayit: Number(toplam),
    gorevli: ethers.getAddress(gorevli),
  };

  genelArayuzuGuncelle();
}

function genelArayuzuGuncelle() {
  const { garajAdi, kapasite, toplamKayit, gorevli } = sozlesmeBilgi;

  el("garajAdi").textContent = garajAdi;
  el("kapasite").textContent = kapasite;
  el("toplamKayit").textContent = toplamKayit;

  const yuzde = kapasite > 0 ? Math.min(100, Math.round((toplamKayit / kapasite) * 100)) : 0;
  el("kapasiteYuzde").textContent = yuzde + "%";

  const $peron = el("parkPeronlari");
  const slotAdedi = Math.max(1, Math.min(kapasite || 3, 12));
  const doluMu = kapasite > 0 && toplamKayit >= kapasite;
  $peron.innerHTML = "";
  for (let i = 0; i < slotAdedi; i++) {
    const span = document.createElement("span");
    const oran = kapasite > 12 ? Math.round((toplamKayit / kapasite) * slotAdedi) : toplamKayit;
    span.className = "bay" + (i < oran ? (doluMu ? " filled full-alert" : " filled") : "");
    $peron.appendChild(span);
  }

  if (gorevli) {
    el("gorevliAdresi").textContent = kisaAdres(gorevli);
    el("gorevliAdresi").href = `${ETHERSCAN_URL}/address/${gorevli}`;
    el("gorevliAdresi").title = gorevli;
  }

  if (tepeBlok) {
    el("cHead").textContent = sayiFmt.format(tepeBlok);
  }

  rolArayuzuGuncelle();
}

/* ===========================
   5) CÜZDAN BAĞLANTISI & HESAP DEĞİŞİMİ
   =========================== */
function rolArayuzuGuncelle() {
  const $rol = el("rolRozeti");
  const $kayitIpucu = el("kayitIpucu");
  const $gorevliIpucu = el("gorevliIpucu");

  if (!aktifAdres) {
    $rol.style.display = "none";
    $kayitIpucu.textContent = "İşlem göndermek için üstten MetaMask cüzdanını bağla.";
    $gorevliIpucu.textContent = "Yetki kontrolü doğrudan akıllı sözleşmede yapılır.";
    return;
  }

  const gorevliMi =
    sozlesmeBilgi.gorevli &&
    aktifAdres.toLowerCase() === sozlesmeBilgi.gorevli.toLowerCase();

  $rol.style.display = "inline-block";
  $rol.className = "role-chip " + (gorevliMi ? "officer" : "member");
  $rol.textContent = gorevliMi ? "Görevli" : "Katılımcı";

  if (!dogruAg) {
    $gorevliIpucu.textContent = "İşlem göndermek için Sepolia ağına geçmelisin.";
  } else if (gorevliMi) {
    $gorevliIpucu.textContent = "Yetkili görevli cüzdanı bağlı ✓ Aşağıdan katılımcı seçip onaylayabilirsin.";
  } else {
    $gorevliIpucu.textContent = "Bağlı adres görevli değil; çağrı yapılırsa sözleşme işlemi reddeder.";
  }
}

function hesapDegisiminiVurgula() {
  const $satir = el("aktifHesapSatiri");
  const $rozet = el("hesapDegistiRozeti");
  if (!$satir || !$rozet) return;
  $satir.classList.add("flash");
  $rozet.style.display = "inline-block";
  clearTimeout(hesapRozetZaman);
  hesapRozetZaman = setTimeout(() => {
    $satir.classList.remove("flash");
    $rozet.style.display = "none";
  }, 3000);
}

function cuzdanBaglantisiniSifirla() {
  kullaniciIstekNo += 1;
  aktifAdres = null;
  signer = null;
  yazmaSozlesmesi = null;
  dogruAg = false;

  const $btn = el("baglanBtn");
  $btn.classList.remove("connected");
  $btn.classList.add("primary-connect");
  $btn.title = "MetaMask cüzdanını bağla";
  el("bagliAdres").textContent = "Cüzdan Bağla";
  el("bagliNokta").style.display = "none";
  el("cuzdanIkon").style.display = "block";

  el("aktifHesapKisa").textContent = "Bağlı değil";
  el("aktifHesapSatiri").title = "";
  el("hesapDegistiRozeti").style.display = "none";

  el("kayitDurumu").textContent = "Bağlı değil";
  el("kayitDurumu").className = "";
  el("takmaAdim").textContent = "–";
  el("girisDurumu").textContent = "–";
  el("girisDurumu").className = "";

  el("agUyari").textContent = "";
  el("agUyariKutu").classList.remove("show");
  el("agNokta").classList.remove("warn");
  el("kickerDot").classList.remove("warn");
  el("agAdi").textContent = "Sepolia";
  el("agChainId").textContent = "Chain 11155111";

  el("kayitBtn").disabled = true;
  el("girisOnaylaBtn").disabled = true;

  rolArayuzuGuncelle();
  listeyiCiz();
}

async function kullaniciDurumuYukle() {
  const hedefAdres = aktifAdres;
  if (!hedefAdres) return;
  const istekId = ++kullaniciIstekNo;

  el("kayitDurumu").textContent = "Okunuyor…";
  el("kayitDurumu").className = "";
  el("takmaAdim").textContent = "…";
  el("girisDurumu").textContent = "…";
  el("girisDurumu").className = "";

  try {
    const [kayitli, takmaAd, girisYapti] = await Promise.all([
      ethCallDecode("kayitliMi", [hedefAdres]),
      ethCallDecode("kayitlar", [hedefAdres]),
      ethCallDecode("girisYaptiMi", [hedefAdres]),
    ]);

    if (istekId !== kullaniciIstekNo || aktifAdres !== hedefAdres) return;

    const $kd = el("kayitDurumu");
    const $ta = el("takmaAdim");
    const $gd = el("girisDurumu");

    $kd.textContent = kayitli ? "Kayıtlı ✓" : "Kayıtlı değil";
    $kd.className = kayitli ? "ok" : "";

    $ta.textContent = kayitli ? takmaAd : "–";

    $gd.textContent = girisYapti ? "Giriş onaylı ✓" : kayitli ? "Onay bekliyor" : "–";
    $gd.className = girisYapti ? "ok" : kayitli ? "warn" : "";

    const doluMu = sozlesmeBilgi.kapasite > 0 && sozlesmeBilgi.toplamKayit >= sozlesmeBilgi.kapasite;
    if (!dogruAg) {
      el("kayitIpucu").textContent = "İşlem göndermek için Sepolia ağına geçmelisin.";
    } else if (kayitli) {
      el("kayitIpucu").textContent = "Bu adres zaten kayıtlı (tekrar denenirse sözleşme reddeder).";
    } else if (doluMu) {
      el("kayitIpucu").textContent = "Garaj kapasitesi dolu (yeni kayıt denemesi sözleşmede reddedilir).";
    } else {
      el("kayitIpucu").textContent = "Takma adını yazıp MetaMask ile zincire kalıcı kayıt oluşturabilirsin.";
    }
  } catch (err) {
    if (istekId !== kullaniciIstekNo) return;
    console.warn("Kullanıcı durumu okunamadı:", err);
    el("kayitDurumu").textContent = "Okunamadı";
    el("kayitDurumu").className = "warn";
    el("takmaAdim").textContent = "–";
    el("girisDurumu").textContent = "–";
    el("kayitIpucu").textContent = "Kullanıcı kaydı şu an okunamadı; bağlantı gelince Bilgileri Yenile'ye basın.";
  }
}

async function cuzdanBagla(sessiz = false, secenek = {}) {
  if (!window.ethereum) {
    if (!sessiz) {
      durumGoster({
        tip: "err",
        rozet: "Cüzdan Bulunamadı",
        baslik: "MetaMask uzantısı bulunamadı",
        mesaj: "İşlem göndermek için tarayıcınıza MetaMask uzantısını kurun veya etkinleştirin.",
      });
    }
    return;
  }

  try {
    const oncekiAdres = aktifAdres;
    browserProvider = new ethers.BrowserProvider(window.ethereum);
    const hesaplar = await browserProvider.send(sessiz ? "eth_accounts" : "eth_requestAccounts", []);
    if (!hesaplar || !hesaplar.length) {
      if (oncekiAdres) cuzdanBaglantisiniSifirla();
      return;
    }

    signer = await browserProvider.getSigner();
    aktifAdres = ethers.getAddress(await signer.getAddress());
    const adresDegisti =
      Boolean(secenek.hesapDegisti) ||
      (oncekiAdres && oncekiAdres.toLowerCase() !== aktifAdres.toLowerCase());

    const $btn = el("baglanBtn");
    $btn.classList.remove("primary-connect");
    $btn.classList.add("connected");
    $btn.title = `${aktifAdres} (kopyalamak için tıkla)`;
    el("bagliAdres").textContent = kisaAdres(aktifAdres);
    el("bagliNokta").style.display = "inline-block";
    el("cuzdanIkon").style.display = "none";

    el("aktifHesapKisa").textContent = kisaAdres(aktifAdres);
    el("aktifHesapSatiri").title = aktifAdres;

    const network = await browserProvider.getNetwork();
    dogruAg = network.chainId === SEPOLIA_CHAIN_ID;

    if (!dogruAg) {
      el("agUyari").textContent =
        "Yanlış ağdasınız. İşlem yapmak için lütfen MetaMask'te Ethereum Sepolia ağına geçin.";
      el("agUyariKutu").classList.add("show");
      el("agNokta").classList.add("warn");
      el("kickerDot").classList.add("warn");
      el("agAdi").textContent = "Yanlış Ağ";
      el("agChainId").textContent = "Chain " + network.chainId.toString();
      el("kayitBtn").disabled = true;
      el("girisOnaylaBtn").disabled = true;
      yazmaSozlesmesi = null;
    } else {
      el("agUyari").textContent = "";
      el("agUyariKutu").classList.remove("show");
      el("agNokta").classList.remove("warn");
      el("kickerDot").classList.remove("warn");
      el("agAdi").textContent = "Sepolia";
      el("agChainId").textContent = "Chain 11155111";
      el("kayitBtn").disabled = aktifGonderimVar;
      el("girisOnaylaBtn").disabled = aktifGonderimVar;
      yazmaSozlesmesi = new ethers.Contract(SOZLESME_ADRESI, SOZLESME_ABI, signer);
    }

    rolArayuzuGuncelle();
    await kullaniciDurumuYukle();
    listeyiCiz();

    if (adresDegisti) {
      hesapDegisiminiVurgula();
      if (!aktifGonderimVar && !bekleyenIslem) {
        durumGoster({
          tip: "info",
          rozet: "Hesap Değişti",
          baslik: "Aktif hesap güncellendi",
          mesaj: `${kisaAdres(aktifAdres)} hesabının kayıt ve giriş durumu zincirden yenilendi.`,
        });
      }
    }
  } catch (err) {
    if (!sessiz) {
      const rapor = hataSiniflandir(err);
      durumGoster({ ...rapor });
    }
  }
}

async function sepoliaAginaGec() {
  if (!window.ethereum) return;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_HEX }],
    });
    await cuzdanBagla(true);
  } catch (err) {
    const rapor = hataSiniflandir(err);
    durumGoster({
      ...rapor,
      baslik: rapor.tip === "err" && rapor.rozet === "İmza Reddedildi"
        ? "Ağ değişikliği reddedildi"
        : "Sepolia ağına geçilemedi",
    });
  }
}

/* ===========================
   6) HATA SINIFLANDIRMA & DURUM PANELİ (İP 25)
   =========================== */
function imzaReddedildiMi(err) {
  if (!err) return false;
  if (
    err.code === "ACTION_REJECTED" ||
    err.code === 4001 ||
    err.info?.error?.code === 4001 ||
    err.cause?.code === 4001
  ) {
    return true;
  }
  const metin = [err.shortMessage, err.message, err.info?.error?.message]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    metin.includes("user rejected") ||
    metin.includes("user denied") ||
    metin.includes("rejected the request") ||
    metin.includes("action_rejected")
  );
}

function hexRevertCoz(data) {
  if (typeof data !== "string" || !data.startsWith("0x08c379a0") || data.length < 138) {
    return null;
  }
  try {
    if (!ethersYukluMu) return null;
    const [sebep] = ethers.AbiCoder.defaultAbiCoder().decode(
      ["string"],
      "0x" + data.slice(10)
    );
    return typeof sebep === "string" && sebep.trim() ? sebep.trim() : null;
  } catch {
    return null;
  }
}

function revertSebebiCikar(err) {
  if (!err) return null;

  if (typeof err.reason === "string" && err.reason.trim() && err.reason !== "require(false)") {
    return err.reason.trim();
  }
  if (typeof err.revert?.args?.[0] === "string" && err.revert.args[0].trim()) {
    return err.revert.args[0].trim();
  }

  const hamVeri =
    err.data || err.info?.error?.data || err.error?.data || err.cause?.data;
  const cozulenHex = hexRevertCoz(hamVeri);
  if (cozulenHex) return cozulenHex;

  const birlesik = [
    err.info?.error?.message,
    err.shortMessage,
    err.message,
  ]
    .filter(Boolean)
    .join(" | ");

  const bilinenSebepler = [
    "Takma ad bos olamaz",
    "Bu adres zaten kayitli",
    "Garaj kapasitesi doldu",
    "Sadece gorevli bu islemi yapabilir",
    "Bu adres garaja kayitli degil",
    "Bu katilimci zaten giris yapti",
  ];
  for (const sebep of bilinenSebepler) {
    if (birlesik.toLowerCase().includes(sebep.toLowerCase())) {
      return sebep;
    }
  }

  const eslesme = birlesik.match(/execution reverted(?::\s*([^|"'\n]+))?/i);
  if (eslesme && eslesme[1] && !eslesme[1].toLowerCase().includes("missing revert data")) {
    return eslesme[1].trim();
  }

  return null;
}

async function sozlesmeRedSebebiniTespitEt(err, baglam) {
  const acikSebep = revertSebebiCikar(err);
  if (acikSebep) return acikSebep;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  if (!ethersYukluMu || !baglam) return null;

  try {
    if (baglam.islemTuru === "kayit") {
      if (!(baglam.takmaAd || "").trim()) return "Takma ad bos olamaz";
      const [kayitli, toplam, kapasite] = await Promise.all([
        baglam.gonderen ? ethCallDecode("kayitliMi", [baglam.gonderen]).catch(() => null) : null,
        ethCallDecode("toplamKayit").catch(() => null),
        ethCallDecode("KAPASITE").catch(() => null),
      ]);
      if (kayitli === true) return "Bu adres zaten kayitli";
      if (kapasite !== null && toplam !== null && Number(toplam) >= Number(kapasite)) {
        return "Garaj kapasitesi doldu";
      }
    } else if (baglam.islemTuru === "giris") {
      const [gorevliAddr, kayitli, giris] = await Promise.all([
        ethCallDecode("gorevli").catch(() => null),
        baglam.katilimci ? ethCallDecode("kayitliMi", [baglam.katilimci]).catch(() => null) : null,
        baglam.katilimci ? ethCallDecode("girisYaptiMi", [baglam.katilimci]).catch(() => null) : null,
      ]);
      if (
        gorevliAddr &&
        baglam.gonderen &&
        gorevliAddr.toLowerCase() !== baglam.gonderen.toLowerCase()
      ) {
        return "Sadece gorevli bu islemi yapabilir";
      }
      if (kayitli === false) return "Bu adres garaja kayitli degil";
      if (giris === true) return "Bu katilimci zaten giris yapti";
    }
  } catch {
    return null;
  }
  return null;
}

function hataSiniflandir(err, baglam = {}) {
  if (err instanceof BelirsizSonucHatasi || err?.name === "BelirsizSonucHatasi") {
    const hashMetni = err.txHash ? `Tx: ${kisaHash(err.txHash)}` : "Tx hash korunuyor";
    return {
      tip: "unknown",
      rozet: "Sonuç Henüz Doğrulanamadı",
      baslik: "İşlem gönderildi, sonuç ağ nedeniyle doğrulanamadı",
      mesaj:
        (err.message || "Bağlantı sorunu nedeniyle işlem sonucu henüz doğrulanamadı.") +
        " Mevcut işlem bağlantısı korunmaktadır; işlem otomatik olarak tekrar gönderilmedi.",
      detay: err.teknikDetay ? `${hashMetni} · Sebep: ${err.teknikDetay}` : hashMetni,
      txHash: err.txHash || baglam.txHash || null,
      adim: 3,
      kurtarmaGoster: true,
    };
  }

  if (imzaReddedildiMi(err)) {
    return {
      tip: "err",
      rozet: "İmza Reddedildi",
      baslik: "Cüzdan onayı kullanıcı tarafından reddedildi",
      mesaj:
        "MetaMask imza isteğini reddettiniz. Blokzincire işlem gönderilmedi ve kayıt durumu değişmedi.",
      detay: "Kod: ACTION_REJECTED / 4001 · İşlem zincire yayınlanmadı",
      adim: 1,
    };
  }

  const tespit = baglam.tespitSebep || revertSebebiCikar(err) || "";
  const rawMsg =
    err?.info?.error?.message ||
    err?.shortMessage ||
    err?.reason ||
    err?.message ||
    "Bilinmeyen işlem hatası.";
  const birlesikAlt = (tespit + " " + rawMsg).toLowerCase();
  const hataAdimi = baglam.txHash ? 3 : 1;

  if (birlesikAlt.includes("zaten kayitli") || birlesikAlt.includes("zaten kayıtlı")) {
    return {
      tip: "err",
      rozet: "İşlem Başarısız",
      baslik: "Tekrar kayıt yapılamaz",
      mesaj:
        "Bu cüzdan adresi sözleşmeye zaten kayıtlı. Aynı adresle garaja ikinci kez kayıt olunamaz.",
      detay: "Sözleşme kuralı: require(!kayitliMi[msg.sender])",
      txHash: baglam.txHash || null,
      adim: hataAdimi,
    };
  }

  if (birlesikAlt.includes("kapasitesi doldu") || birlesikAlt.includes("kapasite")) {
    return {
      tip: "err",
      rozet: "İşlem Başarısız",
      baslik: "Garaj kapasitesi dolu",
      mesaj:
        "Garajdaki tüm kontenjan (3/3) dolmuş durumda. Yeni katılımcı kaydı sözleşme tarafından reddedildi.",
      detay: "Sözleşme kuralı: require(toplamKayit < KAPASITE)",
      txHash: baglam.txHash || null,
      adim: hataAdimi,
    };
  }

  if (birlesikAlt.includes("takma ad bos") || birlesikAlt.includes("boş olamaz")) {
    return {
      tip: "err",
      rozet: "İşlem Başarısız",
      baslik: "Geçersiz takma ad",
      mesaj: "Takma ad alanı boş bırakılamaz. Lütfen en az 1 karakterlik eğitim takma adı girin.",
      detay: "Sözleşme kuralı: require(bytes(_takmaAd).length > 0)",
      txHash: baglam.txHash || null,
      adim: hataAdimi,
    };
  }

  if (birlesikAlt.includes("sadece gorevli") || birlesikAlt.includes("sadece görevli")) {
    return {
      tip: "err",
      rozet: "Yetkisiz İşlem",
      baslik: "Yetkisiz hesap (Görevli değil)",
      mesaj:
        "Bağlı cüzdan sözleşmedeki yetkili görevli adresi değil. Giriş onayını yalnızca sözleşmeyi yayınlayan görevli hesabı verebilir.",
      detay: "Sözleşme kuralı: sadeceGorevli (msg.sender == gorevli)",
      txHash: baglam.txHash || null,
      adim: hataAdimi,
    };
  }

  if (birlesikAlt.includes("kayitli degil") || birlesikAlt.includes("kayıtlı değil")) {
    return {
      tip: "err",
      rozet: "İşlem Başarısız",
      baslik: "Katılımcı kayıtlı değil",
      mesaj:
        "Giriş onayı verilmek istenen adres garaja henüz kayıt olmamış. Önce katılımcının kayitOl işlemini yapması gerekir.",
      detay: "Sözleşme kuralı: require(kayitliMi[_katilimci])",
      txHash: baglam.txHash || null,
      adim: hataAdimi,
    };
  }

  if (birlesikAlt.includes("zaten giris yapti") || birlesikAlt.includes("zaten giriş yaptı")) {
    return {
      tip: "err",
      rozet: "İşlem Başarısız",
      baslik: "Giriş zaten onaylanmış",
      mesaj:
        "Bu katılımcının garaj girişi daha önce onaylanmış. Aynı adrese ikinci kez giriş onayı verilemez.",
      detay: "Sözleşme kuralı: require(!girisYaptiMi[_katilimci])",
      txHash: baglam.txHash || null,
      adim: hataAdimi,
    };
  }

  if (birlesikAlt.includes("insufficient funds") || birlesikAlt.includes("exceeds the balance")) {
    return {
      tip: "err",
      rozet: "İşlem Başarısız",
      baslik: "Yetersiz Sepolia test ETH (Gas)",
      mesaj:
        "Seçili hesapta işlem gas ücretini karşılayacak yeterli Sepolia test ETH bulunmuyor.",
      detay: rawMsg,
      adim: 1,
    };
  }

  if (baglam.receiptStatus === 0) {
    return {
      tip: "err",
      rozet: "İşlem Başarısız",
      baslik: "İşlem zincirde başarısız oldu (Revert)",
      mesaj:
        "İşlem bloğa alındı ancak sözleşme çalışmayı geri aldı (makbuz status = 0). Kayıt durumu değişmedi.",
      detay: baglam.detay || "receipt.status = 0",
      txHash: baglam.txHash || null,
      adim: 3,
    };
  }

  if (
    birlesikAlt.includes("çevrimdışı") ||
    birlesikAlt.includes("offline") ||
    birlesikAlt.includes("failed to fetch") ||
    birlesikAlt.includes("network error") ||
    birlesikAlt.includes("timeout") ||
    birlesikAlt.includes("zaman aşımı") ||
    (typeof navigator !== "undefined" && navigator.onLine === false)
  ) {
    return {
      tip: "err",
      rozet: "Bağlantı Hatası",
      baslik: "Bağlantı sorunu nedeniyle işlem gönderilemedi",
      mesaj:
        "İnternet veya RPC bağlantısı kurulamadığı için işlem ağa gönderilemedi. İşlem hash'i oluşmadığından bağlantıyı düzeltip tekrar deneyebilirsiniz.",
      detay: rawMsg,
      adim: 1,
    };
  }

  return {
    tip: "err",
    rozet: "İşlem Başarısız",
    baslik: "İşlem gerçekleştirilemedi",
    mesaj: tespit || rawMsg,
    detay: rawMsg !== (tespit || rawMsg) ? rawMsg : "",
    txHash: baglam.txHash || null,
    adim: hataAdimi,
  };
}

function durumGoster({
  tip,
  rozet,
  baslik,
  mesaj,
  detay = "",
  txHash = null,
  adim = 0,
  kurtarmaGoster = false,
}) {
  const $kutu = el("durumKutusu");
  const $rozet = el("durumRozeti");
  const $baslik = el("durumBaslik");
  const $msg = el("durumMesaji");
  const $detay = el("durumDetay");
  const $link = el("durumTxLink");
  const $kopya = el("durumHashKopyala");
  const $hat = el("islemHatti");
  const $kurtarma = el("durumKurtarma");

  $kutu.className = "tx-status-bar show " + tip;
  $rozet.textContent = rozet || "Durum";
  $baslik.textContent = baslik || "";
  $msg.textContent = mesaj || "";

  if (detay) {
    $detay.style.display = "block";
    $detay.textContent = detay;
  } else {
    $detay.style.display = "none";
    $detay.textContent = "";
  }

  if (txHash) {
    $link.style.display = "inline";
    $link.href = `${ETHERSCAN_URL}/tx/${txHash}`;
    $link.textContent = `Etherscan: ${kisaHash(txHash)} ↗`;
    $kopya.style.display = "inline-block";
    $kopya.dataset.hash = txHash;
  } else {
    $link.style.display = "none";
    $kopya.style.display = "none";
    delete $kopya.dataset.hash;
  }

  if (adim > 0) {
    $hat.style.display = "flex";
    $hat.querySelectorAll(".step-pill").forEach((pill) => {
      const s = Number(pill.dataset.step);
      pill.className = "step-pill";

      if (tip === "wallet-pending") {
        if (s === 1) pill.classList.add("active");
      } else if (tip === "chain-pending") {
        if (s < 2) pill.classList.add("done");
        else if (s === 2) pill.classList.add("chain-active");
      } else if (tip === "ok") {
        pill.classList.add("done");
      } else if (tip === "unknown") {
        if (s < 3) pill.classList.add("done");
        else if (s === 3) pill.classList.add("unknown");
      } else if (tip === "err") {
        if (s < adim) pill.classList.add("done");
        else if (s === adim) pill.classList.add("failed");
      }
    });
  } else {
    $hat.style.display = "none";
  }

  $kurtarma.style.display = kurtarmaGoster && txHash ? "flex" : "none";
}

function durumPaneliniKapat() {
  if (aktifGonderimVar) return;
  if (bekleyenIslem) {
    bekleyenIslemiTemizle();
  }
  const $kutu = el("durumKutusu");
  $kutu.className = "tx-status-bar";
  el("durumKurtarma").style.display = "none";
}

function islemButonlariniGuncelle(kilitli, kayitYazi = null, girisYazi = null) {
  const $kayitBtn = el("kayitBtn");
  const $girisBtn = el("girisOnaylaBtn");
  const pasif = kilitli || !dogruAg;
  $kayitBtn.disabled = pasif;
  $girisBtn.disabled = pasif;
  if (kayitYazi) $kayitBtn.querySelector("span").textContent = kayitYazi;
  if (girisYazi) $girisBtn.querySelector("span").textContent = girisYazi;
}

async function makbuzSonucunuIsle(sonuc, meta) {
  if (sonuc.basarili) {
    bekleyenIslemiTemizle();
    const detayParcalari = [
      "Makbuz status = 1",
      sonuc.blokNo ? `Blok #${sayiFmt.format(sonuc.blokNo)}` : null,
      sonuc.gasUsed ? `Gas ${sayiFmt.format(sonuc.gasUsed)}` : null,
      sonuc.ucretWei !== null ? `Ücret ${ethYaz(sonuc.ucretWei)}` : null,
    ].filter(Boolean);

    durumGoster({
      tip: "ok",
      rozet: "Başarılı · Makbuz Doğrulandı",
      baslik:
        meta.islemTuru === "giris"
          ? "Giriş onayı zincirde kesinleşti"
          : "Garaj kaydı zincirde kesinleşti",
      mesaj:
        meta.islemTuru === "giris"
          ? `${kisaAdres(meta.etiket)} adresinin garaj girişi makbuzla doğrulandı.`
          : `"${meta.etiket || "Kayıt"}" takma adıyla kaydınız makbuzla doğrulandı.`,
      detay: detayParcalari.join(" · "),
      txHash: meta.hash,
      adim: 3,
    });

    if (meta.islemTuru === "kayit") {
      el("takmaAdInput").value = "";
    } else if (meta.islemTuru === "giris") {
      el("katilimciAdresInput").value = "";
    }
    await tamYenile(true);
    return;
  }

  bekleyenIslemiTemizle();
  const detayParcalari = [
    `Makbuz status = ${sonuc.statusNum ?? 0}`,
    sonuc.blokNo ? `Blok #${sayiFmt.format(sonuc.blokNo)}` : null,
    sonuc.gasUsed ? `Harcanan gas ${sayiFmt.format(sonuc.gasUsed)}` : null,
  ].filter(Boolean);

  const rapor = hataSiniflandir(new Error("Transaction reverted"), {
    receiptStatus: 0,
    txHash: meta.hash,
    detay: detayParcalari.join(" · "),
  });
  durumGoster({ ...rapor });
}

async function bekleyenMakbuzuTekrarSorgula() {
  if (!bekleyenIslem || !bekleyenIslem.hash) return;
  const $btn = el("makbuzTekrarSorgulaBtn");
  const eski = $btn.textContent;
  $btn.disabled = true;
  $btn.textContent = "Sorgulanıyor (Yeni İşlem Gönderilmiyor)…";

  try {
    const sorgu = await makbuzSorgulaTekSefer(bekleyenIslem.hash);
    if (!sorgu.erisildi) {
      durumGoster({
        tip: "unknown",
        rozet: "Sonuç Henüz Doğrulanamadı",
        baslik: "Bağlantı sorunu devam ediyor",
        mesaj:
          "RPC düğümlerine erişilemediği için mevcut işlemin makbuzu henüz okunamadı. İşlem bağlantınız korunuyor ve yeni işlem gönderilmedi.",
        detay: `Tx: ${kisaHash(bekleyenIslem.hash)} · Son deneme ${new Date().toLocaleTimeString("tr-TR")} (${sorgu.hata})`,
        txHash: bekleyenIslem.hash,
        adim: 3,
        kurtarmaGoster: true,
      });
      return;
    }

    if (!sorgu.receipt) {
      durumGoster({
        tip: "unknown",
        rozet: "Sonuç Henüz Doğrulanamadı",
        baslik: "İşlem hâlâ onay bekliyor (Pending)",
        mesaj:
          "İşlemin makbuzu henüz blokta oluşmamış görünüyor. Etherscan üzerinden durumu izleyebilir veya birazdan tekrar sorgulayabilirsiniz.",
        detay: `Tx: ${kisaHash(bekleyenIslem.hash)} · Son kontrol ${new Date().toLocaleTimeString("tr-TR")}`,
        txHash: bekleyenIslem.hash,
        adim: 3,
        kurtarmaGoster: true,
      });
      return;
    }

    const sonuc = makbuzOzetiCikar(sorgu.receipt);
    await makbuzSonucunuIsle(sonuc, bekleyenIslem);
  } finally {
    $btn.disabled = false;
    $btn.textContent = eski;
  }
}

/* ===========================
   7) YAZMA İŞLEMLERİ (kayitOl & girisOnayla)
   =========================== */
async function kayitOl() {
  if (aktifGonderimVar) return;
  if (!yazmaSozlesmesi) {
    durumGoster({
      tip: "err",
      rozet: "Cüzdan Bağlı Değil",
      baslik: "Önce Sepolia ağında cüzdan bağlayın",
      mesaj: "Kayıt işlemi göndermek için üstten MetaMask cüzdanını Sepolia ağında bağlamalısınız.",
    });
    return;
  }

  if (bekleyenIslem && bekleyenIslem.durum === "unknown" && bekleyenIslem.islemTuru === "kayit") {
    durumGoster({
      tip: "unknown",
      rozet: "Sonuç Henüz Doğrulanamadı",
      baslik: "Bekleyen bir kayıt işleminiz var",
      mesaj:
        "Çift gönderimi önlemek için yeni kayıt işlemi başlatılmadı. Önce aşağıdaki mevcut işlemin makbuzunu sorgulayın veya takibi kapatın.",
      detay: `Tx: ${kisaHash(bekleyenIslem.hash)}`,
      txHash: bekleyenIslem.hash,
      adim: 3,
      kurtarmaGoster: true,
    });
    return;
  }

  const takmaAd = el("takmaAdInput").value.trim();
  const baglam = {
    islemTuru: "kayit",
    takmaAd,
    gonderen: aktifAdres,
    txHash: null,
  };

  aktifGonderimVar = true;
  islemButonlariniGuncelle(true, "Cüzdan Onayı Bekleniyor…", "Girişi Onayla");

  try {
    durumGoster({
      tip: "wallet-pending",
      rozet: "Cüzdan Onayı Bekleniyor",
      baslik: "MetaMask imza onayı bekleniyor",
      mesaj:
        "İşlem henüz ağa gönderilmedi. MetaMask penceresinde kayıt işlemini onaylayın veya iptal etmek için reddedin.",
      detay: `Çağrı: kayitOl("${takmaAd}") · Hesap: ${kisaAdres(aktifAdres)}`,
      adim: 1,
    });

    const tx = await yazmaSozlesmesi.kayitOl(takmaAd);
    baglam.txHash = tx.hash;
    bekleyenIslemiKaydet({
      hash: tx.hash,
      islemTuru: "kayit",
      etiket: takmaAd,
      gonderen: aktifAdres,
      durum: "chain-pending",
    });

    islemButonlariniGuncelle(true, "Zincir Sonucu Bekleniyor…", "Girişi Onayla");
    durumGoster({
      tip: "chain-pending",
      rozet: "Zincir Sonucu Bekleniyor",
      baslik: "İşlem yayınlandı, makbuz bekleniyor",
      mesaj:
        "İşlem Sepolia ağına iletildi ve işlem hash'i oluştu. Başarı mesajı makbuzdaki status = 1 doğrulandıktan sonra gösterilecektir.",
      detay: `Tx yayınlandı · Makbuz bekleniyor (0 sn)`,
      txHash: tx.hash,
      adim: 2,
    });

    const sonuc = await makbuzBekleVeDogrula(tx, (sn) => {
      if (sn > 0) {
        el("durumDetay").textContent = `Tx yayınlandı · Sepolia makbuzu bekleniyor (${sn} sn / 45 sn)`;
      }
    });

    await makbuzSonucunuIsle(sonuc, {
      hash: tx.hash,
      islemTuru: "kayit",
      etiket: takmaAd,
    });
  } catch (err) {
    if (err instanceof BelirsizSonucHatasi) {
      bekleyenIslemiKaydet({
        hash: err.txHash,
        islemTuru: "kayit",
        etiket: takmaAd,
        gonderen: aktifAdres,
        durum: "unknown",
      });
      const rapor = hataSiniflandir(err, baglam);
      durumGoster({ ...rapor });
    } else {
      const tespitSebep =
        imzaReddedildiMi(err) ? null : await sozlesmeRedSebebiniTespitEt(err, baglam);
      const rapor = hataSiniflandir(err, { ...baglam, tespitSebep });
      durumGoster({ ...rapor });
    }
  } finally {
    aktifGonderimVar = false;
    islemButonlariniGuncelle(false, "Zincire Kaydol", "Girişi Onayla");
  }
}

async function girisOnayla() {
  if (aktifGonderimVar) return;
  if (!yazmaSozlesmesi) {
    durumGoster({
      tip: "err",
      rozet: "Cüzdan Bağlı Değil",
      baslik: "Önce Sepolia ağında cüzdan bağlayın",
      mesaj: "Giriş onayı göndermek için üstten MetaMask cüzdanını Sepolia ağında bağlamalısınız.",
    });
    return;
  }

  const katilimciHam = el("katilimciAdresInput").value.trim();
  if (!ethers.isAddress(katilimciHam)) {
    durumGoster({
      tip: "err",
      rozet: "Geçersiz Adres",
      baslik: "Geçerli bir Ethereum adresi girin",
      mesaj: "Katılımcı adresi 0x ile başlayan 42 karakterli geçerli bir adres olmalıdır.",
    });
    return;
  }

  if (bekleyenIslem && bekleyenIslem.durum === "unknown" && bekleyenIslem.islemTuru === "giris") {
    durumGoster({
      tip: "unknown",
      rozet: "Sonuç Henüz Doğrulanamadı",
      baslik: "Bekleyen bir giriş onayı işleminiz var",
      mesaj:
        "Çift gönderimi önlemek için yeni giriş onayı başlatılmadı. Önce mevcut işlemin makbuzunu sorgulayın veya takibi kapatın.",
      detay: `Tx: ${kisaHash(bekleyenIslem.hash)}`,
      txHash: bekleyenIslem.hash,
      adim: 3,
      kurtarmaGoster: true,
    });
    return;
  }

  const katilimci = ethers.getAddress(katilimciHam);
  const baglam = {
    islemTuru: "giris",
    katilimci,
    gonderen: aktifAdres,
    txHash: null,
  };

  aktifGonderimVar = true;
  islemButonlariniGuncelle(true, "Zincire Kaydol", "Cüzdan Onayı Bekleniyor…");

  try {
    durumGoster({
      tip: "wallet-pending",
      rozet: "Cüzdan Onayı Bekleniyor",
      baslik: "MetaMask imza onayı bekleniyor",
      mesaj:
        "Giriş onayı işlemi henüz ağa gönderilmedi. MetaMask üzerinden imzalayın veya iptal etmek için reddedin.",
      detay: `Çağrı: girisOnayla(${kisaAdres(katilimci)}) · Gönderen: ${kisaAdres(aktifAdres)}`,
      adim: 1,
    });

    const tx = await yazmaSozlesmesi.girisOnayla(katilimci);
    baglam.txHash = tx.hash;
    bekleyenIslemiKaydet({
      hash: tx.hash,
      islemTuru: "giris",
      etiket: katilimci,
      gonderen: aktifAdres,
      durum: "chain-pending",
    });

    islemButonlariniGuncelle(true, "Zincire Kaydol", "Zincir Sonucu Bekleniyor…");
    durumGoster({
      tip: "chain-pending",
      rozet: "Zincir Sonucu Bekleniyor",
      baslik: "Giriş onayı yayınlandı, makbuz bekleniyor",
      mesaj:
        "İşlem Sepolia ağına gönderildi ve işlem hash'i oluştu. Makbuzdaki status = 1 doğrulandığında onay kesinleşecektir.",
      detay: `Tx yayınlandı · Makbuz bekleniyor (0 sn)`,
      txHash: tx.hash,
      adim: 2,
    });

    const sonuc = await makbuzBekleVeDogrula(tx, (sn) => {
      if (sn > 0) {
        el("durumDetay").textContent = `Tx yayınlandı · Sepolia makbuzu bekleniyor (${sn} sn / 45 sn)`;
      }
    });

    await makbuzSonucunuIsle(sonuc, {
      hash: tx.hash,
      islemTuru: "giris",
      etiket: katilimci,
    });
  } catch (err) {
    if (err instanceof BelirsizSonucHatasi) {
      bekleyenIslemiKaydet({
        hash: err.txHash,
        islemTuru: "giris",
        etiket: katilimci,
        gonderen: aktifAdres,
        durum: "unknown",
      });
      const rapor = hataSiniflandir(err, baglam);
      durumGoster({ ...rapor });
    } else {
      const tespitSebep =
        imzaReddedildiMi(err) ? null : await sozlesmeRedSebebiniTespitEt(err, baglam);
      const rapor = hataSiniflandir(err, { ...baglam, tespitSebep });
      durumGoster({ ...rapor });
    }
  } finally {
    aktifGonderimVar = false;
    islemButonlariniGuncelle(false, "Zincire Kaydol", "Girişi Onayla");
  }
}

/* ===========================
   8) ZİNCİR & GEZGİN ÇİZİMİ
   =========================== */
function siraliKatilimcilar() {
  return [...katilimcilar.values()].sort(
    (a, b) => (b.kayitBlok || 0) - (a.kayitBlok || 0) || b.sira - a.sira
  );
}

function isiltiBaslat() {
  clearTimeout(isikZaman);
  const $list = el("list");
  const halkalar = [...$list.querySelectorAll(".entry")].reverse();
  if (halkalar.length < 2) return;

  const isik = document.createElement("li");
  isik.className = "isik";
  isik.setAttribute("aria-hidden", "true");
  $list.appendChild(isik);

  const merkez = (e) => e.offsetTop + 24;
  let i = 0;

  const adim = () => {
    if (i === 0) {
      isik.style.transition = "none";
      isik.style.transform = `translateY(${merkez(halkalar[0])}px)`;
      void isik.offsetWidth;
      isik.style.transition = "";
    }
    if (i < halkalar.length) {
      const e = halkalar[i];
      isik.style.transform = `translateY(${merkez(e)}px)`;
      isik.style.opacity = 1;
      e.classList.remove("parla");
      void e.offsetWidth;
      e.classList.add("parla");
      i++;
      isikZaman = setTimeout(adim, 440);
    } else {
      isik.style.opacity = 0;
      i = 0;
      isikZaman = setTimeout(adim, 1900);
    }
  };
  adim();
}

function eslesmeyiGoster(addr) {
  eslesenAdres = addr;
  document.querySelectorAll(".entry[data-addr], .tx[data-addr]").forEach((node) => {
    node.classList.toggle("eslesen", Boolean(addr) && node.dataset.addr === addr);
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("mouseover", (e) => {
    const hit = e.target.closest?.(".entry[data-addr], .tx[data-addr]");
    const addr = hit?.dataset.addr ?? null;
    if (addr !== eslesenAdres) eslesmeyiGoster(addr);
  });
}

function listeyiCiz() {
  const tumu = siraliKatilimcilar();
  const onayliAdet = tumu.filter((k) => k.girisOnayli).length;
  const bekleyenAdet = tumu.length - onayliAdet;

  el("onayliSayisi").textContent = onayliAdet;
  el("bekleyenBilgi").textContent =
    bekleyenAdet > 0 ? `${bekleyenAdet} kişi onay bekliyor` : tumu.length ? "Tüm kayıtlılar onaylı" : "Henüz kayıt yok";

  if (islemListesi.length) {
    const son = islemListesi[0];
    el("sonHareket").textContent = once(son.zaman);
    el("sonHareketTur").textContent =
      son.tur === "giris" ? `girisOnayla · ${son.takmaAd}` : `kayitOl · ${son.takmaAd}`;
  } else {
    el("sonHareket").textContent = "–";
    el("sonHareketTur").textContent = "Henüz işlem yok";
  }

  const filtrelenen = tumu.filter((k) => {
    if (zincirFiltre === "approved") return k.girisOnayli;
    if (zincirFiltre === "pending") return !k.girisOnayli;
    return true;
  });

  el("zincirSayac").textContent = filtrelenen.length;
  const $list = el("list");
  $list.innerHTML = "";

  filtrelenen.forEach((k, idx) => {
    const addrLow = k.adres.toLowerCase();
    const benimMi = aktifAdres && aktifAdres.toLowerCase() === addrLow;

    const li = document.createElement("li");
    li.className =
      "entry" +
      (idx === 0 ? " newest" : "") +
      (addrLow === eslesenAdres ? " eslesen" : "");
    li.dataset.addr = addrLow;
    li.style.animationDelay = Math.min(idx * 45, 360) + "ms";

    li.innerHTML = `
      <div class="node" style="background:${adresRengi(k.adres)}">
        <span></span>
        <span class="node-badge ${k.girisOnayli ? "ok" : "wait"}" title="${k.girisOnayli ? "Giriş onaylandı" : "Giriş onayı bekliyor"}">${k.girisOnayli ? "✓" : "•"}</span>
      </div>
      <div class="card">
        <div class="row">
          <div class="name-wrap">
            <span class="name"></span>
            <span class="tag ${k.girisOnayli ? "ok" : "wait"}">${k.girisOnayli ? "✓ Giriş Onaylı" : "⏳ Onay Bekliyor"}</span>
            ${idx === 0 ? '<span class="tag">son</span>' : ""}
            ${benimMi ? '<span class="tag me">sen</span>' : ""}
          </div>
          <time class="ago">${once(k.kayitZaman)}</time>
        </div>
        <div class="meta">
          ${k.kayitZaman ? `<span class="mono">${tarihFmt.format(k.kayitZaman * 1000)}</span>` : ""}
          <a class="mono" target="_blank" rel="noopener" href="${ETHERSCAN_URL}/address/${k.adres}">${kisaAdres(k.adres)}</a>
          ${k.kayitTx ? `<a class="mono" target="_blank" rel="noopener" href="${ETHERSCAN_URL}/tx/${k.kayitTx}">kayıt tx ↗</a>` : ""}
          ${k.girisTx ? `<a class="mono" target="_blank" rel="noopener" href="${ETHERSCAN_URL}/tx/${k.girisTx}">giriş tx ↗</a>` : ""}
          ${!k.girisOnayli ? `<button class="quick-fill" type="button" data-fill="${k.adres}">Onay için seç ↗</button>` : ""}
        </div>
      </div>`;

    li.querySelector(".node span").textContent = basHarfler(k.takmaAd);
    li.querySelector(".name").textContent = k.takmaAd;
    $list.appendChild(li);
  });

  const gen = document.createElement("li");
  gen.className = "entry genesis";
  gen.innerHTML = `
    <div class="node mono">#0</div>
    <div class="card">
      ${
        tumu.length
          ? `Zincirin başı · <strong>${SOZLESME_ADI}</strong> yayınlandı · <a class="mono" target="_blank" rel="noopener" href="${ETHERSCAN_URL}/tx/${DEPLOY_TX}">deploy tx ↗</a>`
          : `Henüz kimse garaja kaydolmadı. İlk park yeri seni bekliyor!`
      }
    </div>`;
  $list.appendChild(gen);

  isiltiBaslat();
}

async function islemleriCiz() {
  el("cTx").textContent = islemListesi.length;
  const $txs = el("txs");

  const filtrelenen = islemListesi.filter((it) => {
    if (islemFiltre === "kayit") return it.tur === "kayit";
    if (islemFiltre === "giris") return it.tur === "giris";
    return true;
  });

  if (!filtrelenen.length) {
    $txs.innerHTML = '<li class="tx-empty">Bu filtrede onaylı işlem bulunamadı.</li>';
    return;
  }

  const satirlar = await Promise.all(
    filtrelenen.map(async (it) => {
      let m = null;
      try {
        m = await makbuzAl(it.tx);
      } catch {}
      return { it, m };
    })
  );

  $txs.innerHTML = "";
  for (const { it, m } of satirlar) {
    const basarili = !m || m.status === "0x1";
    const gas = m ? sayiFmt.format(parseInt(m.gasUsed, 16)) : "–";
    const ucret =
      m && m.gasUsed && m.effectiveGasPrice
        ? ethYaz(BigInt(m.gasUsed) * BigInt(m.effectiveGasPrice))
        : "–";
    const onay = tepeBlok ? sayiFmt.format(Math.max(1, tepeBlok - it.blok + 1)) : "–";
    const fromAddr = m?.from ? ethers.getAddress(m.from) : it.adres;
    const addrLow = it.adres.toLowerCase();

    const li = document.createElement("li");
    li.className = "tx" + (addrLow === eslesenAdres ? " eslesen" : "");
    li.dataset.addr = addrLow;

    const methodClass = it.tur === "giris" ? "method-giris" : "method-kayit";
    const methodAd = it.tur === "giris" ? "girisOnayla" : "kayitOl";

    li.innerHTML = `
      <div class="tx-top">
        <a class="mono tx-hash" target="_blank" rel="noopener" href="${ETHERSCAN_URL}/tx/${it.tx}">${kisaHash(it.tx)}</a>
        <span class="pill ${basarili ? "ok" : "fail"}">${basarili ? "Başarılı" : "Başarısız"}</span>
      </div>
      <div class="tx-grid">
        <span>Method</span><b><span class="pill ${methodClass}">${methodAd}</span> <span class="isim"></span></b>
        <span>Blok</span><b class="mono"><a target="_blank" rel="noopener" href="${ETHERSCAN_URL}/block/${it.blok}">${sayiFmt.format(it.blok)}</a> · ${onay} onay</b>
        <span>Zaman</span><b>${once(it.zaman)}</b>
        <span>From</span><b class="mono"><a target="_blank" rel="noopener" href="${ETHERSCAN_URL}/address/${fromAddr}">${kisaAdres(fromAddr)}</a></b>
        ${
          it.tur === "giris"
            ? `<span>Katılımcı</span><b class="mono"><a target="_blank" rel="noopener" href="${ETHERSCAN_URL}/address/${it.adres}">${kisaAdres(it.adres)}</a></b>`
            : `<span>To</span><b class="mono">${SOZLESME_ADI}</b>`
        }
        <span>Gas</span><b class="mono">${gas}</b>
        <span>Ücret</span><b class="mono">${ucret}</b>
      </div>`;

    li.querySelector(".isim").textContent = it.takmaAd || kisaAdres(it.adres);
    $txs.appendChild(li);
  }
}

/* ===========================
   9) TAM YENİLEME & ÇEVRİMDIŞI TAKİBİ
   =========================== */
function cevrimdisiDurumunuGuncelle() {
  const cevrimdisi = typeof navigator !== "undefined" && navigator.onLine === false;
  el("cevrimdisiUyari").classList.toggle("show", cevrimdisi);
}

async function tamYenile(elle = false) {
  const $yBtn = el("yenileBtn");
  const $yYazi = el("yenileBtnYazi");

  if (elle && $yBtn) {
    $yBtn.classList.add("spinning");
    if ($yYazi) $yYazi.textContent = "Yenileniyor…";
    clearTimeout(yenileYaziZaman);
  }

  try {
    if (elle && typeof window !== "undefined" && window.ethereum) {
      await cuzdanBagla(true);
    }

    await genelBilgileriOku();
    if (aktifAdres) await kullaniciDurumuYukle();
    await loglariTara(tepeBlok);
    listeyiCiz();
    await islemleriCiz();
    el("status").textContent = `Her 20 saniyede Sepolia zincirinden yenilenir · son okuma ${new Date().toLocaleTimeString("tr-TR")}`;

    if (elle && $yYazi) {
      $yYazi.textContent = "Yenilendi ✓";
      yenileYaziZaman = setTimeout(() => {
        $yYazi.textContent = "Bilgileri Yenile";
      }, 1500);
    }
  } catch (err) {
    console.warn("Zincir yenileme hatası:", err);
    el("status").textContent = "Zincire ulaşılamadı, birazdan tekrar denenecek: " + err.message;
    if (elle && $yYazi) {
      $yYazi.textContent = "Bilgileri Yenile";
    }
  } finally {
    if ($yBtn) setTimeout(() => $yBtn.classList.remove("spinning"), 400);
  }
}

/* ===========================
   10) GARAJ BOTU MASKOTU
   =========================== */
const MASKOT_LAFLARI = [
  "Hoş geldin! Tx hash tek başına başarı değildir, makbuzu bekle 👀",
  "Cüzdan onayı ayrı, zincir onayı ayrı adım — ikisini karıştırma!",
  "İmzayı reddedersen zincire tek bayt bile gönderilmez ✋",
  "Aynı cüzdanla ikinci kayıt mı? Sözleşme anında reddeder!",
  "Bağlantı kopsa bile elindeki Tx hash linki kaybolmaz, tekrar gönderme!",
  "Görevli değil misin? Yetki kontrolü sözleşmede, işlem revert yer 🔐",
  "Hesap değiştirince 'Bilgileri Yenile' ile kaydını anında kontrol et!",
  "Kapasite 3/3 dolduysa çift sıra park yok 😅",
];

function maskotBaslat() {
  let lafNo = 0;
  const $bubble = el("bubble");
  const $bubbleText = el("bubbleText");
  const $mascot = el("mascot");
  const $wrap = el("mascotWrap");

  const konus = () => {
    $bubble.classList.add("gizli");
    setTimeout(() => {
      lafNo = (lafNo + 1) % MASKOT_LAFLARI.length;
      $bubbleText.textContent = MASKOT_LAFLARI[lafNo];
      $bubble.classList.remove("gizli");
    }, 240);
  };

  $mascot.addEventListener("click", () => {
    $mascot.classList.remove("hop");
    void $mascot.offsetWidth;
    $mascot.classList.add("hop");
    $mascot.querySelector("svg").addEventListener(
      "animationend",
      () => $mascot.classList.remove("hop"),
      { once: true }
    );
    konus();
  });

  el("mascotHide").addEventListener("click", (e) => {
    e.stopPropagation();
    $wrap.classList.add("minimized");
  });

  el("mascotRestore").addEventListener("click", () => {
    $wrap.classList.remove("minimized");
  });

  setInterval(() => {
    if (!$wrap.classList.contains("minimized")) konus();
  }, 14000);
}

/* ===========================
   11) BAŞLATMA & OLAY DİNLEYİCİLER
   =========================== */
function sabitBilgileriYaz() {
  el("cName").textContent = SOZLESME_ADI;
  el("cAddr").textContent = kisaAdres(SOZLESME_ADRESI);
  el("cAddr").href = `${ETHERSCAN_URL}/address/${SOZLESME_ADRESI}#code`;
  el("cBlock").textContent = sayiFmt.format(DEPLOY_BLOCK);
  el("cBlock").href = `${ETHERSCAN_URL}/block/${DEPLOY_BLOCK}`;
  el("cCompiler").textContent = DERLEYICI;
}

function olaylariBagla() {
  el("copyContract").addEventListener("click", (e) => kopyala(SOZLESME_ADRESI, e.currentTarget));
  el("copyGorevli").addEventListener("click", (e) => {
    if (sozlesmeBilgi.gorevli) kopyala(sozlesmeBilgi.gorevli, e.currentTarget);
  });
  el("durumHashKopyala").addEventListener("click", (e) => {
    kopyala(e.currentTarget.dataset.hash, e.currentTarget);
  });
  el("durumKapatBtn").addEventListener("click", durumPaneliniKapat);
  el("makbuzTekrarSorgulaBtn").addEventListener("click", bekleyenMakbuzuTekrarSorgula);

  el("baglanBtn").addEventListener("click", () => {
    if (aktifAdres) {
      navigator.clipboard?.writeText(aktifAdres);
      if (!aktifGonderimVar && !bekleyenIslem) {
        durumGoster({
          tip: "info",
          rozet: "Bilgi",
          baslik: "Cüzdan adresi kopyalandı",
          mesaj: `Bağlı cüzdan adresi panoya kopyalandı: ${aktifAdres}`,
        });
      }
    } else {
      cuzdanBagla(false);
    }
  });

  el("yenileBtn").addEventListener("click", () => tamYenile(true));
  el("sepoliaGecBtn").addEventListener("click", sepoliaAginaGec);
  el("kayitBtn").addEventListener("click", kayitOl);
  el("girisOnaylaBtn").addEventListener("click", girisOnayla);

  el("takmaAdInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !el("kayitBtn").disabled) kayitOl();
  });
  el("katilimciAdresInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !el("girisOnaylaBtn").disabled) girisOnayla();
  });

  el("list").addEventListener("click", (e) => {
    const btn = e.target.closest(".quick-fill");
    if (!btn) return;
    const addr = btn.dataset.fill;
    const input = el("katilimciAdresInput");
    input.value = addr;
    input.focus();
    input.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  document.querySelectorAll("[data-chain-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      zincirFiltre = btn.dataset.chainFilter;
      document.querySelectorAll("[data-chain-filter]").forEach((b) =>
        b.classList.toggle("active", b === btn)
      );
      listeyiCiz();
    });
  });

  document.querySelectorAll("[data-tx-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      islemFiltre = btn.dataset.txFilter;
      document.querySelectorAll("[data-tx-filter]").forEach((b) =>
        b.classList.toggle("active", b === btn)
      );
      islemleriCiz();
    });
  });

  if (window.ethereum) {
    window.ethereum.on("accountsChanged", (accs) => {
      if (!accs || !accs.length) {
        cuzdanBaglantisiniSifirla();
        if (!aktifGonderimVar && !bekleyenIslem) {
          durumGoster({
            tip: "info",
            rozet: "Cüzdan Ayrıldı",
            baslik: "Cüzdan bağlantısı kesildi",
            mesaj: "MetaMask bağlantısı kaldırıldı. İşlem göndermek için yeniden bağlanabilirsiniz.",
          });
        }
      } else {
        cuzdanBagla(true, { hesapDegisti: true });
      }
    });
    window.ethereum.on("chainChanged", () => cuzdanBagla(true));
  }

  window.addEventListener("offline", () => {
    cevrimdisiDurumunuGuncelle();
  });

  window.addEventListener("online", () => {
    cevrimdisiDurumunuGuncelle();
    if (bekleyenIslem && bekleyenIslem.hash && bekleyenIslem.durum === "unknown") {
      durumGoster({
        tip: "unknown",
        rozet: "Sonuç Henüz Doğrulanamadı",
        baslik: "İnternet bağlantısı geri geldi",
        mesaj:
          "Artık aşağıdaki düğmeyle mevcut işlemin makbuzunu güvenle sorgulayabilirsiniz. İşlem otomatik olarak tekrar gönderilmedi.",
        detay: `Tx: ${kisaHash(bekleyenIslem.hash)}`,
        txHash: bekleyenIslem.hash,
        adim: 3,
        kurtarmaGoster: true,
      });
    } else {
      tamYenile(false);
    }
  });
}

function baslat() {
  temaBaslat();
  maskotBaslat();
  cevrimdisiDurumunuGuncelle();

  if (!ethersYukluMu) {
    durumGoster({
      tip: "err",
      rozet: "Başlatma Hatası",
      baslik: "ethers.js kütüphanesi yüklenemedi",
      mesaj:
        "Sayfa ilk açılışta ethers.js CDN dosyasına erişemedi (internet bağlantısı kapalı olabilir). Bağlantıyı kontrol edip sayfayı yenileyin.",
    });
    el("status").textContent = "ethers.js yüklenemediği için zincir okunamadı.";
    return;
  }

  sabitBilgileriYaz();
  olaylariBagla();

  const kayitliBekleyen = bekleyenIslemiYukle();
  if (kayitliBekleyen) {
    durumGoster({
      tip: "unknown",
      rozet: "Sonuç Henüz Doğrulanamadı",
      baslik: "Önceki oturumdan kalan işlem bağlantısı",
      mesaj:
        "Daha önce gönderilmiş ancak sonucu doğrulanmamış bir işleminiz var. Otomatik yeniden gönderim yapılmadı; makbuzunu kontrol edebilirsiniz.",
      detay: `Tx: ${kisaHash(kayitliBekleyen.hash)}`,
      txHash: kayitliBekleyen.hash,
      adim: 3,
      kurtarmaGoster: true,
    });
    if (typeof navigator === "undefined" || navigator.onLine !== false) {
      bekleyenMakbuzuTekrarSorgula();
    }
  }

  cuzdanBagla(true);
  tamYenile(false);
  setInterval(() => tamYenile(false), YENILEME_MS);
}

if (typeof document !== "undefined") {
  baslat();
}
