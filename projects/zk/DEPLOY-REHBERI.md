# Quantum Garaj ZK (Faz 1) — Sepolia Deploy Rehberi

Bu rehber, **özel anahtarını hiçbir yere yazmadan** yalnızca Remix IDE + MetaMask kullanarak 3 ZK akıllı sözleşmesini Ethereum Sepolia test ağına yayınlaman içindir.

## 1. Remix'te Derleme Ayarları
- **Compiler:** `0.8.24` (veya `0.8.24+`)
- **Optimization:** `Enabled` (`200` runs) — *(Not: `PoseidonT3.sol` optimizer kapalıyken bile 23.985 bayt ile 24 KB limitinin altındadır, ama açık tutmak daha ucuz gas sağlar.)*
- **Environment:** `Injected Provider - MetaMask` (Ağ: **Sepolia**, Chain ID `11155111`)

## 2. Sırasıyla 3 Sözleşmeyi Deploy Et

### Adım 2.1 — `PoseidonT3.sol`
1. `projects/zk/contracts/PoseidonT3.sol` dosyasını Remix'e yükleyip derle.
2. Constructor parametresi yoktur; **Deploy** et.
3. Oluşan sözleşme adresini not et: `POSEIDON_ADRESI`

### Adım 2.2 — `Groth16Verifier.sol`
1. `projects/zk/contracts/Groth16Verifier.sol` dosyasını Remix'e yükleyip derle.
2. Constructor parametresi yoktur; **Deploy** et.
3. Oluşan sözleşme adresini not et: `VERIFIER_ADRESI`

### Adım 2.3 — `GarajKayitZK.sol`
1. `projects/zk/contracts/GarajKayitZK.sol` dosyasını Remix'e yükleyip derle.
2. **Deploy** ederken şu 5 constructor parametresini ver:
   - `_poseidon`: `POSEIDON_ADRESI`
   - `_verifier`: `VERIFIER_ADRESI`
   - `_etkinlikAdi`: `"otomobil garaji (ZK)"`
   - `_kapasite`: `5` *(1 ile 1024 arası herhangi bir değer)*
   - `_biletUcreti`: `1000000000000000` *(0.001 SepoliaETH — ücretsiz test için `0` yazabilirsin)*
3. Deploy işlemi onaylanınca:
   - Oluşan **`GarajKayitZK` adresini** ve
   - İşlemin **blok numarasını (Yayın Bloğu)** Etherscan'den not et.

## 3. Web Arayüzünde Kullanma
- Yerelde açmak için `quantum-baslangic` klasöründe bir HTTP sunucusu başlatabilirsin (`npx serve docs`) veya GitHub Pages'e push ettikten sonra `.../quantum-baslangic/zk.html` sayfasına gir.
- `GarajKayitZK` adresini ve yayın bloğunu forma yazıp bağla.
- **Anonimlik testi (önerilen demo akışı):**
  1. **1. Cüzdan** ile Kart 1'den gizli bilet üretip `biletAl()` yap (bilet kodunu kopyala/indir).
  2. MetaMask'tan **2. temiz eğitim hesabına** geç → Kart 2'de bilet kodunu seçip **"ZK Kanıtı Üret ve Giriş Yap"** butonuna bas.
  3. **Sıfır-gas Relayer testi:** Kart 2'de **"Relayer Paketi Üret"** seç → oluşan JSON'u Kart 3'e (Görevli paneline) yapıştır → Görevli cüzdanıyla gönder!

## 4. Yerel Otomatik Testleri Yeniden Çalıştırma
`quantum-baslangic/projects/zk` klasöründe:
- Devreyi yeniden derlemek + anahtarları/tarayıcı dosyalarını yenilemek: `npm run build`
- Tüm 14 kriptografik ve yerel Sepolia EVM testini çalıştırmak: `npm test`
