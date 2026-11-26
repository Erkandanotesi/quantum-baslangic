/* Quantum Kayıt (Canlı Sürüm) — Uyarlanabilir Sözleşme Uyumu, Yerel Yönetim & Makbuz Doğrulama */

const el = (id) => document.getElementById(id);
const ethersYukluMu = typeof ethers !== "undefined";

// Desteklenen tüm event şemaları için topic -> decoder haritası
const EVENT_DECODERS = new Map();
const ALL_EVENT_TOPICS = [];

if (ethersYukluMu && Array.isArray(DESTEKLENEN_EVENTLER)) {
  for (const def of DESTEKLENEN_EVENTLER) {
    try {
      const evIface = new ethers.Interface([def.fragment]);
      const evFragment = evIface.fragments[0];
      const topic = evIface.getEvent(evFragment.name).topicHash.toLowerCase();
      if (!EVENT_DECODERS.has(topic)) {
        EVENT_DECODERS.set(topic, {
          kind: def.kind,
          hasMeta: Boolean(def.hasMeta),
          iface: evIface,
          eventName: evFragment.name,
        });
        ALL_EVENT_TOPICS.push(topic);
      }
    } catch {}
  }
}

const YETENEK_ANAHTARLARI = [
  "register",
  "approve",
  "officer",
  "entryStatus",
  "capacity",
  "total",
  "allRecords",
  "isRegistered",
  "nameByAddr",
  "title",
];

const RPC_ZAMAN_ASIMI = 8500;
const LOG_PARCA = 40000;
const YENILEME_MS = 20000;
const MAKBUZ_GRUP_BOYUTU = 6;

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

let sozlesmeDeposu = { activeId: null, items: [] };
let aktifProfil = null;
let sozlesmeOturumNo = 0;
let duzenlenenSozlesmeId = null;
let kismiTaramaUyarisi = false;

let sozlesmeBilgi = {
  etkinlikAdi: "",
  kapasite: null,
  toplamKayit: null,
  gorevli: null,
};

let tepeBlok = null;
let tarananBlok = -1;
const katilimcilar = new Map(); // lowerAddr -> { adres, takmaAd, kayitTx, kayitBlok, kayitZaman, girisOnayli, girisTx, girisBlok, girisZaman, sira }
const islemListesi = [];        // { tur: 'kayit'|'giris', methodAd, tx, blok, logIndex, adres, takmaAd, zaman }
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

class RpcBaglantiHatasi extends Error {
  constructor(mesaj) {
    super(mesaj);
    this.name = "RpcBaglantiHatasi";
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
   2) YETENEK ALGILAMA & UYARLANABİLİR UYUM
   =========================== */
const ifaceCache = new Map();
function fragmentIfaceAl(fragment) {
  if (!ifaceCache.has(fragment)) {
    ifaceCache.set(fragment, new ethers.Interface([fragment]));
  }
  return ifaceCache.get(fragment);
}

function bytecodeSeciciVarMi(bytecode, sig) {
  if (!ethersYukluMu || typeof bytecode !== "string" || bytecode.length < 10) return false;
  const sel = ethers.id(sig).slice(2, 10).toLowerCase();
  return bytecode.toLowerCase().includes("63" + sel);
}

async function safeViewCall(targetAddr, candidate, args = []) {
  if (!candidate || !ethersYukluMu) return { ok: false, networkError: false };
  try {
    const fnIface = fragmentIfaceAl(candidate.fragment);
    const data = fnIface.encodeFunctionData(candidate.name, args);
    const raw = await hizli("eth_call", [{ to: targetAddr, data }, "latest"]);
    if (!raw || raw === "0x") return { ok: false, networkError: false };
    const value = fnIface.decodeFunctionResult(candidate.name, raw)[0];
    return { ok: true, value };
  } catch (err) {
    return { ok: false, networkError: err instanceof RpcBaglantiHatasi };
  }
}

function adayKopyala(c) {
  return c ? { sig: c.sig, name: c.name, fragment: c.fragment } : null;
}

function yetenekObjesiDogrula(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const temiz = {};
  let gecerliAlanVar = false;
  for (const key of YETENEK_ANAHTARLARI) {
    const val = raw[key];
    if (
      val &&
      typeof val === "object" &&
      typeof val.sig === "string" &&
      typeof val.name === "string" &&
      typeof val.fragment === "string"
    ) {
      temiz[key] = { sig: val.sig, name: val.name, fragment: val.fragment };
      gecerliAlanVar = true;
    } else {
      temiz[key] = null;
    }
  }
  return gecerliAlanVar ? temiz : null;
}

async function yetenekleriAlgila(checksumAddr, existingCode = null) {
  if (!ethersYukluMu) {
    throw new Error("ethers.js yüklenemediği için sözleşme doğrulanamadı.");
  }

  let code = existingCode;
  if (!code) {
    try {
      code = await hizli("eth_getCode", [checksumAddr, "latest"]);
    } catch (err) {
      if (err instanceof RpcBaglantiHatasi) {
        throw new RpcBaglantiHatasi(
          "Sepolia RPC düğümlerine ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin."
        );
      }
      throw new Error("Sepolia ağında sözleşme kodu okunamadı: " + (err?.message || "Bilinmeyen hata"));
    }
  }

  if (!code || code === "0x" || code === "0x0" || code.length <= 2) {
    throw new Error("Bu adreste Ethereum Sepolia ağında yayınlanmış bir sözleşme kodu bulunamadı.");
  }

  const profil = {
    register: null,
    approve: null,
    officer: null,
    entryStatus: null,
    capacity: null,
    total: null,
    allRecords: null,
    isRegistered: null,
    nameByAddr: null,
    title: null,
  };

  for (const c of YETENEK_ADAYLARI.register) {
    if (bytecodeSeciciVarMi(code, c.sig)) {
      profil.register = adayKopyala(c);
      break;
    }
  }

  for (const c of YETENEK_ADAYLARI.approve) {
    if (bytecodeSeciciVarMi(code, c.sig)) {
      profil.approve = adayKopyala(c);
      break;
    }
  }

  const readSlots = [
    { key: "officer", args: [] },
    { key: "entryStatus", args: [ethers.ZeroAddress] },
    { key: "capacity", args: [] },
    { key: "total", args: [] },
    { key: "allRecords", args: [] },
    { key: "isRegistered", args: [ethers.ZeroAddress] },
    { key: "nameByAddr", args: [ethers.ZeroAddress] },
    { key: "title", args: [] },
  ];

  await Promise.all(
    readSlots.map(async ({ key, args }) => {
      const eslesenler = (YETENEK_ADAYLARI[key] || []).filter((c) => bytecodeSeciciVarMi(code, c.sig));
      for (const aday of eslesenler) {
        const res = await safeViewCall(checksumAddr, aday, args);
        if (res.networkError) {
          throw new RpcBaglantiHatasi(
            "Sepolia RPC düğümlerine ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin."
          );
        }
        if (res.ok) {
          profil[key] = adayKopyala(aday);
          break;
        }
      }
    })
  );

  return profil;
}

function yazmaSozlesmesiniGuncelle() {
  const sozlesme = aktifSozlesme();
  if (!signer || !dogruAg || !sozlesme || !ethersYukluMu || !aktifProfil) {
    yazmaSozlesmesi = null;
    return;
  }

  const writeFragments = [aktifProfil.register?.fragment, aktifProfil.approve?.fragment].filter(Boolean);
  if (!writeFragments.length) {
    yazmaSozlesmesi = null;
    return;
  }

  yazmaSozlesmesi = new ethers.Contract(sozlesme.address, writeFragments, signer);
}

function uyumlulukArayuzunuUygula(profil) {
  const hasRegister = profil ? Boolean(profil.register) : true;
  const hasApprove = profil ? Boolean(profil.approve) : true;
  const hasEntry = profil ? Boolean(profil.approve || profil.entryStatus) : true;
  const hasCapacity = profil ? Boolean(profil.capacity) : true;
  const hasOfficer = profil ? Boolean(profil.officer) : true;

  el("kayitKarti").classList.toggle("is-hidden", !hasRegister);
  el("gorevliKarti").classList.toggle("is-hidden", !hasApprove);
  el("gorevliBilgiSatiri").classList.toggle("is-hidden", !hasOfficer);

  const gorunenKartSayisi = (hasRegister ? 1 : 0) + (hasApprove ? 1 : 0);
  const $actionGrid = el("actionGrid");
  $actionGrid.classList.toggle("is-hidden", gorunenKartSayisi === 0);
  $actionGrid.classList.toggle("single-card", gorunenKartSayisi === 1);

  el("kayitMethodPill").textContent = profil?.register ? `${profil.register.name}()` : "kayitOl()";
  el("girisMethodPill").textContent = profil?.approve ? `${profil.approve.name}()` : "girisOnayla()";

  el("statOnayli").classList.toggle("is-hidden", !hasEntry);
  el("statsGrid").classList.toggle("cols-3", !hasEntry);

  el("myGirisWrap").classList.toggle("is-hidden", !hasEntry);
  el("myStatusGrid").classList.toggle("cols-2", !hasEntry);

  el("zincirFiltreler").classList.toggle("is-hidden", !hasEntry);
  el("txFiltreler").classList.toggle("is-hidden", !hasEntry);

  if (!hasEntry) {
    if (zincirFiltre !== "all" || islemFiltre !== "all") {
      filtreSekmeleriniSifirla();
    }
  } else {
    el("txFiltreKayitBtn").textContent = profil?.register?.name || "kayitOl";
    el("txFiltreGirisBtn").textContent = profil?.approve?.name || "girisOnayla";
  }

  el("statKapasiteBaslik").textContent = hasCapacity ? "Kontenjan Doluluğu" : "Toplam Kayıt";
  el("kapasiteAyirici").classList.toggle("is-hidden", !hasCapacity);
  el("kapasite").classList.toggle("is-hidden", !hasCapacity);
  el("parkPeronlari").classList.toggle("is-hidden", !hasCapacity);

  if (!hasCapacity) {
    el("kapasiteYuzde").textContent = "Sınırsız";
  }

  const $features = el("cFeatures");
  $features.textContent = "";
  if (!profil) {
    $features.textContent = "Algılanıyor…";
    return;
  }

  const chipEkle = (metin, cls = "") => {
    const span = document.createElement("span");
    span.className = "feature-chip" + (cls ? " " + cls : "");
    span.textContent = metin;
    $features.appendChild(span);
  };

  if (profil.register) chipEkle(`${profil.register.name}()`, "accent");
  if (profil.approve) chipEkle(`${profil.approve.name}()`, "teal");
  chipEkle(hasCapacity ? "Kontenjanlı" : "Sınırsız");
  chipEkle(hasEntry ? "Görevli Onaylı" : "Açık Kayıt");
}

/* ===========================
   3) YEREL SÖZLEŞME DEPOSU (localStorage)
   =========================== */
function aktifSozlesme() {
  if (!sozlesmeDeposu.activeId) return null;
  return sozlesmeDeposu.items.find((it) => it.id === sozlesmeDeposu.activeId) || null;
}

function sozlesmeBasligi(s = aktifSozlesme()) {
  if (!s) return "Quantum Kayıt";
  return s.title || sozlesmeBilgi.etkinlikAdi || kisaAdres(s.address);
}

function adresNormalizeEt(ham) {
  if (typeof ham !== "string") return null;
  const temiz = ham.trim();
  if (ethersYukluMu) {
    if (!ethers.isAddress(temiz)) return null;
    return ethers.getAddress(temiz);
  }
  return /^0x[a-fA-F0-9]{40}$/.test(temiz) ? temiz : null;
}

function sozlesmeleriYukle() {
  const bos = { activeId: null, items: [] };
  try {
    const ham = localStorage.getItem(SOZLESMELER_STORAGE_KEY);
    if (!ham) {
      sozlesmeDeposu = bos;
      return;
    }
    const parsed = JSON.parse(ham);
    if (!parsed || !Array.isArray(parsed.items)) {
      sozlesmeDeposu = bos;
      return;
    }

    const gorulen = new Set();
    const gecerli = [];
    for (const raw of parsed.items) {
      const addr = adresNormalizeEt(raw?.address);
      if (!addr) continue;
      const id = addr.toLowerCase();
      if (gorulen.has(id)) continue;
      gorulen.add(id);

      const rawTitle =
        typeof raw.title === "string"
          ? raw.title.trim()
          : typeof raw.label === "string"
          ? raw.label.trim()
          : "";
      const title = (rawTitle || kisaAdres(addr)).slice(0, 48);

      let deployBlock = null;
      if (raw.deployBlock !== null && raw.deployBlock !== undefined && raw.deployBlock !== "") {
        const bNum = Number(raw.deployBlock);
        if (Number.isSafeInteger(bNum) && bNum >= 0) {
          deployBlock = bNum;
        }
      }

      const addedAt = Number.isFinite(Number(raw.addedAt)) ? Number(raw.addedAt) : Date.now();
      const capabilities = yetenekObjesiDogrula(raw.capabilities);
      gecerli.push({ id, title, address: addr, deployBlock, addedAt, capabilities });
    }

    const activeId =
      typeof parsed.activeId === "string" && gecerli.some((it) => it.id === parsed.activeId.toLowerCase())
        ? parsed.activeId.toLowerCase()
        : gecerli[0]?.id ?? null;

    sozlesmeDeposu = { activeId, items: gecerli };
  } catch {
    sozlesmeDeposu = bos;
  }
}

function sozlesmeleriKaydet() {
  try {
    localStorage.setItem(SOZLESMELER_STORAGE_KEY, JSON.stringify(sozlesmeDeposu));
  } catch {}
}

function baslikDogrula(ham) {
  const temiz = (ham || "").trim();
  if (!temiz) {
    throw new Error("Lütfen sözleşme için bir başlık girin (örn: Garaj Kayıt).");
  }
  if (temiz.length > 48) {
    throw new Error("Sözleşme başlığı en fazla 48 karakter olabilir.");
  }
  return temiz;
}

function blokDogrula(ham) {
  const temiz = (ham || "").trim();
  if (!temiz) return null;
  if (!/^\d+$/.test(temiz)) {
    throw new Error("Yayın bloğu yalnızca rakamlardan oluşan pozitif bir tam sayı olmalıdır.");
  }
  const num = Number(temiz);
  if (!Number.isSafeInteger(num) || num < 0) {
    throw new Error("Yayın bloğu geçerli bir blok numarası olmalıdır.");
  }
  return num;
}

async function sozlesmeDogrula(hamAdres) {
  if (!ethersYukluMu) {
    throw new Error("ethers.js yüklenemediği için sözleşme doğrulanamadı.");
  }
  const temiz = (hamAdres || "").trim();
  if (!ethers.isAddress(temiz)) {
    throw new Error("Lütfen 0x ile başlayan geçerli bir Ethereum Sepolia sözleşme adresi girin.");
  }

  const checksumAddr = ethers.getAddress(temiz);
  let profil;
  try {
    profil = await yetenekleriAlgila(checksumAddr);
  } catch (err) {
    if (err instanceof RpcBaglantiHatasi) {
      throw new Error("Sepolia RPC düğümlerine ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.");
    }
    throw err;
  }

  const uyumluMu = Boolean(
    profil.register || profil.allRecords || profil.total || profil.nameByAddr || profil.isRegistered
  );
  if (!uyumluMu) {
    throw new Error("Adreste sözleşme bulundu ancak desteklenen bir kayıt/giriş arayüzüyle uyumlu değil.");
  }

  return { address: checksumAddr, capabilities: profil };
}

function filtreSekmeleriniSifirla() {
  zincirFiltre = "all";
  islemFiltre = "all";
  document.querySelectorAll("[data-chain-filter]").forEach((b) => {
    b.classList.toggle("active", b.dataset.chainFilter === "all");
  });
  document.querySelectorAll("[data-tx-filter]").forEach((b) => {
    b.classList.toggle("active", b.dataset.txFilter === "all");
  });
}

function baslikVeMarkayiGuncelle() {
  const sozlesme = aktifSozlesme();
  const $brand = el("brandTitle");
  const $hero = el("heroBaslik");
  const $footer = el("footerSozlesme");
  const $kickerName = el("garajAdi");
  const $topbarBtn = el("sozlesmeModalBtn");
  const $topbarYazi = el("topbarSozlesmeYazi");
  const $topbarSayac = el("topbarSozlesmeSayac");

  $topbarSayac.textContent = sozlesmeDeposu.items.length;

  if (!sozlesme) {
    document.title = "Quantum Kayıt — Sepolia Zincir Üstü Kayıt & Giriş";
    $brand.textContent = "Quantum Kayıt";
    $kickerName.textContent = "Sözleşme Bekleniyor";
    $hero.innerHTML = "Zincir üstü <span>kayıt &amp; giriş</span>";
    $footer.textContent = "Quantum Kayıt · Sepolia";
    $topbarYazi.textContent = "Sözleşme Ekle";
    $topbarBtn.classList.add("needs-contract");
    return;
  }

  const baslik = sozlesmeBasligi(sozlesme);
  document.title = `${baslik} — Sepolia Kayıt & Giriş`;
  $brand.textContent = baslik;
  $kickerName.textContent = sozlesmeBilgi.etkinlikAdi || baslik;
  $hero.textContent = "";
  const vurgu = document.createElement("span");
  vurgu.textContent = baslik;
  $hero.appendChild(vurgu);
  $footer.textContent = `${baslik} · Sepolia`;
  $topbarYazi.textContent = baslik;
  $topbarBtn.classList.remove("needs-contract");
}

function sozlesmeListesiElemaniOlustur(item, aktifId) {
  const li = document.createElement("li");
  li.className = "contract-item" + (item.id === aktifId ? " active" : "");

  const mainBtn = document.createElement("button");
  mainBtn.type = "button";
  mainBtn.className = "contract-item-main";
  mainBtn.dataset.selectId = item.id;
  mainBtn.title = `${item.title} (${item.address})`;

  const dot = document.createElement("span");
  dot.className = "contract-item-dot";
  dot.setAttribute("aria-hidden", "true");

  const info = document.createElement("span");
  info.className = "contract-item-info";

  const titleEl = document.createElement("span");
  titleEl.className = "contract-item-title";
  titleEl.textContent = item.title;

  const metaEl = document.createElement("span");
  metaEl.className = "contract-item-meta mono";
  metaEl.textContent =
    item.deployBlock != null
      ? `${kisaAdres(item.address)} · #${sayiFmt.format(item.deployBlock)}`
      : kisaAdres(item.address);

  info.append(titleEl, metaEl);
  mainBtn.append(dot, info);

  const actions = document.createElement("div");
  actions.className = "contract-item-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "contract-mini-btn";
  editBtn.dataset.editId = item.id;
  editBtn.textContent = "Düzenle";
  editBtn.title = `${item.title} sözleşmesini düzenle`;

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "contract-mini-btn danger";
  delBtn.dataset.deleteId = item.id;
  delBtn.textContent = "Sil";
  delBtn.title = `${item.title} sözleşmesini kaldır`;

  actions.append(editBtn, delBtn);
  li.append(mainBtn, actions);
  return li;
}

function kayitliSozlesmeleriCiz() {
  const aktifId = sozlesmeDeposu.activeId;
  const hedefler = [el("kayitliSozlesmeListesi"), el("modalSozlesmeListesi")].filter(Boolean);

  for (const ul of hedefler) {
    ul.innerHTML = "";
    if (!sozlesmeDeposu.items.length) {
      const bos = document.createElement("li");
      bos.className = "contract-empty";
      bos.textContent = "Henüz yerel sözleşme eklenmedi.";
      ul.appendChild(bos);
      continue;
    }
    for (const item of sozlesmeDeposu.items) {
      ul.appendChild(sozlesmeListesiElemaniOlustur(item, aktifId));
    }
  }

  const $modalBolum = el("modalKayitliBolum");
  if ($modalBolum && !duzenlenenSozlesmeId) {
    $modalBolum.classList.toggle("is-hidden", sozlesmeDeposu.items.length === 0);
  }
}

async function sozlesmeEkle({ title, address, deployBlock }) {
  const temizBaslik = baslikDogrula(title);
  const gecerliBlok = blokDogrula(deployBlock);

  const onKontrolAdres = adresNormalizeEt(address);
  if (onKontrolAdres && sozlesmeDeposu.items.some((it) => it.id === onKontrolAdres.toLowerCase())) {
    throw new Error("Bu sözleşme adresi zaten yerel listenizde kayıtlı.");
  }

  const { address: checksumAddr, capabilities } = await sozlesmeDogrula(address);
  const id = checksumAddr.toLowerCase();
  if (sozlesmeDeposu.items.some((it) => it.id === id)) {
    throw new Error("Bu sözleşme adresi zaten yerel listenizde kayıtlı.");
  }

  sozlesmeDeposu.items.push({
    id,
    title: temizBaslik,
    address: checksumAddr,
    deployBlock: gecerliBlok,
    addedAt: Date.now(),
    capabilities,
  });
  sozlesmeDeposu.activeId = id;
  sozlesmeleriKaydet();
  await aktifSozlesmeyeGec({ yeniEklendi: true });
}

async function sozlesmeDuzenle(id, { title, deployBlock }) {
  const hedef = sozlesmeDeposu.items.find((it) => it.id === id);
  if (!hedef) throw new Error("Düzenlenecek sözleşme bulunamadı.");

  const temizBaslik = baslikDogrula(title);
  const gecerliBlok = blokDogrula(deployBlock);
  const blokDegisti = hedef.deployBlock !== gecerliBlok;
  const aktifMi = id === sozlesmeDeposu.activeId;

  if (aktifMi && blokDegisti && aktifGonderimVar) {
    throw new Error("Aktif bir işlem gönderimi sürerken yayın bloğu değiştirilemez.");
  }

  hedef.title = temizBaslik;
  hedef.deployBlock = gecerliBlok;
  sozlesmeleriKaydet();

  if (aktifMi) {
    if (blokDegisti) {
      await aktifSozlesmeyeGec();
    } else {
      baslikVeMarkayiGuncelle();
      sabitBilgileriYaz();
      kayitliSozlesmeleriCiz();
      listeyiCiz();
      await islemleriCiz();
    }
  } else {
    kayitliSozlesmeleriCiz();
  }
}

async function sozlesmeSec(id) {
  if (id === sozlesmeDeposu.activeId) return;
  if (aktifGonderimVar) {
    durumGoster({
      tip: "info",
      rozet: "İşlem Sürüyor",
      baslik: "Aktif işlem tamamlanmadan sözleşme değiştirilemez",
      mesaj: "Devam eden işlem sonuçlandıktan sonra diğer sözleşmeye geçebilirsiniz.",
    });
    return;
  }
  if (!sozlesmeDeposu.items.some((it) => it.id === id)) return;
  sozlesmeDeposu.activeId = id;
  sozlesmeleriKaydet();
  await aktifSozlesmeyeGec();
}

async function sozlesmeSil(id) {
  if (aktifGonderimVar) {
    durumGoster({
      tip: "info",
      rozet: "İşlem Sürüyor",
      baslik: "Aktif işlem sürerken sözleşme silinemez",
      mesaj: "Devam eden işlem sonuçlandıktan sonra bu sözleşmeyi kaldırabilirsiniz.",
    });
    return;
  }

  const silinenAktifMi = sozlesmeDeposu.activeId === id;
  sozlesmeDeposu.items = sozlesmeDeposu.items.filter((it) => it.id !== id);
  bekleyenIslemiTemizle(id);

  if (silinenAktifMi) {
    sozlesmeDeposu.activeId = sozlesmeDeposu.items[0]?.id ?? null;
  }
  sozlesmeleriKaydet();

  if (silinenAktifMi) {
    await aktifSozlesmeyeGec();
  } else {
    baslikVeMarkayiGuncelle();
    kayitliSozlesmeleriCiz();
  }
}

function formHataGoster(hedefId, mesaj) {
  const $hata = el(hedefId);
  if (!$hata) return;
  if (mesaj) {
    $hata.textContent = mesaj;
    $hata.classList.remove("is-hidden");
  } else {
    $hata.textContent = "";
    $hata.classList.add("is-hidden");
  }
}

function modalAc(secenek = {}) {
  const $modal = el("sozlesmeModal");
  const $kayitliBolum = el("modalKayitliBolum");
  const $adresInput = el("modalSozlesmeAdres");
  const $baslikInput = el("modalSozlesmeBaslik");
  const $blokInput = el("modalSozlesmeBlok");
  const $kaydetBtn = el("modalKaydetBtn");

  formHataGoster("modalSozlesmeHata", "");

  if (secenek.editId) {
    const hedef = sozlesmeDeposu.items.find((it) => it.id === secenek.editId);
    if (!hedef) return;
    duzenlenenSozlesmeId = hedef.id;
    el("modalBaslik").textContent = "Sözleşmeyi Düzenle";
    el("modalFormAltBaslik").textContent = "Sözleşme Bilgilerini Güncelle";
    $kayitliBolum.classList.add("is-hidden");
    $baslikInput.value = hedef.title;
    $adresInput.value = hedef.address;
    $adresInput.readOnly = true;
    $blokInput.value = hedef.deployBlock != null ? String(hedef.deployBlock) : "";
    $kaydetBtn.querySelector("span").textContent = "Değişiklikleri Kaydet";
  } else {
    duzenlenenSozlesmeId = null;
    el("modalBaslik").textContent = "Sözleşme Yönetimi";
    el("modalFormAltBaslik").textContent = "Yeni Sözleşme Ekle";
    $kayitliBolum.classList.toggle("is-hidden", sozlesmeDeposu.items.length === 0);
    $baslikInput.value = "";
    $adresInput.value = "";
    $adresInput.readOnly = false;
    $blokInput.value = "";
    $kaydetBtn.querySelector("span").textContent = "Sözleşmeyi Doğrula ve Ekle";
  }

  kayitliSozlesmeleriCiz();
  $modal.classList.remove("is-hidden");
  setTimeout(() => $baslikInput.focus(), 20);
}

function modalKapat() {
  duzenlenenSozlesmeId = null;
  formHataGoster("modalSozlesmeHata", "");
  el("sozlesmeModal").classList.add("is-hidden");
}

function kullaniciDurumunuTemizle() {
  kullaniciIstekNo += 1;
  el("kayitDurumu").textContent = aktifAdres ? "–" : "Bağlı değil";
  el("kayitDurumu").className = "";
  el("takmaAdim").textContent = "–";
  el("girisDurumu").textContent = "–";
  el("girisDurumu").className = "";
  el("gorevliAdresi").textContent = "–";
  el("gorevliAdresi").href = "#";
  el("gorevliAdresi").title = "";
  el("kayitIpucu").textContent = aktifAdres
    ? "Önce sözleşme ekleyin veya seçin."
    : "İşlem göndermek için üstten MetaMask cüzdanını bağla.";
}

async function aktifSozlesmeyeGec(secenek = {}) {
  sozlesmeOturumNo += 1;
  const oturum = sozlesmeOturumNo;

  katilimcilar.clear();
  islemListesi.length = 0;
  islemAnahtarlari.clear();
  makbuzlar.clear();
  eslesenAdres = null;
  clearTimeout(isikZaman);
  kismiTaramaUyarisi = false;
  filtreSekmeleriniSifirla();

  sozlesmeBilgi = {
    etkinlikAdi: "",
    kapasite: null,
    toplamKayit: null,
    gorevli: null,
  };
  tepeBlok = null;
  bekleyenIslem = null;

  if (!aktifGonderimVar) {
    el("durumKutusu").className = "tx-status-bar";
    el("durumKurtarma").style.display = "none";
  }

  const sozlesme = aktifSozlesme();
  const varMi = Boolean(sozlesme);

  el("sozlesmeBosKart").classList.toggle("is-hidden", varMi);
  el("aktifWorkspace").classList.toggle("is-hidden", !varMi);
  el("aktifSozlesmePanel").classList.toggle("is-hidden", !varMi);
  el("sonIslemlerPanel").classList.toggle("is-hidden", !varMi);

  baslikVeMarkayiGuncelle();
  kayitliSozlesmeleriCiz();

  if (!sozlesme) {
    aktifProfil = null;
    uyumlulukArayuzunuUygula(null);
    tarananBlok = -1;
    yazmaSozlesmesi = null;
    islemButonlariniGuncelle(true, "Zincire Kaydol", "Girişi Onayla");
    sabitBilgileriYaz();
    kullaniciDurumunuTemizle();
    rolArayuzuGuncelle();
    el("status").textContent =
      "Başlamak için bir Sepolia sözleşmesi ekleyin (tarayıcıda yerel saklanır).";
    return;
  }

  aktifProfil = sozlesme.capabilities || null;
  uyumlulukArayuzunuUygula(aktifProfil);
  tarananBlok = -1;

  el("toplamKayit").textContent = "–";
  el("kapasite").textContent = "–";
  el("kapasiteYuzde").textContent = aktifProfil && !aktifProfil.capacity ? "Sınırsız" : "0%";
  el("onayliSayisi").textContent = "–";
  el("bekleyenBilgi").textContent = "Zincir okunuyor…";
  el("sonHareket").textContent = "–";
  el("sonHareketTur").textContent = "Event bekleniyor";
  el("zincirSayac").textContent = "0";
  el("cTx").textContent = "–";
  el("cHead").textContent = "–";
  el("list").innerHTML =
    '<li class="entry skeleton"><div class="node"></div><div class="card"></div></li>' +
    '<li class="entry skeleton"><div class="node"></div><div class="card"></div></li>';
  el("txs").innerHTML = '<li class="tx-empty">Zincir logları taranıyor…</li>';

  sabitBilgileriYaz();
  yazmaSozlesmesiniGuncelle();
  islemButonlariniGuncelle(aktifGonderimVar, "Zincire Kaydol", "Girişi Onayla");
  rolArayuzuGuncelle();

  const kayitliBekleyen = bekleyenIslemiYukle(sozlesme.id);
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
  } else if (secenek.yeniEklendi) {
    durumGoster({
      tip: "info",
      rozet: "Sözleşme Eklendi",
      baslik: `"${sozlesme.title}" doğrulandı ve yerel olarak kaydedildi`,
      mesaj:
        "Sözleşme yetenekleri Sepolia ağında algılandı ve arayüz buna göre uyarlandı.",
      detay: `Adres: ${sozlesme.address}`,
    });
  }

  await tamYenile(false, oturum);
}

/* ===========================
   4) PUBLIC SEPOLIA RPC & MAKBUZ SORGULAMA
   =========================== */
async function rpcHam(url, method, params) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new RpcBaglantiHatasi("Tarayıcı çevrimdışı");
  }
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(RPC_ZAMAN_ASIMI),
    });
  } catch (err) {
    throw new RpcBaglantiHatasi(err?.message || "Ağ bağlantısı kurulamadı");
  }
  if (!res.ok) throw new RpcBaglantiHatasi(`RPC HTTP ${res.status}`);

  let j;
  try {
    j = await res.json();
  } catch {
    throw new RpcBaglantiHatasi("Geçersiz RPC JSON yanıtı");
  }
  if (j.error) throw new Error(j.error.message || "RPC hatası");
  if (j.result === undefined) throw new RpcBaglantiHatasi("Eksik RPC cevabı");
  return j.result; // Not: pending makbuz için null geçerli bir yanıttır
}

async function rpc(url, method, params) {
  const result = await rpcHam(url, method, params);
  if (result == null) throw new Error("boş RPC cevabı");
  return result;
}

async function hizli(method, params) {
  let sonHata = null;
  let tumAgHatasi = true;

  for (const url of SEPOLIA_RPCS) {
    try {
      return await rpc(url, method, params);
    } catch (e) {
      sonHata = e;
      if (!(e instanceof RpcBaglantiHatasi)) {
        tumAgHatasi = false;
      }
    }
  }

  if (tumAgHatasi) {
    throw new RpcBaglantiHatasi(sonHata?.message || "Sepolia RPC düğümlerine ulaşılamadı");
  }
  throw new Error(sonHata?.message || "Sepolia RPC hatası");
}

async function ethCallSlot(targetAddr, candidate, args = []) {
  if (!candidate) return null;
  const fnIface = fragmentIfaceAl(candidate.fragment);
  const data = fnIface.encodeFunctionData(candidate.name, args);
  const raw = await hizli("eth_call", [{ to: targetAddr, data }, "latest"]);
  return fnIface.decodeFunctionResult(candidate.name, raw)[0];
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

async function loglariAl(url, contractAddress, from, to) {
  return rpc(url, "eth_getLogs", [
    {
      address: contractAddress,
      topics: [ALL_EVENT_TOPICS],
      fromBlock: "0x" + from.toString(16),
      toBlock: "0x" + to.toString(16),
    },
  ]);
}

async function loglariParcaliAl(contractAddress, baslangic, tepe) {
  const sonuc = [];
  for (let a = baslangic; a <= tepe; a += LOG_PARCA) {
    const b = Math.min(a + LOG_PARCA - 1, tepe);
    let parca = null;
    for (const url of LOG_RPCS) {
      try {
        parca = await loglariAl(url, contractAddress, a, b);
        break;
      } catch {}
    }
    if (!parca) throw new Error("Event logları okunamadı");
    sonuc.push(...parca);
  }
  return sonuc;
}

async function loglariTara(tepe, oturum = sozlesmeOturumNo, sozlesme = aktifSozlesme()) {
  if (!sozlesme || oturum !== sozlesmeOturumNo || !ALL_EVENT_TOPICS.length) return;
  const baslangic = tarananBlok < 0 ? (sozlesme.deployBlock ?? 0) : tarananBlok + 1;
  if (tepe < baslangic) return;

  let loglar = null;
  for (const url of LOG_RPCS) {
    try {
      loglar = await loglariAl(url, sozlesme.address, baslangic, tepe);
      break;
    } catch {}
  }

  if (oturum !== sozlesmeOturumNo) return;

  if (!loglar) {
    const aralik = tepe - baslangic + 1;
    if (aralik <= 200000) {
      loglar = await loglariParcaliAl(sozlesme.address, baslangic, tepe);
    } else {
      kismiTaramaUyarisi = true;
      const kismiBaslangic = Math.max(baslangic, tepe - 44999);
      loglar = await loglariParcaliAl(sozlesme.address, kismiBaslangic, tepe);
    }
  }

  if (oturum !== sozlesmeOturumNo) return;

  const cozumlenenLoglar = [];
  const zamanGerekenBloklar = new Set();

  for (const l of loglar) {
    const topic0 = l.topics?.[0]?.toLowerCase();
    const decoder = topic0 ? EVENT_DECODERS.get(topic0) : null;
    if (!decoder) continue;

    let parsed = null;
    try {
      parsed = decoder.iface.parseLog({ topics: l.topics, data: l.data });
    } catch {}
    if (!parsed) continue;

    const blok = parseInt(l.blockNumber, 16);
    const metaZaman = decoder.hasMeta && parsed.args[3] != null ? Number(parsed.args[3]) : 0;
    if (!metaZaman && !blokZamanlari.has(blok)) {
      zamanGerekenBloklar.add(blok);
    }
    cozumlenenLoglar.push({ raw: l, blok, decoder, parsed, metaZaman });
  }

  if (zamanGerekenBloklar.size) {
    await Promise.all([...zamanGerekenBloklar].map((b) => blokZamaniAl(b).catch(() => null)));
  }

  if (oturum !== sozlesmeOturumNo) return;

  for (const { raw: l, blok, decoder, parsed, metaZaman } of cozumlenenLoglar) {
    const logIndex = parseInt(l.logIndex, 16);
    const anahtar = `${l.transactionHash}:${logIndex}`;
    if (islemAnahtarlari.has(anahtar)) continue;
    islemAnahtarlari.add(anahtar);

    const zaman = metaZaman || blokZamanlari.get(blok) || 0;
    const adres = ethers.getAddress(parsed.args[0]);
    const key = adres.toLowerCase();

    if (decoder.kind === "kayit") {
      const takmaAd = String(parsed.args[1] ?? "");
      const siraVal = decoder.hasMeta && parsed.args[2] != null ? Number(parsed.args[2]) : null;
      const mevcut = katilimcilar.get(key) || {
        adres,
        takmaAd,
        girisOnayli: false,
        sira: siraVal || katilimcilar.size + 1,
      };
      mevcut.takmaAd = takmaAd || mevcut.takmaAd;
      mevcut.kayitTx = l.transactionHash;
      mevcut.kayitBlok = blok;
      if (zaman) mevcut.kayitZaman = zaman;
      if (siraVal) mevcut.sira = siraVal;
      katilimcilar.set(key, mevcut);

      islemListesi.push({
        tur: "kayit",
        methodAd: aktifProfil?.register?.name || "kayitOl",
        tx: l.transactionHash,
        blok,
        logIndex,
        adres,
        takmaAd: mevcut.takmaAd,
        zaman,
      });
    } else if (decoder.kind === "giris") {
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
        methodAd: aktifProfil?.approve?.name || "girisOnayla",
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
   5) BEKLEYEN / BELİRSİZ İŞLEM KALICILIĞI
   =========================== */
function bekleyenHaritayiOku() {
  try {
    const ham = localStorage.getItem(SON_ISLEM_STORAGE_KEY);
    if (!ham) return {};
    const parsed = JSON.parse(ham);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function bekleyenHaritayiYaz(harita) {
  try {
    localStorage.setItem(SON_ISLEM_STORAGE_KEY, JSON.stringify(harita));
  } catch {}
}

function bekleyenIslemiKaydet(kayit) {
  const sozlesme = aktifSozlesme();
  const sozlesmeId = (kayit.sozlesme || sozlesme?.id || "").toLowerCase();
  if (!sozlesmeId) return;

  bekleyenIslem = {
    sozlesme: sozlesmeId,
    hash: kayit.hash,
    islemTuru: kayit.islemTuru,
    etiket: kayit.etiket,
    gonderen: kayit.gonderen || aktifAdres || null,
    durum: kayit.durum || "chain-pending",
    gonderimZamani: kayit.gonderimZamani || Date.now(),
  };

  const harita = bekleyenHaritayiOku();
  harita[sozlesmeId] = bekleyenIslem;
  bekleyenHaritayiYaz(harita);
}

function bekleyenIslemiTemizle(hedefId = aktifSozlesme()?.id) {
  const temizId = (hedefId || "").toLowerCase();
  if (!temizId || bekleyenIslem?.sozlesme === temizId) {
    bekleyenIslem = null;
  }
  if (!temizId) return;
  const harita = bekleyenHaritayiOku();
  if (Object.prototype.hasOwnProperty.call(harita, temizId)) {
    delete harita[temizId];
    bekleyenHaritayiYaz(harita);
  }
}

function bekleyenIslemiYukle(hedefId = aktifSozlesme()?.id) {
  const temizId = (hedefId || "").toLowerCase();
  if (!temizId) return null;
  const harita = bekleyenHaritayiOku();
  const kayit = harita[temizId];
  if (!kayit || typeof kayit.hash !== "string" || kayit.sozlesme !== temizId) {
    return null;
  }
  kayit.durum = "unknown";
  bekleyenIslem = kayit;
  return kayit;
}

/* ===========================
   6) SÖZLEŞME VERİLERİNİ OKUMA
   =========================== */
async function genelBilgileriOku(oturum = sozlesmeOturumNo, sozlesme = aktifSozlesme()) {
  if (!sozlesme || oturum !== sozlesmeOturumNo) return;

  if (!aktifProfil) {
    const algilanan = await yetenekleriAlgila(sozlesme.address);
    if (oturum !== sozlesmeOturumNo) return;
    sozlesme.capabilities = algilanan;
    sozlesmeleriKaydet();
    aktifProfil = algilanan;
    uyumlulukArayuzunuUygula(aktifProfil);
    yazmaSozlesmesiniGuncelle();
    islemButonlariniGuncelle(aktifGonderimVar, "Zincire Kaydol", "Girişi Onayla");
  }

  const [ad, kapasiteHam, toplamHam, gorevliHam, tumKayitlarHam, tepeHex] = await Promise.all([
    aktifProfil.title ? ethCallSlot(sozlesme.address, aktifProfil.title).catch(() => "") : "",
    aktifProfil.capacity ? ethCallSlot(sozlesme.address, aktifProfil.capacity).catch(() => null) : null,
    aktifProfil.total ? ethCallSlot(sozlesme.address, aktifProfil.total).catch(() => null) : null,
    aktifProfil.officer ? ethCallSlot(sozlesme.address, aktifProfil.officer).catch(() => null) : null,
    aktifProfil.allRecords ? ethCallSlot(sozlesme.address, aktifProfil.allRecords).catch(() => null) : null,
    hizli("eth_blockNumber", []),
  ]);

  if (oturum !== sozlesmeOturumNo) return;

  let toplamSayi = toplamHam != null ? Number(toplamHam) : null;
  if (tumKayitlarHam && typeof tumKayitlarHam.length === "number") {
    for (const row of tumKayitlarHam) {
      const rawUye = row.uye ?? row[0];
      if (!rawUye) continue;
      const adres = ethers.getAddress(rawUye);
      const key = adres.toLowerCase();
      const takmaAd = String(row.isim ?? row[1] ?? "");
      const siraNum = Number(row.sira ?? row[2] ?? katilimcilar.size + 1);
      const zamanNum = Number(row.zaman ?? row[3] ?? 0);

      const mevcut = katilimcilar.get(key) || {
        adres,
        takmaAd,
        girisOnayli: false,
        sira: siraNum,
      };
      if (takmaAd) mevcut.takmaAd = takmaAd;
      if (zamanNum && !mevcut.kayitZaman) mevcut.kayitZaman = zamanNum;
      if (siraNum) mevcut.sira = siraNum;
      katilimcilar.set(key, mevcut);
    }
    if (toplamSayi == null) {
      toplamSayi = tumKayitlarHam.length;
    }
  }

  tepeBlok = parseInt(tepeHex, 16);
  sozlesmeBilgi = {
    etkinlikAdi: ad || "",
    kapasite: kapasiteHam != null ? Number(kapasiteHam) : null,
    toplamKayit: toplamSayi,
    gorevli: gorevliHam ? ethers.getAddress(gorevliHam) : null,
  };

  genelArayuzuGuncelle();
}

function genelArayuzuGuncelle() {
  const sozlesme = aktifSozlesme();
  if (!sozlesme) return;
  const { kapasite, toplamKayit, gorevli } = sozlesmeBilgi;

  baslikVeMarkayiGuncelle();

  const gosterilecekToplam = toplamKayit != null ? toplamKayit : katilimcilar.size || null;
  el("toplamKayit").textContent = gosterilecekToplam != null ? gosterilecekToplam : "–";

  if (aktifProfil?.capacity && kapasite != null) {
    el("kapasite").textContent = kapasite;
    const pay = gosterilecekToplam ?? 0;
    const yuzde = kapasite > 0 ? Math.min(100, Math.round((pay / kapasite) * 100)) : 0;
    el("kapasiteYuzde").textContent = yuzde + "%";

    const $peron = el("parkPeronlari");
    const slotAdedi = Math.max(1, Math.min(kapasite || 3, 12));
    const doluMu = kapasite > 0 && pay >= kapasite;
    $peron.innerHTML = "";
    for (let i = 0; i < slotAdedi; i++) {
      const span = document.createElement("span");
      const oran = kapasite > 12 ? Math.round((pay / kapasite) * slotAdedi) : pay;
      span.className = "bay" + (i < oran ? (doluMu ? " filled full-alert" : " filled") : "");
      $peron.appendChild(span);
    }
  } else {
    el("kapasite").textContent = "–";
    el("kapasiteYuzde").textContent = "Sınırsız";
  }

  if (gorevli) {
    el("gorevliAdresi").textContent = kisaAdres(gorevli);
    el("gorevliAdresi").href = `${ETHERSCAN_URL}/address/${gorevli}`;
    el("gorevliAdresi").title = gorevli;
  } else {
    el("gorevliAdresi").textContent = "–";
    el("gorevliAdresi").href = "#";
    el("gorevliAdresi").title = "";
  }

  if (tepeBlok) {
    el("cHead").textContent = sayiFmt.format(tepeBlok);
  }

  rolArayuzuGuncelle();
}

/* ===========================
   7) CÜZDAN BAĞLANTISI & HESAP DEĞİŞİMİ
   =========================== */
function rolArayuzuGuncelle() {
  const $rol = el("rolRozeti");
  const $kayitIpucu = el("kayitIpucu");
  const $gorevliIpucu = el("gorevliIpucu");
  const sozlesme = aktifSozlesme();

  if (!aktifAdres) {
    $rol.style.display = "none";
    $kayitIpucu.textContent = "İşlem göndermek için üstten MetaMask cüzdanını bağla.";
    $gorevliIpucu.textContent = "Yetki kontrolü doğrudan akıllı sözleşmede yapılır.";
    return;
  }

  if (!sozlesme) {
    $rol.style.display = "none";
    $kayitIpucu.textContent = "İşlem yapmak için önce bir Sepolia sözleşmesi ekleyin.";
    $gorevliIpucu.textContent = "Yetki kontrolü doğrudan akıllı sözleşmede yapılır.";
    return;
  }

  const hasOfficer = Boolean(aktifProfil?.officer && sozlesmeBilgi.gorevli);
  const gorevliMi =
    hasOfficer && aktifAdres.toLowerCase() === sozlesmeBilgi.gorevli.toLowerCase();

  $rol.style.display = "inline-block";
  $rol.className = "role-chip " + (gorevliMi ? "officer" : "member");
  $rol.textContent = gorevliMi ? "Görevli" : "Katılımcı";

  if (!dogruAg) {
    $gorevliIpucu.textContent = "İşlem göndermek için Sepolia ağına geçmelisin.";
  } else if (gorevliMi) {
    $gorevliIpucu.textContent = "Yetkili görevli cüzdanı bağlı ✓ Aşağıdan katılımcı seçip onaylayabilirsin.";
  } else if (hasOfficer) {
    $gorevliIpucu.textContent = "Bağlı adres görevli değil; çağrı yapılırsa sözleşme işlemi reddeder.";
  } else {
    $gorevliIpucu.textContent = "Yetki kontrolü doğrudan akıllı sözleşmede yapılır.";
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
  if (aktifSozlesme()) listeyiCiz();
}

async function kullaniciDurumuYukle(oturum = sozlesmeOturumNo, sozlesme = aktifSozlesme()) {
  const hedefAdres = aktifAdres;
  if (!hedefAdres || !sozlesme || oturum !== sozlesmeOturumNo || !aktifProfil) return;
  const istekId = ++kullaniciIstekNo;

  el("kayitDurumu").textContent = "Okunuyor…";
  el("kayitDurumu").className = "";
  el("takmaAdim").textContent = "…";
  el("girisDurumu").textContent = "…";
  el("girisDurumu").className = "";

  try {
    const [kayitliHam, takmaAdHam, girisYaptiHam] = await Promise.all([
      aktifProfil.isRegistered
        ? ethCallSlot(sozlesme.address, aktifProfil.isRegistered, [hedefAdres])
        : Promise.resolve(null),
      aktifProfil.nameByAddr
        ? ethCallSlot(sozlesme.address, aktifProfil.nameByAddr, [hedefAdres])
        : Promise.resolve(null),
      aktifProfil.entryStatus
        ? ethCallSlot(sozlesme.address, aktifProfil.entryStatus, [hedefAdres])
        : Promise.resolve(null),
    ]);

    if (
      istekId !== kullaniciIstekNo ||
      aktifAdres !== hedefAdres ||
      oturum !== sozlesmeOturumNo
    ) {
      return;
    }

    const yerelKayit = katilimcilar.get(hedefAdres.toLowerCase());
    const takmaAd =
      takmaAdHam != null && String(takmaAdHam).trim()
        ? String(takmaAdHam)
        : yerelKayit?.takmaAd || "";
    const kayitli =
      kayitliHam != null
        ? Boolean(kayitliHam)
        : Boolean(takmaAd || yerelKayit);
    const girisYapti =
      girisYaptiHam != null
        ? Boolean(girisYaptiHam)
        : Boolean(yerelKayit?.girisOnayli);

    const $kd = el("kayitDurumu");
    const $ta = el("takmaAdim");
    const $gd = el("girisDurumu");

    $kd.textContent = kayitli ? "Kayıtlı ✓" : "Kayıtlı değil";
    $kd.className = kayitli ? "ok" : "";

    $ta.textContent = kayitli ? takmaAd || "–" : "–";

    $gd.textContent = girisYapti ? "Giriş onaylı ✓" : kayitli ? "Onay bekliyor" : "–";
    $gd.className = girisYapti ? "ok" : kayitli ? "warn" : "";

    const doluMu =
      Boolean(aktifProfil.capacity) &&
      sozlesmeBilgi.kapasite > 0 &&
      sozlesmeBilgi.toplamKayit >= sozlesmeBilgi.kapasite;

    if (!dogruAg) {
      el("kayitIpucu").textContent = "İşlem göndermek için Sepolia ağına geçmelisin.";
    } else if (kayitli) {
      el("kayitIpucu").textContent = "Bu adres zaten kayıtlı (tekrar denenirse sözleşme reddedebilir).";
    } else if (doluMu) {
      el("kayitIpucu").textContent = "Kontenjan dolu (yeni kayıt denemesi sözleşmede reddedilir).";
    } else {
      el("kayitIpucu").textContent = "Takma adını yazıp MetaMask ile zincire kalıcı kayıt oluşturabilirsin.";
    }
  } catch (err) {
    if (istekId !== kullaniciIstekNo || oturum !== sozlesmeOturumNo) return;
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
    const sozlesme = aktifSozlesme();

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

      yazmaSozlesmesiniGuncelle();
      islemButonlariniGuncelle(aktifGonderimVar);
    }

    rolArayuzuGuncelle();
    if (sozlesme) {
      await kullaniciDurumuYukle(sozlesmeOturumNo, sozlesme);
      listeyiCiz();
    }

    if (adresDegisti) {
      hesapDegisiminiVurgula();
      if (!aktifGonderimVar && !bekleyenIslem) {
        durumGoster({
          tip: "info",
          rozet: "Hesap Değişti",
          baslik: "Aktif hesap güncellendi",
          mesaj: sozlesme
            ? `${kisaAdres(aktifAdres)} hesabının kayıt ve giriş durumu zincirden yenilendi.`
            : `${kisaAdres(aktifAdres)} hesabı bağlandı. İşlem için bir Sepolia sözleşmesi ekleyin.`,
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
      baslik:
        rapor.tip === "err" && rapor.rozet === "İmza Reddedildi"
          ? "Ağ değişikliği reddedildi"
          : "Sepolia ağına geçilemedi",
    });
  }
}

/* ===========================
   8) HATA SINIFLANDIRMA & DURUM PANELİ
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
    "Bu cuzdan zaten kayitli",
    "Bu adres zaten kayitli",
    "Already registered",
    "Garaj kapasitesi doldu",
    "Kapasite doldu",
    "Sadece gorevli bu islemi yapabilir",
    "Only owner",
    "Only admin",
    "Bu adres garaja kayitli degil",
    "Bu adres kayitli degil",
    "Not registered",
    "Bu katilimci zaten giris yapti",
    "Already checked in",
    "Already approved",
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
  const sozlesme = aktifSozlesme();
  if (!ethersYukluMu || !baglam || !sozlesme || !aktifProfil) return null;

  try {
    if (baglam.islemTuru === "kayit") {
      if (!(baglam.takmaAd || "").trim()) return "Takma ad bos olamaz";
      const [kayitli, toplam, kapasite] = await Promise.all([
        baglam.gonderen && aktifProfil.isRegistered
          ? ethCallSlot(sozlesme.address, aktifProfil.isRegistered, [baglam.gonderen]).catch(() => null)
          : null,
        aktifProfil.total
          ? ethCallSlot(sozlesme.address, aktifProfil.total).catch(() => null)
          : null,
        aktifProfil.capacity
          ? ethCallSlot(sozlesme.address, aktifProfil.capacity).catch(() => null)
          : null,
      ]);
      if (kayitli === true) return "Bu adres zaten kayitli";
      if (kapasite !== null && toplam !== null && Number(toplam) >= Number(kapasite)) {
        return "Kapasite doldu";
      }
    } else if (baglam.islemTuru === "giris") {
      const [gorevliAddr, kayitli, giris] = await Promise.all([
        aktifProfil.officer
          ? ethCallSlot(sozlesme.address, aktifProfil.officer).catch(() => null)
          : null,
        baglam.katilimci && aktifProfil.isRegistered
          ? ethCallSlot(sozlesme.address, aktifProfil.isRegistered, [baglam.katilimci]).catch(() => null)
          : null,
        baglam.katilimci && aktifProfil.entryStatus
          ? ethCallSlot(sozlesme.address, aktifProfil.entryStatus, [baglam.katilimci]).catch(() => null)
          : null,
      ]);
      if (
        gorevliAddr &&
        baglam.gonderen &&
        gorevliAddr.toLowerCase() !== baglam.gonderen.toLowerCase()
      ) {
        return "Sadece gorevli bu islemi yapabilir";
      }
      if (kayitli === false) return "Bu adres kayitli degil";
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

  if (
    birlesikAlt.includes("zaten kayitli") ||
    birlesikAlt.includes("zaten kayıtlı") ||
    birlesikAlt.includes("already registered")
  ) {
    return {
      tip: "err",
      rozet: "İşlem Başarısız",
      baslik: "Tekrar kayıt yapılamaz",
      mesaj:
        "Bu cüzdan adresi sözleşmeye zaten kayıtlı. Aynı adresle ikinci kez kayıt olunamaz.",
      detay: "Sözleşme kuralı: aynı adres yalnızca bir kez kayıt olabilir",
      txHash: baglam.txHash || null,
      adim: hataAdimi,
    };
  }

  if (birlesikAlt.includes("kapasitesi doldu") || birlesikAlt.includes("kapasite")) {
    const oranMetni =
      sozlesmeBilgi.kapasite > 0 && sozlesmeBilgi.toplamKayit != null
        ? ` (${sozlesmeBilgi.toplamKayit}/${sozlesmeBilgi.kapasite})`
        : "";
    return {
      tip: "err",
      rozet: "İşlem Başarısız",
      baslik: "Sözleşme kapasitesi dolu",
      mesaj: `Sözleşmedeki tüm kontenjan${oranMetni} dolmuş durumda. Yeni katılımcı kaydı sözleşme tarafından reddedildi.`,
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
      mesaj: "Takma ad alanı boş bırakılamaz. Lütfen en az 1 karakterlik takma ad girin.",
      detay: "Sözleşme kuralı: boş isim kabul edilmez",
      txHash: baglam.txHash || null,
      adim: hataAdimi,
    };
  }

  if (
    birlesikAlt.includes("sadece gorevli") ||
    birlesikAlt.includes("sadece görevli") ||
    birlesikAlt.includes("only owner") ||
    birlesikAlt.includes("only admin")
  ) {
    return {
      tip: "err",
      rozet: "Yetkisiz İşlem",
      baslik: "Yetkisiz hesap (Görevli değil)",
      mesaj:
        "Bağlı cüzdan sözleşmedeki yetkili görevli adresi değil. Giriş onayını yalnızca yetkili hesap verebilir.",
      detay: "Sözleşme yetki kontrolü: msg.sender yetkili değil",
      txHash: baglam.txHash || null,
      adim: hataAdimi,
    };
  }

  if (
    birlesikAlt.includes("kayitli degil") ||
    birlesikAlt.includes("kayıtlı değil") ||
    birlesikAlt.includes("not registered")
  ) {
    return {
      tip: "err",
      rozet: "İşlem Başarısız",
      baslik: "Katılımcı kayıtlı değil",
      mesaj:
        "Giriş onayı verilmek istenen adres sözleşmeye henüz kayıt olmamış. Önce katılımcının kayıt işlemini yapması gerekir.",
      detay: "Sözleşme kuralı: katılımcı henüz kayıtlı değil",
      txHash: baglam.txHash || null,
      adim: hataAdimi,
    };
  }

  if (
    birlesikAlt.includes("zaten giris yapti") ||
    birlesikAlt.includes("zaten giriş yaptı") ||
    birlesikAlt.includes("already checked in") ||
    birlesikAlt.includes("already approved")
  ) {
    return {
      tip: "err",
      rozet: "İşlem Başarısız",
      baslik: "Giriş zaten onaylanmış",
      mesaj:
        "Bu katılımcının girişi daha önce onaylanmış. Aynı adrese ikinci kez giriş onayı verilemez.",
      detay: "Sözleşme kuralı: katılımcının girişi zaten onaylı",
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
    bekleyenIslemiTemizle(bekleyenIslem.sozlesme);
  }
  const $kutu = el("durumKutusu");
  $kutu.className = "tx-status-bar";
  el("durumKurtarma").style.display = "none";
}

function islemButonlariniGuncelle(kilitli, kayitYazi = null, girisYazi = null) {
  const $kayitBtn = el("kayitBtn");
  const $girisBtn = el("girisOnaylaBtn");
  const temelPasif = kilitli || !dogruAg || !aktifSozlesme();
  $kayitBtn.disabled = temelPasif || !aktifProfil?.register;
  $girisBtn.disabled = temelPasif || !aktifProfil?.approve;
  if (kayitYazi) $kayitBtn.querySelector("span").textContent = kayitYazi;
  if (girisYazi) $girisBtn.querySelector("span").textContent = girisYazi;
}

async function makbuzSonucunuIsle(sonuc, meta) {
  const hedefSozlesmeId = meta.sozlesme || aktifSozlesme()?.id;
  if (sonuc.basarili) {
    bekleyenIslemiTemizle(hedefSozlesmeId);
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
          : "Kayıt zincirde kesinleşti",
      mesaj:
        meta.islemTuru === "giris"
          ? `${kisaAdres(meta.etiket)} adresinin girişi makbuzla doğrulandı.`
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

  bekleyenIslemiTemizle(hedefSozlesmeId);
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
  const kontrolEdilen = { ...bekleyenIslem };
  const oturum = sozlesmeOturumNo;
  const $btn = el("makbuzTekrarSorgulaBtn");
  const eski = $btn.textContent;
  $btn.disabled = true;
  $btn.textContent = "Sorgulanıyor (Yeni İşlem Gönderilmiyor)…";

  try {
    const sorgu = await makbuzSorgulaTekSefer(kontrolEdilen.hash);
    if (oturum !== sozlesmeOturumNo) return;

    if (!sorgu.erisildi) {
      durumGoster({
        tip: "unknown",
        rozet: "Sonuç Henüz Doğrulanamadı",
        baslik: "Bağlantı sorunu devam ediyor",
        mesaj:
          "RPC düğümlerine erişilemediği için mevcut işlemin makbuzu henüz okunamadı. İşlem bağlantınız korunuyor ve yeni işlem gönderilmedi.",
        detay: `Tx: ${kisaHash(kontrolEdilen.hash)} · Son deneme ${new Date().toLocaleTimeString("tr-TR")} (${sorgu.hata})`,
        txHash: kontrolEdilen.hash,
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
        detay: `Tx: ${kisaHash(kontrolEdilen.hash)} · Son kontrol ${new Date().toLocaleTimeString("tr-TR")}`,
        txHash: kontrolEdilen.hash,
        adim: 3,
        kurtarmaGoster: true,
      });
      return;
    }

    const sonuc = makbuzOzetiCikar(sorgu.receipt);
    await makbuzSonucunuIsle(sonuc, kontrolEdilen);
  } finally {
    $btn.disabled = false;
    $btn.textContent = eski;
  }
}

/* ===========================
   9) YAZMA İŞLEMLERİ (kayitOl / register & girisOnayla)
   =========================== */
async function kayitOl() {
  if (aktifGonderimVar) return;
  const sozlesme = aktifSozlesme();
  if (!sozlesme) {
    durumGoster({
      tip: "err",
      rozet: "Sözleşme Yok",
      baslik: "Önce bir Sepolia sözleşmesi ekleyin",
      mesaj: "İşlem göndermek için sol panelden veya başlangıç kartından bir sözleşme eklemelisiniz.",
    });
    return;
  }
  if (!aktifProfil?.register) {
    durumGoster({
      tip: "err",
      rozet: "Desteklenmiyor",
      baslik: "Kayıt yazma fonksiyonu algılanamadı",
      mesaj: "Bu sözleşmede desteklenen bir kayıt oluşturma fonksiyonu bulunamadı.",
    });
    return;
  }
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

  const fnName = aktifProfil.register.name;
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
      detay: `Çağrı: ${fnName}("${takmaAd}") · Hesap: ${kisaAdres(aktifAdres)}`,
      adim: 1,
    });

    const tx = await yazmaSozlesmesi[fnName](takmaAd);
    baglam.txHash = tx.hash;
    bekleyenIslemiKaydet({
      sozlesme: sozlesme.id,
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
      sozlesme: sozlesme.id,
      hash: tx.hash,
      islemTuru: "kayit",
      etiket: takmaAd,
    });
  } catch (err) {
    if (err instanceof BelirsizSonucHatasi) {
      bekleyenIslemiKaydet({
        sozlesme: sozlesme.id,
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
  const sozlesme = aktifSozlesme();
  if (!sozlesme) {
    durumGoster({
      tip: "err",
      rozet: "Sözleşme Yok",
      baslik: "Önce bir Sepolia sözleşmesi ekleyin",
      mesaj: "Giriş onayı göndermek için önce bir sözleşme eklemelisiniz.",
    });
    return;
  }
  if (!aktifProfil?.approve) {
    durumGoster({
      tip: "err",
      rozet: "Desteklenmiyor",
      baslik: "Bu sözleşmede giriş onaylama özelliği yok",
      mesaj: "Seçili sözleşme yalnızca kayıt oluşturmayı destekliyor.",
    });
    return;
  }
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

  const fnName = aktifProfil.approve.name;
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
      detay: `Çağrı: ${fnName}(${kisaAdres(katilimci)}) · Gönderen: ${kisaAdres(aktifAdres)}`,
      adim: 1,
    });

    const tx = await yazmaSozlesmesi[fnName](katilimci);
    baglam.txHash = tx.hash;
    bekleyenIslemiKaydet({
      sozlesme: sozlesme.id,
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
      sozlesme: sozlesme.id,
      hash: tx.hash,
      islemTuru: "giris",
      etiket: katilimci,
    });
  } catch (err) {
    if (err instanceof BelirsizSonucHatasi) {
      bekleyenIslemiKaydet({
        sozlesme: sozlesme.id,
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
   10) ZİNCİR & GEZGİN ÇİZİMİ
   =========================== */
function siraliKatilimcilar() {
  return [...katilimcilar.values()].sort(
    (a, b) =>
      (b.kayitBlok || 0) - (a.kayitBlok || 0) ||
      (b.kayitZaman || 0) - (a.kayitZaman || 0) ||
      (b.sira || 0) - (a.sira || 0)
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
  const sozlesme = aktifSozlesme();
  if (!sozlesme) return;

  const hasEntry = Boolean(aktifProfil?.approve || aktifProfil?.entryStatus);
  const hasApprove = Boolean(aktifProfil?.approve);
  const tumu = siraliKatilimcilar();
  const onayliAdet = tumu.filter((k) => k.girisOnayli).length;
  const bekleyenAdet = tumu.length - onayliAdet;

  if (sozlesmeBilgi.toplamKayit == null && tumu.length > 0) {
    el("toplamKayit").textContent = tumu.length;
  }

  el("onayliSayisi").textContent = onayliAdet;
  el("bekleyenBilgi").textContent =
    bekleyenAdet > 0 ? `${bekleyenAdet} kişi onay bekliyor` : tumu.length ? "Tüm kayıtlılar onaylı" : "Henüz kayıt yok";

  if (islemListesi.length) {
    const son = islemListesi[0];
    el("sonHareket").textContent = once(son.zaman);
    el("sonHareketTur").textContent = `${son.methodAd || "kayitOl"} · ${son.takmaAd}`;
  } else if (tumu.length) {
    const sonKatilimci = tumu[0];
    el("sonHareket").textContent = once(sonKatilimci.kayitZaman);
    el("sonHareketTur").textContent = `${aktifProfil?.register?.name || "kayit"} · ${sonKatilimci.takmaAd}`;
  } else {
    el("sonHareket").textContent = "–";
    el("sonHareketTur").textContent = "Henüz işlem yok";
  }

  const filtrelenen = hasEntry
    ? tumu.filter((k) => {
        if (zincirFiltre === "approved") return k.girisOnayli;
        if (zincirFiltre === "pending") return !k.girisOnayli;
        return true;
      })
    : tumu;

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

    const nodeBadgeHtml = hasEntry
      ? `<span class="node-badge ${k.girisOnayli ? "ok" : "wait"}" title="${k.girisOnayli ? "Giriş onaylandı" : "Giriş onayı bekliyor"}">${k.girisOnayli ? "✓" : "•"}</span>`
      : "";
    const statusTagHtml = hasEntry
      ? `<span class="tag ${k.girisOnayli ? "ok" : "wait"}">${k.girisOnayli ? "✓ Giriş Onaylı" : "⏳ Onay Bekliyor"}</span>`
      : "";
    const girisTxHtml =
      hasEntry && k.girisTx
        ? `<a class="mono" target="_blank" rel="noopener" href="${ETHERSCAN_URL}/tx/${k.girisTx}">giriş tx ↗</a>`
        : "";
    const quickFillHtml =
      hasEntry && hasApprove && !k.girisOnayli
        ? `<button class="quick-fill" type="button" data-fill="${k.adres}">Onay için seç ↗</button>`
        : "";

    li.innerHTML = `
      <div class="node" style="background:${adresRengi(k.adres)}">
        <span></span>
        ${nodeBadgeHtml}
      </div>
      <div class="card">
        <div class="row">
          <div class="name-wrap">
            <span class="name"></span>
            ${statusTagHtml}
            ${idx === 0 ? '<span class="tag">son</span>' : ""}
            ${benimMi ? '<span class="tag me">sen</span>' : ""}
          </div>
          <time class="ago">${once(k.kayitZaman)}</time>
        </div>
        <div class="meta">
          ${k.kayitZaman ? `<span class="mono">${tarihFmt.format(k.kayitZaman * 1000)}</span>` : ""}
          <a class="mono" target="_blank" rel="noopener" href="${ETHERSCAN_URL}/address/${k.adres}">${kisaAdres(k.adres)}</a>
          ${k.kayitTx ? `<a class="mono" target="_blank" rel="noopener" href="${ETHERSCAN_URL}/tx/${k.kayitTx}">kayıt tx ↗</a>` : ""}
          ${girisTxHtml}
          ${quickFillHtml}
        </div>
      </div>`;

    li.querySelector(".node span").textContent = basHarfler(k.takmaAd);
    li.querySelector(".name").textContent = k.takmaAd;
    $list.appendChild(li);
  });

  const gen = document.createElement("li");
  gen.className = "entry genesis";
  const genNode = document.createElement("div");
  genNode.className = "node mono";
  genNode.textContent = "#0";

  const genCard = document.createElement("div");
  genCard.className = "card";

  if (tumu.length) {
    const baslikEl = document.createElement("strong");
    baslikEl.textContent = sozlesmeBasligi(sozlesme);

    const link = document.createElement("a");
    link.className = "mono";
    link.target = "_blank";
    link.rel = "noopener";
    link.href = `${ETHERSCAN_URL}/address/${sozlesme.address}#code`;
    link.textContent = `${kisaAdres(sozlesme.address)} ↗`;

    genCard.append("Zincirin başı · ", baslikEl, " · ", link);
    if (sozlesme.deployBlock != null) {
      const blokLink = document.createElement("a");
      blokLink.className = "mono";
      blokLink.target = "_blank";
      blokLink.rel = "noopener";
      blokLink.href = `${ETHERSCAN_URL}/block/${sozlesme.deployBlock}`;
      blokLink.textContent = `Blok #${sayiFmt.format(sozlesme.deployBlock)} ↗`;
      genCard.append(" · ", blokLink);
    }
  } else if (sozlesmeBilgi.toplamKayit > 0) {
    genCard.textContent =
      "Sözleşmede kayıt görünüyor ancak bu aralıkta event logu bulunamadı (sözleşme event yayınlamıyor olabilir veya yayın bloğu daha sonrasına ayarlıdır).";
  } else {
    genCard.textContent = "Henüz kimse kaydolmadı. İlk kayıt seni bekliyor!";
  }

  gen.append(genNode, genCard);
  $list.appendChild(gen);

  isiltiBaslat();
}

async function islemleriCiz(oturum = sozlesmeOturumNo, sozlesme = aktifSozlesme()) {
  if (!sozlesme || oturum !== sozlesmeOturumNo) return;

  el("cTx").textContent = islemListesi.length;
  const $txs = el("txs");
  const hasEntry = Boolean(aktifProfil?.approve || aktifProfil?.entryStatus);

  const filtrelenen = hasEntry
    ? islemListesi.filter((it) => {
        if (islemFiltre === "kayit") return it.tur === "kayit";
        if (islemFiltre === "giris") return it.tur === "giris";
        return true;
      })
    : islemListesi;

  if (!filtrelenen.length) {
    $txs.innerHTML = '<li class="tx-empty">Bu filtrede onaylı işlem bulunamadı.</li>';
    return;
  }

  const satirlar = [];
  for (let i = 0; i < filtrelenen.length; i += MAKBUZ_GRUP_BOYUTU) {
    const grup = filtrelenen.slice(i, i + MAKBUZ_GRUP_BOYUTU);
    const parca = await Promise.all(
      grup.map(async (it) => {
        let m = null;
        try {
          m = await makbuzAl(it.tx);
        } catch {}
        return { it, m };
      })
    );
    if (oturum !== sozlesmeOturumNo) return;
    satirlar.push(...parca);
  }

  const sozlesmeAdi = sozlesmeBasligi(sozlesme);
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
    const methodAd =
      it.methodAd ||
      (it.tur === "giris"
        ? aktifProfil?.approve?.name || "girisOnayla"
        : aktifProfil?.register?.name || "kayitOl");

    li.innerHTML = `
      <div class="tx-top">
        <a class="mono tx-hash" target="_blank" rel="noopener" href="${ETHERSCAN_URL}/tx/${it.tx}">${kisaHash(it.tx)}</a>
        <span class="pill ${basarili ? "ok" : "fail"}">${basarili ? "Başarılı" : "Başarısız"}</span>
      </div>
      <div class="tx-grid">
        <span>Method</span><b><span class="pill ${methodClass}"></span> <span class="isim"></span></b>
        <span>Blok</span><b class="mono"><a target="_blank" rel="noopener" href="${ETHERSCAN_URL}/block/${it.blok}">${sayiFmt.format(it.blok)}</a> · ${onay} onay</b>
        <span>Zaman</span><b>${once(it.zaman)}</b>
        <span>From</span><b class="mono"><a target="_blank" rel="noopener" href="${ETHERSCAN_URL}/address/${fromAddr}">${kisaAdres(fromAddr)}</a></b>
        ${
          it.tur === "giris"
            ? `<span>Katılımcı</span><b class="mono"><a target="_blank" rel="noopener" href="${ETHERSCAN_URL}/address/${it.adres}">${kisaAdres(it.adres)}</a></b>`
            : `<span>To</span><b class="mono tx-to-name"></b>`
        }
        <span>Gas</span><b class="mono">${gas}</b>
        <span>Ücret</span><b class="mono">${ucret}</b>
      </div>`;

    li.querySelector("." + methodClass).textContent = methodAd;
    li.querySelector(".isim").textContent = it.takmaAd || kisaAdres(it.adres);
    const toNode = li.querySelector(".tx-to-name");
    if (toNode) toNode.textContent = sozlesmeAdi;
    $txs.appendChild(li);
  }
}

/* ===========================
   11) TAM YENİLEME & ÇEVRİMDIŞI TAKİBİ
   =========================== */
function cevrimdisiDurumunuGuncelle() {
  const cevrimdisi = typeof navigator !== "undefined" && navigator.onLine === false;
  el("cevrimdisiUyari").classList.toggle("show", cevrimdisi);
}

async function tamYenile(elle = false, oturum = sozlesmeOturumNo) {
  const sozlesme = aktifSozlesme();
  if (!sozlesme) {
    if (elle) modalAc();
    return;
  }

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

    if (oturum !== sozlesmeOturumNo) return;
    await genelBilgileriOku(oturum, sozlesme);
    if (oturum !== sozlesmeOturumNo) return;
    await loglariTara(tepeBlok, oturum, sozlesme);
    if (oturum !== sozlesmeOturumNo) return;
    if (aktifAdres) await kullaniciDurumuYukle(oturum, sozlesme);
    if (oturum !== sozlesmeOturumNo) return;
    listeyiCiz();
    await islemleriCiz(oturum, sozlesme);
    if (oturum !== sozlesmeOturumNo) return;

    const zamanNotu = new Date().toLocaleTimeString("tr-TR");
    el("status").textContent = kismiTaramaUyarisi
      ? `Son 45.000 blok tarandı (eski işlemler için yayın bloğu girebilirsiniz) · son okuma ${zamanNotu}`
      : `Her 20 saniyede Sepolia zincirinden yenilenir · son okuma ${zamanNotu}`;

    if (elle && $yYazi) {
      $yYazi.textContent = "Yenilendi ✓";
      yenileYaziZaman = setTimeout(() => {
        $yYazi.textContent = "Bilgileri Yenile";
      }, 1500);
    }
  } catch (err) {
    if (oturum !== sozlesmeOturumNo) return;
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
   12) GARAJ BOTU MASKOTU
   =========================== */
const MASKOT_LAFLARI = [
  "Hoş geldin! Tx hash tek başına başarı değildir, makbuzu bekle 👀",
  "Cüzdan onayı ayrı, zincir onayı ayrı adım — ikisini karıştırma!",
  "İmzayı reddedersen zincire tek bayt bile gönderilmez ✋",
  "Aynı cüzdanla ikinci kayıt mı? Sözleşme anında reddeder!",
  "Bağlantı kopsa bile elindeki Tx hash linki kaybolmaz, tekrar gönderme!",
  "Görevli değil misin? Yetki kontrolü sözleşmede, işlem revert yer 🔐",
  "Hesap değiştirince 'Bilgileri Yenile' ile kaydını anında kontrol et!",
  "Eklediğin sözleşmeler yalnızca kendi tarayıcında güvenle saklanır 💾",
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
   13) BAŞLATMA & OLAY DİNLEYİCİLER
   =========================== */
function sabitBilgileriYaz() {
  const sozlesme = aktifSozlesme();
  const $cName = el("cName");
  const $cAddr = el("cAddr");
  const $cBlockWrap = el("cBlockWrap");

  if (!sozlesme) {
    $cName.textContent = "–";
    $cAddr.textContent = "–";
    $cAddr.href = "#";
    $cBlockWrap.textContent = "–";
    return;
  }

  $cName.textContent = sozlesme.title;
  $cAddr.textContent = kisaAdres(sozlesme.address);
  $cAddr.href = `${ETHERSCAN_URL}/address/${sozlesme.address}#code`;
  $cAddr.title = sozlesme.address;

  $cBlockWrap.textContent = "";
  if (sozlesme.deployBlock != null) {
    const a = document.createElement("a");
    a.className = "mono";
    a.id = "cBlock";
    a.target = "_blank";
    a.rel = "noopener";
    a.href = `${ETHERSCAN_URL}/block/${sozlesme.deployBlock}`;
    a.textContent = sayiFmt.format(sozlesme.deployBlock);
    $cBlockWrap.appendChild(a);
  } else {
    const span = document.createElement("span");
    span.className = "mono";
    span.id = "cBlock";
    span.textContent = "Otomatik (0'dan)";
    $cBlockWrap.appendChild(span);
  }
}

function sozlesmeListesiTiklama(e) {
  const secBtn = e.target.closest("[data-select-id]");
  if (secBtn) {
    const id = secBtn.dataset.selectId;
    sozlesmeSec(id).then(() => {
      if (!el("sozlesmeModal").classList.contains("is-hidden")) {
        modalKapat();
      }
    });
    return;
  }

  const editBtn = e.target.closest("[data-edit-id]");
  if (editBtn) {
    modalAc({ editId: editBtn.dataset.editId });
    return;
  }

  const delBtn = e.target.closest("[data-delete-id]");
  if (delBtn) {
    sozlesmeSil(delBtn.dataset.deleteId);
  }
}

function olaylariBagla() {
  el("copyContract").addEventListener("click", (e) => {
    const sozlesme = aktifSozlesme();
    if (sozlesme) kopyala(sozlesme.address, e.currentTarget);
  });
  el("copyGorevli").addEventListener("click", (e) => {
    if (sozlesmeBilgi.gorevli) kopyala(sozlesmeBilgi.gorevli, e.currentTarget);
  });
  el("durumHashKopyala").addEventListener("click", (e) => {
    kopyala(e.currentTarget.dataset.hash, e.currentTarget);
  });
  el("durumKapatBtn").addEventListener("click", durumPaneliniKapat);
  el("makbuzTekrarSorgulaBtn").addEventListener("click", bekleyenMakbuzuTekrarSorgula);

  el("sozlesmeModalBtn").addEventListener("click", () => modalAc());
  el("sidebarSozlesmeEkleBtn").addEventListener("click", () => modalAc());
  el("modalKapatBtn").addEventListener("click", modalKapat);
  el("modalIptalBtn").addEventListener("click", modalKapat);
  el("sozlesmeModal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) modalKapat();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el("sozlesmeModal").classList.contains("is-hidden")) {
      modalKapat();
    }
  });

  el("kayitliSozlesmeListesi").addEventListener("click", sozlesmeListesiTiklama);
  el("modalSozlesmeListesi").addEventListener("click", sozlesmeListesiTiklama);

  el("ilkSozlesmeForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    formHataGoster("ilkSozlesmeHata", "");
    const $btn = el("ilkSozlesmeEkleBtn");
    const $yazi = $btn.querySelector("span");
    const eski = $yazi.textContent;
    $btn.disabled = true;
    $yazi.textContent = "Sepolia'da Algılanıyor…";

    try {
      await sozlesmeEkle({
        title: el("ilkSozlesmeBaslik").value,
        address: el("ilkSozlesmeAdres").value,
        deployBlock: el("ilkSozlesmeBlok").value,
      });
      el("ilkSozlesmeForm").reset();
    } catch (err) {
      formHataGoster("ilkSozlesmeHata", err?.message || "Sözleşme eklenemedi.");
    } finally {
      $btn.disabled = false;
      $yazi.textContent = eski;
    }
  });

  el("modalSozlesmeForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    formHataGoster("modalSozlesmeHata", "");
    const $btn = el("modalKaydetBtn");
    const $yazi = $btn.querySelector("span");
    const eski = $yazi.textContent;
    $btn.disabled = true;
    $yazi.textContent = duzenlenenSozlesmeId ? "Kaydediliyor…" : "Sepolia'da Algılanıyor…";

    try {
      if (duzenlenenSozlesmeId) {
        await sozlesmeDuzenle(duzenlenenSozlesmeId, {
          title: el("modalSozlesmeBaslik").value,
          deployBlock: el("modalSozlesmeBlok").value,
        });
      } else {
        await sozlesmeEkle({
          title: el("modalSozlesmeBaslik").value,
          address: el("modalSozlesmeAdres").value,
          deployBlock: el("modalSozlesmeBlok").value,
        });
      }
      modalKapat();
    } catch (err) {
      formHataGoster("modalSozlesmeHata", err?.message || "İşlem tamamlanamadı.");
    } finally {
      $btn.disabled = false;
      $yazi.textContent = eski;
    }
  });

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
    } else if (aktifSozlesme()) {
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

  sozlesmeleriYukle();
  olaylariBagla();
  aktifSozlesmeyeGec();
  cuzdanBagla(true);
  setInterval(() => {
    if (aktifSozlesme()) tamYenile(false);
  }, YENILEME_MS);
}

if (typeof document !== "undefined") {
  baslat();
}
