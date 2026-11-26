// Sepolia Chain ID değeri
const SEPOLIA_CHAIN_ID = 11155111n;
const SEPOLIA_CHAIN_HEX = "0xaa36a7";

// Blok gezgini taban adresi
const ETHERSCAN_URL = "https://sepolia.etherscan.io";

// Makbuz doğrulama ve yerel depolama ayarları
const MAKBUZ_ZAMAN_ASIMI_MS = 45000;
const MAKBUZ_SORGU_ARALIGI_MS = 2500;
const SON_ISLEM_STORAGE_KEY = "garaj-live-son-islemler-v1";
const SOZLESMELER_STORAGE_KEY = "garaj-live-sozlesmeler-v1";

// Anahtarsız, CORS destekli herkese açık Sepolia RPC uç noktaları (sıralı yedekli)
const SEPOLIA_RPCS = [
  "https://sepolia.gateway.tenderly.co",
  "https://ethereum-sepolia-rpc.publicnode.com",
];

// eth_getLogs sorguları için sırayla denenir (tam arşiv destekli Tenderly öncelikli)
const LOG_RPCS = [
  "https://sepolia.gateway.tenderly.co",
  "https://ethereum-sepolia-rpc.publicnode.com",
];

// Farklı kayıt & giriş sözleşmeleriyle otomatik uyum için yetenek adayları
const YETENEK_ADAYLARI = {
  register: [
    { sig: "kayitOl(string)", name: "kayitOl", fragment: "function kayitOl(string _takmaAd)" },
    { sig: "register(string)", name: "register", fragment: "function register(string name)" },
    { sig: "kayitEkle(string)", name: "kayitEkle", fragment: "function kayitEkle(string _takmaAd)" },
    { sig: "addEntry(string)", name: "addEntry", fragment: "function addEntry(string name)" },
  ],
  approve: [
    { sig: "girisOnayla(address)", name: "girisOnayla", fragment: "function girisOnayla(address _katilimci)" },
    { sig: "onayla(address)", name: "onayla", fragment: "function onayla(address _katilimci)" },
    { sig: "checkIn(address)", name: "checkIn", fragment: "function checkIn(address participant)" },
    { sig: "approveEntry(address)", name: "approveEntry", fragment: "function approveEntry(address participant)" },
  ],
  officer: [
    { sig: "gorevli()", name: "gorevli", fragment: "function gorevli() view returns (address)" },
    { sig: "owner()", name: "owner", fragment: "function owner() view returns (address)" },
    { sig: "admin()", name: "admin", fragment: "function admin() view returns (address)" },
    { sig: "yetkili()", name: "yetkili", fragment: "function yetkili() view returns (address)" },
  ],
  entryStatus: [
    { sig: "girisYaptiMi(address)", name: "girisYaptiMi", fragment: "function girisYaptiMi(address) view returns (bool)" },
    { sig: "onayliMi(address)", name: "onayliMi", fragment: "function onayliMi(address) view returns (bool)" },
    { sig: "checkedIn(address)", name: "checkedIn", fragment: "function checkedIn(address) view returns (bool)" },
    { sig: "hasEntered(address)", name: "hasEntered", fragment: "function hasEntered(address) view returns (bool)" },
  ],
  capacity: [
    { sig: "KAPASITE()", name: "KAPASITE", fragment: "function KAPASITE() view returns (uint256)" },
    { sig: "kapasite()", name: "kapasite", fragment: "function kapasite() view returns (uint256)" },
    { sig: "maxKapasite()", name: "maxKapasite", fragment: "function maxKapasite() view returns (uint256)" },
    { sig: "MAX_KAPASITE()", name: "MAX_KAPASITE", fragment: "function MAX_KAPASITE() view returns (uint256)" },
    { sig: "MAX_CAPACITY()", name: "MAX_CAPACITY", fragment: "function MAX_CAPACITY() view returns (uint256)" },
    { sig: "capacity()", name: "capacity", fragment: "function capacity() view returns (uint256)" },
    { sig: "limit()", name: "limit", fragment: "function limit() view returns (uint256)" },
  ],
  total: [
    { sig: "toplamKayit()", name: "toplamKayit", fragment: "function toplamKayit() view returns (uint256)" },
    { sig: "kayitSayisi()", name: "kayitSayisi", fragment: "function kayitSayisi() view returns (uint256)" },
    { sig: "totalCount()", name: "totalCount", fragment: "function totalCount() view returns (uint256)" },
    { sig: "totalRegistrations()", name: "totalRegistrations", fragment: "function totalRegistrations() view returns (uint256)" },
    { sig: "count()", name: "count", fragment: "function count() view returns (uint256)" },
  ],
  allRecords: [
    {
      sig: "tumKayitlar()",
      name: "tumKayitlar",
      fragment: "function tumKayitlar() view returns ((address uye, string isim, uint256 sira, uint256 zaman)[])",
    },
  ],
  isRegistered: [
    { sig: "kayitliMi(address)", name: "kayitliMi", fragment: "function kayitliMi(address) view returns (bool)" },
    { sig: "isRegistered(address)", name: "isRegistered", fragment: "function isRegistered(address) view returns (bool)" },
    { sig: "registered(address)", name: "registered", fragment: "function registered(address) view returns (bool)" },
  ],
  nameByAddr: [
    { sig: "kayitlar(address)", name: "kayitlar", fragment: "function kayitlar(address) view returns (string)" },
    { sig: "isimler(address)", name: "isimler", fragment: "function isimler(address) view returns (string)" },
    { sig: "takmaAdlar(address)", name: "takmaAdlar", fragment: "function takmaAdlar(address) view returns (string)" },
    { sig: "names(address)", name: "names", fragment: "function names(address) view returns (string)" },
  ],
  title: [
    { sig: "etkinlikAdi()", name: "etkinlikAdi", fragment: "function etkinlikAdi() view returns (string)" },
    { sig: "garajAdi()", name: "garajAdi", fragment: "function garajAdi() view returns (string)" },
    { sig: "name()", name: "name", fragment: "function name() view returns (string)" },
    { sig: "title()", name: "title", fragment: "function title() view returns (string)" },
  ],
};

// Desteklenen kayıt ve giriş onayı event şemaları
const DESTEKLENEN_EVENTLER = [
  { kind: "kayit", hasMeta: false, fragment: "event KayitOlundu(address indexed katilimci, string takmaAd)" },
  { kind: "kayit", hasMeta: true, fragment: "event Registered(address indexed uye, string isim, uint256 sira, uint256 zaman)" },
  { kind: "kayit", hasMeta: false, fragment: "event Registered(address indexed user, string name)" },
  { kind: "kayit", hasMeta: false, fragment: "event KayitEklendi(address indexed katilimci, string takmaAd)" },
  { kind: "giris", hasMeta: false, fragment: "event GirisOnaylandi(address indexed katilimci)" },
  { kind: "giris", hasMeta: false, fragment: "event CheckedIn(address indexed participant)" },
  { kind: "giris", hasMeta: false, fragment: "event EntryApproved(address indexed participant)" },
  { kind: "giris", hasMeta: false, fragment: "event Onaylandi(address indexed katilimci)" },
];
