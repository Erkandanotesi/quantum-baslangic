/* Quantum Garaj — Sepolia GarajKayitV3 Arayüzü & Canlı Blokzincir Gezgini */

const el = (id) => document.getElementById(id);
const iface = new ethers.Interface(SOZLESME_ABI);

const KAYIT_TOPIC = iface.getEvent("KayitOlundu").topicHash;
const GIRIS_TOPIC = iface.getEvent("GirisOnaylandi").topicHash;

const RPC_ZAMAN_ASIMI = 8500;
const LOG_PARCA = 9000;
const YENILEME_MS = 20000;

// Uygulama durumu
let browserProvider = null;
let signer = null;
let yazmaSozlesmesi = null;
let aktifAdres = null;
let dogruAg = false;

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
   2) HIZLI PUBLIC SEPOLIA RPC
   =========================== */
async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(RPC_ZAMAN_ASIMI),
  });
  const j = await res.json();
  if (j.error || j.result == null) throw new Error(j.error?.message || "boş RPC cevabı");
  return j.result;
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

  // Gerekli benzersiz blokların zaman damgalarını paralel al
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

  // Sıralamaları güncelle (en yeni üstte)
  islemListesi.sort((a, b) => b.blok - a.blok || b.logIndex - a.logIndex);

  // Eksik takma adları eşle
  for (const item of islemListesi) {
    const k = katilimcilar.get(item.adres.toLowerCase());
    if (k && k.takmaAd) item.takmaAd = k.takmaAd;
  }

  tarananBlok = tepe;
}

/* ===========================
   3) SÖZLEŞME VERİLERİNİ OKUMA
   =========================== */
async function genelBilgileriOku() {
  const [ad, kapasite, toplam, gorevli, tepeHex] = await Promise.all([
    ethCallDecode("garajAdi").catch(() => ethCallDecode("etkinlikAdi").catch(() => "Otomobil Garajı")),
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

  // Görsel park peronlarını çiz
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

  // Rol rozeti & ipuçlarını güncelle
  rolArayuzuGuncelle();
}

/* ===========================
   4) CÜZDAN BAĞLANTISI & KULLANICI DURUMU
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
    $gorevliIpucu.textContent = "Bağlı adres görevli değil; çağrı yapılırsa sözleşme revert eder.";
  }
}

async function kullaniciDurumuYukle() {
  if (!aktifAdres) return;

  try {
    const [kayitli, takmaAd, girisYapti] = await Promise.all([
      ethCallDecode("kayitliMi", [aktifAdres]),
      ethCallDecode("kayitlar", [aktifAdres]),
      ethCallDecode("girisYaptiMi", [aktifAdres]),
    ]);

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
      el("kayitIpucu").textContent = "Bu adres zaten kayıtlı (tekrar denenirse sözleşme revert eder).";
    } else if (doluMu) {
      el("kayitIpucu").textContent = "Garaj kapasitesi dolu (yeni kayıt denemesi sözleşmede reddedilir).";
    } else {
      el("kayitIpucu").textContent = "Takma adını yazıp MetaMask ile zincire kalıcı kayıt oluşturabilirsin.";
    }
  } catch (err) {
    console.warn("Kullanıcı durumu okunamadı:", err);
  }
}

async function cuzdanBagla(sessiz = false) {
  if (!window.ethereum) {
    if (!sessiz) {
      durumGoster("err", "MetaMask bulunamadı. İşlem göndermek için MetaMask tarayıcı uzantısını kurun.");
    }
    return;
  }

  try {
    browserProvider = new ethers.BrowserProvider(window.ethereum);
    const hesaplar = await browserProvider.send(sessiz ? "eth_accounts" : "eth_requestAccounts", []);
    if (!hesaplar || !hesaplar.length) return;

    signer = await browserProvider.getSigner();
    aktifAdres = ethers.getAddress(await signer.getAddress());

    const $btn = el("baglanBtn");
    $btn.classList.remove("primary-connect");
    $btn.classList.add("connected");
    $btn.title = `${aktifAdres} (kopyalamak için tıkla)`;
    el("bagliAdres").textContent = kisaAdres(aktifAdres);

    // Bağlı iken noktayı güncelle
    const oldDot = $btn.querySelector("svg");
    if (oldDot) {
      const dot = document.createElement("span");
      dot.className = "wallet-dot";
      oldDot.replaceWith(dot);
    }

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
      el("kayitBtn").disabled = false;
      el("girisOnaylaBtn").disabled = false;
      yazmaSozlesmesi = new ethers.Contract(SOZLESME_ADRESI, SOZLESME_ABI, signer);
    }

    rolArayuzuGuncelle();
    await kullaniciDurumuYukle();
    listeyiCiz();
  } catch (err) {
    if (!sessiz) {
      durumGoster("err", hataMetni(err));
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
    durumGoster("err", "Ağ değiştirilemedi: " + hataMetni(err));
  }
}

/* ===========================
   5) İŞLEM YAŞAM DÖNGÜSÜ & YAZMA
   =========================== */
function hataMetni(err) {
  if (err?.code === "ACTION_REJECTED" || err?.code === 4001) {
    return "İşlem MetaMask üzerinden kullanıcı tarafından iptal edildi.";
  }
  return err?.reason || err?.shortMessage || err?.message || "Bilinmeyen işlem hatası.";
}

function durumGoster(tip, mesaj, txHash = null, aktifAdim = 0) {
  const $kutu = el("durumKutusu");
  const $msg = el("durumMesaji");
  const $link = el("durumTxLink");
  const $hat = el("islemHatti");

  $kutu.className = "tx-status-bar show " + tip;
  $msg.textContent = mesaj;

  if (txHash) {
    $link.style.display = "inline";
    $link.href = `${ETHERSCAN_URL}/tx/${txHash}`;
    $link.textContent = `Etherscan: ${kisaHash(txHash)} ↗`;
  } else {
    $link.style.display = "none";
  }

  if (aktifAdim > 0) {
    $hat.style.display = "flex";
    $hat.querySelectorAll(".step-pill").forEach((pill) => {
      const s = Number(pill.dataset.step);
      pill.className = "step-pill";
      if (tip === "err" && s === aktifAdim) pill.classList.add("failed");
      else if (s < aktifAdim || (tip === "ok" && s === 4)) pill.classList.add("done");
      else if (s === aktifAdim) pill.classList.add("active");
    });
  } else {
    $hat.style.display = "none";
  }
}

async function kayitOl() {
  if (!yazmaSozlesmesi) {
    durumGoster("err", "Önce MetaMask cüzdanını Sepolia ağında bağla.");
    return;
  }

  const takmaAd = el("takmaAdInput").value.trim();
  const $btn = el("kayitBtn");
  const eskiYazi = $btn.innerHTML;

  try {
    $btn.disabled = true;
    $btn.textContent = "MetaMask bekleniyor…";
    durumGoster("pending", "MetaMask üzerinde kayıt işlemini imzalamanız bekleniyor…", null, 1);

    const tx = await yazmaSozlesmesi.kayitOl(takmaAd);
    $btn.textContent = "Blok onayı bekleniyor…";
    durumGoster("pending", "İşlem Sepolia ağına yayınlandı, doğrulayıcı onayı bekleniyor…", tx.hash, 3);

    await tx.wait();
    durumGoster("ok", `"${takmaAd || "Kayıt"}" zincire başarıyla işlendi!`, tx.hash, 4);
    el("takmaAdInput").value = "";
    await tamYenile(true);
  } catch (err) {
    durumGoster("err", "Kayıt başarısız: " + hataMetni(err), null, 1);
  } finally {
    $btn.innerHTML = eskiYazi;
    $btn.disabled = !dogruAg;
  }
}

async function girisOnayla() {
  if (!yazmaSozlesmesi) {
    durumGoster("err", "Önce MetaMask cüzdanını Sepolia ağında bağla.");
    return;
  }

  const katilimci = el("katilimciAdresInput").value.trim();
  if (!ethers.isAddress(katilimci)) {
    durumGoster("err", "Geçerli bir Ethereum adresi (0x...) girin.");
    return;
  }

  const $btn = el("girisOnaylaBtn");
  const eskiYazi = $btn.innerHTML;

  try {
    $btn.disabled = true;
    $btn.textContent = "MetaMask bekleniyor…";
    durumGoster("pending", "Giriş onayı için MetaMask imzası bekleniyor…", null, 1);

    const tx = await yazmaSozlesmesi.girisOnayla(katilimci);
    $btn.textContent = "Blok onayı bekleniyor…";
    durumGoster("pending", "Giriş onayı Sepolia ağına gönderildi, onay bekleniyor…", tx.hash, 3);

    await tx.wait();
    durumGoster("ok", `${kisaAdres(katilimci)} adresinin garaj girişi onaylandı!`, tx.hash, 4);
    el("katilimciAdresInput").value = "";
    await tamYenile(true);
  } catch (err) {
    durumGoster("err", "Giriş onayı başarısız: " + hataMetni(err), null, 1);
  } finally {
    $btn.innerHTML = eskiYazi;
    $btn.disabled = !dogruAg;
  }
}

/* ===========================
   6) ZİNCİR & GEZGİN ÇİZİMİ
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

document.addEventListener("mouseover", (e) => {
  const hit = e.target.closest?.(".entry[data-addr], .tx[data-addr]");
  const addr = hit?.dataset.addr ?? null;
  if (addr !== eslesenAdres) eslesmeyiGoster(addr);
});

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

  // Genesis (başlangıç) bloğu
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
   7) TAM YENİLEME DÖNGÜSÜ
   =========================== */
async function tamYenile(elle = false) {
  const $yBtn = el("yenileBtn");
  if (elle && $yBtn) $yBtn.classList.add("spinning");

  try {
    await genelBilgileriOku();
    if (aktifAdres) await kullaniciDurumuYukle();
    await loglariTara(tepeBlok);
    listeyiCiz();
    await islemleriCiz();
    el("status").textContent = `Her 20 saniyede Sepolia zincirinden yenilenir · son okuma ${new Date().toLocaleTimeString("tr-TR")}`;
  } catch (err) {
    console.warn("Zincir yenileme hatası:", err);
    el("status").textContent = "Zincire ulaşılamadı, birazdan tekrar denenecek: " + err.message;
  } finally {
    if ($yBtn) setTimeout(() => $yBtn.classList.remove("spinning"), 400);
  }
}

/* ===========================
   8) GARAJ BOTU MASKOTU
   =========================== */
const MASKOT_LAFLARI = [
  "Hoş geldin! Zincire park edilen araç çekilmez 🚗",
  "Gas ücreti benzinden ucuz, Sepolia'da bedava ⛽",
  "12 kelimeni valeye bile verme, bana da verme!",
  "Görevli onaylamadan garaj bariyeri açılmaz 🔐",
  "Aynı cüzdanla ikinci kayıt mı? Revert yersin kanka!",
  "Kapasite dolduysa üzgünüm, çift sıra park yok 😅",
  "Düğmeyi gizlemek yetmez, yetki sözleşmede kontrol edilir!",
  "Tx hash çıktı diye sevinme, receipt status'a bak 👀",
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
   9) BAŞLATMA & OLAY DİNLEYİCİLER
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

  el("baglanBtn").addEventListener("click", () => {
    if (aktifAdres) {
      navigator.clipboard?.writeText(aktifAdres);
      durumGoster("ok", `Bağlı cüzdan adresi panoya kopyalandı: ${aktifAdres}`);
    } else {
      cuzdanBagla(false);
    }
  });

  el("yenileBtn").addEventListener("click", () => tamYenile(true));
  el("sepoliaGecBtn").addEventListener("click", sepoliaAginaGec);
  el("kayitBtn").addEventListener("click", kayitOl);
  el("girisOnaylaBtn").addEventListener("click", girisOnayla);

  // Enter ile hızlı gönderim
  el("takmaAdInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !el("kayitBtn").disabled) kayitOl();
  });
  el("katilimciAdresInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !el("girisOnaylaBtn").disabled) girisOnayla();
  });

  // Zincirde "Onay için seç" tıklaması
  el("list").addEventListener("click", (e) => {
    const btn = e.target.closest(".quick-fill");
    if (!btn) return;
    const addr = btn.dataset.fill;
    const input = el("katilimciAdresInput");
    input.value = addr;
    input.focus();
    input.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // Filtre sekmeleri (Zincir & İşlemler)
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

  // MetaMask hesap/ağ değişikliklerini dinle
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", (accs) => {
      if (!accs.length) {
        location.reload();
      } else {
        cuzdanBagla(true);
      }
    });
    window.ethereum.on("chainChanged", () => cuzdanBagla(true));
  }
}

// Başlat
temaBaslat();
sabitBilgileriYaz();
olaylariBagla();
maskotBaslat();
cuzdanBagla(true);
tamYenile(false);
setInterval(() => tamYenile(false), YENILEME_MS);
